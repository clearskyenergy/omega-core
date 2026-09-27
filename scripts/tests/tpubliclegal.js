/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
var root = path.join(__dirname, '../..');
var html = fs.readFileSync(path.join(root, 'terms.html'), 'utf8');
var canonical = fs.readFileSync(path.join(root, 'omega-terms.js'), 'utf8');
var scripts = [], external = [], match, tags = /<script([^>]*)>([\s\S]*?)<\/script>/g;
while ((match = tags.exec(html))) {
  var src = /src="([^"]+)"/.exec(match[1]);
  if (src) external.push(src[1]); else scripts.push(match[2]);
}
assert.deepStrictEqual(external, ['/omega-terms.js'], 'public reading needs only the canonical terms, without auth or a second policy');
assert.strictEqual(JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8')).cleanUrls, true, '/terms is served from terms.html');
assert.ok(/id="terms"/.test(html) && /href="#privacy"/.test(html), 'stable public legal anchors');

function boot(hash, missing) {
  var ids = {}, scrolled = null;
  function element(tag) {
    var node = { tagName: tag, children: [], textContent: '', hidden: false };
    Object.defineProperty(node, 'id', { set: function (id) { ids[id] = node; } });
    Object.defineProperty(node, 'innerHTML', { set: function () { throw new Error('Legal wording must render as text, never HTML'); } });
    node.appendChild = function (child) { node.children.push(child); };
    node.scrollIntoView = function () { scrolled = node; };
    return node;
  }
  ['terms', 'version', 'sections', 'terms-error'].forEach(function (id) { var node = element('div'); node.id = id; });
  ids['terms-error'].hidden = true;
  var context = {
    document: { readyState: 'complete', getElementById: function (id) { return ids[id] || null; }, createElement: element },
    location: { hash: hash },
    setTimeout: function () {},
    fetch: function () { throw new Error('Reading legal terms must not make API calls'); }
  };
  context.window = context;
  vm.createContext(context);
  if (!missing) vm.runInContext(canonical, context, { filename: 'omega-terms.js' });
  scripts.forEach(function (source) { vm.runInContext(source, context, { filename: 'terms.html' }); });
  return { ids: ids, context: context, scrolled: scrolled };
}
['', '#terms', '#privacy'].forEach(function (hash) {
  var page = boot(hash, false), source = page.context.OmegaTerms;
  var rendered = page.ids.sections.children.map(function (section) {
    return section.children.map(function (child) { return child.textContent; });
  });
  assert.deepStrictEqual(rendered, JSON.parse(JSON.stringify(source.sections(''))), 'every published paragraph equals the canonical version for ' + hash);
  assert.strictEqual(page.ids.version.textContent, 'ClearSky-OMEGA · Version ' + source.VERSION);
  assert.strictEqual(page.ids['terms-error'].hidden, true);
  assert.ok(page.ids.privacy.children[0].textContent.indexOf('4b.') === 0, 'privacy link targets the existing privacy policy section');
  assert.strictEqual(page.scrolled, hash === '#privacy' ? page.ids.privacy : null, 'direct privacy links scroll after rendering');
});
var failure = boot('', true);
assert.strictEqual(failure.ids['terms-error'].hidden, false, 'script failure is visible instead of showing empty terms');
console.log('public legal page: canonical wording/version, anonymous access, privacy anchor and load failure pass');
