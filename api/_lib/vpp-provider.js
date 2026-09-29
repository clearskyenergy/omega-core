/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/vpp-provider.js — WHO ANSWERS a VPP earnings question

   ONE place decides whether an estimate is our simulation alone or also
   carries a live quote from a VPP operator's API. Today that is always the
   simulation (api/_lib/vpp-sim.js): Molecule Systems has not published the
   DividendVPP estimator API (moleculesystems.com/developer, "coming soon",
   read 2026-09-29).

   WHEN THEIR API EXISTS. Set, in Vercel only (never in the repo):
     DIVIDENDVPP_API_URL   the estimate endpoint Molecule gives us
     DIVIDENDVPP_API_KEY   our partner key
   and the estimate carries `providerQuote` BESIDE the simulation: their
   figure next to ours, never mixed into our streams, because until the two
   have been reconciled on real sites a blend would be a number nobody can
   explain. What we send is `request()` below — the site, the battery and
   the load summary, never the customer's name or address line, and never
   the raw interval file (monthly kWh/peak only). The mapping of THEIR
   response is `readQuote()`, the one function to finish when their
   contract is known. A provider failure never fails the estimate: the
   simulation still answers, with the reason the quote is missing.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var SIM = require('./vpp-sim');

var TIMEOUT_MS = 12000;

function configured() {
  return !!(process.env.DIVIDENDVPP_API_URL && process.env.DIVIDENDVPP_API_KEY);
}
function describe() {
  return { simulation: SIM.VERSION, live: configured() ? 'dividendvpp' : null,
           note: configured() ? 'Estimates carry a DividendVPP quote beside the simulation.'
                              : 'Simulation only; the DividendVPP API is not connected.' };
}

/* What leaves our server: enough to price the site, nothing that names it. */
function request(input, sim) {
  return {
    source: 'clearsky-omega', simulation: SIM.VERSION,
    site: { zip: sim.site.zip, state: sim.site.state, market: sim.site.market, segment: sim.site.segment },
    battery: { kw: sim.battery.kw, kwh: sim.battery.kwh, roundTrip: sim.battery.rte },
    solarKwdc: sim.solar ? sim.solar.kwdc : 0,
    load: { source: sim.load.source, annualKwh: sim.load.annualKwh, peakKw: sim.load.peakKw,
            monthly: sim.monthly.map(function (m) { return { month: m.month + 1, kwh: m.kwh, peakKw: m.peakKw }; }) }
  };
}

/* A figure in their answer: a finite number, or a string that is one number
   and nothing else. Number() alone reads null, '', '  ', false and [] as 0
   and true as 1: a $0 "quote" for an answer that carried no figure. */
var FIGURE = /^\s*-?(\d+(\.\d*)?|\.\d+)\s*$/;
function figure(v) {
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  if (typeof v === 'string' && FIGURE.test(v)) return Number(v);
  return NaN;
}
/* the first of the named fields that is present (not null or undefined) */
function firstOf(o, keys) {
  for (var i = 0; i < keys.length; i++) if (o[keys[i]] != null) return o[keys[i]];
  return undefined;
}

/* Their answer → { annualUsd, streams[{name, usd}], raw note }. Tolerant
   on purpose until the contract is fixed; anything unreadable is refused:
   the first total field present must be a real figure or there is no quote
   (never a $0 one), and a stream without a real figure is left out. */
function readQuote(j) {
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
  var total = figure(firstOf(j, ['annualEarnings', 'annual_usd', 'total']));
  if (!isFinite(total)) return null;
  var streams = [];
  var list = Array.isArray(j.streams) ? j.streams : (Array.isArray(j.programs) ? j.programs : []);
  for (var i = 0; i < list.length && i < 40; i++) {
    var s = list[i] && typeof list[i] === 'object' ? list[i] : {}, usd = figure(firstOf(s, ['usd', 'annualEarnings']));
    if (isFinite(usd)) streams.push({ name: String(s.name || s.program || 'Stream').slice(0, 120), usd: Math.round(usd) });
  }
  return { annualUsd: Math.round(total), streams: streams, id: j.id ? String(j.id).slice(0, 80) : null };
}

/* Why a call failed, for the function log only, and only in words WE wrote.
   A runtime's error text quotes what it was handed: Node's fetch puts a bad
   header value in its message ('"Bearer <key>" is an invalid header value',
   the value TRIMMED first, so no scrub of the raw key is reliable) and the
   whole URL in a URL error, userinfo and query string included. So the
   message is read to choose one of the fixed phrases below and is never
   written. The line is exactly: the error's class name (an identifier,
   else "Error"), the cause's code when it is one (ECONNREFUSED,
   ERR_INVALID_URL…), the phrase, and the endpoint's ORIGIN: scheme, host
   and port, never its userinfo, path or query. A variable part that still
   carries a piece of the key or of the URL's credentials is withheld. */
