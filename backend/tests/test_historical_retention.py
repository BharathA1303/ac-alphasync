"""
Tests for the historical retention worker.

Verifies the 100-day cutoff boundary and — critically — that the purge
never touches users, orders, portfolios, or instruments.
"""

from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select

from models.market_data import DownloadStatus, HistoricalCandle, Instrument
from models.order import Order
from models.portfolio import Portfolio
from models.user import User
from workers.historical_retention_worker import (
    RETENTION_DAYS,
    cutoff_date,
    purge_old_market_data,
)

TODAY = date(2026, 8, 20)


async def _instrument(db, tsym, token):
    inst = Instrument(
        token=token,
        trading_symbol=tsym,
        exchange="NSE",
        instrument_type="EQUITY",
    )
    db.add(inst)
    await db.flush()
    return inst


async def _candle(db, instrument, trading_date, close=100.0):
    row = HistoricalCandle(
        instrument_id=instrument.id,
        trading_date=trading_date,
        timestamp=datetime.combine(
            trading_date, datetime.min.time(), tzinfo=timezone.utc
        ),
        open=close,
        high=close,
        low=close,
        close=close,
        volume=1,
        source="zebu_tp_series",
    )
    db.add(row)
    await db.flush()
    return row


class TestCutoffCalculation:
    def test_default_retention_is_100_days(self):
        assert RETENTION_DAYS == 100

    def test_cutoff_is_today_minus_retention(self):
        assert cutoff_date(100, TODAY) == TODAY - timedelta(days=100)


@pytest.mark.asyncio
class TestRetentionPurge:
    async def test_deletes_only_rows_older_than_cutoff(self, db):
        inst = await _instrument(db, "RETAINCO", "6001")
        cutoff = cutoff_date(100, TODAY)

        older = await _candle(db, inst, cutoff - timedelta(days=1), 10.0)  # delete
        at_cutoff = await _candle(db, inst, cutoff, 20.0)                  # keep
        newer = await _candle(db, inst, cutoff + timedelta(days=1), 30.0)  # keep
        recent = await _candle(db, inst, TODAY, 40.0)                      # keep

        summary = await purge_old_market_data(db, 100, TODAY, commit=False)
        assert summary["candles_deleted"] == 1

        remaining = (
            await db.execute(
                select(HistoricalCandle).where(
                    HistoricalCandle.instrument_id == inst.id
                )
            )
        ).scalars().all()
        closes = sorted(float(r.close) for r in remaining)
        assert closes == [20.0, 30.0, 40.0], "row exactly at cutoff must be retained"

    async def test_deletes_matching_download_status_rows(self, db):
        inst = await _instrument(db, "STATUSRETAIN", "6002")
        cutoff = cutoff_date(100, TODAY)

        db.add(
            DownloadStatus(
                trading_date=cutoff - timedelta(days=5),
                instrument_id=inst.id,
                status="SUCCESS",
                started_at=datetime.now(timezone.utc),
                rows=10,
            )
        )
        db.add(
            DownloadStatus(
                trading_date=TODAY,
                instrument_id=inst.id,
                status="SUCCESS",
                started_at=datetime.now(timezone.utc),
                rows=10,
            )
        )
        await db.flush()

        summary = await purge_old_market_data(db, 100, TODAY, commit=False)
        assert summary["download_status_deleted"] == 1

        remaining = (
            await db.execute(
                select(DownloadStatus).where(DownloadStatus.instrument_id == inst.id)
            )
        ).scalars().all()
        assert len(remaining) == 1
        assert remaining[0].trading_date == TODAY

    async def test_purge_never_touches_unrelated_tables(self, db, test_user):
        """Users, portfolios, orders and instruments must survive untouched."""
        inst = await _instrument(db, "SAFECO", "6003")
        await _candle(db, inst, cutoff_date(100, TODAY) - timedelta(days=10))

        order = Order(
            user_id=test_user.id,
            symbol="RELIANCE",
            order_type="MARKET",
            side="BUY",
            quantity=10,
            status="FILLED",
        )
        db.add(order)
        await db.flush()

        users_before = (await db.execute(select(func.count()).select_from(User))).scalar_one()
        portfolios_before = (
            await db.execute(select(func.count()).select_from(Portfolio))
        ).scalar_one()
        orders_before = (await db.execute(select(func.count()).select_from(Order))).scalar_one()
        instruments_before = (
            await db.execute(select(func.count()).select_from(Instrument))
        ).scalar_one()

        summary = await purge_old_market_data(db, 100, TODAY, commit=False)
        assert summary["candles_deleted"] >= 1

        assert (await db.execute(select(func.count()).select_from(User))).scalar_one() == users_before
        assert (
            await db.execute(select(func.count()).select_from(Portfolio))
        ).scalar_one() == portfolios_before
        assert (await db.execute(select(func.count()).select_from(Order))).scalar_one() == orders_before
        # Instrument identity rows are retained — only candles/status are pruned.
        assert (
            await db.execute(select(func.count()).select_from(Instrument))
        ).scalar_one() == instruments_before

    async def test_purge_with_nothing_to_delete_is_a_noop(self, db):
        inst = await _instrument(db, "NOOPCO", "6004")
        await _candle(db, inst, TODAY)

        summary = await purge_old_market_data(db, 100, TODAY, commit=False)
        assert summary["candles_deleted"] == 0
        assert summary["download_status_deleted"] == 0

        rows = (
            await db.execute(
                select(HistoricalCandle).where(HistoricalCandle.instrument_id == inst.id)
            )
        ).scalars().all()
        assert len(rows) == 1
