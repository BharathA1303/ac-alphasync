"""
Integration tests that run against REAL PostgreSQL and REAL Redis.

These are deliberately kept out of the default test run: the rest of the
suite uses in-memory SQLite and fakeredis so it stays runnable in CI and on
a developer laptop with no Docker. Everything here is skipped unless BOTH
of these env vars point at real services:

    REAL_TEST_DATABASE_URL=postgresql+asyncpg://user:pass@host:port/db
    REAL_TEST_REDIS_URL=redis://host:port/0

Run them with, for example:

    REAL_TEST_DATABASE_URL=postgresql+asyncpg://acalphasync:acalphasync@127.0.0.1:5436/acalphasync \
    REAL_TEST_REDIS_URL=redis://127.0.0.1:6380/0 \
    python -m pytest tests/test_real_infra_market_data.py -v

What real infrastructure buys us over SQLite/fakeredis:

  * SQLite silently ignores VARCHAR lengths, NUMERIC precision and several
    constraint semantics. PostgreSQL does not.
  * The unique constraint backing idempotent candle upsert is only truly
    enforced by a real database.
  * Real Redis actually expires keys and round-trips TTLs; fakeredis models
    this, but the key schema/serialization path is worth exercising for real.

All market data created here is clearly-synthetic test fixture data —
symbols are suffixed `-SIM` and prices are round numbers that could not be
mistaken for a real quote.
"""

import os
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from core.market_data_mode import MarketDataMode, market_data_mode
from engines.market_session import IST
from models.market_data import (
    DownloadStatus,
    HistoricalCandle,
    Instrument,
    SimulationSession,
)
from services.historical_downloader import ZebuHistoricalDownloader
from services.historical_replay import HistoricalReplayEngine, REPLAY_SOURCE
from services.simulation_universe import UniverseInstrument
from workers.historical_retention_worker import purge_old_market_data

REAL_DB_URL = os.getenv("REAL_TEST_DATABASE_URL", "")
REAL_REDIS_URL = os.getenv("REAL_TEST_REDIS_URL", "")

pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.skipif(
        not REAL_DB_URL or not REAL_REDIS_URL,
        reason=(
            "real-infra test: set REAL_TEST_DATABASE_URL and REAL_TEST_REDIS_URL "
            "to a live PostgreSQL/Redis to run"
        ),
    ),
]

SIM_DATE = date(2026, 8, 20)

# Clearly-synthetic fixture instruments. The `-SIM` suffix and the round
# price ladders below exist so this data can never be mistaken for a real
# market quote if it leaks into a dev database.
EQ_SYMBOL = "TESTNIFTY-SIM"
FUT_SYMBOL = "TESTNIFTY-SIM-FUT"
CE_SYMBOL = "TESTNIFTY-SIM-25000CE"
PE_SYMBOL = "TESTNIFTY-SIM-25000PE"

# Token "26000" is a REAL, already-mapped Zebu token for NIFTY's index
# (resolves to canonical symbol "^NSEI" via providers.symbol_mapper). Using
# it here would make the replay engine publish under "^NSEI" instead of
# EQ_SYMBOL, since _canonical_for() intentionally resolves equities/indices
# through the shared symbol mapper so replay lands on the same key a live
# tick would use. Tests that read back by EQ_SYMBOL must use a token with
# no real mapping so the fixture symbol itself is used as the canonical key.
UNMAPPED_EQ_TOKEN = "9199999"


def _epoch(hh: int, mm: int) -> int:
    return int(datetime(2026, 8, 20, hh, mm, tzinfo=IST).timestamp())


def _ts(hh: int, mm: int) -> datetime:
    return datetime.fromtimestamp(_epoch(hh, mm), tz=timezone.utc)


