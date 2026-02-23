"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Read helpers (no auth guard — callers are responsible for authenticating)
// ---------------------------------------------------------------------------

/**
 * Returns all boards owned by the given user, ordered newest-first.
 * Strictly filters by owner_id so each user's dashboard shows only their boards.
 */
export async function fetchUserBoards(userId: string) {
  const { data: boards, error } = await supabase
    .from("boards")
    .select("id, title, created_at")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[fetchUserBoards] Failed to fetch boards:", error.message);
  }
  return boards ?? [];
}

/**
 * Returns a single board by its UUID with NO owner_id filter.
 * This allows any authenticated user to load a board via a shared link.
 * The board UUID itself acts as the access token for the MVP.
 */
export async function fetchBoardById(boardId: string) {
  const { data: board, error } = await supabase
    .from("boards")
    .select("id, owner_id")
    .eq("id", boardId)
    .maybeSingle();

  if (error) {
    console.error("[fetchBoardById] Failed to fetch board:", error.message);
    return null;
  }
  return board;
}

export async function createBoard(formData: FormData) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const raw = (formData.get("title") as string)?.trim() || "Untitled Board";
  if (raw.length > 200) {
    throw new Error("Board title must be 200 characters or fewer");
  }
  const title = raw;

  const { data, error } = await supabase
    .from("boards")
    .insert({ owner_id: userId, title })
    .select("id")
    .single();

  if (error) {
    console.error("[createBoard] Failed to insert:", error.message);
    throw new Error("Failed to create board");
  }

  redirect(`/board/${data.id}`);
}

export async function deleteBoard(boardId: string) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  // Verify ownership before deleting anything
  const { data: board, error: fetchError } = await supabase
    .from("boards")
    .select("id")
    .eq("id", boardId)
    .eq("owner_id", userId)
    .maybeSingle();

  if (fetchError || !board) {
    console.error("[deleteBoard] Board not found or not owned by user");
    throw new Error("Board not found");
  }

  // Delete the Yjs canvas state first so we don't leave orphaned data
  const { error: yjsError } = await supabase
    .from("yjs_updates")
    .delete()
    .eq("room_id", boardId);

  if (yjsError) {
    console.error("[deleteBoard] Failed to delete yjs_updates:", yjsError.message);
    // Non-fatal: proceed with board deletion even if yjs cleanup fails
  }

  const { error, count } = await supabase
    .from("boards")
    .delete({ count: "exact" })
    .eq("id", boardId)
    .eq("owner_id", userId);

  if (error) {
    console.error("[deleteBoard] Failed to delete board:", error.message);
    throw new Error("Failed to delete board");
  }

  if (count === 0) {
    console.error("[deleteBoard] Delete was no-op — RLS may be blocking. Check that anon/authenticated DELETE policy exists on boards table.");
    throw new Error("Failed to delete board");
  }

  revalidatePath("/dashboard");
}
