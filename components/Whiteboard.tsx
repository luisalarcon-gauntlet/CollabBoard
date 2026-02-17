"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useYjsStore } from "@/lib/useYjsStore";
import { sharedLayers, getAwareness } from "@/lib/yjs-store";
import type { RectangleLayer, StickyLayer } from "@/lib/yjs-store";
import { BoardTransformProvider, useBoardTransform } from "@/lib/board-transform";
import { Avatars } from "./Avatars";
import { CursorPresence } from "./CursorPresence";
import { StickyNote } from "./StickyNote";
import { ShapeRectangle } from "./ShapeRectangle";

const DEFAULT_RECT_SIZE = 120;

function WhiteboardInner() {
  const layers = useYjsStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const panStartRef = useRef<{ x: number; y: number; startPanX: number; startPanY: number } | null>(null);
  const { user } = useUser();
  const {
    pan,
    zoom,
    setPan,
    setZoom,
    containerRef,
    transformRef,
    screenToWorld,
  } = useBoardTransform();

  const getScreenPos = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const el = containerRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        sx: e.clientX - rect.left,
        sy: e.clientY - rect.top,
      };
    },
    [containerRef]
  );

  useEffect(() => {
    const awareness = getAwareness();
    if (!user || !awareness) return;
    awareness.setLocalStateField("user", {
      name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.id,
      avatar: user.imageUrl ?? undefined,
      cursor: null,
    });
  }, [user]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const awareness = getAwareness();
      const pos = getScreenPos(e);
      if (!containerRef.current || !awareness || !pos) return;
      const world = screenToWorld(pos.sx, pos.sy);
      const cursor = { x: Math.round(world.x), y: Math.round(world.y) };
      const prev = awareness.getLocalState()?.user as { name?: string; avatar?: string; cursor?: { x: number; y: number } | null } | undefined;
      awareness.setLocalStateField("user", { ...prev, cursor });
    },
    [getScreenPos, screenToWorld, containerRef]
  );

  const handlePointerLeave = useCallback(() => {
    const awareness = getAwareness();
    if (!awareness) return;
    const prev = awareness.getLocalState()?.user as { name?: string; avatar?: string; cursor?: { x: number; y: number } | null } | undefined;
    awareness.setLocalStateField("user", { ...prev, cursor: null });
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const pos = getScreenPos(e);
      if (!pos) return;
      const { pan: p, zoom: z } = transformRef.current;
      const worldX = (pos.sx - p.x) / z;
      const worldY = (pos.sy - p.y) / z;
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const newZoom = z + delta;
      setPan({
        x: pos.sx - worldX * newZoom,
        y: pos.sy - worldY * newZoom,
      });
      setZoom(newZoom);
    },
    [getScreenPos, transformRef, setPan, setZoom]
  );

  const handleBoardPointerDown = useCallback(
    (e: React.PointerEvent) => {
      setSelectedId(null);
      if (e.button === 0) {
        panStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          startPanX: pan.x,
          startPanY: pan.y,
        };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }
    },
    [pan]
  );

  const handleBoardPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (panStartRef.current) {
        setPan({
          x: panStartRef.current.startPanX + e.clientX - panStartRef.current.x,
          y: panStartRef.current.startPanY + e.clientY - panStartRef.current.y,
        });
      }
    },
    [setPan]
  );

  const handleBoardPointerUp = useCallback((e: React.PointerEvent) => {
    if (e.button === 0) {
      panStartRef.current = null;
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        // Don't delete if user is editing text in an input/textarea
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
          return;
        }
        
        if (selectedId) {
          e.preventDefault();
          sharedLayers.delete(selectedId);
          setSelectedId(null);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId]);

  const addSticky = useCallback(() => {
    const id = `sticky-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    sharedLayers.set(id, {
      type: "sticky",
      x: 100,
      y: 100,
      text: "New note",
    });
    setSelectedId(id);
  }, []);

  const addRectangle = useCallback(() => {
    const id = `rect-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    sharedLayers.set(id, {
      type: "rectangle",
      x: 150,
      y: 150,
      width: DEFAULT_RECT_SIZE,
      height: DEFAULT_RECT_SIZE,
      fill: "#93c5fd",
    });
    setSelectedId(id);
  }, []);

  const layerEntries = Array.from(layers.entries());

  return (
    <div
      ref={containerRef}
      data-board-container
      className="relative h-screen w-full overflow-hidden bg-zinc-100"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onWheel={handleWheel}
      style={{ touchAction: "none" }}
    >
      {/* Pan handle layer - covers viewport for infinite panning */}
      <div
        data-pan-handle
        className="absolute inset-0 z-0"
        style={{ cursor: panStartRef.current ? "grabbing" : "grab" }}
        onPointerDown={handleBoardPointerDown}
        onPointerMove={handleBoardPointerMove}
        onPointerUp={handleBoardPointerUp}
        onPointerLeave={handleBoardPointerUp}
      />

      {/* Infinite board: transformed world */}
      <div
        className="absolute inset-0 origin-top-left pointer-events-none"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
      >
        {layerEntries.map(([id, layer]) => {
          if (!layer) return null;
          if (layer.type === "sticky") {
            return (
              <StickyNote
                key={id}
                id={id}
                layer={layer as StickyLayer}
                selected={selectedId === id}
                onSelect={() => setSelectedId(id)}
                screenToWorld={screenToWorld}
                getScreenPos={getScreenPos}
              />
            );
          }
          if (layer.type === "rectangle") {
            return (
              <ShapeRectangle
                key={id}
                id={id}
                layer={layer as RectangleLayer}
                selected={selectedId === id}
                onSelect={() => setSelectedId(id)}
                screenToWorld={screenToWorld}
                getScreenPos={getScreenPos}
              />
            );
          }
          return null;
        })}
      </div>

      <Avatars />
      <CursorPresence />

      {/* Toolbar */}
      <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-lg border border-zinc-200 bg-white/95 p-2 shadow">
        <button
          type="button"
          onClick={addSticky}
          className="rounded-md bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-200"
        >
          Add sticky
        </button>
        <button
          type="button"
          onClick={addRectangle}
          className="rounded-md bg-blue-100 px-3 py-1.5 text-sm font-medium text-blue-900 hover:bg-blue-200"
        >
          Add rectangle
        </button>
        {selectedId && (
          <button
            type="button"
            onClick={() => {
              sharedLayers.delete(selectedId);
              setSelectedId(null);
            }}
            className="rounded-md bg-red-100 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-200"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

export function Whiteboard() {
  return (
    <BoardTransformProvider>
      <WhiteboardInner />
    </BoardTransformProvider>
  );
}
