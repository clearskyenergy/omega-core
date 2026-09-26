# © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
# One-off helper for the editor chrome theme pass: rewrites the recurring
# hard-coded chrome colours in editor.html to var() tokens, in ONE context at
# a time (css = <style> blocks, markup = inline style="" attributes, js =
# HTML/CSS template strings and .style assignments). Canvas, chart, PDF and
# SVG drawing lines are never touched: a var() is not a paint there.
# Usage: python3 scripts/_lib/editor-theme-retoken.py css|markup|js
import re, sys, bisect, collections

p = 'editor.html'
s = open(p, encoding='utf-8').read()
MODE = sys.argv[1]

tags = [(m.start(), m.group(0)) for m in re.finditer(r'<script\b|</script>|<style\b|</style>', s)]
regions = []; cur = 'html'; pos = 0
for i, t in tags:
    # a <style> written inside a JS template string is part of the script
    if cur == 'script' and t != '</script>': continue
    if t.startswith('<script'): kind = 'script'
    elif t.startswith('<style'): kind = 'style'
    else: kind = 'html'
    regions.append((pos, i, cur)); cur = kind; pos = i
regions.append((pos, len(s), cur))
starts = [r[0] for r in regions]
def kind_at(i): return regions[bisect.bisect_right(starts, i) - 1][2]
lines_start = [0] + [m.end() for m in re.finditer('\n', s)]
def line_start(i): return lines_start[bisect.bisect_right(lines_start, i) - 1]
def line_text(i):
    a = line_start(i); b = s.find('\n', a); return s[a:b if b >= 0 else len(s)]

EXCL = re.compile(r'fillStyle|strokeStyle|\bctx\b|setAttribute\(|jsPDF|\bpdf\b|\bdoc\.|fill=|stroke=|["\']fill["\']|setDrawColor|sld-sheet|ReportExport|chart|canvas|toDataURL|palette|gradient|swatch|--gb-|:root|^\s*--[\w-]+\s*:|/\*[^*]*\*/', re.I)
PROP = r'(?:background(?:-color)?|border(?:-(?:top|bottom|left|right|color))?|color|outline|box-shadow|scrollbar-color)'
def ctx_prop(before):
    m = re.search(PROP + r'\s*:\s*(?:[^;"\'`{}]*?)$', before, re.I)
    return m.group(0).split(':')[0].strip().lower() if m else None
LIT = re.compile(r'rgba\(255,255,255,\.(?:0[3-9]|1[0-6]?)\)|rgba\(0,0,0,\.(?:1[58]|2[0-5]?|4[05]?|5[05]?|6|7)\)|rgba\(4,10,20,\.\d+\)|rgba\(13,27,42,\.97\)|#16202B|#0F1D30|#0B1626|#1E3A5F|#26364d|#E2EEF9', re.I)
BG = ('background', 'background-color')
def token(lit, prop, before):
    L = lit.lower()
    if not prop or 'shadow' in prop: return None
    if L.startswith('rgba(255,255,255'):
        a = float(L[len('rgba(255,255,255,'):-1])
        if prop.startswith('border') or prop == 'outline' or 'solid' in before[-14:]: return 'var(--hairline)'
        if prop in BG: return 'var(--hover)' if a <= .07 else 'var(--hover-strong)'
        return None
    if L.startswith('rgba(0,0,0'):
        if prop not in BG: return None
        return 'var(--inset)' if float(L[len('rgba(0,0,0,'):-1]) <= .25 else 'var(--scrim)'
    if L.startswith('rgba(4,10,20'): return 'var(--scrim)' if prop in BG else None
    if L == 'rgba(13,27,42,.97)': return 'var(--panel)' if prop in BG else None
    if prop in BG:
        return {'#16202b': 'var(--bg)', '#0f1d30': 'var(--panel)', '#0b1626': 'var(--navy)',
                '#1e3a5f': 'var(--surface)', '#26364d': 'var(--surface)'}.get(L)
    if prop.startswith('border') or prop == 'outline':
        return 'var(--border)' if L in ('#1e3a5f', '#26364d', '#0b1626', '#0f1d30', '#16202b') else None
    if prop == 'color':
        if L == '#e2eef9': return 'var(--text)'
        if L in ('#16202b', '#0b1626', '#0f1d30'): return 'var(--ink)'
    return None

