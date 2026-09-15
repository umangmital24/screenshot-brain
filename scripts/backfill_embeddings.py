"""Backfill semantic vectors for memories created before pgvector retrieval.

Usage:
  python scripts/backfill_embeddings.py
  python scripts/backfill_embeddings.py --user-id <uuid> --limit 500

Run after applying supabase_schema.sql. Existing memories remain usable while this runs.
"""

import argparse

from app.services.db import get_client
from app.services.retrieval import attach_embedding


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--user-id", default=None)
    parser.add_argument("--limit", type=int, default=5000)
    args = parser.parse_args()

    query = get_client().table("memories").select("*").is_("embedding", "null")
    if args.user_id:
        query = query.eq("user_id", args.user_id)
    rows = query.limit(max(1, args.limit)).execute().data or []

    ok = 0
    failed = 0
    for index, memory in enumerate(rows, start=1):
        if attach_embedding(memory):
            ok += 1
        else:
            failed += 1
        if index % 25 == 0:
            print(f"indexed={ok} failed={failed} processed={index}/{len(rows)}")

    print(f"done: indexed={ok} failed={failed} total={len(rows)}")


if __name__ == "__main__":
    main()
