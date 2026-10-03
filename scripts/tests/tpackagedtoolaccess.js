/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   scripts/tests/tpackagedtoolaccess.js — a packaged workspace's STORED
   toolAccess follows the module catalog (scripts/backfill-packaged-toolaccess.js).

   firestore.rules packageWrite(org, tool) lets a browser save
   toolData/{org}/tools/{tool} only while `tool in billing/current.toolAccess`,
   a copy of modules.resolve(modules) the billing engine saves at approval
   and rewrites only when it reconciles an invoice. When `vppsim` joined
   Omega Design (lite), every package provisioned before that deploy kept a
   copy without it: /api/vpp-estimate answered (it resolves modules[] live)
   and the page's Save was permission-denied. This holds:
     1. the pure plan: live packaged states only, lite alone for
        past_due_lite, add never remove, a legacy allowlist never touched;
     2. the run on the Firestore double: a dry run writes nothing; --apply
        writes toolAccess and nothing else, one admin_audit row per change,
        never deletes, and a second run changes nothing;
     3. the toolData write as firestore.rules says it: the rules TEXT is
        parsed and evaluated (a small evaluator of the rules language, in
        the section; no emulator here), so the real `allow write` and
        packageWrite() refuse vppsim on a record saved under the previous
        catalog and allow it after the backfill, while each of the rule's
        other clauses decides a case of its own (the org check on a legacy
        workspace, the demo bucket and staff, tenant status, the role list,
        a member record, the member list, verified email, the trial window
        and accessUntil); EVERY clause of the toolData write and of
        packageWrite(), found in the text at every depth, deleted and
        negated in turn, fails the section, except two named equivalents
        whose reason is written down (and which are held to still survive);
        and a list of further edits (the tool clause joined by || or
        reading another field or default, accessUntil dropped, a viewer
        admitted, packageWrite no longer consulted) fails it too;
     4. the catalog this backfill last covered: a module gaining a tool
        fails here until the backfill is run with that deploy.

   No network, no credentials. Run: node scripts/tests/tpackagedtoolaccess.js */
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var F = require(path.join(ROOT, 'scripts', '_lib', 'firestore-double'));
var M = require(path.join(ROOT, 'api', '_lib', 'modules'));
var B = require(path.join(ROOT, 'scripts', 'backfill-packaged-toolaccess'));

var pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (got !== undefined ? '  got: ' + JSON.stringify(got) : '')); }
}
function section(t) { console.log('\n' + t); }
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

/* Omega Design's tools before 2026-09-29 (the review's own reading of
   resolve(['lite']) at the commit before vppsim joined). */
var PREVIOUS_LITE = ['editor', 'sandbox', 'sales', 'intake', 'opportunity', 'financing', 'signal'];
var STORAGE = M.get('storage').tools;
var NOW = Date.parse('2026-09-29T12:00:00Z'), DAY = 86400000;

/* ── 1 · the plan ─────────────────────────────────────────────────────── */
section('Plan');
ok('the catalog change being backfilled: lite = the previous list + vppsim', same(M.resolve(['lite']).toolAccess, PREVIOUS_LITE.concat(['vppsim'])), M.resolve(['lite']).toolAccess);
var trialOld = { packaged: true, packagingState: 'trial', modules: ['lite'], toolAccess: PREVIOUS_LITE.slice() };
var p = B.plan(trialOld);
ok('a trial saved under the previous catalog gains vppsim, and only it', p.action === 'add' && same(p.add, ['vppsim']) && same(p.toolAccess, PREVIOUS_LITE.concat(['vppsim'])), p);
ok('a paid package gains it too', B.plan({ packaged: true, packagingState: 'paid', modules: ['lite', 'storage'], toolAccess: PREVIOUS_LITE.concat(STORAGE) }).add.join() === 'vppsim');
var pdl = B.plan({ packaged: true, packagingState: 'past_due_lite', modules: ['lite', 'storage'], toolAccess: PREVIOUS_LITE.slice() });
ok('past_due_lite is Omega Design alone, whatever modules[] says (the engine\'s rule)', pdl.action === 'add' && same(pdl.add, ['vppsim']) && same(pdl.modules, ['lite']), pdl);
['awaiting_payment', 'unpaid', undefined].forEach(function (s) {
  ok('a package in state ' + s + ' is left to the engine', B.plan({ packaged: true, packagingState: s, modules: ['lite'], toolAccess: PREVIOUS_LITE.slice() }).action === 'skip');
});
ok('a legacy allowlist (Clean Cell\'s two-tool product) is never widened', B.plan({ tier: 'standard', toolAccess: ['editor', 'gridatlas'] }).action === 'skip');
ok('a record no longer packaged keeps its allowlist, whatever state it carries', B.plan({ packaged: false, packagingState: 'paid', modules: ['lite'], toolAccess: ['editor', 'gridatlas'] }).action === 'skip');
ok('packaged must be the literal true', B.plan({ packaged: 'true', packagingState: 'trial', modules: ['lite'], toolAccess: [] }).action === 'skip');
ok('no record is a skip', B.plan(null).action === 'skip');
var extra = B.plan({ packaged: true, packagingState: 'trial', modules: ['lite'], toolAccess: ['retiredtool'].concat(PREVIOUS_LITE) });
ok('a stored tool the catalog no longer names is kept (add, never remove)', extra.action === 'add' && extra.toolAccess[0] === 'retiredtool' && extra.toolAccess.indexOf('vppsim') > 0, extra.toolAccess);
var none = B.plan({ packaged: true, packagingState: 'trial', modules: ['lite'], toolAccess: null });
ok('a record with no stored list gets the whole grant, and says it had none', none.action === 'add' && none.was === null && same(none.toolAccess, M.resolve(['lite']).toolAccess), none);
ok('an up-to-date record needs nothing', B.plan({ packaged: true, packagingState: 'paid', modules: ['lite'], toolAccess: M.resolve(['lite']).toolAccess }).action === 'none');
ok('modules that no longer resolve go to a person', B.plan({ packaged: true, packagingState: 'paid', modules: ['lite', 'retired-module'], toolAccess: [] }).action === 'review');
ok('arguments: dry run by default', same(B.parseArgs([]), { apply: false, org: null }));
ok('arguments: --apply and --org', same(B.parseArgs(['--org', 'Acme.com', '--apply']), { apply: true, org: 'acme.com' }));
var threw = false; try { B.parseArgs(['--aply']); } catch (e) { threw = true; }
ok('arguments: a typo is refused, never a silent dry run or apply', threw);

