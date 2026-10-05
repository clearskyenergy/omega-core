"""Market time: New York clock, the regular session and trading days.

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Every timestamp inside the bot is a timezone-aware datetime in New York time,
because the strategies are defined by the New York open (9:30).

A 1-minute bar is stamped with the minute it STARTS (Alpaca's convention):
the 9:30 bar covers 9:30:00-9:30:59 and is complete at 9:31. So the first
15 minutes are the bars stamped 9:30 through 9:44, and the first bar a
breakout can close on is the one stamped 9:45.
"""

import re
from datetime import date, datetime, time, timedelta, tzinfo

try:  # Windows Pythons often lack the tz database; fall back to the US rule.
    from zoneinfo import ZoneInfo
    ET = ZoneInfo("America/New_York")
except Exception:  # pragma: no cover - exercised only where tzdata is missing
    ET = None


class _USEastern(tzinfo):
    """US Eastern time: DST from the second Sunday of March 02:00 to the
    first Sunday of November 02:00 (the rule since 2007)."""

    def _dst_window(self, year):
        march = datetime(year, 3, 8)
        start = march + timedelta(days=(6 - march.weekday()) % 7)
        nov = datetime(year, 11, 1)
        end = nov + timedelta(days=(6 - nov.weekday()) % 7)
        return start.replace(hour=2), end.replace(hour=1)  # end in standard time

    def utcoffset(self, dt):
        return timedelta(hours=-5) + self.dst(dt)

    def dst(self, dt):
        if dt is None:
            return timedelta(0)
        start, end = self._dst_window(dt.year)
        naive = dt.replace(tzinfo=None)
        return timedelta(hours=1) if start <= naive < end else timedelta(0)

    def tzname(self, dt):
        return "EDT" if self.dst(dt) else "EST"


if ET is None:  # pragma: no cover
    ET = _USEastern()

OPEN = time(9, 30)
CLOSE = time(16, 0)
SESSION_MINUTES = 390

# NYSE full-day closures. Verify against nyse.com before relying on a date;
# in Alpaca paper mode the broker's own clock and contract list decide, so
# this list only matters for the simulator and for CSV backtests.
HOLIDAYS = {
    date(2025, 1, 1), date(2025, 1, 9), date(2025, 1, 20), date(2025, 2, 17),
    date(2025, 4, 18), date(2025, 5, 26), date(2025, 6, 19), date(2025, 7, 4),
    date(2025, 9, 1), date(2025, 11, 27), date(2025, 12, 25),
    date(2026, 1, 1), date(2026, 1, 19), date(2026, 2, 16), date(2026, 4, 3),
    date(2026, 5, 25), date(2026, 6, 19), date(2026, 7, 3), date(2026, 9, 7),
    date(2026, 11, 26), date(2026, 12, 25),
    date(2027, 1, 1), date(2027, 1, 18), date(2027, 2, 15), date(2027, 3, 26),
    date(2027, 5, 31), date(2027, 6, 18), date(2027, 7, 5), date(2027, 9, 6),
    date(2027, 11, 25), date(2027, 12, 24),
}


def is_trading_day(d):
    return d.weekday() < 5 and d not in HOLIDAYS


def next_trading_day(d, n=1):
    """The n-th trading day after d (n=0 returns d itself if it trades)."""
    if n == 0:
        while not is_trading_day(d):
            d += timedelta(days=1)
        return d
    while n > 0:
        d += timedelta(days=1)
        if is_trading_day(d):
            n -= 1
    return d


def prev_trading_day(d):
    d -= timedelta(days=1)
    while not is_trading_day(d):
        d -= timedelta(days=1)
    return d


def trading_days_back(end, count):
    """`count` trading days ending on (and including) `end` if it trades."""
    out = []
    d = end
    while len(out) < count:
        if is_trading_day(d):
            out.append(d)
        d -= timedelta(days=1)
    return list(reversed(out))


def at(d, t):
    """The New York datetime for date d at clock time t."""
    return datetime(d.year, d.month, d.day, t.hour, t.minute, tzinfo=ET)


def session_minutes(d):
    """Start times of the 390 regular-session 1-minute bars on date d."""
    start = at(d, OPEN)
    return [start + timedelta(minutes=i) for i in range(SESSION_MINUTES)]


def minute_of_session(ts):
    """0 for the 9:30 bar, 389 for the 15:59 bar."""
    ts = ts.astimezone(ET)
    return (ts.hour - OPEN.hour) * 60 + (ts.minute - OPEN.minute)


def parse_hhmm(text):
    hh, mm = text.split(":")
    return time(int(hh), int(mm))


def clock_of(ts):
    """The New York wall-clock time of a timestamp."""
    ts = ts.astimezone(ET)
    return time(ts.hour, ts.minute)


def now_et():
    return datetime.now(ET)


def to_et(ts):
    return ts.astimezone(ET)


def parse_ts(text):
    """ISO-8601 (with Z or an offset) to a New York datetime. A timestamp
    with no offset is taken to already be New York time."""
    text = text.strip().replace("Z", "+00:00")
    if " " in text and "T" not in text:
        text = text.replace(" ", "T", 1)
    # Quote timestamps carry nanoseconds; datetime holds microseconds.
    text = re.sub(r"(\.\d{6})\d+", r"\1", text)
    ts = datetime.fromisoformat(text)
    if ts.tzinfo is None:
        return ts.replace(tzinfo=ET)
    return ts.astimezone(ET)
