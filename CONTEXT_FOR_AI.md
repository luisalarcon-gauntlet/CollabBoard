# CollabBoard — Full Project Context for AI

> This document is written for an LLM to give it complete, up-to-date context about the CollabBoard project — its purpose, architecture, technology stack, every feature implemented, and a candid assessment of what should be worked on next.

---

## 1. What Is CollabBoard?

CollabBoard is a **real-time collaborative whiteboard web application** — think Miro or FigJam, but self-hosted and built from scratch. Multiple users can join the same board simultaneously and see each other's cursors, create sticky notes, draw shapes, add text, draw lines/arrows, connect shapes with smart connectors, pan/zoom the infinite canvas, and have all changes persist across sessions.

The core goal is bulletproof multiplayer sync without any third-party sync service (no Liveblocks, no PartyKit) — everything is self-hosted using Yjs + Supabase. The project targets an enterprise use case (authenticated users only, with Supabase Row Level Security).

---

## 2. Technology Stack

| Layer | Technology | Why |
|---|---|---|
| Framework | **Next.js 16** (App Router) | Full-stack React, server components, routing |
| UI | **React 19** | Component model |
| Styling | **CSS Modules** + **Tailwind CSS** (via shadcn/ui) | Per-component isolation + utility classes |
| CRDT / Sync | **Yjs** (`yjs`, `y-protocols`) | Conflict-free replicated data types for collaboration |
| Realtime Transport | **Supabase Realtime** (broadcast channels) | WebSocket-based message passing |
| Persistence | **Supabase Postgres** (`yjs_updates` table) | Board state survives refreshes and server restarts |
| Authentication | **Clerk** (`@clerk/nextjs`) | Auth UI, session management, JWT |
| Icons | **lucide-react** | Icon library |
| Type Safety | **TypeScript 5** (strict mode) | End-to-end types |
| Component Primitives | **shadcn/ui** (New York style) | Accessible component library, not heavily used yet |

**Key design decision:** There is NO third-party collaboration backend. Everything runs on Supabase infrastructure. The Yjs provider is custom-built (`lib/supabase-yjs-provider.ts`).

---

## 3. Project File Structure

```
CollabBoard/
├── app/
│   ├── layout.tsx                # Root layout — ClerkProvider, Geist fonts
│   ├── page.tsx                  # Landing page — auth gate, redirects to /board if signed in
│   ├── globals.css               # Global CSS variables and resets
│   ├── page.module.css
│   └── board/
│       ├── page.tsx              # Main board page — renders <Whiteboard />, Sign Out button
│       └── page.module.css
│
├── components/
│   ├── Whiteboard.tsx            # ★ Core component — canvas, toolbar, pan/zoom, layer rendering
│   ├── StickyNote.tsx            # Sticky note — drag, resize, inline text edit, font size, bg color
│   ├── ShapeRectangle.tsx        # Rectangle shape — drag, resize, fill color
│   ├── ShapeCircle.tsx           # Circle/ellipse shape — drag, resize, fill color
│   ├── TextElement.tsx           # Standalone text — drag, resize, inline editing, font size, color
│   ├── LineElement.tsx           # Line/arrow — endpoint drag, multi-point, stroke color
│   ├── ConnectorElement.tsx      # ★ Smart connector — edge-to-edge routing between two named layers
│   ├── HelpModal.tsx             # Keyboard shortcut reference modal (? key)
│   ├── Avatars.tsx               # Shows avatars/initials of connected users (top-left)
│   ├── CursorPresence.tsx        # Renders remote user cursors with name labels
│   └── *.module.css              # One CSS module per component
│
├── lib/
│   ├── supabase.ts               # Supabase client singleton
│   ├── supabase-yjs-provider.ts  # ★ Custom Yjs provider — Supabase Realtime + Postgres
│   ├── yjs-store.ts              # Y.Doc singleton, sharedLayers Y.Map, all layer type definitions
│   ├── useYjsStore.ts            # React hook — subscribes to Yjs layers map
│   ├── useAwareness.ts           # React hook — returns remote users + cursor positions
│   ├── board-transform.tsx       # React context for pan/zoom, tool mode, coordinate conversion
│   └── utils.ts                  # cn() class-name helper
│
├── supabase/
│   └── schema.sql                # DB schema: yjs_updates table, RLS policies, Realtime pub
│
├── proxy.ts                      # Next.js middleware — Clerk auth protection
├── package.json
├── tsconfig.json
├── next.config.ts
├── eslint.config.mjs
├── components.json               # shadcn/ui config
├── PROJECT.md                    # Dev principles
├── README.md                     # User-facing project README
└── DEPLOY.md                     # Deployment guide (Vercel + Supabase)
```

