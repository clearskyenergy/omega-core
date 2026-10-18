/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/vdr.js — one document package, several virtual data rooms
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The folder plan and the document index are ours. A connector copies that
   plan into a room the financier already uses. Credentials are read from
   the environment at call time and are never written into a result, a log
   line, or this file.

   Implemented, because the request is public:
     google-drive   Drive API v3 files.create + multipart upload
     box            POST /2.0/folders + upload.box.com direct upload
     sharepoint     Microsoft Graph create folder + PUT content

   Catalogued, and refused until a request shape is pinned from the vendor's
   own reference (this file will not guess one):
     datasite, intralinks, ansarada, dealroom

   Nothing here fetches a URL the package points at. A file is uploaded
   only when the caller passes its bytes. Everything else is a row in the
   index. That keeps a document id from becoming a server-side fetch.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var MAX_BYTES = 256 * 1024;

var FOLDERS = [
  '00 Index',
  '01 Site control',
  '02 Interconnection',
  '03 Utility and tariff',
  '04 Incentives',
  '05 Engineering',
  '06 Cost',
  '07 Production and offtake',
  '08 Value stack and returns',
  '09 Permits',
  '10 Other'
];

var SLOT_FOLDER = {
  'site-control': '01 Site control',
  interconnection: '02 Interconnection',
  tariff: '03 Utility and tariff',
  incentives: '04 Incentives',
  bom: '05 Engineering',
  'one-line': '05 Engineering',
  plot: '05 Engineering',
  cost: '06 Cost',
  production: '07 Production and offtake',
  offtake: '07 Production and offtake',
  'value-stack': '08 Value stack and returns',
  returns: '08 Value stack and returns',
  permitting: '09 Permits'
};

/* What a connector would have to call. `implemented` is false where the
   public page does not pin a request this code can send. dealroom.co is a
   company database and is not this product; DealRoom the data room is
   dealroom.net. */
var PROVIDERS = [
  { id: 'google-drive', name: 'Google Drive', implemented: true,
    docs: 'https://developers.google.com/drive/api/reference/rest/v3/files/create',
    env: ['VDR_GOOGLE_ACCESS_TOKEN'] },
  { id: 'box', name: 'Box', implemented: true,
    docs: 'https://developer.box.com/reference/post-folders',
    env: ['VDR_BOX_ACCESS_TOKEN'] },
  { id: 'sharepoint', name: 'SharePoint (Microsoft Graph)', implemented: true,
    docs: 'https://learn.microsoft.com/en-us/graph/api/driveitem-post-children?view=graph-rest-1.0',
    env: ['VDR_GRAPH_ACCESS_TOKEN', 'VDR_GRAPH_DRIVE_ID'] },
  { id: 'datasite', name: 'Datasite', implemented: false,
    docs: 'https://www.datasite.com/en/resources/datasite-apis',
    note: 'Datasite documents an API and a sandbox at developer.datasite.com. The request shapes sit behind that login, so this connector does not call one.' },
  { id: 'intralinks', name: 'Intralinks', implemented: false,
    docs: 'https://support.intralinks.com/hc/en-us/articles/16949786103963-Getting-access-to-Intralinks-APIs-VDRPro-VIA-Pro-FundCentre-Reporting',
    note: 'Intralinks publishes that VDRPro has a REST API and that access is requested. No public request is pinned here.' },
  { id: 'ansarada', name: 'Ansarada', implemented: false,
    docs: 'https://ansarada.dev/',
    note: 'Ansarada publishes a GraphQL endpoint at https://api.ansarada.com/v1/graphql. The mutation fields are not pinned here, so nothing is sent.' },
  { id: 'dealroom', name: 'DealRoom', implemented: false,
    docs: 'https://dealroom.net/',
    note: 'DealRoom (dealroom.net) describes API access for rooms and uploads. No public request reference is pinned here. This is not the dealroom.co company API.' }
];

