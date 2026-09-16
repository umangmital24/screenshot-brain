from __future__ import annotations

import argparse
import logging

from app.services.db import get_client
from app.services.embeddings import persist_memory_embeddings

logger = logging.getLogger(__name__)


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill missing Samhaal memory embeddings.")
    parser.add_argument("--batch-size", type=int, default=100)
    parser.add_argument("--max-batches", type=int, default=100)
    parser.add_argument("--user-id", default=None, help="Optional single-user backfill")
    args = parser.parse_args()

    if args.batch_size <= 0 or args.max_batches <= 0:
        raise SystemExit("batch-size and max-batches must be positive")

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    client = get_client()
    total = 0

    for batch_number in range(1, args.max_batches + 1):
        query = (
            client.table("memories")
            .select("id,item_name,category,intent,summary,extracted_text,visual_context")
            .is_("embedding", "null")
            .order("last_seen", desc=True)
            .limit(args.batch_size)
        )
        if args.user_id:
            query = query.eq("user_id", args.user_id)

        rows = query.execute().data or []
        if not rows:
            break

        updated = persist_memory_embeddings(client, rows)
        total += updated
        logger.info("Batch %d: embedded %d/%d memories", batch_number, updated, len(rows))
        if updated == 0:
            logger.warning("No rows were updated; stopping to avoid a tight loop")
            break

    logger.info("Embedding backfill complete: %d memories indexed", total)


if __name__ == "__main__":
    main()
