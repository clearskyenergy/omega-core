"""The engine and the shared risk controller, driven by hand-built days.

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
"""

import json
import http.client
import time
import unittest
from datetime import date, datetime, timedelta

import helpers
from helpers import DAY, bars, run
from tradebot import broker as B
from tradebot import timeutil
from tradebot.backtest import replay, report
from tradebot.engine import Engine
from tradebot.market import SyntheticMarket
from tradebot.options import SimOptions
from tradebot.risk import Ledger, RiskController


def engine(s):
    return Engine(s, B.SimBroker(s), SimOptions(s))


def morning_cross():
    """Down from 250 to 249 for half an hour (below VWAP), then a close back
    above VWAP at 10:00: one VWAP call signal, inside the entry window."""
    down = [250 - i / 29.0 for i in range(30)]
    return bars(DAY, down + [249.8])


class LedgerAndRisk(unittest.TestCase):
    def test_cash_account_proceeds_wait_one_trading_day(self):
        led = Ledger(350, "cash")
        led.pay(140)
        led.receive(160, date(2026, 10, 2))         # a Friday sale
        self.assertEqual((led.cash, led.settled, led.unsettled), (370, 210, 160))
        led.settle(date(2026, 10, 3))               # Saturday: not yet
        self.assertEqual(led.settled, 210)
        led.settle(date(2026, 10, 5))               # Monday
        self.assertEqual((led.settled, led.unsettled), (370, 0))

    def test_margin_account_proceeds_are_usable_at_once(self):
        led = Ledger(350, "margin")
        led.pay(140)
        led.receive(160, date(2026, 10, 2))
        self.assertEqual(led.spendable(), 370)

    def test_approve_refuses_in_order_and_says_why(self):
        s = helpers.settings()
        r = RiskController(s)
        r.new_day(DAY)
        now = datetime(2026, 10, 1, 10, 0, tzinfo=timeutil.ET)
        self.assertTrue(r.approve("IWM-vwap", "IWM", 1.30, now, [], 0))
        no = r.approve("IWM-vwap", "IWM", 4.00, now, [], 0)
        self.assertEqual(no.category, "can't afford")
        self.assertIn("one contract costs $401", no.reason)
        r.reserve("IWM-vwap", 131.0, now)
        self.assertEqual(r.approve("IWM-vwap", "IWM", 1.30, now + timedelta(minutes=2), [], 0).category, "cooldown")

        class P:
            symbol = "IWM"
        self.assertEqual(r.approve("IWM-ema50", "IWM", 1.30, now, [P()], 0).category, "slot taken")
        r.entry_cancelled(131.0)
        self.assertEqual((r.ledger.reserved, r.trades_today), (0, 0))
        r.profit_locked = True
        self.assertEqual(r.approve("IWM-ema50", "IWM", 1.30, now, [], 0).category, "profit brake")
        r.loss_stopped = True
        self.assertEqual(r.approve("IWM-ema50", "IWM", 1.30, now, [], 0).category, "loss brake")
        r.kill("test")
        self.assertEqual(r.approve("IWM-ema50", "IWM", 1.30, now, [], 0).category, "stopped")

    def test_reserved_cash_cannot_be_spent_twice(self):
        s = helpers.settings(risk={"max_open_positions": 3, "max_cost_per_trade_pct": 1.0})
        r = RiskController(s)
        r.new_day(DAY)
        now = datetime(2026, 10, 1, 10, 0, tzinfo=timeutil.ET)
        r.reserve("a", 300.0, now)
        self.assertEqual(r.approve("b", "SPY", 1.0, now, [], 0).category, "can't afford")

    def test_trade_limit(self):
        s = helpers.settings(risk={"max_trades_per_day": 1})
        r = RiskController(s)
        r.new_day(DAY)
        now = datetime(2026, 10, 1, 10, 0, tzinfo=timeutil.ET)
        r.reserve("a", 10.0, now)
        self.assertEqual(r.approve("b", "IWM", 1.0, now, [], 0).category, "trade limit")


