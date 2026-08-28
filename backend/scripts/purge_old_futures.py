"""
Script: Purge Old Limited Futures Data

Deletes old futures instruments and their associated candles from the database,
leaving Equity, Index, Option, and User data completely untouched.
"""

import asyncio
import logging
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from database.connection import async_session_factory
from models.market_data import Instrument, HistoricalCandle
from sqlalchemy import delete, select, func

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s]: %(message)s")
logger = logging.getLogger("purge_futures")


async def main():
    async with async_session_factory() as db:
        # 1. Count candles before
        future_inst_ids = (
            await db.execute(
                select(Instrument.id).where(
                    Instrument.instrument_type.in_(["FUTURES", "FUTIDX", "FUTSTK"])
                )
            )
        ).scalars().all()

        logger.info(f"Found {len(future_inst_ids)} old futures instruments in database")

        if future_inst_ids:
            candle_count = (
                await db.execute(
                    select(func.count()).select_from(HistoricalCandle).where(
                        HistoricalCandle.instrument_id.in_(future_inst_ids)
                    )
                )
            ).scalar_one()

            logger.info(f"Deleting {candle_count} historical candles for old futures...")

            # 2. Delete instruments (candles cascade automatically)
            del_stmt = delete(Instrument).where(
                Instrument.instrument_type.in_(["FUTURES", "FUTIDX", "FUTSTK"])
            )
            res = await db.execute(del_stmt)
            await db.commit()

            logger.info(f"Successfully purged {res.rowcount} old futures instruments and {candle_count} old candles!")
        else:
            logger.info("No old futures instruments found in database.")


if __name__ == "__main__":
    asyncio.run(main())
