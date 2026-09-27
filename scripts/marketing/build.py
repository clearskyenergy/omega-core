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
import csv, html, json, os, re, sys
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
    for q in SEQUENCE + [q for b in PLAYBOOKS for q in b['sequence']]:
        yield q['text']; yield q.get('subject', '')
    for b in PLAYBOOKS:
        yield b['pitch']; yield b['offer']
    yield PLAY_FOLLOWUP
    for a in ACCOUNT_PLAYS:
        for pe in a['personas']:
            for m in pe['messages']:
                yield m['text']; yield m.get('subject', '')
for a in ACCOUNT_PLAYS:
    for pe in a['personas']:
        for m in pe['messages']:
            if m['name'] == 'Connection request':
                assert len(m['text'].replace('{First}', 'Christopher')) <= 300, (a['company'], len(m['text']))
# A dollar figure in millions or billions is a company's news (a financing,
# a program); anything else with a dollar sign is treated as a price.
PRICE = re.compile(r'\$\s?\d[\d,]*(\.\d+)?(?!\d|[.,]\d|\s?(M|B|bn|million|billion)\b)')
for t in public_strings():
    assert not PRICE.search(t) and '/offerings' not in t and 'price list' not in t.lower(), t[:120]

def cid(p):
    return 'day%02d' % p['day']

cards = []
for p in POSTS:
    if p['card']:
        meta = dict(sheet='%s-%d' % (SHEET_LETTER[p['pillar']], 100 + p['day']), project=PILLARS[p['pillar']])
        cards.append(dict(p['card'], id=cid(p), **meta))
        if p.get('answer_card'):
            cards.append(dict(p['answer_card'], id=cid(p) + '-answer', **meta))
cards.append(dict(REPLY_CARD_EXAMPLE, id='reply-example', sheet='A-000', project='Drop a Site'))
json.dump(cards, open(os.path.join(OUT, 'cards.json'), 'w'), indent=1, ensure_ascii=False)

def read_csv(path):
    if not os.path.exists(path):
        return []
    with open(path, newline='') as f:
        return list(csv.DictReader(f))

targets = read_csv(TARGETS)
small_targets = read_csv(os.path.join(REPO, 'docs/small-shop-targets.csv'))
ent_targets = read_csv(os.path.join(REPO, 'docs/enterprise-targets.csv'))

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
for b in PLAYBOOKS:
    w('## 5%s. %s\n' % ('b' if b['key'] == 'small' else 'c', b['headline']))
    w('**Who.** %s\n' % b['who'])
    w('**Signal.** %s\n' % b['signal'])
    w('**Pitch.** %s\n' % b['pitch'])
    w('**Offer.** %s\n' % b['offer'])
    w('**Finding them on LinkedIn**\n')
    for h, t in b['search']: w('- **%s:** %s' % (h, t))
    w('')
    if b.get('discovery'):
        w('**Discovery questions** (the call, not the message)\n')
        for x in b['discovery']: w('- ' + x)
        w('')
    for q in b['sequence']:
        w('#### %s · %s · %s\n' % (q['when'], q['channel'], q['name']))
        if q.get('subject'): w('Subject: `%s`\n' % q['subject'])
        w('```text\n' + fill(q['text']) + '\n```\n')
    w('**Careful**\n')
    for x in b['guard']: w('- ' + x)
    w('')
w('## 5e. Account plays\n')
w('Messages written for one company, from facts checked at the source. Two people per company in the first week at most; after a week of silence, one follow-up:\n')
w('```text\n' + PLAY_FOLLOWUP + '\n```\n')
for a in ACCOUNT_PLAYS:
    w('### %s\n' % a['company'])
    w('**Facts.** %s\n' % a['facts'])
    w('**Why now.** %s\n' % a['why'])
    for pe in a['personas']:
        w('#### %s\n' % pe['who'])
        w('*%s*\n' % pe['find'])
        for m in pe['messages']:
            w('%s · %s%s\n' % (m['channel'], m['name'], (' · subject `%s`' % m['subject']) if m.get('subject') else ''))
            w('```text\n' + m['text'] + '\n```\n')
w('## 4a. The recordings\n')
w('Build Tuesday and Speedrun Friday need a real screen recording. Setup:\n')
for x in RECORDING_SETUP: w('- ' + x)
w('\n**Never on camera:**\n')
for x in RECORDING_NEVER: w('- ' + x)
w('')
for r in RECORDINGS:
    w('**Day %s · %s** (%s)\n' % (r['days'], r['name'], r['length']))
    for n, x in enumerate(r['steps'], 1): w('%d. %s' % (n, x))
    w('')
