# CollabBoard — Comprehensive AI Context for Bug Analysis

> **Purpose of this document:** Give another LLM full, precise context about the CollabBoard codebase so it can reason about potential bugs, race conditions, edge cases, and correctness issues. Every architectural decision, implementation detail, and known fragility is documented here. Read this before analyzing any file in the repo.
>
> **Last updated:** Feb 2026

---

## 1. What Is CollabBoard?

CollabBoard is a **real-time collaborative whiteboard** (think Miro/FigJam, self-hosted). Multiple users join the same board, see each other's cursors, create/edit shapes, and have all changes persist. Sync is powered by **Yjs CRDT** over **Supabase Realtime** with no third-party collaboration backend.

**Live URL pattern:** `/board/[id]` where `id` is a UUID.

---

## 2. Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 16.1.6 |
| UI | React | 19.2.3 |
| Styling | CSS Modules | — |
| CRDT / Sync | Yjs | ^13.6.29 |
| Realtime Transport | Supabase Realtime (broadcast) | ^2.95.3 |
| Persistence | Supabase Postgres (`yjs_updates` table) | — |
| Authentication | Clerk (`@clerk/nextjs`) | ^6.37.4 |
| AI SDK | @anthropic-ai/sdk | ^0.78.0 |
| Testing | Vitest (unit) + Playwright (E2E) | — |

---

## 3. Complete File Structure

```
CollabBoard/
├── app/
│   ├── layout.tsx                    # Root layout — ClerkProvider, Geist fonts
│   ├── page.tsx                      # Landing page — auth gate, redirects to /dashboard
│   ├── globals.css
│   ├── page.module.css
│   ├── board/
│   │   ├── page.tsx                  # /board redirects to /dashboard
│   │   ├── page.module.css
│   │   └── [id]/
│   │       ├── page.tsx              # Main board page — renders <Whiteboard boardId={id}> + <AIChat>
│   │       └── page.module.css
│   ├── dashboard/
│   │   ├── page.tsx                  # Lists user's boards
│   │   ├── page.module.css
│   │   ├── actions.ts                # Server Actions: createBoard, deleteBoard
│   │   ├── BoardCard.tsx             # Board card component with delete
│   │   ├── CreateBoardButton.tsx     # Dialog to create a new board
│   │   └── __tests__/
│   │       ├── BoardCard.test.tsx
│   │       └── CreateBoardButton.test.tsx
│   └── api/
│       └── ai/
│           └── route.ts              # POST /api/ai — SSE streaming, tool-call schema, model routing
│
├── components/
│   ├── Whiteboard.tsx                # ★ Core canvas — 1532 lines — all pointer events, toolbar, layer render
│   ├── Whiteboard.module.css
│   ├── FrameElement.tsx              # Frame — drag/resize via edge strips, title editing
│   ├── ConnectorElement.tsx          # Smart SVG connector — edge-to-edge routing (straight/curved/elbow)
│   ├── StickyNote.tsx                # Sticky note — drag, resize, inline edit, rotation
│   ├── ShapeRectangle.tsx            # Rectangle — drag, resize, fill, rotation
│   ├── ShapeCircle.tsx               # Circle — drag, resize, fill, rotation
│   ├── TextElement.tsx               # Text — drag, resize, inline edit, font
│   ├── LineElement.tsx               # Line/arrow — SVG, endpoint drag
│   ├── AIChat.tsx                    # Floating AI chat UI — SSE consumer, tool executor
│   ├── Avatars.tsx                   # Connected user avatars (top-left)
│   ├── CursorPresence.tsx            # Remote cursor SVG overlays
│   ├── HelpModal.tsx                 # Keyboard shortcut reference
│   └── __tests__/
│       ├── WhiteboardAddShapes.test.tsx
│       ├── WhiteboardConnectors.test.tsx
│       ├── WhiteboardFrames.test.tsx
│       └── WhiteboardMovement.test.tsx
│
├── lib/
│   ├── supabase.ts                   # Supabase anon client singleton
│   ├── yjs-store.ts                  # Y.Doc + layer type defs + per-board boardStore Map
│   ├── useYjsStore.ts                # React hook — subscribes to Y.Map
│   ├── useAwareness.ts               # React hook — returns remote users array
│   ├── supabase-yjs-provider.ts      # Custom Yjs provider (360 lines) — Realtime + Postgres
│   ├── board-transform.tsx           # React context — pan/zoom/tool mode + coordinate conversion
│   ├── utils.ts                      # cn(), isValidUUID(), getElementsInFrame()
│   ├── throttle.ts                   # throttleTrailing() — leading+trailing cursor throttle
│   ├── ai-executor.ts                # Executes AI tool calls atomically on Y.Doc
│   └── __tests__/
│       ├── setup.ts
│       ├── actions.test.ts
│       ├── connection-status.test.ts
│       ├── reconnect.test.ts
│       ├── supabase-yjs-provider.test.ts
│       ├── useYjsStore.test.ts
│       ├── utils.test.ts
│       └── yjs-store.test.ts
│
├── supabase/
│   ├── schema.sql                    # yjs_updates table + RLS
│   └── migrations/
│       └── multi_board_setup.sql     # boards table + RLS
│
├── e2e/
│   ├── auth-flow.spec.ts
│   ├── board-smoke.spec.ts
│   ├── board.spec.ts
│   └── landing.spec.ts
│
├── proxy.ts                          # Next.js middleware — Clerk auth on all routes
├── package.json
├── tsconfig.json
├── next.config.ts                    # yjs/lib0 webpack aliases
├── vitest.config.ts                  # jsdom environment
└── playwright.config.ts
```

---

## 4. Data Model — Yjs Layer Types

All board state lives in a single `Y.Doc` per board, with one `Y.Map<LayerData>` named `"layers"`. Keys are string IDs like `"sticky-1708123456789-abc123"`. This is defined in `lib/yjs-store.ts`.

```typescript
type StickyLayer = {
  type: "sticky";
  x: number; y: number;
  width?: number;    // default 200 — NOTE: optional field
  height?: number;   // default 150 — NOTE: optional field
  text: string;
  fontSize?: number;  // default 14
  bgColor?: string;   // default "#fffbeb"
  rotation?: number;  // degrees clockwise; default 0
};

type RectangleLayer = {
  type: "rectangle";
  x: number; y: number;
  width: number; height: number;  // required
  fill?: string;      // default "#93c5fd"
  rotation?: number;
};

type CircleLayer = {
  type: "circle";
  x: number; y: number;
  width: number; height: number;  // required
  fill?: string;      // default "#86efac"
  rotation?: number;
};

type TextLayer = {
  type: "text";
  x: number; y: number;
  width: number; height: number;  // required
  text: string;
  fontSize: number;   // required
  fontWeight: string; // "normal" | "bold" — required
  color: string;      // required
};

type LineLayer = {
  type: "line";
  x: number; y: number;  // bounding-box top-left (mirrors points)
  points: [number, number][];  // absolute world-space coords — minimum 2 points
  color: string;      // required
  thickness: number;  // required
  variant: "straight" | "arrow";  // required
};

// ConnectorLayer has NO x/y — geometry derived from fromId/toId at render time
type ConnectorLayer = {
  type: "connector";
  fromId: string;   // ID of source layer (any non-connector type)
  toId: string;     // ID of target layer (any non-connector type)
  label?: string;   // optional midpoint label (no edit UI yet)
  style: "straight" | "curved" | "elbow";
  stroke: {
    color: string;
    width: number;
    dashArray?: string;  // SVG stroke-dasharray, e.g. "6,3"
  };
  endpoints: "none" | "arrow" | "dot";
};

type FrameLayer = {
  type: "frame";
  x: number; y: number;
  width: number; height: number;  // required
  title: string;
  backgroundColor: string;
};

type LayerData = StickyLayer | RectangleLayer | CircleLayer | TextLayer | LineLayer | ConnectorLayer | FrameLayer;
```

