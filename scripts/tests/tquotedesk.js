/* Quote Desk (rfq.html) — render both sides against fixtures.
   The page is built by string concatenation, so the failure mode is markup
   that looks fine in the source and collapses in a browser. Every surface it
   emits is parsed here, and the buttons are checked for being wired to the
   right document.
   Run in a US time zone on purpose: a date-only value (a quote's valid-until,
   YYYY-MM-DD) parsed as an instant reads a day early west of UTC, which a
   UTC test machine would never show. */
process.env.TZ = 'America/Chicago';
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

/* ── the customer-quote door, answered in memory ─────────────────────── */
let CALLS = [], ROUTE = null;
function answer(status, body) { return Promise.resolve({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(body == null ? '' : JSON.stringify(body)) }); }
function door(url, opts) {
  opts = opts || {};
  const call = { url, method: opts.method || 'GET', auth: opts.headers && opts.headers.Authorization, body: opts.body ? JSON.parse(opts.body) : null };
  CALLS.push(call);
  return ROUTE ? ROUTE(call) : Promise.reject(new Error('no route'));
}
function customerFlows() {
  console.log('customer quote actions');
  const TV = { quote: { id: 'qt-aaaaaaaaaaaaaaaa', quoteNo: 'NW-Q-20261001-A1B2C', status: 'viewed', price: { total: '$412,500' }, seller: { name: 'Northwind' },
    internal: { cost: { total: '$355,000', lo: '$301,000', hi: '$426,000', divisions: [{ name: 'Electrical', amount: '$88,000' }], estimateClassPlain: 'Screening estimate (Class 4)' }, markupPct: 16.2, margin: '$57,500', marginPct: '13.9%' },
    acceptance: { sentTo: 'pat@elgincold.example' }, mailState: 'sent', handoff: null, events: [{ at: 1759330800000, what: 'sent' }, { at: 1759417200000, what: 'viewed' }] },
    ladder: { steps: [{ key: 'saved', label: 'Quote saved', state: 'done' }, { key: 'sent', label: 'Sent', state: 'done' }, { key: 'viewed', label: 'Viewed', state: 'current' }, { key: 'approved', label: 'Approved', state: 'todo' }], current: 'viewed', complete: false, off: null } };
  const LIST = { quotes: [Object.assign({}, CQS[0]), Object.assign({}, CQS[2])], logic: { on: true, canAdd: false, url: '/omega-logic?org=northwind.example', module: 'logic-office' } };
  S.fetch = door;
  S.ME = { email: 'dana@northwind.example', getIdToken: () => Promise.resolve('tok-1') };
  ROUTE = c => c.method === 'GET' && c.url === '/api/customer-quote?list=1' ? answer(200, LIST) : answer(500, { error: 'unexpected ' + c.method + ' ' + c.url });
  CALLS = [];
  return S.loadCustomer().then(() => {
    ok(CALLS.length === 1 && CALLS[0].url === '/api/customer-quote?list=1' && CALLS[0].auth === 'Bearer tok-1', 'the list is one authenticated GET; the server resolves the workspace (no org in the address)');
    ok(S.CQ.length === 2 && DOM['n-customer'].textContent === 2, 'the tab counts what came back');
    ok(S.CQ_LOGIC && S.CQ_LOGIC.on === true && S.CQ_LOGIC.url === '/omega-logic?org=northwind.example', 'and keeps what the door says of Omega Logic');
    /* a missing route or a refusal is said, never thrown */
    ROUTE = () => answer(403, { error: 'Not your workspace' });
    return S.loadCustomer();
  }).then(() => {
    ok(S.CQ.length === 0 && /Not your workspace/.test(DOM['customer'].innerHTML), 'a refused list reads as nothing, with the reason');
    ok(S.CQ_LOGIC === null, 'and claims nothing about Omega Logic');
    ROUTE = () => answer(404, null);
    return S.loadCustomer();
  }).then(() => {
    ok(/not available on this deployment yet/.test(DOM['customer'].innerHTML), 'a door that is not deployed says so');
    ROUTE = c => c.url === '/api/customer-quote?list=1' ? answer(200, LIST) : answer(500, {});
    return S.loadCustomer();
  }).then(() => {
    /* send: a fresh send id, the delivery chosen, the link shown once */
    let sent = null;
    ROUTE = c => {
      if (c.method === 'POST' && c.body.action === 'send') { sent = c.body; return answer(200, { ok: true, url: 'https://northwind.example/quote?id=qt-aaaaaaaaaaaaaaaa&key=' + 'f'.repeat(48), mailState: 'manual', quote: TV.quote }); }
      return answer(200, LIST);
    };
    DOM['cqSend0'] = el('cqSend0'); DOM['cqSend0'].classList.add('hide');   /* as the card draws it */
    S.cqToggleSend(0);
    ok(DOM['cqSend0'].classList.contains('hide') === false, 'Resend opens the send panel');
    DOM['cqDelLink0'] = Object.assign(el('cqDelLink0'), { checked: true });
    DOM['cqNote0'] = Object.assign(el('cqNote0'), { value: '  Here is the revised proposal.  ' });
    return S.cqSend(0).then(() => {
      ok(sent && sent.action === 'send' && sent.id === 'qt-aaaaaaaaaaaaaaaa' && sent.deliver === 'link' && sent.message === 'Here is the revised proposal.', 'Send posts the quote, the delivery and the message');
      ok(/^[A-Za-z0-9_-]{8,64}$/.test(sent.sendId), 'with a send id the door accepts');
      const after = DOM['customer'].innerHTML;
      checkHtml(after, 'the card with its link balances');
      ok(/id="cqLink0" value="https:\/\/northwind\.example\/quote\?id=qt-aaaaaaaaaaaaaaaa&amp;key=f{48}"/.test(after) && /cqCopy\(0\)">Copy link</.test(after), 'straight after the send, the link and Copy link');
      ok(!/cqLink1/.test(after), 'only on the quote just sent');
      ok(/Copy it and send it yourself: it is shown only now/.test(DOM['cqMsg0'].textContent), 'a link-only send says it is shown once');
      const first = sent.sendId;
      return S.cqSend(0).then(() => ok(sent.sendId !== first, 'the next press is a fresh send id'));
    }).then(() => {
      /* a dropped connection keeps the id (the retry is the same send); a definite answer drops it */
      const ids = [];
      ROUTE = c => { if (c.body && c.body.action === 'send') { ids.push(c.body.sendId); return ids.length === 1 ? Promise.reject(new TypeError('Failed to fetch')) : ids.length === 2 ? answer(502, { error: 'The mail did not go.' }) : answer(200, { ok: true, url: 'https://x/q', mailState: 'sent' }); } return answer(200, LIST); };
      return S.cqSend(0).then(() => S.cqSend(0)).then(() => S.cqSend(0)).then(() => {
        ok(ids[0] === ids[1], 'a retry after a dropped connection repeats the same send id');
        ok(ids[2] !== ids[1], 'after the server answered (mail failed), the next press is a new send');
        ok(/Emailed to the customer/.test(DOM['cqMsg0'].textContent), 'an emailed send says so');
      });
    }).then(() => {
      /* the answer to a link-only send is lost; the retry is the same send id,
         and the door answers that repeat once, with NO link (a link is shown
         only once): the page says so in the server's words, never "Link ready" */
      const NOTE = 'Already sent with this send id; the link is shown only once. Send again for a new link.', ids = [];
      ok(/id="cqLink0"/.test(DOM['customer'].innerHTML), 'the link from the last send is on the card');
      ROUTE = c => { if (c.body && c.body.action === 'send') { ids.push(c.body.sendId); return ids.length === 1 ? Promise.reject(new TypeError('Failed to fetch')) : answer(200, { ok: true, repeat: true, url: null, mailState: 'manual', note: NOTE, quote: TV.quote }); } return answer(200, LIST); };
      DOM['cqDelLink0'].checked = true;
      return S.cqSend(0).then(() => S.cqSend(0)).then(() => {
        ok(ids.length === 2 && ids[0] === ids[1], 'the retry after a lost answer is the same send');
        ok(DOM['cqMsg0'].textContent === NOTE, 'a repeated send says what the server said', DOM['cqMsg0'].textContent);
        ok(!/Link ready|shown only now/.test(DOM['cqMsg0'].textContent), 'never that a link is ready when none came back');
        ok(!/cqLink0/.test(DOM['customer'].innerHTML) && !S.LINKS['qt-aaaaaaaaaaaaaaaa'], 'and the card shows no link: the one from before died with the send that replaced it');
      });
    }).then(() => {
      /* a press kept after a dropped connection belongs to its revision: a
         revision saved since in Prime is a new send, never the old repeat */
      const ids = [];
      ROUTE = c => { if (c.body && c.body.action === 'send') { ids.push(c.body.sendId); return ids.length === 1 ? Promise.reject(new TypeError('Failed to fetch')) : answer(200, { ok: true, url: 'https://x/q2', mailState: 'manual' }); } return answer(200, LIST); };
      return S.cqSend(0).then(() => { S.CQ[0].rev = 2; return S.cqSend(0); }).then(() => {
        ok(ids.length === 2 && ids[0] !== ids[1], 'a send kept for revision 1 is not reused for revision 2');
        ok(/Link ready/.test(DOM['cqMsg0'].textContent) && /id="cqLink0" value="https:\/\/x\/q2"/.test(DOM['customer'].innerHTML), 'and a send that made a link shows it');
      });
    });
  }).then(() => {
    /* a page reload forgets the link: nothing is kept anywhere */
    ok(!/localStorage|sessionStorage|indexedDB/.test(SRC.slice(SRC.indexOf('var LINKS'), SRC.indexOf('function cqDetailHtml'))), 'the link lives in memory only');
    /* print: the tenant view, drawn by the one deck */
    let printed = null;
    S.OmegaQuoteDeck = { print: v => { printed = v; return true; } };
    ROUTE = c => c.url === '/api/customer-quote?id=qt-aaaaaaaaaaaaaaaa' ? answer(200, TV) : answer(200, LIST);
    CALLS = [];
    return S.cqPrint(0).then(() => {
      ok(CALLS[0].method === 'GET' && CALLS[0].url === '/api/customer-quote?id=qt-aaaaaaaaaaaaaaaa', 'Print reads the one quote');
      ok(printed && printed.quoteNo === TV.quote.quoteNo && printed.internal.margin === '$57,500', 'and hands the quote it read to OmegaQuoteDeck.print');
    });
  }).then(() => {
    /* details: the rep's numbers, the ladder and the log */
    DOM['cqDet0'] = el('cqDet0'); DOM['cqDet0'].classList.add('hide');   /* as the card draws it */
    return S.cqDetails(0).then(() => {
      const d = DOM['cqDet0'].innerHTML;
      checkHtml(d, 'details markup balances');
      ok(/\$355,000/.test(d) && /\$301,000 – \$426,000/.test(d) && /16\.2%/.test(d) && /\$57,500 · 13\.9%/.test(d), 'details show cost, range, markup and margin');
      ok(/pat@elgincold\.example/.test(d) && /Emailed/.test(d), 'who it went to and how');
      ok(/<li class="done"[^>]*>Quote saved<\/li>/.test(d) && /<li class="current"[^>]*>Viewed<\/li>/.test(d) && /<li class=""[^>]*>Approved<\/li>/.test(d), 'the ladder, step by step');
      ok(/never shown to the customer/.test(d), 'and says the numbers stay internal');
      S.cqDetails(0);
      ok(DOM['cqDet0'].classList.contains('hide'), 'Details toggles closed');
    });
  }).then(() => {
    /* withdraw and retry */
    const posts = [];
    ROUTE = c => { if (c.method === 'POST') { posts.push(c.body); return answer(200, c.body.action === 'handoff' ? { ok: true, handoff: { orderId: 'prime_x', orderNo: 'CLEANCELL-20261017-ABCDE' } } : { ok: true }); } return answer(200, LIST); };
    return S.cqWithdraw(0).then(() => S.cqRetry(0)).then(() => {
      ok(posts[0].action === 'withdraw' && posts[0].id === 'qt-aaaaaaaaaaaaaaaa', 'Withdraw posts the quote');
      ok(posts[1].action === 'handoff' && posts[1].id === 'qt-aaaaaaaaaaaaaaaa', 'Retry hand-off posts the quote');
      ok(/Order CLEANCELL-20261017-ABCDE is in Omega Logic\./.test(DOM['cqMsg0'].textContent), 'and names the order it made');
    });
  }).then(() => {
    /* the workspace is the claim, then the email domain */
    return Promise.all([
      S.homeOrg({ email: 'tommy@gmail.com', getIdTokenResult: () => Promise.resolve({ claims: { orgId: 'Tommy-Solar' } }) }),
      S.homeOrg({ email: 'ops@fenecon.de', getIdTokenResult: () => Promise.resolve({ claims: {} }) }),
      S.homeOrg({ email: 'a@walterswholesale.com', getIdTokenResult: () => Promise.reject(new Error('offline')) }),
      S.homeOrg({ email: 'b@concordenergyusa.com' })
    ]).then(r => {
      ok(r[0] === 'tommy-solar', 'a personal workspace is its claim, never gmail.com');
      ok(r[1] === 'fenecon.com', 'no claim: the email domain, folded');
      ok(r[2] === 'walterswholesale.com' && r[3] === 'concordenergyusa.com', 'a token that cannot be read falls back to the domain');
    });
  });
}

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
  distributors: [{ orgId: 'walterswholesale.com', name: 'Walters Wholesale' }],
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

/* ── 6 · the OEM's side: who is the order going through? ─────────────── */
console.log('oem channel');
const OEM = {
  _id: 'fenecon.com', _rfqId: 'rfq789', vendorOrgId: 'fenecon.com',
  scope: 'line-items', status: 'sent',
  lines: [{ category: 'bess', sku: 'FEN-HOME-30', description: 'FENECON Home 30', qty: 4, unit: 'ea' }],
  ship: { zip: '60123', address: '1200 W Industrial Dr, Elgin IL', state: 'IL' },
  anon: { state: 'IL', sizeKw: 2500 }, contact: null, projectName: null,
  distributors: [{ orgId: 'walterswholesale.com', name: 'Walters Wholesale' }],
  createdAt: { toMillis: () => 1757000000000 }
};
S.IN = [OEM];
S.renderReceived();
const oh = DOM['received'].innerHTML;
checkHtml(oh, 'OEM card markup balances');
ok(/Buying through/.test(oh), 'the card says the order goes through somebody');
ok(/Walters Wholesale/.test(oh), 'and names the distributor the customer picked');
ok(/walterswholesale\.com/.test(oh), 'with the orgId, so it is unambiguous');
ok(/point of contact/i.test(oh), 'and says what that name is for');
ok(/Anonymous request/.test(oh), 'the customer is still withheld from the factory');

/* a distributor is never told who else is bidding the same package */
S.IN = [Object.assign({}, FULLBOM, { distributors: null })];
S.renderReceived();
ok(!/Buying through/.test(DOM['received'].innerHTML),
   'a full-BOM recipient is shown no channel block — it IS the channel');

/* asked directly, with no distributor on the request */
S.IN = [Object.assign({}, OEM, { distributors: [] })];
S.renderReceived();
ok(/asked you directly/.test(DOM['received'].innerHTML),
   'no distributor selected says so rather than showing an empty box');

/* an RFQ filed before this existed must not claim anything */
S.IN = [Object.assign({}, OEM, { distributors: undefined })];
S.renderReceived();
const legacy = DOM['received'].innerHTML;
ok(!/Buying through/.test(legacy) && !/asked you directly/.test(legacy),
   'an older request with no record of it stays silent rather than guessing');

/* and the CSV carries the same fact */
S.IN = [OEM];
S.downloadRfqCsv(0);
ok(/\nBuying through,Walters Wholesale/.test(csv), 'CSV names the distributor');
S.IN = [Object.assign({}, OEM, { distributors: [] })];
S.downloadRfqCsv(0);
ok(/\nBuying through,Direct — no distributor on this request/.test(csv),
   'CSV is explicit when there is none');
S.IN = [FULLBOM];
S.downloadRfqCsv(0);
ok(!/Buying through/.test(csv), 'a distributor CSV does not list its competitors');

/* ── 8 · customer quotes: the seller's own proposals (api/customer-quote) ── */
console.log('customer quotes');
ok(['draft','approved','expired','withdrawn'].every(k => S.STATUS[k]), 'STATUS knows draft, approved, expired and withdrawn');
ok(/>Awaiting quote</.test(S.statusChip('sent')) && />Sent</.test(S.statusChip('sent', 'customer')) && />Viewed</.test(S.statusChip('viewed', 'customer')),
   'a customer quote that is sent reads Sent; an RFQ still reads Awaiting quote');
ok(/chip ok">Approved</.test(S.statusChip('approved', 'customer')) && /chip none">Withdrawn</.test(S.statusChip('withdrawn')), 'approved is good news, withdrawn is quiet');
const DAYMS = 86400000, T0 = Date.UTC(2026, 9, 1, 15);
const CQS = [
  { id: 'qt-aaaaaaaaaaaaaaaa', quoteNo: 'NW-Q-20261001-A1B2C', rev: 1, status: 'viewed', customer: { name: 'Pat Kim', company: 'Elgin Cold Storage' },
    site: '1200 W Industrial Dr, Elgin, IL', sellTotal: '$412,500', sentAt: T0, viewedAt: T0 + DAYMS, lastViewedAt: T0 + 3 * DAYMS, viewCount: 3,
    decidedAt: null, validUntil: T0 + 30 * DAYMS, projectId: 'p-elgin', stale: true, stage: { key: 'viewed', label: 'Viewed by the customer' } },
  { id: 'qt-bbbbbbbbbbbbbbbb', quoteNo: 'NW-Q-20260920-D3E4F', rev: 2, status: 'approved', customer: { name: 'Lee Park', company: '' },
    site: { address: '9 Harbor Rd, Waukegan, IL' }, sellTotal: '$1,180,000', sentAt: T0 - 9 * DAYMS, viewedAt: T0 - 8 * DAYMS, viewCount: 1,
    decidedAt: T0 - 7 * DAYMS, validUntil: T0 + 20 * DAYMS, projectId: 'p-harbor', stale: false, stage: { key: 'ordered', label: 'In Omega Logic · awaiting price' },
    handoff: { error: 'Clean Cell has not published this unit yet.' } },
  { id: 'qt-cccccccccccccccc', quoteNo: 'NW-Q-20261002-0G1H2', rev: 1, status: 'draft', customer: { company: 'Maple Yard' }, site: '', sellTotal: '$96,000',
    sentAt: null, viewCount: 0, projectId: 'p-maple', stale: false, stage: { key: 'saved', label: 'Quote saved' } },
  { id: 'qt-dddddddddddddddd', quoteNo: 'NW-Q-20260801-9Z8Y7', rev: 1, status: 'approved', customer: { company: 'Mill Co' }, sellTotal: '$300,000',
    sentAt: T0 - 60 * DAYMS, viewCount: 2, viewedAt: T0 - 59 * DAYMS, decidedAt: T0 - 55 * DAYMS, projectId: 'p-mill', stage: { key: 'teleios', label: 'Omega Teleios · complete' },
    handoff: { orderNo: 'PRM-20260801-ABC123', error: null, logicUrl: '/omega-logic?org=northwind.example&order=prime_abc123#orders' } },
  { id: 'qt-eeeeeeeeeeeeeeee', quoteNo: 'NW-Q-20260901-WITHD', rev: 1, status: 'withdrawn', customer: { company: '<b>Gone</b> & Co' }, sellTotal: '$1', projectId: 'p-gone',
    handoff: { orderNo: 'X', error: null, logicUrl: 'javascript:alert(1)//?org=a&order=b#orders' } }
];
S.CQ = CQS; S.CQ_FAILED = '';
S.nowMs = () => T0;   /* the fixtures' own day, so nothing here lapses with the calendar */
S.renderCustomer();
const ch = DOM['customer'].innerHTML;
checkHtml(ch, 'customer quotes markup balances');
ok(/NW-Q-20261001-A1B2C · rev 1 — Elgin Cold Storage/.test(ch), 'a row names the quote, its revision and the company');
ok(/1200 W Industrial Dr, Elgin, IL · <b>\$412,500<\/b> · Pat Kim/.test(ch), 'the site, the sell total as the server formatted it, and the contact');
ok(/9 Harbor Rd, Waukegan, IL/.test(ch) && /— Lee Park</.test(ch), 'a site object reads its address; a quote with no company is named by the person');
ok(/Sent [A-Z][a-z]{2} 1, 2026 · Viewed 3× · last [A-Z][a-z]{2} 4, 2026 · Valid until/.test(ch), 'sent, viewed (count and last) and valid until');
ok(/Approved [A-Z][a-z]{2} 2[34], 2026/.test(ch), 'the decided date on an approved one');
ok(/Not sent yet/.test(ch), 'a draft says it has not gone');
ok(/class="stage">In Omega Logic · awaiting price</.test(ch) && /class="stage done">Omega Teleios · complete</.test(ch), 'the ladder\'s current label, with Teleios marked complete');
ok(/chip stale"[^>]*>Design changed</.test(ch) && /save the quote again before you send it/.test(ch), 'a stale quote is flagged and says what to do');
ok((ch.match(/chip stale/g) || []).length === 1, 'and only the stale one');
ok(/href="\/omega-prime\?id=p-elgin&amp;step=quote&amp;quote=qt-aaaaaaaaaaaaaaaa">Open in Prime</.test(ch), 'Open in Prime resumes the project on that quote\'s Proposal step');
ok(/href="\/omega-prime\?id=p-harbor&amp;step=track&amp;quote=qt-bbbbbbbbbbbbbbbb">Open in Prime</.test(ch), 'and an approved one on its Track');
ok(/cqToggleSend\(0\)">Resend</.test(ch) && /cqToggleSend\(2\)">Send</.test(ch), 'a viewed quote offers Resend, a draft offers Send');
ok(!/cqToggleSend\(1\)/.test(ch) && !/cqToggleSend\(3\)/.test(ch) && !/cqToggleSend\(4\)/.test(ch), 'an approved or withdrawn quote is never re-sent from here');
ok(/cqWithdraw\(0\)/.test(ch) && /cqWithdraw\(2\)/.test(ch) && !/cqWithdraw\(1\)/.test(ch) && !/cqWithdraw\(4\)/.test(ch), 'Withdraw is offered while the customer can still decide');
ok(/cqRetry\(1\)">Retry hand-off</.test(ch) && (ch.match(/Retry hand-off/g) || []).length === 1 && /did not reach Omega Logic: Clean Cell has not published this unit yet\./.test(ch), 'a failed hand-off says why and offers Retry');
ok(/cqPrint\(0\)/.test(ch) && /cqPrint\(4\)/.test(ch), 'every quote can be printed');
ok(/<a class="btn ghost" href="\/omega-logic\?org=northwind\.example&amp;order=prime_abc123#orders">Open in Omega Logic<\/a>/.test(ch), 'an approved quote with its order opens it in THIS workspace’s Omega Logic, on the order');
ok((ch.match(/Open in Omega Logic/g) || []).length === 1, 'only where the server named the order: not before the hand-off, not on a failed one');
ok(!/javascript:/i.test(ch), 'a link that is not the Omega Logic address is never followed');
const detOk = S.cqDetailHtml({ quote: { handoff: { orderNo: 'PRM-20260801-ABC123', logicUrl: '/omega-logic?org=northwind.example&order=prime_abc123#orders', procure: { mfr: 'CleanCell US' } } } });
ok(/<a href="\/omega-logic\?org=northwind\.example&amp;order=prime_abc123#orders">Order PRM-20260801-ABC123 · Open in Omega Logic<\/a>/.test(detOk) && /battery bought in from CleanCell US/.test(detOk), 'Details links the order in Omega Logic and says the battery is bought in');
const detBad = S.cqDetailHtml({ quote: { handoff: { orderNo: 'PRM-1', logicUrl: 'https://evil.example/omega-logic?org=a&order=b#orders' } } });
ok(/Order PRM-1/.test(detBad) && !/evil\.example/.test(detBad), 'and never a link the server did not shape');
ok(!/Copy link/.test(ch) && !/cqLink/.test(ch), 'no link is shown that was not just made');
ok(!/<b>Gone<\/b>/.test(ch) && /&lt;b&gt;Gone&lt;\/b&gt; &amp; Co/.test(ch), 'a customer name is escaped');
/* a valid-until DATE (the list sends YYYY-MM-DD) is a calendar day: never a
   day early west of UTC (this runs in Chicago), lasting to the end of that
   UTC day, as the server holds it and the proposal prints it */
ok(S.when('2026-11-16') === 'Nov 16, 2026' && S.untilText('2026-11-16') === 'Nov 16, 2026', 'a date-only value reads as itself in Chicago: ' + S.when('2026-11-16'));
ok(S.untilText(Date.UTC(2026, 10, 16, 3)) === 'Nov 16, 2026', 'an instant given for a valid-until reads as its UTC day (the evening of the 15th in Chicago)');
ok(S.untilMs('2026-11-16') === Date.UTC(2026, 10, 17) - 1, 'and lasts to the end of that UTC day');
const VQ = { id: 'qt-ffffffffffffffff', quoteNo: 'NW-Q-20261017-VALID', rev: 1, status: 'sent', customer: { company: 'Valid Co' }, sellTotal: '$10',
  sentAt: Date.UTC(2026, 9, 17, 15), viewCount: 0, validUntil: '2026-11-16', projectId: 'p-v' };
function cardFor(q, now) { S.nowMs = () => now; S.CQ = [q]; S.renderCustomer(); return DOM['customer'].innerHTML; }
ok(/Valid until Nov 16, 2026/.test(cardFor(VQ, Date.UTC(2026, 10, 10, 15))), 'the card prints the date the customer was given');
ok(/Valid until Nov 16, 2026/.test(cardFor(VQ, Date.UTC(2026, 10, 16, 23, 30))), 'still valid late on its last day');
ok(/Expired Nov 16, 2026/.test(cardFor(VQ, Date.UTC(2026, 10, 17, 0, 30))) && !/Valid until/.test(DOM['customer'].innerHTML), 'past the end of that day it reads expired, never valid');
/* an approved quote is never told to save again (the door refuses to edit
   it), and an approval whose hand-off never got recorded is retried here */
const AQ = { id: 'qt-1111111111111111', quoteNo: 'NW-Q-20261010-APPRV', rev: 3, status: 'approved', customer: { company: 'Won Co' }, sellTotal: '$500,000',
  sentAt: T0, decidedAt: T0 + DAYMS, projectId: 'p-won', stale: true, stage: { key: 'approved', label: 'Approved' }, handoff: null };
const ah = cardFor(AQ, T0 + 2 * DAYMS);
checkHtml(ah, 'an approved card balances');
ok(!/chip stale/.test(ah) && !/Design changed/.test(ah) && !/save the quote again/.test(ah), 'an approved quote whose design moved on has no "Design changed" and no "save it again"');
ok(/changed after this quote was approved/.test(ah) && /a change is a new proposal/.test(ah), 'it says a change is a new proposal');
ok(/cqRetry\(0\)">Retry hand-off</.test(ah) && /The order has not reached Omega Logic yet/.test(ah), 'an approval with no hand-off on record offers Retry, and says the order is not there yet');
const made = cardFor(Object.assign({}, AQ, { stale: false, handoff: { orderNo: 'PRM-1', error: null, logicUrl: null } }), T0);
ok(!/Retry hand-off/.test(made) && !/new proposal/.test(made), 'one whose order is made offers no retry, and one that did not move says nothing of it');
ok(/chip stale/.test(cardFor(Object.assign({}, VQ, { status: 'declined', stale: true }), T0)), 'a declined quote that moved can still be saved, so it is flagged');
ok(/Not handed off yet/.test(S.cqDetailHtml({ quote: { status: 'approved', handoff: null } })), 'Details says an approved quote is not handed off yet');
/* Omega Logic as the door says on every read (logic {on, canAdd, url}):
   on, the order or else the workspace's office; off, the Modules card for an
   owner or administrator, and who to ask for anyone else (no purchase link) */
const REFUSED = Object.assign({}, AQ, { stale: false, handoff: { orderNo: null, error: 'Northwind is not on Omega Logic yet — add Omega Logic to fulfil approved quotes here, then press Retry.', logicUrl: null } });
S.ORG_NAME = 'Northwind';
S.CQ_LOGIC = { on: false, canAdd: true, url: '/workspace#module-logic-office', module: 'logic-office' };
const offAdd = cardFor(REFUSED, T0);
checkHtml(offAdd, 'the card with the offer balances');
ok(/<a class="btn" href="\/workspace#module-logic-office">Add Omega Logic<\/a>/.test(offAdd) && /Omega Logic isn’t on Northwind’s plan yet\. Add it to fulfil approved proposals in your own office\./.test(offAdd), 'not on Omega Logic, for an owner or administrator: Add Omega Logic, and why');
ok(/cqRetry\(0\)">Retry hand-off</.test(offAdd) && /not on Omega Logic yet/.test(offAdd) && !/Open in Omega Logic/.test(offAdd), 'beside the refusal and its retry, and nothing to open');
S.CQ_LOGIC = { on: false, canAdd: false, url: '/workspace#module-logic-office', module: 'logic-office' };
const offAsk = cardFor(REFUSED, T0);
ok(!/Add Omega Logic/.test(offAsk) && !/module-logic-office/.test(offAsk) && /Omega Logic isn’t on your workspace’s plan\. Ask an owner or administrator to add it\./.test(offAsk), 'anyone else is told who to ask, with no purchase link');
S.CQ_LOGIC = { on: false, canAdd: true, url: 'javascript:alert(1)//#module-x' };
const offBad = cardFor(REFUSED, T0);
ok(!/javascript:/i.test(offBad) && !/Add Omega Logic/.test(offBad) && /Ask an owner or administrator/.test(offBad), 'an address the door did not shape is never followed');
ok(!/cq-logic/.test(cardFor(VQ, T0)), 'and a quote that is not approved carries no offer');
S.CQ_LOGIC = { on: false, canAdd: true, url: '/workspace#module-logic-office', module: 'logic-office' };
const offOrder = cardFor(CQS[3], T0);
ok(!/Open in Omega Logic/.test(offOrder) && /Add Omega Logic/.test(offOrder) && !/Retry hand-off/.test(offOrder), 'off the plan, an order on record is not linked (Omega Logic would refuse it): the offer instead, and no retry');
S.CQ_LOGIC = { on: true, canAdd: false, url: '/omega-logic?org=northwind.example', module: 'logic-office' };
ok(/<a class="btn ghost" href="\/omega-logic\?org=northwind\.example">Open in Omega Logic<\/a>/.test(cardFor(AQ, T0)) && /Retry hand-off/.test(DOM['customer'].innerHTML), 'on Omega Logic, an approval not yet handed off opens the workspace’s office, beside the retry');
ok(/href="\/omega-logic\?org=northwind\.example&amp;order=prime_abc123#orders">Open in Omega Logic/.test(cardFor(CQS[3], T0)) && !/cq-logic/.test(DOM['customer'].innerHTML), 'and an order opens on the order');
const dAdd = S.cqDetailHtml({ quote: { status: 'approved', handoff: null }, logic: { on: false, canAdd: true, url: '/workspace#module-logic-office' } });
ok(/Not handed off yet/.test(dAdd) && /<a href="\/workspace#module-logic-office">Add Omega Logic<\/a> to fulfil approved proposals in your own office\./.test(dAdd), 'Details offers it the same way');
const dAsk = S.cqDetailHtml({ quote: { status: 'approved', handoff: { orderNo: 'PRM-1', logicUrl: '/omega-logic?org=a&order=b#orders' } }, logic: { on: false, canAdd: false, url: '/workspace#module-logic-office' } });
ok(/Order PRM-1/.test(dAsk) && !/Open in Omega Logic/.test(dAsk) && /Ask an owner or administrator to add it/.test(dAsk), 'off the plan, Details names the order without a link and says who to ask');
S.CQ_LOGIC = null; S.ORG_NAME = '';
S.nowMs = () => T0;
S.CQ = []; S.renderCustomer();
ok(/No customer quotes yet/.test(DOM['customer'].innerHTML) && /href="\/omega-prime"/.test(DOM['customer'].innerHTML), 'empty: says where a quote comes from');
S.CQ_FAILED = 'Pricing needs Omega Design on this plan.'; S.renderCustomer();
ok(/Pricing needs Omega Design on this plan\./.test(DOM['customer'].innerHTML), 'a refusal is shown in the server\'s words');
S.CQ_FAILED = '';

/* the tab that opens */
S.IN = []; S.OUT = [{}]; S.IS_SUPPLIER = false; S.CQ = CQS; S.location.hash = '';
S.pickTab();
ok(DOM['v-customer'].classList.contains('hide') === false && DOM['v-sent'].classList.contains('hide') === true, 'a workspace with customer quotes opens on them');
S.IN = [{}]; S.pickTab();
ok(DOM['v-customer'].classList.contains('hide') === false, 'even with requests to price waiting');
S.CQ = []; S.location.hash = '#customer'; S.pickTab();
ok(DOM['v-customer'].classList.contains('hide') === false && DOM['tab-customer'].classList.contains('on'), 'the Today link (#customer) opens the tab even when it is empty');
S.CQ = CQS; S.renderCustomer(); S.location.hash = '#customer-qt-bbbbbbbbbbbbbbbb'; DOM['cq-1'] = el('cq-1');
let scrolled = false; DOM['cq-1'].scrollIntoView = function () { scrolled = true; };
S.pickTab();
ok(DOM['v-customer'].classList.contains('hide') === false && DOM['cq-1'].className === 'card focus' && scrolled, 'the decision email\'s link (#customer-<id>) opens the tab on that quote');
ok(/<div class="card" id="cq-1">/.test(DOM['customer'].innerHTML), 'each card carries the anchor it is found by');
S.CQ = []; S.location.hash = ''; S.IN = []; S.OUT = [{}]; S.pickTab();
ok(DOM['v-customer'].classList.contains('hide') === true && DOM['v-sent'].classList.contains('hide') === false, 'no customer quotes: the old rule decides');

/* ── 7 · an OEM gets the desk before its first request ───────────────── */
console.log('who gets the desk');
function roleFor(doc) {
  let stored = null;
  S.db = { collection: () => ({ doc: () => ({ get: () => Promise.resolve(
    { exists: !!doc, data: () => doc }) }) }) };
  return S.loadRole().then(() => S.IS_SUPPLIER);
}
Promise.resolve()
  .then(() => roleFor({ receivesFullBom: true, vertical: 'installer' }))
  .then(v => ok(v === true, 'a flagged distributor is a supplier'))
  .then(() => roleFor({ vertical: 'oem' }))
  .then(v => ok(v === true, 'an OEM qualifies by being an OEM — no second flag to forget'))
  .then(() => roleFor({ vertical: 'developer' }))
  .then(v => ok(v === false, 'a developer is not'))
  .then(() => roleFor(null))
  .then(v => ok(v === false, 'no org record is not'))
  .then(() => customerFlows())
  .then(() => {

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
  });
