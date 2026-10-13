/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Laying out a solar array never runs the fence-and-tie pass.

   Why (Tommy, 2026-10-13: "when i hit generate its doing a compute system
   it should only be doing solar"; "because i have placed a bess its putting
   a whole thing"): the pass that fences every compound, places a master
   controller, trenches feeders back to it and draws the access road (editor
   patch 83) followed applyGroundLayout, and its solar-only guard holds only
   while solar is ALL there is. With a battery or an Omega-Core skid on the
   drawing, Auto Layout's Generate placed the panels and then the whole
   balance of plant. Balance of plant is asked for: Design Site, a guided
   site build, or Fence & Tie. The hook and the gate are cut straight out of
   editor.html. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const SRC = fs.readFileSync(process.env.EDITOR_SRC || path.join(__dirname, '..', '..', 'editor.html'), 'utf8');

function braces(needle, from) {
  const k = SRC.indexOf(needle, from || 0); if (k < 0) throw new Error(needle);
  let i = SRC.indexOf('{', k), d = 0;
  for (;; i++) { if (SRC[i] === '{') d++; else if (SRC[i] === '}') { d--; if (!d) break; } }
  return { text: SRC.slice(k, i + 1), end: i };
}
let all = true;
function chk(l, ok, x = '') { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`); if (!ok) all = false; return ok; }
console.log('tfencepass');

/* the patch's own block, by its title */
const start = SRC.indexOf('OMEGA PATCH 83');
if (start < 0) throw new Error('patch 83');
const later = braces('function later()', start), hook = braces('function hook()', later.end);
chk('the pass is cut from patch 83 (later + hook)', later.text.indexOf("run({ auto: true })") > 0 && hook.text.indexOf('after(') > 0);

/* 1. the hook: a guided site build is followed, the layout applier is not */
{
  const log = [];
  const root = {
    applyGroundLayout(b, l) { log.push('layout'); return { id: 'a1', kind: 'dersolar' }; },
    OmegaSiteBuild: { build() { log.push('build'); return 1; } },
  };
  const ctx = { root, setTimeout(fn) { log.push('scheduled'); return 1; }, clearTimeout() {}, run(o) { log.push('run:' + JSON.stringify(o)); } };
  vm.createContext(ctx);
  vm.runInContext('var pending = null;\n' + later.text + '\n' + hook.text + '\nthis.done = hook();', ctx);
  root.applyGroundLayout([], {});
  chk('placing an array schedules no fence pass', log.join(',') === 'layout' && !root.applyGroundLayout.__fence);
  root.OmegaSiteBuild.build();
  chk('a guided site build still does', log.slice(1).join(',') === 'build,scheduled' && root.OmegaSiteBuild.build.__fence === true);
  chk('one hook, not two', ctx.done === 1);
}

/* 2. the gate in run(): an array beside a battery is not solar-only, which
      is exactly why the hook had to go — the words that promise it stay */
{
  const run = braces('function run(opts)', start).text;
  chk('run() keeps its solar-only guard', /A LONE SOLAR ARRAY IS NOT A CAMPUS/.test(run) && /solarOnly && !asked/.test(run));
  chk('run() is asked for by Design Site or Fence & Tie only', /opts\.from === 'campus'\) \|\| opts\.bop === true/.test(run));
  chk('the hook says why the applier is left alone', /NOT applyGroundLayout/.test(SRC.slice(start, hook.end)));
}

console.log(all ? 'tfencepass: all passed' : 'tfencepass: FAILED');
process.exit(all ? 0 : 1);
