"""Indicators, strategies and option pricing.

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
"""

import unittest
from datetime import date, datetime, timedelta

import helpers  # noqa: F401  (puts the package on the path)
from tradebot import options, timeutil
from tradebot.indicators import ATR, EMA, VWAP, OpeningRange
from tradebot.strategies import CALL, PUT, Market, make


class Indicators(unittest.TestCase):
    def test_ema_seeds_with_the_simple_average_then_smooths(self):
        e = EMA(3)
        self.assertIsNone(e.update(1))
        self.assertIsNone(e.update(2))
        self.assertAlmostEqual(e.update(3), 2.0)
        self.assertAlmostEqual(e.update(4), 4 * 0.5 + 2.0 * 0.5)

    def test_atr_uses_true_range_and_wilder_smoothing(self):
        a = ATR(2)
        a.update(10, 9, 9.5)               # TR 1.0
        self.assertAlmostEqual(a.update(12, 11, 11.5), 1.75)  # TR max(1, 2.5, 1.5) = 2.5 -> mean 1.75
        self.assertAlmostEqual(a.update(11.6, 11.4, 11.5), (1.75 * 1 + 0.2) / 2)

    def test_vwap_weights_typical_price_by_volume_and_resets(self):
        v = VWAP()
        v.update(11, 9, 10, 100)
        self.assertAlmostEqual(v.update(21, 19, 20, 300), (10 * 100 + 20 * 300) / 400)
        v.reset()
        self.assertAlmostEqual(v.update(6, 4, 5, 10), 5)

    def test_opening_range_is_the_first_15_bars_and_completes_on_the_16th(self):
        r = OpeningRange(15)
        for m in range(15):
            self.assertFalse(r.update(m, 100 + m, 90 - m))
        self.assertTrue(r.update(15, 500, 1))
        self.assertEqual((r.high, r.low), (114, 76))


def market(**kw):
    base = dict(close=100, prev_close=100, vwap=100, prev_vwap=100, ema9=100.5, ema21=100,
                ema50=100, prev_ema50=100, atr=1.0, or_high=101, or_low=99, or_complete=True, minute=30)
    base.update(kw)
    return Market(**base)


class Strategies(unittest.TestCase):
    def setUp(self):
        self.s = helpers.settings()

    def test_a_close_across_vwap_is_a_call_or_a_put(self):
        v = make("vwap", self.s)
        self.assertEqual(v.evaluate(market(prev_close=99.9, close=100.2)).direction, CALL)
        self.assertEqual(v.evaluate(market(prev_close=100.1, close=99.8)).direction, PUT)
        self.assertIsNone(v.evaluate(market(prev_close=100.2, close=100.4)))  # already above

    def test_squeezed_emas_turn_a_vwap_cross_into_a_skip(self):
        s = helpers.settings(signals={"squeeze_atr_frac": 0.15})
        v = make("vwap", s)
        sig = v.evaluate(market(prev_close=99.9, close=100.2, ema9=100.05, ema21=100.0, atr=1.0))
        self.assertFalse(sig.act)
        self.assertTrue(sig.reason.startswith("chop"))
        ok = v.evaluate(market(prev_close=99.9, close=100.2, ema9=100.3, ema21=100.0, atr=1.0))
        self.assertTrue(ok.act)

    def test_the_squeeze_filter_does_not_apply_to_ema50_by_default(self):
        s = helpers.settings(signals={"squeeze_atr_frac": 0.15})
        e = make("ema50", s)
        sig = e.evaluate(market(prev_close=99.9, close=100.2, ema9=100.0, ema21=100.0))
        self.assertTrue(sig.act)

    def test_opening_range_breaks_once_per_side(self):
        o = make("orb15", self.s)
        self.assertIsNone(o.evaluate(market(or_complete=False, prev_close=100, close=105)))
        self.assertEqual(o.evaluate(market(prev_close=100.5, close=101.2)).direction, CALL)
        self.assertIsNone(o.evaluate(market(prev_close=100.5, close=101.2)))   # second time up: ignored
        self.assertEqual(o.evaluate(market(prev_close=99.5, close=98.8)).direction, PUT)
        o.new_day()
        self.assertEqual(o.evaluate(market(prev_close=100.5, close=101.2)).direction, CALL)

    def test_charge_is_closeness_to_the_trigger_in_atrs(self):
        v = make("vwap", self.s)
        d, pct = v.charge(market(close=99.6, vwap=100, atr=1.0))
        self.assertEqual(d, CALL)
        self.assertAlmostEqual(pct, 0.6)
        self.assertEqual(v.charge(market(close=98.0, vwap=100, atr=1.0))[1], 0.0)


