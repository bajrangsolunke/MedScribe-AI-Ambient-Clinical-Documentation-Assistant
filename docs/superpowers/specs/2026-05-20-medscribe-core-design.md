# MedScribe AI — Sub-project #1: Core Scribe

**Date**: 2026-05-20
**Owner**: Bajrang Solunke
**Status**: Approved design, ready for implementation planning

## Context

MedScribe AI is an ambient AI clinical documentation assistant. The end-to-end vision is:

> Doctor speaks → AI transcribes → SOAP notes + ICD-10 codes + visit summary are generated → doctor reviews and edits → exports to PDF.

The full vision is large enough that it has been decomposed into three sub-projects, each shippable on its own:

| # | Sub-project | What it proves |
|---|-------------|----------------|
| **1** | **Core Scribe** (this doc) | End-to-end AI orchestration, structured extraction, healthcare domain |
| 2 | Live Streaming | Real-time AI systems, WebSockets / chunked Whisper |
| 3 | Clinical Intelligence | Speaker diarization, entity extraction, risk flagging, AI follow-ups |

Sub-project #1 is the foundation. It must stand alone as a credible portfolio demo even if #2 and #3 are never built.

## Goals

- A doctor can register, log in, record audio in the browser, and get back a SOAP note + validated ICD-10 codes + a short visit summary.
- All AI work happens through a single Groq API key (Whisper + Llama 3.3 70B), using free-tier models during development.
- Generated ICD-10 codes are validated against the official CMS ICD-10-CM catalog before being shown to the user.
- Sessions persist in SQLite and can be reviewed/edited later and exported to PDF.
- The whole project runs locally with a one-command setup. A polished demo video is the "deployed demo".

## Non-goals (deferred to later sub-projects)

- Live streaming transcription — Sub-project #2.
- Speaker diarization (doctor vs patient labels) — Sub-project #3.
- Clinical entity extraction (symptoms / meds / allergies as structured fields) — Sub-project #3.
- Risk flagging, AI follow-up questions — Sub-project #3.
- Cloud deployment, multi-tenant infra, Celery + Redis, Postgres — not needed at v1 scale.

## Locked-in choices

| Decision | Choice | Why |
|----------|--------|-----|
| Audio input | Browser `MediaRecorder`, batch upload after Stop | Real mic capture without WebSocket complexity |
| Speech-to-text | Groq Whisper (`whisper-large-v3-turbo`) | Free tier; ~5–10× real-time; same vendor as LLM |
| LLM | Groq Llama 3.3 70B Versatile | Free tier; strong JSON output; one API key for the whole pipeline |
| ICD-10 hallucination guard | Local CMS ICD-10-CM catalog in SQLite; LLM output is filtered through it | Deterministic validation prevents fake codes appearing in demos |
| Auth | Full JWT (register + login + bcrypt) | Standard portfolio bullet; cost is small over hardcoded creds |
| Database | SQLite via SQLAlchemy | Zero-setup; trivial to swap to Postgres later via DSN change |
| Async job handling | FastAPI `BackgroundTasks` + Server-Sent Events for live progress | Visually impressive ("watch the AI work") without Redis/Celery |
| Audio retention | Deleted immediately after transcription | Smaller PHI surface; healthcare best practice |
| PDF generation | Server-side via ReportLab | Consistent output, easy template, no client deps |
| Deployment | Local-only + polished demo video | Avoids hosting costs and public-URL PHI risk for v1 |

## Architecture

