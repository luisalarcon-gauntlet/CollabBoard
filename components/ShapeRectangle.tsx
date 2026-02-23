"use client";

import { useCallback, useRef } from "react";
import { RotateCw } from "lucide-react";
import type { RectangleLayer } from "@/lib/yjs-store";
import { getSharedLayers, getYdoc } from "@/lib/yjs-store";
import { cn } from "@/lib/utils";
import styles from "./ShapeRectangle.module.css";

const MIN_WIDTH = 60;
const MIN_HEIGHT = 60;

type ResizeHandle = "nw" | "ne" | "sw" | "se";

interface ShapeRectangleProps {
  boardId: string;
  id: string;
  layer: RectangleLayer;
  selected: boolean;
  onSelect: (shiftKey: boolean) => void;
  onDragStart: () => void;
  onDragDelta: (dx: number, dy: number) => void;
  onDragEnd: () => void;
  screenToWorld: (sx: number, sy: number) => { x: number; y: number };
  getScreenPos: (e: { clientX: number; clientY: number }) => { sx: number; sy: number } | null;
}

export function ShapeRectangle({
  boardId,
  id,
  layer,
  selected,
  onSelect,
  onDragStart,
  onDragDelta,
  onDragEnd,
  screenToWorld,
  getScreenPos,
}: ShapeRectangleProps) {
  const { x, y, width, height, fill = "#93c5fd", rotation = 0 } = layer;
  const dragStartRef = useRef<{ startWorldX: number; startWorldY: number } | null>(null);
  const rotateStartRef = useRef<{ startAngle: number; startRotation: number } | null>(null);
  const resizeStartRef = useRef<{
    handle: ResizeHandle;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    startPosX: number;
    startPosY: number;
  } | null>(null);

  const updateSize = useCallback(
    (newX: number, newY: number, newWidth: number, newHeight: number) => {
      const sharedLayers = getSharedLayers(boardId);
      if (!sharedLayers) return;
      const current = sharedLayers.get(id) as RectangleLayer | undefined;
      if (current?.type === "rectangle") {
        sharedLayers.set(id, { ...current, x: newX, y: newY, width: newWidth, height: newHeight });
      }
    },
    [boardId, id]
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

  const handleRotatePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (e.button !== 0) return;
      const pos = getScreenPos(e);
      if (!pos) return;
      const world = screenToWorld(pos.sx, pos.sy);
      const cx = x + width / 2;
      const cy = y + height / 2;
      const startAngle = Math.atan2(world.y - cy, world.x - cx) * (180 / Math.PI);
      rotateStartRef.current = { startAngle, startRotation: rotation };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [x, y, width, height, rotation, getScreenPos, screenToWorld]
  );

  const handleRotatePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!rotateStartRef.current) return;
      const pos = getScreenPos(e);
      if (!pos) return;
      const world = screenToWorld(pos.sx, pos.sy);
      const cx = x + width / 2;
      const cy = y + height / 2;
      const currentAngle = Math.atan2(world.y - cy, world.x - cx) * (180 / Math.PI);
      const newRotation = rotateStartRef.current.startRotation + (currentAngle - rotateStartRef.current.startAngle);
      const ydoc = getYdoc(boardId);
      const sharedLayers = getSharedLayers(boardId);
      if (ydoc && sharedLayers) {
        ydoc.transact(() => {
          const current = sharedLayers.get(id) as RectangleLayer | undefined;
          if (current?.type === "rectangle") {
            sharedLayers.set(id, { ...current, rotation: newRotation });
          }
        });
      }
    },
    [boardId, id, x, y, width, height, getScreenPos, screenToWorld]
  );

  const handleRotatePointerUp = useCallback(
    (e: React.PointerEvent) => {
      rotateStartRef.current = null;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    },
    []
  );

  return (
    <div
      className={cn(styles.rectangle, selected && styles.rectangleSelected)}
      style={{
        left: x,
        top: y,
        width,
        height,
        backgroundColor: fill,
        transform: `rotate(${rotation}deg)`,
        transformOrigin: "center",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {selected && (
        <>
          <div className={styles.rotationHandleWrapper}>
            <div
              className={styles.rotationHandleBtn}
              onPointerDown={handleRotatePointerDown}
              onPointerMove={handleRotatePointerMove}
              onPointerUp={handleRotatePointerUp}
            >
              <RotateCw size={10} />
            </div>
            <div className={styles.rotationHandleConnector} />
          </div>
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