**Key architectural constraints:**
- `ConnectorLayer` has no position fields — geometry always recomputed from `fromId`/`toId` live bounding boxes
- `FrameLayer` children are NOT stored in the frame — containment computed via `getElementsInFrame()` bounding-box geometry at runtime
- `StickyLayer.width` and `StickyLayer.height` are optional (`?`) — code must handle undefined with fallbacks

---

## 5. State Management Architecture

### 5.1 Per-Board Singleton Store (`lib/yjs-store.ts`)

```typescript
// Module-level singleton Map — lives for the entire browser session
const boardStore = new Map<string, {
  ydoc: Y.Doc;
  provider: SupabaseYjsProvider;
  sharedLayers: Y.Map<LayerData>;
}>();
```

`getOrCreateBoardState(boardId)` creates a new entry if missing. Entry is destroyed via `destroyProvider(boardId)` in `Whiteboard.tsx`'s `useEffect` cleanup.

**Critical:** `boardStore` persists across React unmount/remount cycles. If React StrictMode double-invokes the `useEffect`, `destroyProvider` runs, then `getOrCreateBoardState` creates a fresh provider on re-mount. The old provider's final save runs async in the background.

### 5.2 React Integration (`lib/useYjsStore.ts`)

```typescript
export function useYjsStore(boardId): Map<string, LayerData> {
  const [snapshot, setSnapshot] = useState(() => new Map());
  const refresh = useCallback(() => {
    setSnapshot(layers ? new Map(layers.entries()) : new Map());
  }, [boardId]);

  useEffect(() => {
    layers.observe(refresh);           // fires on every Y.Map change
    refresh();                          // initial snapshot
    provider.loaded.then(() => refresh()); // second refresh after DB load resolves
    return () => layers.unobserve(refresh);
  }, [boardId, refresh]);
}
```

On mount, `setSnapshot` is called **twice** — once immediately, once after `provider.loaded` resolves. This causes two React renders on mount but ensures DB-loaded data is captured.

### 5.3 Coordinate System

```typescript
screenToWorld(sx, sy) => { x: (sx - pan.x) / zoom, y: (sy - pan.y) / zoom }
worldToScreen(wx, wy) => { x: wx * zoom + pan.x,    y: wy * zoom + pan.y }
```

`pan` and `zoom` are React state in `BoardTransformProvider`. A `transformRef` keeps a current snapshot for use inside pointer event handlers (avoids stale closure). Layers are positioned in world space; the `worldTransform` div applies `transform: translate(${pan.x}px, ${pan.y}px) scale(${zoom})`.

**Important:** Zoom bounds are `MIN_ZOOM = 0.01`, `MAX_ZOOM = 100`. The `setZoom` function in `BoardTransformProvider` clamps the value. However, `handleWheel` in `Whiteboard.tsx` computes the new pan offset using the **unclamped** `newZoom` value — see Section 9 (Bugs).

---

## 6. Custom Supabase Yjs Provider (`lib/supabase-yjs-provider.ts`)

The most complex file. 360 lines. Replaces y-websocket/y-webrtc.

### 6.1 Lifecycle

```
constructor()
  → init() [async]
      → loadFromDb()         # SELECT from yjs_updates, Y.applyUpdate
      → setupChannel()       # subscribe to Supabase Realtime broadcast
      → setupDocListener()   # ydoc.on("update") → broadcastUpdate + debounced save
      → setupAwarenessListener()  # awareness.on("update") → broadcastAwareness
      → saveTimer = setInterval(saveToDb, 5000)
      → window.addEventListener("beforeunload", handleUnload)
      → window.addEventListener("offline", handleOffline)
      → window.addEventListener("online", handleOnline)
```

### 6.2 Persistence

- **Load:** `Y.applyUpdate(doc, bytes)` on init. If no row exists, board starts empty.
- **Save (debounced):** After any local doc change, saves within 1 second (clears/resets timer).
- **Save (interval):** Every 5 seconds if not destroyed.
- **Save (beforeunload):** `void this.destroy()` — but `destroy()` is async, so the save may not complete before the page unloads.
- **Format:** `Y.encodeStateAsUpdate()` → base64 TEXT in Postgres `content` column.
- **Upsert:** `{ onConflict: roomColumn }` — single row per `room_id`.

### 6.3 Realtime Broadcast

```typescript
channel = supabase.channel(`yjs-${roomId}`, { config: { broadcast: { self: false } } })
  .on("broadcast", { event: "yjs-update" },    (payload) => Y.applyUpdate(doc, decode(payload.update), "remote"))
  .on("broadcast", { event: "yjs-awareness" }, (payload) => applyAwarenessUpdate(awareness, decode(payload.update), "remote"))
  .subscribe((status) => emitStatus(status === "SUBSCRIBED" ? "connected" : "disconnected"))
```

`self: false` means local changes are not echoed back.

### 6.4 Connection Status

```typescript
private lastStatus: ConnectionStatus = "connected";  // initialized BEFORE any real connection

setStatusCallback(cb) {
  this.statusCallback = cb;
  if (cb) cb(this.lastStatus);  // immediately replays last known status
}
```

**Critical:** `lastStatus` defaults to `"connected"` at construction, before the Realtime channel has subscribed. Any React component that registers its callback before `SUBSCRIBED` fires will immediately receive `"connected"` even if the connection is still being established. The reconnect badge will not show during initial connection failures until the channel emits a status event.

### 6.5 Reconnection

When `window.online` fires (`handleOnline`):
1. Unsubscribes old channel
2. Calls `setupChannel()` to create a fresh subscription
3. Does NOT immediately emit "connected" — waits for `SUBSCRIBED` callback

This means the UI remains "disconnected" during the reconnection handshake, which is correct behavior.

### 6.6 `destroy()` Pattern

```typescript
async destroy(): Promise<void> {
  if (this.destroyed || this.destroying) return;
  this.destroying = true;
  clearInterval(this.saveTimer);
  clearTimeout(this.debounceTimer);
  await this.saveToDb();   // final save — awaited
  this.destroyed = true;
  window.removeEventListener(...);
  channel.unsubscribe();
  awareness.destroy();
}
```

`destroy()` is called from `Whiteboard.tsx`'s `useEffect` cleanup: `return () => { void destroyProvider(boardId); }`. The `void` discards the Promise. **The `await this.saveToDb()` inside destroy may not complete if the browser is closing or the component unmounts during a rapid navigation** — there's no mechanism to ensure the async save finishes before cleanup.

---

## 7. Whiteboard Component (`components/Whiteboard.tsx`, 1532 lines)

### 7.1 Component Structure

```
Whiteboard (props validator)
  └── BoardTransformProvider
        └── WhiteboardClient (SSR guard — renders loading until mounted)
              └── WhiteboardInner (all logic lives here)
```

