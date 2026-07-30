# SciFit

Mobile-first web app for science based lifting, nutrition targets, source-grounded AI coaching, and multimodal media intake.

## What Works Now

- Dark olive mobile UI with bottom navigation
- Profile driven split generator
- Nutrition target calculator
- Workout and meal logging
- Image and video upload intake for AI review
- Seeded PubMed-backed RAG corpus for local source-grounded coaching
- Clickable citations in coach answers
- Developer-only source tooling behind `VITE_SHOW_RESEARCH_ADMIN`
- Supabase-ready auth, Postgres, RLS, private Storage, source sync, pgvector chunks, and Edge Functions
- PWA metadata and mobile safe-area support for later App Store wrapping
- Static web deployment support through GitHub Pages

## Stack

- React + Vite + TypeScript
- Framer Motion for subtle screen transitions
- Lucide React icons
- Supabase JS client
- Supabase Edge Functions
- Postgres + pgvector
- GitHub Pages deployment

## Local Run

```bash
npm install
npm run dev
```

## Supabase

The app runs in local mode until these are set:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

Apply the migrations in `supabase/migrations` to create profiles, workout logs, nutrition logs, AI upload metadata, private media Storage, user research sources, and RAG vector tables.

Deploy the Edge Functions:

```bash
supabase functions deploy ingest-source
supabase functions deploy rag-chat
supabase functions deploy seed-research --no-verify-jwt
```

Set server-side Supabase secrets:

```bash
supabase secrets set GEMINI_API_KEY=YOUR_FREE_AI_STUDIO_KEY
supabase secrets set GEMINI_MODEL=gemini-2.5-flash
supabase secrets set GEMINI_EMBED_MODEL=gemini-embedding-2
supabase secrets set SCIFIT_ADMIN_SEED_SECRET=CHANGE_ME_LONG_RANDOM_VALUE
```

Seed the global research corpus after the migration and functions are deployed:

```bash
curl -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/seed-research" \
  -H "x-scifit-admin-secret: CHANGE_ME_LONG_RANDOM_VALUE"
```

The public app does not ask users to add research papers. Users enter their stats, goals, training logs, meals, and image/video uploads. SciFit retrieves from the seeded corpus, cites papers in coach answers, and can optionally use developer-added sources through the hidden research admin UI in local/dev builds.

The frontend works without a model key by ranking the built-in PubMed corpus in the browser and generating constrained source-grounded guidance. With Supabase functions deployed and `GEMINI_API_KEY` set, sources are embedded into Postgres/pgvector and the coach uses multimodal RAG for answers, image/video review, and plan creation.

## AI Integration Next

The app is ready for three live model steps:

- Multimodal model for lifting video form feedback
- Multimodal model for meal image nutrition estimates
- Server-side RAG over Postgres vector chunks

Free-first API options to add later:

- Europe PMC REST API: no key required for developer-side literature search
- NCBI API key: optional free account key for higher PubMed request limits
- Hugging Face token: optional free-tier embeddings or vision experiments
- Gemini API key from Google AI Studio for free-tier multimodal generation and embeddings
- Supabase Edge Function secrets for server-side model calls

Keep model API keys server-side in Supabase Edge Functions. Do not expose secret keys as `VITE_` variables.

## Deploy

```bash
npm run build
npm run deploy
```

GitHub Pages can serve the generated static app from the `gh-pages` branch.
