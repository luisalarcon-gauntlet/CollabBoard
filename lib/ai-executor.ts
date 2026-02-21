import * as Y from "yjs";
import type {
  LayerData,
  StickyLayer,
  RectangleLayer,
  CircleLayer,
  TextLayer,
  FrameLayer,
} from "@/lib/yjs-store";

// ── Default dimensions (kept consistent with Whiteboard.tsx constants) ────────

const DEFAULT_STICKY_WIDTH  = 200;
const DEFAULT_STICKY_HEIGHT = 150;
const DEFAULT_RECT_SIZE     = 120;
const DEFAULT_CIRCLE_SIZE   = 120;
const DEFAULT_TEXT_WIDTH    = 200;
const DEFAULT_TEXT_HEIGHT   = 40;
const DEFAULT_FRAME_WIDTH   = 600;
const DEFAULT_FRAME_HEIGHT  = 400;

const GRID_SPACING          = 20;
const FRAME_FIT_PADDING     = 40;

// ── Helpers ───────────────────────────────────────────────────────────────────

function randomHex(): string {
  return `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0")}`;
}

/**
 * Normalise a color from the AI — accepts CSS hex strings or legacy numeric
 * values and always returns a CSS hex string or undefined.
 */
function normaliseColor(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number") return `#${value.toString(16).padStart(6, "0")}`;
  return undefined;
}

function toNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return isFinite(n) ? n : fallback;
}

