/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The Site Map keeps a local draft, Redo puts trench runs back with the
   legs, a close warns before sign-in, and the status readout does not call
   pixels feet. The draft rules are the module; the editor pins are cut out
   of editor.html so a later edit cannot drop them quietly. */
'use strict';
var fs = require('fs'), path = require('path');
var root = path.join(__dirname, '..', '..');
var editor = fs.readFileSync(path.join(root, 'editor.html'), 'utf8');
var R = require(path.join(root, 'omega-editor-recovery.js'));
var fails = 0;
function ok(c, m) {
  if (c) console.log('  ok  ' + m);
  else { fails++; console.log('  FAIL ' + m); }
}

function grab(name) {
  var needle = 'function ' + name + '(';
  var hits = [];
  for (var k = editor.indexOf(needle); k >= 0; k = editor.indexOf(needle, k + 1)) hits.push(k);
  if (hits.length !== 1) throw new Error(name + ' appears ' + hits.length + ' times');
  var i = editor.indexOf('{', hits[0]), d = 0;
  for (;;) {
    if (editor[i] === '{') d++;
    else if (editor[i] === '}') { d--; if (!d) break; }
    i++;
  }
  return editor.slice(hits[0], i + 1);
}

console.log('\nlocal draft');
{
  var mem = {};
  var store = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; }
  };
  var state = {
    elements: [{ id: 'a', x: 10, y: 20, label: 'BESS' }],
    conduits: [{ id: 'c', pts: [{ x: 0, y: 0 }, { x: 30, y: 0 }] }],
    shapes: [{ id: 's', tables: [{ x: 1 }, { x: 2 }], pts: [{ x: 0, y: 0 }] }],
    _trench: { ax: 1, ay: 2, bx: 3, by: 4 },
    _trenches: [{ id: 'r', pts: [{ x: 0, y: 0 }, { x: 8, y: 0 }] }],
    pxPerFt: 6, unitLabel: 'ft', bessList: [{ id: 'b' }]
  };
  var wrote = R.write(store, state, { projectId: '', name: 'Maple', address: '1 Main', at: 1000 });
  ok(wrote.ok && wrote.draft.projectId === '__new__', 'an unsaved drawing is keyed as a new draft');
  ok(wrote.draft.shapes[0].tables == null && wrote.draft.shapes[0]._tablesShed === true, 'PV table geometry is shed, the array stays');
  ok(state.shapes[0].tables.length === 2, 'shedding does not mutate the live shape');
  ok(R.counts(wrote.draft) === 5, 'elements, conduits, the shape and both trench kinds count');

  var loaded = R.read(store, null);
  ok(loaded && loaded.elements[0].id === 'a' && loaded.trenches[0].id === 'r', 'the draft reads back for the same unsaved sheet');
  ok(R.offer(loaded, { projectId: '', now: 2000 }).offer === true, 'no server copy: the draft is offered');
  ok(R.offer(loaded, { projectId: 'other.com', now: 2000 }).reason === 'other-project', 'a draft from another project is refused');
  ok(R.offer(loaded, { projectId: '', loadedUpdatedAt: 5000, now: 6000 }).reason === 'server-newer', 'a server save newer than the draft is kept');
  ok(R.offer(Object.assign({}, loaded, { at: 5000 }), { projectId: '', loadedUpdatedAt: 1000, now: 8000 }).offer === true, 'a draft newer than the loaded save is offered');
  ok(R.offer(loaded, { projectId: '', now: 1000 + R.MAX_AGE_MS + 5 }).reason === 'stale', 'a draft older than two weeks is not offered');
  ok(R.offer({ v: 1, projectId: '__new__', at: 1000, elements: [] }, { projectId: '', now: 2000 }).reason === 'empty', 'an empty draft is not offered');

  var S = { elements: [], conduits: [], shapes: [], _trenches: [{ id: 'old' }], bessList: [] };
  ok(R.applyTo(S, loaded) === true, 'apply accepts the draft');
  ok(S.elements[0].id === 'a' && S._trenches[0].id === 'r' && S._trench.bx === 3, 'elements, runs and the spine are restored');
  S.elements[0].x = 99;
  ok(loaded.elements[0].x === 10, 'the restored drawing is not an alias of the draft');
  ok(R.sameDrawing(loaded, R.pack(S, { projectId: '', at: 1000 }).draft) === false, 'a moved element is a different drawing');
  S.elements[0].x = 10;
  ok(R.sameDrawing(loaded, R.pack(S, { projectId: '', at: 1 }).draft) === true, 'an identical sheet is recognised');

  R.forget(store, '');
  ok(R.read(store, '') == null, 'a successful save forgets the draft');

  var huge = { elements: [{ id: 'h', blob: new Array(MAX_PAD()).join('x') }], conduits: [], shapes: [], _trenches: [] };
  function MAX_PAD() { return R.MAX_BYTES + 5000; }
  var tooBig = R.write(store, huge, { projectId: 'acme.com', at: 50 });
  ok(tooBig.ok === false && tooBig.reason === 'size', 'a drawing over the local cap is refused, not truncated into a lie');
  ok(R.read(store, 'acme.com') == null, 'a refused write leaves no partial draft');
}

