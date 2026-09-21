/* A MARKDOWN LIST IS A LIST OF TASKS, OR IT IS NOTHING.

   The tasks panel in mission.html can now read a whole markdown list — a
   TASKS.md, a notebook page typed up, the bullets at the foot of a meeting
   note — and file each bullet on the twin's backlog through /task, the same
   door the ADD box uses.

   What is worth testing is not the DOM. It is the reading, because every way
   this goes wrong is silent and lands on a real backlog:

     - a heading is context, not work — a list of five headings must not
       become five tasks;
     - a line already ticked in the file is not a new commitment;
     - a bullet that loses its heading becomes "Order intake", filed against
       nothing, on a board where nobody can tell which order;
     - the blockquote at the top of a list describes the list, and the rule
       between sections is a rule.

   parseTaskList() and mdPlain() are pure, so they are pulled out of the page
   by name and executed here — which also means this test fails if they are
   renamed or deleted, rather than passing against a copy that no longer
   ships. Same trick as tbraincard.js. */
const fs = require('fs');
const path = require('path');

let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }
const root = p => path.join(__dirname, '..', '..', p);
const html = fs.readFileSync(root('mission.html'), 'utf8');

function grab(name) {
  let start = html.indexOf('\nfunction ' + name + '(');
  if (start < 0) throw new Error('mission.html no longer defines ' + name + '()');
  let i = html.indexOf('{', start), depth = 0;
  for (let j = i; j < html.length; j++) {
    if (html[j] === '{') depth++;
    else if (html[j] === '}') { depth--; if (depth === 0) return html.slice(start + 1, j + 1); }
  }
  throw new Error('unbalanced braces in ' + name + '()');
}
const src = ['mdPlain', 'parseTaskList'].map(grab).join('\n');
const { parseTaskList, mdPlain } =
  new Function(src + '; return {parseTaskList, mdPlain};')();

/* The shape of a real priority file: a title, a blockquote about the list,
   an urgency section, numbered things being worked on, checklists under
   them, a rule, and a second section of loose bullets. */
const SAMPLE = [
  '# TASKS',
  '',
  '> Priority queue for the twin. Items under **ASAP** run first, in order.',
  '',
  '## ASAP — captured 2026-09-21',
  '',
  '### 1. Fulfillment agent',
  'An agent to run fulfillment end to end.',
  '',
  'Order lifecycle:',
  '- [ ] Order intake',
  '- [x] Order deposit',
  '- [ ] Log every detail per QR code (e.g. `QS-126-14911`)',
  '',
  '### 2. Grid Atlas',
  '- [ ] (scope TBD — carry forward from notebook)',
  '',
  '### 3. Site Finder',
  '- [ ] Enter a zip code → return validated properties *(word unconfirmed)*',
  '- [ ] Read [the spec](https://example.com/spec) first',
  '',
  '---',
  '',
  '## Open questions',
  '- Grid Atlas: what is the actual next action?',
  '',
  '```',
  '- [ ] not a task, this is a code sample',
  '```'
].join('\n');

const rows = parseTaskList(SAMPLE);
const titles = rows.map(r => r.title);

console.log('ttaskimport: what counts as a task');
ok(rows.length === 7, 'seven bullets, not the headings around them (' + rows.length + ')');
ok(!titles.some(t => /^TASKS$/.test(t)), 'the document title is not a task');
ok(!titles.some(t => /Priority queue for the twin/.test(t)),
   'the blockquote describes the list and is not on it');
ok(!titles.some(t => /^-+$/.test(t)), 'the rule between sections is not a task');
ok(!titles.some(t => /code sample/.test(t)), 'a fenced code block is not work');
ok(!titles.some(t => /^An agent to run/.test(t)),
   'a paragraph under a heading is prose, not a bullet');

console.log('ttaskimport: a bullet keeps the heading it was written under');
ok(titles[0] === 'Fulfillment agent — Order intake',
   'the heading is the prefix, numbering stripped: ' + titles[0]);
ok(rows[0].group === 'Fulfillment agent', 'the group is recorded on the row');
ok(rows[0].section === 'ASAP — captured 2026-09-21', 'so is the section it came from');
ok(titles[5] === 'Site Finder — Read the spec first',
   'a link keeps its words and loses its URL: ' + titles[5]);
ok(titles[6] === 'Open questions — Grid Atlas: what is the actual next action?',
   'with no deeper heading the section carries it: ' + titles[6]);

console.log('ttaskimport: already done is not a new commitment');
ok(rows[1].done === true && /Order deposit/.test(rows[1].title), 'an [x] row is marked done');
ok(rows.filter(r => r.done).length === 1, 'and it is the only one');
ok(rows[0].done === false, 'an empty box is not');
ok(rows[0].checkbox === true && rows[6].checkbox === false,
   'a plain bullet is kept, and says it had no box — the preview can treat it differently');

console.log('ttaskimport: urgency comes from a heading the author wrote');
ok(rows.slice(0, 6).every(r => r.urgency === 'today'), 'everything under ASAP is today');
ok(rows[6].urgency === 'queue', 'a section that claims nothing goes to the queue');
ok(parseTaskList('## Someday\n- [ ] a thing')[0].urgency === 'queue',
   'and so does an ordinary heading');

console.log('ttaskimport: the text that survives');
ok(titles[2] === 'Fulfillment agent — Log every detail per QR code (e.g. QS-126-14911)',
   'backticks go, the code inside stays: ' + titles[2]);
ok(titles[4] === 'Site Finder — Enter a zip code → return validated properties (word unconfirmed)',
   'an italic aside is still the note the author left: ' + titles[4]);
ok(titles[3] === 'Grid Atlas — (scope TBD — carry forward from notebook)',
   'a placeholder is filed as written, for him to argue with: ' + titles[3]);
ok(mdPlain('**bold** and *thin* and `code`') === 'bold and thin and code', 'mdPlain, plainly');
ok(mdPlain('a  b\tc') === 'a b c', 'whitespace collapses — a title is one line');

console.log('ttaskimport: the edges');
ok(parseTaskList('').length === 0, 'nothing in, nothing out');
ok(parseTaskList(null).length === 0, 'and null is not a crash');
ok(parseTaskList('- [ ]   \n-\n- ok').length === 1, 'an empty bullet is not a task');
const long = parseTaskList('## Q\n- [ ] ' + 'x'.repeat(400))[0];
ok(long.title.length === 300, 'a title is clamped to 300 like every other /task call');
ok(parseTaskList('1. first\n2) second').length === 2, 'a numbered list is a list');
ok(parseTaskList('  - [ ] indented').length === 1, 'so is an indented one');

console.log(fails ? '\nttaskimport: ' + fails + ' FAILED' : '\nttaskimport: all good');
process.exit(fails ? 1 : 0);
