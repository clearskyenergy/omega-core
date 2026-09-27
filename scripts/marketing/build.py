# -*- coding: utf-8 -*-
# © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
#
# build.py — renders content.py three ways:
#   docs/GO-TO-MARKET.md      the repo copy (what a daily run reads)
#   <out>/kit.html            the copy-and-paste page (images in <out>/cards/)
#   <out>/cards.json          the graphic specs card.js renders
#
#   python3 scripts/marketing/build.py [out]      (default scripts/marketing/out)
#   node scripts/marketing/card.js <out>/cards.json <out>/cards
import csv, html, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from content import *

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(HERE, 'out')
os.makedirs(OUT, exist_ok=True)
MD_OUT = os.path.join(REPO, 'docs/GO-TO-MARKET.md')
HTML_OUT = os.path.join(OUT, 'kit.html')
TARGETS = os.path.join(REPO, 'docs/developer-targets.csv')
DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

def fill(s):
    for k, v in LINKS.items():
        s = s.replace('{' + k + '}', v)
    return s

assert len(PAGE['tagline']) <= 120, len(PAGE['tagline'])
assert len(PAGE['about']) <= 2000, len(PAGE['about'])
assert len(PAGE['specialties']) <= 20
assert [p['day'] for p in POSTS] == list(range(1, 31))
assert len(SEQUENCE[0]['text']) <= 300
KINDS = ('statement', 'list', 'compare', 'stack', 'carousel', 'quiz', 'checklist', 'leaderboard', 'stopwatch', 'plan', 'drop')
for p in POSTS:
    assert len(p['text']) <= 3000, p['day']
    assert not p.get('answer_card') or p.get('answer'), p['day']
    assert p['card'] is None or p['card']['kind'] in KINDS, p['day']

# No prices in anything public (founder decision, 2026-09-27): refuse a
# dollar sign or a price-list link in every string that leaves the building.
def public_strings():
    yield PAGE['tagline']; yield PAGE['about']
    for p in POSTS:
        yield p['text']; yield p['comment']; yield p.get('answer', '')
        yield json.dumps([p['card'], p.get('answer_card')], ensure_ascii=False)
    for q in SEQUENCE:
        yield q['text']; yield q.get('subject', '')
for t in public_strings():
    assert '$' not in t and '/offerings' not in t and 'price list' not in t.lower(), t[:120]

def cid(p):
    return 'day%02d' % p['day']

cards = []
for p in POSTS:
    if p['card']:
        meta = dict(sheet='%s-%d' % (SHEET_LETTER[p['pillar']], 100 + p['day']), project=PILLARS[p['pillar']])
        cards.append(dict(p['card'], id=cid(p), **meta))
        if p.get('answer_card'):
            cards.append(dict(p['answer_card'], id=cid(p) + '-answer', **meta))
json.dump(cards, open(os.path.join(OUT, 'cards.json'), 'w'), indent=1, ensure_ascii=False)

targets = []
if os.path.exists(TARGETS):
    with open(TARGETS, newline='') as f:
        targets = list(csv.DictReader(f))

# ---------- Markdown (the repo copy) ----------
md = []
w = md.append
w('# Go to market: LinkedIn and the developer campaign\n')
w('© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.\n')
w('Status: **draft for the founder, written 2026-09-27.** Companion to '
  '`docs/SALES-AGENT.md` (the growth board, outreach rules, CAN-SPAM, '
  'off-limits accounts) and `docs/VALUE-LADDER-PACKAGING.md` (the modules). '
  'No price appears in anything public: pricing is for the call (founder '
  'decision, 2026-09-27), and build.py refuses a dollar sign in a post, a '
  'card, a comment, an answer or an email. Nothing here is published by '
  'code; a person posts and sends.\n')
w('## 0. The message\n')
w('**Ditch the stack.** A developer runs one project through six to ten tools '
  '(grid data, GIS, a sizing sheet, CAD, an estimate, a pro forma, a data room, '
  'RFQs by email) and re-keys the numbers at every hand-off. ClearSky OMEGA is '
  'one record from the first look at a parcel to the day the project is funded: '
  'screen, design, size, price, finance, operate. One login, 14-day trial.\n')
w('**Engagement first.** Seven game series, the same every week: Drop a Site '
  '(Mon), Build Tuesday, Guess & Spot (Wed), Count Your Stack (Thu), '
  'Speedrun Friday, Site Leaderboard (Sat), Field Notes (Sun). Each asks for '
  'one small thing in the comments. They show speed, scale and ease, never '
  'the method.\n')