console.log('\nsnap refuses a non-finite point');
{
  global.window = global;
  global.SNAP = true;
  global.SNAP_FT = 5;
  global._derScale = function () { return 10; };
  eval(grab('_derSnapPt') + '\nglobal._derSnapPt=_derSnapPt;');
  var bad = { x: NaN, y: 12 };
  ok(_derSnapPt(bad) === bad, 'NaN is returned untouched');
  ok(_derSnapPt({ x: Infinity, y: 4 }).x === Infinity, 'Infinity is returned untouched');
  var snapped = _derSnapPt({ x: 53, y: 49 });
  ok(snapped.x === 50 && snapped.y === 50, 'a finite point still snaps to the 5 ft grid (' + snapped.x + ',' + snapped.y + ')');
  global.SNAP = false;
  ok(_derSnapPt({ x: 53, y: 49 }).x === 53, 'snap off leaves the point');
}

console.log('\nclose prompt and redo snapshot, from the editor source');
{
  ok(/function _editorUnsavedWork\(\)/.test(editor), 'the close prompt has one predicate');
  ok(/if\(_editorUnsavedWork\(\)\)/.test(editor), 'beforeunload asks that predicate');
  ok(!/if\(\(dirty \|\| saving\) && window\._currentUser && window\._projectId\)/.test(editor), 'the prompt no longer requires a sign-in');
  ok(/var edited = !!\(window\._workDirty && S\.history && S\.history\.length > 1\)/.test(editor), 'a load reseed keeps a dirty flag when the sheet already changed');
  ok(/trenches: clone\(S\._trenches \|\| \[\]\)/.test(editor), 'the redo snapshot carries the drawn trench runs');
  ok(/<script src="\/omega-editor-recovery\.js"><\/script>/.test(editor), 'the editor loads the recovery module');
  ok(/id="sb-unit"/.test(editor) && /unit\.textContent=u/.test(editor), 'the status readout names the unit it just computed');
  ok(fs.existsSync(path.join(root, 'omega-editor-recovery.js')), 'the recovery module is on disk');

  global._workDirty = true;
  global._saveInFlight = false;
  global.S = { elements: [], conduits: [], shapes: [], _trenches: [], history: [{}] };
  eval(grab('_editorUnsavedWork') + '\nglobal._editorUnsavedWork=_editorUnsavedWork;');
  ok(_editorUnsavedWork() === false, 'boot, dirty but empty, does not warn');
  global.S.history.push({});
  ok(_editorUnsavedWork() === true, 'a second history entry warns, signed in or not');
  global.S.history = [{}];
  global.S.elements = [{ id: 'e' }];
  ok(_editorUnsavedWork() === true, 'anything drawn warns');
  global._workDirty = false;
  ok(_editorUnsavedWork() === false, 'a saved sheet does not warn');
  global._saveInFlight = true;
  ok(_editorUnsavedWork() === true, 'a save still in flight warns');
}

console.log(fails ? '\n' + fails + ' FAILED' : '\neditor recovery: all held');
process.exit(fails ? 1 : 0);
