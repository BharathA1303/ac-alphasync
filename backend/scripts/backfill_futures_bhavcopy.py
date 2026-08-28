"""
CLI Utility: Backfill Historical Futures Bhavcopy Archives

Downloads and ingests official NSE & BSE daily futures archives into PostgreSQL
for any specified date range.

Usage:
    python scripts/backfill_futures_bhavcopy.py --days 30
    python scripts/backfill_futures_bhavcopy.py --start 2026-01-01 --end 2026-08-28
"""

import argparse
import asyncio
import logging
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from services.futures_archive_service import futures_archive_service
from services.historical_downloader import is_trading_day, latest_complete_trading_day

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("backfill_futures")


async def main():
    parser = argparse.ArgumentParser(description="Backfill NSE/BSE Futures Historical Archives")
    parser.add_argument("--days", type=int, default=None, help="Number of past trading days to backfill")
    parser.add_argument("--start", type=str, default=None, help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end", type=str, default=None, help="End date (YYYY-MM-DD)")
    args = parser.parse_args()

    if args.start and args.end:
        start_date = datetime.strptime(args.start, "%Y-%m-%d").date()
        end_date = datetime.strptime(args.end, "%Y-%m-%d").date()
    elif args.days:
        end_date = latest_complete_trading_day()
        start_date = end_date - timedelta(days=int(args.days * 1.5))
    else:
        end_date = latest_complete_trading_day()
        start_date = end_date - timedelta(days=45)

    logger.info(f"Scanning trading days between {start_date} and {end_date}...")

    trading_days: list[date] = []
    curr = start_date
    while curr <= end_date:
        if is_trading_day(curr):
            trading_days.append(curr)
        curr += timedelta(days=1)

    if args.days and len(trading_days) > args.days:
        trading_days = trading_days[-args.days:]

    logger.info(f"Found {len(trading_days)} trading days to backfill: {trading_days[0]} to {trading_days[-1]}")

    success_count = 0
    total_rows = 0

    for idx, day in enumerate(trading_days, 1):
        logger.info(f"[{idx}/{len(trading_days)}] Ingesting archives for {day}...")
        try:
            res = await futures_archive_service.ingest_trading_day_futures(day)
            if res.get("status") == "SUCCESS":
                success_count += 1
                rows = res.get("rows", 0)
                total_rows += rows
                logger.info(f"  -> SUCCESS ({rows} contracts stored)")
            else:
                logger.warning(f"  -> FAILED/PARTIAL: {res.get('reason')}")
        except Exception as e:
            logger.error(f"  -> ERROR on {day}: {e}")

        # Slight pause between downloads
        await asyncio.sleep(0.5)

    logger.info("=" * 60)
    logger.info(f"BACKFILL SUMMARY:")
    logger.info(f"  Total Days Processed: {len(trading_days)}")
    logger.info(f"  Successful Days:      {success_count}")
    logger.info(f"  Total Contract Rows:  {total_rows}")
    logger.info("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