---

## 4. Architecture Deep Dive

### 4.1 Authentication Flow (Clerk)

1. User visits `/` — server component checks auth via Clerk
2. Unauthenticated → landing page with **Sign In** / **Sign Up** (Clerk hosted UI)
3. Authenticated → redirected to `/board`
4. `proxy.ts` (Next.js middleware) enforces auth on all routes except `/`, `/sign-in/*`, `/sign-up/*`
5. Board page shows a **Sign Out** button (top-right)

**Required env vars:** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`

### 4.2 State Management — Yjs CRDT

All board state lives in a **single `Y.Doc`**. It contains one shared structure:

```typescript
// lib/yjs-store.ts
const ydoc = new Y.Doc();
const sharedLayers = ydoc.getMap<LayerData>("layers");
```

`sharedLayers` is a `Y.Map` where keys are unique layer IDs (e.g., `"sticky-1708123456789-abc123"`) and values are typed layer objects. The complete union of all layer types is:

```typescript
type StickyLayer = {
  type: "sticky";
  x: number; y: number;
  width?: number;   // default 200
  height?: number;  // default 150
  text: string;
  fontSize?: number;  // default 14
  bgColor?: string;   // default "#fffbeb"
};

type RectangleLayer = {
  type: "rectangle";
  x: number; y: number;
  width: number; height: number;  // default 120×120
  fill?: string;  // default "#93c5fd"
};

type CircleLayer = {
  type: "circle";
  x: number; y: number;
  width: number; height: number;  // default 120×120
  fill?: string;  // default "#86efac"
};

type TextLayer = {
  type: "text";
  x: number; y: number;
  width: number; height: number;  // default 200×40
  text: string;
  fontSize: number;   // default 16
  fontWeight: string; // "normal" | "bold"
  color: string;      // default "#1e293b"
};

type LineLayer = {
  type: "line";
  x: number; y: number;  // bounding-box top-left (mirrors points)
  points: [number, number][];  // absolute world-space coords
  color: string;      // default "#1e293b"
  thickness: number;  // default 2
  variant: "straight" | "arrow";
};

// Smart connector — no x/y; geometry is always derived from fromId/toId bboxes
type ConnectorLayer = {
  type: "connector";
  fromId: string;   // ID of source layer
  toId: string;     // ID of target layer
  label?: string;   // optional midpoint label
  style: "straight" | "curved" | "elbow";
  stroke: {
    color: string;
    width: number;
    dashArray?: string;  // SVG stroke-dasharray, e.g. "6,3" (dashed), "2,4" (dotted)
  };
  endpoints: "none" | "arrow" | "dot";
};

type LayerData =
  | StickyLayer | RectangleLayer | CircleLayer
  | TextLayer | LineLayer | ConnectorLayer;
