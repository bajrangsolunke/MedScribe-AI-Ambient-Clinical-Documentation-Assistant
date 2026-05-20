# MedScribe AI — Sub-project #1 Implementation Plan

> **Lightweight plan**: phases + checklists, not per-step TDD. See spec at [`docs/superpowers/specs/2026-05-20-medscribe-core-design.md`](../specs/2026-05-20-medscribe-core-design.md) for the canonical design. Build phases in order; commit after each checked group.

**Goal**: Ship Sub-project #1 (Core Scribe) end-to-end — auth, browser audio recording, Groq AI pipeline, ICD validation, SQLite persistence, PDF export, local-only.

**Tech stack**: FastAPI + SQLAlchemy + SQLite + Groq SDK + ReportLab + React + TypeScript + Vite + Tailwind + shadcn/ui + TanStack Query + Zustand.

---

## Phase 1 — Backend Foundation

**Goal**: A FastAPI app that boots, has SQLite via SQLAlchemy with all 5 tables migrated, has JWT auth working end-to-end, and has the ICD catalog seeded.

- [ ] Initialize `backend/` with `uv init`. Add deps: `fastapi`, `uvicorn[standard]`, `sqlalchemy`, `alembic`, `pydantic[email]`, `pydantic-settings`, `python-jose[cryptography]`, `passlib[bcrypt]`, `python-multipart`, `groq`, `reportlab`, `httpx`. Dev deps: `pytest`, `pytest-asyncio`, `pytest-cov`, `ruff`, `mypy`.
- [ ] Create `backend/app/config.py` — `Settings(BaseSettings)` with `GROQ_API_KEY`, `JWT_SECRET`, `JWT_ALGORITHM="HS256"`, `JWT_EXPIRE_MIN=60`, `DATABASE_URL="sqlite:///./medscribe.db"`.
- [ ] Create `backend/.env.example` with all settings keys (empty values).
- [ ] Create `backend/app/database.py` — SQLAlchemy `engine`, `SessionLocal`, `Base`, `get_db()` generator.
- [ ] Create `backend/app/models/` with one file per table: `user.py`, `session.py`, `soap_note.py`, `icd_suggestion.py`, `icd_catalog.py`. Match the schema in the spec exactly.
- [ ] Create `backend/app/main.py` — minimal `FastAPI()` app with CORS for `http://localhost:5173`, root health endpoint.
- [ ] `alembic init alembic`, point at `app.database.Base.metadata`, generate first migration, apply it.
- [ ] Verify: `uv run uvicorn app.main:app --reload` boots, `GET /` returns `{"ok": true}`.
- [ ] Create `backend/app/services/auth_service.py` — `hash_password`, `verify_password`, `create_access_token`, `decode_access_token`.
- [ ] Create `backend/app/schemas/auth.py` — `UserCreate`, `UserOut`, `LoginRequest`, `TokenResponse`.
- [ ] Create `backend/app/deps.py` — `get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db))`.
- [ ] Create `backend/app/api/auth.py` — `POST /auth/register`, `POST /auth/login`, `GET /auth/me`. Wire into `main.py`.
- [ ] Add `backend/tests/conftest.py` — fixtures: `client` (TestClient with override `get_db` → in-memory SQLite), `mock_groq` (monkeypatches `app.ai.stt.transcribe` and `app.ai.llm.complete_json`).
- [ ] Add `backend/tests/test_auth.py` — happy register, duplicate email rejects, login wrong-password rejects, `/me` returns user from JWT.
- [ ] Create `backend/app/catalog/seed_icd10.py` — CLI script (`uv run python -m app.catalog.seed_icd10`) that downloads/reads the CMS ICD-10-CM order file (XML or TSV), bulk-inserts into `icd_catalog`, idempotent (skip if already populated). For now, vendor a small sample (50 codes) at `backend/app/catalog/icd10_sample.tsv` so dev/test works without the full CMS download.
- [ ] Commit: `feat(backend): foundation — auth, models, ICD catalog seeder`.