`WhiteboardClient` uses `useState(false)` + `useEffect` to prevent SSR hydration mismatch (since `getSharedLayers`/`getYdoc` return `null` on server).

### 7.2 Key Refs (stale-closure prevention)

| Ref | Purpose |
|-----|---------|
| `selectedIdsRef` | Mirror of `selectedIds` state for event handlers |
| `isSpaceDownRef` | Mirror of `isSpaceDown` for event handlers |
| `panStartRef` | Pan gesture start position |
| `isMarqueeRef` | Whether a marquee drag is active |
| `dragStartPositions` | `Map<id, {x,y,points?}>` snapshot at drag start |
| `connectorDraftRef` | Mirror of `connectorDraft` state |
| `connectorHoverIdRef` | Mirror of `connectorHoverId` state |
| `cursorThrottleRef` | Throttle instance for awareness cursor (created once per `boardId`) |
| `clipboardRef` | In-memory clipboard for copy/paste |
| `showHelpRef` | Mirror of `showHelp` (checked in wheel handler) |
| `toolModeRef` | Mirror of `toolMode` (checked in keyboard handlers) |
| `transformRef` | Current pan/zoom (from BoardTransformProvider) |

### 7.3 Tool Modes

```typescript
type ToolMode = "select" | "hand" | "connector";
```

| Variable | Meaning |
|----------|---------|
| `isHandMode` | `toolMode === "hand" \|\| isSpaceDown` |
| `isConnectorMode` | `toolMode === "connector" && !isSpaceDown` |

When Space is held, `toolMode` does NOT change — only `isSpaceDown` flips. This allows returning to the correct mode after Space is released.

### 7.4 Layer Z-Order Rendering

```typescript
const frameEntries     = layerEntries.filter(([, l]) => l?.type === "frame");
const connectorEntries = layerEntries.filter(([, l]) => l?.type === "connector");
const shapeEntries     = layerEntries.filter(([, l]) => l?.type !== "connector" && l?.type !== "frame");
// Rendered: frameEntries → connectorEntries → shapeEntries (DOM order = z-stack)
```

### 7.5 Orphan Connector Cleanup

```typescript
useEffect(() => {
  const cleanup = () => {
    const toDelete: string[] = [];
    for (const [id, layer] of sharedLayers.entries()) {
      if (layer?.type !== "connector") continue;
      if (!sharedLayers.has(conn.fromId) || !sharedLayers.has(conn.toId)) {
        toDelete.push(id);
      }
    }
    if (toDelete.length > 0) {
      ydoc.transact(() => { for (const id of toDelete) sharedLayers.delete(id); });
    }
  };
  sharedLayers.observe(cleanup);
  return () => sharedLayers.unobserve(cleanup);
}, []);  // ← empty deps array
```

**Note:** `sharedLayers` and `ydoc` are captured at component mount. They don't change across renders for the same `boardId`, but the empty dep array is technically a lint violation.

### 7.6 Batch Drag

On `handleDragStart(draggedId)`:
1. Collects selected IDs + any contained children of selected frames
2. Snapshots starting positions from live `sharedLayers`
3. Stores in `dragStartPositions.current`

On `handleDragDelta(dx, dy)`:
```typescript
ydoc.transact(() => {
  for (const [id, startPos] of dragStartPositions.current) {
    sharedLayers.set(id, { ...layer, x: startPos.x + dx, y: startPos.y + dy });
  }
});
```
Single transaction = one Yjs broadcast = one undo step.

### 7.7 Connector Creation

```typescript
// handleConnectorPointerUp — no ydoc.transact() wrapper
sharedLayers.set(connId, conn);
updateSelectedIds(new Set([connId]));
```

Connector creation uses a bare `sharedLayers.set()` without `ydoc.transact()`. Yjs treats each un-wrapped `set()` as its own implicit transaction. This is correct but inconsistent with the rest of the codebase.

### 7.8 Paste Accumulates Offset

```typescript
// After paste, clipboardRef is mutated to offset by PASTE_OFFSET:
clipboardRef.current = clipboardRef.current.map((l) => {
  return { ...l, x: l.x + PASTE_OFFSET, y: l.y + PASTE_OFFSET, ... };
});
```

Each Ctrl+V shifts the clipboard items by 20px. Repeated pastes cascade the offset indefinitely. After 10 pastes, items appear 200px away from original. This is by design (standard behavior) but worth noting.

### 7.9 Keyboard Handler Dependencies

The main `onKeyDown` handler is in a `useEffect` with deps `[updateSelectedIds, setToolMode, setConnectorDraft, setConnectorHoverId]`. It captures `sharedLayers`, `ydoc`, `clipboardRef`, `selectedIdsRef`, `toolModeRef`, `showHelpRef`, `isSpaceDownRef` — all via closure. Since these don't change across renders for the same board, this is safe but technically missing from the dep array.

### 7.10 `handleBoardPointerDown` Stale Pan

```typescript
const handleBoardPointerDown = useCallback((e) => {
  // ...
  panStartRef.current = { x: e.clientX, y: e.clientY, startPanX: pan.x, startPanY: pan.y };
}, [pan, getScreenPos]);
```

`pan` is in the dep array, so this handler recreates on every pan change. During a pan gesture, `panStartRef` is set on `pointerdown` and then `panStartRef.startPanX/Y` is used in `handleBoardPointerMove`. The `pan` value captured in `panStartRef` at pointerdown is correct because it's the pan at gesture start. However, the handler is recreated very frequently.

### 7.11 `handleWheel` — Unclamped Zoom Bug

```typescript
const handleWheel = useCallback((e) => {
  const { pan: p, zoom: z } = transformRef.current;
  const worldX = (pos.sx - p.x) / z;
  const worldY = (pos.sy - p.y) / z;
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  const newZoom = z + delta;                         // ← NOT clamped here
  setPan({ x: pos.sx - worldX * newZoom, ... });    // ← uses unclamped newZoom
  setZoom(newZoom);                                  // ← setZoom WILL clamp
}, [...]);
```

`setZoom` in `BoardTransformProvider` clamps to `[MIN_ZOOM, MAX_ZOOM]`. But `setPan` is called with `newZoom` before clamping. If zoom is already at `MIN_ZOOM = 0.01` and the user scrolls down, `newZoom = -0.09`. The pan is then `pos.sx - worldX * (-0.09)` — flipping the sign, causing a large pan jump. Meanwhile `setZoom(-0.09)` clamps to `0.01`, so zoom stays correct but pan is now wrong.

**This is a confirmed bug.** The fix is to clamp `newZoom` before the pan calculation.

---

## 8. Frame System (`components/FrameElement.tsx`)

### 8.1 DOM Layout

```
<div className={frameContainer} style={{ left: x, top: y - TITLE_HEIGHT, width, height: height + TITLE_HEIGHT }}>
  <div titleBar (pointer-events: auto, h=28px)>...</div>
  <div frameBody (pointer-events: none, relative)>
    <div edgeTop    (pointer-events: auto, 8px) />
    <div edgeBottom (pointer-events: auto, 8px) />
    <div edgeLeft   (pointer-events: auto, 8px) />
    <div edgeRight  (pointer-events: auto, 8px) />
  </div>
  {selected && <>
    <div handleNW (top: TITLE_HEIGHT-6) />
    <div handleNE (top: TITLE_HEIGHT-6) />
    <div handleSW />
    <div handleSE />
  </>}
</div>
```

