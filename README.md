# MedScribe AI

> Ambient AI clinical documentation — record a patient visit, watch the transcript build live in the browser, get a SOAP note plus catalog-validated ICD-10 codes plus a patient summary in seconds, edit it, export to PDF.

[![Built with React + FastAPI + Groq](https://img.shields.io/badge/stack-React%20%C2%B7%20FastAPI%20%C2%B7%20Groq-0ea5e9?style=flat-square)](#tech-stack)
[![Backend tests](https://img.shields.io/badge/backend%20tests-36%20passing-10b981?style=flat-square)](#tests)
[![Status](https://img.shields.io/badge/status-portfolio%20prototype-f59e0b?style=flat-square)](#whats-out-of-scope)

## Demo

> Record a 2–3 minute walkthrough using [`docs/demo/recording-script.md`](docs/demo/recording-script.md) and link it here.

[![MedScribe AI demo](docs/demo/thumbnail.png)](REPLACE_WITH_DEMO_VIDEO_URL)

## What it does

```
Doctor speaks  →  every 4s an audio chunk is sent  →  Groq Whisper transcribes
each chunk  →  transcript builds live in the browser via SSE  →
doctor clicks Stop  →  Llama 3.3 70B generates SOAP  →  Llama suggests
ICD-10 candidates  →  local CMS catalog validates them (drops fakes)  →
Llama writes a visit summary  →  doctor reviews / edits / accepts codes  →
download PDF
```

Transcript appears in the browser in near real time (~4s latency per chunk) via **chunked HTTP upload + Server-Sent Events**. SOAP / ICD / summary runs once after Stop — matching how real ambient scribe products (Abridge, Suki, Nuance DAX) work.

## Highlights

- 🎙 **Live audio waveform** during recording, driven by the real mic stream (Web Audio API · AnalyserNode)
- 🧠 **Catalog-validated ICD codes** — every code the LLM suggests is looked up in the official CMS ICD-10-CM catalog; hallucinated codes are **kept and flagged** so the trust story is visible
- 📊 **AI confidence meters** on each ICD suggestion (high / medium / low colour-graded)
- 🔐 **Google OAuth** sign-in alongside JWT email/password, with account-linking on email match
- 📈 **Production-feel dashboard** — stats, time-grouped sessions, search, status filter chips, delete / retry-finalize actions
- 🧪 **36 backend tests**, all mocking Groq — CI never hits the real API
- 📄 **PDF export** via ReportLab with custom clinical template
- 💾 **Audio deleted** immediately after transcription — privacy-friendly default

## Architecture

```
BROWSER (React 19 · TypeScript · Vite · Tailwind v4 · shadcn-style UI)
  Login / Register (JWT + Google OAuth)
  Recorder (MediaRecorder, webm/opus, stop-restart chunk loop)
  Live waveform (AnalyserNode)
  Workspace: Live Transcript | SOAP + ICD review + Summary
  Dashboard: stats, search, time-grouped sessions, row actions
        |
        | HTTPS + JWT, POST /audio-chunk, SSE /stream
        v
BACKEND (FastAPI, async, BackgroundTasks, sse-starlette)
  Auth router       — /register · /login · /me · /google (OAuth ID-token verify)
  Sessions router   — CRUD · /audio-chunk (live) · /finalize · /stream SSE
                      /retry-finalize · DELETE
  Export router     — /export.pdf
  ChunkTranscriber  — transcribes each chunk synchronously, emits SSE fragments
  FinalizePipeline  — orchestrates SOAP → ICD candidates → validate → summary
        |
        +----------+----------+----------------+
        v                     v                v
  AI SERVICES           LOCAL DATA       CATALOG + EXPORT
  Groq Whisper          SQLite via       ICD-10-CM catalog
  Groq Llama 3.3 70B    SQLAlchemy 2     (seeded from CMS TSV)
  google-auth (OAuth)   6 tables         ReportLab PDF templates
```

## Tech stack

| Layer | Choices |
|-------|---------|
| Frontend | React 19, TypeScript, Vite 8, Tailwind v4, shadcn-style components, TanStack Query, Zustand, Framer Motion, lucide-react, @react-oauth/google |
| Backend | FastAPI, SQLAlchemy 2.0, SQLite, Alembic, Pydantic v2, sse-starlette, ReportLab, google-auth |
| AI | Groq Whisper (`whisper-large-v3-turbo`), Groq Llama 3.3 70B Versatile — both on the free tier |
| Auth | JWT (HS256) via python-jose, bcrypt via passlib, Google OAuth 2.0 (server-side ID-token verification) |
| Tests | pytest, 36 tests, all Groq calls mocked via conftest fixture |
| CI | GitHub Actions — backend (ruff + pytest) and frontend (tsc + eslint + vite build) |

## Setup (local-only)

You need Python 3.12, Node 20+, and a free [Groq API key](https://console.groq.com/keys).

```bash
git clone <this-repo>
cd MedScribe-AI-Ambient-Clinical-Documentation-Assistant

# --- Backend ---
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
cp .env.example .env
# edit .env and set GROQ_API_KEY=gsk_...
.venv/bin/alembic upgrade head
.venv/bin/python -m app.catalog.seed_icd10
.venv/bin/uvicorn app.main:app --reload --port 8000

# --- Frontend (new terminal) ---
cd ../frontend
npm install
cp .env.example .env
# .env already has VITE_API_URL=http://localhost:8000 — no edit needed
npm run dev
```

Open <http://localhost:5173>, register, click **New session**, fill in a non-PHI patient label, and read [the demo script](docs/demo/recording-script.md) into your mic.

### Optional: Google OAuth sign-in

1. Create an OAuth Client ID (Web application) at <https://console.cloud.google.com/apis/credentials>
2. Add `http://localhost:5173` under **Authorized JavaScript origins**
3. Paste the same client ID in **both**:
   - `backend/.env` → `GOOGLE_OAUTH_CLIENT_ID=...apps.googleusercontent.com`
   - `frontend/.env` → `VITE_GOOGLE_OAUTH_CLIENT_ID=...apps.googleusercontent.com`
4. Restart both servers (env changes don't hot-reload)

Without the client ID, the Google button is hidden and email/password works alone.

> **Demo mode — do not enter real PHI.** The UI shows a permanent banner. Use synthetic patient names (`Patient #1`, `John D.`) and the scripts under `docs/demo/`.

## Project structure

```
backend/
  app/
    api/             FastAPI routers (auth, sessions, export)
    services/        auth_service, chunk_transcriber, finalize_pipeline,
                     icd_validator, pdf_service, event_bus, google_oauth
    ai/              groq_client, stt (Whisper), llm (chat + JSON mode + retry)
    prompts/         SOAP / ICD / summary prompt templates
    models/          SQLAlchemy ORM — 6 tables (users, sessions, transcripts,
                     soap_notes, icd_suggestions, icd_catalog)
    schemas/         Pydantic request/response models
    catalog/         ICD-10 seeder + vendored 51-code sample TSV
  alembic/           migrations
  tests/             36 tests, all mocking Groq

frontend/
  src/
    pages/           Login, Register, Dashboard, Workspace, SessionDetail
    components/      AppShell, PatientHeader, PipelineStrip, TranscriptPanel,
                     SoapPanel, IcdSuggestionsList, SummaryCard, Waveform,
                     GoogleSignInButton, ProtectedRoute, ui/*
    hooks/           useAuth, useRecorder, useStreamingSession
    services/        api (typed fetch wrapper)
    store/           auth (Zustand + localStorage)
    lib/             sessions (time grouping, formatting, confidence helpers)
  public/            favicon.svg (custom ECG waveform brand mark)

docs/
  superpowers/
    specs/           design specs — one per sub-project, brainstormed then frozen
    plans/           lightweight implementation checklists derived from each spec
  demo/
    recording-script.md  — 60-second script to read for the demo video
    portfolio-onepager.html — recruiter-facing case study (print/PDF friendly)
    linkedin-post.md      — two post variants ready to publish
    demo-script.md        — 3 longer scenarios for varied testing
```

## ICD-10 catalog

The repo vendors a 51-code sample TSV at `backend/app/catalog/icd10_sample.tsv`, covering chest pain, hypertension, type-2 diabetes, URI, migraine, GERD, low back pain, anxiety, depression, and other common chief complaints. Drop the full **CMS ICD-10-CM order file** (free, ~70K codes) at the same path and the seeder picks it up.

LLM-proposed codes are looked up in this catalog before being shown to the doctor. Unknown codes are kept but flagged as **Unverified** so you can see what the LLM proposed and what the catalog rejected — the validation story is transparent in the UI.

## Tests

```bash
cd backend
.venv/bin/pytest -v
```

36 tests across `test_auth.py` (incl. Google OAuth), `test_icd_validator.py`, `test_chunk_transcriber.py`, `test_finalize_pipeline.py`, `test_sessions_api.py`, `test_export.py`. All Groq and Google calls are mocked via `conftest.py` fixtures — tests never hit any external API.

## Roadmap

| # | Sub-project | Status | What it adds |
|---|-------------|--------|--------------|
| 1 | **Core Scribe** | ✅ Done | Record → SOAP + ICD + summary → PDF |
| 2 | **Live Streaming** | ✅ Done | Chunked Whisper, live transcript as the doctor talks |
| + | Dashboard polish | ✅ Done | Stats cards, search, time grouping, row actions, custom favicon, OAuth |
| 3 | **Clinical Intelligence** | 📋 Spec'd | Speaker diarization, entity extraction, risk flagging, AI follow-up questions |

## What's out of scope

This is a portfolio prototype, not a production clinical product. Real adoption would require:

- **HIPAA-compliant infra**: BAAs with cloud + AI providers, encryption-at-rest, audit logs, breach notification, annual training, third-party audits
- **EHR integration**: Epic / Cerner / Athena bidirectional sync (most clinics won't switch from a workflow already in their EHR)
- **Clinical validation**: specialty-specific accuracy studies (cardiology vs pediatrics vs psychiatry have wildly different vocabularies)
- **Liability + trust**: the doctor signs the note; AI hallucinations in clinical notes have real consequences

## Design docs

Every sub-project went through **brainstorm → spec → plan → ship**. The specs and plans live in [`docs/superpowers/`](docs/superpowers/) and double as a record of decisions:

- Sub-project #1 — [spec](docs/superpowers/specs/2026-05-20-medscribe-core-design.md) · [plan](docs/superpowers/plans/2026-05-20-medscribe-core-plan.md)
- Sub-project #2 — [spec](docs/superpowers/specs/2026-05-21-medscribe-streaming-design.md) · [plan](docs/superpowers/plans/2026-05-21-medscribe-streaming-plan.md)

## License

For portfolio / educational use. Not for clinical decision-making.
