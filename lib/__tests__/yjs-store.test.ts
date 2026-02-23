/**
 * Unit tests for lib/yjs-store.ts — per-board Yjs isolation.
 *
 * The SupabaseYjsProvider and the Supabase client are both mocked so these
 * tests exercise only the store's own logic (boardStore Map, accessor functions,
 * and destroyProvider cleanup) without touching the network.
 *
 * API contract:
 *   ensurePersistence(boardId) — the ONLY function that creates board state.
 *   getSharedLayers / getYdoc / getProvider / getAwareness — read-only; null
 *     if board has not been initialised via ensurePersistence or has been
 *     destroyed.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import * as Y from "yjs";

// ---------------------------------------------------------------------------
// Shared mock state — vi.hoisted ensures these are available inside vi.mock()
// factory functions, which are hoisted before normal variable declarations.
// ---------------------------------------------------------------------------

const { mockDestroy, mockLoaded } = vi.hoisted(() => ({
  mockDestroy: vi.fn().mockResolvedValue(undefined),
  mockLoaded: Promise.resolve(),
}));

// ---------------------------------------------------------------------------
// Mock: SupabaseYjsProvider — must use a real class (not an arrow fn) so that
// `new SupabaseYjsProvider(...)` works correctly.
// ---------------------------------------------------------------------------

vi.mock("../supabase-yjs-provider", () => ({
  SupabaseYjsProvider: class MockProvider {
    doc: Y.Doc;
    loaded = mockLoaded;
    awareness: {
      on: ReturnType<typeof vi.fn>;
      off: ReturnType<typeof vi.fn>;
      destroy: ReturnType<typeof vi.fn>;
      getLocalState: ReturnType<typeof vi.fn>;
      setLocalStateField: ReturnType<typeof vi.fn>;
    };
    destroy = mockDestroy;
    setStatusCallback = vi.fn();

    constructor(doc: Y.Doc) {
      this.doc = doc;
      this.awareness = {
        on: vi.fn(),
        off: vi.fn(),
        destroy: vi.fn(),
        getLocalState: vi.fn().mockReturnValue({}),
        setLocalStateField: vi.fn(),
      };
    }
  },
}));

// ---------------------------------------------------------------------------
// Mock: Supabase client
// ---------------------------------------------------------------------------

vi.mock("../supabase", () => ({
  supabase: {
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
    }),
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }),
  },
}));

// ---------------------------------------------------------------------------
// Lazy import — must come after vi.mock() hoisting
// ---------------------------------------------------------------------------

import {
  getSharedLayers,
  getYdoc,
  getAwareness,
  getProvider,
  ensurePersistence,
  destroyProvider,
} from "../yjs-store";

// ---------------------------------------------------------------------------
// Cleanup between tests
// ---------------------------------------------------------------------------

const BOARD_A = "board-aaaaaaaa-0001";
const BOARD_B = "board-bbbbbbbb-0002";

afterEach(async () => {
  await destroyProvider(BOARD_A);
  await destroyProvider(BOARD_B);
  vi.clearAllMocks();
  // Restore the mockDestroy so it resolves again after clearAllMocks
  mockDestroy.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("yjs-store — per-board isolation", () => {
  it("returns null for null boardId", () => {
    expect(getSharedLayers(null)).toBeNull();
    expect(getYdoc(null)).toBeNull();
    expect(getAwareness(null)).toBeNull();
  });

  it("getSharedLayers returns a Y.Map for a valid boardId after ensurePersistence", () => {
    ensurePersistence(BOARD_A);
    const layers = getSharedLayers(BOARD_A);
    expect(layers).not.toBeNull();
    expect(typeof layers!.set).toBe("function");
    expect(typeof layers!.get).toBe("function");
  });

  it("getSharedLayers returns null when boardId has not been initialised", () => {
    // No ensurePersistence call — accessors are read-only and do not auto-create.
    expect(getSharedLayers(BOARD_A)).toBeNull();
  });

  it("getYdoc returns a Y.Doc for a valid boardId after ensurePersistence", () => {
    ensurePersistence(BOARD_A);
    const doc = getYdoc(BOARD_A);
    expect(doc).toBeInstanceOf(Y.Doc);
  });

  it("returns the same instance on repeated calls for the same boardId", () => {
    ensurePersistence(BOARD_A);
    expect(getSharedLayers(BOARD_A)).toBe(getSharedLayers(BOARD_A));
    expect(getYdoc(BOARD_A)).toBe(getYdoc(BOARD_A));
  });

  it("two different boardIds get completely independent Y.Maps", () => {
    ensurePersistence(BOARD_A);
    ensurePersistence(BOARD_B);

    const layersA = getSharedLayers(BOARD_A)!;
    const layersB = getSharedLayers(BOARD_B)!;

    layersA.set("sticky-1", { type: "sticky", x: 10, y: 20, text: "Hello" });

    expect(layersA.has("sticky-1")).toBe(true);
    expect(layersB.has("sticky-1")).toBe(false);
  });

  it("two different boardIds get independent Y.Docs", () => {
    ensurePersistence(BOARD_A);
    ensurePersistence(BOARD_B);
    expect(getYdoc(BOARD_A)).not.toBe(getYdoc(BOARD_B));
  });

  it("destroyProvider removes board state so the next call creates a fresh instance", async () => {
    ensurePersistence(BOARD_A);
    const layersBefore = getSharedLayers(BOARD_A)!;
    layersBefore.set("shape-1", { type: "rectangle", x: 0, y: 0, width: 100, height: 50 });

    await destroyProvider(BOARD_A);
    expect(mockDestroy).toHaveBeenCalled();

    // After destroy, accessors return null.
    expect(getSharedLayers(BOARD_A)).toBeNull();

    // Re-initialising via ensurePersistence creates a fresh, empty instance.
    ensurePersistence(BOARD_A);
    const layersAfter = getSharedLayers(BOARD_A)!;
    expect(layersAfter).not.toBe(layersBefore);
    expect(layersAfter.has("shape-1")).toBe(false);
  });

  it("destroyProvider is safe to call for a boardId that was never created", async () => {
    await expect(destroyProvider("non-existent-board")).resolves.toBeUndefined();
  });

  it("getProvider returns the provider for an initialised board", () => {
    ensurePersistence(BOARD_A);
    const provider = getProvider(BOARD_A);
    expect(provider).not.toBeNull();
    expect(provider!.loaded).toBeDefined();
  });

  it("getProvider returns null for an uninitialised boardId", () => {
    expect(getProvider("never-created")).toBeNull();
  });

  it("getProvider returns null after destroyProvider", async () => {
    ensurePersistence(BOARD_A);
    await destroyProvider(BOARD_A);
    expect(getProvider(BOARD_A)).toBeNull();
  });
});
