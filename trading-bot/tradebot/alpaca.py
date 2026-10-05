"""Alpaca PAPER trading: real market data, simulated orders, no real money.

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Why Alpaca: Fidelity has no public API for trading a personal account, so a
bot cannot place orders there. Alpaca's paper account is free, supports
buying calls and puts by default, and its API is the same one a live account
uses. Keys come from the environment (ALPACA_API_KEY_ID, ALPACA_API_SECRET_KEY,
or a local `.env` file you never commit).

This module talks to the PAPER endpoint only. `AlpacaClient` refuses any
trading URL that is not paper-api.alpaca.markets (or a local test server).
Going live is a separate, deliberate change after the paper results are in.

Endpoints used (docs.alpaca.markets):
  GET  /v2/account, /v2/clock, /v2/positions
  GET  /v2/options/contracts                       which expirations exist
  POST /v2/orders   GET /v2/orders/{id}   DELETE /v2/orders/{id}
  GET  /v2/orders:by_client_order_id               after a duplicate submit
  DELETE /v2/positions/{symbol}                    emergency stop, orphans
  GET  data /v2/stocks/{symbol}/bars               1-minute bars (IEX feed)
  GET  data /v1beta1/options/snapshots/{underlying}   chain with quotes
  GET  data /v1beta1/options/quotes/latest         a held contract's quote
"""

import json
import os
import time as _time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta

from . import timeutil
from .broker import CANCELED, FILLED, NEW, PARTIAL, REJECTED
from .engine import Bar, Position
from .market import minutes, write_csv
from .options import Contract, Quote
from .strategies import CALL, PUT

PAPER_URL = "https://paper-api.alpaca.markets"
DATA_URL = "https://data.alpaca.markets"


class AlpacaError(Exception):
    def __init__(self, status, message):
        Exception.__init__(self, "Alpaca %s: %s" % (status, message))
        self.status = status
        self.message = message


def _is_paper(url):
    host = urllib.parse.urlparse(url).hostname or ""
    return host == "paper-api.alpaca.markets" or host in ("127.0.0.1", "localhost")


