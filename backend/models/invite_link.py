import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    String,
    Integer,
    Boolean,
    DateTime,
    ForeignKey,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from database.connection import Base


def _utcnow():
    return datetime.now(timezone.utc)


class InviteLink(Base):
    __tablename__ = "invite_links"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    token = Column(String(64), unique=True, index=True, nullable=False)
    institution_id = Column(
        UUID(as_uuid=True), ForeignKey("institutions.id"), nullable=False, index=True
    )
    target_role = Column(String(50), nullable=False)  # institution_admin | faculty | student
    created_by_user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    max_uses = Column(Integer, default=0, nullable=False, server_default=text("0"))
    use_count = Column(Integer, default=0, nullable=False, server_default=text("0"))
    expires_at = Column(DateTime(timezone=True), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False, server_default=text("true"))
    created_at = Column(
        DateTime(timezone=True),
        default=_utcnow,
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
