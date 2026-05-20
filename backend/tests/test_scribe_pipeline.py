from typing import Any

import pytest
from sqlalchemy.orm import Session as DbSession

from app.models import ConsultSession, IcdCatalog, IcdSuggestion, SessionStatus, SoapNote, User
from app.services.event_bus import EventBus
from app.services.scribe_pipeline import ScribePipeline


@pytest.fixture
def seeded_session(db_session: DbSession) -> int:
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
    s = ConsultSession(user_id=user.id, patient_label="Patient #1")
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


def test_pipeline_happy_path_persists_everything(
    db_session: DbSession, seeded_session: int, mock_groq: dict[str, Any]
) -> None:
    bus = EventBus()
    pipeline = ScribePipeline(bus=bus)

    pipeline.run(seeded_session, b"fake-audio", "clip.webm", db_session)

    consult = db_session.get(ConsultSession, seeded_session)
    assert consult is not None
    assert consult.status == SessionStatus.completed
    assert consult.transcript_text == mock_groq["transcript"]
    assert consult.visit_summary == mock_groq["summary"]["summary"]
    assert consult.completed_at is not None

    soap = db_session.query(SoapNote).filter_by(session_id=seeded_session).one()
    assert soap.subjective == mock_groq["soap"]["subjective"]

    icds = db_session.query(IcdSuggestion).filter_by(session_id=seeded_session).all()
    assert len(icds) == 1
    assert icds[0].code == "R07.9"
    assert icds[0].is_validated is True

    events = _drain(bus, seeded_session)
    stages = [(e["stage"], e["status"]) for e in events]
    assert ("pipeline", "started") in stages
    assert ("transcribe", "done") in stages
    assert ("soap", "done") in stages
    assert ("icd_candidates", "done") in stages
    assert ("icd_validated", "done") in stages
    assert ("summary", "done") in stages
    assert ("pipeline", "complete") in stages


def test_pipeline_failure_sets_status_and_error(
    db_session: DbSession,
    seeded_session: int,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    bus = EventBus()

    def boom(*args: object, **kwargs: object) -> str:
        raise RuntimeError("Groq is down")

    monkeypatch.setattr("app.ai.stt.transcribe", boom, raising=False)

    pipeline = ScribePipeline(bus=bus)
    pipeline.run(seeded_session, b"fake-audio", "clip.webm", db_session)

    consult = db_session.get(ConsultSession, seeded_session)
    assert consult is not None
    assert consult.status == SessionStatus.failed
    assert consult.error_message is not None
    assert "Groq is down" in consult.error_message

    events = _drain(bus, seeded_session)
    assert any(e["stage"] == "pipeline" and e["status"] == "error" for e in events)
