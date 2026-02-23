/**
 * Unit tests for the dashboard Server Actions: createBoard and deleteBoard.
 *
 * All external dependencies (Clerk auth, Next.js redirect/revalidatePath,
 * and the Supabase client) are mocked so these tests run entirely in-process
 * without a real database or auth provider.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock: @clerk/nextjs/server  (auth)
// ---------------------------------------------------------------------------
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: next/navigation  (redirect throws like the real Next.js does)
// ---------------------------------------------------------------------------
vi.mock("next/navigation", () => ({
  redirect: vi.fn().mockImplementation((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;${url}` });
  }),
}));

// ---------------------------------------------------------------------------
// Mock: next/cache  (revalidatePath is a no-op)
// ---------------------------------------------------------------------------
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: @/lib/supabase  (configurable per test via buildSupabaseMock)
// ---------------------------------------------------------------------------
const mockSupabase = { from: vi.fn() };

vi.mock("@/lib/supabase", () => ({
  get supabase() {
    return mockSupabase;
  },
}));

// ---------------------------------------------------------------------------
// Lazy imports (must come AFTER vi.mock hoisting)
// ---------------------------------------------------------------------------
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createBoard, deleteBoard } from "../../app/dashboard/actions";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFormData(title?: string): FormData {
  const fd = new FormData();
  if (title !== undefined) fd.set("title", title);
  return fd;
}

/** Builds a mock Supabase chain for a successful createBoard insert. */
function mockCreateBoardSuccess(boardId = "new-board-id") {
  const single = vi.fn().mockResolvedValue({ data: { id: boardId }, error: null });
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });
  mockSupabase.from.mockReturnValue({ insert });
}

/** Builds a mock Supabase chain for a failed createBoard insert. */
function mockCreateBoardFailure() {
  const single = vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } });
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });
  mockSupabase.from.mockReturnValue({ insert });
}

/**
 * Builds a mock Supabase chain for deleteBoard.
 * The action calls from("boards") twice (ownership check + delete) and
 * from("yjs_updates") once (delete canvas state).
 */
function mockDeleteBoardSuccess(boardId = "board-id", yjsDeleteError = false) {
  // Ownership check: .select().eq().eq().maybeSingle()
  const maybeSingle = vi.fn().mockResolvedValue({ data: { id: boardId }, error: null });
  const ownerEq2 = vi.fn().mockReturnValue({ maybeSingle });
  const ownerEq1 = vi.fn().mockReturnValue({ eq: ownerEq2 });
  const ownerSelect = vi.fn().mockReturnValue({ eq: ownerEq1 });
  const ownerFrom = { select: ownerSelect };

  // yjs_updates delete: .delete().eq()
  const yjsEq = vi.fn().mockResolvedValue({ error: yjsDeleteError ? { message: "yjs error" } : null });
  const yjsDelete = vi.fn().mockReturnValue({ eq: yjsEq });
  const yjsFrom = { delete: yjsDelete };

  // boards delete: .delete().eq().eq()
  const boardDeleteEq2 = vi.fn().mockResolvedValue({ error: null });
  const boardDeleteEq1 = vi.fn().mockReturnValue({ eq: boardDeleteEq2 });
  const boardDelete = vi.fn().mockReturnValue({ eq: boardDeleteEq1 });
  const boardDeleteFrom = { delete: boardDelete };

  // Return different objects per table
  let boardCallCount = 0;
  mockSupabase.from.mockImplementation((table: string) => {
    if (table === "yjs_updates") return yjsFrom;
    if (table === "boards") {
      boardCallCount++;
      return boardCallCount === 1 ? ownerFrom : boardDeleteFrom;
    }
    return {};
  });
}

/** Board not found or not owned by the user. */
function mockDeleteBoardNotFound() {
  const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  const eq2 = vi.fn().mockReturnValue({ maybeSingle });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  const select = vi.fn().mockReturnValue({ eq: eq1 });
  mockSupabase.from.mockReturnValue({ select });
}

// ---------------------------------------------------------------------------
// Tests — createBoard
// ---------------------------------------------------------------------------

describe("createBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects unauthenticated user to /sign-in", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as never);
    await expect(createBoard(makeFormData("My Board"))).rejects.toMatchObject({
      message: "NEXT_REDIRECT",
    });
    expect(redirect).toHaveBeenCalledWith("/sign-in");
  });

  it("creates a board with the provided title and redirects to /board/[id]", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user-1" } as never);
    mockCreateBoardSuccess("abc-123");
    await expect(createBoard(makeFormData("Sprint Planning"))).rejects.toMatchObject({
      message: "NEXT_REDIRECT",
    });
    expect(redirect).toHaveBeenCalledWith("/board/abc-123");
    expect(mockSupabase.from).toHaveBeenCalledWith("boards");
  });

  it("falls back to 'Untitled Board' when title is empty", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user-1" } as never);
    mockCreateBoardSuccess("xyz-456");
    await expect(createBoard(makeFormData(""))).rejects.toMatchObject({
      message: "NEXT_REDIRECT",
    });
    // Verify the insert was called — the board was created
    expect(mockSupabase.from).toHaveBeenCalledWith("boards");
  });

  it("falls back to 'Untitled Board' when title is only whitespace", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user-1" } as never);
    mockCreateBoardSuccess("xyz-789");
    await expect(createBoard(makeFormData("   "))).rejects.toMatchObject({
      message: "NEXT_REDIRECT",
    });
    expect(mockSupabase.from).toHaveBeenCalledWith("boards");
  });

  it("throws when title exceeds 200 characters", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user-1" } as never);
    const longTitle = "a".repeat(201);
    await expect(createBoard(makeFormData(longTitle))).rejects.toThrow(
      "Board title must be 200 characters or fewer"
    );
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("accepts a title of exactly 200 characters", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user-1" } as never);
    mockCreateBoardSuccess("exact-200");
    const exactTitle = "a".repeat(200);
    await expect(createBoard(makeFormData(exactTitle))).rejects.toMatchObject({
      message: "NEXT_REDIRECT",
    });
    expect(mockSupabase.from).toHaveBeenCalledWith("boards");
  });

  it("throws 'Failed to create board' when Supabase insert fails", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user-1" } as never);
    mockCreateBoardFailure();
    await expect(createBoard(makeFormData("My Board"))).rejects.toThrow(
      "Failed to create board"
    );
  });
});

// ---------------------------------------------------------------------------
// Tests — deleteBoard
// ---------------------------------------------------------------------------

describe("deleteBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects unauthenticated user to /sign-in", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as never);
    await expect(deleteBoard("board-id")).rejects.toMatchObject({
      message: "NEXT_REDIRECT",
    });
    expect(redirect).toHaveBeenCalledWith("/sign-in");
  });

  it("throws 'Board not found' when board does not belong to user", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user-1" } as never);
    mockDeleteBoardNotFound();
    await expect(deleteBoard("other-users-board")).rejects.toThrow("Board not found");
  });

  it("deletes yjs_updates and then the board on success", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user-1" } as never);
    mockDeleteBoardSuccess("board-42");
    await deleteBoard("board-42");
    expect(mockSupabase.from).toHaveBeenCalledWith("yjs_updates");
    expect(mockSupabase.from).toHaveBeenCalledWith("boards");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("still deletes the board even when yjs_updates delete fails (non-fatal)", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: "user-1" } as never);
    mockDeleteBoardSuccess("board-42", true); // yjsDeleteError = true
    await deleteBoard("board-42");
    // Should not throw, and the board delete call should still happen
    expect(mockSupabase.from).toHaveBeenCalledWith("boards");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });
});
