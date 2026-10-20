/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Fetch, robots check, numeric review, and proposed-snapshot writing
   for the pricing collectors. accepted.json is what the price book
   reads. This module never copies a proposal onto it. */
'use strict';

var fs = require('fs');
var path = require('path');
var https = require('https');
var http = require('http');
var { URL } = require('url');

var ROOT = path.join(__dirname, '../..');
var SNAP_ROOT = path.join(ROOT, 'data/pricing-snapshots');
var UA = 'ClearSkyPricingCollector/2026 (research; weekday data check)';

/* The public data APIs are the interface those agencies publish for
   a program. Their robots.txt is a crawler file and, on these two
   hosts, either disallows the whole host or is the API error page.
   Collectors may call only the documented API path, and they do not
   crawl the agency's website. */
var DOCUMENTED_API = [
  {
    host: 'api.bls.gov',
    prefix: '/publicAPI/',
    note: 'BLS Public Data API. api.bls.gov robots.txt is Disallow: /. This collector does not crawl bls.gov pages. It posts only to the documented timeseries endpoint.'
  },
  {
    host: 'api.eia.gov',
    prefix: '/v2/',
    note: 'EIA Open Data API. The host answers robots.txt with an API-key error. A call is made only when EIA_API_KEY is set.'
  }
];

function readDate(d) {
  var dt = d instanceof Date ? d : new Date();
  return dt.toISOString().slice(0, 10);
}

function documentedApi(target) {
  var u = new URL(target);
  var i;
  for (i = 0; i < DOCUMENTED_API.length; i++) {
    if (u.hostname === DOCUMENTED_API[i].host && u.pathname.indexOf(DOCUMENTED_API[i].prefix) === 0) {
      return DOCUMENTED_API[i].note;
    }
  }
  return null;
}

function fetchBuffer(target, opts) {
  opts = opts || {};
  var timeout = opts.timeout || 45000;
  return new Promise(function (resolve, reject) {
    var u = new URL(target);
    var lib = u.protocol === 'http:' ? http : https;
    var headers = Object.assign({ 'User-Agent': UA, 'Accept': opts.accept || '*/*' }, opts.headers || {});
    var req = lib.request({
      protocol: u.protocol,
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers: headers,
      timeout: timeout
    }, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && !opts.noredirect) {
        res.resume();
        var next = new URL(res.headers.location, target).toString();
        resolve(fetchBuffer(next, Object.assign({}, opts, { noredirect: false })));
        return;
      }
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), url: target });
      });
    });
    req.on('timeout', function () { req.destroy(new Error('timeout ' + target)); });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function looksLikeRobots(text) {
  return /user-agent\s*:/i.test(text) && text.indexOf('<html') < 0 && text.indexOf('<!DOCTYPE') < 0;
}

function pathDisallowed(robotsText, pathname) {
  var lines = robotsText.split(/\r?\n/);
  var star = false;
  var rules = [];
  var i, line, m;
  for (i = 0; i < lines.length; i++) {
    line = lines[i].split('#')[0].trim();
    if (!line) continue;
    if (/^user-agent\s*:/i.test(line)) {
      star = /^\s*user-agent\s*:\s*\*\s*$/i.test(line);
      continue;
    }
    if (!star) continue;
    m = line.match(/^(allow|disallow)\s*:\s*(.*)$/i);
    if (!m) continue;
    rules.push({ allow: m[1].toLowerCase() === 'allow', path: (m[2] || '').trim() });
  }
  var best = null;
  for (i = 0; i < rules.length; i++) {
    if (!rules[i].path) continue;
    if (pathname.indexOf(rules[i].path) !== 0) continue;
    if (!best || rules[i].path.length > best.path.length) best = rules[i];
  }
  return best ? !best.allow : false;
}

function crawlDelay(robotsText) {
  var m = robotsText.match(/crawl-delay\s*:\s*([0-9.]+)/i);
  if (!m) return 0;
  var n = Number(m[1]);
  if (!isFinite(n) || n < 0) return 0;
  return Math.min(n, 5);
}

var robotsCache = {};

function robotsFor(target) {
  var u = new URL(target);
  var origin = u.origin;
  if (robotsCache[origin]) return robotsCache[origin];
  var api = documentedApi(target);
  if (api) {
    robotsCache[origin] = Promise.resolve({ allowed: true, delay: 1, note: api, status: 'api' });
    return robotsCache[origin];
  }
  robotsCache[origin] = fetchBuffer(origin + '/robots.txt', { timeout: 20000, accept: 'text/plain' }).then(function (res) {
    var text = res.body.toString('utf8');
    if (res.status === 404) return { allowed: true, delay: 0, note: 'no robots.txt', status: 404 };
    if (res.status !== 200 || !looksLikeRobots(text)) {
      return { allowed: false, delay: 0, note: 'robots.txt was not readable (HTTP ' + res.status + ')', status: res.status };
    }
    return {
      allowed: !pathDisallowed(text, u.pathname),
      delay: crawlDelay(text),
      note: pathDisallowed(text, u.pathname) ? 'robots.txt disallows ' + u.pathname : 'allowed',
      status: 200
    };
  }).catch(function (err) {
    return { allowed: false, delay: 0, note: 'robots.txt failed: ' + err.message, status: 'error' };
  });
  return robotsCache[origin];
}

function sleep(sec) {
  return new Promise(function (resolve) { setTimeout(resolve, Math.round(sec * 1000)); });
}

