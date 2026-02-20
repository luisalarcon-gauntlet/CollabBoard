# CollabBoard

A real-time collaborative whiteboard built with Next.js, Yjs, Supabase, and Clerk.

## Features

### Tools
| Tool | Shortcut | Description |
|------|----------|-------------|
| Select | `V` | Click to select objects, drag to move, marquee-drag on the canvas to multi-select |
| Hand / Pan | `H` | Click-drag the canvas to pan. Hold `Space` from any tool for a temporary pan |
| Connector | `C` | Draw managed connectors between shapes. Hover a shape to reveal anchor points, then drag to a target shape to create the connection |

### Objects
- **Sticky Note** — Resizable notes with editable text and customisable background colour
- **Rectangle** — Resizable rectangle with fill colour
- **Circle** — Resizable circle with fill colour (hold `Shift` to constrain to a square)
- **Text** — Freeform text block with adjustable font size and colour
- **Line / Arrow** — Free-draw lines with draggable endpoints
- **Smart Connector** — Managed edge between two objects that re-routes automatically when either object is moved or resized

### Smart Connectors
Connectors are first-class objects persisted in the shared Yjs document so every collaborator sees identical routing in real time.

- **Edge-to-edge routing** — endpoints are calculated at the perimeter of each shape's bounding box, so the line never overlaps the fill
- **Three routing styles** (selectable from the toolbar when a connector is selected):
  - `Straight` — direct line between perimeter points
  - `Curved` — cubic Bézier whose control-point tangents align with the exit/entry edge
  - `Elbow` — three-segment Manhattan (H→V→H or V→H→V) path for a clean diagramming look
- **Endpoint decorations** — `Arrow`, `Dot`, or `None`
- **Custom colour & dash pattern** — stroke colour shared across all users via Yjs
- **Optional label** — text rendered at the path midpoint with a white outline for legibility
- **Orphan cleanup** — if a connected shape is deleted, all connectors referencing it are automatically removed from the shared document in the same transaction

### Selection & Editing
- Click an object to select it; `Shift`+click to add/remove from selection
- Drag on an empty area of the canvas to draw a marquee selection rectangle
- `⌘A` — select all objects
- `Esc` — deselect / cancel current action
- `⌘D` — duplicate selection
- `⌘C` / `⌘V` — copy / paste (repeated pastes offset by 20 px)
- `Delete` / `Backspace` — delete selected objects (connected connectors are cleaned up automatically)

### View
- Scroll wheel to zoom (disabled while the keyboard-shortcut help panel is open)
- `Space` (hold) — temporary pan from any tool, including Connector mode
- Reset View button — returns to 1:1 zoom centred on the canvas

### Multiplayer
- Live cursor presence with user avatars
- All objects, positions, styles, and connector routes are stored in a shared Yjs CRDT document
- Persisted to Supabase (`yjs_updates` table) with a 5-second auto-save interval
- Authentication via Clerk

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| Real-time sync | Yjs + custom `SupabaseYjsProvider` |
| Persistence | Supabase (Postgres + Realtime) |
| Auth | Clerk |
| Styling | CSS Modules + Tailwind CSS |
| Icons | Lucide React |

## Getting Started

### Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) project with the schema from `supabase/schema.sql`
- A [Clerk](https://clerk.com) application

### Environment variables

Copy `.env.local.example` to `.env.local` and fill in the values:

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

### Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deployment

Deploy to [Vercel](https://vercel.com) and set the same environment variables in the project settings. See `DEPLOY.md` for full instructions.
