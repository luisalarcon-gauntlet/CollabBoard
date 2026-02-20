# Deploying CollabBoard

This guide gets the app **deployed and publicly accessible** (MVP requirement).

## Recommended: Vercel

1. **Push your code** to a Git repo (GitHub, GitLab, or Bitbucket).

2. **Import the project** in [Vercel](https://vercel.com):
   - New Project → Import your repo.
   - Framework: **Next.js** (auto-detected).
   - Root directory: leave as repo root.

3. **Environment variables** (required for auth and sync):
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — from [Clerk Dashboard](https://dashboard.clerk.com) → API Keys.
   - `CLERK_SECRET_KEY` — same place (keep secret).
   - `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL.
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/public key.

   In Vercel: Project → Settings → Environment Variables. Add each for **Production** (and Preview if you want).

4. **Clerk production URLs** (so sign-in works on your domain):
   - In [Clerk Dashboard](https://dashboard.clerk.com) → Domains, add your Vercel URL (e.g. `https://your-app.vercel.app`).
   - Set Sign-in URL, Sign-up URL, and After sign-in redirect to your deployed app as needed.

5. **Deploy**: Vercel will build and deploy. Your app will be publicly accessible at the given URL.

## Board persistence (Supabase)

Board state is saved to Supabase so it survives refresh and logout.

1. **Env vars** (required for persistence): set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` (dev) or in Vercel (prod). Get them from [Supabase Dashboard](https://supabase.com/dashboard/project/_/settings/api).

2. **Schema**: run the SQL in `supabase/schema.sql` in your Supabase project’s [SQL Editor](https://supabase.com/dashboard/project/_/sql). This creates the `yjs_updates` table and RLS policies. The `content` column is `text` (base64-encoded Yjs state). If you already created the table with `content bytea`, either recreate the table from `schema.sql` or run: `ALTER TABLE yjs_updates ALTER COLUMN content TYPE text;` so the app can save correctly (the app sends base64 strings).

3. **Check logs**: In dev, open the browser console. You should see `[SupabaseYjsProvider] Loaded initial state from DB.` or `No saved state in DB (empty board).` on load, and `Saved state to DB.` every ~5s after changes. Any `Could not load initial state` or `Save failed` message indicates a config or schema issue (missing env, table not created, or RLS blocking).

## Checklist

- [ ] Repo pushed and imported on Vercel  
- [ ] All four env vars set in Vercel  
- [ ] Clerk domain and redirect URLs updated for production  
- [ ] Supabase schema applied for the project whose keys you use  
- [ ] Deploy and test: sign in, add stickies/shapes, open in another browser to confirm real-time sync and cursors  
