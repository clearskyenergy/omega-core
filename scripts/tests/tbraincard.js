/* THE DOT IS THE DOOR.

   Clicking a node in the brain graph used to focus it and fill a 210px side
   panel; the detail lived behind a double-click, in a drawer of its own, and
   only ever for a person. It now opens the SAME card the People list opens,
   for a person or for a project, and the drawer is gone — two panels
   answering one question is two answers that drift apart.

   What is worth testing here is not the DOM. It is the honesty rules, which
   are the ones a refactor silently breaks:

     - a deal with no capex recorded is not a deal worth $0;
     - a person the roster has never heard of must not be described as being
       on the roster;
     - a node type with no card must return nothing rather than an empty one.

   The subject builders are pure enough to run outside a browser: they read a
   node and return a plain object. So they are pulled out of mission.html by
   name and executed, which also means this test fails if they are renamed or
   deleted rather than passing against a copy that no longer ships. */
const fs = require('fs');
const path = require('path');

let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }
const root = p => path.join(__dirname, '..', '..', p);
const html = fs.readFileSync(root('mission.html'), 'utf8');

/* Pull one top-level `function name(...){...}` out of the page by brace
   counting. Naive on strings containing braces, which none of these have. */
function grab(name) {
  let start = html.indexOf('\nfunction ' + name + '(');
  if (start < 0) start = html.indexOf('\nasync function ' + name + '(');
  if (start < 0) throw new Error('mission.html no longer defines ' + name + '()');
  let i = html.indexOf('{', start), depth = 0;
  for (let j = i; j < html.length; j++) {
    if (html[j] === '{') depth++;
    else if (html[j] === '}') { depth--; if (depth === 0) return html.slice(start + 1, j + 1); }
  }
  throw new Error('unbalanced braces in ' + name + '()');
}

/* Just enough page to run them. Nothing here is a stand-in for behaviour the
   test then asserts — these are the globals the builders read, and the two
   callbacks they only ever store. */
const sandbox = {
  usd: n => '$' + Number(n || 0).toLocaleString('en-US'),
  closeCard: () => {}, submit: () => {}, bpoke: () => {}, binspect: () => {},
  bcenter: () => {}, bopen: () => {}, bsel: null, bpath: null,
  lastStatus: { todos: [] },
  BG: null, BGX: null
};
const src = ['bpersonSubject', 'bdealSubject', 'bnodeSubject', 'relFor'].map(grab).join('\n');
const make = new Function('env', 'with(env){' + src + '; return {bpersonSubject,bdealSubject,bnodeSubject,relFor};}');
const S = make(sandbox);

const rowOf = (subj, label) => (subj.rows.find(r => r.label === label) || {}).value;

console.log('tbraincard: which dots have a card at all');
const plain = (type, meta) => ({ id: type + ':x', label: 'X', type, meta: meta || {}, deg: 2 });
ok(S.bnodeSubject(plain('person')) !== null, 'a person has a card');
ok(S.bnodeSubject(plain('deal')) !== null, 'a deal has a card');
['org', 'client', 'tool', 'area', 'today', 'state'].forEach(t =>
  ok(S.bnodeSubject(plain(t)) === null, 'a ' + t + ' node has none — the inspector carries it'));
ok(S.bnodeSubject(null) === null, 'no node, no subject');

console.log('tbraincard: a project, with the record half empty');
sandbox.BG = null;
const bare = { id: 'deal:1', label: 'Roberts Road', type: 'deal', deg: 1,
               meta: { id: '1', name: 'Roberts Road', stage: 'unknown', mw: 0, mwh: 0, capex: 0, state: null, orgId: null } };
const b = S.bdealSubject(bare);
ok(b.kind === 'project', 'it is a project subject, not a person one');
ok(rowOf(b, 'CAPEX') === 'not recorded', 'no capex on the record reads "not recorded", NOT $0');
ok(rowOf(b, 'CAPACITY') === 'not recorded', 'no MW and no MWh reads "not recorded", not "0 MW"');
ok(rowOf(b, 'STAGE') === 'not set', 'an unset stage becomes a row, because nobody having set one is worth reading');
ok(b.rows.every(r => r.label !== 'STATE'), 'a null state is left out rather than printed as null');
ok(/0 of 5 fields/.test(b.provenance), 'the footnote counts what is actually filled in');
ok(!b.sections.length, 'nothing is invented to fill the card out');

console.log('tbraincard: a project with real numbers');
sandbox.BG = null;
const full = { id: 'deal:2', label: 'Ratan', type: 'deal', deg: 3,
               meta: { id: '2', name: 'Ratan', stage: 'diligence', mw: 5.6, mwh: 12, capex: 4200000, state: 'PA', orgId: 'cleancellusa.com' } };
