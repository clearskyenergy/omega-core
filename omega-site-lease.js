/* ==========================================================================
   omega-site-lease.js  ·  ClearSky-OMEGA shared platform file
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   --------------------------------------------------------------------------
   THE BATTERY HOST LEASE PROPOSAL, from the site finder's property card.

   A rep has sized a battery against a circuit and is looking at the owner's
   name. The next sentence is "rent us the corner of your lot and we pay you
   X a month for N years". This module asks /api/site-lease for X (the rate
   card lives there, never here — CLAUDE.md, IP protection) and prints the
   two-page document the owner is handed: the offer, then the terms and how
   it works. Print / Save as PDF is the export; nothing else is needed.

     OmegaSiteLease.quote(payload, cb)        cb(err, result)  POST /api/site-lease
     OmegaSiteLease.openProposal(result, opts) new window, or an overlay when
                                              a pop-up blocker eats it
     OmegaSiteLease.summary(result)           one paragraph for a card/email

   ES5, no build step. Firebase compat auth is read off window.firebase the
   way clearsky-sitefinder.html already does; there is no OmegaSSO here.
   ========================================================================== */
(function (root) {
  'use strict';
  if (root.OmegaSiteLease) return;

  var ENDPOINT = '/api/site-lease';
  var FALLBACK_BRAND = { name: 'ClearSky Energy Solutions', logoUrl: '', accent: '#1D4ED8', tagline: '' };
  var HOST_DISCLAIMER = 'This is an indicative proposal, not a binding offer. Rent, term and conditions are subject '
    + 'to a signed letter of intent, utility interconnection approval and site diligence.';

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function money(v) { return v == null || !isFinite(v) ? '—' : '$' + Math.round(v).toLocaleString(); }
  function fmt(v) { return v == null || !isFinite(v) ? '—' : Math.round(v).toLocaleString(); }
  function brandOf(result, override) {
    var b = (result && result.brand) || {}, o = override || {};
    return { name: o.name || b.name || FALLBACK_BRAND.name, logoUrl: o.logoUrl || b.logoUrl || '',
      accent: o.accent || b.accent || FALLBACK_BRAND.accent, tagline: o.tagline || b.tagline || '' };
  }

  function quote(payload, cb) {
    var user = root.firebase && root.firebase.auth && root.firebase.auth().currentUser;
    if (!user) { cb(new Error('Sign in to prepare a lease offer.')); return; }
    user.getIdToken().then(function (token) {
      return fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(payload) });
    }).then(function (res) {
      return res.json().then(function (d) { if (!res.ok) throw new Error(d.error || 'Lease offer unavailable'); return d; });
    }).then(function (d) { cb(null, d); })['catch'](function (e) { cb(e); });
  }

  function summary(result) {
    var o = result && result.offer; if (!o) return '';
    return 'Host lease, ' + o.termYears + '-year term: ' + money(o.monthly.base) + ' a month (' + money(o.annual.base)
      + ' a year), escalating ' + o.escalatorPct.base + '% a year, ' + money(o.termTotal.base) + ' over the term, for a '
      + fmt(o.kw) + ' kW / ' + fmt(o.kwh) + ' kWh battery on about ' + o.leasedAcres + ' acres. Indicative, not a binding offer.';
  }

  function css(accent) {
    return '.sl-page{width:816px;min-height:1056px;background:#fff;box-shadow:0 2px 16px rgba(15,27,42,.10);position:relative;'
      + "overflow:hidden;color:#1E2A38;font-family:'Inter',-apple-system,BlinkMacSystemFont,Arial,sans-serif;box-sizing:border-box}"
      + '.sl-p1{background:#0F1B2A;color:#fff;padding:54px 58px 40px;display:flex;flex-direction:column}'
      + '.sl-mark{display:flex;align-items:center;gap:11px;margin-bottom:auto}'
      + '.sl-mark img{width:46px;height:46px;object-fit:contain;background:#fff;border-radius:7px;padding:4px}'
      + '.sl-mark-n{font-size:15px;font-weight:800}.sl-mark-t{font-size:8.5px;letter-spacing:.13em;text-transform:uppercase;color:rgba(255,255,255,.5);font-weight:700;margin-top:2px}'
      + '.sl-eyebrow{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.55);font-weight:700;margin:40px 0 14px}'
      + '.sl-h1{font-size:43px;font-weight:800;line-height:1.1;letter-spacing:-.03em;margin:0 0 8px}.sl-h1 span{color:' + accent + '}'
      + '.sl-lede{font-size:13.5px;line-height:1.7;color:rgba(255,255,255,.72);max-width:520px;margin-bottom:30px}'
      + '.sl-offer{border-top:1px solid rgba(255,255,255,.16);border-bottom:1px solid rgba(255,255,255,.16);padding:24px 0;margin-bottom:26px}'
      + '.sl-offer-l{font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.5);font-weight:700;margin-bottom:9px}'
      + '.sl-offer-n{font-size:48px;font-weight:800;letter-spacing:-.035em;line-height:1}.sl-offer-u{font-size:13px;font-weight:600;color:rgba(255,255,255,.6);margin-top:8px}'
      + '.sl-meta{display:grid;grid-template-columns:1fr 1fr;gap:18px 30px;margin-bottom:auto}'
      + '.sl-meta label{display:block;font-size:8.5px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.45);font-weight:700;margin-bottom:4px}.sl-meta span{font-size:12.5px;font-weight:600}'
      + '.sl-foot{display:flex;justify-content:space-between;font-size:8.5px;letter-spacing:.09em;text-transform:uppercase;color:rgba(255,255,255,.4);font-weight:700;padding-top:24px}'
      + '.sl-p2{padding:44px 58px}.sl-ph{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid ' + accent + ';padding-bottom:10px;margin-bottom:26px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:#5b6675}'
      + '.sl-h2{font-size:24px;font-weight:800;letter-spacing:-.02em;margin:0 0 6px}.sl-sub{font-size:12.5px;color:#5b6675;line-height:1.6;margin:0 0 22px}'
      + '.sl-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:26px}'
      + '.sl-tile{border:1px solid #dfe5ec;border-radius:8px;padding:16px 16px 14px}.sl-tile b{display:block;font-size:24px;font-weight:800;letter-spacing:-.02em;color:' + accent + '}'
      + '.sl-tile small{display:block;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#5b6675;font-weight:700;margin-top:6px}'
      + '.sl-cols{display:grid;grid-template-columns:1fr 1fr;gap:26px;margin-bottom:26px}.sl-cols h4{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;margin:0 0 8px;color:#1E2A38}'
      + '.sl-cols ul{margin:0;padding-left:18px;font-size:12px;line-height:1.75;color:#334155}'
      + 'table.sl-terms{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:22px}table.sl-terms td{padding:9px 6px;border-bottom:1px solid #e6ebf1;vertical-align:top;line-height:1.5}'
      + 'table.sl-terms td:first-child{width:170px;font-weight:700;color:#1E2A38}'
      + '.sl-steps{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:22px}.sl-step{font-size:11px;line-height:1.5;color:#334155}'
      + '.sl-step b{display:block;font-size:20px;font-weight:800;color:' + accent + ';margin-bottom:4px}'
      + '.sl-fine{font-size:9.5px;line-height:1.6;color:#6b7684;border-top:1px solid #e6ebf1;padding-top:12px}'
      + '@media print{@page{size:letter;margin:0}.sl-page{width:8.5in;min-height:11in;box-shadow:none;page-break-after:always}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}';
  }

  function pages(result, opts) {
    opts = opts || {};
    var o = result.offer, b = brandOf(result, opts.brand), site = result.site || {};
    var host = opts.host || site.owner || 'Property owner';
    var addr = opts.address || site.addr || '';
    var today = new Date().toISOString().slice(0, 10);
    var mark = '<div class="sl-mark">' + (b.logoUrl ? '<img src="' + esc(b.logoUrl) + '" alt="">' : '')
      + '<div><div class="sl-mark-n">' + esc(b.name) + '</div><div class="sl-mark-t">' + esc(b.tagline || 'Battery storage host lease') + '</div></div></div>';
    var p1 = '<section class="sl-page sl-p1">' + mark
      + '<div class="sl-eyebrow">Host lease proposal</div>'
      + '<h1 class="sl-h1">Your land.<br>Our battery.<br><span>Your income.</span></h1>'
      + '<p class="sl-lede">' + esc(b.name) + ' would install and operate a battery energy storage system on a small fenced pad at '
      + (addr ? '<b>' + esc(addr) + '</b>' : 'your property') + '. We pay for everything. You keep title to the land, keep your meter and receive rent for '
      + o.termYears + ' years.</p>'
      + '<div class="sl-offer"><div class="sl-offer-l">Indicative lease consideration</div>'
      + '<div class="sl-offer-n">' + money(o.monthly.base) + ' <span style="font-size:20px;font-weight:600">per month</span></div>'
      + '<div class="sl-offer-u">' + money(o.annual.base) + ' per year · escalating ' + o.escalatorPct.base + '% annually · about ' + money(o.termTotal.base) + ' over ' + o.termYears + ' years</div></div>'
      + '<div class="sl-meta"><div><label>Prepared for</label><span>' + esc(host) + '</span></div>'
      + '<div><label>Prepared by</label><span>' + esc(opts.rep || b.name) + '</span></div>'
      + '<div><label>System</label><span>' + fmt(o.kw) + ' kW / ' + fmt(o.kwh) + ' kWh battery</span></div>'
      + '<div><label>Area we would lease</label><span>About ' + o.leasedAcres + ' acres, fenced</span></div></div>'
      + '<div class="sl-foot"><span>' + esc(today) + '</span><span>Indicative · not a binding offer</span></div></section>';
    var p2 = '<section class="sl-page sl-p2"><div class="sl-ph"><span>' + esc(b.name) + '</span><span>The lease</span></div>'
      + '<h2 class="sl-h2">What you receive</h2><p class="sl-sub">Rent is paid monthly, in advance, from the day the battery begins commercial operation. It rises by a fixed escalator every year for the whole term.</p>'
      + '<div class="sl-tiles"><div class="sl-tile"><b>' + money(o.monthly.base) + '</b><small>per month, year one</small></div>'
      + '<div class="sl-tile"><b>' + money(o.annual.base) + '</b><small>per year, year one</small></div>'
      + '<div class="sl-tile"><b>' + money(o.termTotal.base) + '</b><small>over ' + o.termYears + ' years, with escalation</small></div></div>'
      + '<div class="sl-cols"><div><h4>' + esc(b.name) + ' pays for</h4><ul><li>The battery, inverters and transformer</li><li>Fencing, foundations and civil works</li>'
      + '<li>Utility interconnection, studies and upgrades</li><li>Permits, insurance and property tax on the equipment</li><li>Operation, maintenance and removal at the end of the term</li></ul></div>'
      + '<div><h4>You provide</h4><ul><li>A fenced pad of about ' + o.leasedAcres + ' acres on your lot</li><li>Access for installation and maintenance vehicles</li>'
      + '<li>An easement for the cable route to the utility point of connection</li><li>Nothing else — no capital, no operating cost, no change to your own electric service</li></ul></div></div>'
      + '<table class="sl-terms">'
      + '<tr><td>Structure</td><td>Ground lease / space use agreement. You keep title to the land and your own utility account.</td></tr>'
      + '<tr><td>Term</td><td>' + o.termYears + ' years from commercial operation, with renewal options by mutual agreement.</td></tr>'
      + '<tr><td>Rent</td><td>' + money(o.monthly.base) + ' per month in year one, escalating ' + o.escalatorPct.base + '% each year.</td></tr>'
      + '<tr><td>Payment</td><td>Monthly, in advance, beginning at commercial operation. Nothing is owed by either party while the interconnection is studied.</td></tr>'
      + '<tr><td>Your power bill</td><td>Unchanged. The battery has its own meter and its own utility account.</td></tr>'
      + '<tr><td>Exclusivity</td><td>Limited to the leased pad and the cable easement. The rest of your property is unaffected.</td></tr>'
      + '<tr><td>End of term</td><td>Equipment is removed and the pad restored at our cost.</td></tr></table>'
      + '<h2 class="sl-h2" style="font-size:18px">How it works</h2>'
      + '<div class="sl-steps"><div class="sl-step"><b>1</b>Site qualification and this proposal. Week 1.</div>'
      + '<div class="sl-step"><b>2</b>Letter of intent: rent, term and the pad location. Weeks 2–3.</div>'
      + '<div class="sl-step"><b>3</b>Utility interconnection application and study. Weeks 3–26.</div>'
      + '<div class="sl-step"><b>4</b>Lease signed, permits filed. Weeks 26–34.</div>'
      + '<div class="sl-step"><b>5</b>Installation, energisation, first rent payment. Week 34 onward.</div></div>'
      + '<p class="sl-fine">' + esc(HOST_DISCLAIMER) + ' Prepared ' + esc(today) + ' by ' + esc(opts.rep || b.name) + '.</p></section>';
    return p1 + p2;
  }

  function doc(result, opts) {
    opts = opts || {};
    var b = brandOf(result, opts.brand), title = (opts.host || (result.site && result.site.owner) || 'Host') + ' — Battery Host Lease Proposal';
    return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) + '</title>'
      + '<style>html,body{margin:0;padding:0;background:#F1F4F8}.sl-wrap{display:flex;flex-direction:column;align-items:center;gap:20px;padding:22px}'
      + '.sl-bar{position:sticky;top:0;z-index:9;background:#0F1B2A;color:#fff;width:100%;box-sizing:border-box;padding:10px 18px;display:flex;align-items:center;gap:14px;'
      + "font:600 11px/1 'Inter',-apple-system,Arial,sans-serif;letter-spacing:.04em}.sl-bar button{margin-left:auto;background:" + b.accent + ';color:#fff;border:none;border-radius:6px;padding:8px 15px;font:700 11px/1 inherit;cursor:pointer}'
      + '@media print{.sl-bar{display:none}.sl-wrap{padding:0;gap:0;display:block}}' + css(b.accent) + '</style></head><body>'
      + (opts.bare ? '' : '<div class="sl-bar"><span>' + esc(b.name) + ' · Battery Host Lease Proposal</span><button onclick="window.print()">Print / Save as PDF</button></div>')
      + '<div class="sl-wrap">' + pages(result, opts) + '</div></body></html>';
  }

  var OVERLAY_ID = 'omega-sl-proposal-overlay';
  function overlay(html) {
    var ex = document.getElementById(OVERLAY_ID); if (ex) ex.parentNode.removeChild(ex);
    var host = document.createElement('div'); host.id = OVERLAY_ID;
    host.setAttribute('style', 'position:fixed;inset:0;z-index:2147483000;background:rgba(6,12,22,.86);display:flex;flex-direction:column');
    var bar = document.createElement('div');
    bar.setAttribute('style', "display:flex;align-items:center;gap:12px;padding:10px 16px;background:#0F1B2A;color:#fff;font:600 11px/1 'Inter',-apple-system,Arial,sans-serif;flex:0 0 auto");
    bar.innerHTML = '<span>Battery Host Lease Proposal</span>';
    var print = document.createElement('button'); print.textContent = 'Print / Save as PDF';
    print.setAttribute('style', 'margin-left:auto;background:#2563EB;color:#fff;border:none;border-radius:6px;padding:8px 15px;font:700 11px/1 inherit;cursor:pointer');
    var close = document.createElement('button'); close.textContent = '×'; close.setAttribute('aria-label', 'Close');
    close.setAttribute('style', 'background:transparent;color:#fff;border:1px solid rgba(255,255,255,.3);border-radius:6px;width:30px;height:30px;font-size:18px;cursor:pointer');
    bar.appendChild(print); bar.appendChild(close);
    var frame = document.createElement('iframe'); frame.setAttribute('style', 'flex:1 1 auto;border:0;background:#F1F4F8;width:100%');
    frame.setAttribute('title', 'Lease proposal');
    host.appendChild(bar); host.appendChild(frame); document.body.appendChild(host);
    function shut() { if (host.parentNode) host.parentNode.removeChild(host); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') shut(); }
    close.onclick = shut; document.addEventListener('keydown', onKey);
    print.onclick = function () { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) {} };
    if ('srcdoc' in frame) frame.srcdoc = html;
    else { try { var d = frame.contentWindow.document; d.open(); d.write(html); d.close(); } catch (e) {} }
    return host;
  }

  function openProposal(result, opts) {
    var w = null, html = doc(result, opts);
    try { w = root.open('', '_blank'); } catch (e) {}
    if (w) { try { w.document.open(); w.document.write(html); w.document.close(); return w; } catch (e) {} }
    var bare = {}; for (var k in (opts || {})) if (Object.prototype.hasOwnProperty.call(opts, k)) bare[k] = opts[k];
    bare.bare = true;
    return overlay(doc(result, bare));
  }

  root.OmegaSiteLease = { quote: quote, openProposal: openProposal, doc: doc, pages: pages, summary: summary, brandOf: brandOf,
    money: money, esc: esc, ENDPOINT: ENDPOINT, HOST_DISCLAIMER: HOST_DISCLAIMER, VERSION: 'site-lease-client/1.0' };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.OmegaSiteLease;
})(typeof window !== 'undefined' ? window : globalThis);
