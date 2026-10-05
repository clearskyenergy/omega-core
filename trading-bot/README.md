# Trading City

Paper-trading bots for 1-day-to-expiration (1DTE) options on SPY, QQQ and IWM,
with a city dashboard: one tower per bot, a vault for the account, beams when
a signal is building. It is the system from the video, with every rule the
video left vague written down, and one shared risk controller so nine bots
cannot spend the same money twice.

**Nothing here can move real money.** The simulator has no broker at all, and
the Alpaca connector refuses every address except Alpaca's *paper* (practice)
endpoint. Going live is deliberately not built (see the end of this file).

**Nothing here promises a profit either.** A good day in a video is not
evidence. Bought options can lose everything paid for them, and a stop is a
plan, not a guaranteed limit. The point of this project is to find out, with
fake money first, whether these rules make money after costs.

---

## Start in two minutes

You need Python 3.10 or newer. Nothing else to install: the bot uses only
Python's standard library.

- **Windows:** install Python from python.org and tick *Add python.exe to
  PATH*. In the commands below, type `py` instead of `python3`.
- **Mac:** `python3` is usually there already; otherwise install it from
  python.org.

```bash
cd trading-bot
python3 run.py demo
```

Your browser opens `http://127.0.0.1:8765`. The city runs on **made-up
prices**, with a **$350** paper account, at 4 market minutes per second (a
whole trading day in about 100 seconds). Press Ctrl+C in the terminal to stop.

Other things to try:

```bash
python3 run.py demo --cash 7000        # the account size from the video
python3 run.py demo --speed 1          # slower, one market minute per second
python3 run.py backtest --days 60      # 60 made-up days at once, with a report
python3 run.py record --compare 7000   # a replay file the page can play with no server
```

To look at the city from your phone on the same Wi-Fi, start it with
`--host 0.0.0.0` and open `http://<your computer's address>:8765` on the
phone. (It listens only on your own computer unless you do that.)

---

## What you are looking at

| On screen | What it means |
| --- | --- |
| Three districts | One per symbol: SPY, QQQ, IWM. |
| Three towers in each | One bot per signal: **VWAP**, **EMA50**, **ORB15** (tallest). |
| Billboard over a district | Price, and each bot's state and profit or loss today. |
| Green / red beam | A call / put signal is close to firing. Brighter is closer. |
| Flash and a tag | The bot fired. An amber ring means the signal was **skipped** by the risk rules, and the feed says why. |
| Green or red windows | The bot is holding a call or a put. |
| Coin to the vault | A winning trade paid out. |
| The vault | The account: equity, today's result, the profit lock and the loss brake. |
| Day by day | Each day's result, and whether the profit lock or loss brake ended it. |
| Chart | 1-minute candles with VWAP, the 50 EMA, the opening range and every trade. Tap a tower or a leaderboard row. |
| Emergency stop | Tap twice: closes every position and stops new trades until restart. |

---

## The rules, written down

All of these live in `tradebot/config.py`, each with its reason. Change them
by copying `settings.example.json` to `settings.json`; anything you leave out
keeps its default.

**Signals** (checked on each 1-minute close, from the 9:45 bar to the 15:30 bar):

| Bot | Buys a call when | Buys a put when |
| --- | --- | --- |
| VWAP | a candle closes above VWAP after closing at or below it | the reverse |
| EMA50 | a candle closes above the 50 EMA after closing at or below it | the reverse |
| ORB15 | a candle closes above the high of the first 15 minutes (once a day) | below the low (once a day) |

- **Chop filter:** a VWAP cross is skipped when the 9 and 21 EMAs are
  squeezed, meaning their gap is under 0.15 x ATR (`squeeze_atr_frac`).
- **Cooldown:** 5 minutes per bot after each entry and each exit.
- **Contract:** the at-the-money strike, expiring the next trading day. The
  quote must be fresh (under 20 s) and its spread under 12% of the price.
- **Exits:** stop at 1 x ATR against the trade, target at 1.5 x ATR in its
  favour, both measured on the stock itself at entry. Backstop: out if the
  option's bid falls 40%. Everything is closed at 15:50; nothing is held
  overnight.

**The shared risk controller** (`tradebot/risk.py`). Every bot asks it before
buying. It refuses, and the feed says which rule refused:

1. after the emergency stop;
2. once the day is down $60 (the **loss brake** also closes everything);
3. once the day has made $40 (the **profit lock**; open trades still finish);
4. after 6 trades in a day;
5. during the bot's cooldown;
6. while another trade is open (one at a time on $350), or another on the same symbol;
7. when one contract costs more than 45% of the account, or more than the
   cash that has *settled*.

---

## What $350 actually means

Run the demo and watch the feed. You will see this, and it is the most
important thing the project shows:

