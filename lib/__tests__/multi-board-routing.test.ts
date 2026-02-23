/**
 * lib/__tests__/multi-board-routing.test.ts
 *
 * Regression / specification tests for the multi-board routing bug:
 *   "Navigating between /board/[id] routes causes our Yjs provider to fail
 *    and leaves the Whiteboard component with a stale ydoc closure."
 *
 * ─── Root causes documented in CONTEXT_FOR_AI.md §16.13 ─────────────────────
 *
 *  BUG A — Async-destroy race (§16.13)
 *    destroyProvider(boardId) previously ran:
 *      1. boardStore.delete(boardId)   ← synchronous — entry gone immediately
 *      2. await state.provider.destroy() ← async DB save starts
 *
 *    If getOrCreateBoardState(boardId) was called between steps 1 and 2
 *    (e.g. React StrictMode double-invoke or a fast navigation), it would
 *    find NO entry in boardStore and spawn a brand-new provider.  Two
 *    providers for the same boardId would coexist simultaneously.
 *
 *    Fix: pendingDestroys set blocks getOrCreateBoardState() during the
 *    async window; only ensurePersistence() (the explicit init path) calls
 *    getOrCreateBoardState().
 *
 *  BUG B — Stale-closure silent re-init
 *    getSharedLayers(boardId) previously delegated to getOrCreateBoardState(),
 *    which would create a new entry if one was missing.  A shape component
 *    (e.g. FrameElement) that captured boardId in a callback and fired after
 *    navigation to another board would silently re-initialise the old board —
 *    a leaked provider with no React tree to own it.
 *
 *    Fix: getSharedLayers (and all other accessors) are now strictly read-only;
 *    they use boardStore.get() directly and never call getOrCreateBoardState().
 *
 * ─── API contract under test ─────────────────────────────────────────────────
 *
 *   ensurePersistence(boardId)  — the ONLY function that creates board state.
 *   getSharedLayers(boardId)    — read-only; null if not initialised / destroyed.
 *   destroyProvider(boardId)    — tears down; blocks re-creation during async save.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import * as Y from "yjs";

// ---------------------------------------------------------------------------
// Shared mutable state — vi.hoisted() ensures these values are created before
// the vi.mock() factory functions run (which are hoisted by Vitest/Vite).
// ---------------------------------------------------------------------------

const { mockDestroy, providerTracker } = vi.hoisted(() => ({
  /** Default: resolves immediately.  Individual tests override with mockImplementationOnce. */
  mockDestroy: vi.fn().mockResolvedValue(undefined),
  /**
   * Mutable counter shared between the vi.mock factory and each test body.
   * Incremented every time `new MockProvider()` is called.
   * Reset to 0 in afterEach so tests are independent.
   */
  providerTracker: { constructorCalls: 0 },
}));

// ---------------------------------------------------------------------------
// Mock — SupabaseYjsProvider
// ---------------------------------------------------------------------------

vi.mock("../supabase-yjs-provider", () => ({
  SupabaseYjsProvider: class MockProvider {
    doc: Y.Doc;
    loaded = Promise.resolve();
    awareness = {
      on: vi.fn(),
      off: vi.fn(),
      destroy: vi.fn(),
      getLocalState: vi.fn().mockReturnValue({}),
      setLocalStateField: vi.fn(),
    };
    destroy = mockDestroy;
    setStatusCallback = vi.fn();

    constructor(doc: Y.Doc) {
      this.doc = doc;
      providerTracker.constructorCalls++;
    }
  },
}));

// ---------------------------------------------------------------------------
// Mock — Supabase client
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
// Module under test — imported after vi.mock() so mocks are in place
// ---------------------------------------------------------------------------

import {
  getSharedLayers,
  getYdoc,
  getProvider,
  ensurePersistence,
  destroyProvider,
} from "../yjs-store";

// ---------------------------------------------------------------------------
// Board IDs unique to this suite to avoid cross-test contamination
// ---------------------------------------------------------------------------

const BOARD_A = "multi-routing-test-board-A-00001";
const BOARD_B = "multi-routing-test-board-B-00002";

// ---------------------------------------------------------------------------
// Per-test cleanup
// ---------------------------------------------------------------------------

afterEach(async () => {
  await destroyProvider(BOARD_A);
  await destroyProvider(BOARD_B);

  vi.clearAllMocks();
  // Re-establish the default (immediate resolve) after clearAllMocks wipes it.
  mockDestroy.mockResolvedValue(undefined);
  providerTracker.constructorCalls = 0;
});

