/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/sales.js — the sales database's rules: who a prospect is, who may
   be written to, what a LinkedIn post may say, and how the funnel reads
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE, ES5. No Firestore, no clock of its own (every function that needs
   the time takes `now`), so the rules are tested without a database and the
   same answer is printed by the endpoint (api/sales.js), the CLI
   (scripts/sales-cli.js), the Claude Code sales agent and JARVIS.

   THE DATABASE (all Admin SDK only; firestore.rules closes every one):
     sales_prospects/{id}     a COMPANY, keyed by its email domain
                              (cleancell.us). A person who wrote from a
                              public mailbox (gmail.com) is keyed by the
                              address itself, so strangers never share a row.
     sales_activity/{id}      every touch, one flat log: a demo request, a
                              draft, a send, a reply, a call, a LinkedIn post
                              and its numbers. The dashboard is DERIVED from
                              it; nothing is counted twice.
     sales_candidates/{key}   a company a harvest NAMED but nobody has found
                              the website of yet (companyKey of the name).
                              The agent researches it into a prospect or
                              skips it; it is never written to.
     sales_suppressions/{key} do not contact: an address, or "*@domain". An
                              unsubscribe, a bounce or a "stop" writes it and
                              nothing removes it.
     sales_config/current     the switch and the sender (enabled, sender,
                              postal address, daily cap, off-limits list).
     sales_counters/{name}    the public demo form's daily cap.

   STAGES are the twin's (omega-twin TWIN_BUILD_PLAN.md, twin_pipeline):
   target → contacted → demo → trial → proposal → won | lost. A stage only
   moves FORWARD on an explicit signal; backwards (or to lost) is a person's
   call, never an agent's. Inbound leads land at `contacted`.

   What it deliberately does NOT know: prices and modules. The price book is
   the packaging build's and has one copy (api/_lib/pricebook.js); a message
   that needs a price hands off to the proposal tool. lintPost() refuses a
   price in a LinkedIn post outright: the website may carry the price list,
   LinkedIn may not (decided 2026-09-27).
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var PUBLIC = require('./public-domains');

var DAY = 86400000, HOUR = 3600000;

var STAGES = ['target', 'contacted', 'demo', 'trial', 'proposal', 'won', 'lost'];
var OPEN = ['target', 'contacted', 'demo', 'trial', 'proposal'];
var VERTICALS = ['oem', 'developer', 'epc', 'installer'];

/* Every activity kind, and the channel it counts under. An unknown kind is
   refused rather than stored: the dashboard adds up kinds by name, and a
   misspelt one would be a touch that never shows. */
var KINDS = {
  'demo-request': 'web',        /* the website form (api/demo-request.js) */
  'signup': 'web',              /* noted by the agent; the board reads omega_orgs itself */
  'research': 'research',       /* the agent or Jarvis found and filed a company */
  'email-drafted': 'email',     /* a Gmail draft exists; nothing has gone out */
  'email-sent': 'email',        /* a person pressed send */
  'reply': 'email',             /* they wrote back */
  'call': 'phone',
  'meeting': 'meeting',         /* a demo or a call that happened */
  'proposal-sent': 'email',
  'linkedin-drafted': 'linkedin',
  'linkedin-published': 'linkedin',
  'linkedin-stats': 'linkedin', /* impressions, reactions, comments, clicks for one post */
  'approval-nudge': 'note',     /* the agent told a person a signup is waiting */
  'stage': 'note',
  'suppressed': 'note',
  'note': 'note',
  'agent-run': 'agent'          /* one morning run: what it read, drafted and skipped */
};
/* Kinds that ANSWER an inbound request. A draft is not an answer: it has
   not left the building. */
var ANSWERS = ['email-sent', 'reply', 'call', 'meeting', 'proposal-sent'];

/* Never written to by the agent, whatever the list says. Signed-agreement
   tenants (docs/SALES-AGENT.md §5: FENECON, the OSA JV's member firms) until
   counsel clears them, the twin's standing never-contact (omega-twin
   CLAUDE.md), and ourselves. sales_config.offLimits ADDS to this; nothing
   subtracts from it. */
var OFF_LIMITS_FLOOR = [
  { domain: 'fenecon.com', why: 'Signed agreement (FENECON): no automated mail until counsel clears it' },
  { domain: 'fenecon.de', why: 'Signed agreement (FENECON): no automated mail until counsel clears it' },
  { domain: 'fenecon.us', why: 'Signed agreement (FENECON): no automated mail until counsel clears it' },
  { domain: 'sunesol.com', why: 'OSA JV member firm: governed by the JV agreement' },
  { domain: 'ogisolar.com', why: 'OSA JV member firm: governed by the JV agreement' },
  { domain: 'lionheart.com', why: 'Never contact (standing rule)' },
  { domain: 'lionheartenergy.com', why: 'Never contact (standing rule)' },
  { domain: 'clearsky-usa.com', why: 'Ourselves' }
];
/* not a person's mailbox (the twin's NOT_A_MAILBOX, same words) */
var NOT_A_MAILBOX = /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounces?|unsubscribe)([+.@-]|$)/i;
var ROLE_BOX = /^(info|sales|contact|hello|admin|office|support|team)@/i;

