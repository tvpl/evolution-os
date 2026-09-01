import { describe, expect, it } from "vitest";
import { runEvalCase, runEvalDataset, type InventoryRow, type EvalCaseRow } from "../src/evolution/harness.js";

const inventory: InventoryRow = {
  version: 1,
  skills: [{ id: "triage", name: "Triage", version: "1.0.0" }],
  mcps: [{ id: "governance", name: "Governance MCP", version: "1.0.0" }],
  models: [{ id: "model-a", name: "Model A", version: "1.0.0" }],
  createdAt: new Date().toISOString(),
};

function makeCase(invariantType: EvalCaseRow["invariantType"], params: Record<string, unknown>): EvalCaseRow {
  return { id: "hec_x", name: "case", invariantType, params, createdAt: new Date().toISOString() };
}

describe("runEvalCase (HRN-07)", () => {
  it("requires_skill passes when the skill is present", () => {
    const result = runEvalCase(inventory, makeCase("requires_skill", { skillId: "triage" }));
    expect(result.passed).toBe(true);
    expect(result.reason).toContain("found");
  });

  it("requires_skill fails with a specific reason when the skill is absent", () => {
    const result = runEvalCase(inventory, makeCase("requires_skill", { skillId: "missing-skill" }));
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("missing");
  });

  it("requires_mcp passes when the mcp is present", () => {
    const result = runEvalCase(inventory, makeCase("requires_mcp", { mcpId: "governance" }));
    expect(result.passed).toBe(true);
  });

  it("requires_mcp fails when the mcp is absent", () => {
    const result = runEvalCase(inventory, makeCase("requires_mcp", { mcpId: "nonexistent" }));
    expect(result.passed).toBe(false);
  });

  it("forbids_mcp passes when the mcp is absent", () => {
    const result = runEvalCase(inventory, makeCase("forbids_mcp", { mcpId: "legacy" }));
    expect(result.passed).toBe(true);
  });

  it("forbids_mcp fails when the forbidden mcp is present", () => {
    const result = runEvalCase(inventory, makeCase("forbids_mcp", { mcpId: "governance" }));
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("forbidden");
  });

  it("min_component_count passes when the count meets the minimum", () => {
    const result = runEvalCase(inventory, makeCase("min_component_count", { category: "skills", min: 1 }));
    expect(result.passed).toBe(true);
  });

  it("min_component_count fails when the count is below the minimum", () => {
    const result = runEvalCase(inventory, makeCase("min_component_count", { category: "skills", min: 2 }));
    expect(result.passed).toBe(false);
  });
});

describe("runEvalDataset (HRN-07)", () => {
  it("aggregates passed/total across mixed pass and fail cases", () => {
    const cases = [
      makeCase("requires_skill", { skillId: "triage" }),
      makeCase("requires_skill", { skillId: "missing-skill" }),
      makeCase("min_component_count", { category: "mcps", min: 1 }),
    ];
    const result = runEvalDataset(inventory, cases);
    expect(result.total).toBe(3);
    expect(result.passed).toBe(2);
    expect(result.results).toHaveLength(3);
  });

  it("returns 0/0 for an empty case list without throwing", () => {
    const result = runEvalDataset(inventory, []);
    expect(result).toEqual({ passed: 0, total: 0, results: [] });
  });
});
