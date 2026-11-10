#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * The OSA pipeline's Imported deals section and the import columns that fill
 * a deal's drawer (tenants/osa/ingest-data.js, tenants/osa/portfolio.html).
 *
 *  1. The template carries the drawer's fields a sheet can know: categories,
 *     contact, screening rep, OSA budget, files link. An old template without
 *     them still maps.
 *  2. buildRows reads them: a category by key or by the drawer's short label,
 *     a bad email or URL named and left out, never guessed.
 *  3. runImport writes them onto a NEW deal (contact through create(), rep,
 *     budget and the folder link in the second write) and onto an EXISTING one
 *     (rep, budget, categories as a union, the link once), and never touches
 *     the attribution block on an update.
 *  4. The section: which deals count as imported, what "still to fill in"
 *     names, the chips, and that the page renders it and keeps one Import
 *     button.
 *
 *     node scripts/tests/tosaimported.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
let fails = 0, passes = 0;
function ok(cond, name) { if (cond) { passes++; console.log('  ok   ' + name); } else { fails++; console.log('  FAIL ' + name); } }

/* ── the importer, in a sandbox ─────────────────────────────────────── */
const TYPES = [{ key: 'bess', categories: ['bess'] }, { key: 'solar_bess', categories: ['solar', 'bess'] }];
const CATS = [{ key: 'bess', label: 'Battery storage', short: 'BESS' }, { key: 'solar', label: 'Solar', short: 'PV' },
              { key: 'compute', label: 'Data centre', short: 'DC' }];
const created = [], updated = [], patched = [];
let nextId = 0;
const win = {
  CLEARSKY_CONFIG: { portfolio: { projectTypes: TYPES }, partner: { categories: CATS } },
  Portfolio: {
    COLLECTION: 'deals',
    num: function (v) { if (v == null || v === '') return null; const x = Number(String(v).replace(/[,$\s]/g, '')); return isFinite(x) ? x : null; },
    typeOf: function (k) { return TYPES.filter(function (t) { return t.key === k; })[0] || null; },
    normalizeUrl: function (u) {
      let s = String(u || '').trim(); if (!s) return null;
      if (!/^https?:\/\//i.test(s)) { if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(s)) s = 'https://' + s; else return null; }
      return s;
    },
    stamp: function () { return 'now'; },
    create: function (f) { created.push(f); return Promise.resolve({ id: 'new' + (++nextId) }); },
    patch: function (deal, body, note) { patched.push({ deal: deal, body: body, note: note }); return Promise.resolve(); }
  },
  OmegaAccess: { orgName: function (o) { return o; }, me: function () { return { email: 'tj@ogisolar.com', name: 'TJ' }; } }
};
win.window = win;
vm.createContext(win);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'tenants/osa/ingest-data.js'), 'utf8'), win, { filename: 'ingest-data.js' });
const IN = win.Ingest;
IN.init({ collection: function () { return { doc: function (id) { return { update: function (x) { updated.push({ id: id, extra: x }); return Promise.resolve(); } }; } }; } }, null);

console.log('1. the template');
const keys = IN.FIELDS.map(function (f) { return f.key; });
ok(['categories', 'contactName', 'contactEmail', 'rep', 'budgetUsd', 'link'].every(function (k) { return keys.indexOf(k) >= 0; }),
   'it carries categories, contact name and email, screening rep, OSA budget and the files link');
ok(IN.FIELDS.filter(function (f) { return ['categories', 'contactName', 'contactEmail', 'rep', 'budgetUsd', 'link'].indexOf(f.key) >= 0 && f.required; }).length === 0,
   'every new column is optional');
const csv = IN.templateCsv().split('\n')[0];
ok(/Screening rep \(email\)/.test(csv) && /OSA budget \(USD\)/.test(csv) && /Files link/.test(csv), 'the downloaded template has the new headers');
ok(!!IN.mapFromTemplate(['Site name', 'Brought by (email domain)', 'Address']), 'an old template without the new columns still maps');