**Done when**: `pytest` green, app boots, `seed_icd10` populates the catalog table.

---

## Phase 2 — AI Layer

**Goal**: Three clean wrappers (`stt.transcribe`, `llm.complete_json`, `ScribePipeline`) that are fully testable with mocked Groq.

- [ ] Create `backend/app/ai/groq_client.py` — `get_client()` returns a cached `groq.Groq(api_key=settings.GROQ_API_KEY)`.
- [ ] Create `backend/app/ai/stt.py` — `transcribe(audio_bytes: bytes, filename: str) -> str`. Calls `client.audio.transcriptions.create(file=(filename, audio_bytes), model="whisper-large-v3-turbo")`.
- [ ] Create `backend/app/ai/llm.py` — `complete_json(prompt: str, schema: type[BaseModel], model: str = "llama-3.3-70b-versatile", max_retries: int = 3) -> BaseModel`. Uses Groq chat completion with `response_format={"type": "json_object"}`, parses into the Pydantic schema, retries up to 3 times on validation error with a tightening hint appended to the prompt.
- [ ] Create `backend/app/prompts/soap.py` — `SOAP_PROMPT` template (string with `{transcript}` placeholder) matching the spec's "do not hallucinate, use only transcript" rule. Output JSON schema: `{subjective, objective, assessment, plan}`.
- [ ] Create `backend/app/prompts/icd.py` — `ICD_PROMPT` template. Output: array of `{code, description, confidence, reasoning}`.
- [ ] Create `backend/app/prompts/summary.py` — `SUMMARY_PROMPT` template. Output: `{summary: str}`.
- [ ] Create `backend/app/schemas/soap.py` — `SoapPayload(BaseModel)` with the 4 SOAP fields.
- [ ] Create `backend/app/schemas/icd.py` — `IcdCandidate(BaseModel)` and `IcdCandidates(BaseModel)` (wrapper with `codes: list[IcdCandidate]`).
- [ ] Create `backend/app/services/icd_validator.py` — `validate(candidates: list[IcdCandidate], db) -> list[IcdSuggestion]`. For each candidate, look up `code` in `icd_catalog` (case-insensitive); set `is_validated=True` if found, drop otherwise (or keep all with the flag — keep, so the user sees what was filtered).
- [ ] Create `backend/app/services/scribe_pipeline.py` — `ScribePipeline` class with `run(session_id, audio_bytes, filename, db, event_publisher)`. Executes the 5 steps in order, calls `event_publisher.emit(stage, status)` between steps, persists results to DB, updates `session.status` to `processing`/`completed`/`failed` with `error_message`.
- [ ] Create `backend/app/services/event_bus.py` — in-memory `asyncio.Queue` per session_id, used by SSE endpoint to consume events emitted by the pipeline.
- [ ] Add `backend/tests/test_icd_validator.py` — real code in catalog → `is_validated=True`; fake code → `is_validated=False`; case-insensitive match.
- [ ] Add `backend/tests/test_scribe_pipeline.py` — full pipeline with mocked `stt.transcribe` + `llm.complete_json`. Assert: emits 5 stage events, persists SOAP + ICDs + summary, session status flips to `completed`. Failure path: LLM raises → status=`failed`, error_message set.
- [ ] Commit: `feat(backend): AI layer — STT, LLM, scribe pipeline with mockable seam`.

**Done when**: pipeline tests green with mocks; no test ever hits real Groq.

---

## Phase 3 — Backend API surface

**Goal**: All session endpoints from the spec wired and tested.

