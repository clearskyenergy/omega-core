"""The ONE risk controller every bot asks before it spends money.

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Nine bots share one account. Without a referee, five of them would each see
"$350 available" and try to spend it on the same move. So no bot places an
order on its own: it asks `RiskController.approve()`, which checks, in order:

  1. emergency stop                  (the dashboard button)
  2. daily loss brake                (the day is down `daily_loss_brake`)
  3. daily profit brake              (realized P&L reached `daily_profit_brake`)
  4. trades per day                  (max_trades_per_day)
  5. this bot's cooldown             (cooldown_minutes after its last entry/exit)
  6. open positions, in total and on this symbol
  7. money: one contract must fit under max_cost_per_trade_pct of equity AND
     inside the cash that is actually spendable today (settled cash in a cash
     account)

(The entry window, first_entry..last_entry, is checked by the engine before
it asks, because it is a property of the bar, not of the account.)

The Ledger is the bot's own book of the account. It is what sizes trades,
even on a broker paper account with a much larger balance.
"""

from datetime import timedelta

from . import timeutil


class Ledger:
    """Cash, and when sale proceeds become spendable.

    Cash account: an option sale settles the next trading day (T+1). Spending
    unsettled money and selling before it settles is a good-faith violation,
    so the bots simply never spend it. Margin account: proceeds are usable at
    once (options are still paid in full)."""

    def __init__(self, starting_cash, account_type):
        self.starting_cash = float(starting_cash)
        self.account_type = account_type
        self.cash = float(starting_cash)
        self.settled = float(starting_cash)
        self.pending = []   # [(settle_date, amount)]
        self.reserved = 0.0  # held for an entry order the broker has not filled yet

    @property
    def unsettled(self):
        return sum(a for _, a in self.pending)

    def spendable(self):
        free = self.settled if self.account_type == "cash" else self.cash
        return free - self.reserved

    def pay(self, amount):
        self.cash -= amount
        self.settled -= amount

    def receive(self, amount, trade_date):
        self.cash += amount
        if self.account_type == "cash":
            self.pending.append((timeutil.next_trading_day(trade_date), amount))
        else:
            self.settled += amount

    def settle(self, today):
        keep = []
        for settle_date, amount in self.pending:
            if settle_date <= today:
                self.settled += amount
            else:
                keep.append((settle_date, amount))
        self.pending = keep

    def to_state(self):
        return {"startingCash": self.starting_cash, "type": self.account_type, "cash": self.cash,
                "settled": self.settled, "pending": [[d.isoformat(), a] for d, a in self.pending]}

    def load_state(self, state):
        """Carry the paper account across restarts (journal/account.json)."""
        from datetime import date
        self.starting_cash = float(state["startingCash"])
        self.cash = float(state["cash"])
        self.settled = float(state["settled"])
        self.pending = [(date.fromisoformat(d), float(a)) for d, a in state.get("pending", [])]

    def to_dict(self):
        return {"type": self.account_type, "start": round(self.starting_cash, 2),
                "cash": round(self.cash, 2), "settled": round(self.settled, 2),
                "unsettled": round(self.unsettled, 2), "reserved": round(self.reserved, 2)}


class Decision:
    def __init__(self, ok, reason="", qty=0, category=""):
        self.ok = ok
        self.reason = reason
        self.qty = qty
        self.category = category   # short key for the backtest's skip table

    def __bool__(self):
        return self.ok


