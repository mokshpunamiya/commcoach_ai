"""Shared pytest fixtures for CommCoach AI tests."""

from __future__ import annotations

import os

import numpy as np
import pytest

# ── Make config load without real API keys in CI ───────────────────────────
os.environ.setdefault("SARVAM_API_KEY", "ci-dummy")
os.environ.setdefault("OPENAI_API_KEY", "ci-dummy")

from schema import (  # noqa: E402  (import after env setup)
    FillerWordHit,
    GrammarIssue,
    PauseInfo,
    SessionReport,
)

# ── Audio helpers ──────────────────────────────────────────────────────────


def _write_wav(path: str, duration_s: float = 2.0, sample_rate: int = 16_000) -> None:
    """Write a minimal valid 16-kHz mono WAV file (sine tone) to *path*."""
    import struct
    import wave

    n_samples = int(duration_s * sample_rate)
    amplitude = 16_000
    samples = [
        int(amplitude * np.sin(2 * np.pi * 440 * i / sample_rate))
        for i in range(n_samples)
    ]
    with wave.open(path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(struct.pack(f"<{n_samples}h", *samples))


@pytest.fixture()
def tmp_wav(tmp_path):
    """Temporary 2-second WAV file with a 440 Hz sine tone."""
    wav_path = str(tmp_path / "sample.wav")
    _write_wav(wav_path, duration_s=2.0)
    return wav_path


@pytest.fixture()
def silence_wav(tmp_path):
    """Temporary 3-second WAV file that is completely silent."""
    import struct
    import wave

    wav_path = str(tmp_path / "silence.wav")
    sample_rate = 16_000
    n_samples = 3 * sample_rate
    with wave.open(wav_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(struct.pack(f"<{n_samples}h", *([0] * n_samples)))
    return wav_path


# ── Schema fixtures ────────────────────────────────────────────────────────


@pytest.fixture()
def basic_session_report() -> SessionReport:
    return SessionReport(
        transcript="I think uh this is a good answer you know.",
        word_count=9,
        duration_seconds=5.0,
        words_per_minute=108.0,
        pause_count=1,
        filler_word_count=2,
        filler_word_rate=24.0,
        grammar_issue_count=0,
        fluency_score=72.0,
        grammar_score=80.0,
        pronunciation_score=80.0,
        pace_score=90.0,
        filler_score=60.0,
        overall_score=75.0,
        confidence_level="medium",
    )


@pytest.fixture()
def filler_hits() -> list[FillerWordHit]:
    return [
        FillerWordHit(word="uh", count=3, timestamps=[0.5, 1.2, 2.8]),
        FillerWordHit(word="you know", count=1, timestamps=[3.0]),
    ]


@pytest.fixture()
def grammar_issues() -> list[GrammarIssue]:
    return [
        GrammarIssue(
            message="Possible agreement error",
            category="GRAMMAR",
            offset=5,
            length=3,
            suggestion="are",
        )
    ]


@pytest.fixture()
def pause_infos() -> list[PauseInfo]:
    return [
        PauseInfo(start=1.0, end=1.8, duration=0.8),
        PauseInfo(start=3.5, end=5.2, duration=1.7),
    ]
