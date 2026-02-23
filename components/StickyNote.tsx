"use client";

import { useCallback, useRef, useState } from "react";
import { RotateCw } from "lucide-react";
import type { StickyLayer } from "@/lib/yjs-store";
import { getSharedLayers, getYdoc } from "@/lib/yjs-store";
import { cn } from "@/lib/utils";
import styles from "./StickyNote.module.css";

const MIN_WIDTH = 80;
const MIN_HEIGHT = 60;
const DEFAULT_WIDTH = 200;
const DEFAULT_HEIGHT = 150;

type ResizeHandle = "nw" | "ne" | "sw" | "se";

interface StickyNoteProps {
  boardId: string;
  id: string;
  layer: StickyLayer;
  selected: boolean;
  onSelect: (shiftKey: boolean) => void;
  onDragStart: () => void;
  onDragDelta: (dx: number, dy: number) => void;
  onDragEnd: () => void;
  screenToWorld: (sx: number, sy: number) => { x: number; y: number };
  getScreenPos: (e: { clientX: number; clientY: number }) => { sx: number; sy: number } | null;
}

export function StickyNote({
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
}: StickyNoteProps) {
  const {
    x,
    y,
    text,
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    fontSize = 14,
    bgColor = "#fffbeb",
    rotation = 0,
  } = layer;
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(text);

  // Body drag: stores world-space position at drag start
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
      const current = sharedLayers.get(id) as StickyLayer | undefined;
      if (current?.type === "sticky") {
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
      // While editing, let the textarea handle its own pointer events
      if (isEditing) return;
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
    [isEditing, onSelect, onDragStart, getScreenPos, screenToWorld]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (resizeStartRef.current) {
        handleResizePointerMove(e);
      } else if (dragStartRef.current) {
        const pos = getScreenPos(e);
        if (!pos) return;
        const world = screenToWorld(pos.sx, pos.sy);
        const dx = world.x - dragStartRef.current.startWorldX;
        const dy = world.y - dragStartRef.current.startWorldY;
        onDragDelta(dx, dy);
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
          const current = sharedLayers.get(id) as StickyLayer | undefined;
          if (current?.type === "sticky") {
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

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsEditing(true);
      setEditValue(layer.text);
    },
    [layer.text]
  );

  const commitText = useCallback(() => {
    setIsEditing(false);
    const sharedLayers = getSharedLayers(boardId);
    if (!sharedLayers) return;
    const current = sharedLayers.get(id) as StickyLayer | undefined;
    if (current?.type === "sticky" && editValue.trim() !== current.text) {
      sharedLayers.set(id, { ...current, text: editValue.trim() || "New note" });
    } else {
      setEditValue(layer.text);
    }
  }, [boardId, id, editValue, layer.text]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        commitText();
      }
      if (e.key === "Escape") {
        setEditValue(layer.text);
        setIsEditing(false);
      }
    },
    [commitText, layer.text]
  );

  return (
    <div
      className={cn(styles.stickyNote, selected && styles.stickyNoteSelected)}
      style={{
        left: x,
        top: y,
        width,
        height,
        backgroundColor: bgColor,
        transform: `rotate(${rotation}deg)`,
        transformOrigin: "center",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onDoubleClick={handleDoubleClick}
    >
      {isEditing ? (
        <textarea
          className={styles.textArea}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitText}
          onKeyDown={handleKeyDown}
          autoFocus
          style={{ width: "100%", height: "100%", fontSize }}
        />
      ) : (
        <span className={styles.textDisplay} style={{ fontSize }}>{text || "Sticky"}</span>
      )}
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
