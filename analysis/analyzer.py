"""Combine all analysis modules into a single SessionReport."""

from __future__ import annotations

import logging
import re
from concurrent.futures import ThreadPoolExecutor

from analysis.emotion import approximate_confidence, detect_emotion, emotion_to_confidence
from analysis.filler_words import detect_filler_words, filler_score
from analysis.grammar import (
    _get_tool,
    check_grammar,
    grammar_score,
    score_grammar_llm,
    score_relevancy_llm,
)
from analysis.pace import (
    calculate_pace,
    detect_pauses,
    fluency_score,
    get_long_pauses,
    pace_score,
)
from analysis.transcriber import transcribe
from schema import SessionReport

logger = logging.getLogger(__name__)

# ─── Weak-answer detection ────────────────────────────────────────────────────
# Patterns that indicate a non-answer or refusal to answer.
_WEAK_ANSWER_PATTERNS = re.compile(
    r"""^(
        i\s+don'?t\s+know |
        i\s+do\s+not\s+know |
        no\s+idea |
        not\s+sure |
        i'?m\s+not\s+sure |
        i\s+have\s+no\s+(experience|idea|clue|knowledge) |
        i\s+don'?t\s+have\s+any\s+(experience|idea|knowledge) |
        i\s+don'?t\s+actually |
        i\s+cannot\s+answer |
        i\s+can'?t\s+answer |
        no |
        nope |
        none |
        i\s+just\s+wanted\s+a\s+job |
        i\s+applied\s+(because|since|as)\s+i\s+(needed|wanted|just) |
        i\s+don'?t\s+know\s+this |
        i\s+have\s+no\s+answer |
        i\s+pass
    )\b""",
    re.IGNORECASE | re.VERBOSE,
)

# Words that are not "meaningful" for the 5-word threshold check
_FILLER_WORDS = {
    "um", "uh", "uhh", "umm", "hmm", "like", "so", "well", "you", "know",
    "i", "mean", "basically", "actually", "literally", "right", "yeah",
    "okay", "ok", "a", "an", "the", "and", "or", "but", "is", "it",
}


def _is_weak_answer(transcript: str) -> tuple[bool, str]:
    """
    Detect if an answer is a non-answer, refusal, or too short to be meaningful.

    Returns (is_weak, reason).
    """
    text = transcript.strip() if transcript else ""

    # Empty or blank answer
    if not text:
        return True, "empty answer"

    # Check against known weak patterns
    if _WEAK_ANSWER_PATTERNS.match(text):
        return True, "non-answer or refusal detected"

    # Count meaningful words (excluding filler words and punctuation-only tokens)
    words = re.findall(r"[a-zA-Z']+", text.lower())
    meaningful = [w for w in words if w not in _FILLER_WORDS and len(w) > 1]
    if len(meaningful) < 5:
        return True, f"too short ({len(meaningful)} meaningful words)"

    return False, ""


def _apply_weak_answer_penalty(overall: float, relevancy: float | None, transcript: str) -> float:
    """
    If the answer is weak/non-answer, cap the overall score at 20.
    If relevancy is already ≤20 (LLM detected weakness), cap at that value.
    """
    is_weak, _ = _is_weak_answer(transcript)
    if is_weak:
        return min(overall, 20.0)
    # If LLM scored relevancy ≤20, trust that signal and cap overall
    if relevancy is not None and relevancy <= 20:
        return min(overall, 20.0)
    return overall


def _run_grammar(transcript: str, word_count: int) -> tuple[list, float, float, list]:
    """
    Run grammar + pronunciation scoring.

    Returns (grammar_issues, grammar_score_val, pronunciation_score_val, llm_issues).
    Uses LanguageTool when Java is available, otherwise uses LLM scorer.
    """
    if _get_tool() is not None:
        # LanguageTool path — real issue list, no pronunciation
        issues = check_grammar(transcript)
        g_score = grammar_score(len(issues), word_count)
        return issues, g_score, g_score, []  # pronunciation mirrors grammar
    else:
        # LLM scorer path — no LanguageTool issues, but real grammar + pronunciation scores
        logger.info("Scoring grammar and pronunciation via LLM …")
        llm_result = score_grammar_llm(transcript)
        g_score = float(llm_result["grammar"])
        p_score = float(llm_result["pronunciation"])
        llm_issues = llm_result.get("grammar_issues", [])
        return [], g_score, p_score, llm_issues


