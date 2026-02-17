# Project: CollabBoard
# Stack: Next.js (App Router), Yjs, Supabase, Clerk, Tailwind CSS.

## Development Principles
- Priority #1: Bulletproof multiplayer sync (Yjs CRDT + Supabase Realtime). Sync is self-hosted; no third-party sync service.
- Priority #2: Enterprise security (Clerk + Supabase RLS).
- Use TypeScript for all components; ensure strict typing for Board Objects.
- Follow Yjs + Supabase integration patterns (shared Y.Doc, Custom SupabaseYjsProvider, optional persistence via `yjs_updates`).
- For AI features, use Anthropic Claude 3.5 Sonnet tool-calling patterns.
