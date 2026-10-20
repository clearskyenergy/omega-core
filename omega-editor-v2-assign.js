/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * omega-editor-v2-assign.js — the only place a Site Plan names its customer.
 *
 * A design belongs to one project record (the same `projects/{projectId}`
 * the current Site Map saves). The customer and the other parties on that
 * job are an assignment ON the project, not a second database.
 *
 *   customerId   omega_orgs/{orgId}/customers/{customerId}
 *                the buyer account Omega Logic already keeps. Blank until
 *                the CRM has minted one. The id shape is crm.js recordId.
 *   partyId      a person or company the CRM will own. Blank until then.
 *   projectId    the design's own id. A local id starts with p_. A later
 *                cloud save may also set remoteProjectId to the Firestore id.
 *   orgId        the tenant, the email domain, as everywhere else.
 *
 * projects.client is the free-text company name the New Project dialog
 * already writes and the project list already shows. toProjectFields()
 * keeps that string equal to the customer name so both stay true.
 *
 * This file does not read or write Firestore. The editor stores the
 * assignment on the design; whoever wires the CRM calls the same functions.
 */
(function (root) {
  'use strict';

  var SCHEMA = 'omega.assignment/1';
  var ROLES = ['contact', 'sales', 'installer'];
  var ROLE_LABEL = { contact: 'Client contact', sales: 'Sales rep', installer: 'Installer' };
  var ID_RE = /^[A-Za-z0-9_-]{1,120}$/;
  var ORG_RE = /^[a-z0-9][a-z0-9.:-]{0,120}$/;
  var EMAIL_RE = /^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/;

  function fail(message) { var e = new Error(message); e.status = 400; return e; }
  function text(v, max) {
    var s = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (s.length > max) s = s.slice(0, max);
    return s;
  }
  function idOrNull(v, label) {
    if (v == null || String(v).trim() === '') return null;
    var s = String(v).trim();
    if (!ID_RE.test(s)) throw fail((label || 'Id') + ' may only use letters, numbers, _ and -.');
    return s;
  }
  function emailOrNull(v) {
    var s = text(v, 254).toLowerCase();
    if (!s) return '';
    if (!EMAIL_RE.test(s)) throw fail('Email is not a valid address.');
    return s;
  }
  function orgOrNull(v) {
    if (v == null || String(v).trim() === '') return null;
    var s = String(v).trim().toLowerCase();
    if (!ORG_RE.test(s)) throw fail('Workspace id is not a valid orgId.');
    return s;
  }

  function empty() {
    return { schema: SCHEMA, customerId: null, customerName: '', stakeholders: [] };
  }

  function party(raw) {
    raw = raw || {};
    var role = String(raw.role || 'contact');
    if (ROLES.indexOf(role) < 0) throw fail('Role must be a client contact, a sales rep or an installer.');
    var row = {
      partyId: idOrNull(raw.partyId, 'Party id'),
      role: role,
      name: text(raw.name, 120),
      email: emailOrNull(raw.email),
      company: text(raw.company, 120)
    };
    if (!row.name && !row.email && !row.company && !row.partyId) return null;
    if (!row.name && !row.company) throw fail(ROLE_LABEL[role] + ' needs a name or a company.');
    return row;
  }

  /* Throws on a bad id or a bad email. Drops blank stakeholder rows.
     Returns a new object; the input is not changed. */
  function normalize(raw) {
    raw = raw || {};
    var out = empty();
    var list = raw.stakeholders || [], i, row;
    out.customerId = idOrNull(raw.customerId, 'Customer id');
    out.customerName = text(raw.customerName, 160);
    if (out.customerId && !out.customerName) throw fail('A customer id needs the customer name beside it.');
    for (i = 0; i < list.length; i++) {
      row = party(list[i]);
      if (row) out.stakeholders.push(row);
    }
    if (out.stakeholders.length > 40) throw fail('A project can list at most 40 people and companies.');
    return out;
  }

  function assignCustomer(current, customer) {
    var next = normalize(current);
    customer = customer || {};
    next.customerId = idOrNull(customer.customerId, 'Customer id');
    next.customerName = text(customer.customerName, 160);
    if (next.customerId && !next.customerName) throw fail('A customer id needs the customer name beside it.');
    return next;
  }

  function setStakeholders(current, rows) {
    var next = normalize(current);
    next.stakeholders = normalize({ stakeholders: rows }).stakeholders;
    return next;
  }

  /* What a project document stores. `client` is the legacy string. */
  function toProjectFields(assignment) {
    var a = normalize(assignment);
    return { assignment: a, client: a.customerName || '' };
  }

  /* Read a project document. A v2 assignment wins. A project that only
     has the legacy client string still opens, with no id yet. */
  function fromProject(project) {
    project = project || {};
    var raw = project.assignment, a, drift = false;
    if (raw && raw.schema === SCHEMA) {
      a = normalize(raw);
      drift = !!(project.client && a.customerName && String(project.client) !== a.customerName);
      a.clientDrift = drift;
      return a;
    }
    a = empty();
    a.customerName = text(project.client, 160);
    a.clientDrift = false;
    return a;
  }

  function linkProject(ref) {
    ref = ref || {};
    return {
      schema: 'omega.project-ref/1',
      projectId: idOrNull(ref.projectId, 'Project id'),
      remoteProjectId: idOrNull(ref.remoteProjectId, 'Remote project id'),
      orgId: orgOrNull(ref.orgId),
      customerId: idOrNull(ref.customerId, 'Customer id')
    };
  }

  function summary(assignment) {
    var a = normalize(assignment), n = { contact: 0, sales: 0, installer: 0 }, i;
    for (i = 0; i < a.stakeholders.length; i++) n[a.stakeholders[i].role] += 1;
    return {
      customerId: a.customerId,
      customerName: a.customerName,
      linked: !!a.customerId,
      contacts: n.contact,
      sales: n.sales,
      installers: n.installer,
      label: a.customerName || 'No customer yet'
    };
  }

  var api = {
    SCHEMA: SCHEMA,
    ROLES: ROLES,
    ROLE_LABEL: ROLE_LABEL,
    empty: empty,
    normalize: normalize,
    assignCustomer: assignCustomer,
    setStakeholders: setStakeholders,
    toProjectFields: toProjectFields,
    fromProject: fromProject,
    linkProject: linkProject,
    summary: summary,
    VERSION: 'editor-v2-assign/1'
  };
  root.OmegaEditorV2Assign = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
