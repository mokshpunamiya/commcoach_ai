"""Pace and pause analysis using librosa."""

from __future__ import annotations
import logging
import numpy as np
from schema import PauseInfo
from config import (
    IDEAL_WPM_MIN,
    IDEAL_WPM_MAX,
    PAUSE_THRESHOLD_SEC,
    LONG_PAUSE_THRESHOLD_SEC,
)

logger = logging.getLogger(__name__)


def calculate_pace(word_count: int, duration_seconds: float) -> float:
    """Return words per minute."""
    if duration_seconds <= 0:
        return 0.0
    return round(word_count / (duration_seconds / 60.0), 1)


def _load_audio_numpy(audio_path: str):
    """
    Load audio as a float32 numpy array (mono, 16 kHz).

    Tries soundfile first (fast, supports wav/flac/ogg).
    Falls back to PyAV (handles webm, mp4, etc.) when soundfile fails.
    Returns (samples: np.ndarray, sample_rate: int).
    """
    import numpy as np

    # 1. Try soundfile (fast path for wav/flac/ogg)
    try:
        import soundfile as sf
        data, sr = sf.read(audio_path, dtype="float32", always_2d=False)
        if data.ndim == 2:
            data = data.mean(axis=1)
        # Resample to 16 kHz if needed
        if sr != 16000:
            try:
                import librosa
                data = librosa.resample(data, orig_sr=sr, target_sr=16000)
            except Exception:
                pass  # keep original sr, close enough for RMS
            sr = 16000
        return data, sr
    except Exception:
        pass

    # 2. Fallback: decode with PyAV, resample to 16 kHz mono
    try:
        import av
        samples_list = []
        with av.open(audio_path) as container:
            audio_stream = next(
                (s for s in container.streams if s.type == "audio"), None
            )
            if audio_stream is None:
                return None, 0
            resampler = av.AudioResampler(format="fltp", layout="mono", rate=16000)
            for frame in container.decode(audio_stream):
                for r_frame in resampler.resample(frame):
                    arr = r_frame.to_ndarray()  # shape (1, N) float32
                    samples_list.append(arr[0])
        if samples_list:
            import numpy as np
            data = np.concatenate(samples_list)
            return data, 16000
    except Exception as e:
        logger.debug("PyAV audio load failed for %s: %s", audio_path, e)

    return None, 0


def detect_pauses(audio_path: str) -> tuple[list[PauseInfo], int]:
    """
    Detect silences/pauses in the audio using RMS energy.

    Returns (list_of_pauses, total_pause_count).
    """
    try:
        import librosa
        import numpy as np
    except ImportError:
        logger.warning("librosa not installed; pause detection skipped.")
        return [], 0

    y, sr = _load_audio_numpy(audio_path)
    if y is None or len(y) == 0:
        logger.error("Failed to load audio %s", audio_path)
        return [], 0

    # Use energy-based silence detection
    frame_length = 2048
    hop_length = 512

    # Compute RMS energy
    rms = librosa.feature.rms(y=y, frame_length=frame_length, hop_length=hop_length)[0]
    frames_per_second = sr / hop_length

    # Threshold: silence if RMS below 10% of mean (or very low absolute)
    threshold = max(0.01, np.mean(rms) * 0.15)

    is_silent = rms < threshold

    # Find contiguous silent regions
    pauses: list[PauseInfo] = []
    in_silence = False
    silence_start_frame = 0

    for i, silent in enumerate(is_silent):
        if silent and not in_silence:
            in_silence = True
            silence_start_frame = i
        elif not silent and in_silence:
            in_silence = False
            start_sec = silence_start_frame / frames_per_second
            end_sec = i / frames_per_second
            duration = end_sec - start_sec
            if duration >= PAUSE_THRESHOLD_SEC:
                pauses.append(PauseInfo(
                    start=round(start_sec, 2),
                    end=round(end_sec, 2),
                    duration=round(duration, 2),
                ))

    # Handle trailing silence
    if in_silence:
        start_sec = silence_start_frame / frames_per_second
        end_sec = len(is_silent) / frames_per_second
        duration = end_sec - start_sec
        if duration >= PAUSE_THRESHOLD_SEC:
            pauses.append(PauseInfo(
                start=round(start_sec, 2),
                end=round(end_sec, 2),
                duration=round(duration, 2),
            ))

    return pauses, len(pauses)


def get_long_pauses(pauses: list[PauseInfo]) -> list[PauseInfo]:
    """Filter pauses to only those >= LONG_PAUSE_THRESHOLD_SEC."""
    return [p for p in pauses if p.duration >= LONG_PAUSE_THRESHOLD_SEC]


def pace_score(wpm: float) -> float:
    """
    Score 0-100 based on how close WPM is to the ideal range.
    Ideal: IDEAL_WPM_MIN – IDEAL_WPM_MAX.
    """
    if wpm == 0:
        return 0.0
    if IDEAL_WPM_MIN <= wpm <= IDEAL_WPM_MAX:
        return 100.0
    if wpm < IDEAL_WPM_MIN:
        # Too slow
        ratio = wpm / IDEAL_WPM_MIN
        return round(max(0.0, ratio * 100.0), 1)
    else:
        # Too fast — penalise more aggressively
        excess = wpm - IDEAL_WPM_MAX
        penalty = min(80.0, excess * 1.5)
        return round(max(0.0, 100.0 - penalty), 1)


def fluency_score(
    pace_score_val: float,
    filler_score_val: float,
    pause_count: int,
    duration_seconds: float,
    long_pause_count: int,
) -> float:
    """
    Holistic fluency score 0-100 combining pace, fillers, and pauses.
    """
    if duration_seconds == 0:
        return 0.0

    # Pause rate per minute
    pause_rate = pause_count / (duration_seconds / 60.0)

    # Too many pauses (rate > 20/min) is bad; few is fine
    pause_penalty = max(0.0, (pause_rate - 15) * 2)
    long_pause_penalty = long_pause_count * 3

    raw = (
        pace_score_val * 0.35
        + filler_score_val * 0.40
        + max(0.0, 100.0 - pause_penalty - long_pause_penalty) * 0.25
    )
    return round(max(0.0, min(100.0, raw)), 1)