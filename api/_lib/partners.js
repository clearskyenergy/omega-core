/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/partners.js — the development partners a site can be sent to
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Terra Energy puts together the SOLAR package and detail for a site and
   usually funds it on its own (Tommy, 2026-10-11: "we will need to be able
   to send to our solar partner Terra energy … they will be one of the
   partners"). A partner here is a NAME and WHERE ITS MAIL GOES; the
   address is never a constant in the code (the Helios rule): the
   environment variable wins, else the deal room's own list
   (fin_settings/dealroom.orgs.<key>), else nothing is mailed and the page
   says so. Pure: recipients() reads what it is given.

   Lightsmith Energy is a compute-offtake partner (2026-10-25): it finds the
   buyer of the compute and takes its fee from compute revenue. It is sent
   ONE package for many sites (api/_lib/portfolio/loi-package.js, the
   diligence's Send LOI package), never the one-site mail, so it carries
   loiPackage. Its fee and term are a workspace's own diligence config,
   never here.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var PARTNERS = {
  terra: { key: 'terra', name: 'Terra Energy', role: 'solar', asks: 'a solar package and detail for the site', env: 'TERRA_ENERGY_EMAIL', settings: 'terra', funds: 'Terra usually arranges the funding of its own package; it is one of the partners, not the capital request.' },
  helios: { key: 'helios', name: 'Helios Energy Advisors', role: 'capital', asks: 'a first-pass financing review', env: 'HELIOS_INTAKE_EMAIL', settings: 'helios', funds: 'The Helios intake (Site Map › Output) carries the full form; this sends the site facts.' },
  lightsmith: { key: 'lightsmith', name: 'Lightsmith Energy', role: 'offtake', asks: 'compute offtake for the sites: a buyer, a term and a price, to a letter of intent', env: 'LIGHTSMITH_ENERGY_EMAIL', settings: 'lightsmith', loiPackage: true,
    funds: 'Lightsmith finds the buyer of the compute and is paid from compute revenue; it is the offtake partner, not the capital request.' }
};
function valid(a) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(a || '').trim()); }
function get(key) { return Object.prototype.hasOwnProperty.call(PARTNERS, key) ? PARTNERS[key] : null; }
function list() { return Object.keys(PARTNERS).map(function (k) { var p = PARTNERS[k]; return { key: p.key, name: p.name, role: p.role, asks: p.asks, funds: p.funds, loiPackage: p.loiPackage === true }; }); }
/* recipients(partner, env, settings) → { to: [], source } */
function recipients(partner, env, settings) {
  env = env || {}; settings = settings || {};
  var p = typeof partner === 'string' ? get(partner) : partner;
  if (!p) return { to: [], source: null };
  var fromEnv = String(env[p.env] || '').split(/[,;\s]+/).map(function (s) { return s.trim(); }).filter(valid);
  if (fromEnv.length) return { to: fromEnv, source: p.env };
  var listed = settings.orgs && Array.isArray(settings.orgs[p.settings]) ? settings.orgs[p.settings] : [];
  listed = listed.map(function (s) { return String(s || '').trim(); }).filter(valid);
  if (listed.length) return { to: listed, source: 'fin_settings/dealroom.orgs.' + p.settings };
  return { to: [], source: null };
}
module.exports = { PARTNERS: PARTNERS, get: get, list: list, recipients: recipients, valid: valid };
