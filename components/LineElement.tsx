"use client";

import { memo, useCallback, useRef } from "react";
import type { LineLayer } from "@/lib/yjs-store";
import { sharedLayers } from "@/lib/yjs-store";
import styles from "./LineElement.module.css";

/** Extra space around the bounding box so thick strokes / arrowheads aren't clipped. */
const SVG_PAD = 20;

/** Recompute bounding-box origin from a points array. */
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
  onSelect: () => void;
  screenToWorld: (sx: number, sy: number) => { x: number; y: number };
  getScreenPos: (e: { clientX: number; clientY: number }) => { sx: number; sy: number } | null;
}

function LineElementInner({ id, layer, selected, onSelect, screenToWorld, getScreenPos }: LineElementProps) {
  const { points, color, thickness, variant } = layer;

  const bodyDragRef = useRef<{
    startWx: number;
    startWy: number;
    startPoints: [number, number][];
  } | null>(null);

  const endpointDragRef = useRef<{
    index: number;
  } | null>(null);

  const updateLayer = useCallback(
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

  /** World point → SVG-local coordinate. */
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
      onSelect();
      if (e.button !== 0) return;
      const pos = getScreenPos(e);
      if (!pos) return;
      const world = screenToWorld(pos.sx, pos.sy);
      bodyDragRef.current = {
        startWx: world.x,
        startWy: world.y,
        startPoints: points.map((p) => [...p] as [number, number]),
      };
      (e.target as SVGElement).setPointerCapture(e.pointerId);
    },
    [onSelect, getScreenPos, screenToWorld, points]
  );

  const handleEndpointPointerDown = useCallback(
    (e: React.PointerEvent, index: number) => {
      e.stopPropagation();
      onSelect();
      if (e.button !== 0) return;
      endpointDragRef.current = { index };
      (e.target as SVGElement).setPointerCapture(e.pointerId);
    },
    [onSelect]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const pos = getScreenPos(e);
      if (!pos) return;
      const world = screenToWorld(pos.sx, pos.sy);

      if (endpointDragRef.current) {
        const { index } = endpointDragRef.current;
        const newPoints: [number, number][] = points.map((p) => [...p] as [number, number]);
        newPoints[index] = [world.x, world.y];
        updateLayer(newPoints);
      } else if (bodyDragRef.current) {
        const { startWx, startWy, startPoints } = bodyDragRef.current;
        const dx = world.x - startWx;
        const dy = world.y - startWy;
        const newPoints: [number, number][] = startPoints.map(([px, py]) => [px + dx, py + dy]);
        updateLayer(newPoints);
      }
    },
    [points, updateLayer, getScreenPos, screenToWorld]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (e.button === 0) {
      bodyDragRef.current = null;
      endpointDragRef.current = null;
      (e.target as SVGElement).releasePointerCapture(e.pointerId);
    }
  }, []);

  const hitStrokeWidth = Math.max(16, thickness + 10);

  return (
    <svg
      className={styles.svgWrapper}
      style={{ left: svgLeft, top: svgTop, width: svgWidth, height: svgHeight }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {/* Selection outline — rendered first (behind) */}
      {selected && pathD && (
        <path
          className={styles.selectionStroke}
          d={pathD}
          strokeWidth={thickness + 5}
        />
      )}

      {/* Invisible wide hit area for dragging the body */}
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

      {/* Visible line stroke */}
      {pathD && (
        <path
          className={styles.lineStroke}
          d={pathD}
          stroke={color}
          strokeWidth={thickness}
        />
      )}

      {/* Arrowhead polygon */}
      {variant === "arrow" && arrowPolygon && (
        <polygon
          className={styles.arrowHead}
          points={arrowPolygon}
          fill={color}
        />
      )}

      {/* Endpoint drag handles (visible only when selected) */}
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
