/**
 * Client-side NSE session truth (IST) — mirrors backend market_session.py calendar.
 * Corrects stale/wrong API session responses (e.g. holiday shown as open).
 *
 * Merge logic (v2 — 2026-07-06 fix):
 *  - API wins when it says "open" (live broker confirmed trading).
 *  - Local calendar wins only for genuine holiday/weekend/closed detection
 *    to prevent the platform from trading when the API is stale.
 */

const IST = 'Asia/Kolkata';

/** NSE trading holidays 2026 (YYYY-MM-DD, Asia/Kolkata). Keep in sync with backend. */
export const NSE_HOLIDAYS_IST = new Set([
  '2026-01-15',
  '2026-01-26',
  '2026-03-03',
  '2026-03-26',
  '2026-03-31',
  '2026-04-03',
  '2026-04-14',
  '2026-05-01',
  '2026-05-28',
  '2026-06-26',
  '2026-09-14',
  '2026-10-02',
  '2026-10-20',
  '2026-11-10',
  '2026-11-24',
  '2026-12-25',
]);

const STATE_LABELS = {
  open: 'Market Open',
  pre_market: 'Pre-Market',
  closing: 'Closing',
  after_market: 'After Market',
  closed: 'Market Closed',
  weekend: 'Weekend',
  holiday: 'Holiday',
};

function getIstParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const pick = (type) => parts.find((p) => p.type === type)?.value || '';
  const hour = Number(pick('hour'));
  const minute = Number(pick('minute'));
  const second = Number(pick('second'));
  return {
    date: `${pick('year')}-${pick('month')}-${pick('day')}`,
    weekday: pick('weekday'),
    time: `${pick('hour')}:${pick('minute')}:${pick('second')}`,
    minutes: hour * 60 + minute,
  };
}

/**
 * Authoritative NSE session for display + frozen price mode (IST).
 */
export function computeLocalNseSession(now = new Date()) {
  const ist = getIstParts(now);

  if (ist.weekday === 'Sat' || ist.weekday === 'Sun') {
    return {
      state: 'weekend',
      label: STATE_LABELS.weekend,
      isOpen: false,
      isClosed: true,
      frozen: true,
      ist_date: ist.date,
      ist_time: ist.time,
    };
  }

  if (NSE_HOLIDAYS_IST.has(ist.date)) {
    return {
      state: 'holiday',
      label: STATE_LABELS.holiday,
      isOpen: false,
      isClosed: true,
      frozen: true,
      ist_date: ist.date,
      ist_time: ist.time,
    };
  }

  const m = ist.minutes;
  if (m >= 9 * 60 + 0 && m < 9 * 60 + 15) {
    return {
      state: 'pre_market',
      label: STATE_LABELS.pre_market,
      isOpen: false,
      isClosed: true,
      frozen: true,
      ist_date: ist.date,
      ist_time: ist.time,
    };
  }
  if (m >= 9 * 60 + 15 && m < 15 * 60 + 30) {
    return {
      state: 'open',
      label: STATE_LABELS.open,
      isOpen: true,
      isClosed: false,
      frozen: false,
      ist_date: ist.date,
      ist_time: ist.time,
    };
  }
  if (m >= 15 * 60 + 30 && m < 15 * 60 + 40) {
    return {
      state: 'closing',
      label: STATE_LABELS.closing,
      isOpen: false,
      isClosed: true,
      frozen: true,
      ist_date: ist.date,
      ist_time: ist.time,
    };
  }
  if (m >= 15 * 60 + 40 && m < 16 * 60 + 0) {
    return {
      state: 'after_market',
      label: STATE_LABELS.after_market,
      isOpen: false,
      isClosed: true,
      frozen: true,
      ist_date: ist.date,
      ist_time: ist.time,
    };
  }

  return {
    state: 'closed',
    label: STATE_LABELS.closed,
    isOpen: false,
    isClosed: true,
    frozen: true,
    ist_date: ist.date,
    ist_time: ist.time,
  };
}

/**
 * Merge API payload with IST calendar truth.
 *
 * Trust rules:
 *  - API 'open' wins: if the live API confirms the market is open, trust it.
 *    The broker session is the authoritative source for live state.
 *  - Local calendar wins for closed/holiday/weekend: prevents trading when
 *    the API is stale or slow-to-update on genuine market-close events.
 *  - session_corrected flag: set when local and API disagree (for diagnostics).
 */
export function mergeSessionWithLocalTruth(apiSession = {}) {
  const local = computeLocalNseSession();
  const apiState = String(apiSession.state || '').toLowerCase();

  // If the broker API confirms market is open AND local calendar is not a
  // weekend/holiday (only genuinely closed/off-hours can be overridden by API).
  // This prevents a stale or buggy local calendar from blocking live trading.
  const apiSaysOpen = apiState === 'open';
  const localIsHolidayOrWeekend = local.state === 'holiday' || local.state === 'weekend';

  // Final effective state: API wins for open; local wins for holiday/weekend.
  // For other states (pre_market, closing, after_market, closed), local wins.
  let effectiveState, effectiveLabel, effectiveOpen, effectiveFrozen;
  if (apiSaysOpen && !localIsHolidayOrWeekend) {
    // Trust the API: market is live
    effectiveState = 'open';
    effectiveLabel = 'Market Open';
    effectiveOpen = true;
    effectiveFrozen = false;
  } else if (localIsHolidayOrWeekend) {
    // Hard override: never trade on holidays/weekends regardless of API
    effectiveState = local.state;
    effectiveLabel = local.label;
    effectiveOpen = false;
    effectiveFrozen = true;
  } else {
    // Use local calendar for pre-market, closing, after-market, closed
    effectiveState = local.state;
    effectiveLabel = local.label;
    effectiveOpen = local.isOpen;
    effectiveFrozen = local.frozen;
  }

  return {
    ...apiSession,
    state: effectiveState,
    label: effectiveLabel,
    isOpen: effectiveOpen,
    isClosed: !effectiveOpen,
    is_trading_hours: effectiveOpen,
    is_trading: effectiveOpen,
    can_place_orders: effectiveOpen && apiSaysOpen && !!apiSession.can_place_orders,
    can_run_algo: effectiveOpen,
    frozen: effectiveFrozen,
    ist_date: local.ist_date,
    ist_time: local.ist_time,
    session_corrected: apiSaysOpen && !effectiveOpen,
  };
}
