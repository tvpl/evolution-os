import { describe, expect, it } from "vitest";
import { computeProposalDigest, type ProposalMaterialFields } from "../src/evolution/experiments.js";

describe("computeProposalDigest (EXP-01 canonical digest)", () => {
  it("is stable under sha256: prefix and hex shape", () => {
    const digest = computeProposalDigest({
      title: "x",
      summary: "y",
      whyNow: null,
      costOfInaction: null,
      proposalType: "adopt",
      alternatives: [],
      recommendedAlternativeId: null,
    });
    expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("produces the same digest for the same fields regardless of JS object key insertion order", () => {
    // Two objects with identical content but keys inserted in a different order.
    // JSON.stringify on a plain object preserves insertion order, so this pair
    // would produce DIFFERENT digests under raw JSON.stringify but the SAME
    // digest under canonicalJson (sorted keys) — this is the specific behavior
    // computeProposalDigest depends on (design.md: extracted canonicalJson from
    // the Slice 2 Cartographer for exactly this reason).
    const a: ProposalMaterialFields = {
      title: "Adotar biblioteca X",
      summary: "Reduz manutenção própria.",
      whyNow: "Concorrente já adotou.",
      costOfInaction: "Débito técnico crescente.",
      proposalType: "adopt",
      alternatives: [{ id: "alt-1", type: "adopt" }],
      recommendedAlternativeId: "alt-1",
    };
    const b: ProposalMaterialFields = {
      recommendedAlternativeId: "alt-1",
      alternatives: [{ type: "adopt", id: "alt-1" }],
      proposalType: "adopt",
      costOfInaction: "Débito técnico crescente.",
      whyNow: "Concorrente já adotou.",
      summary: "Reduz manutenção própria.",
      title: "Adotar biblioteca X",
    };
    expect(computeProposalDigest(a)).toBe(computeProposalDigest(b));
  });

  it("produces a different digest when any material field's value actually differs", () => {
    const base: ProposalMaterialFields = {
      title: "x",
      summary: "y",
      whyNow: null,
      costOfInaction: null,
      proposalType: "adopt",
      alternatives: [{ id: "alt-1", type: "adopt" }],
      recommendedAlternativeId: null,
    };
    const changed: ProposalMaterialFields = { ...base, title: "different title" };
    expect(computeProposalDigest(base)).not.toBe(computeProposalDigest(changed));
  });

  it("array element order still matters (arrays are not reordered, only object keys)", () => {
    const a: ProposalMaterialFields = {
      title: "x",
      summary: "y",
      whyNow: null,
      costOfInaction: null,
      proposalType: "adopt",
      alternatives: [{ id: "alt-1" }, { id: "alt-2" }],
      recommendedAlternativeId: null,
    };
    const b: ProposalMaterialFields = { ...a, alternatives: [{ id: "alt-2" }, { id: "alt-1" }] };
    expect(computeProposalDigest(a)).not.toBe(computeProposalDigest(b));
  });
});
