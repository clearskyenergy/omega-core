#!/usr/bin/env python3
"""Trading City: start here.

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

  python3 run.py demo                 the city on made-up prices, $350 paper account
  python3 run.py demo --cash 7000     the same with the video's account size
  python3 run.py backtest --days 60   many simulated days at once, with a report
  python3 run.py fetch --days 30      download real 1-minute bars from Alpaca
  python3 run.py backtest --data data the report on those real bars
  python3 run.py paper                live Alpaca PAPER trading + the city

Nothing here can move real money: the simulator has no broker, and the
Alpaca connector refuses anything but Alpaca's paper endpoint.
"""

import argparse
import json
import os
import sys
import threading
import webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from tradebot import config, timeutil  # noqa: E402
from tradebot.backtest import format_report, replay, report  # noqa: E402
from tradebot.broker import SimBroker  # noqa: E402
from tradebot.engine import Engine  # noqa: E402
from tradebot.journal import Journal, TRADE_FIELDS  # noqa: E402
from tradebot.market import CsvMarket, SyntheticMarket  # noqa: E402
from tradebot.options import SimOptions  # noqa: E402


def load_settings(args):
    overrides = {}
    if getattr(args, "cash", None):
        overrides["account"] = {"starting_cash": args.cash}
    return config.load(os.path.join(HERE, args.settings), overrides)


def sim_engine(settings, source, mode, journal=None):
    return Engine(settings, SimBroker(settings), SimOptions(settings), source=source, mode=mode, journal=journal)


def synthetic_calendar(end, count):
    return timeutil.trading_days_back(end, count)


def forward_days(start):
    d = start
    while True:
        d = timeutil.next_trading_day(d)
        yield d


# ── demo ───────────────────────────────────────────────────────────────────

def cmd_demo(args):
    from tradebot.server import serve
    s = load_settings(args)
    engine = sim_engine(s, "synthetic", "demo")
    market = SyntheticMarket(s["symbols"], seed=args.seed)
    # Earlier days end yesterday, so the day you watch is today's date
    # (or the next trading day on a weekend). The prices are still made up.
    yesterday = timeutil.prev_trading_day(timeutil.now_et().date())
    days = synthetic_calendar(yesterday, args.history + 1)
    print("Simulating %d earlier days for the history strip..." % args.history)
    replay(engine, market, days[1:], warmup_days=days[:1])
    stop = threading.Event()
    host, port = args.host or s["dashboard"]["host"], args.port or s["dashboard"]["port"]
    serve(engine, engine.kill, host, port)
    url = "http://%s:%d/" % ("127.0.0.1" if host in ("0.0.0.0", "") else host, port)
    print("\nTrading City is open at %s" % url)
    print("Made-up prices, $%.0f paper account, %.1f market minutes per second. Ctrl+C to stop.\n"
          % (s["account"]["starting_cash"], args.speed))
    if not args.no_browser:
        webbrowser.open(url)

    def say(engine_, day):
        h = engine_.history[-1] if engine_.history else None
        if h:
            print("%s  %s  %d trade(s)  equity $%.2f%s" % (
                h["date"], ("+$%.2f" if h["pnl"] >= 0 else "-$%.2f") % abs(h["pnl"]), h["trades"], h["equity"],
                "  [profit locked]" if h["profitBrake"] else ("  [loss brake]" if h["lossBrake"] else "")))

    try:
        for day in forward_days(days[-1]):
            if stop.is_set():
                break
            replay(engine, market, [day], speed=args.speed, stop=stop, on_day=say)
    except KeyboardInterrupt:
        stop.set()
        print("\nStopped.")


# ── backtest ───────────────────────────────────────────────────────────────