```
BROWSER (React + TS + Tailwind + shadcn/ui)
  Login / Register
  Record (MediaRecorder)
  Live Pipeline (SSE consumer)
  Workspace: Transcript | SOAP + ICD Review
        |
        | HTTPS + JWT, SSE stream
        v
BACKEND (FastAPI, async)
  Auth router       — register / login / me
  Sessions router   — CRUD, /audio upload, /stream SSE
  Export router     — /export.pdf
  ScribePipeline    — orchestrates 5 steps as BackgroundTask, emits SSE events
        |
        +----------+----------+----------------+
        v                     v                v
  AI SERVICES           LOCAL DATA       CATALOG + EXPORT
  Groq Whisper          SQLite via       ICD-10-CM catalog
  Groq Llama 3.3 70B    SQLAlchemy       (seeded from CMS TSV)
  (single API key)      5 tables         ReportLab PDF
```

### Scribe pipeline (the 5 steps)

Triggered by `POST /sessions/{id}/audio`. Runs as a single `BackgroundTask`. Emits progress events on the `/sessions/{id}/stream` SSE endpoint at each stage.

1. **Transcribe** — Groq Whisper transforms uploaded blob → text. Audio file deleted after success. SSE: `transcribe:done`.
2. **Generate SOAP** — Llama 3.3 70B, JSON mode, schema-validated. SSE: `soap:done`.
3. **Extract ICD candidates** — LLM proposes codes + descriptions + confidence + reasoning. SSE: `icd_candidates:done`.
4. **Validate against catalog** — every proposed code is looked up in `icd_catalog`. Unknown codes are dropped; survivors get `is_validated=true`. SSE: `icd_validated:done`.
5. **Visit summary** — LLM produces a 2–3 sentence patient-facing summary. SSE: `summary:done`, then `pipeline:complete`.

On any step failure: session `status = failed`, `error_message` set, SSE emits `error` event with stage and message. v1 supports retrying a failed session as a whole (`POST /sessions/{id}/retry` re-uploads audio and starts the pipeline from step 1). Per-step retry is out of scope.

## Backend structure

```
backend/
  app/
    main.py            FastAPI app, CORS, routers
    config.py          env vars (GROQ_API_KEY, JWT_SECRET, DB_URL)
    database.py        SQLAlchemy engine + session factory
    deps.py            get_current_user, get_db
    models/            SQLAlchemy ORM: User, Session, SoapNote, IcdSuggestion, IcdCatalog
    schemas/           Pydantic req/resp models per domain
    api/               routers: auth.py, sessions.py, export.py
    services/
      auth_service.py        bcrypt + JWT
      scribe_pipeline.py     orchestrates the 5 steps + emits SSE events
      pdf_service.py         ReportLab templates
    ai/
      groq_client.py         shared SDK init
      stt.py                 transcribe(audio_bytes) -> str
      llm.py                 complete_json(prompt, schema) -> dict, with retry
    prompts/
      soap.py / icd.py / summary.py
    catalog/
      seed_icd10.py          one-time loader from CMS ICD-10-CM TSV
  alembic/             migrations
  tests/
  pyproject.toml       uv-managed
  .env.example
```

### Why this structure

- `ai/` is isolated from `api/` so models stay swappable. Both today use Groq, but the abstraction costs nothing.
- `prompts/` is its own folder so prompts can iterate without touching service code — the #1 thing that will keep changing.
- `scribe_pipeline.py` owns end-to-end orchestration. One place to read, one place to change.

### API endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register` | Create user |
| POST | `/auth/login` | Returns JWT |
| GET | `/auth/me` | Current user |
| POST | `/sessions` | Create session, returns `session_id` |
| POST | `/sessions/{id}/audio` | Upload audio blob → kicks off pipeline as BackgroundTask |
| GET | `/sessions/{id}/stream` | SSE: pipeline progress events |
| GET | `/sessions/{id}` | Full session payload (transcript + SOAP + ICDs + summary) |
| GET | `/sessions` | List user's sessions |
| GET | `/sessions/{id}/export.pdf` | PDF download |

All routes except `/auth/register` and `/auth/login` require a valid JWT via `Authorization: Bearer <token>`.

## Data model

### `users`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| email | TEXT UNIQUE | |
| password_hash | TEXT | bcrypt |
| created_at | DATETIME | |

