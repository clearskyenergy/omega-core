/* ═══════════════════════════════════════════════════════════════════════════════
   api/_lib/ai-errors.js — what a tenant is told when the AI provider refuses
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   WHY THIS EXISTS. Anthropic's own refusals are written for the account
   holder, and the account holder is ClearSky, not the customer. Passed
   straight through, "Your credit balance is too low … go to Plans & Billing"
   reads to a tenant as a problem with THEIR OMEGA subscription, and the next
   thing they do is open their account page looking for a bill to pay. Worse,
   "Check ANTHROPIC_API_KEY" names a variable they cannot see and hands a
   customer a piece of our deployment.

   SO: the customer is told the truth at their altitude — the assistant is
   down, it is ours to fix, their plan is fine — and staff are told what to
   do about it. Neither audience sees the provider's own words or the
   provider's name: the server log keeps the exact upstream text, which is
   the only version anyone can act on, and the log is where it belongs.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';

/* A refusal about ClearSky's provider account rather than the request: no
   credit, a spend cap, a suspended organisation. Matched on the message
   because the provider returns 400 for all of them. */
var ACCOUNT_TROUBLE = /credit balance|purchase credits|plans ?& ?billing|billing|quota|insufficient|spend limit|payment|suspended|disabled/i;

/* A provider failure, turned into what each audience should read.
     status   the provider's HTTP status
     raw      the provider's message (may be empty)
     opts     { subject, staff, staffHint }
   Returns { status, message, kind } — status is what the endpoint should
   return, message is what the caller should see. */
function aiFailure(status, raw, opts) {
  opts = opts || {};
  raw = String(raw || '');
  var subject = opts.subject || 'The assistant';
  var kind = (status === 401 || status === 403) ? 'key'
           : ACCOUNT_TROUBLE.test(raw) ? 'account'
           : (status === 429) ? 'busy'
           : 'refused';

  if (kind === 'busy') {
    return { status: 429, kind: kind, message: subject + ' is busy. Wait a moment and try again.' };
  }

  /* Staff get the one sentence that says what to do. Not the provider's
     text and not the provider's name — the exact upstream response is in
     the server log, and a screenshot of this box should be safe to show a
     customer. */
  if (opts.staff) {
    var what = kind === 'account'
      ? subject + ' is down because the AI service account is out of credit. Top up the AI service billing to restore it.'
      : kind === 'key'
      ? subject + ' is down because the AI service key was refused — ' + (opts.staffHint || 'check the AI key on the deployment') + '.'
      : subject + ' is down: the AI service refused the request.';
    return { status: 502, kind: kind, message: what + ' The exact response is in the server log.' };
  }

  /* The customer. Says it is ours, says their plan is fine, promises nothing
     we do not do (nobody is paged by this; do not claim they are). */
  return {
    status: 502, kind: kind,
    message: subject + ' is temporarily unavailable. This is a ClearSky service issue, '
           + 'not your workspace or your plan. Everything else on the site works — try again shortly.'
  };
}

module.exports = { aiFailure: aiFailure, ACCOUNT_TROUBLE: ACCOUNT_TROUBLE };
