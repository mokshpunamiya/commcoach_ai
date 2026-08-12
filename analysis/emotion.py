"""Emotion / confidence detection from audio.

The external HuggingFace wav2vec2 emotion model is unavailable in this
environment, so we rely entirely on the heuristic `approximate_confidence`
function derived from pace, pause, and filler metrics.
"""

from __future__ import annotations

import logging

from schema import EmotionInfo

logger = logging.getLogger(__name__)


def detect_emotion(audio_path: str) -> EmotionInfo | None:
    """
    Emotion detection from audio.

    The remote model (superb/wav2vec2-base-speech-emotion-recognition) requires
    authenticated HuggingFace access which is not available here, so this
    always returns None — the caller falls back to `approximate_confidence`.
    """
    return None


# Map RAVDESS-style emotion labels to a confidence level
EMOTION_TO_CONFIDENCE = {
    "angry": "low",
    "fearful": "low",
    "sad": "low",
    "disgust": "low",
    "happy": "high",
    "surprised": "medium",
    "neutral": "medium",
    "calm": "high",
}


def emotion_to_confidence(emotion: EmotionInfo | None) -> str | None:
    if emotion is None:
        return None
    return EMOTION_TO_CONFIDENCE.get(emotion.label.lower(), "medium")


def approximate_confidence(
    wpm: float,
    pause_count: int,
    duration_seconds: float,
    filler_count: int,
) -> str:
    """Heuristic confidence approximation when no emotion model is available.

    Scores are intentionally strict — all three dimensions (pace, pauses,
    fillers) must be healthy to reach "high".  A single bad signal drops
    the result to "medium" or "low".
    """
    if duration_seconds == 0:
        return "medium"

    pause_rate = pause_count / (duration_seconds / 60.0)
    filler_rate = filler_count / (duration_seconds / 60.0) if duration_seconds > 0 else 0

    # Start neutral — each dimension can add or subtract independently.
    score = 50

    # ── Pace (speak naturally; too fast or too slow both hurt) ──────────
    if 120 <= wpm <= 160:
        score += 15  # ideal range
    elif 100 <= wpm < 120 or 160 < wpm <= 180:
        score += 5  # slightly off but acceptable
    elif wpm < 80 or wpm > 200:
        score -= 25  # clearly problematic
    else:
        score -= 10  # moderately off

    # ── Pauses (too many → nervous; moderate is fine) ───────────────────
    if pause_rate > 20:
        score -= 20  # very choppy
    elif pause_rate > 12:
        score -= 8
    elif pause_rate < 6:
        score += 8  # few pauses = smoother delivery
    # 6–12/min is neutral

    # ── Filler words (each rate band has a real cost) ───────────────────
    if filler_rate > 10:
        score -= 25  # heavy filler use kills confidence perception
    elif filler_rate > 5:
        score -= 15
    elif filler_rate > 2:
        score -= 5
    else:
        score += 8  # nearly filler-free

    # "high" now requires solid performance across the board (≥ 68)
    if score >= 68:
        return "high"
    elif score >= 40:
        return "medium"
    return "low"
