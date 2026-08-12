"""Sarvam AI speech-to-text transcription (with faster-whisper fallback)."""

from __future__ import annotations

import logging
import os
import tempfile

from config import SARVAM_API_KEY, SARVAM_STT_MODEL

logger = logging.getLogger(__name__)

# Sarvam STT hard-limits each request to 30 seconds.
# We use a slightly smaller window to stay safely under.
_SARVAM_MAX_SECONDS = 28


def _convert_to_wav(audio_path: str) -> str:
    """
    Convert any audio format to a 16 kHz mono WAV file using PyAV.
    Returns the path to the temporary WAV file.
    The caller is responsible for deleting it after use.
    """
    import av

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = tmp.name

    with av.open(audio_path) as in_container:
        # Pick the first audio stream
        in_stream = next((s for s in in_container.streams if s.type == "audio"), None)
        if in_stream is None:
            raise ValueError(f"No audio stream found in {audio_path}")

        with av.open(tmp_path, "w", format="wav") as out_container:
            out_stream = out_container.add_stream("pcm_s16le", rate=16000)
            out_stream.layout = "mono"

            resampler = av.AudioResampler(
                format="s16",
                layout="mono",
                rate=16000,
            )

            for frame in in_container.decode(in_stream):
                for r_frame in resampler.resample(frame):
                    r_frame.pts = None
                    out_container.mux(out_stream.encode(r_frame))

            # Flush
            for packet in out_stream.encode(None):
                out_container.mux(packet)

    return tmp_path


def _chunk_audio_pyav(audio_path: str, chunk_seconds: float = _SARVAM_MAX_SECONDS) -> list[str]:
    """
    Split an audio file into ≤chunk_seconds WAV chunks using PyAV.

    Decodes the file in a single linear pass (no seeking) so that
    frame timestamps are always correct regardless of container format
    (WebM/Opus, MP4, WAV, etc.).

    Returns a list of temporary WAV file paths (caller must delete them).
    """
    import math

    import av

    total = _measure_duration_pyav(audio_path)
    if total <= 0:
        return [_convert_to_wav(audio_path)]

    n_chunks = max(1, math.ceil(total / chunk_seconds))
    if n_chunks == 1:
        return [_convert_to_wav(audio_path)]

    logger.info(
        "Audio is %.1f s — splitting into %d chunk(s) of ≤%ds for Sarvam STT.",
        total,
        n_chunks,
        int(chunk_seconds),
    )

    # Pre-create all output files and their encoders up-front.
    boundaries = [(i * chunk_seconds, min((i + 1) * chunk_seconds, total)) for i in range(n_chunks)]

    tmp_paths: list[str] = []
    dst_containers: list = []
    out_streams: list = []
    resamplers: list = []

    for _ in boundaries:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_paths.append(tmp.name)
        dst = av.open(tmp.name, "w", format="wav")
        dst_containers.append(dst)
        out_st = dst.add_stream("pcm_s16le", rate=16000)
        out_st.layout = "mono"
        out_streams.append(out_st)
        resamplers.append(av.AudioResampler(format="s16", layout="mono", rate=16000))

    try:
        # Single linear decode pass — route each frame to the correct chunk.
        with av.open(audio_path) as src:
            src_stream = next((s for s in src.streams if s.type == "audio"), None)
            if src_stream is None:
                raise ValueError(f"No audio stream found in {audio_path}")

            running_pts = 0.0  # fallback for frames with no pts
            for frame in src.decode(src_stream):
                if frame.pts is not None:
                    frame_sec = float(frame.pts * src_stream.time_base)
                else:
                    frame_sec = running_pts

                # Advance running_pts by this frame's duration
                if frame.samples and src_stream.codec_context.sample_rate:
                    running_pts = frame_sec + frame.samples / src_stream.codec_context.sample_rate
                else:
                    running_pts = frame_sec

                # Find which chunk(s) this frame belongs to.
                for idx, (start_s, end_s) in enumerate(boundaries):
                    if frame_sec >= end_s:
                        continue
                    if frame_sec < start_s:
                        continue
                    for r_frame in resamplers[idx].resample(frame):
                        r_frame.pts = None
                        dst_containers[idx].mux(out_streams[idx].encode(r_frame))

        # Flush all encoders.
        for idx in range(n_chunks):
            for packet in out_streams[idx].encode(None):
                dst_containers[idx].mux(packet)

    finally:
        for dst in dst_containers:
            dst.close()

    # Collect non-empty chunks.
    chunk_paths: list[str] = []
    for idx, tmp_path in enumerate(tmp_paths):
        if os.path.getsize(tmp_path) > 44:  # 44 = WAV header size
            actual_dur = _measure_duration_pyav(tmp_path)
            chunk_paths.append(tmp_path)
            logger.info(
                "Chunk %d/%d: %.1f–%.1f s → %.2f s actual → %s",
                idx + 1,
                n_chunks,
                boundaries[idx][0],
                boundaries[idx][1],
                actual_dur,
                tmp_path,
            )
        else:
            os.unlink(tmp_path)
            logger.debug("Chunk %d/%d was empty, skipped.", idx + 1, n_chunks)

    return chunk_paths if chunk_paths else [_convert_to_wav(audio_path)]


def _measure_duration_pyav(audio_path: str) -> float:
    """
    Measure audio duration in seconds using PyAV.
    Returns 0.0 if the file cannot be opened.
    """
    try:
        import av

        with av.open(audio_path) as container:
            # Try container-level duration first (fast)
            if container.duration:
                return float(container.duration) / 1_000_000  # AV_TIME_BASE is µs
            # Fallback: inspect the first audio stream
            for stream in container.streams:
                if stream.type == "audio" and stream.duration and stream.time_base:
                    return float(stream.duration * stream.time_base)
    except Exception as e:
        logger.debug("PyAV duration probe failed for %s: %s", audio_path, e)
    return 0.0