function text(v) { return v == null ? '' : String(v).replace(/^\s+|\s+$/g, ''); }
function safeName(name) {
  var s = text(name).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ');
  if (!s || s === '.' || s === '..') s = 'document';
  return s.slice(0, 180);
}
function folderFor(slot) { return SLOT_FOLDER[slot] || '10 Other'; }

function indexOf(pkg) {
  var docs = (pkg && pkg.documents) || [];
  return docs.map(function (d, i) {
    var slot = text(d && d.slot) || 'other';
    return {
      n: i + 1,
      slot: slot,
      folder: folderFor(slot),
      name: safeName(d && (d.name || d.id) || ('document-' + (i + 1))),
      id: text(d && d.id) || null,
      asOf: text(d && d.asOf) || null,
      hasBytes: !!(d && (d.text || d.base64))
    };
  });
}

function plan(pkg) {
  var index = indexOf(pkg);
  var root = safeName((pkg && pkg.name) || 'Funding package') + ' — data room';
  return {
    root: root,
    folders: FOLDERS.slice(),
    index: index,
    files: [{ folder: '00 Index', name: 'index.json', text: JSON.stringify({ packageId: text(pkg && pkg.id) || null, generatedAt: null, rows: index }, null, 2) }]
      .concat(index.filter(function (row) { return row.hasBytes; }).map(function (row) {
        var src = (pkg.documents || []).filter(function (d) { return text(d && d.id) === row.id || safeName(d && d.name) === row.name; })[0] || {};
        return { folder: row.folder, name: row.name, text: src.text || null, base64: src.base64 || null, mime: text(src.mime) || 'application/octet-stream' };
      }))
  };
}

function missingEnv(env, keys) {
  env = env || {};
  return keys.filter(function (k) { return !text(env[k]); });
}
function configured(id, env) {
  var p = PROVIDERS.filter(function (x) { return x.id === id; })[0];
  if (!p) return { ok: false, missing: [], reason: 'Unknown data room.' };
  if (!p.implemented) return { ok: false, missing: [], reason: p.note };
  var miss = missingEnv(env, p.env);
  return { ok: miss.length === 0, missing: miss, reason: miss.length ? ('Set ' + miss.join(', ') + ' on the deployment. They are not stored in the repo.') : '' };
}

function bytesOf(file) {
  if (file.text != null) return Buffer.from(String(file.text), 'utf8');
  if (file.base64) {
    var clean = String(file.base64).replace(/\s/g, '');
    if (!/^[A-Za-z0-9+/=]+$/.test(clean)) { var e = new Error('A document is not valid base64.'); e.status = 400; throw e; }
    return Buffer.from(clean, 'base64');
  }
  return null;
}

function scrub(value, secrets) {
  var raw = JSON.stringify(value);
  (secrets || []).forEach(function (s) {
    if (s && raw.indexOf(s) >= 0) raw = raw.split(s).join('[redacted]');
  });
  return JSON.parse(raw);
}

function httpError(status, msg) { var e = new Error(msg); e.status = status; return e; }

async function call(fetchImpl, url, opts, token) {
  var res = await fetchImpl(url, opts);
  var bodyText = '';
  try { bodyText = await res.text(); } catch (e) { bodyText = ''; }
  if (token && bodyText.indexOf(token) >= 0) bodyText = bodyText.split(token).join('[redacted]');
  if (res.status >= 400) {
    throw httpError(res.status, 'The data room refused the request (' + res.status + '). ' + bodyText.slice(0, 240));
  }
  if (!bodyText) return {};
  try { return JSON.parse(bodyText); } catch (e2) { return { raw: bodyText.slice(0, 240) }; }
}

function authHead(token, extra) {
  var h = { Authorization: 'Bearer ' + token };
  if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
  return h;
}