function fetchChecked(target, opts) {
  return robotsFor(target).then(function (robots) {
    if (!robots.allowed) {
      return { ok: false, robots: robots, status: null, body: null, url: target };
    }
    return sleep(robots.delay || 0).then(function () {
      return fetchBuffer(target, opts).then(function (res) {
        return { ok: res.status >= 200 && res.status < 300, robots: robots, status: res.status, body: res.body, url: target };
      });
    });
  });
}

function num(v) {
  if (typeof v === 'number') return v;
  if (v == null) return null;
  var n = Number(String(v).replace(/[$,\s]/g, ''));
  return isFinite(n) ? n : null;
}

function review(acceptedMetrics, proposedMetrics, threshold) {
  var flags = [];
  var keys = {};
  var k;
  acceptedMetrics = acceptedMetrics || {};
  proposedMetrics = proposedMetrics || {};
  for (k in acceptedMetrics) if (Object.prototype.hasOwnProperty.call(acceptedMetrics, k)) keys[k] = 1;
  for (k in proposedMetrics) if (Object.prototype.hasOwnProperty.call(proposedMetrics, k)) keys[k] = 1;
  Object.keys(keys).sort().forEach(function (key) {
    var hasA = Object.prototype.hasOwnProperty.call(acceptedMetrics, key) && acceptedMetrics[key] != null;
    var hasB = Object.prototype.hasOwnProperty.call(proposedMetrics, key) && proposedMetrics[key] != null;
    if (hasA && !hasB) {
      flags.push({ key: key, kind: 'dropped', from: acceptedMetrics[key], to: null });
      return;
    }
    if (!hasA && hasB) {
      flags.push({ key: key, kind: 'new', from: null, to: proposedMetrics[key] });
      return;
    }
    if (!hasA && !hasB) return;
    var a = Number(acceptedMetrics[key]);
    var b = Number(proposedMetrics[key]);
    if (!isFinite(a) || !isFinite(b)) return;
    if (a === b) return;
    var rel = a === 0 ? Infinity : Math.abs(b - a) / Math.abs(a);
    if (rel > threshold) {
      flags.push({ key: key, kind: 'moved', from: a, to: b, relative: Math.round(rel * 10000) / 10000 });
    }
  });
  return { threshold: threshold, flags: flags, needsReview: flags.length > 0 };
}

/* A commodity index can move a base dollar only when both the base
   dollar and the index on the base date were read. Otherwise null. */
function escalate(baseDollar, baseIndex, currentIndex) {
  if (!(baseDollar > 0) || !(baseIndex > 0) || !(currentIndex > 0)) return null;
  return Math.round((baseDollar * (currentIndex / baseIndex)) * 100) / 100;
}

function acceptedPath(source) {
  return path.join(SNAP_ROOT, source, 'accepted.json');
}

function readAccepted(source) {
  var p = acceptedPath(source);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeProposed(source, snapshot, reviewResult, dryRun) {
  if (dryRun) return { wrote: false, acceptedUntouched: true };
  var dir = path.join(SNAP_ROOT, source, 'proposed');
  fs.mkdirSync(dir, { recursive: true });
  var file = path.join(dir, (snapshot.read || readDate()) + '.json');
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2) + '\n');
  var reviewFile = path.join(SNAP_ROOT, source, 'review.json');
  fs.writeFileSync(reviewFile, JSON.stringify({
    source: source,
    read: snapshot.read,
    needsReview: !!(reviewResult && reviewResult.needsReview),
    applied: false,
    review: reviewResult || null,
    proposed: path.relative(ROOT, file)
  }, null, 2) + '\n');
  return { wrote: true, acceptedUntouched: true, proposed: file, review: reviewFile };
}

function pdfText(buf, mode) {
  var { spawnSync } = require('child_process');
  var tmp = path.join('/tmp', 'pricing-collector-' + process.pid + '-' + Date.now() + '.pdf');
  var layout = mode === 'layout';
  fs.writeFileSync(tmp, buf);
  var py = [
    'import sys',
    'try:',
    '    import pypdf',
    'except Exception as e:',
    '    sys.stderr.write("pypdf missing")',
    '    sys.exit(3)',
    'r = pypdf.PdfReader(sys.argv[1])',
    'parts = []',
    'layout = sys.argv[2] == "layout"',
    'for p in r.pages:',
    '    if layout:',
    '        parts.append(p.extract_text(extraction_mode="layout") or "")',
    '    else:',
    '        parts.append(p.extract_text() or "")',
    'sys.stdout.write("\\n".join(parts))'
  ].join('\n');
  var out = spawnSync('python3', ['-c', py, tmp, layout ? 'layout' : 'plain'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  try { fs.unlinkSync(tmp); } catch (e) { /* temp */ }
  if (out.status !== 0) {
    return { ok: false, error: (out.stderr || 'pdf extract failed').trim() };
  }
  return { ok: true, text: out.stdout };
}

module.exports = {
  ROOT: ROOT,
  SNAP_ROOT: SNAP_ROOT,
  UA: UA,
  readDate: readDate,
  fetchBuffer: fetchBuffer,
  fetchChecked: fetchChecked,
  robotsFor: robotsFor,
  pathDisallowed: pathDisallowed,
  num: num,
  review: review,
  escalate: escalate,
  readAccepted: readAccepted,
  acceptedPath: acceptedPath,
  writeProposed: writeProposed,
  pdfText: pdfText,
  sleep: sleep
};
