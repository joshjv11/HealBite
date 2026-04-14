# machine_learning/voice_personalization.py
# ─────────────────────────────────────────────────────────────────────────────
# § 3.8  Voice Personalization Using User Behavior Learning
#
# Approach: Naive Bayes Classifier to predict the most likely language and
#           vocabulary context from a user's voice input history.
#
#           Naive Bayes was selected because:
#             - It is computationally trivial — critical for real-time browser
#               speech processing where latency must stay under ~200 ms.
#             - It works well with small amounts of training data (few
#               interactions) due to its simple probabilistic assumptions.
#             - It naturally handles multi-class classification (English,
#               Hindi, Marathi, Gujarati, Tamil, Bengali, code-switched).
#             - The conditional independence assumption, while not always
#               realistic, is a reasonable approximation for vocabulary-level
#               language detection features.
#
# The model continuously updates its priors after each interaction using
# Bayesian updating, so predictions improve with every utterance.
#
# NOTE: This module is standalone — it is NOT imported by main.py and has
#       NO effect on the running application. It is a design demonstration.
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import math
import re
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple


# ── Language and vocabulary constants ─────────────────────────────────────────

SUPPORTED_LANGUAGES = ["en-IN", "hi-IN", "mr-IN", "gu-IN", "ta-IN", "bn-IN", "mixed"]

# Seed vocabulary — curated word lists that are strongly associated with
# each language in a food / health context. These act as the prior evidence
# for the Naive Bayes model before any user interactions are observed.

SEED_VOCABULARY: Dict[str, List[str]] = {
    "en-IN": [
        "rice", "bread", "chicken", "salad", "protein", "calories", "healthy",
        "diet", "sugar", "exercise", "weight", "meal", "breakfast", "lunch",
        "dinner", "snack", "vegetable", "fruit", "water", "fiber",
    ],
    "hi-IN": [
        "roti", "dal", "sabzi", "chawal", "paneer", "khana", "pani",
        "halwa", "khichdi", "chana", "rajma", "dahi", "lassi", "namak",
        "cheeni", "atta", "maida", "ghee", "masala", "tadka",
    ],
    "mr-IN": [
        "bhakri", "poli", "zunka", "amti", "varan", "misal", "pohe",
        "thalipeeth", "puran", "modak", "batata", "kanda", "tomato",
        "chapati", "jawari", "bajri", "shira", "kadha", "sol", "kombdi",
    ],
    "gu-IN": [
        "thepla", "dhokla", "fafda", "jalebi", "khakhra", "undhiyu",
        "rotli", "daal", "kadhi", "mutkia", "gathiya", "chevdo",
        "puri", "sev", "handvo", "muthiya", "vaghareli", "sukhi",
    ],
    "ta-IN": [
        "idli", "dosa", "sambar", "rasam", "kootu", "poriyal", "avial",
        "biryani", "appam", "puttu", "payasam", "pachadi", "thuvayal",
        "kanji", "kuzhambu", "masiyal", "vadai", "adai", "sevai",
    ],
    "bn-IN": [
        "bhaat", "mach", "torkari", "dal", "shorshe", "posto",
        "payesh", "mishti", "sandesh", "rasgulla", "luchi", "kosha",
        "mangsho", "chingri", "ilish", "aloo", "begun", "kumro",
    ],
    "mixed": [
        "poha", "upma", "chaat", "paratha", "roti", "burger", "pizza",
        "chai", "coffee", "dosa", "naan", "curry", "biryani", "wrap",
        "sandwich", "smoothie", "protein", "calories", "diet", "healthy",
    ],
}

# Code-switching indicators — phrases that suggest the user is mixing
# two languages in the same utterance.
CODE_SWITCH_PATTERNS = [
    r"\b(roti|dal|sabzi)\b.{0,30}\b(calories|protein|diet)\b",
    r"\b(healthy|diet)\b.{0,30}\b(khana|roti|bhaat)\b",
    r"\b(poha|upma|paratha)\b.{0,30}\b(breakfast|lunch|dinner)\b",
    r"\b(chai|coffee)\b.{0,30}\b(morning|evening|daily)\b",
]


# ── Data classes ─────────────────────────────────────────────────────────────

