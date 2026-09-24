/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   make-app-icons.js — home-screen icons from the OMEGA mark.

   iOS does not honour transparency in a home-screen icon; it composites the
   icon over black and applies its own mask. The mark is white-on-transparent
   (720x408), so shipping it directly gives a white glyph on a black square
   that does not match the app, and `sips -p` does not help: it pads AROUND an
   image without flattening the alpha inside it, which produced a navy border
   around a black centre.

   So the flattening happens here. Decode the mark, area-average it down to the
   fitted box, alpha-blend it over the page's own background, centre it on a
   square of the same colour, and write an opaque RGB PNG. No dependencies:
   the source is 8-bit RGBA non-interlaced, which is the one case worth
   handling, and zlib is in the standard library.

   Run: node scripts/make-app-icons.js

   Also a module: make-jarvis-icons.js composes the same mark over the Jarvis
   app's own colours through build(src, size, { bg, inset, tint }) so there is
   one PNG codec in the repo, not two.                                       */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const SRC  = path.join(ROOT, 'clearsky-omega-mark-white.png');
const OUT  = path.join(ROOT, 'icons');
/* The mission console's own --bg. An icon that is not the colour of the app it
   opens reads as somebody else's app. */
const DEFAULT_BG   = [0x02, 0x08, 0x13];
const SIZES = [180, 192, 512];
const DEFAULT_INSET = 0.74;       /* the mask crops the corners; leave room */

/* ── decode ──────────────────────────────────────────────────────────────── */
function decode(buf) {
  if (buf.slice(1, 4).toString() !== 'PNG') throw new Error('not a PNG');
  let o = 8, ihdr = null, idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), type = buf.slice(o + 4, o + 8).toString();
    if (type === 'IHDR') ihdr = { w:buf.readUInt32BE(o+8), h:buf.readUInt32BE(o+12),
                                  depth:buf[o+16], color:buf[o+17], interlace:buf[o+20] };
    else if (type === 'IDAT') idat.push(buf.slice(o + 8, o + 8 + len));
    o += 12 + len;
    if (type === 'IEND') break;
  }
  if (!ihdr) throw new Error('no IHDR');
  if (ihdr.depth !== 8 || ihdr.color !== 6 || ihdr.interlace !== 0)
    throw new Error('expected 8-bit RGBA, non-interlaced; got depth ' + ihdr.depth
                    + ' colorType ' + ihdr.color + ' interlace ' + ihdr.interlace);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4, stride = ihdr.w * bpp, px = Buffer.alloc(ihdr.h * stride);
  let p = 0;
  for (let y = 0; y < ihdr.h; y++) {
    const filter = raw[p++];
    const row = y * stride, prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const v = raw[p++];
      const a = x >= bpp ? px[row + x - bpp] : 0;
      const b = y > 0 ? px[prev + x] : 0;
      const c = (x >= bpp && y > 0) ? px[prev + x - bpp] : 0;
      let out;
      switch (filter) {
        case 0: out = v; break;
        case 1: out = v + a; break;
        case 2: out = v + b; break;
        case 3: out = v + ((a + b) >> 1); break;
        case 4: {
          const pp = a + b - c, pa = Math.abs(pp-a), pb = Math.abs(pp-b), pc = Math.abs(pp-c);
          out = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); break;
        }
        default: throw new Error('bad filter ' + filter + ' on row ' + y);
      }
      px[row + x] = out & 0xff;
    }
  }
  return { w:ihdr.w, h:ihdr.h, px:px };
}

/* ── encode (opaque RGB) ─────────────────────────────────────────────────── */
let CRC = null;
function crc32(buf) {
  if (!CRC) {
    CRC = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      CRC[n] = c; }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encode(size, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = size * 3, raw = Buffer.alloc(size * (stride + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;                       /* filter: none */
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ── compose ─────────────────────────────────────────────────────────────── */
function build(src, size, opts) {
  opts = opts || {};
  const BG = opts.bg || DEFAULT_BG, INSET = opts.inset || DEFAULT_INSET, TINT = opts.tint || null;
  const out = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i++)
    { out[i*3] = BG[0]; out[i*3+1] = BG[1]; out[i*3+2] = BG[2]; }

  const box = Math.round(size * INSET);
  const scale = Math.min(box / src.w, box / src.h);
  const dw = Math.max(1, Math.round(src.w * scale)), dh = Math.max(1, Math.round(src.h * scale));
  const ox = Math.round((size - dw) / 2), oy = Math.round((size - dh) / 2);

  /* Area average, not nearest: at 720 -> 133 a nearest sample drops most of
     the glyph's strokes and the mark comes out ragged. */
  for (let y = 0; y < dh; y++) {
    const sy0 = Math.floor(y * src.h / dh), sy1 = Math.max(sy0 + 1, Math.floor((y+1) * src.h / dh));
    for (let x = 0; x < dw; x++) {
      const sx0 = Math.floor(x * src.w / dw), sx1 = Math.max(sx0 + 1, Math.floor((x+1) * src.w / dw));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = sy0; sy < sy1; sy++) for (let sx = sx0; sx < sx1; sx++) {
        const i = (sy * src.w + sx) * 4, al = src.px[i+3] / 255;
        r += src.px[i] * al; g += src.px[i+1] * al; b += src.px[i+2] * al; a += al; n++;
      }
      r /= n; g /= n; b /= n; a /= n;
      /* A tint recolours the white mark (the source is white-on-transparent,
         so multiplying by the tint is exactly "the same glyph in that colour"). */
      if (TINT) { r = r * TINT[0] / 255; g = g * TINT[1] / 255; b = b * TINT[2] / 255; }
      const d = ((oy + y) * size + (ox + x)) * 3;
      out[d]   = Math.round(r + BG[0] * (1 - a));
      out[d+1] = Math.round(g + BG[1] * (1 - a));
      out[d+2] = Math.round(b + BG[2] * (1 - a));
    }
  }
  return encode(size, out);
}

module.exports = { decode, encode, build, SRC };

if (require.main === module) {
  const src = decode(fs.readFileSync(SRC));
  fs.mkdirSync(OUT, { recursive: true });
  SIZES.forEach(function (s) {
    const file = path.join(OUT, 'omega-' + s + '.png');
    fs.writeFileSync(file, build(src, s));
    console.log('  ' + path.relative(ROOT, file) + '  ' + s + 'x' + s
                + '  ' + fs.statSync(file).size + ' bytes');
  });
}
