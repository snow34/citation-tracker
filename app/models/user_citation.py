import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDPkMixin
from app.models.citation import Citation

READ_STATUSES = ("unread", "reading", "read")


class UserCitation(UUIDPkMixin, Base):
    """A user's personal library entry linking them to a shared citation record."""

    __tablename__ = "user_citations"
    __table_args__ = (
        UniqueConstraint("user_id", "citation_id", name="uq_user_citations_user_citation"),
        CheckConstraint(
            "read_status IN ('unread', 'reading', 'read')", name="ck_user_citations_read_status"
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    citation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("citations.id", ondelete="RESTRICT"), nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    read_status: Mapped[str] = mapped_column(String, nullable=False, default="unread")
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    citation: Mapped[Citation] = relationship(lazy="joined")
