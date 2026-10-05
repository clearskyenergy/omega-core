"""Where orders go. Two brokers answer the same three calls:

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

  submit(order)   send a buy or sell; returns the order with a status
  refresh(order)  ask what happened to it since
  cancel(order)   withdraw what has not filled

SimBroker fills against the simulated quote at once: buys at the ask, sells
at the bid, plus slippage. AlpacaBroker (alpaca.py) sends the same order to
Alpaca's PAPER endpoint and reports fills as they arrive. The engine cannot
tell them apart, which is the point: the code that is backtested is the code
that paper-trades.
"""

import itertools

NEW = "new"
FILLED = "filled"
PARTIAL = "partially_filled"
CANCELED = "canceled"
REJECTED = "rejected"

DONE = (FILLED, CANCELED, REJECTED)


class Order:
    def __init__(self, side, contract, qty, limit, client_id, submitted_at, quote=None, purpose=""):
        self.side = side              # "buy" or "sell"
        self.contract = contract      # options.Contract
        self.qty = qty
        self.limit = limit            # per-share limit price (None = market)
        self.client_id = client_id    # ours; the broker refuses a duplicate
        self.submitted_at = submitted_at
        self.quote = quote
        self.purpose = purpose        # "entry" or the exit reason
        self.id = None                # the broker's id
        self.status = NEW
        self.filled_qty = 0
        self.avg_price = None         # per share
        self.message = ""

    @property
    def done(self):
        return self.status in DONE

    def to_dict(self):
        return {"side": self.side, "contract": self.contract.symbol, "qty": self.qty,
                "limit": self.limit, "clientId": self.client_id, "status": self.status,
                "filledQty": self.filled_qty, "avgPrice": self.avg_price}


class SimBroker:
    """Fills every marketable order immediately against the quote it was
    given. `slippage` is paid per share on every fill."""

    name = "simulated"

    def __init__(self, settings):
        self.slippage = settings["options"]["slippage"]
        self._ids = itertools.count(1)
        self.seen = set()

    def submit(self, order):
        order.id = "sim-%d" % next(self._ids)
        if order.client_id in self.seen:
            order.status = REJECTED
            order.message = "duplicate client order id"
            return order
        self.seen.add(order.client_id)
        q = order.quote
        if q is None:
            order.status = REJECTED
            order.message = "no quote"
            return order
        if order.side == "buy":
            price = round(q.ask + self.slippage, 2)
            if order.limit is not None and price > order.limit + 1e-9:
                price = order.limit if q.ask <= order.limit else None
        else:
            price = round(max(0.0, q.bid - self.slippage), 2)
            if order.limit is not None and price < order.limit - 1e-9:
                price = order.limit if q.bid >= order.limit else None
        if price is None:
            order.status = CANCELED
            order.message = "limit not marketable"
            return order
        order.status = FILLED
        order.filled_qty = order.qty
        order.avg_price = price
        return order

    def refresh(self, order):
        return order

    def cancel(self, order):
        if not order.done:
            order.status = CANCELED
        return order
