/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   make-mission-icons.js — home-screen icons for JARVIS // Mission Control.

   The OMEGA mark in the core's cyan over the dashboard's own --bg, so the
   tile on a phone is the app it opens and not the white OMEGA mark that
   every tenant page installs as. The maskable icon carries a deeper inset
   because Android crops it to a circle or squircle.

   Run: node scripts/make-mission-icons.js                                    */
'use strict';
const fs = require('fs');
const path = require('path');
const icons = require('./make-app-icons');

const ROOT = path.join(__dirname, '..');
const OUT  = path.join(ROOT, 'icons');
const BG   = [0x02, 0x08, 0x13];          /* mission.html --bg */
const TINT = [0x00, 0xF3, 0xFF];          /* --glow-cyan, the core */

const src = icons.decode(fs.readFileSync(icons.SRC));
fs.mkdirSync(OUT, { recursive: true });
const jobs = [
  ['mission-32.png',           32,  0.80],
  ['mission-180.png',          180, 0.74],
  ['mission-192.png',          192, 0.74],
  ['mission-512.png',          512, 0.74],
  ['mission-maskable-512.png', 512, 0.56]
];
jobs.forEach(function (j) {
  const file = path.join(OUT, j[0]);
  fs.writeFileSync(file, icons.build(src, j[1], { bg: BG, inset: j[2], tint: TINT }));
  console.log('  ' + path.relative(ROOT, file) + '  ' + j[1] + 'x' + j[1] + '  ' + fs.statSync(file).size + ' bytes');
});
