import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID
from database.connection import Base


def _utcnow():
    return datetime.now(timezone.utc)


class Institution(Base):
    __tablename__ = "institutions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False, unique=True)
    code = Column(String(50), nullable=False, unique=True)
    email_domain = Column(String(255), nullable=True)
    status = Column(
        String(50), default="active", nullable=False, server_default=text("'active'")
    )
    max_institution_admins = Column(
        Integer, default=5, nullable=False, server_default=text("5")
    )
    max_faculty = Column(
        Integer, default=20, nullable=False, server_default=text("20")
    )
    max_students = Column(
        Integer, default=200, nullable=False, server_default=text("200")
    )
    created_by_user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    created_at = Column(
        DateTime(timezone=True),
        default=_utcnow,
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
