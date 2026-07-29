# SciFit

Mobile-first web app for science based lifting, nutrition targets, RAG-ready coaching, and multimodal media intake.

## What Works Now

- Dark olive mobile UI with bottom navigation
- Profile driven split generator
- Nutrition target calculator
- Workout and meal logging
- Image and video upload previews
- Local AI coach fallback with source-style citations
- Supabase-ready auth, tables, RLS, private Storage, and future RAG vectors
- Static web deployment support through GitHub Pages

## Stack

- React + Vite + TypeScript
- Framer Motion for subtle screen transitions
- Lucide React icons
- Supabase JS client
- GitHub Pages deployment

## Local Run

```bash
npm install
npm run dev
```

## Supabase

The app runs in local demo mode until these are set:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
VITE_RAG_ENDPOINT=https://YOUR_PROJECT_REF.supabase.co/functions/v1/rag-chat
VITE_RAG_API_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

Apply the migration in `supabase/migrations/202607290001_scifit_mvp.sql` to create profiles, workout logs, nutrition logs, AI upload metadata, private media Storage, public research cards, and future RAG vector tables.

## AI Integration Next

The UI is ready for three live model steps:

- Vision model for lifting video form feedback
- Vision model for meal image nutrition estimates
- RAG endpoint for research grounded answers

Recommended API values to add later:

- `OPENAI_API_KEY` for multimodal and text reasoning
- `HF_TOKEN` only if continuing with the existing E5 embedding flow
- Supabase Edge Function secrets for server-side model calls

Keep model API keys server-side in Supabase Edge Functions. Do not expose secret keys as `VITE_` variables.

## Deploy

```bash
npm run build
npm run deploy
```

GitHub Pages can serve the generated static app from the `gh-pages` branch.