var FAILURE = {
  timeout: 'no answer before our timeout',
  header: 'invalid header value; check DIVIDENDVPP_API_KEY',
  credentials: 'the URL carries credentials, which fetch refuses; check DIVIDENDVPP_API_URL',
  url: 'invalid URL; check DIVIDENDVPP_API_URL',
  network: 'network or TLS failure',
  other: 'request failed'
};
function failureKind(e, timedOut) {
  var msg = String((e && e.message) || ''), code = e && e.cause && e.cause.code;
  if (timedOut) return 'timeout';
  if (/header/i.test(msg)) return 'header';
  if (/\bURL\b/.test(msg) && /credential/i.test(msg)) return 'credentials';
  if (code === 'ERR_INVALID_URL' || (e && e.code === 'ERR_INVALID_URL') || /\bURL\b/.test(msg)) return 'url';
  if (e && e.cause) return 'network';
  return 'other';
}
/* scheme://host[:port] of the configured endpoint; nothing else of it */
function originOf(u) {
  if (typeof URL !== 'function') return '[endpoint]';
  var x;
  try { x = new URL(String(u || '').trim()); } catch (err) { return '[unparseable DIVIDENDVPP_API_URL]'; }
  if (x.protocol !== 'https:' && x.protocol !== 'http:') return '[not an http(s) URL]';
  return x.protocol + '//' + x.host;
}
function decoded(s) { try { return decodeURIComponent(s); } catch (err) { return s; } }
/* every piece of a secret the configuration holds, as a runtime might print it */
function secrets() {
  var out = [], key = String(process.env.DIVIDENDVPP_API_KEY || ''), url = String(process.env.DIVIDENDVPP_API_URL || '');
  out.push(key, key.trim());
  key.split(/["'\s\u0000]+/).forEach(function (p) { out.push(p); });
  if (typeof URL === 'function') {
    try {
      var x = new URL(url.trim());
      out.push(x.username, decoded(x.username), x.password, decoded(x.password), x.search.slice(1));
      x.searchParams.forEach(function (v) { out.push(v); });
    } catch (err) { /* an unparseable URL is never printed: its origin is a fixed phrase */ }
  }
  return out.filter(function (s) { return s && s.length >= 4; });
}
function identifier(v, re) { return typeof v === 'string' && re.test(v) ? v : ''; }
function logFailure(e, timedOut) {
  var hidden = secrets();
  function safe(part, instead) {
    for (var i = 0; i < hidden.length; i++) if (part.indexOf(hidden[i]) >= 0) return instead;
    return part;
  }
  var name = safe(identifier(e && e.name, /^[A-Za-z][A-Za-z0-9_]{0,39}$/), '') || 'Error';
  var code = safe(identifier(e && e.cause && e.cause.code, /^[A-Z][A-Z0-9_]{1,63}$/), '');
  var origin = safe(originOf(process.env.DIVIDENDVPP_API_URL), '[endpoint withheld]');
  console.error('[vpp-provider] quote failed (' + name + (code ? ', ' + code : '') + '): ' +
    FAILURE[failureKind(e, timedOut)] + '. Endpoint: ' + origin);
}

function liveQuote(input, sim) {
  if (!configured() || typeof fetch !== 'function') return Promise.resolve(null);
  var ctl = typeof AbortController === 'function' ? new AbortController() : null;
  var timer = ctl ? setTimeout(function () { ctl.abort(); }, TIMEOUT_MS) : null;
  function aborted() { return !!(ctl && ctl.signal && ctl.signal.aborted); }
  /* a fetch that throws instead of rejecting (a bad URL or header value in
     some runtimes) takes the same road as one that rejects */
  return new Promise(function (resolve) {
    resolve(fetch(process.env.DIVIDENDVPP_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.DIVIDENDVPP_API_KEY },
      body: JSON.stringify(request(input, sim)),
      signal: ctl ? ctl.signal : undefined
    }));
  }).then(function (r) {
    return r.json().then(null, function () { return null; }).then(function (j) {
      if (!r.ok) return { provider: 'dividendvpp', ok: false, error: 'DividendVPP answered ' + r.status + '.' };
      var q = readQuote(j);
      if (q) return { provider: 'dividendvpp', ok: true, quote: q };
      /* our clock ran out while the body was still arriving */
      if (j === null && aborted()) return { provider: 'dividendvpp', ok: false, error: 'DividendVPP did not answer in time.' };
      return { provider: 'dividendvpp', ok: false, error: 'DividendVPP\'s answer could not be read.' };
    });
  }, function (e) {
    /* only OUR clock is "in time"; a bad URL, a refused connection, DNS or
       TLS is "could not be reached", and the reason goes to the log */
    var timedOut = aborted() || !!(e && e.name === 'AbortError');
    logFailure(e, timedOut);
    return { provider: 'dividendvpp', ok: false,
             error: timedOut ? 'DividendVPP did not answer in time.' : 'DividendVPP could not be reached.' };
  }).then(function (out) { if (timer) clearTimeout(timer); return out; });
}

/* The one call the endpoint makes. */
function estimate(input) {
  var sim = SIM.simulate(input);
  if (!sim.ok) return Promise.resolve(sim);
  return liveQuote(input, sim).then(function (q) {
    if (q) sim.providerQuote = q;
    return sim;
  });
}

module.exports = { configured: configured, describe: describe, estimate: estimate,
                   request: request, readQuote: readQuote };
