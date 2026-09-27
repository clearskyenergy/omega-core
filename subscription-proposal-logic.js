/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * The Subscription Proposal deck: seven US-Letter pages drawn from what
 * POST /api/subscription-proposal returned. No arithmetic here beyond
 * counting rows; every dollar string arrived formatted from the server.
 * Shared by the rep's tool (subscription-proposal.html) and the customer's
 * page (proposal.html); prints to PDF from the browser.
 */
(function (global) {
  'use strict';
  var ACCENT = '#1F4E8C', INK = '#14171A', GRAY = '#5B6672', RULE = '#D9DEE5', PAPER = '#F5F7FA';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function hex(c) { return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : null; }
  function safeUrl(u) { return typeof u === 'string' && (/^https:\/\/[^\s"'<>\\]+$/i.test(u) || /^\/(?!\/)[^\s"'<>\\]*$/.test(u)) ? u : ''; }
  function date(v) {
    var d = v == null ? null : new Date(typeof v === 'number' ? v : Date.parse(v));
    if (!d || isNaN(d.getTime())) return '';
    var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return months[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear();
  }
  function palette(brand) {
    var c = brand && brand.colors ? brand.colors : {};
    return { accent: hex(c.primary) || hex(c.accent) || ACCENT, ink: hex(c.ink) || INK };
  }
  function css() {
    return [
      '@page{size:letter;margin:0}',
      '.sp-frame{--sp-scale:1;width:calc(8.5in * var(--sp-scale));margin:0 auto}',
      '.sp-frame>.sp-page{transform:scale(var(--sp-scale));transform-origin:0 0;margin-bottom:calc(16px + 11in * (var(--sp-scale) - 1))}',
      '.sp-page{position:relative;box-sizing:border-box;width:8.5in;height:11in;padding:.65in .75in .8in;background:#fff;color:var(--sp-ink);',
      'font:10pt/1.4 "Inter",system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;overflow:hidden;box-shadow:0 1px 2px rgba(16,24,40,.08),0 6px 20px rgba(16,24,40,.08);',
      '-webkit-print-color-adjust:exact;print-color-adjust:exact;break-after:page;page-break-after:always;break-inside:avoid;page-break-inside:avoid}',
      '.sp-page:last-child{break-after:auto;page-break-after:auto}.sp-page *{box-sizing:border-box}',
      '.sp-page h1,.sp-page h2,.sp-page h3,.sp-page p,.sp-page ul,.sp-page table{margin:0;padding:0}.sp-page ul{list-style:none}',
      '.sp-kicker{font-size:8pt;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--sp-accent)}',
      '.sp-h1{font-size:22pt;line-height:1.15;font-weight:700;margin-top:6pt}.sp-h2{font-size:13pt;font-weight:700;margin:14pt 0 6pt}.sp-lead{font-size:11pt;color:' + GRAY + ';margin-top:6pt}',
      '.sp-mark{position:absolute;right:.75in;top:.55in;max-width:2.1in;text-align:right}.sp-mark img{max-height:.55in;max-width:2.1in;width:auto;height:auto;display:inline-block}.sp-mark b{font-size:10pt}',
      '.sp-foot{position:absolute;left:.75in;right:.75in;bottom:.45in;display:flex;justify-content:space-between;gap:12pt;border-top:.6pt solid ' + RULE + ';padding-top:5pt;font-size:7.5pt;color:' + GRAY + '}',
      '.sp-foot span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.sp-cover{padding-top:1.6in}.sp-cover .sp-h1{font-size:30pt}.sp-pill{display:inline-block;margin-top:18pt;padding:8pt 16pt;border-radius:20pt;background:var(--sp-accent);color:#fff;font-weight:700;font-size:12pt}',
      '.sp-cover-meta{margin-top:26pt;font-size:10pt;color:' + GRAY + '}.sp-cover-meta b{color:var(--sp-ink)}.sp-tag{margin-top:10pt;font-size:11pt;font-style:italic;color:var(--sp-accent)}',
      '.sp-table{width:100%;border-collapse:collapse;font-size:9pt}.sp-table th{text-align:left;font-size:7.5pt;letter-spacing:.08em;text-transform:uppercase;color:' + GRAY + ';padding:4pt 6pt;border-bottom:1pt solid var(--sp-accent)}',
      '.sp-table td{padding:4.5pt 6pt;border-bottom:.5pt solid ' + RULE + ';vertical-align:top}.sp-table td.n,.sp-table th.n{text-align:right;white-space:nowrap}.sp-table tr.total td{font-weight:700;border-top:1pt solid var(--sp-ink);border-bottom:0}',
      '.sp-muted{color:' + GRAY + '}.sp-small{font-size:8pt}.sp-note{font-size:8pt;color:' + GRAY + ';margin-top:6pt}',
      '.sp-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10pt;margin-top:10pt}.sp-stat{border:.6pt solid ' + RULE + ';border-radius:6pt;padding:10pt 12pt;background:' + PAPER + '}',
      '.sp-stat .k{font-size:7.5pt;letter-spacing:.08em;text-transform:uppercase;color:' + GRAY + '}.sp-stat .v{font-size:17pt;font-weight:700;margin-top:3pt;color:var(--sp-ink)}.sp-stat .v.a{color:var(--sp-accent)}.sp-stat .s{font-size:8pt;color:' + GRAY + ';margin-top:2pt}',
      '.sp-cols{display:grid;grid-template-columns:1fr 1fr;gap:16pt}.sp-list li{padding:3pt 0 3pt 12pt;position:relative;font-size:9.5pt}.sp-list li:before{content:"";position:absolute;left:0;top:8pt;width:5pt;height:5pt;border-radius:50%;background:var(--sp-accent)}',
      '.sp-ans{display:inline-block;min-width:78pt;font-size:7.5pt;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:2pt 6pt;border-radius:3pt;margin-right:6pt}',
      '.sp-ans.q{background:var(--sp-accent);color:#fff}.sp-ans.y{background:#FFF4D6;color:#8A5A00}.sp-ans.n{background:' + PAPER + ';color:' + GRAY + '}',
      '.sp-box{border:.6pt solid ' + RULE + ';border-radius:6pt;padding:10pt 12pt;margin-top:8pt}.sp-box h3{font-size:9pt;text-transform:uppercase;letter-spacing:.08em;color:var(--sp-accent);margin-bottom:4pt}',
      '.sp-sign{display:grid;grid-template-columns:1fr 1fr;gap:28pt;margin-top:22pt}.sp-sign .line{border-bottom:.8pt solid var(--sp-ink);height:20pt;margin-top:16pt}.sp-sign .lbl{font-size:7.5pt;color:' + GRAY + ';margin-top:2pt}',
      '.sp-terms li{padding:4pt 0;border-bottom:.5pt solid ' + RULE + ';font-size:9.5pt}.sp-terms b{display:inline-block;min-width:1.5in;color:var(--sp-accent)}',
      '.sp-plan{display:flex;justify-content:space-between;align-items:baseline;gap:12pt;padding:12pt 14pt;border-radius:6pt;background:' + PAPER + ';border-left:4pt solid var(--sp-accent)}.sp-plan .name{font-size:14pt;font-weight:700}.sp-plan .price{font-size:16pt;font-weight:700;color:var(--sp-accent);white-space:nowrap}',
      '@media print{.sp-frame{width:auto}.sp-frame>.sp-page{transform:none;margin:0;box-shadow:none}}'
    ].join('');
  }
  function head(m, kicker, title, lead) {
    return '<div class="sp-kicker">' + esc(kicker) + '</div><h1 class="sp-h1">' + esc(title) + '</h1>' + (lead ? '<p class="sp-lead">' + esc(lead) + '</p>' : '') + mark(m);
  }
  function mark(m) {
    var b = m.brand;
    return '<div class="sp-mark">' + (b.logoUrl ? '<img src="' + esc(b.logoUrl) + '" alt="' + esc(b.name) + '">' : '<b>' + esc(b.name) + '</b>') + '</div>';
  }
  function foot(m, n, total) {
    var left = [m.brand.name, m.p.prospect.company, m.brand.attribution].filter(Boolean).map(esc).join(' · ');
    return '<div class="sp-foot"><span>' + left + '</span><span>' + (m.validUntil ? 'Valid until ' + esc(m.validUntil) + ' · ' : '') + 'Page ' + n + ' of ' + total + '</span></div>';
  }
  function page(cls, inner) { return '<section class="sp-page' + (cls ? ' ' + cls : '') + '">' + inner + '</section>'; }
  function cover(m) {
    var p = m.p, who = p.prospect.contactName ? 'Prepared for ' + p.prospect.contactName + ', ' + p.prospect.company : 'Prepared for ' + p.prospect.company;
    return mark(m) + '<div class="sp-cover"><div class="sp-kicker">Subscription proposal</div><h1 class="sp-h1">' + esc(p.prospect.company) + '</h1>'
      + '<p class="sp-lead">' + esc(who) + '</p>' + (m.brand.tagline ? '<p class="sp-tag">' + esc(m.brand.tagline) + '</p>' : '')
      + '<div class="sp-pill">' + esc(p.pricing.planDisplay) + ' · ' + esc(p.pricing.display.recurring) + '</div>'
      + '<div class="sp-cover-meta">' + esc(date(p.sentAt || p.updatedAt || p.createdAt)) + '<br>Prepared by <b>' + esc(m.repName) + '</b>, ' + esc(m.brand.name)
      + (m.brand.platformName && m.brand.platformName !== m.brand.name ? ' · ' + esc(m.brand.platformName) : '') + '</div></div>';
  }
  function heard(m) {
    var p = m.p, d = p.discovery || {}, rows = '', spend = '';
    (m.questions || []).forEach(function (q) {
      var a = d.answers ? d.answers[q.key] : 'no', cls = a === 'quarter' ? 'q' : a === 'year' ? 'y' : 'n', label = a === 'quarter' ? 'This quarter' : a === 'year' ? 'Within the year' : 'Not now';
      var more = (q.more || []).filter(function (x) { return d.flags && d.flags[x.key]; }).map(function (x) { return x.text; });
      if (q.key === 'ev' && d.evPerMonth != null) more.push(d.evPerMonth + ' applications a month');
      if (q.key === 'permitting' && d.permittingWhere) more.push(d.permittingWhere);
      rows += '<li><span class="sp-ans ' + cls + '">' + label + '</span>' + esc(q.text) + (more.length ? ' <span class="sp-muted">— ' + esc(more.join(', ')) + '</span>' : '') + '</li>';
    });
    var v = p.value || {};
    if (v.spendTodayCents) {
      spend = '<table class="sp-table"><thead><tr><th>What you pay today</th><th class="n">Per month</th></tr></thead><tbody>'
        + (v.byCategory || []).filter(function (c) { return c.cents; }).map(function (c) { return '<tr><td>' + esc(c.text) + '</td><td class="n">' + esc(c.display) + '</td></tr>'; }).join('')
        + '<tr class="total"><td>Today</td><td class="n">' + esc(v.display.spendToday) + '</td></tr></tbody></table>';
    } else spend = '<p class="sp-note">No spend figures were given, so the value page compares nothing it was not told.</p>';
    return head(m, 'What we heard', 'How ' + p.prospect.company + ' works today', 'Twelve questions. “This quarter” is in the starting package; “within the year” is the next rung.')
      + '<ul class="sp-list" style="margin-top:10pt">' + rows + '</ul>' + '<h2 class="sp-h2">The money question</h2>' + spend
      + (v.paysToday ? '<p class="sp-note">' + esc(v.paysToday) + '</p>' : '') + (v.heard ? '<p class="sp-note">' + esc(v.heard) + '</p>' : '');
  }
  function packagePage(m) {
    var p = m.p, pr = p.pricing, of = p.orderForm, rows = of.schedule.map(function (s) {
      return '<tr><td><b>' + esc(s.name) + '</b><br><span class="sp-muted sp-small">' + esc((s.features || []).join(' · ')) + '</span></td><td>' + esc(s.included || '—') + '</td><td class="n">' + esc(s.unitDisplay) + '</td></tr>';
    }).join('');
    var next = (p.recommendation && p.recommendation.next || []).map(function (n) { return '<li><b>' + esc(n.name) + '</b> — ' + esc(n.trigger) + '</li>'; }).join('');
    var notes = (p.recommendation && p.recommendation.notes || []).map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('');
    return head(m, 'Your package', pr.planDisplay, pr.planRule)
      + '<div class="sp-plan" style="margin-top:12pt"><div><div class="name">' + esc(pr.planDisplay) + '</div><div class="sp-muted sp-small">' + esc(pr.planRule) + (pr.display.savingsVsList ? ' · ' + esc(pr.display.savingsVsList) : '') + '</div></div><div class="price">' + esc(pr.display.recurring) + '</div></div>'
      + '<table class="sp-table" style="margin-top:12pt"><thead><tr><th>Module</th><th>Included usage</th><th class="n">List price</th></tr></thead><tbody>' + rows + '</tbody></table>'
      + '<p class="sp-note">' + esc(p.terms.logins) + '.</p>'
      + (next ? '<h2 class="sp-h2">The next rungs</h2><ul class="sp-list">' + next + '</ul>' : '')
      + (notes ? '<h2 class="sp-h2">Please note</h2><ul class="sp-list sp-small">' + notes + '</ul>' : '');
  }
  function valuePage(m) {
    var p = m.p, v = p.value || {}, d = v.display || {}, pr = p.pricing, body;
    if (v.spendTodayCents) {
      body = '<div class="sp-stats"><div class="sp-stat"><div class="k">Today</div><div class="v">' + esc(d.spendToday) + '</div><div class="s">tools, consultants, drafting, data</div></div>'
        + '<div class="sp-stat"><div class="k">With ' + esc(m.brand.platformName) + '</div><div class="v a">' + esc(d.ours) + '</div><div class="s">' + esc(pr.planDisplay) + (d.oursFirst ? ' · ' + esc(d.oursFirst) : '') + '</div></div>'
        + '<div class="sp-stat"><div class="k">Difference</div><div class="v">' + esc(d.delta) + '</div><div class="s">' + esc(d.yearly) + ' · ' + esc(d.quarterly) + '</div></div></div>';
    } else body = '<div class="sp-box"><h3>Your numbers</h3><p>Tell us what you pay today for tools, consultants, drafting and data, and this page shows the difference in your own figures. With ' + esc(m.brand.platformName) + ' the package is <b>' + esc(d.ours || pr.display.recurring) + '</b>' + (d.oursFirst ? ', ' + esc(d.oursFirst) : '') + '.</p></div>';
    var usage = (v.usage || []).filter(function (u) { return u.display; }).map(function (u) { return '<li>' + esc(u.display) + '</li>'; }).join('');
    var included = (pr.display.usage || []).map(function (u) { return '<li>' + esc(u) + ' included</li>'; }).join('');
    return head(m, 'Value', 'In your own numbers', 'Nothing on this page is a projection. It is what you told us against what the package costs.')
      + body + (usage ? '<h2 class="sp-h2">Included work, at what you pay for it today</h2><ul class="sp-list">' + usage + '</ul>' + (d.usageValue ? '<p class="sp-note">' + esc(d.usageValue) + '.</p>' : '') : included ? '<h2 class="sp-h2">Included each cycle</h2><ul class="sp-list">' + included + '</ul>' : '')
      + '<h2 class="sp-h2">What changes</h2><ul class="sp-list">' + (p.orderForm.schedule || []).map(function (s) { return '<li><b>' + esc(s.name) + ':</b> ' + esc((s.features || []).join(', ')) + '</li>'; }).join('') + '</ul>';
  }
  function termsPage(m) {
    var t = m.p.terms, items = [['Payment', t.election], ['Billing date', t.billingDate], ['Trial', t.trial], ['Credit', t.credit], ['Service fee', t.serviceFee], ['Changes', t.addRemove], ['Logins', t.logins]];
    (t.usage || []).forEach(function (u) { items.push(['Usage', u]); });
    items.push(['Initial Term', t.initialTermMonths + ' months; unit prices hold for the Initial Term (Inaugural Pricing)']);
    items.push(['Price book', t.pricebookVersion + '; a later book never reprices a signed package']);
    items.push(['Validity', 'This proposal is open for ' + t.validDays + ' days' + (m.validUntil ? ', until ' + m.validUntil : '')]);
    items.push(['Agreement', t.agreement]);
    return head(m, 'Terms', 'How it works', 'Plain terms. The Subscription Agreement governs; this page summarises the Order Form.')
      + '<ul class="sp-terms" style="margin-top:8pt">' + items.map(function (i) { return '<li><b>' + esc(i[0]) + '</b>' + esc(i[1]) + '</li>'; }).join('') + '</ul>';
  }
  function orderPage(m) {
    var p = m.p, of = p.orderForm, c = of.customer, addr = c.address || {}, lines = '';
    of.schedule.forEach(function (s) { lines += '<tr><td>' + esc(s.name) + '</td><td>' + esc(s.included || '—') + '</td><td>' + esc(s.overage || '—') + '</td><td class="n">' + esc(s.unitDisplay) + '</td></tr>'; });
    var totals = '<tr><td colspan="3">' + esc(of.plan.name) + ' — ' + esc(of.plan.rule) + '</td><td class="n">' + esc(of.totals.monthly) + '</td></tr>'
      + '<tr><td colspan="3">Builder logins ' + of.logins.builders + ' · viewer logins ' + of.logins.viewers + ' <span class="sp-muted sp-small">(extra ' + esc(of.logins.extraBuilder) + ' / ' + esc(of.logins.extraViewer) + ')</span></td><td class="n">included</td></tr>'
      + (of.credit ? '<tr><td colspan="3">Transformation credit, ' + of.credit.pct + '% for the first ' + of.credit.days + ' days</td><td class="n">' + esc(of.credit.monthlyDisplay) + '</td></tr>' : '')
      + '<tr><td colspan="3">Annual service fee' + (of.serviceFee.mode !== 'standard' ? ' (' + esc(of.serviceFee.mode) + (of.serviceFee.reason ? ': ' + esc(of.serviceFee.reason) : '') + ')' : '') + '</td><td class="n">' + esc(of.serviceFee.display) + '</td></tr>'
      + (of.totals.first ? '<tr class="total"><td colspan="3">During the credit window</td><td class="n">' + esc(of.totals.first) + '</td></tr>' : '')
      + '<tr class="total"><td colspan="3">Monthly subscription' + (of.totals.annualPrepay ? ' (annual prepay ' + esc(of.totals.annualPrepay) + ')' : '') + '</td><td class="n">' + esc(of.totals.monthly) + '</td></tr>';
    return head(m, 'Order Form', of.agreement.split(' (')[0], 'Order Form · ' + esc(date(of.date)) + ' · price book ' + of.pricebookVersion)
      + '<div class="sp-cols" style="margin-top:10pt"><div class="sp-box"><h3>Customer</h3><b>' + esc(c.company) + '</b><br>' + esc(c.contactName) + (c.email ? '<br>' + esc(c.email) : '') + (c.phone ? '<br>' + esc(c.phone) : '')
      + (addr.line1 ? '<br>' + esc(addr.line1) + '<br>' + esc([addr.city, addr.state, addr.postalCode].filter(Boolean).join(', ')) + (addr.country ? ' ' + esc(addr.country) : '') : '') + (c.domain ? '<br><span class="sp-muted sp-small">workspace ' + esc(c.domain) + '</span>' : '') + '</div>'
      + '<div class="sp-box"><h3>Supplier</h3><b>' + esc(of.supplier) + '</b><br>' + esc(m.repName) + '<br>' + esc(m.repEmail) + '<br><span class="sp-muted sp-small">' + esc(of.term.election) + '</span></div></div>'
      + '<table class="sp-table" style="margin-top:12pt"><thead><tr><th>Module schedule</th><th>Included usage</th><th>Overage</th><th class="n">Unit price</th></tr></thead><tbody>' + lines + totals + '</tbody></table>'
      + '<p class="sp-note">Initial Term ' + of.term.initialTermMonths + ' months. Adding a module in the product is an amendment to this Order Form at the published unit price, prorated to the billing date. Removals take effect at the quarterly review. Tax is added by QuickBooks where it applies.</p>'
      + '<div class="sp-sign">' + of.signatures.map(function (s) { return '<div><b>' + esc(s.party) + '</b><div class="line"></div><div class="lbl">Signature</div><div class="line" style="margin-top:10pt"></div><div class="lbl">Name and title' + (s.name ? ' — ' + esc(s.name) : '') + '</div><div class="line" style="margin-top:10pt"></div><div class="lbl">Date</div></div>'; }).join('') + '</div>';
  }
  function nextPage(m) {
    var p = m.p, accept = m.acceptUrl ? '<p>Accept online: <b>' + esc(m.acceptUrl) + '</b></p>' : '<p>Accept from the link in the email, or reply to it.</p>';
    return head(m, 'Next steps', 'From yes to working', 'What happens once you accept.')
      + '<ol style="margin:12pt 0 0 16pt;font-size:10pt;line-height:1.6"><li>You accept this proposal' + (p.prospect.existing ? ' from your workspace' : ' and create your workspace with your billing details') + '.</li>'
      + '<li>' + esc(m.brand.name) + ' sets up your account in QuickBooks' + (p.prospect.existing ? '.' : ' and approves the workspace; your one trial of at most ' + esc(String(m.trialDays || 14)) + ' days starts then.') + '</li>'
      + '<li>' + (p.prospect.existing && p.prospect.existing.packaged ? 'The change is invoiced in QuickBooks, prorated to your billing date; the modules switch on when the payment clears.' : 'The first invoice is issued in QuickBooks at trial end, prorated to your billing date. Pay by card or ACH from the invoice.') + '</li>'
      + '<li>Add more from inside the product whenever you need it; review the package with us every quarter.</li></ol>'
      + '<div class="sp-box" style="margin-top:16pt"><h3>How to accept</h3>' + accept + '<p class="sp-muted sp-small">' + esc(m.repName) + ' · ' + esc(m.repEmail) + (m.brand.attribution ? ' · ' + esc(m.brand.attribution) : '') + '</p></div>';
  }
  /* proposal: the record as the endpoint projects it. opts: { questions, acceptUrl, trialDays }. */
  function render(proposal, brand, opts) {
    opts = opts || {};
    if (!proposal || !proposal.pricing || !proposal.orderForm || !proposal.terms) throw new Error('A priced proposal is required');
    brand = brand || (proposal.sender && proposal.sender.brand) || {};
    var pal = palette(brand), m = { p: proposal, brand: { name: brand.name || 'ClearSky Energy Solutions', logoUrl: safeUrl(brand.logoUrl), tagline: brand.tagline || '', attribution: brand.attribution || '', platformName: brand.platformName || 'ClearSky-OMEGA' },
      repName: (proposal.sender && (proposal.sender.name || proposal.sender.email)) || 'ClearSky', repEmail: (proposal.sender && proposal.sender.email) || '',
      validUntil: proposal.acceptance && proposal.acceptance.validUntil ? date(proposal.acceptance.validUntil) : '', questions: opts.questions || [], acceptUrl: opts.acceptUrl || '', trialDays: opts.trialDays };
    var pages = [cover, heard, packagePage, valuePage, termsPage, orderPage, nextPage], html = '';
    pages.forEach(function (fn, i) { html += page(i === 0 ? 'sp-first' : '', fn(m) + foot(m, i + 1, pages.length)); });
    return '<div class="sp-frame" style="--sp-accent:' + pal.accent + ';--sp-ink:' + pal.ink + '">' + html + '</div>';
  }
  var API = { css: css, render: render, pageCount: 7, esc: esc, date: date };
  global.SubscriptionProposalDeck = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : this);
