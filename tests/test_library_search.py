from httpx import AsyncClient


async def _create(client: AsyncClient, headers, **kwargs):
    payload = {"title": "Untitled", "authors": [], **kwargs}
    resp = await client.post("/citations", headers=headers, json=payload)
    assert resp.status_code == 201
    return resp.json()


async def test_list_scoped_to_user(client: AsyncClient, auth_headers):
    await _create(client, auth_headers, title="Paper A")
    await _create(client, auth_headers, title="Paper B")

    resp = await client.get("/citations", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2
    assert len(body["items"]) == 2


async def test_search_by_title(client: AsyncClient, auth_headers):
    await _create(client, auth_headers, title="Deep Learning Survey")
    await _create(client, auth_headers, title="Quantum Computing Basics")

    resp = await client.get("/citations", headers=auth_headers, params={"q": "Deep Learning"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["citation"]["title"] == "Deep Learning Survey"


async def test_filter_by_year(client: AsyncClient, auth_headers):
    await _create(client, auth_headers, title="Old Paper", year=2000)
    await _create(client, auth_headers, title="New Paper", year=2024)

    resp = await client.get("/citations", headers=auth_headers, params={"year": 2024})
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["citation"]["title"] == "New Paper"


async def test_sort_by_year_ascending(client: AsyncClient, auth_headers):
    await _create(client, auth_headers, title="Newer", year=2020)
    await _create(client, auth_headers, title="Older", year=2010)

    resp = await client.get(
        "/citations", headers=auth_headers, params={"sort": "year", "order": "asc"}
    )
    titles = [item["citation"]["title"] for item in resp.json()["items"]]
    assert titles == ["Older", "Newer"]


async def test_pagination(client: AsyncClient, auth_headers):
    for i in range(5):
        await _create(client, auth_headers, title=f"Paper {i}")

    resp = await client.get(
        "/citations", headers=auth_headers, params={"page": 1, "page_size": 2}
    )
    body = resp.json()
    assert body["total"] == 5
    assert len(body["items"]) == 2