/* ── 2 · the run ──────────────────────────────────────────────────────── */
function seed() {
  var db = new F.DB();
  function org(id, billing, orgDoc) {
    db.seed('omega_orgs/' + id, orgDoc || { name: id, status: 'active' });
    if (billing) db.seed('omega_orgs/' + id + '/billing/current', billing);
  }
  org('trial-old.com', { packaged: true, packagingState: 'trial', modules: ['lite'], toolAccess: PREVIOUS_LITE.slice(), caps: ['design', 'view', 'export.blueprint'],
    trialStartedAt: NOW - 3 * DAY, trialEndsAt: NOW + 11 * DAY, accessUntil: NOW + 11 * DAY, monthlyCents: 9900, plan: 'Lite + modules' });
  org('paid-old.com', { packaged: true, packagingState: 'paid', modules: ['lite', 'storage'], toolAccess: PREVIOUS_LITE.concat(STORAGE), accessUntil: NOW + 30 * DAY, paidThrough: '2026-10-15' });
  org('pastdue-old.com', { packaged: true, packagingState: 'past_due_lite', modules: ['lite'], toolAccess: PREVIOUS_LITE.slice(), paidThrough: '2026-09-01', accessUntil: NOW + 5 * DAY });
  org('awaiting.com', { packaged: true, packagingState: 'awaiting_payment', modules: ['lite'], toolAccess: PREVIOUS_LITE.slice(), accessUntil: NOW });
  org('cleancell.us', { tier: 'standard', toolAccess: ['editor', 'gridatlas'] });
  org('current.com', { packaged: true, packagingState: 'paid', modules: ['lite'], toolAccess: M.resolve(['lite']).toolAccess, accessUntil: NOW + 30 * DAY });
  org('kept.com', { packaged: true, packagingState: 'trial', modules: ['lite'], toolAccess: ['retiredtool'].concat(PREVIOUS_LITE), trialStartedAt: NOW - DAY, trialEndsAt: NOW + 13 * DAY, accessUntil: NOW + 13 * DAY });
  org('broken.com', { packaged: true, packagingState: 'paid', modules: ['lite', 'retired-module'], toolAccess: PREVIOUS_LITE.slice() });
  org('nobilling.com', null);
  return db;
}
function dump(db) { var o = {}; db.data.forEach(function (v, k) { o[k] = v; }); return JSON.parse(JSON.stringify(o)); }
function audits(db, org) {
  var rows = []; db.data.forEach(function (v, k) { if (k.indexOf('omega_orgs/' + org + '/admin_audit/') === 0) rows.push(v); }); return rows;
}
function allAudits(db) { var n = 0; db.data.forEach(function (v, k) { if (/\/admin_audit\//.test(k)) n++; }); return n; }
function billing(db, org) { return db.data.get('omega_orgs/' + org + '/billing/current'); }
function without(o, k) { var c = JSON.parse(JSON.stringify(o)); delete c[k]; return c; }

var queue = Promise.resolve();
function later(fn) { queue = queue.then(fn); }
var quiet = function () {};

later(function () {
  section('Dry run');
  var db = seed(), before = dump(db), lines = [];
  return B.run(db, { now: NOW, log: function (l) { lines.push(l); } }).then(function (report) {
    ok('a dry run writes nothing at all', same(dump(db), before));
    function row(id) { return report.filter(function (r) { return r.orgId === id; })[0] || {}; }
    ok('it reads every workspace', report.length === 9, report.length);
    ok('it reports what it would add', row('trial-old.com').action === 'add' && row('paid-old.com').action === 'add' && row('pastdue-old.com').action === 'add' && row('kept.com').action === 'add');
    ok('it reports what it leaves', row('awaiting.com').action === 'skip' && row('cleancell.us').action === 'skip' && row('current.com').action === 'none' && row('nobilling.com').action === 'skip' && row('broken.com').action === 'review', report);
    ok('the printed report names each workspace and says nothing was written', lines.some(function (l) { return /trial-old\.com .*would add vppsim/.test(l); }) && lines.some(function (l) { return /REVIEW/.test(l) && /broken\.com/.test(l); }) && /nothing written/.test(lines[lines.length - 1]), lines);
  });
});

later(function () {
  section('Apply');
  var db = seed(), before = dump(db);
  return B.run(db, { apply: true, now: NOW, log: quiet }).then(function (report) {
    var after = dump(db);
    ok('no document was deleted', Object.keys(before).every(function (k) { return Object.prototype.hasOwnProperty.call(after, k); }));
    ok('trial-old.com gains vppsim', same(billing(db, 'trial-old.com').toolAccess, PREVIOUS_LITE.concat(['vppsim'])), billing(db, 'trial-old.com').toolAccess);
    ok('  and nothing else on the record changed', same(without(billing(db, 'trial-old.com'), 'toolAccess'), without(before['omega_orgs/trial-old.com/billing/current'], 'toolAccess')));
    ok('paid-old.com gains vppsim and keeps Omega Storage', same(billing(db, 'paid-old.com').toolAccess, PREVIOUS_LITE.concat(STORAGE, ['vppsim'])), billing(db, 'paid-old.com').toolAccess);
    ok('pastdue-old.com gains vppsim', billing(db, 'pastdue-old.com').toolAccess.indexOf('vppsim') >= 0);
    ok('kept.com keeps its retired tool', billing(db, 'kept.com').toolAccess[0] === 'retiredtool' && billing(db, 'kept.com').toolAccess.indexOf('vppsim') >= 0);
    ['awaiting.com', 'cleancell.us', 'current.com', 'broken.com'].forEach(function (id) {
      ok(id + ' is untouched', same(billing(db, id), before['omega_orgs/' + id + '/billing/current']) && audits(db, id).length === 0);
    });
    ok('nobilling.com gets no record', !db.data.has('omega_orgs/nobilling.com/billing/current'));
    var only = Object.keys(after).filter(function (k) { return !same(after[k], before[k]); });
    ok('the only documents written are the four records and their audit rows', only.length === 8 && only.every(function (k) { return /\/billing\/current$/.test(k) || /\/admin_audit\//.test(k); }), only);
    var a = audits(db, 'trial-old.com');
    ok('one admin_audit row per workspace changed', a.length === 1 && audits(db, 'paid-old.com').length === 1 && audits(db, 'pastdue-old.com').length === 1 && audits(db, 'kept.com').length === 1);
    ok('  it says who, when, what it was and what it became', a[0] && a[0].by === 'scripts/backfill-packaged-toolaccess.js' && a[0].at === NOW && a[0].action === 'package-toolaccess-backfill' && a[0].orgId === 'trial-old.com'
      && same(a[0].was.toolAccess, PREVIOUS_LITE) && same(a[0].changed.toolAccess, PREVIOUS_LITE.concat(['vppsim'])) && same(a[0].changed.added, ['vppsim']) && a[0].packagingState === 'trial', a[0]);
    ok('the report matches what was written', report.filter(function (r) { return r.action === 'add'; }).length === 4);
    var snap = dump(db);
    return B.run(db, { apply: true, now: NOW + 1, log: quiet }).then(function (again) {
      ok('a second run changes nothing and writes no audit row', same(dump(db), snap) && again.every(function (r) { return r.action !== 'add'; }));
    });
  });
});

later(function () {
  section('One workspace');
  var db = seed();
  return B.run(db, { apply: true, org: 'paid-old.com', now: NOW, log: quiet }).then(function (report) {
    ok('--org touches that workspace alone', report.length === 1 && billing(db, 'paid-old.com').toolAccess.indexOf('vppsim') >= 0
      && billing(db, 'trial-old.com').toolAccess.indexOf('vppsim') < 0 && allAudits(db) === 1);
  });
});

/* ── 3 · the rule the browser's Save meets ────────────────────────────── */
/* There is no rules emulator here (no network, no Java service), so this
   section runs the TEXT of firestore.rules: its match blocks, functions and
   allow conditions, parsed and evaluated with the rules language's own
   semantics for everything the toolData write reaches — `&&`/`||` that take
   an error the other side decides (error && false is false, error || true
   is true; otherwise the error stands), `!`, `==` (deep on lists and maps,
   false across types), `<`, `in` on lists and maps, `is`, the ternary,
   `let`, get()/exists() on paths built with $(), map.get(key, default),
   string lower/split/matches, list index and timestamp toMillis. An
   evaluation error is a refusal, as it is in Firestore. A construct it does
   not implement THROWS and fails the test by name; it never guesses. It
   does not model the per-request document-read limit. */
var RulesText = (function () {
  function RuleError(msg) { this.message = msg; }
  function fail(msg) { throw new RuleError(msg); }
  function unsupported(what) { throw new Error('rules evaluator: unsupported ' + what); }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  /* comments out, strings kept */
  function strip(src) {
    var out = '', i = 0, q = null;
    while (i < src.length) {
      var c = src[i], d = src[i + 1];
      if (q) { out += c; if (c === '\\') { out += d; i += 2; continue; } if (c === q) q = null; i++; continue; }
      if (c === '/' && d === '*') { var e = src.indexOf('*/', i + 2); if (e < 0) unsupported('unterminated comment'); out += ' '; i = e + 2; continue; }
      if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === "'" || c === '"') q = c;
      out += c; i++;
    }
    return out;
  }
  function stringEnd(t, i) {
    for (var j = i + 1; j < t.length; j++) { if (t[j] === '\\') j++; else if (t[j] === t[i]) return j; }
    unsupported('unterminated string');
  }
  /* index of the bracket that closes the one at i */
  function close(t, i) {
    var open = t[i], shut = { '{': '}', '(': ')', '[': ']' }[open], depth = 0;
    for (var j = i; j < t.length; j++) {
      var c = t[j];
      if (c === "'" || c === '"') j = stringEnd(t, j);
      else if (c === open) depth++;
      else if (c === shut && --depth === 0) return j;
    }
    unsupported('unbalanced ' + open);
  }
  /* index of the `;` that ends the statement starting at i (or the end) */
  function statementEnd(t, i) {
    for (var j = i; j < t.length; j++) {
      var c = t[j];
      if (c === "'" || c === '"') j = stringEnd(t, j);
      else if (c === '(' || c === '[' || c === '{') j = close(t, j);
      else if (c === ';') return j;
    }
    return t.length;
  }
  /* the statements of a block: service, match, function, allow */
  function block(t) {
    var out = [], i = 0, m, open, end;
    while (i < t.length) {
      var rest = t.slice(i);
      if ((m = /^\s+/.exec(rest))) { i += m[0].length; continue; }
      if ((m = /^rules_version\s*=\s*'[^']*'\s*;/.exec(rest))) { i += m[0].length; continue; }
      if ((m = /^(?:service\s+[\w.]+|match\s+(\S+))\s*\{/.exec(rest))) {
        open = i + m[0].length - 1; end = close(t, open);
        out.push({ kind: m[1] ? 'match' : 'service', pattern: m[1] || null, body: block(t.slice(open + 1, end)) });
        i = end + 1; continue;
      }
      if ((m = /^function\s+(\w+)\s*\(([^)]*)\)\s*\{/.exec(rest))) {
        open = i + m[0].length - 1; end = close(t, open);
        out.push({ kind: 'function', name: m[1], params: m[2].split(',').map(function (s) { return s.trim(); }).filter(Boolean), src: t.slice(open + 1, end) });
        i = end + 1; continue;
      }
      if ((m = /^allow\s+([\w\s,]+?)\s*(:\s*if\b|;)/.exec(rest))) {
        var methods = m[1].split(',').map(function (s) { return s.trim(); });
        methods.forEach(function (x) { if (!/^(read|write|get|list|create|update|delete)$/.test(x)) unsupported('allow method ' + x); });
        if (m[2] === ';') { out.push({ kind: 'allow', methods: methods, src: 'true' }); i += m[0].length; continue; }
        end = statementEnd(t, i + m[0].length);
        out.push({ kind: 'allow', methods: methods, src: t.slice(i + m[0].length, end) });
        i = end + 1; continue;
      }
      unsupported('statement ' + JSON.stringify(rest.slice(0, 60)));
    }
    return out;
  }

  /* ── expressions ── */
  function lex(s) {
    var toks = [], i = 0, m;
    function operandEnded() {
      var p = toks[toks.length - 1];
      return !!p && ((p.t === 'id' && !/^(in|is|return)$/.test(p.v)) || p.t === 'num' || p.t === 'str' || p.t === 'path' || p.v === ')' || p.v === ']');
    }
    while (i < s.length) {
      var c = s[i], rest = s.slice(i);
      if (/\s/.test(c)) { i++; continue; }
      if ((m = /^[A-Za-z_]\w*/.exec(rest))) { toks.push({ t: 'id', v: m[0] }); i += m[0].length; continue; }
      if ((m = /^\d+(\.\d+)?/.exec(rest))) { toks.push({ t: 'num', v: Number(m[0]) }); i += m[0].length; continue; }
      if (c === "'" || c === '"') {
        var e = stringEnd(s, i);
        toks.push({ t: 'str', v: s.slice(i + 1, e).replace(/\\(.)/g, function (x, ch) { return ch === 'n' ? '\n' : ch === 't' ? '\t' : ch; }) });
        i = e + 1; continue;
      }
      if (c === '/' && !operandEnded()) {
        var segs = [];
        while (s[i] === '/') {
          i++;
          if (s[i] === '$' && s[i + 1] === '(') { var pe = close(s, i + 1); segs.push({ expr: parse(s.slice(i + 2, pe)) }); i = pe + 1; }
          else { var sm = /^[\w-]+/.exec(s.slice(i)); if (!sm) unsupported('path segment at ' + JSON.stringify(s.slice(i, i + 20))); segs.push({ lit: sm[0] }); i += sm[0].length; }
        }
        toks.push({ t: 'path', segs: segs }); continue;
      }
      if ((m = /^(&&|\|\||==|!=|<=|>=|[-+*\/%<>!?:.,()[\]{}])/.exec(rest))) { toks.push({ t: 'op', v: m[0] }); i += m[0].length; continue; }
      unsupported('character ' + JSON.stringify(c));
    }
    toks.push({ t: 'end' });
    return toks;
  }
  /* precedence, loosest first: ?: || && ==,!= is in <,<=,>,>= +,- *,/,% unary postfix */
  function parse(src) {
    var toks = lex(src), k = 0;
    function isOp(v) { return toks[k].t === 'op' && toks[k].v === v; }
    function isId(v) { return toks[k].t === 'id' && toks[k].v === v; }
    function eat(v) { if (!isOp(v)) unsupported('expected ' + v + ' in ' + JSON.stringify(src.slice(0, 80))); k++; }
    function binary(next, ops) {
      return function () {
        var a = next();
        for (;;) {
          var t = toks[k];
          if (ops.indexOf(t.v) < 0 || (t.t !== 'op' && t.t !== 'id')) return a;
          k++; a = { k: 'bin', op: t.v, a: a, b: next() };
        }
      };
    }
    function ternary() { var c = or(); if (isOp('?')) { k++; var a = ternary(); eat(':'); return { k: 'tern', c: c, a: a, b: ternary() }; } return c; }
    function or() { var a = and(); while (isOp('||')) { k++; a = { k: 'or', a: a, b: and() }; } return a; }
    function and() { var a = eq(); while (isOp('&&')) { k++; a = { k: 'and', a: a, b: eq() }; } return a; }
    function is() { var a = inx(); while (isId('is')) { k++; var t = toks[k++]; if (t.t !== 'id') unsupported('is ' + t.v); a = { k: 'is', a: a, type: t.v }; } return a; }
    function unary() { if (isOp('!') || isOp('-')) { var op = toks[k++].v; return { k: 'un', op: op, a: unary() }; } return postfix(); }
    var mul = binary(unary, ['*', '/', '%']), add = binary(mul, ['+', '-']), rel = binary(add, ['<', '<=', '>', '>=']);
    var inx = binary(rel, ['in']), eq = binary(is, ['==', '!=']);
    function args() { var list = []; eat('('); if (!isOp(')')) { list.push(ternary()); while (isOp(',')) { k++; list.push(ternary()); } } eat(')'); return list; }
    function postfix() {
      var a = primary();
      for (;;) {
        if (isOp('.')) {
          k++; var n = toks[k++]; if (n.t !== 'id') unsupported('.' + n.v);
          a = isOp('(') ? { k: 'method', obj: a, name: n.v, args: args() } : { k: 'field', obj: a, name: n.v };
        } else if (isOp('[')) { k++; var ix = ternary(); eat(']'); a = { k: 'index', obj: a, idx: ix }; }
        else return a;
      }
    }
    function primary() {
      var t = toks[k];
      if (t.t === 'num' || t.t === 'str') { k++; return { k: 'lit', v: t.v }; }
      if (t.t === 'path') { k++; return { k: 'path', segs: t.segs }; }
      if (t.t === 'id' && !/^(in|is)$/.test(t.v)) {
        k++;
        if (t.v === 'true' || t.v === 'false') return { k: 'lit', v: t.v === 'true' };
        if (t.v === 'null') return { k: 'lit', v: null };
        if (isOp('(')) return { k: 'call', name: t.v, args: args() };
        return { k: 'var', name: t.v };
      }
      if (isOp('(')) { k++; var e = ternary(); eat(')'); return e; }
      if (isOp('[')) {
        k++; var items = [];
        while (!isOp(']')) { items.push(ternary()); if (!isOp(',')) break; k++; }
        eat(']'); return { k: 'list', items: items };
      }
      if (isOp('{')) {
        k++; var ents = [];
        while (!isOp('}')) { var key = ternary(); eat(':'); ents.push([key, ternary()]); if (!isOp(',')) break; k++; }
        eat('}'); return { k: 'map', ents: ents };
      }
      unsupported('token ' + JSON.stringify(t.v || t.t) + ' in ' + JSON.stringify(src.slice(0, 80)));
    }
    var ast = ternary();
    if (toks[k].t !== 'end') unsupported('trailing ' + JSON.stringify(toks[k].v) + ' in ' + JSON.stringify(src.slice(0, 80)));
    return ast;
  }
  function fnBody(src) {
    var stmts = [], i = 0, m;
    while (i < src.length) {
      if ((m = /^\s+/.exec(src.slice(i)))) { i += m[0].length; continue; }
      var j = statementEnd(src, i), text = src.slice(i, j).trim();
      if ((m = /^let\s+(\w+)\s*=\s*([\s\S]+)$/.exec(text))) stmts.push({ let: m[1], expr: parse(m[2]) });
      else if ((m = /^return\s+([\s\S]+)$/.exec(text))) stmts.push({ ret: parse(m[1]) });
      else unsupported('function statement ' + JSON.stringify(text.slice(0, 60)));
      i = j + 1;
    }
    return stmts;
  }

  /* ── values ── */
  function Path(p) { this.path = p; }
  function Ts(ms) { this.ms = ms; }
  function Lazy(f) { this.f = f; this.done = false; }
  function typeOf(v) {
    if (v === null) return 'null';
    if (typeof v === 'boolean') return 'bool';
    if (typeof v === 'number') return 'number';
    if (typeof v === 'string') return 'string';
    if (Array.isArray(v)) return 'list';
    if (v instanceof Path) return 'path';
    if (v instanceof Ts) return 'timestamp';
    if (typeof v === 'object') return 'map';
    return unsupported('value of type ' + typeof v);
  }
  function equal(a, b) {
    var ta = typeOf(a);
    if (ta !== typeOf(b)) return false;
    if (ta === 'list') return a.length === b.length && a.every(function (x, i) { return equal(x, b[i]); });
    if (ta === 'map') {
      var ka = Object.keys(a);
      return ka.length === Object.keys(b).length && ka.every(function (x) { return has(b, x) && equal(a[x], b[x]); });
    }
    if (ta === 'path') return a.path === b.path;
    if (ta === 'timestamp') return a.ms === b.ms;
    return a === b;
  }
  function bool(v) { if (typeof v !== 'boolean') fail('not a bool: ' + typeOf(v)); return v; }

  function Env(vars, parent) { this.vars = vars || {}; this.fns = {}; this.parent = parent || null; }
  Env.prototype.lookup = function (name) {
    for (var e = this; e; e = e.parent) {
      if (!has(e.vars, name)) continue;
      var v = e.vars[name];
      if (v instanceof Lazy) { if (!v.done) { v.v = v.f(); v.done = true; } return v.v; }
      return v;
    }
    return unsupported('variable ' + name);
  };
  Env.prototype.fn = function (name) { for (var e = this; e; e = e.parent) if (has(e.fns, name)) return e.fns[name]; return null; };

  function attempt(n, env, cx) {
    try { return { v: ev(n, env, cx) }; } catch (e) { if (e instanceof RuleError) return { err: e }; throw e; }
  }
  function logic(n, env, cx) {
    var decides = n.k === 'or';
    var a = attempt(n.a, env, cx);
    if (!a.err && typeof a.v !== 'boolean') a = { err: new RuleError('not a bool') };
    if (!a.err && a.v === decides) return decides;
    var b = attempt(n.b, env, cx);
    if (!b.err && typeof b.v !== 'boolean') b = { err: new RuleError('not a bool') };
    if (!b.err && b.v === decides) return decides;
    if (a.err) throw a.err;
    if (b.err) throw b.err;
    return b.v;
  }
  function operate(op, a, b) {
    if (op === '==') return equal(a, b);
    if (op === '!=') return !equal(a, b);
    if (op === 'in') {
      if (Array.isArray(b)) return b.some(function (x) { return equal(a, x); });
      if (typeOf(b) === 'map') { if (typeof a !== 'string') fail('map key'); return has(b, a); }
      return fail('in on ' + typeOf(b));
    }
    if (a instanceof Ts || b instanceof Ts) {
      if (a instanceof Ts && b instanceof Ts && /^[<>]=?$/.test(op)) { a = a.ms; b = b.ms; }
      else unsupported('timestamp ' + op);
    }
    if (/^[<>]=?$/.test(op)) {
      if (!((typeof a === 'number' && typeof b === 'number') || (typeof a === 'string' && typeof b === 'string'))) fail(op + ' on ' + typeOf(a) + ', ' + typeOf(b));
      return op === '<' ? a < b : op === '<=' ? a <= b : op === '>' ? a > b : a >= b;
    }
    if (op === '+') {
      if (typeof a === 'number' && typeof b === 'number') return a + b;
      if (typeof a === 'string' && typeof b === 'string') return a + b;
      if (Array.isArray(a) && Array.isArray(b)) return a.concat(b);
      return fail('+ on ' + typeOf(a) + ', ' + typeOf(b));
    }
    if (op === '-' || op === '*') {
      if (typeof a !== 'number' || typeof b !== 'number') fail(op + ' on ' + typeOf(a));
      return op === '-' ? a - b : a * b;
    }
    return unsupported('operator ' + op + ' (integer and float division cannot be told apart in JSON)');
  }
  function method(v, name, args) {
    var t = typeOf(v);
    if (t === 'map' && name === 'get' && args.length === 2) {
      if (typeof args[0] !== 'string') unsupported('map.get with a ' + typeOf(args[0]) + ' key');
      return has(v, args[0]) ? v[args[0]] : args[1];
    }
    if (t === 'map' && name === 'keys' && !args.length) return Object.keys(v);
    if ((t === 'map' || t === 'list' || t === 'string') && name === 'size' && !args.length) return t === 'map' ? Object.keys(v).length : v.length;
    if (t === 'string' && name === 'lower' && !args.length) return v.toLowerCase();
    if (t === 'string' && name === 'upper' && !args.length) return v.toUpperCase();
    if (t === 'string' && name === 'trim' && !args.length) return v.trim();
    if (t === 'string' && name === 'split' && args.length === 1 && typeof args[0] === 'string') return v.split(new RegExp(args[0]));
    if (t === 'string' && name === 'matches' && args.length === 1 && typeof args[0] === 'string') return new RegExp('^(?:' + args[0] + ')$').test(v);
    if (t === 'list' && /^has(Any|All|Only)$/.test(name) && args.length === 1 && Array.isArray(args[0])) {
      var other = args[0], inOther = function (x) { return other.some(function (y) { return equal(x, y); }); };
      var inV = function (x) { return v.some(function (y) { return equal(x, y); }); };
      return name === 'hasAny' ? v.some(inOther) : name === 'hasAll' ? other.every(inV) : v.every(inOther);
    }
    if (t === 'timestamp' && name === 'toMillis' && !args.length) return v.ms;
    return unsupported(t + '.' + name + '()');
  }
  function call(n, env, cx) {
    if (n.name === 'get' || n.name === 'exists') {
      var p = ev(n.args[0], env, cx);
      if (!(p instanceof Path)) fail(n.name + '() of ' + typeOf(p));
      var doc = cx.read(p.path);
      if (n.name === 'exists') return doc !== undefined;
      return doc === undefined ? null : { data: doc, id: p.path.split('/').pop(), __name__: p };
    }
    var f = env.fn(n.name);
    if (!f) unsupported('function ' + n.name + '()');
    if (f.def.params.length !== n.args.length) unsupported(n.name + '() called with ' + n.args.length + ' arguments');
    if (++cx.depth > 20) unsupported('call depth past 20 at ' + n.name + '()');
    try {
      var local = new Env({}, f.env);
      f.def.params.forEach(function (p, i) { local.vars[p] = new Lazy(function () { return ev(n.args[i], env, cx); }); });
      f.def.stmts = f.def.stmts || fnBody(f.def.src);
      for (var i = 0; i < f.def.stmts.length; i++) {
        var st = f.def.stmts[i];
        if (st.ret) return ev(st.ret, local, cx);
        local.vars[st.let] = (function (x) { return new Lazy(function () { return ev(x, local, cx); }); })(st.expr);
      }
      return unsupported(n.name + '() has no return');
    } finally { cx.depth--; }
  }
  function ev(n, env, cx) {
    switch (n.k) {
      case 'lit': return n.v;
      case 'var': return env.lookup(n.name);
      case 'list': return n.items.map(function (x) { return ev(x, env, cx); });
      case 'map': {
        var o = {};
        n.ents.forEach(function (e) { var key = ev(e[0], env, cx); if (typeof key !== 'string') fail('map key'); o[key] = ev(e[1], env, cx); });
        return o;
      }
      case 'path': return new Path('/' + n.segs.map(function (s) {
        if (s.lit) return s.lit;
        var v = ev(s.expr, env, cx);
        if (typeof v !== 'string' || !v || v.indexOf('/') >= 0) unsupported('a path segment of ' + JSON.stringify(v));
        return v;
      }).join('/'));
      case 'field': {
        var fo = ev(n.obj, env, cx);
        if (typeOf(fo) !== 'map') fail('.' + n.name + ' on ' + typeOf(fo));
        if (!has(fo, n.name)) fail('no field ' + n.name);
        return fo[n.name];
      }
      case 'index': {
        var l = ev(n.obj, env, cx), ix = ev(n.idx, env, cx);
        if (Array.isArray(l)) { if (typeof ix !== 'number' || ix % 1 || ix < 0 || ix >= l.length) fail('index ' + ix); return l[ix]; }
        if (typeOf(l) === 'map') { if (typeof ix !== 'string' || !has(l, ix)) fail('key ' + ix); return l[ix]; }
        return fail('index on ' + typeOf(l));
      }
      case 'method': return method(ev(n.obj, env, cx), n.name, n.args.map(function (a) { return ev(a, env, cx); }));
      case 'call': return call(n, env, cx);
      case 'un': { var u = ev(n.a, env, cx); if (n.op === '!') return !bool(u); if (typeof u !== 'number') fail('- on ' + typeOf(u)); return -u; }
      case 'and': case 'or': return logic(n, env, cx);
      case 'bin': return operate(n.op, ev(n.a, env, cx), ev(n.b, env, cx));
      case 'tern': return bool(ev(n.c, env, cx)) ? ev(n.a, env, cx) : ev(n.b, env, cx);
      case 'is': {
        var iv = ev(n.a, env, cx);
        if (n.type === 'number') return typeof iv === 'number';
        if (/^(string|bool|list|map|null|path|timestamp)$/.test(n.type)) return typeOf(iv) === n.type;
        return unsupported('is ' + n.type + (/^(int|float)$/.test(n.type) ? ' (JSON cannot tell 1 from 1.0)' : ''));
      }
    }
    return unsupported('node ' + n.k);
  }

  /* ── match blocks ── */
  var METHODS = { read: ['get', 'list'], write: ['create', 'update', 'delete'] };
  function covers(list, m) { return list.some(function (x) { return x === m || (METHODS[x] || []).indexOf(m) >= 0; }); }
  /* every way a pattern's segments match a prefix of the path's: { vars, rest } */
  function matchPrefix(pat, segs) {
    var out = [];
    (function go(i, j, vars) {
      if (i === pat.length) { out.push({ vars: vars, rest: segs.slice(j) }); return; }
      var w = /^\{(\w+)(=\*\*)?\}$/.exec(pat[i]), v, x;
      if (w && w[2]) { for (x = j; x <= segs.length; x++) { v = Object.assign({}, vars); v[w[1]] = new Path(segs.slice(j, x).join('/')); go(i + 1, x, v); } return; }
      if (j >= segs.length) return;
      if (w) { v = Object.assign({}, vars); v[w[1]] = segs[j]; go(i + 1, j + 1, v); return; }
      if (/[{}*=]/.test(pat[i])) unsupported('pattern segment ' + pat[i]);
      if (pat[i] === segs[j]) go(i + 1, j + 1, vars);
    })(0, 0, {});
    return out;
  }
  function walk(stmts, env, segs, full, found) {
    var here = new Env({}, env);
    stmts.forEach(function (s) {
      if (s.kind !== 'function') return;
      if (has(here.fns, s.name)) unsupported('function ' + s.name + ' defined twice in one scope');
      here.fns[s.name] = { def: s, env: here };
    });
    if (full) stmts.forEach(function (s) { if (s.kind === 'allow') found.allows.push({ allow: s, env: here }); });
    stmts.forEach(function (s) {
      if (s.kind === 'service') walk(s.body, here, segs, false, found);
      if (s.kind !== 'match') return;
      matchPrefix(s.pattern.split('/').filter(Boolean), segs).forEach(function (m) {
        if (!m.rest.length) found.matched.push(s.pattern);
        walk(s.body, new Env(m.vars, here), m.rest, !m.rest.length, found);
      });
    });
  }

  /* new RulesText(text).judge(docPath, method, { auth, time }, read) →
     { allowed, matched[] }; read(path) is the document at a
     /databases/(default)/documents/… path, or undefined */
  function RulesText(text) { this.tree = block(strip(text)); }
  RulesText.prototype.judge = function (docPath, methodName, req, read) {
    var found = { allows: [], matched: [] };
    var root = new Env({ request: { auth: req.auth || null, time: new Ts(req.time), method: methodName, path: new Path('/databases/(default)/documents/' + docPath), resource: { data: req.data || {} } },
                         resource: req.existing ? { data: req.existing, id: docPath.split('/').pop() } : null });
    walk(this.tree, root, ['databases', '(default)', 'documents'].concat(docPath.split('/')), false, found);
    var cx = { read: read, depth: 0 };
    var allowed = found.allows.some(function (a) {
      if (!covers(a.allow.methods, methodName)) return false;
      a.allow.ast = a.allow.ast || parse(a.allow.src);
      var r = attempt(a.allow.ast, a.env, cx);
      return !r.err && r.v === true;
    });
    return { allowed: allowed, matched: found.matched };
  };
  return RulesText;
})();

var RULES = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
var DOCS = '/databases/(default)/documents/';
function reader(db) {
  return function (p) {
    if (p.indexOf(DOCS) !== 0) throw new Error('rules evaluator: a read outside this database: ' + p);
    var v = db.data.get(p.slice(DOCS.length));
    return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  };
}
function ownerOf(org, token) { return { uid: 'u-' + org, token: Object.assign({ email: 'owner@' + org, email_verified: true }, token || {}) }; }
function person(name, domain) { return { uid: 'u-' + name, token: { email: name + '@' + domain, email_verified: true } }; }
/* a browser's Save of toolData/{org}/tools/{tool} by `auth` (undefined: the
   workspace's owner; null: signed out); create and update must agree */
function saveAllowed(rules, db, org, tool, auth, time) {
  var req = { auth: auth === undefined ? ownerOf(org) : auth, time: time == null ? NOW : time }, rd = reader(db);
  var c = rules.judge('toolData/' + org + '/tools/' + tool, 'create', req, rd).allowed;
  var u = rules.judge('toolData/' + org + '/tools/' + tool, 'update', req, rd).allowed;
  if (c !== u) throw new Error('create and update disagree for ' + org + '/' + tool);
  return u;
}
/* every expectation of this section, judged by the rules TEXT given:
   resolves [{ name, pass, got }] */
function judgeRules(text) {
  var rules = new RulesText(text), out = [], db = seed();
  function expect(name, got, want) { out.push({ name: name, pass: got === want, got: got }); }
  ['trial-old.com', 'paid-old.com', 'pastdue-old.com', 'kept.com', 'awaiting.com', 'cleancell.us'].forEach(function (id) {
    db.seed('omega_orgs/' + id + '/members/u-' + id, { role: 'owner', status: 'active', email: 'owner@' + id });
  });
  db.seed('omega_orgs/trial-old.com/members/u-narrow', { role: 'member', status: 'active', email: 'narrow@trial-old.com', toolAccess: ['editor'] });
  db.seed('omega_orgs/paid-old.com/members/u-viewer', { role: 'viewer', status: 'active', email: 'viewer@paid-old.com' });
  db.seed('omega_orgs/paid-old.com/members/u-member', { role: 'member', status: 'active', email: 'member@paid-old.com' });
  db.seed('omega_orgs/suspended.com', { name: 'suspended.com', status: 'suspended' });
  db.seed('omega_orgs/suspended.com/billing/current', { packaged: true, packagingState: 'paid', modules: ['lite'], toolAccess: M.resolve(['lite']).toolAccess, accessUntil: NOW + 30 * DAY });
  db.seed('omega_orgs/suspended.com/members/u-suspended.com', { role: 'owner', status: 'active', email: 'owner@suspended.com' });
  ['demo-clearsky', 'demo-sunesol'].forEach(function (id) {
    db.seed('omega_orgs/' + id, { name: id, status: 'active' });
    db.seed('omega_orgs/' + id + '/billing/current', { packaged: true, packagingState: 'awaiting_payment', modules: ['lite'], toolAccess: M.resolve(['lite']).toolAccess, accessUntil: NOW });
  });
  db.seed('omega_orgs/demo-clearsky/members/u-ana', { role: 'owner', status: 'active', email: 'ana@clearsky-usa.com' });
  db.seed('omega_orgs/demo-sunesol/members/u-sam', { role: 'owner', status: 'active', email: 'sam@sunesol.com' });
  var matched = rules.judge('toolData/trial-old.com/tools/vppsim', 'update', { auth: ownerOf('trial-old.com'), time: NOW }, reader(db)).matched;
  expect('the one match block that governs toolData/{org}/tools/{tool}', matched.join(), '/toolData/{orgId}/tools/{toolKey}');
  expect('a record saved under the previous catalog: Save of vppsim is REFUSED', saveAllowed(rules, db, 'trial-old.com', 'vppsim'), false);
  expect('  while the tools it had still save', saveAllowed(rules, db, 'trial-old.com', 'editor'), true);
  expect('  a package whose period has closed (awaiting payment) saves nothing', saveAllowed(rules, db, 'awaiting.com', 'editor'), false);
  expect('  a legacy (unpackaged) workspace keeps its own rule: vppsim saves', saveAllowed(rules, db, 'cleancell.us', 'vppsim'), true);
  var bare = seed(), rec = JSON.parse(JSON.stringify(bare.data.get('omega_orgs/trial-old.com/billing/current')));
  delete rec.toolAccess;
  bare.seed('omega_orgs/trial-old.com/billing/current', rec);
  bare.seed('omega_orgs/trial-old.com/members/u-trial-old.com', { role: 'owner', status: 'active' });
  expect('  a live package with no stored list at all saves nothing', saveAllowed(rules, bare, 'trial-old.com', 'editor'), false);
  return B.run(db, { apply: true, now: NOW, log: quiet }).then(function () {
    expect('after the backfill: Save of vppsim is ALLOWED', saveAllowed(rules, db, 'trial-old.com', 'vppsim'), true);
    ['paid-old.com', 'pastdue-old.com', 'kept.com'].forEach(function (id) { expect('  on ' + id + ' too', saveAllowed(rules, db, id, 'vppsim'), true); });
    var narrow = { uid: 'u-narrow', token: { email: 'narrow@trial-old.com', email_verified: true } };
    expect('  a member whose own list lacks it is still refused', saveAllowed(rules, db, 'trial-old.com', 'vppsim', narrow), false);
    expect('  and saves what the list names', saveAllowed(rules, db, 'trial-old.com', 'editor', narrow), true);
    expect('  a trial past its end is refused', saveAllowed(rules, db, 'trial-old.com', 'vppsim', undefined, NOW + 12 * DAY), false);
    expect('  an unverified email is refused', saveAllowed(rules, db, 'trial-old.com', 'vppsim', ownerOf('trial-old.com', { email_verified: false })), false);
    expect('  another company\'s person is refused', saveAllowed(rules, db, 'trial-old.com', 'vppsim', ownerOf('paid-old.com')), false);
    expect('  signed out is refused', saveAllowed(rules, db, 'trial-old.com', 'vppsim', null), false);
    /* T10: each clause below is the ONLY thing that refuses (or allows) its case */
    expect('  a person from another domain saving to a LEGACY workspace is refused (the match-level org check alone)',
      saveAllowed(rules, db, 'cleancell.us', 'vppsim', ownerOf('attacker.example')), false);
    expect('  the owner of a SUSPENDED packaged workspace saves nothing', saveAllowed(rules, db, 'suspended.com', 'vppsim'), false);
    expect('  a member with the role "viewer" saves nothing', saveAllowed(rules, db, 'paid-old.com', 'vppsim', person('viewer', 'paid-old.com')), false);
    expect('  a member with the role "member" saves', saveAllowed(rules, db, 'paid-old.com', 'vppsim', person('member', 'paid-old.com')), true);
    expect('  a person of the workspace with no member record saves nothing on a package', saveAllowed(rules, db, 'paid-old.com', 'vppsim', person('nodoc', 'paid-old.com')), false);
    expect('  a paid package past its accessUntil saves nothing', saveAllowed(rules, db, 'paid-old.com', 'vppsim', undefined, NOW + 31 * DAY), false);
    expect('  ClearSky staff save to their demo bucket even while its package is closed (isAdmin, ownsDemoBucket)',
      saveAllowed(rules, db, 'demo-clearsky', 'vppsim', person('ana', 'clearsky-usa.com')), true);
    expect('  a demo bucket owner who is not staff meets the package (its period is closed)',
      saveAllowed(rules, db, 'demo-sunesol', 'vppsim', person('sam', 'sunesol.com')), false);
    return out;
  });
}
/* Edits of the rule this section must catch: each is found in the live
   text (else the list is stale and fails here) and each must fail at least
   one expectation above. */
var TOOL_CLAUSE = "&& tool in get(/databases/$(database)/documents/omega_orgs/$(o)/billing/current).data.get('toolAccess', [])";
var MEMBER_CLAUSE = "(tMember(o).get('toolAccess', null) == null || tool in tMember(o).get('toolAccess', []))";
var MUTANTS = [
  ['the tool clause negated', TOOL_CLAUSE, "&& !(tool in get(/databases/$(database)/documents/omega_orgs/$(o)/billing/current).data.get('toolAccess', []))"],
  ['the tool clause deleted', TOOL_CLAUSE, ''],
  ['the tool clause joined by || instead of &&', TOOL_CLAUSE, TOOL_CLAUSE.replace(/^&&/, '||')],
  ['the tool clause reading another field', TOOL_CLAUSE, TOOL_CLAUSE.replace("'toolAccess'", "'tools'")],
  ['the tool clause defaulting to a list that names a tool', TOOL_CLAUSE, TOOL_CLAUSE.replace("'toolAccess', []", "'toolAccess', ['editor']")],
  ['the member clause negated', MEMBER_CLAUSE, '!' + MEMBER_CLAUSE],
  ['the period check dropped', "&& packagePeriodOpen(get(/databases/$(database)/documents/omega_orgs/$(o)/billing/current).data)", ''],
  ['packageWrite no longer consulted by the toolData write', '&& packageWrite(orgId, toolKey);', ';'],
  ['accessUntil no longer compared with now', "&& now < b.get('accessUntil', 0)", ''],
  ['a viewer admitted by the role list', "tRole(o) in ['owner', 'admin', 'member']", "tRole(o) in ['owner', 'admin', 'member', 'viewer']"]
];

/* T10: EVERY clause, not a hand-picked few. The toolData write's condition
   and packageWrite()'s body are cut out of the live text and split into
   their && / || clauses at every depth (a parenthesised group is a clause
   and so is each clause inside it); each clause is then DELETED and,
   separately, NEGATED, and every such rule must fail this section. A
   mutant that survives must be named in EQUIVALENT with the reason it
   cannot change any outcome; the list is held exact, so a clause that
   becomes decidable (or one that stops being) fails here too. */
function exprAt(text, start, head) {
  var at = text.indexOf(start); if (at < 0 || text.indexOf(start, at + 1) >= 0) return null;
  var h = text.indexOf(head, at); if (h < 0) return null;
  var from = h + head.length, to = text.indexOf(';', from);
  return { from: from, to: to, src: text.slice(from, to) };
}
/* split `src` on a top-level operator; parens, brackets and quotes nest */
function splitTop(src, op) {
  var parts = [], depth = 0, q = null, last = 0, i, c;
  for (i = 0; i < src.length; i++) {
    c = src[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === "'" || c === '"') q = c;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (!depth && src.substr(i, 2) === op) { parts.push(src.slice(last, i)); last = i + 2; i++; }
  }
  parts.push(src.slice(last));
  return parts.map(function (x) { return x.trim(); });
}
function wrapped(src) {
  if (src[0] !== '(' || src[src.length - 1] !== ')') return false;
  var depth = 0, q = null;
  for (var i = 0; i < src.length; i++) {
    var c = src[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === "'" || c === '"') q = c; else if (c === '(') depth++; else if (c === ')') { depth--; if (!depth && i < src.length - 1) return false; }
  }
  return true;
}
function tree(src, paren) {
  var s = src.trim();
  if (wrapped(s)) return tree(s.slice(1, -1), true);
  var ops = ['||', '&&'];
  for (var k = 0; k < ops.length; k++) {
    var parts = splitTop(s, ops[k]);
    if (parts.length > 1) return { op: ops[k], paren: !!paren, items: parts.map(function (x) { return tree(x, false); }) };
  }
  return { leaf: s, paren: !!paren };
}
function ser(n) {
  var t = n.leaf != null ? n.leaf : n.items.map(ser).join(' ' + n.op + ' ');
  return n.paren ? '(' + t + ')' : t;
}
/* every clause below the root: { label, deleted, negated } as whole expressions */
function clauseMutants(root) {
  var out = [];
  (function go(n, rebuild) {
    if (n.leaf != null) return;
    n.items.forEach(function (it, i) {
      function withItem(x) {
        var items = n.items.slice(); if (x === null) items.splice(i, 1); else items[i] = x;
        return rebuild(items.length === 1 ? Object.assign({}, items[0], { paren: n.paren || items[0].paren }) : { op: n.op, paren: n.paren, items: items });
      }
      out.push({ label: ser(Object.assign({}, it, { paren: false })), deleted: withItem(null), negated: withItem({ leaf: '!(' + ser(Object.assign({}, it, { paren: false })) + ')', paren: false }) });
      go(it, function (x) { return withItem(x); });
    });
  })(root, function (x) { return ser(x); });
  return out;
}
var CLAUSE_SITES = [
  ['the toolData write', 'match /toolData/{orgId}/tools/{toolKey} {', 'allow write: if '],
  ['packageWrite()', 'function packageWrite(o, tool) {', 'return ']
];
/* a surviving mutant, and why nothing can observe it */
var EQUIVALENT = {
  'the toolData write: signedIn() deleted':
    'signed out, userOrg() reads request.auth.token of null: an error, which || with ownsDemoBucket() (false) leaves standing, and an error refuses',
  'packageWrite(): tHasMember(o) deleted':
    'with no member record tRole() reads "member", but the member-list clause then get()s the absent record: an error, and an error refuses'
};
later(function () {
  section('firestore.rules: the toolData write, evaluated from the rules text');
  var page = fs.readFileSync(path.join(ROOT, 'vpp-earnings.html'), 'utf8');
  ok('the VPP page saves under toolData/{org}/tools/vppsim', /TOOL_KEY\s*=\s*'vppsim'/.test(page) && /saveToolData\(/.test(page));
  return judgeRules(RULES).then(function (results) {
    results.forEach(function (r) { ok(r.name, r.pass, r.got); });
    var chain = Promise.resolve();
    MUTANTS.forEach(function (m) {
      chain = chain.then(function () {
        var at = RULES.indexOf(m[1]);
        if (at < 0 || RULES.indexOf(m[1], at + 1) >= 0) { ok('mutant "' + m[0] + '": its text is in firestore.rules exactly once (else update MUTANTS with the rule)', false, m[1]); return null; }
        return judgeRules(RULES.slice(0, at) + m[2] + RULES.slice(at + m[1].length)).then(function (res) {
          var caught = res.filter(function (r) { return !r.pass; }).map(function (r) { return r.name.trim(); });
          ok('a rule with ' + m[0] + ' fails this section', caught.length > 0, caught);
        });
      });
    });
    return chain.then(function () {
      var survivors = [], tried = 0, chain2 = Promise.resolve();
      CLAUSE_SITES.forEach(function (site) {
        var e = exprAt(RULES, site[1], site[2]);
        if (!e) { ok(site[0] + ': found in firestore.rules exactly once', false, site[1]); return; }
        var ms = clauseMutants(tree(e.src, false));
        ok(site[0] + ': its clauses were read (' + ms.length + ')', ms.length >= (site[0] === 'packageWrite()' ? 10 : 4), ms.map(function (m) { return m.label; }));
        ms.forEach(function (m) {
          [['deleted', m.deleted], ['negated', m.negated]].forEach(function (v) {
            chain2 = chain2.then(function () {
              tried++;
              return judgeRules(RULES.slice(0, e.from) + v[1] + RULES.slice(e.to)).then(function (res) {
                if (!res.some(function (r) { return !r.pass; })) survivors.push(site[0] + ': ' + m.label + ' ' + v[0]);
              }, function (err) { survivors.push(site[0] + ': ' + m.label + ' ' + v[0] + ' (threw ' + err.message + ')'); });
            });
          });
        });
      });
      return chain2.then(function () {
        var unexplained = survivors.filter(function (s) { return !EQUIVALENT[s]; });
        var stale = Object.keys(EQUIVALENT).filter(function (k) { return survivors.indexOf(k) < 0; });
        ok('every clause of the toolData write and of packageWrite(), deleted or negated, fails this section (' + tried + ' mutants; the survivors are the named equivalents)',
          tried >= 28 && unexplained.length === 0, unexplained);
        ok('each named equivalent still survives (else take it off EQUIVALENT)', stale.length === 0, stale);
      });
    });
  });
});

/* ── 4 · the catalog this backfill last covered ───────────────────────── */
/* A stored toolAccess is a copy, so a module that GAINS a tool strands every
   package saved before the deploy (the rules refuse the new tool's saves).
   When this fails: run `node scripts/backfill-packaged-toolaccess.js`, then
   with `--apply`, with the deploy that changes the catalog, and update this
   list. A tool REMOVED from a module is not taken back by the backfill (it
   only adds); the engine narrows the grant at the next paid reconcile. */
var BACKFILLED = {
  'lite': 'editor sandbox sales intake opportunity financing signal vppsim',
  'gridatlas': 'gridatlas interconnect comedcap',
  'storage': 'batterysizer proforma valuestack isocalc bessscreening',
  'estimate': 'costestimator',
  'evrebates': 'evcostwb evcloseout',
  'plansets': '',
  'siteintel': 'parcelscreening',
  'engineering': 'conductorsizing powerflow siteoptimizer',
  'finance': 'investment dcfc fleet apartment degradation',
  'compute': 'datacenter computepower computelease computeproforma',
  'ops': 'sitelifecycle omconsole slaintel fieldservice ownerreport fleetcommand',
  'whitelabel': '',
  'permitting': '',
  'sitefinder': 'sitefinder sitediscovery',
  'logic-office': '',
  'logic-plant': '',
  'logic-materials': '',
  'logic-logistics': '',
  'logic-customer': ''
};
later(function () {
  section('The catalog the backfill last covered');
  var now = {};
  M.catalog().forEach(function (m) { now[m.key] = m.tools.join(' '); });
  var gained = [];
  Object.keys(now).forEach(function (k) {
    var was = BACKFILLED[k] == null ? [] : (BACKFILLED[k] ? BACKFILLED[k].split(' ') : []);
    now[k].split(' ').filter(Boolean).forEach(function (t) { if (was.indexOf(t) < 0) gained.push(k + ':' + t); });
  });
  ok('no module has gained a tool since the last backfill (else run scripts/backfill-packaged-toolaccess.js with this deploy and update BACKFILLED)', gained.length === 0, gained);
  ok('BACKFILLED is the catalog as it stands', same(now, BACKFILLED), now);
});

later(function () {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) process.exit(1);
});
queue.catch(function (e) { console.error(e); process.exit(1); });