The `frameContainer` div is positioned at `top: y - TITLE_HEIGHT` to make room for the title bar above the frame body.

### 8.2 `updateFrame` — No Transaction Wrapper

```typescript
const updateFrame = useCallback((newX, newY, newWidth, newHeight) => {
  const sharedLayers = getSharedLayers(boardId);
  const current = sharedLayers.get(id) as FrameLayer;
  sharedLayers.set(id, { ...current, x: newX, y: newY, width: newWidth, height: newHeight });
}, [boardId, id]);
```

Called on every `pointermove` during resize. Each call creates a separate Yjs transaction and a separate broadcast. This generates many small updates during resize (potentially 60/s). Compare to batch drag which uses `ydoc.transact()`. The frame does not have access to `ydoc` because it doesn't import it — only `getSharedLayers` is imported.

### 8.3 `handleTitleChange` — No Transaction

Same issue — each keystroke in the title input calls `sharedLayers.set()` directly, creating one Yjs transaction per character.

### 8.4 `handlePointerLeave` Triggers `onDragEnd`

```typescript
onPointerLeave={handlePointerUp}
```

The edge strips and title bar call `handlePointerUp` (which calls `onDragEnd`) on `pointerLeave`. If the user drags quickly past the edge strip while dragging, `onDragEnd` fires prematurely even though the pointer is captured. However, since `setPointerCapture` is called in `handlePointerDown`, `pointerleave` events on the element should not fire while captured... but `onPointerLeave` on the parent div may still fire.

### 8.5 Resize Handle Pointer Capture

```typescript
const handleResizePointerDown = useCallback((e, handle) => {
  (e.target as HTMLElement).setPointerCapture(e.pointerId);
  resizeStartRef.current = { handle, ... };
}, [...]);
```

`setPointerCapture` is set on `e.target` (the handle div). `handlePointerMove` is on the same handle div and also on other elements, so it will receive captured events. But if the user releases outside all tracked elements, `handlePointerUp` may not fire — pointer capture ensures events continue to the capturing element.

### 8.6 `handlePointerUp` — Wrong Element for Release

```typescript
const handlePointerUp = useCallback((e) => {
  if (e.button === 0) {
    dragStartRef.current = null;
    resizeStartRef.current = null;
    onDragEnd();
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }
}, [onDragEnd]);
```

`releasePointerCapture` is called on `e.target`, but the capture was set in `handlePointerDown` on `e.target` at that time. If `e.target` during `pointerup` differs from `e.target` during `pointerdown` (which can happen when elements re-render), the release call may silently fail. The capture expires naturally so this isn't a hard bug, but it's not clean.

---

## 9. Connector System (`components/ConnectorElement.tsx`)

### 9.1 `getLayerBounds` — Exported Function

```typescript
export function getLayerBounds(layer: LayerData): LayerBounds | null {
  if (layer.type === "connector") return null;
  if (layer.type === "line") { ... } // computes bbox of all points
  // For sticky: width ?? 0, height ?? 0 — if optional fields are undefined, bbox is degenerate (0 width/height)
  const w = (layer as { width?: number }).width ?? 0;
  const h = (layer as { height?: number }).height ?? 0;
  return { cx: layer.x + w/2, cy: layer.y + h/2, x1: layer.x, y1: layer.y, x2: layer.x+w, y2: layer.y+h };
}
```

For `StickyLayer` with undefined `width`/`height`, the bbox is `{cx: x, cy: y, x1: x, y1: y, x2: x, y2: y}` — a degenerate zero-area rectangle. A connector attached to such a sticky note would start/end at the top-left corner with no edge routing. In practice this shouldn't occur since the toolbar always sets explicit dimensions.

### 9.2 `rectEdgePoint` — Edge Routing

Uses parametric ray casting from shape center toward the opposing shape center. Checks all four rectangle edges and picks the smallest positive `t`. The `check` function guards against `t <= 0.001` to avoid the "behind the ray" case.

**Edge case:** When two shapes overlap (bounding boxes intersect), `rectEdgePoint` may return a point that appears inside the other shape. The connector will draw but the visual result is counterintuitive.

### 9.3 Elbow Direction Re-Detection in Local Space

```typescript
// When converting world-space path to SVG-local coordinates for elbow style:
const exitHoriz = Math.abs(localPts[1][1] - localPts[0][1]) < 0.5;
```

This heuristic re-determines exit direction in local SVG coordinates (using Y equality). It works for axis-aligned segments but could misclassify if floating-point conversion causes a Y difference > 0.5. The world-space `srcEdge` value is not passed into the SVG reconstruction code — it relies on this geometric approximation.

### 9.4 `ConnectorElement` is `memo`-wrapped

`ConnectorElement = memo(ConnectorElementInner)`. The component receives `fromLayer` and `toLayer` as resolved objects from `useYjsStore`. Since `useYjsStore` returns `new Map(...)` on every change, parent re-renders propagate new object references for `fromLayer`/`toLayer` even if the layer data hasn't changed (shallow comparison fails for objects). `memo` won't help here — the connector always re-renders when any layer changes.

---

## 10. `getElementsInFrame` (`lib/utils.ts`)

```typescript
export function getElementsInFrame(frameId, allLayers): string[] {
  // ...
  // Bounding box for sticky with optional width/height:
  x2 = layer.x + ((layer as { width?: number }).width ?? 0);
  y2 = layer.y + ((layer as { height?: number }).height ?? 0);
  // Containment check (STRICT — child must be fully inside frame):
  if (x1 >= fx && y1 >= fy && x2 <= fx2 && y2 <= fy2) result.push(id);
}
```

- Skips `connector` and `frame` layers (no recursive nesting)
- Uses `?? 0` fallback for optional dimensions — a 0-width sticky would be "contained" if its top-left is inside the frame. This is unlikely in practice but technically possible if someone sets width to 0 via AI.
- Strict containment: **entire** element must be inside. Elements touching the frame border exactly are included (uses `>=` / `<=`).

---

## 11. Cursor Awareness Throttle (`lib/throttle.ts` + `Whiteboard.tsx`)

### 11.1 `throttleTrailing` Implementation

```typescript
const throttled = (...args) => {
  lastArgs = args;
  const now = Date.now();
  if (timer !== null) { clearTimeout(timer); timer = null; }
  const elapsed = now - lastCallTime;
  if (elapsed >= delay) {
    lastCallTime = now;
    fn(...args);
  } else {
    const remaining = delay - elapsed;
    timer = setTimeout(() => {
      lastCallTime = Date.now();
      fn(...(lastArgs as Parameters<T>));
      timer = null;
    }, remaining);
  }
};
```

**Behavior:** Leading edge fires immediately. Subsequent calls within `delay` ms clear and reset the timer. The last call's args are captured in `lastArgs` and fired after the window expires (trailing edge).

