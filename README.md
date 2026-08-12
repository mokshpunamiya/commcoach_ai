# CommCoach AI

> An AI-powered interview communication coach — record your answers, get scored on fluency, grammar, pace, filler words, and confidence, then receive personalized coaching feedback and practice with a live mock interview.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Repository Layout](#repository-layout)
3. [System Architecture](#system-architecture)
4. [Request Lifecycle — Audio Analysis](#request-lifecycle--audio-analysis)
5. [Request Lifecycle — Mock Interview](#request-lifecycle--mock-interview)
6. [Audio Transcription Pipeline (Deep Dive)](#audio-transcription-pipeline-deep-dive)
7. [Analysis Pipeline (Deep Dive)](#analysis-pipeline-deep-dive)
8. [LangGraph Orchestration](#langgraph-orchestration)
9. [Memory System](#memory-system)
10. [Database Layer](#database-layer)
11. [REST API Reference](#rest-api-reference)
12. [Frontend Architecture](#frontend-architecture)
13. [Configuration Reference](#configuration-reference)
14. [Data Contracts](#data-contracts)
15. [Scoring Formulas](#scoring-formulas)
16. [Improvement Changelog](#improvement-changelog)

---

## Quick Start

```bash
# 1. Copy and fill environment variables
cp .env.example .env
# Set SARVAM_API_KEY in .env

# 2. Install dependencies
uv sync

# 3. Start the API + React UI
uv run python main.py api
# → open http://127.0.0.1:8000
```

**Entry-point commands** (`main.py`):

| Command | What it does |
|---|---|
| `python main.py api` | Start FastAPI backend; serves React UI at `http://127.0.0.1:8000` |
| `python main.py demo` | CLI demo — analyze a WAV file from `uploads/` without a browser |
| `python main.py setup` | Check all dependencies and API keys are configured |

---

## Repository Layout

```
asignment_project/
├── main.py                   # CLI entry point
├── config.py                 # All environment config & thresholds
├── schema.py                 # Pydantic data contracts (SessionReport, etc.)
├── pyproject.toml            # Project dependencies
├── requirements.txt          # Pip-compatible dependency list
│
├── api/
│   └── main.py               # FastAPI application — all HTTP endpoints
│
├── analysis/                 # Audio/text analysis modules
│   ├── analyzer.py           # Pipeline orchestrator
│   ├── transcriber.py        # Sarvam STT + audio chunking
│   ├── grammar.py            # LanguageTool + LLM grammar scoring
│   ├── filler_words.py       # Filler word detection & scoring
│   ├── pace.py               # WPM, pause detection, fluency scoring
│   └── emotion.py            # Confidence estimation (heuristic)
│
├── graph/                    # LangGraph orchestration
│   ├── state.py              # CoachState TypedDict
│   ├── nodes.py              # Node functions (transcribe, analyze, feedback, question…)
│   ├── graph.py              # Graph topology + convenience wrappers
│   └── memory.py             # SqliteSaver checkpointer + InMemoryStore
│
├── database/
│   └── db.py                 # SQLite session history (sessions + turns tables)
│
├── frontend/
│   ├── index.html            # HTML shell — loads vendor scripts
│   └── vendor/
│       ├── app.js            # Complete React SPA (compiled vanilla JS)
│       ├── react.production.min.js
│       ├── react-dom.production.min.js
│       ├── prop-types.min.js
│       └── Recharts.js
│
├── uploads/                  # Temporary audio upload storage
├── commcoach.db              # SQLite session database
└── checkpoints.db            # LangGraph conversation checkpoints
```

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     Browser (React SPA)                          │
│                   frontend/vendor/app.js                         │
│                                                                  │
│  Page 1: Assessment   Page 2: Feedback                           │
│  Page 3: Mock Interview   Page 4: Dashboard                      │
└────────────────────────────┬─────────────────────────────────────┘
                             │  HTTP/JSON  (127.0.0.1:8000)
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                  FastAPI  —  api/main.py                         │
│                                                                  │
│  POST /analyze          POST /interview/start                    │
│  POST /analyze/text     POST /interview/answer                   │
│  GET  /sessions/{uid}   DELETE /sessions/reset/{uid}             │
│  POST /resume/parse     GET /profile/{uid}                       │
└────────────┬─────────────────────────────┬───────────────────────┘
             │                             │
             ▼                             ▼
┌────────────────────────┐     ┌───────────────────────┐
│  LangGraph Graph       │     │  SQLite DB  (db.py)    │
│  graph/graph.py        │     │                        │
│                        │     │  sessions table        │
│  retrieve_memory       │     │  turns table           │
│  → transcribe          │     │                        │
│  → analyze             │     │  Scores stored per     │
│  → generate_feedback   │     │  turn as JSON blob     │
│  → generate_question   │     └───────────────────────┘
│  → update_memory       │
└──────┬─────────────────┘
       │
       ├──────────────────────────────────────────────┐
       │                                              │
       ▼                                              ▼
┌──────────────────────┐                  ┌───────────────────────┐
│  analysis/           │                  │  Sarvam AI (Cloud)    │
│  transcriber.py      │◄────────────────►│                       │
│  grammar.py          │                  │  STT: saaras:v3       │
│  filler_words.py     │                  │  Chat: sarvam-105b    │
│  pace.py             │                  └───────────────────────┘
│  emotion.py          │
│  analyzer.py         │                  ┌───────────────────────┐
└──────────────────────┘                  │  SqliteSaver          │
                                          │  checkpoints.db       │
                                          │  (per-thread state)   │
                                          └───────────────────────┘
                                          ┌───────────────────────┐
                                          │  InMemoryStore        │
                                          │  (cross-session       │
                                          │   user profiles)      │
                                          └───────────────────────┘
```

---

## Request Lifecycle — Audio Analysis

```
User records audio in browser
         │
         │  POST /analyze  (multipart: file, user_id, interview_topic)
         ▼
api/main.py  →  analyze()
  │
  ├─ Save upload to uploads/recording.webm
  ├─ db.create_session(user_id, "analyze", topic)   → db_session_id (UUID)
  │
  └─ graph.analyze_audio_file(audio_path, user_id)
       │
       ├─ [Node: retrieve_memory]
       │    └─ retrieve_user_memory(user_id) → profile dict
       │
       ├─ [Route] action="analyze_only" → transcribe node
       │
       ├─ [Node: transcribe]
       │    └─ analysis/transcriber.transcribe(audio_path)
       │         ├─ Format check: is webm/wav/mp3/etc.?
       │         ├─ _measure_duration_pyav() → total seconds
       │         ├─ If duration > 28s → _chunk_audio_pyav()  [see below]
       │         └─ Sarvam STT API call(s) → {text, segments, duration}
       │
       ├─ [Node: analyze]
       │    └─ analysis/analyzer.analyze_with_transcript(transcript, audio_path, duration)
       │         ├─ _run_grammar()      → grammar_score, pronunciation_score
       │         ├─ detect_filler_words() → filler_hits, filler_count
       │         ├─ detect_pauses()     → pauses[], pause_count
       │         ├─ calculate_pace()    → WPM
       │         ├─ pace_score()        → 0-100
       │         ├─ fluency_score()     → 0-100
       │         ├─ approximate_confidence() → "low"|"medium"|"high"
       │         └─ overall = 0.30×fluency + 0.20×grammar + 0.15×pronun
       │                    + 0.20×filler  + 0.15×pace
       │
       ├─ [Node: generate_feedback]
       │    └─ Sarvam LLM (sarvam-105b)
       │         ├─ System prompt: CommCoach feedback format
       │         ├─ Input: session_report JSON + user profile
       │         └─ Output: markdown feedback text
       │
       └─ [Node: update_memory]
            └─ update_user_memory(user_id, report, feedback)
                 ├─ Append to score_history (last 20)
                 ├─ Identify weak areas (score < 70)
                 └─ Update trend: "improving"|"stable"|"declining"

  ← db.save_turn(db_session_id, transcript, session_report, feedback)
  ← _build_analyze_response() → shaped JSON for frontend
         │
         ▼
FeedbackPage renders:
  ScoreRing (overall), MetricCard×5, transcript tokens (fillers highlighted),
  CoachingPlan (3-week drills), PublicSpeaking sub-scores
```

---

## Request Lifecycle — Mock Interview

```
User sets up interview (type + optional resume)
         │
         │  POST /interview/start  {user_id, topic, resume_text}
         ▼
api/main.py → interview_start()
  ├─ graph.start_interview(user_id, topic, resume_text)
  │    ├─ [Node: retrieve_memory] → user profile
  │    ├─ [Route] action="start_interview" → generate_question node
  │    └─ [Node: generate_question]
  │         └─ Sarvam LLM generates first question
  │              (considering: topic, turn_count, resume, profile)
  ├─ db.create_session(user_id, "interview", topic) → db_session_id
  └─ Returns: {session_id (LangGraph), db_session_id, question}

User types/records answer to Q1  →  Q2  →  Q3  →  Q4
         │
         │  POST /interview/answer  (session_id, transcript, db_session_id)
         ▼
api/main.py → interview_answer()   [called once per question]
  └─ graph.continue_interview(session_id, transcript=answer)
       │   (checkpointer restores full conversation history from checkpoints.db)
       │
       ├─ [Node: retrieve_memory]
       ├─ [Route] action="continue_interview" → transcribe node
       ├─ [Node: transcribe]  (text-only: skip STT, keep transcript as-is)
       ├─ [Node: analyze]     → SessionReport (grammar/filler/pace on text)
       ├─ [Node: generate_feedback] → coaching feedback for this answer
       ├─ [Node: generate_question] → next question (adapts to performance)
       └─ [Node: update_memory]

  ← db.save_turn(db_session_id, turn_number, question, transcript, report, feedback)
  ← Returns: {session_report, feedback, next_question, turn_count}

After all turns collected in frontend:
  MockInterviewPage → handleInterviewFinish()
    ├─ Compute per-metric averages from all scoredLog entries
    ├─ Map confidence_level text → number (low=40, medium=65, high=85)
    └─ Add summary entry to history state → Dashboard
```

---

## Audio Transcription Pipeline (Deep Dive)

```
transcribe(audio_path)                         [analysis/transcriber.py]
│
├─ Step 1: Format check
│    SARVAM_SUPPORTED = {wav, mp3, aac, ogg, opus, flac, mp4, amr, webm, …}
│    if ext NOT in set:
│       _convert_to_wav(audio_path)
│            └─ PyAV: decode → resample to 16 kHz mono PCM → temp .wav
│
├─ Step 2: Duration probe
│    _measure_duration_pyav(path)
│         ├─ Try: container.duration / 1_000_000  (fast, microseconds)
│         └─ Fallback: stream.duration × stream.time_base
│
├─ Step 3: Chunking decision
│    _SARVAM_MAX_SECONDS = 28  (Sarvam hard limit = 30s)
│
│    if total_duration <= 28s:
│       chunk_paths = [original_file]   → 1 API call
│
│    if total_duration > 28s:
│       _chunk_audio_pyav(path, chunk_seconds=28)
│       └─ see diagram below
│
└─ Step 4: Send each chunk to Sarvam STT
     for chunk_idx, chunk_path in enumerate(chunk_paths):
       │
       ├─ Sarvam API: POST speech-to-text
       │    model=saaras:v3, language_code="unknown", with_timestamps=True
       │    → {transcript, timestamps:{words[], start_time_seconds[], end_time_seconds[]}}
       │
       ├─ Accumulate chunk_text into all_texts[]
       ├─ Offset chunk timestamps by time_offset (running sum of prior chunks)
       └─ time_offset += chunk_duration (from Sarvam timestamps) or PyAV probe
     │
     └─ Return {
          text: joined transcript,
          segments: all word segments with absolute timestamps,
          duration_seconds: total duration
        }
```

### Audio Chunking — `_chunk_audio_pyav()` (linear pass, no seeking)

```
_chunk_audio_pyav(audio_path, chunk_seconds=28)
│
├─ Probe total duration via _measure_duration_pyav()
│
├─ Compute n_chunks = ceil(total / 28)
│   Example: 65s audio → n_chunks = 3
│   boundaries = [(0,28), (28,56), (56,65)]
│
├─ Pre-create N output WAV files + encoders + resamplers simultaneously
│   for each boundary:
│     temp.wav → av.open("w") → add_stream("pcm_s16le", rate=16000, layout=mono)
│                             → AudioResampler(s16, mono, 16000)
│
├─ SINGLE LINEAR DECODE PASS (no seeking — critical for WebM/Opus correctness)
│   av.open(audio_path) as src:
│     for frame in src.decode(audio_stream):
│       │
│       ├─ frame_sec = frame.pts × stream.time_base   (or running_pts fallback)
│       ├─ running_pts += frame.samples / sample_rate  (advance accumulator)
│       │
│       └─ Route frame to matching chunk(s):
│            for idx, (start_s, end_s) in enumerate(boundaries):
│              if start_s <= frame_sec < end_s:
│                resamplers[idx].resample(frame) → resampled_frame
│                out_streams[idx].encode(resampled_frame) → packets
│                dst_containers[idx].mux(packets)
│
├─ Flush all encoders (encode(None)) and close all containers
│
└─ Filter out empty chunks (size ≤ 44 bytes = WAV header only)
   Return list of temp WAV paths

WHY NO SEEKING:
  WebM/Opus keyframes can be seconds apart. If you seek(28s), PyAV jumps
  to the nearest keyframe which may be at e.g. 22s, and all frames from
  22s to EOF get written into the "chunk 2" file — making it 43s long
  and triggering Sarvam's 30s limit again. Linear pass avoids this entirely.
```

---

## Analysis Pipeline (Deep Dive)

```
analyze_with_transcript(transcript, audio_path, duration_seconds)
                                                   [analysis/analyzer.py]
│
├─ 1. Grammar + Pronunciation  →  _run_grammar(transcript, word_count)
│       │
│       ├─ if LanguageTool (Java) available:
│       │    check_grammar(text)                  [analysis/grammar.py]
│       │      └─ LanguageTool.check(text) → GrammarIssue[]
│       │    grammar_score(issue_count, word_count)
│       │      └─ base=100, penalty = issue_count/word_count × 1000 (capped 0-100)
│       │    pronunciation_score = grammar_score (mirrors)
│       │
│       └─ if no Java (fallback):
│            score_grammar_llm(transcript)         [analysis/grammar.py]
│              └─ Sarvam LLM prompt:
│                   "Rate grammar 0-100, pronunciation 0-100, list issues"
│                   → JSON: {grammar: int, pronunciation: int, issues: []}
│
├─ 2. Filler Words  →  detect_filler_words(transcript, word_timestamps)
│       │                                          [analysis/filler_words.py]
│       ├─ FILLER_WORDS set from config.py:
│       │    {um, uh, like, basically, actually, you know, i mean,
│       │     sort of, kind of, right, so, okay, literally, …}
│       ├─ Case-insensitive regex scan of transcript
│       ├─ Returns FillerWordHit[] (word, count, positions)
│       │
│       └─ filler_score(filler_count, duration_seconds)
│              rate = filler_count / (duration / 60)  (fillers per minute)
│              score = 100 - (rate × 8)  (capped 0-100)
│              0/min → 100,  5/min → ~60,  12+/min → 0
│
├─ 3. Pace & Pauses                                [analysis/pace.py]
│       │
│       ├─ calculate_pace(word_count, duration) → WPM
│       │
│       ├─ detect_pauses(audio_path)
│       │    ├─ _load_audio_numpy(audio_path)
│       │    │    ├─ Try: soundfile.read()   (fast)
│       │    │    └─ Fallback: PyAV decode → numpy
│       │    ├─ Compute RMS energy per 20ms frame
│       │    ├─ Silence threshold = 15% of mean RMS
│       │    ├─ Find contiguous silent regions ≥ PAUSE_THRESHOLD_SEC (0.5s)
│       │    └─ Returns (pauses[], pause_count)
│       │
│       ├─ get_long_pauses(pauses) → pauses ≥ LONG_PAUSE_THRESHOLD_SEC (1.5s)
│       │
│       └─ pace_score(wpm)
│              120–160 WPM → 100
│              < 120 WPM  → reduced (slow)
│              > 160 WPM  → reduced (fast)
│              0 WPM      → 0
│
├─ 4. Fluency Score (composite)
│       fluency_score(pa_score, f_score, pause_count, duration, long_pause_count)
│         pause_rate   = pause_count / (duration / 60)
│         pause_penalty = max(0, pause_rate - 3) × 3   (first 3/min free)
│         long_penalty  = long_pause_count × 5
│         base = 0.35×pace + 0.40×filler + 0.25×100
│         return max(0, base - pause_penalty - long_penalty)
│
├─ 5. Confidence (heuristic)
│       approximate_confidence(wpm, pause_count, duration, filler_count)
│                                                  [analysis/emotion.py]
│         score = 50 (base)
│         + pace component:
│             120–160 WPM → +15
│             90–180 WPM  → +5
│             extreme      → -25
│         + pause component:
│             < 6/min     → +8
│             6–12/min    → neutral
│             12–20/min   → -10
│             > 20/min    → -20
│         + filler component:
│             0–2/min     → +8
│             2–5/min     → -5
│             5–10/min    → -15
│             > 10/min    → -25
│         → ≥68: "high"  |  ≥40: "medium"  |  <40: "low"
│
└─ 6. Overall Score

       When a real interview question is provided (mock interview):
         overall = 0.35 × answer_relevancy_score   ← LLM-judged vs actual question
                 + 0.20 × fluency_score
                 + 0.15 × grammar_score
                 + 0.15 × filler_score
                 + 0.10 × pronunciation_score
                 + 0.05 × pace_score

       When no real question (assessment / free speech):
         overall = 0.30 × fluency_score
                 + 0.25 × grammar_score
                 + 0.20 × filler_score
                 + 0.15 × pronunciation_score
                 + 0.10 × pace_score
         (relevancy is skipped — a bare topic label like "HR" is not a valid ground truth)
```

---

## LangGraph Orchestration

```
graph/graph.py  →  build_graph()
                                 ┌─────────────────────┐
                                 │    START             │
                                 └──────────┬──────────┘
                                            │
                                 ┌──────────▼──────────┐
                                 │  retrieve_memory    │  Always runs first.
                                 │  (graph/nodes.py)   │  Loads user profile
                                 └──────────┬──────────┘  from InMemoryStore.
                                            │
                                  conditional edge: route_action(state)
                              ┌─────────────┼──────────────┐
                              │             │              │
                    "analyze_only"  "start_interview"  "continue_interview"
                              │             │              │
                    ┌─────────▼──┐ ┌────────▼────┐ ┌──────▼──────────┐
                    │ transcribe │ │  generate_  │ │   transcribe    │
                    │  (STT or   │ │  question   │ │  (text-only     │
                    │  text-skip)│ │  (LLM)      │ │  or STT)        │
                    └─────────┬──┘ └────────┬────┘ └──────┬──────────┘
                              │             │              │
                    ┌─────────▼──┐          │     ┌────────▼────────┐
                    │  analyze   │          │     │    analyze      │
                    │ (pipeline) │          │     │   (pipeline)    │
                    └─────────┬──┘          │     └────────┬────────┘
                              │             │              │
                    ┌─────────▼──────────────────────────▼────────┐
                    │              generate_feedback               │
                    │         (Sarvam LLM → coaching text)        │
                    └──────────────────────┬──────────────────────┘
                              │            │
                  "analyze_only"    "continue_interview"
                              │            │
                    ┌─────────▼──┐ ┌───────▼──────────┐
                    │  update_   │ │  generate_       │
                    │  memory    │ │  question (LLM)  │
                    └─────────┬──┘ └───────┬──────────┘
                              │            │
                              │   ┌────────▼──────┐
                              │   │ update_memory │
                              │   └────────┬──────┘
                              │            │
                              └──────┬─────┘
                                     ▼
                                    END


State object  (graph/state.py — CoachState TypedDict):
┌─────────────────────────────────────────────────────┐
│ messages         list[BaseMessage]  (auto-appended) │
│ user_id          str                                │
│ session_id       str  (LangGraph thread ID)         │
│ action           "analyze_only"|"start_interview"   │
│                  |"continue_interview"               │
│ audio_path       str | None                         │
│ transcript       str | None                         │
│ duration_seconds float | None                       │
│ session_report   SessionReport | None               │
│ feedback         str | None                         │
│ current_question str | None                         │
│ interview_topic  str | None                         │
│ resume_text      str | None                         │
│ turn_count       int                                │
│ user_memory      dict  (long-term profile)          │
│ error            str | None                         │
└─────────────────────────────────────────────────────┘
```

---

## Memory System

There are **three distinct memory scopes**, each with a different lifetime and purpose.

### Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        MEMORY LAYERS                            │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Layer 3 — Long-term  (SqliteProfileStore → commcoach.db)│   │
│  │  Scope: user_id  →  persists across ALL sessions         │   │
│  │  Lifetime: survives server restarts (written to disk)    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                            ▲                                    │
│                            │  update_user_memory() called       │
│                            │  at end of every session           │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Layer 2 — Session  (SqliteSaver → checkpoints.db)       │   │
│  │  Scope: thread_id  →  one interview conversation         │   │
│  │  Lifetime: survives server restarts (written to disk)    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                            ▲                                    │
│                            │  auto-managed by LangGraph         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Layer 1 — Ephemeral  (CoachState, in-memory dict)       │   │
│  │  Scope: single graph.invoke() call                       │   │
│  │  Lifetime: one HTTP request                              │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

### Layer 1 — Ephemeral State (`CoachState`)

`graph/state.py` defines `CoachState` as a `TypedDict`. A fresh instance is produced on every `graph.invoke()` call and lives only for the duration of that HTTP request.

Each node receives the full state dict and **returns only the fields it changed**. LangGraph merges those partial updates back into the state before calling the next node.

The one exception is `messages`, which uses the special `add_messages` reducer:

```python
messages: Annotated[list[BaseMessage], add_messages]
```

Instead of replacing the list, `add_messages` **appends** new messages to whatever was already there. This is how conversation turns accumulate automatically — each node that calls `_sarvam_chat()` appends its output as an `AIMessage`, and the checkpointer saves the growing list between turns.

```
graph.invoke({...}, thread_id="interview-abc")
        │
        ▼
  CoachState (fields filled node-by-node during this call)
  {
    messages,          ← accumulated by add_messages reducer
    transcript,        ← filled by transcribe_node
    session_report,    ← filled by analyze_node
    feedback,          ← filled by generate_feedback_node
    current_question,  ← filled by generate_question_node
    user_memory,       ← injected at start by retrieve_memory_node
    turn_count,        ← incremented by generate_question_node
    error,             ...
  }
```

---

### Layer 2 — Session Memory (SqliteSaver → `checkpoints.db`)

Initialised once as a singleton in `graph/memory.py`:

```python
_conn = sqlite3.connect(str(CHECKPOINT_DB_PATH), check_same_thread=False)
_checkpointer = SqliteSaver(_conn)
```

LangGraph automatically reads and writes it around every `graph.invoke()` call — no manual code needed:

```
graph.invoke(state, config={"configurable": {"thread_id": "interview-abc123"}})
        │
        ├─ BEFORE first node:
        │    checkpointer.get("interview-abc123")
        │    → loads prior CoachState snapshot from checkpoints.db
        │    → merges with the provided initial_state
        │      (add_messages appends new messages onto the restored list)
        │
        ├─ AFTER every node:
        │    checkpointer.put("interview-abc123", current_state)
        │    → writes full CoachState snapshot to checkpoints.db
        │
        └─ Result: same thread_id = same conversation, automatically
```

**What this enables — multi-turn interview continuity:**

```
Turn 1:  graph.invoke({action:"start_interview"}, thread_id="interview-abc")
           → generate_question runs → Q1 saved to state + checkpoints.db
           → returns {current_question: "Tell me about yourself"}

Turn 2:  graph.invoke({action:"continue_interview", transcript:"I am…"}, thread_id="interview-abc")
           ← checkpointer restores: messages=[Q1], turn_count=1, interview_topic="HR"
           → analyze runs on Turn 2's answer
           → generate_question sees full history → generates Q2 that adapts to Q1's answer
           → turn_count is now 2 (from restored value, not reset to 0)
```

The frontend stores the LangGraph `session_id` returned by `/interview/start` and passes it back in every `/interview/answer` call as the `session_id` form field.

**Critical distinction — two separate IDs:**

```
LangGraph thread_id  ("interview-uuid-A")  → used ONLY for checkpointer continuity
DB db_session_id     ("uuid-B")            → used ONLY for commcoach.db turn storage

These are DIFFERENT UUIDs. Mixing them up causes turns to be saved
under an ID that no session row matches → sessions show 0 scores on
the dashboard. The /interview/start endpoint returns both explicitly:
  { "session_id": langgraph_id, "db_session_id": db_uuid }
```

---

### Layer 3 — Long-term User Memory (InMemoryStore)

Crosses session boundaries entirely. Stored in a `langgraph.store.memory.InMemoryStore` singleton, namespaced by user:

```python
def _user_namespace(user_id: str) -> tuple[str, str]:
    return ("user_profile", user_id)      # e.g. ("user_profile", "default_user")
```

**Data flows in and out of every session:**

```
START OF SESSION
────────────────
retrieve_memory_node  (always the first node in the graph)
  └─ retrieve_user_memory(user_id)
       └─ store.get(("user_profile", user_id), "profile")
            → profile dict (or _default_profile() for new users)
            → written into CoachState.user_memory

  CoachState.user_memory is then read by:
    • generate_feedback_node  → LLM receives weak areas, trend, last feedback
    • generate_question_node  → LLM avoids repeating Q types, probes weak areas

END OF SESSION
──────────────
update_memory_node  (always the last node, runs after feedback)
  └─ update_user_memory(user_id, session_report, feedback)
       ├─ Append score_entry to score_history (capped at last 20)
       ├─ Identify weak_areas: add any metric < 70 to the set
       │    fluency_score < 70  → add "fluency"
       │    grammar_score < 70  → add "grammar"
       │    pace_score < 70     → add "pace"
       │    filler_score < 70   → add "filler_words"
       ├─ Increment total_sessions
       ├─ Update last_session timestamp
       ├─ Store latest_feedback (first 500 chars)
       ├─ Compute trend:
       │    avg(last 5 entries) vs avg(all older entries)
       │    Δ > +2  → "improving"
       │    Δ < -2  → "declining"
       │    else    → "stable"
       └─ store.put(("user_profile", user_id), "profile", updated_profile)
```

**Full profile shape:**

```python
{
  "score_history": [           # last 20 sessions, oldest first
    {
      "timestamp":     "2026-08-10T09:00:00+00:00",
      "overall_score": 82.0,
      "fluency_score": 87.0,
      "grammar_score": 92.0,
      "pace_score":    94.0,
      "filler_score":  78.0,
    },
    # … up to 19 more entries
  ],
  "weak_areas":      ["grammar", "filler_words"],  # metrics that scored < 70
  "total_sessions":  5,
  "first_session":   "2026-08-10T06:00:00+00:00",
  "last_session":    "2026-08-10T09:00:00+00:00",
  "trend":           "improving",                  # new|improving|stable|declining
  "latest_feedback": "## Overall Assessment\n…",  # first 500 chars of last feedback
  "notes":           "",
}
```

**Important limitation:** `InMemoryStore` lives in process RAM only. It is lost on server restart. The SqliteSaver checkpoints survive restarts. This asymmetry is intentional — per-conversation continuity is critical (must survive restarts), coaching profile is best-effort.

---

### Complete State Handoff — One `/interview/answer` Call

```
HTTP POST /interview/answer
  session_id    = "interview-abc123"   (LangGraph thread_id)
  db_session_id = "uuid-xxxx"          (commcoach.db FK)
  transcript    = "My answer…"
        │
        ▼
graph.invoke({action:"continue_interview", transcript:"My answer…"},
             thread_id="interview-abc123")
        │
        │  checkpointer restores CoachState from checkpoints.db:
        │  ← messages:         [Q1, A1-feedback, Q2, A2-feedback, Q3]
        │  ← turn_count:       3
        │  ← interview_topic:  "Technical"
        │  ← current_question: "Q3 text"
        │
        ▼
[retrieve_memory_node]
  user_memory = store.get(("user_profile","default_user"), "profile")
  CoachState.user_memory = {weak_areas:["grammar"], trend:"improving", …}
        │
        ▼
[transcribe_node]
  transcript already in state (text answer) → skip STT, return {error:None}
        │
        ▼
[analyze_node]
  uses: transcript + audio_path + duration_seconds
  sets: CoachState.session_report = {fluency:87, grammar:92, pace:94, …}
        │
        ▼
[generate_feedback_node]
  uses: session_report + user_memory (weak_areas, trend, last_feedback)
  calls Sarvam LLM → personalized coaching text
  sets: CoachState.feedback = "## Overall…"
  sets: CoachState.messages += [AIMessage(feedback)]   ← add_messages appends
        │
        ▼
[generate_question_node]   (continue_interview path)
  uses: messages (full history) + user_memory.weak_areas + resume_text
  calls Sarvam LLM → next question that adapts to conversation so far
  sets: CoachState.current_question = "Q4 text"
  sets: CoachState.turn_count = 4
  sets: CoachState.messages += [AIMessage(Q4)]         ← add_messages appends
        │
        ▼
[update_memory_node]
  reads: session_report + feedback
  writes to InMemoryStore: appends scores, recomputes trend, saves weak_areas
        │
        │  checkpointer writes updated CoachState snapshot to checkpoints.db
        │
        ▼
API returns {session_report, feedback, next_question:"Q4 text", turn_count:4}
  └─ db.save_turn(db_session_id="uuid-xxxx", turn_number=4, …)
```

---

### Memory Layer Comparison

| Layer | What is stored | Where | Scope | Survives server restart? |
|---|---|---|---|---|
| **Ephemeral** (`CoachState`) | transcript, scores, feedback for current call | In-memory dict | Single `graph.invoke()` | No |
| **Session** (`SqliteSaver`) | Full `CoachState` snapshot incl. all `messages` | `checkpoints.db` | Per `thread_id` (one interview) | **Yes** |
| **Long-term** (`SqliteProfileStore`) | Score history, weak areas, trend | `commcoach.db` (profiles table) | Per `user_id` across all sessions | **Yes** |
| **DB turns** (`commcoach.db`) | Structured scores per turn for Dashboard display | SQLite on disk | Per `db_session_id` | **Yes** |

---

## Database Layer

```
database/db.py  →  commcoach.db  (SQLite)

CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,   -- UUID generated by create_session()
  user_id     TEXT NOT NULL,
  type        TEXT NOT NULL,      -- 'analyze' | 'interview'
  topic       TEXT,
  created_at  TEXT NOT NULL,      -- ISO 8601 UTC
  updated_at  TEXT NOT NULL
);

CREATE TABLE turns (
  id             TEXT PRIMARY KEY,  -- UUID
  session_id     TEXT NOT NULL,     -- FK → sessions.id
  turn_number    INTEGER NOT NULL,
  question       TEXT,              -- Interview question (NULL for analyze sessions)
  transcript     TEXT,              -- User's spoken/typed answer
  session_report TEXT,              -- Full SessionReport as JSON blob
  feedback       TEXT,              -- Raw LLM coaching text
  created_at     TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

Key design rule:
  db.create_session() returns a new UUID (db_session_id).
  This UUID must be passed to db.save_turn(session_id=db_session_id).
  The LangGraph thread_id is SEPARATE — used only for checkpointer continuity.
  Mixing them up = orphaned turns (sessions with 0 scores in dashboard).

/sessions/{user_id} endpoint enrichment:
  For each session, GET all turns and average session_report fields:
    overall_score, fluency_score, grammar_score, pronunciation_score,
    pace_score, filler_word_count, confidence_level → confidence number
  Sessions with no turns show 0 for all metrics.
```

---

## REST API Reference

Rate limits (enforced via `slowapi`): `10/minute` on `/analyze` and `/analyze/stream`; `20/minute` on interview and text-analyze endpoints; `200/hour` global default.

| Method | Path | Body / Params | Rate limit | Returns |
|---|---|---|---|---|
| `GET` | `/health` | — | — | `{service, status, version}` |
| `GET` | `/` | — | — | `index.html` |
| `POST` | `/analyze` | `file` (audio), `user_id`, `interview_topic` | 10/min | Analyze response (see below) |
| `POST` | `/analyze/stream` | `file` (audio), `user_id`, `interview_topic` | 10/min | NDJSON stream of `{status}` events + final payload |
| `POST` | `/analyze/text` | `{user_id, transcript, interview_topic}` | 20/min | Analyze response |
| `POST` | `/interview/start` | `{user_id, topic, resume_text?}` | 20/min | `{session_id, db_session_id, question, turn_count, user_profile}` |
| `POST` | `/interview/answer` | `session_id`, `user_id`, `file?`, `transcript?`, `db_session_id?` | 20/min | `{session_report, feedback, next_question, turn_count, error?}` |
| `GET` | `/sessions/{user_id}` | — | — | `{sessions: [{id, type, topic, created_at, overall, fluency, grammar, …}]}` |
| `GET` | `/session/{session_id}` | — | — | `{session_id, turns[], graph_state}` |
| `GET` | `/profile/{user_id}` | — | — | `{user_id, profile}` |
| `DELETE` | `/sessions/reset/{user_id}` | — | — | `{deleted_sessions, user_id}` |
| `POST` | `/resume/parse` | `file` (PDF/DOCX/TXT) | — | `{text, headline, summary, skills[]}` |

**Analyze response shape** (`_build_analyze_response`):
```json
{
  "session_id": "uuid",
  "transcript": "raw text",
  "transcript_tokens": [{"t": "word", "f": true}, …],
  "session_report": { /* full SessionReport JSON */ },
  "feedback_raw": "## Overall Assessment\n…",
  "feedback": {
    "fluency": 87, "grammar": 92, "pronunciation": 78,
    "confidence": 85, "emotion": "Calm and steady",
    "pace": 94, "paceNote": "Good pace (143 WPM)",
    "wpm": 143, "overall": 88,
    "fillers": 2, "fillersPerMinute": 1.2,
    "summary": "Solid answer — a little polish on delivery.",
    "publicSpeaking": {"storytelling": 82, "audienceEngagement": 78, "presentationFlow": 85},
    "coachingPlan": {"focusArea": "…", "notes": [], "drills": []}
  },
  "error": null
}
```

---

## Frontend Architecture

### Source files

| File | Role |
|---|---|
| `frontend/vendor/app.js` | **Single source of truth for all UI logic.** Vanilla `React.createElement` — edit this file directly to update the UI. No npm, no webpack, no Babel required. |
| `frontend/index.html` | Shell page. Loads vendor scripts from `/static/vendor/` and mounts the React app into `#root` via `app.js`. Served by FastAPI at `GET /`. |
| `frontend/app.py` | Separate **Streamlit** dashboard (alternative UI). Runs independently via `streamlit run frontend/app.py` and calls the same FastAPI backend. Does **not** use `app.js`. |

### Component tree

```
frontend/vendor/app.js  (loaded by index.html at GET /)

CommCoachApp  (root)
│  State: page(1-4), resume, history[], interviewSessions[], currentSession
│
├─ Header
│    └─ Logo + "Powered by Sarvam AI" badge
│
├─ Stepper
│    └─ Steps: Assessment → Feedback → Mock Interview → Dashboard
│
├─ Page 1: AssessmentPage
│    ├─ ResumeUpload (optional PDF/DOCX upload → POST /resume/parse)
│    ├─ Language selector (auto-detect or manual; populated from GET /languages)
│    ├─ Interview type selector (HR / Technical / Behavioral / Product)
│    ├─ Practice mode selector (Analyze Audio / Mock Interview)
│    │
│    └─ Audio Source (only for "Analyze Audio" mode):
│         ├─ Live Record tab
│         │    └─ MediaRecorder API → 3-min limit → webm blob
│         ├─ Upload File tab
│         │    └─ Drag-drop audio/video → FormData → POST /analyze
│         └─ Sample tab
│              └─ Mock transcript → POST /analyze/text
│
├─ Page 2: FeedbackPage
│    ├─ ScoreRing (SVG circle, animated, color-coded by range)
│    ├─ MetricCard×5 (fluency, grammar, pronunciation, confidence, pace)
│    ├─ Transcript display with filler-word highlighting
│    ├─ PublicSpeaking radar-style display
│    └─ CoachingPlan: focus area + notes[] + drills[]
│
├─ Page 3: MockInterviewPage
│    Phases: "setup" → "interview" → "evaluating" → "results"
│    │
│    ├─ setup phase:
│    │    ├─ Topic / type / resume toggle
│    │    └─ POST /interview/start → first question
│    │
│    ├─ interview phase (4 questions):
│    │    ├─ Display current question
│    │    ├─ Text answer textarea OR microphone recording
│    │    ├─ All answers collected first — no API calls mid-interview
│    │    └─ Progress bar (Q1/4 → Q4/4)
│    │
│    ├─ evaluating phase:
│    │    └─ Batch POST /interview/answer for each Q+A pair sequentially
│    │
│    └─ results phase:
│         ├─ Per-question breakdown (question, answer, score, feedback)
│         ├─ Average score across all questions
│         └─ Save & view dashboard button
│
└─ Page 4: DashboardPage
     ├─ Stat cards: Sessions, Streak, Avg Score, Avg Grammar, Interviews, Badges
     ├─ Progress trends (Recharts LineChart: fluency/grammar/pronunciation/confidence)
     ├─ Confidence trend (Recharts AreaChart)
     ├─ Interview analytics (Recharts BarChart: avg score by type)
     ├─ Achievements (badge chips computed from history)
     ├─ Session history list (reversed, score colored by range)
     └─ Reset history button (confirmation modal → DELETE /sessions/reset/default_user)

useEffect on mount:
  fetch /sessions/default_user
    → populate history[] with real scores from DB
    → empty state → "No sessions yet" with CTA button
```

---

## Configuration Reference

All settings live in `config.py` and are loaded from `.env`:

| Variable | Default | Description |
|---|---|---|
| `SARVAM_API_KEY` | — | **Required.** Sarvam AI subscription key |
| `SARVAM_MODEL` | `sarvam-105b` | Chat/LLM model for feedback + questions |
| `SARVAM_STT_MODEL` | `saaras:v3` | Speech-to-text model |
| `LLM_PROVIDER` | `sarvam` | `sarvam` or `openai` |
| `OPENAI_API_KEY` | — | OpenAI key (if `LLM_PROVIDER=openai`) |
| `OPENAI_MODEL` | `gpt-4o-mini` | OpenAI model |
| `WHISPER_MODEL_SIZE` | `base` | faster-whisper model (legacy fallback) |
| `WHISPER_DEVICE` | `cpu` | `cpu` or `cuda` |
| `IDEAL_WPM_MIN` | `120` | Lower bound of ideal speaking pace |
| `IDEAL_WPM_MAX` | `160` | Upper bound of ideal speaking pace |
| `PAUSE_THRESHOLD_SEC` | `0.5` | Minimum silence to count as a pause |
| `LONG_PAUSE_THRESHOLD_SEC` | `1.5` | Pause length considered "long" |
| `API_HOST` | `127.0.0.1` | Bind address for uvicorn |
| `API_PORT` | `8000` | Port for uvicorn |

---

## Data Contracts

### `SessionReport` (schema.py)

```python
class SessionReport(BaseModel):
    transcript:           str
    word_count:           int
    duration_seconds:     float
    words_per_minute:     float
    pause_count:          int
    long_pauses:          list[PauseInfo]
    filler_words:         list[FillerWordHit]
    filler_word_count:    int
    filler_word_rate:     float          # fillers per minute
    grammar_issues:       list[GrammarIssue]
    grammar_issue_count:  int
    fluency_score:        float          # 0–100
    grammar_score:        float          # 0–100
    pronunciation_score:  float          # 0–100
    pace_score:           float          # 0–100
    filler_score:         float          # 0–100
    overall_score:        float          # 0–100
    emotion:              EmotionInfo | None
    confidence_level:     str | None     # "low"|"medium"|"high"
    llm_grammar_issues:   list[str]      # LLM-identified issues (no Java path)
```

### Supporting types

```python
class FillerWordHit(BaseModel):
    word:       str
    count:      int
    timestamps: list[float]

class GrammarIssue(BaseModel):
    message:    str
    category:   str
    offset:     int
    length:     int
    suggestion: str

class PauseInfo(BaseModel):
    start:    float
    end:      float
    duration: float

class EmotionInfo(BaseModel):
    label:      str
    confidence: float
```

---

## Scoring Formulas

### Overall Score

The overall score uses **context-aware weighting**. Answer Relevancy is the highest-weight signal, but only when a real interview question is available as ground truth. A bare topic label (`"HR"`, `"Technical"`) is not sufficient — the LLM would have no meaningful question to judge against.

**A "real question" is defined as `len(question.split()) >= 3`** — this catches questions like "Tell me about yourself" (4 words) while excluding bare topic labels like `"HR"` (1 word). Previously the threshold was `> 4`, which caused most short standard interview questions to be silently skipped, leaving scores unrealistically high.

**Mock Interview** (real LLM-generated question present — `len(question.split()) >= 3`):

| Metric | Weight | Notes |
|---|---|---|
| Answer Relevancy | **35%** | LLM judges how directly the transcript addresses the question |
| Fluency | 20% | Composite of pace + pauses + fillers |
| Grammar | 15% | LanguageTool or LLM scorer |
| Filler Words | 15% | Penalises high filler-per-minute rate |
| Pronunciation | 10% | LLM articulateness score |
| Pace | 5% | Distance from 120–160 WPM ideal |

**Assessment / Free Speech** (no real question — relevancy skipped entirely):

| Metric | Weight | Notes |
|---|---|---|
| Fluency | **30%** | Composite of pace + pauses + fillers |
| Grammar | 25% | |
| Filler Words | 20% | |
| Pronunciation | 15% | |
| Pace | 10% | |

**Text-only Mock Interview** (typed answer, real question present):

| Metric | Weight | Notes |
|---|---|---|
| Answer Relevancy | **50%** | Dominant signal — no audio metrics available |
| Grammar | 30% | |
| Filler Words | 20% | |

**Text-only, No Question** (sample/demo text path):

| Metric | Weight | Notes |
|---|---|---|
| Grammar | **60%** | |
| Filler Words | 40% | |

### Pace Score (WPM → 0-100)
```
120–160 WPM → 100
< 120 WPM   → 100 - ((120 - wpm) / 120 × 100)    (slow penalty)
> 160 WPM   → 100 - ((wpm - 160) / 160 × 100)    (fast penalty)
0 WPM       → 0
```

### Filler Score
```
rate  = filler_count / (duration_seconds / 60)
score = max(0, 100 - rate / 25 × 100)

0 fillers/min  → 100
5 fillers/min  → ~80
10 fillers/min → ~60
25+ fillers/min → 0 (floor)
```

### Grammar Score (LanguageTool path)
```
short_penalty = min(1.0, word_count / 10.0)   ← NEW: caps score for short answers
density       = issue_count / word_count
score         = max(0, 100 × short_penalty × (1 - density × 8))

Examples:
  3-word answer,  0 issues → max achievable = 30  (short_penalty = 0.3)
  5-word answer,  0 issues → max achievable = 50  (short_penalty = 0.5)
 10-word answer,  0 issues → 100  (short_penalty = 1.0, uncapped)
 20-word answer,  1 issue  → 100 × 1.0 × (1 - 0.05 × 8) = 60
```

**LLM scorer fallback** (used when LanguageTool / Java is unavailable):
```
fallback_grammar = min(75, max(10, word_count × 5))

3-word answer  → fallback = 15  (not 75)
5-word answer  → fallback = 25
15-word answer → fallback = 75  (capped)
```

**Relevancy scorer fallback:** returns `0` (not `75`) on API error or timeout, so network failures do not inflate scores.

### Fluency Score
```
pause_rate    = pause_count / (duration_seconds / 60)
pause_penalty = max(0, pause_rate - 3) × 3
long_penalty  = long_pause_count × 5
base          = 0.35 × pace_score + 0.40 × filler_score + 0.25 × 100
fluency       = max(0, base - pause_penalty - long_penalty)
```

### Confidence Heuristic
```
score = 50  (base)

Pace bonus/penalty:
  120–160 WPM          → +15
  90–120 or 160–180    → +5
  < 90 or > 180        → -25

Pause bonus/penalty (per minute):
  < 6/min              → +8
  6–12/min             → ±0
  12–20/min            → -10
  > 20/min             → -20

Filler bonus/penalty (per minute):
  0–2/min              → +8
  2–5/min              → -5
  5–10/min             → -15
  > 10/min             → -25

Thresholds:
  ≥ 68 → "high"
  ≥ 40 → "medium"
  < 40 → "low"
```

---

*Built with Sarvam AI (STT + LLM), LangGraph, FastAPI, and React.*

---

## Improvement Changelog

This section documents every improvement applied to the codebase after the initial implementation. Each entry describes the problem, the fix, and the impacted file(s).

---

### #1 — Parallelised Analysis Pipeline
**File:** `analysis/analyzer.py`  
**Problem:** `_run_grammar` (1–3 s LLM call), `detect_filler_words` (<1 ms), and `detect_pauses` (200–800 ms) ran sequentially even though they share no outputs.  
**Fix:** Both `analyze_audio` and `analyze_with_transcript` now run all three in a `ThreadPoolExecutor(max_workers=3)` concurrently. Steps 5–7 (fluency, confidence, overall) correctly remain sequential as they depend on all three outputs.  
**Impact:** ~40% reduction in analysis wall-clock time (~3.5 s → ~2 s).

---

### #2 / #10 — SQLite-backed User Profile Store
**File:** `graph/memory.py`  
**Problem:** `InMemoryStore` held coaching profiles in process RAM only. Every server restart wiped all user profiles, weak areas, score history, and trend data — even though `SqliteSaver` session checkpoints survived.  
**Fix:** Replaced `InMemoryStore` with a new `SqliteProfileStore` class backed by a `profiles` table in `commcoach.db`. The table is created on first use (`CREATE TABLE IF NOT EXISTS`). All `get` / `put` operations use a threading lock for safety. `get_store()` returns the SQLite-backed store; `graph/graph.py` no longer passes `store=` to `compile()` since profiles are accessed directly via helper functions.  
**Impact:** Coaching profiles, weak areas, session count, and trend survive server restarts permanently.

---

### #3 — Upload File Cleanup
**Files:** `api/main.py` (`/analyze`, `/analyze/stream`, `/interview/answer`)  
**Problem:** Every uploaded audio file was written to `uploads/` and never deleted, accumulating GBs over time.  
**Fix:** All three endpoints that save files now wrap the processing in a `try/finally` block and call `file_path.unlink(missing_ok=True)` in the `finally` clause — guaranteed deletion on success, error, and cancellation alike.  
**Impact:** `uploads/` stays empty under normal operation; no disk accumulation.

---

### #4 — Parallel Feedback + Question Generation
**File:** `graph/graph.py`  
**Problem:** In the `continue_interview` path, `generate_feedback` and `generate_question` ran sequentially (two sequential Sarvam LLM calls, ~2–5 s + ~1–3 s = 4–8 s per turn).  
**Fix:** The conditional edge out of `analyze` now returns `["generate_feedback", "generate_question"]` when `action == "continue_interview"`, triggering LangGraph's built-in fan-out. Both nodes run concurrently; their results are merged before `update_memory` (fan-in).  
**Impact:** ~2–5 s saved per interview turn.

---

### #5 — Audio File Path Traversal Prevention
**File:** `api/main.py`  
**Problem:** `file_path = UPLOAD_DIR / file.filename` used the raw browser-supplied filename. A malicious filename like `../../config.py` would write the file outside `uploads/`.  
**Fix:** Added `_safe_filename(original)` helper that extracts only the extension from `Path(original).suffix.lower()`, validates it against an allowlist of audio/video extensions, and prepends a `uuid.uuid4()` prefix. Applied to `/analyze`, `/analyze/stream`, and `/interview/answer`.  
**Impact:** Path traversal attacks prevented; filename collisions eliminated.

---

### #6 — User ID Hardcoding Note
**File:** `api/main.py`  
**Status:** `user_id` defaults to `"default_user"` via `Form("default_user")` for backward compatibility with the current frontend. The architecture supports any string `user_id`; the frontend can pass a browser-generated UUID stored in `localStorage` to achieve per-user isolation without a full auth system. Full JWT/OIDC auth can be layered on top by replacing the `Form` default with a dependency that validates a Bearer token.

---

### #7 — Async Event Loop — `asyncio.to_thread`
**File:** `api/main.py`  
**Problem:** `analyze_audio_file()`, `start_interview()`, and `continue_interview()` are synchronous blocking functions. Calling them directly inside `async def` endpoints blocks the FastAPI event loop for the entire duration (6–17 s), preventing other requests from being handled.  
**Fix:** All three graph calls are now wrapped with `await asyncio.to_thread(fn, ...)`. FastAPI dispatches the blocking work to a thread-pool worker while the event loop remains free to handle other requests.  
**Impact:** Multiple simultaneous users are handled concurrently at the Python event-loop level.

---

### #8 — Streaming Feedback Endpoint
**File:** `api/main.py`  
**Problem:** `/analyze` returned the entire result as one JSON blob after a 6–17 s wait with no visible progress for the user.  
**Fix:** Added `POST /analyze/stream` endpoint that returns a `StreamingResponse` with `application/x-ndjson` content type. The client receives three newline-delimited JSON events: `{"status":"transcribing"}`, `{"status":"saving"}`, and the full payload as `{"status":"done", ...}`. Each event arrives as soon as the corresponding stage completes.  
**Impact:** Frontend can show live progress during analysis instead of a blank waiting screen.

---

### #9 — Rate Limiting
**File:** `api/main.py`, `pyproject.toml`, `requirements.txt`  
**Problem:** No rate limiting anywhere — a single client could submit hundreds of audio files per minute, draining Sarvam API quota.  
**Fix:** Added `slowapi>=0.1.9` dependency. A `Limiter(key_func=get_remote_address)` is registered as FastAPI middleware. Limits: `10/minute` on `/analyze` and `/analyze/stream`; `20/minute` on interview and text endpoints; `200/hour` global default. Rate-limit violations return HTTP 429 with `{"error": "Rate limit exceeded. Please slow down."}`.  
**Impact:** API quota abuse and runaway costs prevented.

---

### #11 — Thread-safe LanguageTool Singleton
**File:** `analysis/grammar.py`  
**Problem:** Two simultaneous requests could both see `_tool is None`, both start a Java subprocess, and end up with two `LanguageTool` instances (each ~3–5 s startup, ~400 MB RAM).  
**Fix:** Added `_tool_lock = threading.Lock()`. `_get_tool()` uses a double-checked locking pattern: fast path checks `_tool is not None` without acquiring the lock; slow path acquires the lock before the expensive `LanguageTool("en-US")` call and rechecks inside.  
**Impact:** Exactly one Java subprocess per process lifetime.

---

### #12 — Grammar LLM Timeout
**File:** `analysis/grammar.py`
**Problem:** `score_grammar_llm()` called the Sarvam API with no timeout, so a slow/hung response would block the analysis thread indefinitely.
**Fix:** The Sarvam call is wrapped in a `ThreadPoolExecutor(max_workers=1)` with `future.result(timeout=25)` — the same pattern used in `graph/nodes.py`'s `_sarvam_chat()`. A `TimeoutError` logs a warning and returns the fallback score dict `{"grammar": 75, "pronunciation": 75, "grammar_issues": []}`.
**Impact:** Analysis never stalls indefinitely on a slow LLM response.

---

### #13 — Grammar Score Inflated on Short Answers
**File:** `analysis/grammar.py` → `grammar_score()`
**Problem:** LanguageTool finds nothing to flag on a 2–4 word answer (insufficient content). Zero issues → `1.0 - 0 × 8 = 1.0` → **grammar = 100**. A one-word non-answer like "no" scored identically to a perfect 200-word response.
**Fix:** Added a `short_penalty = min(1.0, word_count / 10.0)` multiplier applied before the issue-density formula. A 3-word answer is capped at 30, a 5-word answer at 50, a 10+ word answer is uncapped. The same multiplier scales the issue-density penalty proportionally.
**Impact:** Nonsense short answers can no longer produce a 100/100 grammar score on the LanguageTool path.

---

### #14 — Relevancy Scoring Silently Skipped for Standard Interview Questions
**Files:** `analysis/analyzer.py` (`analyze_audio`, `analyze_with_transcript`, `analyze_transcript_only`)
**Problem:** The `_real_question` guard used `len(question.split()) > 4`. "Tell me about yourself" has exactly 4 words, so the condition was `False` — the relevancy LLM call was skipped and `answer_relevancy_score` was stored as `0.0` but **excluded from the overall formula**. With relevancy absent, the overall score was computed from grammar and fillers only — both of which could be near-perfect for a short irrelevant answer (no grammar issues, no fillers). This caused answers like "i dont care" to score 100/100 overall.
**Fix:** Changed the threshold from `> 4` to `>= 3` in all three `analyze_*` functions. This catches all standard interview questions (4+ words) while correctly skipping bare topic labels like `"HR"` or `"Technical"` (1–2 words).
**Impact:** Every real mock interview question now triggers the relevancy LLM call. Irrelevant or nonsense answers receive the low relevancy score they deserve, which dominates the overall via its 35–50% weight.

---

### #15 — Scoring Fallbacks Too Generous, Masking Real Failures
**File:** `analysis/grammar.py` → `score_grammar_llm()`, `score_relevancy_llm()`
**Problem:** Both LLM scorers returned mid-range fallback values on any failure — `grammar=75` and `relevancy=75` — so a network timeout or API error would silently award a passing score. Combined with fix #14 being absent, a 3-word irrelevant answer that happened to trigger a Sarvam timeout would receive grammar=75, relevancy=75 → overall ≈ 75. The grammar fallback was also a flat value regardless of answer length.
**Fix:**
- `score_grammar_llm` fallback is now `min(75, max(10, word_count × 5))`. A 3-word answer gets fallback grammar=15; a 15-word answer gets the full 75.
- `score_relevancy_llm` fallback changed from `{"relevancy": 75}` to `{"relevancy": 0}`. A failed relevancy call never flatters the answer.
- Minimum transcript length for attempting LLM scoring lowered from 10 to 5 characters so very short answers (`"no"`, `"idk"`) are still sent to the LLM rather than silently receiving the fallback.
**Impact:** API failures and timeouts degrade gracefully with conservative scores instead of inflating results.
