# machine_learning/food_vectors.py
# ─────────────────────────────────────────────────────────────────────────────
# Food Feature Vector Dataset
#
# Each food item is encoded as a fixed-length numerical feature vector used
# by the craving substitution recommender (craving_substitution.py).
#
# Feature schema (10 dimensions):
#   [0]  calories          (kcal per serving, normalised /600)
#   [1]  protein_g         (grams, normalised /40)
#   [2]  fat_g             (grams, normalised /30)
#   [3]  carbs_g           (grams, normalised /80)
#   [4]  sugar_g           (grams, normalised /30)
#   [5]  spice_level       (0 = mild … 1 = very spicy)
#   [6]  cuisine_type      (0 = western, 0.5 = fusion, 1 = indian)
#   [7]  texture           (0 = soft … 1 = crunchy)
#   [8]  taste_savoury     (0 = not savoury … 1 = very savoury)
#   [9]  taste_sweet       (0 = not sweet   … 1 = very sweet)
#
# NOTE: Standalone data file — not imported anywhere in the live application.
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations
from typing import Dict, List

# ---------------------------------------------------------------------------
# "Craving" foods — the unhealthy items users commonly request
# ---------------------------------------------------------------------------
CRAVING_VECTORS: Dict[str, List[float]] = {
    "pizza": [
        0.87, 0.38, 0.73, 0.69, 0.10,   # cal, protein, fat, carbs, sugar
        0.20, 0.00, 0.20, 0.90, 0.05,   # spice, cuisine, texture, savoury, sweet
    ],
    "burger": [
        0.82, 0.48, 0.80, 0.61, 0.15,
        0.15, 0.00, 0.40, 0.92, 0.08,
    ],
    "chips": [
        0.50, 0.08, 0.67, 0.58, 0.03,
        0.30, 0.10, 0.95, 0.80, 0.02,
    ],
    "fried_chicken": [
        0.78, 0.62, 0.83, 0.42, 0.05,
        0.35, 0.05, 0.80, 0.95, 0.02,
    ],
    "cheesecake": [
        0.72, 0.20, 0.77, 0.60, 0.87,
        0.00, 0.00, 0.05, 0.10, 0.97,
    ],
    "chocolate": [
        0.60, 0.13, 0.72, 0.68, 0.93,
        0.00, 0.05, 0.30, 0.05, 0.98,
    ],
    "samosa": [
        0.60, 0.12, 0.63, 0.62, 0.05,
        0.65, 1.00, 0.80, 0.85, 0.03,
    ],
    "biryani": [
        0.73, 0.43, 0.47, 0.75, 0.08,
        0.75, 1.00, 0.20, 0.90, 0.05,
    ],
    "ice_cream": [
        0.43, 0.10, 0.42, 0.53, 0.90,
        0.00, 0.05, 0.08, 0.05, 0.95,
    ],
    "pasta": [
        0.65, 0.28, 0.40, 0.80, 0.12,
        0.20, 0.00, 0.15, 0.80, 0.08,
    ],
}

# ---------------------------------------------------------------------------
# Healthier alternative food vectors
# ---------------------------------------------------------------------------
HEALTHY_VECTORS: Dict[str, List[float]] = {
    # ── Pizza-adjacent ────────────────────────────────────────────────────
    "whole_wheat_paneer_pizza": [
        0.53, 0.40, 0.40, 0.55, 0.08,
        0.20, 1.00, 0.25, 0.85, 0.05,
    ],
    "multigrain_veg_sandwich": [
        0.37, 0.25, 0.22, 0.48, 0.08,
        0.15, 0.50, 0.45, 0.80, 0.05,
    ],
    "oat_pizza_base_veg": [
        0.48, 0.32, 0.28, 0.52, 0.08,
        0.20, 0.50, 0.25, 0.82, 0.05,
    ],

    # ── Burger-adjacent ───────────────────────────────────────────────────
    "grilled_chicken_wrap": [
        0.52, 0.62, 0.32, 0.42, 0.05,
        0.25, 0.50, 0.30, 0.90, 0.03,
    ],
    "paneer_roll": [
        0.47, 0.38, 0.35, 0.50, 0.06,
        0.40, 1.00, 0.30, 0.85, 0.04,
    ],
    "rajma_patty_wrap": [
        0.43, 0.28, 0.20, 0.52, 0.06,
        0.45, 1.00, 0.35, 0.82, 0.04,
    ],

    # ── Chips-adjacent ────────────────────────────────────────────────────
    "roasted_makhana": [
        0.25, 0.12, 0.12, 0.30, 0.02,
        0.20, 1.00, 0.88, 0.70, 0.02,
    ],
    "baked_sweet_potato_chips": [
        0.28, 0.07, 0.05, 0.40, 0.15,
        0.10, 0.25, 0.90, 0.55, 0.18,
    ],
    "air_popped_popcorn": [
        0.20, 0.10, 0.08, 0.35, 0.02,
        0.05, 0.10, 0.92, 0.62, 0.02,
    ],

    # ── Fried chicken-adjacent ────────────────────────────────────────────
    "baked_tandoori_chicken": [
        0.45, 0.68, 0.25, 0.12, 0.05,
        0.70, 1.00, 0.35, 0.92, 0.02,
    ],
    "grilled_fish_tikka": [
        0.40, 0.72, 0.22, 0.08, 0.03,
        0.60, 1.00, 0.30, 0.90, 0.02,
    ],

    # ── Sweet / dessert-adjacent ──────────────────────────────────────────
    "dates_nut_energy_balls": [
        0.32, 0.10, 0.28, 0.35, 0.58,
        0.00, 0.50, 0.25, 0.08, 0.80,
    ],
    "dark_chocolate_banana_smoothie": [
        0.38, 0.15, 0.22, 0.42, 0.55,
        0.00, 0.25, 0.05, 0.08, 0.85,
    ],
    "ragi_banana_pancakes": [
        0.35, 0.13, 0.18, 0.45, 0.38,
        0.00, 1.00, 0.10, 0.12, 0.72,
    ],
    "greek_yogurt_with_berries": [
        0.28, 0.25, 0.08, 0.22, 0.35,
        0.00, 0.10, 0.05, 0.05, 0.70,
    ],

    # ── Pasta-adjacent ────────────────────────────────────────────────────
    "zucchini_noodles_pesto": [
        0.28, 0.15, 0.38, 0.18, 0.08,
        0.10, 0.10, 0.20, 0.70, 0.05,
    ],
    "whole_wheat_pasta_primavera": [
        0.52, 0.25, 0.22, 0.62, 0.10,
        0.15, 0.10, 0.15, 0.75, 0.06,
    ],

    # ── Biryani / fried rice-adjacent ────────────────────────────────────
    "brown_rice_chicken_bowl": [
        0.52, 0.55, 0.22, 0.58, 0.05,
        0.40, 1.00, 0.20, 0.88, 0.04,
    ],
    "cauliflower_fried_rice": [
        0.25, 0.18, 0.18, 0.15, 0.05,
        0.45, 0.80, 0.25, 0.82, 0.04,
    ],

    # ── Samosa-adjacent ───────────────────────────────────────────────────
    "baked_vegetable_samosa": [
        0.38, 0.10, 0.18, 0.48, 0.05,
        0.60, 1.00, 0.65, 0.80, 0.03,
    ],
    "steamed_momos_whole_wheat": [
        0.32, 0.18, 0.10, 0.40, 0.04,
        0.50, 0.80, 0.20, 0.78, 0.03,
    ],
}