console.log('2. reading a row');
const H = IN.FIELDS.map(function (f) { return f.header; });
function row(o) { return IN.FIELDS.map(function (f) { return o[f.key] != null ? o[f.key] : ''; }); }
const sheet = { name: 's', rows: [H,
  row({ name: '275 Research Parkway', partnerOrg: 'concordenergyusa.com', clientOrgId: 'concordenergyusa.com',
        address: '275 Research Pkwy Meriden, CT 06450', categories: 'BESS, pv', contactName: 'Pat Doe',
        contactEmail: 'Pat@ConcordEnergyUSA.com', rep: 'Andrew@ClearSky-USA.com', budgetUsd: '$25,000',
        link: 'drive.google.com/drive/folders/abc', monthlyBillUsd: '8400' }),
  row({ name: 'Bad facts', partnerOrg: 'concordenergyusa.com', categories: 'BESS, banana', rep: 'andrew',
        contactEmail: 'nobody', link: 'not a link' })
] };
const tpl = IN.mapFromTemplate(H);
const rows = IN.buildRows(sheet, tpl.map, { headerRow: 0 });
const v = rows[0].values;
ok(rows[0].ok && !rows[0].warnings.length, 'a full row lands with no warnings');
ok(JSON.stringify(v.categories) === '["bess","solar"]', 'categories read by the drawer\'s short label and by key');
ok(v.contactName === 'Pat Doe' && v.contactEmail === 'pat@concordenergyusa.com', 'the contact is read, the email lower-cased');
ok(v.rep === 'andrew@clearsky-usa.com', 'the screening rep is read, lower-cased');
ok(v.budgetUsd === 25000, 'the OSA budget is read as a number');
ok(v.link === 'https://drive.google.com/drive/folders/abc', 'the files link is made a full address');
const w = rows[1].warnings.join(' ');
ok(rows[1].ok, 'bad optional facts never refuse the row');
ok(/Category "banana"/.test(w) && JSON.stringify(rows[1].values.categories) === '["bess"]', 'an unknown category is named and left out');
ok(/Screening rep "andrew"/.test(w) && rows[1].values.rep === '', 'a rep that is not an email is named and left out');
ok(/Contact email "nobody"/.test(w) && rows[1].values.contactEmail === '', 'a contact email that is not one is named and left out');
ok(/Files link "not a link"/.test(w) && !rows[1].values.link, 'a link that is not a web address is named and left out');

