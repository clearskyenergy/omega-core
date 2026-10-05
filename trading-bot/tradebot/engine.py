"""The engine: runs every bot on every 1-minute close.

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

On each minute, in this order:
  1. update each symbol's chart lines (VWAP, EMAs, ATR, opening range)
  2. check on orders already at the broker (fills, timeouts)
  3. price the open positions at the bid; trip the loss brake if the day is
     down too far (which closes everything)
  4. exits: 15:50 flatten, stop, target, premium backstop
  5. entries: each bot reads its signal; a signal becomes an order only if
     the quote is sane AND the shared risk controller approves it

Exits are checked on the 1-minute close, the same moment entries are. A fast
move can go well past a stop inside one minute, so a stop is a plan, not a
guaranteed maximum loss; the bought option can still lose everything paid.
"""

import threading
from datetime import timedelta

from . import timeutil
from .broker import CANCELED, FILLED, REJECTED, Order
from .indicators import ATR, EMA, VWAP, OpeningRange
from .options import check_quote
from .risk import RiskController
from .strategies import CALL, LABELS, PUT, Market, make


class Bar:
    __slots__ = ("ts", "open", "high", "low", "close", "volume")

    def __init__(self, ts, open_, high, low, close, volume):
        self.ts = ts            # New York datetime the bar STARTS
        self.open = open_
        self.high = high
        self.low = low
        self.close = close
        self.volume = volume

    @property
    def closes_at(self):
        return self.ts + timedelta(minutes=1)


class SymbolState:
    """One symbol's chart lines, carried bar to bar."""

    def __init__(self, symbol, sig):
        self.symbol = symbol
        self.ema_fast = EMA(sig["ema_fast"])
        self.ema_mid = EMA(sig["ema_mid"])
        self.ema_slow = EMA(sig["ema_slow"])
        self.atr = ATR(sig["atr_period"])
        self.vwap = VWAP()
        self.orange = OpeningRange(sig["orb_minutes"])
        self.bar = None
        self.prev = {}           # last bar's close, vwap, ema50
        self.prev_day_close = None
        self.market = None
        self.chart = None
        self.new_day()

    def new_day(self):
        if self.bar is not None:
            self.prev_day_close = self.bar.close
        self.vwap.reset()
        self.orange.reset()
        self.prev = {"close": self.bar.close if self.bar else None, "vwap": None,
                     "ema50": self.ema_slow.value}
        self.chart = {"bars": [], "vwap": [], "ema50": [], "markers": []}

    def update(self, bar):
        minute = timeutil.minute_of_session(bar.ts)
        vwap = self.vwap.update(bar.high, bar.low, bar.close, bar.volume)
        ema9 = self.ema_fast.update(bar.close)
        ema21 = self.ema_mid.update(bar.close)
        ema50 = self.ema_slow.update(bar.close)
        atr = self.atr.update(bar.high, bar.low, bar.close)
        self.orange.update(minute, bar.high, bar.low)
        self.market = Market(
            close=bar.close, prev_close=self.prev.get("close"),
            vwap=vwap, prev_vwap=self.prev.get("vwap"),
            ema9=ema9, ema21=ema21, ema50=ema50, prev_ema50=self.prev.get("ema50"),
            atr=atr, or_high=self.orange.high, or_low=self.orange.low,
            or_complete=self.orange.complete, minute=minute)
        self.prev = {"close": bar.close, "vwap": vwap, "ema50": ema50}
        self.bar = bar
        t = int(bar.ts.timestamp())
        self.chart["bars"].append([t, bar.open, bar.high, bar.low, bar.close])
        self.chart["vwap"].append(round(vwap, 4) if vwap is not None else None)
        self.chart["ema50"].append(round(ema50, 4) if ema50 is not None else None)

    def to_dict(self):
        b, m = self.bar, self.market
        if b is None:
            return {"price": None}
        change = None
        if self.prev_day_close:
            change = 100.0 * (b.close - self.prev_day_close) / self.prev_day_close
        r = lambda x: round(x, 4) if x is not None else None
        return {"price": round(b.close, 2), "changePct": r(change), "vwap": r(m.vwap),
                "ema50": r(m.ema50), "ema9": r(m.ema9), "ema21": r(m.ema21), "atr": r(m.atr),
                "orHigh": r(m.or_high), "orLow": r(m.or_low), "orComplete": bool(m.or_complete)}


