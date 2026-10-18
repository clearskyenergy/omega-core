/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Settings › Features: off by default, a person's choice beats the
   workspace, SOON stays locked, and turning one on puts the button back
   on the tab it came from. */
var fs = require('fs');
var path = require('path');
var assert = require('assert');

var store = {};
global.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; }
};
global.OMEGA_FEATURES_NO_BOOT = true;
var F = require('../../omega-editor-features.js');

var n = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  n++;
}

ok(F.decide(F.FEATURES.filter(function (s) { return s.id === 'rb-optimizer'; })[0], {}, {}) === false, 'off by default');
ok(F.decide({ id: 'rb-optimizer' }, { 'rb-optimizer': true }, { 'rb-optimizer': false }) === true, 'the person wins');
ok(F.decide({ id: 'rb-optimizer' }, { 'rb-optimizer': false }, { 'rb-optimizer': true }) === false, 'a personal off beats the workspace');
ok(F.decide({ id: 'rb-optimizer' }, {}, { 'rb-optimizer': true }) === true, 'the workspace default applies when the person has not chosen');
ok(F.decide({ id: 'rb-screen', locked: true }, { 'rb-screen': true }, { 'rb-screen': true }) === false, 'SOON stays locked');
ok(F.setUser('rb-screen', true) === false && F.isOn('rb-screen') === false, 'a locked toggle does not stick');
ok(F.setUser('prequal', true) === false && F.setUser('decks', true) === false && F.setUser('btn-dtwin', true) === false && F.setUser('bess-config', true) === false, 'every SOON and leaving-soon row is locked');

ok(F.setUser('rb-optimizer', true) === true && F.isOn('rb-optimizer') === true, 'turning Design Optimizer on is remembered');
F._test({ org: { 'rb-optimizer': true }, admin: true });
ok(F.setUser('rb-circuit', false) === true && F.isOn('rb-circuit') === false, 'personal off still wins once a workspace default exists');
F.reset();
ok(F.isOn('rb-optimizer') === true, 'reset drops the personal choice and the workspace default remains');
F._test({ org: {} });
F.reset();
ok(F.isOn('rb-optimizer') === false, 'reset with no workspace default is off');

var html = F.markup('');
ok(html.indexOf('Design Optimizer') > 0, 'the list names Design Optimizer');
ok(html.indexOf('SOON') > 0 && html.indexOf('disabled') > 0, 'SOON rows are disabled');
ok(html.indexOf('HIDDEN AT REQUEST') > 0 && html.indexOf('NEW · UNVERIFIED') > 0, 'reason chips are on the row');
ok(F.markup('optimizer').indexOf('Design Optimizer') > 0 && F.markup('optimizer').indexOf('Viability') < 0, 'search filters the list');
ok(F.markup('zzzz') === '', 'an empty search result draws no groups');
F._test({ admin: false });
ok(F.markup('').indexOf('data-omega-ws') < 0, 'a member does not see the workspace switch');
F._test({ admin: true });
ok(F.markup('optimizer').indexOf('data-omega-ws="rb-optimizer"') > 0, 'an owner or admin can set the workspace default');
ok(F.markup('screen').indexOf('data-omega-ws="rb-screen"') < 0, 'a locked row has no workspace switch');