function makeId(): string {
  return `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Returns the axis-aligned bounding box of a layer.
 * Returns null for connector/line layers (no fixed bbox).
 */
function getLayerBounds(
  layer: LayerData,
): { x: number; y: number; w: number; h: number } | null {
  if (layer.type === "connector" || layer.type === "line") return null;

  const x = (layer as { x: number }).x;
  const y = (layer as { y: number }).y;

  let w: number;
  let h: number;

  switch (layer.type) {
    case "sticky":
      w = layer.width  ?? DEFAULT_STICKY_WIDTH;
      h = layer.height ?? DEFAULT_STICKY_HEIGHT;
      break;
    case "rectangle":
    case "circle":
    case "frame":
      w = (layer as { width: number }).width;
      h = (layer as { height: number }).height;
      break;
    case "text":
      w = layer.width;
      h = layer.height;
      break;
    default:
      w = DEFAULT_RECT_SIZE;
      h = DEFAULT_RECT_SIZE;
  }

  return { x, y, w, h };
}

// ── Layer builders ────────────────────────────────────────────────────────────

function buildStickyLayer(input: Record<string, unknown>): StickyLayer {
  return {
    type:     "sticky",
    x:        toNumber(input.x, 100),
    y:        toNumber(input.y, 100),
    width:    toNumber(input.width,  DEFAULT_STICKY_WIDTH),
    height:   toNumber(input.height, DEFAULT_STICKY_HEIGHT),
    text:     typeof input.text === "string" ? input.text : "",
    bgColor:  normaliseColor(input.fill ?? input.bgColor) ?? "#fffbeb",
    rotation: toNumber(input.rotation, 0),
  };
}

function buildRectangleLayer(input: Record<string, unknown>): RectangleLayer {
  return {
    type:     "rectangle",
    x:        toNumber(input.x, 100),
    y:        toNumber(input.y, 100),
    width:    toNumber(input.width,  DEFAULT_RECT_SIZE),
    height:   toNumber(input.height, DEFAULT_RECT_SIZE),
    fill:     normaliseColor(input.fill),
    rotation: toNumber(input.rotation, 0),
  };
}

function buildCircleLayer(input: Record<string, unknown>): CircleLayer {
  return {
    type:     "circle",
    x:        toNumber(input.x, 100),
    y:        toNumber(input.y, 100),
    width:    toNumber(input.width,  DEFAULT_CIRCLE_SIZE),
    height:   toNumber(input.height, DEFAULT_CIRCLE_SIZE),
    fill:     normaliseColor(input.fill),
    rotation: toNumber(input.rotation, 0),
  };
}

function buildTextLayer(input: Record<string, unknown>): TextLayer {
  return {
    type:       "text",
    x:          toNumber(input.x, 100),
    y:          toNumber(input.y, 100),
    width:      toNumber(input.width,  DEFAULT_TEXT_WIDTH),
    height:     toNumber(input.height, DEFAULT_TEXT_HEIGHT),
    text:       typeof input.text === "string" ? input.text : "",
    fontSize:   toNumber(input.fontSize, 16),
    fontWeight: typeof input.fontWeight === "string" ? input.fontWeight : "normal",
    color:      normaliseColor(input.fill ?? input.color) ?? "#000000",
  };
}

function buildFrameLayer(input: Record<string, unknown>): FrameLayer {
  return {
    type:            "frame",
    x:               toNumber(input.x, 100),
    y:               toNumber(input.y, 100),
    width:           toNumber(input.width,  DEFAULT_FRAME_WIDTH),
    height:          toNumber(input.height, DEFAULT_FRAME_HEIGHT),
    title:           typeof input.title === "string" ? input.title : "Frame",
    backgroundColor: normaliseColor(input.fill ?? input.backgroundColor) ?? "#f8fafc",
  };
}

function buildLayer(input: Record<string, unknown>): LayerData | null {
  switch (input.type) {
    case "sticky":    return buildStickyLayer(input);
    case "rectangle": return buildRectangleLayer(input);
    case "circle":    return buildCircleLayer(input);
    case "text":      return buildTextLayer(input);
    case "frame":     return buildFrameLayer(input);
    default:
      console.warn("[ai-executor] Unknown layer type:", input.type);
      return null;
  }
}

// ── Tool handlers ─────────────────────────────────────────────────────────────

function handleCreateLayer(
  args: Record<string, unknown>,
  sharedLayers: Y.Map<LayerData>,
): void {
  const layer = buildLayer(args);
  if (!layer) return;
  sharedLayers.set(makeId(), layer);
}

function handleCreateBulkLayers(
  args: Record<string, unknown>,
  sharedLayers: Y.Map<LayerData>,
): void {
  const defs = Array.isArray(args.layers)
    ? (args.layers as Record<string, unknown>[])
    : [];

  // Build all layers first (CPU-only), then write them in a single pass.
  // Because this function is already called inside ydoc.transact, every
  // sharedLayers.set is part of the same atomic Yjs update — one broadcast,
  // no matter how large the batch.
  const built: Array<[string, LayerData]> = [];
  for (const def of defs) {
    const layer = buildLayer(def);
    if (layer) built.push([makeId(), layer]);
  }
  for (const [id, layer] of built) {
    sharedLayers.set(id, layer);
  }
}

function handleUpdateLayers(
  args: Record<string, unknown>,
  sharedLayers: Y.Map<LayerData>,
): void {
  const ids  = Array.isArray(args.ids) ? (args.ids as string[]) : [];
  const props = (args.properties ?? {}) as Record<string, unknown>;

  for (const id of ids) {
    const existing = sharedLayers.get(id);
    if (!existing) {
      console.warn(`[ai-executor] update_layers: "${id}" not found, skipping.`);
      continue;
    }

    const updated = { ...existing } as LayerData;

    if ("x" in props)      (updated as { x: number }).x      = toNumber(props.x,      (existing as { x: number }).x);
    if ("y" in props)      (updated as { y: number }).y      = toNumber(props.y,      (existing as { y: number }).y);
    if ("width"  in props && "width"  in updated) (updated as { width: number }).width  = toNumber(props.width,  (updated as { width: number }).width);
    if ("height" in props && "height" in updated) (updated as { height: number }).height = toNumber(props.height, (updated as { height: number }).height);

    if ("text" in props && "text" in updated && typeof props.text === "string") {
      (updated as { text: string }).text = props.text;
    }

    const newColor = normaliseColor(
      props.fill ?? props.color ?? props.bgColor ?? props.backgroundColor,
    );
    if (newColor !== undefined) {
      if (updated.type === "sticky")    updated.bgColor          = newColor;
      if (updated.type === "rectangle") updated.fill             = newColor;
      if (updated.type === "circle")    updated.fill             = newColor;
      if (updated.type === "text")      updated.color            = newColor;
      if (updated.type === "frame")     updated.backgroundColor  = newColor;
    }

    if ("title" in props && updated.type === "frame" && typeof props.title === "string") {
      updated.title = props.title;
    }

    if ("rotation" in props && (updated.type === "sticky" || updated.type === "rectangle" || updated.type === "circle")) {
      updated.rotation = toNumber(props.rotation, updated.rotation ?? 0);
    }

    sharedLayers.set(id, updated);
  }
}

function handleDeleteLayers(
  args: Record<string, unknown>,
  sharedLayers: Y.Map<LayerData>,
): void {
  const ids = Array.isArray(args.ids) ? (args.ids as string[]) : [];

  for (const id of ids) {
    if (!sharedLayers.has(id)) {
      console.warn(`[ai-executor] delete_layers: "${id}" not found, skipping.`);
      continue;
    }
    sharedLayers.delete(id);
  }
}

/**
 * arrange_grid — repositions a list of layers into a uniform grid.
 *
 * Strategy: use the maximum item dimensions as the cell size so every cell
 * is the same — predictable and collision-free. The origin defaults to the
 * position of the first item in the list.
 */
function handleArrangeGrid(
  args: Record<string, unknown>,
  sharedLayers: Y.Map<LayerData>,
): void {
  const ids     = Array.isArray(args.ids) ? (args.ids as string[]) : [];
  const columns = toNumber(args.columns, 3);
  const spacing = toNumber(args.spacing, GRID_SPACING);

  if (ids.length === 0) return;

  // Collect layers and their bounds, skipping any that don't exist.
  const items: Array<{ id: string; layer: LayerData; bounds: { x: number; y: number; w: number; h: number } }> = [];
  for (const id of ids) {
    const layer = sharedLayers.get(id);
    if (!layer) {
      console.warn(`[ai-executor] arrange_grid: "${id}" not found, skipping.`);
      continue;
    }
    const bounds = getLayerBounds(layer);
    if (!bounds) continue; // skip connectors / lines
    items.push({ id, layer, bounds });
  }

  if (items.length === 0) return;

  // Cell size = max dimensions across all items.
  const cellW = Math.max(...items.map((it) => it.bounds.w));
  const cellH = Math.max(...items.map((it) => it.bounds.h));

  // Origin: AI-provided, or top-left of the first item.
  const originX = toNumber(args.origin_x, items[0].bounds.x);
  const originY = toNumber(args.origin_y, items[0].bounds.y);

  items.forEach(({ id, layer }, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const newX = originX + col * (cellW + spacing);
    const newY = originY + row * (cellH + spacing);

    sharedLayers.set(id, {
      ...layer,
      x: newX,
      y: newY,
    } as LayerData);
  });
}

/**
 * resize_frame_to_fit — shrinks or grows a Frame so it exactly wraps its
 * children with a configurable padding.
 */
function handleResizeFrameToFit(
  args: Record<string, unknown>,
  sharedLayers: Y.Map<LayerData>,
): void {
  const frameId  = typeof args.frame_id === "string" ? args.frame_id : null;
  const childIds = Array.isArray(args.child_ids) ? (args.child_ids as string[]) : [];
  const padding  = toNumber(args.padding, FRAME_FIT_PADDING);

  if (!frameId) {
    console.warn("[ai-executor] resize_frame_to_fit: no frame_id provided.");
    return;
  }

  const frame = sharedLayers.get(frameId);
  if (!frame || frame.type !== "frame") {
    console.warn(`[ai-executor] resize_frame_to_fit: "${frameId}" is not a frame, skipping.`);
    return;
  }

  // Compute the union bounding box of all children.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let found = false;

  for (const childId of childIds) {
    if (childId === frameId) continue; // don't include the frame itself
    const child = sharedLayers.get(childId);
    if (!child) {
      console.warn(`[ai-executor] resize_frame_to_fit: child "${childId}" not found, skipping.`);
      continue;
    }
    const bounds = getLayerBounds(child);
    if (!bounds) continue;

    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.w);
    maxY = Math.max(maxY, bounds.y + bounds.h);
    found = true;
  }

  if (!found) {
    console.warn("[ai-executor] resize_frame_to_fit: no valid children found.");
    return;
  }

  sharedLayers.set(frameId, {
    ...frame,
    x:      minX - padding,
    y:      minY - padding,
    width:  maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  });
}

/**
 * generate_pattern — server-side expansion of bulk identical layers.
 *
 * The AI sends a single compact tool call (e.g. count:100, randomColors:true)
 * and the executor expands it into N layers without the LLM enumerating each
 * one. This collapses "Create 100 rectangles" from ~5 000 output tokens to ~30.
 */
function handleGeneratePattern(
  args: Record<string, unknown>,
  sharedLayers: Y.Map<LayerData>,
): void {
  const type    = typeof args.type === "string" ? args.type : "rectangle";
  const count   = Math.min(toNumber(args.count, 1), 500); // hard cap at 500
  const w       = toNumber(args.width,   DEFAULT_RECT_SIZE);
  const h       = toNumber(args.height,  DEFAULT_RECT_SIZE);
  const columns = toNumber(args.columns, 10);
  const spacing = toNumber(args.spacing, GRID_SPACING);
  const originX = toNumber(args.x,       100);
  const originY = toNumber(args.y,       100);
  const useRandom = args.randomColors === true;
  const fixedFill = normaliseColor(args.fill);

  const built: Array<[string, LayerData]> = [];

  for (let i = 0; i < count; i++) {
    const col  = i % columns;
    const row  = Math.floor(i / columns);
    const x    = originX + col * (w + spacing);
    const y    = originY + row * (h + spacing);
    const fill = useRandom ? randomHex() : fixedFill;

    const input: Record<string, unknown> = { type, x, y, width: w, height: h, fill };
    const layer = buildLayer(input);
    if (layer) built.push([makeId(), layer]);
  }

  for (const [id, layer] of built) {
    sharedLayers.set(id, layer);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface AiToolCall {
  name: string;
  input: Record<string, unknown>;
}

/**
 * Apply a batch of AI-generated tool calls to the shared Yjs document in a
 * single atomic transaction — all changes broadcast as one update to every peer.
 */
export function executeAiTools(
  toolCalls: AiToolCall[],
  sharedLayers: Y.Map<LayerData>,
  ydoc: Y.Doc,
): void {
  ydoc.transact(() => {
    for (const call of toolCalls) {
      try {
        const args = call.input ?? {};
        // Hot path first: bulk creation is the most common AI output.
        switch (call.name) {
          case "generate_pattern":
            handleGeneratePattern(args, sharedLayers);
            break;
          case "create_bulk_layers":
            handleCreateBulkLayers(args, sharedLayers);
            break;
          case "create_layer":
            handleCreateLayer(args, sharedLayers);
            break;
          case "update_layers":
            handleUpdateLayers(args, sharedLayers);
            break;
          case "delete_layers":
            handleDeleteLayers(args, sharedLayers);
            break;
          case "arrange_grid":
            handleArrangeGrid(args, sharedLayers);
            break;
          case "resize_frame_to_fit":
            handleResizeFrameToFit(args, sharedLayers);
            break;
          default:
            console.warn("[ai-executor] Unknown tool call:", call.name);
        }
      } catch (err) {
        // Log without rethrowing — one bad call must not abort the transaction.
        console.error(`[ai-executor] Error in "${call.name}":`, err);
      }
    }
  });
}
