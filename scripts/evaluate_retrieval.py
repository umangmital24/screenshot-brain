from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.evaluation.retrieval_metrics import evaluate_rankings
from app.services.query_parser import parse_ask_query
from app.services.retrieval import retrieve_memories


def _load_cases(path: Path) -> list[dict]:
    cases: list[dict] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        row = json.loads(stripped)
        if not row.get("query") or not row.get("relevant_memory_ids"):
            raise ValueError(f"Invalid evaluation case at line {line_number}")
        cases.append(row)
    return cases


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate the deployed Samhaal hybrid retriever.")
    parser.add_argument("dataset", type=Path, help="JSONL with query + relevant_memory_ids")
    parser.add_argument("--user-id", required=True, help="Supabase user UUID whose memories are labelled")
    parser.add_argument("--k", type=int, default=5)
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()

    cases = _load_cases(args.dataset)
    rankings: list[list[str]] = []
    relevant_sets: list[set[str]] = []
    misses: list[dict] = []

    for case in cases:
        parsed = parse_ask_query(case["query"])
        results = retrieve_memories(args.user_id, parsed, top_k=max(args.k, 20))
        ranking = [str(row["id"]) for row in results if row.get("id")]
        relevant = {str(memory_id) for memory_id in case["relevant_memory_ids"]}
        rankings.append(ranking)
        relevant_sets.append(relevant)

        if not relevant.intersection(ranking[: args.k]):
            misses.append({
                "query": case["query"],
                "expected": sorted(relevant),
                "returned": ranking[: args.k],
                "tags": case.get("tags", []),
            })

    report = {
        "retriever": "production_hybrid",
        "k": args.k,
        "metrics": evaluate_rankings(rankings, relevant_sets, k=args.k).as_dict(),
        "misses": misses,
    }
    rendered = json.dumps(report, indent=2, ensure_ascii=False)
    print(rendered)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