class Position:
    def __init__(self, bot, contract, qty, est_cost, quote, now, underlying, atr):
        self.bot_id = bot.id
        self.symbol = bot.symbol
        self.contract = contract
        self.direction = contract.kind
        self.qty = qty
        self.est_cost = est_cost
        self.entry_quote = quote
        self.entry_time = now
        self.entry_underlying = underlying
        self.atr = atr
        self.entry_price = None
        self.entry_cost = None
        self.stop = None
        self.target = None
        self.state = "opening"
        self.order = None
        self.exit_reason = None
        self.exit_attempts = 0
        self.exit_proceeds = 0.0
        self.exit_filled = 0
        self.exit_value = 0.0      # sum of fill price x qty, for the average exit price
        self.mark_bid = None
        self.mark_time = None

    @property
    def open_qty(self):
        return self.qty - self.exit_filled

    def value(self):
        if self.state == "opening" or self.mark_bid is None:
            return 0.0
        return self.mark_bid * 100.0 * self.open_qty

    def unrealized(self, fee_per):
        if self.state == "opening" or self.mark_bid is None or self.entry_cost is None:
            return 0.0
        held = self.open_qty / float(self.qty)
        return self.mark_bid * 100.0 * self.open_qty - fee_per * self.open_qty - self.entry_cost * held

    def to_dict(self, fee_per):
        return {"contract": self.contract.symbol, "kind": self.direction, "strike": self.contract.strike,
                "expiry": self.contract.expiry.isoformat(), "qty": self.open_qty, "state": self.state,
                "entry": self.entry_price, "mark": self.mark_bid,
                "pnl": round(self.unrealized(fee_per), 2), "stop": self.stop, "target": self.target,
                "entryUnderlying": self.entry_underlying,
                "entryTime": self.entry_time.isoformat()}


class Bot:
    def __init__(self, symbol, strategy_key, settings):
        self.id = "%s-%s" % (symbol, strategy_key)
        self.symbol = symbol
        self.strategy_key = strategy_key
        self.label = "%s %s" % (symbol, LABELS[strategy_key])
        self.strategy = make(strategy_key, settings)
        self.position = None
        self.charge = (None, 0.0)
        self.flash = None
        self.last_note = ""
        self.all_pnl = 0.0
        self.all_trades = 0
        self.new_day()

    def new_day(self):
        self.strategy.new_day()
        self.last_note = ""
        self.flash = None
        self.day_pnl = 0.0
        self.day_trades = 0
        self.day_wins = 0