### `sessions`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| user_id | INTEGER FK → users.id | |
| patient_label | TEXT | Display name only — placeholder "Patient #N", no PHI |
| chief_complaint | TEXT NULL | Optional free text |
| status | ENUM | `created` / `processing` / `completed` / `failed` |
| transcript_text | TEXT NULL | Inlined for v1 (separate table returns in Sub-project #2 for chunked streaming) |
| visit_summary | TEXT NULL | 2–3 sentence patient summary |
| error_message | TEXT NULL | Set when status=failed |
| started_at | DATETIME | |
| completed_at | DATETIME NULL | |

### `soap_notes` — 1:1 with `sessions`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| session_id | INTEGER FK UNIQUE | |
| subjective | TEXT | |
| objective | TEXT | |
| assessment | TEXT | |
| plan | TEXT | |
| created_at | DATETIME | |
| edited_at | DATETIME NULL | Set when doctor edits |

### `icd_suggestions` — N per session
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| session_id | INTEGER FK | |
| code | TEXT | e.g., `R07.9` |
| description | TEXT | |
| confidence | REAL | 0.0–1.0 from LLM |
| reasoning | TEXT | LLM justification snippet |
| is_validated | BOOL | TRUE if found in `icd_catalog` |
| accepted_by_user | BOOL NULL | NULL = not reviewed, TRUE/FALSE after doctor decides |

### `icd_catalog` — seeded once, ~70K rows
| Column | Type | Notes |
|---|---|---|
| code | TEXT PK | |
| short_description | TEXT | |
| long_description | TEXT | |
| chapter | TEXT | e.g., "Diseases of the circulatory system" |

Seed source: official CMS ICD-10-CM TSV (free). Seeder is idempotent — re-runs do nothing if catalog already populated.

## Frontend structure

```
frontend/src/
  pages/
    LoginPage.tsx
    RegisterPage.tsx
    DashboardPage.tsx       Sessions list
    WorkspacePage.tsx       New / live session (Layout A: split workspace)
    SessionDetailPage.tsx   Read-only past session (same layout, no Record button)
  components/
    PatientHeader.tsx       Patient label + chief complaint + Record/Stop button
    PipelineStrip.tsx       Horizontal step indicators driven by SSE state
    TranscriptPanel.tsx     Left column
    SoapPanel.tsx           Right column (editable, save on blur)
    IcdSuggestionsList.tsx  Below SOAP, each row has accept/reject + Verified badge
    SummaryCard.tsx         Footer card with visit summary
  hooks/
    useAuth.ts              JWT in localStorage, login/logout, attach to fetch
    useRecorder.ts          MediaRecorder lifecycle → final Blob
    useScribeSession.ts     POSTs audio, subscribes to SSE, reduces events into state
  services/api.ts           Typed fetch wrappers
  store/                    Zustand for cross-page UI state
  routes.tsx                React Router
```

Stack: React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui + TanStack Query + Zustand + Framer Motion (subtle).

### Main workspace layout (Layout A — Split Workspace)

```
+--------------------------------------------------------------+
| MedScribe AI                                Dr. Jyoti  Logout|
+--------------------------------------------------------------+
| Patient #3   "chest pain, 2 days"        [ ● Recording 0:42 ]|
+--------------------------------------------------------------+
| ✓ transcribe   ✓ SOAP   … ICD   summary                      |
+----------------------------+---------------------------------+
| TRANSCRIPT                 | SOAP NOTE                       |
| "Patient reports sharp     | S: 47y M, sharp L-chest pain… |
|  chest pain on the left    | O: ...                          |
|  side, started two days    | A: ...                          |
|  ago..."                   | P: ...                          |
|                            |                                 |
|                            | ICD-10 SUGGESTIONS              |
|                            | R07.9 Chest pain      [✓ verified] [accept] [reject] |
|                            | R51.9 Headache        [✓ verified] [accept] [reject] |
|                            |                                 |
|                            | VISIT SUMMARY                   |
|                            | "Patient presents with..."      |
+----------------------------+---------------------------------+
```

## Quality

### Backend tests (pytest)

| Layer | What we test |
|---|---|
| Unit | Auth: bcrypt round-trip, JWT encode/decode, expiry |
| Unit | ICD validator: real code passes, fake code rejected, case-insensitive |
| Unit | Prompt → schema: LLM JSON parses into Pydantic SOAP/ICD schemas |
| Unit | PDF service: renders without error, output is valid PDF bytes |
| Integration | Happy path: register → login → create session → upload audio → poll → SOAP+ICDs persisted |
| Integration | Failure paths: bad audio file, Groq rate-limit, LLM invalid JSON → status=failed, error_message set |

**Hard rule**: tests never hit real Groq. A `conftest.py` fixture monkey-patches `ai.stt.transcribe` and `ai.llm.complete_json` to return canned fixtures. Protects free-tier limits and keeps tests deterministic.

### Frontend tests (Vitest + RTL)

Lightweight:
- `useRecorder` hook lifecycle (mock MediaRecorder)
- `useScribeSession` hook: SSE events reduce correctly into pipeline state
- One smoke test per top-level page

Skip pixel snapshots.

### Demo assets

- `docs/demo/demo-script.md` — 3–5 synthetic patient conversations as text (read aloud while recording the demo video; satisfies "no real PHI")
- `docs/demo/golden-outputs/` — committed JSON of expected SOAP+ICDs per script for regression spotting after prompt changes

### CI

GitHub Actions: lint (ruff + eslint) → type-check (mypy + tsc) → tests. Block PR merges on failure. No deploy step.

## Risks and how we handle them

| Risk | Mitigation |
|---|---|
| Groq free-tier rate limits during demo recording | Use lightweight Llama variant if needed; tests never hit Groq; demo script keeps clips under 90s |
| ICD hallucination | Local catalog validation drops unknown codes before they reach the UI |
| Real PHI accidentally entered | Banner on workspace ("Demo mode — do not enter PHI"); placeholder `Patient #N` labels |
| Whisper struggles with strong accents / background noise | Pre-recorded synthetic transcripts in demo script avoid the worst cases for v1 |
| LLM returns malformed JSON | `ai.llm.complete_json` retries up to 3× with stricter prompt on retry; on final failure, session status=failed with clear error |
| Browser audio format inconsistency (webm vs mp4) | v1 targets Chromium-based browsers (Chrome, Edge, Brave), which produce webm/opus from `MediaRecorder`. Groq Whisper accepts webm directly — no transcoding, no ffmpeg dependency. Safari support is out of scope for v1 |

## Out-of-scope reminders

This spec is for **Sub-project #1 only**. Anything below is explicitly excluded:

- Live streaming transcription (chunked Whisper, WebSocket)
- Speaker diarization
- Clinical entity extraction as separate structured fields
- Risk flagging, AI follow-up questions
- Cloud deployment, Postgres, Redis, Celery
- Multi-tenancy beyond per-user session isolation
- Editing transcripts (only SOAP notes are editable in v1)

## Definition of done

- User can register, log in, record audio, see live pipeline progress, see SOAP + validated ICDs + summary, edit SOAP, accept/reject ICDs, and download a PDF.
- Sessions list shows past sessions with status badges; clicking opens the read-only detail view.
- All backend tests pass with mocked Groq; integration tests cover happy + failure paths.
- README has clear setup steps for a fresh machine: install `uv` and `node`, copy `.env.example` → `.env` (fill in `GROQ_API_KEY`), run the ICD catalog seeder once, then `uv run uvicorn app.main:app --reload` and `npm run dev`. No Docker required.
- A 2–3 minute demo video is recorded and linked in the README.
- A new clone-and-run takes under 10 minutes on a fresh machine.
