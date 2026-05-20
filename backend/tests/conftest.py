from collections.abc import Generator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app


@pytest.fixture
def db_engine() -> Generator[Any, None, None]:
    """In-memory SQLite that is shared across the test's connections via StaticPool."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db_session(db_engine: Any) -> Generator[Any, None, None]:
    TestingSession = sessionmaker(bind=db_engine, autoflush=False, autocommit=False)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db_engine: Any) -> Generator[TestClient, None, None]:
    TestingSession = sessionmaker(bind=db_engine, autoflush=False, autocommit=False)

    def override_get_db() -> Generator[Any, None, None]:
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as c:
            yield c
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def mock_groq(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    """Stand-in for Groq calls. Tests override the canned values as needed."""
    canned: dict[str, Any] = {
        "transcript": "Patient reports sharp chest pain on the left side, started two days ago.",
        "soap": {
            "subjective": "47y M with sharp left-sided chest pain x 2 days.",
            "objective": "Vitals stable, no acute distress.",
            "assessment": "Likely musculoskeletal chest pain.",
            "plan": "NSAIDs, return if worsening.",
        },
        "icd_candidates": {
            "codes": [
                {
                    "code": "R07.9",
                    "description": "Chest pain, unspecified",
                    "confidence": 0.85,
                    "reasoning": "Patient explicitly reports chest pain.",
                },
            ],
        },
        "summary": {"summary": "Patient seen for left-sided chest pain x 2d; conservative plan."},
    }

    def fake_transcribe(audio_bytes: bytes, filename: str) -> str:
        return canned["transcript"]

    def fake_complete_json(prompt: str, schema: type, **kwargs: Any) -> Any:
        # Route by schema name — each pipeline stage uses a distinct schema
        name = schema.__name__
        if name == "SoapPayload":
            return schema.model_validate(canned["soap"])
        if name == "IcdCandidates":
            return schema.model_validate(canned["icd_candidates"])
        if name == "SummaryPayload":
            return schema.model_validate(canned["summary"])
        raise AssertionError(f"unexpected schema routed to mock: {name}")

    monkeypatch.setattr("app.ai.stt.transcribe", fake_transcribe, raising=False)
    monkeypatch.setattr("app.ai.llm.complete_json", fake_complete_json, raising=False)
    return canned
