/* The release switch. Classic is the default. A v2 route is used only
   when the switch says v2 and that page has landed.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   node scripts/tests/texperience.js */
'use strict';
var fs = require('fs'), path = require('path');
var E = require('../../omega-experience.js');
var V = require('../../omega-workspace-v2.js');
var pass = 0, fail = 0;
function ok(m, c, got) { if (c) { pass++; return; } fail++; console.log('  FAIL ' + m + (got !== undefined ? '  got: ' + JSON.stringify(got).slice(0, 500) : '')); }

ok('absent is classic', E.resolve({}) === 'classic');
ok('a bad value is ignored', E.resolve({ org: 'V2', user: 'new', remembered: '', query: 'nope' }) === 'classic');
ok('the org flag', E.resolve({ org: 'v2' }) === 'v2');
ok('a person beats the org', E.resolve({ org: 'v2', user: 'classic' }) === 'classic');
ok('a remembered choice beats the person', E.resolve({ user: 'v2', remembered: 'classic', org: 'v2' }) === 'classic');
ok('the query beats everything', E.resolve({ search: '?home=workspace&ui=v2', remembered: 'classic', user: 'classic', org: 'classic' }) === 'v2');
ok('?ui=classic is classic', E.resolve({ search: '?ui=classic' }) === 'classic' && E.queryOf('?ui=classic') === 'classic');
ok('?ui=v1 is the classic link the journey release already uses', E.resolve({ search: '?ui=v1', org: 'v2' }) === 'classic' && E.destination({ path: '/workspace', search: '?ui=v1', org: 'v2' }) === '');
ok('only the two words count as a query', E.queryOf('?ui=v2extra') === '' && E.queryOf('?ui=') === '');

ok('workspace upgrades and keeps the rest of the query', E.destination({ path: '/workspace', search: '?home=workspace&id=1', hash: '#track', org: 'v2' }) === '/workspace-v2?home=workspace&id=1#track');
ok('?ui= is not left on the v2 address', E.destination({ path: '/workspace.html', search: '?ui=v2&home=workspace', org: 'classic' }) === '/workspace-v2?home=workspace');
ok('a classic view stays on the classic workspace', E.destination({ path: '/workspace', hash: '#billing', org: 'v2' }) === '' && E.destination({ path: '/workspace', hash: '#module-lite', org: 'v2' }) === '');
ok('?ui=classic blocks an org on v2', E.destination({ path: '/workspace', search: '?ui=classic', org: 'v2' }) === '');
ok('a remembered classic blocks the org', E.destination({ path: '/workspace', remembered: 'classic', org: 'v2' }) === '');
ok('standing on v2 is not sent away just because the default is classic', E.destination({ path: '/workspace-v2', org: 'classic' }) === '');
ok('a tab the router sent returns when the switch is classic', E.destination({ path: '/workspace-v2', org: 'classic', routed: true, settled: true }) === '/workspace');
ok('that return waits until the record is known', E.destination({ path: '/workspace-v2', routed: true, settled: false }) === '');
ok('a remembered v2 keeps a routed tab on v2', E.destination({ path: '/workspace-v2', remembered: 'v2', org: 'classic', routed: true, settled: true }) === '');
ok('?ui=classic leaves the v2 page', E.destination({ path: '/workspace-v2', search: '?ui=classic', org: 'v2' }) === '/workspace');

ok('editor does not upgrade until its page has landed', E.destination({ path: '/editor.html', search: '?id=abc', hash: '#x', org: 'v2' }) === '' && E.href('editor', 'v2') === '/editor.html');
ok('portfolio, prime and finance stay on the classic route until they land', E.href('portfolio', 'v2') === '/portfolio.html' && E.href('prime', 'v2') === '/omega-prime.html' && E.href('finance', 'v2') === '/finance' && E.destination({ path: '/portfolio.html', org: 'v2' }) === '' && E.destination({ path: '/finance', org: 'v2' }) === '' && E.destination({ path: '/portals/finance/', org: 'v2' }) === '' && E.destination({ path: '/portals/finance/index.html', org: 'v2' }) === '');
ok('the workspace twin is the one that has landed', E.href('workspace', 'v2') === '/workspace-v2' && E.href('workspace', 'classic') === '/workspace' && E.landed('workspace') === true && E.landed('editor') === false);

ok('a v2 door keeps a deal hash and does not invent a page', E.upgrade('/finance#deal=abc&tab=room', 'v2') === '/finance#deal=abc&tab=room');
ok('a v2 door keeps Plan & billing on the classic workspace', E.upgrade('/workspace#billing', 'v2') === '/workspace#billing');
ok('a v2 door uses the workspace twin', E.upgrade('/workspace', 'v2') === '/workspace-v2');
ok('an editor link stays classic while editor v2 has not landed', E.upgrade('/editor.html?id=p1&org=northstar', 'v2') === '/editor.html?id=p1&org=northstar');

