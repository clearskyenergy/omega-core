/* Quote Desk (rfq.html) — render both sides against fixtures.
   The page is built by string concatenation, so the failure mode is markup
   that looks fine in the source and collapses in a browser. Every surface it
   emits is parsed here, and the buttons are checked for being wired to the
   right document. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'rfq.html'), 'utf8');
const code = /<script>\n'use strict';([\s\S]*?)<\/script>/.exec(SRC)[1];

let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }

/* ── the DOM these functions touch, and nothing more ─────────────────── */
const VOID = { input: 1, br: 1, img: 1, hr: 1, meta: 1, link: 1 };
function checkHtml(html, label) {
  const stack = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let m, consumed = 0, bad = null;
  while ((m = re.exec(html))) {
    if (/</.test(html.slice(consumed, m.index))) { bad = 'unparsed "<" at ' + consumed; break; }
    consumed = re.lastIndex;
    const tag = m[2].toLowerCase();
    if (VOID[tag]) continue;
    if (m[1]) { if (stack.pop() !== tag) { bad = 'mismatched </' + tag + '>'; break; } }
    else if (!/\/$/.test(m[3])) stack.push(tag);
  }
  if (!bad && /</.test(html.slice(consumed))) bad = 'trailing unparsed "<"';
  if (!bad && stack.length) bad = 'unclosed <' + stack.join('>, <') + '>';
  ok(!bad, label + (bad ? ' — ' + bad : ''));
}

const DOM = {};
function el(id) {
  return { id, value: '', innerHTML: '', textContent: '', className: '', disabled: false,
           files: [], placeholder: '', href: '', download: '', click() {},
           classList: { _s: new Set(),
             add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
             contains(c) { return this._s.has(c); },
             toggle(c, f) { const has = this._s.has(c);
               const on = f === undefined ? !has : !!f;
               if (on) this._s.add(c); else this._s.delete(c); return on; } } };
}
['who','n-received','n-sent','tab-received','tab-sent','v-received','v-sent','received','sent']
  .forEach(id => { DOM[id] = el(id); });

const sandbox = {
  console,
  document: { getElementById: id => DOM[id] || (DOM[id] = el(id)),
              createElement: () => el(''), body: { appendChild(){}, removeChild(){} } },
  location: { hash: '', href: '' },
  history: { replaceState() {} },
  URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
  Blob: function () {},
  fetch: () => Promise.reject(new Error('no network in the test')),
  confirm: () => true,
  firebase: {
    apps: [], app: () => ({}), initializeApp: () => ({}),
    auth: () => ({ onAuthStateChanged() {} }),
    firestore: () => ({ collection() {}, collectionGroup() {} }),
    storage: () => ({ ref() {} })
  }
};
sandbox.window = sandbox;
sandbox.window.addEventListener = () => {};
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const S = sandbox;
S.MYORG = 'walterswholesale.com';
S.ME = { email: 'quotes@walterswholesale.com', getIdToken: () => Promise.resolve('tok') };

/* ── fixtures ────────────────────────────────────────────────────────── */
const LINES = [
  { category: 'conduit', sku: '', description: '2 in. EMT', qty: 400, unit: 'ft' },
  { category: 'wire', sku: '', description: '#2 AWG THHN, black', qty: 1200, unit: 'ft' }
];
const FULLBOM = {
  _id: 'walterswholesale.com', _rfqId: 'rfq123', vendorOrgId: 'walterswholesale.com',
  scope: 'full-bom', lines: LINES, status: 'sent', customerNumber: 'W-88421',
  ship: { zip: '60123', address: '1200 W Industrial Dr, Elgin IL', state: 'IL' },
  anon: { state: 'IL', sizeKw: 2500 },
  contact: { orgId: 'walters-customer.com', orgName: 'Concord Energy', email: 'pm@concord.com',
             projectName: 'Model Tobacco BESS' },
  projectName: 'Model Tobacco BESS', createdAt: { toMillis: () => 1757000000000 }
};
const ANON = {
  _id: 'walterswholesale.com', _rfqId: 'rfq456', vendorOrgId: 'walterswholesale.com',
  scope: 'line-items', lines: [LINES[0]], status: 'quoted',
  ship: { zip: null, address: null, state: 'IL' }, anon: { state: 'IL', sizeKw: 900 },
  contact: null, projectName: null, createdAt: { toMillis: () => 1756000000000 },
  quote: { fileUrl: 'https://x/q.pdf', fileName: 'Q-1044.pdf', totalUsd: 48200,
           leadTimeDays: 21, validUntil: '2026-10-15', note: 'Freight prepaid.',
           by: 'quotes@walterswholesale.com', at: 1757100000000 }
};