w('Links used everywhere below (change them here once, e.g. for a vanity '
  'redirect on the marketing site):\n')
for k, v in LINKS.items():
    w('- `{%s}` %s' % (k, v))
w('')
w('## 1. The voice\n')
for x in VOICE: w('- ' + x)
w('\n**News-driven posts.** Timely posts earn follows that calendar posts do not. Rules:\n')
for x in NEWS_RULES: w('- ' + x)
w('\n**Every day, 10 minutes** (the founder or whoever runs the page):\n')
for x in ENGAGE: w('- ' + x)
w('')
w('## 1a. IP guardrails for anything public\n')
w('Sell the result, never the method. The pricing, scoring, dispatch and '
  'modelling logic runs on the server (CLAUDE.md, *IP protection*) precisely '
  'so it cannot be read; a screenshot must not undo that.\n')
w('**Do**\n')
for x in GUARDRAILS_DO: w('- ' + x)
w('\n**Never**\n')
for x in GUARDRAILS_DONT: w('- ' + x)
w('')
w('## 2. Before launch\n')
for i, (h, b) in enumerate(BLOCKERS, 1):
    w('%d. **%s** %s' % (i, h, b))
w('')
w('## 3. The company page\n')
w('| Field | Value |\n|---|---|')
w('| Name | %s |' % PAGE['name'])
w('| Tagline (%d/120) | %s |' % (len(PAGE['tagline']), PAGE['tagline']))
w('| Website | %s |' % PAGE['website'])
w('| Industry | %s |' % PAGE['industry'])
w('| Button | %s |' % PAGE['button'])
w('')
w('**About** (%d/2,000 characters)\n' % len(PAGE['about']))
w('```text\n' + PAGE['about'] + '\n```\n')
w('**Specialties** (%d/20): %s\n' % (len(PAGE['specialties']), ', '.join(PAGE['specialties'])))
w('## 4. The 30-day calendar\n')
w('Day 1 is a Monday. One post a day; weekend posts are light. The link goes '
  'in the first comment, not the post. Up to three hashtags. The founder '
  'reshares weekday posts from their own profile with a line of their own.\n')
for p in POSTS:
    w('### Day %d (%s) · %s\n' % (p['day'], DOW[(p['day'] - 1) % 7], p['title']))
    g = (' Graphic: `%s.png` (%s).' % (cid(p), p['card']['kind'])) if p['card'] else ''
    w('*%s · %s.* Visual: %s%s\n' % (PILLARS[p['pillar']], p['fmt'], p['visual'], g))
    w('```text\n' + fill(p['text']) + '\n```\n')
    if p['comment']:
        w('First comment: ' + fill(p['comment']).replace('\n', ' · ') + '\n')
    if p.get('answer'):
        w('Next day, as a comment on this post%s: %s\n' % (' with `%s-answer.png`' % cid(p) if p.get('answer_card') else '', p['answer']))
w('## 5. The developer campaign\n')
w('**Who**\n')
w('| Segment | Lead with |\n|---|---|')
for a, b in ICP: w('| %s | %s |' % (a, b))
w('\nSmall to mid-size (about 5–300 people), without a large in-house GIS, '
  'modelling and CAD department. Titles: %s.\n' % TITLES)
w('**The offer.** A 20-minute live build of one of their sites from an '
  'address, then a 14-day trial on their own sites. Pricing is for the call, '
  'never in writing, until the founder says otherwise; the starting package '
  'and its price are docs/VALUE-LADDER-PACKAGING.md §3.6 and the price book.\n')
w('**Reasons to write now** (one per message, specific and dated):\n')
for x in HOOKS: w('- ' + x)
w('\n**The sequence** (outreach rules: `docs/SALES-AGENT.md` §5; work '
  'addresses only, one thread per company, a real postal address and an '
  'opt-out in every email, stop on the first "no")\n')
for s in SEQUENCE:
    w('#### %s · %s · %s\n' % (s['when'], s['channel'], s['name']))
    if s.get('subject'): w('Subject: `%s`\n' % s['subject'])
    w('```text\n' + fill(s['text']) + '\n```\n')
w('**Cadence**\n')
w('| | |\n|---|---|')
for a, b in CADENCE: w('| %s | %s |' % (a, b))
w('\n**Measure**\n')
w('| | |\n|---|---|')
for a, b in METRICS: w('| %s | %s |' % (a, b))
w('')
w('## 6. Target accounts\n')
if targets:
    w('`docs/developer-targets.csv` (%d companies, public sources, company-level '
      'only; no personal contact data). Read the source before you write: a '
      'hook is only as good as its date. Check the growth board and the '
      'off-limits list before the first touch; a company that signs up leaves '
      'this list.\n' % len(targets))