```

**Important:** `ConnectorLayer` intentionally has **no `x` or `y`** fields — its geometry is always recomputed from the live bounding boxes of `fromId` / `toId`, so it never goes stale when objects are moved or resized.

All mutations are wrapped in `ydoc.transact()` to produce a single undo step and avoid double-writes.

### 4.3 Custom Supabase Yjs Provider (`lib/supabase-yjs-provider.ts`)

The most complex piece of the system. Replaces standard Yjs providers (y-websocket, y-webrtc).

**A) Realtime sync (broadcast):**
- Subscribes to a Supabase Realtime broadcast channel named after the `roomId`
- Event types: `yjs-update` (doc deltas, base64-encoded binary) and `yjs-awareness` (presence)
- Local changes → broadcast delta to all peers
- Remote updates → `Y.applyUpdate()` on the local doc

**B) Persistence (Postgres):**
- On init: loads saved state from `yjs_updates` table, applies to local doc
- Auto-saves every **5 seconds** if doc changed
- Debounce-saves **1 second** after last local change
- Saves on `window.beforeunload`
- State serialized via `Y.encodeStateAsUpdate()`, base64-encoded to TEXT in Postgres

**Required env vars:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 4.4 User Awareness & Presence

Yjs awareness protocol (`y-protocols/awareness`) is used for ephemeral state:
- **Who is connected** — name, avatar URL (from Clerk)
- **Cursor position** — `{ x, y }` in world coordinates

Flow:
1. On mount, local awareness state is set from Clerk user info
2. On `pointermove` → cursor world position written to awareness
3. On `pointerleave` → cursor set to `null`
4. `useAwareness.ts` hook subscribes to changes, returns remote users array
5. `CursorPresence.tsx` renders cursor SVG + name label per remote user
6. `Avatars.tsx` renders avatar images or initials per connected user

Awareness is broadcast on the same Supabase Realtime channel as doc updates (different event type).

### 4.5 Pan/Zoom & Tool Mode System (`lib/board-transform.tsx`)

Infinite canvas with world-space coordinates:

```typescript
screenToWorld(sx, sy) => { x: (sx - pan.x) / zoom, y: (sy - pan.y) / zoom }
worldToScreen(wx, wy) => { x: wx * zoom + pan.x,    y: wy * zoom + pan.y }
```

A `transformRef` is kept in sync with current pan/zoom for use inside pointer event handlers (avoids stale closure issues).

**Tool Mode** is part of `BoardTransformContext`:

```typescript
type ToolMode = "select" | "hand" | "connector";
```

| Mode | Behaviour |
|------|-----------|
| `select` | Click/drag on empty canvas starts marquee selection. Objects are interactive. |
| `hand` | All pointer-downs pan the canvas. A full-viewport overlay blocks object interaction. |
| `connector` | A full-viewport overlay captures all pointer events for drawing connectors. Hovering a shape shows anchor points. Dragging from one shape to another creates a `ConnectorLayer` in the Y.Map. |

**Space bar** — held from any tool mode (including `connector`) applies a temporary hand mode overlay. Critically, `toolMode` does NOT change when Space is held — only `isSpaceDown` state flips. The hand overlay then captures pan events. The connector overlay is hidden while Space is held (`isConnectorMode = toolMode === "connector" && !isSpaceDown`).

**Zoom** is blocked while the help modal is open (`showHelpRef.current` checked inside `handleWheel`).

### 4.6 Smart Connectors (`components/ConnectorElement.tsx`)

The most complex rendering component. Key design decisions:

**Edge-to-Edge Routing (`rectEdgePoint`):**
Casts a parametric ray from the shape center toward the opposing shape center, evaluates `t` for all four rectangle edges, picks the smallest positive `t` that lands on the perimeter. Result: the connector starts and ends exactly on the shape boundary, never overlapping the fill.

**Three routing styles:**
- `straight` — direct line between the two perimeter points
- `curved` — cubic Bézier; control points are placed in the outward-normal direction of each exit/entry edge at a distance proportional to 40% of inter-shape distance (min 60 px). The tangent is therefore always aligned with the edge.
- `elbow` — three-segment Manhattan path. Exit direction determines H→V→H or V→H→V routing.

**Arrowhead:**
For `endpoints: "arrow"`, a filled triangle is computed at the target point oriented along the direction the connector arrives (the `arrowNx, arrowNy` unit vector, edge-dependent for curved/elbow styles).

**SVG layout:**
The component renders as an absolutely-positioned SVG in the `worldTransform` div. Its bounds are computed from all significant path points plus padding. Paths are rebuilt in SVG-local coordinates (world coords minus SVG top-left offset).

**React.memo:**
The inner component is wrapped in `memo`. The parent (`Whiteboard`) passes `fromLayer` and `toLayer` as resolved props from `useYjsStore`. When either endpoint moves or resizes, `useYjsStore` updates → parent re-renders → new props → connector recalculates.

**Pointer interaction:**
A wide transparent stroke (`pointer-events: stroke`) serves as the hit area. Clicking triggers `onSelect`.

**Orphan cleanup:**
A `sharedLayers.observe` listener in `Whiteboard` runs after every Y.Map transaction. It finds any connectors whose `fromId` or `toId` has been deleted and removes them in a new `ydoc.transact`. This runs in the same event loop tick as the deletion, so peers never see a dangling connector.

**Z-index management:**
Layer entries are split before rendering:
1. `connectorEntries` rendered **first** → lowest DOM z-index (behind all shapes)
2. `shapeEntries` rendered **after** → appear above connectors

### 4.7 Database Schema

```sql
-- supabase/schema.sql
CREATE TABLE yjs_updates (
  id         bigserial PRIMARY KEY,
  room_id    text UNIQUE NOT NULL,
  content    text,  -- base64-encoded Yjs state snapshot
  created_at timestamptz DEFAULT now()
);

