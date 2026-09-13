from datetime import UTC, datetime
from typing import Any

import httpx

from app.config import get_settings
from app.core.exceptions import NotFoundError, UpstreamError


def _extract_year(message: dict[str, Any]) -> int | None:
    for key in ("published", "published-print", "published-online", "issued"):
        date_parts = message.get(key, {}).get("date-parts")
        if date_parts and date_parts[0] and date_parts[0][0]:
            return int(date_parts[0][0])
    return None


def _extract_authors(message: dict[str, Any]) -> list[str]:
    authors = []
    for author in message.get("author", []) or []:
        given = author.get("given", "")
        family = author.get("family", "")
        name = " ".join(part for part in (given, family) if part).strip()
        if name:
            authors.append(name)
    return authors


def map_crossref_message(message: dict[str, Any]) -> dict[str, Any]:
    titles = message.get("title") or []
    journals = message.get("container-title") or []
    return {
        "title": titles[0] if titles else "Untitled",
        "authors": _extract_authors(message),
        "doi": message.get("DOI"),
        "journal": journals[0] if journals else None,
        "year": _extract_year(message),
        "abstract": message.get("abstract"),
        "citation_count": message.get("is-referenced-by-count"),
        "raw_json": message,
        "fetched_at": datetime.now(UTC),
    }


async def fetch_doi_metadata(doi: str) -> dict[str, Any]:
    settings = get_settings()
    url = f"{settings.crossref_base_url}/works/{doi}"
    headers = {"User-Agent": f"citation-tracker/0.1 (mailto:{settings.crossref_mailto})"}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers=headers)
    except httpx.HTTPError as exc:
        raise UpstreamError(f"Failed to reach Crossref: {exc}") from exc

    if response.status_code == 404:
        raise NotFoundError(f"No Crossref record found for DOI {doi}")
    if response.status_code >= 400:
        raise UpstreamError(f"Crossref returned an error ({response.status_code})")

    body = response.json()
    return map_crossref_message(body["message"])
