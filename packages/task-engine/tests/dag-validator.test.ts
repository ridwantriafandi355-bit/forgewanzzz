import { describe, it, expect } from "vitest";
import { DagValidator } from "../src/dag/dag-validator.js";

describe("DagValidator", () => {
  it("validates an acyclic graph with dependencies", () => {
    const nodes = [
      { id: "A", dependencies: [] },
      { id: "B", dependencies: ["A"] },
      { id: "C", dependencies: ["A"] },
      { id: "D", dependencies: ["B", "C"] }
    ];

    const result = DagValidator.validateAcyclic(nodes);
    expect(result.valid).toBe(true);
    expect(result.cycle).toBeUndefined();
    expect(result.topologicalOrder).toEqual(["A", "B", "C", "D"]);
  });

  it("detects circular dependencies and reports the cycle", () => {
    const nodes = [
      { id: "A", dependencies: ["C"] },
      { id: "B", dependencies: ["A"] },
      { id: "C", dependencies: ["B"] }
    ];

    const result = DagValidator.validateAcyclic(nodes);
    expect(result.valid).toBe(false);
    expect(result.cycle).toBeDefined();
    expect(result.cycle?.length).toBeGreaterThan(0);
  });
});