class RiskController:
    def __init__(self, settings):
        self.s = settings
        self.r = settings["risk"]
        self.sig = settings["signals"]
        self.costs = settings["costs"]
        self.ledger = Ledger(settings["account"]["starting_cash"], settings["account"]["type"])
        self.first_entry = timeutil.parse_hhmm(self.sig["first_entry"])
        self.last_entry = timeutil.parse_hhmm(self.sig["last_entry"])
        self.killed = False
        self.kill_reason = ""
        self.day = None
        self.new_day(None)

    # ── the day ────────────────────────────────────────────────────────────

    def new_day(self, day):
        self.day = day
        self.realized = 0.0
        self.unrealized = 0.0
        self.trades_today = 0
        self.profit_locked = False
        self.loss_stopped = False
        self.last_action = {}   # bot id -> datetime of its last entry or exit
        if day is not None:
            self.ledger.settle(day)

    # ── what the engine reports ────────────────────────────────────────────

    def fees(self, qty):
        return (self.costs["commission_per_contract"] + self.costs["fees_per_contract"]) * qty

    def contract_cost(self, ask, qty=1):
        """Cash out the door to buy: premium x 100 per contract, plus fees."""
        return ask * 100.0 * qty + self.fees(qty)

    def reserve(self, bot_id, est_cost, now):
        """An entry order is going to the broker: hold its cash, count the
        trade and start the bot's cooldown now, so a second bot cannot spend
        the same money while the order is working."""
        self.ledger.reserved += est_cost
        self.trades_today += 1
        self.last_action[bot_id] = now

    def entry_filled(self, est_cost, actual_cost):
        self.ledger.reserved = max(0.0, self.ledger.reserved - est_cost)
        self.ledger.pay(actual_cost)

    def entry_cancelled(self, est_cost):
        """Nothing filled: release the cash; it was not a trade."""
        self.ledger.reserved = max(0.0, self.ledger.reserved - est_cost)
        self.trades_today = max(0, self.trades_today - 1)

    def on_exit(self, bot_id, proceeds, pnl, now):
        self.ledger.receive(proceeds, now.astimezone(timeutil.ET).date())
        self.realized += pnl
        self.last_action[bot_id] = now
        if self.realized >= self.r["daily_profit_brake"] and not self.profit_locked:
            self.profit_locked = True
            return "profit"
        return None

    def mark(self, unrealized):
        """Called every bar with the open positions' P&L at the bid. Returns
        "loss" the first time the day's total crosses the loss brake."""
        self.unrealized = unrealized
        if not self.loss_stopped and self.realized + unrealized <= -self.r["daily_loss_brake"]:
            self.loss_stopped = True
            return "loss"
        return None

    def kill(self, reason):
        self.killed = True
        self.kill_reason = reason

    def equity(self, open_value):
        """Cash plus what the open contracts would sell for at the bid."""
        return self.ledger.cash + open_value

    def budget(self, open_value):
        return self.equity(open_value) * self.r["max_cost_per_trade_pct"]

    # ── the one question every bot asks ────────────────────────────────────

    def approve(self, bot_id, symbol, ask, now, open_positions, open_value):
        """May `bot_id` buy a contract on `symbol` at `ask`? Decides the size."""
        if self.killed:
            return Decision(False, "emergency stop: " + self.kill_reason, category="stopped")
        if self.loss_stopped:
            return Decision(False, "loss brake hit (-$%.0f today)" % self.r["daily_loss_brake"], category="loss brake")
        if self.profit_locked:
            return Decision(False, "profit locked (+$%.0f today)" % self.r["daily_profit_brake"], category="profit brake")
        if self.trades_today >= self.r["max_trades_per_day"]:
            return Decision(False, "max %d trades a day" % self.r["max_trades_per_day"], category="trade limit")
        last = self.last_action.get(bot_id)
        if last is not None and now - last < timedelta(minutes=self.sig["cooldown_minutes"]):
            return Decision(False, "cooling down", category="cooldown")
        if len(open_positions) >= self.r["max_open_positions"]:
            return Decision(False, "account already has %d open trade(s)" % len(open_positions), category="slot taken")
        same = [p for p in open_positions if p.symbol == symbol]
        if len(same) >= self.r["max_open_per_symbol"]:
            return Decision(False, "already in a %s trade" % symbol, category="slot taken")
        one = self.contract_cost(ask, 1)
        cap = self.budget(open_value)
        cash = self.ledger.spendable()
        if one > cap:
            return Decision(False, "one contract costs $%.0f, limit is $%.0f (%.0f%% of $%.0f)"
                            % (one, cap, 100 * self.r["max_cost_per_trade_pct"], self.equity(open_value)),
                            category="can't afford")
        if one > cash:
            what = "settled cash" if self.ledger.account_type == "cash" else "cash"
            return Decision(False, "one contract costs $%.0f, only $%.0f %s" % (one, cash, what), category="can't afford")
        qty = 1
        while (qty < self.r["max_contracts_per_trade"]
               and self.contract_cost(ask, qty + 1) <= min(cap, cash)):
            qty += 1
        return Decision(True, "approved %d contract(s), $%.0f" % (qty, self.contract_cost(ask, qty)), qty=qty)

    def to_dict(self, open_positions, open_value):
        return {
            "profitBrake": self.r["daily_profit_brake"],
            "lossBrake": self.r["daily_loss_brake"],
            "profitLocked": self.profit_locked,
            "lossStopped": self.loss_stopped,
            "killed": self.killed,
            "killReason": self.kill_reason,
            "tradesToday": self.trades_today,
            "maxTradesPerDay": self.r["max_trades_per_day"],
            "openPositions": len(open_positions),
            "maxOpenPositions": self.r["max_open_positions"],
            "budgetPerTrade": round(self.budget(open_value), 2),
            "spendable": round(self.ledger.spendable(), 2),
        }
