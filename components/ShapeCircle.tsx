"use client";

import { memo, useCallback, useRef } from "react";
import type { CircleLayer } from "@/lib/yjs-store";
import { sharedLayers } from "@/lib/yjs-store";
import { cn } from "@/lib/utils";
import styles from "./ShapeCircle.module.css";

const MIN_SIZE = 40;

type ResizeHandle = "nw" | "ne" | "sw" | "se";

interface ShapeCircleProps {
  id: string;
  layer: CircleLayer;
  selected: boolean;
  onSelect: (shiftKey: boolean) => void;
  onDragStart: () => void;
  onDragDelta: (dx: number, dy: number) => void;
  onDragEnd: () => void;
  screenToWorld: (sx: number, sy: number) => { x: number; y: number };
  getScreenPos: (e: { clientX: number; clientY: number }) => { sx: number; sy: number } | null;
}

function ShapeCircleInner({
  id,
  layer,
  selected,
  onSelect,
  onDragStart,
  onDragDelta,
  onDragEnd,
  screenToWorld,
  getScreenPos,
}: ShapeCircleProps) {
  const { x, y, width, height, fill = "#86efac" } = layer;
  const dragStartRef = useRef<{ startWorldX: number; startWorldY: number } | null>(null);
  const resizeStartRef = useRef<{
    handle: ResizeHandle;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    startPosX: number;
    startPosY: number;
  } | null>(null);
  const shiftRef = useRef(false);

  const updateSize = useCallback(
    (newX: number, newY: number, newWidth: number, newHeight: number) => {
      const current = sharedLayers.get(id) as CircleLayer | undefined;
      if (current?.type === "circle") {
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

      const { handle, startX, startY, startWidth, startHeight, startPosX, startPosY } =
        resizeStartRef.current;
      const dx = world.x - startX;
      const dy = world.y - startY;

      let newX = startPosX;
      let newY = startPosY;
      let newWidth = startWidth;
      let newHeight = startHeight;

      if (handle === "se") {
        newWidth = Math.max(MIN_SIZE, startWidth + dx);
        newHeight = Math.max(MIN_SIZE, startHeight + dy);
      } else if (handle === "sw") {
        newWidth = Math.max(MIN_SIZE, startWidth - dx);
        newHeight = Math.max(MIN_SIZE, startHeight + dy);
        newX = startPosX + (startWidth - newWidth);
      } else if (handle === "ne") {
        newWidth = Math.max(MIN_SIZE, startWidth + dx);
        newHeight = Math.max(MIN_SIZE, startHeight - dy);
        newY = startPosY + (startHeight - newHeight);
      } else if (handle === "nw") {
        newWidth = Math.max(MIN_SIZE, startWidth - dx);
        newHeight = Math.max(MIN_SIZE, startHeight - dy);
        newX = startPosX + (startWidth - newWidth);
        newY = startPosY + (startHeight - newHeight);
      }

      // Shift key → constrain to 1:1 aspect ratio
      if (shiftRef.current) {
        const side = Math.max(newWidth, newHeight);
        const dw = side - newWidth;
        const dh = side - newHeight;
        newWidth = side;
        newHeight = side;
        if (handle === "sw") newX -= dw;
        else if (handle === "ne") newY -= dh;
        else if (handle === "nw") {
          newX -= dw;
          newY -= dh;
        }
      }

      updateSize(newX, newY, newWidth, newHeight);
    },
    [updateSize, screenToWorld, getScreenPos]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      onSelect(e.shiftKey);
      if (e.button === 0) {
        const pos = getScreenPos(e);
        if (!pos) return;
        const world = screenToWorld(pos.sx, pos.sy);
        dragStartRef.current = { startWorldX: world.x, startWorldY: world.y };
        onDragStart();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }
    },
    [onSelect, onDragStart, getScreenPos, screenToWorld]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      shiftRef.current = e.shiftKey;
      if (resizeStartRef.current) {
        handleResizePointerMove(e);
      } else if (dragStartRef.current) {
        const pos = getScreenPos(e);
        if (!pos) return;
        const world = screenToWorld(pos.sx, pos.sy);
        onDragDelta(
          world.x - dragStartRef.current.startWorldX,
          world.y - dragStartRef.current.startWorldY
        );
      }
    },
    [handleResizePointerMove, onDragDelta, screenToWorld, getScreenPos]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (e.button === 0) {
        dragStartRef.current = null;
        resizeStartRef.current = null;
        shiftRef.current = false;
        onDragEnd();
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      }
    },
    [onDragEnd]
  );

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent, handle: ResizeHandle) => {
      e.stopPropagation();
      onSelect(e.shiftKey);
      if (e.button === 0) {
        const pos = getScreenPos(e);
        if (!pos) return;
        const world = screenToWorld(pos.sx, pos.sy);
        shiftRef.current = e.shiftKey;
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
      className={cn(styles.circle, selected && styles.circleSelected)}
      style={{ left: x, top: y, width, height, backgroundColor: fill }}
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

export const ShapeCircle = memo(ShapeCircleInner);
