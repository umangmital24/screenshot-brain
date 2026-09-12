from __future__ import annotations

import logging
import os
import time

from app.services.db import get_client
from app.services.embeddings import persist_memory_embeddings

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
logger = logging.getLogger("samhaal.embedding_backfill")

BATCH_SIZE = max(1, min(int(os.environ.get("EMBEDDING_BACKFILL_BATCH_SIZE", "64")), 250))
SLEEP_SECONDS = max(float(os.environ.get("EMBEDDING_BACKFILL_SLEEP_SECONDS", "0.25")), 0.0)


def main() -> None:
    client = get_client()
    total = 0

    while True:
        result = (
            client.table("memories")
            .select("id,item_name,category,intent,summary,extracted_text,visual_context")
            .is_("embedding", "null")
            .order("created_at")
            .limit(BATCH_SIZE)
            .execute()
        )
        memories = result.data or []
        if not memories:
            break

        updated = persist_memory_embeddings(client, memories)
        total += updated
        logger.info("Embedded %d memories in this batch (%d total)", updated, total)

        if updated == 0:
            logger.warning("No embeddings were written; stopping to avoid a tight loop")
            break
        if SLEEP_SECONDS:
            time.sleep(SLEEP_SECONDS)

    logger.info("Embedding backfill complete: %d memories updated", total)


if __name__ == "__main__":
    main()