/* ── 1 · received: what a distributor sees ───────────────────────────── */
console.log('received');
S.IN = [FULLBOM, ANON];
S.renderReceived();
const rh = DOM['received'].innerHTML;
checkHtml(rh, 'received markup balances');
ok(/Model Tobacco BESS/.test(rh), 'a named request shows the project');
ok(/Concord Energy/.test(rh), 'a full-BOM request names the customer');
ok(/W-88421/.test(rh), 'the account number is shown');
ok(/1200 W Industrial Dr/.test(rh), 'ship-to is shown');
ok(/Anonymous request/.test(rh), 'a line-item request stays anonymous');
ok(/Customer withheld until you are awarded/.test(rh), 'and says so plainly');
ok(!/pm@concord\.com/.test(rh), 'the customer email is not printed in the list');
ok(/downloadRfqCsv\(0\)/.test(rh) && /downloadRfqCsv\(1\)/.test(rh), 'each row has its own CSV button');
ok(/toggleBom\(0\)/.test(rh), 'open BOM is wired');
ok(/\$48,200/.test(rh), 'a quote already sent is shown back');
ok(/Revise quote/.test(rh), 'a quoted row offers a revision, not a fresh respond');

S.IN = [];
S.renderReceived();
ok(/No quote requests yet/.test(DOM['received'].innerHTML), 'empty state names the org');

/* ── 2 · the CSV a distributor prices from ───────────────────────────── */
console.log('csv');
let csv = null;
S.Blob = function (parts) { csv = parts[0]; };
S.IN = [FULLBOM];
S.downloadRfqCsv(0);
ok(/^Request for Quote/.test(csv), 'CSV leads with what it is');
ok(/\nAccount number,W-88421/.test(csv), 'account number is in the header block');
ok(/\nShip to,"1200 W Industrial Dr, Elgin IL"/.test(csv), 'a comma in the address is quoted');
ok(/\nCustomer,Concord Energy/.test(csv), 'customer named on a full-BOM request');
ok(/Category,SKU,Description,Qty,Unit,Unit price,Extended/.test(csv), 'takeoff header');
ok(/\n"?conduit"?,,2 in\. EMT,400,ft,,/.test(csv), 'a BOM line round-trips');
ok(/Unit price/.test(csv), 'blank price columns are there to fill in');

S.IN = [ANON];
S.downloadRfqCsv(0);
ok(/\nCustomer,Withheld until awarded/.test(csv), 'anonymous request does not leak the customer');

