/* Who can be sent a deal room, and what a "Send" from a JD partner reaches.

   Two separate failures, both of which read to the user as "it does not
   work" and neither of which was a refusal:

   1. An organisation registered as an Investor did not appear in "Send to a
      deal room". capitalPartners() was jdOrgs().filter(kind==='investor'),
      and jdOrgs() filters on jd.active === true — so an investor was only
      selectable once somebody ALSO ticked "Co-develop with them", and
      nothing said so. A capital partner and a co-developer are different
      relationships.

   2. A JD partner pressed Send, their side said Sent, and nothing appeared
      on ours. The send stamps jd.offeredAt on a PROJECT; the partner screen
      lists DEALS. Nothing read what the send wrote, so the project sat in a
      237-row inbox indistinguishable from every other editor project. */
const fs = require('fs');
const path = require('path');

let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }
const root = p => path.join(__dirname, '..', '..', p);
const read = p => fs.readFileSync(root(p), 'utf8');
const code = p => read(p)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  .replace(/<!--[\s\S]*?-->/g, ' ');

const pf = code('tenants/osa/portfolio.html');

console.log('an investor is a capital partner');
ok(/r\.org\.kind === 'investor' && r\.org\.active !== false/.test(pf),
   'selection is kind + not-switched-off');
ok(!/function capitalPartners\(\)\{?\s*return jdOrgs\(\)/.test(pf.replace(/\s+/g, ' ')),
   'it no longer routes through jdOrgs(), which required the co-develop tick');
/* The JD flag still has a job — it just is not this one. */
ok(/\.filter\(function \(r\)\{ return r\.jd\.active === true; \}\)/.test(pf.replace(/\s+/g, ' '))
   || /r\.jd\.active === true/.test(pf),
   'jd.active still drives the JD tab');
ok(/submitLabel: 'Send to deal room'/.test(pf),
   'the button names the action, not whichever partner happened to be the only one');

console.log('\na seeded capital partner is selectable without a Firestore write');
const cfg = read('tenants/osa/config.js');
ok(/'heliosnrgy\.com':\s*\{[^}]*kind:'investor'/.test(cfg), 'Helios is seeded as an investor');
ok(/'amperagecapital\.com':\s*\{[^}]*kind:'investor'/.test(cfg), 'so is Amperage');
/* The seeded shape must satisfy the selector. It carries no jd map, which is
   exactly why it was useless until the jd.active requirement came out. */
const acc = read('tenants/osa/access-data.js');
ok(/out\[k\] = \{ orgId:k, name:known\[k\]\.name, kind:known\[k\]\.kind \|\| 'broker'[^}]*active:true/.test(acc),
   'the seeded shape carries kind and active:true — both halves of the selector');
ok(!/out\[k\] = \{[^}]*jd:/.test(acc),
   'and carries no jd map, so a jd.active test would have excluded it forever');
/* A written registry row must still win, or the console lies. */
ok(/for \(var j in _orgs\)[\s\S]{0,120}out\[j\] = _orgs\[j\]/.test(acc),
   'a registry row written in the console overrides the seed');

console.log('\nwhat a partner sends is visible on our side');
const ing = code('tenants/osa/ingest-data.js');
ok(/jd: v\.jd \|\| null/.test(ing),
   'the project projection carries the jd stamp');
ok(/orgsInvolved: \(v\.orgsInvolved \|\| \[\]\)\.map\(lower\)/.test(ing),
   'and the roster, lowercased to match how orgs are keyed');
ok(/offeredAt: \(d\.jd && d\.jd\.offeredAt\) \|\| ''/.test(ing),
   'the inbox candidate carries when it was sent');
ok(/offeredBy: \(d\.jd && d\.jd\.offeredBy\) \|\| ''/.test(ing), 'and by whom');
ok(/if\(k==='offered'\) return !!c\.offeredAt && !c\.linkedDeal;/.test(pf),
   'the inbox has a bucket for what was sent to us, unadopted');
ok(/\{k:'offered',l:'Sent to us'\}/.test(pf),
   'and it is the first chip — it is the only bucket somebody is waiting on');
ok(/function jdSentProjects/.test(pf) && /p\.jd\.offeredAt/.test(pf),
   'the partner screen lists what that partner sent');
ok(/h \+= jdSentHtml\(r\.stats\.orgId\);/.test(pf),
   'above the deals roster, which is a different thing');

/* The send itself is client-side, so it works with no service account. */
const jw = code('jd-workspace.html');
ok(/db\.collection\('projects'\)\.doc\(r\.id\)\.update\(patch\)/.test(jw),
   'the send is a direct project write, not an API call');
ok(/'jd\.offeredAt'/.test(jw), 'and it stamps what the other side now reads');

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
