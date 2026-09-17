/* ══════════════════════════════════════════════════════════════════════════
   CLEARSKY-OMEGA · ORIGINATOR CREDIT  (omega-originator.js)
   ---------------------------------------------------------
   SHARED PLATFORM FILE — no customer name, domain or colour in it.

   WHAT THIS IS
   Who introduced this deal, recorded on the deal, addressed by org id.

   WHY IT IS ITS OWN FILE
   omega-referrals.js already does cross-tenant attribution: a referral is
   addressed by `toOrgId`, and a fenecon.com user sees every referral sent TO
   fenecon.com and nothing else. Originator credit is that same idea pointed
   the other way — not "who is this FOR" but "who is owed the introduction" —
   so the pattern is worth reusing rather than reinventing.

   It is not simply added INTO omega-referrals.js because the place that needs
   it most cannot load that file. `portals/finance` is a standalone product
   surface: it pulls Firebase directly, loads none of the `omega-*.js` runtime
   and never reads OMEGA_WORKSPACE (checked 2026-09-16). Pulling 2,200 lines
   of dashboard block into the finance portal to reach one helper would be the
   wrong trade. So the primitive lives here, small enough for either side to
   load, and both write the SAME field names — which is the actual point. Two
   surfaces disagreeing about what "originator" means is the failure this
   prevents.

   THE FIELD SHAPE — write these exactly, everywhere:
     originatorOrgId   canonical org id, lowercased and alias-folded, or ''
     originatorName    what to show a human; free text, never trusted as a key
     originatorBy      email of whoever recorded the credit
     originatorAt      when it was recorded

   `originatorOrgId` is the key and `originatorName` is decoration. Anything
   that pays, reports or joins on credit must use the id: a display name is
   typed by a human and two people will spell the same company three ways.

   WHAT THIS DELIBERATELY DOES NOT DO
   It records who is owed credit. It does not compute, hold, or move money.
   Whether ClearSky can sit in the flow of funds at all is a money-transmission
   question that is explicitly not decided (see Active Priorities), and a field
   that says "Sunesol introduced this" must not quietly become a payout
   instruction.
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /* MUST match orgAlias() in firestore.rules, storage.rules and
     api/_lib/admin.js. A fourth hand-mirrored copy of a three-entry map is a
     known wart in this repo; the rules cannot import, so the copies stay. */
  var ORG_ALIAS = { 'fenecon.de': 'fenecon.com', 'fenecon.us': 'fenecon.com' };

  /* An org id is an email domain, lowercased. Accepts what a human actually
     types — a whole email address, a URL, stray whitespace, capitals — and
     returns the key, or '' if there is nothing usable in it. */
  function normalize(v) {
    var s = String(v == null ? '' : v).trim().toLowerCase();
    if (!s) { return ''; }
    if (s.indexOf('@') !== -1) { s = s.split('@').pop(); }      /* an email */
    s = s.replace(/^https?:\/\//, '').replace(/^www\./, '');    /* a URL */
    s = s.split('/')[0].split('?')[0];
    /* A dot-less value is only an id if it is a SLUG ("demo-clearsky"). Prose
       is not. Without this, "Sunesol Energy" had its space stripped and came
       back as the org id "sunesolenergy" — a key that joins to nothing, looks
       deliberate in a report, and makes check() useless, since the whole job
       of check() is to refuse a name with no id behind it. Whitespace in the
       raw value is the tell: a slug never has any. */
    var hadSpace = /\s/.test(s);
    s = s.replace(/[^a-z0-9.\-]/g, '');
    if (s.indexOf('.') === -1) { return hadSpace ? '' : s; }
    return ORG_ALIAS[s] || s;
  }

  /* The canonical record. Returns null when no credit was given, so a caller
     can spread-or-skip without writing empty strings onto every deal — an
     absent field and a blank one read differently in a report. */
  function fields(orgId, name, byEmail) {
    var id = normalize(orgId);
    var nm = String(name == null ? '' : name).trim().slice(0, 120);
    if (!id && !nm) { return null; }
    /* If the "name" is just another spelling of the id — the common case,
       since the picker feeds one box to both — show the id. Otherwise typing
       "grant@sunesol.com" would put a person's private email in a display
       field that other tenants on the deal can read. */
    if (id && normalize(nm) === id) { nm = id; }
    return {
      originatorOrgId: id,
      originatorName: nm || id,
      originatorBy: String(byEmail || '').trim().toLowerCase(),
      originatorAt: Date.now()
    };
  }

  /* Is this credit usable? A name with no id is a note to a human, not an
     attribution anything can join on — say so at the point of entry rather
     than discovering it in a payout report months later. */
  function check(orgId, name) {
    var id = normalize(orgId);
    if (!id && !String(name || '').trim()) {
      return { ok: true, id: '', warn: '' };          /* no credit claimed */
    }
    if (!id) {
      return { ok: false, id: '',
               warn: 'Pick the organisation, not just a name. Credit is tracked '
                   + 'by org id — a typed name cannot be paid or reported on.' };
    }
    return { ok: true, id: id, warn: '' };
  }

  /* Mount a picker into a container. Free text with a datalist of known orgs:
     the list is a convenience, the normalisation is the contract, and an org
     that is not on the platform yet can still be credited by domain. */
  function mount(host, opts) {
    opts = opts || {};
    if (!host) { return null; }
    var idBase = opts.idBase || 'orig';
    host.innerHTML =
      '<label for="' + idBase + 'Org">Introduced by <span class="muted">(optional)</span></label>'
      + '<input id="' + idBase + 'Org" list="' + idBase + 'List" autocomplete="off"'
      + ' placeholder="sunesol.com — the organisation that made the introduction">'
      + '<datalist id="' + idBase + 'List"></datalist>'
      + '<div id="' + idBase + 'Note" class="muted" style="margin-top:4px"></div>';

    var input = document.getElementById(idBase + 'Org');
    var list = document.getElementById(idBase + 'List');
    var note = document.getElementById(idBase + 'Note');

    (opts.orgs || []).forEach(function (o) {
      var op = document.createElement('option');
      op.value = o.id;
      op.label = o.label || o.id;
      list.appendChild(op);
    });

    function say() {
      var v = input.value;
      if (!String(v || '').trim()) { note.textContent = ''; note.className = 'muted'; return; }
      var c = check(v, v);
      var known = (opts.orgs || []).some(function (o) { return o.id === c.id; });
      note.textContent = c.ok
        ? (known ? 'Credit to ' + c.id : 'Credit to ' + c.id + ' — not a tenant on the platform yet, which is fine')
        : c.warn;
      note.className = c.ok ? 'muted' : 'bad';
    }
    input.addEventListener('input', say);
    input.addEventListener('blur', say);

    return {
      el: input,
      value: function () { return input.value; },
      normalized: function () { return normalize(input.value); },
      fields: function (byEmail) { return fields(input.value, input.value, byEmail); },
      check: function () { return check(input.value, input.value); },
      clear: function () { input.value = ''; say(); }
    };
  }

  global.OmegaOriginator = {
    normalize: normalize,
    fields: fields,
    check: check,
    mount: mount,
    ORG_ALIAS: ORG_ALIAS
  };
})(window);
