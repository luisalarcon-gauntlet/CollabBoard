# CollabBoard — Full Project Context for AI

> This document is written for an LLM to give it complete context about the CollabBoard project — its purpose, architecture, technology stack, every feature implemented, and a candid assessment of what should be worked on next.

---

## 1. What Is CollabBoard?

CollabBoard is a **real-time collaborative whiteboard web application** — think Miro or FigJam, but self-hosted and built from scratch. Multiple users can join the same board simultaneously and see each other's cursors, create sticky notes, draw shapes, add text and arrows, pan/zoom the infinite canvas, and have all changes persist across sessions. The core goal was bulletproof multiplayer sync without depending on any third-party sync service (e.g., no Liveblocks, no PartyKit) — everything is self-hosted using Yjs + Supabase.

The project was built as a Gauntlet challenge/hackathon project. It targets an enterprise use case (authenticated users only, with Supabase Row Level Security).

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

**Key design decision:** There is NO third-party collaboration backend (no Liveblocks, no Ably, no Firebase). Everything runs on Supabase infrastructure. The Yjs provider is custom-built (`lib/supabase-yjs-provider.ts`).

---

## 3. Project File Structure

```
CollabBoard/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout — wraps with ClerkProvider, Geist fonts
│   ├── page.tsx                  # Landing page — auth gate, redirects to /board if signed in
│   ├── globals.css               # Global CSS variables and resets
│   ├── page.module.css           # Landing page styles
│   └── board/
│       ├── page.tsx              # Main board page — renders <Whiteboard />, Sign Out button
│       └── page.module.css       # Board page styles
│
├── components/
│   ├── Whiteboard.tsx            # ★ Core component — canvas, toolbar, pan/zoom, layer rendering
│   ├── StickyNote.tsx            # Sticky note — drag, resize, inline text editing, font size, bg color
│   ├── ShapeRectangle.tsx        # Rectangle shape — drag, resize, fill color
│   ├── ShapeCircle.tsx           # Circle/ellipse shape — drag, resize, fill color
│   ├── TextElement.tsx           # Standalone text — drag, resize, inline editing, font size, color
│   ├── LineElement.tsx           # Line/arrow — endpoint drag, multi-point, stroke color
│   ├── HelpModal.tsx             # Keyboard shortcut reference modal (? key)
│   ├── Avatars.tsx               # Shows avatars/initials of connected users (top-left)
│   ├── CursorPresence.tsx        # Renders remote user cursors with name labels
│   └── *.module.css              # One CSS module per component
│
├── lib/
│   ├── supabase.ts               # Supabase client singleton (env vars)
│   ├── supabase-yjs-provider.ts  # ★ Custom Yjs provider — Supabase Realtime + Postgres
│   ├── yjs-store.ts              # Y.Doc singleton, sharedLayers Y.Map, all layer type definitions
│   ├── useYjsStore.ts            # React hook — subscribes to Yjs layers map
│   ├── useAwareness.ts           # React hook — returns remote users + cursor positions
│   ├── board-transform.tsx       # React context for pan/zoom transforms, tool mode, coordinate conversion
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
└── DEPLOY.md                     # Deployment guide (Vercel + Supabase)
```

---

## 4. Architecture Deep Dive

### 4.1 Authentication Flow (Clerk)

1. User visits `/` — server component checks auth status via Clerk
2. Unauthenticated → sees landing page with **Sign In** / **Sign Up** buttons (Clerk hosted UI)
3. Authenticated → immediately redirected to `/board`
4. `proxy.ts` (Next.js middleware) runs on every request and enforces auth on all routes except `/`, `/sign-in/*`, `/sign-up/*`
5. Board page shows a **Sign Out** button (top-right corner)

**Required env vars:**
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

### 4.2 State Management — Yjs CRDT

All board state lives in a **single `Y.Doc`** (Yjs document). This doc contains one shared structure:

```typescript
// lib/yjs-store.ts
const ydoc = new Y.Doc();
const sharedLayers = ydoc.getMap<LayerData>("layers");
```

`sharedLayers` is a `Y.Map` where keys are unique layer IDs (e.g., `"sticky-1708123456789-abc123"`) and values are typed layer objects:

