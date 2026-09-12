/* editor.html — no invented site evidence.

   A site screen is only worth what its inputs are worth. Four placeholders
   once shipped in the layer wiring and the pre-qualification form, and each
   one produced a confident answer out of nothing:

     - a zoning district ('M-1 (Light Industrial)') asserted for any parcel
     - hosting capacity derived from the project's own size, so every
       project fit its feeder by construction
     - an AHJ name, a permit duration and a queue length for every county
     - zoning and flood treated as CONFIRMED unless explicitly denied

   The last one is the dangerous shape: an unchecked box scored as a pass.
   These are the checks that keep them out. Comments are stripped before
   scanning so that prose describing a pattern is never mistaken for the
   pattern itself. */
const fs = require('fs');
const path = require('path');

let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }

const file = path.join(__dirname, '..', '..', 'editor.html');
const raw = fs.readFileSync(file, 'utf8');

/* Block and line comments go first. Line comments only when the '//' is not
   inside a URL ('https://'), which appears throughout this file. */
const src = raw
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  .replace(/<!--[\s\S]*?-->/g, ' ');

console.log('editor.html — invented site evidence');

ok(!/M-1 \(Light Industrial\)/.test(src),
   'no zoning district is asserted for an unresearched parcel');

ok(!/Sample County AHJ/.test(src),
   'no placeholder AHJ name');

/* The old line read: D.hostingCapacityKW = Math.round(b*1.6), where b was the
   first BESS in the project. Any arithmetic that feeds a bessList figure into
   hostingCapacityKW is the same bug wearing a different constant. */
const capAssign = src.match(/hostingCapacityKW\s*=\s*[^;\n]+/g) || [];
ok(capAssign.length > 0, 'hostingCapacityKW is still assigned somewhere');
ok(capAssign.every(a => !/bessList|\bb\s*\*|\*\s*1\.\d/.test(a)),
   'hosting capacity is never derived from the project size\n       ' +
   capAssign.join('\n       '));

ok(/utilityStatus\s*=\s*'pending'/.test(src),
   "absent hosting-capacity data reports 'pending' rather than a number");

console.log('site pre-qualification — confirmation, never assumption');

ok(/zoningOk\s*=\s*inp\.zoningOk\s*===\s*true/.test(src),
   'zoning counts only when explicitly confirmed');
ok(/floodOk\s*=\s*inp\.floodOk\s*===\s*true/.test(src),
   'flood status counts only when explicitly confirmed');

/* A pre-checked box hands back a confirmation the user never gave. */
const boxes = src.match(/<input type="checkbox" id="pq2-(zoning|flood)"[^>]*>/g) || [];
ok(boxes.length === 2, 'both verification checkboxes are present');
ok(boxes.every(b => !/\bchecked\b/.test(b)),
   'neither verification checkbox ships pre-checked');

/* Screening the wrong system is its own fabrication: a fixed 1 MW / 3.5 MWh
   benchmark made every parcel return the same answer regardless of design. */
ok(/function _pqSyncLiveSystem/.test(src),
   'the screen sizes against the configured system, not a fixed benchmark');

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
