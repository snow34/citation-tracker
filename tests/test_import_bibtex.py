import io

from httpx import AsyncClient

SAMPLE_BIB = """
@article{vaswani2017attention,
  title={Attention is all you need},
  author={Vaswani, Ashish and Shazeer, Noam and Parmar, Niki},
  journal={Advances in neural information processing systems},
  year={2017},
  doi={10.48550/arXiv.1706.03762}
}
"""


async def test_import_bibtex(client: AsyncClient, auth_headers):
    files = {"file": ("sample.bib", io.BytesIO(SAMPLE_BIB.encode()), "text/plain")}
    resp = await client.post("/citations/import/bibtex", headers=auth_headers, files=files)
    assert resp.status_code == 200
    body = resp.json()
    assert body["imported"] == 1
    assert body["errors"] == 0
    item = body["items"][0]["citation"]
    assert item["citation"]["title"] == "Attention is all you need"
    assert len(item["citation"]["authors"]) == 3


async def test_import_bibtex_skips_duplicates(client: AsyncClient, auth_headers):
    files = {"file": ("sample.bib", io.BytesIO(SAMPLE_BIB.encode()), "text/plain")}
    await client.post("/citations/import/bibtex", headers=auth_headers, files=files)

    files = {"file": ("sample.bib", io.BytesIO(SAMPLE_BIB.encode()), "text/plain")}
    resp = await client.post("/citations/import/bibtex", headers=auth_headers, files=files)
    body = resp.json()
    assert body["imported"] == 0
    assert body["skipped"] == 1