w('## 5d. Ads (the page\'s ad credit)\n')
w('| | |\n|---|---|')
for a_, b_ in ADS: w('| %s | %s |' % (a_, b_))
w('')
w('## 6. Target accounts\n')
for label, path, rows in (('Small shops', 'docs/small-shop-targets.csv', small_targets), ('Big organizations', 'docs/enterprise-targets.csv', ent_targets)):
    w('- %s: `%s` (%s).' % (label, path, ('%d companies' % len(rows)) if rows else 'to come'))
w('')
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

def link(url, text):
    url = (url or '').split(' | ')[0].strip()   # a row may cite several sources; the first backs the hook
    if url and not url.startswith('http'):
        url = 'https://' + url
    return '<a href="%s" target="_blank" rel="noopener">%s</a>' % (E(url), text) if url.startswith('http') else text

def small_table(rows):
    if not rows:
        return '<p class="lede">The researched list of small shops lands here next.</p>'
    out = []
    for t in sorted(rows, key=lambda r: (-int(r.get('fit') or 0), r.get('company', ''))):
        out.append('<tr><td class="fit f%s mono">%s</td><td><b>%s</b><div class="sub">%s</div></td><td>%s</td><td>%s<div class="sub">%s</div></td></tr>'
                   % (E(t.get('fit', '')), E(t.get('fit', '')), link(t.get('website', ''), E(t.get('company', ''))), E(t.get('hq', '')),
                      E(t.get('markets', '')), link(t.get('evidence_url', ''), E(t.get('hook', '') or 'source')), E(t.get('fit_reason', ''))))
    return ('<p class="lede">%d small shops from public sources, company level only. Fit 3 is strongest.</p><div class="tbl targets"><table><thead><tr>'
            '<th>Fit</th><th>Company</th><th>Markets</th><th>Reason to write now</th></tr></thead><tbody>%s</tbody></table></div>' % (len(rows), ''.join(out)))

def ent_table(rows):
    if not rows:
        return '<p class="lede">The researched list of big organizations lands here next.</p>'
    out = []
    for t in sorted(rows, key=lambda r: (-int(r.get('fit') or 0), r.get('company', ''))):
        risk = t.get('risk', '')
        cls = ' risk' if 'competitor' in risk.lower() else ''
        out.append('<tr><td class="fit f%s mono">%s</td><td><b>%s</b><div class="sub">%s</div></td><td>%s<div class="sub">%s</div></td><td>%s<div class="sub%s">%s</div></td><td>%s</td></tr>'
                   % (E(t.get('fit', '')), E(t.get('fit', '')), link(t.get('website', ''), E(t.get('company', ''))), E(t.get('type', '')),
                      E(t.get('entry_team', '')), E(t.get('wedge', '')), E(t.get('known_tools', '') or 'Nothing public'), cls, E(risk),
                      link(t.get('evidence_url', ''), E(t.get('hook', '') or 'source'))))
    return ('<p class="lede">%d big organizations. Read the risk before anything else: a competitor gets no demo and no trial.</p><div class="tbl targets"><table><thead><tr>'
            '<th>Fit</th><th>Company</th><th>Way in</th><th>Their tools · risk</th><th>Reason to write now</th></tr></thead><tbody>%s</tbody></table></div>' % (len(rows), ''.join(out)))

def playbook_html(b):
    h = ['<section id="%s"><div class="sh"><span class="no">%s</span><h2>%s</h2></div>' % (b['key'], b['sheet'], E(b['headline']))]
    h.append('<p class="lede">%s</p>' % E(b['who']))
    h.append('<div class="panel"><div class="field"><div class="k">SIGNAL</div><div class="v">%s</div></div><div class="field"><div class="k">PITCH</div><div class="v">%s</div></div><div class="field"><div class="k">OFFER</div><div class="v">%s</div></div></div>'
             % (E(b['signal']), E(b['pitch']), E(b['offer'])))
    h.append('<h3>Finding them on LinkedIn</h3><div class="tbl"><table><tbody>%s</tbody></table></div>' % ''.join('<tr><th>%s</th><td>%s</td></tr>' % (E(x), E(y)) for x, y in b['search']))
    if b.get('discovery'):
        h.append('<h3>Discovery questions, for the call</h3><ul class="plain">%s</ul>' % ''.join('<li>%s</li>' % E(x) for x in b['discovery']))
    h.append('<h3>The messages</h3><div class="steps">')
    for i, q in enumerate(b['sequence']):
        sid = '%s-s%d' % (b['key'], i)
        sub = '<p class="subj"><span class="lbl mono">SUBJECT</span> <code>%s</code></p>' % E(q['subject']) if q.get('subject') else ''
        h.append('<article class="step"><div class="step-h"><span class="mono when">%s</span><span class="chip li">%s</span><h4>%s</h4></div>%s<pre class="txt" id="%s">%s</pre><div class="btns">%s</div></article>'
                 % (E(q['when']), E(q['channel']), E(q['name']), sub, sid, E(fill(q['text'])), copybtn(sid, 'Copy')))
    h.append('</div><div class="rules dont"><h3>Careful</h3><ul>%s</ul></div>' % ''.join('<li>%s</li>' % E(x) for x in b['guard']))
    h.append(small_table(small_targets) if b['key'] == 'small' else ent_table(ent_targets))
    h.append('</section>')
    return ''.join(h)