def transcribe(audio_path: str, language: str | None = None) -> dict:
    """
    Transcribe an audio file using Sarvam AI (saaras) STT.

    Returns:
        {
            "text": str,                  # full transcript
            "segments": [...],            # chunk-level segments
            "word_timestamps": [],        # empty — Sarvam returns chunk timestamps
            "duration_seconds": float,    # from Sarvam timestamps, or probed via PyAV
        }
    """
    if not SARVAM_API_KEY:
        raise RuntimeError(
            "SARVAM_API_KEY is not set. Add it to your .env file: SARVAM_API_KEY=<your-key>"
        )

    from sarvamai import SarvamAI

    client = SarvamAI(api_subscription_key=SARVAM_API_KEY)

    # Sarvam supports webm natively; convert other exotic formats to wav first.
    audio_ext = os.path.splitext(audio_path)[1].lower().lstrip(".")
    _tmp_wav: str | None = None
    path_to_send = audio_path

    SARVAM_SUPPORTED = {
        "wav",
        "x-wav",
        "wave",
        "mp3",
        "mpeg",
        "aac",
        "aiff",
        "ogg",
        "opus",
        "flac",
        "mp4",
        "amr",
        "webm",
    }
    if audio_ext not in SARVAM_SUPPORTED:
        logger.info("Converting %s to WAV for Sarvam STT …", audio_ext)
        _tmp_wav = _convert_to_wav(audio_path)
        path_to_send = _tmp_wav

    # Probe duration up-front so we can decide whether to chunk.
    probe_path = path_to_send if _tmp_wav is None else path_to_send
    audio_duration = _measure_duration_pyav(probe_path)

    # If the audio exceeds Sarvam's 30s limit, split it into chunks.
    if audio_duration > _SARVAM_MAX_SECONDS:
        chunk_paths = _chunk_audio_pyav(probe_path, chunk_seconds=_SARVAM_MAX_SECONDS)
    else:
        chunk_paths = [probe_path]
        _tmp_wav = None  # prevent double-unlink below when path_to_send == chunk_paths[0]

    _chunk_tmps = chunk_paths if audio_duration > _SARVAM_MAX_SECONDS else []

    try:
        all_texts: list[str] = []
        all_segments: list[dict] = []
        time_offset = 0.0
        seg_id = 0
        detected_language_code: str | None = None
        detected_language_probability: float | None = None

        for chunk_idx, chunk_path in enumerate(chunk_paths):
            logger.info(
                "Sending chunk %d/%d to Sarvam STT (model=%s) …",
                chunk_idx + 1,
                len(chunk_paths),
                SARVAM_STT_MODEL,
            )
            with open(chunk_path, "rb") as audio_file:
                response = client.speech_to_text.transcribe(
                    file=audio_file,
                    model=SARVAM_STT_MODEL,
                    language_code=language or "unknown",
                    with_timestamps=True,
                )

            # Capture the detected language from the first chunk that returns one.
            # language_probability is only populated when language_code was "unknown".
            if detected_language_code is None and getattr(response, "language_code", None):
                detected_language_code = response.language_code
                detected_language_probability = getattr(response, "language_probability", None)
                logger.info(
                    "Sarvam STT detected language: %s (probability=%.2f)",
                    detected_language_code,
                    detected_language_probability
                    if detected_language_probability is not None
                    else -1.0,
                )

            chunk_text = response.transcript or ""
            all_texts.append(chunk_text)

            chunk_duration = 0.0
            if response.timestamps:
                ts = response.timestamps
                for i, chunk_word in enumerate(ts.words):
                    start = (
                        ts.start_time_seconds[i] if i < len(ts.start_time_seconds) else 0.0
                    ) + time_offset
                    end = (
                        ts.end_time_seconds[i] if i < len(ts.end_time_seconds) else 0.0
                    ) + time_offset
                    all_segments.append(
                        {"id": seg_id, "start": start, "end": end, "text": chunk_word}
                    )
                    seg_id += 1
                    if end - time_offset > chunk_duration:
                        chunk_duration = end - time_offset

            # Advance the time offset for next chunk
            if chunk_duration > 0:
                time_offset += chunk_duration
            else:
                time_offset += _measure_duration_pyav(chunk_path) or _SARVAM_MAX_SECONDS

        full_text = " ".join(t for t in all_texts if t.strip())
        duration = time_offset if time_offset > 0 else audio_duration

        # Final fallback: probe actual file for duration if everything else returned 0
        if duration == 0.0:
            duration = _measure_duration_pyav(audio_path)
            if duration > 0:
                logger.info("Duration from PyAV probe: %.2f s", duration)

        logger.info(
            "Sarvam STT complete (%d chunk(s)). Transcript length: %d chars, duration: %.2f s.",
            len(chunk_paths),
            len(full_text),
            duration,
        )
        return {
            "text": full_text,
            "segments": all_segments,
            "word_timestamps": [],
            "duration_seconds": duration,
            "language_code": detected_language_code,
            "language_probability": detected_language_probability,
        }
    finally:
        if _tmp_wav and os.path.exists(_tmp_wav):
            os.unlink(_tmp_wav)
        for cp in _chunk_tmps:
            if os.path.exists(cp):
                os.unlink(cp)
