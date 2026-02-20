import * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import { SupabaseYjsProvider } from "./supabase-yjs-provider";
import { supabase } from "./supabase";

const ROOM_ID = "collab-board-main";

// ----- Y.Doc & shared types (safe on server and client) -----
export const ydoc = new Y.Doc();

export type StickyLayer = {
  type: "sticky";
  x: number;
  y: number;
  width?: number;
  height?: number;
  text: string;
};

export type RectangleLayer = {
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
};

export type CircleLayer = {
  type: "circle";
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
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

/** Points are stored as absolute world-space coordinates [wx, wy][].
 *  x, y mirror the bounding-box top-left so consumers can position the SVG
 *  without iterating points on every render. */
export type LineLayer = {
  type: "line";
  x: number;
  y: number;
  points: [number, number][];
  color: string;
  thickness: number;
  variant: "straight" | "arrow";
};

export type LayerData = StickyLayer | RectangleLayer | CircleLayer | TextLayer | LineLayer;

/** The shared Y.Map that stores all whiteboard layers. */
export const sharedLayers = ydoc.getMap<LayerData>("layers");

// ----- Supabase provider & awareness: create only on the client -----
let providerInstance: SupabaseYjsProvider | null = null;

function getProvider(): SupabaseYjsProvider | null {
  if (typeof window === "undefined") return null;
  if (!providerInstance) {
    providerInstance = new SupabaseYjsProvider(ydoc, supabase, {
      roomId: ROOM_ID,
      tableName: "yjs_updates",
      columnName: "content",
      roomColumn: "room_id",
      saveInterval: 5_000,
    });
  }
  return providerInstance;
}

/** Returns awareness only on the client; null during SSR/build. */
export function getAwareness(): Awareness | null {
  return getProvider()?.awareness ?? null;
}

/** Call when the board is mounted so persistence (load/save) starts immediately. */
export function ensurePersistence(): void {
  getProvider();
}