**Issue:** The timer is cleared and reset on every intermediate call. This means: if the user moves the mouse continuously at 60fps with `delay=33ms`, the trailing timer is cancelled and re-set on every frame. The trailing call fires only after the mouse stops moving for 33ms. During continuous motion, only the leading-edge call fires (once per 33ms) because the timer never gets to fire — it's always cancelled. Actually wait: the timer is reset to `remaining`, not `delay`. So it fires `remaining` ms after the last call. Since calls arrive every ~16ms and delay=33ms, `elapsed` will usually be < 33ms (second call in ~16ms), so a timer is set for ~17ms. The next call at ~32ms total arrives and cancels that timer. Only at the end (when no new call arrives within remaining time) does the trailing call fire. This correctly ensures the final position is sent.

### 11.2 Usage in Whiteboard

```typescript
// Created once per boardId mount:
useEffect(() => {
  const throttled = throttleTrailing((x: number, y: number) => {
    const awareness = getAwareness(boardId);  // read live, not captured
    awareness.setLocalStateField("user", { ...prev, cursor: { x, y } });
  }, 33);
  cursorThrottleRef.current = throttled;
  return () => throttled.cancel();
}, [boardId]);

// Called in handlePointerMove:
cursorThrottleRef.current?.fn(Math.round(world.x), Math.round(world.y));

// On pointerleave:
cursorThrottleRef.current?.cancel();
awareness.setLocalStateField("user", { ...prev, cursor: null });
```

`getAwareness(boardId)` is called at invocation time (not closure time) — avoids stale awareness reference across re-renders.

---

## 12. AI Board Agent

### 12.1 API Route (`app/api/ai/route.ts`)

**Model routing:**
```typescript
const REASONING_PATTERNS = /\b(swot|retrospective|retro|sprint|user.?journey|...)\b/i;
// Fast: "claude-haiku-4-5"
// Reasoning: "claude-sonnet-4-6"
```

Model names are hardcoded strings — will break if Anthropic renames or deprecates these model IDs.

**SSE streaming:**
```typescript
const stream = anthropic.messages.stream({ tool_choice: { type: "any" }, ... });
// Events accumulated:
// content_block_start (tool_use) → pending.set(index, { name, jsonAccum: "" })
// content_block_delta (input_json_delta) → block.jsonAccum += partial_json
// content_block_stop → parse jsonAccum → SSE event { type: "tool_call", name, input }
// message_stop → SSE event { type: "done", tier }
```

`tool_choice: { type: "any" }` forces the model to always call a tool. If the model needs to ask for clarification or handle an error state, it must do so via a tool call. The system prompt instructs "Zero plain-text" but edge cases may produce unexpected tool usage.

**Max tokens:** Haiku tier: 1024, Sonnet tier: 4096. A SWOT analysis with 4 quadrants of bullet points could approach this limit.

### 12.2 Streaming SSE Client (`components/AIChat.tsx`)

```typescript
const reader = res.body.getReader();
const decoder = new TextDecoder();
// Accumulates text, splits on "\n\n", parses JSON after "data: "
// On { type: "tool_call" }: collectedCalls.push({ name, input })
// On { type: "done" }: executeAiTools(collectedCalls, ...)
// On { type: "error" }: show error message
```

Tool calls are **collected** during streaming and then **all executed at once** via `executeAiTools` after the stream completes. They are NOT executed one-by-one as each arrives. The `executeAiTools` call wraps everything in one `ydoc.transact()`.

**Multi-turn history:** `apiMessages` maintains a simplified text history. After a tool-use turn, the assistant response is stored as a plain-text summary (`"Done — create_bulk_layers ×3"`), not as the actual tool-use blocks. This bypasses Anthropic's requirement for tool-result blocks in multi-turn tool-calling conversations. This technically violates the Anthropic API message format for tool use, but works because the next request starts fresh with the summary as context.

**Board state serialization:**
```typescript
function getBoardState(boardId) {
  return Array.from(sharedLayers.entries()).map(([id, layer]) => ({
    id, t: layer.type, x, y, w, h,
    f: fill/bgColor/backgroundColor,
    tx: text.slice(0, 60),
    // rotation only if non-zero
  }));
}
```

Text is truncated to 60 characters. Board state is only included if the message matches `NEEDS_BOARD_STATE_RE` (update/delete/move keywords). A creation request like "create 3 stickies" doesn't send board state — so the AI can't avoid overlapping with existing content.

### 12.3 AI Executor (`lib/ai-executor.ts`)

All tool calls run inside a single `ydoc.transact()`. Errors in individual tool calls are caught and logged but don't abort the transaction.

**`normaliseColor`:** Accepts CSS hex strings or numeric values. Returns `undefined` for null/undefined — callers must handle undefined return.

**`buildTextLayer`:** Maps both `input.fill` and `input.color` to the `color` field. If the AI sends both, `fill` takes priority (`props.fill ?? props.color`). This is by design.

**`handleArrangeGrid`:** Uses `Math.max(...items.map(it => it.bounds.w))` — throws if `items` is empty (guarded by `if (items.length === 0) return`). But also uses `items[0].bounds.x` as default origin when `args.origin_x` is `undefined`. If the first item in `ids` is a connector or line, `getLayerBounds` returns null and that item is skipped — so `items[0]` may not correspond to `ids[0]`.

**`handleResizeFrameToFit`:** Computes `minX - padding` for the new frame X. If `padding` is large (e.g., 200), this could push the frame far off-screen. No bounds checking.

---

## 13. Dashboard & Server Actions (`app/dashboard/actions.ts`)

```typescript
import { supabase } from "@/lib/supabase";  // anon key client
```

**Critical:** Server Actions use the **Supabase anon client** (public key), not a service-role client. Supabase Row Level Security (RLS) runs as the anonymous role for all operations.

The `boards` table migration (`supabase/migrations/multi_board_setup.sql`) sets two sets of RLS policies:
1. Policies for `authenticated` role: use `auth.uid()::text` for ownership checks — but `auth.uid()` refers to **Supabase Auth** user ID, not Clerk user ID. Since this app uses Clerk (not Supabase Auth), `auth.uid()` is always `null` when using the anon key. These policies effectively block all authenticated-role access.
2. Policies for `anon` role: allow all operations (`using (true)`) — the anon key gets full access. Ownership enforcement is done **entirely in application code** (Server Actions verify `owner_id = userId` via an explicit `.eq("owner_id", userId)` filter).

This is noted in the migration comments but means:
- Any user with the Supabase anon key can read/write any board's metadata if they bypass the Server Actions
- The `yjs_updates` table has no DELETE RLS policy at all — the `deleteBoard` action's deletion of yjs data silently fails (the code comments this as "non-fatal")
- Orphaned `yjs_updates` rows will accumulate whenever boards are deleted

### 13.1 `deleteBoard` — Orphaned Data

```typescript
const { error: yjsError } = await supabase.from("yjs_updates").delete().eq("room_id", boardId);
if (yjsError) {
  console.error(...);
  // Non-fatal: proceed with board deletion even if yjs cleanup fails
}
```

The `yjs_updates` table has no DELETE RLS policy for either `authenticated` or `anon` roles (checking `supabase/schema.sql`). Postgres denies DELETE by default when RLS is enabled with no matching policy. The error is swallowed. Every deleted board leaves a permanent orphan row in `yjs_updates`.

---

## 14. Security Model

