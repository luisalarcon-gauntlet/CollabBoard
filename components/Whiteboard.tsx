"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useYjsStore } from "@/lib/useYjsStore";
import { sharedLayers, getAwareness, ensurePersistence, ydoc } from "@/lib/yjs-store";
import type {
  LineLayer,
  LayerData,
  RectangleLayer,
  StickyLayer,
  CircleLayer,
  TextLayer,
  ConnectorLayer,
  FrameLayer,
} from "@/lib/yjs-store";
import { getElementsInFrame } from "@/lib/utils";
import { BoardTransformProvider, useBoardTransform } from "@/lib/board-transform";
import { Avatars } from "./Avatars";
import { CursorPresence } from "./CursorPresence";
import { StickyNote } from "./StickyNote";
import { ShapeRectangle } from "./ShapeRectangle";
import { ShapeCircle } from "./ShapeCircle";
import { TextElement } from "./TextElement";
import { LineElement } from "./LineElement";
import { ConnectorElement, getLayerBounds } from "./ConnectorElement";
import { FrameElement } from "./FrameElement";
import { HelpModal } from "./HelpModal";
import {
  StickyNote as StickyIcon,
  Square,
  Circle,
  Type,
  MoveUpRight,
  Trash2,
  Home,
  Copy,
  Hand,
  MousePointer2,
  HelpCircle,
  Spline,
  Frame as FrameIcon,
} from "lucide-react";
import styles from "./Whiteboard.module.css";

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_RECT_SIZE    = 120;
const DEFAULT_STICKY_WIDTH = 200;
const DEFAULT_STICKY_HEIGHT = 150;
const DEFAULT_CIRCLE_SIZE  = 120;
const DEFAULT_TEXT_WIDTH   = 200;
const DEFAULT_TEXT_HEIGHT  = 40;
const DEFAULT_LINE_LENGTH  = 160;
const DEFAULT_FRAME_WIDTH  = 600;
const DEFAULT_FRAME_HEIGHT = 400;
const PASTE_OFFSET         = 20;

const COLOR_PRESETS = [
  "#ffffff", "#f1f5f9", "#fef3c7", "#fee2e2",
  "#dbeafe", "#dcfce7", "#f3e8ff", "#1e293b",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function lineBboxOrigin(pts: [number, number][]): { x: number; y: number } {
  let minX = Infinity, minY = Infinity;
  for (const [px, py] of pts) {
    if (px < minX) minX = px;
    if (py < minY) minY = py;
  }
  return { x: minX, y: minY };
}

function getLayerBBox(layer: LayerData) {
  if (layer.type === "connector") return null;
  if (layer.type === "line") {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [px, py] of layer.points) {
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
    return { x1: minX, y1: minY, x2: maxX, y2: maxY };
  }
  const w = (layer as { width?: number }).width ?? 0;
  const h = (layer as { height?: number }).height ?? 0;
  return { x1: layer.x, y1: layer.y, x2: layer.x + w, y2: layer.y + h };
}

function generateId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Return the ID of the topmost non-connector, non-line layer whose bounding
 * box contains (wx, wy), or null if none.  Reads from the live Y.Map so it
 * is always current even inside pointer-event handlers.
 */
/**
 * Two-pass hit test used by the connector tool.
 *
 * Pass 1 – concrete shapes (sticky, rect, circle, text).  Inner shapes have
 *           visual priority over any frame that contains them, so we prefer
 *           them as connection endpoints.
 * Pass 2 – frames only, as a fallback when the pointer is over the frame
 *           background or border but not over any contained shape.
 *
 * Lines are excluded from both passes (no meaningful center/edge point).
 * Connectors are excluded (self-referential edge).
 */
function hitTestShapeLayers(wx: number, wy: number): string | null {
  // Pass 1: non-frame shapes
  for (const [id, layer] of sharedLayers.entries()) {
    if (!layer || layer.type === "connector" || layer.type === "line" || layer.type === "frame") continue;
    const bounds = getLayerBounds(layer);
    if (!bounds) continue;
    if (wx >= bounds.x1 && wx <= bounds.x2 && wy >= bounds.y1 && wy <= bounds.y2) return id;
  }
  // Pass 2: frames (lower priority so inner shapes are preferred)
  for (const [id, layer] of sharedLayers.entries()) {
    if (!layer || layer.type !== "frame") continue;
    const bounds = getLayerBounds(layer);
    if (!bounds) continue;
    if (wx >= bounds.x1 && wx <= bounds.x2 && wy >= bounds.y1 && wy <= bounds.y2) return id;
  }
  return null;
}

// ── Inline sub-components ─────────────────────────────────────────────────────

interface ColorPaletteProps {
  label: string;
  value: string;
  onChange: (c: string) => void;
}

function ColorPalette({ label, value, onChange }: ColorPaletteProps) {
  const [hex, setHex] = useState(value);
  useEffect(() => setHex(value), [value]);

  const commit = (v: string) => {
    if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v);
  };

  return (
    <div className={styles.formatSection}>
      <span className={styles.formatLabel}>{label}</span>
      <div className={styles.colorGrid}>
        {COLOR_PRESETS.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            className={styles.colorSwatch}
            style={{
              backgroundColor: c,
              outline: value.toLowerCase() === c.toLowerCase() ? "2px solid #3b82f6" : "1px solid #cbd5e1",
              outlineOffset: 1,
            }}
            onClick={() => { onChange(c); setHex(c); }}
          />
        ))}
      </div>
      <input
        type="text"
        className={styles.hexInput}
        value={hex}
        maxLength={7}
        placeholder="#rrggbb"
        onChange={(e) => {
          const v = e.target.value;
          setHex(v);
          if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v);
        }}
        onBlur={() => {
          if (!/^#[0-9a-fA-F]{6}$/.test(hex)) setHex(value);
          else commit(hex);
        }}
      />
    </div>
  );
}

interface FontSizeControlProps {
  value: number;
  onDecrease: () => void;
  onIncrease: () => void;
}

