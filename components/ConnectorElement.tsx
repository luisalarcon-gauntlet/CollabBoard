"use client";

import { memo, useCallback } from "react";
import type { ConnectorLayer, LayerData } from "@/lib/yjs-store";
import styles from "./ConnectorElement.module.css";

// ── Constants ──────────────────────────────────────────────────────────────────

const SVG_PAD = 40;
const ARROW_SIZE = 10;

// ── Geometry helpers ───────────────────────────────────────────────────────────

export interface LayerBounds {
  cx: number;
  cy: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Compute the axis-aligned bounding box + center for any non-connector layer. */
export function getLayerBounds(layer: LayerData): LayerBounds | null {
  if (layer.type === "connector") return null;

  if (layer.type === "line") {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [px, py] of layer.points) {
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
    return {
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      x1: minX, y1: minY, x2: maxX, y2: maxY,
    };
  }

  // All remaining types have x, y, width?, height?
  const w = (layer as { width?: number }).width ?? 0;
  const h = (layer as { height?: number }).height ?? 0;
  return {
    cx: layer.x + w / 2,
    cy: layer.y + h / 2,
    x1: layer.x,
    y1: layer.y,
    x2: layer.x + w,
    y2: layer.y + h,
  };
}

type EdgeDir = "left" | "right" | "top" | "bottom";

/**
 * Cast a ray from (cx, cy) toward (targetX, targetY) and return the first
 * intersection with the rectangle [x1,y1]–[x2,y2] plus which edge was hit.
 * Prevents the connector line from starting/ending inside the shape fill.
 */
function rectEdgePoint(
  cx: number, cy: number,
  targetX: number, targetY: number,
  x1: number, y1: number, x2: number, y2: number,
): { pt: [number, number]; edge: EdgeDir } {
  const dx = targetX - cx;
  const dy = targetY - cy;

  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return { pt: [cx, y1], edge: "top" };
  }

  let bestT = Infinity;
  let best: [number, number] = [cx, cy];
  let bestEdge: EdgeDir = "top";

  const check = (t: number, x: number, y: number, edge: EdgeDir) => {
    if (
      t > 0.001 &&
      t < bestT &&
      x >= x1 - 0.5 && x <= x2 + 0.5 &&
      y >= y1 - 0.5 && y <= y2 + 0.5
    ) {
      bestT = t;
      best = [Math.max(x1, Math.min(x2, x)), Math.max(y1, Math.min(y2, y))];
      bestEdge = edge;
    }
  };

  if (Math.abs(dx) > 0.001) {
    const t1 = (x2 - cx) / dx;
    check(t1, x2, cy + t1 * dy, "right");
    const t2 = (x1 - cx) / dx;
    check(t2, x1, cy + t2 * dy, "left");
  }
  if (Math.abs(dy) > 0.001) {
    const t3 = (y2 - cy) / dy;
    check(t3, cx + t3 * dx, y2, "bottom");
    const t4 = (y1 - cy) / dy;
    check(t4, cx + t4 * dx, y1, "top");
  }

  return { pt: best, edge: bestEdge };
}

// Unit vectors pointing OUTWARD from each edge (away from the shape interior)
const OUTWARD: Record<EdgeDir, [number, number]> = {
  right: [1, 0],
  left: [-1, 0],
  bottom: [0, 1],
  top: [0, -1],
};

// Unit vectors pointing INWARD toward each edge (direction the connector arrives)
const INWARD: Record<EdgeDir, [number, number]> = {
  right: [-1, 0],
  left: [1, 0],
  bottom: [0, -1],
  top: [0, 1],
};

interface PathInfo {
  /** SVG path d attribute in world-space coordinates. */
  pathD: string;
  /** All significant points (endpoints + control/elbow points) in world space. */
  allPts: [number, number][];
  /** Unit vector in the direction the connector arrives at the target (for arrowhead). */
  arrowNx: number;
  arrowNy: number;
  /** World-space midpoint for label placement. */
  midPt: [number, number];
}

/**
 * Build the SVG path string + metadata for the three routing styles.
 * All coordinates are in world space; the SVG will be offset by its own top-left.
 */