```typescript
type StickyLayer = {
  type: "sticky";
  x: number;
  y: number;
  width?: number;   // default 200
  height?: number;  // default 150
  text: string;
  fontSize?: number;  // font size for text (default: 14)
  bgColor?: string;   // background color (default: #fffbeb)
};

type RectangleLayer = {
  type: "rectangle";
  x: number;
  y: number;
  width: number;    // default 120
  height: number;   // default 120
  fill?: string;    // default "#93c5fd" (light blue)
};

type CircleLayer = {
  type: "circle";
  x: number;
  y: number;
  width: number;    // default 120
  height: number;   // default 120
  fill?: string;    // default "#86efac" (light green)
};

type TextLayer = {
  type: "text";
  x: number;
  y: number;
  width: number;    // default 200
  height: number;   // default 40
  text: string;
  fontSize: number; // default 16
  fontWeight: string; // "normal" | "bold"
  color: string;    // default "#1e293b"
};

type LineLayer = {
  type: "line";
  x: number;        // bounding-box top-left X (mirrors points)
  y: number;        // bounding-box top-left Y (mirrors points)
  points: [number, number][];  // absolute world-space coords
  color: string;    // default "#1e293b"
  thickness: number; // default 2
  variant: "straight" | "arrow";
};

type LayerData = StickyLayer | RectangleLayer | CircleLayer | TextLayer | LineLayer;
```

Any component that mutates `sharedLayers` triggers a Yjs update, which is automatically broadcast to all connected peers via the custom provider. All multi-element mutations are wrapped in `ydoc.transact()` to produce a single undo step and avoid double-writes.

### 4.3 Custom Supabase Yjs Provider (`lib/supabase-yjs-provider.ts`)

This is the most complex and critical piece of the system. It replaces standard Yjs providers (y-websocket, y-webrtc) with a custom Supabase-based transport.

**Two responsibilities:**

**A) Realtime sync (broadcast):**
- On init, subscribes to a Supabase Realtime broadcast channel named after the `roomId`
- Listens on two event types:
  - `yjs-update` — Yjs document update deltas (binary, base64-encoded)
  - `yjs-awareness` — Yjs awareness state changes (user presence, cursor positions)
- When the local `Y.Doc` changes, broadcasts the encoded delta to all other clients
- When a remote update arrives, applies it to the local doc via `Y.applyUpdate()`

**B) Persistence (Postgres):**
- On init, loads saved state from `yjs_updates` table (single row per `room_id`)
- Applies the saved state to the local doc — board is restored from DB
- Auto-saves every **5 seconds** if the doc has changed
- Debounce-saves **1 second** after the last local change
- Saves on `window.beforeunload`
- Yjs state is serialized to `Uint8Array` via `Y.encodeStateAsUpdate()`, then base64-encoded to store as TEXT in Postgres

**Destroy lifecycle:**
- Cleans up Supabase channel subscription
- Clears save intervals
- Removes doc/awareness listeners

**Required env vars:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 4.4 User Awareness & Presence

Yjs has a built-in "awareness" protocol (`y-protocols/awareness`) for ephemeral, non-persisted user state. CollabBoard uses this for:

- **Who is connected** — name, avatar URL
- **Cursor position** — `{ x: number, y: number }` in world coordinates

**How it works:**
1. When the board mounts, the local user's awareness state is set with their Clerk user info (name, avatar)
2. On `pointermove`, the cursor world position is written to awareness
3. On `pointerleave`, the cursor is set to `null` (hides the cursor for others)
4. `useAwareness.ts` hook listens to awareness changes and returns the array of remote users (excluding self)
5. `CursorPresence.tsx` renders a cursor SVG + name label for each remote user
6. `Avatars.tsx` renders avatar images or initials for connected users

Awareness state is broadcast via the same Supabase Realtime channel as doc updates (different event type).

### 4.5 Pan/Zoom & Tool Mode System (`lib/board-transform.tsx`)

The whiteboard uses an **infinite canvas** with pan and zoom. All layer coordinates are stored in **world space** and converted to **screen space** for rendering.

```typescript
// Coordinate conversion
screenToWorld(sx, sy) => { x: (sx - pan.x) / zoom, y: (sy - pan.y) / zoom }
worldToScreen(wx, wy) => { x: wx * zoom + pan.x, y: wy * zoom + pan.y }
```

**Pan:** Mouse drag on empty canvas moves `pan.x` and `pan.y`
**Zoom:** Mouse wheel changes zoom (clamped to 0.01–100), keeping the cursor point fixed

A `transformRef` is used in mouse event handlers (avoids stale closure issues with zoom/pan values).