# The old navy/cyan family (compass, diagnostics, address chip, SOS, ARR and
# friends) is chrome everywhere it appears in a <style> block: one token each.
NAVY = {
    'rgba(10,22,40,.94)': 'var(--panel)', 'rgba(10,22,40,.96)': 'var(--panel)',
    '#132844': 'var(--surface)', '#1a3556': 'var(--hover-strong)', '#1c3350': 'var(--border)',
    '#24405f': 'var(--border)', '#3a4c63': 'var(--border)', '#7d95b4': 'var(--sub)',
    '#8fa6c2': 'var(--sub)', '#8fa3b8': 'var(--sub)', '#e8f0fa': 'var(--text)',
    '#00d4ff': 'var(--accent)', 'rgba(0,212,255,.18)': 'var(--hl-dim)',
    'rgba(0,212,255,.14)': 'var(--hl-dim)', 'rgba(0,212,255,.32)': 'var(--hover-strong)',
    '#4a8fd8': 'var(--accent)', 'rgba(74,143,216,.35)': 'var(--hl-dim)',
    'rgba(74,143,216,.18)': 'var(--hl-dim)', 'rgba(74,143,216,.10)': 'var(--hl-dim)',
    'rgba(19,40,68,.45)': 'var(--inset)', 'rgba(28,51,80,.5)': 'var(--hairline)',
    '#ff6b6b': 'var(--bad)', '#f59e0b': 'var(--warn)', 'rgba(245,158,11,.10)': 'var(--hl-dim)',
    '#e8c89a': 'var(--text)', '#a6ddb4': 'var(--text)',
    '#0f2040': 'var(--panel)', 'rgba(10,22,40,.92)': 'var(--scrim)', '#6b8cae': 'var(--sub)',
    '#4a6080': 'var(--sub)', '#0b1e35': 'var(--panel)', '#0d1b2a': 'var(--navy)', '#243b55': 'var(--border)',
    '#e2eaf4': 'var(--text)', '#0e1d33': 'var(--panel)',
}
if MODE.startswith('navy'):
    NL = re.compile('|'.join(re.escape(k) for k in NAVY), re.I)
    out = []; last = 0; count = collections.Counter()
    for m in NL.finditer(s):
        i = m.start(); k = kind_at(i); before = s[line_start(i):i]; lt = line_text(i)
        if MODE == 'navy': ok = (k == 'style')
        elif MODE == 'navy-markup': ok = (k == 'html') and bool(re.search(r'style\s*="[^"]*$', before))
        else:
            ok = (k == 'script') and re.search(PROP + r'\s*:\s*[^;"\'`{}]*$', before, re.I) is not None and bool(re.search(r'style\s*=|cssText|\.style\.|innerHTML|insertAdjacentHTML|<style|createElement\(\s*[\'"]style', lt))
        if not ok or EXCL.search(lt): continue
        tok = NAVY[m.group(0).lower()]
        out.append(s[last:i]); out.append(tok); last = m.end(); count[m.group(0) + ' -> ' + tok] += 1
    out.append(s[last:]); open(p, 'w', encoding='utf-8').write(''.join(out))
    print('MODE navy replaced', sum(count.values()))
    for k, v in sorted(count.items(), key=lambda x: -x[1]): print('%5d %s' % (v, k))
    sys.exit(0)

out = []; last = 0; count = collections.Counter(); skipped = collections.Counter()
for m in LIT.finditer(s):
    i = m.start(); k = kind_at(i); lt = line_text(i); before = s[line_start(i):i]
    ok = False
    if MODE == 'css': ok = (k == 'style')
    elif MODE == 'markup': ok = (k == 'html') and bool(re.search(r'style\s*="[^"]*$', before))
    elif MODE == 'js' and k == 'script':
        same_string = re.search(PROP + r'\s*:\s*[^;"\'`{}]*$', before, re.I) is not None
        styled = bool(re.search(r'style\s*=|cssText|\.style\.|innerHTML|insertAdjacentHTML|<style|createElement\(\s*[\'"]style', lt))
        cssy = bool(re.search(r'^\s*[a-zA-Z#.\[][^\'"`=]*\{|\}\s*[\'"+]?\s*$|;\s*[\'"+]?\s*$', lt))
        ok = same_string and (styled or cssy)
    if not ok: continue
    if EXCL.search(lt): skipped['excl ' + m.group(0)] += 1; continue
    prop = ctx_prop(before)
    tok = token(m.group(0), prop, before)
    if not tok: skipped[m.group(0) + '|' + str(prop)] += 1; continue
    out.append(s[last:i]); out.append(tok); last = m.end(); count[m.group(0) + ' -> ' + tok] += 1
out.append(s[last:])
open(p, 'w', encoding='utf-8').write(''.join(out))
print('MODE', MODE, 'replaced', sum(count.values()))
for k, v in sorted(count.items(), key=lambda x: -x[1]): print('%5d %s' % (v, k))
print('--- skipped (top)')
for k, v in sorted(skipped.items(), key=lambda x: -x[1])[:20]: print('%5d %s' % (v, k))
