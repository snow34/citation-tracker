import uuid
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class ReadStatus(str, Enum):
    unread = "unread"
    reading = "reading"
    read = "read"


class SortField(str, Enum):
    title = "title"
    authors = "authors"
    journal = "journal"
    year = "year"
    added_at = "added_at"
    citation_count = "citation_count"
    read_status = "read_status"


class SortOrder(str, Enum):
    asc = "asc"
    desc = "desc"


class CitationCreate(BaseModel):
    title: str
    authors: list[str] = Field(default_factory=list)
    doi: str | None = None
    journal: str | None = None
    year: int | None = None
    abstract: str | None = None
    citation_count: int | None = None
    notes: str | None = None
    read_status: ReadStatus = ReadStatus.unread


class CitationUpdate(BaseModel):
    title: str | None = None
    authors: list[str] | None = None
    doi: str | None = None
    journal: str | None = None
    year: int | None = None
    abstract: str | None = None
    citation_count: int | None = None
    notes: str | None = None
    read_status: ReadStatus | None = None


class CitationMetadataOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    authors: list[str]
    doi: str | None
    journal: str | None
    year: int | None
    abstract: str | None
    citation_count: int | None


class CitationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    notes: str | None
    read_status: ReadStatus
    added_at: datetime
    citation: CitationMetadataOut


class CitationListOut(BaseModel):
    items: list[CitationOut]
    total: int
    page: int
    page_size: int


class DoiImportRequest(BaseModel):
    doi: str


class ImportResultItem(BaseModel):
    citation: CitationOut | None = None
    error: str | None = None


class ImportResultOut(BaseModel):
    imported: int
    skipped: int
    errors: int
    items: list[ImportResultItem]


class CitationKindOut(BaseModel):
    key: str
    label: str


class CitationStyleOut(BaseModel):
    key: str
    label: str
    kinds: list[CitationKindOut]


class CitationFormatOut(BaseModel):
    style: str
    kind: str
    text: str


class BibliographyRequest(BaseModel):
    citation_ids: list[uuid.UUID] = Field(min_length=1)


class BibliographyOut(BaseModel):
    style: str
    text: str
    count: int
