from httpx import AsyncClient


async def test_register_and_login(client: AsyncClient):
    resp = await client.post(
        "/auth/register", json={"email": "alice@example.com", "password": "supersecret1"}
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["email"] == "alice@example.com"
    assert "password" not in body

    resp = await client.post(
        "/auth/login", json={"email": "alice@example.com", "password": "supersecret1"}
    )
    assert resp.status_code == 200
    assert resp.json()["token_type"] == "bearer"
    assert resp.json()["access_token"]


async def test_register_duplicate_email(client: AsyncClient):
    await client.post(
        "/auth/register", json={"email": "bob@example.com", "password": "supersecret1"}
    )
    resp = await client.post(
        "/auth/register", json={"email": "bob@example.com", "password": "different1"}
    )
    assert resp.status_code == 409


async def test_login_wrong_password(client: AsyncClient):
    await client.post(
        "/auth/register", json={"email": "carol@example.com", "password": "supersecret1"}
    )
    resp = await client.post(
        "/auth/login", json={"email": "carol@example.com", "password": "wrongpassword"}
    )
    assert resp.status_code == 401


async def test_me_requires_auth(client: AsyncClient):
    resp = await client.get("/auth/me")
    assert resp.status_code == 401


async def test_me_with_token(client: AsyncClient, auth_headers: dict[str, str]):
    resp = await client.get("/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    assert "@" in resp.json()["email"]


async def test_logout(client: AsyncClient, auth_headers: dict[str, str]):
    resp = await client.post("/auth/logout", headers=auth_headers)
    assert resp.status_code == 204
