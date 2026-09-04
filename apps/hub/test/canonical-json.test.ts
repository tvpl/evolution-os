import { describe, expect, it } from "vitest";
import { canonicalJson } from "../src/platform/canonical-json.js";

describe("canonicalJson", () => {
  it("produces the same string for objects with keys in different orders", () => {
    const a = { b: 1, a: 2, c: 3 };
    const b = { c: 3, a: 2, b: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it("produces different strings for arrays with the same elements in a different order", () => {
    const a = [{ id: "x" }, { id: "y" }];
    const b = [{ id: "y" }, { id: "x" }];
    expect(canonicalJson(a)).not.toBe(canonicalJson(b));
  });

  it("is stable across nested objects regardless of insertion order", () => {
    const a = { outer: { z: 1, y: { q: 1, p: 2 } } };
    const b = { outer: { y: { p: 2, q: 1 }, z: 1 } };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it("distinguishes different primitive values", () => {
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: 2 }));
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson("x")).toBe('"x"');
  });
});
