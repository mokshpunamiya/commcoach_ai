"""
Streamlit dashboard for CommCoach AI.

Features:
  - Upload audio for one-shot analysis
  - Start / continue mock interviews
  - View session history
  - View long-term coaching profile
"""

import streamlit as st
import requests
import json
import time
from pathlib import Path

API_URL = "http://localhost:8000"

st.set_page_config(page_title="CommCoach AI", page_icon="🎤", layout="wide")


# ─── PDF helper ─────────────────────────────────────────

def _extract_pdf_text(uploaded_file) -> str:
    """Extract plain text from an uploaded PDF file."""
    try:
        from pypdf import PdfReader
        reader = PdfReader(uploaded_file)
        pages = [page.extract_text() or "" for page in reader.pages]
        return "\n".join(pages).strip()
    except Exception as e:
        return ""


# ─── Helper functions ───────────────────────────────────

def check_api():
    try:
        r = requests.get(f"{API_URL}/health", timeout=3)
        return r.status_code == 200
    except Exception:
        return False


def upload_audio_for_analysis(file, user_id, topic=None):
    files = {"file": (file.name, file.getvalue(), "audio/wav")}
    data = {"user_id": user_id}
    if topic:
        data["interview_topic"] = topic
    r = requests.post(f"{API_URL}/analyze", files=files, data=data, timeout=300)
    return r.json() if r.status_code == 200 else {"error": r.text}


def start_interview(user_id, topic, resume_text=None):
    body = {"user_id": user_id, "topic": topic}
    if resume_text:
        body["resume_text"] = resume_text
    r = requests.post(f"{API_URL}/interview/start", json=body, timeout=60)
    return r.json() if r.status_code == 200 else {"error": r.text}


def submit_answer_audio(session_id, user_id, file):
    files = {"file": (file.name, file.getvalue(), "audio/wav")}
    data = {"session_id": session_id, "user_id": user_id}
    r = requests.post(f"{API_URL}/interview/answer", files=files, data=data, timeout=300)
    return r.json() if r.status_code == 200 else {"error": r.text}


def submit_answer_text(session_id, user_id, transcript):
    data = {"session_id": session_id, "user_id": user_id, "transcript": transcript}
    # Use form data since the endpoint expects Form fields
    r = requests.post(f"{API_URL}/interview/answer", data=data, timeout=120)
    return r.json() if r.status_code == 200 else {"error": r.text}


def get_sessions(user_id):
    r = requests.get(f"{API_URL}/sessions/{user_id}", timeout=10)
    return r.json().get("sessions", []) if r.status_code == 200 else []


def get_profile(user_id):
    r = requests.get(f"{API_URL}/profile/{user_id}", timeout=10)
    return r.json().get("profile", {}) if r.status_code == 200 else {}


# ─── UI components ──────────────────────────────────────