console.log('3. writing it');
(async function () {
  await IN.runImport([rows[0]], 'batch-1', null, {});
  const c = created[0], u = updated[0].extra;
  ok(c.contactName === 'Pat Doe' && c.contactEmail === 'pat@concordenergyusa.com', 'a new deal carries the contact through create()');
  ok(JSON.stringify(c.categories) === '["bess","solar"]', '…and its categories');
  ok(u['assignment.rep'] === 'andrew@clearsky-usa.com', 'the second write sets the screening rep');
  ok(u['preDev.budgetUsd'] === 25000, '…the OSA budget');
  ok(u.links && u.links.length === 1 && u.links[0].kind === 'folder' && u.links[0].url === v.link && u.links[0].addedBy === 'tj@ogisolar.com',
     '…and the folder link, in the shape the Files tab lists');
  ok(u.energy.monthlyBillUsd === 8400 && u.importBatch === 'batch-1', 'the existing fields still land');

  const existing = { id: 'd9', categories: ['compute'], links: [{ url: v.link }], origination: { partnerOrg: 'concordenergyusa.com', locked: true } };
  const upd = Object.assign({}, rows[0], { updates: existing });
  await IN.runImport([upd], 'batch-2', null, {});
  const b = patched[0].body;
  ok(b['assignment.rep'] === 'andrew@clearsky-usa.com' && b['preDev.budgetUsd'] === 25000, 'an update writes the rep and the budget');
  ok(JSON.stringify(b.categories) === '["compute","bess","solar"]', '…adds categories without removing one');
  ok(b.links === undefined, '…does not add a link the deal already has');
  ok(!Object.keys(b).some(function (k) { return /^origination/.test(k) || k === 'contactName' || k === 'contactEmail'; }),
     '…and never touches the attribution block');

  /* ── the section ──────────────────────────────────────────────────── */
  console.log('4. the Imported deals section');
  const html = fs.readFileSync(path.join(ROOT, 'tenants/osa/portfolio.html'), 'utf8');
  ok(/<div class="card" id="imp-card">[\s\S]*?<h2>Imported deals<\/h2>/.test(html), 'the pipeline has an Imported deals card');
  const pipe = html.slice(html.indexOf('id="v-pipeline"'), html.indexOf('id="v-partners"'));
  ok((pipe.match(/onclick="doImportReferrals\(\)"/g) || []).length === 1 && /id="imp-card"[\s\S]*doImportReferrals/.test(pipe),
     'one Import button on the page, in the Imported section');
  ok(/renderImported\(\);/.test(html.slice(html.indexOf('function render(){'), html.indexOf('function render(){') + 600)), 'render() draws it');

  const cut = html.slice(html.indexOf('var IMP_KINDS='), html.indexOf('function renderImported(){'));
  const box = { S: { deals: [] }, F: {
      isExit: function (s) { return s === 'dead' || s === 'parked' || s === 'discarded'; },
      stageOf: function (k) { return { referred: { rank: 1, label: 'Referred' }, screening: { rank: 2, label: 'Screening' } }[k] || { rank: 0 }; },
      STAGES: [{ key: 'referred', rank: 1, label: 'Referred' }, { key: 'screening', rank: 2, label: 'Screening' }],
      missingFor: function (d, k) { return k === 'screening' && !d.assignment.rep ? ['assignment.rep'] : []; } },
    fieldLabel: function (p) { return p === 'assignment.rep' ? 'A rep assigned to screen it' : p; } };
  vm.createContext(box); vm.runInContext(cut, box);
  function deal(o) {
    return Object.assign({ id: 'x', stage: 'referred', origination: { channel: '' }, adoptedFrom: '', importBatch: '',
      projectType: 'bess', address: 'a', sizeMw: 1, energy: { monthlyBillUsd: 1, annualKwh: null },
      assignment: { rep: 'r@x.com' }, grid: { score: 80 }, links: [{}] }, o);
  }
  const typed = deal({ id: 'typed', origination: { channel: 'Shareholder introduction' } });
  const sheetD = deal({ id: 'sheet', importBatch: 'f.csv · 2026-10-28' });
  const adopted = deal({ id: 'adopted', adoptedFrom: 'projects', origination: { channel: 'Adopted from Editor projects' },
                         projectType: '', energy: { monthlyBillUsd: null, annualKwh: null }, assignment: { rep: '' }, links: [] });
  const agent = deal({ id: 'agent', importBatch: 'agent:1', origination: { channel: 'Agent' } });
  const intake = deal({ id: 'intake', importBatch: 'intake:1', origination: { channel: 'Intake link' } });
  const gone = deal({ id: 'gone', importBatch: 'f', stage: 'discarded' });
  box.S.deals = [typed, sheetD, adopted, agent, intake, gone];
  ok(box.importSource(typed) === null, 'a deal typed in here is not imported');
  ok(box.importSource(sheetD).k === 'sheet' && box.importSource(adopted).k === 'adopted'
     && box.importSource(agent).k === 'agent' && box.importSource(intake).k === 'intake',
     'a spreadsheet row, an adopted record, an agent upload and an intake-link submission each say where they came from');
  ok(box.importSource(adopted).l === 'Adopted from Editor projects', 'an adopted deal names its source the way the drawer does');
  ok(box.impRows('all').map(function (d) { return d.id; }).join() === 'sheet,adopted,agent,intake', 'All lists every imported deal and not a discarded one');
  ok(box.impRows('adopted').length === 1 && box.impRows('gaps').map(function (d) { return d.id; }).join() === 'adopted', 'the chips filter by source and by what is missing');
  ok(box.importGaps(adopted).join('|') === 'Project type|Bill or annual kWh|Screening rep|Files', 'Still to fill in names what the drawer would show blank');
  ok(box.importGaps(sheetD).length === 0, 'a complete one names nothing');
  const nx = box.nextGate(adopted);
  ok(nx && nx.label === 'Screening' && nx.miss[0] === 'A rep assigned to screen it', 'and the next gate says what it needs, in the drawer\'s words');

  console.log('\n' + passes + ' passed, ' + fails + ' failed');
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