async function driveSync(planObj, env, fetchImpl, existing) {
  var token = text(env.VDR_GOOGLE_ACCESS_TOKEN);
  var parent = text(env.VDR_GOOGLE_PARENT_ID);
  existing = existing || { folders: {} };
  var secrets = [token];
  async function createFolder(name, parents) {
    var body = { name: name, mimeType: 'application/vnd.google-apps.folder' };
    if (parents && parents.length) body.parents = parents;
    var created = await call(fetchImpl, 'https://www.googleapis.com/drive/v3/files', {
      method: 'POST', headers: authHead(token, { 'Content-Type': 'application/json' }), body: JSON.stringify(body)
    }, token);
    if (!created.id) throw httpError(502, 'Google Drive did not return a folder id.');
    return created.id;
  }
  var rootId = existing.folders[planObj.root] || await createFolder(planObj.root, parent ? [parent] : null);
  var folders = {};
  folders[planObj.root] = rootId;
  for (var i = 0; i < planObj.folders.length; i++) {
    var name = planObj.folders[i];
    var key = planObj.root + '/' + name;
    folders[key] = existing.folders[key] || await createFolder(name, [rootId]);
  }
  var files = [];
  for (var f = 0; f < planObj.files.length; f++) {
    var file = planObj.files[f];
    var data = bytesOf(file);
    if (!data) { files.push({ folder: file.folder, name: file.name, status: 'indexed' }); continue; }
    if (data.length > MAX_BYTES) throw httpError(413, file.name + ' is over 256 KB. This connector uploads the index and small files; a larger file stays listed and is not sent.');
    var boundary = 'omega_vdr_' + f;
    var meta = { name: file.name, parents: [folders[planObj.root + '/' + file.folder]] };
    var mime = file.mime || 'application/octet-stream';
    var body = Buffer.concat([
      Buffer.from('--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) + '\r\n--' + boundary + '\r\nContent-Type: ' + mime + '\r\n\r\n', 'utf8'),
      data,
      Buffer.from('\r\n--' + boundary + '--', 'utf8')
    ]);
    var up = await call(fetchImpl, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST', headers: authHead(token, { 'Content-Type': 'multipart/related; boundary=' + boundary }), body: body
    }, token);
    files.push({ folder: file.folder, name: file.name, id: up.id || null, status: 'uploaded' });
  }
  return scrub({ provider: 'google-drive', rootId: rootId, folders: folders, files: files, index: planObj.index }, secrets);
}

async function boxSync(planObj, env, fetchImpl, existing) {
  var token = text(env.VDR_BOX_ACCESS_TOKEN);
  var parent0 = text(env.VDR_BOX_PARENT_ID) || '0';
  existing = existing || { folders: {} };
  var secrets = [token];
  async function createFolder(name, parentId) {
    var created = await call(fetchImpl, 'https://api.box.com/2.0/folders', {
      method: 'POST', headers: authHead(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name: name, parent: { id: parentId } })
    }, token);
    if (!created.id) throw httpError(502, 'Box did not return a folder id.');
    return String(created.id);
  }
  var rootId = existing.folders[planObj.root] || await createFolder(planObj.root, parent0);
  var folders = {};
  folders[planObj.root] = rootId;
  for (var i = 0; i < planObj.folders.length; i++) {
    var name = planObj.folders[i];
    var key = planObj.root + '/' + name;
    folders[key] = existing.folders[key] || await createFolder(name, rootId);
  }
  var files = [];
  for (var f = 0; f < planObj.files.length; f++) {
    var file = planObj.files[f];
    var data = bytesOf(file);
    if (!data) { files.push({ folder: file.folder, name: file.name, status: 'indexed' }); continue; }
    if (data.length > MAX_BYTES) throw httpError(413, file.name + ' is over 256 KB for the Box direct upload this connector uses (Box\'s own direct-upload cap is 50 MB; this preview stays at 256 KB).');
    var boundary = 'omega_box_' + f;
    var attributes = JSON.stringify({ name: file.name, parent: { id: folders[planObj.root + '/' + file.folder] } });
    var body = Buffer.concat([
      Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="attributes"\r\n\r\n' + attributes + '\r\n--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="' + file.name.replace(/"/g, '') + '"\r\nContent-Type: ' + (file.mime || 'application/octet-stream') + '\r\n\r\n', 'utf8'),
      data,
      Buffer.from('\r\n--' + boundary + '--', 'utf8')
    ]);
    var up = await call(fetchImpl, 'https://upload.box.com/api/2.0/files/content', {
      method: 'POST', headers: authHead(token, { 'Content-Type': 'multipart/form-data; boundary=' + boundary }), body: body
    }, token);
    var id = up.id || (up.entries && up.entries[0] && up.entries[0].id) || null;
    files.push({ folder: file.folder, name: file.name, id: id, status: 'uploaded' });
  }
  return scrub({ provider: 'box', rootId: rootId, folders: folders, files: files, index: planObj.index }, secrets);
}

