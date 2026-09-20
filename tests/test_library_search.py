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


async def test_search_by_title_column(client: AsyncClient, auth_headers):
    await _create(client, auth_headers, title="Deep Learning Survey")
    await _create(client, auth_headers, title="Quantum Computing Basics")

    resp = await client.get("/citations", headers=auth_headers, params={"title": "quantum"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["citation"]["title"] == "Quantum Computing Basics"


async def test_search_by_authors_column(client: AsyncClient, auth_headers):
    await _create(client, auth_headers, title="Paper A", authors=["Ada Lovelace"])
    await _create(client, auth_headers, title="Paper B", authors=["Alan Turing"])

    resp = await client.get("/citations", headers=auth_headers, params={"authors": "turing"})
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["citation"]["title"] == "Paper B"


async def test_search_by_journal_is_substring(client: AsyncClient, auth_headers):
    await _create(client, auth_headers, title="Paper A", journal="Journal of Great Papers")
    await _create(client, auth_headers, title="Paper B", journal="Nature")

    resp = await client.get("/citations", headers=auth_headers, params={"journal": "great"})
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["citation"]["title"] == "Paper A"


async def test_sort_by_journal_alphabetical(client: AsyncClient, auth_headers):
    await _create(client, auth_headers, title="Z Paper", journal="Zeta Journal")
    await _create(client, auth_headers, title="A Paper", journal="Alpha Journal")

    resp = await client.get(
        "/citations", headers=auth_headers, params={"sort": "journal", "order": "asc"}
    )
    titles = [item["citation"]["title"] for item in resp.json()["items"]]
    assert titles == ["A Paper", "Z Paper"]


async def test_sort_by_read_status(client: AsyncClient, auth_headers):
    a = await _create(client, auth_headers, title="Paper A")
    b = await _create(client, auth_headers, title="Paper B")
    await client.patch(f"/citations/{a['id']}", headers=auth_headers, json={"read_status": "unread"})
    await client.patch(f"/citations/{b['id']}", headers=auth_headers, json={"read_status": "read"})

    resp = await client.get(
        "/citations", headers=auth_headers, params={"sort": "read_status", "order": "asc"}
    )
    statuses = [item["read_status"] for item in resp.json()["items"]]
    assert statuses == sorted(statuses)


async def test_pagination(client: AsyncClient, auth_headers):
    for i in range(5):
        await _create(client, auth_headers, title=f"Paper {i}")

    resp = await client.get(
        "/citations", headers=auth_headers, params={"page": 1, "page_size": 2}
    )
    body = resp.json()
    assert body["total"] == 5
    assert len(body["items"]) == 2
