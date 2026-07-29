# Supabase Setup

Apply `supabase/migrations/202607290001_scifit_mvp.sql` to a new Supabase project.

The migration creates:

- Auth-owned athlete profiles
- Workout and nutrition logs with row level security
- Private `media` Storage bucket for image and video uploads
- AI upload metadata table
- Public research cards
- Future RAG document and vector chunk tables

The frontend reads:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- Optional `VITE_RAG_ENDPOINT`
- Optional `VITE_RAG_API_KEY`

The app runs without these values in local demo mode.
