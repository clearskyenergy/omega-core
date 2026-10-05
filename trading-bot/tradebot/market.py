"""Where the 1-minute bars come from when nothing is live.

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

  SyntheticMarket  made-up prices for the demo. A random walk: each minute's
                   move is independent of the last, with busier opens and
                   closes and calm and wild days. Nothing in it rewards a
                   strategy, so on this data every strategy should lose
                   roughly what the trading costs are. That is the point of
                   it: it shows the machinery and the costs, never an edge.
  CsvMarket        recorded bars from files (`python3 run.py fetch` writes
                   them from Alpaca), for backtests on real price history.
"""

import csv
import math
import os
import random

from . import timeutil
from .engine import Bar

SYNTH_START = {"SPY": 715.0, "QQQ": 750.0, "IWM": 255.0}
SYNTH_VOL = {"SPY": 0.15, "QQQ": 0.20, "IWM": 0.23}


class SyntheticMarket:
    source = "synthetic"

    def __init__(self, symbols, seed=7, correlation=0.85):
        self.symbols = list(symbols)
        self.seed = seed
        self.rho = correlation
        self.last = {s: SYNTH_START.get(s, 100.0) for s in self.symbols}
        self._made = {}

    def day_bars(self, day):
        """{symbol: [Bar x 390]} for a trading day. Days must be asked for in
        order (each day opens near the previous day's close); the same seed
        always gives the same prices."""
        if day in self._made:
            return self._made[day]
        rng = random.Random("%d-%s" % (self.seed, day.isoformat()))
        day_mood = math.exp(rng.gauss(0.0, 0.35))   # calm and wild days
        out = {s: [] for s in self.symbols}
        price = {}
        for s in self.symbols:
            gap = rng.gauss(0.0, 0.004 * day_mood)
            price[s] = self.last[s] * math.exp(gap)
        base_volume = {s: 60000.0 if s != "IWM" else 25000.0 for s in self.symbols}
        for i, ts in enumerate(timeutil.session_minutes(day)):
            shape = 1.0 + 1.6 * math.exp(-i / 25.0) + 0.7 * math.exp(-(389 - i) / 35.0)
            common = rng.gauss(0.0, 1.0)
            jump = rng.choice((-4.0, 4.0)) if rng.random() < 0.002 else 0.0  # news: all three move
            for s in self.symbols:
                sigma = SYNTH_VOL.get(s, 0.25) / math.sqrt(252 * 390) * shape * day_mood
                z = self.rho * common + math.sqrt(1 - self.rho ** 2) * rng.gauss(0.0, 1.0)
                z += jump
                o = price[s]
                c = o * math.exp(sigma * z - 0.5 * sigma * sigma)
                wick = o * sigma * 0.45
                h = max(o, c) + abs(rng.gauss(0.0, 1.0)) * wick
                l = min(o, c) - abs(rng.gauss(0.0, 1.0)) * wick
                v = int(base_volume[s] * shape * math.exp(rng.gauss(0.0, 0.4)))
                out[s].append(Bar(ts, round(o, 2), round(h, 2), round(l, 2), round(c, 2), v))
                price[s] = c
        for s in self.symbols:
            self.last[s] = out[s][-1].close
        self._made = {day: out}
        return out


class CsvMarket:
    """Bars from `<folder>/<SYMBOL>.csv` with columns timestamp (or time /
    date / t), open, high, low, close, volume. Timestamps with no offset are
    taken as New York time. Only regular-session bars are kept."""

    source = "csv"

    def __init__(self, folder, symbols):
        self.folder = folder
        self.symbols = list(symbols)
        self.bars = {}
        for s in self.symbols:
            path = os.path.join(folder, "%s.csv" % s)
            if not os.path.exists(path):
                raise FileNotFoundError("no data for %s: expected %s (run `python3 run.py fetch` first)" % (s, path))
            self.bars[s] = self._read(path)

    @staticmethod
    def _read(path):
        by_day = {}
        with open(path, newline="", encoding="utf-8") as fh:
            reader = csv.DictReader(fh)
            cols = {c.lower().strip(): c for c in reader.fieldnames or []}
            tcol = next((cols[k] for k in ("timestamp", "time", "datetime", "date", "t") if k in cols), None)
            need = [k for k in ("open", "high", "low", "close") if k not in cols]
            if tcol is None or need:
                raise ValueError("%s needs columns timestamp, open, high, low, close, volume" % path)
            for row in reader:
                ts = timeutil.parse_ts(row[tcol])
                clock = timeutil.clock_of(ts)
                if clock < timeutil.OPEN or clock >= timeutil.CLOSE or not timeutil.is_trading_day(ts.date()):
                    continue
                vol = float(row[cols["volume"]]) if "volume" in cols and row[cols["volume"]] else 0.0
                bar = Bar(ts, float(row[cols["open"]]), float(row[cols["high"]]), float(row[cols["low"]]),
                          float(row[cols["close"]]), vol)
                by_day.setdefault(ts.date(), []).append(bar)
        for bars in by_day.values():
            bars.sort(key=lambda b: b.ts)
        return by_day

    def days(self):
        common = None
        for s in self.symbols:
            d = set(self.bars[s].keys())
            common = d if common is None else common & d
        return sorted(common or [])

    def day_bars(self, day):
        return {s: self.bars[s].get(day, []) for s in self.symbols}


def minutes(day_bars):
    """Group one day's bars by minute: [(ts, {symbol: bar})] in time order.
    A symbol with no trade in a minute is simply absent from that minute."""
    by_ts = {}
    for sym, bars in day_bars.items():
        for b in bars:
            by_ts.setdefault(b.ts, {})[sym] = b
    return sorted(by_ts.items(), key=lambda kv: kv[0])


def synthetic_days(count, end=None):
    """The last `count` trading days up to `end` (default: today)."""
    end = end or timeutil.now_et().date()
    return timeutil.trading_days_back(end, count)


def write_csv(path, bars):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["timestamp", "open", "high", "low", "close", "volume"])
        for b in bars:
            w.writerow([b.ts.isoformat(), b.open, b.high, b.low, b.close, b.volume])

