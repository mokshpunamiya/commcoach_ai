"""Tests for analysis.pace module (pure-function subset — no audio I/O)."""

from __future__ import annotations

import pytest

from analysis.pace import (
    calculate_pace,
    fluency_score,
    get_long_pauses,
    pace_score,
)
from schema import PauseInfo

# ── calculate_pace ────────────────────────────────────────────────────────


class TestCalculatePace:
    def test_zero_duration_returns_zero(self):
        assert calculate_pace(100, 0) == 0.0
        assert calculate_pace(100, -1) == 0.0

    def test_known_wpm(self):
        # 130 words in 60 seconds → 130.0 WPM
        assert calculate_pace(130, 60.0) == pytest.approx(130.0, abs=0.1)

    def test_partial_minute(self):
        # 65 words in 30 seconds → 130.0 WPM
        assert calculate_pace(65, 30.0) == pytest.approx(130.0, abs=0.1)

    def test_result_is_rounded_to_one_decimal(self):
        wpm = calculate_pace(137, 60.0)
        assert wpm == round(wpm, 1)

    @pytest.mark.parametrize(
        "words,duration",
        [
            (0, 60.0),
            (200, 120.0),
            (50, 30.0),
        ],
    )
    def test_parametrised(self, words, duration):
        wpm = calculate_pace(words, duration)
        expected = round(words / (duration / 60.0), 1)
        assert wpm == pytest.approx(expected)


# ── pace_score ────────────────────────────────────────────────────────────


class TestPaceScore:
    def test_zero_wpm_returns_zero(self):
        assert pace_score(0) == 0.0

    def test_ideal_range_returns_100(self):
        # IDEAL_WPM_MIN=120, IDEAL_WPM_MAX=160
        for wpm in (120, 130, 140, 150, 160):
            assert pace_score(wpm) == pytest.approx(100.0), f"wpm={wpm}"

    def test_too_slow_penalised(self):
        assert pace_score(80) < 100.0
        assert pace_score(60) < pace_score(100)

    def test_too_fast_penalised(self):
        assert pace_score(200) < 100.0
        assert pace_score(220) < pace_score(170)

    def test_score_bounded_0_to_100(self):
        for wpm in (0, 10, 50, 100, 120, 160, 220, 300):
            s = pace_score(wpm)
            assert 0.0 <= s <= 100.0, f"pace_score({wpm}) = {s} out of range"

    def test_score_rounded_to_one_decimal(self):
        s = pace_score(90)
        assert s == round(s, 1)

    def test_scores_monotone_below_ideal(self):
        """Slower WPM → lower score when below ideal range."""
        assert pace_score(50) < pace_score(80) < pace_score(110)

    def test_fast_penalty_more_aggressive_than_slow(self):
        """Symmetric distance from ideal: overshooting should be penalised more."""
        too_slow = pace_score(120 - 40)  # 80 WPM
        too_fast = pace_score(160 + 40)  # 200 WPM
        assert too_fast <= too_slow


# ── get_long_pauses ───────────────────────────────────────────────────────


class TestGetLongPauses:
    def test_empty_list_returns_empty(self):
        assert get_long_pauses([]) == []

    def test_filters_below_threshold(self, pause_infos):
        # pause_infos has durations 0.8 and 1.7; LONG_PAUSE_THRESHOLD=1.5
        long = get_long_pauses(pause_infos)
        for p in long:
            assert p.duration >= 1.5

    def test_all_short_returns_empty(self):
        pauses = [
            PauseInfo(start=0.0, end=0.4, duration=0.4),
            PauseInfo(start=1.0, end=1.3, duration=0.3),
        ]
        assert get_long_pauses(pauses) == []

    def test_all_long_returned(self):
        pauses = [
            PauseInfo(start=0.0, end=2.0, duration=2.0),
            PauseInfo(start=3.0, end=5.5, duration=2.5),
        ]
        assert len(get_long_pauses(pauses)) == 2


# ── fluency_score ─────────────────────────────────────────────────────────


class TestFluencyScore:
    def test_zero_duration_returns_zero(self):
        assert fluency_score(80.0, 80.0, 0, 0.0, 0) == 0.0

    def test_perfect_delivery(self):
        # Good pace, no fillers, no pauses → high score
        score = fluency_score(100.0, 100.0, 0, 60.0, 0)
        assert score >= 90.0

    def test_score_bounded_0_to_100(self):
        for pauses in (0, 5, 30, 100):
            s = fluency_score(80.0, 60.0, pauses, 60.0, pauses // 3)
            assert 0.0 <= s <= 100.0, f"fluency_score with {pauses} pauses = {s}"

    def test_more_long_pauses_lowers_score(self):
        base = fluency_score(80.0, 80.0, 5, 60.0, 0)
        worse = fluency_score(80.0, 80.0, 5, 60.0, 10)
        assert worse < base

    def test_high_pause_rate_lowers_score(self):
        low_pauses = fluency_score(80.0, 80.0, 5, 60.0, 0)
        many_pauses = fluency_score(80.0, 80.0, 30, 60.0, 0)
        assert many_pauses < low_pauses

    def test_result_is_rounded_to_one_decimal(self):
        s = fluency_score(75.0, 70.0, 3, 60.0, 1)
        assert s == round(s, 1)

    @pytest.mark.parametrize(
        "pace,filler,pauses,dur,long",
        [
            (100.0, 100.0, 0, 120.0, 0),
            (50.0, 50.0, 20, 60.0, 5),
            (0.0, 0.0, 0, 60.0, 0),
        ],
    )
    def test_parametrised_bounds(self, pace, filler, pauses, dur, long):
        s = fluency_score(pace, filler, pauses, dur, long)
        assert 0.0 <= s <= 100.0