function computeConnectorPath(
  layer: ConnectorLayer,
  srcBounds: LayerBounds,
  tgtBounds: LayerBounds,
): PathInfo {
  const { pt: srcPt, edge: srcEdge } = rectEdgePoint(
    srcBounds.cx, srcBounds.cy,
    tgtBounds.cx, tgtBounds.cy,
    srcBounds.x1, srcBounds.y1, srcBounds.x2, srcBounds.y2,
  );
  const { pt: tgtPt, edge: tgtEdge } = rectEdgePoint(
    tgtBounds.cx, tgtBounds.cy,
    srcBounds.cx, srcBounds.cy,
    tgtBounds.x1, tgtBounds.y1, tgtBounds.x2, tgtBounds.y2,
  );

  const [sx, sy] = srcPt;
  const [tx, ty] = tgtPt;

  // ── Straight ──────────────────────────────────────────────────────────────
  if (layer.style === "straight") {
    const dx = tx - sx;
    const dy = ty - sy;
    const len = Math.hypot(dx, dy) || 1;
    return {
      pathD: `M ${sx},${sy} L ${tx},${ty}`,
      allPts: [[sx, sy], [tx, ty]],
      arrowNx: dx / len,
      arrowNy: dy / len,
      midPt: [(sx + tx) / 2, (sy + ty) / 2],
    };
  }

  // ── Curved (cubic bezier with tangents aligned to exit/entry edges) ────────
  if (layer.style === "curved") {
    const dist = Math.hypot(tx - sx, ty - sy);
    const controlLen = Math.max(60, dist * 0.4);

    const [o1x, o1y] = OUTWARD[srcEdge];
    const [o2x, o2y] = OUTWARD[tgtEdge];

    const cp1x = sx + o1x * controlLen;
    const cp1y = sy + o1y * controlLen;
    const cp2x = tx + o2x * controlLen;
    const cp2y = ty + o2y * controlLen;

    const [inx, iny] = INWARD[tgtEdge];

    // Bezier midpoint at t=0.5: B(0.5) = 0.125*P0 + 0.375*P1 + 0.375*P2 + 0.125*P3
    const midX = 0.125 * sx + 0.375 * cp1x + 0.375 * cp2x + 0.125 * tx;
    const midY = 0.125 * sy + 0.375 * cp1y + 0.375 * cp2y + 0.125 * ty;

    return {
      pathD: `M ${sx},${sy} C ${cp1x},${cp1y} ${cp2x},${cp2y} ${tx},${ty}`,
      allPts: [[sx, sy], [cp1x, cp1y], [cp2x, cp2y], [tx, ty]],
      arrowNx: inx,
      arrowNy: iny,
      midPt: [midX, midY],
    };
  }

  // ── Elbow / Manhattan routing (3 orthogonal segments) ─────────────────────
  // Route H→V→H if the source exits horizontally, otherwise V→H→V.
  const exitHoriz = srcEdge === "left" || srcEdge === "right";
  let pathD: string;
  let elbowPts: [number, number][];
  let arrowNx: number, arrowNy: number;

  if (exitHoriz) {
    const midX = (sx + tx) / 2;
    pathD = `M ${sx},${sy} H ${midX} V ${ty} H ${tx}`;
    elbowPts = [[sx, sy], [midX, sy], [midX, ty], [tx, ty]];
    arrowNx = tx > midX ? 1 : -1;
    arrowNy = 0;
  } else {
    const midY = (sy + ty) / 2;
    pathD = `M ${sx},${sy} V ${midY} H ${tx} V ${ty}`;
    elbowPts = [[sx, sy], [sx, midY], [tx, midY], [tx, ty]];
    arrowNx = 0;
    arrowNy = ty > midY ? 1 : -1;
  }

  const mid = elbowPts[Math.floor(elbowPts.length / 2)];
  return {
    pathD,
    allPts: elbowPts,
    arrowNx,
    arrowNy,
    midPt: mid,
  };
}

/**
 * Build the SVG polygon points string for a filled arrowhead at (tx, ty)
 * pointing in direction (nx, ny).
 */
function arrowheadPolygon(
  tx: number, ty: number,
  nx: number, ny: number,
  size: number,
): string {
  const halfBase = size * 0.5;
  // Perpendicular to the arrow direction
  const ox = -ny * halfBase;
  const oy = nx * halfBase;
  const bx = tx - nx * size;
  const by = ty - ny * size;
  return `${tx},${ty} ${bx + ox},${by + oy} ${bx - ox},${by - oy}`;
}

// ── ConnectorElement component ─────────────────────────────────────────────────

export interface ConnectorElementProps {
  id: string;
  layer: ConnectorLayer;
  /** Live snapshot of the source layer (updated by useYjsStore). */
  fromLayer: LayerData | undefined;
  /** Live snapshot of the target layer (updated by useYjsStore). */
  toLayer: LayerData | undefined;
  selected: boolean;
  onSelect: (shiftKey: boolean) => void;
}