const f = S.bdealSubject(full);
ok(rowOf(f, 'CAPEX') === '$4,200,000', 'capex is money, formatted as money');
ok(rowOf(f, 'CAPACITY') === '5.6 MW  ·  12 MWh', 'MW and MWh are both shown when both are on the record');
ok(rowOf(f, 'STATE') === 'PA', 'the state travels');
ok(rowOf(f, 'STAGE') === undefined, 'a stage that IS the subtitle is not repeated as a row');
ok(rowOf(f, 'OWNER') === undefined, 'nor is the owner, which is the card\'s org line');
ok(f.org === 'cleancellusa.com', 'with no graph loaded the owner line falls back to the orgId, not to blank');
ok(f.role === 'diligence', 'the stage is the card\'s subtitle');
ok(/5 of 5 fields/.test(f.provenance), 'a full record says so');

console.log('tbraincard: the owning org, and who is on it');
const orgNode = { id: 'org:cleancellusa.com', label: 'Cleancell USA', type: 'org', meta: {}, deg: 4 };
const her = { id: 'per:a@cleancellusa.com', label: 'Dana Reed', type: 'person',
              meta: { role: 'VP Sales' }, rel: { meetings: 3 }, deg: 2 };
const him = { id: 'per:b@cleancellusa.com', label: 'Sam Voss', type: 'person', meta: {}, deg: 1 };
sandbox.BG = { byId: { 'org:cleancellusa.com': orgNode },
               links: [{ a: her, b: orgNode, kind: 'works at' },
                       { a: orgNode, b: him, kind: 'works at' },
                       { a: full, b: orgNode, kind: 'owned by' }] };
const g = S.bdealSubject(full);
ok(g.org === 'Cleancell USA', 'the owner is named once the graph knows the org');
const people = g.sections.find(s => /PEOPLE AT/.test(s.title));
ok(!!people, 'the card lists who is at the owning org');
ok(people.items.length === 2, 'both sides of the edge count — a→org and org→b');
ok(people.items.every(i => typeof i.go === 'function'), 'each one opens their own card');
ok(/VP Sales/.test(people.items[0].meta) && /met 3×/.test(people.items[0].meta),
   'a person with a role and a meeting record shows both');
ok(people.items[1].meta === '', 'a person with neither shows neither, rather than a placeholder');
ok(!g.sections.some(s => s.title === 'PEOPLE AT CLEANCELL USA' && s.items.some(i => i.text === 'Ratan')),
   'the deal does not list itself as a person at its own org');

console.log('tbraincard: a task that merely mentions the project');
sandbox.lastStatus = { todos: [{ title: 'Chase Ratan interconnection' }, { title: 'Unrelated' }] };
const t = S.bdealSubject(full);
const mentions = t.sections.find(s => s.title === 'TASKS THAT MENTION IT');
ok(!!mentions && mentions.items.length === 1, 'the matching task is found and the other is not');
ok(/mention, not a link/.test(mentions.note), 'a contains-match is labelled as a mention, not as a recorded link');
sandbox.lastStatus = { todos: [] };

console.log('tbraincard: a person off the roster versus one off the meeting record');
const roster = { id: 'per:t@x.com', label: 'Tim Warren', type: 'person', deg: 3,
                 meta: { role: 'Principal', org: 'OGI Solar', email: 't@x.com', phone: '555' } };
const r1 = S.bpersonSubject(roster);
ok(r1.email === 't@x.com' && r1.phone === '555', 'the card can still mail and call them');
ok(rowOf(r1, 'CONNECTIONS') === '3', 'the graph\'s own fact — how many edges — comes across');
ok(rowOf(r1, 'ORG') === undefined, 'the org is the header line, not also a row');
ok(/No meeting history/.test(r1.provenance), 'a roster row with no history says the history is missing');
ok(r1.rows.every(x => x.label !== 'KNOWN SINCE'), 'no dates are printed when there are none');

const met = { id: 'per:grant', label: 'Grant Scheffer', type: 'person', deg: 5,
              meta: { source: 'meeting history', org: 'SunESol' },
              rel: { meetings: 11, first: '2025-02-03', last: '2026-09-10', org: 'SunESol' } };
const r2 = S.bpersonSubject(met);
ok(/not on your roster/.test(r2.provenance), 'someone found only in meetings is NOT described as being on the roster');
ok(/11 meetings/.test(r2.provenance), 'and the card says where the name actually came from');
ok(rowOf(r2, 'KNOWN SINCE') === '2025-02-03  →  2026-09-10', 'first and last seen travel');
ok(r2.first === 'Grant', 'ASK JARVIS gets a first name to use');
ok(r2.kind === 'person', 'so the card runs the relationship half for them');

