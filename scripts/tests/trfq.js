/* File RFQ dialog — does it render, and is the markup it emits well-formed?
   The panel is built by string concatenation with inline onclick handlers,
   which is exactly where a stray apostrophe silently kills a button. This
   renders both surfaces and parses what comes out. */
global.window = global;
const R = require('./rfq.js');
let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }

/* ── the smallest DOM these functions actually touch ─────────────────── */
const VOID = { input: 1, br: 1, img: 1, hr: 1, meta: 1, link: 1 };
function el(id) {
  return { id: id || '', value: '', checked: false, innerHTML: '', textContent: '', disabled: false,
           style: { cssText: '' }, onclick: null,
           appendChild() {}, remove() { delete DOM[this.id]; } };
}
const DOM = {};
global.document = {
  getElementById: id => DOM[id] || null,
  createElement: () => el(),
  body: { appendChild(n) { DOM[n.id] = n; } }
};
global.firebase = { auth: () => ({ currentUser: null }) };
global.showBanner = () => {};
global.siteAddress = () => '1200 W Industrial Dr, Elgin IL 60123';
global._projectId = 'proj_abc';

/* ── a tag-balance + quote check over generated markup ───────────────── */
function checkHtml(html, label) {
  const stack = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let m, consumed = 0, bad = null;
  while ((m = re.exec(html))) {
    if (m.index !== consumed && /</.test(html.slice(consumed, m.index))) {
      bad = 'unparsed "<" before offset ' + m.index; break;
    }
    consumed = re.lastIndex;
    const [, close, tag] = m;
    if (VOID[tag.toLowerCase()]) continue;
    if (close) {
      if (stack.pop() !== tag.toLowerCase()) { bad = 'mismatched </' + tag + '>'; break; }
    } else if (!/\/$/.test(m[3])) stack.push(tag.toLowerCase());
  }
  if (!bad && /</.test(html.slice(consumed))) bad = 'trailing unparsed "<"';
  if (!bad && stack.length) bad = 'unclosed <' + stack.join('>, <') + '>';
  ok(!bad, label + (bad ? ' — ' + bad : ''));
  return !bad;
}

/* ── 1 · the panel offers RFQ even with no manufacturer on the BOM ───── */
console.log('panel');
const bom = { items: [{ sku: '', description: '2in EMT', qty: 400, unit: 'ft', category: 'conduit' }] };
DOM['bom-rfq'] = el('bom-rfq');
R._bomRenderRfq(bom, {}, 1, 1);
const empty = DOM['bom-rfq'].innerHTML;
ok(/openRfqFile\(\)/.test(empty), 'File RFQ is offered with zero partner SKUs');
ok(!/nobody to route it to/.test(empty), 'no longer dead-ends a distributor-only BOM');
checkHtml(empty, 'panel markup balances (no vendors)');

DOM['bom-rfq'] = el('bom-rfq');
R._bomRenderRfq(bom, { 'fenecon.com': { org: 'fenecon.com', name: 'FENECON GmbH',
                                        lines: [{ qty: 2 }, { qty: 1 }] } }, 1, 3);
const withV = DOM['bom-rfq'].innerHTML;
ok(/FENECON/.test(withV), 'manufacturer is listed');
ok(/2 lines/.test(withV), 'line count shown');
checkHtml(withV, 'panel markup balances (with vendors)');

/* ── 2 · the confirm screen ──────────────────────────────────────────── */
console.log('confirm screen');
window._BOM_RFQ = { byVendor: { 'fenecon.com': { org: 'fenecon.com', name: 'FENECON GmbH', lines: [{ qty: 2 }] } },
                    bom: bom };
