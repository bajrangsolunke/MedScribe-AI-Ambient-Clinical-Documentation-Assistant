from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session as DbSession

from app.models import ConsultSession, IcdCatalog, Transcript


def _seed_catalog(db: DbSession) -> None:
    db.add(
        IcdCatalog(
            code="R07.9",
            short_description="Chest pain, unspecified",
            long_description="Chest pain, unspecified",
            chapter="Symptoms",
        )
    )
    db.commit()


def _register_and_token(client: TestClient, email: str = "doc@example.com") -> str:
    r = client.post("/auth/register", json={"email": email, "password": "supersecret"})
    assert r.status_code == 201, r.text
    return r.json()["access_token"]


def _upload_chunk(
    client: TestClient,
    token: str,
    session_id: int,
    sequence: int,
    payload: bytes = b"fake-audio-bytes",
) -> dict[str, Any]:
    resp = client.post(
        f"/sessions/{session_id}/audio-chunk",
        files={"file": (f"chunk-{sequence}.webm", payload, "audio/webm")},
        data={"sequence": str(sequence)},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_full_session_lifecycle_with_chunks_and_finalize(
    client: TestClient, db_session: DbSession, mock_groq: dict[str, Any]
) -> None:
    _seed_catalog(db_session)
    token = _register_and_token(client)
    auth = {"Authorization": f"Bearer {token}"}

    sid = client.post(
        "/sessions",
        json={"patient_label": "Patient #1", "chief_complaint": "chest pain"},
        headers=auth,
    ).json()["id"]

    chunk0 = _upload_chunk(client, token, sid, 0)
    assert chunk0["sequence"] == 0
    assert chunk0["text"] == "fragment-1"
    assert chunk0["transcript_so_far"] == "fragment-1"

    chunk1 = _upload_chunk(client, token, sid, 1)
    assert chunk1["sequence"] == 1
    assert chunk1["text"] == "fragment-2"
    assert chunk1["transcript_so_far"] == "fragment-1 fragment-2"

    finalize = client.post(f"/sessions/{sid}/finalize", headers=auth)
    assert finalize.status_code == 202, finalize.text

    detail = client.get(f"/sessions/{sid}", headers=auth).json()
    assert detail["status"] == "completed", detail
    assert detail["transcript_text"] == "fragment-1 fragment-2"
    assert detail["visit_summary"] == mock_groq["summary"]["summary"]
    assert detail["soap_note"]["subjective"] == mock_groq["soap"]["subjective"]
    assert len(detail["icd_suggestions"]) == 1
    assert detail["icd_suggestions"][0]["is_validated"] is True


def test_first_chunk_flips_status_to_recording(
    client: TestClient, db_session: DbSession, mock_groq: dict[str, Any]
) -> None:
    token = _register_and_token(client)
    auth = {"Authorization": f"Bearer {token}"}
    sid = client.post("/sessions", json={"patient_label": "P"}, headers=auth).json()["id"]

    # Before any chunk: status = created
    assert client.get(f"/sessions/{sid}", headers=auth).json()["status"] == "created"

    _upload_chunk(client, token, sid, 0)

    # After first chunk: status = recording
    assert client.get(f"/sessions/{sid}", headers=auth).json()["status"] == "recording"


def test_finalize_without_chunks_is_409(
    client: TestClient, mock_groq: dict[str, Any]
) -> None:
    token = _register_and_token(client)
    auth = {"Authorization": f"Bearer {token}"}
    sid = client.post("/sessions", json={"patient_label": "P"}, headers=auth).json()["id"]

    resp = client.post(f"/sessions/{sid}/finalize", headers=auth)
    # session.status is still `created` (no chunk uploaded) → 409 from the
    # status guard, not 400 from the empty-transcript guard.
    assert resp.status_code == 409, resp.text


def test_finalize_twice_is_409(
    client: TestClient, db_session: DbSession, mock_groq: dict[str, Any]
) -> None:
    _seed_catalog(db_session)
    token = _register_and_token(client)
    auth = {"Authorization": f"Bearer {token}"}
    sid = client.post("/sessions", json={"patient_label": "P"}, headers=auth).json()["id"]
    _upload_chunk(client, token, sid, 0)

    first = client.post(f"/sessions/{sid}/finalize", headers=auth)
    assert first.status_code == 202
    # After first finalize completes, status is either processing (in-flight) or completed.
    # Either way, second finalize must be rejected.
    second = client.post(f"/sessions/{sid}/finalize", headers=auth)
    assert second.status_code == 409


def test_duplicate_chunk_sequence_is_idempotent(
    client: TestClient, db_session: DbSession, mock_groq: dict[str, Any]
) -> None:
    token = _register_and_token(client)
    auth = {"Authorization": f"Bearer {token}"}
    sid = client.post("/sessions", json={"patient_label": "P"}, headers=auth).json()["id"]

    a = _upload_chunk(client, token, sid, 0)
    b = _upload_chunk(client, token, sid, 0)

    assert a["text"] == b["text"] == "fragment-1"
    rows = db_session.query(Transcript).filter_by(session_id=sid).all()
    assert len(rows) == 1


def test_out_of_order_chunks_persist_correctly(
    client: TestClient, db_session: DbSession, mock_groq: dict[str, Any]
) -> None:
    token = _register_and_token(client)
    auth = {"Authorization": f"Bearer {token}"}
    sid = client.post("/sessions", json={"patient_label": "P"}, headers=auth).json()["id"]

    _upload_chunk(client, token, sid, 1)
    _upload_chunk(client, token, sid, 0)

    consult = db_session.get(ConsultSession, sid)
    assert consult is not None
    # Relationship orders by sequence; users always see spoken order in the UI.
    assert [t.sequence for t in consult.transcripts] == [0, 1]


def test_list_sessions_returns_user_sessions_only(client: TestClient) -> None:
    token = _register_and_token(client)
    auth = {"Authorization": f"Bearer {token}"}
    for label in ("Patient A", "Patient B"):
        client.post("/sessions", json={"patient_label": label}, headers=auth)

    listed = client.get("/sessions", headers=auth)
    assert listed.status_code == 200
    body = listed.json()
    assert len(body) == 2
    assert {b["patient_label"] for b in body} == {"Patient A", "Patient B"}


def test_delete_session_removes_it_and_children(
    client: TestClient, db_session: DbSession, mock_groq: dict[str, Any]
) -> None:
    _seed_catalog(db_session)
    token = _register_and_token(client)
    auth = {"Authorization": f"Bearer {token}"}
    sid = client.post("/sessions", json={"patient_label": "P"}, headers=auth).json()["id"]
    _upload_chunk(client, token, sid, 0)
    client.post(f"/sessions/{sid}/finalize", headers=auth)

    # Sanity: it's there
    assert client.get(f"/sessions/{sid}", headers=auth).status_code == 200

    deleted = client.delete(f"/sessions/{sid}", headers=auth)
    assert deleted.status_code == 204
    assert client.get(f"/sessions/{sid}", headers=auth).status_code == 404


def test_delete_session_404_for_other_user(client: TestClient) -> None:
    a_token = _register_and_token(client, "a@example.com")
    a_sid = client.post(
        "/sessions",
        json={"patient_label": "X"},
        headers={"Authorization": f"Bearer {a_token}"},
    ).json()["id"]
    b_token = _register_and_token(client, "b@example.com")
    resp = client.delete(
        f"/sessions/{a_sid}", headers={"Authorization": f"Bearer {b_token}"}
    )
    assert resp.status_code == 404


def test_retry_finalize_on_failed_session(
    client: TestClient,
    db_session: DbSession,
    monkeypatch: pytest.MonkeyPatch,
    mock_groq: dict[str, Any],
) -> None:
    """Force the first finalize to fail, then retry — should succeed cleanly."""
    from app.ai import llm

    _seed_catalog(db_session)
    token = _register_and_token(client)
    auth = {"Authorization": f"Bearer {token}"}
    sid = client.post("/sessions", json={"patient_label": "P"}, headers=auth).json()["id"]
    _upload_chunk(client, token, sid, 0)

    # First finalize: LLM blows up
    calls = {"n": 0}
    original_complete_json = llm.complete_json

    def fail_once(*args: object, **kwargs: object) -> object:
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("first run boom")
        return original_complete_json(*args, **kwargs)  # type: ignore[arg-type]

    monkeypatch.setattr("app.ai.llm.complete_json", fail_once)
    client.post(f"/sessions/{sid}/finalize", headers=auth)

    detail = client.get(f"/sessions/{sid}", headers=auth).json()
    assert detail["status"] == "failed"

    # Retry — should succeed this time
    retry = client.post(f"/sessions/{sid}/retry-finalize", headers=auth)
    assert retry.status_code == 202, retry.text

    detail = client.get(f"/sessions/{sid}", headers=auth).json()
    assert detail["status"] == "completed"
    assert detail["soap_note"] is not None
    assert detail["error_message"] is None


def test_retry_finalize_409_when_not_failed(
    client: TestClient, db_session: DbSession, mock_groq: dict[str, Any]
) -> None:
    token = _register_and_token(client)
    auth = {"Authorization": f"Bearer {token}"}
    sid = client.post("/sessions", json={"patient_label": "P"}, headers=auth).json()["id"]
    # status is `created`, not `failed`
    resp = client.post(f"/sessions/{sid}/retry-finalize", headers=auth)
    assert resp.status_code == 409


def test_get_session_404_for_other_user(client: TestClient) -> None:
    a_token = _register_and_token(client, "a@example.com")
    a_sid = client.post(
        "/sessions",
        json={"patient_label": "X"},
        headers={"Authorization": f"Bearer {a_token}"},
    ).json()["id"]

    b_token = _register_and_token(client, "b@example.com")
    resp = client.get(
        f"/sessions/{a_sid}", headers={"Authorization": f"Bearer {b_token}"}
    )
    assert resp.status_code == 404


def test_update_soap(
    client: TestClient, db_session: DbSession, mock_groq: dict[str, Any]
) -> None:
    _seed_catalog(db_session)
    token = _register_and_token(client)
    auth = {"Authorization": f"Bearer {token}"}
    sid = client.post("/sessions", json={"patient_label": "P"}, headers=auth).json()["id"]
    _upload_chunk(client, token, sid, 0)
    client.post(f"/sessions/{sid}/finalize", headers=auth)

    patched = client.patch(
        f"/sessions/{sid}/soap",
        json={
            "subjective": "edited subj",
            "objective": "edited obj",
            "assessment": "edited assess",
            "plan": "edited plan",
        },
        headers=auth,
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["soap_note"]["subjective"] == "edited subj"
    assert patched.json()["soap_note"]["edited_at"] is not None


def test_set_icd_accepted(
    client: TestClient, db_session: DbSession, mock_groq: dict[str, Any]
) -> None:
    _seed_catalog(db_session)
    token = _register_and_token(client)
    auth = {"Authorization": f"Bearer {token}"}
    sid = client.post("/sessions", json={"patient_label": "P"}, headers=auth).json()["id"]
    _upload_chunk(client, token, sid, 0)
    client.post(f"/sessions/{sid}/finalize", headers=auth)

    detail = client.get(f"/sessions/{sid}", headers=auth).json()
    icd_id = detail["icd_suggestions"][0]["id"]

    accepted = client.patch(
        f"/sessions/{sid}/icd/{icd_id}",
        json={"accepted": True},
        headers=auth,
    )
    assert accepted.status_code == 200
    assert accepted.json()["icd_suggestions"][0]["accepted_by_user"] is True