- [ ] Create `backend/app/schemas/session.py` — `SessionCreate`, `SessionOut`, `SessionDetail` (includes nested SOAP + ICDs + summary).
- [ ] Create `backend/app/api/sessions.py`:
  - `POST /sessions` (auth) — create empty session, return `session_id` and `patient_label`.
  - `POST /sessions/{id}/audio` (auth, multipart) — accept audio blob, schedule `BackgroundTask(ScribePipeline.run, ...)`, return `202 Accepted`.
  - `GET /sessions/{id}/stream` (auth, SSE) — `EventSourceResponse` that pulls from the session's `asyncio.Queue` and yields `event: stage_done\ndata: {...}\n\n` lines until pipeline complete or failed.
  - `GET /sessions/{id}` (auth) — full payload.
  - `GET /sessions` (auth) — list user's sessions (id, patient_label, status, started_at, completed_at).
  - `POST /sessions/{id}/retry` (auth) — only valid when status=`failed`; requires re-uploading audio.
  - `PATCH /sessions/{id}/soap` (auth) — update SOAP fields, set `edited_at`.
  - `PATCH /sessions/{id}/icd/{icd_id}` (auth) — body: `{accepted: bool}`, sets `accepted_by_user`.
- [ ] Add `sse-starlette` dep for `EventSourceResponse`.
- [ ] Create `backend/app/services/pdf_service.py` — `render_session_pdf(session: Session, soap: SoapNote, icds: list[IcdSuggestion]) -> bytes`. ReportLab `SimpleDocTemplate`: header (patient label + date), 4 SOAP sections, ICD table (code | description | accepted), summary at end.
- [ ] Create `backend/app/api/export.py` — `GET /sessions/{id}/export.pdf` (auth) returns `Response(content=bytes, media_type="application/pdf")`.
- [ ] Wire `auth`, `sessions`, `export` routers into `main.py`.
- [ ] Add `backend/tests/test_sessions_api.py` — full happy path: register → login → create session → POST audio → poll `GET /sessions/{id}` until completed → assert SOAP and ICDs populated. SSE test: subscribe, post audio, assert events arrive in order.
- [ ] Add `backend/tests/test_export.py` — PDF endpoint returns non-empty bytes starting with `%PDF`.
- [ ] Commit: `feat(backend): sessions API with SSE, retry, edit, PDF export`.

**Done when**: all backend endpoints from the spec table work; integration tests green.

---

## Phase 4 — Frontend Foundation

**Goal**: A React app that boots, has Tailwind + shadcn working, handles auth, has protected routes, and a polished Login/Register page.

- [ ] Scaffold: `cd frontend && npm create vite@latest . -- --template react-ts`. Add deps: `react-router-dom`, `@tanstack/react-query`, `zustand`, `axios` (or stick with `fetch`), `framer-motion`, `lucide-react`.
- [ ] Install Tailwind: follow Vite + Tailwind v4 setup. Add `tailwind.config.js`, `postcss.config.js`, base layer in `src/index.css`.
- [ ] Install shadcn: `npx shadcn@latest init` — pick neutral theme. Add components: `button`, `input`, `label`, `card`, `badge`, `dialog`, `toast`.
- [ ] Create `src/services/api.ts` — typed `fetch` wrapper: base URL from `VITE_API_URL`, attaches `Authorization: Bearer ${token}` when present, throws typed errors. Exposes `auth.register`, `auth.login`, `auth.me`, `sessions.create`, `sessions.uploadAudio`, `sessions.get`, `sessions.list`, `sessions.retry`, `sessions.updateSoap`, `sessions.setIcdAccepted`, `sessions.exportPdf`.
- [ ] Create `src/store/auth.ts` (Zustand) — `{token, user, login, logout, hydrate}`. Token persisted in `localStorage`.
- [ ] Create `src/hooks/useAuth.ts` — wraps store + `useEffect` hydration on mount. Provides `requireAuth(redirect)` helper.
- [ ] Create `src/components/ProtectedRoute.tsx` — redirects to `/login` when unauthenticated.
- [ ] Create `src/pages/LoginPage.tsx` and `src/pages/RegisterPage.tsx` — shadcn `Card` centered, `Input` + `Label`, submit calls API, redirects to `/` on success, toast on error.
- [ ] Create `src/routes.tsx` — `BrowserRouter` with routes: `/login`, `/register`, `/` (Dashboard), `/sessions/new` (Workspace), `/sessions/:id` (SessionDetail). Wrap protected ones in `<ProtectedRoute>`.
- [ ] Create `src/components/AppShell.tsx` — top bar (logo left, user email + Logout right). Wraps all protected pages.
- [ ] Wire `<QueryClientProvider>` and `<Toaster>` in `main.tsx`.
- [ ] Verify: `npm run dev`, navigate to `/register`, create a user against the live backend, log in, see (still-empty) dashboard.
- [ ] Commit: `feat(frontend): foundation — scaffold, auth, routing, login/register`.