DOM['pname'] = el('pname'); DOM['pname'].value = 'Model Tobacco BESS';
R.openRfqFile();
const modal = DOM['rfq-file-modal'];
ok(!!modal, 'modal is appended to the body');
const h = modal.innerHTML;
checkHtml(h, 'confirm-screen markup balances');
ok(/Model Tobacco BESS/.test(h), 'project name is shown');
ok(/1200 W Industrial Dr/.test(h), 'site address is prefilled from the drawing');
ok(/id="rfq-zip"[^>]*value="60123"/.test(h), 'ZIP is derived from the address');
ok(/submitRfqFile\(\)/.test(h), 'Send is wired');
ok(/id="rfq-dists"/.test(h), 'distributor slot exists');
ok(!/has not been saved as a project yet/.test(h), 'saved project: no warning');

/* unsaved drawing warns instead of failing at send time */
global._projectId = null;
DOM['rfq-file-modal'] && DOM['rfq-file-modal'].remove();
R.openRfqFile();
ok(/has not been saved as a project yet/.test(DOM['rfq-file-modal'].innerHTML),
   'unsaved drawing is called out up front');

/* ── 3 · validation refuses to send half a request ───────────────────── */
console.log('validation');
DOM['rfq-file-msg'] = el('rfq-file-msg');
R.submitRfqFile();
ok(/Save this drawing as a project/.test(DOM['rfq-file-msg'].innerHTML), 'no project → refused');

global._projectId = 'proj_abc';
DOM['rfq-zip'] = el('rfq-zip'); DOM['rfq-zip'].value = '601';
R.submitRfqFile();
ok(/5-digit site ZIP/.test(DOM['rfq-file-msg'].innerHTML), 'short ZIP → refused');

DOM['rfq-zip'].value = '60123';
window._RFQ_DISTS = [];
window._BOM_RFQ = { byVendor: {}, bom: bom };
R.submitRfqFile();
ok(/at least one distribution partner/.test(DOM['rfq-file-msg'].innerHTML),
   'no manufacturer and no distributor ticked → refused');

/* with a distributor ticked it gets as far as needing a signed-in user */
window._RFQ_DISTS = [{ orgId: 'walterswholesale.com', name: 'Walters Wholesale' }];
DOM['rfq-d-0'] = el('rfq-d-0'); DOM['rfq-d-0'].checked = true;
DOM['rfq-acct-0'] = el('rfq-acct-0'); DOM['rfq-acct-0'].value = 'W-88421';
R.submitRfqFile();
ok(/Sign in first/.test(DOM['rfq-file-msg'].innerHTML), 'distributor ticked → passes validation');

/* ── 4 · ZIP prefill order ───────────────────────────────────────────── */
console.log('zip prefill');
DOM['vs-zip'] = el('vs-zip'); DOM['vs-zip'].value = '60601';
ok(R._rfqPrefillZip() === '60601', 'a zip already entered in the tool wins over the address');
delete DOM['vs-zip'];
ok(R._rfqPrefillZip() === '60123', 'falls back to the trailing zip on the address');

/* ── 5 · the distributor list comes from the API, never from a query ──── */
console.log('distributor list');
let sentBody = null;
global.fetch = (url, opt) => {
  sentBody = JSON.parse(opt.body);
  return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({
    ok: true, distributors: [{ orgId: 'walterswholesale.com', name: "Walters Wholesale" },
                             { orgId: 'cityelectricsupply.com', name: 'City Electric Supply' }] })) });
};
global.firebase = { auth: () => ({ currentUser: { getIdToken: () => Promise.resolve('tok') } }) };
DOM['rfq-dists'] = el('rfq-dists');
R._rfqLoadDistributors();
setTimeout(function () {
  ok(sentBody && sentBody.action === 'distributors', 'asks /api/rfq, not Firestore');
  const dh = DOM['rfq-dists'].innerHTML;
  checkHtml(dh, 'distributor rows balance');
  ok(/Walters Wholesale/.test(dh) && /City Electric Supply/.test(dh), 'both partners listed');
  ok(/id="rfq-acct-0"/.test(dh) && /id="rfq-acct-1"/.test(dh), 'each has its own account field');
  ok(dh.indexOf('</label>') < dh.indexOf('id="rfq-acct-0"'),
     'account field is outside the label, so typing in it cannot untick the partner');
  ok((window._RFQ_DISTS || []).length === 2, 'list is held for submit');

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
}, 0);
