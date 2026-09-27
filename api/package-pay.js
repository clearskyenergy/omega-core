/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * GET /api/package-pay?o=<org>&r=<invoice record>&s=<signature>[&cs=<session>]
 *
 * The pay link of a card-billed (Stripe rail) packaged invoice: what the
 * invoice mail, Plan & billing, the signup pay step and the package menu
 * link to. Signed (api/_lib/stripe-billing.js payLink), durable, safe to
 * forward to whoever pays the bills: it opens Stripe's hosted Checkout for
 * exactly that record's amount — the record's open session, or the next one
 * — and never anything else. No sign-in: paying an invoice is not access.
 *
 * With &cs= it is Checkout's success_url: the session is re-read from Stripe,
 * its payment attached, the card kept on file, the record reconciled through
 * the engine's one paid transition, the receipt sent, and the payer is sent
 * to the workspace's Plan & billing (api/_lib/kit.js home(), the one rule).
 * Nothing in the URL is trusted beyond which record to look at.
 */
'use strict';
var A = require('./_lib/admin'), SB = require('./_lib/stripe-billing');
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function page(res, status, title, text) {
  res.status(status).setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) + '</title>'
    + '<style>body{font:16px/1.55 system-ui,-apple-system,Segoe UI,sans-serif;background:#0b1f33;color:#0b1f33;margin:0;padding:48px 16px}main{max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:28px}h1{font-size:20px;margin:0 0 10px}p{margin:0;color:#334155}</style></head>'
    + '<body><main><h1>' + esc(title) + '</h1><p>' + esc(text) + '</p></main></body></html>');
}
module.exports = function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.method !== 'GET') { res.status(405).end(); return Promise.resolve(); }
  var q = req.query || {}, org = A.safeOrg(q.o), recordId = String(q.r || ''), sig = String(q.s || ''), now = Date.now();
  return Promise.resolve().then(function () {
    if (!SB.verifyLink(org, recordId, sig)) return page(res, 404, 'This payment link is not valid', 'Open Plan & billing in your workspace for the current invoice and its link.');
    var db = A.db();
    return (q.cs ? SB.returned(db, org, recordId, String(q.cs), now) : SB.checkout(db, org, recordId, now)).then(function (out) {
      res.setHeader('Location', out.url); res.status(303).end();
    });
  }).catch(function (e) {
    var status = e && e.status || 500;
    if (status >= 500) console.error('[package-pay]', e);
    /* the engine's words name modes and keys; the payer hears what to do */
    var text = status === 404 ? 'This invoice was not found. Open Plan & billing in your workspace for the current one.'
      : status < 500 ? String(e.message || 'This invoice cannot be paid here.')
      : 'Card payments are not available right now. Nothing was charged; try again in a few minutes, or reply to your invoice email.';
    return page(res, status < 500 ? status : 503, status === 409 ? 'This invoice cannot be paid by card now' : 'Payment could not be started', text);
  });
};
