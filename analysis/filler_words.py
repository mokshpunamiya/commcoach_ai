"""Filler-word detection via keyword matching on the transcript."""

from __future__ import annotations
import re
from schema import FillerWordHit
from config import FILLER_WORDS, FILLER_WORDS_BY_LANGUAGE


def detect_filler_words(
    transcript: str,
    word_timestamps: list[dict] | None = None,
    language: str | None = None,
) -> list[FillerWordHit]:
    """
    Detect filler words in the transcript.

    Args:
        transcript:       Raw transcript text.
        word_timestamps:  Optional list of {word, start} dicts from Sarvam STT.
        language:         Display label of the detected language (e.g. "Hindi").
                          When provided, only that language's filler set is used.
                          When None, the union of all languages is used.
    """
    if not transcript.strip():
        return []

    # Choose the active filler set: language-specific when known, union otherwise
    active_fillers: set[str] = (
        FILLER_WORDS_BY_LANGUAGE.get(language, FILLER_WORDS)
        if language
        else FILLER_WORDS
    )

    hits: dict[str, list[float]] = {}

    # Work word-by-word if we have timestamps (more precise)
    if word_timestamps:
        for wt in word_timestamps:
            word_lower = wt["word"].lower().strip(".,!?;:\"'")
            if word_lower in active_fillers:
                hits.setdefault(word_lower, []).append(wt["start"])

        # Also check for multi-word fillers in the raw text
        for filler in active_fillers:
            if " " in filler:
                pattern = re.compile(r"\b" + re.escape(filler) + r"\b", re.IGNORECASE)
                for m in pattern.finditer(transcript):
                    hits.setdefault(filler, []).append(0.0)  # approximate timestamp
    else:
        # Fallback: regex on the full transcript
        for filler in active_fillers:
            pattern = re.compile(r"\b" + re.escape(filler) + r"\b", re.IGNORECASE)
            for m in pattern.finditer(transcript):
                hits.setdefault(filler, []).append(0.0)

    result: list[FillerWordHit] = []
    for word, timestamps in hits.items():
        result.append(FillerWordHit(
            word=word,
            count=len(timestamps),
            timestamps=timestamps,
        ))
    result.sort(key=lambda h: h.count, reverse=True)
    return result


def filler_score(filler_count: int, duration_seconds: float) -> float:
    """
    Score 0-100.  Rate is fillers per minute.
    0/min → 100, 5/min → ~80, 10/min → ~60, 20+/min → low.
    """
    if duration_seconds == 0:
        return 0.0
    per_minute = filler_count / (duration_seconds / 60.0)
    score = max(0.0, 100.0 * (1 - per_minute / 25.0))
    return round(score, 1)