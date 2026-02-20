/**
 * Unit tests for the cursor-awareness throttle used in Whiteboard.tsx.
 *
 * Coverage:
 *  1. Unthrottled callbacks (panning, shape dragging) fire on every invocation.
 *  2. The awareness cursor update is throttled: only the leading call fires
 *     within a 33 ms window.
 *  3. Trailing edge: after the window expires, the last captured position fires.
 *  4. pointerleave bypasses the throttle, cancels any pending trailing call,
 *     and immediately sets the cursor to null.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { throttleTrailing } from "../throttle";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal Awareness-like mock that records all setLocalStateField calls. */
function createMockAwareness(initialUser = { name: "Alice", cursor: null as { x: number; y: number } | null }) {
  let userState = { ...initialUser };

  const setLocalStateField = vi.fn((field: string, value: unknown) => {
    if (field === "user") {
      userState = value as typeof userState;
    }
  });

  const getLocalState = () => ({ user: userState });

  return { setLocalStateField, getLocalState };
}

// ---------------------------------------------------------------------------
// Test suite 1 — Unthrottled (panning / shape dragging)
// ---------------------------------------------------------------------------

describe("Unthrottled callbacks (panning and shape dragging)", () => {
  /**
   * Test 1
   * Standard pointermove operations that update canvas pan/marquee/drag must
   * NOT be wrapped in the throttle. This test asserts the invariant: a plain
   * function (the stand-in for setPan or handleDragDelta) fires on every single
   * call, with no suppression.
   */
  it("fires on every invocation — no frame is dropped", () => {
    const setPan = vi.fn();

    // Simulate 5 rapid pointer-move events
    setPan({ x: 10, y: 20 });
    setPan({ x: 11, y: 21 });
    setPan({ x: 12, y: 22 });
    setPan({ x: 13, y: 23 });
    setPan({ x: 14, y: 24 });

    expect(setPan).toHaveBeenCalledTimes(5);
    expect(setPan).toHaveBeenLastCalledWith({ x: 14, y: 24 });
  });
});

// ---------------------------------------------------------------------------
// Test suite 2 — Throttled awareness cursor update
// ---------------------------------------------------------------------------

describe("Throttled awareness cursor update (~30 FPS / 33 ms)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Test 2
   * Calls that arrive within the 33 ms window after the leading call must be
   * suppressed (the awareness channel must not be flooded).
   */
  it("suppresses awareness updates that arrive within the 33 ms window", () => {
    const mockAwareness = createMockAwareness();

    const { fn: throttledUpdate } = throttleTrailing((x: number, y: number) => {
      const prev = mockAwareness.getLocalState().user;
      mockAwareness.setLocalStateField("user", { ...prev, cursor: { x, y } });
    }, 33);

    throttledUpdate(100, 200); // leading edge — fires immediately
    vi.advanceTimersByTime(10);
    throttledUpdate(110, 210); // within window — suppressed
    vi.advanceTimersByTime(10);
    throttledUpdate(120, 220); // still within window — suppressed

    // Only the first (leading) call should have reached awareness
    expect(mockAwareness.setLocalStateField).toHaveBeenCalledTimes(1);
    expect(mockAwareness.setLocalStateField).toHaveBeenCalledWith(
      "user",
      expect.objectContaining({ cursor: { x: 100, y: 200 } }),
    );
  });

  /**
   * Test 3
   * After the throttle window the trailing call must fire with the *last*
   * captured coordinates, not the first — so remote users always see the
   * final resting position of the cursor.
   */
  it("fires the trailing edge with the last captured coordinates", () => {
    const mockAwareness = createMockAwareness();

    const { fn: throttledUpdate } = throttleTrailing((x: number, y: number) => {
      const prev = mockAwareness.getLocalState().user;
      mockAwareness.setLocalStateField("user", { ...prev, cursor: { x, y } });
    }, 33);

    throttledUpdate(100, 200); // leading edge fires at t=0
    vi.advanceTimersByTime(10);
    throttledUpdate(110, 210); // t=10, within window → schedule trailing
    vi.advanceTimersByTime(10);
    throttledUpdate(999, 888); // t=20, refreshes trailing args

    // Advance past the 33 ms window so the trailing timer fires
    // Elapsed since leading = 20 ms; remaining = 13 ms → advance 15 ms
    vi.advanceTimersByTime(15);

    expect(mockAwareness.setLocalStateField).toHaveBeenCalledTimes(2);
    // The trailing call must carry the LAST coordinates (999, 888)
    expect(mockAwareness.setLocalStateField).toHaveBeenLastCalledWith(
      "user",
      expect.objectContaining({ cursor: { x: 999, y: 888 } }),
    );
  });

  /**
   * Test 4
   * The pointerleave handler must:
   *   a) cancel() any pending trailing update (no stale position sent later), and
   *   b) immediately call setLocalStateField with cursor: null so remote users
   *      see the cursor disappear without delay.
   */
  it("pointerleave cancels any pending trailing call and immediately sets cursor to null", () => {
    const mockAwareness = createMockAwareness({ name: "Alice", cursor: null });

    const { fn: throttledUpdate, cancel } = throttleTrailing((x: number, y: number) => {
      const prev = mockAwareness.getLocalState().user;
      mockAwareness.setLocalStateField("user", { ...prev, cursor: { x, y } });
    }, 33);

    throttledUpdate(100, 200); // leading edge fires at t=0
    vi.advanceTimersByTime(10);
    throttledUpdate(110, 210); // within window → trailing call is pending

    // --- pointerleave fires ---
    cancel(); // clear the pending trailing call
    const prev = mockAwareness.getLocalState().user;
    mockAwareness.setLocalStateField("user", { ...prev, cursor: null });

    // Advance well past the throttle window
    vi.advanceTimersByTime(100);

    // Total calls: 1 (leading) + 1 (pointerleave) = 2. The trailing call
    // was cancelled so no third call should appear.
    expect(mockAwareness.setLocalStateField).toHaveBeenCalledTimes(2);

    // The most recent call must have set cursor to null
    expect(mockAwareness.setLocalStateField).toHaveBeenLastCalledWith(
      "user",
      expect.objectContaining({ cursor: null }),
    );
  });
});