**Tool Mode** is now part of the `BoardTransformContext`:
- `toolMode: "select" | "hand"` — current interaction mode
- `setToolMode(mode)` — switch between modes
- In **select** mode: pointer-down on empty canvas starts a marquee selection drag
- In **hand** mode: all pointer-downs pan the canvas (object interaction is blocked by an overlay)

### 4.6 Database Schema

```sql
-- supabase/schema.sql
CREATE TABLE yjs_updates (
  id         bigserial PRIMARY KEY,
  room_id    text UNIQUE NOT NULL,
  content    text,                        -- base64-encoded Yjs state snapshot
  created_at timestamptz DEFAULT now()
);

-- Row Level Security
ALTER TABLE yjs_updates ENABLE ROW LEVEL SECURITY;

-- Authenticated users: full read/write
CREATE POLICY "Authenticated users can read" ON yjs_updates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert" ON yjs_updates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update" ON yjs_updates FOR UPDATE TO authenticated USING (true);

-- Anonymous users: also read/write (for client SDK with anon key)
CREATE POLICY "Anon users can read" ON yjs_updates FOR SELECT TO anon USING (true);
CREATE POLICY "Anon users can insert" ON yjs_updates FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon users can update" ON yjs_updates FOR UPDATE TO anon WITH CHECK (true);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE yjs_updates;
```

**Important note:** The `content` column is `TEXT` (not `BYTEA`). The app stores base64-encoded Yjs state. If someone created the table with `BYTEA`, they must run `ALTER TABLE yjs_updates ALTER COLUMN content TYPE text`.

**Current room ID:** Hardcoded as `"collab-board-main"` in `lib/yjs-store.ts`. There is only one board for all users.

---

## 5. Component Reference

### `components/Whiteboard.tsx` — The Core Canvas

This is the brain of the UI. Responsibilities:

- **Renders the infinite canvas** — a `div` that fills the viewport, transformed via CSS `transform: translate(x, y) scale(zoom)`
- **Pointer event handling:**
  - `pointerdown` on empty canvas (select mode) → start marquee selection drag
  - `pointerdown` on empty canvas (hand mode) → start pan drag
  - `pointermove` → update pan/marquee + update awareness cursor position
  - `pointerleave` → clear awareness cursor
  - `wheel` → zoom toward cursor
- **Tool mode toggle:** Select (V) and Hand (H) mode buttons in toolbar; Space bar held = temporary hand mode
- **Layer rendering:** Reads `useYjsStore()`, renders `<StickyNote />`, `<ShapeRectangle />`, `<ShapeCircle />`, `<TextElement />`, or `<LineElement />` per layer
- **Marquee selection:** Drag on empty canvas draws a selection rectangle; releases select all layers whose bounding box intersects. Shift+drag extends selection.
- **Multi-select:** `selectedIds` is a `Set<string>`. Shift+click adds/removes from selection.
- **Batch drag:** All selected items move together when any one is dragged. Uses `handleDragStart` / `handleDragDelta` / `handleDragEnd` pattern with `dragStartPositions` ref. Wrapped in `ydoc.transact()`.
- **Context-sensitive formatting panel** (appears in toolbar when items are selected):
  - **Fill color** palette (8 presets + hex input) for rectangles, circles, and sticky notes
  - **Text color** palette for text elements
  - **Stroke color** palette for lines/arrows
  - **Font size** ±2 stepper for sticky notes and text elements
- **Toolbar (bottom-center):**
  - Select / Hand tool mode buttons
  - Add Sticky Note, Rectangle, Circle, Text, Line, Arrow
  - Formatting controls (context-sensitive, when selection exists)
  - Duplicate button (when selection exists)
  - Delete button (when selection exists)
  - Reset View button
- **Help button** (bottom-right, `?` key) — opens `<HelpModal />`
- **Keyboard shortcuts:**
  - `V` → select tool mode
  - `H` → hand tool mode
  - `Space` (hold) → temporary hand mode
  - `Ctrl+A` → select all layers
  - `Escape` → deselect all
  - `Ctrl+D` → duplicate selection (with 20px offset)
  - `Ctrl+C` → copy selection to in-memory clipboard
  - `Ctrl+V` → paste from clipboard (with 20px offset, repeated pastes stack)
  - `Delete` / `Backspace` → delete selected layers
  - `?` → toggle help modal
- **`<Avatars />`** rendered top-left
- **`<CursorPresence />`** rendered as overlay (absolute positioned, pointer-events none)
- **Hand-mode overlay** — a full-viewport div rendered in hand mode that captures all pointer events for panning, preventing accidental object interaction
- Wrapped in `<BoardTransformProvider>`

