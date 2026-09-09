/* The referral demo seeder — five sites, five requests, and a guard that
   actually guards. FENECON ended up with eighteen referrals because the
   re-run check read the module's in-memory rows instead of the collection. */
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'omega-referrals.js'), 'utf8');

let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }

function block(startsWith) {
  const i = SRC.indexOf(startsWith);
  return i < 0 ? '' : SRC.slice(i, SRC.indexOf('\n  ];', i));
}

console.log('demo set');
const refs = [...block('var DEMO_REFERRALS = [').matchAll(/siteName:\s*'([^']+)'/g)].map(m => m[1]);
const sites = [...block('var DEMO_SITES = [').matchAll(/name:\s*'([^']+)'/g)].map(m => m[1]);
ok(refs.length === 5, 'five demo referrals (got ' + refs.length + ')');
ok(sites.length === 5, 'five demo sites (got ' + sites.length + ')');

/* The thing that made the banner fire: two rows for one address. */
const addrs = [...block('var DEMO_REFERRALS = [').matchAll(/address:\s*'([^']+)'/g)]
  .map(m => m[1].toLowerCase().replace(/[^a-z0-9]/g, ''));
const dupeAddr = addrs.filter((a, i) => addrs.indexOf(a) !== i);
ok(!dupeAddr.length, 'no two demo referrals share an address'
  + (dupeAddr.length ? ' — ' + dupeAddr.join(', ') : ''));

/* Near-duplicates by street number are what normKey() collapses, so check
   the loose form too rather than only exact string equality. */
const streets = addrs.map(a => (a.match(/^\d+[a-z]+/) || [a])[0]);
const dupeStreet = streets.filter((a, i) => streets.indexOf(a) !== i);
ok(!dupeStreet.length, 'and none collide on street number'
  + (dupeStreet.length ? ' — ' + dupeStreet.join(', ') : ''));

console.log('re-run guard');
const guard = SRC.slice(SRC.indexOf('function seedDemo()'), SRC.indexOf('function run(isStaff)'));
ok(/collection\('referrals'\)[\s\S]*?\.where\('toOrgId'/.test(guard),
   'the guard queries the referrals collection');
ok(!/S\.rows\.filter\([\s\S]{0,80}seed === true/.test(guard),
   'and no longer counts seeded rows out of in-memory state');
ok(/if \(already \|\| seededRefs\)/.test(guard), 'it still refuses when either is non-zero');
ok(/Promise\.all\(/.test(guard), 'both checks run before anything is written');

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
