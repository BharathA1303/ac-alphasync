"""
Alembic environment configuration for AlphaSync.

Uses async PostgreSQL engine matching the app's database/connection.py setup.
"""

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from config.settings import settings
from database.connection import Base

# Import ALL models so Base.metadata is populated
from models.user import User, TwoFactorAuth, UserSession  # noqa: F401
from models.broker import BrokerAccount  # noqa: F401
from models.order import Order  # noqa: F401
from models.portfolio import Portfolio, Holding, Transaction  # noqa: F401
from models.watchlist import Watchlist, WatchlistItem  # noqa: F401
from models.algo import AlgoStrategy, AlgoTrade, AlgoLog  # noqa: F401
from models.password_reset_token import PasswordResetToken  # noqa: F401
from models.course import (  # noqa: F401
    Course, Lesson, Assessment, Question, Choice,
    LessonProgress, AssessmentAttempt, AttemptAnswer, AssessmentRetakeGrant,
)
from strategies.zeroloss.models import ZeroLossSignal, ZeroLossPerformance  # noqa: F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode — emit SQL to stdout."""
    url = settings.DATABASE_URL
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


# Revision "002_order_type_bracket_take_profit" is 34 characters, which
# overflows the alembic_version.version_num VARCHAR(32) that Alembic 1.13
# hardcodes when it creates the version table. SQLite ignores VARCHAR limits,
# so this only ever surfaced against a real PostgreSQL database, where it made
# `alembic upgrade head` fail partway through the chain.
#
# Widening the existing column is preferred over renaming the revision: a
# rename would orphan any database already stamped with the current id.
VERSION_TABLE_COLUMN_LENGTH = 128


def _widen_version_column(connection) -> None:
    """Ensure alembic_version.version_num is wide enough for our revision ids."""
    if connection.dialect.name != "postgresql":
        # SQLite does not enforce VARCHAR length, and the ALTER below is
        # PostgreSQL-specific, so there is nothing to do elsewhere.
        return
    connection.exec_driver_sql(
        "CREATE TABLE IF NOT EXISTS alembic_version ("
        f"version_num VARCHAR({VERSION_TABLE_COLUMN_LENGTH}) NOT NULL, "
        "CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num))"
    )
    connection.exec_driver_sql(
        "ALTER TABLE alembic_version ALTER COLUMN version_num "
        f"TYPE VARCHAR({VERSION_TABLE_COLUMN_LENGTH})"
    )
    # Commit immediately: this DDL must be durable before Alembic opens its own
    # migration transaction, otherwise it is rolled back along with it.
    connection.commit()


def do_run_migrations(connection):
    _widen_version_column(connection)
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Run migrations in 'online' mode with async engine."""
    # NullPool opens/closes a connection per migration step, so the pool-sizing
    # options (pool_size / max_overflow) must NOT be passed — create_engine
    # rejects them outright for a non-queue pool, which previously made
    # `alembic upgrade head` fail against any real PostgreSQL URL.
    configuration = {
        "sqlalchemy.url": settings.DATABASE_URL,
    }
    connectable = async_engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    """Entrypoint for online migrations."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