ALTER TABLE yjs_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read"   ON yjs_updates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert" ON yjs_updates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update" ON yjs_updates FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Anon users can read"            ON yjs_updates FOR SELECT TO anon USING (true);
CREATE POLICY "Anon users can insert"          ON yjs_updates FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon users can update"          ON yjs_updates FOR UPDATE TO anon WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE yjs_updates;
```

**Note:** `content` is `TEXT` (base64), not `BYTEA`. Current room ID is hardcoded as `"collab-board-main"` in `lib/yjs-store.ts`.

---

## 5. Component Reference

### `components/Whiteboard.tsx` — Core Canvas

The brain of the UI. Key responsibilities:

**Canvas & transforms:**
- Renders an infinite canvas div transformed via `transform: translate(x, y) scale(zoom)`
- All layer positions are world-space; CSS transform applies pan/zoom

**Pointer event handling:**
- `pointerdown` on empty canvas (select mode) → start marquee drag
- `pointerdown` on empty canvas (hand mode) → start pan drag
- Connector overlay (connector mode) → drag from shape to shape
- `pointermove` → update pan / marquee / awareness cursor
- `wheel` → zoom toward cursor (no-op if help modal is open)

**Tool modes:**
- `V` → select, `H` → hand, `C` → connector
- Space (hold) → temporary hand from any mode, including connector
- `Escape` → in connector mode: cancel draft + return to select; otherwise: deselect all

**Layer rendering (z-order):**
1. ConnectorElements (first = lowest z-index)
2. All other layer types (StickyNote, ShapeRectangle, etc.)

**Connector-specific UI:**
- Connector overlay div (z-index 51) captures all pointer events when `isConnectorMode`
- 4 pulsing anchor dots rendered in world-space over the hovered shape
- Dashed blue preview line rendered during drag
- On pointer-up over a different shape: creates `ConnectorLayer` in `sharedLayers`

**Orphan cleanup:**
```typescript
sharedLayers.observe(() => {
  // find connectors with missing fromId/toId
  // delete them in a single ydoc.transact()
});
```

**Formatting panel (context-sensitive, shown in toolbar when items are selected):**
- Fill color — rectangles, circles, sticky notes
- Text color — text elements
- Stroke color — lines/arrows
- Connector color, routing style (Straight/Curved/Elbow), endpoint style (Arrow/Dot/None) — connectors
- Font size ±2 stepper — sticky notes and text elements

**Keyboard shortcuts:**

| Key | Action |
|-----|--------|
| `V` | Select tool |
| `H` | Hand / pan tool |
| `C` | Connector tool |
| `Space` (hold) | Temporary pan (all modes) |
| `Esc` | Cancel connector draft / deselect all / exit connector mode |
| `⌘A` | Select all layers |
| `⌘D` | Duplicate selection (20 px offset; skips connectors) |
| `⌘C` | Copy selection to in-memory clipboard (skips connectors) |
| `⌘V` | Paste from clipboard (20 px offset, repeated pastes stack) |
| `Delete` / `Backspace` | Delete selected layers (orphan connectors auto-cleaned) |
| `?` | Toggle help modal |

**Help modal zoom-lock:** `handleWheel` checks `showHelpRef.current` before applying any zoom change, so scrolling while the help panel is open does nothing to the board.

### `components/ConnectorElement.tsx`

Exported: `ConnectorElement` (memo-wrapped), `getLayerBounds`, `LayerBounds`.

`getLayerBounds(layer)` — computes `{ cx, cy, x1, y1, x2, y2 }` for any non-connector layer. Used both by `ConnectorElement` for routing and by `Whiteboard` for anchor point and hit-test computation.

Rendering layers (inside the SVG, from bottom to top):
1. Blue glow path (when `selected`)
2. Wide transparent hit-area path (`pointer-events: stroke`)
3. Main visible stroke (respects `dashArray`)
4. Source endpoint dot (if `endpoints === "dot"`)
5. Target arrowhead polygon (if `endpoints === "arrow"`) or dot
6. Label `<text>` at midpoint with white paint-order stroke for legibility

### `components/StickyNote.tsx`

- Drag: batch drag via `onDragStart / onDragDelta / onDragEnd`
- Resize: 4 corner handles with directional logic
- Edit: double-click → `<textarea>`, Escape/Enter saves to `sharedLayers`
- Selection: shows blue border ring; click calls `onSelect(shiftKey)`
- Configurable: `fontSize` (default 14), `bgColor` (default `#fffbeb`)
- Min size: 80×60 px