def cmd_backtest(args):
    s = load_settings(args)
    if args.data:
        market = CsvMarket(os.path.join(HERE, args.data) if not os.path.isabs(args.data) else args.data, s["symbols"])
        all_days = market.days()
        if len(all_days) < 2:
            sys.exit("need at least 2 days of bars (1 warms up the 50 EMA and ATR)")
        warm, days = all_days[:1], all_days[1:]
        engine = sim_engine(s, "csv", "backtest")
    else:
        market = SyntheticMarket(s["symbols"], seed=args.seed)
        cal = synthetic_calendar(timeutil.now_et().date(), args.days + 1)
        warm, days = cal[:1], cal[1:]
        engine = sim_engine(s, "synthetic", "backtest")
    replay(engine, market, days, warmup_days=warm)
    r = report(engine)
    print(format_report(r))
    out = os.path.join(HERE, args.out)
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "summary.json"), "w", encoding="utf-8") as fh:
        json.dump({"report": r, "history": engine.history, "settings": s}, fh, indent=2)
    import csv
    with open(os.path.join(out, "trades.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=TRADE_FIELDS, extrasaction="ignore")
        w.writeheader()
        for t in engine.trades:
            w.writerow(t)
    print("\nSaved %s and %s" % (os.path.join(args.out, "summary.json"), os.path.join(args.out, "trades.csv")))


# ── record (a replay file the dashboard can play with no server) ───────────

META = ("banner", "mode", "source", "broker", "optionPrices")
BOT_META = ("id", "symbol", "strategy", "label")


def _frame(snap):
    """A snapshot minus what never changes in a replay (kept once in the
    scenario's meta) and minus history and old events (kept once too)."""
    f = {k: v for k, v in snap.items() if k not in META + ("history", "events", "seq")}
    f["bots"] = [{k: v for k, v in b.items() if k not in BOT_META} for b in snap["bots"]]
    return f


def record_scenario(s, seed, history_days, end_day):
    """Simulate `history_days` days quickly, then record every minute of the
    next one: what /api/state said, plus only the events that were new."""
    engine = sim_engine(s, "synthetic", "demo")
    market = SyntheticMarket(s["symbols"], seed=seed)
    cal = synthetic_calendar(end_day, history_days + 2)
    replay(engine, market, cal[1:-1], warmup_days=cal[:1])
    history = list(engine.history)
    events = engine.events[-40:]
    frames, charts = [], {}
    last = [events[-1]["n"] if events else 0]

    def grab(e):
        f = _frame(e.snapshot())
        f["newEvents"] = [ev for ev in e.events if ev["n"] > last[0]]
        if f["newEvents"]:
            last[0] = f["newEvents"][-1]["n"]
        frames.append(f)

    def day_done(e, day):
        charts.update({sym: e.chart(sym) for sym in s["symbols"]})

    replay(engine, market, [cal[-1]], on_minute=grab, on_day=day_done)
    snap = engine.snapshot()
    return {"label": "$%s account" % format(int(s["account"]["starting_cash"]), ","),
            "cash": s["account"]["starting_cash"],
            "meta": {k: snap[k] for k in META},
            "botMeta": [{k: b[k] for k in BOT_META} for b in snap["bots"]],
            "history": history, "events": events,
            "frames": frames, "charts": charts, "final": engine.history[-1] if engine.history else None}


def last_session(now):
    """The most recent trading day whose session has finished."""
    today = now.date()
    if timeutil.is_trading_day(today) and timeutil.clock_of(now) >= timeutil.CLOSE:
        return today
    return timeutil.prev_trading_day(today)


def cmd_record(args):
    base = load_settings(args)
    end = last_session(timeutil.now_et())
    scenarios = [record_scenario(base, args.seed, args.history, end)]
    if args.compare:
        big = config.load(os.path.join(HERE, args.settings), {
            "account": {"starting_cash": args.compare},
            "risk": {"max_cost_per_trade_pct": 0.10, "max_open_positions": 3, "max_trades_per_day": 12,
                     "daily_profit_brake": 400.0, "daily_loss_brake": 500.0}})
        scenarios.append(record_scenario(big, args.seed, args.history, end))
    out = {"kind": "trading-city-replay", "version": 1, "recordedFor": end.isoformat(),
           "note": "Synthetic prices recorded by `python3 run.py record`. Paper money; not results.",
           "scenarios": scenarios}
    path = os.path.join(HERE, args.out) if not os.path.isabs(args.out) else args.out
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(out, fh, separators=(",", ":"), default=str)
    print("wrote %s (%.1f MB, %d scenario(s))" % (args.out, os.path.getsize(path) / 1e6, len(scenarios)))


# ── Alpaca ─────────────────────────────────────────────────────────────────

def _alpaca_client():
    from tradebot.alpaca import AlpacaClient
    config.load_env(os.path.join(HERE, ".env"))
    try:
        return AlpacaClient.from_env()
    except ValueError as err:
        sys.exit(str(err))


def cmd_fetch(args):
    from tradebot.alpaca import fetch_history
    s = load_settings(args)
    client = _alpaca_client()
    fetch_history(client, s["symbols"], args.days, os.path.join(HERE, args.out), s["alpaca"]["feed"])


def cmd_paper(args):
    from tradebot.alpaca import AlpacaBroker, AlpacaOptions, PaperRunner
    from tradebot.server import serve
    s = load_settings(args)
    client = _alpaca_client()
    journal = Journal(os.path.join(HERE, "journal"))
    engine = Engine(s, AlpacaBroker(client), AlpacaOptions(client, s), source="alpaca-paper", mode="paper",
                    journal=journal)
    saved = journal.load_account()
    if saved and not args.reset:
        engine.risk.ledger.load_state(saved)
        print("Paper account picked up from journal/account.json: cash $%.2f" % engine.risk.ledger.cash)
    stop = threading.Event()
    runner = PaperRunner(engine, client, s, journal, stop)
    host, port = args.host or s["dashboard"]["host"], args.port or s["dashboard"]["port"]
    serve(engine, runner.kill, host, port)
    url = "http://%s:%d/" % ("127.0.0.1" if host in ("0.0.0.0", "") else host, port)
    print("Trading City (Alpaca PAPER) at %s. Ctrl+C to stop." % url)
    if not args.no_browser:
        webbrowser.open(url)
    try:
        runner.run()
    except KeyboardInterrupt:
        stop.set()
        print("\nStopped. Open positions stay at Alpaca; the next start picks them back up.")


def main(argv=None):
    p = argparse.ArgumentParser(description="Trading City: paper-trading bots for SPY/QQQ/IWM 1DTE options")
    p.add_argument("--settings", default="settings.json", help="settings file (default settings.json)")
    sub = p.add_subparsers(dest="cmd", required=True)

    d = sub.add_parser("demo", help="the city on made-up prices")
    d.add_argument("--cash", type=float, help="simulated starting cash (default 350)")
    d.add_argument("--speed", type=float, default=4.0, help="market minutes per second (default 4)")
    d.add_argument("--seed", type=int, default=7, help="which made-up market (default 7)")
    d.add_argument("--history", type=int, default=8, help="earlier days to simulate first (default 8)")
    d.add_argument("--host")
    d.add_argument("--port", type=int)
    d.add_argument("--no-browser", action="store_true")
    d.set_defaults(fn=cmd_demo)

    b = sub.add_parser("backtest", help="many days at once, with a report")
    b.add_argument("--cash", type=float)
    b.add_argument("--days", type=int, default=60, help="simulated days (ignored with --data)")
    b.add_argument("--seed", type=int, default=7)
    b.add_argument("--data", help="folder of <SYMBOL>.csv 1-minute bars (from `fetch`)")
    b.add_argument("--out", default="results")
    b.set_defaults(fn=cmd_backtest)

    r = sub.add_parser("record", help="write a replay file the dashboard plays without a server")
    r.add_argument("--cash", type=float)
    # Seed 3 is used because its recorded day has trades in both account sizes
    # (seed 7's $350 account can no longer afford one). Not chosen for profit:
    # the $7,000 account loses that day.
    r.add_argument("--seed", type=int, default=3)
    r.add_argument("--history", type=int, default=8)
    r.add_argument("--compare", type=float, help="also record this account size (e.g. 7000)")
    r.add_argument("--out", default="dashboard/replay.json")
    r.set_defaults(fn=cmd_record)

    f = sub.add_parser("fetch", help="download real 1-minute bars from Alpaca")
    f.add_argument("--days", type=int, default=30)
    f.add_argument("--out", default="data")
    f.set_defaults(fn=cmd_fetch)

    a = sub.add_parser("paper", help="live Alpaca PAPER trading with the city")
    a.add_argument("--cash", type=float)
    a.add_argument("--reset", action="store_true", help="start the paper ledger over at --cash/settings")
    a.add_argument("--host")
    a.add_argument("--port", type=int)
    a.add_argument("--no-browser", action="store_true")
    a.set_defaults(fn=cmd_paper)

    args = p.parse_args(argv)
    args.fn(args)


if __name__ == "__main__":
    main()
