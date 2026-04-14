# machine_learning/craving_substitution.py
# ─────────────────────────────────────────────────────────────────────────────
# § 3.6  Content-Based Craving Substitution Engine
#
# Approach: Content-based filtering using cosine similarity on food feature
#           vectors. A content-based model was chosen because it:
#             - requires no collaborative data (works from day 1 with 0 users)
#             - is fully explainable (the similarity score is auditable)
#             - is computationally trivial — suitable for real-time requests
#
# Each food is represented as a 10-dimensional float vector. The cosine
# distance between a craving vector and every candidate healthy-alternative
# vector is computed; the top-k candidates are returned.
#
# NOTE: This module is standalone — it is NOT imported by main.py and has
#       NO effect on the running application. It is a design demonstration.
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import math
from typing import Dict, List, Tuple

from food_vectors import CRAVING_VECTORS, HEALTHY_VECTORS  # type: ignore[import]


# ── Human-readable labels ────────────────────────────────────────────────────
FOOD_LABELS: Dict[str, str] = {
    "whole_wheat_paneer_pizza":      "Whole Wheat Paneer Pizza",
    "multigrain_veg_sandwich":       "Multigrain Veg Sandwich",
    "oat_pizza_base_veg":            "Oat-Base Veg Pizza",
    "grilled_chicken_wrap":          "Grilled Chicken Wrap",
    "paneer_roll":                   "Paneer Roll",
    "rajma_patty_wrap":              "Rajma Patty Wrap",
    "roasted_makhana":               "Roasted Makhana",
    "baked_sweet_potato_chips":      "Baked Sweet Potato Chips",
    "air_popped_popcorn":            "Air-Popped Popcorn",
    "baked_tandoori_chicken":        "Baked Tandoori Chicken",
    "grilled_fish_tikka":            "Grilled Fish Tikka",
    "dates_nut_energy_balls":        "Dates & Nut Energy Balls",
    "dark_chocolate_banana_smoothie":"Dark Chocolate Banana Smoothie",
    "ragi_banana_pancakes":          "Ragi Banana Pancakes",
    "greek_yogurt_with_berries":     "Greek Yogurt with Berries",
    "zucchini_noodles_pesto":        "Zucchini Noodles with Pesto",
    "whole_wheat_pasta_primavera":   "Whole Wheat Pasta Primavera",
    "brown_rice_chicken_bowl":       "Brown Rice Chicken Bowl",
    "cauliflower_fried_rice":        "Cauliflower Fried Rice",
    "baked_vegetable_samosa":        "Baked Vegetable Samosa",
    "steamed_momos_whole_wheat":     "Steamed Momos (Whole Wheat)",
}


# ── Core maths ───────────────────────────────────────────────────────────────

def _dot(a: List[float], b: List[float]) -> float:
    """Dot product of two equal-length vectors."""
    return sum(x * y for x, y in zip(a, b))


def _magnitude(v: List[float]) -> float:
    """Euclidean magnitude of a vector."""
    return math.sqrt(sum(x * x for x in v))


def cosine_similarity(a: List[float], b: List[float]) -> float:
    """
    Cosine similarity between vectors *a* and *b*.

    Returns a value in [0, 1] where 1 means identical direction (most
    similar) and 0 means orthogonal (completely dissimilar).

    Cosine similarity was preferred over Euclidean distance because it
    is magnitude-invariant, meaning the scale of individual features does
    not unfairly dominate the distance calculation.
    """
    mag_a = _magnitude(a)
    mag_b = _magnitude(b)
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return _dot(a, b) / (mag_a * mag_b)


# ── Recommender ───────────────────────────────────────────────────────────────

