# Supabase Setup

Apply all SQL files in `supabase/migrations` to a new Supabase project in filename order.

The migration creates:

- Auth-owned athlete profiles
- Workout and nutrition logs with row level security
- Private `media` Storage bucket for image and video uploads
- AI upload metadata table
- Per-user research source library for imported PubMed/Europe PMC papers and manual sources
- Future RAG document and vector chunk tables

The frontend reads:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- Optional `VITE_RAG_ENDPOINT`
- Optional `VITE_RAG_API_KEY`

The app runs without these values in local mode. Without Supabase, source imports, logs, and media previews persist in browser storage only.
