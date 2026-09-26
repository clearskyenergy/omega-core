/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Usage in the tools where the work happens (Phase 7). ES5.
 *   OmegaUsage.count(meter, seed)  before producing a metered deliverable:
 *       resolves when it may proceed (counted, or the workspace is not
 *       metered); rejects with the server's sentence and the pack offer when
 *       the allowance is used and auto top-up is off. Idempotent per
 *       deliverable and day through the seed.
 *   OmegaUsage.badge(host, meter)  "18 of 20 EV applications used this cycle",
 *       the 80% note, and at 100% the buy-more control for an owner or
 *       administrator ("Ask your administrator" for a member).
 * The browser counts nothing itself; every number is the server's.
 */
(function (global) {
  'use strict';
  function node(tag, text, cls) { var el = document.createElement(tag); if (text) el.textContent = text; if (cls) el.className = cls; return el; }
  function hash(s) { var h = 5381, i; for (i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(16); }
  function id(seed) { return 'c-' + hash(String(seed == null ? '' : seed) + '|' + new Date().toISOString().slice(0, 10)) + '-' + hash(String(seed == null ? '' : seed).length + ':' + (global.location ? global.location.pathname : '')); }
  function user() { return global.firebase && global.firebase.apps && global.firebase.apps.length ? global.firebase.auth().currentUser : null; }
  function api(path, body) {
    var u = user();
    if (!u || !u.getIdToken || !global.fetch) return Promise.resolve({ metered: false });
    return u.getIdToken().then(function (token) {
      var opts = { cache: 'no-store', headers: { Authorization: 'Bearer ' + token } };
      if (body) { opts.method = 'POST'; opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
      return global.fetch(path, opts);
    }).then(function (r) { return r.json().then(function (j) { if (!r.ok) { var e = new Error(j.error || 'Request refused'); e.status = r.status; e.meter = j.meter || null; throw e; } return j; }); });
  }
  function count(meter, seed) {
    return api('/api/usage', { meter: meter, clientId: id(seed) }).then(function (r) { return r; }, function (e) {
      // Only the allowance refuses (402). Anything else is not this counter's
      // business: the deliverable is produced and the counter is retried later.
      if (e.status === 402) throw e;
      return { metered: false, error: e.message };
    });
  }
  function explain(e, host) {
    var text = e && e.message ? e.message : 'This deliverable is not available right now.';
    if (host && host.appendChild) { host.textContent = ''; host.appendChild(node('p', text, 'omega-usage-note')); }
    else if (global.alert) global.alert(text);
  }
  var styled = false;
  function style() {
    if (styled || !global.document) return; styled = true;
    var st = document.createElement('style');
    st.textContent = '.omega-usage{font:500 12.5px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;display:inline-flex;flex-wrap:wrap;gap:6px 10px;align-items:center;padding:6px 10px;border:1px solid #CBD5E1;border-radius:8px;background:#F8FAFC;color:#1E2A38}' +
      '.omega-usage b{font-weight:700}.omega-usage .note{color:#B45309}.omega-usage .over{color:#DC2626}.omega-usage button,.omega-usage a{font:600 12px system-ui;padding:4px 9px;border:1px solid #1D4ED8;border-radius:6px;background:#1D4ED8;color:#fff;cursor:pointer;text-decoration:none}' +
      '.omega-usage .bar{width:90px;height:6px;border-radius:3px;background:#E2E8F0;overflow:hidden}.omega-usage .bar i{display:block;height:100%;background:#1D4ED8}.omega-usage .bar i.hot{background:#DC2626}.omega-usage-note{color:#B45309;font:500 13px system-ui}';
    document.head.appendChild(st);
  }
  function draw(host, meter, status) {
    style(); host.textContent = ''; host.className = 'omega-usage'; host.setAttribute('data-usage', meter);
    var m = (status.meters || []).filter(function (x) { return x.key === meter; })[0];
    if (!status.metered || !m) { host.hidden = true; return; }
    host.hidden = false;
    if (!m.billed) { host.appendChild(node('span', m.display)); return; }
    var bar = node('span', '', 'bar'), fill = node('i', '', m.pct >= 100 ? 'hot' : ''); fill.style.width = Math.min(100, m.pct) + '%'; bar.appendChild(fill); host.appendChild(bar);
    var text = node('span'); text.appendChild(node('b', m.used + ' of ' + m.allowance)); text.appendChild(document.createTextNode(' ' + m.name + ' used this cycle')); host.appendChild(text);
    if (m.note) host.appendChild(node('span', m.note, m.pct >= 100 ? 'over' : 'note'));
    if (m.pct >= 100 && !m.autoTopup) {
      if (status.canBuy) {
        var buy = node('button', m.pack.display); buy.type = 'button';
        buy.onclick = function () {
          buy.disabled = true; buy.textContent = 'Creating your invoice…';
          api('/api/plan-change', { action: 'pack-quote', meter: meter }).then(function (q) { return api('/api/plan-change', { action: 'pack-buy', meter: meter, previewId: q.previewId, effectiveAt: q.effectiveAt }); })
            .then(function (r) { buy.remove(); var a = node('a', 'Pay ' + r.display + ' in QuickBooks'); a.href = r.paymentLink; a.target = '_blank'; a.rel = 'noopener'; host.appendChild(a); host.appendChild(node('span', 'The pack is added the moment the payment clears.', 'note')); },
              function (e) { buy.disabled = false; buy.textContent = m.pack.display; host.appendChild(node('span', e.message, 'over')); });
        };
        host.appendChild(buy);
      } else host.appendChild(node('span', 'Ask your workspace administrator to buy more.', 'note'));
    }
  }
  function badge(host, meter) {
    if (!host) return Promise.resolve(null);
    return api('/api/usage').then(function (status) { draw(host, meter, status); return status; }, function () { host.hidden = true; return null; });
  }
  /* A tool marks where its badge goes: <span data-usage-meter="evApplications"></span>.
     Mounted once the page's Firebase user is known; nothing is drawn for an
     unmetered workspace. */
  function mount() {
    if (!global.document || !global.document.querySelectorAll) return;
    var hosts = global.document.querySelectorAll('[data-usage-meter]'); if (!hosts.length) return;
    function go() { for (var i = 0; i < hosts.length; i++) badge(hosts[i], hosts[i].getAttribute('data-usage-meter')); }
    if (user()) go(); else if (global.firebase && global.firebase.apps && global.firebase.apps.length) global.firebase.auth().onAuthStateChanged(function (u) { if (u) go(); });
  }
  if (global.document) { if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', mount); else setTimeout(mount, 0); }
  global.OmegaUsage = { count: count, badge: badge, explain: explain, id: id, mount: mount, status: function () { return api('/api/usage'); } };
})(typeof window !== 'undefined' ? window : this);