def analyze_audio(
    audio_path: str,
    use_emotion: bool = True,
    question: str | None = None,
) -> SessionReport:
    """
    Full pipeline: transcribe → grammar → fillers → pace → emotion.

    Returns a populated SessionReport.
    """
    # 1. Transcribe
    logger.info("Transcribing %s …", audio_path)
    whisper_result = transcribe(audio_path)
    transcript = whisper_result["text"]
    word_timestamps = whisper_result["word_timestamps"]
    duration = whisper_result["duration_seconds"]
    word_count = len(word_timestamps) if word_timestamps else len(transcript.split())

    # 2–4. Grammar, filler detection, and pause detection are independent —
    #       run them in parallel to collapse ~3.5 s → ~2 s.
    wt = word_timestamps  # local alias for the closure below
    with ThreadPoolExecutor(max_workers=3) as ex:
        f_grammar = ex.submit(_run_grammar, transcript, word_count)
        f_fillers = ex.submit(detect_filler_words, transcript, wt or None)
        f_pauses = ex.submit(detect_pauses, audio_path)

    grammar_issues, g_score, pronun_score, llm_issues = f_grammar.result()

    filler_hits = f_fillers.result()
    filler_count = sum(h.count for h in filler_hits)
    f_score = filler_score(filler_count, duration)

    pauses, pause_count = f_pauses.result()
    long_pauses = get_long_pauses(pauses)

    # Pace (depends only on word_count + duration — no I/O, compute inline)
    wpm = calculate_pace(word_count, duration)
    pa_score = pace_score(wpm)

    # 5. Fluency (composite)
    fl_score = fluency_score(pa_score, f_score, pause_count, duration, len(long_pauses))

    # 6. Emotion
    emotion_info = None
    confidence_level = None
    if use_emotion:
        logger.info("Detecting emotion …")
        emotion_info = detect_emotion(audio_path)
        confidence_level = emotion_to_confidence(emotion_info)
    if confidence_level is None:
        confidence_level = approximate_confidence(wpm, pause_count, duration, filler_count)

    # 7. Answer relevancy — only meaningful when a real interview question is provided.
    # A bare topic label like "HR" or "Technical" is not a valid ground truth, so we
    # skip the LLM call and leave relevancy as None in that case.
    # Use >= 3 words: catches "Tell me about yourself" (4 words) and longer questions,
    # while still skipping bare topic labels like "HR" or "Technical" (1-2 words).
    _real_question = bool(question and len(question.strip().split()) >= 3)
    relevancy_score: float | None = (
        float(score_relevancy_llm(transcript, question)["relevancy"]) if _real_question else None
    )

    # 8. Overall score
    #   When a real question is present (mock interview) — weights sum to 1.0:
    #     answer_relevancy  0.40  — highest: did the answer address the question?
    #     completeness      0.25  — approximated by fluency (length/depth proxy)
    #     technical/behav.  0.20  — approximated by grammar score
    #     communication     0.10  — filler score
    #     grammar/written   0.05  — pace score
    #
    #   When no real question (assessment-only) — redistribute that 40% weight:
    #     fluency           0.30
    #     grammar           0.25
    #     filler            0.20
    #     pronunciation     0.15
    #     pace              0.10
    if relevancy_score is not None:
        overall = round(
            relevancy_score * 0.40
            + fl_score * 0.25
            + g_score * 0.20
            + f_score * 0.10
            + pa_score * 0.05,
            1,
        )
    else:
        overall = round(
            fl_score * 0.30
            + g_score * 0.25
            + f_score * 0.20
            + pronun_score * 0.15
            + pa_score * 0.10,
            1,
        )

    # Apply weak-answer penalty — caps score at 20 for non-answers
    overall = _apply_weak_answer_penalty(overall, relevancy_score, transcript)

    return SessionReport(
        transcript=transcript,
        word_count=word_count,
        duration_seconds=round(duration, 2),
        words_per_minute=wpm,
        pause_count=pause_count,
        long_pauses=long_pauses,
        filler_words=filler_hits,
        filler_word_count=filler_count,
        filler_word_rate=round(filler_count / (duration / 60.0), 1) if duration > 0 else 0.0,
        grammar_issues=grammar_issues,
        grammar_issue_count=len(grammar_issues),
        fluency_score=fl_score,
        grammar_score=g_score,
        pronunciation_score=pronun_score,
        pace_score=pa_score,
        filler_score=f_score,
        answer_relevancy_score=relevancy_score if relevancy_score is not None else 0.0,
        overall_score=overall,
        emotion=emotion_info,
        confidence_level=confidence_level,
        llm_grammar_issues=llm_issues,
    )


