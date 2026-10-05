"""Choosing and pricing the option contract a signal buys.

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

A signal buys a 1-day-to-expiration (1DTE) contract with the strike at the
money: the listed strike nearest the current price. Before any order, the
quote must pass two checks: it is fresh, and the bid/ask spread is not so wide
that the trade starts deep in the hole.

When there is no real option market (the simulator and CSV backtests), the
contract is priced with Black-Scholes from an assumed implied volatility and
given a bid/ask spread. That is an approximation: real 1DTE prices jump with
volatility, news and the time of day in ways this model does not.
"""

import math

from . import timeutil
from .strategies import CALL


class Contract:
    __slots__ = ("symbol", "underlying", "kind", "strike", "expiry")

    def __init__(self, symbol, underlying, kind, strike, expiry):
        self.symbol = symbol          # OCC symbol, e.g. QQQ261005C00754000
        self.underlying = underlying
        self.kind = kind              # "call" or "put"
        self.strike = strike
        self.expiry = expiry          # date

    def to_dict(self):
        return {"symbol": self.symbol, "underlying": self.underlying, "kind": self.kind,
                "strike": self.strike, "expiry": self.expiry.isoformat()}


class Quote:
    __slots__ = ("bid", "ask", "ts")

    def __init__(self, bid, ask, ts):
        self.bid = bid
        self.ask = ask
        self.ts = ts

    @property
    def mid(self):
        return (self.bid + self.ask) / 2.0

    def to_dict(self):
        return {"bid": self.bid, "ask": self.ask, "ts": self.ts.isoformat() if self.ts else None}


def occ_symbol(root, expiry, kind, strike):
    """OCC option symbol: ROOT + YYMMDD + C/P + strike x 1000 in 8 digits."""
    return "%s%s%s%08d" % (root, expiry.strftime("%y%m%d"), "C" if kind == CALL else "P",
                           int(round(strike * 1000)))


def at_the_money(price, step):
    return round(round(price / step) * step, 2)


def check_quote(quote, now, max_spread_pct, max_age_sec):
    """None if the quote is usable, else the reason it is not."""
    if quote is None:
        return "no quote"
    if quote.bid is None or quote.ask is None or quote.bid <= 0 or quote.ask <= 0:
        return "no bid"
    if quote.ask < quote.bid:
        return "crossed quote"
    spread = quote.ask - quote.bid
    if spread / quote.mid > max_spread_pct:
        return "spread %.2f is %.0f%% of the price" % (spread, 100 * spread / quote.mid)
    if quote.ts is not None and now is not None:
        age = (now - quote.ts).total_seconds()
        if age > max_age_sec:
            return "stale quote (%ds old)" % age
    return None


# ── Black-Scholes, for the simulator ────────────────────────────────────────

def _norm_cdf(x):
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def black_scholes(kind, spot, strike, years, vol, rate=0.04):
    """Theoretical price of a European option (close enough for 1DTE ETF
    options, which are American but almost never worth exercising early)."""
    intrinsic = max(0.0, spot - strike) if kind == CALL else max(0.0, strike - spot)
    if years <= 0 or vol <= 0:
        return intrinsic
    sd = vol * math.sqrt(years)
    d1 = (math.log(spot / strike) + (rate + 0.5 * vol * vol) * years) / sd
    d2 = d1 - sd
    disc = math.exp(-rate * years)
    if kind == CALL:
        return spot * _norm_cdf(d1) - strike * disc * _norm_cdf(d2)
    return strike * disc * _norm_cdf(-d2) - spot * _norm_cdf(-d1)


def years_to_expiry(now, expiry):
    """Calendar time until 16:00 New York on the expiry date, in years."""
    close = timeutil.at(expiry, timeutil.CLOSE)
    seconds = (close - now).total_seconds()
    return max(0.0, seconds) / (365.0 * 24 * 3600)


def _tick(x):
    """Round to the penny (SPY, QQQ and IWM options trade in pennies)."""
    return round(math.floor(x * 100 + 0.5) / 100.0, 2)


class SimOptions:
    """A pretend option market: every strike exists, every quote is fresh,
    and the price is Black-Scholes with a fixed volatility plus a spread."""

    source = "black-scholes"

    def __init__(self, settings):
        self.opt = settings["options"]

    def expiry_for(self, now):
        today = now.astimezone(timeutil.ET).date()
        return timeutil.next_trading_day(today, self.opt["dte"])

    def pick(self, underlying, kind, price, now):
        """(contract, quote) or (None, reason)."""
        step = self.opt["strike_step"][underlying]
        strike = at_the_money(price, step)
        expiry = self.expiry_for(now)
        contract = Contract(occ_symbol(underlying, expiry, kind, strike), underlying, kind, strike, expiry)
        return contract, self.quote(contract, price, now)

    def quote(self, contract, price, now):
        if price is None:
            return None
        vol = self.opt["sim_iv"][contract.underlying]
        mid = black_scholes(contract.kind, price, contract.strike, years_to_expiry(now, contract.expiry), vol)
        half = max(self.opt["sim_min_half_spread"], mid * self.opt["sim_half_spread_pct"][contract.underlying])
        bid = _tick(max(0.0, mid - half))
        ask = _tick(max(mid + half, bid + 0.01))
        return Quote(bid if bid > 0 else 0.0, ask, now)
