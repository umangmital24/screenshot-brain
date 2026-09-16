import pytest

from app.evaluation.retrieval_metrics import evaluate_rankings


def test_retrieval_metrics_perfect_first_hit():
    metrics = evaluate_rankings([["a", "b", "c"]], [{"a"}], k=3)
    assert metrics.precision_at_k == pytest.approx(1 / 3)
    assert metrics.recall_at_k == pytest.approx(1.0)
    assert metrics.mrr == pytest.approx(1.0)
    assert metrics.ndcg_at_k == pytest.approx(1.0)
    assert metrics.zero_result_rate == pytest.approx(0.0)


def test_retrieval_metrics_tracks_rank_and_zero_results():
    metrics = evaluate_rankings([["x", "a"], []], [{"a"}, {"b"}], k=2)
    assert metrics.precision_at_k == pytest.approx(0.25)
    assert metrics.recall_at_k == pytest.approx(0.5)
    assert metrics.mrr == pytest.approx(0.25)
    assert metrics.zero_result_rate == pytest.approx(0.5)


def test_retrieval_metrics_rejects_invalid_inputs():
    with pytest.raises(ValueError):
        evaluate_rankings([["a"]], [], k=5)
    with pytest.raises(ValueError):
        evaluate_rankings([], [], k=0)
