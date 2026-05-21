from typing import Any

import pytest
from sqlalchemy.orm import Session as DbSession

from app.models import ConsultSession, SessionStatus, Transcript, User
from app.services.chunk_transcriber import transcribe_chunk
from app.services.event_bus import EventBus


@pytest.fixture
def session_id(db_session: DbSession) -> int:
    user = User(email="u@example.com", password_hash="x")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    s = ConsultSession(user_id=user.id, patient_label="Patient #1")
    db_session.add(s)
    db_session.commit()
    db_session.refresh(s)
    return s.id


def _events(bus: EventBus, sid: int) -> list[dict[str, Any]]:
    q = bus.queue_for(sid)
    out: list[dict[str, Any]] = []
    while not q.empty():
        ev = q.get_nowait()
        if "stage" in ev:
            out.append(ev)
    return out


def test_first_chunk_flips_status_and_publishes_fragment(
    db_session: DbSession, session_id: int, mock_groq: dict[str, Any]
) -> None:
    bus = EventBus()
    row = transcribe_chunk(session_id, b"audio0", 0, "c0.webm", db_session, bus=bus)

    assert row.sequence == 0
    assert row.text == "fragment-1"  # from mock_groq

    consult = db_session.get(ConsultSession, session_id)
    assert consult is not None
    assert consult.status == SessionStatus.recording
    assert consult.transcript_text == "fragment-1"

    events = _events(bus, session_id)
    assert len(events) == 1
    assert events[0]["stage"] == "transcribe"
    assert events[0]["status"] == "fragment"
    assert events[0]["meta"] == {"sequence": 0, "text": "fragment-1"}


def test_second_chunk_appends_in_order(
    db_session: DbSession, session_id: int, mock_groq: dict[str, Any]
) -> None:
    bus = EventBus()
    transcribe_chunk(session_id, b"audio0", 0, "c0.webm", db_session, bus=bus)
    transcribe_chunk(session_id, b"audio1", 1, "c1.webm", db_session, bus=bus)

    consult = db_session.get(ConsultSession, session_id)
    assert consult is not None
    # Whisper mock returns fragment-1, fragment-2 across calls; joined with a space.
    assert consult.transcript_text == "fragment-1 fragment-2"

    rows = db_session.query(Transcript).filter_by(session_id=session_id).order_by(Transcript.sequence).all()
    assert [r.sequence for r in rows] == [0, 1]
    assert [r.text for r in rows] == ["fragment-1", "fragment-2"]


def test_duplicate_sequence_is_idempotent(
    db_session: DbSession, session_id: int, mock_groq: dict[str, Any]
) -> None:
    bus = EventBus()
    first = transcribe_chunk(session_id, b"audio0", 0, "c0.webm", db_session, bus=bus)
    again = transcribe_chunk(session_id, b"audio0-retry", 0, "c0.webm", db_session, bus=bus)

    assert first.id == again.id
    assert again.text == "fragment-1"  # not re-transcribed to "fragment-2"

    rows = db_session.query(Transcript).filter_by(session_id=session_id).all()
    assert len(rows) == 1

    # Only one SSE event published (from the first call); duplicates are silent.
    events = _events(bus, session_id)
    assert len(events) == 1


def test_out_of_order_arrival_orders_relationship_by_sequence(
    db_session: DbSession, session_id: int, mock_groq: dict[str, Any]
) -> None:
    bus = EventBus()
    # Arrive seq=1 first, then seq=0
    transcribe_chunk(session_id, b"audio1", 1, "c1.webm", db_session, bus=bus)
    transcribe_chunk(session_id, b"audio0", 0, "c0.webm", db_session, bus=bus)

    consult = db_session.get(ConsultSession, session_id)
    assert consult is not None
    # Relationship is ordered by sequence; the relationship view shows spoken order.
    seqs = [t.sequence for t in consult.transcripts]
    assert seqs == [0, 1]

    # Denormalized text reflects arrival order (documented tradeoff: append-as-we-go).
    assert consult.transcript_text == "fragment-1 fragment-2"
