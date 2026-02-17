"use client";

import { useCallback, useRef } from "react";
import type { RectangleLayer } from "@/lib/yjs-store";
import { sharedLayers } from "@/lib/yjs-store";
import { cn } from "@/lib/utils";

interface ShapeRectangleProps {
  id: string;
  layer: RectangleLayer;
  selected: boolean;
  onSelect: () => void;
  screenToWorld: (sx: number, sy: number) => { x: number; y: number };
  getScreenPos: (e: { clientX: number; clientY: number }) => { sx: number; sy: number } | null;
}

export function ShapeRectangle({ id, layer, selected, onSelect, screenToWorld, getScreenPos }: ShapeRectangleProps) {
  const { x, y, width, height, fill = "#93c5fd" } = layer;
  const dragStartRef = useRef<{ offsetWx: number; offsetWy: number } | null>(null);

  const updatePos = useCallback(
    (wx: number, wy: number) => {
      const current = sharedLayers.get(id) as RectangleLayer | undefined;
      if (current?.type === "rectangle") {
        sharedLayers.set(id, { ...current, x: wx, y: wy });
      }
    },
    [id]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      onSelect();
      if (e.button === 0) {
        const pos = getScreenPos(e);
        if (!pos) return;
        const world = screenToWorld(pos.sx, pos.sy);
        dragStartRef.current = {
          offsetWx: layer.x - world.x,
          offsetWy: layer.y - world.y,
        };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }
    },
    [layer.x, layer.y, onSelect, getScreenPos, screenToWorld]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragStartRef.current) return;
      const pos = getScreenPos(e);
      if (!pos) return;
      const world = screenToWorld(pos.sx, pos.sy);
      updatePos(world.x + dragStartRef.current.offsetWx, world.y + dragStartRef.current.offsetWy);
    },
    [updatePos, screenToWorld, getScreenPos]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (e.button === 0) {
      dragStartRef.current = null;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    }
  }, []);

  return (
    <div
      className={cn(
        "absolute cursor-grab border-2 border-blue-700/50 active:cursor-grabbing pointer-events-auto",
        selected && "ring-2 ring-blue-500"
      )}
      style={{
        left: x,
        top: y,
        width,
        height,
        backgroundColor: fill,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    />
  );
}