/* A ribbon small enough to prove a toggle moves the button home. */
function El(tag) {
  this.tag = tag || 'div';
  this.id = '';
  this.className = '';
  this.attrs = {};
  this.children = [];
  this.parentNode = null;
  this.style = {};
  this.hidden = false;
  this.textContent = '';
  var self = this;
  this.classList = {
    add: function (c) {
      var parts = self.className.split(/\s+/).filter(Boolean);
      if (parts.indexOf(c) < 0) parts.push(c);
      self.className = parts.join(' ');
    },
    remove: function (c) {
      self.className = self.className.split(/\s+/).filter(function (x) { return x && x !== c; }).join(' ');
    },
    contains: function (c) { return self.className.split(/\s+/).indexOf(c) >= 0; }
  };
}
El.prototype.setAttribute = function (k, v) {
  if (k === 'id') this.id = v;
  if (k === 'class') this.className = v;
  this.attrs[k] = String(v);
};
El.prototype.getAttribute = function (k) {
  if (k === 'id') return this.id || null;
  if (k === 'class') return this.className || null;
  return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null;
};
El.prototype.removeAttribute = function (k) { delete this.attrs[k]; };
El.prototype.appendChild = function (ch) {
  if (ch.parentNode) ch.parentNode.removeChild(ch);
  ch.parentNode = this;
  this.children.push(ch);
  return ch;
};
El.prototype.removeChild = function (ch) {
  this.children = this.children.filter(function (c) { return c !== ch; });
  ch.parentNode = null;
};
El.prototype.insertBefore = function (ch, before) {
  if (ch.parentNode) ch.parentNode.removeChild(ch);
  ch.parentNode = this;
  var i = this.children.indexOf(before);
  if (i < 0) this.children.push(ch);
  else this.children.splice(i, 0, ch);
  return ch;
};
Object.defineProperty(El.prototype, 'firstChild', { get: function () { return this.children[0] || null; } });
El.prototype.matches = function (sel) { return matchCompound(this, sel); };
El.prototype.closest = function (sel) {
  var n = this;
  while (n) { if (n.matches && n.matches(sel)) return n; n = n.parentNode; }
  return null;
};
El.prototype.querySelector = function (sel) {
  var found = this.querySelectorAll(sel);
  return found.length ? found[0] : null;
};
El.prototype.querySelectorAll = function (sel) {
  var groups = String(sel).split(/\s*,\s*/);
  var all = [], out = [];
  walk(this, all);
  for (var g = 0; g < groups.length; g++) {
    for (var i = 0; i < all.length; i++) {
      if (matchSel(all[i], groups[g]) && out.indexOf(all[i]) < 0) out.push(all[i]);
    }
  }
  return out;
};
function walk(el, out) {
  for (var i = 0; i < el.children.length; i++) { out.push(el.children[i]); walk(el.children[i], out); }
}
function matchCompound(el, compound) {
  var rest = compound, m;
  while (rest) {
    if (rest.charAt(0) === '#') {
      m = rest.match(/^#([A-Za-z0-9_-]+)/);
      if (!m || el.id !== m[1]) return false;
      rest = rest.slice(m[0].length);
    } else if (rest.charAt(0) === '.') {
      m = rest.match(/^\.([A-Za-z0-9_-]+)/);
      if (!m || el.className.split(/\s+/).indexOf(m[1]) < 0) return false;
      rest = rest.slice(m[0].length);
    } else if (rest.charAt(0) === '[') {
      m = rest.match(/^\[([A-Za-z0-9_-]+)="([^"]*)"\]/);
      if (!m || el.getAttribute(m[1]) !== m[2]) return false;
      rest = rest.slice(m[0].length);
    } else {
      m = rest.match(/^([A-Za-z0-9]+)/);
      if (m) {
        if (el.tag !== m[1]) return false;
        rest = rest.slice(m[0].length);
      } else return false;
    }
  }
  return true;
}
function matchSel(el, sel) {
  var parts = sel.trim().split(/\s+/);
  var last = parts[parts.length - 1];
  if (!matchCompound(el, last)) return false;
  var node = el.parentNode, p;
  for (p = parts.length - 2; p >= 0; p--) {
    var found = false;
    while (node) {
      if (node.matches && node.matches(parts[p])) { found = true; node = node.parentNode; break; }
      node = node.parentNode;
    }
    if (!found) return false;
  }
  return true;
}
function byId(root, id) {
  if (root.id === id) return root;
  for (var i = 0; i < root.children.length; i++) {
    var hit = byId(root.children[i], id);
    if (hit) return hit;
  }
  return null;
}

var doc = new El('html');
doc.tag = 'html';
var ribbon = new El('div'); ribbon.id = 'ribbon';
var page = new El('div'); page.className = 'ribbon-page'; page.setAttribute('data-page', 'analyze');
var panel = new El('div'); panel.className = 'rpanel'; panel.setAttribute('data-omega-slot', 'screen');
var body = new El('div'); body.className = 'rpanel-body';
var cap = new El('div'); cap.className = 'rpanel-cap'; cap.textContent = 'Screen';
var btn = new El('button'); btn.id = 'rb-optimizer'; btn.className = 'rbtn';
body.appendChild(btn); panel.appendChild(body); panel.appendChild(cap); page.appendChild(panel); ribbon.appendChild(page); doc.appendChild(ribbon);
doc.getElementById = function (id) { return byId(doc, id); };
doc.createElement = function (tag) { return new El(tag); };
global.document = doc;

F.layout();
ok(btn.classList.contains('omega-gated-hidden') && btn.hidden === true, 'an unverified tool is hidden until it is turned on');
ok(F.setUser('rb-optimizer', true) === true, 'the toggle accepts Design Optimizer');
ok(!btn.classList.contains('omega-gated-hidden') && btn.hidden === false, 'turning it on shows the button');
var homeCap = btn.closest('.rpanel').querySelector('.rpanel-cap');
ok(homeCap && homeCap.textContent === 'Engineering', 'it returns to Analyze › Engineering');
ok(page.getAttribute('data-page') === 'analyze', 'that panel is on Analyze');
F.setUser('rb-optimizer', false);
ok(btn.classList.contains('omega-gated-hidden') && btn.hidden === true, 'turning it off hides it again');
ok(F.isOn('rb-optimizer') === false, 'the off choice survives a fresh read of the saved map');
F.setUser('rb-optimizer', true);
ok(JSON.parse(store['omega.features.user'])['rb-optimizer'] === true, 'the choice is stored per user');

var ed = fs.readFileSync(path.join(__dirname, '../../editor.html'), 'utf8');
['screen', 'grid', 'load', 'energy', 'value', 'decide', 'show', 'terrain', 'display', 'panels', 'sheets', 'review', 'ownership', 'takeoff'].forEach(function (slot) {
  ok(ed.indexOf('data-omega-slot="' + slot + '"') > 0, 'slot ' + slot);
});
ok(ed.indexOf('src="/omega-editor-features.js"') > 0, 'the features script is loaded');
ok(ed.indexOf('id="rb-features"') > 0, 'Settings has a Features button');
ok(ed.indexOf('openViabilityWorkflow') > 0 && ed.indexOf('data-omega-feature="viability"') > 0, 'Viability stays in the file, off until asked');
ok(ed.indexOf("b2.id = 'rb-omega-mode'") < 0, 'the ribbon no longer creates a second Designer switch');
ok(ed.indexOf("c.id = 'rb-compute-site-setup'") < 0, 'Compute no longer clones Site Setup');
ok(ed.indexOf('id="omega-merged-park"') > 0, 'duplicates are parked, not deleted');
ok(/<button class="rbtn" id="rb-parcels"[^>]*>[\s\S]*?Parcel<br>Lines/.test(ed), 'Parcel Lines stays on View');
var viewRibbon = ed.slice(ed.indexOf('ribbon-page" data-page="view"'), ed.indexOf('ribbon-page" data-page="output"'));
var estimateRibbon = ed.slice(ed.indexOf('ribbon-page" data-page="estimate"'), ed.indexOf('ribbon-page" data-page="finance"'));
ok(viewRibbon.indexOf('id="rb-site"') > 0 && /Live<br>takeoff/.test(viewRibbon), 'Live takeoff stays on View, which every plan opens');
ok(estimateRibbon.indexOf('id="rb-site"') < 0, 'Live takeoff is not left on Estimate');
ok(ed.indexOf('rpanel-cap">Reports<') > 0, 'Output keeps the Reports caption the grafts look for');

console.log('teditorfeatures: ' + n + ' checks');