function ConnectorElementInner({
  layer,
  fromLayer,
  toLayer,
  selected,
  onSelect,
}: ConnectorElementProps) {
  // Gracefully skip if either endpoint is missing or it's a self-loop
  if (!fromLayer || !toLayer || layer.fromId === layer.toId) return null;

  const srcBounds = getLayerBounds(fromLayer);
  const tgtBounds = getLayerBounds(toLayer);
  if (!srcBounds || !tgtBounds) return null;

  const { pathD: worldPathD, allPts, arrowNx, arrowNy, midPt } =
    computeConnectorPath(layer, srcBounds, tgtBounds);

  // ── SVG bounding box ─────────────────────────────────────────────────────
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [px, py] of allPts) {
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  }

  const svgLeft = minX - SVG_PAD;
  const svgTop  = minY - SVG_PAD;
  const svgW    = Math.max(maxX - minX + 2 * SVG_PAD, 2 * SVG_PAD);
  const svgH    = Math.max(maxY - minY + 2 * SVG_PAD, 2 * SVG_PAD);

  // ── Translate world-space path to SVG-local coordinates ──────────────────
  const lx = (wx: number) => wx - svgLeft;
  const ly = (wy: number) => wy - svgTop;

  const localPts = allPts.map(([px, py]): [number, number] => [lx(px), ly(py)]);
  const [localTx, localTy] = localPts[localPts.length - 1];
  const [localMidX, localMidY] = [lx(midPt[0]), ly(midPt[1])];

  // Rebuild path in local SVG space
  let localPathD: string;
  if (layer.style === "straight") {
    localPathD = `M ${localPts[0][0]},${localPts[0][1]} L ${localPts[1][0]},${localPts[1][1]}`;
  } else if (layer.style === "curved") {
    const [s, cp1, cp2, t] = localPts;
    localPathD = `M ${s[0]},${s[1]} C ${cp1[0]},${cp1[1]} ${cp2[0]},${cp2[1]} ${t[0]},${t[1]}`;
  } else {
    // Elbow: reconstruct H/V segments
    if (localPts.length === 4) {
      const exitHoriz = Math.abs(localPts[1][1] - localPts[0][1]) < 0.5; // midPt shares y with src → exited horizontally
      if (exitHoriz) {
        localPathD = `M ${localPts[0][0]},${localPts[0][1]} H ${localPts[1][0]} V ${localPts[2][1]} H ${localPts[3][0]}`;
      } else {
        localPathD = `M ${localPts[0][0]},${localPts[0][1]} V ${localPts[1][1]} H ${localPts[2][0]} V ${localPts[3][1]}`;
      }
    } else {
      localPathD = localPts.map(([px, py], i) => `${i === 0 ? "M" : "L"} ${px},${py}`).join(" ");
    }
  }

  const { color, width: strokeWidth, dashArray } = layer.stroke;
  const hitStrokeWidth = Math.max(16, strokeWidth + 12);
  const arrowSize = ARROW_SIZE + strokeWidth;

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      onSelect(e.shiftKey);
    },
    [onSelect],
  );

  // Suppress unused variable warning — worldPathD is kept for potential future use
  void worldPathD;

  return (
    <svg
      className={styles.svgWrapper}
      style={{ left: svgLeft, top: svgTop, width: svgW, height: svgH }}
    >
      {/* Blue glow when selected */}
      {selected && (
        <path
          d={localPathD}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={strokeWidth + 6}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.35}
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* Invisible wide hit area for easy pointer interaction */}
      <path
        d={localPathD}
        fill="none"
        stroke="transparent"
        strokeWidth={hitStrokeWidth}
        style={{ cursor: "pointer", pointerEvents: "stroke" }}
        onPointerDown={handlePointerDown}
      />

      {/* Main visible stroke */}
      <path
        d={localPathD}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={dashArray ?? undefined}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ pointerEvents: "none" }}
      />

      {/* Source endpoint dot */}
      {layer.endpoints === "dot" && (
        <circle
          cx={localPts[0][0]}
          cy={localPts[0][1]}
          r={strokeWidth * 1.5 + 2}
          fill={color}
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* Target arrowhead */}
      {layer.endpoints === "arrow" && (
        <polygon
          points={arrowheadPolygon(localTx, localTy, arrowNx, arrowNy, arrowSize)}
          fill={color}
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* Target dot */}
      {layer.endpoints === "dot" && (
        <circle
          cx={localTx}
          cy={localTy}
          r={strokeWidth * 1.5 + 2}
          fill={color}
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* Label rendered at the path midpoint with a white stroke for legibility */}
      {layer.label && (
        <text
          x={localMidX}
          y={localMidY - 8}
          textAnchor="middle"
          dominantBaseline="auto"
          fontSize={12}
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fill="#1e293b"
          stroke="white"
          strokeWidth={3}
          paintOrder="stroke"
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {layer.label}
        </text>
      )}
    </svg>
  );
}

export const ConnectorElement = memo(ConnectorElementInner);
