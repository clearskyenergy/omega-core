/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   make-jarvis-icons.js — home-screen icons for the Jarvis phone app.

   The OMEGA mark in the orb's cyan over the Jarvis page's own dark navy, so
   the tile on a phone is recognisably the same thing as the page it opens
   and is not mistaken for the mission console (which uses the white mark on
   near-black). The maskable icon carries a deeper inset because Android
   crops it to a circle or squircle.

   Run: node scripts/make-jarvis-icons.js                                    */
'use strict';
const fs = require('fs');
const path = require('path');
const icons = require('./make-app-icons');

const ROOT = path.join(__dirname, '..');
const OUT  = path.join(ROOT, 'portals', 'jarvis-app', 'brand');
const BG   = [0x0F, 0x17, 0x20];          /* jarvis.html --cs-dark */
const TINT = [0x00, 0xF3, 0xFF];          /* the orb */

const src = icons.decode(fs.readFileSync(icons.SRC));
fs.mkdirSync(OUT, { recursive: true });
const jobs = [
  ['jarvis-icon-32.png',           32,  0.80],
  ['jarvis-icon-180.png',          180, 0.74],
  ['jarvis-icon-192.png',          192, 0.74],
  ['jarvis-icon-512.png',          512, 0.74],
  ['jarvis-icon-maskable-512.png', 512, 0.56]
];
jobs.forEach(function (j) {
  const file = path.join(OUT, j[0]);
  fs.writeFileSync(file, icons.build(src, j[1], { bg: BG, inset: j[2], tint: TINT }));
  console.log('  ' + path.relative(ROOT, file) + '  ' + j[1] + 'x' + j[1] + '  ' + fs.statSync(file).size + ' bytes');
});
