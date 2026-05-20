from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session as DbSession

from app.models import IcdCatalog


def test_pdf_export_returns_valid_pdf(
    client: TestClient, db_session: DbSession, mock_groq: dict[str, Any]
) -> None:
    db_session.add(
        IcdCatalog(
            code="R07.9",
            short_description="Chest pain, unspecified",
            long_description="Chest pain, unspecified",
            chapter="Symptoms",
        )
    )
    db_session.commit()

    token = client.post(
        "/auth/register", json={"email": "doc@example.com", "password": "supersecret"}
    ).json()["access_token"]
    auth = {"Authorization": f"Bearer {token}"}
    session_id = client.post(
        "/sessions",
        json={"patient_label": "Patient #1", "chief_complaint": "chest pain"},
        headers=auth,
    ).json()["id"]
    client.post(
        f"/sessions/{session_id}/audio",
        files={"file": ("clip.webm", b"x", "audio/webm")},
        headers=auth,
    )

    pdf = client.get(f"/sessions/{session_id}/export.pdf", headers=auth)
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.content.startswith(b"%PDF")
    assert len(pdf.content) > 1000  # sanity: non-trivial PDF


def test_pdf_export_404_for_unknown_session(client: TestClient) -> None:
    token = client.post(
        "/auth/register", json={"email": "doc@example.com", "password": "supersecret"}
    ).json()["access_token"]
    resp = client.get(
        "/sessions/9999/export.pdf", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 404
