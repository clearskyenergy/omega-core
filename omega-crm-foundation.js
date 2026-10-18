/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * omega-crm-foundation.js — the proposed attachment model for the CRM relaunch.
 *
 * Pure. No Firebase, no network, no writes. The prototype page renders
 * sample() through these functions. A later endpoint can require() the same
 * file; until then nothing in the editor, Prime, orders, or the rules calls it.
 *
 * The model is the one in docs/CRM-RELAUNCH.md. A project, site, design,
 * analysis, proposal, order, or document keeps the record it already has.
 * What is new is a party link: that record, a customer account that already
 * lives under the tenant, a role, and an optional contact.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.OmegaCrmFoundation = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var KINDS = ['project', 'site', 'design', 'analysis', 'proposal', 'order', 'document'];

  /* singular: one account may hold this role on a given object. The customer
     is the commercial account. Everyone else is a stakeholder beside them. */
  var ROLES = [
    { key: 'customer', label: 'Customer', singular: true },
    { key: 'client', label: 'Client', singular: false },
    { key: 'host', label: 'Site host', singular: false },
    { key: 'utility', label: 'Utility', singular: false },
    { key: 'epc', label: 'EPC', singular: false },
    { key: 'installer', label: 'Installer', singular: false },
    { key: 'capital', label: 'Capital partner', singular: false },
    { key: 'partner', label: 'Partner', singular: false },
    { key: 'stakeholder', label: 'Stakeholder', singular: false }
  ];

  /* Allowlist. Adding a provider is a decision, not a free-text field.
     auth 'oauth' is the per-tenant connection. auth 'api' is a key the
     tenant pastes, still stored only on the server. solar marks the
     solar-industry CRMs, which attach a design as well as a deal. */
  var PROVIDERS = [
    { key: 'hubspot', label: 'HubSpot', auth: 'oauth', solar: false,
      objects: { account: 'companies', contact: 'contacts', project: 'deals' } },
    { key: 'salesforce', label: 'Salesforce', auth: 'oauth', solar: false,
      objects: { account: 'Account', contact: 'Contact', project: 'Opportunity' } },
    { key: 'zoho', label: 'Zoho CRM', auth: 'oauth', solar: false,
      objects: { account: 'Accounts', contact: 'Contacts', project: 'Deals' } },
    { key: 'pipedrive', label: 'Pipedrive', auth: 'oauth', solar: false,
      objects: { account: 'organizations', contact: 'persons', project: 'deals' } },
    { key: 'gohighlevel', label: 'GoHighLevel', auth: 'oauth', solar: false,
      objects: { account: 'businesses', contact: 'contacts', project: 'opportunities' } },
    { key: 'aurora', label: 'Aurora Solar', auth: 'api', solar: true,
      objects: { project: 'projects', design: 'designs' } },
    { key: 'enerflo', label: 'Enerflo', auth: 'api', solar: true,
      objects: { account: 'customers', project: 'jobs', design: 'designs' } },
    { key: 'jobnimbus', label: 'JobNimbus', auth: 'api', solar: true,
      objects: { account: 'contacts', project: 'jobs' } }
  ];

  /* Who wins a field when both sides have edited it since the last sync.
     omega: the platform's figure stands (capacity, price, address, drawing).
     remote: the CRM's value is the pipeline, and only when a tenant has
             said so. The default book below does not mark any field remote.
     either: both may edit; if both did, a person decides. */
  var FIELDS = {
    account: [
      { key: 'name', label: 'Company', owner: 'omega' },
      { key: 'domain', label: 'Email domain', owner: 'omega' },
      { key: 'phone', label: 'Phone', owner: 'either' },
      { key: 'city', label: 'City', owner: 'either' }
    ],
    project: [
      { key: 'name', label: 'Project', owner: 'omega' },
      { key: 'address', label: 'Address', owner: 'omega' },
      { key: 'stage', label: 'Stage', owner: 'either' },
      { key: 'kw', label: 'Power (kW)', owner: 'omega' },
      { key: 'kwh', label: 'Energy (kWh)', owner: 'omega' },
      { key: 'capex', label: 'Project cost', owner: 'omega' }
    ]
  };

  var SOURCES = {
    editor: 'Site Map',
    prime: 'Omega Prime',
    orders: 'Order',
    portfolio: 'Site register',
    editorlite: 'Design',
    vppsim: 'VPP simulator',
    proforma: 'Pro forma',
    computeproforma: 'Compute pro forma',
    sales: 'Proposal',
    bill: 'Bill analysis'
  };

  function fail(status, message) {
    var e = new Error(message);
    e.status = status;
    return e;
  }
  function text(v, max, label) {
    if (v == null) v = '';
    if (typeof v !== 'string' && typeof v !== 'number') throw fail(400, label + ' must be text');
    var s = String(v).replace(/[\u0000-\u001f\u007f]/g, '').trim();
    if (s.length > max) throw fail(400, label + ' is limited to ' + max + ' characters');
    return s;
  }
  function recordId(v, label) {
    var s = text(v, 120, label || 'Record');
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(s)) throw fail(400, (label || 'Record') + ' id is not valid');
    return s;
  }
  function orgId(v) {
    var s = text(v, 120, 'Organization').toLowerCase();
    if (!/^[a-z0-9][a-z0-9.-]{0,119}$/.test(s) || s.indexOf('..') >= 0) throw fail(400, 'Organization id is not valid');
    return s;
  }
  function findRole(key) {
    for (var i = 0; i < ROLES.length; i++) if (ROLES[i].key === key) return ROLES[i];
    return null;
  }
  function findProvider(key) {
    for (var i = 0; i < PROVIDERS.length; i++) if (PROVIDERS[i].key === key) return PROVIDERS[i];
    return null;
  }
  function roleLabel(key) {
    var r = findRole(key);
    return r ? r.label : '';
  }
  function sourceLabel(key) {
    return SOURCES[key] || '';
  }
  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function linkIdOf(link) {
    return link.kind + '__' + link.objectId + '__' + link.role + '__' + link.accountId;
  }

  /* What a later endpoint would accept from a page. Timestamps and the
     author are stamped by that endpoint, not by the browser. */
  function linkInput(b) {
    b = b || {};
    var kind = text(b.kind, 40, 'Kind');
    if (KINDS.indexOf(kind) < 0) throw fail(400, 'Choose a project, site, design, analysis, proposal, order, or document');
    var roleKey = text(b.role, 40, 'Role');
    var role = findRole(roleKey);
    if (!role) throw fail(400, 'Choose a role');
    var shared = [];
    var raw = b.sharedWith;
    if (raw != null) {
      if (!Array.isArray(raw)) throw fail(400, 'Sharing is a list of organizations');
      if (raw.length > 8) throw fail(400, 'A record can be shared with at most 8 organizations');
      for (var i = 0; i < raw.length; i++) {
        var id = orgId(raw[i]);
        if (shared.indexOf(id) < 0) shared.push(id);
      }
    }
    var contact = b.contactId == null || text(b.contactId, 120, 'Contact') === '' ? null : recordId(b.contactId, 'Contact');
    return {
      kind: kind,
      objectId: recordId(b.objectId, 'Record'),
      accountId: recordId(b.accountId, 'Customer'),
      contactId: contact,
      role: role.key,
      title: text(b.title, 120, 'Title'),
      sharedWith: shared
    };
  }

  /* Copy-on-write. A second customer on the same object is refused. The
     same customer and role again updates the contact and title. */
  function applyLink(links, input) {
    var link = linkInput(input);
    var next = [];
    var created = true;
    for (var i = 0; i < (links || []).length; i++) {
      var cur = links[i];
      if (cur.kind === link.kind && cur.objectId === link.objectId && cur.role === link.role) {
        if (cur.accountId === link.accountId) {
          next.push(link);
          created = false;
          continue;
        }
        var role = findRole(link.role);
        if (role && role.singular) throw fail(409, 'This ' + link.kind + ' already has a ' + role.label.toLowerCase());
      }
      next.push(cur);
    }
    if (created) next.push(link);
    link.id = linkIdOf(link);
    return { links: next, link: link, created: created };
  }

  function primaryAccount(links, kind, objectId) {
    for (var i = 0; i < (links || []).length; i++) {
      var l = links[i];
      if (l.kind === kind && l.objectId === objectId && l.role === 'customer') return l.accountId;
    }
    return null;
  }

  function linksOf(links, kind, objectId) {
    var out = [];
    for (var i = 0; i < (links || []).length; i++) {
      var l = links[i];
      if (l.kind === kind && l.objectId === objectId) out.push(l);
    }
    return out;
  }

  function externalRef(b) {
    b = b || {};
    var provider = findProvider(text(b.provider, 40, 'Provider'));
    if (!provider) throw fail(400, 'Choose a CRM');
    var kind = text(b.kind, 40, 'Kind');
    if (KINDS.indexOf(kind) < 0 && kind !== 'account' && kind !== 'contact') throw fail(400, 'That record cannot be synced');
    var remoteType = text(b.remoteType, 60, 'Remote type');
    if (!remoteType) throw fail(400, 'Name the record type in the CRM');
    var remoteId = text(b.remoteId, 80, 'Remote id');
    if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(remoteId)) throw fail(400, 'The CRM id is not valid');
    return {
      provider: provider.key,
      kind: kind,
      objectId: recordId(b.objectId, 'Record'),
      remoteType: remoteType,
      remoteId: remoteId
    };
  }

  /* lastSyncAt is the last successful exchange. A side that has not moved
     since then is not a new edit. Engineering fields keep Omega's value
     and say so. A pipeline field both sides edited is a conflict: the
     value is empty until a person picks one. */
  function judgeField(field, omega, remote, lastSyncAt) {
    if (!field || (field.owner !== 'omega' && field.owner !== 'remote' && field.owner !== 'either')) {
      throw fail(400, 'A field needs an owner');
    }
    var ov = omega && omega.value != null ? String(omega.value) : '';
    var rv = remote && remote.value != null ? String(remote.value) : '';
    var sync = Date.parse(lastSyncAt || '') || 0;
    var ot = omega && omega.at ? Date.parse(omega.at) : 0;
    var rt = remote && remote.at ? Date.parse(remote.at) : 0;
    var omegaMoved = !!(ov && ot > sync);
    var remoteMoved = !!(rv && rt > sync);
    if (ov === rv) return { key: field.key, label: field.label || field.key, value: ov, source: 'same', status: 'same', omega: ov, remote: rv };
    if (field.owner === 'omega') {
      return { key: field.key, label: field.label || field.key, value: ov, source: 'omega', status: remoteMoved ? 'kept' : 'same', omega: ov, remote: rv };
    }
    if (field.owner === 'remote') {
      return { key: field.key, label: field.label || field.key, value: rv || ov, source: rv ? 'remote' : 'omega', status: rv ? 'taken' : 'kept', omega: ov, remote: rv };
    }
    if (omegaMoved && remoteMoved) {
      return { key: field.key, label: field.label || field.key, value: '', source: 'conflict', status: 'conflict', omega: ov, remote: rv, omegaAt: omega.at, remoteAt: remote.at };
    }
    if (remoteMoved) return { key: field.key, label: field.label || field.key, value: rv, source: 'remote', status: 'taken', omega: ov, remote: rv };
    return { key: field.key, label: field.label || field.key, value: ov, source: 'omega', status: 'kept', omega: ov, remote: rv };
  }

  function judgeBundle(bundle) {
    var rows = [];
    var status = 'synced';
    var fields = (bundle && bundle.fields) || [];
    for (var i = 0; i < fields.length; i++) {
      var row = judgeField(fields[i], fields[i].omega, fields[i].remote, bundle.lastSyncAt);
      rows.push(row);
      if (row.status === 'conflict') status = 'conflict';
    }
    return { provider: bundle.provider, kind: bundle.kind, objectId: bundle.objectId, remoteId: bundle.remoteId, remoteType: bundle.remoteType, status: status, rows: rows };
  }

  function accountSync(model, links, accountId) {
    var status = 'none';
    var detail = [];
    var bundles = (model && model.sync) || [];
    for (var i = 0; i < bundles.length; i++) {
      var b = bundles[i];
      var attached = false;
      var ls = linksOf(links, b.kind, b.objectId);
      for (var j = 0; j < ls.length; j++) if (ls[j].accountId === accountId) attached = true;
      if (!attached) continue;
      var judged = b.fields && b.fields.length ? judgeBundle(b) : { provider: b.provider, kind: b.kind, objectId: b.objectId, remoteId: b.remoteId, remoteType: b.remoteType, status: b.status || 'synced', rows: [] };
      detail.push(judged);
      if (judged.status === 'conflict') status = 'conflict';
      else if (status !== 'conflict') status = 'synced';
    }
    return { status: status, bundles: detail };
  }

  /* The project journey. The same words the workspace home uses through
     Order (Customer, Site, Design, Analyze, Propose, Order). Install and
     Monitor are the steps after the home's "track". First touch is how
     the account started. A stage is done, waiting, or not started.
     `progress` picks the first stage that is not done, so a sent proposal
     stays the current step even if a draft order already exists. */
  var STAGES = [
    { key: 'touch', label: 'First touch', customerLabel: 'We heard from you' },
    { key: 'customer', label: 'Customer', customerLabel: 'Your account' },
    { key: 'site', label: 'Site', customerLabel: 'Your site' },
    { key: 'design', label: 'Design', customerLabel: 'The design' },
    { key: 'analyze', label: 'Analyze', customerLabel: 'The numbers' },
    { key: 'propose', label: 'Propose', customerLabel: 'Your proposal' },
    { key: 'order', label: 'Order', customerLabel: 'Your order' },
    { key: 'install', label: 'Install', customerLabel: 'Installation' },
    { key: 'monitor', label: 'Monitor', customerLabel: 'Watching it run' }
  ];
  var ACTORS = [
    { key: 'installer', label: 'Sales', person: 'Alex Chen' },
    { key: 'partner', label: 'Partner', person: 'Helen Cho' },
    { key: 'ops', label: 'Operations', person: 'Riley Brooks' },
    { key: 'customer', label: 'Customer', person: 'Jordan Blake' }
  ];

  function stageByKey(key) {
    for (var i = 0; i < STAGES.length; i++) if (STAGES[i].key === key) return STAGES[i];
    return null;
  }
  function stageRank(key) {
    for (var i = 0; i < STAGES.length; i++) if (STAGES[i].key === key) return i;
    return STAGES.length;
  }
  function actorOk(actor) {
    for (var i = 0; i < ACTORS.length; i++) if (ACTORS[i].key === actor) return true;
    return false;
  }
  function customerObjects(model, links, accountId) {
    var out = [], seen = {};
    for (var i = 0; i < (links || []).length; i++) {
      var l = links[i];
      if (l.accountId !== accountId || l.role !== 'customer') continue;
      var k = l.kind + '/' + l.objectId;
      if (seen[k]) continue;
      seen[k] = true;
      var o = byId((model && model.objects) || [], l.objectId);
      if (o) out.push(o);
    }
    return out;
  }
  function findKind(objs, kind) {
    for (var i = 0; i < objs.length; i++) if (objs[i].kind === kind) return objs[i];
    return null;
  }
  function contactsOf(model, accountId) {
    var out = [];
    var list = (model && model.contacts) || [];
    for (var i = 0; i < list.length; i++) if (list[i].accountId === accountId) out.push(list[i]);
    return out;
  }

  /* done[key] === true means the step is behind them. 'waiting' means the
     record exists and a person still has to answer it. */
  function progress(model, links, accountId) {
    var objs = customerObjects(model, links, accountId);
    var done = { touch: true };
    if (contactsOf(model, accountId).length) done.customer = true;
    var proposal = findKind(objs, 'proposal');
    var order = findKind(objs, 'order');
    for (var i = 0; i < objs.length; i++) {
      var o = objs[i];
      if ((o.kind === 'project' || o.kind === 'site' || o.kind === 'design') && o.address) done.site = true;
      if (o.kind === 'project' || o.kind === 'design') done.design = true;
      if (o.kind === 'analysis') {
        if (o.stage === 'In review') { if (done.analyze !== true) done.analyze = 'waiting'; }
        else done.analyze = true;
      }
    }
    if (proposal) done.propose = proposal.stage === 'Accepted' ? true : 'waiting';
    if (order) {
      if (order.stage === 'Monitoring') { done.order = true; done.install = true; done.monitor = true; }
      else if (order.stage === 'Installed') { done.order = true; done.install = true; }
      else if (order.stage === 'Accepted' || order.stage === 'Scheduled') done.order = true;
      else if (done.order !== true) done.order = 'waiting';
    }
    var current = 'monitor';
    for (var s = 0; s < STAGES.length; s++) {
      if (done[STAGES[s].key] !== true) { current = STAGES[s].key; break; }
    }
    return { done: done, current: current, proposal: proposal, order: order, objects: objs };
  }

  function cloneModel(model, patch) {
    var next = {};
    for (var k in model) if (Object.prototype.hasOwnProperty.call(model, k)) next[k] = model[k];
    for (var p in patch) if (Object.prototype.hasOwnProperty.call(patch, p)) next[p] = patch[p];
    return next;
  }
  function withStage(model, objectId, stage) {
    var objects = [];
    for (var i = 0; i < (model.objects || []).length; i++) {
      var o = model.objects[i];
      if (o.id !== objectId) { objects.push(o); continue; }
      var n = {};
      for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) n[k] = o[k];
      n.stage = stage;
      objects.push(n);
    }
    return cloneModel(model, { objects: objects });
  }
  function slugId(prefix, text) {
    var s = String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 18);
    return prefix + (s || 'new');
  }
  function addContact(model, accountId, name) {
    var contact = { id: slugId('ct_', name), accountId: accountId, name: text(name, 120, 'Name') || 'New contact', title: '', email: '', phone: '', signsIn: false, portalRole: '' };
    return cloneModel(model, { contacts: (model.contacts || []).concat([contact]) });
  }
  function addObject(model, links, accountId, obj) {
    var objects = (model.objects || []).concat([obj]);
    var applied = applyLink(links, { kind: obj.kind, objectId: obj.id, accountId: accountId, role: 'customer' });
    return { model: cloneModel(model, { objects: objects }), links: applied.links, object: obj };
  }

  function activityHas(model, accountId, pattern) {
    var list = (model && model.activity) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].accountId === accountId && pattern.test(list[i].subject || '')) return list[i];
    }
    return null;
  }
  function hasFollowUp(model, accountId) {
    return !!activityHas(model, accountId, /follow up/i);
  }
  function portalAccount(model) {
    var who = model && model.actors && model.actors.customer;
    return who && who.accountId ? who.accountId : '';
  }
  function addActivity(model, accountId, subject, by) {
    var note = text(subject, 240, 'Note');
    if (!note) throw fail(400, 'Write the note');
    var item = {
      id: slugId('act_', note + String((model.activity || []).length)),
      accountId: accountId,
      type: 'note',
      subject: note,
      at: '2026-10-17',
      by: text(by || 'Preview', 80, 'By') || 'Preview',
      open: true
    };
    return cloneModel(model, { activity: (model.activity || []).concat([item]) });
  }
  /* A person picks the stage. Capacity is not in this choice: an omega-owned
     field keeps its value even when the stage values are made to agree. */
  function settleStage(model, objectId, choice) {
    if (choice !== 'omega' && choice !== 'remote') throw fail(400, 'Choose Omega or the CRM');
    var sync = [];
    var chosen = '';
    var found = false;
    for (var i = 0; i < (model.sync || []).length; i++) {
      var b = model.sync[i];
      if (b.objectId !== objectId) { sync.push(b); continue; }
      var fields = [];
      for (var f = 0; f < (b.fields || []).length; f++) {
        var field = b.fields[f];
        if (field.key !== 'stage') { fields.push(field); continue; }
        var omega = { value: field.omega && field.omega.value != null ? String(field.omega.value) : '', at: field.omega && field.omega.at };
        var remote = { value: field.remote && field.remote.value != null ? String(field.remote.value) : '', at: field.remote && field.remote.at };
        if (choice === 'omega') remote.value = omega.value;
        else omega.value = remote.value;
        chosen = omega.value;
        var copy = {};
        for (var k in field) if (Object.prototype.hasOwnProperty.call(field, k)) copy[k] = field[k];
        copy.omega = omega;
        copy.remote = remote;
        fields.push(copy);
        found = true;
      }
      var nb = {};
      for (var bk in b) if (Object.prototype.hasOwnProperty.call(b, bk)) nb[bk] = b[bk];
      nb.fields = fields;
      sync.push(nb);
    }
    if (!found) throw fail(404, 'There is no stage to settle');
    var next = cloneModel(model, { sync: sync });
    if (choice === 'remote' && chosen) next = withStage(next, objectId, chosen);
    return next;
  }
  function conflictOn(model, links, accountId) {
    return accountSync(model, links, accountId).status === 'conflict';
  }
  function hashFor(actor, accountId, stage, doing) {
    return '#/as/' + actor + '/account/' + accountId + '/stage/' + stage + (doing ? '/do' : '');
  }

  /* Every current step has a deed. A future step sends you back to the
     current one. A finished step tells you what happened and where to go
     next. Nobody lands on an empty panel. */
  function panel(model, links, accountId, actor, stageKey) {
    if (!actorOk(actor)) throw fail(400, 'Choose who is looking');
    var account = byId((model && model.accounts) || [], accountId);
    if (!account) return null;
    var prog = progress(model, links, accountId);
    var stage = stageByKey(stageKey) || stageByKey(prog.current);
    var state = prog.done[stage.key] === true ? 'done' : (prog.current === stage.key ? 'now' : 'ahead');
    var label = actor === 'customer' ? stage.customerLabel : stage.label;
    var current = stageByKey(prog.current);
    var currentLabel = actor === 'customer' ? current.customerLabel : current.label;
    var name = account.name;
    var told = { title: '', body: '', action: '', hash: '', deed: '' };
    if (state !== 'now') {
      told.title = state === 'done' ? label + ' is done' : label + ' comes after ' + currentLabel;
      told.body = state === 'done'
        ? name + ' is past this step. The open work is ' + currentLabel + '.'
        : 'This opens once ' + currentLabel + ' is finished. Nothing here is blocked without a way forward.';
      told.action = 'Continue from ' + currentLabel;
      told.hash = hashFor(actor, accountId, prog.current, false);
    } else if (actor === 'ops' && (stage.key === 'customer' || stage.key === 'site' || stage.key === 'design' || stage.key === 'analyze')) {
      told.title = 'Sales still owns ' + name;
      told.body = 'This account is on ' + currentLabel + '. Operations picks the work up when an order is priced. Sales keeps the person, the site, the bill, and the CRM stage.';
      told.action = 'Open it for sales';
      told.hash = hashFor('installer', accountId, prog.current, false);
    } else if (stage.key === 'customer') {
      told.title = 'Add the person at ' + name;
      told.body = 'A note is on file and there is no one to call. A project needs a person on the account before it is opened.';
      told.action = 'Save the contact';
      told.hash = hashFor(actor, accountId, 'customer', true);
      told.deed = 'contact';
    } else if (stage.key === 'site' || stage.key === 'design') {
      told.title = 'Open a project for ' + name;
      told.body = 'The account has a person and no address yet. Prime or Site Map starts from that address. This preview holds the project in the browser.';
      told.action = 'Hold the project';
      told.hash = hashFor(actor, accountId, stage.key, true);
      told.deed = 'project';
    } else if (stage.key === 'analyze') {
      told.title = conflictOn(model, links, accountId) ? 'Settle the stage, then finish the bill' : 'Finish the numbers';
      told.body = conflictOn(model, links, accountId)
        ? 'The bill is still in review, and the CRM stage disagrees with Omega. Capacity stays the figure Omega holds. Settling the stage does not change kW.'
        : 'The design is on the account. The bill and the grid check are what a proposal is allowed to follow.';
      told.action = conflictOn(model, links, accountId) ? 'Open the stage decision' : 'Mark the bill reviewed';
      told.hash = conflictOn(model, links, accountId) ? '#/as/' + actor + '/account/' + accountId + '/sync' : hashFor(actor, accountId, 'analyze', true);
      told.deed = conflictOn(model, links, accountId) ? '' : 'review';
    } else if (stage.key === 'propose' && !prog.proposal) {
      if (actor === 'installer') {
        told.title = 'Send a proposal to ' + name;
        told.body = 'The numbers are reviewed. A proposal is what the customer accepts. This preview holds it on the account.';
        told.action = 'Hold the proposal';
        told.hash = hashFor(actor, accountId, 'propose', true);
        told.deed = 'send';
      } else if (actor === 'customer') {
        told.title = 'A proposal is on the way';
        told.body = 'Sales sends it from their step. You accept it here once it is with you.';
        told.action = 'Open the step sales is on';
        told.hash = hashFor('installer', accountId, 'propose', false);
      } else {
        told.title = 'Sales still sends the proposal';
        told.body = name + ' is ready for a proposal. Sending it is sales. Operations and partners pick up after it is out.';
        told.action = 'Open it for sales';
        told.hash = hashFor('installer', accountId, 'propose', false);
      }
    } else if (stage.key === 'propose' && actor === 'customer') {
      told.title = 'Review the proposal';
      told.body = 'Concord sent the proposal for your site. Accepting it is what lets operations set an install week. You see this account only.';
      told.action = 'Accept the proposal';
      told.hash = hashFor(actor, accountId, 'propose', true);
      told.deed = 'accept';
    } else if (stage.key === 'propose' && actor === 'partner') {
      if (activityHas(model, accountId, /interested/i)) {
        told.title = 'You are on the request';
        told.body = portalAccount(model) === accountId
          ? 'You told Concord you are interested. The customer accepts on their own screen. That is what opens the install week.'
          : 'You told Concord you are interested. Sales records the acceptance if this account has no portal sign-in.';
        told.action = portalAccount(model) === accountId ? 'Open the proposal they see' : 'Open it for sales';
        told.hash = portalAccount(model) === accountId
          ? hashFor('customer', accountId, 'propose', false)
          : hashFor('installer', accountId, 'propose', false);
      } else {
        told.title = 'Respond to the capital request';
        told.body = 'This project was shared with you. You can answer the request. Other customers, the CRM connection, and the cost basis stay with the installer.';
        told.action = 'Say you are interested';
        told.hash = hashFor(actor, accountId, 'propose', true);
        told.deed = 'interest';
      }
    } else if (stage.key === 'propose' && actor === 'ops') {
      if (hasFollowUp(model, accountId)) {
        told.title = 'Sales has the follow-up';
        told.body = portalAccount(model) === accountId
          ? 'The order is priced and the proposal is still with the customer. The install week opens after they accept. Their screen is the next step.'
          : 'The follow-up is with sales. This account has no portal sign-in, so sales records the acceptance.';
        told.action = portalAccount(model) === accountId ? 'Open the proposal they see' : 'Open it for sales';
        told.hash = portalAccount(model) === accountId
          ? hashFor('customer', accountId, 'propose', false)
          : hashFor('installer', accountId, 'propose', false);
      } else {
        told.title = 'Ask sales to follow up';
        told.body = (prog.order ? prog.order.name + ' is priced. ' : '') + 'The customer has not accepted, so the install week stays closed. Asking sales puts it on the account.';
        told.action = 'Ask sales to follow up';
        told.hash = hashFor(actor, accountId, 'propose', true);
        told.deed = 'followup';
      }
    } else if (stage.key === 'propose') {
      if (hasFollowUp(model, accountId)) {
        if (portalAccount(model) === accountId) {
          told.title = 'Waiting on ' + name;
          told.body = 'The follow-up is on the account. They accept on their screen, which is what opens the install week.';
          told.action = 'Open the proposal they see';
          told.hash = hashFor('customer', accountId, 'propose', false);
        } else {
          told.title = 'The follow-up is logged';
          told.body = 'This account has no portal sign-in in the sample. Recording their acceptance here is what opens the order.';
          told.action = 'Record their acceptance';
          told.hash = hashFor(actor, accountId, 'propose', true);
          told.deed = 'accept';
        }
      } else {
        told.title = 'The proposal is with the customer';
        told.body = name + ' has the proposal. A call is the next move if it sits. Accepting it, on their screen, is what opens the install week.';
        told.action = 'Log the follow-up call';
        told.hash = hashFor(actor, accountId, 'propose', true);
        told.deed = 'followup';
      }
    } else if (stage.key === 'order') {
      told.title = actor === 'customer' ? 'Your order is being confirmed' : 'Confirm the order';
      told.body = actor === 'customer'
        ? 'You accepted the proposal. Operations confirms the order, then the install week. Their step is the next one.'
        : 'The proposal is accepted. Confirming the order is what the install step follows.';
      told.action = actor === 'customer' ? 'Open the confirmation' : 'Confirm the order';
      told.hash = actor === 'customer' ? hashFor('ops', accountId, 'order', false) : hashFor(actor, accountId, 'order', true);
      told.deed = actor === 'customer' ? '' : 'confirm';
    } else if (stage.key === 'install') {
      var week = activityHas(model, accountId, /install week of/i);
      if (actor === 'ops' || actor === 'installer') {
        if (week) {
          told.title = 'Mark the site in';
          told.body = 'The week is on the account (' + week.subject + '). Marking the crew done is what starts the watch.';
          told.action = 'Mark installed';
          told.hash = hashFor(actor, accountId, 'install', true);
          told.deed = 'installed';
        } else {
          told.title = 'Set the install week';
          told.body = 'Name the week, then mark the crew done when the site is in. The customer sees the same step in their words.';
          told.action = 'Set the install week';
          told.hash = hashFor(actor, accountId, 'install', true);
          told.deed = 'week';
        }
      } else if (actor === 'customer') {
        if (activityHas(model, accountId, /^question:/i)) {
          told.title = week ? 'The install week is set' : 'Your question is with operations';
          told.body = week
            ? 'Operations named the week. When the crew is done, watching the system is the next step. Their screen is where that is marked.'
            : 'Operations has your question and names the week on their step.';
          told.action = 'Open the install step';
          told.hash = hashFor('ops', accountId, 'install', false);
        } else {
          told.title = 'Your installation';
          told.body = 'The order is confirmed. Operations will name the week. You can ask a question from this step.';
          told.action = 'Ask a question';
          told.hash = hashFor(actor, accountId, 'install', true);
          told.deed = 'question';
        }
      } else {
        told.title = 'The install is with Concord';
        told.body = 'Operations sets the week and marks the crew done. The cost basis stays with the installer.';
        told.action = 'Open the install step';
        told.hash = hashFor('ops', accountId, 'install', false);
      }
    } else {
      told.title = actor === 'customer' ? 'Your system is being watched' : 'Log this week’s check';
      told.body = actor === 'customer'
        ? 'The site is in. A note about output, a warranty question, or a visit keeps the account alive. This step stays open on purpose.'
        : 'The site is in. A check-in keeps the account alive: output, a warranty question, or a visit. This step stays open on purpose.';
      told.action = actor === 'customer' ? 'Ask for this week’s check' : 'Log this week’s check';
      told.hash = hashFor(actor, accountId, 'monitor', true);
      told.deed = 'check';
    }
    return {
      state: state, stage: stage.key, label: label, current: prog.current, currentLabel: currentLabel,
      title: told.title, body: told.body, action: told.action, hash: told.hash, deed: told.deed || ''
    };
  }
  function nextAction(model, links, accountId, actor) {
    var prog = progress(model, links, accountId);
    return panel(model, links, accountId, actor, prog.current);
  }
  function canSee(actor, section) {
    if (section === 'sync') return actor === 'installer' || actor === 'ops';
    if (section === 'capex') return actor !== 'customer' && actor !== 'partner';
    if (section === 'book') return actor !== 'customer';
    if (section === 'people') return actor === 'installer' || actor === 'ops' || actor === 'customer';
    return true;
  }

  function countKind(links, accountId, kind) {
    var n = 0;
    var seen = {};
    for (var i = 0; i < links.length; i++) {
      var l = links[i];
      if (l.accountId !== accountId || l.kind !== kind || l.role !== 'customer') continue;
      var k = l.kind + '/' + l.objectId;
      if (seen[k]) continue;
      seen[k] = true;
      n++;
    }
    return n;
  }

  /* The sales book: every account marked book 'customer', including a lead
     with no project yet. book 'party' (a utility, a capital partner) stays
     on the work and does not get a row of its own. A missing book keeps the
     old rule: a row only when the account is the customer of something. */
  function portfolioRows(model, links) {
    var rows = [];
    var accounts = (model && model.accounts) || [];
    for (var i = 0; i < accounts.length; i++) {
      var a = accounts[i];
      var projects = countKind(links, a.id, 'project');
      var orders = countKind(links, a.id, 'order');
      var sites = countKind(links, a.id, 'site');
      var analyses = countKind(links, a.id, 'analysis');
      var proposals = countKind(links, a.id, 'proposal');
      var designs = countKind(links, a.id, 'design');
      var customerOf = projects + orders + sites + analyses + proposals + designs + countKind(links, a.id, 'document');
      if (a.book === 'party') continue;
      if (a.book !== 'customer' && !customerOf) continue;
      var sync = accountSync(model, links, a.id);
      var journey = progress(model, links, a.id);
      rows.push({
        account: a,
        projects: projects,
        orders: orders,
        sites: sites,
        analyses: analyses,
        proposals: proposals,
        designs: designs,
        sync: sync.status,
        open: openFollowUps(model, a.id),
        journey: { current: journey.current, done: journey.done }
      });
    }
    rows.sort(function (x, y) {
      if (x.sync === 'conflict' && y.sync !== 'conflict') return -1;
      if (y.sync === 'conflict' && x.sync !== 'conflict') return 1;
      var d = stageRank(x.journey.current) - stageRank(y.journey.current);
      if (d) return d;
      return x.account.name.localeCompare(y.account.name);
    });
    return rows;
  }

  function visibleAccounts(model, links, actor) {
    var rows = portfolioRows(model, links);
    var actors = (model && model.actors) || {};
    if (actor === 'customer') {
      var mine = actors.customer && actors.customer.accountId;
      var one = [];
      for (var i = 0; i < rows.length; i++) if (rows[i].account.id === mine) one.push(rows[i]);
      return one;
    }
    if (actor === 'partner') {
      var org = actors.partner && actors.partner.orgId;
      var ids = {};
      for (var j = 0; j < (links || []).length; j++) {
        var shared = links[j].sharedWith || [];
        if (org && shared.indexOf(org) >= 0) {
          var primary = primaryAccount(links, links[j].kind, links[j].objectId);
          if (primary) ids[primary] = true;
        }
      }
      var sharedRows = [];
      for (var r = 0; r < rows.length; r++) if (ids[rows[r].account.id]) sharedRows.push(rows[r]);
      return sharedRows;
    }
    return rows;
  }

  function openFollowUps(model, accountId) {
    var n = 0;
    var items = (model && model.activity) || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].accountId === accountId && items[i].open) n++;
    }
    return n;
  }

  function profileOf(model, links, accountId) {
    var account = byId(model.accounts || [], accountId);
    if (!account) return null;
    var contacts = [];
    for (var c = 0; c < (model.contacts || []).length; c++) {
      if (model.contacts[c].accountId === accountId) contacts.push(model.contacts[c]);
    }
    var seen = {};
    var work = [];
    for (var i = 0; i < links.length; i++) {
      var l = links[i];
      if (l.accountId !== accountId) continue;
      var key = l.kind + '/' + l.objectId;
      if (!seen[key]) {
        seen[key] = { object: byId(model.objects || [], l.objectId), roles: [], parties: [] };
        work.push(seen[key]);
      }
      seen[key].roles.push(l.role);
    }
    /* Other parties on those same objects, so the profile shows the host,
       the utility, and the capital partner beside the customer. */
    for (var w = 0; w < work.length; w++) {
      var obj = work[w].object;
      if (!obj) continue;
      var parties = linksOf(links, obj.kind, obj.id);
      for (var p = 0; p < parties.length; p++) {
        work[w].parties.push({
          role: parties[p].role,
          account: byId(model.accounts || [], parties[p].accountId),
          contact: parties[p].contactId ? byId(model.contacts || [], parties[p].contactId) : null
        });
      }
    }
    var activity = [];
    for (var t = 0; t < (model.activity || []).length; t++) {
      if (model.activity[t].accountId === accountId) activity.push(model.activity[t]);
    }
    activity.sort(function (x, y) { return String(y.at).localeCompare(String(x.at)); });
    var documents = [];
    for (var d = 0; d < work.length; d++) {
      if (work[d].object && work[d].object.kind === 'document') documents.push(work[d].object);
    }
    return {
      account: account,
      contacts: contacts,
      work: work,
      activity: activity,
      documents: documents,
      sync: accountSync(model, links, accountId)
    };
  }

  function sample() {
    return {
      org: { id: 'concord.example', name: 'Concord Energy', vertical: 'installer' },
      viewer: { name: 'Alex Chen', email: 'alex@concord.example' },
      actors: {
        installer: { name: 'Alex Chen', org: 'Concord Energy', accountId: null },
        partner: { name: 'Helen Cho', org: 'Helios Energy Advisors', accountId: 'acct_helios', orgId: 'helios.example' },
        ops: { name: 'Riley Brooks', org: 'Concord Energy', accountId: null },
        customer: { name: 'Jordan Blake', org: 'Riverside Logistics', accountId: 'acct_riverside' }
      },
      accounts: [
        { id: 'acct_riverside', name: 'Riverside Logistics', domain: 'riversidelogistics.example', status: 'active', city: 'Oakland, CA', phone: '(510) 555-0148', owner: 'Alex Chen', book: 'customer' },
        { id: 'acct_northline', name: 'Northline Grocers', domain: 'northline.example', status: 'active', city: 'Austin, TX', phone: '(512) 555-0176', owner: 'Alex Chen', book: 'customer' },
        { id: 'acct_harbor', name: 'Harbor Market', domain: '', status: 'lead', city: 'San Jose, CA', phone: '(408) 555-0104', owner: 'Alex Chen', book: 'customer' },
        { id: 'acct_pge', name: 'Pacific Gas and Electric', domain: 'pge.example', status: 'active', city: 'Oakland, CA', phone: '', owner: '', book: 'party' },
        { id: 'acct_helios', name: 'Helios Energy Advisors', domain: 'helios.example', status: 'active', city: 'Chicago, IL', phone: '', owner: '', book: 'party' }
      ],
      contacts: [
        { id: 'ct_jordan', accountId: 'acct_riverside', name: 'Jordan Blake', title: 'Director of facilities', email: 'jordan@riversidelogistics.example', phone: '(510) 555-0190', signsIn: true, portalRole: 'owner' },
        { id: 'ct_priya', accountId: 'acct_riverside', name: 'Priya Shah', title: 'Energy manager', email: 'priya@riversidelogistics.example', phone: '(510) 555-0114', signsIn: false, portalRole: '' },
        { id: 'ct_maya', accountId: 'acct_northline', name: 'Maya Ortiz', title: 'Store development', email: 'maya@northline.example', phone: '(512) 555-0133', signsIn: false, portalRole: '' },
        { id: 'ct_helen', accountId: 'acct_helios', name: 'Helen Cho', title: 'Capital advisor', email: 'helen@helios.example', phone: '', signsIn: false, portalRole: '' }
      ],
      objects: [
        { id: 'p_oakland', kind: 'project', source: 'editor', name: 'Riverside Garage', address: '1 Embarcadero W, Oakland, CA 94607', stage: 'Design', kw: '300', kwh: '1,200', capex: '$1.86M' },
        { id: 'p_austin', kind: 'project', source: 'prime', name: 'Northline #14', address: 'Austin, TX', stage: 'Candidate', kw: '75', kwh: '61', capex: '' },
        { id: 's_oakland', kind: 'site', source: 'portfolio', name: 'Riverside Garage', address: '1 Embarcadero W, Oakland, CA 94607', stage: 'In editor' },
        { id: 'd_oakland', kind: 'design', source: 'editorlite', name: 'Garage layout, rev 3', address: '1 Embarcadero W, Oakland, CA 94607', stage: 'Saved' },
        { id: 'a_vpp', kind: 'analysis', source: 'vppsim', name: 'VPP estimate', address: 'Oakland, CA', stage: 'Complete' },
        { id: 'a_bill', kind: 'analysis', source: 'bill', name: 'Twelve months of bills', address: 'Austin, TX', stage: 'In review' },
        { id: 'r_deck', kind: 'proposal', source: 'sales', name: 'Riverside proposal', address: 'Oakland, CA', stage: 'Sent' },
        { id: 'o_44192', kind: 'order', source: 'orders', name: 'Order CC-26-44192', address: 'Oakland, CA', stage: 'Priced' },
        { id: 'f_ppa', kind: 'document', source: 'portfolio', name: 'Site host agreement.pdf', address: '', stage: 'Shared' }
      ],
      links: [
        { kind: 'project', objectId: 'p_oakland', accountId: 'acct_riverside', contactId: 'ct_jordan', role: 'customer', title: '', sharedWith: [] },
        { kind: 'project', objectId: 'p_oakland', accountId: 'acct_pge', contactId: null, role: 'utility', title: 'Serving utility', sharedWith: [] },
        { kind: 'project', objectId: 'p_oakland', accountId: 'acct_helios', contactId: 'ct_helen', role: 'capital', title: '', sharedWith: ['helios.example'] },
        { kind: 'site', objectId: 's_oakland', accountId: 'acct_riverside', contactId: 'ct_priya', role: 'customer', title: '', sharedWith: [] },
        { kind: 'site', objectId: 's_oakland', accountId: 'acct_riverside', contactId: null, role: 'host', title: 'Host is the customer', sharedWith: [] },
        { kind: 'design', objectId: 'd_oakland', accountId: 'acct_riverside', contactId: 'ct_jordan', role: 'customer', title: '', sharedWith: [] },
        { kind: 'analysis', objectId: 'a_vpp', accountId: 'acct_riverside', contactId: null, role: 'customer', title: '', sharedWith: [] },
        { kind: 'proposal', objectId: 'r_deck', accountId: 'acct_riverside', contactId: 'ct_jordan', role: 'customer', title: '', sharedWith: [] },
        { kind: 'order', objectId: 'o_44192', accountId: 'acct_riverside', contactId: 'ct_jordan', role: 'customer', title: '', sharedWith: [] },
        { kind: 'document', objectId: 'f_ppa', accountId: 'acct_riverside', contactId: null, role: 'customer', title: '', sharedWith: [] },
        { kind: 'project', objectId: 'p_austin', accountId: 'acct_northline', contactId: 'ct_maya', role: 'customer', title: '', sharedWith: [] },
        { kind: 'analysis', objectId: 'a_bill', accountId: 'acct_northline', contactId: 'ct_maya', role: 'customer', title: '', sharedWith: [] }
      ],
      activity: [
        { id: 'act_call', accountId: 'acct_riverside', type: 'call', subject: 'Walked Jordan through the garage layout', at: '2026-10-16', by: 'Alex Chen', open: false },
        { id: 'act_task', accountId: 'acct_riverside', type: 'task', subject: 'Send the revised proposal after the utility check', at: '2026-10-18', by: 'Alex Chen', open: true },
        { id: 'act_note', accountId: 'acct_northline', type: 'note', subject: 'Prime set the skid on the Austin store. Stage disagrees with Pipedrive.', at: '2026-10-17', by: 'Alex Chen', open: true },
        { id: 'act_harbor', accountId: 'acct_harbor', type: 'note', subject: 'Web form on Saturday. Asked about a battery for the San Jose store.', at: '2026-10-17', by: 'Harbor Market', open: true }
      ],
      sync: [
        { provider: 'hubspot', kind: 'project', objectId: 'p_oakland', remoteType: 'deal', remoteId: '18442201', status: 'synced', lastSyncAt: '2026-10-16T15:04:00Z', fields: [
          { key: 'stage', label: 'Stage', owner: 'either', omega: { value: 'Design', at: '2026-10-15T18:00:00Z' }, remote: { value: 'Design', at: '2026-10-15T18:02:00Z' } },
          { key: 'kw', label: 'Power (kW)', owner: 'omega', omega: { value: '300', at: '2026-10-15T18:00:00Z' }, remote: { value: '300', at: '2026-10-14T11:00:00Z' } }
        ] },
        { provider: 'pipedrive', kind: 'project', objectId: 'p_austin', remoteType: 'deal', remoteId: '90211', status: 'pending', lastSyncAt: '2026-10-15T12:00:00Z', fields: [
          { key: 'stage', label: 'Stage', owner: 'either', omega: { value: 'Candidate', at: '2026-10-17T14:02:00Z' }, remote: { value: 'Qualified', at: '2026-10-17T16:40:00Z' } },
          { key: 'kw', label: 'Power (kW)', owner: 'omega', omega: { value: '75', at: '2026-10-17T14:02:00Z' }, remote: { value: '100', at: '2026-10-17T16:41:00Z' } },
          { key: 'name', label: 'Project', owner: 'omega', omega: { value: 'Northline #14', at: '2026-10-17T14:02:00Z' }, remote: { value: 'Northline store 14', at: '2026-10-17T16:41:00Z' } }
        ] }
      ]
    };
  }

  return {
    KINDS: KINDS,
    ROLES: ROLES,
    PROVIDERS: PROVIDERS,
    FIELDS: FIELDS,
    SOURCES: SOURCES,
    roleLabel: roleLabel,
    sourceLabel: sourceLabel,
    linkIdOf: linkIdOf,
    linkInput: linkInput,
    applyLink: applyLink,
    primaryAccount: primaryAccount,
    linksOf: linksOf,
    externalRef: externalRef,
    judgeField: judgeField,
    judgeBundle: judgeBundle,
    STAGES: STAGES,
    ACTORS: ACTORS,
    progress: progress,
    panel: panel,
    nextAction: nextAction,
    visibleAccounts: visibleAccounts,
    canSee: canSee,
    withStage: withStage,
    addContact: addContact,
    addObject: addObject,
    addActivity: addActivity,
    settleStage: settleStage,
    portfolioRows: portfolioRows,
    profileOf: profileOf,
    sample: sample
  };
});
