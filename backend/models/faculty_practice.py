"""Faculty practice windows — a date range assigned to a faculty's students."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from database.connection import Base


def _utcnow():
    return datetime.now(timezone.utc)


WINDOW_ACTIVE = "active"
WINDOW_INACTIVE = "inactive"


class FacultyPracticeWindow(Base):
    """One practice date range per faculty. Assigned students replay this range."""

    __tablename__ = "faculty_practice_windows"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    faculty_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    institution_id = Column(
        UUID(as_uuid=True),
        ForeignKey("institutions.id", ondelete="CASCADE"),
        nullable=False,
    )
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    # Historical day currently being replayed for this faculty's students.
    # Column is replay_date because PostgreSQL treats CURRENT_DATE as a keyword.
    current_date = Column("replay_date", Date, nullable=False)
    status = Column(
        String(16),
        nullable=False,
        default=WINDOW_ACTIVE,
        server_default=text("'active'"),
    )
    created_at = Column(
        DateTime(timezone=True),
        default=_utcnow,
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=_utcnow,
        onupdate=_utcnow,
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    __table_args__ = (
        UniqueConstraint("faculty_id", name="uq_faculty_practice_windows_faculty"),
        Index("ix_faculty_practice_windows_institution", "institution_id"),
        Index("ix_faculty_practice_windows_status", "status"),
    )
