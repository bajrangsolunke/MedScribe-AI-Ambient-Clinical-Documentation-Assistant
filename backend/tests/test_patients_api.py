from typing import Any

import pytest
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


def _register_and_token(client: TestClient, email: str = "doc@example.com") -> str:
    r = client.post(
        "/auth/register", json={"email": email, "password": "supersecret"}
    )
    assert r.status_code == 201, r.text
    return r.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# --- Patient CRUD --------------------------------------------------------


def test_create_and_list_patient(client: TestClient) -> None:
    token = _register_and_token(client)
    create = client.post(
        "/patients",
        json={
            "full_label": "John D.",
            "date_of_birth": "1979-03-12",
            "notes": "allergy: penicillin",
        },
        headers=_auth(token),
    )
    assert create.status_code == 201, create.text
    body = create.json()
    assert body["full_label"] == "John D."
    assert body["date_of_birth"] == "1979-03-12"
    assert body["notes"] == "allergy: penicillin"
    assert body["visit_count"] == 0
    assert body["last_visit_at"] is None

    listed = client.get("/patients", headers=_auth(token))
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["id"] == body["id"]


def test_list_patients_user_scoped(client: TestClient) -> None:
    a = _register_and_token(client, "a@example.com")
    b = _register_and_token(client, "b@example.com")
    client.post("/patients", json={"full_label": "A's patient"}, headers=_auth(a))
    client.post("/patients", json={"full_label": "B's patient"}, headers=_auth(b))

    a_list = client.get("/patients", headers=_auth(a)).json()
    assert [p["full_label"] for p in a_list] == ["A's patient"]
    b_list = client.get("/patients", headers=_auth(b)).json()
    assert [p["full_label"] for p in b_list] == ["B's patient"]


def test_get_patient_cross_user_404(client: TestClient) -> None:
    a_token = _register_and_token(client, "a@example.com")
    a_pid = client.post(
        "/patients", json={"full_label": "X"}, headers=_auth(a_token)
    ).json()["id"]
    b_token = _register_and_token(client, "b@example.com")
    resp = client.get(f"/patients/{a_pid}", headers=_auth(b_token))
    assert resp.status_code == 404


def test_search_patients_by_label_substring(client: TestClient) -> None:
    token = _register_and_token(client)
    for label in ("John Doe", "Jane Smith", "Johnny B."):
        client.post("/patients", json={"full_label": label}, headers=_auth(token))

    hits = client.get("/patients", params={"q": "john"}, headers=_auth(token)).json()
    assert {p["full_label"] for p in hits} == {"John Doe", "Johnny B."}


def test_patch_patient_sets_updated_at(client: TestClient) -> None:
    token = _register_and_token(client)
    pid = client.post(
        "/patients", json={"full_label": "John"}, headers=_auth(token)
    ).json()["id"]

    patched = client.patch(
        f"/patients/{pid}",
        json={"full_label": "John (renamed)", "notes": "diabetic"},
        headers=_auth(token),
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["full_label"] == "John (renamed)"
    assert body["notes"] == "diabetic"
    assert body["updated_at"] is not None


def test_delete_patient_with_no_sessions_succeeds(client: TestClient) -> None:
    token = _register_and_token(client)
    pid = client.post(
        "/patients", json={"full_label": "John"}, headers=_auth(token)
    ).json()["id"]
    resp = client.delete(f"/patients/{pid}", headers=_auth(token))
    assert resp.status_code == 204
    assert client.get(f"/patients/{pid}", headers=_auth(token)).status_code == 404


def test_delete_patient_with_sessions_blocked_409(
    client: TestClient, db_session: DbSession, mock_groq: dict[str, Any]
) -> None:
    _seed_catalog(db_session)
    token = _register_and_token(client)
    pid = client.post(
        "/patients", json={"full_label": "John"}, headers=_auth(token)
    ).json()["id"]
    # Create a session linked to the patient
    client.post(
        "/sessions",
        json={"patient_label": "John", "patient_id": pid},
        headers=_auth(token),
    )
    resp = client.delete(f"/patients/{pid}", headers=_auth(token))
    assert resp.status_code == 409
    assert "delete the visits first" in resp.json()["detail"].lower()


# --- Session linking ------------------------------------------------------


def test_session_create_with_patient_id_links_correctly(
    client: TestClient, db_session: DbSession, mock_groq: dict[str, Any]
) -> None:
    _seed_catalog(db_session)
    token = _register_and_token(client)
    pid = client.post(
        "/patients", json={"full_label": "John"}, headers=_auth(token)
    ).json()["id"]

    s = client.post(
        "/sessions",
        json={"patient_label": "John", "patient_id": pid},
        headers=_auth(token),
    ).json()
    assert s["patient_id"] == pid

    # Detail also exposes patient_id
    detail = client.get(f"/sessions/{s['id']}", headers=_auth(token)).json()
    assert detail["patient_id"] == pid


def test_session_create_with_other_users_patient_id_404(client: TestClient) -> None:
    a_token = _register_and_token(client, "a@example.com")
    a_pid = client.post(
        "/patients", json={"full_label": "A's patient"}, headers=_auth(a_token)
    ).json()["id"]

    b_token = _register_and_token(client, "b@example.com")
    resp = client.post(
        "/sessions",
        json={"patient_label": "stolen", "patient_id": a_pid},
        headers=_auth(b_token),
    )
    assert resp.status_code == 404


def test_session_without_patient_id_still_works(client: TestClient) -> None:
    """Backward-compat: existing flow with no patient_id still creates a walk-in."""
    token = _register_and_token(client)
    s = client.post(
        "/sessions",
        json={"patient_label": "Walk-in"},
        headers=_auth(token),
    ).json()
    assert s["patient_id"] is None


def test_patient_derived_fields_after_visits(
    client: TestClient, db_session: DbSession, mock_groq: dict[str, Any]
) -> None:
    _seed_catalog(db_session)
    token = _register_and_token(client)
    pid = client.post(
        "/patients", json={"full_label": "John"}, headers=_auth(token)
    ).json()["id"]

    # Create two visits linked to this patient
    for _ in range(2):
        client.post(
            "/sessions",
            json={"patient_label": "John", "patient_id": pid},
            headers=_auth(token),
        )

    detail = client.get(f"/patients/{pid}", headers=_auth(token)).json()
    assert detail["visit_count"] == 2
    assert detail["last_visit_at"] is not None
    assert len(detail["sessions"]) == 2


# Re-export pytest so the import isn't unused in CI lint
_ = pytest