async function graphSync(planObj, env, fetchImpl, existing) {
  var token = text(env.VDR_GRAPH_ACCESS_TOKEN);
  var drive = text(env.VDR_GRAPH_DRIVE_ID);
  existing = existing || { folders: {} };
  var secrets = [token];
  var base = 'https://graph.microsoft.com/v1.0/drives/' + encodeURIComponent(drive);
  async function createFolder(name, parentPath) {
    var url = parentPath === 'root'
      ? base + '/root/children'
      : base + '/items/' + encodeURIComponent(parentPath) + '/children';
    var created = await call(fetchImpl, url, {
      method: 'POST', headers: authHead(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name: name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' })
    }, token);
    if (!created.id) throw httpError(502, 'Microsoft Graph did not return a folder id.');
    return created.id;
  }
  var rootId = existing.folders[planObj.root] || await createFolder(planObj.root, 'root');
  var folders = {};
  folders[planObj.root] = rootId;
  for (var i = 0; i < planObj.folders.length; i++) {
    var name = planObj.folders[i];
    var key = planObj.root + '/' + name;
    folders[key] = existing.folders[key] || await createFolder(name, rootId);
  }
  var files = [];
  for (var f = 0; f < planObj.files.length; f++) {
    var file = planObj.files[f];
    var data = bytesOf(file);
    if (!data) { files.push({ folder: file.folder, name: file.name, status: 'indexed' }); continue; }
    if (data.length > MAX_BYTES) throw httpError(413, file.name + ' is over 256 KB. Graph\'s simple upload allows more; this preview stays at 256 KB.');
    var parent = folders[planObj.root + '/' + file.folder];
    var url = base + '/items/' + encodeURIComponent(parent) + ':/' + encodeURIComponent(file.name) + ':/content';
    var up = await call(fetchImpl, url, {
      method: 'PUT', headers: authHead(token, { 'Content-Type': file.mime || 'application/octet-stream' }), body: data
    }, token);
    files.push({ folder: file.folder, name: file.name, id: up.id || null, status: 'uploaded' });
  }
  return scrub({ provider: 'sharepoint', rootId: rootId, folders: folders, files: files, index: planObj.index }, secrets);
}

var SYNC = { 'google-drive': driveSync, box: boxSync, sharepoint: graphSync };

async function sync(id, pkg, env, deps) {
  deps = deps || {};
  var fetchImpl = deps.fetch;
  var gate = configured(id, env);
  if (!gate.ok) throw httpError(409, gate.reason || 'This data room is not connected.');
  if (typeof fetchImpl !== 'function') throw httpError(500, 'No HTTP client was provided to the data-room connector.');
  var built = plan(pkg);
  built.files[0].text = JSON.stringify({ packageId: text(pkg && pkg.id) || null, generatedAt: new Date().toISOString(), rows: built.index }, null, 2);
  return SYNC[id](built, env, fetchImpl, deps.existing || null);
}

function catalog(env) {
  return PROVIDERS.map(function (p) {
    var gate = configured(p.id, env);
    return { id: p.id, name: p.name, implemented: p.implemented, docs: p.docs, configured: gate.ok, missing: gate.missing, note: p.note || null };
  });
}

module.exports = {
  FOLDERS: FOLDERS, SLOT_FOLDER: SLOT_FOLDER, PROVIDERS: PROVIDERS, MAX_BYTES: MAX_BYTES,
  indexOf: indexOf, plan: plan, configured: configured, catalog: catalog, sync: sync
};