### `components/ShapeRectangle.tsx`

Same drag/resize/select pattern. Configurable `fill` (default `#93c5fd`). Min size 60×60 px.

### `components/ShapeCircle.tsx`

Same as rectangle. `border-radius: 50%` makes it circular. Shift-constrained resize to square. Configurable `fill` (default `#86efac`).

### `components/TextElement.tsx`

Same drag/resize/select pattern. Configurable `fontSize`, `fontWeight`, `color`. Default 200×40 px.

### `components/LineElement.tsx`

SVG-based. Points stored as absolute world-space `[number, number][]`. Body drag routes through batch drag callbacks. Endpoint handles drag individual points. Variants: `"straight"` and `"arrow"` (arrowhead computed from last two points).

### `components/HelpModal.tsx`

Sections: **Tools** (V, H, C, Space, Esc), **Selection** (⌘A, Shift+Click, Drag, Esc), **Connectors** (C, drag flow, anchor hints, Space pan, Esc cancel), **Edit** (⌘D, ⌘C, ⌘V, Del), **View** (Scroll, Reset, ?).

Closes on Escape or click-outside. Does not block Whiteboard keyboard handlers (modal has its own `keydown` listener).

### `components/Avatars.tsx`

Reads `useAwareness()`. Shows `<img>` (avatar URL) or first letter of name per remote user. Fixed top-left, stacked with slight overlap.

### `components/CursorPresence.tsx`

Reads `useAwareness()`. Converts world cursor → screen via `worldToScreen()`. Renders SVG cursor + name label per user. `pointer-events: none`.

---

## 6. Environment Variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk public key |
| `CLERK_SECRET_KEY` | Clerk secret key (server-side only) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |

---

## 7. Features Fully Implemented

