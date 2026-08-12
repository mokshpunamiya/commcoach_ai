"""Tests for analysis.emotion module."""

from __future__ import annotations

import pytest

from analysis.emotion import (
    EMOTION_TO_CONFIDENCE,
    approximate_confidence,
    emotion_to_confidence,
)
from schema import EmotionInfo

# ── emotion_to_confidence ─────────────────────────────────────────────────

class TestEmotionToConfidence:
    def test_none_emotion_returns_none(self):
        assert emotion_to_confidence(None) is None

    @pytest.mark.parametrize("label,expected", [
        ("happy", "high"),
        ("calm", "high"),
        ("neutral", "medium"),
        ("surprised", "medium"),
        ("angry", "low"),
        ("fearful", "low"),
        ("sad", "low"),
        ("disgust", "low"),
    ])
    def test_known_labels(self, label, expected):
        emotion = EmotionInfo(label=label, confidence=0.9)
        assert emotion_to_confidence(emotion) == expected

    def test_label_case_insensitive(self):
        emotion_upper = EmotionInfo(label="HAPPY", confidence=0.9)
        emotion_lower = EmotionInfo(label="happy", confidence=0.9)
        assert emotion_to_confidence(emotion_upper) == emotion_to_confidence(emotion_lower)

    def test_unknown_label_defaults_to_medium(self):
        emotion = EmotionInfo(label="confused", confidence=0.5)
        assert emotion_to_confidence(emotion) == "medium"

    def test_all_map_keys_produce_valid_levels(self):
        valid_levels = {"low", "medium", "high"}
        for _label, level in EMOTION_TO_CONFIDENCE.items():
            assert level in valid_levels


# ── approximate_confidence ────────────────────────────────────────────────

class TestApproximateConfidence:
    def test_zero_duration_returns_medium(self):
        assert approximate_confidence(130, 5, 0, 2) == "medium"

    def test_ideal_conditions_return_high(self):
        # ideal WPM (120-160), few pauses, no fillers → "high"
        result = approximate_confidence(
            wpm=140,
            pause_count=2,
            duration_seconds=60.0,
            filler_count=0,
        )
        assert result == "high"

    def test_very_slow_speech_returns_low(self):
        # WPM < 80 applies -25 penalty
        result = approximate_confidence(
            wpm=50,
            pause_count=2,
            duration_seconds=60.0,
            filler_count=0,
        )
        assert result in ("medium", "low")

    def test_many_fillers_lowers_confidence(self):
        # 12 fillers/min > 10/min threshold → -25 penalty
        result = approximate_confidence(
            wpm=140,
            pause_count=3,
            duration_seconds=60.0,
            filler_count=15,  # 15 fillers in 60s → 15/min
        )
        assert result in ("medium", "low")

    def test_many_pauses_lowers_confidence(self):
        # >20 pauses/min → -20 penalty
        result = approximate_confidence(
            wpm=140,
            pause_count=25,
            duration_seconds=60.0,
            filler_count=0,
        )
        assert result in ("medium", "low")

    def test_output_is_valid_level(self):
        valid_levels = {"low", "medium", "high"}
        for wpm in (50, 130, 200):
            for fillers in (0, 5, 15):
                result = approximate_confidence(wpm, 3, 60.0, fillers)
                assert result in valid_levels, f"wpm={wpm}, fillers={fillers}: got '{result}'"

    def test_filler_free_low_pause_ideal_pace_high(self):
        """All three dimensions healthy → must produce "high"."""
        result = approximate_confidence(
            wpm=135,
            pause_count=3,      # pause_rate = 3/min → < 6 → +8
            duration_seconds=60.0,
            filler_count=0,     # filler_rate = 0/min → +8
        )
        assert result == "high"

    @pytest.mark.parametrize("wpm,pauses,dur,fillers", [
        (130, 2, 60.0, 0),
        (50, 30, 60.0, 20),
        (200, 5, 60.0, 5),
        (100, 10, 90.0, 3),
    ])
    def test_parametrised_always_valid(self, wpm, pauses, dur, fillers):
        result = approximate_confidence(wpm, pauses, dur, fillers)
        assert result in {"low", "medium", "high"}