class EngineDays(unittest.TestCase):
    def test_a_vwap_cross_buys_a_call_and_the_target_sells_it(self):
        s = helpers.settings()
        e = engine(s)
        run(e, "IWM", morning_cross())
        bot = e.by_id["IWM-vwap"]
        p = bot.position
        self.assertIsNotNone(p)
        self.assertEqual((p.state, p.direction, p.contract.strike, p.contract.expiry), ("open", "call", 250.0, date(2026, 10, 2)))
        self.assertAlmostEqual(e.risk.ledger.cash, 350 - p.entry_cost, places=6)
        self.assertGreater(p.target, p.entry_underlying)
        self.assertLess(p.stop, p.entry_underlying)
        target = p.target
        run(e, "IWM", bars(DAY, [249.8, target + 0.05], start_minute=31))
        self.assertIsNone(bot.position)
        t = e.trades[-1]
        self.assertTrue(t["reason"].startswith("target"), t["reason"])
        self.assertAlmostEqual(t["pnl"], t["proceeds"] - t["cost"], places=2)
        led = e.risk.ledger
        self.assertAlmostEqual(led.cash, 350 + t["pnl"], places=2)
        self.assertAlmostEqual(led.unsettled, t["proceeds"], places=2)       # T+1
        self.assertAlmostEqual(led.settled, 350 - t["cost"], places=2)
        run(e, "IWM", bars(date(2026, 10, 2), [250.0]))
        self.assertAlmostEqual(led.settled, led.cash, places=6)
        self.assertEqual(e.history[-1]["trades"], 1)

    def test_the_loss_brake_closes_everything_and_stops_the_day(self):
        s = helpers.settings(risk={"daily_loss_brake": 12.0}, exits={"stop_atr": 50, "premium_stop_pct": 0.99})
        e = engine(s)
        run(e, "IWM", morning_cross())
        self.assertIsNotNone(e.by_id["IWM-vwap"].position)
        run(e, "IWM", bars(DAY, [249.7, 249.5, 249.3, 249.1, 248.9], start_minute=31))
        self.assertTrue(e.risk.loss_stopped)
        self.assertIsNone(e.by_id["IWM-vwap"].position)
        self.assertEqual(e.trades[-1]["reason"], "loss brake")
        self.assertTrue(any(ev["kind"] == "brake" and "LOSS BRAKE" in ev["text"] for ev in e.events))
        # a later cross is counted, not traded
        run(e, "IWM", bars(DAY, [248.0] * 8 + [252.0], start_minute=36))
        self.assertIsNone(e.by_id["IWM-vwap"].position)
        self.assertGreaterEqual(e.skips.get("loss brake", 0), 1)

    def test_everything_is_closed_at_15_50(self):
        s = helpers.settings()
        e = engine(s)
        down = [250 - i / 29.0 for i in range(30)]
        flat = [249.0] * (330 - 30)                       # through the 14:59 bar
        run(e, "IWM", bars(DAY, down + flat + [249.3] + [249.3] * 49))   # 15:00 cross, hold to 15:49
        self.assertIsNone(e.by_id["IWM-vwap"].position)
        self.assertEqual(e.trades[-1]["reason"], "15:50 flatten")
        self.assertEqual(e.trades[-1]["exitTime"][11:16], "15:50")

    def test_emergency_stop_closes_and_blocks(self):
        s = helpers.settings()
        e = engine(s)
        run(e, "IWM", morning_cross())
        e.kill("test")
        self.assertIsNone(e.by_id["IWM-vwap"].position)
        self.assertEqual(e.trades[-1]["reason"], "emergency stop")
        run(e, "IWM", bars(DAY, [249.0] * 6 + [251.0], start_minute=31))
        self.assertIsNone(e.by_id["IWM-vwap"].position)
        self.assertEqual(e.snapshot()["risk"]["killed"], True)

    def test_a_signal_before_9_45_is_not_traded(self):
        s = helpers.settings()
        e = engine(s)
        run(e, "IWM", bars(DAY, [250, 249.5, 249.6, 249.4, 250.2]))   # crosses inside the opening range
        self.assertIsNone(e.by_id["IWM-vwap"].position)
        self.assertEqual(e.trades, [])
        self.assertGreaterEqual(e.skips.get("window", 0), 1)

    def test_too_expensive_is_skipped_with_the_numbers(self):
        s = helpers.settings(account={"starting_cash": 150})
        e = engine(s)
        run(e, "IWM", morning_cross())
        self.assertIsNone(e.by_id["IWM-vwap"].position)
        skip = [ev for ev in e.events if ev["kind"] == "skip"][-1]
        self.assertEqual(skip["category"], "can't afford")
        self.assertIn("limit is $68", skip["text"])

    def test_a_partial_exit_sends_the_rest_again(self):
        class HalfSells(B.SimBroker):
            def submit(self, order):
                B.SimBroker.submit(self, order)
                if order.side == "sell" and order.qty > 1 and order.status == B.FILLED:
                    order.filled_qty = order.qty // 2
                    order.status = B.CANCELED
                return order

        s = helpers.settings(account={"starting_cash": 2000}, risk={"max_contracts_per_trade": 2, "max_cost_per_trade_pct": 1.0})
        e = Engine(s, HalfSells(s), SimOptions(s))
        run(e, "IWM", morning_cross())
        p = e.by_id["IWM-vwap"].position
        self.assertEqual(p.qty, 2)
        run(e, "IWM", bars(DAY, [249.8, p.target + 0.05], start_minute=31))
        self.assertIsNone(e.by_id["IWM-vwap"].position)
        t = e.trades[-1]
        self.assertEqual(t["qty"], 2)
        self.assertAlmostEqual(e.risk.ledger.cash, 2000 + t["pnl"], places=2)

    def test_an_entry_that_never_fills_is_cancelled_and_released(self):
        class NeverFills(B.SimBroker):
            def submit(self, order):
                order.id = "x-" + order.client_id
                order.status = B.NEW
                return order

        s = helpers.settings()
        e = Engine(s, NeverFills(s), SimOptions(s))
        run(e, "IWM", morning_cross())
        p = e.by_id["IWM-vwap"].position
        self.assertEqual(p.state, "opening")
        self.assertGreater(e.risk.ledger.reserved, 100)
        self.assertEqual(e.risk.trades_today, 1)
        e.tick(e.now + timedelta(seconds=25))
        self.assertIsNone(e.by_id["IWM-vwap"].position)
        self.assertEqual((e.risk.ledger.reserved, e.risk.trades_today, e.risk.ledger.cash), (0, 0, 350))

    def test_the_sim_broker_refuses_a_duplicate_client_id(self):
        s = helpers.settings()
        br = B.SimBroker(s)
        from tradebot.options import Contract, Quote
        c = Contract("IWM261002C00250000", "IWM", "call", 250, date(2026, 10, 2))
        q = Quote(1.0, 1.02, None)
        self.assertEqual(br.submit(B.Order("buy", c, 1, 1.05, "same", None, q)).status, B.FILLED)
        self.assertEqual(br.submit(B.Order("buy", c, 1, 1.05, "same", None, q)).status, B.REJECTED)


