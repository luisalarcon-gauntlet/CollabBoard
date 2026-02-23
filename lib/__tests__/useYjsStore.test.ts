/**
 * Tests for lib/useYjsStore — the React hook that subscribes to the shared
 * Yjs "layers" map and re-renders when it changes.
 *
 * Critical test: race condition where loadFromDb applies data to the Y.Doc
 * BEFORE the React effect attaches the observer.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import * as Y from "yjs";

// ---------------------------------------------------------------------------
// Mock state — hoisted so vi.mock factories can reference them
// ---------------------------------------------------------------------------

const { mockProviderLoaded, mockGetBoardState } = vi.hoisted(() => {
  let resolveLoaded: () => void;
  const loadedPromise = new Promise<void>((r) => { resolveLoaded = r; });

  return {
    mockProviderLoaded: {
      promise: loadedPromise,
      resolve: () => resolveLoaded(),
      reset() {
        const p = new Promise<void>((r) => { resolveLoaded = r; });
        this.promise = p;
      },
    },
    mockGetBoardState: {
      ydoc: null as Y.Doc | null,
      layers: null as Y.Map<unknown> | null,
    },
  };
});

// ---------------------------------------------------------------------------
// Mock: yjs-store — controls what getSharedLayers / getProvider return
// ---------------------------------------------------------------------------

vi.mock("../yjs-store", () => ({
  getSharedLayers: vi.fn().mockImplementation(() => mockGetBoardState.layers),
  getProvider: vi.fn().mockImplementation(() =>
    mockGetBoardState.layers
      ? { loaded: mockProviderLoaded.promise }
      : null
  ),
}));

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import { useYjsStore } from "../useYjsStore";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupYDoc() {
  const ydoc = new Y.Doc();
  const layers = ydoc.getMap("layers");
  mockGetBoardState.ydoc = ydoc;
  mockGetBoardState.layers = layers;
  return { ydoc, layers };
}

function teardownYDoc() {
  mockGetBoardState.ydoc = null;
  mockGetBoardState.layers = null;
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterEach(() => {
  teardownYDoc();
  vi.clearAllMocks();
  mockProviderLoaded.reset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useYjsStore", () => {
  it("returns an empty Map when boardId is null", () => {
    const { result } = renderHook(() => useYjsStore(null));
    expect(result.current.size).toBe(0);
  });

  it("returns an empty Map initially for a valid boardId with no data", () => {
    setupYDoc();
    const { result } = renderHook(() => useYjsStore("board-1"));
    expect(result.current.size).toBe(0);
  });

  it("updates reactively when a layer is added to the Y.Map", () => {
    const { layers } = setupYDoc();
    const { result } = renderHook(() => useYjsStore("board-1"));

    act(() => {
      layers.set("sticky-1", { type: "sticky", x: 10, y: 20, text: "Hi" });
    });

    expect(result.current.size).toBe(1);
    expect(result.current.get("sticky-1")).toMatchObject({ type: "sticky", text: "Hi" });
  });

  it("updates reactively when a layer is removed from the Y.Map", () => {
    const { layers } = setupYDoc();
    const { result } = renderHook(() => useYjsStore("board-1"));

    act(() => {
      layers.set("rect-1", { type: "rectangle", x: 0, y: 0, width: 100, height: 50 });
    });
    expect(result.current.size).toBe(1);

    act(() => {
      layers.delete("rect-1");
    });
    expect(result.current.size).toBe(0);
  });

  // ── Critical race-condition test ──────────────────────────────────────
  it("picks up data applied to Y.Doc before the observer is attached (race condition)", async () => {
    const { ydoc, layers } = setupYDoc();

    // Simulate what loadFromDb does: apply a Yjs update that populates the map.
    // Build the update from a separate doc to mimic the DB-loaded state.
    const sourceDoc = new Y.Doc();
    const sourceMap = sourceDoc.getMap("layers");
    sourceMap.set("preloaded-1", { type: "sticky", x: 5, y: 5, text: "From DB" });
    sourceMap.set("preloaded-2", { type: "rectangle", x: 100, y: 100, width: 200, height: 100 });
    const update = Y.encodeStateAsUpdate(sourceDoc);

    // Apply update BEFORE the hook mounts (simulates fast loadFromDb)
    Y.applyUpdate(ydoc, update);
    expect(layers.size).toBe(2);

    // Now resolve the provider's `loaded` promise (simulates init completing)
    mockProviderLoaded.resolve();

    // Mount the hook — it must pick up the pre-existing data
    const { result } = renderHook(() => useYjsStore("board-1"));

    // Wait for the loaded-promise effect to fire
    await act(async () => {
      await mockProviderLoaded.promise;
    });

    expect(result.current.size).toBe(2);
    expect(result.current.get("preloaded-1")).toMatchObject({ text: "From DB" });
  });
});
