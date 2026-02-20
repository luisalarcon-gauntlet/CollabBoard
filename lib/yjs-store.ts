import * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import { SupabaseYjsProvider } from "./supabase-yjs-provider";
import type { ConnectionStatus } from "./supabase-yjs-provider";
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
  fontSize?: number;  // font size for the note text (default: 14)
  bgColor?: string;   // background color (default: #fffbeb)
  rotation?: number;  // degrees, clockwise (default: 0)
};

export type RectangleLayer = {
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  rotation?: number;  // degrees, clockwise (default: 0)
};

export type CircleLayer = {
  type: "circle";
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  rotation?: number;  // degrees, clockwise (default: 0)
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

/**
 * Smart Connector — a managed edge between two named layers.
 * Endpoints are always recalculated from the source/target bounding boxes,
 * so the connector updates live when either object is moved or resized.
 */
export type ConnectorLayer = {
  type: "connector";
  /** ID of the source layer. */
  fromId: string;
  /** ID of the target layer. */
  toId: string;
  /** Optional text label rendered at the midpoint. */
  label?: string;
  /** Visual routing style. */
  style: "straight" | "curved" | "elbow";
  stroke: {
    color: string;
    width: number;
    /** SVG stroke-dasharray value, e.g. "6,3" (dashed) or "2,4" (dotted). Omit for solid. */
    dashArray?: string;
  };
  /** Decoration applied to the target endpoint. */
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

/**
 * Register a callback that fires whenever the Realtime connection status changes.
 * Pass `null` to unregister. Safe to call from a React effect — the provider
 * stores only the latest reference so there are no memory leaks or stale closures.
 */
export function setConnectionStatusCallback(
  cb: ((status: ConnectionStatus) => void) | null
): void {
  getProvider()?.setStatusCallback(cb ?? null);
}

export type { ConnectionStatus };
