"""Every rule the bots follow, written down in one place.

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

The video leaves the important numbers out ("skip when the EMAs are squeezed",
"wait a moment", "exits based on ATR"). Here each one has a value and a reason,
so a test result can be traced to the rule that produced it. Change them in
settings.json (copy settings.example.json); anything you leave out keeps the
default below.
"""

import copy
import json
import os

DEFAULTS = {
    "account": {
        # Simulated starting balance. The bots size every trade from this,
        # even on an Alpaca paper account that holds $100,000.
        "starting_cash": 350.0,
        # "cash": a sale's proceeds settle the next trading day (T+1), so they
        #   cannot pay for another trade until then (what a small Fidelity
        #   account is). "margin": proceeds are usable at once; long options
        #   are still paid in full, and brokers require at least $2,000 of
        #   equity to open a margin account.
        "type": "cash",
    },
    "symbols": ["SPY", "QQQ", "IWM"],
    # One bot per symbol x strategy. Order matters only when two bots fire on
    # the same minute and there is room for one trade: the earlier one wins.
    "strategies": ["vwap", "ema50", "orb15"],
    "signals": {
        "orb_minutes": 15,          # the opening range: 9:30-9:44 bars
        "ema_fast": 9,
        "ema_mid": 21,
        "ema_slow": 50,             # the "50 EMA" cross
        "atr_period": 14,           # 1-minute ATR, Wilder smoothing
        # Chop filter: a VWAP cross is skipped when |EMA9 - EMA21| is under
        # this fraction of ATR, i.e. the two averages are squeezed together.
        "squeeze_atr_frac": 0.15,
        "squeeze_applies_to": ["vwap"],
        "cooldown_minutes": 5,      # per bot, after each entry and each exit
        "orb_once_per_direction": True,
        "first_entry": "09:45",     # first bar a signal may act on (stamp)
        "last_entry": "15:30",      # no new trades on bars stamped after this
        "flatten_at": "15:50",      # close everything; nothing is held overnight
        "charge_atr": 1.0,          # "charging" = within this many ATRs of the trigger
    },
    "exits": {
        # "underlying": stop and target are levels on SPY/QQQ/IWM itself, set
        #   from ATR at entry. "premium": they are percentages of the option
        #   price instead. Both keep the premium backstop below.
        "basis": "underlying",
        "stop_atr": 1.0,
        "target_atr": 1.5,
        "premium_stop_pct": 0.40,   # backstop: out if the bid falls 40%
        "premium_target_pct": 0.60, # used only when basis is "premium"
    },
    "options": {
        "dte": 1,                   # trading days to expiration
        "strike_step": {"SPY": 1.0, "QQQ": 1.0, "IWM": 1.0},
        "max_spread_pct": 0.12,     # refuse a quote wider than 12% of its mid
        "max_quote_age_sec": 20,    # refuse a quote older than this
        # Simulator only: implied volatility and half-spread used to price a
        # contract with Black-Scholes when there is no real option quote.
        "sim_iv": {"SPY": 0.15, "QQQ": 0.20, "IWM": 0.23},
        "sim_half_spread_pct": {"SPY": 0.006, "QQQ": 0.007, "IWM": 0.012},
        "sim_min_half_spread": 0.01,
        "slippage": 0.01,           # per share, paid on every fill
    },
    "costs": {
        "commission_per_contract": 0.65,   # Fidelity's options commission
        "fees_per_contract": 0.04,         # exchange/regulatory, approximate
    },
    "risk": {
        # One contract of an at-the-money 1DTE option costs roughly $100-$450
        # depending on the symbol. On $350 nothing smaller exists, so the cap
        # is a share of the account rather than the 2-4% a large account uses.
        "max_cost_per_trade_pct": 0.45,
        "max_contracts_per_trade": 1,
        "max_open_positions": 1,          # all bots share ONE account
        "max_open_per_symbol": 1,         # no piling into the same move
        "max_trades_per_day": 6,
        "daily_profit_brake": 40.0,       # stop opening trades once realized P&L reaches this
        "daily_loss_brake": 60.0,         # stop AND close everything once the day is down this much
    },
    "alpaca": {
        "feed": "iex",                    # free real-time stock feed
        "options_feed": "indicative",     # free options feed
        "poll_seconds": 5,
        "order_timeout_sec": 20,
    },
    "dashboard": {"host": "127.0.0.1", "port": 8765},
}


def deep_merge(base, extra):
    out = copy.deepcopy(base)
    for key, value in (extra or {}).items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = deep_merge(out[key], value)
        else:
            out[key] = copy.deepcopy(value)
    return out


def load(path=None, overrides=None):
    """DEFAULTS, then settings.json (if present), then command-line overrides."""
    settings = copy.deepcopy(DEFAULTS)
    if path and os.path.exists(path):
        with open(path, "r", encoding="utf-8") as fh:
            settings = deep_merge(settings, json.load(fh))
    settings = deep_merge(settings, overrides or {})
    validate(settings)
    return settings


def validate(s):
    unknown = [k for k in s["strategies"] if k not in ("vwap", "ema50", "orb15")]
    if unknown:
        raise ValueError("unknown strategy: %s (use vwap, ema50, orb15)" % ", ".join(unknown))
    if s["account"]["type"] not in ("cash", "margin"):
        raise ValueError('account.type must be "cash" or "margin"')
    if s["exits"]["basis"] not in ("underlying", "premium"):
        raise ValueError('exits.basis must be "underlying" or "premium"')
    if s["account"]["starting_cash"] <= 0:
        raise ValueError("account.starting_cash must be positive")
    for sym in s["symbols"]:
        if sym not in s["options"]["strike_step"]:
            s["options"]["strike_step"][sym] = 1.0
        s["options"]["sim_iv"].setdefault(sym, 0.25)
        s["options"]["sim_half_spread_pct"].setdefault(sym, 0.03)


def load_env(path):
    """Read KEY=VALUE lines from a local env file into os.environ (only keys
    not already set). Keys stay on your machine; never commit the file."""
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value