# ── Fixtures ────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def pg_engine():
    """Engine bound to the real PostgreSQL database."""
    engine = create_async_engine(REAL_DB_URL, echo=False)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def pg(pg_engine):
    """
    A session against real PostgreSQL.

    Each test cleans up only the market-data rows it created, keyed on the
    `-SIM` fixture symbols, so pre-existing application data is never
    touched — that non-interference is itself asserted in
    TestMigrationSafety.
    """
    maker = async_sessionmaker(pg_engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as session:
        await _cleanup(session)
        yield session
        await _cleanup(session)


async def _cleanup(db: AsyncSession) -> None:
    """Remove only this module's fixture rows."""
    ids = (
        await db.execute(
            select(Instrument.id).where(Instrument.trading_symbol.like("TESTNIFTY-SIM%"))
        )
    ).scalars().all()
    if ids:
        for model in (HistoricalCandle, DownloadStatus):
            await db.execute(
                model.__table__.delete().where(model.instrument_id.in_(ids))
            )
        await db.execute(Instrument.__table__.delete().where(Instrument.id.in_(ids)))
    await db.execute(
        SimulationSession.__table__.delete().where(
            SimulationSession.simulation_date == SIM_DATE
        )
    )
    await db.commit()


@pytest_asyncio.fixture
async def real_redis():
    """The real PriceCache singleton, pointed at the real Redis container."""
    import cache.redis_client as rc

    await rc.close_redis()
    cache = await rc.get_redis(REAL_REDIS_URL)
    assert cache.is_connected, "could not connect to real Redis"
    # Clear only this fixture's keys.
    await _flush_fixture_keys(cache)
    yield cache
    await _flush_fixture_keys(cache)
    await rc.close_redis()


async def _flush_fixture_keys(cache) -> None:
    client = cache._redis
    if client is None:
        return
    keys = await client.keys("alphasync:*TESTNIFTY-SIM*")
    if keys:
        await client.delete(*keys)


async def _seed_instrument(
    db: AsyncSession,
    tsym: str,
    itype: str,
    token: str,
    exchange: str,
    closes: list[float],
    *,
    option_type: str | None = None,
    strike: float | None = None,
    trading_day: date = SIM_DATE,
) -> Instrument:
    inst = Instrument(
        token=token,
        trading_symbol=tsym,
        exchange=exchange,
        instrument_type=itype,
        underlying="TESTNIFTY-SIM",
        option_type=option_type,
        strike_price=strike,
        lot_size=50,
    )
    db.add(inst)
    await db.flush()
    for i, close in enumerate(closes):
        db.add(
            HistoricalCandle(
                instrument_id=inst.id,
                trading_date=trading_day,
                timestamp=_ts(9, 15 + i),
                open=close,
                high=close + 1,
                low=close - 1,
                close=close,
                volume=100 * (i + 1),
                open_interest=1000,
                source="zebu_tp_series",
            )
        )
    await db.flush()
    await db.commit()
    return inst


# ── 0. Migration 010 upgrade/downgrade/upgrade cycle, real PostgreSQL ──
#
# This app bootstraps its base schema via Base.metadata.create_all() at
# startup (database/connection.py) rather than a from-scratch alembic
# chain, and several pre-existing migrations (001, 003, ...) are not
# idempotent against that create_all()-created state -- pointing plain
# `alembic upgrade head` at a genuinely empty database fails before it
# ever reaches migration 010, for reasons entirely unrelated to this
# feature. That inconsistency predates this work and is out of scope
# here (see the code review note in the module docstring history).
#
# What actually matters for this feature is narrower: migration 010
# itself -- stamped on top of a realistic, already-bootstrapped schema,
# exactly like a real deployment would be at the moment this feature
# ships -- must apply cleanly, be fully reversible, and reapply cleanly,
# without touching any pre-existing table or row. That is what this
# class proves, driving the real `alembic` CLI via subprocess against a
# disposable, dedicated database (never the shared `pg`/`real_redis`
# fixture database used by the rest of this file).


class TestMigration010CycleOnRealPostgres:
    CYCLE_DB = "alphasync_migration_cycle_test"

    @pytest_asyncio.fixture
    async def cycle_db_url(self):
        """
        A disposable database, recreated empty, bootstrapped with the full
        pre-existing (pre-migration-010) schema via create_all() -- mirroring
        how this app actually reaches a "just before this feature shipped"
        state in practice -- then stamped at revision 009 so alembic believes
        only migration 010 remains to apply.
        """
        import subprocess

        admin_url = REAL_DB_URL.rsplit("/", 1)[0] + "/postgres"
        cycle_url = REAL_DB_URL.rsplit("/", 1)[0] + f"/{self.CYCLE_DB}"

        async def _drop_cycle_db(conn):
            # A prior run that failed before disposing its engine can leave
            # a connection open against this database, which would make a
            # plain DROP DATABASE hang/fail. Force those out first.
            await conn.execute(
                text(
                    "select pg_terminate_backend(pid) from pg_stat_activity "
                    "where datname = :db and pid <> pg_backend_pid()"
                ),
                {"db": self.CYCLE_DB},
            )
            await conn.execute(text(f'DROP DATABASE IF EXISTS "{self.CYCLE_DB}"'))

        admin_engine = create_async_engine(admin_url, isolation_level="AUTOCOMMIT")
        async with admin_engine.connect() as conn:
            await _drop_cycle_db(conn)
            await conn.execute(text(f'CREATE DATABASE "{self.CYCLE_DB}"'))
        await admin_engine.dispose()

        from database.connection import Base

        # This test module imports models.market_data at module scope (for
        # the other test classes below), which registers its tables on the
        # shared Base.metadata as a side effect of the import -- before this
        # fixture ever runs. Base.metadata.create_all() has no notion of
        # "only the pre-010 subset", so it would create those tables too.
        # Explicitly excluding them from create_all()'s table list (rather
        # than dropping them after the fact) is what actually gets us a
        # database that looks like it did the moment before migration 010
        # was written -- create_all() never touches them at all.
        market_data_tables = {
            t for t in Base.metadata.tables.values()
            if t.name in (
                "instruments", "historical_candles",
                "download_status", "simulation_sessions",
            )
        }
        pre_010_tables = [
            t for t in Base.metadata.tables.values() if t not in market_data_tables
        ]

        cycle_engine = create_async_engine(cycle_url)
        async with cycle_engine.begin() as conn:
            await conn.run_sync(
                lambda sync_conn: Base.metadata.create_all(
                    sync_conn, tables=pre_010_tables
                )
            )
        await cycle_engine.dispose()

        env = os.environ.copy()
        env["DATABASE_URL"] = cycle_url
        subprocess.run(
            ["python", "-m", "alembic", "stamp", "009"],
            check=True, env=env, capture_output=True, text=True,
        )

        yield cycle_url

        cleanup_engine = create_async_engine(admin_url, isolation_level="AUTOCOMMIT")
        async with cleanup_engine.connect() as conn:
            await _drop_cycle_db(conn)
        await cleanup_engine.dispose()

    async def test_upgrade_downgrade_upgrade_cycle_is_clean(self, cycle_db_url):
        import subprocess

        def alembic(*args):
            env = os.environ.copy()
            env["DATABASE_URL"] = cycle_db_url
            result = subprocess.run(
                ["python", "-m", "alembic", *args],
                check=True, env=env, capture_output=True, text=True,
            )
            return result

        async def table_names(engine):
            async with engine.connect() as conn:
                rows = await conn.execute(
                    text("select tablename from pg_tables where schemaname='public'")
                )
                return {r[0] for r in rows}

        async def row_count(engine, table):
            async with engine.connect() as conn:
                return (
                    await conn.execute(text(f"select count(*) from {table}"))
                ).scalar_one()

        engine = create_async_engine(cycle_db_url)
        market_tables = {
            "instruments", "historical_candles", "download_status",
            "simulation_sessions",
        }

        try:
            before = await table_names(engine)
            assert not (before & market_tables), (
                "market-data tables must not exist before migration 010 runs"
            )
            assert "users" in before, "base schema bootstrap did not create users"

            # A marker row in a pre-existing table, to prove downgrade never
            # touches unrelated data.
            async with engine.begin() as conn:
                await conn.execute(
                    text(
                        "insert into users "
                        "(id, username, full_name, email, password_hash, "
                        " virtual_capital, created_at, updated_at) "
                        "values (gen_random_uuid(), 'migration_cycle_marker', "
                        " 'Marker', 'marker@cycle.test', 'x', 100000, now(), now())"
                    )
                )
            users_before = await row_count(engine, "users")
            assert users_before == 1

            # ── upgrade ──
            alembic("upgrade", "head")
            after_upgrade = await table_names(engine)
            assert market_tables <= after_upgrade, (
                f"migration 010 did not create all expected tables: "
                f"missing {market_tables - after_upgrade}"
            )
            assert await row_count(engine, "users") == users_before

            # ── downgrade ──
            alembic("downgrade", "-1")
            after_downgrade = await table_names(engine)
            assert not (after_downgrade & market_tables), (
                f"downgrade left market-data tables behind: "
                f"{after_downgrade & market_tables}"
            )
            # Every pre-existing table must still be present post-downgrade.
            assert before <= after_downgrade, (
                f"downgrade removed pre-existing tables: {before - after_downgrade}"
            )
            assert await row_count(engine, "users") == users_before, (
                "downgrade must never touch unrelated application data"
            )

            # ── upgrade again ──
            alembic("upgrade", "head")
            after_reupgrade = await table_names(engine)
            assert market_tables <= after_reupgrade, "reapplying migration 010 failed"
            assert await row_count(engine, "users") == users_before
        finally:
            # Disposed even on assertion failure so a failed run's leftover
            # connection can never block the next run's DROP DATABASE.
            await engine.dispose()


# ── 1. Schema shape, as actually created by alembic ─────────────────


class TestRealPostgresSchema:
    async def test_new_tables_exist(self, pg):
        rows = (
            await pg.execute(
                text(
                    "select tablename from pg_tables where schemaname='public'"
                )
            )
        ).scalars().all()
        for t in (
            "instruments",
            "historical_candles",
            "download_status",
            "simulation_sessions",
        ):
            assert t in rows, f"{t} missing from real PostgreSQL"

    async def test_unique_constraint_backing_upsert_exists(self, pg):
        """The idempotent upsert relies on this constraint being real."""
        names = (
            await pg.execute(
                text(
                    "select conname from pg_constraint "
                    "where conrelid='historical_candles'::regclass and contype='u'"
                )
            )
        ).scalars().all()
        assert "uq_historical_candles_instrument_ts" in names

    async def test_replay_lookup_indexes_exist(self, pg):
        names = (
            await pg.execute(
                text(
                    "select indexname from pg_indexes "
                    "where tablename='historical_candles'"
                )
            )
        ).scalars().all()
        for idx in (
            "ix_historical_candles_instrument_id",
            "ix_historical_candles_trading_date",
            "ix_historical_candles_timestamp",
            "ix_historical_candles_lookup",
        ):
            assert idx in names, f"{idx} missing"

    async def test_unique_constraint_is_actually_enforced(self, pg):
        """
        SQLite would let a duplicate through in several of these shapes.
        PostgreSQL must reject it outright.
        """
        inst = await _seed_instrument(
            pg, EQ_SYMBOL, "EQUITY", "26000", "NSE", [25000.0]
        )
        pg.add(
            HistoricalCandle(
                instrument_id=inst.id,
                trading_date=SIM_DATE,
                timestamp=_ts(9, 15),  # same (instrument_id, timestamp)
                open=1.0,
                high=1.0,
                low=1.0,
                close=1.0,
                volume=1,
                source="dupe",
            )
        )
        with pytest.raises(Exception):
            await pg.flush()
        await pg.rollback()


# ── 2. Downloader persistence + idempotency, on real PostgreSQL ─────


class TestRealPostgresUpsertIdempotency:
    async def test_persist_candles_is_idempotent(self, pg):
        """
        Run the real downloader persistence path twice with the same mocked
        Zebu payload and assert no duplicate rows appear in real PostgreSQL.
        """
        downloader = ZebuHistoricalDownloader()
        uinst = UniverseInstrument(
            token="26000",
            trading_symbol=EQ_SYMBOL,
            exchange="NSE",
            instrument_type="EQUITY",
            underlying="TESTNIFTY-SIM",
            canonical_symbol=EQ_SYMBOL,
        )
        inst = await downloader.upsert_instrument(pg, uinst)
        await pg.commit()

        candles = [
            {
                "time": _epoch(9, 15 + i),
                "open": 25000.0 + i,
                "high": 25010.0 + i,
                "low": 24990.0 + i,
                "close": 25005.0 + i,
                "volume": 100,
                "open_interest": None,
            }
            for i in range(5)
        ]

        first = await downloader.persist_candles(pg, inst, candles, SIM_DATE)
        await pg.commit()
        second = await downloader.persist_candles(pg, inst, candles, SIM_DATE)
        await pg.commit()

        assert first == 5
        assert second == 5  # 5 rows written, but as updates

        total = (
            await pg.execute(
                select(func.count())
                .select_from(HistoricalCandle)
                .where(HistoricalCandle.instrument_id == inst.id)
            )
        ).scalar_one()
        assert total == 5, "re-running the download duplicated rows"

    async def test_reupsert_updates_values_in_place(self, pg):
        downloader = ZebuHistoricalDownloader()
        uinst = UniverseInstrument(
            token="26000",
            trading_symbol=EQ_SYMBOL,
            exchange="NSE",
            instrument_type="EQUITY",
            canonical_symbol=EQ_SYMBOL,
        )
        inst = await downloader.upsert_instrument(pg, uinst)
        await pg.commit()

        base = {
            "time": _epoch(9, 15),
            "open": 25000.0,
            "high": 25010.0,
            "low": 24990.0,
            "close": 25005.0,
            "volume": 100,
            "open_interest": None,
        }
        await downloader.persist_candles(pg, inst, [base], SIM_DATE)
        await pg.commit()

        corrected = {**base, "close": 25123.0, "volume": 999}
        await downloader.persist_candles(pg, inst, [corrected], SIM_DATE)
        await pg.commit()

        rows = (
            await pg.execute(
                select(HistoricalCandle).where(
                    HistoricalCandle.instrument_id == inst.id
                )
            )
        ).scalars().all()
        assert len(rows) == 1
        assert float(rows[0].close) == 25123.0
        assert rows[0].volume == 999


# ── 3. The replay engine's own query, against real indexes ──────────


class TestRealPostgresReplayQuery:
    async def test_engine_loads_seeded_day_from_postgres(self, pg):
        await _seed_instrument(
            pg, EQ_SYMBOL, "EQUITY", "26000", "NSE", [25000.0, 25010.0, 25020.0]
        )
        engine = HistoricalReplayEngine()
        await engine.load_session(pg, SIM_DATE)
        assert len(engine._instruments) >= 1

        keys = {t.trading_symbol for t in engine._instruments.values()}
        assert EQ_SYMBOL in keys

    async def test_lookup_index_is_used_for_the_replay_query(self, pg):
        """
        Confirm the planner actually reaches for an index on the
        (instrument_id, trading_date, timestamp) access path rather than
        sequentially scanning — the reason those indexes exist.
        """
        inst = await _seed_instrument(
            pg, EQ_SYMBOL, "EQUITY", "26000", "NSE", [25000.0 + i for i in range(20)]
        )
        # Encourage the planner to prefer indexes for this session so the
        # assertion is about index *availability*, not table size heuristics.
        await pg.execute(text("SET LOCAL enable_seqscan = off"))
        plan = "\n".join(
            (
                await pg.execute(
                    text(
                        "EXPLAIN SELECT * FROM historical_candles "
                        "WHERE instrument_id = :iid AND trading_date = :td "
                        "ORDER BY timestamp"
                    ),
                    {"iid": inst.id, "td": SIM_DATE},
                )
            ).scalars().all()
        )
        assert "Index" in plan, f"expected an index scan, got:\n{plan}"


# ── 4. Retention worker against real PostgreSQL ─────────────────────


class TestRealPostgresRetention:
    async def test_purge_removes_only_rows_older_than_cutoff(self, pg):
        inst = await _seed_instrument(pg, EQ_SYMBOL, "EQUITY", "26000", "NSE", [])
        today = date(2026, 8, 20)
        old_day = today - timedelta(days=200)
        keep_day = today - timedelta(days=10)

        # Realistic intraday volume: 375 one-minute candles per day.
        for day in (old_day, keep_day):
            for i in range(375):
                pg.add(
                    HistoricalCandle(
                        instrument_id=inst.id,
                        trading_date=day,
                        timestamp=datetime.combine(
                            day, datetime.min.time(), tzinfo=timezone.utc
                        )
                        + timedelta(minutes=i),
                        open=25000.0,
                        high=25001.0,
                        low=24999.0,
                        close=25000.0,
                        volume=10,
                        source="zebu_tp_series",
                    )
                )
        await pg.commit()

        before = (
            await pg.execute(
                select(func.count())
                .select_from(HistoricalCandle)
                .where(HistoricalCandle.instrument_id == inst.id)
            )
        ).scalar_one()
        assert before == 750

        # Unrelated tables must be untouched by retention.
        users_before = (
            await pg.execute(text("select count(*) from users"))
        ).scalar_one()
        orders_before = (
            await pg.execute(text("select count(*) from orders"))
        ).scalar_one()

        summary = await purge_old_market_data(pg, retention_days=100, today=today)
        await pg.commit()

        after = (
            await pg.execute(
                select(func.count())
                .select_from(HistoricalCandle)
                .where(HistoricalCandle.instrument_id == inst.id)
            )
        ).scalar_one()
        assert after == 375, f"expected only the recent day to survive, got {after}"
        assert summary["candles_deleted"] >= 375

        assert (
            await pg.execute(text("select count(*) from users"))
        ).scalar_one() == users_before
        assert (
            await pg.execute(text("select count(*) from orders"))
        ).scalar_one() == orders_before


# ── 5. Replay -> EventBus -> REAL Redis ─────────────────────────────


class TestReplayIntoRealRedis:
    async def test_replayed_equity_quote_lands_in_real_redis(self, pg, real_redis):
        """
        The critical path: a replayed candle must reach real Redis through
        the SAME PriceCache the live feed writes to, and be readable back
        through the same read path a live quote uses.
        """
        market_data_mode.reset()
        try:
            await _seed_instrument(
                pg, EQ_SYMBOL, "EQUITY", UNMAPPED_EQ_TOKEN, "NSE", [25000.0, 25010.0]
            )
            market_data_mode.set_mode(MarketDataMode.SIMULATION)

            engine = HistoricalReplayEngine()
            await engine.load_session(pg, SIM_DATE)
            await engine.advance_to(_epoch(9, 16))

            stored = await real_redis.get_price(EQ_SYMBOL)
            assert stored is not None, "replayed quote never reached real Redis"
            assert stored["source"] == REPLAY_SOURCE
            assert float(stored["ltp"]) in (25000.0, 25010.0)
        finally:
            market_data_mode.reset()

    async def test_replayed_quote_key_has_a_ttl_in_real_redis(self, pg, real_redis):
        market_data_mode.reset()
        try:
            await _seed_instrument(pg, EQ_SYMBOL, "EQUITY", UNMAPPED_EQ_TOKEN, "NSE", [25000.0])
            market_data_mode.set_mode(MarketDataMode.SIMULATION)

            engine = HistoricalReplayEngine()
            await engine.load_session(pg, SIM_DATE)
            await engine.advance_to(_epoch(9, 15))

            client = real_redis._redis
            matching = await client.keys(f"alphasync:price:*{EQ_SYMBOL}*")
            assert matching, "no alphasync:price key written to real Redis"
            for key in matching:
                ttl = await client.ttl(key)
                assert ttl > 0, f"{key} was written without a TTL"
        finally:
            market_data_mode.reset()

    async def test_replay_uses_the_same_pricecache_singleton_as_live(
        self, pg, real_redis
    ):
        """
        There must be exactly ONE Redis-backed market-data pipeline. Replay
        must not construct its own client or connection pool.
        """
        import cache.redis_client as rc

        assert rc._price_cache is real_redis
        before = id(rc._price_cache)

        market_data_mode.reset()
        try:
            await _seed_instrument(pg, EQ_SYMBOL, "EQUITY", "26000", "NSE", [25000.0])
            market_data_mode.set_mode(MarketDataMode.SIMULATION)
            engine = HistoricalReplayEngine()
            await engine.load_session(pg, SIM_DATE)
            await engine.advance_to(_epoch(9, 15))
        finally:
            market_data_mode.reset()

        assert id(rc._price_cache) == before, "replay replaced the PriceCache singleton"

    async def test_replay_emits_the_same_event_types_as_live(self, pg, real_redis):
        """
        The websocket manager subscribes to PRICE_UPDATED / FUTURES_QUOTE.
        Replay must emit those same types so the WS layer needs no changes.

        event_bus.emit() only enqueues; delivery to subscribers happens in
        event_bus.run()'s dispatch loop, which main.py starts as a
        background task in the real app. That loop isn't running under
        pytest, so it must be started here for the duration of the test.
        """
        import asyncio

        from core.event_bus import EventType, event_bus

        seen: list[str] = []

        async def _capture(event):
            seen.append(event.type)

        event_bus.subscribe(EventType.PRICE_UPDATED, _capture)
        event_bus.subscribe(EventType.FUTURES_QUOTE, _capture)
        dispatcher = asyncio.create_task(event_bus.run())

        market_data_mode.reset()
        try:
            await _seed_instrument(
                pg, EQ_SYMBOL, "EQUITY", UNMAPPED_EQ_TOKEN, "NSE", [25000.0, 25010.0]
            )
            await _seed_instrument(
                pg, FUT_SYMBOL, "FUTURES", "35001", "NFO", [25050.0, 25060.0]
            )
            market_data_mode.set_mode(MarketDataMode.SIMULATION)

            engine = HistoricalReplayEngine()
            await engine.load_session(pg, SIM_DATE)
            await engine.advance_to(_epoch(9, 16))
            # Give the dispatcher loop a chance to drain the queue.
            await asyncio.sleep(0.2)
        finally:
            market_data_mode.reset()
            dispatcher.cancel()
            try:
                await dispatcher
            except (asyncio.CancelledError, Exception):
                pass
            try:
                event_bus.unsubscribe(EventType.PRICE_UPDATED, _capture)
                event_bus.unsubscribe(EventType.FUTURES_QUOTE, _capture)
            except Exception:
                pass

        assert EventType.PRICE_UPDATED in seen
        assert EventType.FUTURES_QUOTE in seen


# ── 6. Restart recovery against real PostgreSQL ─────────────────────


class TestRestartRecoveryOnRealPostgres:
    async def test_running_session_becomes_paused_after_restart(self, pg):
        """
        Same recovery contract previously proven on SQLite, now against real
        PostgreSQL with freshly constructed service objects standing in for
        a process restart.
        """
        from services.simulation_control import SimulationController

        session = SimulationSession(
            simulation_date=SIM_DATE,
            status="RUNNING",
            speed=1,
            simulation_time=_ts(10, 30),
            started_at=_ts(9, 15),
        )
        pg.add(session)
        await pg.commit()
        sid = session.id
        saved_clock = session.simulation_time

        # Simulate a restart: brand-new control object, no in-memory engine.
        control = SimulationController()
        result = await control.recover_orphaned_sessions(pg)
        await pg.commit()

        # recover_orphaned_sessions() returns {"recovered": [<per-session
        # summary dict>, ...]}, not a count.
        assert len(result["recovered"]) == 1
        assert result["recovered"][0]["id"] == str(sid)

        pg.expire_all()
        reloaded = (
            await pg.execute(
                select(SimulationSession).where(SimulationSession.id == sid)
            )
        ).scalar_one()
        assert reloaded.status == "PAUSED", "orphaned RUNNING session was not paused"
        assert reloaded.simulation_date == SIM_DATE
        assert reloaded.simulation_time == saved_clock, "clock position was lost"

    async def test_recovery_does_not_touch_unrelated_tables(self, pg):
        from services.simulation_control import SimulationController

        users_before = (
            await pg.execute(text("select count(*) from users"))
        ).scalar_one()
        orders_before = (
            await pg.execute(text("select count(*) from orders"))
        ).scalar_one()

        pg.add(
            SimulationSession(
                simulation_date=SIM_DATE,
                status="RUNNING",
                speed=1,
                simulation_time=_ts(10, 0),
            )
        )
        await pg.commit()

        await SimulationController().recover_orphaned_sessions(pg)
        await pg.commit()

        assert (
            await pg.execute(text("select count(*) from users"))
        ).scalar_one() == users_before
        assert (
            await pg.execute(text("select count(*) from orders"))
        ).scalar_one() == orders_before


# ── 7. Full multi-instrument replay walk on real infra ──────────────


class TestEndToEndReplayOnRealInfra:
    async def test_equity_future_and_both_option_legs_replay_together(
        self, pg, real_redis
    ):
        """
        Seed one equity, one future, and both option legs of a strike, then
        walk the simulated clock forward and confirm each step updates
        state consistently against real PostgreSQL and real Redis.
        """
        market_data_mode.reset()
        try:
            await _seed_instrument(
                pg, EQ_SYMBOL, "EQUITY", UNMAPPED_EQ_TOKEN, "NSE",
                [25000.0, 25010.0, 25020.0, 25030.0],
            )
            await _seed_instrument(
                pg, FUT_SYMBOL, "FUTURES", "35001", "NFO",
                [25050.0, 25060.0, 25070.0, 25080.0],
            )
            await _seed_instrument(
                pg, CE_SYMBOL, "OPTIONS", "45001", "NFO",
                [120.0, 125.0, 130.0, 135.0],
                option_type="CE", strike=25000.0,
            )
            await _seed_instrument(
                pg, PE_SYMBOL, "OPTIONS", "45002", "NFO",
                [110.0, 105.0, 100.0, 95.0],
                option_type="PE", strike=25000.0,
            )
            market_data_mode.set_mode(MarketDataMode.SIMULATION)

            engine = HistoricalReplayEngine()
            await engine.load_session(pg, SIM_DATE)
            assert len(engine._instruments) == 4, (
                f"expected 4 instruments loaded, got {len(engine._instruments)}"
            )

            seen_ltps = []
            for minute in range(4):
                await engine.advance_to(_epoch(9, 15 + minute))
                stored = await real_redis.get_price(EQ_SYMBOL)
                assert stored is not None
                seen_ltps.append(float(stored["ltp"]))

            # The equity price must actually walk forward through the ladder,
            # not stick on the first candle.
            assert seen_ltps == sorted(seen_ltps)
            assert seen_ltps[-1] > seen_ltps[0]

            # All four instruments must be holding replayed state.
            assert len(engine._state) == 4
            ce = [v for k, v in engine._state.items() if CE_SYMBOL in str(k)]
            pe = [v for k, v in engine._state.items() if PE_SYMBOL in str(k)]
            assert ce and pe, "option legs produced no replay state"
            assert float(ce[0]["ltp"]) > 0
            assert float(pe[0]["ltp"]) > 0
        finally:
            market_data_mode.reset()
