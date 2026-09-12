import unittest

from app.services.query_parser import parse_ask_query


class QueryParserTests(unittest.TestCase):
    def test_visual_search_stays_retrieval_only(self):
        parsed = parse_ask_query("show me the black shoes I saved")
        self.assertEqual(parsed.mode, "retrieve")
        self.assertEqual(parsed.colors, ("black",))
        self.assertIn("shoes", parsed.terms)
        self.assertEqual(parsed.intent, "BUY_LATER")

    def test_comparison_routes_to_reasoning(self):
        parsed = parse_ask_query("compare the two jackets I saved")
        self.assertEqual(parsed.mode, "reason")
        self.assertIn("jackets", parsed.terms)
        self.assertNotIn("compare", parsed.terms)

    def test_follow_up_routes_to_reasoning(self):
        parsed = parse_ask_query("which one is black?")
        self.assertEqual(parsed.mode, "reason")
        self.assertEqual(parsed.colors, ("black",))

    def test_yesterday_becomes_time_filter_not_search_term(self):
        parsed = parse_ask_query("what jobs did I save yesterday")
        self.assertEqual(parsed.mode, "retrieve")
        self.assertEqual(parsed.since_days, 2)
        self.assertEqual(parsed.before_days, 1)
        self.assertNotIn("yesterday", parsed.terms)
        self.assertEqual(parsed.intent, "APPLY_LATER")

    def test_this_week_filter(self):
        parsed = parse_ask_query("show restaurants I saved this week")
        self.assertEqual(parsed.since_days, 7)
        self.assertIsNone(parsed.before_days)
        self.assertEqual(parsed.intent, "VISIT_LATER")


if __name__ == "__main__":
    unittest.main()
