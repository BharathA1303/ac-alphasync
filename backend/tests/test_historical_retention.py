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


@pytest.mark.asyncio
class TestRetentionAtRealisticVolume:
    """
    The small-fixture tests above prove the cutoff comparison. These prove
    it still holds across a realistic corpus: many instruments, many
    trading days, many bars per day, spanning the cutoff boundary.

    Volume is chosen to exercise date-boundary logic meaningfully while
    keeping the suite fast: 6 instruments x 120 calendar days (weekends
    skipped) x 6 bars.
    """

    INSTRUMENTS = 6
    DAYS = 120
    BARS_PER_DAY = 6

    async def _seed_corpus(self, db):
        """
        Candles across DAYS calendar days ending at TODAY, straddling the
        100-day cutoff. Returns (expected_old, expected_kept).
        """
        cutoff = cutoff_date(100, TODAY)
        expected_old = 0
        expected_kept = 0

        for i in range(self.INSTRUMENTS):
            inst = await _instrument(db, f"VOLCO{i:02d}", f"80{i:02d}")

            for d in range(self.DAYS):
                trading_date = TODAY - timedelta(days=d)
                # Skip weekends so the corpus resembles real trading days.
                if trading_date.weekday() >= 5:
                    continue

                for bar in range(self.BARS_PER_DAY):
                    db.add(
                        HistoricalCandle(
                            instrument_id=inst.id,
                            trading_date=trading_date,
                            timestamp=datetime.combine(
                                trading_date, datetime.min.time(), tzinfo=timezone.utc
                            )
                            + timedelta(minutes=bar),
                            open=100.0 + bar,
                            high=101.0 + bar,
                            low=99.0 + bar,
                            close=100.5 + bar,
                            volume=1000 + bar,
                            source="zebu_tp_series",
                        )
                    )
                    if trading_date < cutoff:
                        expected_old += 1
                    else:
                        expected_kept += 1

                db.add(
                    DownloadStatus(
                        trading_date=trading_date,
                        instrument_id=inst.id,
                        status="SUCCESS",
                        rows=self.BARS_PER_DAY,
                    )
                )

        await db.flush()
        return expected_old, expected_kept

    async def test_purge_at_volume_respects_the_cutoff_boundary(self, db):
        expected_old, expected_kept = await self._seed_corpus(db)
        cutoff = cutoff_date(100, TODAY)

        # Sanity: the corpus must actually straddle the boundary, or this
        # test would prove nothing.
        assert expected_old > 0, "corpus must contain rows older than cutoff"
        assert expected_kept > 0, "corpus must contain rows at/after cutoff"

        total_before = (
            await db.execute(select(func.count()).select_from(HistoricalCandle))
        ).scalar_one()
        assert total_before == expected_old + expected_kept

        summary = await purge_old_market_data(db, 100, TODAY, commit=False)

        assert summary["candles_deleted"] == expected_old

        remaining = (
            await db.execute(select(func.count()).select_from(HistoricalCandle))
        ).scalar_one()
        assert remaining == expected_kept

        # Nothing older than the cutoff may survive...
        stale = (
            await db.execute(
                select(func.count())
                .select_from(HistoricalCandle)
                .where(HistoricalCandle.trading_date < cutoff)
            )
        ).scalar_one()
        assert stale == 0

        # ...and nothing at/after it may be lost.
        kept = (
            await db.execute(
                select(func.count())
                .select_from(HistoricalCandle)
                .where(HistoricalCandle.trading_date >= cutoff)
            )
        ).scalar_one()
        assert kept == expected_kept

    async def test_row_exactly_at_cutoff_survives_at_volume(self, db):
        """Boundary is strict: trading_date == cutoff is retained."""
        await self._seed_corpus(db)
        cutoff = cutoff_date(100, TODAY)

        at_cutoff_before = (
            await db.execute(
                select(func.count())
                .select_from(HistoricalCandle)
                .where(HistoricalCandle.trading_date == cutoff)
            )
        ).scalar_one()

        await purge_old_market_data(db, 100, TODAY, commit=False)

        at_cutoff_after = (
            await db.execute(
                select(func.count())
                .select_from(HistoricalCandle)
                .where(HistoricalCandle.trading_date == cutoff)
            )
        ).scalar_one()

        assert at_cutoff_after == at_cutoff_before

    async def test_instrument_identity_rows_survive_at_volume(self, db):
        """Purging candles must never orphan or delete instrument identity."""
        await self._seed_corpus(db)
        before = (
            await db.execute(select(func.count()).select_from(Instrument))
        ).scalar_one()

        await purge_old_market_data(db, 100, TODAY, commit=False)

        after = (
            await db.execute(select(func.count()).select_from(Instrument))
        ).scalar_one()
        assert after == before
        assert after >= self.INSTRUMENTS

    async def test_user_money_tables_are_untouched_at_volume(self, db, test_user):
        """
        The critical safety property, asserted by explicit before/after
        counts AND values on every user-facing table — not merely by the
        absence of an exception.
        """
        from models.broker import BrokerAccount
        from models.portfolio import Holding, Transaction

        portfolio = (
            await db.execute(
                select(Portfolio).where(Portfolio.user_id == test_user.id)
            )
        ).scalars().first()

        order = Order(
            user_id=test_user.id,
            symbol="RELIANCE",
            order_type="MARKET",
            side="BUY",
            quantity=25,
            price=2500.0,
            status="FILLED",
        )
        db.add(order)

        holding = Holding(
            portfolio_id=portfolio.id,
            symbol="RELIANCE",
            quantity=25,
            avg_price=2500.0,
            current_price=2550.0,
            invested_value=62500.0,
            current_value=63750.0,
            pnl=1250.0,
            pnl_percent=2.0,
        )
        db.add(holding)

        txn = Transaction(
            user_id=test_user.id,
            symbol="RELIANCE",
            transaction_type="BUY",
            quantity=25,
            price=2500.0,
            total_value=62500.0,
        )
        db.add(txn)

        broker = BrokerAccount(user_id=test_user.id, broker="zebu", is_active=True)
        db.add(broker)
        await db.flush()

        await self._seed_corpus(db)

        async def _counts():
            out = {}
            for model in (User, Order, Portfolio, Holding, Transaction, BrokerAccount):
                out[model.__name__] = (
                    await db.execute(select(func.count()).select_from(model))
                ).scalar_one()
            return out

        before_counts = await _counts()
        before_values = {
            "capital": float(portfolio.available_capital),
            "pnl": float(portfolio.total_pnl),
            "holding_qty": holding.quantity,
            "holding_pnl": float(holding.pnl),
            "order_status": order.status,
            "txn_value": float(txn.total_value),
            "broker_active": broker.is_active,
        }

        summary = await purge_old_market_data(db, 100, TODAY, commit=False)
        assert summary["candles_deleted"] > 0, "the purge must have done real work"

        after_counts = await _counts()
        assert after_counts == before_counts, (
            f"retention purge changed user data row counts: "
            f"{before_counts} -> {after_counts}"
        )

        # Values, not just counts.
        await db.refresh(portfolio)
        await db.refresh(holding)
        await db.refresh(order)
        await db.refresh(txn)
        await db.refresh(broker)

        assert float(portfolio.available_capital) == before_values["capital"]
        assert float(portfolio.total_pnl) == before_values["pnl"]
        assert holding.quantity == before_values["holding_qty"]
        assert float(holding.pnl) == before_values["holding_pnl"]
        assert order.status == before_values["order_status"]
        assert float(txn.total_value) == before_values["txn_value"]
        assert broker.is_active == before_values["broker_active"]

    async def test_download_status_rows_follow_the_same_boundary(self, db):
        await self._seed_corpus(db)
        cutoff = cutoff_date(100, TODAY)

        expected_old = (
            await db.execute(
                select(func.count())
                .select_from(DownloadStatus)
                .where(DownloadStatus.trading_date < cutoff)
            )
        ).scalar_one()

        summary = await purge_old_market_data(db, 100, TODAY, commit=False)
        assert summary["download_status_deleted"] == expected_old

        stale = (
            await db.execute(
                select(func.count())
                .select_from(DownloadStatus)
                .where(DownloadStatus.trading_date < cutoff)
            )
        ).scalar_one()
        assert stale == 0