| Feature | Status | Notes |
|---|---|---|
| User authentication | ✅ | Clerk, protected routes, sign in/out |
| Real-time collaboration (CRDT) | ✅ | Yjs Y.Map, custom Supabase provider |
| Board persistence | ✅ | Auto-saves to Supabase Postgres every 5 s |
| Sticky notes | ✅ | Create, drag, resize, edit, font size, bg color, delete |
| Rectangle shapes | ✅ | Create, drag, resize, fill color, delete |
| Circle/ellipse shapes | ✅ | Create, drag, resize, fill color, delete |
| Text elements | ✅ | Create, drag, resize, edit, font size, text color, delete |
| Lines | ✅ | Create, drag endpoints, stroke color |
| Arrows | ✅ | Lines with arrowhead variant |
| **Smart Connectors** | ✅ | Edge-to-edge routing, 3 styles, 3 endpoint types, label, color, orphan cleanup, z-ordering |
| Connector tool (C) | ✅ | Overlay, anchor dots, preview line, pointer-capture drag |
| Connector formatting | ✅ | Color, routing style, endpoint style via toolbar panel |
| Connector orphan cleanup | ✅ | Y.Map observer purges dangling connectors transactionally |
| Infinite canvas pan | ✅ | Mouse drag on empty space (select or hand mode) |
| Infinite canvas zoom | ✅ | Mouse wheel toward cursor; blocked while help modal is open |
| Tool modes (Select / Hand / Connector) | ✅ | Toolbar buttons + V / H / C shortcuts |
| Space bar temporary pan | ✅ | Works from all tool modes including Connector |
| Multi-select | ✅ | Shift+click, marquee drag, ⌘A |
| Marquee selection | ✅ | Drag on empty canvas, connectors excluded |
| Batch drag | ✅ | All selected items move together, single `ydoc.transact` |
| Duplicate | ✅ | ⌘D or toolbar; skips connectors (they reference IDs) |
| Copy / Paste | ✅ | ⌘C / ⌘V, in-memory clipboard; skips connectors |
| Context-sensitive formatting | ✅ | Fill, text color, stroke, connector style, font size |
| Live cursor presence | ✅ | Remote cursors with username labels |
| User avatar display | ✅ | Connected user list, top-left |
| Keyboard shortcuts | ✅ | Full set including connector shortcuts |
| Help modal | ✅ | All shortcuts, includes Connector section |
| Zoom locked during help modal | ✅ | `showHelpRef` checked in wheel handler |
| Reset view | ✅ | Toolbar button resets pan + zoom |
| Deployment guide | ✅ | Vercel + Supabase documented in DEPLOY.md |

---

## 8. Known Limitations & What Should Be Worked On Next

### 8.1 High Priority

**1. Undo / Redo**
- Yjs has built-in `Y.UndoManager` but it is not wired up
- All mutations already use `ydoc.transact()` so each action will be a clean undo step
- Requires: wiring `Y.UndoManager`, toolbar buttons, `⌘Z` / `⌘Shift+Z` shortcuts

**2. Multiple Boards / Room System**
- Currently exactly **one hardcoded board** (`"collab-board-main"`)
- Requires: board listing UI, per-board room IDs, URL routing (`/board/[id]`), `boards` table in Supabase

**3. Layer Z-Ordering**
- Layers render in Y.Map insertion order (no "bring to front / send to back")
- Connectors are always behind shapes (hardcoded), but among shapes there is no user control
- Requires: storing a `z` / `order` field, or using `Y.Array` for ordered layer list

**4. Freehand Drawing**
- No pencil/freehand tool
- Requires: a new layer type with `Y.Array` of stroke points, or a dedicated freehand layer

### 8.2 Medium Priority

**5. Rich Text in Sticky Notes / Text Elements**
- Plain `<textarea>` — no bold/italic/markdown
- Concurrent edits to `text` field are last-write-wins (not character-level merge)
- True collaborative text requires `Y.Text` + `y-prosemirror` / Tiptap (architecturally significant change)

**6. Connector Labels (editable)**
- `ConnectorLayer.label` field exists and renders, but there is no UI to set or edit it
- Should add an inline double-click edit flow for connector labels

