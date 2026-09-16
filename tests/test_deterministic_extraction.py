import unittest

from app.services.deterministic_extraction import extract_deterministically


class DeterministicExtractionTests(unittest.TestCase):
    def test_linkedin_job_bypasses_only_with_strong_signals(self):
        decision = extract_deterministically(
            """We are hiring\nJunior AI Engineer\nResponsibilities\nBuild Python APIs\nRequirements\n1+ years experience\nEasy Apply""",
            app_source="com.linkedin.android",
        )
        self.assertTrue(decision.matched)
        self.assertGreaterEqual(decision.confidence, 0.95)
        self.assertEqual(decision.extraction.intent, "APPLY_LATER")
        self.assertEqual(decision.extraction.items[0].name, "Junior AI Engineer")

    def test_linkedin_generic_post_falls_back(self):
        decision = extract_deterministically(
            "AI is changing software engineering. Here are five lessons from our team.",
            app_source="com.linkedin.android",
        )
        self.assertFalse(decision.matched)

    def test_recipe_requires_ingredients_and_cooking_action(self):
        decision = extract_deterministically(
            """Creamy Garlic Pasta\nRecipe\nIngredients\n200g pasta\n2 tbsp butter\n1 tsp garlic\nMix and cook for 8 minutes"""
        )
        self.assertTrue(decision.matched)
        self.assertEqual(decision.extraction.intent, "COOK_LATER")
        self.assertEqual(decision.extraction.items[0].name, "Creamy Garlic Pasta")

    def test_commerce_product_requires_source_price_and_product_hint(self):
        decision = extract_deterministically(
            "Trail Running Shoes Men Waterproof\n₹4,999\nAdd to Cart\nBuy Now",
            app_source="com.amazon.mShop.android.shopping",
        )
        self.assertTrue(decision.matched)
        self.assertEqual(decision.extraction.intent, "BUY_LATER")
        self.assertIn("Shoes", decision.extraction.items[0].name)

    def test_random_price_text_does_not_become_product(self):
        decision = extract_deterministically(
            "Dinner total ₹1,250\nThanks for visiting",
            app_source="com.instagram.android",
        )
        self.assertFalse(decision.matched)

    def test_maps_place_requires_location_signal(self):
        decision = extract_deterministically(
            "Blue Tokai Coffee Roasters Cafe\n4.5 ★\nOpen now\nDirections",
            app_source="com.google.android.apps.maps",
        )
        self.assertTrue(decision.matched)
        self.assertEqual(decision.extraction.intent, "VISIT_LATER")

    def test_ambiguous_text_falls_through_to_gemini(self):
        decision = extract_deterministically("Something useful I want to remember later")
        self.assertFalse(decision.matched)
        self.assertEqual(decision.reason, "ambiguous")


if __name__ == "__main__":
    unittest.main()