class Options(unittest.TestCase):
    def test_occ_symbol(self):
        self.assertEqual(options.occ_symbol("QQQ", date(2026, 10, 5), CALL, 754), "QQQ261005C00754000")
        self.assertEqual(options.occ_symbol("IWM", date(2026, 10, 2), PUT, 241.5), "IWM261002P00241500")

    def test_at_the_money_rounds_to_the_listed_strike(self):
        self.assertEqual(options.at_the_money(753.62, 1.0), 754.0)
        self.assertEqual(options.at_the_money(241.2, 0.5), 241.0)

    def test_black_scholes_obeys_put_call_parity(self):
        s, k, t, v, r = 250.0, 251.0, 1.5 / 365, 0.22, 0.04
        import math
        c = options.black_scholes(CALL, s, k, t, v, r)
        p = options.black_scholes(PUT, s, k, t, v, r)
        self.assertAlmostEqual(c - p, s - k * math.exp(-r * t), places=6)
        self.assertEqual(options.black_scholes(CALL, 255, 250, 0, 0.2), 5)

    def test_quote_checks_refuse_wide_stale_and_empty_quotes(self):
        now = datetime(2026, 10, 1, 10, 0, tzinfo=timeutil.ET)
        Q = options.Quote
        self.assertIsNone(options.check_quote(Q(1.00, 1.04, now), now, 0.12, 20))
        self.assertIn("spread", options.check_quote(Q(1.00, 1.30, now), now, 0.12, 20))
        self.assertIn("stale", options.check_quote(Q(1.00, 1.04, now - timedelta(seconds=60)), now, 0.12, 20))
        self.assertEqual(options.check_quote(Q(0, 0.05, now), now, 0.12, 20), "no bid")
        self.assertEqual(options.check_quote(None, now, 0.12, 20), "no quote")

    def test_1dte_skips_the_weekend_and_holidays(self):
        sim = options.SimOptions(helpers.settings())
        fri = datetime(2026, 10, 2, 10, 0, tzinfo=timeutil.ET)
        self.assertEqual(sim.expiry_for(fri), date(2026, 10, 5))
        wed = datetime(2026, 11, 25, 10, 0, tzinfo=timeutil.ET)   # Thanksgiving is 11/26
        self.assertEqual(sim.expiry_for(wed), date(2026, 11, 27))

    def test_sim_quotes_are_penny_priced_with_a_spread(self):
        sim = options.SimOptions(helpers.settings())
        now = datetime(2026, 10, 1, 10, 0, tzinfo=timeutil.ET)
        c, q = sim.pick("IWM", CALL, 250.2, now)
        self.assertEqual(c.strike, 250.0)
        self.assertEqual(c.symbol, "IWM261002C00250000")
        self.assertGreater(q.ask, q.bid)
        self.assertEqual(round(q.bid, 2), q.bid)
        self.assertTrue(0.5 < q.mid < 3.0, q.mid)   # a 1DTE ATM IWM option is roughly a dollar or two


class Time(unittest.TestCase):
    def test_new_york_offset_follows_daylight_saving(self):
        self.assertEqual(timeutil.at(date(2026, 10, 1), timeutil.OPEN).utcoffset(), timedelta(hours=-4))
        self.assertEqual(timeutil.at(date(2026, 12, 1), timeutil.OPEN).utcoffset(), timedelta(hours=-5))

    def test_fallback_eastern_zone_matches_the_tz_database(self):
        fallback = timeutil._USEastern()
        for d in (date(2026, 3, 9), date(2026, 3, 6), date(2026, 11, 2), date(2026, 10, 30), date(2027, 7, 1)):
            a = datetime(d.year, d.month, d.day, 12, 0, tzinfo=timeutil.ET).utcoffset()
            b = datetime(d.year, d.month, d.day, 12, 0, tzinfo=fallback).utcoffset()
            self.assertEqual(a, b, d)

    def test_parse_ts_handles_z_offsets_and_nanoseconds(self):
        ts = timeutil.parse_ts("2026-10-01T14:30:00.123456789Z")
        self.assertEqual((ts.hour, ts.minute, ts.microsecond), (10, 30, 123456))


if __name__ == "__main__":
    unittest.main()
