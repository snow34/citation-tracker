from httpx import AsyncClient


async def test_list_styles_includes_apa(client: AsyncClient):
    resp = await client.get("/citations/styles")
    assert resp.status_code == 200
    keys = [s["key"] for s in resp.json()]
    assert "apa" in keys


async def test_format_single_author_apa(client: AsyncClient, auth_headers: dict[str, str]):
    resp = await client.post(
        "/citations",
        headers=auth_headers,
        json={
            "title": "Attention Is All You Need",
            "authors": ["Ashish Vaswani"],
            "journal": "NeurIPS",
            "year": 2017,
            "doi": "10.1000/attention",
        },
    )
    entry_id = resp.json()["id"]

    resp = await client.get(f"/citations/{entry_id}/format?style=apa", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["style"] == "apa"
    assert body["text"] == (
        "Vaswani, A. (2017). Attention Is All You Need. NeurIPS. "
        "https://doi.org/10.1000/attention"
    )


async def test_format_two_authors_apa(client: AsyncClient, auth_headers: dict[str, str]):
    resp = await client.post(
        "/citations",
        headers=auth_headers,
        json={"title": "Two Author Paper", "authors": ["Jane Doe", "John Q. Smith"]},
    )
    entry_id = resp.json()["id"]

    resp = await client.get(f"/citations/{entry_id}/format", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["text"] == "Doe, J., & Smith, J. Q. (n.d.). Two Author Paper."


async def test_format_three_plus_authors_apa(client: AsyncClient, auth_headers: dict[str, str]):
    resp = await client.post(
        "/citations",
        headers=auth_headers,
        json={
            "title": "Group Paper",
            "authors": ["Alice Alpha", "Bob Beta", "Carol Gamma"],
            "year": 2020,
        },
    )
    entry_id = resp.json()["id"]

    resp = await client.get(f"/citations/{entry_id}/format", headers=auth_headers)
    assert resp.json()["text"] == (
        "Alpha, A., Beta, B., & Gamma, C. (2020). Group Paper."
    )


async def test_format_unknown_style_rejected(client: AsyncClient, auth_headers: dict[str, str]):
    resp = await client.post(
        "/citations", headers=auth_headers, json={"title": "Some Paper", "authors": []}
    )
    entry_id = resp.json()["id"]

    resp = await client.get(f"/citations/{entry_id}/format?style=mla", headers=auth_headers)
    assert resp.status_code == 400


async def test_format_requires_auth(client: AsyncClient):
    resp = await client.get("/citations/00000000-0000-0000-0000-000000000000/format")
    assert resp.status_code == 401


async def test_bibliography_sorted_alphabetically(
    client: AsyncClient, auth_headers: dict[str, str]
):
    ids = []
    for title, author in [
        ("Zebra Paper", "Zed Zephyr"),
        ("Apple Paper", "Amy Anders"),
        ("Mango Paper", "Mona Mills"),
    ]:
        resp = await client.post(
            "/citations", headers=auth_headers, json={"title": title, "authors": [author]}
        )
        ids.append(resp.json()["id"])

    resp = await client.post(
        "/citations/bibliography",
        headers=auth_headers,
        json={"citation_ids": ids},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] == 3
    assert body["style"] == "apa"
    entries = body["text"].split("\n\n")
    assert [e.split(" (")[0] for e in entries] == ["Anders, A.", "Mills, M.", "Zephyr, Z."]


async def test_bibliography_rejects_id_not_in_library(
    client: AsyncClient, auth_headers: dict[str, str]
):
    resp = await client.post(
        "/citations/bibliography",
        headers=auth_headers,
        json={"citation_ids": ["00000000-0000-0000-0000-000000000000"]},
    )
    assert resp.status_code == 404


async def test_bibliography_requires_auth(client: AsyncClient):
    resp = await client.post(
        "/citations/bibliography",
        json={"citation_ids": ["00000000-0000-0000-0000-000000000000"]},
    )
    assert resp.status_code == 401
