#!/usr/bin/env node
/* scripts/set-portfolio-assessment.js — one workspace's own settings for the
   SITE ASSESSMENT: who decides its funding, and what compute is priced on.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   (2026-11-09, Tommy: "we dont need to send to the marketplace we are
   funding these sites so we essentially need to send this to a list that we
   can approve for funding or not … approved by our finance committe"; "a
   compute pro forma that goes off of what lightsmith energy showed us".)

   What it writes (api/_lib/portfolio/assess.js configOf reads it back, the
   one reader, and the write is refused unless that reader accepts it):
     omega_orgs/{org}/billing/current.portfolioAssessment
       .funding  { mode: 'committee', name, members: [{ name, email }] }
                 the workspace funds its own sites: the finance marketplace
                 stands down and a screened site is submitted to, and decided
                 by, these people (each signs in on that address, verified)
       .funding.attest  { source, keyHash }
                 a connected app the committee may ALSO decide in (Asana):
                 the request is linked to the one record that app's server
                 made for it, and a committee member marking that record
                 done there is the approval. Only the sha256 of the app
                 server's key is stored; the key itself lives in that
                 server's environment and is never given to this script
       .compute  { basis: 'partner', reference?: { revenueUsdPerMwYear, … } }
                 a Nano or Micro pod is priced on the offtake partner's stated
                 per-megawatt figures (compute-contract.js PARTNER.reference),
                 any of them replaced by the workspace's own
       .gates    { minKva, minLeaseYears, irrHurdlePct }
                 the workspace's own screening gates: the transformer it
                 prefers, the lease years it wants left, its hurdle rate
       .closing  { minLeaseYears, agreement }
                 what must be recorded before a site is the workspace's own:
                 purchased, the host agreement assigned, a lease that long
       .review   { name, members: [{ name, email }] }
                 its review board: each member votes own and operate or
                 portfolio / flip, and the decision stands when all agree
     Every other key of portfolioAssessment, and of billing/current, is kept.
     omega_audit: one row, action portfolio-assessment-settings.

   SAFE BY DEFAULT:
   - Default is an OFFLINE DRY RUN against an in-memory store holding a
     stand-in workspace: the write is printed, and what the assessment then
     reads back. No network, no credentials.
   - --apply writes to Firestore as FIREBASE_SERVICE_ACCOUNT when it is set,
     else the Firebase CLI's signed-in account (scripts/_lib/live-admin.js).
     It REFUSES unless --confirm-org repeats --org, unless omega_orgs/{org}
     exists and unless its billing/current exists. It never creates a
     tenant, a user, a member or a billing record, and it never names a
     committee member who is not given here.

   Usage:
     node scripts/set-portfolio-assessment.js --org chileasing.com \
       --member "Barry Drillman <barry@example.com>" --member "Eli N <eli@example.com>" \
       --compute-basis partner
     … --revenue-per-mw-year 22000000      the offtake, once it is known
     … --committee-name "Finance committee"
     … --min-kva 500 --min-lease-years 5    the screening gates
     … --irr-hurdle 25                      the hurdle rate, in percent
     … --closing-lease-years 15 --closing-agreement SHA    the closing steps
     … --review-member "Name <address>"     once a member of the review board
     … --review-name "Executive Review"
     … --attest-source Asana --attest-key-hash <sha256 of the app server's key, 64 hex>
     … --clear-attest                       decisions here only again
     … --clear-funding                      back to the finance marketplace
     … --compute-basis spot                 back to the public reference price
     add --apply --confirm-org chileasing.com to write
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var AS = require('../api/_lib/portfolio/assess');
function arg(n) { var i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; }
function args(n) { var out = []; process.argv.forEach(function (a, i) { if (a === n && process.argv[i + 1] != null) out.push(process.argv[i + 1]); }); return out; }
function has(n) { return process.argv.indexOf(n) >= 0; }
var APPLY = has('--apply'), ORG = String(arg('--org') || '').trim().toLowerCase(), CONFIRM = arg('--confirm-org');
var WHO = 'script:set-portfolio-assessment';
function refuse(code, message) { var e = new Error(message); e.exitCode = code; return e; }

/* "Name <email>" or a bare address */
function member(raw) {
  var m = /^\s*(.*?)\s*<\s*([^<>\s]+)\s*>\s*$/.exec(String(raw)) || [null, '', String(raw).trim()];
  var email = m[2].toLowerCase(), name = m[1].replace(/^["']|["']$/g, '').trim();
  if (!/^[^@\s<>"']+@[^@\s<>"']+\.[a-z]{2,}$/.test(email)) throw refuse(2, '--member "' + raw + '" has no email address: write it as "Name <address>". A committee member decides by signing in on that address.');
  return { name: name || email.split('@')[0], email: email };
}
function money(flag) { var v = arg(flag); if (v == null) return undefined; var n = Number(String(v).replace(/[$,_\s]/g, '')); if (!(n > 0)) throw refuse(2, flag + ' must be a positive number of dollars'); return n; }

/* the change asked for, from the flags */
function asked() {
  var out = { funding: undefined, compute: {}, gates: {}, review: undefined }, members = args('--member').map(member), basis = arg('--compute-basis');
  function figure(flag, lo, hi) { var v = arg(flag); if (v == null) return undefined; var n = Number(String(v).replace(/[%,\s]/g, '')); if (!(n >= lo && n <= hi)) throw refuse(2, flag + ' must be between ' + lo + ' and ' + hi); return n; }
  var gk = { minKva: figure('--min-kva', 1, 1000000), minLeaseYears: figure('--min-lease-years', 0.1, 99), irrHurdlePct: figure('--irr-hurdle', 0, 500) };
  Object.keys(gk).forEach(function (k) { if (gk[k] !== undefined) out.gates[k] = gk[k]; });
  var cy = figure('--closing-lease-years', 1, 99);
  if (cy !== undefined) out.closing = { minLeaseYears: cy, agreement: (arg('--closing-agreement') || 'site host agreement').trim().slice(0, 60) };
  var reviewers = args('--review-member').map(member);
  if (reviewers.length) out.review = { name: (arg('--review-name') || 'Executive Review').trim().slice(0, 60), members: reviewers };
  else if (arg('--review-name')) throw refuse(2, '--review-name needs the board: name each member with --review-member "Name <address>"');
  if (has('--clear-funding')) { if (members.length) throw refuse(2, '--clear-funding and --member do not go together'); out.funding = null; }
  else if (members.length) out.funding = { mode: 'committee', name: (arg('--committee-name') || 'Finance committee').trim().slice(0, 60), members: members };
  else if (arg('--committee-name')) throw refuse(2, '--committee-name needs the committee: name each member with --member "Name <address>"');
  var ah = arg('--attest-key-hash'), asrc = arg('--attest-source');
  if (has('--clear-attest')) { if (ah || asrc) throw refuse(2, '--clear-attest and --attest-key-hash do not go together'); out.attest = null; }
  else if (ah != null || asrc != null) {
    if (!/^[0-9a-f]{64}$/.test(String(ah || ''))) throw refuse(2, '--attest-key-hash is the sha256 of the connected app server’s key: 64 lowercase hex characters. Never the key itself.');
    if (!String(asrc || '').trim()) throw refuse(2, '--attest-key-hash needs --attest-source: the name of the app the committee decides in (Asana)');
    out.attest = { source: String(asrc).trim().slice(0, 30), keyHash: String(ah) };
  }
  if (basis != null) { if (basis !== 'partner' && basis !== 'spot') throw refuse(2, '--compute-basis is partner (the offtake partner’s stated figures) or spot (the public reference price)'); out.compute.basis = basis === 'partner' ? 'partner' : null; }
  var ref = { revenueUsdPerMwYear: money('--revenue-per-mw-year'), capexUsdPerMw: money('--capex-per-mw'), utilityUsdPerMwYear: money('--utility-per-mw-year') };
  Object.keys(ref).forEach(function (k) { if (ref[k] === undefined) delete ref[k]; });
  if (Object.keys(ref).length) out.compute.reference = ref;
  if (out.funding === undefined && out.attest === undefined && out.review === undefined && out.closing === undefined && !Object.keys(out.compute).length && !Object.keys(out.gates).length) throw refuse(2, 'Nothing to set. Name the committee (--member "Name <address>"), the review board (--review-member), a gate (--min-kva, --min-lease-years, --irr-hurdle), the compute basis (--compute-basis partner), or a figure (--revenue-per-mw-year).');
  return out;
}
/* the stored block with the change folded in; every other key kept */
function patch(current, ask) {
  var cur = current && typeof current === 'object' ? JSON.parse(JSON.stringify(current)) : {}, was = JSON.stringify(cur);
  /* naming the committee again keeps the app it also decides in */
  if (ask.funding === null) delete cur.funding; else if (ask.funding) { var kept = cur.funding && cur.funding.attest; cur.funding = ask.funding; if (kept) cur.funding.attest = kept; }
  if (ask.attest === null) { if (cur.funding) delete cur.funding.attest; }
  else if (ask.attest) { if (!cur.funding || cur.funding.mode !== 'committee') throw refuse(2, 'Refusing: a connected app decides for a committee, and this workspace names none. Name it first (--member "Name <address>").'); cur.funding.attest = ask.attest; }
  if (Object.keys(ask.compute).length) {
    cur.compute = cur.compute && typeof cur.compute === 'object' ? cur.compute : {};
    if ('basis' in ask.compute) { if (ask.compute.basis) cur.compute.basis = ask.compute.basis; else delete cur.compute.basis; }
    if (ask.compute.reference) cur.compute.reference = Object.assign({}, cur.compute.reference || {}, ask.compute.reference);
  }
  if (Object.keys(ask.gates).length) cur.gates = Object.assign({}, cur.gates && typeof cur.gates === 'object' ? cur.gates : {}, ask.gates);
  if (ask.review) cur.review = ask.review;
  if (ask.closing) cur.closing = ask.closing;
  /* the one reader must read back exactly what was asked, or nothing is written */
  var read = AS.configOf({ portfolioAssessment: cur });
  if (ask.review && (!read.review || read.review.members.length !== ask.review.members.length)) throw refuse(2, 'Refusing: the assessment would not read that review board back (a repeated or malformed address?).');
  if (ask.closing && (!read.closing || read.closing.minLeaseYears !== ask.closing.minLeaseYears)) throw refuse(2, 'Refusing: the assessment would not read those closing steps back.');
  Object.keys(ask.gates).forEach(function (k) { if (!read.gates || read.gates[k] !== ask.gates[k]) throw refuse(2, 'Refusing: ' + k + ' = ' + ask.gates[k] + ' is outside the range the assessment accepts.'); });
  if (ask.funding && (!read.funding || read.funding.members.length !== ask.funding.members.length)) throw refuse(2, 'Refusing: the assessment would not read that committee back (a repeated or malformed address?).');
  if (ask.attest && !(read.funding && read.funding.attest && read.funding.attest.keyHash === ask.attest.keyHash)) throw refuse(2, 'Refusing: the assessment would not read that connected app back.');
  if (ask.compute.reference) Object.keys(ask.compute.reference).forEach(function (k) { if (read.compute.reference[k] !== ask.compute.reference[k]) throw refuse(2, 'Refusing: ' + k + ' = ' + ask.compute.reference[k] + ' is outside the range the assessment accepts.'); });
  return { changed: JSON.stringify(cur) !== was, config: cur, read: read };
}
async function write(db, org, ask, now) {
  var orgRef = db.collection('omega_orgs').doc(org), orgSnap = await orgRef.get();
  if (!orgSnap.exists) throw refuse(3, 'Refusing: omega_orgs/' + org + ' does not exist. This script never creates a tenant, a user, a member or a billing record.');
  var bref = orgRef.collection('billing').doc('current'), auditRef = db.collection('omega_audit').doc();
  return db.runTransaction(async function (tx) {
    var b = await tx.get(bref);
    if (!b.exists) throw refuse(3, 'Refusing: omega_orgs/' + org + '/billing/current does not exist. The master console writes it when it makes the workspace.');
    var p = patch((b.data() || {}).portfolioAssessment, ask);
    if (p.changed) {
      /* the whole record as just read, with the one block replaced: a merge would keep a key this run removes */
      tx.set(bref, Object.assign({}, b.data() || {}, { portfolioAssessment: p.config }));
      tx.set(auditRef, { action: 'portfolio-assessment-settings', orgId: org, by: WHO, at: now, funding: p.read.funding ? { name: p.read.funding.name, members: p.read.funding.members.map(function (m) { return m.email; }) } : null, computeBasis: p.read.compute.basis || 'spot', reference: p.config.compute && p.config.compute.reference || null,
        alsoDecidedIn: p.read.funding && p.read.funding.attest ? p.read.funding.attest.source : null,
        gates: p.read.gates || null, review: p.read.review ? { name: p.read.review.name, members: p.read.review.members.map(function (m) { return m.email; }) } : null });
    }
    return p;
  });
}
function summary(p) {
  return { changed: p.changed, funding: p.read.funding ? { name: p.read.funding.name, members: p.read.funding.members } : 'none: the finance marketplace',
    alsoDecidedIn: p.read.funding && p.read.funding.attest ? p.read.funding.attest.source : 'nowhere else: decisions are made here', computeBasis: p.read.compute.basis || 'spot (the public reference price)',
    reference: p.read.compute.basis === 'partner' ? AS.referenceOf(p.read) : null,
    gates: p.read.gates || 'none', closing: p.read.closing || 'none', review: p.read.review ? { name: p.read.review.name, members: p.read.review.members } : 'none' };
}

(async function () {
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(ORG)) throw refuse(2, 'Name the workspace: --org <orgId> (its email domain, for example chileasing.com).');
  var ask = asked(), now = new Date().toISOString();
  if (!APPLY) {
    var H = require('./tests/_portfolio-fakes'), st = H.store(), home = 'omega_orgs/' + ORG;
    st.data[home] = { name: '(stand-in workspace for the dry run)', status: 'active' };
    st.data[home + '/billing/current'] = { tier: 'enterprise', portfolioAssessment: { bess: { bessPricePerKwh: 180 } } };
    var first = await write(st.db, ORG, ask, now), second = await write(st.db, ORG, ask, now);
    var sample = AS.assess({ address: { state: 'OK', zip: '74834' }, transformerKva: 1500 }, { config: first.read, now: now }).compute;
    console.log(JSON.stringify({ mode: 'dry-run (offline, in-memory)', org: ORG, firstRun: summary(first), secondRunChanged: second.changed, write: { portfolioAssessment: st.data[home + '/billing/current'].portfolioAssessment },
      sample: { site: '1,500 kVA in ZIP 74834', compute: sample.words, basis: sample.economics.basis, irrPct: sample.economics.irrPct, capexUsd: sample.economics.capexUsd } }, null, 2));
    console.log('Nothing was written anywhere. Re-run with --apply --confirm-org ' + ORG + ' to write it.');
    return;
  }
  if (CONFIRM !== ORG) throw refuse(2, 'Refusing: --confirm-org must repeat --org (' + ORG + ').');
  var A = require('../api/_lib/admin');
  require('./_lib/live-admin')(A);
  var res = await write(A.db(), ORG, ask, now);
  console.log(JSON.stringify({ mode: 'APPLIED', org: ORG, result: summary(res) }, null, 2));
  if (!res.changed) console.log('Already set: nothing was written.');
})().catch(function (e) { console.error(e.message); process.exit(e.exitCode || 1); });