// ===========================================================================
// ═══  TEST CASE 1 — Provider Isolation  ════════════════════════════════════
//   Verifies that board-A and board-B receive completely distinct Yjs state.
//   ensurePersistence() is used to initialise each board (the correct API).
//   getSharedLayers() / getYdoc() are read-only accessors.
// ===========================================================================

describe("Test Case 1 — Provider Isolation", () => {
  it("returns a distinct Y.Doc instance for board-A and board-B", () => {
    ensurePersistence(BOARD_A);
    ensurePersistence(BOARD_B);

    const docA = getYdoc(BOARD_A);
    const docB = getYdoc(BOARD_B);

    expect(docA).toBeInstanceOf(Y.Doc);
    expect(docB).toBeInstanceOf(Y.Doc);
    expect(docA).not.toBe(docB);
  });

  it("returns a distinct Y.Map<LayerData> (sharedLayers) for board-A and board-B", () => {
    ensurePersistence(BOARD_A);
    ensurePersistence(BOARD_B);

    const layersA = getSharedLayers(BOARD_A);
    const layersB = getSharedLayers(BOARD_B);

    expect(layersA).not.toBeNull();
    expect(layersB).not.toBeNull();
    expect(layersA).not.toBe(layersB);
  });

  it("returns a distinct provider instance for board-A and board-B", () => {
    ensurePersistence(BOARD_A);
    ensurePersistence(BOARD_B);

    const providerA = getProvider(BOARD_A);
    const providerB = getProvider(BOARD_B);

    expect(providerA).not.toBeNull();
    expect(providerB).not.toBeNull();
    expect(providerA).not.toBe(providerB);
  });

  it("mutating board-A layers does NOT bleed into board-B layers", () => {
    ensurePersistence(BOARD_A);
    ensurePersistence(BOARD_B);

    const layersA = getSharedLayers(BOARD_A)!;
    const layersB = getSharedLayers(BOARD_B)!;

    layersA.set("sticky-only-in-A", {
      type: "sticky",
      x: 100,
      y: 200,
      text: "Board-A exclusive content",
    });

    expect(layersA.has("sticky-only-in-A")).toBe(true);
    expect(layersB.has("sticky-only-in-A")).toBe(false);
  });

  it("mutating board-B layers does NOT bleed into board-A layers", () => {
    ensurePersistence(BOARD_A);
    ensurePersistence(BOARD_B);

    const layersA = getSharedLayers(BOARD_A)!;
    const layersB = getSharedLayers(BOARD_B)!;

    layersB.set("rect-only-in-B", {
      type: "rectangle",
      x: 50,
      y: 50,
      width: 200,
      height: 100,
    });

    expect(layersB.has("rect-only-in-B")).toBe(true);
    expect(layersA.has("rect-only-in-B")).toBe(false);
  });

  it("repeated getSharedLayers / getYdoc calls for the same boardId return the SAME instance (singleton)", () => {
    ensurePersistence(BOARD_A);

    expect(getSharedLayers(BOARD_A)).toBe(getSharedLayers(BOARD_A));
    expect(getYdoc(BOARD_A)).toBe(getYdoc(BOARD_A));
  });

  it("ensurePersistence constructs exactly ONE provider per boardId regardless of call count", () => {
    ensurePersistence(BOARD_A); // creates — count = 1
    ensurePersistence(BOARD_A); // idempotent — count stays 1
    ensurePersistence(BOARD_A); // idempotent — count stays 1

    expect(providerTracker.constructorCalls).toBe(1);
  });
});

// ===========================================================================
// ═══  TEST CASE 2 — The Async Destroy Bug  ═════════════════════════════════
//   Simulates the race condition described in §16.13:
//     destroyProvider('board-A')        ← fire-and-forget (void), async save pending
//     getSharedLayers / ensurePersistence ← called BEFORE save finishes
// ===========================================================================

