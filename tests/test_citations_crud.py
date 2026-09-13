import uuid

from httpx import AsyncClient


async def test_create_and_get_citation(client: AsyncClient, auth_headers: dict[str, str]):
    resp = await client.post(
        "/citations",
        headers=auth_headers,
        json={"title": "Attention Is All You Need", "authors": ["Vaswani, A."], "year": 2017},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["citation"]["title"] == "Attention Is All You Need"
    assert body["read_status"] == "unread"

    entry_id = body["id"]
    resp = await client.get(f"/citations/{entry_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == entry_id


async def test_get_citation_not_owned_returns_404(client: AsyncClient, auth_headers):
    resp = await client.post(
        "/citations", headers=auth_headers, json={"title": "Some Paper", "authors": []}
    )
    entry_id = resp.json()["id"]

    other_headers = {
        "Authorization": (await _second_user_token(client))
    }
    resp = await client.get(f"/citations/{entry_id}", headers=other_headers)
    assert resp.status_code == 404


async def _second_user_token(client: AsyncClient) -> str:
    email = f"other-{uuid.uuid4()}@example.com"
    await client.post("/auth/register", json={"email": email, "password": "supersecret1"})
    resp = await client.post("/auth/login", json={"email": email, "password": "supersecret1"})
    return f"Bearer {resp.json()['access_token']}"


async def test_update_notes_and_read_status(client: AsyncClient, auth_headers):
    resp = await client.post(
        "/citations", headers=auth_headers, json={"title": "Some Paper", "authors": []}
    )
    entry_id = resp.json()["id"]

    resp = await client.patch(
        f"/citations/{entry_id}",
        headers=auth_headers,
        json={"notes": "great paper", "read_status": "read"},
    )
    assert resp.status_code == 200
    assert resp.json()["notes"] == "great paper"
    assert resp.json()["read_status"] == "read"


async def test_delete_citation(client: AsyncClient, auth_headers):
    resp = await client.post(
        "/citations", headers=auth_headers, json={"title": "Disposable Paper", "authors": []}
    )
    entry_id = resp.json()["id"]

    resp = await client.delete(f"/citations/{entry_id}", headers=auth_headers)
    assert resp.status_code == 204

    resp = await client.get(f"/citations/{entry_id}", headers=auth_headers)
    assert resp.status_code == 404


async def test_duplicate_doi_conflict(client: AsyncClient, auth_headers):
    payload = {"title": "Paper", "authors": [], "doi": "10.1000/dup"}
    resp = await client.post("/citations", headers=auth_headers, json=payload)
    assert resp.status_code == 201

    resp = await client.post("/citations", headers=auth_headers, json=payload)
    assert resp.status_code == 409


async def test_create_requires_auth(client: AsyncClient):
    resp = await client.post("/citations", json={"title": "No Auth Paper", "authors": []})
    assert resp.status_code == 401
