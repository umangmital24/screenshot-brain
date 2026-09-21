import unittest

from app.services.query_parser import parse_ask_query
from app.services.retrieval import score_memory, _has_relevance_evidence


class RetrievalScoringTests(unittest.TestCase):
    def test_song_question_matches_music_category(self):
        parsed = parse_ask_query("Which songs should I listen?")
        memory = {
            "item_name": "Darmiyaan",
            "category": "Music",
            "intent": "TRY_LATER",
            "summary": "Saved track.",
            "extracted_text": "",
            "visual_context": "",
            "frequency": 1,
        }
        score = score_memory(memory, parsed)
        self.assertGreaterEqual(score, 0.20)
        self.assertTrue(_has_relevance_evidence(memory, parsed, score))

    def test_read_question_can_use_memory_intent_as_evidence(self):
        parsed = parse_ask_query("What should I read?")
        memory = {
            "item_name": "A saved book",
            "category": "Books",
            "intent": "READ_LATER",
            "summary": "",
            "extracted_text": "",
            "visual_context": "",
            "frequency": 1,
        }
        score = score_memory(memory, parsed)
        self.assertGreaterEqual(score, 0.20)
        self.assertTrue(_has_relevance_evidence(memory, parsed, score))

    def test_poetry_alias_matches_shayari_category(self):
        parsed = parse_ask_query("show me that shayari")
        memory = {
            "item_name": "Saved verse",
            "category": "Shayari",
            "intent": "READ_LATER",
            "summary": "",
            "extracted_text": "",
            "visual_context": "",
            "frequency": 1,
        }
        score = score_memory(memory, parsed)
        self.assertGreaterEqual(score, 0.20)
        self.assertTrue(_has_relevance_evidence(memory, parsed, score))


if __name__ == "__main__":
    unittest.main()