def plays_html():
    h = ['<section id="plays"><div class="sh"><span class="no">S-306</span><h2>Account plays</h2></div>',
         '<p class="lede">Messages written for one company, from facts checked at the source. Two people per company in the first week at most. Never mention their tools or job posts; their own sites only under NDA.</p>']
    for n, a in enumerate(ACCOUNT_PLAYS):
        h.append('<div class="panel"><h3>%s</h3><p class="sub" style="margin-top:6px">%s</p><p style="margin-top:8px">%s</p></div>' % (E(a['company']), E(a['facts']), E(a['why'])))
        for k, pe in enumerate(a['personas']):
            h.append('<h4>%s</h4><p class="sub">%s</p><div class="steps">' % (E(pe['who']), E(pe['find'])))
            for j, m in enumerate(pe['messages']):
                mid = 'play-%d-%d-%d' % (n, k, j)
                sub = '<p class="subj"><span class="lbl mono">SUBJECT</span> <code>%s</code></p>' % E(m['subject']) if m.get('subject') else ''
                h.append('<article class="step"><div class="step-h"><span class="chip li">%s</span><h4>%s</h4></div>%s<pre class="txt" id="%s">%s</pre><div class="btns">%s</div></article>'
                         % (E(m['channel']), E(m['name']), sub, mid, E(m['text']), copybtn(mid, 'Copy')))
            h.append('</div>')
    h.append('<h4>After a week of silence, once</h4><pre class="txt" id="play-fu">%s</pre><div class="btns">%s</div></section>' % (E(PLAY_FOLLOWUP), copybtn('play-fu', 'Copy')))
    return ''.join(h)

playbooks_html = ''.join(playbook_html(b) for b in PLAYBOOKS) + plays_html()
rec_html = ('<div class="two"><div class="rules do"><h3>Setup</h3><ul>%s</ul></div><div class="rules dont"><h3>Never on camera</h3><ul>%s</ul></div></div>'
            % (''.join('<li>%s</li>' % E(x) for x in RECORDING_SETUP), ''.join('<li>%s</li>' % E(x) for x in RECORDING_NEVER)))
rec_html += '<div class="steps">' + ''.join(
    '<article class="step"><div class="step-h"><span class="mono when">DAY %s</span><span class="chip">%s</span><h4>%s</h4></div><ol class="blk">%s</ol></article>'
    % (E(r['days']), E(r['length']), E(r['name']), ''.join('<li>%s</li>' % E(x) for x in r['steps'])) for r in RECORDINGS) + '</div>'
ads_html = ''.join('<tr><th>%s</th><td>%s</td></tr>' % (E(a), E(b)) for a, b in ADS)
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
    '%%REPLY%%': '<div class="shot"><img src="cards/reply-example.png" alt="Site screened reply card (template)" loading="lazy" width="1080" height="1350"><span class="sub">The reply card, with blanks where the tool\'s results go.</span></div>',
    '%%DO%%': do, '%%DONT%%': dont, '%%BLOCKERS%%': blk,
    '%%TRIAL%%': E(LINKS['trial']), '%%PLAYBOOKS%%': playbooks_html, '%%RECORDINGS%%': rec_html, '%%ADS%%': ads_html,
}.items():
    page = page.replace(k, v)
assert '%%' not in page, page[page.index('%%'):page.index('%%') + 40]
open(HTML_OUT, 'w').write(page)
print('md', len('\n'.join(md)), 'html', len(page), 'targets', len(targets))