class Engine:
    def __init__(self, settings, broker, options_market, source="synthetic", mode="demo", journal=None):
        self.s = settings
        self.broker = broker
        self.options = options_market
        self.source = source
        self.mode = mode
        self.journal = journal
        self.lock = threading.RLock()
        self.risk = RiskController(settings)
        self.symbols = {sym: SymbolState(sym, settings["signals"]) for sym in settings["symbols"]}
        self.bots = [Bot(sym, key, settings) for sym in settings["symbols"] for key in settings["strategies"]]
        self.by_id = {b.id: b for b in self.bots}
        self.flatten_at = timeutil.parse_hhmm(settings["signals"]["flatten_at"])
        self.fee_per = settings["costs"]["commission_per_contract"] + settings["costs"]["fees_per_contract"]
        self.day = None
        self.now = None
        self.trading = False
        self.events = []
        self.trades = []
        self.history = []
        self.skips = {}
        self.signals = {}
        self.seq = 0
        self._flash_id = 0
        self._event_n = 0
        self.day_flags = {"profit": False, "loss": False}

    # ── helpers ────────────────────────────────────────────────────────────

    def positions(self):
        return [b.position for b in self.bots if b.position is not None]

    def _price(self, symbol):
        """The last close, or None before the first bar (e.g. just after a
        restart, when only the broker's quote can price a position)."""
        bar = self.symbols[symbol].bar
        return bar.close if bar is not None else None

    def open_value(self):
        return sum(p.value() for p in self.positions())

    def unrealized(self):
        return sum(p.unrealized(self.fee_per) for p in self.positions())

    def equity(self):
        return self.risk.equity(self.open_value())

    def emit(self, kind, text, bot=None, **extra):
        self._event_n += 1
        e = {"n": self._event_n, "t": self.now.isoformat() if self.now else None, "kind": kind, "text": text,
             "bot": bot.id if bot else None}
        e.update(extra)
        self.events.append(e)
        if len(self.events) > 300:
            del self.events[:100]
        if self.journal:
            self.journal.event(e)
        return e

    def _flash(self, bot, kind, direction, text):
        self._flash_id += 1
        bot.flash = {"id": self._flash_id, "kind": kind, "dir": direction, "text": text,
                     "t": self.now.isoformat() if self.now else None}

    # Counted for the report, not shown as events: a signal outside the entry
    # window, or any signal once the day is stopped (the vault already says so).
    QUIET = ("window", "profit brake", "loss brake", "stopped")
    EXIT_RETRY = timedelta(seconds=30)

    def _skip(self, bot, category, reason, direction=None, marker=True):
        self.skips[category] = self.skips.get(category, 0) + 1
        key = (bot.strategy_key, category)
        self.signals[key] = self.signals.get(key, 0) + 1
        if category in self.QUIET:
            return
        bot.last_note = reason
        if marker and bot.symbol in self.symbols and self.symbols[bot.symbol].bar is not None:
            st = self.symbols[bot.symbol]
            st.chart["markers"].append({"t": int(st.bar.ts.timestamp()), "kind": "skip", "dir": direction,
                                        "bot": bot.id, "price": st.bar.close, "reason": reason})
        self._flash(bot, "skip", direction, "skipped")
        self.emit("skip", "%s %s signal skipped: %s" % (bot.label, (direction or "").upper(), reason),
                  bot, category=category, dir=direction)

    # ── the day ────────────────────────────────────────────────────────────

    def start_day(self, day):
        self.day = day
        for st in self.symbols.values():
            st.new_day()
        for b in self.bots:
            b.new_day()
        self.risk.new_day(day)
        self.day_flags = {"profit": False, "loss": False}

    def end_day(self):
        """Book the day for the history strip. Anything still open (only
        possible if data stopped before 15:50) is noted, not invented."""
        if self.day is None or not self.trading:
            return
        if self.broker.name == "simulated":
            for b in self.bots:
                if b.position is not None:
                    self._book_at_mark(b, "data ended before 15:50; closed at the last bid")
        day_trades = [t for t in self.trades if t["date"] == self.day.isoformat()]
        self.history.append({
            "date": self.day.isoformat(),
            "pnl": round(self.risk.realized, 2),
            "trades": len(day_trades),
            "wins": sum(1 for t in day_trades if t["pnl"] > 0),
            "profitBrake": self.day_flags["profit"],
            "lossBrake": self.day_flags["loss"],
            "equity": round(self.equity(), 2),
        })

    # ── the minute ─────────────────────────────────────────────────────────

    def on_minute(self, ts, bars, trade=True, now=None):
        """Process the bars stamped `ts` (one per symbol; a missing symbol is
        simply skipped this minute). `trade=False` only warms up the lines
        (and lets the strategies see the bar, so a breakout that already
        happened before a restart is not taken again). `now` is the real
        time live; in a replay it is the moment the bar closed."""
        with self.lock:
            day = ts.astimezone(timeutil.ET).date()
            if day != self.day:
                self.end_day()
                self.start_day(day)
            for sym, bar in bars.items():
                if sym in self.symbols:
                    self.symbols[sym].update(bar)
            self.now = now or ts + timedelta(minutes=1)
            if not trade:
                for b in self.bots:
                    if b.symbol in bars:
                        b.charge = b.strategy.charge(self.symbols[b.symbol].market)
                        b.strategy.evaluate(self.symbols[b.symbol].market)
                return
            self.trading = True
            self.seq += 1
            self._poll_orders()
            self._mark()
            self._exits(bars)
            self._entries(bars)
            self._poll_orders()
            self._update_bot_states()

    def tick(self, now):
        """Between bars (live only): fills and timeouts."""
        with self.lock:
            self.now = now
            self._poll_orders()

    def kill(self, reason):
        with self.lock:
            if self.risk.killed:
                return
            if self.now is None:
                self.now = timeutil.now_et()
            self.risk.kill(reason)
            self.emit("brake", "EMERGENCY STOP: %s. Closing everything; no new trades until restart." % reason)
            self._flatten_all("emergency stop")
            self._poll_orders()
            self._update_bot_states()

    # ── marking and the loss brake ─────────────────────────────────────────

    def _mark(self):
        for p in self.positions():
            if p.state == "opening":
                continue
            q = self.options.quote(p.contract, self._price(p.symbol), self.now)
            if q is not None and q.bid is not None:
                p.mark_bid = q.bid
                p.mark_time = self.now
        hit = self.risk.mark(self.unrealized())
        if hit == "loss":
            self.day_flags["loss"] = True
            self.emit("brake", "LOSS BRAKE: the day is down $%.2f. Closing everything; no more trades today."
                      % -(self.risk.realized + self.risk.unrealized))
            self._flatten_all("loss brake")

    def _flatten_all(self, reason):
        for b in self.bots:
            p = b.position
            if p is None:
                continue
            if p.state == "opening" and p.order is not None and not p.order.done:
                self.broker.cancel(p.order)
            elif p.state == "open":
                self._submit_exit(b, reason)

    # ── exits ──────────────────────────────────────────────────────────────

    def _exits(self, bars):
        late = timeutil.clock_of(self.now) >= self.flatten_at
        ex = self.s["exits"]
        for b in self.bots:
            p = b.position
            if p is None or p.state != "open":
                continue
            if late:
                self._submit_exit(b, "15:50 flatten")
                continue
            st = self.symbols[b.symbol]
            if b.symbol not in bars:
                continue
            close = st.bar.close
            reason = None
            if ex["basis"] == "underlying":
                if p.direction == CALL:
                    if close <= p.stop:
                        reason = "stop (%.2f <= %.2f)" % (close, p.stop)
                    elif close >= p.target:
                        reason = "target (%.2f >= %.2f)" % (close, p.target)
                else:
                    if close >= p.stop:
                        reason = "stop (%.2f >= %.2f)" % (close, p.stop)
                    elif close <= p.target:
                        reason = "target (%.2f <= %.2f)" % (close, p.target)
            elif p.mark_bid is not None:
                if p.mark_bid >= p.target:
                    reason = "premium target (%.2f >= %.2f)" % (p.mark_bid, p.target)
            if reason is None and p.mark_bid is not None and p.entry_price:
                floor = p.entry_price * (1 - ex["premium_stop_pct"])
                if p.mark_bid <= floor:
                    reason = "premium stop (bid %.2f <= %.2f)" % (p.mark_bid, floor)
            if reason:
                self._submit_exit(b, reason)

    def _submit_exit(self, bot, reason):
        p = bot.position
        if p is None or p.state not in ("open", "closing"):
            return
        if p.state == "closing" and p.order is not None and not p.order.done:
            return
        quote = self.options.quote(p.contract, self._price(bot.symbol), self.now)
        p.exit_attempts += 1
        if p.exit_reason is None:
            p.exit_reason = reason
        cid = "tc-%s-%s-x%d" % (bot.id, self.now.strftime("%y%m%d%H%M"), p.exit_attempts)
        order = Order("sell", p.contract, p.open_qty, None, cid, self.now, quote=quote, purpose=reason)
        p.state = "closing"
        p.order = self.broker.submit(order)
        self._after_order(bot)

    # ── entries ────────────────────────────────────────────────────────────

    def _entries(self, bars):
        for b in self.bots:
            if b.symbol not in bars:
                continue
            st = self.symbols[b.symbol]
            m = st.market
            b.charge = b.strategy.charge(m)
            sig = b.strategy.evaluate(m)
            if sig is None:
                continue
            if not self._in_window(st):
                self._skip(b, "window", "outside the entry window", sig.direction)
                continue
            if not sig.act:
                self._skip(b, "chop", sig.reason, sig.direction)
                continue
            self.signals[(b.strategy_key, "signal")] = self.signals.get((b.strategy_key, "signal"), 0) + 1
            halted = self._halted()
            if halted:
                self._skip(b, halted, "day stopped: " + halted, sig.direction)
                continue
            self.emit("signal", "%s %s: %s" % (b.label, sig.direction.upper(), sig.reason), b, dir=sig.direction)
            self._try_entry(b, sig, st)

    def _halted(self):
        r = self.risk
        return "stopped" if r.killed else "loss brake" if r.loss_stopped else "profit brake" if r.profit_locked else None

    def _in_window(self, st):
        """Entries act on bars STAMPED first_entry..last_entry (9:45 is the
        first bar after the opening range)."""
        clock = timeutil.clock_of(st.bar.ts)
        return self.risk.first_entry <= clock <= self.risk.last_entry

    def _try_entry(self, bot, sig, st):
        if bot.position is not None:
            self._skip(bot, "slot taken", "this bot is already in a trade", sig.direction)
            return
        contract, quote = self.options.pick(bot.symbol, sig.direction, st.bar.close, self.now)
        if contract is None:
            self._skip(bot, "quote", "no contract: %s" % quote, sig.direction)
            return
        opt = self.s["options"]
        bad = check_quote(quote, self.now, opt["max_spread_pct"], opt["max_quote_age_sec"])
        if bad:
            self._skip(bot, "quote", "%s %s" % (contract.symbol, bad), sig.direction)
            return
        # A marketable limit two cents through the ask: it fills like a market
        # order on a normal quote and refuses to chase a quote that jumped.
        # Sizing uses this worst-case price, so the fill can only cost less.
        limit = round(quote.ask + 0.02, 2)
        ok = self.risk.approve(bot.id, bot.symbol, limit, self.now, self.positions(), self.open_value())
        if not ok:
            self._skip(bot, ok.category, ok.reason, sig.direction)
            return
        est = self.risk.contract_cost(limit, ok.qty)
        p = Position(bot, contract, ok.qty, est, quote, self.now, st.bar.close, st.market.atr)
        bot.position = p
        self.risk.reserve(bot.id, est, self.now)
        cid = "tc-%s-%s-e" % (bot.id, self.now.strftime("%y%m%d%H%M"))
        p.order = self.broker.submit(Order("buy", contract, ok.qty, limit, cid, self.now, quote=quote, purpose="entry"))
        self._flash(bot, "fire", sig.direction, "%s %s" % (sig.direction.upper(), contract.strike))
        self._after_order(bot)

    # ── orders ─────────────────────────────────────────────────────────────

    def _poll_orders(self):
        timeout = timedelta(seconds=self.s["alpaca"]["order_timeout_sec"])
        for b in self.bots:
            p = b.position
            if p is None:
                continue
            if p.order is not None:
                if not p.order.done:
                    self.broker.refresh(p.order)
                    if not p.order.done and self.now - p.order.submitted_at > timeout:
                        self.broker.cancel(p.order)
                        self.broker.refresh(p.order)
                self._after_order(b)
                p = b.position
            # An exit that was only partly filled is sent again at once for
            # what is still held; one the broker refused or cancelled is tried
            # again every 30 seconds, never in a tight loop.
            if p is not None and p.state == "closing":
                if p.order is None:
                    self._submit_exit(b, p.exit_reason or "retry")
                elif p.order.done and self.now - p.order.submitted_at >= self.EXIT_RETRY:
                    self._submit_exit(b, p.exit_reason or "retry")

    def _after_order(self, bot):
        p = bot.position
        if p is None or p.order is None:
            return
        o = p.order
        if p.state == "opening" and o.done:
            if o.filled_qty > 0:
                p.qty = o.filled_qty
                p.entry_price = o.avg_price
                p.entry_cost = o.avg_price * 100.0 * o.filled_qty + self.fee_per * o.filled_qty
                self.risk.entry_filled(p.est_cost, p.entry_cost)
                self._set_levels(p)
                p.state = "open"
                p.mark_bid = p.entry_quote.bid
                p.order = None
                late = None
                if self.risk.killed:
                    late = "emergency stop"
                elif self.risk.loss_stopped:
                    late = "loss brake"
                bot.day_trades += 1
                bot.all_trades += 1
                st = self.symbols[bot.symbol]
                if st.bar is not None:
                    st.chart["markers"].append({"t": int(st.bar.ts.timestamp()), "kind": "entry", "dir": p.direction,
                                                "bot": bot.id, "price": p.entry_underlying})
                bot.last_note = "bought %d %s @ %.2f" % (p.qty, p.contract.symbol, p.entry_price)
                self.emit("entry", "%s bought %d x %s %s %.0f @ $%.2f ($%.2f with fees). Stop %s, target %s."
                          % (bot.label, p.qty, p.contract.underlying, p.direction.upper(), p.contract.strike,
                             p.entry_price, p.entry_cost, self._lvl(p.stop), self._lvl(p.target)),
                          bot, dir=p.direction, cost=round(p.entry_cost, 2))
                if self.journal:
                    self.journal.save_open(self.positions())
                    self.journal.save_account(self.risk.ledger)
                if late:  # filled after the stop was pressed: out at once
                    self._submit_exit(bot, late)
            else:
                self.risk.entry_cancelled(p.est_cost)
                bot.position = None
                self._skip(bot, "order", "entry order %s: %s" % (o.status, o.message or "not filled"), p.direction)
            return
        if p.state == "closing" and o.done and o.filled_qty == 0:
            if not getattr(o, "reported", False):
                o.reported = True
                self.emit("error", "%s: sell order for %s %s (%s). Trying again in 30 s; if it keeps failing, "
                          "close it at the broker." % (bot.label, p.contract.symbol, o.status, o.message or "no reason given"), bot)
            return
        if p.state == "closing" and o.filled_qty > 0 and (o.done or o.filled_qty == o.qty):
            filled = o.filled_qty
            p.exit_filled += filled
            p.exit_value += o.avg_price * filled
            p.exit_proceeds += o.avg_price * 100.0 * filled - self.fee_per * filled
            p.order = None
            if p.open_qty <= 0:
                self._closed(bot)
            # else: the rest is re-sent by _poll_orders on the next pass

    def _book_at_mark(self, bot, reason):
        """Simulation only: the recorded data stopped with a position open
        (a gap in a CSV). Close it on paper at the last bid, so a day never
        carries an expiring option into the next one."""
        p = bot.position
        if p.state == "opening" or p.mark_bid is None:
            if p.state == "opening":
                self.risk.entry_cancelled(p.est_cost)
            bot.position = None
            return
        price = max(0.0, p.mark_bid - self.s["options"]["slippage"])
        qty = p.open_qty
        p.exit_reason = p.exit_reason or reason
        p.exit_filled += qty
        p.exit_value += price * qty
        p.exit_proceeds += price * 100.0 * qty - self.fee_per * qty
        p.order = None
        self._closed(bot)

    def _set_levels(self, p):
        ex = self.s["exits"]
        if ex["basis"] == "underlying":
            atr = p.atr or 0.0
            sign = 1 if p.direction == CALL else -1
            p.stop = round(p.entry_underlying - sign * ex["stop_atr"] * atr, 2)
            p.target = round(p.entry_underlying + sign * ex["target_atr"] * atr, 2)
        else:
            p.stop = round(p.entry_price * (1 - ex["premium_stop_pct"]), 2)
            p.target = round(p.entry_price * (1 + ex["premium_target_pct"]), 2)

    def _lvl(self, x):
        return "%.2f" % x if x is not None else "-"

    def _closed(self, bot):
        p = bot.position
        pnl = p.exit_proceeds - p.entry_cost
        avg_exit = p.exit_value / p.exit_filled if p.exit_filled else 0.0
        hit = self.risk.on_exit(bot.id, p.exit_proceeds, pnl, self.now)
        bot.day_pnl += pnl
        bot.all_pnl += pnl
        if pnl > 0:
            bot.day_wins += 1
        st = self.symbols[bot.symbol]
        if st.bar is not None:
            st.chart["markers"].append({"t": int(st.bar.ts.timestamp()), "kind": "exit", "dir": p.direction,
                                        "bot": bot.id, "price": st.bar.close, "pnl": round(pnl, 2)})
        trade = {
            "date": (self.day or self.now.astimezone(timeutil.ET).date()).isoformat(), "bot": bot.id, "symbol": bot.symbol, "strategy": bot.strategy_key,
            "dir": p.direction, "contract": p.contract.symbol, "qty": p.qty,
            "entryTime": p.entry_time.isoformat(), "entryPrice": p.entry_price,
            "entryUnderlying": p.entry_underlying, "exitTime": self.now.isoformat(),
            "exitPrice": round(avg_exit, 2), "exitUnderlying": self._price(bot.symbol),
            "cost": round(p.entry_cost, 2), "proceeds": round(p.exit_proceeds, 2),
            "pnl": round(pnl, 2), "reason": p.exit_reason,
        }
        self.trades.append(trade)
        if self.journal:
            self.journal.trade(trade)
        bot.position = None
        if self.journal:
            self.journal.save_open(self.positions())
            self.journal.save_account(self.risk.ledger)
        sign = "+" if pnl >= 0 else "-"
        self._flash(bot, "win" if pnl > 0 else "loss", p.direction, "%s$%.0f" % (sign, abs(pnl)))
        bot.last_note = "closed %s: %s$%.2f" % (p.exit_reason, sign, abs(pnl))
        self.emit("exit", "%s sold %s @ $%.2f (%s): %s$%.2f" % (bot.label, p.contract.symbol, avg_exit,
                                                                 p.exit_reason, sign, abs(pnl)),
                  bot, dir=p.direction, pnl=round(pnl, 2))
        if hit == "profit":
            self.day_flags["profit"] = True
            self.emit("brake", "PROFIT LOCKED: +$%.2f realized today. No new trades until tomorrow." % self.risk.realized)

    # ── what the dashboard shows ───────────────────────────────────────────

    def _update_bot_states(self):
        cooldown = timedelta(minutes=self.s["signals"]["cooldown_minutes"])
        stopped = self.risk.killed or self.risk.loss_stopped or self.risk.profit_locked
        for b in self.bots:
            p = b.position
            st = self.symbols[b.symbol]
            if p is not None:
                b.state = {"opening": "opening", "open": "in-trade", "closing": "closing"}[p.state]
            elif stopped:
                b.state = "halted"
            elif st.market is None or st.market.atr is None or (b.strategy_key == "ema50" and st.market.ema50 is None):
                b.state = "warming"
            elif b.strategy_key == "orb15" and not st.market.or_complete:
                b.state = "forming range"
            else:
                last = self.risk.last_action.get(b.id)
                if last is not None and self.now - last < cooldown:
                    b.state = "cooldown"
                elif b.charge[1] >= 0.5:
                    b.state = "charging"
                else:
                    b.state = "watching"

    def banner(self):
        if self.source == "synthetic":
            return ("SYNTHETIC PRICES - a random walk with no edge by design. This shows how the bots "
                    "behave and what trading costs; it says nothing about whether they make money.")
        if self.source == "csv":
            return ("BACKTEST on recorded stock prices; option prices are Black-Scholes estimates, "
                    "not real quotes. Paper money only.")
        return "ALPACA PAPER ACCOUNT - simulated orders, real market data. No real money moves."

    def snapshot(self):
        with self.lock:
            ov = self.open_value()
            positions = self.positions()
            acct = self.risk.ledger.to_dict()
            acct.update({"equity": round(self.risk.equity(ov), 2), "openValue": round(ov, 2),
                         "dayRealized": round(self.risk.realized, 2),
                         "dayUnrealized": round(self.unrealized(), 2),
                         "allTime": round(self.risk.equity(ov) - self.risk.ledger.starting_cash, 2)})
            bots = []
            for b in self.bots:
                bots.append({
                    "id": b.id, "symbol": b.symbol, "strategy": b.strategy_key, "label": b.label,
                    "state": getattr(b, "state", "warming"),
                    "charge": {"dir": b.charge[0], "pct": round(b.charge[1], 3)},
                    "dayPnl": round(b.day_pnl + (b.position.unrealized(self.fee_per) if b.position else 0.0), 2),
                    "dayRealized": round(b.day_pnl, 2), "dayTrades": b.day_trades, "dayWins": b.day_wins,
                    "allPnl": round(b.all_pnl, 2), "allTrades": b.all_trades,
                    "position": b.position.to_dict(self.fee_per) if b.position else None,
                    "flash": b.flash, "note": b.last_note,
                })
            return {
                "seq": self.seq, "mode": self.mode, "source": self.source, "banner": self.banner(),
                "broker": self.broker.name, "optionPrices": self.options.source,
                "clock": self.now.isoformat() if self.now else None,
                "day": self.day.isoformat() if self.day else None,
                "account": acct,
                "risk": self.risk.to_dict(positions, ov),
                "symbols": {sym: st.to_dict() for sym, st in self.symbols.items()},
                "bots": bots,
                "events": self.events[-40:],
                "history": self.history[-30:],
            }

    def chart(self, symbol):
        with self.lock:
            st = self.symbols.get(symbol)
            if st is None:
                return None
            m = st.market
            return {"symbol": symbol, "day": self.day.isoformat() if self.day else None,
                    "bars": list(st.chart["bars"]), "vwap": list(st.chart["vwap"]),
                    "ema50": list(st.chart["ema50"]), "markers": list(st.chart["markers"]),
                    "orHigh": m.or_high if m else None, "orLow": m.or_low if m else None,
                    "orComplete": bool(m and m.or_complete)}