class AlpacaClient:
    def __init__(self, key_id, secret, trading_url=PAPER_URL, data_url=DATA_URL, timeout=15, retries=3):
        if not key_id or not secret:
            raise ValueError("set ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY (paper keys) in trading-bot/.env")
        if not _is_paper(trading_url):
            raise ValueError("this version trades on Alpaca PAPER only (%s refused)" % trading_url)
        self.key_id = key_id
        self.secret = secret
        self.trading_url = trading_url.rstrip("/")
        self.data_url = data_url.rstrip("/")
        self.timeout = timeout
        self.retries = retries

    @classmethod
    def from_env(cls):
        return cls(os.environ.get("ALPACA_API_KEY_ID"), os.environ.get("ALPACA_API_SECRET_KEY"),
                   os.environ.get("ALPACA_PAPER_URL", PAPER_URL), os.environ.get("ALPACA_DATA_URL", DATA_URL))

    def _request(self, method, base, path, params=None, body=None):
        url = base + path
        if params:
            url += "?" + urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
        data = json.dumps(body).encode("utf-8") if body is not None else None
        headers = {"APCA-API-KEY-ID": self.key_id, "APCA-API-SECRET-KEY": self.secret,
                   "Accept": "application/json"}
        if data is not None:
            headers["Content-Type"] = "application/json"
        delay = 0.5
        for attempt in range(self.retries + 1):
            req = urllib.request.Request(url, data=data, method=method, headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    raw = resp.read()
                    return json.loads(raw.decode("utf-8")) if raw else None
            except urllib.error.HTTPError as err:
                raw = err.read().decode("utf-8", "replace")
                try:
                    message = json.loads(raw).get("message", raw)
                except ValueError:
                    message = raw
                # 429 (rate limit) and 5xx are worth a retry; nothing else is.
                if (err.code == 429 or err.code >= 500) and attempt < self.retries:
                    _time.sleep(delay)
                    delay *= 2
                    continue
                raise AlpacaError(err.code, message)
            except urllib.error.URLError as err:
                if attempt < self.retries:
                    _time.sleep(delay)
                    delay *= 2
                    continue
                raise AlpacaError("network", str(err.reason))

    def trading(self, method, path, params=None, body=None):
        return self._request(method, self.trading_url, path, params, body)

    def data(self, path, params=None):
        return self._request("GET", self.data_url, path, params)

    # ── account ────────────────────────────────────────────────────────────

    def account(self):
        return self.trading("GET", "/v2/account")

    def clock(self):
        return self.trading("GET", "/v2/clock")

    def positions(self):
        return self.trading("GET", "/v2/positions") or []

    def close_position(self, symbol):
        return self.trading("DELETE", "/v2/positions/%s" % urllib.parse.quote(symbol))

    # ── orders ─────────────────────────────────────────────────────────────

    def submit_order(self, body):
        return self.trading("POST", "/v2/orders", body=body)

    def get_order(self, order_id):
        return self.trading("GET", "/v2/orders/%s" % order_id)

    def get_order_by_client_id(self, client_id):
        return self.trading("GET", "/v2/orders:by_client_order_id", {"client_order_id": client_id})

    def cancel_order(self, order_id):
        return self.trading("DELETE", "/v2/orders/%s" % order_id)

    # ── market data ────────────────────────────────────────────────────────

    def bars(self, symbol, start, end=None, feed="iex"):
        """1-minute bars from `start` (inclusive), oldest first."""
        out, token = [], None
        while True:
            resp = self.data("/v2/stocks/%s/bars" % symbol, {
                "timeframe": "1Min", "start": start.isoformat(), "end": end.isoformat() if end else None,
                "limit": 10000, "feed": feed, "adjustment": "raw", "sort": "asc", "page_token": token})
            for b in resp.get("bars") or []:
                out.append(Bar(timeutil.parse_ts(b["t"]), float(b["o"]), float(b["h"]), float(b["l"]),
                               float(b["c"]), float(b.get("v", 0))))
            token = resp.get("next_page_token")
            if not token:
                return out

    def option_contracts(self, underlying, exp_gte, exp_lte, kind=None, strike_gte=None, strike_lte=None):
        out, token = [], None
        while True:
            resp = self.trading("GET", "/v2/options/contracts", {
                "underlying_symbols": underlying, "status": "active",
                "expiration_date_gte": exp_gte.isoformat(), "expiration_date_lte": exp_lte.isoformat(),
                "type": kind, "strike_price_gte": strike_gte, "strike_price_lte": strike_lte,
                "limit": 1000, "page_token": token})
            out.extend(resp.get("option_contracts") or [])
            token = resp.get("next_page_token")
            if not token:
                return out

    def option_chain(self, underlying, kind, expiry, strike_gte, strike_lte, feed="indicative"):
        out, token = {}, None
        while True:
            resp = self.data("/v1beta1/options/snapshots/%s" % underlying, {
                "feed": feed, "type": kind, "expiration_date": expiry.isoformat(),
                "strike_price_gte": strike_gte, "strike_price_lte": strike_lte, "limit": 100, "page_token": token})
            out.update(resp.get("snapshots") or {})
            token = resp.get("next_page_token")
            if not token:
                return out

    def latest_option_quotes(self, symbols, feed="indicative"):
        resp = self.data("/v1beta1/options/quotes/latest", {"symbols": ",".join(symbols), "feed": feed})
        return resp.get("quotes") or {}


def parse_occ(symbol):
    """QQQ261005C00754000 -> ('QQQ', date(2026,10,5), 'call', 754.0)."""
    root, ymd, cp, strike = symbol[:-15], symbol[-15:-9], symbol[-9], symbol[-8:]
    expiry = date(2000 + int(ymd[:2]), int(ymd[2:4]), int(ymd[4:6]))
    return root, expiry, CALL if cp == "C" else PUT, int(strike) / 1000.0


def _quote(q):
    if not q:
        return None
    ts = timeutil.parse_ts(q["t"]) if q.get("t") else None
    return Quote(float(q.get("bp") or 0.0), float(q.get("ap") or 0.0), ts)


_STATUS = {"filled": FILLED, "partially_filled": PARTIAL, "canceled": CANCELED, "expired": CANCELED,
           "done_for_day": CANCELED, "replaced": CANCELED, "rejected": REJECTED, "suspended": REJECTED}


class AlpacaBroker:
    name = "alpaca-paper"

    def __init__(self, client):
        self.client = client

    def _apply(self, order, data):
        order.id = data.get("id", order.id)
        order.status = _STATUS.get(data.get("status"), NEW)
        order.filled_qty = int(float(data.get("filled_qty") or 0))
        avg = data.get("filled_avg_price")
        order.avg_price = float(avg) if avg not in (None, "") else None
        return order

    def submit(self, order):
        body = {"symbol": order.contract.symbol, "qty": str(order.qty), "side": order.side,
                "type": "limit" if order.limit is not None else "market", "time_in_force": "day",
                "client_order_id": order.client_id,
                "position_intent": "buy_to_open" if order.side == "buy" else "sell_to_close"}
        if order.limit is not None:
            body["limit_price"] = "%.2f" % order.limit
        try:
            return self._apply(order, self.client.submit_order(body))
        except AlpacaError as err:
            # The same client id twice means we already sent it (a retry after
            # a timeout, or a restart): look the first one up instead.
            if err.status == 422 and "client_order_id" in str(err.message):
                try:
                    return self._apply(order, self.client.get_order_by_client_id(order.client_id))
                except AlpacaError:
                    pass
            order.status = REJECTED
            order.message = str(err.message)
            return order

    def refresh(self, order):
        if order.id is None or order.done:
            return order
        try:
            return self._apply(order, self.client.get_order(order.id))
        except AlpacaError as err:
            order.message = str(err.message)
            return order

    def cancel(self, order):
        if order.id is None or order.done:
            return order
        try:
            self.client.cancel_order(order.id)
        except AlpacaError as err:
            order.message = str(err.message)   # 422 = already filled; refresh says so
        return self.refresh(order)


class AlpacaOptions:
    """Picks the at-the-money contract from Alpaca's real option chain."""

    source = "alpaca"

    def __init__(self, client, settings):
        self.client = client
        self.opt = settings["options"]
        self.feed = settings["alpaca"]["options_feed"]
        self._expiry = {}

    def expiry_for(self, underlying, kind, price, today):
        key = (underlying, today)
        if key not in self._expiry:
            step = self.opt["strike_step"][underlying]
            rows = self.client.option_contracts(underlying, today, today + timedelta(days=10), kind,
                                                round(price - 5 * step, 2), round(price + 5 * step, 2))
            dates = sorted({date.fromisoformat(r["expiration_date"]) for r in rows if r.get("tradable", True)})
            dte = self.opt["dte"]
            later = [d for d in dates if d > today]
            if dte == 0:
                pick = today if today in dates else None
            else:
                pick = later[dte - 1] if len(later) >= dte else None
            self._expiry[key] = pick
        return self._expiry[key]

    def pick(self, underlying, kind, price, now):
        today = now.astimezone(timeutil.ET).date()
        expiry = self.expiry_for(underlying, kind, price, today)
        if expiry is None:
            return None, "no %dDTE expiration listed" % self.opt["dte"]
        step = self.opt["strike_step"][underlying]
        chain = self.client.option_chain(underlying, kind, expiry, round(price - 3 * step, 2),
                                         round(price + 3 * step, 2), self.feed)
        best = None
        for symbol, snap in chain.items():
            strike = parse_occ(symbol)[3]
            dist = abs(strike - price)
            if best is None or dist < best[0]:
                best = (dist, symbol, strike, snap)
        if best is None:
            return None, "empty option chain near %.2f" % price
        _, symbol, strike, snap = best
        return Contract(symbol, underlying, kind, strike, expiry), _quote(snap.get("latestQuote"))

    def quote(self, contract, price, now):
        quotes = self.client.latest_option_quotes([contract.symbol], self.feed)
        return _quote(quotes.get(contract.symbol))


class PaperRunner:
    """The live loop: every few seconds, fetch new 1-minute bars, hand each
    COMPLETED minute to the engine, and check on working orders in between."""

    GRACE = timedelta(seconds=8)   # how long a minute waits for every symbol's bar

    def __init__(self, engine, client, settings, journal, stop, log=print):
        self.engine = engine
        self.client = client
        self.s = settings
        self.journal = journal
        self.stop = stop
        self.log = log
        self.feed = settings["alpaca"]["feed"]
        self.last_ts = None
        self.pending = {}
        self.orphans = []
        self.failures = 0

    # ── start-up ───────────────────────────────────────────────────────────

    def warm_up(self, now):
        """Yesterday's bars build the 50 EMA and ATR; today's bars so far
        rebuild VWAP and the opening range. None of them can trade: a signal
        from ten minutes ago is not a signal now."""
        today = now.date()
        start = timeutil.at(timeutil.prev_trading_day(today), timeutil.OPEN)
        merged = {}
        for sym in self.s["symbols"]:
            for b in self.client.bars(sym, start, now, self.feed):
                if not self._session_bar(b) or b.closes_at > now:
                    continue
                merged.setdefault(b.ts.date(), {}).setdefault(sym, []).append(b)
        for day in sorted(merged):
            for ts, bars in minutes(merged[day]):
                self.engine.on_minute(ts, bars, trade=False)
                self.last_ts = ts
        self.log("warmed up through %s" % (self.last_ts.isoformat() if self.last_ts else "nothing"))

    def reconcile(self):
        """After a restart: take back the positions the journal says the bots
        hold, and name any option position at Alpaca the bots did not open."""
        saved = {row["contract"]["symbol"]: row for row in self.journal.load_open()}
        held = {}
        for p in self.client.positions():
            if p.get("asset_class") == "us_option" and parse_occ(p["symbol"])[0] in self.s["symbols"]:
                held[p["symbol"]] = int(float(p.get("qty") or 0))
        eng = self.engine
        for symbol, row in saved.items():
            if symbol in held and held[symbol] > 0 and row["bot"] in eng.by_id:
                bot = eng.by_id[row["bot"]]
                root, expiry, kind, strike = parse_occ(symbol)
                c = Contract(symbol, root, kind, strike, expiry)
                p = Position(bot, c, held[symbol], row["entryCost"], None,
                             timeutil.parse_ts(row["entryTime"]), row["entryUnderlying"], row.get("atr"))
                p.entry_price, p.entry_cost = row["entryPrice"], row["entryCost"]
                p.stop, p.target, p.state = row["stop"], row["target"], "open"
                bot.position = p
                eng.emit("info", "picked up %s again (%d contract(s), stop %s, target %s)"
                         % (symbol, p.qty, p.stop, p.target), bot)
            else:
                eng.emit("info", "%s closed while the bot was off; its result is not in trades.csv" % symbol)
        for symbol, qty in held.items():
            if symbol not in saved:
                self.orphans.append(symbol)
                eng.emit("brake", "UNMANAGED POSITION %s x%d at Alpaca: the bots did not open it. Close it in "
                         "Alpaca, or press Emergency stop (which closes it too)." % (symbol, qty))
        self.journal.save_open(eng.positions())

    # ── the loop ───────────────────────────────────────────────────────────

    @staticmethod
    def _session_bar(b):
        clock = timeutil.clock_of(b.ts)
        return timeutil.OPEN <= clock < timeutil.CLOSE

    def poll(self, now):
        """One pass: new completed bars -> engine; otherwise just orders."""
        start = (self.last_ts + timedelta(minutes=1)) if self.last_ts else timeutil.at(now.date(), timeutil.OPEN)
        for sym in self.s["symbols"]:
            for b in self.client.bars(sym, start, now, self.feed):
                if self._session_bar(b) and b.closes_at <= now and (self.last_ts is None or b.ts > self.last_ts):
                    self.pending.setdefault(b.ts, {})[sym] = b
        ready = []
        for ts in sorted(self.pending):
            bars = self.pending[ts]
            complete = len(bars) == len(self.s["symbols"])
            if complete or now >= ts + timedelta(minutes=1) + self.GRACE:
                ready.append(ts)
            else:
                break   # keep minutes in order
        for ts in ready:
            self.engine.on_minute(ts, self.pending.pop(ts), trade=True, now=max(now, ts + timedelta(minutes=1)))
            self.last_ts = ts
        if not ready:
            self.engine.tick(now)
        return len(ready)

    def set_session(self, clock):
        """Half days close at 13:00: pull the flatten and the last entry in."""
        close = timeutil.parse_ts(clock["next_close"]) if clock.get("next_close") else None
        sig = self.s["signals"]
        flatten = timeutil.parse_hhmm(sig["flatten_at"])
        last = timeutil.parse_hhmm(sig["last_entry"])
        if close is not None and close.date() == timeutil.now_et().date():
            early_flat = timeutil.clock_of(close - timedelta(minutes=10))
            early_last = timeutil.clock_of(close - timedelta(minutes=30))
            flatten, last = min(flatten, early_flat), min(last, early_last)
        self.engine.flatten_at = flatten
        self.engine.risk.last_entry = last

    def kill(self, reason):
        self.engine.kill(reason)
        for symbol in list(self.orphans):
            try:
                self.client.close_position(symbol)
                self.engine.emit("info", "closed unmanaged position %s" % symbol)
                self.orphans.remove(symbol)
            except AlpacaError as err:
                self.engine.emit("error", "could not close %s: %s" % (symbol, err))

    def run(self):
        acct = self.client.account()
        self.log("Alpaca paper account %s: cash $%s, options level %s. The bots size trades from $%.2f."
                 % (acct.get("account_number", "?"), acct.get("cash"), acct.get("options_trading_level"),
                    self.engine.risk.ledger.starting_cash))
        self.warm_up(timeutil.now_et())
        self.reconcile()
        session_day = None
        while not self.stop.is_set():
            try:
                now = timeutil.now_et()
                clock = self.client.clock()
                if clock.get("is_open"):
                    if session_day != now.date():
                        session_day = now.date()
                        self.set_session(clock)
                    self.poll(now)
                else:
                    if session_day is not None:
                        self.poll(now)          # the last minutes of the day
                        self.engine.end_day()
                        self.engine.day = None
                        session_day = None
                    self.engine.tick(now)
                self.failures = 0
            except AlpacaError as err:
                self.failures += 1
                self.engine.emit("error", "Alpaca: %s" % err)
                if self.failures >= 5:
                    self.kill("5 failed calls to Alpaca in a row")
            self.stop.wait(self.s["alpaca"]["poll_seconds"])


def fetch_history(client, symbols, days, folder, feed="iex", log=print):
    """Save the last `days` trading days of 1-minute bars to <folder>/<SYM>.csv
    for `python3 run.py backtest --data <folder>`."""
    end_day = timeutil.prev_trading_day(timeutil.now_et().date() + timedelta(days=1))
    first = timeutil.trading_days_back(end_day, days)[0]
    start = timeutil.at(first, timeutil.OPEN)
    end = timeutil.now_et() - timedelta(minutes=16)   # the free feed's recent-data limit
    for sym in symbols:
        bars = [b for b in client.bars(sym, start, end, feed) if PaperRunner._session_bar(b)]
        path = os.path.join(folder, "%s.csv" % sym)
        write_csv(path, bars)
        log("%s: %d bars -> %s" % (sym, len(bars), path))
