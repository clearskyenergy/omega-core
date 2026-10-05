"""The chart lines the strategies read: EMA, ATR, VWAP and the opening range.

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Each one is updated one bar at a time, exactly as it would be live, so a
backtest cannot accidentally peek at a bar that has not closed yet.

EMA and ATR run continuously across days (the 50 EMA at 9:45 still remembers
yesterday afternoon, as on a trading chart); VWAP and the opening range start
over every morning.
"""


class EMA:
    """Exponential moving average, seeded with the simple average of the
    first `period` values (the usual charting convention)."""

    def __init__(self, period):
        self.period = period
        self.k = 2.0 / (period + 1)
        self.value = None
        self._seed = []

    @property
    def ready(self):
        return self.value is not None

    def update(self, x):
        if self.value is None:
            self._seed.append(x)
            if len(self._seed) == self.period:
                self.value = sum(self._seed) / self.period
                self._seed = []
            return self.value
        self.value = x * self.k + self.value * (1 - self.k)
        return self.value


class ATR:
    """Average true range with Wilder smoothing."""

    def __init__(self, period):
        self.period = period
        self.value = None
        self._prev_close = None
        self._seed = []

    @property
    def ready(self):
        return self.value is not None

    def update(self, high, low, close):
        if self._prev_close is None:
            tr = high - low
        else:
            tr = max(high - low, abs(high - self._prev_close), abs(low - self._prev_close))
        self._prev_close = close
        if self.value is None:
            self._seed.append(tr)
            if len(self._seed) == self.period:
                self.value = sum(self._seed) / self.period
                self._seed = []
            return self.value
        self.value = (self.value * (self.period - 1) + tr) / self.period
        return self.value


class VWAP:
    """Volume-weighted average price since 9:30, from each bar's typical
    price (high + low + close) / 3. Resets every morning."""

    def __init__(self):
        self.reset()

    def reset(self):
        self._pv = 0.0
        self._v = 0.0
        self.value = None

    def update(self, high, low, close, volume):
        typical = (high + low + close) / 3.0
        if volume > 0:
            self._pv += typical * volume
            self._v += volume
        self.value = self._pv / self._v if self._v > 0 else close
        return self.value


class OpeningRange:
    """High and low of the first `minutes` bars of the session."""

    def __init__(self, minutes):
        self.minutes = minutes
        self.reset()

    def reset(self):
        self.high = None
        self.low = None
        self.complete = False

    def update(self, minute_of_session, high, low):
        if minute_of_session < self.minutes:
            self.high = high if self.high is None else max(self.high, high)
            self.low = low if self.low is None else min(self.low, low)
        elif self.high is not None:
            self.complete = True
        return self.complete
