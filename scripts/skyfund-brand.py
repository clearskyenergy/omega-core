#!/usr/bin/env python3
"""
scripts/skyfund-brand.py — the SkyFund app icon and "SkyFund powered by OMEGA"
lockups, written as pure-path SVGs into portals/skyfund/brand/.
© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

THE MARK. OMEGA is the brand; SkyFund is the app. The icon is a dawn seen
through the OMEGA glyph: the omega's feet are the horizon, a gold sun rises
between its legs, and the tile is night-navy fading to dawn-blue at the
horizon — sky, and a return. The omega path is the one clearsky-omega-mark.svg
uses, so the two marks are one family; here it is drawn in white and heavy
because an app icon has to survive 32 px, where the neon glow would not.

TEXT IS OUTLINED. The lockups carry no <text>: Archivo ExtraBold for
"SkyFund" and Inter SemiBold for "POWERED BY OMEGA" are shaped with HarfBuzz
(real kerning) and converted to paths, so the files render identically
everywhere, fonts installed or not.

    pip install fonttools uharfbuzz
    curl -sSL -o /tmp/Archivo.ttf 'https://raw.githubusercontent.com/google/fonts/main/ofl/archivo/Archivo%5Bwdth%2Cwght%5D.ttf'
    curl -sSL -o /tmp/Inter.ttf   'https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf'
    python3 scripts/skyfund-brand.py --archivo /tmp/Archivo.ttf --inter /tmp/Inter.ttf

Both fonts are SIL Open Font License; outlining them into a logo is permitted.

PNG icons (32, 180, 192, 512, 1024) come from headless Chromium — see the
loop at the bottom of this file's docstring in portals/skyfund/README.md.
"""
import argparse
import os
import sys

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

try:
    import uharfbuzz as hb
except ImportError:  # pragma: no cover
    hb = None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'portals', 'skyfund', 'brand')
COPYRIGHT = '© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.'

# The OMEGA glyph, verbatim from clearsky-omega-mark.svg (100 × 100 box; feet on y = 80).
OMEGA_PATH = 'M10 80H26C33 79 34.8 71 33.4 63.3A27 27 0 1 1 66.6 63.3C65.2 71 67 79 74 80H90'

# Palette (omega-theme.css + the neon mark)
NAVY, NIGHT, DAWN = '#16202B', '#0B1320', '#2B5FA8'
GOLD, GOLD_HI, GOLD_LO = '#F0B45C', '#FFD27A', '#C77A00'
INK, SUB, BLUE = '#14171A', '#5B6672', '#2B5FA8'
NEON = ('#3AAE63', '#22D3EE', '#38BDF8')


def fmt(v):
    return ('%.2f' % v).rstrip('0').rstrip('.') if isinstance(v, float) else str(v)


# ── type ─────────────────────────────────────────────────────────────────────
class Face:
    def __init__(self, path, axes):
        self.file, self.axes = path, axes
        raw = TTFont(path)
        self.inst = instancer.instantiateVariableFont(raw, axes, inplace=False) if 'fvar' in raw else raw
        self.upm = self.inst['head'].unitsPerEm
        self.cap = getattr(self.inst['OS/2'], 'sCapHeight', None) or int(self.upm * 0.7)
        self.order = self.inst.getGlyphOrder()
        self.glyphs = self.inst.getGlyphSet()

    def shape(self, text, size, tracking_em=0.0):
        """[(glyph, x, y)] in px plus the total advance, kerned by HarfBuzz."""
        s = size / self.upm
        out, x = [], 0.0
        if hb is not None:
            face = hb.Face(hb.Blob.from_file_path(self.file))
            font = hb.Font(face)
            font.scale = (self.upm, self.upm)
            if self.axes:
                font.set_variations(self.axes)
            buf = hb.Buffer()
            buf.add_str(text)
            buf.guess_segment_properties()
            hb.shape(font, buf, {'kern': True, 'liga': True})
            for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
                out.append((self.order[info.codepoint], x + pos.x_offset * s, -pos.y_offset * s))
                x += pos.x_advance * s + tracking_em * size
        else:  # no shaper: advance widths only
            cmap = self.inst.getBestCmap()
            hmtx = self.inst['hmtx']
            for ch in text:
                name = cmap.get(ord(ch), '.notdef')
                out.append((name, x, 0.0))
                x += hmtx[name][0] * s + tracking_em * size
        return out, x - tracking_em * size

    def path(self, glyphs, size, x0, baseline):
        s = size / self.upm
        pen = SVGPathPen(self.glyphs, ntos=fmt)
        for name, gx, gy in glyphs:
            self.glyphs[name].draw(TransformPen(pen, (s, 0, 0, -s, x0 + gx, baseline + gy)))
        return pen.getCommands()


# ── the icon ─────────────────────────────────────────────────────────────────
ICON_S = 8.4                      # 100-box → 1024 tile
ICON_TX, ICON_TY = 92, 56         # centres the glyph; feet land on y = 728
HORIZON = ICON_TY + 80 * ICON_S   # 728


