# Contributing to CommCoach AI

Thanks for helping build this out — whether that's a bug fix, a new module, or documentation. This guide covers how the project is branched, how commits and PRs should look, and what to check before you open one.

Before diving in, please read the [Current Status & Known Gaps](./README.md#current-status--known-gaps) section of the README — it'll save you from re-discovering the frontend/backend integration gap the hard way.

## Table of contents

- [Getting set up](#getting-set-up)
- [Branching model](#branching-model)
- [Commit messages](#commit-messages)
- [Pull request process](#pull-request-process)
- [Code style](#code-style)
- [Testing](#testing)
- [Reporting issues](#reporting-issues)

---

## Getting set up

Follow the [Quickstart](./README.md#quickstart) in the README first. Once the Streamlit app runs locally in demo mode (no API key needed), you're ready to contribute — you don't need a Sarvam key to develop most features, since every backend function has a mock fallback.

## Branching model

- **`main`** — always deployable / demoable. Don't push directly to it.
- **`feature/<short-description>`** — new functionality (e.g. `feature/session-persistence`, `feature/pronunciation-model`).
- **`fix/<short-description>`** — bug fixes (e.g. `fix/wpm-zero-division`).
- **`docs/<short-description>`** — documentation-only changes.

Branch off the latest `main`, and keep branches scoped to one feature or fix — smaller PRs review faster.

## Commit messages

We use a lightweight [Conventional Commits](https://www.conventionalcommits.org/)-style prefix:

```
<type>: <short summary, imperative mood>

[optional body — the "why", not just the "what"]
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`.

Examples:
```
feat: add real-time pace warning during recording
fix: guard against zero-duration audio in compute_wpm
docs: document the Sarvam chat.completions JSON contract
```

## Pull request process

1. **Open an issue first** for anything non-trivial (new feature, architectural change) so the approach can be discussed before code is written.
2. **Keep PRs focused.** One feature or fix per PR. If you find an unrelated bug while working, file a separate issue rather than folding the fix in.
3. **Fill out the PR description:**
   - What changed and why
   - How you tested it (manual steps are fine given there's no test suite yet — see [Testing](#testing))
   - Screenshots/GIFs for any UI change
   - Whether it touches the backend, frontend, or both — and if both, whether you've verified the data shapes still line up (see [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the expected feedback/session schemas)
4. **Update docs in the same PR** if you change a function signature, add an environment variable, or change the mock data schema. Docs drift is the main thing this cleanup effort is trying to prevent — help us keep it that way.
5. **Request review.** At least one approval before merging. Squash-merge to keep `main`'s history clean.

### PR checklist

- [ ] Code runs locally (`streamlit run app.py` for backend changes)
- [ ] No secrets committed (check for stray API keys before pushing)
- [ ] New/changed functions have a docstring or comment explaining intent
- [ ] Mock fallback still works if you touched a `sarvam_client.py` function (i.e. it doesn't hard-crash without an API key)
- [ ] Relevant docs updated (`README.md`, `ARCHITECTURE.md`, or `.env.example`)

## Code style

**Python (backend)**
- Follow [PEP 8](https://peps.python.org/pep-0008/). 4-space indentation, `snake_case` for functions/variables.
- Every public function should have a one-line docstring at minimum — see existing modules for the level of detail expected.
- Prefer explicit `try/except` with a mock fallback over letting an external API call crash the app (this is the existing pattern throughout `sarvam_client.py` — keep it consistent).

**JavaScript/React (frontend)**
- Functional components with hooks — no class components.
- Keep design tokens (`C.coral`, `C.mint`, etc.) centralized at the top of the file rather than hardcoding hex values inline.
- Match the existing inline-style approach unless a broader refactor (e.g. introducing Tailwind or CSS modules) has been discussed and agreed on first.

## Testing

There's no automated test suite yet — this is a known gap, not an oversight. If you're adding a new deterministic function (anything in `filler_words.py` or `audio_features.py` is a great candidate), consider adding a `pytest` test alongside it; that's how we'd like the suite to start. For LLM-backed functions, testing the mock fallback path (i.e. behavior with no API key configured) is the most valuable and easiest thing to cover.

## Reporting issues

When filing a bug, please include:
- What you expected vs. what happened
- Whether you were running in **live mode** (API key configured) or **demo/mock mode**
- Steps to reproduce
- Relevant console/terminal output

For feature requests, a short description of the use case is more useful than a fully-specified solution — leaves room for discussion on the best approach.