describe("Test Case 2 — The Async Destroy Bug", () => {
  /**
   * ✅  With the fix this test PASSES.
   *
   * Scenario: component remounts while the previous provider is still flushing
   * to the DB.  The pendingDestroys guard causes getOrCreateBoardState() to
   * return null → no second SupabaseYjsProvider is constructed.
   *
   * The read-only getSharedLayers() also ensures the test's Phase-4 call
   * returns null without touching the store at all.
   */
  it("does NOT spawn a second provider while the first is still destroying", async () => {
    // ── Phase 1: initial mount ──────────────────────────────────────────────
    ensurePersistence(BOARD_A);
    expect(providerTracker.constructorCalls).toBe(1);

    // ── Phase 2: make destroy async (simulates slow saveToDb) ──────────────
    let resolveDestroy!: () => void;
    mockDestroy.mockImplementationOnce(
      () => new Promise<void>((resolve) => { resolveDestroy = resolve; })
    );

    // ── Phase 3: fire-and-forget destroy (mirrors `void destroyProvider()` in
    //            WhiteboardClient cleanup) ───────────────────────────────────
    const destroyTask = destroyProvider(BOARD_A);

    // ── Phase 4: component remounts before destroy finishes ─────────────────
    // getSharedLayers is read-only → returns null; does not call getOrCreate.
    // ensurePersistence would also be blocked by pendingDestroys.
    // Either way: NO new provider is constructed.
    const layersDuringDestroy = getSharedLayers(BOARD_A);
    expect(layersDuringDestroy).toBeNull();

    // CORE ASSERTION: constructor called exactly once (no duplicate provider).
    expect(providerTracker.constructorCalls).toBe(1);

    resolveDestroy();
    await destroyTask;
  });

  /**
   * ✅  With the fix this test PASSES.
   *
   * During the async-destroy window, getSharedLayers must return null.
   * The old code returned a freshly-created Y.Map via getOrCreateBoardState.
   */
  it("getSharedLayers returns null while board-A destroy is still pending", async () => {
    ensurePersistence(BOARD_A);

    let resolveDestroy!: () => void;
    mockDestroy.mockImplementationOnce(
      () => new Promise<void>((resolve) => { resolveDestroy = resolve; })
    );

    const destroyTask = destroyProvider(BOARD_A);

    // getProvider uses boardStore.get directly — already null after delete.
    expect(getProvider(BOARD_A)).toBeNull();

    // getSharedLayers is also read-only and uses boardStore.get directly.
    const layersDuringDestroy = getSharedLayers(BOARD_A);
    expect(layersDuringDestroy).toBeNull();

    resolveDestroy();
    await destroyTask;
  });
});

// ===========================================================================
// ═══  TEST CASE 3 — Shape Layer Access  ════════════════════════════════════
//   Mirrors how shape components access board state via getSharedLayers(boardId)
//   inside event handlers that captured boardId at render time.
// ===========================================================================

describe("Test Case 3 — Shape Layer Access", () => {
  /**
   * ✅  Happy path — board-B's Y.Map is isolated from board-A.
   */
  it("getSharedLayers(BOARD_B) returns an isolated, empty Y.Map distinct from board-A", () => {
    ensurePersistence(BOARD_A);
    const layersA = getSharedLayers(BOARD_A)!;
    layersA.set("frame-in-A", {
      type: "frame",
      x: 0,
      y: 0,
      width: 800,
      height: 600,
      title: "Board-A Frame",
      backgroundColor: "#f0f4f8",
    });

    ensurePersistence(BOARD_B);
    const layersB = getSharedLayers(BOARD_B)!;

    expect(layersB).not.toBeNull();
    expect(layersB).not.toBe(layersA);
    expect(layersB.size).toBe(0);
    expect(layersB.has("frame-in-A")).toBe(false);
  });

  /**
   * ✅  Singleton consistency — same Y.Map reference for repeated reads.
   */
  it("writes via getSharedLayers(BOARD_B) are visible on subsequent reads for BOARD_B", () => {
    ensurePersistence(BOARD_B);
    const layers1 = getSharedLayers(BOARD_B)!;
    layers1.set("circle-b-1", {
      type: "circle",
      x: 200,
      y: 300,
      width: 80,
      height: 80,
    });

    const layers2 = getSharedLayers(BOARD_B)!;

    expect(layers2).toBe(layers1);
    expect(layers2.has("circle-b-1")).toBe(true);
    expect(layers2.get("circle-b-1")).toEqual({
      type: "circle",
      x: 200,
      y: 300,
      width: 80,
      height: 80,
    });
  });

  /**
   * ✅  Stale-closure guard — the core regression test for Bug B.
   *
   * After navigating away (destroyProvider awaited), any stale closure that
   * still holds the old boardId string and calls getSharedLayers() must
   * receive null — NOT a silently re-initialised Y.Map / leaked provider.
   */
  it("getSharedLayers returns null for a board that has been destroyed (stale-closure guard)", async () => {
    // Simulate navigating to board-A then away.
    ensurePersistence(BOARD_A);   // call #1 — provider created for A
    await destroyProvider(BOARD_A);

    // Board-B is now the active board.
    ensurePersistence(BOARD_B);   // call #2 — provider created for B

    // Stale closure from the old board-A route fires.
    const staleResult = getSharedLayers(BOARD_A);

    // The result must be null — no silent re-init, no leaked provider.
    expect(staleResult).toBeNull();

    // Exactly 2 constructor calls: one for A (initial), one for B.
    // No third call from the stale getSharedLayers access.
    expect(providerTracker.constructorCalls).toBe(2);
  });
});
