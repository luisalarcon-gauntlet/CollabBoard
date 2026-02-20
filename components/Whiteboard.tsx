"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useYjsStore } from "@/lib/useYjsStore";
import { sharedLayers, getAwareness, ensurePersistence } from "@/lib/yjs-store";
import type { RectangleLayer, StickyLayer, CircleLayer, TextLayer, LineLayer } from "@/lib/yjs-store";
import { BoardTransformProvider, useBoardTransform } from "@/lib/board-transform";
import { Avatars } from "./Avatars";
import { CursorPresence } from "./CursorPresence";
import { StickyNote } from "./StickyNote";
import { ShapeRectangle } from "./ShapeRectangle";
import { ShapeCircle } from "./ShapeCircle";
import { TextElement } from "./TextElement";
import { LineElement } from "./LineElement";
import {
  StickyNote as StickyIcon,
  Square,
  Circle,
  Type,
  MoveUpRight,
  Trash2,
  Home,
} from "lucide-react";
import styles from "./Whiteboard.module.css";

const DEFAULT_RECT_SIZE = 120;
const DEFAULT_STICKY_WIDTH = 200;
const DEFAULT_STICKY_HEIGHT = 150;
const DEFAULT_CIRCLE_SIZE = 120;
const DEFAULT_TEXT_WIDTH = 200;
const DEFAULT_TEXT_HEIGHT = 40;
const DEFAULT_LINE_LENGTH = 160;

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

  // Start persistence (load from DB, start save timer) as soon as the board mounts.
  useEffect(() => {
    ensurePersistence();
  }, []);

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
      const prev = awareness.getLocalState()?.user as
        | { name?: string; avatar?: string; cursor?: { x: number; y: number } | null }
        | undefined;
      awareness.setLocalStateField("user", { ...prev, cursor });
    },
    [getScreenPos, screenToWorld, containerRef]
  );

  const handlePointerLeave = useCallback(() => {
    const awareness = getAwareness();
    if (!awareness) return;
    const prev = awareness.getLocalState()?.user as
      | { name?: string; avatar?: string; cursor?: { x: number; y: number } | null }
      | undefined;
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

  // ── Layer creation helpers ────────────────────────────────────────────────

  /** Returns the world-space center of the viewport so new items appear in view. */
  const viewportCenter = useCallback((): { x: number; y: number } => {
    const el = containerRef.current;
    if (!el) return { x: 150, y: 150 };
    const { width, height } = el.getBoundingClientRect();
    return screenToWorld(width / 2, height / 2);
  }, [containerRef, screenToWorld]);

  const addSticky = useCallback(() => {
    const { x, y } = viewportCenter();
    const id = `sticky-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    sharedLayers.set(id, {
      type: "sticky",
      x: x - DEFAULT_STICKY_WIDTH / 2,
      y: y - DEFAULT_STICKY_HEIGHT / 2,
      width: DEFAULT_STICKY_WIDTH,
      height: DEFAULT_STICKY_HEIGHT,
      text: "New note",
    });
    setSelectedId(id);
  }, [viewportCenter]);

  const addRectangle = useCallback(() => {
    const { x, y } = viewportCenter();
    const id = `rect-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    sharedLayers.set(id, {
      type: "rectangle",
      x: x - DEFAULT_RECT_SIZE / 2,
      y: y - DEFAULT_RECT_SIZE / 2,
      width: DEFAULT_RECT_SIZE,
      height: DEFAULT_RECT_SIZE,
      fill: "#93c5fd",
    });
    setSelectedId(id);
  }, [viewportCenter]);

  const addCircle = useCallback(() => {
    const { x, y } = viewportCenter();
    const id = `circle-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    sharedLayers.set(id, {
      type: "circle",
      x: x - DEFAULT_CIRCLE_SIZE / 2,
      y: y - DEFAULT_CIRCLE_SIZE / 2,
      width: DEFAULT_CIRCLE_SIZE,
      height: DEFAULT_CIRCLE_SIZE,
      fill: "#86efac",
    });
    setSelectedId(id);
  }, [viewportCenter]);

  const addText = useCallback(() => {
    const { x, y } = viewportCenter();
    const id = `text-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    sharedLayers.set(id, {
      type: "text",
      x: x - DEFAULT_TEXT_WIDTH / 2,
      y: y - DEFAULT_TEXT_HEIGHT / 2,
      width: DEFAULT_TEXT_WIDTH,
      height: DEFAULT_TEXT_HEIGHT,
      text: "Text",
      fontSize: 16,
      fontWeight: "normal",
      color: "#1e293b",
    });
    setSelectedId(id);
  }, [viewportCenter]);

  const addLine = useCallback(
    (lineVariant: "straight" | "arrow") => {
      const { x, y } = viewportCenter();
      const id = `line-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const x1 = x - DEFAULT_LINE_LENGTH / 2;
      const x2 = x + DEFAULT_LINE_LENGTH / 2;
      sharedLayers.set(id, {
        type: "line",
        x: x1,
        y,
        points: [
          [x1, y],
          [x2, y],
        ],
        color: "#1e293b",
        thickness: 2,
        variant: lineVariant,
      });
      setSelectedId(id);
    },
    [viewportCenter]
  );

  const resetView = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    setPan({
      x: centerX - 100,
      y: centerY - 100,
    });
    setZoom(1.0);
  }, [containerRef, setPan, setZoom]);

  const layerEntries = Array.from(layers.entries());

  return (
    <div
      ref={containerRef}
      data-board-container
      className={styles.boardContainer}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onWheel={handleWheel}
    >
      {/* Pan handle layer */}
      <div
        data-pan-handle
        className={`${styles.panHandle} ${panStartRef.current ? styles.panHandleGrabbing : styles.panHandleGrab}`}
        onPointerDown={handleBoardPointerDown}
        onPointerMove={handleBoardPointerMove}
        onPointerUp={handleBoardPointerUp}
        onPointerLeave={handleBoardPointerUp}
      />

      {/* Infinite world: transformed */}
      <div
        className={styles.worldTransform}
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

          if (layer.type === "circle") {
            return (
              <ShapeCircle
                key={id}
                id={id}
                layer={layer as CircleLayer}
                selected={selectedId === id}
                onSelect={() => setSelectedId(id)}
                screenToWorld={screenToWorld}
                getScreenPos={getScreenPos}
              />
            );
          }

          if (layer.type === "text") {
            return (
              <TextElement
                key={id}
                id={id}
                layer={layer as TextLayer}
                selected={selectedId === id}
                onSelect={() => setSelectedId(id)}
                screenToWorld={screenToWorld}
                getScreenPos={getScreenPos}
              />
            );
          }

          if (layer.type === "line") {
            return (
              <LineElement
                key={id}
                id={id}
                layer={layer as LineLayer}
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

      {/* Vertical Toolbar */}
      <div className={styles.toolbar}>
        <button
          type="button"
          onClick={addSticky}
          className={`${styles.toolbarButton} ${styles.addStickyButton}`}
          title="Add Sticky Note"
        >
          <StickyIcon size={20} />
          <span className={styles.buttonLabel}>Sticky</span>
        </button>

        <button
          type="button"
          onClick={addRectangle}
          className={`${styles.toolbarButton} ${styles.addRectangleButton}`}
          title="Add Rectangle"
        >
          <Square size={20} />
          <span className={styles.buttonLabel}>Rectangle</span>
        </button>

        <button
          type="button"
          onClick={addCircle}
          className={`${styles.toolbarButton} ${styles.addCircleButton}`}
          title="Add Circle"
        >
          <Circle size={20} />
          <span className={styles.buttonLabel}>Circle</span>
        </button>

        <button
          type="button"
          onClick={addText}
          className={`${styles.toolbarButton} ${styles.addTextButton}`}
          title="Add Text"
        >
          <Type size={20} />
          <span className={styles.buttonLabel}>Text</span>
        </button>

        <button
          type="button"
          onClick={() => addLine("straight")}
          className={`${styles.toolbarButton} ${styles.addLineButton}`}
          title="Add Line"
        >
          <MoveUpRight size={20} />
          <span className={styles.buttonLabel}>Line</span>
        </button>

        <button
          type="button"
          onClick={() => addLine("arrow")}
          className={`${styles.toolbarButton} ${styles.addArrowButton}`}
          title="Add Arrow"
        >
          <MoveUpRight size={20} className={styles.arrowIcon} />
          <span className={styles.buttonLabel}>Arrow</span>
        </button>

        {selectedId && (
          <button
            type="button"
            onClick={() => {
              sharedLayers.delete(selectedId);
              setSelectedId(null);
            }}
            className={`${styles.toolbarButton} ${styles.deleteButton}`}
            title="Delete Selected"
          >
            <Trash2 size={20} />
            <span className={styles.buttonLabel}>Delete</span>
          </button>
        )}

        <button
          type="button"
          onClick={resetView}
          className={`${styles.toolbarButton} ${styles.resetButton}`}
          title="Reset View"
        >
          <Home size={20} />
          <span className={styles.buttonLabel}>Reset</span>
        </button>
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