def analyze_with_transcript(
    transcript: str,
    audio_path: str,
    duration_seconds: float,
    word_timestamps: list | None = None,
    question: str | None = None,
) -> SessionReport:
    """
    Run the full analysis pipeline WITHOUT re-transcribing.

    Called by the graph's analyze_node when transcribe_node has already run
    Sarvam STT. The transcript + duration come from the graph state; the audio
    file is only used for pace/pause detection (librosa/PyAV — no Sarvam call).
    """
    wt = word_timestamps or []
    word_count = len(wt) if wt else len(transcript.split())

    # If Sarvam returned no timestamps AND PyAV probe also failed, try to
    # measure duration directly here from the audio file.
    if duration_seconds <= 0.0 and audio_path:
        from analysis.transcriber import _measure_duration_pyav

        duration_seconds = _measure_duration_pyav(audio_path)

    # Last resort: estimate from word count at average English speaking rate
    if duration_seconds <= 0.0 and word_count > 0:
        duration_seconds = (word_count / 130.0) * 60.0  # 130 WPM average
        logger.warning(
            "Duration unknown — estimating %.1f s from %d words at 130 WPM",
            duration_seconds,
            word_count,
        )

    # Grammar, filler detection, and pause detection share no inputs beyond
    # transcript/audio_path — run in parallel to reduce wall-clock time.
    with ThreadPoolExecutor(max_workers=3) as ex:
        f_grammar = ex.submit(_run_grammar, transcript, word_count)
        f_fillers = ex.submit(detect_filler_words, transcript, wt or None)
        f_pauses = ex.submit(detect_pauses, audio_path)

    grammar_issues, g_score, pronun_score, llm_issues = f_grammar.result()

    filler_hits = f_fillers.result()
    filler_count = sum(h.count for h in filler_hits)
    f_score = filler_score(filler_count, duration_seconds)

    pauses, pause_count = f_pauses.result()
    long_pauses = get_long_pauses(pauses)

    wpm = calculate_pace(word_count, duration_seconds)
    pa_score = pace_score(wpm)

    # Fluency
    fl_score = fluency_score(pa_score, f_score, pause_count, duration_seconds, len(long_pauses))

    # Confidence (heuristic only — no emotion model)
    confidence_level = approximate_confidence(wpm, pause_count, duration_seconds, filler_count)

    # Answer relevancy — only meaningful when a real interview question is provided.
    _real_question = bool(question and len(question.strip().split()) >= 3)
    relevancy_score: float | None = (
        float(score_relevancy_llm(transcript, question)["relevancy"]) if _real_question else None
    )

    # Overall — same conditional weighting as analyze_audio
    if relevancy_score is not None:
        overall = round(
            relevancy_score * 0.40
            + fl_score * 0.25
            + g_score * 0.20
            + f_score * 0.10
            + pa_score * 0.05,
            1,
        )
    else:
        overall = round(
            fl_score * 0.30
            + g_score * 0.25
            + f_score * 0.20
            + pronun_score * 0.15
            + pa_score * 0.10,
            1,
        )

    # Apply weak-answer penalty — caps score at 20 for non-answers
    overall = _apply_weak_answer_penalty(overall, relevancy_score, transcript)

    return SessionReport(
        transcript=transcript,
        word_count=word_count,
        duration_seconds=round(duration_seconds, 2),
        words_per_minute=wpm,
        pause_count=pause_count,
        long_pauses=long_pauses,
        filler_words=filler_hits,
        filler_word_count=filler_count,
        filler_word_rate=round(filler_count / (duration_seconds / 60.0), 1)
        if duration_seconds > 0
        else 0.0,
        grammar_issues=grammar_issues,
        grammar_issue_count=len(grammar_issues),
        fluency_score=fl_score,
        grammar_score=g_score,
        pronunciation_score=pronun_score,
        pace_score=pa_score,
        filler_score=f_score,
        answer_relevancy_score=relevancy_score if relevancy_score is not None else 0.0,
        overall_score=overall,
        emotion=None,
        confidence_level=confidence_level,
        llm_grammar_issues=llm_issues,
    )


def analyze_transcript_only(
    transcript: str,
    question: str | None = None,
) -> SessionReport:
    """
    Analyse a transcript without audio (used for text-only mock interview answers).
    Pace/pause/emotion analysis is skipped.
    """
    word_count = len(transcript.split())

    grammar_issues = check_grammar(transcript)
    g_score = grammar_score(len(grammar_issues), word_count)

    filler_hits = detect_filler_words(transcript)
    filler_count = sum(h.count for h in filler_hits)
    f_score = filler_score(filler_count, 60.0)  # assume ~1 min if unknown

    # Answer relevancy — only meaningful when a real interview question is provided.
    _real_question = bool(question and len(question.strip().split()) >= 3)
    relevancy_score: float | None = (
        float(score_relevancy_llm(transcript, question)["relevancy"]) if _real_question else None
    )

    # Text-only overall: no fluency/pace/pronunciation data available.
    #   With a real question — answer_relevancy  0.50  (dominant signal)
    #                          grammar           0.30
    #                          filler            0.20
    #
    #   Without a real question — redistribute relevancy weight:
    #                          grammar           0.60
    #                          filler            0.40
    if relevancy_score is not None:
        overall = round(
            relevancy_score * 0.50 + g_score * 0.30 + f_score * 0.20,
            1,
        )
    else:
        overall = round(
            g_score * 0.60 + f_score * 0.40,
            1,
        )

    # Apply weak-answer penalty — caps score at 20 for non-answers
    overall = _apply_weak_answer_penalty(overall, relevancy_score, transcript)

    return SessionReport(
        transcript=transcript,
        word_count=word_count,
        duration_seconds=0.0,
        words_per_minute=0.0,
        pause_count=0,
        long_pauses=[],
        filler_words=filler_hits,
        filler_word_count=filler_count,
        filler_word_rate=0.0,
        grammar_issues=grammar_issues,
        grammar_issue_count=len(grammar_issues),
        fluency_score=0.0,
        grammar_score=g_score,
        pace_score=0.0,
        filler_score=f_score,
        answer_relevancy_score=relevancy_score if relevancy_score is not None else 0.0,
        overall_score=overall,
        emotion=None,
        confidence_level=None,
    )
