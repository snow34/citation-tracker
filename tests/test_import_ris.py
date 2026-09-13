import io

from httpx import AsyncClient

SAMPLE_RIS = """TY  - JOUR
AU  - Doe, Jane
AU  - Smith, John
TI  - A Sample RIS Title
JO  - Journal of Testing
PY  - 2019
DO  - 10.1234/sample.doi
AB  - This is an abstract.
ER  -
"""


async def test_import_ris(client: AsyncClient, auth_headers):
    files = {"file": ("sample.ris", io.BytesIO(SAMPLE_RIS.encode()), "text/plain")}
    resp = await client.post("/citations/import/ris", headers=auth_headers, files=files)
    assert resp.status_code == 200
    body = resp.json()
    assert body["imported"] == 1
    item = body["items"][0]["citation"]
    assert item["citation"]["title"] == "A Sample RIS Title"
    assert item["citation"]["journal"] == "Journal of Testing"
    assert item["citation"]["year"] == 2019
    assert item["citation"]["authors"] == ["Doe, Jane", "Smith, John"]
