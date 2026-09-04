import { describe, expect, it } from "vitest";
import { scoreEvidence, challenge } from "../src/evolution/analysis-provider.js";

describe("scoreEvidence (FLOW-09)", () => {
  it("2 evidências corroborantes retornam evidenceStrength/confidence como campos separados", () => {
    const result = scoreEvidence([
      { sourceAuthority: "corroborating" },
      { sourceAuthority: "corroborating" },
    ]);
    expect(result).toEqual({ evidenceStrength: "moderate", confidence: "medium" });
    expect(result).toHaveProperty("evidenceStrength");
    expect(result).toHaveProperty("confidence");
  });

  it("1 evidência é weak/low quando authority é desconhecida", () => {
    const result = scoreEvidence([{ sourceAuthority: null }]);
    expect(result).toEqual({ evidenceStrength: "weak", confidence: "low" });
  });

  it("3+ evidências todas com authority conhecida são strong/high", () => {
    const result = scoreEvidence([
      { sourceAuthority: "authoritative" },
      { sourceAuthority: "declared" },
      { sourceAuthority: "observed" },
    ]);
    expect(result).toEqual({ evidenceStrength: "strong", confidence: "high" });
  });

  it("3+ evidências mas nem todas com authority conhecida ficam strong/medium", () => {
    const result = scoreEvidence([
      { sourceAuthority: "authoritative" },
      { sourceAuthority: null },
      { sourceAuthority: "declared" },
    ]);
    expect(result).toEqual({ evidenceStrength: "strong", confidence: "medium" });
  });

  it("lista vazia é weak/low", () => {
    expect(scoreEvidence([])).toEqual({ evidenceStrength: "weak", confidence: "low" });
  });
});

describe("challenge (FLOW-13/14)", () => {
  const wellFormedProposal = {
    costOfInaction: "Perda de participação de mercado.",
    alternatives: [
      { id: "alt-1", type: "buildFeature" },
      { id: "alt-2", type: "doNothing" },
    ],
  };
  const twoSourceClaims = [
    { id: "clm-1", epistemicType: "fact", evidenceIds: ["evd-1"] },
    { id: "clm-2", epistemicType: "fact", evidenceIds: ["evd-2"] },
  ];

  it("sinaliza missing_do_nothing_alternative quando não há alternativa do-nothing/watch", () => {
    const findings = challenge(
      { ...wellFormedProposal, alternatives: [{ id: "alt-1", type: "buildFeature" }] },
      twoSourceClaims,
    );
    expect(findings).toContain("missing_do_nothing_alternative");
  });

  it("aceita 'watch' como alternativa válida de não-ação", () => {
    const findings = challenge(
      { ...wellFormedProposal, alternatives: [{ id: "alt-1", type: "watch" }] },
      twoSourceClaims,
    );
    expect(findings).not.toContain("missing_do_nothing_alternative");
  });

  it("sinaliza single_source_evidence quando todas as claims dependem de 1 evidência só", () => {
    const findings = challenge(wellFormedProposal, [
      { id: "clm-1", epistemicType: "fact", evidenceIds: ["evd-1"] },
      { id: "clm-2", epistemicType: "fact", evidenceIds: ["evd-1"] },
    ]);
    expect(findings).toContain("single_source_evidence");
  });

  it("sinaliza single_source_evidence quando não há claims (zero evidência distinta)", () => {
    const findings = challenge(wellFormedProposal, []);
    expect(findings).toContain("single_source_evidence");
  });

  it("sinaliza missing_cost_of_inaction quando o campo está vazio", () => {
    const findings = challenge({ ...wellFormedProposal, costOfInaction: null }, twoSourceClaims);
    expect(findings).toContain("missing_cost_of_inaction");
  });

  it("sinaliza contradictory_claims quando a mesma evidência é referenciada por uma claim fact e uma hypothesis/inference", () => {
    const findings = challenge(wellFormedProposal, [
      { id: "clm-1", epistemicType: "fact", evidenceIds: ["evd-1"] },
      { id: "clm-2", epistemicType: "hypothesis", evidenceIds: ["evd-1"] },
      { id: "clm-3", epistemicType: "fact", evidenceIds: ["evd-2"] },
    ]);
    expect(findings).toContain("contradictory_claims");
  });

  it("proposal bem formada com do-nothing, custo de inação e múltiplas fontes não-contraditórias tem findings vazios", () => {
    const findings = challenge(wellFormedProposal, twoSourceClaims);
    expect(findings).toEqual([]);
  });

  it("nunca lança/bloqueia mesmo com proposal e claims degenerados", () => {
    expect(() => challenge({ costOfInaction: null, alternatives: [] }, [])).not.toThrow();
  });
});