/* ── cleaning ─────────────────────────────────────────────────────────── */
function clean(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 200);
}
/* multi-line text (a message, a post body): keep newlines, drop other controls */
function cleanText(v, max) {
  return String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, max || 4000);
}
var DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
function normDomain(v) {
  var s = String(v == null ? '' : v).trim().toLowerCase();
  if (s.indexOf('@') >= 0) s = s.split('@').pop();
  s = s.replace(/^[a-z]+:\/\//, '').split(/[\/?#:]/)[0].replace(/^www\./, '').replace(/\.$/, '');
  if (!s || s.length > 253 || !DOMAIN_RE.test(s) || !/[a-z]/.test(s.split('.').pop())) return '';
  return s;
}
function normEmail(v) {
  var s = String(v == null ? '' : v).trim().toLowerCase();
  if (s.length > 254 || !/^[^\s@<>()",;:]+@[^\s@<>()",;:]+$/.test(s)) return '';
  var at = s.lastIndexOf('@'), local = s.slice(0, at), dom = normDomain(s.slice(at + 1));
  if (!local || !dom) return '';
  return local + '@' + dom;
}
function isPublicDomain(d) { return PUBLIC.indexOf(String(d || '').toLowerCase()) >= 0; }
function domainMatches(d, rule) { d = String(d || ''); rule = String(rule || ''); return !!rule && (d === rule || d.slice(-(rule.length + 1)) === '.' + rule); }

/* The id of the row a person or company lives on. A work domain is the
   company; a public mailbox is that one person. '' when neither is valid. */
function prospectIdFor(o) {
  o = o || {};
  var email = normEmail(o.email), dom = normDomain(o.domain || o.website || (email ? email.split('@')[1] : ''));
  if (dom && !isPublicDomain(dom)) return dom;
  return email || '';
}

function stageRank(s) { var i = STAGES.indexOf(s); return i < 0 ? -1 : i; }
/* forward only: `lost` and `won` are ends; nothing automatic leaves them */
function forward(current, next) {
  if (stageRank(next) < 0) return current || 'target';
  if (!current || stageRank(current) < 0) return next === 'lost' ? 'target' : next;
  if (current === 'won' || current === 'lost') return current;
  if (next === 'lost') return current;
  return stageRank(next) > stageRank(current) ? next : current;
}

function cleanContact(c) {
  c = c || {};
  var out = { name: clean(c.name, 100), title: clean(c.title, 100), email: normEmail(c.email),
    phone: clean(c.phone, 40), linkedin: clean(c.linkedin, 200), source: clean(c.source, 80) };
  if (out.linkedin && !/^https:\/\/([a-z]{2,3}\.)?linkedin\.com\//i.test(out.linkedin)) out.linkedin = '';
  Object.keys(out).forEach(function (k) { if (!out[k]) delete out[k]; });
  return out.name || out.email ? out : null;
}
function cleanEvidence(e) {
  e = e || {};
  var out = { text: clean(e.text, 300), url: clean(e.url, 300), source: clean(e.source, 80) };
  if (out.url && !/^https?:\/\//i.test(out.url)) out.url = '';
  Object.keys(out).forEach(function (k) { if (!out[k]) delete out[k]; });
  return out.text || out.url ? out : null;
}

/* One incoming prospect (from a harvest, the agent, Jarvis or the form),
   cleaned. Returns { ok, prospect } or { ok:false, error }. */
function cleanProspect(p) {
  p = p || {};
  var contacts = (Array.isArray(p.contacts) ? p.contacts : (p.contact ? [p.contact] : [])).map(cleanContact).filter(Boolean).slice(0, 20);
  var id = prospectIdFor({ domain: p.domain || p.website, email: (contacts[0] || {}).email || p.email });
  if (!id) return { ok: false, error: 'a prospect needs a company domain or a contact email' };
  var vertical = clean(p.vertical, 20).toLowerCase();
  var out = {
    id: id, domain: id.indexOf('@') < 0 ? id : '', company: clean(p.company || p.name, 120),
    vertical: VERTICALS.indexOf(vertical) >= 0 ? vertical : '',
    state: clean(p.state, 2).toUpperCase(), city: clean(p.city, 80),
    website: clean(p.website, 200), phone: clean(p.phone, 40), summary: clean(p.summary, 300),
    contacts: contacts,
    evidence: (Array.isArray(p.evidence) ? p.evidence : []).map(cleanEvidence).filter(Boolean).slice(0, 20),
    tags: (Array.isArray(p.tags) ? p.tags : []).map(function (t) { return clean(t, 40).toLowerCase(); }).filter(Boolean).slice(0, 20),
    source: p.source ? { kind: clean(p.source.kind || p.source, 40), ref: clean(p.source.ref, 200) } : null,
    stage: STAGES.indexOf(p.stage) >= 0 ? p.stage : '',
    next: p.next && clean(p.next.action, 200) ? { action: clean(p.next.action, 200), due: validDay(p.next.due) } : null,
    inbound: p.inbound === true
  };
  if (out.state && !/^[A-Z]{2}$/.test(out.state)) out.state = '';
  if (out.website && !/^https?:\/\//i.test(out.website)) out.website = 'https://' + out.website;
  return { ok: true, prospect: out };
}
function validDay(v) { var s = clean(v, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z')) ? s : ''; }

function uniqBy(list, keyFn, cap) {
  var seen = {}, out = [];
  (list || []).forEach(function (x) { if (!x) return; var k = keyFn(x); if (!k || seen[k]) return; seen[k] = 1; out.push(x); });
  return cap ? out.slice(0, cap) : out;
}

/* Merge an incoming (cleaned) prospect onto what is stored. Additive: a
   harvest never blanks a field, never overwrites a value a person typed
   (opts.overwrite is staff only), and never moves a stage backwards. */
function mergeProspect(existing, inc, now, opts) {
  opts = opts || {};
  var e = existing || {}, out = {};
  Object.keys(e).forEach(function (k) { out[k] = e[k]; });
  out.id = e.id || inc.id;
  out.domain = e.domain || inc.domain || '';
  ['company', 'vertical', 'state', 'city', 'website', 'phone', 'summary'].forEach(function (k) {
    if (inc[k] && (!out[k] || opts.overwrite)) out[k] = inc[k];
  });
  /* contacts: one per address, else one per name; new facts fill blanks */
  var byKey = {}, contacts = [];
  (e.contacts || []).concat(inc.contacts || []).forEach(function (c) {
    if (!c) return;
    var k = c.email ? 'e:' + c.email : 'n:' + String(c.name || '').toLowerCase();
    if (byKey[k]) { Object.keys(c).forEach(function (f) { if (c[f] && !byKey[k][f]) byKey[k][f] = c[f]; }); return; }
    var copy = {}; Object.keys(c).forEach(function (f) { copy[f] = c[f]; });
    byKey[k] = copy; contacts.push(copy);
  });
  out.contacts = contacts.slice(0, 30);
  out.evidence = uniqBy((e.evidence || []).concat((inc.evidence || []).map(function (x) { var y = {}; Object.keys(x).forEach(function (k) { y[k] = x[k]; }); y.at = y.at || new Date(now).toISOString(); return y; })),
    function (x) { return x.url || x.text; }, 50);
  out.tags = uniqBy((e.tags || []).concat(inc.tags || []), function (t) { return t; }, 30);
  var srcs = (e.sources || []).slice();
  if (inc.source && inc.source.kind) srcs.push({ kind: inc.source.kind, ref: inc.source.ref || '', at: new Date(now).toISOString() });
  out.sources = uniqBy(srcs, function (s) { return s.kind + '|' + (s.ref || ''); }, 30);
  var next = inc.stage || (inc.inbound ? 'contacted' : '') || 'target';
  out.stage = opts.allowBack && inc.stage ? inc.stage : forward(e.stage, next);
  if (inc.next) out.next = inc.next;
  if (inc.inbound) out.inbound = true;
  out.createdAt = e.createdAt || new Date(now).toISOString();
  out.updatedAt = new Date(now).toISOString();
  out.score = score(out, now);
  return out;
}

/* Who to work first, 0–100. Deliberately simple and explained in one line
   each, so a person can argue with it: somebody who ASKED beats somebody we
   found; a named person at a work address beats a company page; evidence
   and a live stage add; a closed row is not work. */
function score(p, now) {
  if (!p || p.stage === 'won' || p.stage === 'lost') return 0;
  var s = 0, contacts = p.contacts || [];
  if (p.inbound) s += 40;
  s += { target: 0, contacted: 10, demo: 25, trial: 30, proposal: 35 }[p.stage] || 0;
  var work = contacts.some(function (c) { return c.email && !isPublicDomain(c.email.split('@')[1]) && !ROLE_BOX.test(c.email) && c.name; });
  s += work ? 15 : contacts.length ? 5 : 0;
  s += Math.min(3, (p.evidence || []).length) * 5;
  if (p.vertical) s += 5;
  var touched = millis(p.lastTouchAt);
  if (touched != null && now - touched < 14 * DAY) s += 5;
  return Math.min(100, s);
}

/* May the agent write to this address? { ok, reason, warn }.
   ctx: { suppressed: { '<email>':1, '*@<domain>':1 }, offLimits: [{domain, why}],
          inbound: true when THEY wrote to us first (a public mailbox is then fine) } */
function screen(email, ctx) {
  ctx = ctx || {};
  var e = normEmail(email);
  if (!e) return { ok: false, reason: 'not an email address' };
  var local = e.split('@')[0], dom = e.split('@')[1], sup = ctx.suppressed || {};
  if (NOT_A_MAILBOX.test(local + '@')) return { ok: false, reason: 'not a person\'s mailbox' };
  if (sup[e]) return { ok: false, reason: 'on the do-not-contact list' };
  var parts = dom.split('.');
  for (var i = 0; i < parts.length - 1; i++) { if (sup['*@' + parts.slice(i).join('.')]) return { ok: false, reason: 'the domain is on the do-not-contact list' }; }
  var rules = OFF_LIMITS_FLOOR.concat(ctx.offLimits || []);
  for (var j = 0; j < rules.length; j++) {
    if (domainMatches(dom, normDomain(rules[j].domain))) return { ok: false, reason: 'off limits: ' + (rules[j].why || rules[j].domain) };
  }
  if (isPublicDomain(dom) && !ctx.inbound) return { ok: false, reason: 'a public mailbox: work addresses only, unless they wrote to us first' };
  return { ok: true, warn: ROLE_BOX.test(e) ? 'a shared inbox, not a person: use it only if there is no named contact' : '' };
}

/* ── lists: a CSV someone hands us, and names a harvest finds ─────────── */
/* ONE mapping from a sheet's headers to a prospect, for the account master
   list, a trade-show export or a harvested table. Lower-case header → field. */
var PROSPECT_COLUMNS = {
  company: ['company', 'company name', 'business', 'business name', 'account', 'account name', 'organization', 'organisation', 'name', 'developer', 'developer name', 'developer_name', 'contractor', 'contractor name', 'installer', 'contractor_applicant'],
  domain: ['domain', 'website', 'web', 'url', 'site', 'company website', 'web site', 'company url'],
  email: ['email', 'e-mail', 'contact email', 'email address', 'work email'],
  contactName: ['contact', 'contact name', 'full name', 'person', 'primary contact'],
  firstName: ['first name', 'first', 'firstname', 'given name'],
  lastName: ['last name', 'last', 'lastname', 'surname', 'family name'],
  title: ['title', 'job title', 'role', 'position'],
  phone: ['phone', 'phone number', 'telephone', 'tel', 'mobile', 'direct'],
  linkedin: ['linkedin', 'linkedin url', 'linkedin profile', 'person linkedin url'],
  city: ['city', 'town', 'city_town'],
  state: ['state', 'st', 'province', 'state/province', 'region'],
  vertical: ['vertical', 'type', 'category', 'segment', 'industry', 'business type'],
  notes: ['notes', 'note', 'summary', 'description', 'comments', 'why'],
  stage: ['stage', 'pipeline stage']
};
function guessProspectMapping(headers) {
  var map = {};
  (headers || []).forEach(function (h) {
    var k = String(h || '').trim().toLowerCase().replace(/\s+/g, ' ');
    Object.keys(PROSPECT_COLUMNS).some(function (f) { if (PROSPECT_COLUMNS[f].indexOf(k) >= 0) { if (!valuesOf(map).some(function (v) { return v === f; })) map[h] = f; return true; } return false; });
  });
  return map;
}
function valuesOf(o) { return Object.keys(o).map(function (k) { return o[k]; }); }
/* a sheet says "Solar installer", "EPC", "IPP"; the platform says one of four */
function verticalFrom(text) {
  var t = String(text || '').toLowerCase();
  if (!t) return '';
  if (VERTICALS.indexOf(t) >= 0) return t;
  if (/\b(oem|manufactur|distribut|technology|equipment|supplier|vendor)/.test(t)) return 'oem';
  if (/\b(epc|engineer|construction|contractor services)/.test(t)) return 'epc';
  if (/\b(develop|owner|ipp|capital|fund|invest|utility|asset)/.test(t)) return 'developer';
  if (/\b(install|electric|solar|ev charg|contractor|dealer|sales)/.test(t)) return 'installer';
  return '';
}
/* one sheet row → an incoming prospect (cleanProspect() does the rest) */
function rowToProspect(raw, mapping, defaults) {
  defaults = defaults || {};
  var v = {}; Object.keys(mapping || {}).forEach(function (h) { var f = mapping[h], x = raw[h]; if (f && x != null && String(x).trim() !== '') v[f] = String(x).trim(); });
  var name = v.contactName || [v.firstName, v.lastName].filter(Boolean).join(' ');
  var contact = (name || v.email) ? { name: name, email: v.email, title: v.title, phone: v.phone, linkedin: v.linkedin, source: defaults.label || 'list' } : null;
  return {
    company: v.company, domain: v.domain, website: v.domain && /\//.test(v.domain) ? v.domain : '',
    email: v.email, contacts: contact ? [contact] : [], city: v.city, state: v.state || defaults.state,
    vertical: verticalFrom(v.vertical) || defaults.vertical || '', summary: v.notes, stage: STAGES.indexOf(String(v.stage || '').toLowerCase()) >= 0 ? String(v.stage).toLowerCase() : '',
    evidence: defaults.evidence ? [defaults.evidence] : [], tags: defaults.tags || [],
    source: defaults.source || { kind: 'list', ref: defaults.label || '' }
  };
}
/* the same company under three spellings ("Sunrun Inc", "Sunrun, Inc.",
   "SUNRUN") is one candidate */
function companyKey(name) {
  return String(name || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(inc|incorporated|llc|l l c|ltd|limited|corp|corporation|co|company|lp|llp|pllc|plc|the|dba)\b/g, ' ')
    .replace(/\s+/g, ' ').trim().replace(/ /g, '-').slice(0, 80);
}
/* a harvested name, before anyone has found its website: a CANDIDATE, kept
   apart from prospects so the book never fills with rows nobody can write to */
function cleanCandidate(c) {
  c = c || {};
  var company = clean(c.company, 120), key = companyKey(company);
  if (!key || key.length < 2) return { ok: false, error: 'a candidate needs a company name' };
  var v = clean(c.vertical, 20).toLowerCase();
  return { ok: true, candidate: { key: key, company: company, vertical: VERTICALS.indexOf(v) >= 0 ? v : '',
    states: (Array.isArray(c.states) ? c.states : [c.state]).map(function (s) { return clean(s, 2).toUpperCase(); }).filter(function (s) { return /^[A-Z]{2}$/.test(s); }),
    projects: Math.max(0, Math.round(Number(c.projects) || 0)),
    evidence: (Array.isArray(c.evidence) ? c.evidence : []).map(cleanEvidence).filter(Boolean).slice(0, 10),
    source: c.source && c.source.kind ? { kind: clean(c.source.kind, 40), ref: clean(c.source.ref, 120) } : null,
    tags: (Array.isArray(c.tags) ? c.tags : []).map(function (t) { return clean(t, 40).toLowerCase(); }).filter(Boolean).slice(0, 10) } };
}
function mergeCandidate(e, inc, now) {
  e = e || {};
  var out = {}; Object.keys(e).forEach(function (k) { out[k] = e[k]; });
  out.key = inc.key; out.company = e.company || inc.company; out.vertical = e.vertical || inc.vertical;
  out.states = uniqBy((e.states || []).concat(inc.states || []), function (s) { return s; }, 20);
  out.evidence = uniqBy((e.evidence || []).concat(inc.evidence || []), function (x) { return (x.source || '') + '|' + (x.url || x.text); }, 20);
  var srcs = (e.sources || []).slice(); if (inc.source) srcs.push({ kind: inc.source.kind, ref: inc.source.ref, at: new Date(now).toISOString() });
  out.sources = uniqBy(srcs, function (s) { return s.kind + '|' + s.ref; }, 20);
  /* projects per source, so a re-run of one harvest replaces its own count
     instead of adding to it */
  var per = {}; Object.keys(e.projectsBySource || {}).forEach(function (k) { per[k] = e.projectsBySource[k]; });
  if (inc.source && inc.projects) per[inc.source.ref || inc.source.kind] = inc.projects;
  out.projectsBySource = per;
  out.projects = valuesOf(per).reduce(function (a, b) { return a + (Number(b) || 0); }, 0);
  out.tags = uniqBy((e.tags || []).concat(inc.tags || []), function (t) { return t; }, 20);
  out.status = e.status || 'new';
  out.createdAt = e.createdAt || new Date(now).toISOString();
  out.updatedAt = new Date(now).toISOString();
  return out;
}

/* ── the public demo form ─────────────────────────────────────────────── */
/* { ok, value } | { ok:false, error } | { ok:false, spam:true } */
function validDemo(b) {
  b = b || {};
  if (clean(b.website, 200)) return { ok: false, spam: true };   /* the honeypot a person never sees */
  var name = clean(b.name, 100), email = normEmail(b.email);
  if (!name) return { ok: false, error: 'Please enter your name.' };
  if (!email) return { ok: false, error: 'Please check the email address.' };
  var s = b.source || {};
  return { ok: true, value: {
    name: name, email: email, company: clean(b.company, 120), vertical: clean(b.vertical, 80), interest: clean(b.interest, 80),
    message: cleanText(b.message, 4000), page: clean(b.page, 120),
    source: { utm_source: clean(s.utm_source, 80).toLowerCase(), utm_medium: clean(s.utm_medium, 80).toLowerCase(),
      utm_campaign: clean(s.utm_campaign, 80), utm_content: clean(s.utm_content, 80),
      ref: clean(s.ref, 120).toLowerCase(), landing: clean(s.landing, 120) }
  } };
}
/* where a lead came from, as one word the dashboard can group on */
function sourceOf(src) {
  src = src || {};
  if (src.utm_source) return src.utm_source;
  if (/(^|\.)linkedin\.com$|^lnkd\.in$/.test(src.ref || '')) return 'linkedin';
  if (/(^|\.)google\./.test(src.ref || '')) return 'google';
  return src.ref ? 'referral' : 'direct';
}

/* ── LinkedIn posts ───────────────────────────────────────────────────── */
/* LinkedIn may not show a price or send people to one (2026-09-27); the
   website may. A feature the product marks soon:true is not described as
   shipping. Every link to our own site carries utm tags, or the dashboard
   cannot say which post brought which lead. */
var PRICE_PATTERNS = [
  [/\$\s?\d/, 'a dollar amount (say MW, sites or hours saved, not dollars)'],
  [/\b\d[\d,.]*\s?(\/|per\s)\s?(mo|month|yr|year|user|seat|login|site)\b/i, 'a per-period or per-seat figure'],
  [/\b(pricing|price list|prices|discount|coupon|promo code)\b/i, 'price language'],
  [/\b\d{1,2}\s?%\s?off\b/i, 'a discount'],
  [/\btwo months free\b|\bmonths? free\b/i, 'a free-months offer'],
  [/\/offerings\b|\/api\/offerings/i, 'a link to the price list'],
  [/\/(start|signup)(\.html)?\b[^\s]*\b(plan|package|monthly|yearly)/i, 'a link into the signup package step']
];
var SOON = /\b(AHJ Approval Portal|approval portal|procurement marketplace|pool(ed)? demand|aggregators? marketplace|AI data offtakers?)\b/i;
function lintPost(text) {
  var t = String(text == null ? '' : text), problems = [], warnings = [];
  if (!t.trim()) problems.push('the post is empty');
  if (t.length > 3000) problems.push('over LinkedIn\'s 3,000 characters (' + t.length + ')');
  PRICE_PATTERNS.forEach(function (p) { if (p[0].test(t)) problems.push('no prices on LinkedIn: ' + p[1]); });
  if (SOON.test(t) && !/coming soon|in development|not yet (open|live)/i.test(t)) problems.push('names a feature the product marks coming soon without saying so: ' + t.match(SOON)[0]);
  var links = t.match(/https?:\/\/[^\s)]+/g) || [];
  links.forEach(function (u) {
    if (/clearskyomega\.com/i.test(u) && !/[?&]utm_source=/i.test(u)) warnings.push('untagged link (the dashboard cannot credit this post): ' + u);
    if (/silmarillion\.clearskyomega\.com\/(start|login)/i.test(u)) warnings.push('links straight into the product; a www.clearskyomega.com page reads better cold: ' + u);
  });
  if (!links.length) warnings.push('no link: a post with nowhere to go cannot bring a lead');
  if (/\b(price|priced|cost|costs)\b/i.test(t)) warnings.push('mentions price or cost: make sure no figure or plan is implied');
  if (/\bAI\b/.test(t)) warnings.push('says "AI": lead with the work it does instead (docs/SALES-AGENT.md §7)');
  return { ok: !problems.length, problems: problems, warnings: warnings };
}
/* add utm tags to every link to our site that has none */
function tagLinks(text, campaign, medium) {
  var c = clean(campaign, 60).replace(/[^A-Za-z0-9_-]+/g, '-'), m = clean(medium || 'social', 20).replace(/[^a-z]+/g, '');
  return String(text == null ? '' : text).replace(/https?:\/\/[^\s)]+/g, function (u) {
    if (!/clearskyomega\.com/i.test(u) || /[?&]utm_source=/i.test(u)) return u;
    var hash = '', h = u.indexOf('#'); if (h >= 0) { hash = u.slice(h); u = u.slice(0, h); }
    return u + (u.indexOf('?') >= 0 ? '&' : '?') + 'utm_source=linkedin&utm_medium=' + m + (c ? '&utm_campaign=' + c : '') + hash;
  });
}

/* ── time ─────────────────────────────────────────────────────────────── */
function millis(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.toDate === 'function') return v.toDate().getTime();
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.getTime();
  if (typeof v === 'object' && typeof v.seconds === 'number') return v.seconds * 1000;
  var t = Date.parse(String(v));
  return isNaN(t) ? null : t;
}
/* business hours elapsed are what "the same day" means to a buyer; a
   Saturday request answered Monday morning was not left waiting two days */
function businessDays(from, to) {
  if (from == null || to == null || to <= from) return 0;
  var days = 0, t = from;
  while (t < to) {
    /* one calendar day (UTC) at a time, so a stretch is counted on the day it falls */
    var midnight = (Math.floor(t / DAY) + 1) * DAY;
    var step = Math.min(midnight - t, to - t), wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) days += step / DAY;
    t += step;
  }
  return days;
}
function median(xs) {
  var a = xs.filter(function (x) { return x != null && isFinite(x); }).sort(function (p, q) { return p - q; });
  if (!a.length) return null;
  var m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
function round1(n) { return n == null ? null : Math.round(n * 10) / 10; }
function pct(a, b) { return b ? Math.round((a / b) * 100) : null; }
function dayOf(ms) { return new Date(ms).toISOString().slice(0, 10); }

/* ── the dashboard ────────────────────────────────────────────────────── */
/* input: { board: api/_lib/growth.js board(), orgs: [{orgId, name, createdAt,
   approvedAt, status, selfServe}], prospects: [...], activity: [...] (newest
   first), config: sales_config/current, suppressed: count }
   Everything below is arithmetic on those rows; nothing is invented and a
   missing number is null, never 0. */
function dashboard(input, now) {
  input = input || {}; now = now || Date.now();
  var board = input.board || { tenants: [], summary: {}, today: [] };
  var acts = (input.activity || []).map(function (a) { var c = {}; Object.keys(a).forEach(function (k) { c[k] = a[k]; }); c._at = millis(a.at); return c; })
    .filter(function (a) { return a._at != null; });
  var prospects = input.prospects || [], orgs = input.orgs || [], cfg = input.config || {};
  function within(a, days) { return now - a._at <= days * DAY; }
  function count(kind, days) { return acts.filter(function (a) { return a.kind === kind && within(a, days); }).length; }

  /* approvals: a self-serve signup is the only kind a person has to act on */
  var self30 = orgs.filter(function (o) { var c = millis(o.createdAt); return o.selfServe && c != null && now - c <= 30 * DAY; });
  var waits = self30.map(function (o) { var c = millis(o.createdAt), a = millis(o.approvedAt); return a != null ? (a - c) / HOUR : null; });
  var pending = (board.tenants || []).filter(function (t) { return t.lifecycle === 'pending'; }).map(function (t) {
    return { orgId: t.orgId, name: t.name || t.orgId, who: t.who, waitingDays: t.days ? t.days.sinceSignup : null, flags: t.flags || [],
      url: '/admin/tenant?org=' + encodeURIComponent(t.orgId || '') };
  }).sort(function (a, b) { return (b.waitingDays || 0) - (a.waitingDays || 0); });
  var approved = waits.filter(function (w) { return w != null; });
  var approvals = {
    pending: pending,
    signups30: self30.length,
    approved30: approved.length,
    medianHours30: round1(median(approved)),
    sameDay30: approved.length ? approved.filter(function (w) { return w <= 24; }).length : null,
    overADay30: approved.filter(function (w) { return w > 24; }).length + pending.filter(function (p) { return (p.waitingDays || 0) >= 1; }).length
  };

  /* inbound: the website form. "Answered" is a send, a reply, a call or a
     meeting on the same prospect after the request; a draft is not. */
  var demos = acts.filter(function (a) { return a.kind === 'demo-request'; });
  var answeredAt = {};
  acts.forEach(function (a) { if (ANSWERS.indexOf(a.kind) >= 0 && a.prospectId) answeredAt[a.prospectId] = Math.max(answeredAt[a.prospectId] || 0, a._at); });
  var unanswered = demos.filter(function (d) { return !(answeredAt[d.prospectId] > d._at); }).map(function (d) {
    return { id: d.id || null, prospectId: d.prospectId || null, name: d.name || '', company: d.company || '', email: d.email || '',
      at: new Date(d._at).toISOString(), businessDays: round1(businessDays(d._at, now)), source: sourceOf(d.source), interest: d.interest || '' };
  });
  var bySource = {}, byCampaign = {};
  demos.filter(function (d) { return within(d, 30); }).forEach(function (d) {
    var s = sourceOf(d.source); bySource[s] = (bySource[s] || 0) + 1;
    var c = d.source && d.source.utm_campaign; if (c) byCampaign[c] = (byCampaign[c] || 0) + 1;
  });
  function ranked(o) { return Object.keys(o).map(function (k) { return { key: k, count: o[k] }; }).sort(function (a, b) { return b.count - a.count || a.key.localeCompare(b.key); }); }
  var responseHrs = demos.filter(function (d) { return within(d, 30) && answeredAt[d.prospectId] > d._at; }).map(function (d) { return businessDays(d._at, answeredAt[d.prospectId]) * 24; });

  /* outreach */
  function rate(days) {
    var drafted = count('email-drafted', days), sent = count('email-sent', days), replies = count('reply', days);
    return { drafted: drafted, sent: sent, replies: replies, sendRate: pct(sent, drafted), replyRate: pct(replies, sent) };
  }
  var sentIds = {};
  acts.forEach(function (a) { if (a.kind === 'email-sent' && a.ref) sentIds[a.ref] = 1; });
  var awaitingSend = acts.filter(function (a) { return a.kind === 'email-drafted' && within(a, 14) && !(a.ref && sentIds[a.ref]); }).length;

  /* LinkedIn: a post is drafted, then published (a person's hand), then its
     numbers are logged against the same ref */
  var posts = {}, publishedRefs = {};
  acts.slice().reverse().forEach(function (a) {
    if (['linkedin-drafted', 'linkedin-published', 'linkedin-stats'].indexOf(a.kind) < 0) return;
    var ref = a.ref || a.id; if (!ref) return;
    var p = posts[ref] || (posts[ref] = { ref: ref, summary: '', campaign: '', draftedAt: null, publishedAt: null, url: '', stats: null });
    if (a.summary) p.summary = a.summary;
    if (a.campaign) p.campaign = a.campaign;
    if (a.kind === 'linkedin-drafted') p.draftedAt = new Date(a._at).toISOString();
    if (a.kind === 'linkedin-published') { p.publishedAt = new Date(a._at).toISOString(); publishedRefs[ref] = 1; if (a.url) p.url = a.url; }
    if (a.kind === 'linkedin-stats' && a.stats) p.stats = a.stats;
  });
  var postList = Object.keys(posts).map(function (k) { return posts[k]; }).sort(function (a, b) { return String(b.publishedAt || b.draftedAt || '').localeCompare(String(a.publishedAt || a.draftedAt || '')); });
  var leadsFromLinkedIn30 = demos.filter(function (d) { return within(d, 30) && sourceOf(d.source) === 'linkedin'; }).length;
  var linkedin = {
    drafted30: count('linkedin-drafted', 30), published30: count('linkedin-published', 30),
    waiting: postList.filter(function (p) { return p.draftedAt && !p.publishedAt && now - millis(p.draftedAt) <= 14 * DAY; }).length,
    leads30: leadsFromLinkedIn30, posts: postList.slice(0, 12)
  };

  /* prospects */
  var byStage = {}; STAGES.forEach(function (s) { byStage[s] = 0; });
  prospects.forEach(function (p) { if (byStage[p.stage] != null) byStage[p.stage]++; });
  var open = prospects.filter(function (p) { return OPEN.indexOf(p.stage) >= 0; });
  var today = dayOf(now);
  var due = open.filter(function (p) { return p.next && p.next.due && p.next.due <= today; });
  var noNext = open.filter(function (p) { return !p.next || !p.next.action; }).length;
  var top = open.slice().sort(function (a, b) { return (b.score || 0) - (a.score || 0) || String(a.company || a.id).localeCompare(String(b.company || b.id)); }).slice(0, 12)
    .map(function (p) { return { id: p.id, company: p.company || p.id, stage: p.stage, vertical: p.vertical || '', score: p.score || 0, next: p.next || null, contact: (p.contacts || [])[0] || null }; });

  /* today: one list, most urgent first */
  var todo = [];
  pending.forEach(function (p) { todo.push({ kind: 'approve', priority: (p.waitingDays || 0) >= 1 ? 3 : 2, label: 'Approve ' + p.name, why: 'Signed up ' + fmtDays(p.waitingDays) + ' ago' + (p.flags.indexOf('asked-again') >= 0 ? ' and asked again' : ''), who: p.who, url: p.url }); });
  unanswered.forEach(function (d) { todo.push({ kind: 'reply', priority: d.businessDays >= 1 ? 3 : 2, label: 'Answer ' + (d.name || d.email) + (d.company ? ' (' + d.company + ')' : ''), why: 'Asked for a demo ' + fmtDays(d.businessDays) + ' (business) ago' + (d.source !== 'direct' ? ', from ' + d.source : ''), who: d.email, url: null }); });
  (board.tenants || []).forEach(function (t) { if (t.priority === 3 && t.lifecycle !== 'pending') todo.push({ kind: 'account', priority: 3, label: t.action, why: t.why, who: t.who, url: '/admin/tenant?org=' + encodeURIComponent(t.orgId || '') }); });
  due.forEach(function (p) { todo.push({ kind: 'prospect', priority: p.next.due < today ? 3 : 2, label: p.next.action, why: (p.company || p.id) + ' · ' + p.stage + (p.next.due < today ? ' · due ' + p.next.due : ' · due today'), who: ((p.contacts || [])[0] || {}).email || null, url: null }); });
  todo.sort(function (a, b) { return b.priority - a.priority; });

  var out = {
    asOf: new Date(now).toISOString(),
    funnel: { signups30: self30.length, pending: pending.length, trial: (board.summary || {}).trial || 0, paying: (board.summary || {}).paying || 0,
      pastDue: (board.summary || {}).pastDue || 0, prospects: byStage, openProspects: open.length, totalProspects: prospects.length },
    approvals: approvals,
    inbound: { demoRequests7: count('demo-request', 7), demoRequests30: count('demo-request', 30), unanswered: unanswered,
      medianResponseHours30: round1(median(responseHrs)), bySource30: ranked(bySource), byCampaign30: ranked(byCampaign) },
    outreach: { d7: rate(7), d30: rate(30), awaitingSend: awaitingSend, calls30: count('call', 30), meetings30: count('meeting', 30), proposals30: count('proposal-sent', 30) },
    linkedin: linkedin,
    prospects: { top: top, due: due.length, noNext: noNext },
    today: todo.slice(0, 30),
    activity: acts.slice(0, 40).map(function (a) { return { id: a.id || null, kind: a.kind, channel: KINDS[a.kind] || 'note', at: new Date(a._at).toISOString(), prospectId: a.prospectId || null, orgId: a.orgId || null, summary: a.summary || '', by: a.by || null }; }),
    config: { enabled: cfg.enabled === true, sender: cfg.sender || null, senderName: cfg.senderName || null,
      postalAddress: clean(cfg.postalAddress, 300) || null, postalAddressSet: !!clean(cfg.postalAddress, 300),
      dailyDraftCap: cfg.dailyDraftCap || null, demoLink: cfg.demoLink || null, linkedinChannel: cfg.linkedinChannel || 'gmail-drafts' },
    suppressed: input.suppressed == null ? null : input.suppressed
  };
  out.suggestions = suggestions(out, acts, now);
  return out;
}
function fmtDays(d) { if (d == null) return '?'; var r = Math.round(d); if (r < 1) return 'less than a day'; return r === 1 ? '1 day' : r + ' days'; }

/* What to change about the process, from the numbers. Each line names the
   number it came from; a line with nothing behind it is not printed. */
function suggestions(d, acts, now) {
  var out = [];
  function add(level, text) { out.push({ level: level, text: text }); }
  var ap = d.approvals, oldest = ap.pending[0];
  if (oldest && (oldest.waitingDays || 0) >= 1) add('act', ap.pending.length + ' signup' + (ap.pending.length === 1 ? '' : 's') + ' waiting for approval; the oldest ' + fmtDays(oldest.waitingDays) + '. Approve daily: a pending workspace shows locked tools.');
  if (ap.medianHours30 != null && ap.medianHours30 > 24) add('act', 'Median time to approve a signup is ' + ap.medianHours30 + ' hours this month. Target: the same day.');
  var late = d.inbound.unanswered.filter(function (u) { return u.businessDays >= 1; });
  if (late.length) add('act', late.length + ' demo request' + (late.length === 1 ? '' : 's') + ' unanswered after a business day. The site promises a reply within one.');
  if (!d.config.sender || !d.config.postalAddressSet) add('act', 'Cold email is blocked: sales_config needs a monitored clearsky-usa.com sender and a postal address (CAN-SPAM) before the agent drafts to anyone who has not written to us.');
  if (!d.config.enabled) add('watch', 'The agent is switched off (sales_config.enabled). It still reports; it drafts nothing.');
  var o = d.outreach.d30;
  if (o.drafted >= 5 && o.sendRate != null && o.sendRate < 50) add('watch', 'Drafts are not going out: ' + o.sent + ' of ' + o.drafted + ' sent in 30 days. Clear Gmail Drafts each morning, or have the agent draft fewer.');
  if (o.sent >= 10 && o.replyRate != null && o.replyRate < 5) add('watch', 'Reply rate is ' + o.replyRate + '% on ' + o.sent + ' sends. Change the opener or the list before sending more.');
  if (d.linkedin.waiting >= 3) add('watch', d.linkedin.waiting + ' LinkedIn posts drafted and not published. Publish or drop them; a queue nobody reads is not a channel.');
  if (d.linkedin.published30 >= 4 && !d.linkedin.leads30) add('watch', d.linkedin.published30 + ' posts in 30 days and no demo request credited to LinkedIn. Check each post links to a www page with utm tags, and try one that offers a site screen.');
  if (d.funnel.openProspects >= 10 && d.prospects.noNext / d.funnel.openProspects > 0.2) add('watch', d.prospects.noNext + ' open prospects have no next action. The agent sets one on every row it touches.');
  var last7 = acts.filter(function (a) { return now - a._at <= 7 * DAY && a.kind !== 'agent-run'; }).length;
  if (!last7) add('act', 'No sales activity logged in seven days.');
  var direct = (d.inbound.bySource30.filter(function (s) { return s.key === 'direct'; })[0] || {}).count || 0;
  if (d.inbound.demoRequests30 >= 3 && direct / d.inbound.demoRequests30 > 0.6) add('watch', direct + ' of ' + d.inbound.demoRequests30 + ' demo requests carry no source. Tag every link in posts and emails (the agent does: lint-post --tag).');
  if (!out.length) add('ok', 'Nothing to change today: approvals are on time and every request is answered.');
  return out;
}

module.exports = {
  STAGES: STAGES, OPEN: OPEN, KINDS: KINDS, ANSWERS: ANSWERS, OFF_LIMITS_FLOOR: OFF_LIMITS_FLOOR, VERTICALS: VERTICALS,
  clean: clean, cleanText: cleanText, normDomain: normDomain, normEmail: normEmail, isPublicDomain: isPublicDomain,
  prospectIdFor: prospectIdFor, forward: forward, stageRank: stageRank, cleanContact: cleanContact, cleanProspect: cleanProspect,
  mergeProspect: mergeProspect, score: score, screen: screen, validDemo: validDemo, sourceOf: sourceOf,
  lintPost: lintPost, tagLinks: tagLinks, millis: millis, businessDays: businessDays, dashboard: dashboard, suggestions: suggestions, validDay: validDay,
  PROSPECT_COLUMNS: PROSPECT_COLUMNS, guessProspectMapping: guessProspectMapping, verticalFrom: verticalFrom, rowToProspect: rowToProspect,
  companyKey: companyKey, cleanCandidate: cleanCandidate, mergeCandidate: mergeCandidate
};