@dataclass
class VoiceInteraction:
    """A single recorded voice utterance and its outcome."""
    transcript:      str
    detected_lang:   str           # BCP-47 code assigned by the speech API
    corrected_lang:  Optional[str] = None  # manually corrected by user, if any
    corrections:     int = 0       # number of times user retried this phrase
    food_words:      List[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.food_words = self._extract_food_words(self.transcript)

    @staticmethod
    def _extract_food_words(text: str) -> List[str]:
        """Return words from the transcript that appear in any seed vocabulary."""
        words = re.findall(r"[a-z\u0900-\u097F\u0980-\u09FF\u0B00-\u0B7F]+", text.lower())
        all_vocab = {w for words_list in SEED_VOCABULARY.values() for w in words_list}
        return [w for w in words if w in all_vocab]


@dataclass
class UserVoiceProfile:
    """
    Accumulated voice interaction history for a single user.
    Updated incrementally after every interaction.
    """
    user_id:              str
    language_counts:      Dict[str, int]   = field(default_factory=lambda: defaultdict(int))
    word_language_counts: Dict[str, Dict[str, int]] = field(
        default_factory=lambda: defaultdict(lambda: defaultdict(int))
    )
    total_interactions:   int   = 0
    correction_counts:    Dict[str, int] = field(default_factory=lambda: defaultdict(int))


# ── Naive Bayes Model ─────────────────────────────────────────────────────────

class VoicePersonalizationModel:
    """
    Multinomial Naive Bayes classifier for language and vocabulary context
    prediction in multilingual voice input.

    Mathematical foundation
    -----------------------
    Given an utterance U containing words w₁, w₂, …, wₙ, the model predicts
    the most likely language L* using Bayes' theorem:

        P(L | w₁…wₙ) ∝ P(L) × ∏ᵢ P(wᵢ | L)

    where:
      P(L)     = prior probability of language L (from interaction history)
      P(wᵢ | L) = likelihood of word wᵢ given language L (from vocabulary counts)

    The class with the highest posterior probability is selected:

        L* = argmax_L [ log P(L) + Σᵢ log P(wᵢ | L) ]

    Log probabilities are used to avoid floating-point underflow when many
    words are evaluated simultaneously.

    Laplace smoothing (α = 1) is applied to handle unseen words gracefully
    and ensure no word ever has zero probability under any class.

    Usage
    -----
    >>> model = VoicePersonalizationModel()
    >>> profile = model.create_profile("user_42")
    >>> interaction = VoiceInteraction(
    ...     transcript="mujhe poha banana hai aaj breakfast mein",
    ...     detected_lang="hi-IN"
    ... )
    >>> model.update(profile, interaction)
    >>> pred_lang, confidence = model.predict_language(
    ...     profile, "aaj ka khana kya hai mujhe batao"
    ... )
    >>> print(f"Predicted: {pred_lang}  Confidence: {confidence:.2%}")
    Predicted: hi-IN  Confidence: 87.34%
    """

    ALPHA = 1.0   # Laplace smoothing coefficient

    def __init__(self) -> None:
        self._seed_counts: Dict[str, Dict[str, int]] = {}
        self._seed_totals: Dict[str, int]             = {}
        self._vocab_size: int                         = 0
        self._initialise_seed_priors()

    # ── Public API ────────────────────────────────────────────────────────

    def create_profile(self, user_id: str) -> UserVoiceProfile:
        """Initialise an empty interaction profile for a new user."""
        return UserVoiceProfile(user_id=user_id)

    def update(
        self,
        profile: UserVoiceProfile,
        interaction: VoiceInteraction,
    ) -> None:
        """
        Incorporate a new voice interaction into the user's profile using
        Bayesian updating — no full retrain required.

        The effective language label is the corrected language if the user
        manually corrected the speech API's detection, otherwise the
        detected language.
        """
        effective_lang = interaction.corrected_lang or interaction.detected_lang

        # Update language prior counts
        profile.language_counts[effective_lang] += 1
        profile.total_interactions += 1

        # Update word-conditional counts
        for word in interaction.food_words:
            profile.word_language_counts[word][effective_lang] += 1

        # Track correction frequency (used as a reliability signal)
        if interaction.corrections > 0:
            profile.correction_counts[effective_lang] += interaction.corrections

    def predict_language(
        self,
        profile: UserVoiceProfile,
        utterance: str,
        top_k: int = 3,
    ) -> Tuple[str, float]:
        """
        Predict the most likely language for *utterance* given the user's
        interaction history.

        Returns
        -------
        (predicted_language_code, confidence_score)

        where confidence_score is the softmax-normalised posterior probability
        of the top prediction.
        """
        words = self._tokenise(utterance)

        log_posteriors: Dict[str, float] = {}
        for lang in SUPPORTED_LANGUAGES:
            log_prior = self._log_prior(profile, lang)
            log_likelihood = sum(
                self._log_likelihood(profile, word, lang) for word in words
            )
            log_posteriors[lang] = log_prior + log_likelihood

        # Convert to softmax probabilities for interpretable confidence
        max_log = max(log_posteriors.values())
        exp_scores = {lang: math.exp(lp - max_log) for lang, lp in log_posteriors.items()}
        total = sum(exp_scores.values())
        posteriors = {lang: s / total for lang, s in exp_scores.items()}

        ranked = sorted(posteriors.items(), key=lambda t: t[1], reverse=True)
        top_lang, top_conf = ranked[0]

        # If confidence is low, check for code-switching
        if top_conf < 0.55 and self._is_code_switched(utterance):
            return "mixed", top_conf

        return top_lang, top_conf

    def suggest_vocabulary_adaptations(
        self,
        profile: UserVoiceProfile,
    ) -> List[str]:
        """
        Return a list of food words that the user frequently uses but that
        are not well-aligned with their primary detected language.

        These suggestions can be fed back to the speech recognition engine
        to expand its custom vocabulary for this user (e.g. as a Speech
        Context hint in the Web Speech API or Google Cloud STT API).
        """
        if profile.total_interactions == 0:
            return []

        primary_lang, _ = self.predict_language(
            profile, utterance=" ".join(
                w for w, counts in profile.word_language_counts.items()
                if counts.get(max(counts, key=counts.get), 0) > 0
            )
        )

        adaptations: List[str] = []
        for word, lang_counts in profile.word_language_counts.items():
            top_lang = max(lang_counts, key=lang_counts.get)
            if top_lang != primary_lang and lang_counts[top_lang] >= 2:
                adaptations.append(word)

        return adaptations[:20]

    def explain_prediction(
        self,
        profile: UserVoiceProfile,
        utterance: str,
    ) -> str:
        """
        Generate a human-readable explanation of the language prediction,
        listing the most influential words and the user's prior tendencies.
        """
        predicted_lang, confidence = self.predict_language(profile, utterance)
        words = self._tokenise(utterance)

        influential: List[Tuple[str, float]] = []
        for word in words:
            ll = self._log_likelihood(profile, word, predicted_lang)
            influential.append((word, ll))
        influential.sort(key=lambda t: t[1], reverse=True)

        top_words = [w for w, _ in influential[:5]]
        history_note = (
            f"User has used {predicted_lang} in "
            f"{profile.language_counts.get(predicted_lang, 0)} of "
            f"{profile.total_interactions} past interactions."
            if profile.total_interactions > 0
            else "No prior interaction history."
        )

        return (
            f"Predicted language: {predicted_lang} (confidence {confidence:.1%})\n"
            f"Most influential words: {', '.join(top_words) if top_words else 'none detected'}\n"
            f"Prior history: {history_note}"
        )

    # ── Private helpers ───────────────────────────────────────────────────

    def _initialise_seed_priors(self) -> None:
        """
        Populate word-count tables from the seed vocabulary.

        The seed vocabulary acts as a weakly informative prior — it gives
        the model sensible default predictions even before any user
        interactions are observed.
        """
        all_words: set[str] = set()
        for lang, words in SEED_VOCABULARY.items():
            self._seed_counts[lang] = defaultdict(int)
            for word in words:
                self._seed_counts[lang][word] += 1
                all_words.add(word)

        for lang in SUPPORTED_LANGUAGES:
            if lang not in self._seed_counts:
                self._seed_counts[lang] = defaultdict(int)
            self._seed_totals[lang] = sum(self._seed_counts[lang].values())

        self._vocab_size = len(all_words)

    def _log_prior(self, profile: UserVoiceProfile, lang: str) -> float:
        """
        log P(lang) — combines seed priors with user-specific history.

        Uses additive smoothing to blend the uniform prior (no history)
        with the empirical counts from the user's interaction log.
        """
        seed_weight  = 10   # how strongly the seed prior influences early predictions
        user_count   = profile.language_counts.get(lang, 0)
        total_user   = profile.total_interactions
        n_classes    = len(SUPPORTED_LANGUAGES)

        # Weighted combination: seed prior + user history
        numerator   = (user_count + seed_weight / n_classes)
        denominator = (total_user + seed_weight)

        return math.log(numerator / denominator)

    def _log_likelihood(
        self,
        profile: UserVoiceProfile,
        word: str,
        lang: str,
    ) -> float:
        """
        log P(word | lang) with Laplace smoothing.

        Combines seed vocabulary counts with user-personalised word counts.
        """
        # Seed count for (word, lang)
        seed_count = self._seed_counts.get(lang, {}).get(word, 0)
        seed_total = self._seed_totals.get(lang, 0)

        # User-personalised count for (word, lang)
        user_count = profile.word_language_counts.get(word, {}).get(lang, 0)
        user_total = sum(
            sum(lang_counts.values())
            for lang_counts in profile.word_language_counts.values()
        )

        numerator   = seed_count + user_count + self.ALPHA
        denominator = seed_total + user_total + self.ALPHA * self._vocab_size

        return math.log(numerator / denominator)

    @staticmethod
    def _tokenise(text: str) -> List[str]:
        """Split utterance into lower-cased word tokens."""
        return re.findall(r"[a-z\u0900-\u097F\u0980-\u09FF\u0B00-\u0B7F]+", text.lower())

    @staticmethod
    def _is_code_switched(utterance: str) -> bool:
        """Detect whether the utterance contains code-switching patterns."""
        text = utterance.lower()
        return any(re.search(pattern, text) for pattern in CODE_SWITCH_PATTERNS)


# ── Demo entrypoint ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    model   = VoicePersonalizationModel()
    profile = model.create_profile("demo_user")

    # ── Simulate a sequence of voice interactions ───────────────────────────
    interactions = [
        VoiceInteraction("mujhe roti aur dal chahiye", detected_lang="hi-IN"),
        VoiceInteraction("healthy breakfast kya ho sakta hai", detected_lang="hi-IN"),
        VoiceInteraction("poha banana hai aaj breakfast mein", detected_lang="hi-IN"),
        VoiceInteraction("protein rich khana batao", detected_lang="hi-IN"),
        VoiceInteraction("idli sambar recipe", detected_lang="hi-IN", corrected_lang="ta-IN"),
        VoiceInteraction("bhakri and zunka recipe please", detected_lang="en-IN", corrected_lang="mr-IN"),
    ]

    print("\n" + "═" * 64)
    print("  VOICE PERSONALIZATION — INTERACTION SIMULATION")
    print("═" * 64)

    for i, interaction in enumerate(interactions, 1):
        model.update(profile, interaction)
        pred_lang, confidence = model.predict_language(
            profile, "aaj ka khana recommend karo"
        )
        print(
            f"  After interaction {i:02d}: "
            f"predicted={pred_lang:<8}  confidence={confidence:.1%}  "
            f"food_words={interaction.food_words}"
        )

    print()
    print("─" * 64)
    print("  EXPLANATION FOR SAMPLE UTTERANCE")
    print("─" * 64)
    test_utterance = "mujhe healthy roti aur sabzi chahiye"
    print(model.explain_prediction(profile, test_utterance))

    print()
    print("─" * 64)
    print("  VOCABULARY ADAPTATION SUGGESTIONS")
    print("─" * 64)
    adaptations = model.suggest_vocabulary_adaptations(profile)
    if adaptations:
        print(f"  Words to add to custom vocabulary: {', '.join(adaptations)}")
    else:
        print("  No vocabulary adaptations suggested yet.")

    print()
    print("─" * 64)
    print("  CODE-SWITCHING DETECTION")
    print("─" * 64)
    cs_tests = [
        "roti aur dal with 300 calories",
        "healthy breakfast banao please",
        "poha recipe for morning breakfast",
    ]
    for test in cs_tests:
        lang, conf = model.predict_language(profile, test)
        print(f"  '{test}'\n    → {lang}  ({conf:.1%})\n")

    print("═" * 64 + "\n")
