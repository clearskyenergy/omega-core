/* The past-due rule, pinned off omega-tenant.js itself (Tommy, 2026-09-28:
   "if someone is over 15 days past due it says that on the dashboard to pay
   their account"). OmegaTenant.pastDue is the ONE rule: the runtime's bar
   on every signed-in page, the home's notice and Today's first row all read
   its answer. The function is cut out of the runtime between its markers, so
   this test runs the shipped words, not a copy.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   node scripts/tests/tpastdue.js */
'use strict';
var fs = require('fs'), path = require('path');
var src = fs.readFileSync(path.join(__dirname, '..', '..', 'omega-tenant.js'), 'utf8');
var m = /\/\* ▶ pastDueOf \*\/([\s\S]*?)\/\* ◀ pastDueOf \*\//.exec(src);
if (!m) { console.log('  FAIL omega-tenant.js no longer carries the pastDueOf markers'); process.exit(1); }
var pastDueOf = Function(m[1] + '; return pastDueOf;')();
var pass = 0, fail = 0, NOW = Date.UTC(2026, 8, 28, 20, 0, 0); /* 2026-09-28, evening */
function ok(msg, c, got) { if (c) { pass++; return; } fail++; console.log('  FAIL ' + msg + (got !== undefined ? '  got: ' + JSON.stringify(got) : '')); }
function rec(extra) { return Object.assign({ tier: 'standard', amountDue: 1299, subscriptionDue: '2026-09-03', paymentProvider: 'stripe', stripeCustomerId: 'cus_x' }, extra || {}); }

var r = pastDueOf(rec(), NOW);
ok('Concord: $1,299 due Sep 3, read on Sep 28, is 25 days past due, names the figure, and with no invoice yet pays on Plan & billing', !!r && r.days === 25 && r.amount === 1299 && r.display === '$1,299' && r.payUrl === null && /25 days past due/.test(r.text) && /\$1,299/.test(r.text) && r.dueOn === Date.UTC(2026, 8, 3), r);
ok('the invoice Stripe holds open for it is the way to pay', pastDueOf(rec({ stripeDue: { state: 'open', hostedUrl: 'https://invoice.stripe.com/i/x' } }), NOW).payUrl === 'https://invoice.stripe.com/i/x');
ok('a paid stripeDue is not a link; ClearSky\'s payment link is next', pastDueOf(rec({ stripeDue: { state: 'paid', hostedUrl: 'https://invoice.stripe.com/i/x' }, paymentLink: 'https://pay.example/p' }), NOW).payUrl === 'https://pay.example/p');
ok('fifteen days past due is not yet past due here', pastDueOf(rec({ subscriptionDue: '2026-09-13' }), NOW) === null);
ok('sixteen days is', pastDueOf(rec({ subscriptionDue: '2026-09-12' }), NOW).days === 16);
ok('a due date still ahead is nothing', pastDueOf(rec({ subscriptionDue: '2026-10-03' }), NOW) === null);
ok('nothing owed is nothing', pastDueOf(rec({ amountDue: 0 }), NOW) === null && pastDueOf(rec({ amountDue: null }), NOW) === null && pastDueOf(rec({ amountDue: 'lots' }), NOW) === null);
ok('no due date on file is nothing', pastDueOf(rec({ subscriptionDue: null }), NOW) === null && pastDueOf(rec({ subscriptionDue: 'soon' }), NOW) === null);
ok('a packaged workspace is the engine\'s, never judged here', pastDueOf(rec({ packaged: true }), NOW) === null);
ok('a Firestore timestamp and a millisecond date read the same', pastDueOf(rec({ subscriptionDue: { seconds: Date.UTC(2026, 8, 3) / 1000 } }), NOW).days === 25 && pastDueOf(rec({ subscriptionDue: Date.UTC(2026, 8, 3) }), NOW).days === 25);
ok('cents show when there are any, thousands are grouped', pastDueOf(rec({ amountDue: 12345.5 }), NOW).display === '$12,345.50' && pastDueOf(rec({ amountDue: 500 }), NOW).display === '$500');
ok('no record is nothing', pastDueOf(null, NOW) === null && pastDueOf(undefined, NOW) === null);

console.log('past due: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