**Done when**: register/login work against the running backend; protected routes redirect when logged out.

---

## Phase 5 — Frontend Workspace

**Goal**: The main split workspace works end-to-end against the live backend. Recording → live SSE → SOAP + ICD review → PDF download.

- [ ] Create `src/hooks/useRecorder.ts` — wraps `navigator.mediaDevices.getUserMedia({audio: true})` + `MediaRecorder` (mimeType `audio/webm;codecs=opus`). Exposes `{start, stop, isRecording, duration, audioBlob}`. Cleans up the stream on stop.
- [ ] Create `src/hooks/useScribeSession.ts` — manages: posting audio, opening `EventSource` to `/sessions/{id}/stream` (with token in querystring or header via `EventSourcePolyfill`), reducing SSE events into `{stage: 'transcribe' | 'soap' | ... , status: 'pending' | 'in_progress' | 'done' | 'error'}` array. Auto-closes EventSource on `pipeline:complete` or `error`. Refetches `GET /sessions/{id}` after completion to populate UI.
- [ ] Create `src/components/PatientHeader.tsx` — props: `patientLabel`, `chiefComplaint`, `isRecording`, `duration`, `onStart`, `onStop`. Renders the top patient strip with Record button (red when recording, shows MM:SS).
- [ ] Create `src/components/PipelineStrip.tsx` — props: `steps: {key, label, status}[]`. Renders horizontal pill row with check / spinner / pending state. Framer Motion fade on status change.
- [ ] Create `src/components/TranscriptPanel.tsx` — props: `transcript: string | null`. Renders left column with scrolling text or "Recording will appear here…" placeholder.
- [ ] Create `src/components/SoapPanel.tsx` — props: `soap: SoapPayload | null`, `onSave(updated)`. Each of S/O/A/P is a `<textarea>` with debounced save on blur. Empty placeholders while pipeline is running.
- [ ] Create `src/components/IcdSuggestionsList.tsx` — props: `icds: IcdSuggestion[]`, `onSetAccepted(id, accepted)`. Each row: bold code, description, "✓ Verified" badge when `is_validated`, Accept / Reject buttons (toggle highlight by `accepted_by_user`).
- [ ] Create `src/components/SummaryCard.tsx` — props: `summary: string | null`. Bordered card under the right column.
- [ ] Create `src/pages/WorkspacePage.tsx` — composes everything. On mount: `POST /sessions` to get a session_id, ask for `patient_label` + optional `chief_complaint` in a small dialog before recording. On Stop: `useScribeSession.start(sessionId, blob)`. Renders `PatientHeader` + `PipelineStrip` + grid of `TranscriptPanel | (SoapPanel + IcdSuggestionsList + SummaryCard)`.
- [ ] Create `src/pages/DashboardPage.tsx` — shadcn `Table`: patient_label, status badge (color by status), started_at, "Open" link to `/sessions/:id`. "New session" button → `/sessions/new`.
- [ ] Create `src/pages/SessionDetailPage.tsx` — same components as `WorkspacePage` but read-only `PatientHeader` (no Record button), SOAP still editable, "Download PDF" button calls `sessions.exportPdf` and triggers download.
- [ ] Add the **demo mode banner** (`<div>Demo mode — do not enter PHI</div>`) as part of `AppShell.tsx`.
- [ ] Smoke-test the full flow manually: record → see pipeline strip animate → see SOAP + ICDs populate → edit SOAP → accept/reject ICDs → download PDF → open `/` and confirm session appears in dashboard → click in → confirm everything persisted.
- [ ] Commit: `feat(frontend): workspace, dashboard, session detail with SSE + PDF`.

