"""Shared test fixtures: settings and hand-built 1-minute bars.

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
"""

import os
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tradebot import config, timeutil  # noqa: E402
from tradebot.engine import Bar  # noqa: E402

DAY = date(2026, 10, 1)        # a Thursday; Friday 10/2 is the 1DTE expiry


def settings(**over):
    """One symbol, one strategy, no chop filter: a test controls every signal."""
    base = {"symbols": ["IWM"], "strategies": ["vwap"],
            "signals": {"squeeze_atr_frac": 0.0, "cooldown_minutes": 5}}
    for key, value in over.items():
        base = config.deep_merge(base, {key: value})
    return config.load(None, base)


def bars(day, closes, start_minute=0, wick=0.05, volume=1000):
    """Bars whose open is the previous close, so a close sequence is a path."""
    out, prev = [], closes[0]
    for i, c in enumerate(closes):
        ts = timeutil.at(day, timeutil.OPEN) + timedelta(minutes=start_minute + i)
        o = prev
        out.append(Bar(ts, o, max(o, c) + wick, min(o, c) - wick, c, volume))
        prev = c
    return out


def run(engine, symbol, bar_list, trade=True):
    for b in bar_list:
        engine.on_minute(b.ts, {symbol: b}, trade=trade)
