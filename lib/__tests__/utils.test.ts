/**
 * Unit tests for lib/utils — getElementsInFrame, cn, isValidUUID
 */

import { describe, it, expect } from "vitest";
import { getElementsInFrame, cn, isValidUUID } from "../utils";
import type { LayerData } from "../yjs-store";

describe("cn", () => {
  it("joins truthy class names", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("filters falsy values", () => {
    expect(cn("a", false, "b", null, "c", undefined)).toBe("a b c");
  });
});

describe("isValidUUID", () => {
  it("accepts valid UUID v4", () => {
    expect(isValidUUID("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("rejects invalid formats", () => {
    expect(isValidUUID("not-a-uuid")).toBe(false);
    expect(isValidUUID("")).toBe(false);
    expect(isValidUUID("550e8400-e29b-41d4-a716")).toBe(false);
  });
});

describe("getElementsInFrame", () => {
  it("returns empty array when frame does not exist", () => {
    const layers = new Map<string, LayerData>();
    expect(getElementsInFrame("frame-1", layers)).toEqual([]);
  });

  it("returns empty array when id is not a frame", () => {
    const layers = new Map<string, LayerData>([
      ["sticky-1", { type: "sticky", x: 0, y: 0, text: "x" }],
    ]);
    expect(getElementsInFrame("sticky-1", layers)).toEqual([]);
  });

  it("returns IDs of shapes fully contained within frame bounds", () => {
    const layers = new Map<string, LayerData>([
      ["frame-1", { type: "frame", x: 0, y: 0, width: 200, height: 200, title: "F", backgroundColor: "#fff" }],
      ["sticky-1", { type: "sticky", x: 10, y: 10, width: 50, height: 50, text: "a" }],
      ["rect-1", { type: "rectangle", x: 100, y: 100, width: 50, height: 50 }],
      ["sticky-2", { type: "sticky", x: 180, y: 180, width: 20, height: 20, text: "b" }],
    ]);
    const result = getElementsInFrame("frame-1", layers);
    expect(result).toContain("sticky-1");
    expect(result).toContain("rect-1");
    expect(result).toContain("sticky-2");
    expect(result).toHaveLength(3);
  });

  it("excludes shapes that extend outside frame", () => {
    const layers = new Map<string, LayerData>([
      ["frame-1", { type: "frame", x: 0, y: 0, width: 100, height: 100, title: "F", backgroundColor: "#fff" }],
      ["sticky-in", { type: "sticky", x: 10, y: 10, width: 50, height: 50, text: "in" }],
      ["sticky-out", { type: "sticky", x: 80, y: 80, width: 50, height: 50, text: "out" }],
    ]);
    const result = getElementsInFrame("frame-1", layers);
    expect(result).toContain("sticky-in");
    expect(result).not.toContain("sticky-out");
  });

  it("excludes connectors and frames", () => {
    const layers = new Map<string, LayerData>([
      ["frame-1", { type: "frame", x: 0, y: 0, width: 300, height: 300, title: "F", backgroundColor: "#fff" }],
      ["conn-1", { type: "connector", fromId: "a", toId: "b", style: "straight", stroke: { color: "#000", width: 1 }, endpoints: "none" }],
      ["frame-2", { type: "frame", x: 50, y: 50, width: 100, height: 100, title: "F2", backgroundColor: "#fff" }],
      ["sticky-1", { type: "sticky", x: 60, y: 60, width: 30, height: 30, text: "x" }],
    ]);
    const result = getElementsInFrame("frame-1", layers);
    expect(result).not.toContain("conn-1");
    expect(result).not.toContain("frame-2");
    expect(result).toContain("sticky-1");
  });

  it("handles line layers (uses point bbox)", () => {
    const layers = new Map<string, LayerData>([
      ["frame-1", { type: "frame", x: 0, y: 0, width: 100, height: 100, title: "F", backgroundColor: "#fff" }],
      ["line-1", { type: "line", x: 10, y: 10, points: [[10, 10], [90, 90]], color: "#000", thickness: 1, variant: "straight" }],
      ["line-2", { type: "line", x: 0, y: 0, points: [[0, 0], [150, 150]], color: "#000", thickness: 1, variant: "straight" }],
    ]);
    const result = getElementsInFrame("frame-1", layers);
    expect(result).toContain("line-1");
    expect(result).not.toContain("line-2");
  });
});