console.log('tbraincard: finding a person the roster spells differently');
const TERRY = { type: 'person', label: 'Terry Warren', weight: 50 };
const OTHER = { type: 'person', label: 'Dana Reed', weight: 3 };
sandbox.BGX = null;
ok(S.relFor({ name: 'Terry Warren' }) === null, 'with no graph fetched there is no match to give');
sandbox.BGX = { nodes: [TERRY, OTHER] };
ok(S.relFor({ name: 'Terry Warren' }) === TERRY, 'the exact name still matches');
ok(S.relFor({ name: '  TERRY WARREN ' }) === TERRY, 'case and stray spaces do not defeat it');
/* THE BUG: the roster says "Warren Terry", the meeting record says "Terry
   Warren", and an empty card reads as "nothing outstanding". */
ok(S.relFor({ name: 'Warren Terry' }) === null,
   'WITHOUT a declared alias, a reversed name does NOT match — no sorted-token heuristic');
sandbox.BGX = { nodes: [TERRY, OTHER], aliases: { 'warren terry': 'Terry Warren', 'tj warren': 'Terry Warren' } };
ok(S.relFor({ name: 'Warren Terry' }) === TERRY, 'a DECLARED alias finds him, and his weight of 50 with him');
ok(S.relFor({ name: 'TJ Warren' }) === TERRY, 'so does the other spelling in the map');
ok(S.relFor({ name: 'Dana Reed' }) === OTHER, 'an unaliased person is unaffected');
ok(S.relFor({ name: 'Nobody Here' }) === null, 'a name in neither the record nor the map is still null');
sandbox.BGX = { nodes: [TERRY], aliases: { 'ghost name': 'Someone Not In The Graph' } };
ok(S.relFor({ name: 'Ghost Name' }) === null, 'an alias pointing at a name the graph lacks returns null, not a crash');
sandbox.BGX = null;

console.log('tbraincard: the four things an empty relationship half can mean');
const load = grab('loadRelations');
ok(/bgxTried=true;/.test(load) && load.indexOf('bgxTried=true;') < load.indexOf('try{'),
   'the attempt is recorded BEFORE the fetch, so a failure cannot look like never having asked');
ok(/bgxFailed = !BGX;/.test(load), 'failure is read off the OUTCOME, not off which path threw');
ok(load.indexOf('bgxFailed = !BGX;') > load.indexOf('}catch'),
   '...after the catch, so an answered {ok:false} counts as a failure too');
const paint = grab('showCard');
ok(/!brainOn \|\| bgxFailed/.test(paint), 'a link that is off or has failed says so — it is actionable');
ok(/else if\(!bgxTried\)/.test(paint), 'a fetch still in flight says it is reading, and claims nothing');
ok(/No one by that name in the meeting record/.test(paint), 'and only a completed lookup makes a claim about the person');
ok(paint.indexOf('!brainOn || bgxFailed') < paint.indexOf('else if(!bgxTried)'),
   'the failed branch is tested FIRST — a loading message over a dead link is a slower lie, not a safer one');
ok(/relHost\.textContent='';/.test(paint) && paint.indexOf("relHost.textContent='';") < paint.indexOf('const r=relFor(p)'),
   'the host is cleared before every repaint, so a message cannot outlive the state that wrote it');

console.log('tbraincard: the wiring in the page itself');
ok(/bsel=n; bpath=null; binspect\(n\);[\s\S]{0,600}?bopen\(n\);/.test(html),
   'ONE click on a node opens the card');
ok(/if\(bmoved\) return;/.test(html), '...and a pan that ends on a node does not');
ok(!/profOpen|profClose|pProf/.test(html), 'the old profile drawer is gone, markup, styles and all');
ok(/function bopen\(n\)\{[\s\S]{0,200}?showCard\(s\)/.test(html), 'the graph opens the card, not a copy of it');
ok(html.indexOf('.pNote{') > 0, 'the vault-note reader kept its style when the drawer went');
ok(/function noteReader\(/.test(html) && /noteReader\(r\.note\)/.test(html),
   'and the reader itself moved into the card rather than being dropped');

console.log('tbraincard: the card is still a frame with a scrolling middle');
const showEvent = grab('showEvent');
ok(/scroll\.className='cardScroll'/.test(showEvent), 'the meeting card has a scrolling middle too');
ok(!/\n  card\.appendChild\(h\);/.test(showEvent), '...and its guest list is inside it, not spilling past the frame');
ok(/cardActs/.test(showEvent) && showEvent.lastIndexOf('cardActs') > showEvent.indexOf('cardScroll'),
   'the buttons stay pinned below the scroll');
const showCard = grab('showCard');
ok(/kind!=='person'/.test(showCard), 'the relationship half only ever runs for a person');
ok(/p\.rows \|\| \[\{label:'EMAIL'/.test(showCard), 'a bare person subject still gets the two rows it always had');

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
