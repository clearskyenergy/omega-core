/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * The photorealistic upgrade fetches only Google's 3D Tiles host, and the
 * key is added here. A tileset uri is rewritten back through this proxy so
 * the browser never sees the key. Redirects are not followed: a Location
 * header can carry the key.
 */
'use strict';

var HOST = 'tile.googleapis.com';

function allowed(url) {
  var u;
  try { u = new URL(String(url)); } catch (e) { return false; }
  if (u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  return u.hostname === HOST;
}

function stripKey(url) {
  var u = new URL(url);
  u.searchParams.delete('key');
  u.username = '';
  u.password = '';
  return u.toString();
}

function proxyOf(url) {
  return '/api/editor-v2-3d-tiles?u=' + encodeURIComponent(stripKey(url));
}

function targetOf(reqUrl) {
  var raw = String(reqUrl || '');
  var q = raw.indexOf('?');
  if (q < 0) return null;
  var parts = raw.slice(q + 1).split('&'), i, pair, name, value, found = null;
  for (i = 0; i < parts.length; i++) {
    pair = parts[i].split('=');
    name = decodeURIComponent(pair[0] || '');
    if (name !== 'u') continue;
    value = decodeURIComponent(pair.slice(1).join('=') || '');
    found = value;
  }
  if (!found || !allowed(found)) return null;
  return stripKey(found);
}

function rewriteValue(value, base) {
  if (typeof value !== 'string' || !value) return value;
  var abs;
  try { abs = new URL(value, base).toString(); } catch (e) { return value; }
  if (!allowed(abs)) return value;
  return proxyOf(abs);
}

function walk(node, base) {
  if (!node || typeof node !== 'object') return;
  var keys = Object.keys(node), i, k;
  for (i = 0; i < keys.length; i++) {
    k = keys[i];
    if ((k === 'uri' || k === 'url') && typeof node[k] === 'string') node[k] = rewriteValue(node[k], base);
    else walk(node[k], base);
  }
}

function rewrite(text, baseUrl, key) {
  var data, out;
  try { data = JSON.parse(text); } catch (e) { data = null; }
  if (data && typeof data === 'object') {
    walk(data, baseUrl);
    out = JSON.stringify(data);
  } else out = String(text || '');
  if (key) out = out.split(String(key)).join('');
  return out;
}

function isRedirect(status) {
  return status >= 300 && status < 400;
}

module.exports = {
  HOST: HOST,
  allowed: allowed,
  stripKey: stripKey,
  proxyOf: proxyOf,
  targetOf: targetOf,
  rewrite: rewrite,
  isRedirect: isRedirect,
  followRedirects: false
};