class Backtests(unittest.TestCase):
    def run_days(self, seed, cash=350):
        s = helpers.config.load(None, {"account": {"starting_cash": cash}})
        e = engine(s)
        days = timeutil.trading_days_back(date(2026, 10, 2), 16)
        replay(e, SyntheticMarket(s["symbols"], seed=seed), days[1:], warmup_days=days[:1])
        return e

    def test_the_books_balance_and_runs_repeat(self):
        a, b = self.run_days(11, 5000), self.run_days(11, 5000)
        self.assertGreater(len(a.trades), 5)
        self.assertEqual([t["pnl"] for t in a.trades], [t["pnl"] for t in b.trades])
        self.assertEqual(a.positions(), [])
        self.assertAlmostEqual(a.risk.ledger.cash, 5000 + sum(t["pnl"] for t in a.trades), places=2)
        self.assertAlmostEqual(a.history[-1]["equity"], a.risk.ledger.cash, places=2)
        r = report(a)
        self.assertEqual(r["all"]["trades"], len(a.trades))
        self.assertEqual(r["days"], 15)
        self.assertLessEqual(r["maxDrawdown"], 0)

    def test_no_day_breaks_the_account_rules(self):
        e = self.run_days(5, 350)
        by_day = {}
        for t in e.trades:
            by_day.setdefault(t["date"], []).append(t)
        for day, ts in by_day.items():
            self.assertLessEqual(len(ts), 6, day)
            for t in ts:
                self.assertLessEqual(t["cost"], 0.45 * 700, t)    # never more than the cap on a doubled account
            spans = sorted((t["entryTime"], t["exitTime"]) for t in ts)
            for (a0, a1), (b0, b1) in zip(spans, spans[1:]):
                self.assertLessEqual(a1, b0, "one open trade at a time")
        self.assertTrue(all(t["exitTime"][11:16] <= "15:50" for t in e.trades))


class Server(unittest.TestCase):
    def test_state_chart_kill_and_no_path_escape(self):
        from tradebot.server import serve
        s = helpers.settings()
        e = engine(s)
        run(e, "IWM", morning_cross())
        httpd = serve(e, e.kill, "127.0.0.1", 0)
        port = httpd.server_address[1]
        try:
            def req(method, path, headers=None):
                c = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
                try:
                    c.request(method, path, headers=headers or {})
                    r = c.getresponse()
                    return r.status, r.read()
                finally:
                    c.close()
            code, body = req("GET", "/api/state")
            state = json.loads(body)
            self.assertEqual((code, len(state["bots"]), state["bots"][0]["state"]), (200, 1, "in-trade"))
            code, body = req("GET", "/api/chart?symbol=iwm")
            self.assertEqual((code, len(json.loads(body)["bars"])), (200, 31))
            self.assertEqual(req("GET", "/../tradebot/engine.py")[0], 404)
            self.assertEqual(req("GET", "/%2e%2e/run.py")[0], 404)
            self.assertEqual(req("GET", "/")[0], 200)
            self.assertEqual(req("POST", "/api/kill")[0], 403)
            self.assertFalse(e.risk.killed)
            self.assertEqual(req("POST", "/api/kill", {"X-Trading-City": "1"})[0], 200)
            for _ in range(50):
                if e.risk.killed:
                    break
                time.sleep(0.02)
            self.assertTrue(e.risk.killed)
            self.assertIsNone(e.by_id["IWM-vwap"].position)
        finally:
            httpd.shutdown()
            httpd.server_close()


if __name__ == "__main__":
    unittest.main()
