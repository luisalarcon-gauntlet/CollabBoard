"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { TextLayer } from "@/lib/yjs-store";
import { getSharedLayers } from "@/lib/yjs-store";
import { cn } from "@/lib/utils";
import styles from "./TextElement.module.css";

const MIN_WIDTH = 40;
const MIN_HEIGHT = 24;

type ResizeHandle = "nw" | "ne" | "sw" | "se";

interface TextElementProps {
  boardId: string;
  id: string;
  layer: TextLayer;
  selected: boolean;
  onSelect: (shiftKey: boolean) => void;
  onDragStart: () => void;
  onDragDelta: (dx: number, dy: number) => void;
  onDragEnd: () => void;
  screenToWorld: (sx: number, sy: number) => { x: number; y: number };
  getScreenPos: (e: { clientX: number; clientY: number }) => { sx: number; sy: number } | null;
}

function TextElementInner({
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
}: TextElementProps) {
  const { x, y, width, height, text, fontSize, fontWeight, color } = layer;
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta || !isEditing) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [editValue, isEditing]);

  const updateSize = useCallback(
    (newX: number, newY: number, newWidth: number, newHeight: number) => {
      const sharedLayers = getSharedLayers(boardId);
      if (!sharedLayers) return;
      const current = sharedLayers.get(id) as TextLayer | undefined;
      if (current?.type === "text") {
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

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsEditing(true);
      setEditValue(text);
    },
    [text]
  );

  const commitText = useCallback(() => {
    setIsEditing(false);
    const sharedLayers = getSharedLayers(boardId);
    if (!sharedLayers) return;
    const current = sharedLayers.get(id) as TextLayer | undefined;
    if (!current || current.type !== "text") return;
    const trimmed = editValue.trim() || "Text";
    const newHeight = textareaRef.current
      ? Math.max(MIN_HEIGHT, textareaRef.current.scrollHeight)
      : current.height;
    sharedLayers.set(id, { ...current, text: trimmed, height: newHeight });
    setEditValue(trimmed);
  }, [boardId, id, editValue]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        setEditValue(text);
        setIsEditing(false);
      }
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        commitText();
      }
    },
    [commitText, text]
  );

  const fontStyle: React.CSSProperties = { fontSize, fontWeight, color };

  return (
    <div
      className={cn(styles.textEl, selected && styles.textElSelected)}
      style={{ left: x, top: y, width, height, ...fontStyle }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onDoubleClick={handleDoubleClick}
    >
      {isEditing ? (
        <textarea
          ref={textareaRef}
          className={styles.textArea}
          style={fontStyle}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitText}
          onKeyDown={handleKeyDown}
          autoFocus
        />
      ) : (
        <span className={styles.textDisplay}>{text || "Text"}</span>
      )}

      {selected && !isEditing && (
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

export const TextElement = memo(TextElementInner);
