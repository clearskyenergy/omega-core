/* What each audience reads when the AI provider refuses.

   The customer must never see ClearSky's provider bill, and — since a staff
   member's screen is what ends up in a screenshot beside a customer — staff
   must not see the provider's name or its raw text either. The server log
   is the only place the exact upstream response belongs. */
const path = require('path');
let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }
const A = require(path.join(__dirname, '..', '..', 'api', '_lib', 'ai-errors.js'));

const RAW = 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.';
const PROVIDER = /anthropic|claude|x-api-key|api[_ ]?key|plans ?& ?billing|platform\.claude/i;

const cust = A.aiFailure(400, RAW, { subject: 'Jarvis' });
ok(cust.status === 502 && cust.kind === 'account', 'no credit is an account failure, returned as 502');
ok(!PROVIDER.test(cust.message) && cust.message.indexOf(RAW) < 0, 'the customer sees neither the provider nor its words');
ok(/not your workspace or your plan/.test(cust.message), 'and is told their plan is fine');

const staff = A.aiFailure(400, RAW, { subject: 'Jarvis', staff: true });
ok(!PROVIDER.test(staff.message) && staff.message.indexOf(RAW) < 0, 'staff see neither the provider nor its raw text');
ok(/out of credit/.test(staff.message) && /server log/.test(staff.message), 'staff are told what is wrong and where the exact response is');

const key = A.aiFailure(401, 'invalid x-api-key', { subject: 'Jarvis', staff: true, staffHint: 'check the platform AI key on the deployment' });
ok(key.kind === 'key' && !PROVIDER.test(key.message.replace(/AI key/g, '')), 'a refused key names no provider and no variable');

const busy = A.aiFailure(429, 'rate limited', { subject: 'Jarvis' });
ok(busy.status === 429 && /busy/.test(busy.message), 'a rate limit is "busy", not an outage');

const fs = require('fs');
['api/jarvis-help.js', 'api/omega-ai-extract.js'].forEach(f => {
  const s = fs.readFileSync(path.join(__dirname, '..', '..', f), 'utf8');
  ok(!/staffHint:[^\n]*ANTHROPIC/.test(s), f + ' does not put the key variable name in the hint');
  ok(/console\.error\('\[[^\]]+\] upstream', r\.status, raw\)/.test(s), f + ' logs the exact upstream text');
});

if (fails) { console.log('taierrors: ' + fails + ' failed'); process.exit(1); }
console.log('taierrors: all passed');
