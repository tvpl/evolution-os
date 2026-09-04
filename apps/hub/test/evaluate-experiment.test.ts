import { describe, expect, it } from "vitest";
import { evaluateExperiment } from "../src/evolution/experiments.js";

const gtePlan = {
  hypothesis: "x",
  baselineMetric: "conversion_rate",
  threshold: 10,
  comparison: "gte" as const,
  observationWindow: "7d",
};

const ltePlan = {
  hypothesis: "x",
  baselineMetric: "p95_latency_ms",
  threshold: 100,
  comparison: "lte" as const,
  observationWindow: "7d",
};

describe("evaluateExperiment (EXP-08/09/10)", () => {
  it("gte: observed value at or above threshold is hypothesis_met", () => {
    expect(evaluateExperiment(gtePlan, 10).verdict).toBe("hypothesis_met");
    expect(evaluateExperiment(gtePlan, 15).verdict).toBe("hypothesis_met");
  });

  it("gte: observed value below threshold is hypothesis_not_met", () => {
    expect(evaluateExperiment(gtePlan, 9).verdict).toBe("hypothesis_not_met");
  });

  it("lte: observed value at or below threshold is hypothesis_met", () => {
    expect(evaluateExperiment(ltePlan, 100).verdict).toBe("hypothesis_met");
    expect(evaluateExperiment(ltePlan, 50).verdict).toBe("hypothesis_met");
  });

  it("lte: observed value above threshold is hypothesis_not_met", () => {
    expect(evaluateExperiment(ltePlan, 101).verdict).toBe("hypothesis_not_met");
  });

  it("null observed value is inconclusive with a stated rationale", () => {
    const result = evaluateExperiment(gtePlan, null);
    expect(result.verdict).toBe("inconclusive");
    expect(result.rationale).toMatch(/unavailable/);
  });

  it("rationale explains the comparison for a met and a not-met case", () => {
    expect(evaluateExperiment(gtePlan, 15).rationale).toMatch(/15 gte threshold 10/);
    expect(evaluateExperiment(gtePlan, 9).rationale).toMatch(/9 gte threshold 10/);
  });
});
