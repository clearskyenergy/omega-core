/* The kind of company decides what the dashboard is for.

   Before this, three modules each turned the vertical into their own yes/no
   — referrals had one list, owned assets another, the starter widgets came
   from a Firestore collection nobody had seeded — so an installer got a
   quote-request inbox nothing would ever land in, and a capital partner got
   a portfolio card for projects it does not develop. One table now, read by
   the dashboard, by the two modules, and by the admin console, so the
   console shows exactly what the tenant will get. */
const fs = require('fs');
const path = require('path');

let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }
const root = p => path.join(__dirname, '..', '..', p);
const read = p => fs.readFileSync(root(p), 'utf8');

const P = require(root('omega-dashboard-profiles.js'));

console.log('tdashprofiles: the table');
ok(P.wants({ vertical: 'installer' }, 'referrals') === false, 'an installer does not get a referrals inbox');
ok(P.wants({ vertical: 'installer' }, 'quotes') === true && P.wants({ vertical: 'installer' }, 'marketplace') === true,
   'an installer gets quotes and the marketplace');
ok(P.wants({ vertical: 'oem' }, 'referrals') === true, 'an OEM / technology company gets referrals');
ok(P.wants({ vertical: 'distributor' }, 'quotes') === true && P.wants({ vertical: 'distributor' }, 'referrals') === true,
   'a distributor gets quotes and referrals');
ok(P.wants({ vertical: 'developer' }, 'referrals') === false, 'a developer sends quote requests, does not receive them');
ok(P.wants(null, 'referrals') === 'unknown', 'no workspace yet is "unknown", not a guess');
ok(P.keyFor({ vertical: 'made-up' }) === 'developer', 'an unknown vertical falls back to developer');

console.log('tdashprofiles: a combination, and overrides');
const nextnrg = { vertical: 'developer', dashboardBlocks: { referrals: true } };
ok(P.wants(nextnrg, 'referrals') === true, 'a developer that also sells technology can switch referrals on');
ok(P.wants(nextnrg, 'assets') === true, '...and keeps everything else the developer row has');
ok(P.keyFor({ vertical: 'installer', dashboardProfile: 'oem' }) === 'oem', 'an explicit profile beats the vertical');
ok(P.resolve({ vertical: 'installer', dashboardProfile: 'oem' }).explicit === true, '...and says so');
ok(P.wants({ vertical: 'oem', dashboardBlocks: { referrals: 'yes' } }, 'referrals') === true,
   'an override that is not true/false is ignored, not treated as false');

console.log('tdashprofiles: capital partners');
const helios = { vertical: 'developer', financeOrgKey: 'helios' };
ok(P.keyFor(helios) === 'finance', 'a finance org key puts a tenant on the capital-partner profile whatever its vertical says');
const fin = P.resolve(helios);
ok(['finroom', 'finmarket', 'finoffers', 'fininvest'].every(w => fin.widgets.indexOf(w) >= 0),
   'their starter board is deal room, marketplace, offers, investments');
ok(Object.keys(fin.blocks).every(b => fin.blocks[b] === false), 'no project tooling');
const hidden = P.hiddenBlockIds(helios);
ok(['portfolio', 'pipeline', 'analytics', 'taskflow', 'referrals', 'owned-assets'].every(id => hidden.indexOf(id) >= 0),
   'every built-in project card is hidden for them');
ok(P.hiddenBlockIds({ vertical: 'installer' }).indexOf('referrals') >= 0
   && P.hiddenBlockIds({ vertical: 'installer' }).indexOf('pipeline') < 0,
   'an installer hides referrals and keeps the pipeline');

console.log('tdashprofiles: the dashboard reads it');
const idx = read('index.html');
ok(/<script src="\/omega-dashboard-profiles\.js\?v=\d+"><\/script>/.test(idx), 'index.html loads the table');
ok(idx.indexOf('OmegaDashProfiles.hiddenBlockIds(window.OMEGA_WORKSPACE)') >= 0, 'the block loop hides what the profile turns off');
ok(/profHidden\.indexOf\(k\)>=0\) && !editing/.test(idx), '...but not in edit mode, so a card can still be found');
ok(idx.indexOf('OmegaDashProfiles.resolve(ws)') >= 0 && idx.indexOf('_addStarter(p.widgets)') >= 0,
   'the starter board falls back to the profile widgets when verticals/{v} is empty');
ok(/type:'finmarket'/.test(idx) && /_PANEL_TYPES = \[[^\]]*'finmarket'/.test(idx), 'a marketplace panel exists and is drawable');
ok(/where\('status','==','open'\)/.test(idx.slice(idx.indexOf('function _finLoad'))), 'it reads the open marketplace — one of the three partner read paths');
ok(idx.indexOf('function _finMarketHtml') >= 0 && /MW listed/.test(idx) && /capex sought/.test(idx),
   'count, MW and capex are on the panel');
const invest = idx.slice(idx.indexOf('function _finInvestHtml'), idx.indexOf('function _finInvestHtml') + 3000);
ok(/dealMw/.test(invest) && /dealCapexUsd/.test(invest) && /accepted /.test(invest), 'an accepted offer shows MW, capex and when it was accepted');
ok(/decidedAt\|\|0\)-\(\+a\.decidedAt/.test(invest), 'most recently accepted first');
ok(/dealMw:d\.mw!=null\?d\.mw:d\.sizeMw/.test(idx), 'the deal size rides along with the offer');

console.log('tdashprofiles: the modules read it');
const refs = read('omega-referrals.js');
ok(/OmegaDashProfiles\.wants\(ws,\s*'referrals'\)/.test(refs), 'referrals asks the table');
const assets = read('omega-assets.js');
ok(/OmegaDashProfiles\.wants\(ws,\s*'assets'\)/.test(assets), 'owned assets asks the table');
const tenant = read('omega-tenant.js');
ok(/ws\.dashboardProfile/.test(tenant) && /ws\.dashboardBlocks/.test(tenant), 'omega-tenant publishes the two org fields');

console.log('tdashprofiles: the admin console sets it');
const adm = read('admin/admin-console.js');
ok(/<script src="\/omega-dashboard-profiles\.js\?v=\d+"><\/script>/.test(read('admin/index.html')), 'admin/index.html loads the same table');
ok(adm.indexOf('h+=_dashProfileHtml(orgId, org);') >= 0, 'the Manage card carries the control');
ok(/function saveDashProfile/.test(adm) && /dashboardProfile: key \|\| FV\['delete'\]\(\)/.test(adm),
   'a blank profile deletes the field instead of writing ""');
ok(/if \(cb\.checked !== \(base\[b\] === true\)\) ov\[b\] = cb\.checked;/.test(adm),
   'only blocks that differ from the profile default are written');
ok(/Object\.keys\(ov\)\.length \? ov : FV\['delete'\]\(\)/.test(adm), 'no differences → no override field');
ok(/function resetStarterBoard/.test(adm) && /collection\('layouts'\)\.doc\('default'\)\.set\(/.test(adm),
   'reset rewrites omega_orgs/{org}/layouts/default');
ok(!/dashboard_layouts/.test(adm.slice(adm.indexOf('function resetStarterBoard'), adm.indexOf('function resetStarterBoard') + 1500)),
   '...and never touches anybody\'s personal layout');
ok(!/PROFILES\s*=\s*\{/.test(adm), 'the console holds no copy of the table');

if (fails) { console.log('tdashprofiles: ' + fails + ' failed'); process.exit(1); }
console.log('tdashprofiles: all passed');
