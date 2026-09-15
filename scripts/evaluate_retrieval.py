"""Offline evaluation for Samhaal retrieval.

Dataset JSONL format (one query per line):
{"query":"that cafe in GK","relevant_memory_ids":["uuid-1"]}

Usage:
  python scripts/evaluate_retrieval.py --user-id <uuid> --dataset data/retrieval_eval.jsonl

Reports measured Precision@K, Recall@K, MRR and NDCG@K. No synthetic metric is
hard-coded; use a human-labelled query -> relevant-memory dataset.
"""

import argparse
import json
import math
from pathlib import Path

from app.services.retrieval import retrieve_memories


def dcg(relevances: list[int]) -> float:
    return sum(rel / math.log2(i + 2) for i, rel in enumerate(relevances))


def evaluate_case(retrieved_ids: list[str], relevant_ids: set[str], k: int) -> dict[str, float]:
    ranked = retrieved_ids[:k]
    hits = [1 if memory_id in relevant_ids else 0 for memory_id in ranked]
    hit_count = sum(hits)

    precision = hit_count / k
    recall = hit_count / max(len(relevant_ids), 1)

    reciprocal_rank = 0.0
    for rank, memory_id in enumerate(ranked, start=1):
        if memory_id in relevant_ids:
            reciprocal_rank = 1.0 / rank
            break

    ideal = [1] * min(len(relevant_ids), k)
    ndcg = dcg(hits) / dcg(ideal) if ideal else 0.0
    return {"precision": precision, "recall": recall, "rr": reciprocal_rank, "ndcg": ndcg}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--user-id", required=True)
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--k", type=int, default=5)
    args = parser.parse_args()

    cases = []
    for line in Path(args.dataset).read_text(encoding="utf-8").splitlines():
        if line.strip():
            cases.append(json.loads(line))
    if not cases:
        raise SystemExit("Evaluation dataset is empty")

    totals = {"precision": 0.0, "recall": 0.0, "rr": 0.0, "ndcg": 0.0}
    misses = []

    for case in cases:
        relevant = set(case["relevant_memory_ids"])
        results = retrieve_memories(args.user_id, case["query"], top_k=args.k)
        retrieved = [str(row["id"]) for row in results]
        metrics = evaluate_case(retrieved, relevant, args.k)
        for key in totals:
            totals[key] += metrics[key]
        if metrics["recall"] < 1.0:
            misses.append({"query": case["query"], "expected": sorted(relevant), "retrieved": retrieved})

    n = len(cases)
    print(f"queries={n} k={args.k}")
    print(f"Precision@{args.k}: {totals['precision'] / n:.4f}")
    print(f"Recall@{args.k}:    {totals['recall'] / n:.4f}")
    print(f"MRR:         {totals['rr'] / n:.4f}")
    print(f"NDCG@{args.k}:      {totals['ndcg'] / n:.4f}")

    if misses:
        print(f"\nMiss analysis ({len(misses)} queries):")
        for miss in misses[:20]:
            print(json.dumps(miss, ensure_ascii=False))


if __name__ == "__main__":
    main()
