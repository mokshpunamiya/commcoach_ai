"""Tests for analysis.grammar module (pure-function subset — no LLM/Java calls)."""

from __future__ import annotations

import pytest

from analysis.grammar import grammar_score

# ── grammar_score ─────────────────────────────────────────────────────────


class TestGrammarScore:
    def test_zero_word_count_returns_zero(self):
        assert grammar_score(0, 0) == 0.0
        assert grammar_score(5, 0) == 0.0

    def test_no_issues_long_answer_perfect_score(self):
        # 20+ words and 0 issues → should reach 100
        assert grammar_score(0, 20) == pytest.approx(100.0)

    def test_no_issues_short_answer_penalised(self):
        # 5 words → max achievable = 50 (short_penalty = 5/10 = 0.5)
        score = grammar_score(0, 5)
        assert score <= 50.0

    def test_short_penalty_scaling(self):
        # At exactly 10 words the penalty lifts
        score_10 = grammar_score(0, 10)
        score_5 = grammar_score(0, 5)
        assert score_10 > score_5

    def test_more_issues_lower_score(self):
        s_clean = grammar_score(0, 30)
        s_few = grammar_score(2, 30)
        s_many = grammar_score(10, 30)
        assert s_clean > s_few > s_many

    def test_score_bounded_0_to_100(self):
        for issues in (0, 1, 5, 10, 50):
            for words in (5, 10, 20, 50, 100):
                s = grammar_score(issues, words)
                assert 0.0 <= s <= 100.0, f"grammar_score({issues}, {words}) = {s}"

    def test_score_rounded_to_one_decimal(self):
        s = grammar_score(3, 40)
        assert s == round(s, 1)

    def test_high_issue_density_near_zero(self):
        # 10 issues in 10 words → rate = 1.0 → near 0
        score = grammar_score(10, 10)
        assert score == pytest.approx(0.0)

    @pytest.mark.parametrize(
        "issues,words,expected_min,expected_max",
        [
            (0, 100, 99.0, 100.0),  # no issues, long answer → perfect
            (0, 3, 0.0, 30.0),  # no issues, 3-word answer → heavy penalty
            (5, 50, 0.0, 60.0),  # moderate density
            (1, 20, 50.0, 100.0),  # low density, reasonable answer
        ],
    )
    def test_expected_ranges(self, issues, words, expected_min, expected_max):
        s = grammar_score(issues, words)
        assert expected_min <= s <= expected_max, (
            f"grammar_score({issues}, {words}) = {s} not in [{expected_min}, {expected_max}]"
        )
