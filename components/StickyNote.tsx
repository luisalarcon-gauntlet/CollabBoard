"use client";

import { useCallback, useRef, useState } from "react";
import type { StickyLayer } from "@/lib/yjs-store";
import { sharedLayers } from "@/lib/yjs-store";
import { cn } from "@/lib/utils";

interface StickyNoteProps {
  id: string;
  layer: StickyLayer;
  selected: boolean;
  onSelect: () => void;
  screenToWorld: (sx: number, sy: number) => { x: number; y: number };
  getScreenPos: (e: { clientX: number; clientY: number }) => { sx: number; sy: number } | null;
}

export function StickyNote({ id, layer, selected, onSelect, screenToWorld, getScreenPos }: StickyNoteProps) {
  const { x, y, text } = layer;
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(text);
  const dragStartRef = useRef<{ offsetWx: number; offsetWy: number } | null>(null);

  const updatePos = useCallback(
    (wx: number, wy: number) => {
      const current = sharedLayers.get(id) as StickyLayer | undefined;
      if (current?.type === "sticky") {
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

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    setEditValue(layer.text);
  }, [layer.text]);

  const commitText = useCallback(() => {
    setIsEditing(false);
    const current = sharedLayers.get(id) as StickyLayer | undefined;
    if (current?.type === "sticky" && editValue.trim() !== current.text) {
      sharedLayers.set(id, { ...current, text: editValue.trim() || "New note" });
    } else {
      setEditValue(layer.text);
    }
  }, [id, editValue, layer.text]);

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
      className={cn(
        "absolute min-w-[120px] cursor-grab rounded-lg border p-3 shadow active:cursor-grabbing",
        selected
          ? "border-blue-500 ring-2 ring-blue-500/30"
          : "border-amber-200 bg-amber-50 hover:border-amber-300"
      )}
      style={{
        left: x,
        top: y,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onDoubleClick={handleDoubleClick}
    >
      {isEditing ? (
        <textarea
          className="min-h-[60px] w-full resize-none rounded border-0 bg-transparent p-0 text-sm text-zinc-800 outline-none focus:ring-0"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitText}
          onKeyDown={handleKeyDown}
          autoFocus
          rows={3}
        />
      ) : (
        <span className="block whitespace-pre-wrap break-words text-sm text-zinc-800">
          {text || "Sticky"}
        </span>
      )}
    </div>
  );
}
