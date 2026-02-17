"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.15;

export interface BoardTransformValue {
  pan: { x: number; y: number };
  zoom: number;
  setPan: (pan: { x: number; y: number } | ((prev: { x: number; y: number }) => { x: number; y: number })) => void;
  setZoom: (zoom: number | ((prev: number) => number)) => void;
  /** Ref with current pan/zoom for use in event handlers (avoids stale closure) */
  transformRef: React.MutableRefObject<{ pan: { x: number; y: number }; zoom: number }>;
  /** Convert screen position (relative to board container) to world coordinates */
  screenToWorld: (sx: number, sy: number) => { x: number; y: number };
  /** Convert world coordinates to screen position (relative to board container) */
  worldToScreen: (wx: number, wy: number) => { x: number; y: number };
  containerRef: React.RefObject<HTMLDivElement | null>;
}

const BoardTransformContext = createContext<BoardTransformValue | null>(null);

export function BoardTransformProvider({
  children,
}: {
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const transformRef = useRef({ pan, zoom });
  transformRef.current = { pan, zoom };

  const screenToWorld = useCallback(
    (sx: number, sy: number) => ({
      x: (sx - pan.x) / zoom,
      y: (sy - pan.y) / zoom,
    }),
    [pan, zoom]
  );

  const worldToScreen = useCallback(
    (wx: number, wy: number) => ({
      x: pan.x + wx * zoom,
      y: pan.y + wy * zoom,
    }),
    [pan, zoom]
  );

  const value: BoardTransformValue = {
    pan,
    zoom,
    setPan,
    setZoom: (z) => {
      setZoom((prev) => {
        const next = typeof z === "function" ? z(prev) : z;
        return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
      });
    },
    transformRef,
    screenToWorld,
    worldToScreen,
    containerRef,
  };

  return (
    <BoardTransformContext.Provider value={value}>
      {children}
    </BoardTransformContext.Provider>
  );
}

export function useBoardTransform(): BoardTransformValue {
  const ctx = useContext(BoardTransformContext);
  if (!ctx) throw new Error("useBoardTransform must be used within BoardTransformProvider");
  return ctx;
}

export { MIN_ZOOM, MAX_ZOOM, ZOOM_STEP };
