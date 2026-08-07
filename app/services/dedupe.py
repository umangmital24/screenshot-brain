from app.services.db import get_client

SIMILARITY_THRESHOLD = 0.4  # pg_trgm similarity, 0-1 (tune after testing real data)


def find_similar_memory(user_id: str, item_name: str) -> dict | None:
    """Uses Postgres pg_trgm similarity via an RPC function to find a near-duplicate
    memory for this user. Returns the existing row dict if found, else None.

    Requires a Postgres function created in Supabase (see supabase_schema.sql
    for the trigram index; function below goes in SQL editor too):

    create or replace function match_memory(p_user_id uuid, p_item_name text, p_threshold float)
    returns setof memories as $$
      select * from memories
      where user_id = p_user_id
        and similarity(item_name, p_item_name) > p_threshold
      order by similarity(item_name, p_item_name) desc
      limit 1;
    $$ language sql stable;
    """
    client = get_client()
    result = client.rpc(
        "match_memory",
        {"p_user_id": user_id, "p_item_name": item_name, "p_threshold": SIMILARITY_THRESHOLD},
    ).execute()
    rows = result.data or []
    return rows[0] if rows else None


def upsert_memory(user_id: str, screenshot_id: str, intent: str, category: str | None,
                   item_name: str, item_type: str | None, summary: str | None,
                   extracted_text: str | None = None) -> dict:
    """Insert a new memory, or bump frequency + last_seen if a similar one exists."""
    client = get_client()
    existing = find_similar_memory(user_id, item_name)

    if existing:
        updated = client.table("memories").update({
            "frequency": existing["frequency"] + 1,
            "last_seen": "now()",
            # keep screenshot_id/extracted_text pointed at the most recent sighting,
            # so "click to view" always opens the latest matching screenshot
            "screenshot_id": screenshot_id,
            "extracted_text": extracted_text,
        }).eq("id", existing["id"]).execute()
        return updated.data[0]

    inserted = client.table("memories").insert({
        "screenshot_id": screenshot_id,
        "user_id": user_id,
        "intent": intent,
        "category": category,
        "item_name": item_name,
        "item_type": item_type,
        "summary": summary,
        "extracted_text": extracted_text,
        "frequency": 1,
    }).execute()
    return inserted.data[0]
