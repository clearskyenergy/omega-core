/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/portfolio/zip.js — a small, safe ZIP reader
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE (node zlib only). Reads the central directory of a ZIP buffer and
   inflates entries on demand. Written rather than installed because a
   customer's portfolio package is untrusted input: the reader refuses path
   traversal, absolute paths, oversized entries and oversized archives BEFORE
   inflating anything, and it never touches the filesystem. Stored and
   deflated entries only; encrypted, spanned or ZIP64 archives are refused
   with a plain reason.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var zlib = require('zlib');

var LIMITS = { entries: 400, entryBytes: 25 * 1024 * 1024, totalBytes: 60 * 1024 * 1024, nameLength: 240 };

function fail(msg) { var e = new Error(msg); e.status = 400; throw e; }
function safeName(raw) {
  var name = String(raw || '').replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (!name || name.length > LIMITS.nameLength) fail('A file in the archive has an unusable name');
  if (name.charAt(0) === '/' || /^[A-Za-z]:/.test(name)) fail('The archive contains an absolute path: ' + name.slice(0, 80));
  if (name.split('/').some(function (p) { return p === '..'; })) fail('The archive contains a path that climbs out of the package: ' + name.slice(0, 80));
  for (var i = 0; i < name.length; i++) { if (name.charCodeAt(i) < 32) fail('A file name in the archive contains control characters'); }
  return name;
}
function isDir(name) { return /\/$/.test(name); }

function list(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) fail('Not a ZIP archive');
  /* End of central directory: scan back from the end (comment ≤ 65535). */
  var eocd = -1, minPos = Math.max(0, buf.length - 65557);
  for (var i = buf.length - 22; i >= minPos; i--) { if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; } }
  if (eocd < 0) fail('Not a ZIP archive (no central directory)');
  var disk = buf.readUInt16LE(eocd + 4), count = buf.readUInt16LE(eocd + 10), cdSize = buf.readUInt32LE(eocd + 12), cdOffset = buf.readUInt32LE(eocd + 16);
  if (disk !== 0) fail('Spanned archives are not supported');
  if (count > LIMITS.entries) fail('The archive has more than ' + LIMITS.entries + ' files');
  if (cdOffset + cdSize > buf.length) fail('The archive is truncated');
  var entries = [], pos = cdOffset, total = 0;
  for (var n = 0; n < count; n++) {
    if (pos + 46 > buf.length || buf.readUInt32LE(pos) !== 0x02014b50) fail('The archive directory is damaged');
    var flags = buf.readUInt16LE(pos + 8), method = buf.readUInt16LE(pos + 10), csize = buf.readUInt32LE(pos + 20), usize = buf.readUInt32LE(pos + 24);
    var nameLen = buf.readUInt16LE(pos + 28), extraLen = buf.readUInt16LE(pos + 30), commentLen = buf.readUInt16LE(pos + 32), local = buf.readUInt32LE(pos + 42);
    var name = safeName(buf.toString('utf8', pos + 46, pos + 46 + nameLen));
    if (flags & 0x1) fail('Encrypted archives are not supported: ' + name.slice(0, 80));
    if (csize === 0xffffffff || usize === 0xffffffff) fail('ZIP64 archives are not supported');
    if (!isDir(name)) {
      if (usize > LIMITS.entryBytes) fail(name.slice(0, 80) + ' is larger than ' + (LIMITS.entryBytes / 1048576) + ' MB');
      total += usize;
      if (total > LIMITS.totalBytes) fail('The archive unpacks to more than ' + (LIMITS.totalBytes / 1048576) + ' MB');
      if (method !== 0 && method !== 8) fail(name.slice(0, 80) + ' uses an unsupported compression method');
      entries.push({ name: name, method: method, csize: csize, usize: usize, local: local });
    }
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function read(buf, entry) {
  var p = entry.local;
  if (p + 30 > buf.length || buf.readUInt32LE(p) !== 0x04034b50) fail('The archive is damaged at ' + entry.name.slice(0, 80));
  var nameLen = buf.readUInt16LE(p + 26), extraLen = buf.readUInt16LE(p + 28), start = p + 30 + nameLen + extraLen, end = start + entry.csize;
  if (end > buf.length) fail('The archive is truncated at ' + entry.name.slice(0, 80));
  var raw = buf.subarray(start, end), out;
  if (entry.method === 0) out = Buffer.from(raw);
  else {
    try { out = zlib.inflateRawSync(raw, { maxOutputLength: LIMITS.entryBytes }); }
    catch (e) { fail('Could not unpack ' + entry.name.slice(0, 80)); }
  }
  if (out.length !== entry.usize) fail(entry.name.slice(0, 80) + ' did not unpack to its declared size');
  return out;
}

/* Every file in the archive, unpacked, in directory order. */
function extract(buf) {
  return list(buf).map(function (e) { return { name: e.name, bytes: read(buf, e) }; });
}

/* A minimal writer, for tests and the XLSX/ZIP templates: stored entries only. */
function build(files) {
  var parts = [], central = [], offset = 0;
  files.forEach(function (f) {
    var name = Buffer.from(f.name, 'utf8'), data = Buffer.isBuffer(f.bytes) ? f.bytes : Buffer.from(String(f.bytes), 'utf8'), crc = crc32(data);
    var local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(0, 8); local.writeUInt16LE(0, 10); local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    var cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0, 8); cd.writeUInt16LE(0, 10); cd.writeUInt16LE(0, 12); cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(name.length, 28); cd.writeUInt16LE(0, 30); cd.writeUInt16LE(0, 32); cd.writeUInt16LE(0, 34); cd.writeUInt16LE(0, 36); cd.writeUInt32LE(0, 38); cd.writeUInt32LE(offset, 42);
    parts.push(local, name, data); central.push(cd, name);
    offset += local.length + name.length + data.length;
  });
  var cdBytes = Buffer.concat(central), eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6); eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10); eocd.writeUInt32LE(cdBytes.length, 12); eocd.writeUInt32LE(offset, 16); eocd.writeUInt16LE(0, 20);
  return Buffer.concat(parts.concat([cdBytes, eocd]));
}
var CRC_TABLE = (function () { var t = [], c; for (var n = 0; n < 256; n++) { c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { var c = 0xffffffff; for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

module.exports = { list: list, read: read, extract: extract, build: build, safeName: safeName, LIMITS: LIMITS };
