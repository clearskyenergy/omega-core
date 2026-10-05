"""The Alpaca connector against a local stand-in for Alpaca's API.

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

The stand-in answers the endpoints the bot calls with the shapes Alpaca's
docs give (docs.alpaca.markets). It proves the requests are well formed and
the answers are read correctly; it cannot prove Alpaca behaves as documented.
"""

import json
import tempfile
import threading
import unittest
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import helpers
from tradebot import broker as B
from tradebot import timeutil
from tradebot.alpaca import AlpacaBroker, AlpacaClient, AlpacaOptions, PaperRunner, parse_occ
from tradebot.engine import Engine
from tradebot.journal import Journal
from tradebot.options import Contract, SimOptions


class Fake:
    def __init__(self):
        self.requests = []
        self.orders = {}
        self.positions = []
        self.bars = {}
        self.closed = []


def handler(fake):
    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def reply(self, code, body=None):
            data = json.dumps(body).encode() if body is not None else b""
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def route(self, method):
            url = urlparse(self.path)
            q = {k: v[0] for k, v in parse_qs(url.query).items()}
            n = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(n)) if n else None
            fake.requests.append((method, url.path, q, body, self.headers.get("APCA-API-KEY-ID")))
            p = url.path
            if p == "/v2/account":
                return self.reply(200, {"account_number": "PA1", "cash": "100000", "options_trading_level": 2})
            if p == "/v2/clock":
                return self.reply(200, {"is_open": True, "next_close": "2026-10-01T16:00:00-04:00"})
            if p == "/v2/positions":
                return self.reply(200, fake.positions)
            if p.startswith("/v2/positions/") and method == "DELETE":
                fake.closed.append(p.rsplit("/", 1)[1])
                return self.reply(200, {"id": "close"})
            if p == "/v2/orders" and method == "POST":
                cid = body["client_order_id"]
                if cid in fake.orders:
                    return self.reply(422, {"code": 40010001, "message": "client_order_id must be unique"})
                order = {"id": "ord-%d" % (len(fake.orders) + 1), "client_order_id": cid, "status": "filled",
                         "filled_qty": body["qty"], "filled_avg_price": body.get("limit_price", "1.20"),
                         "symbol": body["symbol"]}
                fake.orders[cid] = order
                return self.reply(200, order)
            if p == "/v2/orders:by_client_order_id":
                return self.reply(200, fake.orders[q["client_order_id"]])
            if p == "/v2/options/contracts":
                rows = [{"symbol": "x", "expiration_date": d, "tradable": True}
                        for d in ("2026-10-01", "2026-10-02", "2026-10-05")]
                if q.get("page_token") == "p2":
                    return self.reply(200, {"option_contracts": rows[2:], "next_page_token": None})
                return self.reply(200, {"option_contracts": rows[:2], "next_page_token": "p2"})
            if p == "/v1beta1/options/snapshots/IWM":
                quote = {"bp": 1.30, "ap": 1.33, "t": "2026-10-01T14:00:00Z"}
                return self.reply(200, {"snapshots": {
                    "IWM261002C00249000": {"latestQuote": dict(quote, bp=1.80, ap=1.84)},
                    "IWM261002C00250000": {"latestQuote": quote},
                    "IWM261002C00251000": {"latestQuote": dict(quote, bp=0.90, ap=0.93)}}, "next_page_token": None})
            if p == "/v1beta1/options/quotes/latest":
                return self.reply(200, {"quotes": {s: {"bp": 1.5, "ap": 1.52, "t": "2026-10-01T14:05:00Z"}
                                                   for s in q["symbols"].split(",")}})
            if p.startswith("/v2/stocks/") and p.endswith("/bars"):
                sym = p.split("/")[3]
                return self.reply(200, {"bars": fake.bars.get(sym, []), "symbol": sym, "next_page_token": None})
            return self.reply(404, {"message": "no route " + p})

        def do_GET(self):
            self.route("GET")

        def do_POST(self):
            self.route("POST")

        def do_DELETE(self):
            self.route("DELETE")

    return H