**Done when**: the demo flow works end-to-end against the live backend with no console errors.

---

## Phase 6 — Tests, Polish, Demo

**Goal**: Ship-ready repo: tests green, README runnable on a fresh machine, demo video recorded, CI passing.

- [ ] Add `frontend/src/hooks/__tests__/useRecorder.test.ts` — mocks `MediaRecorder` (use `vitest`), asserts start/stop/blob lifecycle.
- [ ] Add `frontend/src/hooks/__tests__/useScribeSession.test.ts` — mocks `EventSource`, feeds canned events, asserts the pipeline state reducer produces the right shape.
- [ ] Add smoke test for each top-level page (renders without crashing).
- [ ] Create `docs/demo/demo-script.md` — 3 synthetic patient conversations (chest pain, migraine follow-up, diabetes check-in), each ~60 seconds when read aloud. **All synthetic — no real PHI.**
- [ ] Create `docs/demo/golden-outputs/` — committed JSON files of expected SOAP + ICDs per script, generated once by running the live pipeline against each script.
- [ ] Write `README.md` at repo root:
  - Project description + 1-paragraph pitch
  - **Live demo video link** (embed thumbnail)
  - Architecture diagram (re-use the spec ASCII)
  - **Setup** (fresh-machine, target Chromium):
    1. `git clone …`
    2. Install [`uv`](https://docs.astral.sh/uv/) and Node 20+
    3. `cd backend && cp .env.example .env` → fill in `GROQ_API_KEY` (free at [console.groq.com](https://console.groq.com))
    4. `uv sync && uv run alembic upgrade head && uv run python -m app.catalog.seed_icd10`
    5. `uv run uvicorn app.main:app --reload`
    6. New terminal: `cd frontend && npm install && npm run dev`
    7. Open `http://localhost:5173`, register, demo!
  - Tech stack table
  - Project status: "Sub-project #1 (Core Scribe). Streaming and clinical intelligence are roadmap items."
- [ ] Create `.github/workflows/ci.yml` — matrix job: backend (`uv run ruff check`, `uv run mypy app`, `uv run pytest`) + frontend (`npm run lint`, `npm run type-check`, `npm run test`).
- [ ] Record the demo video (Loom or OBS): 2–3 min, walk through register → record one demo-script conversation → review SOAP → accept ICDs → download PDF → open dashboard.
- [ ] Update README with the demo video URL.
- [ ] Commit: `chore: tests, docs, CI, demo assets`.
- [ ] Tag: `git tag v0.1.0-core-scribe`.

**Done when**: a stranger can clone, follow the README, and have a working demo in under 10 minutes. CI green on `main`.

---

## What gets deferred (do NOT build in this plan)

These are out of scope per the spec — resist the urge to add them mid-build:

- Live streaming transcription, WebSockets — **Sub-project #2**
- Speaker diarization — **Sub-project #3**
- Clinical entity extraction (symptoms/meds/allergies as structured fields) — **Sub-project #3**
- Risk flagging / AI follow-up questions — **Sub-project #3**
- Cloud deployment, Postgres, Redis, Celery — not needed at this scale
- Editing transcripts (only SOAP is editable in v1)
- Safari support (Chromium only for v1)

---

## Order of execution

Strict phase order: 1 → 2 → 3 → 4 → 5 → 6. Don't start frontend (Phase 4) before backend API (Phase 3) works against curl/HTTPie — otherwise you'll debug two unknowns at once.
