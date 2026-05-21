import pytest
from fastapi.testclient import TestClient

from app.services.google_oauth import GoogleIdentity, GoogleOAuthError


def test_register_then_me(client: TestClient) -> None:
    resp = client.post("/auth/register", json={"email": "doc@example.com", "password": "supersecret"})
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["token_type"] == "bearer"
    assert body["user"]["email"] == "doc@example.com"
    token = body["access_token"]

    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "doc@example.com"


def test_register_duplicate_email_rejected(client: TestClient) -> None:
    client.post("/auth/register", json={"email": "doc@example.com", "password": "supersecret"})
    dup = client.post("/auth/register", json={"email": "doc@example.com", "password": "anotherpass"})
    assert dup.status_code == 409


def test_login_wrong_password_rejected(client: TestClient) -> None:
    client.post("/auth/register", json={"email": "doc@example.com", "password": "supersecret"})
    bad = client.post("/auth/login", json={"email": "doc@example.com", "password": "wrongpass"})
    assert bad.status_code == 401


def test_login_returns_working_token(client: TestClient) -> None:
    client.post("/auth/register", json={"email": "doc@example.com", "password": "supersecret"})
    login = client.post("/auth/login", json={"email": "doc@example.com", "password": "supersecret"})
    assert login.status_code == 200
    token = login.json()["access_token"]
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200


def test_me_without_token_rejected(client: TestClient) -> None:
    resp = client.get("/auth/me")
    assert resp.status_code == 401


def test_me_with_bad_token_rejected(client: TestClient) -> None:
    resp = client.get("/auth/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert resp.status_code == 401


# --- Google OAuth ---------------------------------------------------------


def _mock_google_verify(
    monkeypatch: pytest.MonkeyPatch, identity: GoogleIdentity | Exception
) -> None:
    def fake(token: str) -> GoogleIdentity:
        if isinstance(identity, Exception):
            raise identity
        return identity

    monkeypatch.setattr("app.api.auth.verify_google_id_token", fake)


def test_google_signin_creates_new_user(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _mock_google_verify(
        monkeypatch,
        GoogleIdentity(
            email="newdoc@example.com",
            email_verified=True,
            name="New Doc",
            picture=None,
            sub="google-uid-1",
        ),
    )
    resp = client.post("/auth/google", json={"id_token": "fake-good-token"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["user"]["email"] == "newdoc@example.com"
    # Subsequent /auth/me must work with the issued JWT.
    me = client.get(
        "/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"}
    )
    assert me.status_code == 200


def test_google_signin_links_to_existing_email(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Existing email/password user can also sign in via Google with same email."""
    client.post(
        "/auth/register", json={"email": "doc@example.com", "password": "supersecret"}
    )
    _mock_google_verify(
        monkeypatch,
        GoogleIdentity(
            email="doc@example.com",
            email_verified=True,
            name="Doc",
            picture=None,
            sub="google-uid-2",
        ),
    )
    resp = client.post("/auth/google", json={"id_token": "fake-good-token"})
    assert resp.status_code == 200
    # Password login must still work afterward.
    pw = client.post(
        "/auth/login", json={"email": "doc@example.com", "password": "supersecret"}
    )
    assert pw.status_code == 200


def test_google_signin_invalid_token_rejected(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _mock_google_verify(monkeypatch, GoogleOAuthError("Invalid Google ID token: bad sig"))
    resp = client.post("/auth/google", json={"id_token": "garbage"})
    assert resp.status_code == 401


def test_google_signin_returns_503_when_not_configured(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _mock_google_verify(
        monkeypatch, GoogleOAuthError("Google OAuth is not configured on this server")
    )
    resp = client.post("/auth/google", json={"id_token": "anything"})
    assert resp.status_code == 503