class AlpacaTests(unittest.TestCase):
    def setUp(self):
        self.fake = Fake()
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler(self.fake))
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        url = "http://127.0.0.1:%d" % self.httpd.server_address[1]
        self.client = AlpacaClient("key", "secret", url, url, timeout=5, retries=0)
        self.s = helpers.settings()
        self.now = datetime(2026, 10, 1, 10, 0, tzinfo=timeutil.ET)

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()

    def test_only_the_paper_endpoint_is_accepted(self):
        with self.assertRaises(ValueError):
            AlpacaClient("k", "s", "https://api.alpaca.markets")
        with self.assertRaises(ValueError):
            AlpacaClient("", "s")
        AlpacaClient("k", "s", "https://paper-api.alpaca.markets")

    def test_picks_the_next_expiry_and_the_strike_nearest_the_price(self):
        opts = AlpacaOptions(self.client, self.s)
        contract, quote = opts.pick("IWM", "call", 250.2, self.now)
        self.assertEqual((contract.symbol, contract.strike, str(contract.expiry)), ("IWM261002C00250000", 250.0, "2026-10-02"))
        self.assertEqual((quote.bid, quote.ask, quote.ts.hour), (1.30, 1.33, 10))
        pages = [r for r in self.fake.requests if r[1] == "/v2/options/contracts"]
        self.assertEqual(len(pages), 2, "followed next_page_token")
        self.assertEqual(pages[0][2]["underlying_symbols"], "IWM")
        self.assertTrue(all(r[4] == "key" for r in self.fake.requests), "every call carries the key header")

    def test_orders_are_well_formed_and_a_duplicate_is_looked_up(self):
        br = AlpacaBroker(self.client)
        c = Contract("IWM261002C00250000", "IWM", "call", 250, None)
        o = br.submit(B.Order("buy", c, 1, 1.35, "tc-IWM-vwap-2610011000-e", self.now))
        body = [r for r in self.fake.requests if r[1] == "/v2/orders"][0][3]
        self.assertEqual(body, {"symbol": "IWM261002C00250000", "qty": "1", "side": "buy", "type": "limit",
                                "time_in_force": "day", "client_order_id": "tc-IWM-vwap-2610011000-e",
                                "position_intent": "buy_to_open", "limit_price": "1.35"})
        self.assertEqual((o.status, o.filled_qty, o.avg_price), (B.FILLED, 1, 1.35))
        again = br.submit(B.Order("buy", c, 1, 1.35, "tc-IWM-vwap-2610011000-e", self.now))
        self.assertEqual((again.status, again.id), (B.FILLED, o.id))
        sell = br.submit(B.Order("sell", c, 1, None, "tc-x", self.now))
        body = [r for r in self.fake.requests if r[1] == "/v2/orders"][-1][3]
        self.assertEqual((body["type"], body["position_intent"], "limit_price" in body), ("market", "sell_to_close", False))
        self.assertEqual(sell.status, B.FILLED)

    def test_only_completed_minutes_reach_the_engine_and_in_order(self):
        s = helpers.settings(symbols=["IWM", "SPY"])
        e = Engine(s, B.SimBroker(s), SimOptions(s))

        def bar(minute, c):
            ts = timeutil.at(helpers.DAY, timeutil.OPEN).replace(minute=30 + minute)
            return {"t": ts.astimezone(timeutil.ET).isoformat(), "o": c, "h": c + 0.1, "l": c - 0.1, "c": c, "v": 100}
        self.fake.bars = {"IWM": [bar(0, 250), bar(1, 250.1), bar(2, 250.2), bar(3, 250.3)],
                          "SPY": [bar(0, 700), bar(1, 700.1)]}
        r = PaperRunner(e, self.client, s, Journal(tempfile.mkdtemp()), threading.Event(), log=lambda *a: None)
        at = lambda m, sec: timeutil.at(helpers.DAY, timeutil.OPEN).replace(minute=30 + m, second=sec)
        self.assertEqual(r.poll(at(3, 1)), 2)            # 9:30 and 9:31 have both symbols
        self.assertEqual(r.last_ts.minute, 31)
        self.assertEqual(r.poll(at(3, 5)), 0)            # 9:32 waits for SPY's bar
        self.assertEqual(r.poll(at(3, 9)), 1)            # ...for 8 seconds, then goes without it
        self.assertEqual(r.last_ts.minute, 32)
        self.assertNotIn(33, [ts.minute for ts in r.pending])   # 9:33 bar not complete at 9:33:09

    def test_a_restart_picks_positions_back_up_and_names_strangers(self):
        s = helpers.settings()
        e = Engine(s, AlpacaBroker(self.client), SimOptions(s), source="alpaca-paper")
        j = Journal(tempfile.mkdtemp())
        j._write(j.open_path, [{"bot": "IWM-vwap", "contract": {"symbol": "IWM261002C00250000"}, "qty": 1,
                                "entryPrice": 1.31, "entryCost": 131.69, "entryTime": "2026-10-01T10:00:00-04:00",
                                "entryUnderlying": 249.8, "atr": 0.2, "stop": 249.6, "target": 250.1}])
        self.fake.positions = [{"symbol": "IWM261002C00250000", "qty": "1", "asset_class": "us_option"},
                               {"symbol": "IWM261002P00240000", "qty": "2", "asset_class": "us_option"},
                               {"symbol": "AAPL", "qty": "5", "asset_class": "us_equity"}]
        r = PaperRunner(e, self.client, s, j, threading.Event(), log=lambda *a: None)
        r.reconcile()
        p = e.by_id["IWM-vwap"].position
        self.assertEqual((p.state, p.qty, p.stop, p.target, p.entry_cost), ("open", 1, 249.6, 250.1, 131.69))
        self.assertEqual(r.orphans, ["IWM261002P00240000"])
        self.assertTrue(any("UNMANAGED" in ev["text"] for ev in e.events))
        r.kill("test")
        self.assertIn("IWM261002P00240000", self.fake.closed)
        self.assertEqual(r.orphans, [])

    def test_parse_occ(self):
        root, exp, kind, strike = parse_occ("SPY261005P00712500")
        self.assertEqual((root, str(exp), kind, strike), ("SPY", "2026-10-05", "put", 712.5))


if __name__ == "__main__":
    unittest.main()
