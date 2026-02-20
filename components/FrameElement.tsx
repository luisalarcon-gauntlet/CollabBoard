"use client";

import { useCallback, useRef, useState } from "react";
import type { FrameLayer } from "@/lib/yjs-store";
import { sharedLayers } from "@/lib/yjs-store";
import { cn } from "@/lib/utils";
import styles from "./FrameElement.module.css";

const MIN_WIDTH = 200;
const MIN_HEIGHT = 150;
const TITLE_HEIGHT = 28;

type ResizeHandle = "nw" | "ne" | "sw" | "se";

interface FrameElementProps {
  id: string;
  layer: FrameLayer;
  selected: boolean;
  onSelect: (shiftKey: boolean) => void;
  onDragStart: () => void;
  onDragDelta: (dx: number, dy: number) => void;
  onDragEnd: () => void;
  screenToWorld: (sx: number, sy: number) => { x: number; y: number };
  getScreenPos: (e: { clientX: number; clientY: number }) => { sx: number; sy: number } | null;
}

export const FRAME_TITLE_HEIGHT = TITLE_HEIGHT;

export function FrameElement({
  id,
  layer,
  selected,
  onSelect,
  onDragStart,
  onDragDelta,
  onDragEnd,
  screenToWorld,
  getScreenPos,
}: FrameElementProps) {
  const { x, y, width, height, title, backgroundColor } = layer;
  const [editingTitle, setEditingTitle] = useState(false);

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

  const updateFrame = useCallback(
    (newX: number, newY: number, newWidth: number, newHeight: number) => {
      const current = sharedLayers.get(id) as FrameLayer | undefined;
      if (current?.type === "frame") {
        sharedLayers.set(id, { ...current, x: newX, y: newY, width: newWidth, height: newHeight });
      }
    },
    [id],
  );

  const handleTitleChange = useCallback(
    (newTitle: string) => {
      const current = sharedLayers.get(id) as FrameLayer | undefined;
      if (current?.type === "frame") {
        sharedLayers.set(id, { ...current, title: newTitle });
      }
    },
    [id],
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
    [onSelect, onDragStart, getScreenPos, screenToWorld],
  );

  const handleResizeMove = useCallback(
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

      updateFrame(newX, newY, newWidth, newHeight);
    },
    [updateFrame, screenToWorld, getScreenPos],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (resizeStartRef.current) {
        handleResizeMove(e);
      } else if (dragStartRef.current) {
        const pos = getScreenPos(e);
        if (!pos) return;
        const world = screenToWorld(pos.sx, pos.sy);
        onDragDelta(
          world.x - dragStartRef.current.startWorldX,
          world.y - dragStartRef.current.startWorldY,
        );
      }
    },
    [handleResizeMove, onDragDelta, screenToWorld, getScreenPos],
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
    [onDragEnd],
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
    [x, y, width, height, onSelect, getScreenPos, screenToWorld],
  );

  return (
    <div
      className={styles.frameContainer}
      style={{ left: x, top: y - TITLE_HEIGHT, width, height: height + TITLE_HEIGHT }}
    >
      {/* Title bar — draggable, sits above the frame rectangle */}
      <div
        className={cn(styles.titleBar, selected && styles.titleBarSelected)}
        style={{ height: TITLE_HEIGHT, pointerEvents: "auto" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {editingTitle ? (
          <input
            autoFocus
            className={styles.titleInput}
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            onBlur={() => setEditingTitle(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") setEditingTitle(false);
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className={styles.titleText}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditingTitle(true);
            }}
          >
            {title || "Frame"}
          </span>
        )}
      </div>

      {/* Frame body */}
      <div
        className={cn(styles.frameBody, selected && styles.frameBodySelected)}
        style={{ width, height, backgroundColor }}
      >
        {/* Draggable edges (pointer-events: auto individually) — background is none */}
        <div
          className={styles.edgeTop}
          style={{ pointerEvents: "auto" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
        <div
          className={styles.edgeBottom}
          style={{ pointerEvents: "auto" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
        <div
          className={styles.edgeLeft}
          style={{ pointerEvents: "auto" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
        <div
          className={styles.edgeRight}
          style={{ pointerEvents: "auto" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      </div>

      {/* Resize handles — positioned relative to frame body, offset by TITLE_HEIGHT */}
      {selected && (
        <>
          <div
            className={`${styles.resizeHandle} ${styles.handleNW}`}
            style={{ top: TITLE_HEIGHT - 6, pointerEvents: "auto" }}
            onPointerDown={(e) => handleResizePointerDown(e, "nw")}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
          <div
            className={`${styles.resizeHandle} ${styles.handleNE}`}
            style={{ top: TITLE_HEIGHT - 6, pointerEvents: "auto" }}
            onPointerDown={(e) => handleResizePointerDown(e, "ne")}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
          <div
            className={`${styles.resizeHandle} ${styles.handleSW}`}
            style={{ pointerEvents: "auto" }}
            onPointerDown={(e) => handleResizePointerDown(e, "sw")}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
          <div
            className={`${styles.resizeHandle} ${styles.handleSE}`}
            style={{ pointerEvents: "auto" }}
            onPointerDown={(e) => handleResizePointerDown(e, "se")}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
        </>
      )}
    </div>
  );
}
