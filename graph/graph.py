"""
Build and compile the LangGraph coaching graph.

Graph topology:
═══════════════════════════════════════════════════════════════

                    ┌──────────────────┐
                    │  retrieve_memory │  ← always runs first
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │   route_action   │  ← conditional edge
                    └──┬─────┬────┬────┘
                       │     │    │
            analyze_only     │    continue_interview
                       │     │    │
              ┌────────▼──┐  │    ├──► transcribe → analyze → generate_feedback
              │transcribe │  │    │                              │
              └────┬──────┘  │    │                    ┌─────────▼──────────┐
                   │         │    │                    │ generate_question  │
              ┌────▼──────┐  │    │                    └─────────┬──────────┘
              │  analyze  │  │    │                              │
              └────┬──────┘  │    │                    ┌─────────▼──────────┐
                   │   start_interview                  │   update_memory    │
              ┌────▼──────┐    │                       └─────────┬──────────┘
              │feedback   │    │                                 │
              └────┬──────┘    │                                 ▼
                   │     ┌─────▼──────┐                         END
              ┌────▼──┐  │ generate   │
              │update │  │ question   │
              │memory │  └─────┬──────┘
              └────┬──┘        │
                   │           ▼
                   ▼          END
                  END
═══════════════════════════════════════════════════════════════

Memory layers:
  • SqliteSaver checkpointer: auto-saves ALL state per thread_id.
    → Multi-turn interview memory is automatic: just call the graph
      again with the same thread_id and the full conversation is restored.
  • InMemoryStore: cross-session long-term user profile.
    → The coach remembers the user's weak areas, score trends, and
      past feedback across different sessions (different thread_ids).
"""

from __future__ import annotations
import logging
from langgraph.graph import StateGraph, END, START
from graph.state import CoachState
from graph.nodes import (
    retrieve_memory_node,
    transcribe_node,
    analyze_node,
    generate_feedback_node,
    generate_question_node,
    update_memory_node,
    route_action,
)
from graph.memory import get_checkpointer

logger = logging.getLogger(__name__)

# ─── Graph builder ──────────────────────────────────────

_graph = None


def build_graph():
    """Build and compile the coaching graph with memory.

    For continue_interview, generate_feedback and generate_question are
    fanned out in parallel after analyze — both nodes only need state that
    is available before either runs, so they can execute concurrently and
    their results are merged before update_memory.
    """
    graph_builder = StateGraph(CoachState)

    # ── Add all nodes ──
    graph_builder.add_node("retrieve_memory", retrieve_memory_node)
    graph_builder.add_node("transcribe", transcribe_node)
    graph_builder.add_node("analyze", analyze_node)
    graph_builder.add_node("generate_feedback", generate_feedback_node)
    graph_builder.add_node("generate_question", generate_question_node)
    graph_builder.add_node("update_memory", update_memory_node)

    # ── Entry: always retrieve long-term memory first ──
    graph_builder.add_edge(START, "retrieve_memory")

    # ── Conditional routing after memory retrieval ──
    graph_builder.add_conditional_edges(
        "retrieve_memory",
        route_action,
        {
            "analyze_only": "transcribe",
            "start_interview": "generate_question",
            "continue_interview": "transcribe",
        },
    )

    # ── transcribe → analyze (both paths share this edge) ──
    graph_builder.add_edge("transcribe", "analyze")

    # After analyze:
    #   analyze_only       → generate_feedback only
    #   continue_interview → generate_feedback AND generate_question in parallel
    def _after_analyze(state: CoachState):
        if state.get("action") == "continue_interview":
            return ["generate_feedback", "generate_question"]
        return "generate_feedback"

    graph_builder.add_conditional_edges(
        "analyze",
        _after_analyze,
        {
            "generate_feedback": "generate_feedback",
            "generate_question": "generate_question",
        },
    )

    # Both paths converge: generate_feedback → update_memory.
    # For continue_interview, generate_question also feeds update_memory —
    # LangGraph's fan-in merges both parallel results before running update_memory.
    graph_builder.add_edge("generate_feedback", "update_memory")
    graph_builder.add_edge("generate_question", "update_memory")
    graph_builder.add_edge("update_memory", END)

    # ── start_interview path: generate_question → END ──
    # (already routed from retrieve_memory; no update_memory on first question)

    # ── Compile with checkpointer ──
    # Long-term user profiles are handled via SqliteProfileStore accessed
    # directly in helper functions — no LangGraph store injection needed.
    checkpointer = get_checkpointer()
    compiled = graph_builder.compile(checkpointer=checkpointer)
    logger.info("LangGraph coaching graph compiled with checkpointer.")
    return compiled