class CravingSubstitutionEngine:
    """
    Content-based food recommendation engine.

    Usage
    -----
    >>> engine = CravingSubstitutionEngine()
    >>> results = engine.recommend("burger", top_k=3)
    >>> for name, score in results:
    ...     print(f"{name:<40} similarity={score:.4f}")
    Grilled Chicken Wrap                     similarity=0.9923
    Paneer Roll                              similarity=0.9845
    Rajma Patty Wrap                         similarity=0.9701

    Algorithm
    ---------
    1. Look up (or compute) the feature vector for the requested craving.
    2. Compute cosine similarity between that vector and every item in the
       healthy-alternatives database.
    3. Return the top-k alternatives sorted by descending similarity.
    """

    def __init__(self) -> None:
        self._craving_db: Dict[str, List[float]]  = CRAVING_VECTORS
        self._healthy_db: Dict[str, List[float]]  = HEALTHY_VECTORS
        self._labels:     Dict[str, str]           = FOOD_LABELS

    # ── Public API ────────────────────────────────────────────────────────

    def recommend(
        self,
        craving: str,
        top_k: int = 3,
        allergens: List[str] | None = None,
    ) -> List[Tuple[str, float]]:
        """
        Return the top-k healthier substitutes for *craving*.

        Parameters
        ----------
        craving   : str
            The food the user is craving (key in CRAVING_VECTORS, e.g. 'pizza').
        top_k     : int
            Maximum number of recommendations to return.
        allergens : list[str], optional
            Food keys to exclude from results (e.g. ['roasted_makhana']).

        Returns
        -------
        List of (human_readable_name, similarity_score) tuples, sorted by
        similarity descending.
        """
        craving_key = craving.lower().replace(" ", "_")

        if craving_key not in self._craving_db:
            # Fallback: use the average of all craving vectors as a generic
            # "unhealthy" baseline and find the most balanced alternatives.
            craving_vec = self._average_vector(list(self._craving_db.values()))
        else:
            craving_vec = self._craving_db[craving_key]

        exclude = set(allergens or [])

        scores: List[Tuple[str, float]] = []
        for food_key, food_vec in self._healthy_db.items():
            if food_key in exclude:
                continue
            sim = cosine_similarity(craving_vec, food_vec)
            label = self._labels.get(food_key, food_key.replace("_", " ").title())
            scores.append((label, round(sim, 4)))

        scores.sort(key=lambda t: t[1], reverse=True)
        return scores[:top_k]

    def explain(self, craving: str, substitute: str) -> str:
        """
        Generate a plain-English explanation of why *substitute* was
        recommended for *craving*.

        The explanation compares individual feature dimensions and surfaces
        the dimensions where the substitute most closely matches the craving
        profile, providing the kind of explainability important in health apps.
        """
        craving_key    = craving.lower().replace(" ", "_")
        substitute_key = substitute.lower().replace(" ", "_")

        if craving_key not in self._craving_db or substitute_key not in self._healthy_db:
            return "Explanation unavailable — food key not found in database."

        cv = self._craving_db[craving_key]
        sv = self._healthy_db[substitute_key]

        feature_names = [
            "calorie density", "protein content", "fat content",
            "carbohydrate level", "sugar content", "spice level",
            "cuisine alignment", "texture similarity",
            "savoury taste match", "sweet taste match",
        ]

        matched: List[str] = []
        improvements: List[str] = []

        for i, fname in enumerate(feature_names):
            diff = sv[i] - cv[i]
            if abs(diff) < 0.15:
                matched.append(fname)
            elif diff < -0.20 and fname in {"calorie density", "fat content", "sugar content"}:
                improvements.append(f"lower {fname}")

        match_str = ", ".join(matched[:3]) if matched else "overall nutritional profile"
        improve_str = (
            f" Key improvements: {', '.join(improvements)}." if improvements else ""
        )

        subst_label = self._labels.get(substitute_key, substitute_key)
        return (
            f"'{subst_label}' was recommended because it closely matches your "
            f"craving for {craving} in terms of {match_str}.{improve_str}"
        )

    # ── Private helpers ───────────────────────────────────────────────────

    @staticmethod
    def _average_vector(vectors: List[List[float]]) -> List[float]:
        n = len(vectors)
        if n == 0:
            return [0.0] * 10
        dim = len(vectors[0])
        avg = [0.0] * dim
        for v in vectors:
            for i, val in enumerate(v):
                avg[i] += val
        return [x / n for x in avg]


# ── Demo entrypoint (run directly with `python craving_substitution.py`) ─────
if __name__ == "__main__":
    engine = CravingSubstitutionEngine()

    test_cravings = ["pizza", "burger", "chips", "chocolate", "biryani"]

    for craving in test_cravings:
        print(f"\n{'═' * 60}")
        print(f"  CRAVING: {craving.upper()}")
        print(f"{'─' * 60}")
        results = engine.recommend(craving, top_k=3)
        for rank, (name, score) in enumerate(results, 1):
            print(f"  #{rank}  {name:<40} cos_sim={score:.4f}")
        # Show explanation for top result
        if results:
            top_key = list(HEALTHY_VECTORS.keys())[
                list(FOOD_LABELS.values()).index(results[0][0])
                if results[0][0] in FOOD_LABELS.values() else 0
            ]
            print(f"\n  WHY: {engine.explain(craving, top_key)}")

    print(f"\n{'═' * 60}\n")
