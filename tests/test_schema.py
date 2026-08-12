"""Tests for Pydantic schema models."""

from __future__ import annotations

import pytest

from schema import (
    AnalyzeRequest,
    EmotionInfo,
    FeedbackResponse,
    FillerWordHit,
    GrammarIssue,
    PauseInfo,
    SessionReport,
    StartInterviewRequest,
)

# ── FillerWordHit ──────────────────────────────────────────────────────────


class TestFillerWordHit:
    def test_valid_construction(self):
        hit = FillerWordHit(word="uh", count=3, timestamps=[0.5, 1.2, 2.8])
        assert hit.word == "uh"
        assert hit.count == 3
        assert hit.timestamps == [0.5, 1.2, 2.8]

    def test_default_timestamps(self):
        hit = FillerWordHit(word="um", count=1)
        assert hit.timestamps == []

    def test_zero_count_allowed(self):
        hit = FillerWordHit(word="like", count=0)
        assert hit.count == 0

    def test_serialisation_round_trip(self, filler_hits):
        for hit in filler_hits:
            restored = FillerWordHit.model_validate(hit.model_dump())
            assert restored == hit


# ── GrammarIssue ──────────────────────────────────────────────────────────


class TestGrammarIssue:
    def test_valid_with_suggestion(self):
        issue = GrammarIssue(
            message="Possible agreement error",
            category="GRAMMAR",
            offset=5,
            length=3,
            suggestion="are",
        )
        assert issue.suggestion == "are"

    def test_suggestion_optional(self):
        issue = GrammarIssue(message="Spelling", category="TYPOS", offset=0, length=2)
        assert issue.suggestion is None

    def test_defaults_for_offset_length(self):
        issue = GrammarIssue(message="Spelling", category="TYPOS")
        assert issue.offset == 0
        assert issue.length == 0


# ── PauseInfo ─────────────────────────────────────────────────────────────


class TestPauseInfo:
    def test_pause_duration_stored(self):
        p = PauseInfo(start=1.0, end=2.5, duration=1.5)
        assert p.duration == pytest.approx(1.5)

    def test_serialisation_round_trip(self, pause_infos):
        for p in pause_infos:
            restored = PauseInfo.model_validate(p.model_dump())
            assert restored == p


# ── EmotionInfo ───────────────────────────────────────────────────────────


class TestEmotionInfo:
    def test_valid(self):
        e = EmotionInfo(label="happy", confidence=0.92)
        assert e.label == "happy"
        assert e.confidence == pytest.approx(0.92)


# ── SessionReport ─────────────────────────────────────────────────────────


class TestSessionReport:
    def test_defaults(self):
        r = SessionReport()
        assert r.transcript == ""
        assert r.word_count == 0
        assert r.overall_score == 0.0
        assert r.grammar_issues == []
        assert r.filler_words == []
        assert r.long_pauses == []
        assert r.llm_grammar_issues == []
        assert r.emotion is None
        assert r.confidence_level is None

    def test_full_construction(self, basic_session_report):
        r = basic_session_report
        assert r.transcript != ""
        assert r.fluency_score > 0
        assert r.overall_score > 0

    def test_scores_are_stored_verbatim(self):
        """SessionReport must not clamp or alter the values passed in."""
        r = SessionReport(
            fluency_score=88.5,
            grammar_score=91.0,
            pace_score=75.0,
            filler_score=60.0,
            overall_score=82.3,
        )
        assert r.fluency_score == pytest.approx(88.5)
        assert r.overall_score == pytest.approx(82.3)

    def test_serialisation_round_trip(self, basic_session_report):
        data = basic_session_report.model_dump()
        restored = SessionReport.model_validate(data)
        assert restored == basic_session_report

    def test_nested_filler_words_serialise(self, filler_hits):
        r = SessionReport(filler_words=filler_hits, filler_word_count=4)
        data = r.model_dump()
        assert len(data["filler_words"]) == 2
        assert data["filler_words"][0]["word"] == "uh"

    def test_nested_grammar_issues_serialise(self, grammar_issues):
        r = SessionReport(grammar_issues=grammar_issues, grammar_issue_count=1)
        data = r.model_dump()
        assert data["grammar_issues"][0]["category"] == "GRAMMAR"

    def test_json_schema_generated(self):
        schema = SessionReport.model_json_schema()
        assert "properties" in schema
        assert "overall_score" in schema["properties"]


# ── FeedbackResponse ──────────────────────────────────────────────────────


class TestFeedbackResponse:
    def test_feedback_required(self):
        fb = FeedbackResponse(feedback="Great job!")
        assert fb.feedback == "Great job!"
        assert fb.next_question is None
        assert fb.session_report is None

    def test_with_session_report(self, basic_session_report):
        fb = FeedbackResponse(
            feedback="Good answer.",
            session_report=basic_session_report,
        )
        assert fb.session_report is not None
        assert fb.session_report.overall_score > 0


# ── Request models ────────────────────────────────────────────────────────


class TestRequestModels:
    def test_start_interview_defaults(self):
        req = StartInterviewRequest()
        assert req.user_id == "default_user"
        assert req.topic == "general software engineering"
        assert req.resume_text is None

    def test_analyze_request_defaults(self):
        req = AnalyzeRequest()
        assert req.user_id == "default_user"
        assert req.session_id is None
        assert req.interview_topic is None
