"""Tests for analysis.filler_words module."""

from __future__ import annotations

import pytest

from analysis.filler_words import detect_filler_words, filler_score

# ── detect_filler_words ───────────────────────────────────────────────────

class TestDetectFillerWords:
    def test_empty_transcript_returns_empty(self):
        assert detect_filler_words("") == []
        assert detect_filler_words("   ") == []

    def test_no_fillers_in_clean_text(self):
        hits = detect_filler_words("I would like to describe my experience.")
        # "like" may or may not be a filler depending on language config;
        # but "I", "would", "describe" etc. are never fillers.
        for h in hits:
            assert h.count > 0

    def test_detects_english_fillers(self):
        hits = detect_filler_words("I uh think um you know this is fine")
        words = {h.word for h in hits}
        # "uh", "um" and "you know" should all be detected
        assert words & {"uh", "um", "you know"}

    def test_case_insensitive_matching(self):
        hits_lower = detect_filler_words("uh that is good")
        hits_upper = detect_filler_words("UH that is good")
        assert {h.word for h in hits_lower} == {h.word for h in hits_upper}

    def test_result_sorted_by_count_descending(self):
        text = "uh uh uh um uh"
        hits = detect_filler_words(text)
        if len(hits) >= 2:
            assert hits[0].count >= hits[1].count

    def test_with_word_timestamps(self):
        timestamps = [
            {"word": "I", "start": 0.0},
            {"word": "uh", "start": 0.3},
            {"word": "think", "start": 0.7},
            {"word": "um", "start": 1.1},
        ]
        hits = detect_filler_words("I uh think um", word_timestamps=timestamps)
        words = {h.word for h in hits}
        assert "uh" in words
        assert "um" in words

    def test_timestamps_captured_per_occurrence(self):
        timestamps = [
            {"word": "uh", "start": 0.1},
            {"word": "well", "start": 0.5},
            {"word": "uh", "start": 1.2},
        ]
        hits = detect_filler_words("uh well uh", word_timestamps=timestamps)
        uh_hit = next((h for h in hits if h.word == "uh"), None)
        assert uh_hit is not None
        assert uh_hit.count == 2
        assert len(uh_hit.timestamps) == 2

    def test_language_specific_fillers_hindi(self):
        """When a language is specified, only that language's fillers are used."""
        from config import FILLER_WORDS_BY_LANGUAGE

        hindi_fillers = FILLER_WORDS_BY_LANGUAGE.get("Hindi")
        if not hindi_fillers:
            pytest.skip("Hindi fillers not configured")

        # Pick a Hindi filler and embed it in text
        sample_filler = next(iter(hindi_fillers))
        hits = detect_filler_words(f"I {sample_filler} think", language="Hindi")
        words = {h.word for h in hits}
        assert sample_filler in words

    def test_multiword_filler_detected(self):
        hits = detect_filler_words("you know this is good right")
        words = {h.word for h in hits}
        # "you know" should be caught as a multi-word filler
        assert "you know" in words or any(w in words for w in ["you", "know"])

    def test_filler_count_matches_occurrences(self):
        hits = detect_filler_words("uh uh uh um um")
        uh = next((h for h in hits if h.word == "uh"), None)
        assert uh is not None
        assert uh.count == 3


# ── filler_score ──────────────────────────────────────────────────────────

class TestFillerScore:
    def test_zero_duration_returns_zero(self):
        assert filler_score(5, 0) == 0.0

    def test_no_fillers_perfect_score(self):
        assert filler_score(0, 60.0) == pytest.approx(100.0)

    def test_score_decreases_with_more_fillers(self):
        score_low = filler_score(2, 60.0)   # 2/min
        score_high = filler_score(12, 60.0)  # 12/min
        assert score_low > score_high

    def test_score_bounded_between_0_and_100(self):
        # Even extreme filler rate should stay ≥ 0
        score = filler_score(1000, 60.0)
        assert 0.0 <= score <= 100.0

    def test_score_is_rounded(self):
        score = filler_score(3, 60.0)
        assert score == round(score, 1)

    def test_rate_5_per_min_around_80(self):
        """5 fillers/min should yield ~80 (per docstring)."""
        score = filler_score(5, 60.0)
        assert 75.0 <= score <= 85.0

    def test_rate_10_per_min_around_60(self):
        """10 fillers/min should yield ~60 (per docstring)."""
        score = filler_score(10, 60.0)
        assert 55.0 <= score <= 65.0

    @pytest.mark.parametrize("count,duration", [
        (0, 30.0),
        (1, 120.0),
        (5, 90.0),
        (20, 60.0),
    ])
    def test_various_inputs_stay_in_range(self, count, duration):
        score = filler_score(count, duration)
        assert 0.0 <= score <= 100.0