/* ── 3 · sent: the customer's tracker ────────────────────────────────── */
console.log('sent');
S.OUT = [{
  _id: 'rfq123', projectId: 'p1', projectName: 'Model Tobacco BESS',
  bom: LINES, note: 'Needed on site by 15 Oct.',
  ship: { zip: '60123', address: '1200 W Industrial Dr, Elgin IL' },
  requestedBy: 'pm@concord.com', createdAt: { toMillis: () => 1757000000000 },
  _recips: [
    { _id: 'walterswholesale.com', scope: 'full-bom', lines: LINES, status: 'quoted',
      customerNumber: 'W-88421', quote: ANON.quote },
    { _id: 'fenecon.com', scope: 'line-items', lines: [LINES[0]], status: 'sent' },
    { _id: 'cityelectricsupply.com', scope: 'full-bom', lines: LINES, status: 'rejected',
      quote: ANON.quote, decision: { decision: 'rejected', reason: 'Priced elsewhere.',
                                     by: 'pm@concord.com', at: 1757200000000 } }
  ]
}];
S.renderSent();
const sh = DOM['sent'].innerHTML;
checkHtml(sh, 'sent markup balances');
ok(/Model Tobacco BESS/.test(sh), 'project named');
ok(/Needed on site by 15 Oct/.test(sh), 'the note to recipients is shown back');
ok(/walterswholesale\.com/.test(sh) && /fenecon\.com/.test(sh), 'every recipient is listed');
ok((sh.match(/Accept</g) || []).length === 1, 'only the one quoted-and-undecided row offers Accept');
ok(/Awaiting quote/.test(sh), 'a recipient who has not answered says so');
ok(/Priced elsewhere\./.test(sh), 'a decision already made is shown with its reason');
ok(!/decide\('rfq123','cityelectricsupply\.com','accepted'/.test(sh),
   'a declined row cannot be accepted from the page');
ok(/decide\('rfq123','walterswholesale\.com','accepted',0,0\)/.test(sh),
   'Accept names the right rfq and the right vendor');

S.OUT = [];
S.renderSent();
ok(/File RFQ/.test(DOM['sent'].innerHTML), 'empty state says where an RFQ comes from');

/* ── 4 · decisions ───────────────────────────────────────────────────── */
console.log('decisions');
S.OUT = [{ _id: 'rfq123', _recips: [{ _id: 'walterswholesale.com', status: 'quoted', quote: ANON.quote }] }];
S.renderSent();
S.askReason(0, 0, 'inquiry');
ok(DOM['reason0_0'].classList.contains('hide') === false, 'asking a question opens the box');
ok(DOM['reasonBtn0_0'].textContent === 'Send question', 'and relabels the button');
S.sendReason('rfq123', 'walterswholesale.com', 0, 0);
ok(/cannot answer a blank one/.test(DOM['reasonMsg0_0'].textContent),
   'an empty question is refused, because the supplier cannot answer it');

S.askReason(0, 0, 'rejected');
ok(DOM['reasonBtn0_0'].textContent === 'Decline quote', 'declining relabels the button');
DOM['reasonTxt0_0'].value = '';
S.sendReason('rfq123', 'walterswholesale.com', 0, 0);
ok(/Sending/.test(DOM['reasonMsg0_0'].textContent),
   'a decline with no reason goes through — making somebody justify a no is how you stop getting them');

/* ── 5 · tabs ────────────────────────────────────────────────────────── */
console.log('tabs');
S.IN = []; S.OUT = [{}]; S.IS_SUPPLIER = false;
S.location.hash = '';
S.pickTab();
ok(DOM['v-sent'].classList.contains('hide') === false, 'nothing received → opens on Sent');
ok(DOM['tab-received'].classList.contains('hide') === true,
   'a plain customer is not shown a tab that will always be empty');
S.IN = [{}];
S.pickTab();
ok(DOM['v-received'].classList.contains('hide') === false, 'requests waiting → opens on Received');
ok(DOM['tab-received'].classList.contains('hide') === false, 'and the tab appears');
S.IN = []; S.OUT = []; S.IS_SUPPLIER = true;
S.pickTab();
ok(DOM['tab-received'].classList.contains('hide') === false,
   'a distributor waiting for its first request still gets the tab');
ok(DOM['v-received'].classList.contains('hide') === false, 'and lands on it');
S.IN = [{}]; S.OUT = [{}];
S.location.hash = '#sent';
S.pickTab();
ok(DOM['v-sent'].classList.contains('hide') === false, 'a hash in the link wins');

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