### `components/StickyNote.tsx`

- Absolutely positioned on the canvas at world coordinates
- **Drag:** `pointerdown` on note body → batch drag via `onDragStart` / `onDragDelta` / `onDragEnd` callbacks
- **Resize:** 4 corner handles, each with directional resize logic
- **Text editing:** Double-click → shows `<textarea>`, Escape/Enter (without shift) → saves text to `sharedLayers`
- **Selection:** Click → calls `onSelect(id, shiftKey)`; shows blue border ring when selected
- **Configurable font size** via `layer.fontSize` (default: 14); adjusted from toolbar
- **Configurable background color** via `layer.bgColor` (default: `#fffbeb`); adjusted from toolbar fill palette
- Min size: 80×60px, Default size: 200×150px

### `components/ShapeRectangle.tsx`

- Same drag/resize/select pattern as StickyNote (uses batch drag callbacks)
- No text content — just a colored rectangle
- Configurable `fill` color (default: `#93c5fd`, light blue); adjusted from toolbar fill palette
- Min size: 60×60px, Default size: 120×120px

### `components/ShapeCircle.tsx`

- Same drag/resize/select pattern as ShapeRectangle
- Renders as a circle/ellipse using `border-radius: 50%`
- Configurable `fill` color (default: `#86efac`, light green); adjusted from toolbar fill palette
- Min size: 60×60px, Default size: 120×120px

### `components/TextElement.tsx`

- Absolutely positioned standalone text element
- Same drag/resize/select pattern (uses batch drag callbacks)
- **Inline editing:** Double-click → contentEditable or textarea, Escape/Enter saves
- **Configurable:** `fontSize`, `fontWeight`, `color` — all adjustable from toolbar panels
- Default: 200×40px, fontSize 16, color `#1e293b`

### `components/LineElement.tsx`

- Renders an SVG line or arrow between two (or more) endpoints
- Points stored as absolute world-space coordinates in `layer.points: [number, number][]`
- `layer.x` / `layer.y` mirror the bounding-box top-left for consistent layer positioning
- **Endpoint drag:** Individual endpoint handles can be dragged
- **Whole-line drag:** Uses batch drag callbacks; all points are translated by the delta
- **Variant:** `"straight"` (plain line) or `"arrow"` (arrowhead on end point)
- **Configurable:** `color`, `thickness` — color adjustable from toolbar stroke palette

### `components/HelpModal.tsx`

- Modal overlay showing all keyboard shortcuts organized by category: Tools, Selection, Edit, View
- Triggered by `?` key or help button (bottom-right of canvas)
- Closes on `Escape` or clicking outside the modal panel
- Renders `<ShortcutRow>` sub-components with `<kbd>` styled key badges

### `components/Avatars.tsx`

- Reads `useAwareness()` for remote users
- For each user: shows `<img>` if avatar URL present, else shows first letter of name
- Positioned fixed top-left, stacked horizontally with slight overlap

### `components/CursorPresence.tsx`

