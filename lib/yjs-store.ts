import * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import { SupabaseYjsProvider } from "./supabase-yjs-provider";
import type { ConnectionStatus } from "./supabase-yjs-provider";
import { supabase } from "./supabase";

// ----- Shared types (safe on server and client) -----
export type StickyLayer = {
  type: "sticky";
  x: number;
  y: number;
  width?: number;
  height?: number;
  text: string;
  fontSize?: number;
  bgColor?: string;
  rotation?: number;
};

export type RectangleLayer = {
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  rotation?: number;
};

export type CircleLayer = {
  type: "circle";
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  rotation?: number;
};

export type TextLayer = {
  type: "text";
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontSize: number;
  fontWeight: string;
  color: string;
};

export type LineLayer = {
  type: "line";
  x: number;
  y: number;
  points: [number, number][];
  color: string;
  thickness: number;
  variant: "straight" | "arrow";
};

export type ConnectorLayer = {
  type: "connector";
  fromId: string;
  toId: string;
  label?: string;
  style: "straight" | "curved" | "elbow";
  stroke: {
    color: string;
    width: number;
    dashArray?: string;
  };
  endpoints: "none" | "arrow" | "dot";
};

export type FrameLayer = {
  type: "frame";
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  backgroundColor: string;
};

export type LayerData =
  | StickyLayer
  | RectangleLayer
  | CircleLayer
  | TextLayer
  | LineLayer
  | ConnectorLayer
  | FrameLayer;

// ----- Per-board state (client only) -----
type BoardState = {
  ydoc: Y.Doc;
  provider: SupabaseYjsProvider;
  sharedLayers: Y.Map<LayerData>;
};

/**
 * Module-level singleton — one entry per active board.
 * Only ensurePersistence() adds entries; accessors are read-only.
 */
const boardStore = new Map<string, BoardState>();

/**
 * Tracks boardIds whose providers are currently mid-destroy (i.e. the
 * async saveToDb() is still running).  getOrCreateBoardState() will not
 * spawn a new provider for these IDs until destroy() resolves, preventing
 * duplicate providers during rapid unmount / remount (Bug §16.13).
 */
const pendingDestroys = new Set<string>();

/**
 * Internal — the only path that creates a new BoardState entry.
 * Returns null if:
 *   • called on the server (typeof window === "undefined"), or
 *   • a destroy() is still in-flight for boardId (pendingDestroys guard).
 */
function getOrCreateBoardState(boardId: string): BoardState | null {
  if (typeof window === "undefined") return null;

  // Block creation while the previous provider for this boardId is still
  // completing its async final DB save. Prevents a duplicate active provider.
  if (pendingDestroys.has(boardId)) return null;

  let state = boardStore.get(boardId);
  if (!state) {
    const ydoc = new Y.Doc();
    const sharedLayers = ydoc.getMap<LayerData>("layers");
    const provider = new SupabaseYjsProvider(ydoc, supabase, {
      roomId: boardId,
      tableName: "yjs_updates",
      columnName: "content",
      roomColumn: "room_id",
      saveInterval: 5_000,
    });
    state = { ydoc, provider, sharedLayers };
    boardStore.set(boardId, state);
  }
  return state;
}

// ─── Public initialisation ───────────────────────────────────────────────────

/**
 * Call when mounting a board route.  This is the ONLY function that triggers
 * provider creation; all other accessors below are strictly read-only.
 *
 * Moving creation responsibility here (rather than inside getSharedLayers)
 * eliminates the "stale-closure silent re-init" bug: a shape-component
 * handler that captured an old boardId can no longer accidentally resurrect
 * a destroyed provider.
 */
export function ensurePersistence(boardId: string): void {
  if (typeof window === "undefined") return;
  getOrCreateBoardState(boardId);
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

/**
 * Destroy the provider and remove board state (call when leaving a board).
 *
 * Fix for Bug §16.13 — the previous implementation called boardStore.delete()
 * and then awaited provider.destroy() with nothing in between.  Any call to
 * getOrCreateBoardState() inside that async window would find no entry in the
 * map and spawn a second live provider for the same boardId.
 *
 * The fix adds boardId to pendingDestroys immediately after removing it from
 * the map.  getOrCreateBoardState() treats a pending-destroy boardId as
 * "not available" and returns null instead of creating a duplicate.
 */
export async function destroyProvider(boardId: string): Promise<void> {
  const state = boardStore.get(boardId);
  if (!state) return;

  // Remove from the live map first so all read-only accessors immediately
  // return null — important for the stale-closure safety guarantee.
  boardStore.delete(boardId);

  // Guard the async window: block getOrCreateBoardState() until the final
  // DB save completes so no duplicate provider can be spawned.
  pendingDestroys.add(boardId);
  try {
    await state.provider.destroy();
  } finally {
    pendingDestroys.delete(boardId);
  }
}

// ─── Read-only accessors ─────────────────────────────────────────────────────
//
// These functions NEVER call getOrCreateBoardState().  They read directly from
// boardStore and return null if the board has not been initialised (via
// ensurePersistence) or has already been destroyed.
//
// This is the key safeguard against the stale-closure bug: a shape component
// (FrameElement, StickyNote, …) that captured boardId in an event-handler
// closure and fires after the user navigated to a different board will get
// null back rather than a freshly-leaked provider with no owner.

export function getSharedLayers(boardId: string | null): Y.Map<LayerData> | null {
  if (!boardId || typeof window === "undefined") return null;
  return boardStore.get(boardId)?.sharedLayers ?? null;
}

export function getYdoc(boardId: string | null): Y.Doc | null {
  if (!boardId || typeof window === "undefined") return null;
  return boardStore.get(boardId)?.ydoc ?? null;
}

export function getProvider(boardId: string | null): SupabaseYjsProvider | null {
  if (!boardId || typeof window === "undefined") return null;
  return boardStore.get(boardId)?.provider ?? null;
}

export function getAwareness(boardId: string | null): Awareness | null {
  if (!boardId || typeof window === "undefined") return null;
  return boardStore.get(boardId)?.provider.awareness ?? null;
}

export function setConnectionStatusCallback(
  boardId: string | null,
  cb: ((status: ConnectionStatus) => void) | null
): void {
  if (!boardId || typeof window === "undefined") return;
  boardStore.get(boardId)?.provider.setStatusCallback(cb ?? null);
}

export type { ConnectionStatus };