- **One at-the-money 1DTE contract costs roughly $100-$200 on IWM and
  $230-$550 on SPY and QQQ** (the simulator's estimates; real prices move
  with volatility). On $350 only IWM is usually affordable, so six of the
  nine towers mostly report "can't afford". There is no smaller unit to buy.
- **One trade is 35-45% of the account.** A large account in the video risked
  about 4% a trade. On $350 that number does not exist.
- **A couple of losses lock you out.** In one 60-day simulated run, the $350
  account lost about $130 in its first four days, could no longer afford an
  IWM contract, and sat out the other 56 days. Losing less than everything is
  not the same as being able to keep trading.
- **Cash accounts wait for settlement.** Money from selling an option is
  usable the next trading day (T+1). The bots never spend unsettled cash,
  because doing so and then selling causes a good-faith violation.

About the old $25,000 day-trading rule: Alpaca's documentation (updated
April 2026) says FINRA replaced the "pattern day trader" rule with an
intraday margin rule, so the 4-trades-in-5-days limit and the $25,000
minimum no longer apply. Each broker can still set its own requirements, so
ask Fidelity what applies to your account before relying on it.

## Your accounts

- **Fidelity** has no public API for a personal account, so no bot can place
  trades there. Buying options there also needs options approval on the account.
- **Coinbase** trades crypto, not these options.
- **Alpaca** has a free paper account with options enabled by default and an
  API. That is what the `paper` mode uses. You do not need to move any money
  to use it.

---

## Step by step, from here

1. **Watch the demo** until the rules make sense. The made-up prices are a
   random walk, so no strategy has an edge in them; read the result as "what
   trading costs do", never as how the strategy would do in a real market.
2. **Backtest on real prices.** Make a free Alpaca account, open the *paper*
   account, create API keys, then:
   ```bash
   cp env.example .env          # Windows: copy env.example .env
   # put your PAPER keys in .env; never commit it, never paste keys into a chat
   python3 run.py fetch --days 30
   python3 run.py backtest --data data
   ```
   The stock bars are real; the option prices are still estimates
   (Black-Scholes from an assumed volatility), not the real quotes of the day.
3. **Paper trade forward** during market hours (9:30-16:00 New York):
   ```bash
   python3 run.py paper
   ```
   Real market data, Alpaca's simulated fills, the city on your screen. The
   bot sizes trades from $350 even though Alpaca's paper account starts much
   larger. Every trade goes to `journal/trades.csv`; if you stop and restart,
   it picks its open positions back up from `journal/`. To keep it running
   all day without your computer, people use a small Linux VPS.
4. **Judge it before any real money.** A fair bar: at least 60 trading days of
   paper results, profitable *after* costs, with a worst drawdown you could
   live through, and each bot's numbers looked at separately. If it does not
   clear that bar, the honest answer is that the rules do not work yet.

---

## Files

```
run.py                 every command starts here
settings.example.json  copy to settings.json to change a rule
env.example            copy to .env for Alpaca paper keys (never commit .env)
tradebot/
  config.py            every rule and its default
  indicators.py        EMA, ATR, VWAP, opening range
  strategies.py        the three signals and the chop filter
  options.py           contract choice, quote checks, Black-Scholes for the simulator
  risk.py              the shared risk controller and the cash ledger
  engine.py            runs the bots minute by minute; orders, exits, brakes
  broker.py            the simulated broker
  alpaca.py            Alpaca paper: data, orders, the live loop, restart pickup
  market.py            made-up prices, and CSV price files
  backtest.py          the replay loop and the report
  journal.py           trades.csv, events.jsonl, open positions, the paper ledger
  server.py            the dashboard's web server
dashboard/index.html   the city
tests/                 python3 -m unittest discover -s tests
```

## Tests

```bash
python3 -m unittest discover -s tests
```

They cover the indicators, the signals, option pricing, every risk rule,
full simulated days (a target exit, the loss brake, the 15:50 close, the
emergency stop, partial fills, an order that never fills), the dashboard
server, and the Alpaca connector against a local stand-in for Alpaca's API.
That stand-in follows Alpaca's documentation; the connector has not yet run
against Alpaca's real servers.

## Not built yet

- **Live trading.** On purpose. It comes after paper results are reviewed.
- **Backtests on real option quotes.** Backtests price options with
  Black-Scholes. Alpaca sells historical option data; using it is the next
  step for the validation engine.
- **Streaming data.** The paper loop polls 1-minute bars every 5 seconds
  (fine for 1-minute rules, not for anything faster).
- **VWAP on the full market's volume.** The free feed (IEX) carries part of
  the volume, so VWAP can differ slightly from your charting app's.
- **Alerts** (text or email when a brake trips or an order fails).
- **Half days and trading halts** beyond what Alpaca's market clock reports.