- Reads `useAwareness()` for remote users with cursor data
- For each user: renders an SVG cursor icon + name label
- Converts world cursor position to screen position via `worldToScreen()`
- Pointer-events: none (doesn't block interaction)

---

## 6. All Environment Variables

| Variable | Where Set | Purpose |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `.env.local` / Vercel | Clerk public key |
| `CLERK_SECRET_KEY` | `.env.local` / Vercel | Clerk secret key (server-side only) |
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local` / Vercel | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` / Vercel | Supabase anon/public key |

---

## 7. Features Fully Implemented

| Feature | Status | Notes |
|---|---|---|
| User authentication | ✅ Complete | Clerk, protected routes, sign in/out |
| Real-time collaboration (CRDT) | ✅ Complete | Yjs Y.Map, custom Supabase provider |
| Board persistence | ✅ Complete | Auto-saves to Supabase Postgres every 5s |
| Sticky notes | ✅ Complete | Create, drag, resize, inline text edit, font size, bg color, delete |
| Rectangle shapes | ✅ Complete | Create, drag, resize, fill color, delete |
| Circle/ellipse shapes | ✅ Complete | Create, drag, resize, fill color, delete |
| Text elements | ✅ Complete | Create, drag, resize, inline edit, font size, text color, delete |
| Lines | ✅ Complete | Create, drag endpoints, stroke color, thickness |
| Arrows | ✅ Complete | Same as lines with arrowhead variant |
| Infinite canvas pan | ✅ Complete | Mouse drag on empty space (select or hand mode) |
| Infinite canvas zoom | ✅ Complete | Mouse wheel, zoom toward cursor |
| Tool modes (Select / Hand) | ✅ Complete | Toolbar buttons + V/H keyboard shortcuts |
| Space bar temporary pan | ✅ Complete | Hold Space for hand mode without switching permanently |
| Multi-select | ✅ Complete | Shift+click, marquee drag, Ctrl+A |
| Marquee selection | ✅ Complete | Drag on empty canvas to box-select multiple layers |
| Batch drag (move multiple) | ✅ Complete | All selected items move together, single ydoc transaction |
| Duplicate | ✅ Complete | Ctrl+D or toolbar button, 20px offset |
| Copy / Paste | ✅ Complete | Ctrl+C / Ctrl+V, in-memory clipboard, repeated paste stacks |
| Context-sensitive formatting | ✅ Complete | Fill color, text color, stroke color, font size — shown when relevant types selected |
| Sticky note colors | ✅ Complete | `bgColor` field, 8 presets + hex input |
| Sticky note font size | ✅ Complete | `fontSize` field, ±2 stepper in toolbar |
| Live cursor presence | ✅ Complete | Remote cursors with username labels |
| User avatar display | ✅ Complete | Connected user list, top-left |
| Keyboard shortcuts | ✅ Complete | V, H, Space, Ctrl+A, Escape, Ctrl+D, Ctrl+C, Ctrl+V, Delete, ? |
| Help modal | ✅ Complete | ? key or button opens shortcut reference |
| Selection system | ✅ Complete | Click to select, Shift+click multi-select, visual ring indicator |
| Reset view | ✅ Complete | Toolbar button resets pan+zoom |
| Deployment guide | ✅ Complete | Vercel + Supabase documented in DEPLOY.md |

---

## 8. Known Limitations & What Should Be Worked On Next

### 8.1 High Priority — Core Missing Features

**1. Multiple Boards / Room System**
- Currently there is exactly **one hardcoded board** (`"collab-board-main"` in `lib/yjs-store.ts`)
- Users should be able to create multiple boards, name them, share links to specific boards
- Requires: a board listing UI, per-board room IDs, URL-based routing (e.g., `/board/[id]`)
- Requires: a `boards` table in Supabase

**2. Undo / Redo**
- Yjs has built-in undo management (`Y.UndoManager`) but it is not wired up
- `Y.UndoManager` tracks changes to specific shared types and can undo/redo them
- Toolbar should have undo/redo buttons; keyboard shortcuts `Ctrl+Z` / `Ctrl+Shift+Z`
- All mutations already use `ydoc.transact()` so each user action will be a clean single undo step

**3. Layer Ordering (Z-index)**
- All layers render in the order they appear in the Yjs map, which is insertion order
- There is no "bring to front / send to back" functionality
- Users cannot control which shape appears on top when they overlap
- Requires: storing a `z` or `order` field in each layer, or using a `Y.Array` for ordered layer list

**4. Freehand Drawing**
- Currently no freehand/pencil drawing tool
- Would require a `Y.Array` of stroke points or a dedicated freehand layer type
- This is the most-requested missing shape type for a whiteboard tool

### 8.2 Medium Priority — UX Improvements

**5. Text Formatting in Sticky Notes / Text Elements**
- Currently a plain `<textarea>` / contentEditable — no markdown, no bold/italic
- `fontWeight` field exists on `TextLayer` but is not surfaced in the formatting panel
- Could integrate a rich text editor (e.g., Tiptap with `y-prosemirror`) for true collaborative inline editing
- Note: concurrent edits to the same sticky note's `text` field are last-write-win, not character-level merge

**6. Line Multi-point / Curve Support**
- Lines currently support two endpoints; could extend to polylines or bezier curves
- Routing arrows around shapes is a common feature in diagramming tools

**7. Image Upload / Embedding**
- Users cannot add images to the board
- Would require Supabase Storage for image hosting

**8. Export / Share**
- No way to export the board as PNG, SVG, or PDF
- Could use `html2canvas` or similar to capture the canvas

**9. Minimap**
- No overview minimap for navigating large boards
- Common in tools like Miro, helpful when board content is spread out

### 8.3 Lower Priority — Technical Debt & Polish

**10. Per-User Sticky Note Cursors (Text Collaboration)**
- If two users edit the same sticky note simultaneously, changes conflict (last-write-wins on the whole `text` field)
- True character-level collaboration requires replacing the `text: string` field with a `Y.Text` type and using `y-prosemirror` or a similar binding
- This is architecturally significant — would require refactoring how layer data is stored

**11. Reconnection & Offline Resilience**
- The current provider doesn't visibly handle disconnection (e.g., show a "reconnecting..." banner)
- Users might not know if they're offline
- Yjs itself handles offline edits (they queue up), but the UI gives no feedback

**12. Board Access Control**
- Currently any authenticated user accesses the same board
- There's no concept of "this board belongs to this user/team"
- For a real enterprise product: boards should have owners, collaborators, and view-only guests

**13. Performance on Large Boards**
- All layers are rendered as DOM elements — there's no virtualization
- On a board with hundreds of elements, performance would degrade
- Should implement canvas-based rendering (e.g., via `<canvas>` API or Konva.js) or at minimum virtualize off-screen elements

**14. Mobile / Touch Support**
- Drag and resize logic is built for pointer events (works for mouse, partially for touch)
- No pinch-to-zoom gesture handling
- The app is primarily desktop-oriented currently

**15. Cursor Throttling**
- Awareness cursor updates fire on every `pointermove` event
- On fast movements this could flood the Supabase Realtime channel
- Should throttle awareness broadcasts (e.g., max 30 fps / ~33ms)

**16. Per-User Color Assignment**
- Currently, user name comes from Clerk profile
- All cursors look the same except for the name label
- Should assign each connected user a distinct color (for cursor, avatar border, selection highlight)

**17. AI Integration**
- `PROJECT.md` mentions "For AI features, use Anthropic Claude 3.5 Sonnet tool-calling patterns" — this is aspirational, not implemented
- Possible AI features: sticky note summarization, auto-layout, content generation, meeting notes extraction

---

## 9. Development Principles (from PROJECT.md)

1. **Priority #1:** Bulletproof multiplayer sync (Yjs CRDT + Supabase Realtime). Sync is self-hosted; no third-party sync service.
2. **Priority #2:** Enterprise security (Clerk + Supabase RLS).
3. Use TypeScript for all components; strict typing for Board Objects.
4. Follow Yjs + Supabase integration patterns (shared Y.Doc, custom SupabaseYjsProvider, optional persistence via `yjs_updates`).
5. For AI features, use Anthropic Claude 3.5 Sonnet tool-calling patterns.

---

## 10. How to Run Locally

```bash
# Install dependencies
npm install

# Set environment variables in .env.local:
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# Apply Supabase schema (run schema.sql in Supabase SQL Editor)

# Start dev server
npm run dev
# → http://localhost:3000
```

---

## 11. Deployment

- Hosted on **Vercel** (Next.js native)
- Database and Realtime on **Supabase** (free tier sufficient for MVP)
- Auth on **Clerk** (free tier sufficient)
- All environment variables must be set in Vercel project settings
- Clerk dashboard must have the production Vercel domain added

---

## 12. Summary

CollabBoard is a **production-quality, self-hosted collaborative whiteboard** built on Next.js 16 + Yjs + Supabase + Clerk. It's architecturally clean: Yjs handles all CRDT state, a custom provider handles transport (Supabase Realtime broadcast) and persistence (Supabase Postgres), and React components just read from Yjs and write back to it.

The app has grown significantly beyond its initial MVP. The current element palette (sticky notes, rectangles, circles, text, lines, arrows) covers the core whiteboard use case. Multi-select, marquee selection, copy/paste, duplicate, context-sensitive formatting, and a full keyboard shortcut system make it feel polished.

The **most impactful next features** in order of priority are:
1. **Undo/Redo** via `Y.UndoManager` (already in Yjs, just needs wiring — all mutations are already transacted)
2. **Multiple boards** with a board listing/management UI
3. **Layer z-ordering** (bring to front/back)
4. **Freehand drawing** (pencil tool with stroke point arrays)
5. **Rich text in sticky notes** (via y-prosemirror / Tiptap for true character-level collaboration)
6. **Per-user cursor color assignment**
7. **Reconnection UI / offline feedback**
8. **Image upload** (Supabase Storage)
9. **Export to PNG/SVG**
10. **AI integration** (Claude 3.5 Sonnet for summarization, layout, content generation)

The codebase is small (~20 files), well-typed, and easy to extend. The hardest architectural change would be adding rich text (y-prosemirror) or switching to canvas-based rendering for performance. Everything else is relatively straightforward to add.
