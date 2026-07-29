# Supabase Setup

Apply all SQL files in `supabase/migrations` to a new Supabase project in filename order.

The migration creates:

- Auth-owned athlete profiles
- Workout and nutrition logs with row level security
- Private `media` Storage bucket for image and video uploads
- AI upload metadata table
- Per-user research source library for imported PubMed/Europe PMC papers and manual sources
- RAG document and pgvector chunk tables
- `match_rag_chunks` RPC for server-side vector retrieval
- `ingest-source` and `rag-chat` Edge Function source files

The frontend reads:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Edge Function secrets:

- `GEMINI_API_KEY`
- Optional `GEMINI_MODEL`
- Optional `GEMINI_EMBED_MODEL`

The app runs without these values in local mode. Without Supabase, source imports, logs, and media previews persist in browser storage only. Without `GEMINI_API_KEY`, the Edge Function ingestion can still write local hash embeddings for pipeline testing, but full multimodal AI requires the Gemini secret.
