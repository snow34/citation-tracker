import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPkMixin


class Collection(UUIDPkMixin, Base):
    """Stub table — no API endpoints yet; reserved for a future collections feature."""

    __tablename__ = "collections"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)


class CollectionCitation(Base):
    """Stub join table — links to user_citations (a user's library entry), not the shared
    citations cache, so a collection can never reference a citation the user hasn't added
    to their own library."""

    __tablename__ = "collection_citations"

    collection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("collections.id", ondelete="CASCADE"), primary_key=True
    )
    user_citation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_citations.id", ondelete="CASCADE"), primary_key=True
    )