| Concern | Status |
|---------|--------|
| Route protection | Clerk middleware (`proxy.ts`) protects all routes except `/`, `/sign-in/*`, `/sign-up/*` |
| Board metadata ownership | Enforced in Server Actions via explicit `owner_id` filter — not RLS |
| Yjs state access | ANY authenticated user can read/write any board's Yjs state (no board-level auth on yjs_updates) |
| AI API key | Server-side only — `ANTHROPIC_API_KEY` is never sent to client |
| Supabase keys | Only anon key is public (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) — correct |
| Clerk keys | `CLERK_SECRET_KEY` is server-side only — correct |

**Known gap:** The `yjs_updates` table allows any anon user to read/write any room. If someone knows a board UUID, they can read and overwrite its content directly via Supabase APIs, bypassing the app's auth.

---

## 15. Database Schema

### `yjs_updates` table (`supabase/schema.sql`)

```sql
CREATE TABLE yjs_updates (
  id         bigserial PRIMARY KEY,
  room_id    text UNIQUE NOT NULL,  -- board UUID
  content    text,                  -- base64 Yjs state snapshot
  created_at timestamptz DEFAULT now()
);

-- RLS policies: read/insert/update for both authenticated and anon
-- NO DELETE policy exists
```

### `boards` table (`supabase/migrations/multi_board_setup.sql`)

```sql
CREATE TABLE boards (
  id         uuid primary key default gen_random_uuid(),
  title      text not null default 'Untitled Board',
  owner_id   text not null,   -- Clerk userId (text, not UUID)
  created_at timestamptz not null default now()
);

-- 4 policies for authenticated role (auth.uid() — ineffective with Clerk+anon key)
-- 4 policies for anon role (full CRUD, allows true) — active via anon key
```

---

## 16. Known Bugs and Fragilities

These are confirmed or strongly suspected issues. Listed by severity.

### 16.1 🔴 CRITICAL: Zoom Pan Desync at Zoom Limits

**File:** `components/Whiteboard.tsx`, `handleWheel` (~line 556)

```typescript
const newZoom = z + delta;               // unclamped (could be < MIN_ZOOM or > MAX_ZOOM)
setPan({ x: pos.sx - worldX * newZoom, // uses unclamped newZoom for pan calculation
         y: pos.sy - worldY * newZoom });
setZoom(newZoom);                         // setZoom DOES clamp internally
```

When `z = MIN_ZOOM = 0.01` and user scrolls down (`delta = -0.1`), `newZoom = -0.09`. The pan is computed as `pos.sx - worldX * (-0.09)` — flipping the direction, causing a huge pan jump. `setZoom(-0.09)` clamps to `0.01` so zoom doesn't change, but pan is now incorrect.

**Fix:** Compute clamped zoom first: `const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + delta));`

### 16.2 🔴 CRITICAL: Missing DELETE RLS Policy on `yjs_updates`

**File:** `supabase/schema.sql`

No `DELETE` policy exists for `yjs_updates`. Supabase denies DELETE by default when RLS is enabled. `deleteBoard` server action silently fails to clean up Yjs state, causing permanent orphaned data accumulation.

**Fix:** Add `CREATE POLICY "Allow delete" ON yjs_updates FOR DELETE TO anon USING (true);`

### 16.3 🟠 HIGH: `lastStatus` Defaults to `"connected"` Before Connection

**File:** `lib/supabase-yjs-provider.ts`, line 52

```typescript
private lastStatus: ConnectionStatus = "connected";
```

On initial mount, `setStatusCallback` is called from `Whiteboard.tsx`'s `useEffect`. It immediately receives `"connected"` even though the Realtime channel hasn't established yet. If the initial connection fails (e.g., no internet), the badge won't show until the channel emits `CHANNEL_ERROR` or `TIMED_OUT`. There's a window of false "connected" status.

**Fix:** Initialize `lastStatus` to `"disconnected"` and only change to "connected" when `SUBSCRIBED` fires, OR add a distinct `"connecting"` state.

### 16.4 🟠 HIGH: `destroy()` is Async but `useEffect` Cleanup Ignores the Promise

**File:** `components/Whiteboard.tsx`, line 397

```typescript
useEffect(() => {
  ensurePersistence(boardId);
  return () => { void destroyProvider(boardId); };  // void discards async result
}, [boardId]);
```

`destroyProvider` calls `provider.destroy()` which `await`s `saveToDb()`. If the user navigates away quickly, the async save may not complete. The browser may unload the page before the Supabase request finishes. The `beforeunload` handler also calls `void this.destroy()` — same issue.

### 16.5 🟠 HIGH: `FrameElement` Resize/Title Update Without `ydoc.transact()`

**File:** `components/FrameElement.tsx`, `updateFrame` and `handleTitleChange`

Each pointer move during resize calls `sharedLayers.set()` directly, creating a separate Yjs transaction per event (~60/s). This floods peers with many small updates and creates many undo steps. The batch drag for frames (handled in `Whiteboard.tsx`) correctly uses `ydoc.transact()`, but individual frame resize does not.

Other shape components (StickyNote, ShapeRectangle, ShapeCircle, TextElement) likely have the same issue — they access `getSharedLayers(boardId)` directly in resize handlers.

### 16.6 🟠 HIGH: `auth.uid()` Mismatch with Clerk User IDs in RLS

**File:** `supabase/migrations/multi_board_setup.sql`

RLS policies for the `authenticated` role check `owner_id = auth.uid()::text`. Since the app uses Clerk (not Supabase Auth), `auth.uid()` returns `null` for all requests made with the Supabase anon key. These policies are inoperative. The `anon` role policies allow all operations. This means RLS provides zero access control in practice — all protection relies on application-level code.

### 16.7 🟡 MEDIUM: `ConnectorElement` Always Re-renders on Any Layer Change

**File:** `components/Whiteboard.tsx` + `components/ConnectorElement.tsx`

`useYjsStore` returns `new Map(layers.entries())` on every Y.Map change. Each render, `layers.get(conn.fromId)` and `layers.get(conn.toId)` return new object references even if the data is unchanged. `memo` on `ConnectorElement` uses shallow prop comparison — since `fromLayer` and `toLayer` are new objects each time, memo always re-renders the connector even for unrelated changes.

### 16.8 🟡 MEDIUM: Marquee Selection Uses Overlap, Not Containment

**File:** `components/Whiteboard.tsx`, `handleBoardPointerUp` (~line 654)

```typescript
if (bbox.x2 >= w1.x && bbox.x1 <= w2.x && bbox.y2 >= w1.y && bbox.y1 <= w2.y) hit.add(id);
```

