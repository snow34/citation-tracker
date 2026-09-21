import io
import json

from httpx import AsyncClient

# Shaped like Zotero's "Export Library... > CSL JSON" output.
SAMPLE_CSLJSON = json.dumps(
    [
        {
            "id": "ABCD1234",
            "type": "article-journal",
            "title": "Zotero Import Sample",
            "container-title": "Journal of Reference Managers",
            "author": [
                {"given": "Jane", "family": "Doe"},
                {"given": "John", "family": "Smith"},
            ],
            "issued": {"date-parts": [[2021, 6]]},
            "DOI": "10.9999/zotero.sample",
            "abstract": "An abstract exported from Zotero.",
        }
    ]
)


async def test_import_csljson(client: AsyncClient, auth_headers):
    files = {"file": ("library.json", io.BytesIO(SAMPLE_CSLJSON.encode()), "application/json")}
    resp = await client.post("/citations/import/csljson", headers=auth_headers, files=files)
    assert resp.status_code == 200
    body = resp.json()
    assert body["imported"] == 1
    assert body["errors"] == 0
    item = body["items"][0]["citation"]
    assert item["citation"]["title"] == "Zotero Import Sample"
    assert item["citation"]["journal"] == "Journal of Reference Managers"
    assert item["citation"]["year"] == 2021
    assert item["citation"]["authors"] == ["Jane Doe", "John Smith"]
    assert item["citation"]["doi"] == "10.9999/zotero.sample"


async def test_import_csljson_skips_duplicates(client: AsyncClient, auth_headers):
    files = {"file": ("library.json", io.BytesIO(SAMPLE_CSLJSON.encode()), "application/json")}
    await client.post("/citations/import/csljson", headers=auth_headers, files=files)

    files = {"file": ("library.json", io.BytesIO(SAMPLE_CSLJSON.encode()), "application/json")}
    resp = await client.post("/citations/import/csljson", headers=auth_headers, files=files)
    body = resp.json()
    assert body["imported"] == 0
    assert body["skipped"] == 1


async def test_import_csljson_items_wrapper(client: AsyncClient, auth_headers):
    wrapped = json.dumps({"items": json.loads(SAMPLE_CSLJSON)})
    files = {"file": ("library.json", io.BytesIO(wrapped.encode()), "application/json")}
    resp = await client.post("/citations/import/csljson", headers=auth_headers, files=files)
    assert resp.status_code == 200
    assert resp.json()["imported"] == 1


async def test_import_csljson_rejects_invalid_json(client: AsyncClient, auth_headers):
    files = {"file": ("library.json", io.BytesIO(b"not json"), "application/json")}
    resp = await client.post("/citations/import/csljson", headers=auth_headers, files=files)
    assert resp.status_code == 400