def get_graph():
    """Get or create the singleton compiled graph."""
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph


# ─── Convenience wrappers ───────────────────────────────

def analyze_audio_file(
    audio_path: str,
    user_id: str = "default_user",
    session_id: str | None = None,
    interview_topic: str | None = None,
) -> dict:
    """
    One-shot: upload audio → transcribe → analyze → feedback.

    Uses a unique thread_id so each analysis is independent.
    """
    import uuid
    thread_id = session_id or f"analyze-{uuid.uuid4()}"
    graph = get_graph()

    initial_state = {
        "messages": [],
        "user_id": user_id,
        "session_id": thread_id,
        "action": "analyze_only",
        "audio_path": audio_path,
        "transcript": None,
        "duration_seconds": None,
        "session_report": None,
        "detected_language_code": None,
        "detected_language_probability": None,
        "feedback": None,
        "current_question": None,
        "interview_topic": interview_topic,
        "resume_text": None,
        "turn_count": 0,
        "user_memory": None,
        "error": None,
    }

    config = {"configurable": {"thread_id": thread_id}}
    result = graph.invoke(initial_state, config=config)
    return result


def start_interview(
    user_id: str = "default_user",
    session_id: str | None = None,
    topic: str = "general software engineering",
    resume_text: str | None = None,
) -> dict:
    """
    Start a new mock interview session.
    Returns the first question.
    """
    import uuid
    thread_id = session_id or f"interview-{uuid.uuid4()}"
    graph = get_graph()

    initial_state = {
        "messages": [],
        "user_id": user_id,
        "session_id": thread_id,
        "action": "start_interview",
        "audio_path": None,
        "transcript": None,
        "duration_seconds": None,
        "session_report": None,
        "detected_language_code": None,
        "detected_language_probability": None,
        "feedback": None,
        "current_question": None,
        "interview_topic": topic,
        "resume_text": resume_text,
        "turn_count": 0,
        "user_memory": None,
        "error": None,
    }

    config = {"configurable": {"thread_id": thread_id}}
    result = graph.invoke(initial_state, config=config)
    return result


def continue_interview(
    session_id: str,
    audio_path: str | None = None,
    transcript: str | None = None,
    user_id: str = "default_user",
) -> dict:
    """
    Continue an existing interview: submit an answer (audio or text),
    get feedback + next question.

    Uses the SAME thread_id as start_interview — the checkpointer
    automatically restores the full conversation history.
    """
    graph = get_graph()

    initial_state = {
        "messages": [],  # checkpointer will restore previous messages
        "user_id": user_id,
        "session_id": session_id,
        "action": "continue_interview",
        "audio_path": audio_path,
        "transcript": transcript,
        "duration_seconds": None,
        "session_report": None,
        "detected_language_code": None,
        "detected_language_probability": None,
        "feedback": None,
        "current_question": None,
        "interview_topic": None,  # restored from checkpoint
        "resume_text": None,
        "turn_count": 0,  # restored from checkpoint
        "user_memory": None,
        "error": None,
    }

    config = {"configurable": {"thread_id": session_id}}
    result = graph.invoke(initial_state, config=config)
    return result


def get_session_history(session_id: str) -> dict | None:
    """Retrieve the full state of a past or ongoing session from the checkpointer."""
    graph = get_graph()
    config = {"configurable": {"thread_id": session_id}}
    try:
        state = graph.get_state(config)
        if state and state.values:
            return state.values
    except Exception as e:
        logger.error("Failed to get session history: %s", e)
    return None