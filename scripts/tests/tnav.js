/* The left sidebar must be the same list on every page that has one.
   It has now drifted twice — the JD/Administration sections went missing from
   projects and marketplace, were fixed, and then Quote Desk and the whole
   Workspace group drifted the same way. An item that appears on one page and
   not the next reads as "my links are gone", not as "this page has a
   different nav", so this compares the nav across pages rather than trusting
   three copies of the markup to be edited together. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const PAGES = ['index.html', 'projects.html', 'marketplace.html'];

let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }

/* Pull the labels out of #side-nav, in order. */
function navOf(file) {
  const s = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const i = s.indexOf('<nav id="side-nav">');
  if (i < 0) return null;
  const j = s.indexOf('</nav>', i);
  const block = s.slice(i, j);
  const out = [];
  const re = /<(a|button)\s[^>]*class="sn-item[^"]*"[\s\S]*?<span>([^<]+)<\/span>/g;
  let m;
  while ((m = re.exec(block))) out.push(m[2].trim());
  return out;
}

console.log('sidebar');
const navs = {};
PAGES.forEach(p => { navs[p] = navOf(p); });
PAGES.forEach(p => ok(navs[p] && navs[p].length, p + ' has a sidebar (' + (navs[p] || []).length + ' items)'));

const base = navs['index.html'];
PAGES.slice(1).forEach(p => {
  const a = JSON.stringify(base), b = JSON.stringify(navs[p]);
  ok(a === b, p + ' matches the dashboard'
    + (a === b ? '' : '\n         dashboard: ' + a + '\n         ' + p + ': ' + b));
});

/* The two that keep going missing, named so a failure says which. */
['Quote Desk', 'To-Dos', 'Team', 'Company Feed', 'Chat', 'Projects', 'Marketplace'].forEach(label => {
  const missing = PAGES.filter(p => (navs[p] || []).indexOf(label) < 0);
  ok(!missing.length, '"' + label + '" is on every page'
    + (missing.length ? ' — missing from ' + missing.join(', ') : ''));
});

/* Every sidebar link has to go somewhere that exists. */
console.log('targets');
const hrefs = {};
PAGES.forEach(p => {
  const s = fs.readFileSync(path.join(ROOT, p), 'utf8');
  const i = s.indexOf('<nav id="side-nav">'), j = s.indexOf('</nav>', i);
  const re = /<a\s[^>]*class="sn-item[^"]*"[^>]*href="([^"]+)"/g;
  let m; while ((m = re.exec(s.slice(i, j)))) (hrefs[m[1]] = hrefs[m[1]] || []).push(p);
});
Object.keys(hrefs).forEach(h => {
  if (/^https?:|^#|^\/#/.test(h)) return;                 /* external or hash */
  const f = h.replace(/^\//, '').replace(/\/$/, '/index.html') || 'index.html';
  ok(fs.existsSync(path.join(ROOT, f)), h + ' resolves to a file that exists');
});

/* The design-partner surface: one nav item, hidden until there is work, and
   a marketplace link that a design partner never sees. Both are runtime, so
   the three navs stay identical in the markup — which is what the comparison
   above depends on. */
console.log('design partner');
PAGES.forEach(p => {
  const s = fs.readFileSync(path.join(ROOT, p), 'utf8');
  ok(/id="sn-design"[^>]*style="display:none"/.test(s),
     p + ' carries the design-queue item, hidden by default');
});
{
  const t = fs.readFileSync(path.join(ROOT, 'omega-tenant.js'), 'utf8');
  ok(/array-contains', org/.test(t) || /'array-contains', org/.test(t),
     'omega-tenant counts work by the collaborator roster, not a hardcoded domain');
  ok(/hideMarketplace/.test(t), 'and honours a tenant that should not see the marketplace');
}
ok(fs.existsSync(path.join(ROOT, 'design-queue.html')), '/design-queue.html exists');

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
