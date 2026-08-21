import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey, text
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
    created_by_user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    created_at = Column(
        DateTime(timezone=True),
        default=_utcnow,
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
