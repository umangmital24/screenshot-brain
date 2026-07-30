# Screenshot Memory — MVP

Turns screenshots into structured "intent memories" (Read Later, Buy Later, Cook Later, etc.)
instead of a graveyard of images in your gallery.

## Stack (all free tier, no local admin rights needed)
- **Vision + Chat**: Google Gemini API (free tier, `gemini-2.5-flash` — no shared queue, no data-policy toggles)
- **Database + Storage**: Supabase (Postgres + file storage, free tier)
- **Backend**: FastAPI (deploy free on Render/Railway)
- **Frontend**: (not built yet — React on Vercel, next step)

## Setup

### 1. Supabase
1. Create a free project at https://supabase.com
2. Go to SQL Editor → paste and run `supabase_schema.sql`
3. Also run this function (needed for fuzzy dedupe):
   ```sql
   create or replace function match_memory(p_user_id uuid, p_item_name text, p_threshold float)
   returns setof memories as $$
     select * from memories
     where user_id = p_user_id
       and similarity(item_name, p_item_name) > p_threshold
     order by similarity(item_name, p_item_name) desc
     limit 1;
   $$ language sql stable;
   ```
4. Go to Storage → create a new bucket named `screenshots`, set it **public**
5. Go to Project Settings → API → copy your `URL` and `service_role` key (or `anon` key for now)

### 2. Gemini API
1. Go to https://aistudio.google.com/apikey
2. Sign in with Google, click **Create API key** — no credit card required
3. Copy the key. Free tier gives `gemini-2.5-flash` at 10 RPM / 250 requests per day
   (plenty for personal use; `gemini-2.5-flash-lite` has an even higher free quota
   — 15 RPM / 1,000/day — if you need more headroom, just change `GEMINI_VISION_MODEL`)

### 3. Local config
```bash
cp .env.example .env
# fill in SUPABASE_URL, SUPABASE_KEY, GEMINI_API_KEY
```

### 4. Run
```bash
pip install -r requirements.txt
uvicorn app.main:app --reload
```
Visit http://localhost:8000/docs for interactive API testing (Swagger UI) —
you can upload a screenshot straight from the browser there, no frontend needed yet.

## API Endpoints
- `POST /screenshot` — upload an image, runs the full pipeline (upload → vision → dedupe → save)
- `GET /memories?intent=READ_LATER` — list memories, optionally filtered
- `GET /memories/summary` — counts grouped by intent (for dashboard cards)
- `POST /chat` — `{"question": "what books have I saved?"}`

## Testing without a frontend
Use the `/docs` Swagger UI, or curl:
```bash
curl -X POST http://localhost:8000/screenshot \
  -F "file=@/path/to/screenshot.png"

curl http://localhost:8000/memories

curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "what products did I want to buy?"}'
```

## Known MVP limitations (by design, see build plan)
- Single hardcoded user, no auth yet
- No Android auto-detect — manual upload only
- Dedupe similarity threshold (0.4) is a starting guess — tune after testing with real screenshots
- Free OpenRouter models can be rate-limited or flaky on strict JSON — there's a one-time retry built into `vision.py`, but expect occasional failures
