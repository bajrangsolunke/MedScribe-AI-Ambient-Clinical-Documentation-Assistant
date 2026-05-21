from fastapi.testclient import TestClient


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
