"use client";

import { useCallback, useRef } from "react";
import type { RectangleLayer } from "@/lib/yjs-store";
import { sharedLayers } from "@/lib/yjs-store";
import { cn } from "@/lib/utils";
import styles from "./ShapeRectangle.module.css";

const MIN_WIDTH = 60;
const MIN_HEIGHT = 60;

type ResizeHandle = "nw" | "ne" | "sw" | "se";

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
  const resizeStartRef = useRef<{ handle: ResizeHandle; startX: number; startY: number; startWidth: number; startHeight: number; startPosX: number; startPosY: number } | null>(null);

  const updatePos = useCallback(
    (wx: number, wy: number) => {
      const current = sharedLayers.get(id) as RectangleLayer | undefined;
      if (current?.type === "rectangle") {
        sharedLayers.set(id, { ...current, x: wx, y: wy });
      }
    },
    [id]
  );

  const updateSize = useCallback(
    (newX: number, newY: number, newWidth: number, newHeight: number) => {
      const current = sharedLayers.get(id) as RectangleLayer | undefined;
      if (current?.type === "rectangle") {
        sharedLayers.set(id, { ...current, x: newX, y: newY, width: newWidth, height: newHeight });
      }
    },
    [id]
  );

  const handleResizePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!resizeStartRef.current) return;
      const pos = getScreenPos(e);
      if (!pos) return;
      const world = screenToWorld(pos.sx, pos.sy);
      
      const { handle, startX, startY, startWidth, startHeight, startPosX, startPosY } = resizeStartRef.current;
      const dx = world.x - startX;
      const dy = world.y - startY;

      let newX = startPosX;
      let newY = startPosY;
      let newWidth = startWidth;
      let newHeight = startHeight;

      if (handle === "se") {
        newWidth = Math.max(MIN_WIDTH, startWidth + dx);
        newHeight = Math.max(MIN_HEIGHT, startHeight + dy);
      } else if (handle === "sw") {
        newWidth = Math.max(MIN_WIDTH, startWidth - dx);
        newHeight = Math.max(MIN_HEIGHT, startHeight + dy);
        newX = startPosX + (startWidth - newWidth);
      } else if (handle === "ne") {
        newWidth = Math.max(MIN_WIDTH, startWidth + dx);
        newHeight = Math.max(MIN_HEIGHT, startHeight - dy);
        newY = startPosY + (startHeight - newHeight);
      } else if (handle === "nw") {
        newWidth = Math.max(MIN_WIDTH, startWidth - dx);
        newHeight = Math.max(MIN_HEIGHT, startHeight - dy);
        newX = startPosX + (startWidth - newWidth);
        newY = startPosY + (startHeight - newHeight);
      }

      updateSize(newX, newY, newWidth, newHeight);
    },
    [updateSize, screenToWorld, getScreenPos]
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
      if (resizeStartRef.current) {
        handleResizePointerMove(e);
      } else if (dragStartRef.current) {
        const pos = getScreenPos(e);
        if (!pos) return;
        const world = screenToWorld(pos.sx, pos.sy);
        updatePos(world.x + dragStartRef.current.offsetWx, world.y + dragStartRef.current.offsetWy);
      }
    },
    [updatePos, handleResizePointerMove, screenToWorld, getScreenPos]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (e.button === 0) {
      dragStartRef.current = null;
      resizeStartRef.current = null;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    }
  }, []);

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent, handle: ResizeHandle) => {
      e.stopPropagation();
      onSelect();
      if (e.button === 0) {
        const pos = getScreenPos(e);
        if (!pos) return;
        const world = screenToWorld(pos.sx, pos.sy);
        resizeStartRef.current = {
          handle,
          startX: world.x,
          startY: world.y,
          startWidth: width,
          startHeight: height,
          startPosX: x,
          startPosY: y,
        };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }
    },
    [x, y, width, height, onSelect, getScreenPos, screenToWorld]
  );

  return (
    <div
      className={cn(
        styles.rectangle,
        selected && styles.rectangleSelected
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
    >
      {selected && (
        <>
          <div
            className={`${styles.resizeHandle} ${styles.handleNW}`}
            onPointerDown={(e) => handleResizePointerDown(e, "nw")}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handlePointerUp}
          />
          <div
            className={`${styles.resizeHandle} ${styles.handleNE}`}
            onPointerDown={(e) => handleResizePointerDown(e, "ne")}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handlePointerUp}
          />
          <div
            className={`${styles.resizeHandle} ${styles.handleSW}`}
            onPointerDown={(e) => handleResizePointerDown(e, "sw")}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handlePointerUp}
          />
          <div
            className={`${styles.resizeHandle} ${styles.handleSE}`}
            onPointerDown={(e) => handleResizePointerDown(e, "se")}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handlePointerUp}
          />
        </>
      )}
    </div>
  );
}