else:
    w('`docs/developer-targets.csv` (to come).\n')
w('## 7. The daily run\n')
w('One run each morning: news check, the post, its graphic, the guardrail '
  'check, delivered ready to paste (or queued in a connected scheduler for '
  'approval). The graphics come from `scripts/marketing/` (`build.py`, then '
  '`card.js`; fonts are embedded, no network). Prompt:\n')
w('> ' + ROUTINE_PROMPT + '\n')
w('## 8. Not done\n')
w('- Nothing has been posted or sent. There is no LinkedIn connector in this session.')
w('- The screen recordings (days 3, 10, 24) are described, not made; each has a card to post instead.')
w('- The website contact, the pay-now switch and the sender mailbox (§2) are open.')
w('- Prospects are a CSV, not the `prospects/` board `docs/SALES-AGENT.md` §5 designs.')
open(MD_OUT, 'w').write('\n'.join(md) + '\n')

# ---------- HTML (the page) ----------
E = html.escape
def copybtn(target_id, label):
    return '<button class="copy" type="button" data-copy="%s">%s</button>' % (target_id, label)

posts_html = []
for p in POSTS:
    pid = 'p%02d' % p['day']
    text = fill(p['text'])
    parts = ['<article class="post" data-pillar="%s" id="%s">' % (p['pillar'], pid)]
    parts.append('<header class="post-h"><div class="day"><span class="mono">DAY %02d</span><span class="dow">%s</span></div>'
                 '<div class="post-t"><h3>%s</h3><div class="chips"><span class="chip">%s</span><span class="chip fmt">%s</span>'
                 '<span class="count mono">%d chars</span></div></div>'
                 '<label class="done"><input type="checkbox" id="done-%s" data-done="%s"> Posted</label></header>'
                 % (p['day'], DOW[(p['day'] - 1) % 7], E(p['title']), E(PILLARS[p['pillar']]), E(p['fmt']), len(text), pid, pid))
    if p['card']:
        alt = p['card'].get('headline') or p['card']['slides'][0]['headline']
        extra = '<span class="sub">Carousel, %d slides: upload the PDF as a document post.</span>' % len(p['card']['slides']) if p['card']['kind'] == 'carousel' else ''
        parts.append('<div class="shot"><img src="cards/%s.png" alt="%s" loading="lazy" width="1080" height="1350">%s</div>' % (cid(p), E(alt), extra))
    parts.append('<pre class="txt" id="%s-t">%s</pre>' % (pid, E(text)))
    parts.append('<p class="visual"><span class="lbl mono">VISUAL</span> %s</p>' % E(p['visual']))
    btns = [copybtn(pid + '-t', 'Copy post')]
    if p.get('answer'):
        parts.append('<div class="cmt"><span class="lbl mono">NEXT DAY · THE ANSWER, AS A COMMENT</span><pre class="txt small" id="%s-a">%s</pre></div>' % (pid, E(p['answer'])))
        if p.get('answer_card'):
            parts.append('<div class="shot"><img src="cards/%s-answer.png" alt="The answer" loading="lazy" width="1080" height="1350"></div>' % cid(p))
        btns.append(copybtn(pid + '-a', 'Copy answer'))
    if p['comment']:
        c = fill(p['comment'])
        parts.append('<div class="cmt"><span class="lbl mono">FIRST COMMENT</span><pre class="txt small" id="%s-c">%s</pre></div>' % (pid, E(c)))
        btns.append(copybtn(pid + '-c', 'Copy comment'))
    parts.append('<div class="btns">%s</div></article>' % ''.join(btns))
    posts_html.append(''.join(parts))

filters = ['<button class="flt on" type="button" data-f="all">All 30</button>']
used = []
for p in POSTS:
    if p['pillar'] not in used: used.append(p['pillar'])
for k in used:
    n = sum(1 for p in POSTS if p['pillar'] == k)
    filters.append('<button class="flt" type="button" data-f="%s">%s <span class="mono">%d</span></button>' % (k, E(PILLARS[k]), n))

seq_html = []
for i, s in enumerate(SEQUENCE):
    sid = 's%d' % i
    sub = ''
    if s.get('subject'):
        sub = '<p class="subj"><span class="lbl mono">SUBJECT</span> <code>%s</code></p>' % E(s['subject'])
    seq_html.append('<article class="step"><div class="step-h"><span class="mono when">%s</span><span class="chip %s">%s</span><h4>%s</h4></div>%s'
                    '<pre class="txt" id="%s">%s</pre><div class="btns">%s</div></article>'
                    % (E(s['when']), 'li' if s['channel'] == 'LinkedIn' else 'em', E(s['channel']), E(s['name']), sub, sid, E(fill(s['text'])), copybtn(sid, 'Copy')))

