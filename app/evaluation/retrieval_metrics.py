from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class RetrievalMetrics:
    queries: int
    precision_at_k: float
    recall_at_k: float
    mrr: float
    ndcg_at_k: float
    zero_result_rate: float

    def as_dict(self) -> dict[str, float | int]:
        return {
            "queries": self.queries,
            "precision_at_k": round(self.precision_at_k, 6),
            "recall_at_k": round(self.recall_at_k, 6),
            "mrr": round(self.mrr, 6),
            "ndcg_at_k": round(self.ndcg_at_k, 6),
            "zero_result_rate": round(self.zero_result_rate, 6),
        }


def _dcg(relevances: list[int]) -> float:
    return sum(rel / math.log2(index + 2) for index, rel in enumerate(relevances))


def evaluate_rankings(
    rankings: list[list[str]],
    relevant_sets: list[set[str]],
    *,
    k: int = 5,
) -> RetrievalMetrics:
    """Compute binary-relevance IR metrics for a batch of ranked memory IDs."""
    if len(rankings) != len(relevant_sets):
        raise ValueError("rankings and relevant_sets must have the same length")
    if k <= 0:
        raise ValueError("k must be positive")
    if not rankings:
        return RetrievalMetrics(0, 0.0, 0.0, 0.0, 0.0, 0.0)

    precision_total = recall_total = reciprocal_total = ndcg_total = 0.0
    zero_results = 0

    for ranking, relevant in zip(rankings, relevant_sets):
        top = ranking[:k]
        if not ranking:
            zero_results += 1

        hits = [1 if memory_id in relevant else 0 for memory_id in top]
        hit_count = sum(hits)
        precision_total += hit_count / k
        recall_total += hit_count / len(relevant) if relevant else 0.0

        reciprocal = 0.0
        for index, memory_id in enumerate(ranking):
            if memory_id in relevant:
                reciprocal = 1.0 / (index + 1)
                break
        reciprocal_total += reciprocal

        ideal_hits = min(len(relevant), k)
        ideal_dcg = _dcg([1] * ideal_hits)
        ndcg_total += (_dcg(hits) / ideal_dcg) if ideal_dcg else 0.0

    count = len(rankings)
    return RetrievalMetrics(
        queries=count,
        precision_at_k=precision_total / count,
        recall_at_k=recall_total / count,
        mrr=reciprocal_total / count,
        ndcg_at_k=ndcg_total / count,
        zero_result_rate=zero_results / count,
    )