function FontSizeControl({ value, onDecrease, onIncrease }: FontSizeControlProps) {
  return (
    <div className={styles.formatSection}>
      <span className={styles.formatLabel}>Font Size</span>
      <div className={styles.fontSizeRow}>
        <button type="button" className={styles.fontSizeBtn} onClick={onDecrease}>−</button>
        <span className={styles.fontSizeValue}>{value}</span>
        <button type="button" className={styles.fontSizeBtn} onClick={onIncrease}>+</button>
      </div>
    </div>
  );
}

/** Three-way toggle for connector routing style. */
interface ConnectorStyleControlProps {
  value: ConnectorLayer["style"];
  onChange: (s: ConnectorLayer["style"]) => void;
}

function ConnectorStyleControl({ value, onChange }: ConnectorStyleControlProps) {
  const options: { key: ConnectorLayer["style"]; label: string }[] = [
    { key: "straight", label: "Straight" },
    { key: "curved",   label: "Curved" },
    { key: "elbow",    label: "Elbow" },
  ];
  return (
    <div className={styles.formatSection}>
      <span className={styles.formatLabel}>Routing</span>
      <div className={styles.connectorStyleRow}>
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            className={`${styles.connectorStyleBtn} ${value === o.key ? styles.connectorStyleBtnActive : ""}`}
            onClick={() => onChange(o.key)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Toggle for connector endpoint decoration. */
interface ConnectorEndpointControlProps {
  value: ConnectorLayer["endpoints"];
  onChange: (e: ConnectorLayer["endpoints"]) => void;
}

function ConnectorEndpointControl({ value, onChange }: ConnectorEndpointControlProps) {
  const options: { key: ConnectorLayer["endpoints"]; label: string }[] = [
    { key: "arrow", label: "Arrow" },
    { key: "dot",   label: "Dot" },
    { key: "none",  label: "None" },
  ];
  return (
    <div className={styles.formatSection}>
      <span className={styles.formatLabel}>Endpoint</span>
      <div className={styles.connectorStyleRow}>
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            className={`${styles.connectorStyleBtn} ${value === o.key ? styles.connectorStyleBtnActive : ""}`}
            onClick={() => onChange(o.key)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main whiteboard ───────────────────────────────────────────────────────────

function WhiteboardInner() {
  const layers = useYjsStore();

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectedIdsRef = useRef<Set<string>>(new Set());

  // Marquee
  const [marquee, setMarquee] = useState<{
    startSx: number; startSy: number; currentSx: number; currentSy: number;
  } | null>(null);
  const isMarqueeRef = useRef(false);

  // Pan
  const panStartRef = useRef<{ x: number; y: number; startPanX: number; startPanY: number } | null>(null);

  // Drag (batch movement)
  const dragStartPositions = useRef<
    Map<string, { x: number; y: number; points?: [number, number][] }>
  >(new Map());

  // Clipboard
  const clipboardRef = useRef<LayerData[]>([]);

  // Space key state (both ref for handlers + state for re-renders)
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const isSpaceDownRef = useRef(false);

  // Help modal
  const [showHelp, setShowHelp] = useState(false);
  const showHelpRef = useRef(false);
  showHelpRef.current = showHelp;

  // ── Connector tool state ─────────────────────────────────────────────────

  /** ID of the shape the cursor is currently over (connector tool). */
  const [connectorHoverId, setConnectorHoverIdState] = useState<string | null>(null);
  const connectorHoverIdRef = useRef<string | null>(null);
  const setConnectorHoverId = useCallback((id: string | null) => {
    connectorHoverIdRef.current = id;
    setConnectorHoverIdState(id);
  }, []);

  /** In-progress connector drag. */
  type ConnectorDraft = {
    fromId: string;
    fromPt: [number, number];   // world-space center of source
    currentPt: [number, number]; // world-space cursor
  };
  const [connectorDraft, setConnectorDraftState] = useState<ConnectorDraft | null>(null);
  const connectorDraftRef = useRef<ConnectorDraft | null>(null);
  const setConnectorDraft = useCallback((d: ConnectorDraft | null) => {
    connectorDraftRef.current = d;
    setConnectorDraftState(d);
  }, []);

  const { user } = useUser();
  const {
    pan,
    zoom,
    setPan,
    setZoom,
    containerRef,
    transformRef,
    screenToWorld,
    toolMode,
    setToolMode,
  } = useBoardTransform();

  // Keep a ref of toolMode for use in keyboard handlers
  const toolModeRef = useRef(toolMode);
  toolModeRef.current = toolMode;

  // Effective hand mode: persistent hand tool OR space held
  const isHandMode = toolMode === "hand" || isSpaceDown;
  const isConnectorMode = toolMode === "connector" && !isSpaceDown;

  // ── Sync selection to ref ───────────────────────────────────────────────

  const updateSelectedIds = useCallback((next: Set<string>) => {
    selectedIdsRef.current = next;
    setSelectedIds(next);
  }, []);

  // ── Screen → world helpers ──────────────────────────────────────────────

  const getScreenPos = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const el = containerRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return { sx: e.clientX - rect.left, sy: e.clientY - rect.top };
    },
    [containerRef],
  );

  // ── Effects ─────────────────────────────────────────────────────────────

  useEffect(() => { ensurePersistence(); }, []);

  useEffect(() => {
    const awareness = getAwareness();
    if (!user || !awareness) return;
    awareness.setLocalStateField("user", {
      name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.id,
      avatar: user.imageUrl ?? undefined,
      cursor: null,
    });
  }, [user]);

  // ── Orphan connector cleanup ─────────────────────────────────────────────
  // Observes the Y.Map and purges any connector whose fromId or toId no longer
  // exists — runs in a new transaction after the triggering one completes.

  useEffect(() => {
    const cleanup = () => {
      const toDelete: string[] = [];
      for (const [id, layer] of sharedLayers.entries()) {
        if (layer?.type !== "connector") continue;
        const conn = layer as ConnectorLayer;
        if (!sharedLayers.has(conn.fromId) || !sharedLayers.has(conn.toId)) {
          toDelete.push(id);
        }
      }
      if (toDelete.length > 0) {
        ydoc.transact(() => {
          for (const id of toDelete) sharedLayers.delete(id);
        });
      }
    };
    sharedLayers.observe(cleanup);
    return () => sharedLayers.unobserve(cleanup);
  }, []);

  // ── Selection handler ───────────────────────────────────────────────────

  const handleSelect = useCallback(
    (id: string, shiftKey: boolean) => {
      const prev = selectedIdsRef.current;
      if (!shiftKey && prev.has(id)) return;
      let next: Set<string>;
      if (shiftKey) {
        next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
      } else {
        next = new Set([id]);
      }
      selectedIdsRef.current = next;
      setSelectedIds(next);
    },
    [],
  );

  // ── Batch drag handlers ─────────────────────────────────────────────────

  const handleDragStart = useCallback((draggedId: string) => {
    const ids = new Set(selectedIdsRef.current);
    if (!ids.has(draggedId)) ids.add(draggedId);

    // For any selected frame, also include its geometrically contained children
    // so the whole group moves atomically. Use a snapshot of layers for containment check.
    const layerSnapshot = new Map(sharedLayers.entries());
    const allIds = new Set(ids);
    for (const id of ids) {
      const layer = sharedLayers.get(id);
      if (layer?.type === "frame") {
        for (const childId of getElementsInFrame(id, layerSnapshot)) {
          allIds.add(childId);
        }
      }
    }

    const positions = new Map<string, { x: number; y: number; points?: [number, number][] }>();
    for (const id of allIds) {
      const layer = sharedLayers.get(id);
      if (!layer) continue;
      // Connectors are auto-routed — they have no independent position to drag
      if (layer.type === "connector") continue;
      if (layer.type === "line") {
        positions.set(id, { x: layer.x, y: layer.y, points: layer.points.map((p) => [p[0], p[1]]) });
      } else {
        positions.set(id, { x: layer.x, y: layer.y });
      }
    }
    dragStartPositions.current = positions;
  }, []);

  const handleDragDelta = useCallback((dx: number, dy: number) => {
    ydoc.transact(() => {
      for (const [id, startPos] of dragStartPositions.current) {
        const layer = sharedLayers.get(id);
        if (!layer) continue;
        if (layer.type === "line") {
          const newPoints = (startPos.points as [number, number][]).map(
            ([px, py]) => [px + dx, py + dy] as [number, number],
          );
          const { x, y } = lineBboxOrigin(newPoints);
          sharedLayers.set(id, { ...layer, points: newPoints, x, y });
        } else {
          sharedLayers.set(id, { ...layer, x: startPos.x + dx, y: startPos.y + dy });
        }
      }
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    dragStartPositions.current = new Map();
  }, []);

  // ── Cursor awareness ────────────────────────────────────────────────────

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
    [getScreenPos, screenToWorld, containerRef],
  );

  const handlePointerLeave = useCallback(() => {
    const awareness = getAwareness();
    if (!awareness) return;
    const prev = awareness.getLocalState()?.user as
      | { name?: string; avatar?: string; cursor?: { x: number; y: number } | null }
      | undefined;
    awareness.setLocalStateField("user", { ...prev, cursor: null });
  }, []);

  // ── Zoom ────────────────────────────────────────────────────────────────

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      if (showHelpRef.current) return;
      const pos = getScreenPos(e);
      if (!pos) return;
      const { pan: p, zoom: z } = transformRef.current;
      const worldX = (pos.sx - p.x) / z;
      const worldY = (pos.sy - p.y) / z;
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const newZoom = z + delta;
      setPan({ x: pos.sx - worldX * newZoom, y: pos.sy - worldY * newZoom });
      setZoom(newZoom);
    },
    [getScreenPos, transformRef, setPan, setZoom],
  );

  // ── Board pointer (pan / marquee) ───────────────────────────────────────

  const handleBoardPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Let the connector overlay handle all events while in connector mode,
      // UNLESS Space is held — in that case the hand overlay is active and
      // panning must be allowed regardless of the underlying tool.
      if (toolModeRef.current === "connector" && !isSpaceDownRef.current) return;

      const handMode = toolModeRef.current === "hand" || isSpaceDownRef.current;

      if (e.button === 1 || (e.button === 0 && handMode)) {
        panStartRef.current = { x: e.clientX, y: e.clientY, startPanX: pan.x, startPanY: pan.y };
        isMarqueeRef.current = false;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }

      if (e.button === 0) {
        const pos = getScreenPos(e);
        if (pos) {
          setMarquee({ startSx: pos.sx, startSy: pos.sy, currentSx: pos.sx, currentSy: pos.sy });
          isMarqueeRef.current = true;
        }
        panStartRef.current = null;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }
    },
    [pan, getScreenPos],
  );

  const handleBoardPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (panStartRef.current) {
        setPan({
          x: panStartRef.current.startPanX + e.clientX - panStartRef.current.x,
          y: panStartRef.current.startPanY + e.clientY - panStartRef.current.y,
        });
      } else if (isMarqueeRef.current) {
        const pos = getScreenPos(e);
        if (pos) {
          setMarquee((prev) => prev ? { ...prev, currentSx: pos.sx, currentSy: pos.sy } : null);
        }
      }
    },
    [setPan, getScreenPos],
  );

  const handleBoardPointerUp = useCallback(
    (e: React.PointerEvent) => {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);

      if (panStartRef.current) {
        panStartRef.current = null;
        return;
      }

      if (isMarqueeRef.current) {
        isMarqueeRef.current = false;
        setMarquee((prevMarquee) => {
          if (!prevMarquee) return null;
          const { startSx, startSy, currentSx, currentSy } = prevMarquee;
          const dragW = Math.abs(currentSx - startSx);
          const dragH = Math.abs(currentSy - startSy);

          if (dragW < 4 && dragH < 4) {
            if (!e.shiftKey) updateSelectedIds(new Set());
            return null;
          }

          const mx1 = Math.min(startSx, currentSx);
          const my1 = Math.min(startSy, currentSy);
          const mx2 = Math.max(startSx, currentSx);
          const my2 = Math.max(startSy, currentSy);
          const w1 = screenToWorld(mx1, my1);
          const w2 = screenToWorld(mx2, my2);

          const hit = new Set<string>();
          for (const [id, layer] of sharedLayers.entries()) {
            if (!layer || layer.type === "connector") continue;
            const bbox = getLayerBBox(layer);
            if (!bbox) continue;
            if (bbox.x2 >= w1.x && bbox.x1 <= w2.x && bbox.y2 >= w1.y && bbox.y1 <= w2.y) {
              hit.add(id);
            }
          }

          const next = e.shiftKey ? new Set([...selectedIdsRef.current, ...hit]) : hit;
          updateSelectedIds(next);
          return null;
        });
      }
    },
    [screenToWorld, updateSelectedIds],
  );

  // ── Connector overlay handlers ──────────────────────────────────────────

  const handleConnectorPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const pos = getScreenPos(e);
      if (!pos) return;
      const world = screenToWorld(pos.sx, pos.sy);

      if (connectorDraftRef.current) {
        // Update draft preview position
        const updated = { ...connectorDraftRef.current, currentPt: [world.x, world.y] as [number, number] };
        connectorDraftRef.current = updated;
        setConnectorDraftState(updated);

        // Still track hover for target snapping feedback
        const hoverId = hitTestShapeLayers(world.x, world.y);
        const targetId = hoverId !== connectorDraftRef.current?.fromId ? hoverId : null;
        if (targetId !== connectorHoverIdRef.current) {
          setConnectorHoverId(targetId);
        }
      } else {
        const hoverId = hitTestShapeLayers(world.x, world.y);
        if (hoverId !== connectorHoverIdRef.current) {
          setConnectorHoverId(hoverId);
        }
      }
    },
    [getScreenPos, screenToWorld, setConnectorHoverId],
  );

  const handleConnectorPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const pos = getScreenPos(e);
      if (!pos) return;
      const world = screenToWorld(pos.sx, pos.sy);

      const hoverId = hitTestShapeLayers(world.x, world.y);
      if (!hoverId) return;

      const fromLayer = sharedLayers.get(hoverId);
      if (!fromLayer) return;
      const bounds = getLayerBounds(fromLayer);
      if (!bounds) return;

      const draft: ConnectorDraft = {
        fromId: hoverId,
        fromPt: [bounds.cx, bounds.cy],
        currentPt: [world.x, world.y],
      };
      setConnectorDraft(draft);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [getScreenPos, screenToWorld, setConnectorDraft],
  );

  const handleConnectorPointerUp = useCallback(
    (e: React.PointerEvent) => {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);

      const draft = connectorDraftRef.current;
      if (!draft) return;

      const pos = getScreenPos(e);
      if (pos) {
        const world = screenToWorld(pos.sx, pos.sy);
        const toId = hitTestShapeLayers(world.x, world.y);
        if (toId && toId !== draft.fromId) {
          const connId = generateId("connector");
          const conn: ConnectorLayer = {
            type: "connector",
            fromId: draft.fromId,
            toId,
            style: "straight",
            stroke: { color: "#1e293b", width: 2 },
            endpoints: "arrow",
          };
          sharedLayers.set(connId, conn);
          updateSelectedIds(new Set([connId]));
        }
      }

      setConnectorDraft(null);
      setConnectorHoverId(null);
    },
    [getScreenPos, screenToWorld, setConnectorDraft, setConnectorHoverId, updateSelectedIds],
  );

  const handleConnectorOverlayLeave = useCallback(() => {
    if (!connectorDraftRef.current) {
      setConnectorHoverId(null);
    }
  }, [setConnectorHoverId]);

  // ── Formatting actions ──────────────────────────────────────────────────

  const applyFillColor = useCallback((color: string) => {
    ydoc.transact(() => {
      for (const id of selectedIdsRef.current) {
        const layer = sharedLayers.get(id);
        if (!layer) continue;
        if (layer.type === "rectangle" || layer.type === "circle") {
          sharedLayers.set(id, { ...layer, fill: color });
        } else if (layer.type === "sticky") {
          sharedLayers.set(id, { ...layer, bgColor: color });
        } else if (layer.type === "frame") {
          sharedLayers.set(id, { ...layer, backgroundColor: color });
        }
      }
    });
  }, []);

  const applyTextColor = useCallback((color: string) => {
    ydoc.transact(() => {
      for (const id of selectedIdsRef.current) {
        const layer = sharedLayers.get(id);
        if (layer?.type === "text") {
          sharedLayers.set(id, { ...layer, color });
        }
      }
    });
  }, []);

  const applyStrokeColor = useCallback((color: string) => {
    ydoc.transact(() => {
      for (const id of selectedIdsRef.current) {
        const layer = sharedLayers.get(id);
        if (layer?.type === "line") {
          sharedLayers.set(id, { ...layer, color });
        } else if (layer?.type === "connector") {
          sharedLayers.set(id, { ...layer, stroke: { ...layer.stroke, color } });
        }
      }
    });
  }, []);

  const applyConnectorStyle = useCallback((connStyle: ConnectorLayer["style"]) => {
    ydoc.transact(() => {
      for (const id of selectedIdsRef.current) {
        const layer = sharedLayers.get(id);
        if (layer?.type === "connector") {
          sharedLayers.set(id, { ...layer, style: connStyle });
        }
      }
    });
  }, []);

  const applyConnectorEndpoints = useCallback((endpoints: ConnectorLayer["endpoints"]) => {
    ydoc.transact(() => {
      for (const id of selectedIdsRef.current) {
        const layer = sharedLayers.get(id);
        if (layer?.type === "connector") {
          sharedLayers.set(id, { ...layer, endpoints });
        }
      }
    });
  }, []);

  const applyFontSizeDelta = useCallback((delta: number) => {
    ydoc.transact(() => {
      for (const id of selectedIdsRef.current) {
        const layer = sharedLayers.get(id);
        if (!layer) continue;
        if (layer.type === "text") {
          sharedLayers.set(id, { ...layer, fontSize: Math.max(8, Math.min(96, layer.fontSize + delta)) });
        } else if (layer.type === "sticky") {
          const cur = layer.fontSize ?? 14;
          sharedLayers.set(id, { ...layer, fontSize: Math.max(8, Math.min(96, cur + delta)) });
        }
      }
    });
  }, []);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isEditing =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if (e.key === " " && !isEditing) {
        e.preventDefault();
        if (!isSpaceDownRef.current) {
          isSpaceDownRef.current = true;
          setIsSpaceDown(true);
        }
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      if (!isEditing && !mod) {
        if (e.key === "v" || e.key === "V") { setToolMode("select"); return; }
        if (e.key === "h" || e.key === "H") { setToolMode("hand"); return; }
        if (e.key === "c" || e.key === "C") { setToolMode("connector"); return; }
        if (e.key === "?") { setShowHelp((v) => !v); return; }
      }

      if (isEditing) return;

      if (e.key === "Escape") {
        if (toolModeRef.current === "connector") {
          // Cancel connector draft and exit connector mode
          setConnectorDraft(null);
          setConnectorHoverId(null);
          setToolMode("select");
          return;
        }
        if (!showHelpRef.current) updateSelectedIds(new Set());
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        const ids = selectedIdsRef.current;
        if (ids.size > 0) {
          const layerSnapshot = new Map(sharedLayers.entries());
          const toDelete = new Set(ids);
          for (const id of ids) {
            const layer = sharedLayers.get(id);
            if (layer?.type === "frame") {
              for (const childId of getElementsInFrame(id, layerSnapshot)) {
                toDelete.add(childId);
              }
            }
          }
          ydoc.transact(() => { for (const id of toDelete) sharedLayers.delete(id); });
          updateSelectedIds(new Set());
        }
        return;
      }

      if (mod && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        updateSelectedIds(new Set(sharedLayers.keys()));
        return;
      }

      if (mod && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        const ids = selectedIdsRef.current;
        if (ids.size === 0) return;
        const newIds = new Set<string>();
        ydoc.transact(() => {
          for (const id of ids) {
            const layer = sharedLayers.get(id);
            if (!layer) continue;
            // Connectors reference other IDs — skip duplication
            if (layer.type === "connector") continue;
            const newId = generateId(layer.type);
            if (layer.type === "line") {
              sharedLayers.set(newId, { ...layer, x: layer.x + PASTE_OFFSET, y: layer.y + PASTE_OFFSET, points: layer.points.map(([px, py]) => [px + PASTE_OFFSET, py + PASTE_OFFSET]) });
            } else {
              sharedLayers.set(newId, { ...layer, x: layer.x + PASTE_OFFSET, y: layer.y + PASTE_OFFSET });
            }
            newIds.add(newId);
          }
        });
        updateSelectedIds(newIds);
        return;
      }

      if (mod && (e.key === "c" || e.key === "C")) {
        const ids = selectedIdsRef.current;
        const copied: LayerData[] = [];
        for (const id of ids) {
          const layer = sharedLayers.get(id);
          if (layer && layer.type !== "connector") copied.push({ ...layer } as LayerData);
        }
        clipboardRef.current = copied;
        return;
      }

      if (mod && (e.key === "v" || e.key === "V")) {
        e.preventDefault();
        if (clipboardRef.current.length === 0) return;
        const newIds = new Set<string>();
        ydoc.transact(() => {
          for (const layer of clipboardRef.current) {
            if (layer.type === "connector") continue;
            const newId = generateId(layer.type);
            if (layer.type === "line") {
              sharedLayers.set(newId, { ...layer, x: layer.x + PASTE_OFFSET, y: layer.y + PASTE_OFFSET, points: (layer as LineLayer).points.map(([px, py]) => [px + PASTE_OFFSET, py + PASTE_OFFSET]) });
            } else {
              sharedLayers.set(newId, { ...layer, x: layer.x + PASTE_OFFSET, y: layer.y + PASTE_OFFSET });
            }
            newIds.add(newId);
          }
        });
        clipboardRef.current = clipboardRef.current.map((l) => {
          if (l.type === "connector") return l;
          return l.type === "line"
            ? { ...l, x: l.x + PASTE_OFFSET, y: l.y + PASTE_OFFSET, points: (l as LineLayer).points.map(([px, py]) => [px + PASTE_OFFSET, py + PASTE_OFFSET]) }
            : { ...l, x: l.x + PASTE_OFFSET, y: l.y + PASTE_OFFSET };
        }) as LayerData[];
        updateSelectedIds(newIds);
        return;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " " && isSpaceDownRef.current) {
        isSpaceDownRef.current = false;
        setIsSpaceDown(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [updateSelectedIds, setToolMode, setConnectorDraft, setConnectorHoverId]);

  // ── Layer creation ──────────────────────────────────────────────────────

  const viewportCenter = useCallback((): { x: number; y: number } => {
    const el = containerRef.current;
    if (!el) return { x: 150, y: 150 };
    const { width, height } = el.getBoundingClientRect();
    return screenToWorld(width / 2, height / 2);
  }, [containerRef, screenToWorld]);

  const addSticky = useCallback(() => {
    const { x, y } = viewportCenter();
    const id = generateId("sticky");
    sharedLayers.set(id, { type: "sticky", x: x - DEFAULT_STICKY_WIDTH / 2, y: y - DEFAULT_STICKY_HEIGHT / 2, width: DEFAULT_STICKY_WIDTH, height: DEFAULT_STICKY_HEIGHT, text: "New note" });
    updateSelectedIds(new Set([id]));
  }, [viewportCenter, updateSelectedIds]);

  const addRectangle = useCallback(() => {
    const { x, y } = viewportCenter();
    const id = generateId("rect");
    sharedLayers.set(id, { type: "rectangle", x: x - DEFAULT_RECT_SIZE / 2, y: y - DEFAULT_RECT_SIZE / 2, width: DEFAULT_RECT_SIZE, height: DEFAULT_RECT_SIZE, fill: "#93c5fd" });
    updateSelectedIds(new Set([id]));
  }, [viewportCenter, updateSelectedIds]);

  const addCircle = useCallback(() => {
    const { x, y } = viewportCenter();
    const id = generateId("circle");
    sharedLayers.set(id, { type: "circle", x: x - DEFAULT_CIRCLE_SIZE / 2, y: y - DEFAULT_CIRCLE_SIZE / 2, width: DEFAULT_CIRCLE_SIZE, height: DEFAULT_CIRCLE_SIZE, fill: "#86efac" });
    updateSelectedIds(new Set([id]));
  }, [viewportCenter, updateSelectedIds]);

  const addText = useCallback(() => {
    const { x, y } = viewportCenter();
    const id = generateId("text");
    sharedLayers.set(id, { type: "text", x: x - DEFAULT_TEXT_WIDTH / 2, y: y - DEFAULT_TEXT_HEIGHT / 2, width: DEFAULT_TEXT_WIDTH, height: DEFAULT_TEXT_HEIGHT, text: "Text", fontSize: 16, fontWeight: "normal", color: "#1e293b" });
    updateSelectedIds(new Set([id]));
  }, [viewportCenter, updateSelectedIds]);

  const addLine = useCallback(
    (lineVariant: "straight" | "arrow") => {
      const { x, y } = viewportCenter();
      const id = generateId("line");
      const x1 = x - DEFAULT_LINE_LENGTH / 2;
      const x2 = x + DEFAULT_LINE_LENGTH / 2;
      sharedLayers.set(id, { type: "line", x: x1, y, points: [[x1, y], [x2, y]], color: "#1e293b", thickness: 2, variant: lineVariant });
      updateSelectedIds(new Set([id]));
    },
    [viewportCenter, updateSelectedIds],
  );

  const addFrame = useCallback(() => {
    const { x, y } = viewportCenter();
    const id = generateId("frame");
    sharedLayers.set(id, {
      type: "frame",
      x: x - DEFAULT_FRAME_WIDTH / 2,
      y: y - DEFAULT_FRAME_HEIGHT / 2,
      width: DEFAULT_FRAME_WIDTH,
      height: DEFAULT_FRAME_HEIGHT,
      title: "Frame",
      backgroundColor: "rgba(241, 245, 249, 0.7)",
    });
    updateSelectedIds(new Set([id]));
  }, [viewportCenter, updateSelectedIds]);

  const resetView = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setPan({ x: rect.width / 2 - 100, y: rect.height / 2 - 100 });
    setZoom(1.0);
  }, [containerRef, setPan, setZoom]);

  const deleteSelected = useCallback(() => {
    const ids = selectedIdsRef.current;
    if (ids.size === 0) return;
    const layerSnapshot = new Map(sharedLayers.entries());
    const toDelete = new Set(ids);
    // When deleting a frame, also delete all contained elements
    for (const id of ids) {
      const layer = sharedLayers.get(id);
      if (layer?.type === "frame") {
        for (const childId of getElementsInFrame(id, layerSnapshot)) {
          toDelete.add(childId);
        }
      }
    }
    ydoc.transact(() => { for (const id of toDelete) sharedLayers.delete(id); });
    updateSelectedIds(new Set());
  }, [updateSelectedIds]);

  const duplicateSelected = useCallback(() => {
    const ids = selectedIdsRef.current;
    if (ids.size === 0) return;
    const newIds = new Set<string>();
    ydoc.transact(() => {
      for (const id of ids) {
        const layer = sharedLayers.get(id);
        if (!layer || layer.type === "connector") continue;
        const newId = generateId(layer.type);
        if (layer.type === "line") {
          sharedLayers.set(newId, { ...layer, x: layer.x + PASTE_OFFSET, y: layer.y + PASTE_OFFSET, points: layer.points.map(([px, py]) => [px + PASTE_OFFSET, py + PASTE_OFFSET]) });
        } else {
          sharedLayers.set(newId, { ...layer, x: layer.x + PASTE_OFFSET, y: layer.y + PASTE_OFFSET });
        }
        newIds.add(newId);
      }
    });
    updateSelectedIds(newIds);
  }, [updateSelectedIds]);

  // ── Derive formatting state from selection ──────────────────────────────

  const selectedLayers = Array.from(selectedIds)
    .map((id) => layers.get(id))
    .filter(Boolean) as LayerData[];

  const hasFillable    = selectedLayers.some((l) => l.type === "rectangle" || l.type === "circle" || l.type === "sticky" || l.type === "frame");
  const hasText        = selectedLayers.some((l) => l.type === "text");
  const hasStickyOrText = selectedLayers.some((l) => l.type === "sticky" || l.type === "text");
  const hasLine        = selectedLayers.some((l) => l.type === "line");
  const hasConnector   = selectedLayers.some((l) => l.type === "connector");
  const hasSelection   = selectedIds.size > 0;

  const firstFillable = selectedLayers.find((l) => l.type === "rectangle" || l.type === "circle" || l.type === "sticky" || l.type === "frame");
  const currentFillColor =
    firstFillable?.type === "sticky"
      ? (firstFillable as StickyLayer).bgColor ?? "#fffbeb"
      : firstFillable?.type === "rectangle" || firstFillable?.type === "circle"
      ? (firstFillable as RectangleLayer).fill ?? "#93c5fd"
      : firstFillable?.type === "frame"
      ? (firstFillable as FrameLayer).backgroundColor ?? "rgba(241, 245, 249, 0.7)"
      : "#ffffff";

  const firstText = selectedLayers.find((l) => l.type === "text") as TextLayer | undefined;
  const currentTextColor = firstText?.color ?? "#1e293b";

  const firstLine = selectedLayers.find((l) => l.type === "line") as LineLayer | undefined;
  const currentStrokeColor = firstLine?.color ?? "#1e293b";

  const firstConnector = selectedLayers.find((l) => l.type === "connector") as ConnectorLayer | undefined;
  const currentConnectorColor    = firstConnector?.stroke.color ?? "#1e293b";
  const currentConnectorStyle    = firstConnector?.style ?? "straight";
  const currentConnectorEndpoints = firstConnector?.endpoints ?? "arrow";

  const firstStickyOrText = selectedLayers.find((l) => l.type === "sticky" || l.type === "text");
  const currentFontSize =
    firstStickyOrText?.type === "text"
      ? (firstStickyOrText as TextLayer).fontSize
      : firstStickyOrText?.type === "sticky"
      ? (firstStickyOrText as StickyLayer).fontSize ?? 14
      : 14;

  // ── Partition layer entries for z-order rendering ───────────────────────
  // Rendering order (bottom to top):
  //   1. Frames       — always at the very bottom
  //   2. Connectors   — above frames, behind all shapes
  //   3. All others   — sticky notes, rectangles, circles, text, lines

  const layerEntries = Array.from(layers.entries());
  const frameEntries     = layerEntries.filter(([, l]) => l?.type === "frame");
  const connectorEntries = layerEntries.filter(([, l]) => l?.type === "connector");
  const shapeEntries     = layerEntries.filter(([, l]) => l?.type !== "connector" && l?.type !== "frame");

  // ── Anchor computation for connector hover UI ───────────────────────────

  type Anchor = { key: string; wx: number; wy: number };
  let hoverAnchors: Anchor[] | null = null;
  if (isConnectorMode && connectorHoverId) {
    const hl = layers.get(connectorHoverId);
    if (hl) {
      const bounds = getLayerBounds(hl);
      if (bounds) {
        hoverAnchors = [
          { key: "top",    wx: bounds.cx,  wy: bounds.y1 },
          { key: "bottom", wx: bounds.cx,  wy: bounds.y2 },
          { key: "left",   wx: bounds.x1,  wy: bounds.cy },
          { key: "right",  wx: bounds.x2,  wy: bounds.cy },
        ];
      }
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      data-board-container
      className={styles.boardContainer}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onWheel={handleWheel}
    >
      {/* Fallback pan/marquee layer */}
      <div
        data-pan-handle
        className={`${styles.panHandle} ${styles.panHandleCrosshair}`}
        onPointerDown={handleBoardPointerDown}
        onPointerMove={handleBoardPointerMove}
        onPointerUp={handleBoardPointerUp}
        onPointerLeave={handleBoardPointerUp}
      />

      {/* Infinite world */}
      <div
        className={styles.worldTransform}
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
      >
        {/* ── Frames (very bottom, behind connectors and shapes) ── */}
        {frameEntries.map(([id, layer]) => {
          if (!layer || layer.type !== "frame") return null;
          return (
            <FrameElement
              key={id}
              id={id}
              layer={layer as FrameLayer}
              selected={selectedIds.has(id)}
              onSelect={(sk) => handleSelect(id, sk)}
              onDragStart={() => handleDragStart(id)}
              onDragDelta={handleDragDelta}
              onDragEnd={handleDragEnd}
              screenToWorld={screenToWorld}
              getScreenPos={getScreenPos}
            />
          );
        })}

        {/* ── Connectors (above frames, behind shapes) ── */}
        {connectorEntries.map(([id, layer]) => {
          if (!layer || layer.type !== "connector") return null;
          const conn = layer as ConnectorLayer;
          return (
            <ConnectorElement
              key={id}
              id={id}
              layer={conn}
              fromLayer={layers.get(conn.fromId)}
              toLayer={layers.get(conn.toId)}
              selected={selectedIds.has(id)}
              onSelect={(sk) => handleSelect(id, sk)}
            />
          );
        })}

        {/* ── Shapes and other layers (above connectors) ── */}
        {shapeEntries.map(([id, layer]) => {
          if (!layer) return null;
          const selected = selectedIds.has(id);

          if (layer.type === "sticky") return (
            <StickyNote key={id} id={id} layer={layer as StickyLayer} selected={selected}
              onSelect={(sk) => handleSelect(id, sk)}
              onDragStart={() => handleDragStart(id)}
              onDragDelta={handleDragDelta} onDragEnd={handleDragEnd}
              screenToWorld={screenToWorld} getScreenPos={getScreenPos} />
          );
          if (layer.type === "rectangle") return (
            <ShapeRectangle key={id} id={id} layer={layer as RectangleLayer} selected={selected}
              onSelect={(sk) => handleSelect(id, sk)}
              onDragStart={() => handleDragStart(id)}
              onDragDelta={handleDragDelta} onDragEnd={handleDragEnd}
              screenToWorld={screenToWorld} getScreenPos={getScreenPos} />
          );
          if (layer.type === "circle") return (
            <ShapeCircle key={id} id={id} layer={layer as CircleLayer} selected={selected}
              onSelect={(sk) => handleSelect(id, sk)}
              onDragStart={() => handleDragStart(id)}
              onDragDelta={handleDragDelta} onDragEnd={handleDragEnd}
              screenToWorld={screenToWorld} getScreenPos={getScreenPos} />
          );
          if (layer.type === "text") return (
            <TextElement key={id} id={id} layer={layer as TextLayer} selected={selected}
              onSelect={(sk) => handleSelect(id, sk)}
              onDragStart={() => handleDragStart(id)}
              onDragDelta={handleDragDelta} onDragEnd={handleDragEnd}
              screenToWorld={screenToWorld} getScreenPos={getScreenPos} />
          );
          if (layer.type === "line") return (
            <LineElement key={id} id={id} layer={layer as LineLayer} selected={selected}
              onSelect={(sk) => handleSelect(id, sk)}
              onDragStart={() => handleDragStart(id)}
              onDragDelta={handleDragDelta} onDragEnd={handleDragEnd}
              screenToWorld={screenToWorld} getScreenPos={getScreenPos} />
          );
          return null;
        })}

        {/* ── Connector anchor dots (shown on hover when connector tool active) ── */}
        {hoverAnchors?.map((a) => (
          <div
            key={a.key}
            className={styles.connectorAnchor}
            style={{ left: a.wx, top: a.wy }}
          />
        ))}

        {/* ── Connector draft preview line ── */}
        {connectorDraft && (() => {
          const [fx, fy] = connectorDraft.fromPt;
          const [cx, cy] = connectorDraft.currentPt;
          const pad = 10;
          const left   = Math.min(fx, cx) - pad;
          const top    = Math.min(fy, cy) - pad;
          const width  = Math.abs(fx - cx) + pad * 2;
          const height = Math.abs(fy - cy) + pad * 2;
          return (
            <svg
              style={{
                position: "absolute",
                left,
                top,
                width,
                height,
                overflow: "visible",
                pointerEvents: "none",
              }}
            >
              <line
                x1={fx - left} y1={fy - top}
                x2={cx - left} y2={cy - top}
                stroke="#3b82f6"
                strokeWidth={2}
                strokeDasharray="6,3"
                strokeLinecap="round"
              />
            </svg>
          );
        })()}
      </div>

      {/* Hand-mode overlay — covers objects so all drags pan */}
      {isHandMode && (
        <div
          className={styles.handOverlay}
          onPointerDown={handleBoardPointerDown}
          onPointerMove={handleBoardPointerMove}
          onPointerUp={handleBoardPointerUp}
          onPointerLeave={handleBoardPointerUp}
        />
      )}

      {/* Connector-mode overlay — captures pointer events for drawing connectors */}
      {isConnectorMode && (
        <div
          className={styles.connectorOverlay}
          onPointerMove={handleConnectorPointerMove}
          onPointerDown={handleConnectorPointerDown}
          onPointerUp={handleConnectorPointerUp}
          onPointerLeave={handleConnectorOverlayLeave}
        />
      )}

      {/* Marquee rectangle (screen space) */}
      {marquee && (
        <div
          className={styles.marquee}
          style={{
            left: Math.min(marquee.startSx, marquee.currentSx),
            top: Math.min(marquee.startSy, marquee.currentSy),
            width: Math.abs(marquee.currentSx - marquee.startSx),
            height: Math.abs(marquee.currentSy - marquee.startSy),
          }}
        />
      )}

      <Avatars />
      <CursorPresence />

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className={styles.toolbar}>

        {/* Tool mode buttons */}
        <div className={styles.toolModeGroup}>
          <button
            type="button"
            title="Select (V)"
            className={`${styles.toolModeBtn} ${toolMode === "select" && !isSpaceDown ? styles.toolModeBtnActive : ""}`}
            onClick={() => setToolMode("select")}
          >
            <MousePointer2 size={16} />
          </button>
          <button
            type="button"
            title="Hand / Pan (H)"
            className={`${styles.toolModeBtn} ${toolMode === "hand" || isSpaceDown ? styles.toolModeBtnActive : ""}`}
            onClick={() => setToolMode("hand")}
          >
            <Hand size={16} />
          </button>
          <button
            type="button"
            title="Connector (C)"
            className={`${styles.toolModeBtn} ${isConnectorMode ? styles.toolModeBtnActive : ""}`}
            onClick={() => setToolMode("connector")}
          >
            <Spline size={16} />
          </button>
        </div>

        <div className={styles.toolbarDivider} />

        {/* Shape creation */}
        <button type="button" onClick={addSticky} className={`${styles.toolbarButton} ${styles.addStickyButton}`} title="Add Sticky Note">
          <StickyIcon size={20} /><span className={styles.buttonLabel}>Sticky</span>
        </button>
        <button type="button" onClick={addRectangle} className={`${styles.toolbarButton} ${styles.addRectangleButton}`} title="Add Rectangle">
          <Square size={20} /><span className={styles.buttonLabel}>Rectangle</span>
        </button>
        <button type="button" onClick={addCircle} className={`${styles.toolbarButton} ${styles.addCircleButton}`} title="Add Circle">
          <Circle size={20} /><span className={styles.buttonLabel}>Circle</span>
        </button>
        <button type="button" onClick={addText} className={`${styles.toolbarButton} ${styles.addTextButton}`} title="Add Text">
          <Type size={20} /><span className={styles.buttonLabel}>Text</span>
        </button>
        <button type="button" onClick={() => addLine("straight")} className={`${styles.toolbarButton} ${styles.addLineButton}`} title="Add Line">
          <MoveUpRight size={20} /><span className={styles.buttonLabel}>Line</span>
        </button>
        <button type="button" onClick={() => addLine("arrow")} className={`${styles.toolbarButton} ${styles.addArrowButton}`} title="Add Arrow">
          <MoveUpRight size={20} className={styles.arrowIcon} /><span className={styles.buttonLabel}>Arrow</span>
        </button>
        <button type="button" onClick={addFrame} className={`${styles.toolbarButton} ${styles.addFrameButton}`} title="Add Frame">
          <FrameIcon size={20} /><span className={styles.buttonLabel}>Frame</span>
        </button>

        {/* Formatting — only shown when something is selected */}
        {hasSelection && (
          <>
            <div className={styles.toolbarDivider} />

            {hasStickyOrText && (
              <FontSizeControl
                value={currentFontSize}
                onDecrease={() => applyFontSizeDelta(-2)}
                onIncrease={() => applyFontSizeDelta(2)}
              />
            )}

            {hasFillable && (
              <ColorPalette label="Fill" value={currentFillColor} onChange={applyFillColor} />
            )}

            {hasText && (
              <ColorPalette label="Text Color" value={currentTextColor} onChange={applyTextColor} />
            )}

            {hasLine && (
              <ColorPalette label="Stroke" value={currentStrokeColor} onChange={applyStrokeColor} />
            )}

            {hasConnector && (
              <>
                <ColorPalette
                  label="Connector Color"
                  value={currentConnectorColor}
                  onChange={applyStrokeColor}
                />
                <ConnectorStyleControl
                  value={currentConnectorStyle}
                  onChange={applyConnectorStyle}
                />
                <ConnectorEndpointControl
                  value={currentConnectorEndpoints}
                  onChange={applyConnectorEndpoints}
                />
              </>
            )}

            <div className={styles.toolbarDivider} />

            <button type="button" onClick={duplicateSelected} className={`${styles.toolbarButton} ${styles.duplicateButton}`} title="Duplicate (⌘D)">
              <Copy size={20} /><span className={styles.buttonLabel}>Duplicate</span>
            </button>
            <button type="button" onClick={deleteSelected} className={`${styles.toolbarButton} ${styles.deleteButton}`} title="Delete (Del)">
              <Trash2 size={20} /><span className={styles.buttonLabel}>Delete</span>
            </button>
          </>
        )}

        <div className={styles.toolbarDivider} />

        <button type="button" onClick={resetView} className={`${styles.toolbarButton} ${styles.resetButton}`} title="Reset View">
          <Home size={20} /><span className={styles.buttonLabel}>Reset</span>
        </button>
      </div>

      {/* Help button (bottom-right) */}
      <button
        type="button"
        className={styles.helpButton}
        onClick={() => setShowHelp(true)}
        title="Keyboard shortcuts (?)"
      >
        <HelpCircle size={18} />
      </button>

      {/* Help modal */}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
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
