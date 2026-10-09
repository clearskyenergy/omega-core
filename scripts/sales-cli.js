#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/sales-cli.js — the sales agent's hands (and JARVIS's bin/sales)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Every command is one call to /api/sales or /api/growth with ClearSky's
   machine key (scripts/_lib/sales-client.js: where the key is looked for;
   it is never printed). Output is JSON on stdout, so the agent reads it and
   a person can pipe it to jq. Errors go to stderr with the server's words
   and a non-zero exit.

   READ
     agent                         the morning packet: rules, today, approvals,
                                   demo requests with their words, accounts,
                                   prospects due, what was already done today
     dash                          the dashboard (what JARVIS's Sales view draws)
     board                         the growth board (every workspace, judged)
     prospects [--stage s] [--vertical v] [--state IL] [--q text] [--limit n]
     prospect <id>                 one company and its activity
     candidates [--limit n] [--status new|enriched|skipped]
     activity [--kind k] [--limit n]
     suppressions
     office                       agent profiles and assigned CRM activities
     office-task <file.json|->    claim or finish an assigned activity
     office-mail <file.json|->    read messages or prepare an AgentMail draft

   WRITE (the key needs sales:write)
     upsert <file.json|->          prospects: [ {...} ] or { prospects: [...] }
     resolve <key> <file.json|->   a candidate researched: { domain, contacts, ... }
     skip <key> <reason>           a candidate that is not ours to chase
     log <file.json|->             activity: [ {kind, ...} ] or { entries: [...] }
     stage <prospectId> <stage> [--note text]
     suppress <email|domain> [--reason text]

   CHECK (sales:read)
     screen <email> [<email>...]   may these be written to? (reads the records)
     lint-post <file|-> [--campaign w40-grid]
                                   a LinkedIn post: no prices, no coming-soon
                                   feature sold as live, links tagged; prints
                                   the tagged text to use
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var fs = require('fs');
var C = require('./_lib/sales-client');

var argv = process.argv.slice(2), cmd = argv[0] || 'help', args = [];
var opts = {};
for (var i = 1; i < argv.length; i++) {
  if (argv[i].slice(0, 2) === '--') { opts[argv[i].slice(2)] = argv[i + 1] != null && argv[i + 1].slice(0, 2) !== '--' ? argv[++i] : true; }
  else args.push(argv[i]);
}
function readInput(f) {
  if (!f) throw new Error('a file (or - for stdin) is required');
  var t = f === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(f, 'utf8');
  return t;
}
function readJson(f) { return JSON.parse(readInput(f)); }
function out(x) { process.stdout.write(JSON.stringify(x, null, 2) + '\n'); }

var run = {
  office: function () { return C.get('/api/sales', { view: 'office' }); },
  'office-mail': function () { var x = readJson(args[0]); x.action = 'office-mail'; return C.post(x); },
  'office-task': function () { var x = readJson(args[0]); x.action = 'office-task'; return C.post(x); },
  agent: function () { return C.get('/api/sales', { view: 'agent' }); },
  dash: function () { return C.get('/api/sales'); },
  board: function () { return C.get('/api/growth'); },
  prospects: function () { return C.get('/api/sales', { view: 'prospects', stage: opts.stage, vertical: opts.vertical, state: opts.state, q: opts.q, limit: opts.limit }); },
  prospect: function () { if (!args[0]) throw new Error('prospect <id>'); return C.get('/api/sales', { prospect: args[0] }); },
  candidates: function () { return C.get('/api/sales', { view: 'candidates', status: opts.status, limit: opts.limit }); },
  activity: function () { return C.get('/api/sales', { view: 'activity', kind: opts.kind, limit: opts.limit }); },
  suppressions: function () { return C.get('/api/sales', { view: 'suppressions' }); },
  upsert: function () {
    var x = readJson(args[0]), list = Array.isArray(x) ? x : (x.prospects || []);
    return C.chunks(list, 200).reduce(function (p, part) {
      return p.then(function (acc) { return C.post({ action: 'upsert-prospects', label: opts.label, prospects: part }).then(function (r) {
        acc.created = acc.created.concat(r.created); acc.updated = acc.updated.concat(r.updated); acc.errors = acc.errors.concat(r.errors); return acc; }); });
    }, Promise.resolve({ created: [], updated: [], errors: [] }));
  },
  resolve: function () { if (!args[0]) throw new Error('resolve <candidate key> <file.json|->'); return C.post({ action: 'resolve-candidate', key: args[0], prospect: readJson(args[1]) }); },
  skip: function () { if (!args[0]) throw new Error('skip <candidate key> <reason>'); return C.post({ action: 'resolve-candidate', key: args[0], skip: true, reason: args.slice(1).join(' ') || opts.reason }); },
  log: function () { var x = readJson(args[0]); return C.post({ action: 'log', entries: Array.isArray(x) ? x : (x.entries || [x]) }); },
  stage: function () { if (!args[1]) throw new Error('stage <prospectId> <stage>'); return C.post({ action: 'stage', prospectId: args[0], stage: args[1], note: opts.note }); },
  suppress: function () {
    if (!args[0]) throw new Error('suppress <email|domain>');
    var a = args[0];
    return C.post(a.indexOf('@') > 0 ? { action: 'suppress', email: a, reason: opts.reason } : { action: 'suppress', domain: a, reason: opts.reason });
  },
  screen: function () { if (!args.length) throw new Error('screen <email> [...]'); return C.post({ action: 'screen', emails: args }); },
  'lint-post': function () { return C.post({ action: 'lint-post', text: readInput(args[0]), campaign: opts.campaign }); },
  help: function () {
    var src = fs.readFileSync(__filename, 'utf8');
    process.stdout.write(src.slice(src.indexOf('READ'), src.indexOf('═══', src.indexOf('READ'))).replace(/^ {3}/gm, '') + '\nkey: ' + (C.key() ? 'found' : 'MISSING (' + C.where() + ')') + '   host: ' + C.HOST + '\n');
    return null;
  }
};

if (!run[cmd]) { console.error('unknown command: ' + cmd + ' (sales-cli help)'); process.exit(2); }
Promise.resolve().then(function () { return run[cmd](); }).then(function (r) { if (r != null) out(r); })
  .catch(function (e) { console.error('sales: ' + e.message); process.exit(e.status === 0 ? 3 : 1); });
