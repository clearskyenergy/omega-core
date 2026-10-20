#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   tsaveguard.js — a drawing is written only by an editor that says who
   saved it (2026-10-15). The editor's transaction and live watch
   (2026-10-14) protect a tab running that code; a tab left open from before
   it shipped has neither and autosaves the old map over the new one while
   it reads "Saved". So the RULES refuse an update that touches the drawing
   without a fresh savedBy { tab: string, at: number }, and every drawing
   write the editor makes carries one. This test cuts both out of the
   source so neither can quietly go. */
'use strict';
var fs = require('fs'), path = require('path');
var root = path.join(__dirname, '..', '..');
var rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
var editor = fs.readFileSync(path.join(root, 'editor.html'), 'utf8');
var fails = 0;
function ok(c, m) { if (c) console.log('  ok  ' + m); else { fails++; console.log('  FAIL ' + m); } }

/* 1. the projects block defines the guard and the update rule asks it */
var pi = rules.indexOf('match /projects/{projectId}');
var block = rules.slice(pi, rules.indexOf('match /project_tasks/', pi));
ok(pi > 0 && block.length > 0, 'projects block found');
ok(/function drawingKeys\(\)/.test(block), 'drawingKeys() defined in the projects block');
['elements', 'shapes', 'docTabs', 'geoShapes', 'geoElements', 'conduits'].forEach(function (k) {
  ok(new RegExp("'" + k + "'").test(block.slice(block.indexOf('function drawingKeys'), block.indexOf('function touchesDrawing'))), 'drawingKeys names ' + k);
});
ok(/function touchesDrawing\(\)[\s\S]*affectedKeys\(\)\.hasAny\(drawingKeys\(\)\.toSet\(\)\)/.test(block), 'touchesDrawing() reads the diff against drawingKeys');
ok(/function savedByCurrentEditor\(\)[\s\S]*savedBy\.get\('tab', 0\) is string[\s\S]*savedBy\.get\('at', ''\) is number[\s\S]*!= resource\.data\.get\('savedBy', \{\}\)/.test(block), 'savedByCurrentEditor() needs a string tab, a numeric at, and a savedBy that changed');
ok(/function drawingWriteAllowed\(\) \{ return !touchesDrawing\(\) \|\| savedByCurrentEditor\(\); \}/.test(block), 'drawingWriteAllowed() = no drawing change, or a current editor');
var upd = block.slice(block.indexOf('allow update:'), block.indexOf('allow delete:'));
ok(/&& drawingWriteAllowed\(\)/.test(upd), 'the projects update rule asks drawingWriteAllowed()');
ok(upd.indexOf('drawingWriteAllowed()') < upd.indexOf('resource.data.orgId == userOrg()'), 'the guard is ANDed before the ownership alternatives, so staff and admins are held to it too');

/* 2. every editor write that carries the drawing carries savedBy */
var writes = [];
var re = /_db\.collection\('projects'\)\.doc\((?:_projectId|pid)\)\.update\((\w+)\)/g, m;
while ((m = re.exec(editor))) writes.push({ at: m.index, name: m[1] });
var txRe = /tx\.update\(_ref, (\w+)\)/g;
while ((m = txRe.exec(editor))) writes.push({ at: m.index, name: m[1], tx: true });
ok(writes.length >= 2, 'found the editor’s named-payload project writes (' + writes.length + ')');
writes.forEach(function (w) {
  /* The transaction save reads back to the start of saveProject itself: a
     fixed window stopped reaching its `const payload = {` once saveProject
     grew past it (2026-10-17), and the test then read "not held" for the
     one write that matters most. */
  var fnAt = w.tx ? editor.lastIndexOf('async function saveProject(', w.at) : -1;
  var back = editor.slice(fnAt >= 0 ? fnAt : Math.max(0, w.at - 9000), w.at);
  var decl = back.lastIndexOf('const ' + w.name + ' = {'); if (decl < 0) decl = back.lastIndexOf('const ' + w.name + '={');
  if (decl < 0) decl = back.lastIndexOf('var ' + w.name + ' = {');
  var body = decl >= 0 ? back.slice(decl) : back;
  var drawing = /\b(elements|shapes|docTabs|conduits):/.test(body);
  if (w.tx) ok(drawing, 'the transaction save (' + w.name + ') is found and carries the drawing');
  if (!drawing) { console.log('  ok  ' + w.name + ' (no drawing keys, not held)'); return; }
  ok(/savedBy: \{ email: [^}]*tab: _tabId\(\)[^}]*at: Date\.now\(\) \}/.test(body), w.name + ' carries savedBy { email, tab, ua, at }' + (w.tx ? ' (the transaction save)' : ''));
});
ok(/function _tabId\(\)\{[^}]*sessionStorage\.getItem\('cs_tab'\)/.test(editor), '_tabId() is per browser tab (sessionStorage)');

console.log(fails ? '\n' + fails + ' FAILED' : '\nsave guard: all held');
process.exit(fails ? 1 : 0);
