# MedScribe AI

> Ambient AI Clinical Documentation Assistant — record a patient visit, watch live AI orchestration transcribe it, generate a SOAP note, suggest catalog-validated ICD-10 codes, and write a patient-friendly summary. Export to PDF.

**Status**: Sub-project #1 (Core Scribe) complete. Live streaming transcription and clinical intelligence (diarization, entity extraction, risk flagging) are roadmap items.

## Demo

> Record a 2–3 minute Loom or YouTube video using one of the scripts in [`docs/demo/demo-script.md`](docs/demo/demo-script.md) and link it here.

`[![MedScribe AI demo](docs/demo/thumbnail.png)](https://your-demo-video-url)`

## What it does

```
Doctor records in browser  →  Groq Whisper transcribes  →  Llama 3.3 70B
generates SOAP note  →  Llama suggests ICD-10 candidates  →  Local CMS
catalog validates them (drops fakes)  →  Llama writes a visit summary  →
Doctor reviews / edits / accepts codes  →  Download PDF
```

Live progress is streamed to the browser via **Server-Sent Events**, so the
doctor *sees* each step finish.

## Architecture

```
BROWSER (React + TS + Tailwind + shadcn/ui)
  Login / Register
  Record (MediaRecorder, webm/opus)
  Live Pipeline (SSE consumer)
  Workspace: Transcript | SOAP + ICD Review + Summary
        |
        | HTTPS + JWT, SSE stream
        v
BACKEND (FastAPI, async)
  Auth router       — register / login / me
  Sessions router   — CRUD, /audio upload, /stream SSE
  Export router     — /export.pdf (ReportLab)
  ScribePipeline    — orchestrates 5 steps as BackgroundTask, emits SSE events
        |
        +----------+----------+----------------+
        v                     v                v
  AI SERVICES           LOCAL DATA       CATALOG + EXPORT
  Groq Whisper          SQLite via       ICD-10-CM catalog
  Groq Llama 3.3 70B    SQLAlchemy       (seeded from CMS TSV)
  (single API key)      5 tables         ReportLab PDF
```

## Tech stack

| Layer | Choices |
|-------|---------|
| Frontend | React 19, TypeScript, Vite, TailwindCSS v4, shadcn-style components, TanStack Query, Zustand, Framer Motion, lucide-react |
| Backend | FastAPI, SQLAlchemy 2.0, SQLite, Alembic, Pydantic v2, sse-starlette, ReportLab |
| AI | Groq Whisper (`whisper-large-v3-turbo`), Groq Llama 3.3 70B Versatile — both on the free tier |
| Auth | JWT (HS256) via python-jose, bcrypt via passlib |
| Tests | pytest (backend), 18 tests, all mocking Groq — no API calls in CI |

## Setup (local-only)

You need Python 3.12, Node 20+, and a free [Groq API key](https://console.groq.com).

```bash
git clone <this-repo>
cd MedScribe-AI-Ambient-Clinical-Documentation-Assistant

# Backend
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
cp .env.example .env
# edit .env: set GROQ_API_KEY=gsk_...
.venv/bin/alembic upgrade head
.venv/bin/python -m app.catalog.seed_icd10
.venv/bin/uvicorn app.main:app --reload

# Frontend (new terminal)
cd ../frontend
npm install
cp .env.example .env  # VITE_API_URL=http://localhost:8000
npm run dev
```

Open <http://localhost:5173>, register an account, click **New session**, fill in a non-PHI patient label, and record yourself reading one of the demo scripts.

> **Demo mode — do not enter real PHI.** The UI shows a permanent banner. Use synthetic patient names (`Patient #1`, `John D.`) and the demo scripts under `docs/demo/`.

## Project structure

```
backend/
  app/
    api/             FastAPI routers (auth, sessions, export)
    services/        auth_service, scribe_pipeline, pdf_service, event_bus, icd_validator
    ai/              groq_client, stt (Whisper), llm (chat + JSON mode + retry)
    prompts/         SOAP / ICD / summary prompt templates
    models/          SQLAlchemy ORM — 5 tables
    schemas/         Pydantic request/response models
    catalog/         ICD-10 seeder + vendored 51-code sample TSV
  alembic/           migrations
  tests/             18 tests, all mocking Groq

frontend/
  src/
    pages/           Login, Register, Dashboard, Workspace, SessionDetail
    components/      AppShell, PatientHeader, PipelineStrip, Transcript/SoapPanel,
                     IcdSuggestionsList, SummaryCard, ProtectedRoute, ui/*
    hooks/           useAuth, useRecorder (MediaRecorder), useScribeSession (SSE)
    services/        api (typed fetch wrapper)
    store/           auth (Zustand + localStorage)

docs/
  superpowers/
    specs/           design spec (canonical reference)
    plans/           implementation plan checklist
  demo/              demo-script.md + golden outputs
```

## ICD-10 catalog

The repo vendors a 51-code sample TSV at `backend/app/catalog/icd10_sample.tsv`,
covering chest pain, HTN, T2DM, URI, migraine, GERD, low back pain, anxiety,
depression, and other common chief complaints. Drop the full **CMS ICD-10-CM
order file** (free, ~70K codes) at the same path and the seeder picks it up.

LLM-proposed codes are looked up in this catalog before being shown to the doctor.
Unknown codes are kept but flagged as `Unverified` so you can see what the LLM
proposed and what the catalog rejected — the validation story is transparent.

## Tests

```bash
cd backend
.venv/bin/pytest -v
```

18 tests across `test_auth.py`, `test_icd_validator.py`, `test_scribe_pipeline.py`,
`test_sessions_api.py`, and `test_export.py`. All Groq calls are mocked via a
`conftest.py` fixture — tests never hit the real API.

## Roadmap

| # | Sub-project | What it adds |
|---|-------------|--------------|
| 1 ✅ | **Core Scribe** (this) | Record → SOAP + ICD + Summary → PDF |
| 2 | Live Streaming | Chunked Whisper, live transcript as the doctor talks |
| 3 | Clinical Intelligence | Speaker diarization, entity extraction, risk flagging, AI follow-up questions |

## Design docs

- Spec: [`docs/superpowers/specs/2026-05-20-medscribe-core-design.md`](docs/superpowers/specs/2026-05-20-medscribe-core-design.md)
- Plan: [`docs/superpowers/plans/2026-05-20-medscribe-core-plan.md`](docs/superpowers/plans/2026-05-20-medscribe-core-plan.md)

## License

For portfolio / educational use. Not for clinical decision-making.
