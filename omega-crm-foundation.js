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

  /* One row per account that is the customer of something, plus any account
     the caller asked to list. Utility and capital parties appear on the
     profile, not as their own portfolio, unless they are themselves a customer. */
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
      if (!customerOf) continue;
      var sync = accountSync(model, links, a.id);
      rows.push({
        account: a,
        projects: projects,
        orders: orders,
        sites: sites,
        analyses: analyses,
        proposals: proposals,
        designs: designs,
        sync: sync.status,
        open: openFollowUps(model, a.id)
      });
    }
    rows.sort(function (x, y) {
      if (x.sync === 'conflict' && y.sync !== 'conflict') return -1;
      if (y.sync === 'conflict' && x.sync !== 'conflict') return 1;
      return x.account.name.localeCompare(y.account.name);
    });
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
      accounts: [
        { id: 'acct_riverside', name: 'Riverside Logistics', domain: 'riversidelogistics.example', status: 'active', city: 'Oakland, CA', phone: '(510) 555-0148', owner: 'Alex Chen' },
        { id: 'acct_northline', name: 'Northline Grocers', domain: 'northline.example', status: 'active', city: 'Austin, TX', phone: '(512) 555-0176', owner: 'Alex Chen' },
        { id: 'acct_pge', name: 'Pacific Gas and Electric', domain: 'pge.example', status: 'active', city: 'Oakland, CA', phone: '', owner: '' },
        { id: 'acct_helios', name: 'Helios Energy Advisors', domain: 'helios.example', status: 'active', city: 'Chicago, IL', phone: '', owner: 'Alex Chen' }
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
        { id: 'act_note', accountId: 'acct_northline', type: 'note', subject: 'Prime set the skid on the Austin store. Stage disagrees with Pipedrive.', at: '2026-10-17', by: 'Alex Chen', open: true }
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
    portfolioRows: portfolioRows,
    profileOf: profileOf,
    sample: sample
  };
});
