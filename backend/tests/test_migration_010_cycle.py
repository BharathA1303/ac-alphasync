"""
Migration safety for 010_add_market_data_tables.

Two levels of proof:

    STATIC  — the migration is purely additive. It may only CREATE. Any
              ALTER/DROP/rename against a pre-existing table would risk
              user data on upgrade, so those ops are rejected outright.

    DYNAMIC — the upgrade/downgrade/upgrade cycle is actually EXECUTED
              against a real database, not merely read. Downgrade must
              remove exactly what upgrade added, and re-upgrading must
              succeed (proving downgrade left no residue behind).

The cycle runs on SQLite. The production target is Postgres, but the
migration uses no dialect-specific DDL beyond UUID column types, so the
create/drop cycle is portable — and a Postgres instance is not available
in this environment (see the note in test_migration_cycle_is_reversible).
"""

import re
import sqlite3
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect

MIGRATION_PATH = (
    Path(__file__).resolve().parents[1]
    / "alembic"
    / "versions"
    / "010_add_market_data_tables.py"
)

EXPECTED_TABLES = [
    "instruments",
    "historical_candles",
    "download_status",
    "simulation_sessions",
]


def _source() -> str:
    return MIGRATION_PATH.read_text(encoding="utf-8")


def _load_migration_module():
    """Import the migration file directly, without the alembic env."""
    import importlib.util

    spec = importlib.util.spec_from_file_location("migration_010", MIGRATION_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TestMigrationIsPurelyAdditive:
    def test_upgrade_only_creates(self):
        """No ALTER/DROP on anything that already exists."""
        src = _source()
        upgrade_body = src.split("def upgrade")[1].split("def downgrade")[0]
        ops = set(re.findall(r"op\.(\w+)", upgrade_body))

        assert ops <= {"create_table", "create_index"}, (
            f"upgrade() must only create; found disallowed operations: "
            f"{ops - {'create_table', 'create_index'}}"
        )

    def test_upgrade_touches_no_pre_existing_table(self):
        """
        Guards the real risk: a migration that quietly alters users/orders.
        Every table named in upgrade() must be one this migration creates.
        """
        src = _source()
        upgrade_body = src.split("def upgrade")[1].split("def downgrade")[0]
        created = set(re.findall(r"op\.create_table\(\s*[\"'](\w+)", upgrade_body))
        indexed = set(
            re.findall(r"op\.create_index\(\s*[\"'][\w]+[\"']\s*,\s*[\"'](\w+)", upgrade_body)
        )

        assert created == set(EXPECTED_TABLES)
        assert indexed <= created, (
            f"indexes must only target newly created tables; "
            f"stray targets: {indexed - created}"
        )

    def test_downgrade_reverses_exactly_what_upgrade_created(self):
        src = _source()
        created = re.findall(r"op\.create_table\(\s*[\"'](\w+)", src)
        dropped = re.findall(r"op\.drop_table\(\s*[\"'](\w+)", src)

        assert set(dropped) == set(created), (
            "downgrade() must drop exactly the tables upgrade() created"
        )
        assert dropped == list(reversed(created)), (
            "tables must be dropped in reverse creation order so foreign "
            "keys never block the downgrade"
        )

    def test_downgrade_drops_nothing_else(self):
        src = _source()
        downgrade_body = src.split("def downgrade")[1]
        ops = set(re.findall(r"op\.(\w+)", downgrade_body))
        assert ops == {"drop_table"}, (
            f"downgrade() must only drop its own tables; found: {ops}"
        )

    def test_revision_chain_is_declared(self):
        module = _load_migration_module()
        assert module.revision == "010_market_data"
        assert module.down_revision == "009_clear_broker_credentials", (
            "the migration must chain onto 009, not float free"
        )


class TestMigrationCycleExecutes:
    """
    Actually run upgrade -> downgrade -> upgrade against a real DB.

    NOTE: executed on SQLite. Postgres (the production dialect) is not
    reachable in this environment, so this proves the DDL is coherent and
    reversible but does NOT prove Postgres-specific behavior.
    """

    def _run(self, engine, direction):
        module = _load_migration_module()
        with engine.connect() as conn:
            ctx = MigrationContext.configure(conn)
            with ctx.begin_transaction():
                import alembic.op as alembic_op

                ops = Operations(ctx)
                # Bind the module-level `op` proxy to this Operations object.
                token = alembic_op._proxy = ops  # noqa: F841
                original = module.op
                module.op = ops
                try:
                    if direction == "up":
                        module.upgrade()
                    else:
                        module.downgrade()
                finally:
                    module.op = original
            conn.commit()

    def _tables(self, db_path):
        conn = sqlite3.connect(db_path)
        names = {
            row[0]
            for row in conn.execute(
                "select name from sqlite_master where type='table'"
            )
        }
        conn.close()
        return names

    def test_migration_cycle_is_reversible(self, tmp_path):
        db_path = tmp_path / "migration_cycle.db"
        engine = create_engine(f"sqlite:///{db_path}")

        # Pre-existing table standing in for real user data. It must be
        # completely unaffected by the whole cycle.
        with engine.connect() as conn:
            conn.exec_driver_sql(
                "CREATE TABLE pre_existing_users (id INTEGER PRIMARY KEY, name TEXT)"
            )
            conn.exec_driver_sql(
                "INSERT INTO pre_existing_users (id, name) VALUES (1, 'alice')"
            )
            conn.commit()

        baseline = self._tables(db_path)
        assert "pre_existing_users" in baseline
        for table in EXPECTED_TABLES:
            assert table not in baseline

        # ── upgrade ────────────────────────────────────────────────
        self._run(engine, "up")
        after_up = self._tables(db_path)
        for table in EXPECTED_TABLES:
            assert table in after_up, f"upgrade did not create {table}"

        # ── downgrade ──────────────────────────────────────────────
        self._run(engine, "down")
        after_down = self._tables(db_path)
        for table in EXPECTED_TABLES:
            assert table not in after_down, (
                f"downgrade left {table} behind — the migration is not "
                f"cleanly reversible"
            )

        # Downgrade must restore the exact pre-migration table set.
        assert after_down == baseline, (
            f"downgrade did not restore the original schema: "
            f"extra={after_down - baseline} missing={baseline - after_down}"
        )

        # ── upgrade again ──────────────────────────────────────────
        # This only succeeds if downgrade left no residue (indexes,
        # constraints) that would collide on re-creation.
        self._run(engine, "up")
        after_reup = self._tables(db_path)
        for table in EXPECTED_TABLES:
            assert table in after_reup, f"re-upgrade did not create {table}"

        # ── unrelated data survived the whole cycle ────────────────
        with engine.connect() as conn:
            rows = list(
                conn.exec_driver_sql("SELECT id, name FROM pre_existing_users")
            )
        assert rows == [(1, "alice")], (
            "the migration cycle modified pre-existing user data"
        )

        engine.dispose()

    def test_upgraded_schema_has_expected_columns(self, tmp_path):
        """The created tables must actually match the ORM models."""
        db_path = tmp_path / "migration_schema.db"
        engine = create_engine(f"sqlite:///{db_path}")
        self._run(engine, "up")

        inspector = inspect(engine)

        candle_cols = {c["name"] for c in inspector.get_columns("historical_candles")}
        assert {
            "id",
            "instrument_id",
            "trading_date",
            "timestamp",
            "open",
            "high",
            "low",
            "close",
            "volume",
            "open_interest",
            "source",
        } <= candle_cols

        session_cols = {
            c["name"] for c in inspector.get_columns("simulation_sessions")
        }
        assert {
            "id",
            "simulation_date",
            "status",
            "speed",
            "simulation_time",
        } <= session_cols

        engine.dispose()
