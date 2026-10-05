"""The three signals, as rules a computer can check on each 1-minute close.

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

  vwap   a candle CLOSES across VWAP          above -> call, below -> put
  ema50  a candle CLOSES across the 50 EMA    above -> call, below -> put
  orb15  a candle CLOSES outside the first 15 minutes' high/low

"Crosses" means the previous close was on one side (or touching) and this
close is strictly on the other. A wick through the line that closes back is
not a cross.

A strategy only says "call", "put", or "skip, because ...". Whether a trade
is actually taken (money, cooldown, brakes, other bots) is the risk
controller's job, so every bot obeys the same account-wide limits.
"""

CALL = "call"
PUT = "put"

LABELS = {"vwap": "VWAP", "ema50": "EMA50", "orb15": "ORB15"}


class Signal:
    """What a strategy saw on this bar. `act` is False for a skip."""

    def __init__(self, direction, act, reason):
        self.direction = direction
        self.act = act
        self.reason = reason

    def __repr__(self):
        return "Signal(%s, %s, %r)" % (self.direction, "act" if self.act else "skip", self.reason)


class Market:
    """The values a strategy reads for one symbol on one bar (filled in by
    the engine). `prev_*` are the same values one bar earlier."""

    __slots__ = ("close", "prev_close", "vwap", "prev_vwap", "ema9", "ema21",
                 "ema50", "prev_ema50", "atr", "or_high", "or_low",
                 "or_complete", "minute")

    def __init__(self, **kw):
        for name in self.__slots__:
            setattr(self, name, kw.get(name))


def crossed_up(prev_close, prev_level, close, level):
    return prev_close <= prev_level and close > level


def crossed_down(prev_close, prev_level, close, level):
    return prev_close >= prev_level and close < level


def _closeness(distance, atr, charge_atr):
    """1.0 at the trigger, 0.0 at `charge_atr` ATRs away or further."""
    if atr is None or atr <= 0:
        return 0.0
    return max(0.0, min(1.0, 1.0 - distance / (charge_atr * atr)))


class Strategy:
    key = ""

    def __init__(self, settings):
        self.sig = settings["signals"]

    def new_day(self):
        pass

    def evaluate(self, m):
        raise NotImplementedError

    def charge(self, m):
        """How close price is to firing: (direction, 0..1). Shown as the
        beams on the dashboard; it never trades on its own."""
        raise NotImplementedError

    def _squeezed(self, m):
        if self.key not in self.sig["squeeze_applies_to"]:
            return None
        if m.ema9 is None or m.ema21 is None or not m.atr:
            return None
        gap = abs(m.ema9 - m.ema21)
        limit = self.sig["squeeze_atr_frac"] * m.atr
        if gap < limit:
            return "chop: EMA9/EMA21 gap %.3f < %.2f x ATR (%.3f)" % (gap, self.sig["squeeze_atr_frac"], limit)
        return None

    def _line_cross(self, m, level, prev_level, name):
        if None in (m.prev_close, level, prev_level):
            return None
        direction = None
        if crossed_up(m.prev_close, prev_level, m.close, level):
            direction = CALL
        elif crossed_down(m.prev_close, prev_level, m.close, level):
            direction = PUT
        if direction is None:
            return None
        chop = self._squeezed(m)
        if chop:
            return Signal(direction, False, chop)
        side = "above" if direction == CALL else "below"
        return Signal(direction, True, "closed %s %s (%.2f vs %.2f)" % (side, name, m.close, level))

    def _line_charge(self, m, level):
        if level is None or m.close is None:
            return (None, 0.0)
        if m.close < level:
            return (CALL, _closeness(level - m.close, m.atr, self.sig["charge_atr"]))
        if m.close > level:
            return (PUT, _closeness(m.close - level, m.atr, self.sig["charge_atr"]))
        return (None, 0.0)


class VwapCross(Strategy):
    key = "vwap"

    def evaluate(self, m):
        return self._line_cross(m, m.vwap, m.prev_vwap, "VWAP")

    def charge(self, m):
        return self._line_charge(m, m.vwap)


class Ema50Cross(Strategy):
    key = "ema50"

    def evaluate(self, m):
        return self._line_cross(m, m.ema50, m.prev_ema50, "EMA50")

    def charge(self, m):
        return self._line_charge(m, m.ema50)


class OpeningRangeBreakout(Strategy):
    key = "orb15"

    def __init__(self, settings):
        Strategy.__init__(self, settings)
        self.fired = set()

    def new_day(self):
        self.fired = set()

    def evaluate(self, m):
        if not m.or_complete or m.prev_close is None:
            return None
        direction = None
        if crossed_up(m.prev_close, m.or_high, m.close, m.or_high):
            direction = CALL
        elif crossed_down(m.prev_close, m.or_low, m.close, m.or_low):
            direction = PUT
        if direction is None:
            return None
        if self.sig["orb_once_per_direction"] and direction in self.fired:
            return None  # one breakout per side per day; later re-crosses are not signals
        chop = self._squeezed(m)
        if chop:
            return Signal(direction, False, chop)
        self.fired.add(direction)
        if direction == CALL:
            return Signal(CALL, True, "closed above the 15-min high %.2f (%.2f)" % (m.or_high, m.close))
        return Signal(PUT, True, "closed below the 15-min low %.2f (%.2f)" % (m.or_low, m.close))

    def charge(self, m):
        if not m.or_complete or m.close is None:
            return (None, 0.0)
        once = self.sig["orb_once_per_direction"]
        best = (None, 0.0)
        if m.close <= m.or_high and not (once and CALL in self.fired):
            best = (CALL, _closeness(m.or_high - m.close, m.atr, self.sig["charge_atr"]))
        if m.close >= m.or_low and not (once and PUT in self.fired):
            put = (PUT, _closeness(m.close - m.or_low, m.atr, self.sig["charge_atr"]))
            if put[1] > best[1]:
                best = put
        return best


STRATEGIES = {"vwap": VwapCross, "ema50": Ema50Cross, "orb15": OpeningRangeBreakout}


def make(key, settings):
    return STRATEGIES[key](settings)
