from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session as DbSession

from app.models import IcdCatalog


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


def _register_and_token(client: TestClient) -> str:
    r = client.post(
        "/auth/register", json={"email": "doc@example.com", "password": "supersecret"}
    )
    assert r.status_code == 201, r.text
    return r.json()["access_token"]


def test_full_session_lifecycle(
    client: TestClient, db_session: DbSession, mock_groq: dict[str, Any]
) -> None:
    _seed_catalog(db_session)
    token = _register_and_token(client)
    auth = {"Authorization": f"Bearer {token}"}

    # Create session
    create = client.post(
        "/sessions",
        json={"patient_label": "Patient #1", "chief_complaint": "chest pain"},
        headers=auth,
    )
    assert create.status_code == 201, create.text
    session_id = create.json()["id"]

    # Upload audio — BackgroundTask runs after response in TestClient
    upload = client.post(
        f"/sessions/{session_id}/audio",
        files={"file": ("clip.webm", b"fake-audio-bytes", "audio/webm")},
        headers=auth,
    )
    assert upload.status_code == 202, upload.text

    # Fetch the completed session
    detail = client.get(f"/sessions/{session_id}", headers=auth)
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert body["status"] == "completed", body
    assert body["transcript_text"] == mock_groq["transcript"]
    assert body["visit_summary"] == mock_groq["summary"]["summary"]
    assert body["soap_note"]["subjective"] == mock_groq["soap"]["subjective"]
    assert len(body["icd_suggestions"]) == 1
    assert body["icd_suggestions"][0]["code"] == "R07.9"
    assert body["icd_suggestions"][0]["is_validated"] is True


def test_list_sessions_returns_user_sessions_only(
    client: TestClient, db_session: DbSession
) -> None:
    token = _register_and_token(client)
    auth = {"Authorization": f"Bearer {token}"}

    for label in ("Patient A", "Patient B"):
        client.post("/sessions", json={"patient_label": label}, headers=auth)

    listed = client.get("/sessions", headers=auth)
    assert listed.status_code == 200
    body = listed.json()
    assert len(body) == 2
    assert {b["patient_label"] for b in body} == {"Patient A", "Patient B"}


def test_get_session_404_for_other_user(client: TestClient) -> None:
    # User A creates a session
    a_token = client.post(
        "/auth/register", json={"email": "a@example.com", "password": "supersecret"}
    ).json()["access_token"]
    a_session = client.post(
        "/sessions",
        json={"patient_label": "X"},
        headers={"Authorization": f"Bearer {a_token}"},
    ).json()["id"]

    # User B should not see it
    b_token = client.post(
        "/auth/register", json={"email": "b@example.com", "password": "supersecret"}
    ).json()["access_token"]
    resp = client.get(
        f"/sessions/{a_session}", headers={"Authorization": f"Bearer {b_token}"}
    )
    assert resp.status_code == 404


def test_update_soap(
    client: TestClient, db_session: DbSession, mock_groq: dict[str, Any]
) -> None:
    _seed_catalog(db_session)
    token = _register_and_token(client)
    auth = {"Authorization": f"Bearer {token}"}
    session_id = client.post(
        "/sessions", json={"patient_label": "P"}, headers=auth
    ).json()["id"]
    client.post(
        f"/sessions/{session_id}/audio",
        files={"file": ("clip.webm", b"x", "audio/webm")},
        headers=auth,
    )

    patched = client.patch(
        f"/sessions/{session_id}/soap",
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
    session_id = client.post(
        "/sessions", json={"patient_label": "P"}, headers=auth
    ).json()["id"]
    client.post(
        f"/sessions/{session_id}/audio",
        files={"file": ("clip.webm", b"x", "audio/webm")},
        headers=auth,
    )

    detail = client.get(f"/sessions/{session_id}", headers=auth).json()
    icd_id = detail["icd_suggestions"][0]["id"]

    accepted = client.patch(
        f"/sessions/{session_id}/icd/{icd_id}",
        json={"accepted": True},
        headers=auth,
    )
    assert accepted.status_code == 200
    assert accepted.json()["icd_suggestions"][0]["accepted_by_user"] is True
