# SciFit

Mobile-first web app for science based lifting, nutrition targets, source-grounded AI coaching, and multimodal media intake.

## What Works Now

- Dark olive mobile UI with bottom navigation
- Profile driven split generator
- Nutrition target calculator
- Workout and meal logging
- Image and video upload previews
- Free local RAG over imported Europe PMC/PubMed sources and manually added papers
- Clickable citations in coach answers
- Source library that can be updated from the app
- Supabase-ready auth, tables, RLS, private Storage, source sync, and future RAG vectors
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

The app runs in local mode until these are set:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

Apply the migrations in `supabase/migrations` to create profiles, workout logs, nutrition logs, AI upload metadata, private media Storage, user research sources, and future RAG vector tables.

Optional backend model endpoint:

```bash
VITE_RAG_ENDPOINT=https://YOUR_PROJECT_REF.supabase.co/functions/v1/rag-chat
VITE_RAG_API_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

The frontend works without a model key by importing abstracts from the free Europe PMC REST API, ranking the local source library, and generating constrained source-grounded guidance. A backend model can later turn the retrieved context into richer prose.

## AI Integration Next

The app is ready for three live model steps:

- Vision model for lifting video form feedback
- Vision model for meal image nutrition estimates
- Server-side RAG endpoint for research-grounded answers and embeddings

Free-first API options to add later:

- Europe PMC REST API: no key required for literature search
- NCBI API key: optional free account key for higher PubMed request limits
- Hugging Face token: optional free-tier embeddings or vision experiments
- Supabase Edge Function secrets for any server-side model calls

Keep model API keys server-side in Supabase Edge Functions. Do not expose secret keys as `VITE_` variables.

## Deploy

```bash
npm run build
npm run deploy
```

GitHub Pages can serve the generated static app from the `gh-pages` branch.
