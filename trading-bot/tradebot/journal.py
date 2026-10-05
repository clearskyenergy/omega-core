"""The written record: every trade, every event, and what is open right now.

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

  journal/trades.csv           one row per closed trade (open it in Excel)
  journal/events.jsonl         every signal, skip, fill and brake, one per line
  journal/open_positions.json  what the bots hold now, with each one's stop and
                               target, so a restart can pick them back up
  journal/account.json         the paper account's cash and settlement dates
"""

import csv
import json
import os

TRADE_FIELDS = ["date", "bot", "symbol", "strategy", "dir", "contract", "qty", "entryTime", "entryPrice",
                "entryUnderlying", "exitTime", "exitPrice", "exitUnderlying", "cost", "proceeds", "pnl", "reason"]


class Journal:
    def __init__(self, folder):
        self.folder = folder
        os.makedirs(folder, exist_ok=True)
        self.trades_path = os.path.join(folder, "trades.csv")
        self.events_path = os.path.join(folder, "events.jsonl")
        self.open_path = os.path.join(folder, "open_positions.json")
        self.account_path = os.path.join(folder, "account.json")

    def trade(self, row):
        new = not os.path.exists(self.trades_path)
        with open(self.trades_path, "a", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=TRADE_FIELDS, extrasaction="ignore")
            if new:
                w.writeheader()
            w.writerow(row)

    def event(self, e):
        with open(self.events_path, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(e) + "\n")

    def save_open(self, positions):
        rows = []
        for p in positions:
            if p.state == "opening":
                continue
            rows.append({"bot": p.bot_id, "contract": p.contract.to_dict(), "qty": p.open_qty,
                         "entryPrice": p.entry_price, "entryCost": p.entry_cost,
                         "entryTime": p.entry_time.isoformat(), "entryUnderlying": p.entry_underlying,
                         "atr": p.atr, "stop": p.stop, "target": p.target})
        self._write(self.open_path, rows)

    def _write(self, path, data):
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2)
        os.replace(tmp, path)

    def save_account(self, ledger):
        self._write(self.account_path, ledger.to_state())

    def load_account(self):
        if not os.path.exists(self.account_path):
            return None
        with open(self.account_path, encoding="utf-8") as fh:
            return json.load(fh)

    def load_open(self):
        if not os.path.exists(self.open_path):
            return []
        with open(self.open_path, encoding="utf-8") as fh:
            return json.load(fh)
