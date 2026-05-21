# MedScribe AI — Sub-project #2: Live Streaming

**Date**: 2026-05-21
**Owner**: Bajrang Solunke
**Status**: Approved design, ready for implementation planning
**Builds on**: [Sub-project #1 — Core Scribe](./2026-05-20-medscribe-core-design.md)

## Context

Sub-project #1 (Core Scribe) ships an end-to-end pipeline where the doctor
records a full visit, clicks Stop, and waits ~15 seconds for the SOAP/ICD/
summary to appear. It works, but the demo doesn't feel "real-time AI" —
the wow factor is hidden behind a loading spinner.

Sub-project #2 adds **live streaming transcription**: as the doctor speaks,
the transcript appears in the browser in near real time, chunk by chunk.
The post-transcribe steps (SOAP, ICD, summary) still run after the doctor
clicks Stop, matching how real ambient scribe products (Abridge, Suki) work.

## Goals

- Transcript appears in the workspace within ~5 seconds of being spoken, building incrementally as the doctor talks.
- Doctor experience: click Record, see words appear, click Stop, see SOAP/ICDs/summary pop in. No "uploading..." delay between record and transcript.
- Backend still runs entirely on Groq's free tier — no new AI vendor.
- Existing #1 endpoints that no longer make sense are removed; the streaming flow becomes the only recording path.
- All existing #1 features (PDF export, SOAP editing, ICD accept/reject, session history, JWT auth) keep working without changes.

## Non-goals

- True word-by-word streaming (<500 ms latency). Requires a streaming-native STT (Deepgram / AssemblyAI / self-hosted whisper-streaming) and a new vendor — deferred indefinitely.
- Live SOAP/ICD updates while the doctor is still talking. SOAP regenerates only once, after Stop. Avoids burning free-tier LLM calls and avoids the confusing UX of fields mutating mid-conversation.
- Voice activity detection for smarter chunk boundaries. We accept the small accuracy hit at chunk seams.
- Audio playback / re-listening. Audio is still deleted after transcription per #1's privacy stance.
- Coexistence with #1's batch upload flow — the streaming flow replaces it.
- Sub-project #3 features (diarization, entity extraction, risk flagging, AI follow-ups).

## Locked-in choices

| Decision | Choice | Why |
|----------|--------|-----|
| Latency target | **Chunked** — transcript updates every ~4s | Achievable on Groq's free tier; matches how real products feel; no new vendor |
| SOAP timing | **Only after Stop** | Realistic UX, keeps LLM call count low |
| Transport | **HTTP POST per chunk + existing SSE for transcript fragments** | Reuses 80% of #1's transport; no WebSocket dependency; no new auth scheme |
| Chunking strategy | **Stop-restart `MediaRecorder`** | Each chunk is a standalone WebM file Groq can decode. ~50–100 ms audio gap between chunks accepted as v1 tradeoff. |
| Chunk overlap | **None** | Boundary words may occasionally split or duplicate. Acceptable for demo; add overlap-and-dedup later if needed. |
| Coexistence with #1 | **Replace** — streaming is the only recording path | One flow, one user-facing UX, smaller codebase. Old `/audio` and `/retry` endpoints are removed. |

## Architecture

```
LIVE phase  (while doctor is talking)
─────────────────────────────────────
  Browser MediaRecorder loop:
    every ~4 seconds:
      stop()  →  onstop → blob  →  POST /sessions/{id}/audio-chunk?sequence=N
      start() // immediately, accept the ~100ms gap

  Backend on each chunk (synchronous):
    Groq Whisper(blob)  →  text
    persist Transcript(session_id, sequence, text, duration_ms)
    session.transcript_text += text
    bus.publish(session_id, { stage:"transcribe", status:"fragment",
                              meta: { sequence, text } })
    return { sequence, text, transcript_so_far }

  Frontend SSE consumer:
    on transcribe:fragment → append text to live transcript view
                              (auto-scroll to bottom, "live" pulse)


FINALIZE phase  (when doctor clicks Stop)
─────────────────────────────────────────
  Browser:
    flush last chunk (recorder.stop() emits final blob)  →  POST /sessions/{id}/finalize

  Backend (BackgroundTask):
    FinalizePipeline reads session.transcript_text and runs steps 2–5:
      SOAP  →  ICD candidates  →  validate against catalog  →  summary
    SSE events same as #1:
      soap:done, icd_candidates:done, icd_validated:done, summary:done, pipeline:complete

  Frontend:
    Pipeline strip animates as before; SOAP / ICDs / summary populate;
    user can edit SOAP, accept ICDs, download PDF.
```

### What changes vs Sub-project #1

| Layer | What | Why |
|---|---|---|
| Backend endpoints | `POST /sessions/{id}/audio` removed; `POST /sessions/{id}/retry` removed | Replaced by chunk + finalize |
| Backend endpoints | `POST /sessions/{id}/audio-chunk`, `POST /sessions/{id}/finalize` added | The new live flow |
| Backend services | `ScribePipeline` renamed `FinalizePipeline`; transcribe step removed | Transcribe is now incremental |
| Backend services | `services/chunk_transcriber.py` added | Single-purpose chunk handler |
| Database | `transcripts` table added (id, session_id, sequence, text, duration_ms, created_at); `sessions.status` enum gains `recording` value | The "chunked streaming" infra the original spec deferred to #2 |
| Frontend hooks | `useRecorder` rewritten as a stop-start loop with a chunk callback | Required for chunked streaming |
| Frontend hooks | `useScribeSession` replaced by `useStreamingSession` (recording + finalizing state machine) | New state model |
| Frontend components | `PipelineStrip` adds leading "Live transcript" pill; `TranscriptPanel` auto-scrolls with a pulse indicator | Surface the new live behavior |
| Tests | `test_chunk_transcriber.py` new; `test_finalize_pipeline.py` replaces `test_scribe_pipeline.py`; API + export tests updated to use chunk + finalize | Matches the new flow |

### What stays the same

JWT auth, session-create / list / detail / soap-patch / icd-patch / pdf-export endpoints, ICD catalog and validator, `event_bus`, `SoapPanel`, `IcdSuggestionsList`, `SummaryCard`, `PatientHeader`, `SessionDetailPage`, `DashboardPage`, all UI primitives, all design tokens. The Sub-project #1 spec's contract for "what a completed session looks like" is unchanged.

## Database

### New table — `transcripts`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| session_id | INTEGER FK → sessions.id | indexed |
| sequence | INTEGER | order of arrival, 0-based; uniqueness not enforced at DB level (network can resend) — backend dedupes on `(session_id, sequence)` before insert |
| text | TEXT | Whisper output for this chunk; may be empty if the chunk was silence |
| duration_ms | INTEGER | length of the chunk, useful for future "you said X at 0:12" |
| created_at | DATETIME | server time when chunk persisted |

### Modified — `sessions.status` enum
Adds **`recording`**. Flow:
```
created  →  recording  →  processing  →  completed | failed
            (first chunk)  (finalize)    (pipeline done / failed)
```

`sessions.transcript_text` remains a denormalized full transcript, updated as chunks arrive. The `FinalizePipeline` reads it directly so it does not need to re-join fragments at finalize time.

### Migration
Alembic auto-generates a single new revision: `add-streaming-transcripts.py`. The new enum value is applied via `render_as_batch=True` (already enabled in `env.py`).

## Backend changes

### Endpoints

| Method | Path | Status | Notes |
|---|---|---|---|
| POST | `/sessions/{id}/audio` | **removed** | |
| POST | `/sessions/{id}/retry` | **removed** | |
| POST | `/sessions/{id}/audio-chunk` | **new** | `multipart/form-data`: `file` (audio blob), `sequence` (form field). Synchronous: transcribes via Groq Whisper, persists `Transcript` row, appends to denormalized text, publishes SSE `transcribe:fragment`, returns `{sequence, text, transcript_so_far}`. First chunk sets `session.status = "recording"`. Idempotent on `(session_id, sequence)` — duplicate sequences are dropped silently. |
| POST | `/sessions/{id}/finalize` | **new** | Validates that `session.transcript_text` is non-empty (otherwise 400). Sets `status="processing"`, schedules `FinalizePipeline.run(session_id)` as BackgroundTask. Returns `{status: "accepted"}`. |
| GET | `/sessions/{id}/stream` | unchanged | Now also carries `transcribe:fragment` events during the live phase. |
| GET | `/sessions/{id}`, `/sessions`, PATCH `/sessions/{id}/soap`, PATCH `/sessions/{id}/icd/{icd_id}`, GET `/sessions/{id}/export.pdf` | unchanged | |

### Services

- **`services/chunk_transcriber.py`** *(new)* — `transcribe_chunk(session_id, audio_bytes, sequence, db, bus)`. Single purpose: idempotency check → Groq Whisper call → persist `Transcript` row → append to denormalized text → publish SSE event → flip status to `recording` on first chunk.
- **`services/scribe_pipeline.py` → `services/finalize_pipeline.py`** *(renamed + slimmed)* — drops the transcribe step. Class `FinalizePipeline.run(session_id, db)` runs only steps 2–5 (SOAP, ICD candidates, validate, summary) reading from `session.transcript_text`.
- **`services/event_bus.py`** — unchanged. Just carries a new event type (`transcribe:fragment`).

### Schemas

- `schemas/transcript.py` *(new)* — `TranscriptFragmentOut` for the chunk endpoint response.
- `schemas/session.py` — `SessionDetail` already exposes `transcript_text` (full text). Add `transcripts: list[TranscriptFragmentOut]` if we ever need the per-chunk breakdown in the UI; for v1, the denormalized text is enough.

## Frontend changes

### Hooks

- **`useRecorder`** *(rewritten)* —
  ```ts
  start(onChunk: (blob: Blob, isFinal: boolean) => void)
  stop()
  // emits a chunk via onChunk every ~4s, and one final chunk on stop()
  ```
  Internally a `setInterval` that calls `recorder.stop()` (firing `onstop` → blob → `onChunk`) and immediately `recorder.start()`. Cleans up the MediaStream on final stop / unmount.

- **`useStreamingSession`** *(replaces `useScribeSession`)* — state machine
  ```
  idle → recording → finalizing → completed | failed
  ```
  - In `recording`: accepts chunks from `useRecorder`, POSTs them with a sequence counter, in-flight uploads are queued so chunks arrive in order. Reduces SSE `transcribe:fragment` into accumulated `transcript` string.
  - On Stop: awaits the final chunk upload, calls `POST /finalize`, transitions to `finalizing`, reduces SSE pipeline events into `stages[]`.

### Components

- **`PipelineStrip`** — adds a leading "Live transcript" pill that pulses while recording, turns green when finalize starts. Existing SOAP / ICD candidates / Validate / Summary pills unchanged.
- **`TranscriptPanel`** — auto-scrolls to bottom as fragments arrive. Pulsing dot indicator when `phase === 'recording'`.
- **Unchanged**: `SoapPanel`, `IcdSuggestionsList`, `SummaryCard`, `PatientHeader`, `AppShell`, all `ui/*` primitives.

### Pages

- **`WorkspacePage`** — adjusted state flow:
  ```
  [ Patient label form ]
      → POST /sessions
  [ Record button | empty transcript | "Pipeline runs after Stop" placeholder ]
      → Record → recorder.start(onChunk → uploadChunk(seq++))
  [ Recording: live transcript filling left | placeholder right ]
      → Stop → recorder.stop() → final chunk → POST /finalize
  [ Finalizing: pipeline strip animating | SOAP/ICD/Summary populate ]
      → pipeline:complete → completed
  [ Completed: edit SOAP, accept ICDs, link to detail page for PDF ]
  ```
- **`SessionDetailPage`** — completely unchanged. Reads completed data the same way.
- **`DashboardPage`** — completely unchanged.

### API client (`services/api.ts`)

- **Remove** `sessions.uploadAudio`, `sessions.retry`.
- **Add** `sessions.uploadChunk(id, blob, sequence)` → returns `{sequence, text, transcript_so_far}`.
- **Add** `sessions.finalize(id)` → returns `{status: "accepted"}`.

## Quality

### Backend tests

| File | Change |
|---|---|
| `test_chunk_transcriber.py` *(new)* | Chunk persists Transcript row with correct sequence; appends to denormalized text in arrival order; publishes SSE `transcribe:fragment`; first chunk flips status to `recording`; duplicate sequence is no-op. |
| `test_scribe_pipeline.py` → `test_finalize_pipeline.py` *(renamed + slimmed)* | Same happy + failure paths as #1 but without the transcribe step. |
| `test_sessions_api.py` *(updated)* | Old `test_full_session_lifecycle` rewritten as: create → upload 2 chunks → finalize → poll until completed. Add: chunks arriving out of order still produce correctly-ordered transcript. Add: `/finalize` before any chunks returns 400. Cross-user 404, soap edit, ICD accept tests unchanged. |
| `test_export.py` *(minor)* | Replace `/audio` POST with two `/audio-chunk` POSTs + `/finalize`. |
| `conftest.py` `mock_groq` | Unchanged — chunk path uses `stt.transcribe`, already mocked. Returns a deterministic short fragment per call so ordering can be asserted. |

**Hard rule preserved**: tests never hit real Groq.

### Frontend tests

| File | Change |
|---|---|
| `useRecorder.test.ts` *(expanded)* | Mocked `MediaRecorder` on a fake timer. Assert: `start(callback)` fires `callback(blob)` every ~4s; `stop()` emits one final `callback(blob, isFinal=true)`; cleanup on unmount stops the stream. |
| `useStreamingSession.test.ts` *(new)* | Mock `fetch` for `/audio-chunk` + `EventSource`. Simulate fragment events → assert transcript accumulates in order. Simulate finalize → pipeline events → assert state transitions `recording` → `finalizing` → `completed`. |

### Migration safety

`alembic upgrade head` from #1's schema must apply cleanly: adds `transcripts` table + new `recording` enum value on `sessions.status`. Smoke test: run upgrade against a dev DB containing one already-completed Sub-project #1 session; confirm the session still loads end-to-end.

## Risks and how we handle them

| Risk | Mitigation |
|---|---|
| Chunk arrives out of order due to network jitter | Backend dedupes/orders on `(session_id, sequence)`; frontend uploads sequentially with `await` to make this rare in practice |
| Last chunk hasn't uploaded when Stop is clicked | Frontend awaits the final chunk's POST before calling `/finalize`; `/finalize` validates non-empty transcript_text |
| Groq Whisper free-tier rate limit during a long recording | ~15 chunks/min, well within 30 req/min limit. Backend logs 429 and emits `transcribe:fragment` with `status:"error"` for that chunk; the doctor sees a brief gap and can keep recording |
| MediaRecorder stop-restart drops ~100ms of audio | Documented tradeoff. Whisper transcribes the surrounding audio fine; demo viewers will not notice |
| Browser tab closed mid-recording | Server-side session is left in `recording` state with whatever transcript accumulated. A cleanup job (out of scope for v2) could reap stale recordings; for v1 the doctor just creates a new session |
| SSE connection drops mid-recording | Frontend reconnects automatically via the browser's built-in EventSource retry; backend per-session queue keeps unread events until reconnect |
| Existing Sub-project #1 sessions in the database | They have `status=completed` and existing soap_notes/icd_suggestions; the new transcripts table is empty for them; SessionDetailPage renders them unchanged |

## Out-of-scope reminders (Sub-project #3 territory)

- Speaker diarization (doctor vs patient labels on transcript fragments)
- Clinical entity extraction (symptoms / meds / allergies as structured fields)
- Risk flagging, AI follow-up questions
- True word-level streaming (<500 ms latency)
- Live SOAP/ICD updates during recording
- Pause / resume during a single recording
- Audio retention or re-listening

## Definition of done

- Doctor records a 60–90 second visit; transcript appears in the workspace within ~5 seconds of speaking, growing as they talk.
- Clicking Stop transitions to finalize; SOAP/ICD/summary populate within ~10 seconds.
- All Sub-project #1 features (edit SOAP, accept/reject ICDs, download PDF, view past sessions, JWT auth) still work end-to-end.
- All backend tests green with mocked Groq.
- Migration applies cleanly against a populated #1 dev database.
- README and demo script updated to reflect the new flow.
- A new 2–3 minute demo video shows the live-transcript flow in action.