def render_score_card(label, score, max_val=100):
    """Render a score as a progress bar."""
    pct = score / max_val
    color = "#28a745" if score >= 75 else "#ffc107" if score >= 50 else "#dc3545"
    st.markdown(
        f"""
        <div style="margin-bottom: 10px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span>{label}</span>
                <span style="font-weight: bold; color: {color};">{score:.1f}</span>
            </div>
            <div style="background: #e0e0e0; border-radius: 4px; height: 8px;">
                <div style="background: {color}; border-radius: 4px; height: 8px; width: {pct*100:.1f}%;"></div>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_session_report(report):
    """Render the analysis results."""
    if not report:
        st.warning("No analysis available.")
        return

    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric("Overall Score", f"{report.get('overall_score', 0):.1f}")
    with col2:
        st.metric("Words / Min", f"{report.get('words_per_minute', 0):.0f}")
    with col3:
        st.metric("Filler Words", report.get("filler_word_count", 0))
    with col4:
        st.metric("Grammar Issues", report.get("grammar_issue_count", 0))

    st.markdown("---")
    st.subheader("Detailed Scores")
    col_a, col_b = st.columns(2)
    with col_a:
        render_score_card("Fluency", report.get("fluency_score", 0))
        render_score_card("Grammar", report.get("grammar_score", 0))
    with col_b:
        render_score_card("Pace", report.get("pace_score", 0))
        render_score_card("Filler Words", report.get("filler_score", 0))

    # Transcript
    st.markdown("---")
    st.subheader("Transcript")
    st.text_area("", report.get("transcript", ""), height=150, disabled=True, key="transcript_display")

    # Filler word breakdown
    fillers = report.get("filler_words", [])
    if fillers:
        st.markdown("**Filler word breakdown:**")
        filler_text = "  ·  ".join([f"`{f['word']}` ×{f['count']}" for f in fillers[:10]])
        st.markdown(filler_text)

    # Grammar issues
    grammar = report.get("grammar_issues", [])
    if grammar:
        with st.expander(f"Grammar issues ({len(grammar)})"):
            for g in grammar[:10]:
                st.markdown(f"- **{g.get('category', '')}**: {g.get('message', '')}")
                if g.get("suggestion"):
                    st.markdown(f"  → Suggestion: *{g['suggestion']}*")

    # Emotion
    emotion = report.get("emotion")
    if emotion:
        st.markdown(f"**Detected emotion:** {emotion.get('label', 'N/A')} "
                    f"(confidence: {emotion.get('confidence', 0):.2f})")
    if report.get("confidence_level"):
        st.markdown(f"**Confidence level:** {report['confidence_level']}")


def render_feedback(feedback_text):
    st.markdown("---")
    st.subheader("🤖 Coach Feedback")
    st.markdown(feedback_text)


# ─── Main app ───────────────────────────────────────────

def main():
    st.title("🎤 CommCoach AI")
    st.markdown("Your AI-powered interview communication coach")

    # API health check
    if not check_api():
        st.error("⚠️ Backend API is not running. Start it with: `python -m api.main`")
        st.stop()

    # User ID
    user_id = st.sidebar.text_input("User ID", value="default_user")

    # Sidebar navigation
    mode = st.sidebar.radio("Mode", ["📊 Analyze Audio", "🎯 Mock Interview", "📜 History", "👤 Profile"])

    if mode == "📊 Analyze Audio":
        render_analyze_tab(user_id)
    elif mode == "🎯 Mock Interview":
        render_interview_tab(user_id)
    elif mode == "📜 History":
        render_history_tab(user_id)
    elif mode == "👤 Profile":
        render_profile_tab(user_id)


def render_analyze_tab(user_id):
    st.header("📊 Analyze an Audio Recording")
    st.markdown("Upload an audio recording of your interview answer to get instant coaching feedback.")

    topic = st.text_input("Interview topic (optional)", value="", key="analyze_topic")
    uploaded = st.file_uploader("Upload audio file", type=["wav", "mp3", "m4a", "flac", "ogg"], key="analyze_upload")

    if uploaded and st.button("Analyze", key="analyze_btn"):
        with st.spinner("Transcribing and analyzing… this may take 30-60 seconds."):
            result = upload_audio_for_analysis(uploaded, user_id, topic or None)

        if "error" in result:
            st.error(f"Error: {result['error']}")
        else:
            st.success("Analysis complete!")
            render_session_report(result.get("session_report"))
            render_feedback(result.get("feedback", ""))


def render_interview_tab(user_id):
    st.header("🎯 Mock Interview")

    # Initialise session state
    if "interview_session_id" not in st.session_state:
        st.session_state.interview_session_id = None
    if "interview_active" not in st.session_state:
        st.session_state.interview_active = False

    # Start interview
    if not st.session_state.interview_active:
        col1, col2 = st.columns(2)
        with col1:
            topic = st.text_input("Interview topic", value="general software engineering", key="interview_topic")
        with col2:
            resume_file = st.file_uploader("Upload your resume (optional, PDF)", type=["pdf"], key="resume_pdf")
            resume = None
            if resume_file is not None:
                resume = _extract_pdf_text(resume_file)
                if resume:
                    st.success(f"Resume loaded — {len(resume.split())} words extracted.")
                else:
                    st.warning("Could not extract text from this PDF.")

        if st.button("Start Interview", key="start_interview_btn"):
            with st.spinner("Starting interview…"):
                result = start_interview(user_id, topic, resume or None)
            if "error" in result:
                st.error(f"Error: {result['error']}")
            else:
                st.session_state.interview_session_id = result["session_id"]
                st.session_state.interview_active = True
                st.session_state.interview_turn = result.get("turn_count", 1)
                st.rerun()

    else:
        # Active interview
        st.success(f"Interview in progress (Session: {st.session_state.interview_session_id[:8]}…)")
        st.info(f"Turn {st.session_state.interview_turn}")

        # Show current question
        with st.spinner("Loading question…"):
            # Get the latest state from the backend
            r = requests.get(
                f"{API_URL}/session/{st.session_state.interview_session_id}",
                timeout=10,
            )
            if r.status_code == 200:
                session_data = r.json()
                turns = session_data.get("turns", [])
                if turns:
                    last_turn = turns[-1]
                    if last_turn.get("question"):
                        st.markdown("### ❓ Interview Question")
                        st.markdown(f"**{last_turn['question']}**")

        st.markdown("---")
        st.markdown("### Your Answer")

        answer_mode = st.radio("Answer type", ["🎤 Audio upload", "⌨️ Text input"], horizontal=True)

        answer_audio = None
        answer_text = None

        if answer_mode == "🎤 Audio upload":
            answer_audio = st.file_uploader(
                "Record or upload your answer",
                type=["wav", "mp3", "m4a", "flac"],
                key="answer_audio",
            )
        else:
            answer_text = st.text_area("Type your answer", height=150, key="answer_text_input")

        col_submit, col_end = st.columns([1, 1])
        with col_submit:
            if st.button("Submit Answer", key="submit_answer_btn"):
                if answer_audio:
                    with st.spinner("Analyzing your answer…"):
                        result = submit_answer_audio(
                            st.session_state.interview_session_id,
                            user_id,
                            answer_audio,
                        )
                elif answer_text:
                    with st.spinner("Analyzing your answer…"):
                        result = submit_answer_text(
                            st.session_state.interview_session_id,
                            user_id,
                            answer_text,
                        )
                else:
                    st.warning("Please provide an answer (audio or text).")
                    st.stop()

                if "error" in result:
                    st.error(f"Error: {result['error']}")
                else:
                    st.session_state.interview_turn = result.get("turn_count", st.session_state.interview_turn + 1)
                    st.markdown("---")
                    render_session_report(result.get("session_report"))
                    render_feedback(result.get("feedback", ""))
                    st.markdown("---")
                    st.markdown("### ❓ Next Question")
                    st.markdown(f"**{result.get('next_question', '')}**")

        with col_end:
            if st.button("End Interview", key="end_interview_btn"):
                st.session_state.interview_active = False
                st.session_state.interview_session_id = None
                st.rerun()


def render_history_tab(user_id):
    st.header("📜 Session History")
    sessions = get_sessions(user_id)

    if not sessions:
        st.info("No sessions yet. Start by analyzing an audio file or beginning a mock interview.")
        return

    for s in sessions:
        with st.expander(f"{s['type'].title()} — {s.get('topic', 'N/A')} — {s['created_at'][:19]}"):
            st.markdown(f"**Session ID:** `{s['id']}`")
            st.markdown(f"**Type:** {s['type']}")
            st.markdown(f"**Topic:** {s.get('topic', 'N/A')}")
            st.markdown(f"**Created:** {s['created_at']}")
            st.markdown(f"**Last updated:** {s['updated_at']}")

            # Get turns
            r = requests.get(f"{API_URL}/session/{s['id']}", timeout=10)
            if r.status_code == 200:
                turns = r.json().get("turns", [])
                for t in turns:
                    st.markdown(f"**Turn {t['turn_number']}**")
                    if t.get("question"):
                        st.markdown(f"Q: {t['question']}")
                    if t.get("transcript"):
                        st.markdown(f"A: {t['transcript'][:200]}…")
                    if t.get("feedback"):
                        st.markdown(f"Feedback: {t['feedback'][:200]}…")
                    st.markdown("---")


def render_profile_tab(user_id):
    st.header("👤 Your Coaching Profile")
    profile = get_profile(user_id)

    if not profile or profile.get("total_sessions", 0) == 0:
        st.info("No coaching history yet. Complete a session to build your profile.")
        return

    col1, col2, col3 = st.columns(3)
    with col1:
        st.metric("Total Sessions", profile.get("total_sessions", 0))
    with col2:
        st.metric("Trend", profile.get("trend", "new").title())
    with col3:
        weak = profile.get("weak_areas", [])
        st.metric("Weak Areas", ", ".join(weak) if weak else "None")

    # Score history
    history = profile.get("score_history", [])
    if history:
        st.subheader("Score History")
        score_data = []
        for h in history:
            score_data.append({
                "Date": h.get("timestamp", "")[:10],
                "Overall": h.get("overall_score", 0),
                "Fluency": h.get("fluency_score", 0),
                "Grammar": h.get("grammar_score", 0),
                "Pace": h.get("pace_score", 0),
                "Filler": h.get("filler_score", 0),
            })
        st.dataframe(score_data, use_container_width=True)

        # Simple chart
        try:
            import pandas as pd
            df = pd.DataFrame(score_data)
            st.line_chart(df.set_index("Date")[["Overall", "Fluency", "Grammar", "Pace", "Filler"]])
        except Exception:
            pass

    if profile.get("latest_feedback"):
        st.subheader("Latest Feedback")
        st.markdown(profile["latest_feedback"])


if __name__ == "__main__":
    main()