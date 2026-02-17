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

## Optional: Supabase production

- Use the same Supabase project (and keys) for dev and prod, or create a separate project for production.
- Ensure `yjs_updates` and Realtime are set up (run `supabase/schema.sql` in the SQL Editor for the project you use).
- If you use a different Supabase project for prod, set the prod env vars in Vercel to that project’s URL and anon key.

## Checklist

- [ ] Repo pushed and imported on Vercel  
- [ ] All four env vars set in Vercel  
- [ ] Clerk domain and redirect URLs updated for production  
- [ ] Supabase schema applied for the project whose keys you use  
- [ ] Deploy and test: sign in, add stickies/shapes, open in another browser to confirm real-time sync and cursors  
