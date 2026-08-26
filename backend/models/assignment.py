"""
Database models for Faculty Order-Log Assignments and Student Submissions.

Allows faculty to configure trade-based criteria (asset class, symbol, min trades,
stop-loss discipline, take-profit/risk-reward ratios) and track student order executions.
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    String,
    Text,
    Boolean,
    Integer,
    Numeric,
    DateTime,
    ForeignKey,
    JSON,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from database.connection import Base


def _utcnow():
    return datetime.now(timezone.utc)


class TradingAssignment(Base):
    __tablename__ = "trading_assignments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    institution_id = Column(
        UUID(as_uuid=True),
        ForeignKey("institutions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_by_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    course_id = Column(
        UUID(as_uuid=True),
        ForeignKey("courses.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)

    # "draft" | "active" | "archived"
    status = Column(
        String(20), default="active", nullable=False, server_default=text("'active'")
    )

    pass_score = Column(
        Integer, default=70, nullable=False, server_default=text("70")
    )
    start_date = Column(DateTime(timezone=True), nullable=True)
    due_date = Column(DateTime(timezone=True), nullable=True)

    # ── Trading Rules Configuration ─────────────────────────────────
    # "EQUITY" | "FUTURES" | "OPTIONS" | "ANY"
    target_asset_class = Column(
        String(20), default="EQUITY", nullable=False, server_default=text("'EQUITY'")
    )
    # JSON list of symbols, e.g. ["RELIANCE", "TCS"] or [] for ANY
    target_symbols = Column(
        JSON, default=list, nullable=False, server_default=text("'[]'")
    )

    min_trades = Column(
        Integer, default=1, nullable=False, server_default=text("1")
    )
    require_stop_loss = Column(
        Boolean, default=True, nullable=False, server_default=text("true")
    )
    # Maximum allowed stop-loss percentage from entry price (e.g. 2.0 = max 2% SL)
    max_sl_percent = Column(
        Numeric(precision=5, scale=2), nullable=True
    )

    require_take_profit = Column(
        Boolean, default=False, nullable=False, server_default=text("false")
    )
    # Minimum required Risk-to-Reward ratio (e.g. 1.5 = 1:1.5)
    min_risk_reward_ratio = Column(
        Numeric(precision=5, scale=2), nullable=True
    )

    # "BUY" | "SELL" | "BOTH"
    allowed_sides = Column(
        String(10), default="BOTH", nullable=False, server_default=text("'BOTH'")
    )

    # JSON list of product types, e.g. ["CNC", "MIS"] or ["ALL"]
    allowed_product_types = Column(
        JSON, default=lambda: ["ALL"], nullable=False, server_default=text("'[\"ALL\"]'")
    )

    # Arbitrary additional rule constraints
    rules_config = Column(
        JSON, default=dict, nullable=False, server_default=text("'{}'")
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


class AssignmentSubmission(Base):
    __tablename__ = "assignment_submissions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    assignment_id = Column(
        UUID(as_uuid=True),
        ForeignKey("trading_assignments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    student_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    institution_id = Column(
        UUID(as_uuid=True),
        ForeignKey("institutions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # "pending" | "in_progress" | "submitted" | "passed" | "failed"
    status = Column(
        String(20),
        default="in_progress",
        nullable=False,
        server_default=text("'in_progress'"),
    )
    score = Column(
        Integer, default=0, nullable=False, server_default=text("0")
    )
    passed = Column(
        Boolean, default=False, nullable=False, server_default=text("false")
    )

    # Array of order UUID strings that satisfied the assignment requirements
    matched_order_ids = Column(
        JSON, default=list, nullable=False, server_default=text("'[]'")
    )

    # Detailed evaluation results containing rule checklist and metrics
    evaluation_summary = Column(
        JSON, default=dict, nullable=False, server_default=text("'{}'")
    )

    student_notes = Column(Text, nullable=True)
    faculty_feedback = Column(Text, nullable=True)
    faculty_graded_at = Column(DateTime(timezone=True), nullable=True)
    graded_by_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    submitted_at = Column(DateTime(timezone=True), nullable=True)
    evaluated_at = Column(
        DateTime(timezone=True),
        default=_utcnow,
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
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
