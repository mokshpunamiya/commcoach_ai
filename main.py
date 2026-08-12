"""
CommCoach AI — Entry point.

Usage:
  python main.py api        — start the FastAPI backend (serves React UI at http://127.0.0.1:8000)
  python main.py demo       — run a CLI demo (no UI needed)
  python main.py setup      — check all dependencies are installed
"""

import sys
import os
import logging

# Force UTF-8 output on Windows so Unicode characters render correctly
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger(__name__)


def run_api():
    """Start FastAPI backend."""
    import uvicorn
    from config import API_HOST, API_PORT
    logger.info("Starting CommCoach API on %s:%d", API_HOST, API_PORT)
    uvicorn.run("api.main:app", host=API_HOST, port=API_PORT, reload=False)


def run_demo():
    """CLI demo: analyze a sample audio file."""
    print("\n" + "=" * 60)
    print("  CommCoach AI — CLI Demo")
    print("=" * 60)

    # Check for sample audio
    uploads_dir = os.path.join(os.path.dirname(__file__), "uploads")
    samples = [f for f in os.listdir(uploads_dir) if f.endswith((".wav", ".mp3", ".m4a"))] if os.path.exists(uploads_dir) else []

    if not samples:
        print("\nNo audio files found in uploads/.")
        print("Please record yourself answering an interview question")
        print("and save it as a .wav file in the uploads/ directory.\n")
        return

    print(f"\nFound {len(samples)} audio file(s):")
    for i, s in enumerate(samples):
        print(f"  {i+1}. {s}")

    choice = input("\nSelect a file number (or press Enter for #1): ").strip()
    idx = int(choice) - 1 if choice else 0
    audio_path = os.path.join(uploads_dir, samples[idx])

    print(f"\nAnalyzing: {audio_path}")
    print("This may take 30-60 seconds…\n")

    from graph.graph import analyze_audio_file
    result = analyze_audio_file(audio_path=audio_path, user_id="demo_user")

    report = result.get("session_report", {})
    if report:
        print("─" * 60)
        print("ANALYSIS RESULTS")
        print("─" * 60)
        print(f"Overall Score:     {report.get('overall_score', 0):.1f}/100")
        print(f"Fluency Score:     {report.get('fluency_score', 0):.1f}/100")
        print(f"Grammar Score:     {report.get('grammar_score', 0):.1f}/100")
        print(f"Pace Score:        {report.get('pace_score', 0):.1f}/100")
        print(f"Filler Score:      {report.get('filler_score', 0):.1f}/100")
        print(f"Words per minute:  {report.get('words_per_minute', 0):.0f}")
        print(f"Filler words:      {report.get('filler_word_count', 0)}")
        print(f"Grammar issues:    {report.get('grammar_issue_count', 0)}")
        print(f"Confidence:        {report.get('confidence_level', 'N/A')}")
        print()
        print("TRANSCRIPT:")
        print(report.get("transcript", ""))
        print()

    feedback = result.get("feedback", "")
    if feedback:
        print("─" * 60)
        print("COACH FEEDBACK")
        print("─" * 60)
        print(feedback)

    print("\n" + "=" * 60)
    print("  Demo complete!")
    print("=" * 60)


def run_setup():
    """Check dependencies."""
    print("\nChecking CommCoach AI dependencies…\n")

    deps = [
        ("fastapi", "FastAPI"),
        ("uvicorn", "Uvicorn"),
        ("faster_whisper", "faster-whisper"),
        ("language_tool_python", "language-tool-python"),
        ("librosa", "librosa"),
        ("langgraph", "LangGraph"),
        ("langchain_openai", "langchain-openai"),
        ("langchain_core", "langchain-core"),
        ("torch", "PyTorch (emotion detection)"),
        ("transformers", "Transformers (emotion detection)"),
    ]

    all_ok = True
    for module, name in deps:
        try:
            __import__(module)
            print(f"  ✓ {name}")
        except ImportError:
            print(f"  ✗ {name} — NOT INSTALLED")
            all_ok = False

    # Check API key
    from config import OPENAI_API_KEY
    if OPENAI_API_KEY:
        print(f"  ✓ OpenAI API key set")
    else:
        print(f"  ⚠ OpenAI API key not set — set OPENAI_API_KEY env var")
        all_ok = False

    print()
    if all_ok:
        print("All dependencies ready! Run `python main.py api` to start.")
    else:
        print("Install missing dependencies: pip install -r requirements.txt")
    print()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(0)

    cmd = sys.argv[1].lower()
    if cmd == "api":
        run_api()
    elif cmd == "demo":
        run_demo()
    elif cmd == "setup":
        run_setup()
    else:
        print(f"Unknown command: {cmd}")
        print(__doc__)