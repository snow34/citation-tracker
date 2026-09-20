import uuid
from datetime import datetime

from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.models.citation import Citation
from app.models.user_citation import UserCitation
from app.schemas.citation import CitationUpdate, SortField, SortOrder

_SORT_COLUMNS = {
    SortField.title: Citation.title,
    SortField.authors: cast(Citation.authors, String),
    SortField.journal: Citation.journal,
    SortField.year: Citation.year,
    SortField.citation_count: Citation.citation_count,
    SortField.added_at: UserCitation.added_at,
    SortField.read_status: UserCitation.read_status,
}


async def find_citation_by_doi(db: AsyncSession, doi: str) -> Citation | None:
    return await db.scalar(select(Citation).where(func.lower(Citation.doi) == doi.lower()))


async def get_or_create_citation(
    db: AsyncSession,
    *,
    title: str,
    authors: list[str] | None = None,
    doi: str | None = None,
    journal: str | None = None,
    year: int | None = None,
    abstract: str | None = None,
    citation_count: int | None = None,
    raw_json: dict | None = None,
    fetched_at: datetime | None = None,
) -> tuple[Citation, bool]:
    """Returns (citation, created). Reuses an existing row by DOI when one matches."""
    if doi:
        existing = await find_citation_by_doi(db, doi)
        if existing is not None:
            return existing, False

    citation = Citation(
        title=title,
        authors=authors or [],
        doi=doi,
        journal=journal,
        year=year,
        abstract=abstract,
        citation_count=citation_count,
        raw_json=raw_json,
        fetched_at=fetched_at,
    )
    db.add(citation)
    await db.flush()
    return citation, True


async def add_to_library(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    citation: Citation,
    notes: str | None = None,
    read_status: str = "unread",
) -> tuple[UserCitation, bool]:
    """Returns (entry, created). created=False means it was already in the library."""
    existing = await db.scalar(
        select(UserCitation).where(
            UserCitation.user_id == user_id, UserCitation.citation_id == citation.id
        )
    )
    if existing is not None:
        return existing, False

    entry = UserCitation(
        user_id=user_id,
        citation_id=citation.id,
        notes=notes,
        read_status=read_status,
    )
    db.add(entry)
    await db.flush()
    await db.refresh(entry, attribute_names=["citation"])
    return entry, True


async def create_manual_citation(
    db: AsyncSession, user_id: uuid.UUID, data
) -> UserCitation:
    citation, _ = await get_or_create_citation(
        db,
        title=data.title,
        authors=data.authors,
        doi=data.doi,
        journal=data.journal,
        year=data.year,
        abstract=data.abstract,
        citation_count=data.citation_count,
    )
    entry, created = await add_to_library(
        db,
        user_id=user_id,
        citation=citation,
        notes=data.notes,
        read_status=data.read_status.value,
    )
    if not created:
        raise ConflictError("This citation is already in your library")
    await db.commit()
    await db.refresh(entry, attribute_names=["citation"])
    return entry


async def list_library(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    q: str | None,
    title: str | None = None,
    authors: str | None = None,
    journal: str | None,
    year: int | None,
    read_status: str | None,
    sort: SortField,
    order: SortOrder,
    page: int,
    page_size: int,
) -> tuple[list[UserCitation], int]:
    stmt = select(UserCitation).join(UserCitation.citation).where(UserCitation.user_id == user_id)

    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(
            or_(
                Citation.title.ilike(pattern),
                Citation.journal.ilike(pattern),
                Citation.abstract.ilike(pattern),
                cast(Citation.authors, String).ilike(pattern),
            )
        )
    if title:
        stmt = stmt.where(Citation.title.ilike(f"%{title}%"))
    if authors:
        stmt = stmt.where(cast(Citation.authors, String).ilike(f"%{authors}%"))
    if journal:
        stmt = stmt.where(Citation.journal.ilike(f"%{journal}%"))
    if year is not None:
        stmt = stmt.where(Citation.year == year)
    if read_status:
        stmt = stmt.where(UserCitation.read_status == read_status)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = await db.scalar(count_stmt)

    sort_column = _SORT_COLUMNS[sort]
    sort_column = sort_column.desc() if order == SortOrder.desc else sort_column.asc()
    stmt = stmt.order_by(sort_column).offset((page - 1) * page_size).limit(page_size)

    result = await db.scalars(stmt)
    return list(result.all()), total or 0


async def get_library_entry(db: AsyncSession, user_id: uuid.UUID, entry_id: uuid.UUID) -> UserCitation:
    entry = await db.scalar(
        select(UserCitation).where(UserCitation.id == entry_id, UserCitation.user_id == user_id)
    )
    if entry is None:
        raise NotFoundError("Citation not found")
    return entry


async def get_library_entries(
    db: AsyncSession, user_id: uuid.UUID, entry_ids: list[uuid.UUID]
) -> list[UserCitation]:
    result = await db.scalars(
        select(UserCitation).where(
            UserCitation.id.in_(entry_ids), UserCitation.user_id == user_id
        )
    )
    entries = list(result.all())
    found_ids = {entry.id for entry in entries}
    missing = [str(i) for i in entry_ids if i not in found_ids]
    if missing:
        raise NotFoundError(f"Citation(s) not found in your library: {', '.join(missing)}")
    return entries


async def update_library_entry(
    db: AsyncSession, user_id: uuid.UUID, entry_id: uuid.UUID, data: CitationUpdate
) -> UserCitation:
    entry = await get_library_entry(db, user_id, entry_id)

    if data.notes is not None:
        entry.notes = data.notes
    if data.read_status is not None:
        entry.read_status = data.read_status.value

    citation = entry.citation
    if data.title is not None:
        citation.title = data.title
    if data.authors is not None:
        citation.authors = data.authors
    if data.doi is not None:
        citation.doi = data.doi
    if data.journal is not None:
        citation.journal = data.journal
    if data.year is not None:
        citation.year = data.year
    if data.abstract is not None:
        citation.abstract = data.abstract
    if data.citation_count is not None:
        citation.citation_count = data.citation_count

    await db.commit()
    await db.refresh(entry, attribute_names=["citation"])
    return entry


async def delete_library_entry(db: AsyncSession, user_id: uuid.UUID, entry_id: uuid.UUID) -> None:
    entry = await get_library_entry(db, user_id, entry_id)
    await db.delete(entry)
    await db.commit()
