import respx
from httpx import AsyncClient, Response

from app.config import get_settings

CROSSREF_RESPONSE = {
    "message": {
        "title": ["A Great Paper"],
        "author": [{"given": "Ada", "family": "Lovelace"}],
        "DOI": "10.1000/great-paper",
        "container-title": ["Journal of Great Papers"],
        "published": {"date-parts": [[2021, 5]]},
        "abstract": "An abstract.",
        "is-referenced-by-count": 42,
    }
}


@respx.mock
async def test_import_doi(client: AsyncClient, auth_headers):
    settings = get_settings()
    respx.get(f"{settings.crossref_base_url}/works/10.1000/great-paper").mock(
        return_value=Response(200, json=CROSSREF_RESPONSE)
    )

    resp = await client.post(
        "/citations/import/doi", headers=auth_headers, json={"doi": "10.1000/great-paper"}
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["citation"]["title"] == "A Great Paper"
    assert body["citation"]["authors"] == ["Ada Lovelace"]
    assert body["citation"]["journal"] == "Journal of Great Papers"
    assert body["citation"]["year"] == 2021
    assert body["citation"]["citation_count"] == 42


@respx.mock
async def test_import_doi_not_found(client: AsyncClient, auth_headers):
    settings = get_settings()
    respx.get(f"{settings.crossref_base_url}/works/10.1000/missing").mock(
        return_value=Response(404)
    )

    resp = await client.post(
        "/citations/import/doi", headers=auth_headers, json={"doi": "10.1000/missing"}
    )
    assert resp.status_code == 404
