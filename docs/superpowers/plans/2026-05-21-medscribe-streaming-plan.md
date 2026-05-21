# MedScribe AI — Sub-project #2 Implementation Plan

> **Lightweight plan**: phases + checklists, not per-step TDD. See spec at [`docs/superpowers/specs/2026-05-21-medscribe-streaming-design.md`](../specs/2026-05-21-medscribe-streaming-design.md) for the canonical design. Build phases in order; commit after each checked group.

**Goal**: Add live chunked transcription on top of #1. The doctor sees the transcript building as they talk; SOAP/ICD/summary still runs once after Stop.

**Tech stack**: No new deps. Reuses everything from #1 (FastAPI, SQLAlchemy, Groq Whisper, SSE-Starlette, React + Vite).

**Branch**: Continue on `feat/sub-project-1-core-scribe` (single branch for the whole project).

---

## Phase 1 — Backend: data model + services

**Goal**: Database can store streaming transcript chunks. Two clean services: `chunk_transcriber` for live chunks, `finalize_pipeline` for post-Stop SOAP/ICD/summary. Old `ScribePipeline` is gone.

- [ ] Create `backend/app/models/transcript.py` — `Transcript` model: `id` PK, `session_id` FK indexed, `sequence` int, `text` Text, `duration_ms` int nullable, `created_at` server_default `func.now()`. Add unique constraint on `(session_id, sequence)`.
- [ ] Add `Transcript` to `backend/app/models/__init__.py` exports.
- [ ] Add relationship on `ConsultSession`: `transcripts: Mapped[list["Transcript"]] = relationship(back_populates="session", cascade="all, delete-orphan", order_by="Transcript.sequence")`. Add reciprocal `session: Mapped["ConsultSession"] = relationship(back_populates="transcripts")` on `Transcript`.
- [ ] Add `recording` to the `SessionStatus` enum in `backend/app/models/consult_session.py` (between `created` and `processing`).
- [ ] `cd backend && .venv/bin/alembic revision --autogenerate -m "add streaming transcripts and recording status"` — verify the generated file adds the `transcripts` table and the new enum value (SQLite uses batch mode for the enum change; the existing `render_as_batch=True` already handles it).
- [ ] `.venv/bin/alembic upgrade head` — apply against the dev DB; confirm `transcripts` table exists and existing completed sessions still load.
- [ ] Create `backend/app/services/chunk_transcriber.py` — `transcribe_chunk(session_id, audio_bytes, sequence, filename, db, bus=event_bus, duration_ms=None) -> Transcript`. Steps inside: (1) check existing `Transcript(session_id, sequence)` — return it untouched if found (idempotent); (2) call `stt.transcribe(audio_bytes, filename)`; (3) persist `Transcript`; (4) append text + space to `session.transcript_text` (init to "" if None); (5) if first chunk (status==created), flip `session.status` to `recording`; (6) `bus.publish_sync(session_id, {stage:"transcribe", status:"fragment", ts:..., meta:{sequence, text}})`; (7) return the persisted row.
- [ ] Rename `backend/app/services/scribe_pipeline.py` → `backend/app/services/finalize_pipeline.py`. Class `ScribePipeline` → `FinalizePipeline`. Signature change: `run(session_id, db)` (no audio_bytes/filename params anymore). Drop step 1 (transcribe). Steps 2–5 unchanged but read transcript from `consult.transcript_text` (raise if empty before any LLM call). Update the SSE emit calls to keep the same event names.
- [ ] Update `backend/tests/conftest.py` mock_groq to vary the Whisper fragment per call so tests can assert ordering. Replace `fake_transcribe` with:
  ```python
  _call_count = {"n": 0}
  def fake_transcribe(audio_bytes: bytes, filename: str) -> str:
      _call_count["n"] += 1
      return f"fragment-{_call_count['n']}"
  ```
  Reset between tests via a fixture finalizer.
