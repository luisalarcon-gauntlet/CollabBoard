import type { LayerData, FrameLayer } from './yjs-store';

// Simple utility for conditionally joining class names
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Returns the IDs of all layers whose bounding boxes are fully contained within
 * the given frame's (x, y, width, height). Connectors and other frames are skipped.
 */
export function getElementsInFrame(
  frameId: string,
  allLayers: Map<string, LayerData>,
): string[] {
  const frame = allLayers.get(frameId);
  if (!frame || frame.type !== 'frame') return [];

  const { x: fx, y: fy, width: fw, height: fh } = frame as FrameLayer;
  const fx2 = fx + fw;
  const fy2 = fy + fh;

  const result: string[] = [];
  for (const [id, layer] of allLayers.entries()) {
    if (id === frameId) continue;
    if (!layer || layer.type === 'connector' || layer.type === 'frame') continue;

    let x1: number, y1: number, x2: number, y2: number;
    if (layer.type === 'line') {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [px, py] of layer.points) {
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
      }
      x1 = minX; y1 = minY; x2 = maxX; y2 = maxY;
    } else {
      x1 = layer.x;
      y1 = layer.y;
      x2 = layer.x + ((layer as { width?: number }).width ?? 0);
      y2 = layer.y + ((layer as { height?: number }).height ?? 0);
    }

    if (x1 >= fx && y1 >= fy && x2 <= fx2 && y2 <= fy2) {
      result.push(id);
    }
  }
  return result;
}
