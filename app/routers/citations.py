import uuid

from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import LibraryQueryParams, get_current_user
from app.models.user import User
from app.schemas.citation import (
    BibliographyOut,
    BibliographyRequest,
    CitationCreate,
    CitationFormatOut,
    CitationListOut,
    CitationOut,
    CitationStyleOut,
    CitationUpdate,
    DoiImportRequest,
    ImportResultOut,
)
from app.services import citation_format, citation_service, import_service
from app.services.crossref_client import fetch_doi_metadata

router = APIRouter(prefix="/citations", tags=["citations"])


@router.post("", response_model=CitationOut, status_code=status.HTTP_201_CREATED)
async def create_citation(
    data: CitationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CitationOut:
    entry = await citation_service.create_manual_citation(db, current_user.id, data)
    return CitationOut.model_validate(entry)


@router.get("", response_model=CitationListOut)
async def list_citations(
    params: LibraryQueryParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CitationListOut:
    items, total = await citation_service.list_library(
        db,
        current_user.id,
        q=params.q,
        journal=params.journal,
        year=params.year,
        read_status=params.read_status,
        sort=params.sort,
        order=params.order,
        page=params.page,
        page_size=params.page_size,
    )
    return CitationListOut(
        items=[CitationOut.model_validate(item) for item in items],
        total=total,
        page=params.page,
        page_size=params.page_size,
    )


@router.get("/styles", response_model=list[CitationStyleOut])
async def list_citation_styles() -> list[CitationStyleOut]:
    return [CitationStyleOut(key=s.key, label=s.label) for s in citation_format.list_styles()]


@router.post("/bibliography", response_model=BibliographyOut)
async def format_bibliography(
    data: BibliographyRequest,
    style: str = "apa",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BibliographyOut:
    entries = await citation_service.get_library_entries(db, current_user.id, data.citation_ids)
    text = citation_format.format_bibliography((e.citation for e in entries), style)
    return BibliographyOut(style=style, text=text, count=len(entries))


@router.get("/{user_citation_id}", response_model=CitationOut)
async def get_citation(
    user_citation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CitationOut:
    entry = await citation_service.get_library_entry(db, current_user.id, user_citation_id)
    return CitationOut.model_validate(entry)


@router.get("/{user_citation_id}/format", response_model=CitationFormatOut)
async def format_citation(
    user_citation_id: uuid.UUID,
    style: str = "apa",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CitationFormatOut:
    entry = await citation_service.get_library_entry(db, current_user.id, user_citation_id)
    text = citation_format.format_citation(entry.citation, style)
    return CitationFormatOut(style=style, text=text)


@router.patch("/{user_citation_id}", response_model=CitationOut)
async def update_citation(
    user_citation_id: uuid.UUID,
    data: CitationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CitationOut:
    entry = await citation_service.update_library_entry(
        db, current_user.id, user_citation_id, data
    )
    return CitationOut.model_validate(entry)


@router.delete("/{user_citation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_citation(
    user_citation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    await citation_service.delete_library_entry(db, current_user.id, user_citation_id)


@router.post("/import/bibtex", response_model=ImportResultOut)
async def import_bibtex(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ImportResultOut:
    content = (await file.read()).decode("utf-8")
    entries = import_service.parse_bibtex(content)
    return await import_service.import_parsed_entries(db, current_user.id, entries)


@router.post("/import/ris", response_model=ImportResultOut)
async def import_ris(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ImportResultOut:
    content = (await file.read()).decode("utf-8")
    entries = import_service.parse_ris(content)
    return await import_service.import_parsed_entries(db, current_user.id, entries)


@router.post("/import/doi", response_model=CitationOut, status_code=status.HTTP_201_CREATED)
async def import_doi(
    data: DoiImportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CitationOut:
    metadata = await fetch_doi_metadata(data.doi)
    citation, _ = await citation_service.get_or_create_citation(db, **metadata)
    entry, _ = await citation_service.add_to_library(
        db, user_id=current_user.id, citation=citation
    )
    await db.commit()
    await db.refresh(entry, attribute_names=["citation"])
    return CitationOut.model_validate(entry)
