from typing import Any

import pytest
from sqlalchemy.orm import Session as DbSession

from app.models import ConsultSession, IcdCatalog, IcdSuggestion, SessionStatus, SoapNote, User
from app.services.event_bus import EventBus
from app.services.finalize_pipeline import FinalizePipeline


@pytest.fixture
def seeded_session(db_session: DbSession) -> int:
    """A session in `recording` state with an accumulated transcript, ready to finalize."""
    db_session.add(
        IcdCatalog(
            code="R07.9",
            short_description="Chest pain, unspecified",
            long_description="Chest pain, unspecified",
            chapter="Symptoms",
        )
    )
    user = User(email="u@example.com", password_hash="x")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    s = ConsultSession(
        user_id=user.id,
        patient_label="Patient #1",
        status=SessionStatus.recording,
        transcript_text="Patient reports sharp chest pain on the left side, started two days ago.",
    )
    db_session.add(s)
    db_session.commit()
    db_session.refresh(s)
    return s.id


def _drain(bus: EventBus, session_id: int) -> list[dict[str, Any]]:
    q = bus.queue_for(session_id)
    out: list[dict[str, Any]] = []
    while not q.empty():
        ev = q.get_nowait()
        if "stage" in ev:  # skip the SENTINEL_CLOSE marker
            out.append(ev)
    return out


def test_finalize_happy_path_persists_soap_icds_summary(
    db_session: DbSession, seeded_session: int, mock_groq: dict[str, Any]
) -> None:
    bus = EventBus()
    pipeline = FinalizePipeline(bus=bus)

    pipeline.run(seeded_session, db_session)

    consult = db_session.get(ConsultSession, seeded_session)
    assert consult is not None
    assert consult.status == SessionStatus.completed
    assert consult.visit_summary == mock_groq["summary"]["summary"]
    assert consult.completed_at is not None
    # transcript_text is the seeded value — pipeline does not touch it.
    assert "chest pain" in (consult.transcript_text or "").lower()

    soap = db_session.query(SoapNote).filter_by(session_id=seeded_session).one()
    assert soap.subjective == mock_groq["soap"]["subjective"]

    icds = db_session.query(IcdSuggestion).filter_by(session_id=seeded_session).all()
    assert len(icds) == 1
    assert icds[0].code == "R07.9"
    assert icds[0].is_validated is True

    events = _drain(bus, seeded_session)
    stages = [(e["stage"], e["status"]) for e in events]
    assert ("pipeline", "started") in stages
    assert ("soap", "done") in stages
    assert ("icd_candidates", "done") in stages
    assert ("icd_validated", "done") in stages
    assert ("summary", "done") in stages
    assert ("pipeline", "complete") in stages
    # transcribe is no longer part of the pipeline — handled by chunk_transcriber
    assert not any(s for s in stages if s[0] == "transcribe")


def test_finalize_with_empty_transcript_fails_cleanly(db_session: DbSession) -> None:
    """If the doctor somehow finalizes without ever uploading a chunk, fail loud."""
    user = User(email="u@example.com", password_hash="x")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    s = ConsultSession(
        user_id=user.id,
        patient_label="Patient #1",
        status=SessionStatus.recording,
        transcript_text=None,
    )
    db_session.add(s)
    db_session.commit()
    db_session.refresh(s)

    bus = EventBus()
    FinalizePipeline(bus=bus).run(s.id, db_session)

    consult = db_session.get(ConsultSession, s.id)
    assert consult is not None
    assert consult.status == SessionStatus.failed
    assert "empty" in (consult.error_message or "").lower()

    events = _drain(bus, s.id)
    assert any(e["stage"] == "pipeline" and e["status"] == "error" for e in events)


def test_finalize_failure_sets_status_and_error(
    db_session: DbSession,
    seeded_session: int,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    bus = EventBus()

    def boom(*args: object, **kwargs: object) -> object:
        raise RuntimeError("LLM is down")

    monkeypatch.setattr("app.ai.llm.complete_json", boom, raising=False)

    FinalizePipeline(bus=bus).run(seeded_session, db_session)

    consult = db_session.get(ConsultSession, seeded_session)
    assert consult is not None
    assert consult.status == SessionStatus.failed
    assert "LLM is down" in (consult.error_message or "")

    events = _drain(bus, seeded_session)
    assert any(e["stage"] == "pipeline" and e["status"] == "error" for e in events)
