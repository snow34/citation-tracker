from typing import Any

import bibtexparser
import rispy
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.citation import CitationOut, ImportResultItem, ImportResultOut
from app.services.citation_service import add_to_library, get_or_create_citation


def _to_year(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(str(value)[:4])
    except (ValueError, TypeError):
        return None


def parse_bibtex(content: str) -> list[dict[str, Any]]:
    bib_database = bibtexparser.loads(content)
    entries = []
    for entry in bib_database.entries:
        author_field = entry.get("author", "")
        authors = [a.strip() for a in author_field.split(" and ") if a.strip()]
        entries.append(
            {
                "title": entry.get("title", "").strip("{}") or "Untitled",
                "authors": authors,
                "doi": entry.get("doi") or None,
                "journal": entry.get("journal") or entry.get("booktitle") or None,
                "year": _to_year(entry.get("year")),
                "abstract": entry.get("abstract") or None,
                "citation_count": None,
            }
        )
    return entries


def parse_ris(content: str) -> list[dict[str, Any]]:
    records = rispy.loads(content)
    entries = []
    for record in records:
        authors = record.get("authors") or record.get("first_authors") or []
        if isinstance(authors, str):
            authors = [authors]
        title = record.get("title") or record.get("primary_title") or "Untitled"
        journal = (
            record.get("journal_name")
            or record.get("secondary_title")
            or record.get("alternate_title1")
        )
        entries.append(
            {
                "title": title,
                "authors": list(authors),
                "doi": record.get("doi") or None,
                "journal": journal,
                "year": _to_year(record.get("year") or record.get("publication_year")),
                "abstract": record.get("abstract") or None,
                "citation_count": None,
            }
        )
    return entries


async def import_parsed_entries(
    db: AsyncSession, user_id, entries: list[dict[str, Any]]
) -> ImportResultOut:
    imported = 0
    skipped = 0
    errors = 0
    items: list[ImportResultItem] = []

    for entry in entries:
        try:
            citation, _ = await get_or_create_citation(
                db,
                title=entry["title"],
                authors=entry.get("authors") or [],
                doi=entry.get("doi"),
                journal=entry.get("journal"),
                year=entry.get("year"),
                abstract=entry.get("abstract"),
                citation_count=entry.get("citation_count"),
            )
            library_entry, created = await add_to_library(db, user_id=user_id, citation=citation)
            if created:
                imported += 1
                items.append(ImportResultItem(citation=CitationOut.model_validate(library_entry)))
            else:
                skipped += 1
                items.append(ImportResultItem(citation=CitationOut.model_validate(library_entry)))
        except Exception as exc:  # noqa: BLE001 — collect per-entry errors, don't abort the batch
            errors += 1
            items.append(ImportResultItem(error=str(exc)))

    await db.commit()
    return ImportResultOut(imported=imported, skipped=skipped, errors=errors, items=items)