def icon_body(uid):
    """The tile's contents at 1024 × 1024, ids prefixed so several can share a document."""
    return f'''<defs>
  <linearGradient id="{uid}sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="{NIGHT}"/><stop offset=".52" stop-color="{NAVY}"/><stop offset="1" stop-color="{DAWN}"/>
  </linearGradient>
  <radialGradient id="{uid}glow" cx="512" cy="{fmt(HORIZON)}" r="430" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="{GOLD_HI}" stop-opacity=".85"/><stop offset=".3" stop-color="{GOLD}" stop-opacity=".32"/><stop offset=".65" stop-color="{GOLD_LO}" stop-opacity=".08"/><stop offset="1" stop-color="{GOLD_LO}" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="{uid}sun" cx=".5" cy=".35" r=".65">
    <stop offset="0" stop-color="{GOLD_HI}"/><stop offset=".55" stop-color="{GOLD}"/><stop offset="1" stop-color="{GOLD_LO}"/>
  </radialGradient>
  <clipPath id="{uid}above"><rect x="0" y="0" width="1024" height="{fmt(HORIZON)}"/></clipPath>
</defs>
<rect width="1024" height="1024" fill="url(#{uid}sky)"/>
<rect width="1024" height="1024" fill="url(#{uid}glow)"/>
<line x1="0" y1="{fmt(HORIZON)}" x2="1024" y2="{fmt(HORIZON)}" stroke="#fff" stroke-opacity=".22" stroke-width="4"/>
<g clip-path="url(#{uid}above)"><circle cx="512" cy="{fmt(HORIZON)}" r="152" fill="url(#{uid}sun)"/></g>
<path d="{OMEGA_PATH}" transform="translate({ICON_TX} {ICON_TY}) scale({ICON_S})" fill="none" stroke="#fff" stroke-width="9.6" stroke-linecap="round" stroke-linejoin="round"/>'''


def icon_svg():
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024" role="img" aria-label="SkyFund">
<!-- {COPYRIGHT}
     SkyFund app icon — dawn through the OMEGA glyph. Full-bleed square: iOS
     rounds it, Android masks it; everything that matters sits inside the
     central 80% (the maskable safe zone). Generated by scripts/skyfund-brand.py. -->
{icon_body('i')}
</svg>
'''


def icon_tile(x, y, size, uid):
    """The icon placed inside a lockup, with the corner radius a home screen gives it."""
    r = size * 0.22
    return f'''<g transform="translate({fmt(x)} {fmt(y)})"><clipPath id="{uid}tile"><rect width="{fmt(size)}" height="{fmt(size)}" rx="{fmt(r)}"/></clipPath>
<g clip-path="url(#{uid}tile)"><g transform="scale({fmt(size / 1024)})">{icon_body(uid)}</g></g></g>'''


# ── the lockups ──────────────────────────────────────────────────────────────
def lockup(archivo, inter, dark, with_icon=True):
    H = 160
    word_size, tag_size = 96.0, 22.0
    x0 = 164.0 if with_icon else 0.0
    word_glyphs, word_w = archivo.shape('SkyFund', word_size, tracking_em=-0.025)
    word_base = 24 + archivo.cap * (word_size / archivo.upm)          # cap top on y = 24
    tag_base = 139.0
    pb_glyphs, pb_w = inter.shape('POWERED BY', tag_size, tracking_em=0.18)
    om_glyphs, om_w = inter.shape('OMEGA', tag_size, tracking_em=0.18)
    gap = tag_size * 0.55
    W = x0 + max(word_w, pb_w + gap + om_w) + 6

    word_fill = '#FFFFFF' if dark else INK
    pb_fill = '#9DB8D9' if dark else SUB
    om_fill = 'url(#neon)' if dark else BLUE
    defs = ('<defs><linearGradient id="neon" x1="0" y1="0" x2="1" y2="0">'
            + ''.join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in zip(('0', '.5', '1'), NEON))
            + '</linearGradient></defs>') if dark else ''
    ground = ('' if with_icon is None else '')
    body = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {fmt(W)} {H}" width="{fmt(W)}" height="{H}" role="img" aria-label="SkyFund, powered by OMEGA">',
            f'<!-- {COPYRIGHT}\n     SkyFund lockup for {"dark (navy) grounds" if dark else "light grounds"}. Text is outlined; no fonts needed.\n     Generated by scripts/skyfund-brand.py. -->',
            defs]
    if with_icon:
        body.append(icon_tile(0, 16, 128, 'l'))
    body.append(f'<path fill="{word_fill}" d="{archivo.path(word_glyphs, word_size, x0, word_base)}"/>')
    body.append(f'<path fill="{pb_fill}" d="{inter.path(pb_glyphs, tag_size, x0, tag_base)}"/>')
    body.append(f'<path fill="{om_fill}" d="{inter.path(om_glyphs, tag_size, x0 + pb_w + gap, tag_base)}"/>')
    body.append('</svg>\n')
    return '\n'.join(b for b in body if b)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--archivo', required=True, help='Archivo[wdth,wght].ttf')
    ap.add_argument('--inter', required=True, help='Inter[opsz,wght].ttf')
    ap.add_argument('--out', default=OUT)
    a = ap.parse_args()
    if hb is None:
        print('warning: uharfbuzz not installed — no kerning; pip install uharfbuzz', file=sys.stderr)
    archivo = Face(a.archivo, {'wght': 800, 'wdth': 100})
    inter = Face(a.inter, {'wght': 600, 'opsz': 14})
    os.makedirs(a.out, exist_ok=True)
    files = {
        'skyfund-icon.svg': icon_svg(),
        'skyfund-lockup-dark.svg': lockup(archivo, inter, dark=True),
        'skyfund-lockup-light.svg': lockup(archivo, inter, dark=False),
        'skyfund-wordmark-dark.svg': lockup(archivo, inter, dark=True, with_icon=False),
        'skyfund-wordmark-light.svg': lockup(archivo, inter, dark=False, with_icon=False),
    }
    for name, svg in files.items():
        with open(os.path.join(a.out, name), 'w', encoding='utf-8') as f:
            f.write(svg)
        print(f'  {name}  {len(svg.encode("utf-8"))} bytes')


if __name__ == '__main__':
    main()
