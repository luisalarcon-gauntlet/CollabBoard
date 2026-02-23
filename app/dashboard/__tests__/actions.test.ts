/**
 * Unit tests for board-fetching server actions.
 *
 * Covers:
 *   1. fetchUserBoards  — MUST filter by owner_id so users only see their own boards.
 *   2. fetchBoardById   — MUST NOT filter by owner_id so any authenticated user can
 *                         open a board via a shared link (UUID-based access).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoist Supabase chain mocks so they are available inside vi.mock factories
// ---------------------------------------------------------------------------

const { mockMaybeSingle, mockOrder, mockEq, mockSelect, mockFrom } = vi.hoisted(() => {
  const mockMaybeSingle = vi.fn();
  const mockOrder       = vi.fn();
  const mockEq          = vi.fn();
  const mockSelect      = vi.fn();
  const mockFrom        = vi.fn();
  return { mockMaybeSingle, mockOrder, mockEq, mockSelect, mockFrom };
});

// ---------------------------------------------------------------------------
// Module mocks (must be declared before any imports that use them)
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase", () => ({
  supabase: { from: mockFrom },
}));

vi.mock("next/navigation", () => ({
  redirect:  vi.fn(),
  notFound:  vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({ userId: "clerk-user-abc" }),
}));

// ---------------------------------------------------------------------------
// Import the functions under test AFTER mocks are set up
// ---------------------------------------------------------------------------

import { fetchUserBoards, fetchBoardById } from "../actions";

// ---------------------------------------------------------------------------
// Shared setup: reset mocks and rebuild the chainable query object each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // Build the chainable object that every Supabase query step returns.
  // Re-built each test so mockReturnValue state is clean.
  const chainable = {
    eq:          mockEq,
    order:       mockOrder,
    maybeSingle: mockMaybeSingle,
  };

  mockEq.mockReturnValue(chainable);
  mockSelect.mockReturnValue(chainable);
  mockFrom.mockReturnValue({ select: mockSelect });
});

// ---------------------------------------------------------------------------
// fetchUserBoards
// ---------------------------------------------------------------------------

describe("fetchUserBoards", () => {
  it("filters the query strictly by owner_id so users only see their own boards", async () => {
    mockOrder.mockResolvedValueOnce({
      data: [
        { id: "board-1", title: "My Board", created_at: "2025-01-01T00:00:00.000Z" },
      ],
      error: null,
    });

    const result = await fetchUserBoards("owner-xyz");

    // The owner_id filter must be applied
    expect(mockEq).toHaveBeenCalledWith("owner_id", "owner-xyz");
    // Data is returned correctly
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("board-1");
  });

  it("returns an empty array when the user has no boards", async () => {
    mockOrder.mockResolvedValueOnce({ data: [], error: null });

    const result = await fetchUserBoards("owner-no-boards");

    expect(mockEq).toHaveBeenCalledWith("owner_id", "owner-no-boards");
    expect(result).toEqual([]);
  });

  it("returns an empty array and does not throw when Supabase returns an error", async () => {
    mockOrder.mockResolvedValueOnce({ data: null, error: { message: "DB error" } });

    const result = await fetchUserBoards("owner-error");

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// fetchBoardById
// ---------------------------------------------------------------------------

describe("fetchBoardById", () => {
  it("fetches the board by ID only — without an owner_id filter — so a guest with a shared link can load it", async () => {
    // Simulate a board owned by a DIFFERENT user than the current viewer
    mockMaybeSingle.mockResolvedValueOnce({
      data: { id: "board-shared-123", owner_id: "original-owner" },
      error: null,
    });

    const result = await fetchBoardById("board-shared-123");

    // Must query by board ID
    expect(mockEq).toHaveBeenCalledWith("id", "board-shared-123");

    // Must NOT add an owner_id restriction — any authenticated user can open it
    expect(mockEq).not.toHaveBeenCalledWith("owner_id", expect.anything());

    // Board data is returned regardless of who owns it
    expect(result?.id).toBe("board-shared-123");
    expect(result?.owner_id).toBe("original-owner");
  });

  it("returns null when no board with the given ID exists", async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const result = await fetchBoardById("board-ghost");

    expect(result).toBeNull();
  });

  it("returns null when Supabase returns an error", async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: { message: "not found" } });

    const result = await fetchBoardById("board-broken");

    expect(result).toBeNull();
  });
});
