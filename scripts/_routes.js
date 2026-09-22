/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * scripts/_routes.js — does this root-absolute URL resolve to a file?
 *
 * A ROOT-ABSOLUTE PATH IS NOT ALWAYS A FILE PATH. vercel.json rewrites /osa
 * to /tenants/osa and /skyfund-sandbox to /portals/skyfund-sandbox, so both
 * are correct references to files that live in this repo — just not there.
 * Two checks needed this and each had its own answer: check-html-scripts.js
 * reported every rewritten script as a 404 and tnav.js reported every
 * rewritten nav link as a dead end. One of them being fixed alone is how the
 * next person concludes the other is fine.
 *
 * One implementation, used by both.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

let REWRITES = null;
function rewrites() {
  if (REWRITES) return REWRITES;
  REWRITES = [];
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    (cfg.rewrites || []).forEach(r => {
      /* Only plain prefix rewrites. A :param or a regex source would need the
         router's own matcher, and guessing at one turns these checks into a
         source of false passes — the opposite of the problem they exist for.
         A `has`/`missing` condition is host- or header-dependent and cannot
         be decided from the filesystem either. */
      if (typeof r.source === 'string' && typeof r.destination === 'string'
          && !/[:*(){}[\]]/.test(r.source) && !/[:*(){}[\]]/.test(r.destination)
          && !r.has && !r.missing) {
        REWRITES.push([r.source.replace(/\/$/, ''), r.destination.replace(/\/$/, '')]);
      }
    });
    /* Longest source first: /osa/portfolio must win over /osa. */
    REWRITES.sort((a, b) => b[0].length - a[0].length);
  } catch (e) { REWRITES = []; }
  return REWRITES;
}

/* A path with no extension may be a directory served as index.html, which is
   how every one of these rewrites actually resolves. */
function fileExists(rel) {
  const p = path.join(ROOT, rel.replace(/^\//, ''));
  if (fs.existsSync(p) && fs.statSync(p).isFile()) return true;
  if (fs.existsSync(path.join(p, 'index.html'))) return true;
  /* A Vercel serverless function: /api/name is api/name.js, and a rewrite may
     name one (/comed-proxy -> /api/comed-proxy). */
  if (/^\/?api\//.test(rel) && fs.existsSync(p + '.js')) return true;
  return fs.existsSync(p + '.html');
}

function resolvesToFile(url) {
  if (!url || !url.startsWith('/')) return false;
  const clean = url.split(/[?#]/)[0];
  if (fileExists(clean)) return true;
  return rewrites().some(([from, to]) => {
    if (clean !== from && clean.indexOf(from + '/') !== 0) return false;
    return fileExists(to + clean.slice(from.length));
  });
}

module.exports = { ROOT, rewrites, fileExists, resolvesToFile };
