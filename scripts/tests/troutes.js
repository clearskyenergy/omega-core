/* vercel.json — the rewrites have to be ones Vercel will actually apply.

   Three routes were returning 404 in production and nothing was watching:
   /osa, /osa/portfolio and /finance. Every one of them had a destination
   ending in .html, and the single rewrite whose destination did not — 
   /skyfund-sandbox — was the single one that worked. With cleanUrls: true a
   file is served at its extensionless path, so a destination naming the
   .html file points at something the router will not serve.

   A fourth, /skyfund-sandbox/(.*), was written in the legacy `routes`
   syntax. `rewrites` matches with :param, not a capture group, so that rule
   matched nothing and its $1 expanded to nothing.

   Both failures are invisible from the repository: the file is valid JSON,
   the destination files all exist, and the site builds. The only signal was
   a 404 nobody was checking. These assertions are that signal. */
const fs = require('fs');
const path = require('path');
const ROUTES = require('../_routes.js');

let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'vercel.json'), 'utf8'));
const rewrites = cfg.rewrites || [];
const redirects = cfg.redirects || [];

console.log('rewrites Vercel will apply');
ok(cfg.cleanUrls === true, 'cleanUrls is on — which is what makes the rest of this matter');

/* THE ONE THAT COST THREE LIVE ROUTES. */
const htmlDest = rewrites.filter(r => /\.html$/.test(String(r.destination || '')));
ok(htmlDest.length === 0,
   'no rewrite destination ends in .html — cleanUrls serves the extensionless path'
   + (htmlDest.length ? '\n       ' + htmlDest.map(r => r.source + ' -> ' + r.destination).join('\n       ') : ''));
const htmlRedir = redirects.filter(r => /\.html$/.test(String(r.destination || '')));
ok(htmlRedir.length === 0, 'and neither does a redirect destination');

/* `rewrites` is not the legacy `routes` array. */
const legacy = rewrites.concat(redirects)
  .filter(r => /\(\.\*\)|\$\d/.test(String(r.source || '') + String(r.destination || '')));
ok(legacy.length === 0,
   'no rule uses (.*) or $1 — rewrites match with :param, so those match nothing'
   + (legacy.length ? '\n       ' + legacy.map(r => r.source + ' -> ' + r.destination).join('\n       ') : ''));

console.log('\nevery destination is something that exists');
rewrites.forEach(r => {
  const d = String(r.destination || '');
  if (!d.startsWith('/') || /:/.test(d)) return;      /* param destinations resolve at runtime */
  ok(ROUTES.fileExists(d), r.source + ' -> ' + d + ' exists on disk');
});
redirects.forEach(r => {
  const d = String(r.destination || '');
  if (!d.startsWith('/') || /:/.test(d)) return;
  /* A redirect may legitimately target another rewrite's source rather than a
     file, so accept either. */
  ok(ROUTES.resolvesToFile(d), 'redirect ' + r.source + ' -> ' + d + ' goes somewhere real');
});

console.log('\nsources are well formed');
rewrites.concat(redirects).forEach(r => {
  ok(typeof r.source === 'string' && r.source.startsWith('/'),
     'source ' + JSON.stringify(r.source) + ' is a root-absolute path');
});

/* The sidebar links every shell ships. tnav.js checks they resolve; this
   checks the routing table is why. */
console.log('\nthe nav routes that were dead');
['/osa', '/osa/portfolio', '/finance'].forEach(p => {
  ok(ROUTES.resolvesToFile(p), p + ' resolves through the routing table');
});

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
