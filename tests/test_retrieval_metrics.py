import unittest

from app.evaluation.retrieval_metrics import evaluate_rankings


class RetrievalMetricsTests(unittest.TestCase):
    def test_perfect_first_hit(self):
        metrics = evaluate_rankings([["a", "b", "c"]], [{"a"}], k=3)
        self.assertAlmostEqual(metrics.precision_at_k, 1 / 3)
        self.assertAlmostEqual(metrics.recall_at_k, 1.0)
        self.assertAlmostEqual(metrics.mrr, 1.0)
        self.assertAlmostEqual(metrics.ndcg_at_k, 1.0)
        self.assertAlmostEqual(metrics.zero_result_rate, 0.0)

    def test_tracks_rank_and_zero_results(self):
        metrics = evaluate_rankings([["x", "a"], []], [{"a"}, {"b"}], k=2)
        self.assertAlmostEqual(metrics.precision_at_k, 0.25)
        self.assertAlmostEqual(metrics.recall_at_k, 0.5)
        self.assertAlmostEqual(metrics.mrr, 0.25)
        self.assertAlmostEqual(metrics.zero_result_rate, 0.5)

    def test_rejects_invalid_inputs(self):
        with self.assertRaises(ValueError):
            evaluate_rankings([["a"]], [], k=5)
        with self.assertRaises(ValueError):
            evaluate_rankings([], [], k=0)


if __name__ == "__main__":
    unittest.main()
