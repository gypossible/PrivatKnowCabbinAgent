# Private Knowledge Base

NotebookLM-style app: **upload files** or **ingest URLs / web search (Tavily)**, then **chat** with retrieval (pgvector + OpenAI) and optional **DALL·E 3** illustrations. Auth and data are **per-user** via **Supabase** (Postgres + Storage + RLS).

## Prerequisites

- Node 20+
- A [Supabase](https://supabase.com) project
- An [OpenAI](https://platform.openai.com) API key
- (Optional) [Tavily](https://tavily.com) API key for “Search & ingest” and “Allow web snippets” in chat

## Supabase setup

1. In the SQL editor, run the migration in [`supabase/migrations/20250322000000_init.sql`](supabase/migrations/20250322000000_init.sql) (enables `vector`, creates tables, RLS, `match_notebook_chunks`, storage bucket `sources` and policies).

2. **Authentication**: enable Email (password) under Authentication → Providers.

3. **Site URL**: set Authentication → URL Configuration → Site URL to your app origin (e.g. `http://localhost:3000` or your Vercel URL). Add the same to Redirect URLs.

4. Confirm Storage bucket **`sources`** exists (the migration inserts it). Files are stored under `{user_id}/...`.

## Environment variables

Copy [`.env.example`](.env.example) to `.env.local` and fill in:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (browser + server with user session) |
| `OPENAI_API_KEY` | Embeddings, chat (`gpt-4o-mini`), images (`dall-e-3`) |
| `TAVILY_API_KEY` | Optional; required for search-ingest and live web snippets in chat |
| `NEXT_PUBLIC_APP_URL` | Optional; used for redirects in production |

**Do not** expose `SUPABASE_SERVICE_ROLE_KEY` in the browser; this app uses the anon key + user JWT + RLS only.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign up, create a notebook, add sources, then chat.

**Build note:** `npm run build` uses `next build --webpack` so builds work when the native SWC binary is unavailable (e.g. some environments fall back to WASM-only tooling).

## GitHub: create `PrivatKnowCabbinAgent` and push

**Security:** If a personal access token was ever pasted into chat or logs, **revoke it** in GitHub → Settings → Developer settings → [Personal access tokens](https://github.com/settings/tokens) and create a **new** token. Never commit tokens or put them in the repo.

From this directory, after committing:

1. **Option A — script (needs a new `GITHUB_TOKEN` in your shell only):**
   ```bash
   export GITHUB_TOKEN="ghp_YOUR_NEW_TOKEN"
   bash scripts/create-github-repo-and-push.sh
   ```
2. **Option B — manual:** Create a **public** empty repo named `PrivatKnowCabbinAgent` under `gypossible`, then:
   ```bash
   git remote add origin https://github.com/gypossible/PrivatKnowCabbinAgent.git
   git push -u origin main
   ```

Repository URL: `https://github.com/gypossible/PrivatKnowCabbinAgent`

## Deploy a public website (Vercel)

This app uses API routes and server code; **GitHub Pages alone is not enough**. Use **Vercel** (or similar) for a public URL.

1. Push the repo to GitHub (see above).
2. Go to [vercel.com](https://vercel.com) → **Add New** → **Project** → **Import** `gypossible/PrivatKnowCabbinAgent`.
3. Framework Preset: **Next.js**. Build command: `npm run build` (already set in `package.json`).
4. Add the same environment variables as in `.env.example` (Supabase + OpenAI; optional Tavily).
5. Deploy. Your site will be at a URL like `https://privat-know-cabbin-agent.vercel.app` (exact subdomain is assigned by Vercel; you can add a custom domain in project settings).
6. In **Supabase** → Authentication → URL configuration, set **Site URL** and **Redirect URLs** to your Vercel URL.

**Limits / cost:** OpenAI, Tavily, and Supabase bill separately; add rate limiting if the site is public.

## Project layout

- `src/app/api/notebooks/*` — notebooks CRUD, upload, URL ingest, Tavily search ingest, streaming chat
- `src/lib/extract-file.ts` — PDF / DOCX / text extraction
- `src/lib/extract-url.ts` — HTML → text via Cheerio
- `src/lib/ingest.ts` — chunking + embeddings + `document_chunks` inserts
- `src/components/NotebookWorkspace.tsx` — notebook UI (sources + chat)

## Compliance

Fetching third-party URLs is the operator’s responsibility (robots.txt, terms of use, copyright). Tavily reduces but does not remove that obligation.