This is an **intersection** test (any overlap), not a containment test. Elements that partially overlap the marquee are selected. This may be intentional (similar to Figma's behavior) but differs from some tools' "containment only" behavior.

### 16.9 🟡 MEDIUM: AI Tool History Violates Anthropic Multi-Turn Tool Protocol

**File:** `components/AIChat.tsx`

After a tool-use turn, the conversation history stores a plain-text summary as the assistant message instead of the required `tool_result` blocks. The Anthropic API expects tool-use messages to be followed by `tool_result` user messages. This bypasses that requirement. The API currently accepts this (the model treats the summary as a normal assistant turn) but it's not spec-compliant and could break if Anthropic tightens validation.

### 16.10 🟡 MEDIUM: `hitTestShapeLayers` Doesn't Account for Rotation

**File:** `components/Whiteboard.tsx`, `hitTestShapeLayers` function

```typescript
if (wx >= bounds.x1 && wx <= bounds.x2 && wy >= bounds.y1 && wy <= bounds.y2) return id;
```

Rotated shapes (sticky notes, rectangles, circles) are hit-tested against their **axis-aligned** bounding box, not their rotated bounds. For a 45° rotated shape, the hit test succeeds in the corners of the AABB even though those corners are visually empty, and misses the corners of the actual rotated shape.

This affects: connector anchor target detection, marquee selection, and future cursor-based interactions.

### 16.11 🟡 MEDIUM: Connector Hover Hit Test Doesn't Account for Rotation

Same as 16.10 but for the connector tool's hover detection in `handleConnectorPointerMove`.

### 16.12 🟡 MEDIUM: `colorPalette` Local State Goes Stale on Selection Change

**File:** `components/Whiteboard.tsx`, `ColorPalette` inline component

```typescript
const [hex, setHex] = useState(value);
useEffect(() => setHex(value), [value]);
```

When selection changes mid-typing in the hex input, the `useEffect` fires on the next render and resets `hex` to the new `value`. There's a brief render where both old text and new value coexist. More importantly, if the user types a partial hex (e.g., `"#ff"`) and clicks another shape, the effect fires and resets the input, discarding the partial entry.

### 16.13 🟡 MEDIUM: `boardStore` Not Cleared on Board ID Change

**File:** `lib/yjs-store.ts`

`boardStore` is a module-level Map. When `destroyProvider(boardId)` is called (on `Whiteboard` unmount), the board is removed from the Map. But if the component remounts with the same `boardId` before `destroy()` completes, `getOrCreateBoardState` may find the Map entry deleted (since `boardStore.delete(boardId)` runs before `await state.provider.destroy()`). The re-mount creates a new provider, and two providers may briefly coexist (the old one still saving, the new one loading and subscribing).

### 16.14 🟡 MEDIUM: `getElementsInFrame` Uses `?? 0` for Optional Dimensions

**File:** `lib/utils.ts`, line 48

```typescript
x2 = layer.x + ((layer as { width?: number }).width ?? 0);
```

A `StickyLayer` with `width: undefined` gets `x2 = layer.x`. This makes the bounding box degenerate (zero width). Such a sticky would only be "contained" in a frame if its `x === frame.x` and the frame is non-negative width. In practice, toolbar-created stickies always set explicit widths, but AI-created stickies or programmatically-created ones might not.

### 16.15 🟡 MEDIUM: Orphan Cleanup Observer Has Empty Dependency Array

**File:** `components/Whiteboard.tsx`, line 448

```typescript
useEffect(() => {
  sharedLayers.observe(cleanup);
  return () => sharedLayers.unobserve(cleanup);
}, []);  // ← missing deps: sharedLayers, ydoc
```

`sharedLayers` and `ydoc` are captured at mount. For the same `boardId`, these don't change, so this is safe in practice. But the ESLint exhaustive-deps rule would flag this, and if the component ever re-renders with a different `boardId` without unmounting (currently impossible due to how routing works, but architecturally fragile), it would observe the wrong `sharedLayers`.

### 16.16 🟡 MEDIUM: Duplicate Selection Logic in `handleSelect`

**File:** `components/Whiteboard.tsx`, line 455

```typescript
const handleSelect = useCallback((id, shiftKey) => {
  const prev = selectedIdsRef.current;
  if (!shiftKey && prev.has(id)) return;  // ← no-op if already selected
  // ...
  setSelectedIds(next);
}, []);
```

If the user clicks an already-selected item without shift, `handleSelect` returns early and `setSelectedIds` is NOT called. But `selectedIdsRef` is also not updated. This is intentional (clicking selected item doesn't deselect). However, the `selectedIdsRef.current` and the React `selectedIds` state may diverge if `updateSelectedIds` was called externally (e.g., from marquee) — since `handleSelect` writes to both `selectedIdsRef` and calls `setSelectedIds` only sometimes, there's a subtle path where they diverge.

### 16.17 🟢 LOW: `generateId` Collision Risk

**File:** `components/Whiteboard.tsx`, line 97

```typescript
function generateId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
```

`Date.now()` has millisecond resolution. `Math.random().toString(36).slice(2, 9)` gives ~5.5 bytes of entropy (~36^7 ≈ 78 billion combinations). Two users simultaneously creating a layer at the same millisecond have a 1/78B chance of collision. In practice, Yjs Y.Map handles this as a last-writer-wins merge, so the collision would silently drop one layer. Low probability but possible in high-concurrency scenarios.

### 16.18 🟢 LOW: `handleBoardPointerDown` Recreated on Every Pan Change

The `handleBoardPointerDown` callback has `pan` in its dependency array. Every pan state update (which happens at 60fps during panning) recreates this callback. Since it's attached via React's synthetic event system this doesn't cause re-renders, but it does generate garbage every frame during panning.

**Fix:** Replace `pan.x/y` capture with `transformRef.current.pan.x/y` in a stable callback.

### 16.19 🟢 LOW: `screentToWorld` Recreated on Every Pan/Zoom Change

`screenToWorld` in `BoardTransformProvider` depends on `pan` and `zoom`. Every pan/zoom change recreates it. This propagates into many callbacks in `Whiteboard.tsx` that have `screenToWorld` in their dependency arrays, causing cascading recreation of handlers during every interaction.

### 16.20 🟢 LOW: Model Names are Hardcoded Strings

**File:** `app/api/ai/route.ts`

```typescript
return { model: "claude-sonnet-4-6", tier: "reasoning" };
return { model: "claude-haiku-4-5", tier: "fast" };
```

No validation that these model IDs are valid. If Anthropic deprecates them, the API will return errors that propagate to users with no clear error message.

### 16.21 🟢 LOW: `AIChat` Slow Timer Not Cancelled on Unmount

**File:** `components/AIChat.tsx`

```typescript
const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
// No useEffect cleanup for slowTimerRef
```

If the component unmounts while the AI is loading (e.g., user navigates away), the `slowTimerRef` timeout fires and tries to call `setStatusText` on an unmounted component. React 18+ suppresses this warning but it's still a potential state update after unmount.

### 16.22 🟢 LOW: Frame Duplicate Doesn't Skip Frames

**File:** `components/Whiteboard.tsx`, keyboard handler `Cmd+D`

```typescript
if (layer.type === "connector") continue;  // connectors skipped
// frames are NOT skipped
sharedLayers.set(newId, { ...layer, x: layer.x + PASTE_OFFSET, y: layer.y + PASTE_OFFSET });
```

Duplicating a frame creates a new frame but does NOT duplicate the contained children. The new frame appears at offset position, empty. This is probably unintentional — the user likely expects the frame and its contents to be duplicated together. Compare to delete and batch-move which properly handle children.

### 16.23 🟢 LOW: `handleConnectorPointerMove` Updates `connectorDraftRef` Before the `fromId` Check

**File:** `components/Whiteboard.tsx`, ~line 676

```typescript
const updated = { ...connectorDraftRef.current, currentPt: [world.x, world.y] };
connectorDraftRef.current = updated;  // ← updated
setConnectorDraftState(updated);

const hoverId = hitTestShapeLayers(...);
const targetId = hoverId !== connectorDraftRef.current?.fromId ? hoverId : null;  // ← uses updated ref
```

`connectorDraftRef.current` was just mutated to `updated`, which still has the correct `fromId` (only `currentPt` changed). So the `fromId` check is correct. But relying on a just-mutated ref is fragile and hard to reason about.

---

## 17. Architectural Decisions and Their Tradeoffs

### 17.1 No `ydoc.transact()` in Shape Components

Shape components (StickyNote, ShapeRectangle, ShapeCircle, TextElement, FrameElement) call `getSharedLayers(boardId)` and directly call `sharedLayers.set()` in their resize and edit handlers. Each call creates an implicit Yjs transaction. This means:
- Multiple broadcasts per resize (one per pointer move)
- Multiple undo steps per resize
- Each peer receives many small updates instead of one final state

`ydoc` is not passed to shape components — they only receive `boardId` and call `getSharedLayers` inside callbacks. To fix, `ydoc` would need to be passed as a prop or accessed via a hook.

### 17.2 `Y.Map` Insertion-Order Z-Ordering

Layers render in `Y.Map` insertion order (no `z` field). The Y.Map does not preserve insertion order consistently across peers in all Yjs versions (though in practice Yjs maintains insertion-time ordering). There is no "bring to front / send to back" feature.

### 17.3 Frame Children are Computed, Not Stored

`getElementsInFrame()` is O(N) in the number of layers. Called at: drag start, delete, keyboard delete, and by the AI executor's `resize_frame_to_fit`. On very large boards, this could be slow.

### 17.4 Supabase Anon Key in Browser

The Supabase anon key is public (prefixed `NEXT_PUBLIC_`). Any browser user can use it to directly query Supabase. RLS is the only protection, and as noted above, RLS effectiveness is limited in this architecture.

---

## 18. Environment Variables

| Variable | Where Used | Required |
|----------|-----------|---------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Client (Clerk auth) | Yes |
| `CLERK_SECRET_KEY` | Server (middleware, server actions) | Yes |
| `NEXT_PUBLIC_SUPABASE_URL` | Client + Server (Supabase client) | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + Server (anon key) | Yes |
| `ANTHROPIC_API_KEY` | Server only (`app/api/ai/route.ts`) | Yes (for AI) |

Note: There is NO service-role Supabase key — all DB operations use the anon key.

---

## 19. Testing

### Unit Tests (Vitest, jsdom)

Located in `lib/__tests__/` and `components/__tests__/`. Key mocks in `lib/__tests__/setup.ts`.

| Test File | What It Tests |
|-----------|--------------|
| `connection-status.test.ts` | Channel error → disconnected, online/offline events, late-callback replay |
| `reconnect.test.ts` | `handleOnline` creates a fresh channel subscription |
| `supabase-yjs-provider.test.ts` | DB load/save persistence |
| `useYjsStore.test.ts` | Hook subscription and refresh |
| `yjs-store.test.ts` | Per-board isolation via boardStore |
| `utils.test.ts` | `getElementsInFrame`, `cn`, `isValidUUID` |
| `WhiteboardAddShapes.test.tsx` | Shape creation via toolbar |
| `WhiteboardConnectors.test.tsx` | Connector creation and cleanup |
| `WhiteboardFrames.test.tsx` | Frame creation and child management |
| `WhiteboardMovement.test.tsx` | Drag, marquee selection, keyboard shortcuts |

### E2E Tests (Playwright)

Located in `e2e/`. Require a running dev server and Supabase + Clerk credentials.

---

## 20. Key Code Patterns to Look For When Hunting Bugs

1. **Any `sharedLayers.set()` NOT inside `ydoc.transact()`** — look in shape component resize handlers
2. **Any `screenToWorld()` call using stale pan/zoom** — look for `transformRef` vs direct closure capture
3. **Any `getElementsInFrame()` called without a fresh snapshot** — should use `new Map(sharedLayers.entries())`
4. **`e.target` used for pointer capture release** — should match the element that called `setPointerCapture`
5. **Awareness state updates that could fire after component unmount** — async callbacks, timer callbacks
6. **`lastStatus` assumed to represent real connection state** — provider initializes as "connected" before actual connection
7. **Missing `ydoc` in shape component callbacks** — those components only get `boardId`, not `ydoc`
8. **Connector rendering with zero-size bounding boxes** — when `StickyLayer.width` is undefined
9. **Rotation ignored in bounding-box hit tests** — `hitTestShapeLayers`, `getElementsInFrame`, marquee
10. **Missing DELETE RLS policy** — yjs_updates cannot be deleted

---

## 21. How to Run Locally

```bash
npm install

# Create .env.local:
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
ANTHROPIC_API_KEY=sk-ant-api03-...

# Apply schema (Supabase SQL Editor):
# 1. supabase/schema.sql
# 2. supabase/migrations/multi_board_setup.sql

npm run dev        # → http://localhost:3000
npm test           # unit tests
npm run test:e2e   # E2E (requires running server + test creds)
```

---

## 22. Feature Status Summary

| Feature | Status | Notes |
|---------|--------|-------|
| Authentication (Clerk) | ✅ | Protected routes via middleware |
| Multi-board dashboard | ✅ | /dashboard, boards table, Server Actions |
| Real-time CRDT sync | ✅ | Yjs + custom Supabase provider |
| Board persistence | ✅ | Auto-save 5s + debounce 1s + beforeunload |
| Sticky notes | ✅ | Drag, resize, edit, font size, bg color, rotation |
| Rectangles | ✅ | Drag, resize, fill color, rotation |
| Circles | ✅ | Drag, resize, fill color, rotation |
| Text elements | ✅ | Drag, resize, edit, font size, text color |
| Lines / Arrows | ✅ | SVG, endpoint drag, stroke color |
| Smart Connectors | ✅ | Straight/curved/elbow, 3 endpoint types, label |
| Frames | ✅ | Title edit, drag border, resize, batch move, cascading delete |
| Connector → Frame targeting | ✅ | Two-pass hit test (shapes preferred over frame) |
| Pan / Zoom | ✅ | Drag + wheel; zoom has min/max limits (bug at limits — see §16.1) |
| Multi-select + Marquee | ✅ | Shift+click, drag marquee, ⌘A |
| Copy / Paste / Duplicate | ✅ | Clipboard offsets on repeated paste |
| Keyboard shortcuts | ✅ | V/H/C/Space/Esc/⌘A/⌘D/⌘C/⌘V/Delete/? |
| Cursor presence | ✅ | Throttled to 30fps, disappears on leave |
| User avatars | ✅ | Shows connected users top-left |
| Graceful disconnect badge | ✅ | Floating badge; triggered by window.online/offline + channel status |
| AI Board Agent | ✅ | SSE streaming, 7 tools, model routing (Haiku/Sonnet), blueprint prompts |
| Undo / Redo | ❌ | Y.UndoManager not wired |
| Layer z-ordering | ❌ | No "bring to front" — insertion order only |
| Freehand drawing | ❌ | No pencil tool |
| Image upload | ❌ | No image layer type |
| Export (PNG/SVG/PDF) | ❌ | Not implemented |
| Rich text (Y.Text) | ❌ | Plain textarea — last-write-wins on concurrent edits |
| Per-user cursor colors | ❌ | All cursors same appearance |
| Mobile / touch | ❌ | No pinch-to-zoom |
| AI connector creation | ❌ | ConnectorLayer not exposed as AI tool |
| Editable connector labels | ❌ | Label field exists but no edit UI |