ok('Switch to classic carries the query and the override', E.classicHref('/workspace-v2', '?home=workspace', '') === '/workspace?home=workspace&ui=classic');
ok('Switch to classic from the editor twin', E.classicHref('/editor-v2', '?id=1', '') === '/editor.html?id=1&ui=classic');

var root = path.join(__dirname, '../..');
function pageFile(url) {
  var rel = String(url || '').replace(/^\//, '');
  var cands = [rel, rel + '.html', path.join(rel, 'index.html')];
  var i, f;
  for (i = 0; i < cands.length; i++) {
    f = path.join(root, cands[i]);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return true;
  }
  return false;
}
E.routes.forEach(function (r) {
  var onDisk = r.key === 'finance' ? fs.existsSync(path.join(root, 'portals/finance/index.html')) : pageFile(r.classic);
  ok(r.key + ' classic page is in the tree', onDisk);
  ok(r.key + ' landed flag matches the tree', pageFile(r.v2) === !!r.landed, { landed: r.landed, file: r.v2 });
});

var signup = fs.readFileSync(path.join(root, 'api/tenant-signup.js'), 'utf8');
ok('signup does not set the experience', signup.indexOf('experience') < 0);
var tenant = fs.readFileSync(path.join(root, 'omega-tenant.js'), 'utf8');
ok('the tenant runtime copies only classic or v2', /T\.org\.experience === 'v2' \|\| T\.org\.experience === 'classic'/.test(tenant) && /ws\.experience = T\.org\.experience/.test(tenant) && /ws\.experienceUser = T\.member\.experience/.test(tenant));
var rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
ok('a tenant admin cannot write the org flag', /function brandingOnly\(\) \{[\s\S]*?hasOnly\(\['name', 'logoUrl', 'bannerUrl', 'colors', 'exportBrand',\s*'defaultLayout', 'updatedAt'\]\)/.test(rules) && rules.indexOf("hasOnly(['name', 'logoUrl'") > 0);
ok('a member cannot write their own flag', /selfSafeFields\(\) \{[\s\S]*?hasOnly\(\['name', 'updatedAt'\]\)/.test(rules));

['workspace.html', 'workspace-v2.html', 'index.html', 'projects.html', 'marketplace.html', 'portfolio.html', 'site-crm.html', 'editor.html', 'omega-prime.html', 'portals/finance/index.html'].forEach(function (f) {
  var src = fs.readFileSync(path.join(root, f), 'utf8');
  ok(f + ' loads the switch', src.indexOf('/omega-experience.js') >= 0);
});
var live = fs.readFileSync(path.join(root, 'workspace.html'), 'utf8');
ok('the live home no longer redirects on its own', live.indexOf("location.replace('/workspace-v2'") < 0 && /omega-hexhub\.js/.test(live));
var shell = fs.readFileSync(path.join(root, 'omega-workspace-shell.js'), 'utf8');
ok('the live rail and the home switch are untouched', /label: 'All tools'/.test(shell) && /label: 'Quote Desk'/.test(shell) && /omega_home/.test(shell));

var nav = V.nav({});
ok('the v2 rail has Switch to classic', nav.some(function (n) { return n.label === 'Switch to classic' && /ui=classic/.test(n.href); }));
var step = V.journey({ projects: [{ id: 'p', name: 'Site' }], hrefs: { omegaprime: '/omega-prime.html' } });
var portfolio = step.steps.filter(function (s) { return s.key === 'customer'; })[0].links[0].href;
var prime = step.steps.filter(function (s) { return s.key === 'design'; })[0].links[0].href;
var finance = step.steps.filter(function (s) { return s.key === 'track'; })[0].links.filter(function (l) { return l.label === 'Finance'; })[0].href;
ok('workspace v2 still falls back while the other twins have not landed', portfolio === '/portfolio.html' && prime === '/omega-prime.html' && (finance === '/portals/finance/' || finance === '/finance'), { portfolio: portfolio, prime: prime, finance: finance });
ok('fromDocs reads the two fields and nothing else', E.fromDocs({ experience: 'v2', name: 'N' }, { experience: 'classic' }).org === 'v2' && E.fromDocs({ experience: 'v2' }, { experience: 'nope' }).user === '' && E.fromDocs(null, null).org === '');

if (fail) { console.log(fail + ' failed, ' + pass + ' passed'); process.exit(1); }
console.log('texperience: ' + pass + ' passed');
