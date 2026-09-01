/**
 * FLOW-09/13/14 (design.md "Abordagem"): interface plugável exigida por
 * ADR-013 ("provider adapters"). Este arquivo é o ÚNICO adapter deste
 * slice — determinístico, sem chamada a LLM (ver spec Out of Scope: sem
 * credencial/infra de eval confirmada neste ambiente). Trocar por um
 * provider real é extensão local sem reescrever call sites.
 */

export interface EvidenceForScoring {
  sourceAuthority: string | null;
}

export interface EvidenceScore {
  evidenceStrength: "weak" | "moderate" | "strong";
  confidence: "low" | "medium" | "high";
}

const KNOWN_AUTHORITIES = new Set(["authoritative", "corroborating", "declared", "observed"]);

/**
 * FLOW-09: decompõe em DOIS campos separados — nunca um score único opaco
 * (PRD-003 §5). `evidenceStrength` conta fontes distintas; `confidence`
 * pondera quantas têm authority reconhecida.
 */
export function scoreEvidence(evidenceList: EvidenceForScoring[]): EvidenceScore {
  const count = evidenceList.length;
  const evidenceStrength = count >= 3 ? "strong" : count === 2 ? "moderate" : "weak";

  const withKnownAuthority = evidenceList.filter(
    (e) => e.sourceAuthority && KNOWN_AUTHORITIES.has(e.sourceAuthority),
  ).length;
  const confidence =
    count >= 3 && withKnownAuthority === count
      ? "high"
      : withKnownAuthority > 0
        ? "medium"
        : "low";

  return { evidenceStrength, confidence };
}

export interface AlternativeForChallenge {
  id: string;
  type: string;
}

export interface ProposalForChallenge {
  costOfInaction: string | null;
  alternatives: AlternativeForChallenge[];
}

export interface ClaimForChallenge {
  id: string;
  epistemicType: string;
  evidenceIds: string[];
}

const DO_NOTHING_TYPES = new Set(["doNothing", "watch"]);
const FACT_LIKE = "fact";
const UNCERTAIN_TYPES = new Set(["hypothesis", "inference"]);

/**
 * FLOW-13/14: checklist fixo, NUNCA bloqueia a transição (EVO-FR-009) —
 * apenas anexa findings. Cobre os 4 anti-padrões objetivamente
 * detectáveis sem julgamento (PRD-003 §8): ausência de do-nothing/watch,
 * fonte única, custo de inação ausente, e claims que leem a MESMA
 * evidência com pesos epistêmicos opostos (fact vs. hypothesis/inference).
 */
export function challenge(
  proposal: ProposalForChallenge,
  claims: ClaimForChallenge[],
): string[] {
  const findings: string[] = [];

  if (!proposal.alternatives.some((a) => DO_NOTHING_TYPES.has(a.type))) {
    findings.push("missing_do_nothing_alternative");
  }

  const distinctEvidence = new Set(claims.flatMap((c) => c.evidenceIds));
  if (distinctEvidence.size <= 1) {
    findings.push("single_source_evidence");
  }

  if (!proposal.costOfInaction) {
    findings.push("missing_cost_of_inaction");
  }

  const epistemicTypesByEvidence = new Map<string, Set<string>>();
  for (const claim of claims) {
    for (const evidenceId of claim.evidenceIds) {
      const set = epistemicTypesByEvidence.get(evidenceId) ?? new Set<string>();
      set.add(claim.epistemicType);
      epistemicTypesByEvidence.set(evidenceId, set);
    }
  }
  const hasContradiction = [...epistemicTypesByEvidence.values()].some(
    (types) => types.has(FACT_LIKE) && [...types].some((t) => UNCERTAIN_TYPES.has(t)),
  );
  if (hasContradiction) {
    findings.push("contradictory_claims");
  }

  return findings;
}
