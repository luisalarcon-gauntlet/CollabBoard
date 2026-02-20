"use client";

import { memo, useCallback, useRef } from "react";
import type { LineLayer } from "@/lib/yjs-store";
import { sharedLayers } from "@/lib/yjs-store";
import styles from "./LineElement.module.css";

const SVG_PAD = 20;

function bboxOrigin(pts: [number, number][]): { x: number; y: number } {
  let minX = Infinity;
  let minY = Infinity;
  for (const [px, py] of pts) {
    if (px < minX) minX = px;
    if (py < minY) minY = py;
  }
  return { x: minX, y: minY };
}

interface LineElementProps {
  id: string;
  layer: LineLayer;
  selected: boolean;
  onSelect: (shiftKey: boolean) => void;
  onDragStart: () => void;
  onDragDelta: (dx: number, dy: number) => void;
  onDragEnd: () => void;
  screenToWorld: (sx: number, sy: number) => { x: number; y: number };
  getScreenPos: (e: { clientX: number; clientY: number }) => { sx: number; sy: number } | null;
}

function LineElementInner({
  id,
  layer,
  selected,
  onSelect,
  onDragStart,
  onDragDelta,
  onDragEnd,
  screenToWorld,
  getScreenPos,
}: LineElementProps) {
  const { points, color, thickness, variant } = layer;

  // Body drag: world position at drag start (for computing cumulative delta)
  const bodyDragRef = useRef<{ startWx: number; startWy: number } | null>(null);

  // Endpoint drag: moves a single point (bypasses batch drag)
  const endpointDragRef = useRef<{
    index: number;
    startPoints: [number, number][];
  } | null>(null);

  const updateLayerPoints = useCallback(
    (newPoints: [number, number][]) => {
      const current = sharedLayers.get(id) as LineLayer | undefined;
      if (!current || current.type !== "line") return;
      const { x, y } = bboxOrigin(newPoints);
      sharedLayers.set(id, { ...current, points: newPoints, x, y });
    },
    [id]
  );

  // ── Geometry ─────────────────────────────────────────────────────────────
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [px, py] of points) {
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  }

  const svgLeft = minX - SVG_PAD;
  const svgTop = minY - SVG_PAD;
  const svgWidth = Math.max(maxX - minX + 2 * SVG_PAD, 2 * SVG_PAD);
  const svgHeight = Math.max(maxY - minY + 2 * SVG_PAD, 2 * SVG_PAD);

  const toLocal = (p: [number, number]): [number, number] => [
    p[0] - svgLeft,
    p[1] - svgTop,
  ];

  const localPoints = points.map(toLocal);

  const pathD =
    localPoints.length < 2
      ? ""
      : `M ${localPoints[0][0]},${localPoints[0][1]} ` +
        localPoints
          .slice(1)
          .map(([lx, ly]) => `L ${lx},${ly}`)
          .join(" ");

  // ── Arrowhead ─────────────────────────────────────────────────────────────
  let arrowPolygon = "";
  if (variant === "arrow" && localPoints.length >= 2) {
    const last = localPoints[localPoints.length - 1];
    const prev = localPoints[localPoints.length - 2];
    const vx = last[0] - prev[0];
    const vy = last[1] - prev[1];
    const len = Math.hypot(vx, vy) || 1;
    const nx = vx / len;
    const ny = vy / len;
    const px = -ny;
    const py = nx;
    const arrowLen = Math.max(12, thickness * 4);
    const arrowHalf = Math.max(6, thickness * 2);
    const tipX = last[0];
    const tipY = last[1];
    const backX = tipX - arrowLen * nx;
    const backY = tipY - arrowLen * ny;
    arrowPolygon =
      `${tipX},${tipY} ` +
      `${backX + arrowHalf * px},${backY + arrowHalf * py} ` +
      `${backX - arrowHalf * px},${backY - arrowHalf * py}`;
  }

  // ── Event handlers ────────────────────────────────────────────────────────

  const handleBodyPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      onSelect(e.shiftKey);
      if (e.button !== 0) return;
      const pos = getScreenPos(e);
      if (!pos) return;
      const world = screenToWorld(pos.sx, pos.sy);
      bodyDragRef.current = { startWx: world.x, startWy: world.y };
      onDragStart();
      (e.target as SVGElement).setPointerCapture(e.pointerId);
    },
    [onSelect, onDragStart, getScreenPos, screenToWorld]
  );

  const handleEndpointPointerDown = useCallback(
    (e: React.PointerEvent, index: number) => {
      e.stopPropagation();
      onSelect(e.shiftKey);
      if (e.button !== 0) return;
      endpointDragRef.current = {
        index,
        startPoints: points.map((p) => [...p] as [number, number]),
      };
      (e.target as SVGElement).setPointerCapture(e.pointerId);
    },
    [onSelect, points]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const pos = getScreenPos(e);
      if (!pos) return;
      const world = screenToWorld(pos.sx, pos.sy);

      if (endpointDragRef.current) {
        // Single-endpoint drag — direct update, bypasses batch
        const { index, startPoints } = endpointDragRef.current;
        const newPoints: [number, number][] = startPoints.map((p) => [...p] as [number, number]);
        newPoints[index] = [world.x, world.y];
        updateLayerPoints(newPoints);
      } else if (bodyDragRef.current) {
        // Body drag — route through Whiteboard's batch handler
        const dx = world.x - bodyDragRef.current.startWx;
        const dy = world.y - bodyDragRef.current.startWy;
        onDragDelta(dx, dy);
      }
    },
    [points, updateLayerPoints, onDragDelta, getScreenPos, screenToWorld]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (e.button === 0) {
        bodyDragRef.current = null;
        endpointDragRef.current = null;
        onDragEnd();
        (e.target as SVGElement).releasePointerCapture(e.pointerId);
      }
    },
    [onDragEnd]
  );

  const hitStrokeWidth = Math.max(16, thickness + 10);

  return (
    <svg
      className={styles.svgWrapper}
      style={{ left: svgLeft, top: svgTop, width: svgWidth, height: svgHeight }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {selected && pathD && (
        <path
          className={styles.selectionStroke}
          d={pathD}
          strokeWidth={thickness + 5}
        />
      )}

      {pathD && (
        <path
          className={styles.hitStroke}
          d={pathD}
          strokeWidth={hitStrokeWidth}
          onPointerDown={handleBodyPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      )}

      {pathD && (
        <path
          className={styles.lineStroke}
          d={pathD}
          stroke={color}
          strokeWidth={thickness}
        />
      )}

      {variant === "arrow" && arrowPolygon && (
        <polygon
          className={styles.arrowHead}
          points={arrowPolygon}
          fill={color}
        />
      )}

      {selected &&
        localPoints.map(([lx, ly], i) => (
          <circle
            key={i}
            className={styles.endpointHandle}
            cx={lx}
            cy={ly}
            r={6}
            fill="white"
            stroke="#3b82f6"
            strokeWidth={2}
            onPointerDown={(e) => handleEndpointPointerDown(e, i)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
        ))}
    </svg>
  );
}

export const LineElement = memo(LineElementInner);
