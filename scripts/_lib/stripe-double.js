/* ═══════════════════════════════════════════════════════════════════════════
   scripts/_lib/stripe-double.js — a call-recording Stripe CLIENT for tests
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   What the packaging Stripe rail (api/_lib/stripe-billing.js) calls, and no
   more: customers.create/retrieve/update, paymentIntents.create/retrieve/
   list, checkout.sessions.create/retrieve/expire, disputes.list. It is
   handed to the code under test as the SUPPLIED client (stripe-billing's
   `supplied`, the engine's deps.stripe) — or returned by a test's own stub
   of the `stripe` module for an endpoint that makes its client itself.

   Shaped like stripe-node: ids with Stripe's prefixes (a Checkout Session
   carries test_ or live_ in its id), `livemode` on every object, expand of
   latest_charge / payment_method / payment_intent(.payment_method), and
   errors carrying `type`, `statusCode`, `code` and `raw`. The same
   idempotency key replays the first answer (or the first error); the same
   key with different parameters is refused, as Stripe refuses it.

   Controls (what a person or a bank does on Stripe's side):
     saveCard(cus, card)      a card attached and made the customer's default
     removeCard(cus)          no default card any more
     decline(cus, code)       the customer's current default card is refused
                              off-session (StripeCardError 402, raw.payment_intent)
     fail(method, opts)       the next call(s) of a method fail: a connection
                              error by default (no statusCode), or opts.type /
                              opts.statusCode; opts.skip lets calls through first
     complete(cs, card)       the payer finishes Checkout: the session is
                              complete + paid, its PaymentIntent succeeded
                              with a card payment method attached to the customer
     expireSession(cs)        a session's 24 hours ran out
     refund(pi, cents)        latest_charge.amount_refunded grows
     dispute(pi, status, c)   charge.disputed, and a dispute disputes.list finds
     mutate(id, patch)        edit any stored object (a test's last resort)
     on(method, fn)           fn(result) after a successful call of the method
     event(type, object)      a Stripe event envelope for the webhook
     count(method)            how many times a method was called
   Nothing here reaches the network.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function stripeError(type, message, extra) { var e = new Error(message); e.type = type; Object.keys(extra || {}).forEach(function (k) { e[k] = extra[k]; }); return e; }
function missing(what, id) { return stripeError('StripeInvalidRequestError', 'No such ' + what + ': \'' + id + '\'', { statusCode: 404, code: 'resource_missing' }); }
function invalid(message) { return stripeError('StripeInvalidRequestError', message, { statusCode: 400, code: 'parameter_invalid' }); }

function create(options) {
  options = options || {};
  var livemode = options.livemode === true, now = options.now || function () { return Date.now(); };
  var seq = 0, calls = [], failures = [], hooks = {}, replay = {}, declined = {};
  var store = { customers: {}, paymentMethods: {}, paymentIntents: {}, charges: {}, sessions: {}, disputes: {} };
  var sessionParams = {};
  function id(prefix) { seq++; return prefix + 'D' + ('00000' + seq).slice(-6); }
  function seconds() { return Math.floor(now() / 1000); }
  function find(objectId) { var kinds = Object.keys(store); for (var i = 0; i < kinds.length; i++) if (store[kinds[i]][objectId]) return store[kinds[i]][objectId]; return null; }
  /* every call: recorded, then any failure the test queued, then the work */
  async function call(method, args, work) {
    calls.push({ method: method, args: clone(args) });
    for (var i = 0; i < failures.length; i++) {
      var f = failures[i];
      if (f.method !== method) continue;
      if (f.skip > 0) { f.skip--; break; }
      if (--f.times <= 0) failures.splice(i, 1);
      throw stripeError(f.type, f.message, f.statusCode ? { statusCode: f.statusCode, code: f.code || null } : {});
    }
    var out = await work();
    (hooks[method] || []).forEach(function (fn) { fn(clone(out)); });
    return out;
  }
  /* Stripe keeps a key's first answer: the same key replays it, error and all */
  function idempotent(method, params, opts, work) {
    var key = opts && opts.idempotencyKey;
    if (!key) return clone(work());
    var slot = method + '\u0000' + key, sent = JSON.stringify(params || {}), prior = replay[slot];
    if (prior) {
      if (prior.params !== sent) throw stripeError('StripeIdempotencyError', 'Keys for idempotent requests can only be used with the same parameters they were first used with.', { statusCode: 400, code: 'idempotency_key_in_use' });
      prior.hits++;
      if (prior.error) throw prior.error;
      return clone(prior.value);
    }
    var entry = { params: sent, hits: 0 };
    replay[slot] = entry;
    try { entry.value = clone(work()); return clone(entry.value); }
    catch (e) { entry.error = e; throw e; }
  }
  function customerOf(cid) { var c = store.customers[cid]; if (!c || c.deleted) throw missing('customer', cid); return c; }
  function newCard(customer, card) {
    card = card || {};
    var pm = { id: id('pm_'), object: 'payment_method', type: 'card', customer: customer || null, livemode: livemode, created: seconds(),
      card: { brand: card.brand || 'visa', last4: card.last4 || '4242', exp_month: card.exp_month || 12, exp_year: card.exp_year || 2030 } };
    store.paymentMethods[pm.id] = pm;
    return pm;
  }
  function succeed(pi) {
    var ch = { id: id('ch_'), object: 'charge', payment_intent: pi.id, customer: pi.customer, amount: pi.amount, amount_refunded: 0, refunded: false, disputed: false,
      currency: pi.currency, livemode: pi.livemode, created: seconds() };
    store.charges[ch.id] = ch;
    pi.status = 'succeeded'; pi.amount_received = pi.amount; pi.latest_charge = ch.id; pi.last_payment_error = null;
    return pi;
  }
  function expand(object, paths) {
    var out = clone(object);
    (paths || []).forEach(function (p) {
      if (p === 'latest_charge' && out.latest_charge) out.latest_charge = clone(store.charges[out.latest_charge]);
      if (p === 'payment_method' && typeof out.payment_method === 'string') out.payment_method = clone(store.paymentMethods[out.payment_method]);
      if (p === 'payment_intent' && typeof out.payment_intent === 'string') out.payment_intent = clone(store.paymentIntents[out.payment_intent]);
      if (p === 'payment_intent.payment_method' && out.payment_intent && typeof out.payment_intent === 'object' && typeof out.payment_intent.payment_method === 'string') out.payment_intent.payment_method = clone(store.paymentMethods[out.payment_intent.payment_method]);
    });
    return out;
  }

  var client = {
    customers: {
      create: function (params, opts) {
        return call('customers.create', [params, opts], function () {
          return idempotent('customers.create', params, opts, function () {
            var c = Object.assign({ id: id('cus_'), object: 'customer', livemode: livemode, created: seconds(), metadata: {} }, clone(params));
            c.invoice_settings = { default_payment_method: null };
            store.customers[c.id] = c;
            return c;
          });
        });
      },
      retrieve: function (cid) {
        return call('customers.retrieve', [cid], function () { if (!store.customers[cid]) throw missing('customer', cid); return clone(store.customers[cid]); });
      },
      update: function (cid, params, opts) {
        return call('customers.update', [cid, params, opts], function () {
          return idempotent('customers.update:' + cid, params, opts, function () {
            var c = customerOf(cid), p = clone(params) || {};
            if (p.invoice_settings && p.invoice_settings.default_payment_method) {
              var pm = store.paymentMethods[p.invoice_settings.default_payment_method];
              if (!pm) throw missing('payment_method', p.invoice_settings.default_payment_method);
              if (pm.customer !== cid) throw invalid('The payment method must be attached to the customer before it can be the default.');
            }
            if (p.metadata) { c.metadata = Object.assign({}, c.metadata, p.metadata); delete p.metadata; }
            if (p.invoice_settings) { c.invoice_settings = Object.assign({}, c.invoice_settings, p.invoice_settings); delete p.invoice_settings; }
            Object.assign(c, p);
            return c;
          });
        });
      }
    },
    paymentIntents: {
      create: function (params, opts) {
        return call('paymentIntents.create', [params, opts], function () {
          return idempotent('paymentIntents.create', params, opts, function () {
            customerOf(params.customer);
            if (!Number.isInteger(params.amount) || params.amount < 50) throw invalid('Amount must be at least 50 cents');
            var pi = { id: id('pi_'), object: 'payment_intent', amount: params.amount, amount_received: 0, currency: params.currency, customer: params.customer,
              payment_method: params.payment_method || null, description: params.description || null, metadata: clone(params.metadata) || {}, status: 'requires_payment_method',
              latest_charge: null, livemode: livemode, created: seconds(), off_session: params.off_session === true };
            store.paymentIntents[pi.id] = pi;
            if (!params.confirm) return pi;
            var pm = store.paymentMethods[params.payment_method];
            if (!pm) throw missing('payment_method', params.payment_method);
            if (pm.customer !== params.customer) throw invalid('The payment method does not belong to this customer.');
            var code = declined[pm.id];
            if (code) {
              pi.status = code === 'authentication_required' ? 'requires_action' : 'requires_payment_method';
              pi.last_payment_error = { code: code, type: 'card_error' };
              throw stripeError('StripeCardError', code === 'authentication_required' ? 'This payment requires authentication.' : 'Your card was declined.',
                { statusCode: 402, code: code === 'authentication_required' ? code : 'card_declined', decline_code: code, raw: { code: code === 'authentication_required' ? code : 'card_declined', decline_code: code, payment_intent: clone(pi) } });
            }
            return succeed(pi);
          });
        });
      },
      retrieve: function (piId, opts) {
        return call('paymentIntents.retrieve', [piId, opts], function () { var pi = store.paymentIntents[piId]; if (!pi) throw missing('payment_intent', piId); return expand(pi, opts && opts.expand); });
      },
      list: function (params) {
        return call('paymentIntents.list', [params], function () {
          var all = Object.keys(store.paymentIntents).map(function (k) { return store.paymentIntents[k]; })
            .filter(function (pi) { return !params || !params.customer || pi.customer === params.customer; })
            .sort(function (a, b) { return b.created - a.created || (b.id < a.id ? -1 : 1); });
          var limit = Math.min(100, params && params.limit || 10);
          return { object: 'list', data: clone(all.slice(0, limit)), has_more: all.length > limit };
        });
      }
    },
    checkout: {
      sessions: {
        create: function (params, opts) {
          return call('checkout.sessions.create', [params, opts], function () {
            return idempotent('checkout.sessions.create', params, opts, function () {
              if (params.customer) customerOf(params.customer);
              var total = 0;
              (params.line_items || []).forEach(function (l) {
                var unit = l.price_data && l.price_data.unit_amount;
                if (!Number.isInteger(unit) || unit < 0) throw invalid('Invalid non-negative integer: line_items[].price_data.unit_amount');
                if (!l.price_data.product_data || !l.price_data.product_data.name) throw invalid('Missing required param: line_items[].price_data.product_data.name');
                total += unit * (l.quantity || 1);
              });
              var sid = id('cs_' + (livemode ? 'live' : 'test') + '_');
              var s = { id: sid, object: 'checkout.session', url: 'https://checkout.stripe.com/c/pay/' + sid, mode: params.mode, status: 'open', payment_status: 'unpaid',
                customer: params.customer || null, client_reference_id: params.client_reference_id || null, metadata: clone(params.metadata) || {}, amount_total: total,
                currency: 'usd', payment_intent: null, expires_at: seconds() + 24 * 3600, success_url: params.success_url, cancel_url: params.cancel_url, livemode: livemode };
              store.sessions[sid] = s; sessionParams[sid] = clone(params);
              return s;
            });
          });
        },
        retrieve: function (sid, opts) {
          return call('checkout.sessions.retrieve', [sid, opts], function () { var s = store.sessions[sid]; if (!s) throw missing('checkout.session', sid); return expand(s, opts && opts.expand); });
        },
        expire: function (sid) {
          return call('checkout.sessions.expire', [sid], function () {
            var s = store.sessions[sid]; if (!s) throw missing('checkout.session', sid);
            if (s.status !== 'open') throw invalid('Only Checkout Sessions with a status in ["open"] can be expired.');
            s.status = 'expired'; return clone(s);
          });
        }
      }
    },
    disputes: {
      list: function (params) {
        return call('disputes.list', [params], function () {
          var data = Object.keys(store.disputes).map(function (k) { return store.disputes[k]; }).filter(function (d) { return !params || !params.payment_intent || d.payment_intent === params.payment_intent; });
          return { object: 'list', data: clone(data.slice(0, params && params.limit || 10)), has_more: false };
        });
      }
    }
  };

  /* ── controls ── */
  client.calls = calls;
  client.count = function (method) { return calls.filter(function (c) { return c.method === method; }).length; };
  client.callsOf = function (method) { return calls.filter(function (c) { return c.method === method; }).map(function (c) { return c.args; }); };
  client.replays = function () { return Object.keys(replay).reduce(function (n, k) { return n + replay[k].hits; }, 0); };
  client.object = function (objectId) { return clone(find(objectId)); };
  client.sessionParams = function (sid) { return clone(sessionParams[sid]); };
  client.saveCard = function (cid, card) { customerOf(cid); var pm = newCard(cid, card); store.customers[cid].invoice_settings.default_payment_method = pm.id; return pm.id; };
  client.removeCard = function (cid) { customerOf(cid).invoice_settings.default_payment_method = null; };
  client.decline = function (cid, code) {
    var pm = customerOf(cid).invoice_settings.default_payment_method;
    if (!pm) throw new Error('stripe-double: ' + cid + ' has no card to decline');
    if (code === null) delete declined[pm]; else declined[pm] = code || 'card_declined';
    return pm;
  };
  client.fail = function (method, opts) {
    opts = opts || {};
    failures.push({ method: method, skip: opts.skip || 0, times: opts.times || 1, type: opts.type || 'StripeConnectionError',
      statusCode: opts.statusCode || null, code: opts.code || null, message: opts.message || 'An error occurred with our connection to Stripe.' });
  };
  client.complete = function (sid, card) {
    var s = store.sessions[sid]; if (!s) throw new Error('stripe-double: no session ' + sid);
    if (s.status !== 'open') throw new Error('stripe-double: session ' + sid + ' is ' + s.status);
    var params = sessionParams[sid] || {}, pid = params.payment_intent_data || {};
    var pm = newCard(pid.setup_future_usage ? s.customer : null, card);
    var pi = { id: id('pi_'), object: 'payment_intent', amount: s.amount_total, amount_received: 0, currency: 'usd', customer: s.customer, payment_method: pm.id,
      description: pid.description || null, metadata: clone(pid.metadata) || {}, status: 'requires_payment_method', latest_charge: null, livemode: s.livemode, created: seconds(),
      setup_future_usage: pid.setup_future_usage || null };
    store.paymentIntents[pi.id] = pi; succeed(pi);
    s.status = 'complete'; s.payment_status = 'paid'; s.payment_intent = pi.id;
    return { session: clone(s), paymentIntent: clone(pi), paymentMethod: pm.id };
  };
  client.expireSession = function (sid) { var s = store.sessions[sid]; if (!s) throw new Error('stripe-double: no session ' + sid); s.status = 'expired'; return clone(s); };
  client.refund = function (piId, cents) {
    var pi = store.paymentIntents[piId], ch = pi && store.charges[pi.latest_charge];
    if (!ch) throw new Error('stripe-double: no charge on ' + piId);
    ch.amount_refunded = Math.min(ch.amount, ch.amount_refunded + (cents == null ? ch.amount : cents)); ch.refunded = ch.amount_refunded === ch.amount;
    return clone(ch);
  };
  client.dispute = function (piId, status, amount) {
    var pi = store.paymentIntents[piId], ch = pi && store.charges[pi.latest_charge];
    if (!ch) throw new Error('stripe-double: no charge on ' + piId);
    ch.disputed = true;
    var d = { id: id('dp_'), object: 'dispute', charge: ch.id, payment_intent: piId, amount: amount == null ? ch.amount : amount, status: status || 'needs_response', livemode: livemode, created: seconds() };
    store.disputes[d.id] = d; return clone(d);
  };
  client.mutate = function (objectId, patch) { var o = find(objectId); if (!o) throw new Error('stripe-double: nothing stored as ' + objectId); Object.assign(o, clone(patch)); return clone(o); };
  client.on = function (method, fn) { (hooks[method] = hooks[method] || []).push(fn); };
  client.event = function (type, object, extra) {
    return Object.assign({ id: id('evt_'), object: 'event', type: type, livemode: livemode, created: seconds(), data: { object: clone(object) } }, extra || {});
  };
  return client;
}
module.exports = { create: create, clone: clone };
