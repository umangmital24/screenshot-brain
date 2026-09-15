"""Evaluate Samhaal retrieval with measured IR metrics.

Create a human-labelled JSONL dataset where each line is:
  {"query": "that cafe in GK", "relevant_memory_ids": ["<memory-uuid>"]}

Run:
  python scripts/evaluate_retrieval.py --user-id <uuid> --dataset data/retrieval_eval.jsonl --k 5

The script compares three systems on the same labels:
  1. lexical: PostgreSQL FTS + trigram baseline
  2. semantic: BGE/pgvector cosine retrieval
  3. production: Samhaal's constraint-aware hybrid ranker

It reports Precision@K, Recall@K, MRR and NDCG@K. No result is hard-coded.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Callable

from app.services.db import get_client
from app.services.embeddings import embed_text, vector_literal
from app.services.query_parser import parse_ask_query
from app.services.retrieval import retrieve_memories


def _dcg(binary_relevance: list[int]) -> float:
    return sum(rel / math.log2(rank + 2) for rank, rel in enumerate(binary_relevance))


def metrics_at_k(retrieved_ids: list[str], relevant_ids: set[str], k: int) -> dict[str, float]:
    ranked = retrieved_ids[:k]
    relevance = [1 if memory_id in relevant_ids else 0 for memory_id in ranked]
    hits = sum(relevance)
    precision = hits / k
    recall = hits / max(len(relevant_ids), 1)

    reciprocal_rank = 0.0
    for rank, memory_id in enumerate(ranked, start=1):
        if memory_id in relevant_ids:
            reciprocal_rank = 1.0 / rank
            break

    ideal = [1] * min(len(relevant_ids), k)
    ideal_dcg = _dcg(ideal)
    ndcg = _dcg(relevance) / ideal_dcg if ideal_dcg else 0.0
    return {
        "precision": precision,
        "recall": recall,
        "mrr": reciprocal_rank,
        "ndcg": ndcg,
    }


def lexical_ids(user_id: str, query: str, k: int) -> list[str]:
    result = get_client().rpc(
        "search_memories_hybrid",
        {"p_user_id": user_id, "p_query": query, "p_limit": k},
    ).execute()
    return [str(row["id"]) for row in (result.data or [])[:k]]


def semantic_ids(user_id: str, query: str, k: int) -> list[str]:
    vector = embed_text(query)
    if not vector:
        return []
    result = get_client().rpc(
        "search_memories_vector",
        {
            "p_user_id": user_id,
            "p_query_embedding": vector_literal(vector),
            "p_limit": k,
        },
    ).execute()
    return [str(row["id"]) for row in (result.data or [])[:k]]


def production_ids(user_id: str, query: str, k: int) -> list[str]:
    parsed = parse_ask_query(query)
    rows = retrieve_memories(user_id, parsed, top_k=k)
    return [str(row["id"]) for row in rows]


def evaluate_strategy(
    name: str,
    cases: list[dict],
    user_id: str,
    k: int,
    retriever: Callable[[str, str, int], list[str]],
) -> tuple[dict[str, float], list[dict]]:
    totals = {"precision": 0.0, "recall": 0.0, "mrr": 0.0, "ndcg": 0.0}
    misses: list[dict] = []

    for case in cases:
        query = str(case["query"]).strip()
        relevant = {str(value) for value in case["relevant_memory_ids"]}
        retrieved = retriever(user_id, query, k)
        scores = metrics_at_k(retrieved, relevant, k)
        for metric in totals:
            totals[metric] += scores[metric]
        if scores["recall"] < 1.0:
            misses.append({"query": query, "expected": sorted(relevant), "retrieved": retrieved})

    n = len(cases)
    averages = {metric: value / n for metric, value in totals.items()}
    print(
        f"{name:12} "
        f"P@{k}={averages['precision']:.4f}  "
        f"R@{k}={averages['recall']:.4f}  "
        f"MRR={averages['mrr']:.4f}  "
        f"NDCG@{k}={averages['ndcg']:.4f}"
    )
    return averages, misses


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--user-id", required=True)
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--k", type=int, default=5)
    parser.add_argument("--misses-out", default=None)
    args = parser.parse_args()

    k = max(1, min(args.k, 20))
    cases = [
        json.loads(line)
        for line in Path(args.dataset).read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    if not cases:
        raise SystemExit("Evaluation dataset is empty")

    print(f"Samhaal retrieval evaluation: queries={len(cases)} k={k}")
    strategies = {
        "lexical": lexical_ids,
        "semantic": semantic_ids,
        "production": production_ids,
    }
    report = {"queries": len(cases), "k": k, "strategies": {}}
    all_misses = {}

    for name, retriever in strategies.items():
        scores, misses = evaluate_strategy(name, cases, args.user_id, k, retriever)
        report["strategies"][name] = scores
        all_misses[name] = misses

    if args.misses_out:
        output = Path(args.misses_out)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(
            json.dumps({"report": report, "misses": all_misses}, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        print(f"Wrote miss analysis to {output}")


if __name__ == "__main__":
    main()