- [ ] Rename `backend/tests/test_scribe_pipeline.py` → `backend/tests/test_finalize_pipeline.py`. Update imports (`FinalizePipeline`), drop the `audio_bytes` arg from calls, preset `consult.transcript_text` in the fixture so the pipeline has something to work on. Keep both happy and failure cases.
- [ ] Add `backend/tests/test_chunk_transcriber.py`:
  - First chunk persists Transcript with sequence=0 + flips status to `recording` + appends to denormalized text + publishes one SSE event.
  - Second chunk with sequence=1 extends the denormalized text in order.
  - Duplicate `(session_id, sequence)` is a no-op (returns existing row, doesn't double-write).
  - Out-of-order arrival: sequence=1 then sequence=0 — both rows persist, denormalized text reflects insertion order (we accept this) but `session.transcripts` ordered relationship returns them by `sequence`.
- [ ] Run `.venv/bin/pytest -q` — old 18 tests minus the rewritten scribe_pipeline tests; new chunk_transcriber tests should bring total green.
- [ ] Commit: `feat(backend): Phase 1 — transcripts model + chunk_transcriber + finalize_pipeline (Sub-project #2)`.

**Done when**: migration applies cleanly, chunk_transcriber + finalize_pipeline tests green, conftest mock varies per call.

---

## Phase 2 — Backend: endpoints

**Goal**: `/audio-chunk` and `/finalize` work end-to-end; old `/audio` and `/retry` removed; integration tests cover the new lifecycle.

- [ ] Create `backend/app/schemas/transcript.py` — `TranscriptFragmentOut(BaseModel)` with `sequence: int`, `text: str`. Also `ChunkUploadResponse(BaseModel)` with `sequence: int`, `text: str`, `transcript_so_far: str`.
- [ ] Edit `backend/app/api/sessions.py`:
  - **Remove** the `upload_audio` route and the `retry_session` route entirely.
  - **Add** `POST /sessions/{id}/audio-chunk` route — accepts `file: UploadFile`, form field `sequence: int = Form(...)`, optional `duration_ms: int = Form(None)`. Verifies session owned by user + `status in (created, recording)` (409 otherwise). Reads bytes, calls `chunk_transcriber.transcribe_chunk(...)`, returns `ChunkUploadResponse(sequence, text, transcript_so_far=session.transcript_text)`.
  - **Add** `POST /sessions/{id}/finalize` route — verifies owned + `status == recording` + non-empty `transcript_text` (400 otherwise). Sets status to `processing`, schedules `BackgroundTask(_run_finalize_in_thread, session_id)`, returns `{"status": "accepted"}`.
  - Add `_run_finalize_in_thread(session_id)` helper that opens its own `SessionLocal()` and runs `FinalizePipeline().run(session_id, db)`.
- [ ] Wire is already in place — no `main.py` changes (router was already mounted in #1).
- [ ] Rewrite `backend/tests/test_sessions_api.py`:
  - `test_full_session_lifecycle`: create → upload chunk seq=0 → upload chunk seq=1 → finalize → poll `/sessions/{id}` until status=completed → assert SOAP + ICDs + summary populated. Assert `transcript_text` is the concatenation of both fragments.
  - `test_out_of_order_chunks_persist_correctly`: upload seq=1 first then seq=0, both rows in DB ordered by sequence via relationship, denormalized text reflects arrival order (documented behavior).
  - `test_finalize_without_chunks_is_400`: create → finalize without any chunk uploads → 400.
  - `test_finalize_twice_is_409`: chunk → finalize → second finalize → 409 (status moved past `recording`).
  - `test_duplicate_chunk_sequence_is_idempotent`: upload seq=0 twice — second call returns same fragment, no duplicate Transcript row.
  - Keep unchanged: `test_list_sessions_returns_user_sessions_only`, `test_get_session_404_for_other_user`, `test_update_soap`, `test_set_icd_accepted` — adapt setup to use chunks+finalize instead of one-shot audio.
- [ ] Edit `backend/tests/test_export.py` — in both tests, replace the single `/audio` POST with `client.post(f"/sessions/{sid}/audio-chunk", files={"file": (...)}, data={"sequence": "0"}, ...)` then `client.post(f"/sessions/{sid}/finalize", ...)` then poll.
- [ ] Run `.venv/bin/pytest -q` — full suite green (expect ~22 tests now).
- [ ] Run `.venv/bin/ruff check app tests` — clean.
- [ ] Commit: `feat(backend): Phase 2 — /audio-chunk and /finalize endpoints (Sub-project #2)`.

**Done when**: full backend suite green; old `/audio` and `/retry` are gone; new lifecycle test passes including out-of-order chunks.

---

## Phase 3 — Frontend: hooks + API client

**Goal**: `useRecorder` is a stop-restart loop. `useStreamingSession` manages the recording → finalizing → completed state machine. API client matches the new endpoints.

- [ ] Edit `frontend/src/services/api.ts`:
  - Remove `sessions.uploadAudio` and `sessions.retry`.
  - Add `sessions.uploadChunk(id: number, blob: Blob, sequence: number, durationMs?: number)` — POSTs `multipart/form-data` with `file` + `sequence` (string) + optional `duration_ms`. Returns `{sequence: number, text: string, transcript_so_far: string}`.
  - Add `sessions.finalize(id: number)` — POSTs JSON empty body, returns `{status: string}`.
  - `streamUrl(id, token)` unchanged.
- [ ] Rewrite `frontend/src/hooks/useRecorder.ts`:
  - New signature: `useRecorder({ chunkMs = 4000 })`. Returns `{ start(onChunk), stop(), isRecording, duration, error }`.
  - `onChunk: (blob: Blob, isFinal: boolean) => void` callback.
  - `start(onChunk)` opens the mic, creates a `MediaRecorder` with mimeType `audio/webm;codecs=opus`, listens to `dataavailable` and `onstop`. On `onstop`, package collected chunks into one blob and call `onChunk(blob, isFinal)`. Sets a `setInterval` every `chunkMs` that does `recorder.stop()` then `recorder = new MediaRecorder(stream); recorder.start()` to cycle.
  - `stop()` clears the interval, calls `recorder.stop()` with `isFinal=true` flag tracked in a ref so the `onstop` handler knows it's the last chunk.
  - Cleanup on unmount: clear interval, stop tracks, abandon any in-flight final blob.
- [ ] Add type alias in `frontend/src/types.ts`:
  ```ts
  export type ScribePhase = 'idle' | 'recording' | 'finalizing' | 'completed' | 'failed';
  ```
- [ ] Replace `frontend/src/hooks/useScribeSession.ts` with `frontend/src/hooks/useStreamingSession.ts`:
  - Exposes `{ phase, transcript, stages, error, pushChunk, finalize, reset }`.
  - `pushChunk(blob: Blob, isFinal: boolean)` — POSTs with auto-incremented sequence (in-flight uploads serialized via an `await` queue). If `isFinal`, awaits the upload then calls `finalize()`.
  - `finalize()` — sets phase to `finalizing`, calls `api.sessions.finalize(id)`. SSE has already been listening since the first chunk fired.
  - Opens SSE the first time `pushChunk` is called (not on hook mount — avoids extra connections for the patient-info form).
  - SSE event routing: `transcribe:fragment` → append `meta.text` to `transcript`; `<stage>:done` → flip that stage's status in `stages[]`; `pipeline:complete` → phase=completed, close SSE; `pipeline:error` → phase=failed, capture message.
- [ ] Add `frontend/src/hooks/__tests__/useRecorder.test.ts`:
  - Vitest with fake timers + mocked `MediaRecorder` / `navigator.mediaDevices.getUserMedia`.
  - `start(callback)` then advance timer by 4000ms → assert `callback` called once with a blob and `isFinal=false`.
  - Advance another 4000ms → second blob, isFinal=false.
  - `stop()` → assert callback called with `isFinal=true`.
  - Unmount mid-recording → assert MediaStream tracks were stopped.
- [ ] Add `frontend/src/hooks/__tests__/useStreamingSession.test.ts`:
  - Mock `fetch` (chunk uploads + finalize) and `EventSource`.
  - Push 2 chunks → assert 2 POSTs with sequence=0,1 and phase=`recording`.
  - Dispatch `transcribe:fragment` events with sequence=0,1 → assert transcript accumulates in order.
  - Push final chunk → assert `finalize()` called, phase moves to `finalizing`.
  - Dispatch `pipeline:complete` → phase=`completed`, SSE closed.
- [ ] Run `cd frontend && npx vitest run` (install `vitest @testing-library/react jsdom` as devDeps if missing: `npm i -D vitest @testing-library/react jsdom`; add a `vitest.config.ts` with jsdom env if needed; add `test` script to package.json: `"test": "vitest run"`).
- [ ] Run `npx tsc -b --noEmit` — clean.
- [ ] Run `npx eslint .` — clean.
- [ ] Commit: `feat(frontend): Phase 3 — useRecorder stop-restart loop + useStreamingSession (Sub-project #2)`.

**Done when**: both hook test files green; tsc + eslint clean.

---

## Phase 4 — Frontend: UI + docs

**Goal**: Workspace shows live transcript building during record; clicking Stop transitions through finalize; everything else unchanged.

- [ ] Edit `frontend/src/components/PipelineStrip.tsx`:
  - Accept a new prop `liveTranscriptActive?: boolean` (or extend the existing `stages` array with a leading `{ key: 'transcribe', label: 'Live transcript', status: 'in_progress' | 'done' | 'pending' }`).
  - Render the live pill with a subtle pulse animation (Framer Motion or a Tailwind `animate-pulse`) when active.
- [ ] Edit `frontend/src/components/TranscriptPanel.tsx`:
  - Add a `ref` on the scrollable inner div; `useEffect` after each transcript update to `scrollTo({ top: scrollHeight, behavior: 'smooth' })`.
  - When parent passes `live={true}`, render a pulsing dot (red, top-right of header) with the label "LIVE".
- [ ] Rewrite `frontend/src/pages/WorkspacePage.tsx` state flow:
  - Drop the `useRecorder` post-blob auto-kickoff block.
  - On Record button click: `recorder.start(blob => streaming.pushChunk(blob, isFinal))`. Pass `false` for `isFinal` from non-final chunks.
  - On Stop button click: `recorder.stop()` — the recorder's own `onstop` calls the callback with `isFinal=true`, which makes `pushChunk` await the upload and then call `finalize()` internally.
  - Render the live transcript bound to `streaming.transcript` (string) instead of `detail?.transcript_text`. After finalize, switch to reading `detail` from `useQuery` (already wired).
  - Right panel placeholder during recording: "SOAP, ICD, and summary will generate after you click Stop."
  - Pipeline strip appears as soon as `phase !== 'idle'` (so the Live transcript pill shows immediately).
- [ ] Edit `frontend/src/pages/SessionDetailPage.tsx` — no changes. (Confirm by smoke-test: opening a past completed session still renders correctly.)
- [ ] Edit `frontend/src/pages/DashboardPage.tsx` — no changes. (The new `recording` status badge: add `recording: { label: "Recording", variant: "info" }` to the status badge map so live-in-progress sessions render cleanly in the list.)
- [ ] Manual smoke test against the live backend (with real Groq key):
  - Backend: `cd backend && .venv/bin/uvicorn app.main:app --reload`.
  - Frontend: `cd frontend && npm run dev`.
  - Register → New session → Record → speak Script 1 for ~30 seconds → transcript should grow every ~4s in the left panel → Stop → pipeline strip animates → SOAP + ICDs + summary populate → edit one SOAP field → accept one ICD → Download PDF → open dashboard → confirm session shows as `Completed`.
- [ ] Edit `README.md`:
  - Update the "What it does" section to mention live transcription.
  - Update the demo flow under "Setup" to describe the new live behavior.
  - Bump the roadmap table: mark Sub-project #2 as ✅ done.
- [ ] Edit `docs/demo/demo-script.md`:
  - Add a "Tips for the streaming demo" subsection at the top noting that the transcript should appear during recording (so demo viewers see it filling in).
- [ ] Record a fresh 2–3 minute demo video showing the live flow; update the README link.
- [ ] Run all checks one last time: `cd backend && .venv/bin/pytest -q && .venv/bin/ruff check app tests` and `cd ../frontend && npx tsc -b --noEmit && npx eslint . && npx vitest run`.
- [ ] Commit: `feat(frontend): Phase 4 — workspace live transcript UI + docs (Sub-project #2)`.
- [ ] Optional tag: `git tag v0.2.0-live-streaming`.

**Done when**: full demo flow works end-to-end against the live backend; all tests green; README + demo script updated.

---

## What gets deferred (do NOT build in this plan)

- Speaker diarization → **Sub-project #3**
- Clinical entity extraction → **Sub-project #3**
- Risk flagging, AI follow-up questions → **Sub-project #3**
- True word-level streaming (<500 ms) → out of scope indefinitely
- Live SOAP updates during recording → spec rejected
- Pause / resume mid-recording → spec rejected
- Chunk overlap and dedup → may revisit if accuracy is an issue
- Audio playback / re-listening → out of scope

---

## Order of execution

Strict phase order: 1 → 2 → 3 → 4. Don't start frontend before backend is green — the new hooks depend on the new endpoints existing.

After Phase 2, you can verify the backend manually with `curl`:
```bash
TOKEN=$(curl -s -X POST localhost:8000/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"doc@example.com","password":"supersecret"}' | jq -r .access_token)
SID=$(curl -s -X POST localhost:8000/sessions -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"patient_label":"Patient #1"}' | jq -r .id)
curl -X POST "localhost:8000/sessions/$SID/audio-chunk" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/sample.webm" -F "sequence=0"
curl -X POST "localhost:8000/sessions/$SID/finalize" -H "Authorization: Bearer $TOKEN"
curl "localhost:8000/sessions/$SID" -H "Authorization: Bearer $TOKEN"
```
This is a useful checkpoint before touching frontend.
