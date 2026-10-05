"""Running bars through the engine, and judging what came out.

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

`replay()` is the one loop for the demo, a backtest and the replay recorder:
warm-up days first (they only build the 50 EMA and ATR), then trading days,
minute by minute, optionally slowed down so the dashboard can be watched.

`report()` answers the questions that matter before any real money: after
costs, how much did each bot make or lose, how often did it win, how deep was
the worst drawdown, and how often did each brake trip. A good-looking day
proves nothing; these numbers over many days are the evidence.
"""

import time as _time

from .market import minutes


def replay(engine, market, days, warmup_days=(), speed=0.0, stop=None, on_minute=None, on_day=None):
    """Feed `days` through `engine`. `speed` is minutes of market time per
    second of real time (0 = as fast as possible)."""
    for day in warmup_days:
        for ts, bars in minutes(market.day_bars(day)):
            engine.on_minute(ts, bars, trade=False)
    for day in days:
        if stop is not None and stop.is_set():
            break
        for ts, bars in minutes(market.day_bars(day)):
            if stop is not None and stop.is_set():
                break
            engine.on_minute(ts, bars, trade=True)
            if on_minute:
                on_minute(engine)
            if speed > 0:
                _time.sleep(1.0 / speed)
        if on_day:
            on_day(engine, day)
    engine.end_day()
    engine.day = None  # the last day is booked; don't book it twice


def _max_drawdown(values):
    """Largest fall from a high point: (dollars, percent of that high)."""
    peak, worst, worst_pct = None, 0.0, 0.0
    for v in values:
        peak = v if peak is None else max(peak, v)
        if v - peak < worst:
            worst = v - peak
            worst_pct = 100.0 * (v - peak) / peak if peak else 0.0
    return worst, worst_pct


def _summary(trades):
    n = len(trades)
    wins = [t["pnl"] for t in trades if t["pnl"] > 0]
    losses = [t["pnl"] for t in trades if t["pnl"] <= 0]
    gross_win, gross_loss = sum(wins), -sum(losses)
    return {
        "trades": n,
        "pnl": round(sum(t["pnl"] for t in trades), 2),
        "winRate": round(len(wins) / n, 3) if n else None,
        "avgWin": round(gross_win / len(wins), 2) if wins else None,
        "avgLoss": round(-gross_loss / len(losses), 2) if losses else None,
        "expectancy": round(sum(t["pnl"] for t in trades) / n, 2) if n else None,
        "profitFactor": round(gross_win / gross_loss, 2) if gross_loss > 0 else None,
    }


def report(engine):
    trades = engine.trades
    days = engine.history
    start = engine.risk.ledger.starting_cash
    equity = [start] + [d["equity"] for d in days]
    out = {
        "source": engine.source,
        "optionPrices": engine.options.source,
        "days": len(days),
        "startingCash": start,
        "endingEquity": round(equity[-1], 2),
        "returnPct": round(100.0 * (equity[-1] - start) / start, 2),
        "maxDrawdown": round(_max_drawdown(equity)[0], 2),
        "maxDrawdownPct": round(_max_drawdown(equity)[1], 2),
        "greenDays": sum(1 for d in days if d["pnl"] > 0),
        "redDays": sum(1 for d in days if d["pnl"] < 0),
        "flatDays": sum(1 for d in days if d["pnl"] == 0),
        "bestDay": max((d["pnl"] for d in days), default=None),
        "worstDay": min((d["pnl"] for d in days), default=None),
        "profitBrakeDays": sum(1 for d in days if d["profitBrake"]),
        "lossBrakeDays": sum(1 for d in days if d["lossBrake"]),
        "all": _summary(trades),
        "byBot": {},
        "byStrategy": {},
        "bySymbol": {},
        "exitReasons": {},
        "skipped": dict(sorted(engine.skips.items(), key=lambda kv: -kv[1])),
        "signals": {"%s/%s" % k: v for k, v in sorted(engine.signals.items())},
    }
    for b in engine.bots:
        out["byBot"][b.id] = _summary([t for t in trades if t["bot"] == b.id])
    for key in engine.s["strategies"]:
        out["byStrategy"][key] = _summary([t for t in trades if t["strategy"] == key])
    for sym in engine.s["symbols"]:
        out["bySymbol"][sym] = _summary([t for t in trades if t["symbol"] == sym])
    for t in trades:
        kind = (t["reason"] or "").split(" (")[0]
        out["exitReasons"][kind] = out["exitReasons"].get(kind, 0) + 1
    return out


def _money(x):
    if x is None:
        return "-"
    return ("+$%.2f" if x >= 0 else "-$%.2f") % abs(x)


def _pct(x):
    return "-" if x is None else "%.0f%%" % (100 * x)


def format_report(r):
    lines = []
    add = lines.append
    add("")
    add("BACKTEST - %s prices, %s option prices" % (r["source"], r["optionPrices"]))
    add("=" * 72)
    add("Days %d | start $%.2f -> end $%.2f (%s, %.1f%%)" % (
        r["days"], r["startingCash"], r["endingEquity"], _money(r["endingEquity"] - r["startingCash"]), r["returnPct"]))
    add("Worst drawdown %s (%.1f%% from the high before it)" % (_money(r["maxDrawdown"]), r["maxDrawdownPct"]))
    add("Green / red / flat days: %d / %d / %d   best %s   worst %s" % (
        r["greenDays"], r["redDays"], r["flatDays"], _money(r["bestDay"]), _money(r["worstDay"])))
    add("Profit brake hit on %d day(s); loss brake on %d day(s)" % (r["profitBrakeDays"], r["lossBrakeDays"]))
    a = r["all"]
    add("Trades %d | win rate %s | avg win %s | avg loss %s | per trade %s | profit factor %s" % (
        a["trades"], _pct(a["winRate"]), _money(a["avgWin"]), _money(a["avgLoss"]), _money(a["expectancy"]),
        a["profitFactor"] if a["profitFactor"] is not None else "-"))
    add("")
    add("%-14s %7s %10s %8s %10s" % ("bot", "trades", "P&L", "win %", "per trade"))
    for bot, s in r["byBot"].items():
        add("%-14s %7d %10s %8s %10s" % (bot, s["trades"], _money(s["pnl"]), _pct(s["winRate"]), _money(s["expectancy"])))
    add("")
    add("How trades ended: " + ", ".join("%s %d" % kv for kv in sorted(r["exitReasons"].items(), key=lambda kv: -kv[1])))
    add("Signals not taken: " + (", ".join("%s %d" % kv for kv in r["skipped"].items()) or "none"))
    add("")
    if r["source"] == "synthetic":
        add("These prices are a random walk with no edge in them. Read the result as")
        add("'what trading costs do', not as how the strategies would do in a real market.")
    else:
        add("Option prices here are Black-Scholes estimates from the stock's bars, not the")
        add("real quotes of the day. Forward paper trading on Alpaca is the next check.")
    return "\n".join(lines)
