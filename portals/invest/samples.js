/* ═══════════════════════════════════════════════════════════════════════════════
   portals/invest/samples.js — the four sample campaigns (one copy, two readers)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Read by index.html (shown, clearly marked, when no campaign is live) and by
   scripts/seed-invest-demo.js (which publishes them for real). One file so
   the storefront's fallback and the seeded data cannot drift apart.

   The `headline` block on each is an OUTPUT of api/_lib/invest-math.js,
   copied in so a sample card can show a target yield without the formula
   ever reaching the browser. scripts/tests/tinvest-samples.js asserts these
   numbers still match the engine, so a change to either side fails CI.

   ES5. Runs in the browser (window.OMEGA_INVEST_SAMPLES) and in node
   (module.exports).
   ═══════════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OMEGA_INVEST_SAMPLES = factory();
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  function days(n) { return new Date(Date.now() + n * 86400000).toISOString(); }
  return [
    { id: 'sample-compute-1', sample: true, status: 'live', type: 'compute', title: '1 MW AI compute container · Joliet, IL',
      tagline: 'A 1 MW liquid-cooled container beside a ComEd substation with 1.6 MW of confirmed hosting capacity. Racks are pre-leased to two inference tenants.',
      sponsorName: 'ClearSky Development', sponsorOrgId: 'csebuilders.com', location: { city: 'Joliet', state: 'IL' },
      goal: 500000, unitPrice: 100, unitsTotal: 5000, raised: 187300, unitsSold: 1873, backers: 214, minInvestment: 100, minRaise: 250000,
      deadline: days(41),
      offer: { kind: 'compute', sharePct: 40, termYears: 10, distributableAnnual: 180000, escalatorPct: 2, degradationPct: 0, codMonths: 6, platformFeePct: 3 },
      headline: { unitPrice: 100, unitsTotal: 5000, targetYieldPct: 14.688, irrPct: 7.55, moic: 1.505, termYears: 10, sharePct: 40, kind: 'compute', paybackYear: 8 },
      sizing: { kwIt: 1000, racks: 24 },
      perks: [ { id: 'p1', title: 'Backer', minAmount: 100, desc: 'Quarterly distributions and the project update feed.' },
               { id: 'p2', title: 'Rack sponsor', minAmount: 2500, desc: 'Everything above, plus your name on a rack door and a site visit at commissioning.' },
               { id: 'p3', title: 'Founding investor', minAmount: 10000, desc: 'Everything above, plus first look at the sponsor\'s next three campaigns.' } ],
      story: 'The site is a 1.4-acre industrial parcel 300 feet from a ComEd 34.5 kV feeder with published hosting capacity. The container is a factory-built, liquid-cooled 1 MW block that ships in one piece and is commissioned in eight weeks. Two inference tenants have signed take-or-pay hosting agreements for 80% of the IT load at $135/kW-month, and the balance is sold on the spot compute marketplace.\n\nInvestors receive 40% of distributable cash — hosting revenue less power, maintenance and insurance — for ten years. The sponsor keeps 60% and carries the construction risk: nothing is drawn from the raise until the interconnection agreement is executed.',
      faq: [ { q: 'When do distributions start?', a: 'The first partial distribution is projected six months after the raise closes, once the container is energised. They are paid quarterly after that.' },
             { q: 'What if the raise does not reach its minimum?', a: 'Every dollar is returned. The minimum raise is $250,000; below that the campaign closes unfunded and card payments are refunded automatically.' } ],
      documents: [ { name: 'Offering summary (PDF)', url: '#' }, { name: 'Hosting agreement term sheet', url: '#' }, { name: 'ComEd hosting capacity screen', url: '#' } ] },

    { id: 'sample-microgrid-1', sample: true, status: 'live', type: 'microgrid', title: 'Solar + storage microgrid · Bridgeport food terminal',
      tagline: '2.1 MW of rooftop solar and a 4 MWh battery behind a cold-storage terminal, sold under a 15-year PPA at a 22% discount to the utility tariff.',
      sponsorName: 'Concord Energy', sponsorOrgId: 'concordenergyusa.com', location: { city: 'Bridgeport', state: 'CT' },
      goal: 1200000, unitPrice: 100, unitsTotal: 12000, raised: 1043900, unitsSold: 10439, backers: 612, minInvestment: 100, minRaise: 600000,
      deadline: days(9),
      offer: { kind: 'ppa', sharePct: 35, termYears: 15, distributableAnnual: 410000, escalatorPct: 1.5, degradationPct: 0.5, codMonths: 9, platformFeePct: 3 },
      headline: { unitPrice: 100, unitsTotal: 12000, targetYieldPct: 12.077, irrPct: 7.99, moic: 1.834, termYears: 15, sharePct: 35, kind: 'ppa', paybackYear: 9 },
      sizing: { mw: 2.1, mwh: 4 },
      perks: [ { id: 'p1', title: 'Backer', minAmount: 100, desc: 'Quarterly distributions and the project update feed.' },
               { id: 'p2', title: 'Panel sponsor', minAmount: 1000, desc: 'A named panel string and the commissioning-day tour.' } ],
      story: 'The terminal runs 24/7 refrigeration on an Eversource tariff with a $19/kW demand charge. Solar shaves the daytime load, the battery clips the evening peak, and both are sold to the host under one PPA. The host has signed; the interconnection study is complete; construction starts on close.\n\nInvestors receive 35% of PPA cash after O&M for fifteen years, paid quarterly.',
      faq: [ { q: 'Who operates the system?', a: 'Concord Energy under a 15-year O&M agreement with a production guarantee.' } ],
      documents: [ { name: 'Offering summary (PDF)', url: '#' }, { name: 'Executed PPA (redacted)', url: '#' } ] },

    { id: 'sample-bess-1', sample: true, status: 'funded', type: 'bess', title: '5 MWh grid battery · Claremont, CA',
      tagline: 'An 802 kW / 5 MWh battery on a school campus, dispatched into CAISO and the SGIP resiliency program. Funded, under construction.',
      sponsorName: 'ClearSky Development', sponsorOrgId: 'csebuilders.com', location: { city: 'Claremont', state: 'CA' },
      goal: 850000, unitPrice: 100, unitsTotal: 8500, raised: 850000, unitsSold: 8500, backers: 903, minInvestment: 100, minRaise: 500000,
      deadline: days(-20),
      offer: { kind: 'hybrid', sharePct: 45, termYears: 12, distributableAnnual: 350000, escalatorPct: 2, degradationPct: 1.5, codMonths: 4, platformFeePct: 3 },
      headline: { unitPrice: 100, unitsTotal: 8500, targetYieldPct: 18.617, irrPct: 14.32, moic: 2.22, termYears: 12, sharePct: 45, kind: 'hybrid', paybackYear: 6 },
      sizing: { mw: 0.802, mwh: 5 },
      perks: [ { id: 'p1', title: 'Backer', minAmount: 100, desc: 'Quarterly distributions and the project update feed.' } ],
      story: 'The executed Claremont deal: $2.7M gross capex, $810K ITC, $562K SGIP, and a $350K/yr value stack. This campaign funded the equity slice; the crowd holds 45% of distributable cash for twelve years.',
      faq: [], documents: [ { name: 'Offering summary (PDF)', url: '#' } ] },

    { id: 'sample-ev-1', sample: true, status: 'live', type: 'ev', title: 'DC fast-charging hub with storage · I-95 Stamford',
      tagline: 'Eight 350 kW dispensers and a 1.2 MWh buffer battery on a travel-plaza lease, with utility make-ready funding already awarded.',
      sponsorName: 'SPATCO Energy', sponsorOrgId: 'spatco.com', location: { city: 'Stamford', state: 'CT' },
      goal: 400000, unitPrice: 50, unitsTotal: 8000, raised: 62150, unitsSold: 1243, backers: 97, minInvestment: 50, minRaise: 200000,
      deadline: days(58),
      offer: { kind: 'hybrid', sharePct: 30, termYears: 10, distributableAnnual: 145000, escalatorPct: 3, degradationPct: 0, codMonths: 8, platformFeePct: 3 },
      headline: { unitPrice: 50, unitsTotal: 8000, targetYieldPct: 11.201, irrPct: 2.74, moic: 1.174, termYears: 10, sharePct: 30, kind: 'hybrid', paybackYear: 9 },
      sizing: { kw: 2800, mwh: 1.2 },
      perks: [ { id: 'p1', title: 'Backer', minAmount: 50, desc: 'Quarterly distributions and the project update feed.' },
               { id: 'p2', title: 'Charging credit', minAmount: 500, desc: 'Everything above, plus $100 of charging credit at opening.' } ],
      story: 'Charging revenue and demand-charge savings from the battery are pooled; investors receive 30% of distributable cash for ten years.',
      faq: [], documents: [ { name: 'Offering summary (PDF)', url: '#' } ] }
  ];
}));
