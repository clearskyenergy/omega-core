/* ═══════════════════════════════════════════════════════════════════════════════
   scripts/skyfund-sandbox/draft-sample.js — the fifth listing, still a draft
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The four in portals/skyfund/samples.js are already live or funded, so the
   sandbox had no way to show the half of SkyFund that happens BEFORE a
   campaign appears: a partner listing a site they already own and selling a
   share of its compute revenue, ClearSky reviewing it, and the launch that
   puts it in front of investors.

   This one is that campaign, seeded in `draft` under a partner org. Sign in
   to the sponsor console as anyone @northgatecompute.com to be its sponsor,
   or @csebuilders.com to be ClearSky and launch it. Its per-unit figures are
   computed by the real engine at build time like the other four, so the
   launch shows true numbers without the engine reaching the browser.

   Read by scripts/build-skyfund-sandbox.js only. ES5, node and browser.
   ═══════════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SKYFUND_DRAFT = factory();
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  function days(n) { return new Date(Date.now() + n * 86400000).toISOString(); }
  return {
    id: 'sample-compute-2', sample: true, status: 'draft', type: 'compute',
    title: '1.5 MW of operating compute capacity · Rockford, IL',
    tagline: 'A container park that is already energised and earning. The partner is selling a share of the hosting revenue from the racks it has spare.',
    sponsorName: 'Northgate Compute', sponsorOrgId: 'northgatecompute.com',
    location: { city: 'Rockford', state: 'IL' },
    goal: 570000, unitPrice: 100, unitsTotal: 5700, raised: 0, unitsSold: 0, backers: 0,
    minInvestment: 100, minRaise: 300000, deadline: days(60),
    /* codMonths 0: the site is built and running, so the crowd's first
       distribution is the next quarter, not a year after a construction. */
    offer: { kind: 'compute', sharePct: 38, termYears: 8, distributableAnnual: 270000, escalatorPct: 2, degradationPct: 0, codMonths: 0, platformFeePct: 3 },
    sizing: { kwIt: 1500, racks: 36 },
    perks: [ { id: 'p1', title: 'Backer', minAmount: 100, desc: 'Quarterly distributions and the project update feed.' },
             { id: 'p2', title: 'Rack sponsor', minAmount: 2500, desc: 'Everything above, plus your name on a rack door and a site visit.' } ],
    story: 'Northgate has run this park since 2024: six 250 kW containers on a nine-acre industrial parcel with a 4 MW ComEd service and dark fibre from two carriers. Four containers are leased to a single inference tenant on a three-year take-or-pay. The two the partner added last spring are the subject of this campaign.\n\nThe site is built, energised and earning today, so there is no construction risk in this raise and the first distribution is the quarter after it closes. Investors receive 38% of the distributable cash from the whole park — hosting revenue less power, maintenance and insurance — for eight years. Northgate keeps 62% and continues to operate it.',
    faq: [ { q: 'What is the money used for if the site is already built?', a: 'It buys the crowd a share of an operating asset. Northgate recycles the proceeds into the next two containers, which are not part of this offering.' },
            { q: 'What happens if the tenant leaves?', a: 'The lease is take-or-pay to 2028. After that the racks are re-let at market, and distributions move with the revenue — they are a share, never a fixed coupon.' } ],
    documents: [ { name: 'Offering summary (PDF)', url: '#' }, { name: 'Hosting agreement term sheet', url: '#' }, { name: 'Twelve months of metered output', url: '#' } ],
    /* An ARRAY of strings, the shape both pages render: the console edits one
       input per risk and the campaign page lists them. A single string here
       reaches .map() on both and takes the page down. */
    risks: [
      'Revenue is concentrated in one tenant until the take-or-pay ends in 2028; a re-let below today\'s rate lowers every distribution after it.',
      'The park is operating, so there is no construction risk in this raise — but no construction contingency either: a container that fails out of warranty is repaired out of distributable cash.',
      'Power is bought at a utility tariff that is not fixed for the term. A tariff increase the hosting rate does not follow reduces the cash the crowd shares in.'
    ]
  };
}));
