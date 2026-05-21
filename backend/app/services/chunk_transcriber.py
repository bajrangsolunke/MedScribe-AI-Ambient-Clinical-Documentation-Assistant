"""Per-chunk live transcription during a streaming session.

Each call:
- is idempotent on (session_id, sequence) — duplicate uploads are no-ops
- transcribes via Groq Whisper
- persists a Transcript row
- appends the fragment to ConsultSession.transcript_text (denormalized)
- flips ConsultSession.status to `recording` on the very first chunk
- publishes a `transcribe:fragment` SSE event so the browser updates live
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.ai import stt
from app.models import ConsultSession, SessionStatus, Transcript
from app.services.event_bus import EventBus, event_bus


def transcribe_chunk(
    session_id: int,
    audio_bytes: bytes,
    sequence: int,
    filename: str,
    db: Session,
    bus: EventBus | None = None,
    duration_ms: int | None = None,
) -> Transcript:
    bus = bus or event_bus

    # Idempotency: if this (session_id, sequence) already exists, return the
    # existing row without re-transcribing or re-publishing.
    existing = (
        db.query(Transcript)
        .filter(Transcript.session_id == session_id, Transcript.sequence == sequence)
        .first()
    )
    if existing is not None:
        return existing

    text = stt.transcribe(audio_bytes, filename)

    fragment = Transcript(
        session_id=session_id,
        sequence=sequence,
        text=text,
        duration_ms=duration_ms,
    )
    db.add(fragment)

    consult = db.get(ConsultSession, session_id)
    if consult is None:
        raise ValueError(f"session {session_id} not found")
    if consult.status == SessionStatus.created:
        consult.status = SessionStatus.recording
    consult.transcript_text = _append(consult.transcript_text, text)

    db.commit()
    db.refresh(fragment)

    bus.publish_sync(
        session_id,
        {
            "stage": "transcribe",
            "status": "fragment",
            "ts": datetime.now(UTC).isoformat(),
            "meta": {"sequence": sequence, "text": text},
        },
    )
    return fragment


def _append(current: str | None, fragment: str) -> str:
    if not current:
        return fragment
    if not fragment:
        return current
    sep = "" if current.endswith((" ", "\n")) else " "
    return f"{current}{sep}{fragment}"
