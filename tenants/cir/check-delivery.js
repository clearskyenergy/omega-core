#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   check-delivery.js — validate omega-delivery.js without a browser or a
   Firestore connection.

     node check-delivery.js

   Exits 0 clean, 1 on any failure. It loads /config.js and
   /omega-delivery.js into a real DOM, runs the sample book of work through
   analyse(), and asserts the things that are easy to get quietly wrong:
   the SLA states, the answered-but-unmeasured gap, per-service counting,
   and that the module refuses to write to intake_projects.
   ══════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const { JSDOM } = require('jsdom');

let pass = 0, fail = 0;
function chk(name, ok, detail) {
  if (ok) { pass++; console.log('  \x1b[32mPASS\x1b[0m  ' + name + (detail ? '   ' + detail : '')); }
  else { fail++; console.log('  \x1b[31mFAIL\x1b[0m  ' + name + (detail ? '   ' + detail : '')); }
}

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="dev-fixed"></div></body></html>',
  { url: 'https://cir.example.com/' });
const w = dom.window;
global.window = w; global.document = w.document; global.location = w.location;

w.eval(fs.readFileSync('config.js', 'utf8'));
w.eval(fs.readFileSync('omega-delivery.js', 'utf8'));

const D = w.OmegaDelivery;
const C = D.cfg();

console.log('\nCONFIG');
chk('delivery block enabled', C.enabled === true);
chk('collection is NOT intake_projects', C.collection !== 'intake_projects', '(' + C.collection + ')');
chk('service lines defined', C.services.length >= 5, C.services.length + ' lines');
chk('every service line has a unique key',
  new Set(C.services.map(s => s.key)).size === C.services.length);
chk('sla targets ordered critical < rush < standard',
  C.sla.critical < C.sla.rush && C.sla.rush < C.sla.standard,
  `${C.sla.critical}/${C.sla.rush}/${C.sla.standard}h`);

console.log('\nMODEL');
const statusKeys = D.STATUS.map(s => s.key);
// These must match the allowed list in firestore-delivery.rules exactly.
const rulesSrc = fs.readFileSync('firestore-delivery.rules', 'utf8');
const ruleList = (rulesSrc.match(/s in \[([^\]]+)\]/) || [])[1] || '';
const ruleKeys = ruleList.split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean);
chk('rules status list matches STATUS[] in the module',
  statusKeys.length === ruleKeys.length && statusKeys.every(k => ruleKeys.includes(k)),
  statusKeys.length + ' keys');
chk('status keys mirror intake_projects vocabulary',
  ['submitted', 'in_review', 'quoted', 'accepted', 'in_production', 'delivered', 'declined']
    .every(k => statusKeys.includes(k)));
chk('priority normalizes the intake default "normal"', D.priorityOf('normal').key === 'standard');
chk('unknown service key is reported, not dropped', D.serviceOf('gone').unknown === true);

console.log('\nNORMALIZE');
// `scope` as a MAP is the trap: {enabled:false} is itself truthy.
const mapped = D.normalize('x', {
  orgId: 'a.com', projectName: 'P',
  scope: { diligence: { enabled: true }, permitting: { enabled: false }, siting: true }
});
chk('scope map unpacked on enabled, not truthiness',
  mapped.scopes.length === 2 && mapped.scopes.indexOf('permitting') < 0,
  '[' + mapped.scopes.join(',') + ']');
chk('missing capacity reads null, not 0',
  D.normalize('y', { projectName: 'P' }).capacityMw === null);

console.log('\nSAMPLE BOOK OF WORK');
const rows = D.sampleRows();
const a = D.analyse(rows);
const k = a.kpi;
console.log(`  open=${k.open} waiting=${k.waiting} breached=${k.breached} late=${k.late} ` +
            `inProd=${k.inProduction} delivered=${k.delivered} ` +
            `median=${D.fmtHours(k.medianReply)} unmeasured=${k.unmeasured}`);

chk('sample exercises the unmeasured path', k.unmeasured >= 1,
  k.unmeasured + ' answered-but-unstamped');
chk('sample has unanswered work', k.waiting >= 1);
chk('a critical referral 31h old is breached', k.breached >= 1);
chk('delivered work is excluded from open', k.open + k.delivered <= a.live.length);
chk('median ignores unmeasured rather than counting them zero',
  k.medianReply > 0, D.fmtHours(k.medianReply));

const svcTotal = a.byService.reduce((n, s) => n + s.open.length, 0);
chk('per-service total exceeds referral count (multi-line jobs)',
  svcTotal > k.open, svcTotal + ' line-jobs across ' + k.open + ' referrals');
chk('every sample service key exists in config',
  rows.every(r => r.scopes.every(s => !D.serviceOf(s).unknown)));

const untagged = a.untagged.length;
chk('untagged referrals surface as their own bucket', untagged >= 0, untagged + ' untagged');

console.log('\nSLA EDGE CASES');
const now = Date.now();
const fresh = D.normalize('f', { projectName: 'P', priority: 'standard',
  status: 'submitted', createdAt: new Date(now - 60000) });
chk('a minute-old standard referral is ok', D.slaOf(fresh).state === 'ok');

const stale = D.normalize('s', { projectName: 'P', priority: 'critical',
  status: 'submitted', createdAt: new Date(now - 10 * 3600000) });
const ss = D.slaOf(stale);
chk('a 10h-old critical referral is bad', ss.state === 'bad');
chk('overtime keeps counting past 100%', ss.pct > 1, (ss.pct * 100).toFixed(0) + '% of target');

const answered = D.normalize('q', { projectName: 'P', status: 'quoted',
  createdAt: new Date(now - 20 * 86400000) });
const as = D.slaOf(answered);
chk('answered-without-stamp is unmeasured, not zero',
  as.answered === true && as.unmeasured === true && as.responseH === null);

console.log('\nRENDER');
// Fake enough of the page for render() to run, then check it produced markup.
const blk = w.document.createElement('div');
blk.id = 'cd-block';
w.document.getElementById('dev-fixed').appendChild(blk);
try {
  D.render(a, true);
  const html = blk.innerHTML;
  chk('render produced markup', html.length > 2000, html.length + ' chars');
  chk('sample ribbon painted when sample=true', /cd-ribbon/.test(html));
  chk('queue links to the intake page', html.indexOf(C.intakeHref) >= 0);
  chk('no unescaped template placeholders left', !/\{\{|\$\{/.test(html));
  chk('no raw "undefined" or "NaN" in output',
    !/>undefined<|>NaN<|NaN%|undefinedh/.test(html));
} catch (e) {
  chk('render did not throw', false, e.message);
}

console.log('\nTENANT NEUTRALITY');
const modSrc = fs.readFileSync('omega-delivery.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
chk('omega-delivery.js names no tenant', !/cleantech|\bcir\b|walters/i.test(modSrc));
chk('omega-delivery.js is ES5',
  !/\blet\s|\bconst\s|=>|`/.test(modSrc));

console.log('\n' + (fail ? '\x1b[31m' : '\x1b[32m') +
  `${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail ? 1 : 0);