**7. Image Upload / Embedding**
- No image layer type; would require Supabase Storage

**8. Export / Share**
- No PNG / SVG / PDF export

**9. Minimap**
- No overview minimap for navigating large boards

### 8.3 Lower Priority / Technical Debt

**10. Per-User Cursor Colors**
- All remote cursors look identical except for the name label
- Should assign each connected user a distinct colour

**11. Reconnection & Offline UI**
- The provider handles offline edits (they queue up in Yjs) but shows no user-visible feedback
- Should show a "reconnecting…" banner when the Realtime channel drops

**12. Board Access Control**
- Any authenticated user accesses the same board
- For real enterprise use: boards need owners, collaborators, view-only guests

**13. Performance on Large Boards**
- All layers rendered as DOM elements — no virtualization
- Hundreds of elements would degrade performance
- Mitigation: canvas-based rendering (Konva.js) or off-screen element virtualization

**14. Mobile / Touch Support**
- No pinch-to-zoom gesture handling; primarily desktop-oriented

**15. Cursor Awareness Throttling**
- Awareness broadcasts on every `pointermove` — should throttle to ~30 fps

**16. AI Integration**
- Not implemented. Possible features: sticky note summarization, auto-layout, content generation via Claude 3.5 Sonnet tool-calling

---

## 9. Development Principles (from PROJECT.md)

1. **Priority #1:** Bulletproof multiplayer sync (Yjs CRDT + Supabase Realtime). No third-party sync service.
2. **Priority #2:** Enterprise security (Clerk + Supabase RLS).
3. TypeScript strict mode for all components; strict typing for all layer types.
4. Follow Yjs + Supabase integration patterns (shared Y.Doc, custom SupabaseYjsProvider, persistence via `yjs_updates`).
5. For AI features, use Anthropic Claude 3.5 Sonnet tool-calling patterns.

---

## 10. How to Run Locally

```bash
npm install

# .env.local:
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# Apply schema in Supabase SQL Editor (supabase/schema.sql)

npm run dev
# → http://localhost:3000
```

---

## 11. Deployment

- **Vercel** (Next.js native) — set all four env vars in project settings
- **Supabase** — free tier sufficient for MVP; schema applied via SQL editor
- **Clerk** — free tier sufficient; production Vercel domain must be added in Clerk dashboard
- Full step-by-step instructions in `DEPLOY.md`

---

## 12. Summary

CollabBoard is a **production-quality, self-hosted collaborative whiteboard** built on Next.js 16 + Yjs + Supabase + Clerk. Yjs handles all CRDT state, a custom provider handles transport (Supabase Realtime broadcast) and persistence (Supabase Postgres), and React components read from Yjs and write back.

**Current feature palette:** sticky notes, rectangles, circles, text, lines, arrows, and **smart connectors** with three routing styles (straight, curved, elbow), configurable endpoints, labels, colours, and full orphan cleanup. Multi-select, marquee selection, copy/paste, duplicate, batch drag, context-sensitive formatting, a complete keyboard shortcut system, and live multi-user cursor presence are all implemented.

**Most impactful next features** in priority order:

1. **Undo/Redo** — `Y.UndoManager` already supported by Yjs; just needs wiring
2. **Multiple boards** — URL-based routing, board listing UI
3. **Layer z-ordering** — bring to front / send to back
4. **Freehand drawing** — pencil tool
5. **Editable connector labels** — inline editing for `ConnectorLayer.label`
6. **Rich text in sticky notes** — `Y.Text` + y-prosemirror
7. **Per-user cursor colors**
8. **Image upload** via Supabase Storage
9. **Export to PNG/SVG**
10. **AI integration** — Claude 3.5 Sonnet for summarization, layout, content generation

The codebase is ~21 files, fully typed in strict TypeScript, and straightforward to extend. The hardest architectural change would be adding character-level collaborative text (y-prosemirror) or switching to canvas-based rendering for scale. Everything else — especially undo/redo — is relatively contained.