tg_html = ''
if targets:
    rows = []
    for t in sorted(targets, key=lambda r: (-int(r.get('fit') or 0), r.get('company', ''))):
        url = t.get('evidence_url', '')
        ev = E(t.get('evidence', ''))
        if url.startswith('http'):
            ev = '<a href="%s" target="_blank" rel="noopener">%s</a>' % (E(url), ev or 'source')
        site = t.get('website', '')
        if site and not site.startswith('http'): site = 'https://' + site
        name = E(t.get('company', ''))
        if site.startswith('http'):
            name = '<a href="%s" target="_blank" rel="noopener">%s</a>' % (E(site), name)
        rows.append('<tr><td class="fit f%s mono">%s</td><td><b>%s</b><div class="sub">%s</div></td><td>%s</td><td>%s</td><td>%s<div class="sub">%s</div></td></tr>'
                    % (E(t.get('fit', '')), E(t.get('fit', '')), name, E(t.get('hq', '')), E(t.get('markets', '')), E(t.get('hook', '')), ev, E(t.get('fit_reason', ''))))
    tg_html = ('<p class="lede">%d developers from public sources, company level only. Fit 3 is strongest. '
               'Check the growth board and the off-limits list before the first touch.</p>'
               '<div class="tbl targets"><table><thead><tr><th>Fit</th><th>Company</th><th>Markets</th><th>Reason to write now</th><th>Evidence</th></tr></thead><tbody>%s</tbody></table></div>'
               % (len(targets), ''.join(rows)))
else:
    tg_html = '<p class="lede">The researched list of developer accounts lands here next.</p>'

spec = ''.join('<li>%s</li>' % E(x) for x in PAGE['specialties'])
icp = ''.join('<tr><td>%s</td><td>%s</td></tr>' % (E(a), E(b)) for a, b in ICP)
hooks = ''.join('<li>%s</li>' % E(x) for x in HOOKS)
cad = ''.join('<tr><th>%s</th><td>%s</td></tr>' % (E(a), E(b)) for a, b in CADENCE)
met = ''.join('<tr><th>%s</th><td>%s</td></tr>' % (E(a), E(b)) for a, b in METRICS)
do = ''.join('<li>%s</li>' % E(x) for x in GUARDRAILS_DO)
dont = ''.join('<li>%s</li>' % E(x) for x in GUARDRAILS_DONT)
blk = ''.join('<li><b>%s</b> %s</li>' % (E(h), E(b)) for h, b in BLOCKERS)

page = open(os.path.join(HERE, 'page.html')).read()
for k, v in {
    '%%TAGLINE%%': E(PAGE['tagline']), '%%TAGLEN%%': str(len(PAGE['tagline'])),
    '%%ABOUT%%': E(PAGE['about']), '%%ABOUTLEN%%': '{:,}'.format(len(PAGE['about'])),
    '%%NAME%%': E(PAGE['name']), '%%WEBSITE%%': E(PAGE['website']), '%%INDUSTRY%%': E(PAGE['industry']),
    '%%BUTTON%%': E(PAGE['button']), '%%SPEC%%': spec, '%%SPECN%%': str(len(PAGE['specialties'])),
    '%%SPECTXT%%': E(', '.join(PAGE['specialties'])),
    '%%FILTERS%%': ''.join(filters), '%%POSTS%%': ''.join(posts_html),
    '%%ICP%%': icp, '%%TITLES%%': E(TITLES), '%%HOOKS%%': hooks, '%%SEQ%%': ''.join(seq_html),
    '%%CADENCE%%': cad, '%%METRICS%%': met, '%%TARGETS%%': tg_html, '%%TCOUNT%%': str(len(targets)) if targets else 'next',
    '%%ENGAGE%%': ''.join('<li>%s</li>' % E(x) for x in ENGAGE),
    '%%DO%%': do, '%%DONT%%': dont, '%%BLOCKERS%%': blk,
    '%%TRIAL%%': E(LINKS['trial']),
}.items():
    page = page.replace(k, v)
assert '%%' not in page, page[page.index('%%'):page.index('%%') + 40]
open(HTML_OUT, 'w').write(page)
print('md', len('\n'.join(md)), 'html', len(page), 'targets', len(targets))
