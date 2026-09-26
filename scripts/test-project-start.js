#!/usr/bin/env node
/* Project cards keep the shared creator's scope and tenant contracts.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
var F = require('./_lib/firestore-double'), db = new F.DB(), checks = 0;
var nodes = {}, buttons = [], focused, lastId, alerts = [];
function node(id) {
  var attrs = {}, classes = new Set();
  return { id:id, value:'', className:'', textContent:'', style:{},
    classList:{ add:function (k) { classes.add(k); }, remove:function (k) { classes.delete(k); }, toggle:function (k, on) { if (on) classes.add(k); else classes.delete(k); }, contains:function (k) { return classes.has(k); } },
    getAttribute:function (k) { return attrs[k] || null; }, setAttribute:function (k, v) { attrs[k] = v; },
    focus:function () { focused = this; }, addEventListener:function () {},
    querySelectorAll:function () { return buttons; },
    querySelector:function (q) { if (q === '.np-type.on') return buttons.filter(function (b) { return b.classList.contains('on'); })[0]; if (q === '.np-type') return buttons[0]; return node(q); }
  };
}
['new-proj-modal','omega-np-css','np-types','np-opens','np-name','np-addr','np-client'].forEach(function (id) { nodes[id] = node(id); });
Object.defineProperty(nodes['np-types'], 'innerHTML', { set:function (html) {
  buttons = Array.from(html.matchAll(/data-k="([^"]+)"/g), function (m) { var b = node(m[1]); b.setAttribute('data-k', m[1]); return b; });
} });
var doc = { activeElement:node('opener'), getElementById:function (id) { return nodes[id]; },
  querySelectorAll:function () { return buttons; }, querySelector:function (q) { var m = /data-k="([^"]+)"/.exec(q); return m && buttons.filter(function (b) { return b.id === m[1]; })[0]; } };
var context = { document:doc, setTimeout:function (fn) { fn(); }, alert:function (message) { alerts.push(message); },
  firebase:{ firestore:{ FieldValue:{ serverTimestamp:function () { return 'fixture-time'; } } } } };
context.window = context;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../omega-newproject.js'), 'utf8'), context);
var M = context.OmegaNewProject;
var auth = { currentUser:{ uid:'designer', email:'designer@fixture.example' } };
M.configure({ db:db, auth:auth, orgId:function () { return 'fixture.example'; }, afterCreate:function (id) { lastId = id; } });
function check(c, message) { assert.ok(c, message); checks++; console.log('  ok   ' + message); }
function json(value) { return JSON.stringify(value); }
async function run() {
  var expected = { l2:['l2'], dcfc:['dcfc'], bess:['bess'], solarstorage:['der','bess'], microgrid:['microgrid'], compute:['compute'], building:['building'] };
  check(M.CARDS.length === 7, 'exactly seven project cards');
  for (var key of Object.keys(expected)) {
    M.open(key);
    check(json(M.selected()) === json(expected[key]), key + ' expands to stable site scopes');
    check(focused.id === key, 'selected card receives focus for ' + key);
    nodes['np-name'].value = key + ' fixture'; nodes['np-addr'].value = '1 Test Street';
    M.create(); await new Promise(function (resolve) { setImmediate(resolve); });
    var record = db.data.get('projects/' + lastId);
    check(record.orgId === 'fixture.example' && record.uid === 'designer', key + ' preserves tenant and author');
    check(json(record.siteScopes) === json(expected[key]), key + ' saves every selected scope');
  }
  M.open('bess'); buttons.filter(function (b) { return b.id === 'l2'; })[0].onclick();
  check(json(M.selected()) === json(['bess','l2']) && M.primaryType() === 'bess', 'mixed BESS + L2 keeps legacy primary precedence');
  M.open('solar'); check(json(M.selected()) === json(['der','bess']) && M.primaryType() === 'solar', 'solar starter keeps the historical solar type');
  M.open('sandbox'); var before = db.data.size; M.create();
  check(db.data.size === before && /Pick at least one/.test(alerts.pop()), 'empty selection refuses creation');
  M.open('bess'); auth.currentUser = null; M.create();
  check(db.data.size === before && /signed in/.test(alerts.pop()), 'signed-out user cannot create');
  auth.currentUser = { uid:'designer', email:'designer@fixture.example' };
  M.configure({ orgId:function () { return ''; } }); M.create();
  check(db.data.size === before && /workspace/.test(alerts.pop()), 'missing tenant cannot create');
  ['index.html','projects.html'].forEach(function (file) {
    var html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    check(/src="\/omega-newproject\.js"/.test(html) && /OmegaNewProject\.configure/.test(html), file + ' uses the shared creator');
  });
  console.log('\nall ' + checks + ' project-start checks passed');
}
run().catch(function (e) { console.error(e); process.exitCode = 1; });
