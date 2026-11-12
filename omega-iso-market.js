/* ═══════════════════════════════════════════════════════════════════════════
   ClearSky-OMEGA · omega-iso-market.js  (v1 · 2026-11-11)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   WHICH WHOLESALE MARKET a site is in, and what that market's structure
   means for what we screen there — the ONE copy, read by the server (the
   portfolio screen and assessment require it) and the browser (the Grid
   Atlas pin loads it), like omega-fiber-confirm.js.

   WHY (2026-11-11, Tommy: "we need to be very accurate and the grid atlas
   should know what iso market we are in and what the rules are in those
   markets and this should all be given in the due diligence reports"):
   the assessment knew the UTILITY but not the market, so a battery case in
   Oklahoma said only "not in that market" without naming SPP or saying
   that SPP has no capacity auction to earn from.

   HOW IT RESOLVES — membership first, geography second:
     1 · the serving UTILITY: RTO membership is a fact about the utility,
         not the ground (ComEd is a PJM member wherever the parcel sits).
     2 · the STATE default, with `split: true` wherever more than one
         market serves the state — said, never guessed over.
   The Grid Atlas pin also has the ISO/RTO polygon layer (HIFLD), which is
   the geographic read; `fromName()` maps a polygon's NAME to these keys so
   the pin and the server speak the same record.

   THE RULES ARE REPORTED, NEVER A LEGAL STATUS (the zoning tracker's own
   discipline): each market's record states the operator's published
   structure — whether a capacity market exists, the ancillary products a
   battery can bid, the storage participation model, where DER aggregation
   stands, FERC jurisdiction — with the operator's own page as the source
   and a reviewedAt date. Participation details move; `note` on every
   record says to confirm with the operator and the aggregator before
   pricing. Nothing here is a revenue rate: rates live in the battery
   set's `revenue` (assess-bess.js) and a workspace's own
   portfolioAssessment figures.

   ES5 on purpose (CLAUDE.md: no build step). Pure: no network, no clock.
   scripts/tests/tisomarket.js holds it.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var VERSION = 1, REVIEWED = '2026-11-11';
  var CONFIRM = 'Reported from the operator’s published market structure (reviewed ' + REVIEWED + '); not legal or market advice. Confirm participation and current rules with the operator and the aggregator before pricing.';

  /* ── the markets: structure facts a screen may repeat, each sourced ── */
  var MARKETS = {
    pjm: {
      key: 'pjm', label: 'PJM Interconnection', ferc: true,
      capacity: { exists: true, name: 'Reliability Pricing Model (RPM) capacity auctions', words: 'A centralized capacity market: capacity is a biddable revenue stream.' },
      ancillary: 'Regulation (RegA/RegD) and synchronized / secondary reserves are biddable products.',
      storage: 'Electric Storage Resource participation model (FERC Order 841).',
      aggregation: 'DER and storage aggregations under FERC Order 2222 are phasing in through PJM’s approved compliance plan.',
      bess: 'A battery here can earn regulation, reserves, capacity and energy arbitrage through a member or aggregator.',
      sources: [{ label: 'PJM markets & operations', url: 'https://www.pjm.com/markets-and-operations' }]
    },
    miso: {
      key: 'miso', label: 'MISO (Midcontinent ISO)', ferc: true,
      capacity: { exists: true, name: 'seasonal Planning Resource Auction (PRA)', words: 'A seasonal capacity auction; accreditation rules set what a battery counts for.' },
      ancillary: 'Regulation, spinning and supplemental reserves, and a ramp product are biddable.',
      storage: 'Electric Storage Resource participation model (FERC Order 841).',
      aggregation: 'DER aggregation under FERC Order 2222 follows MISO’s approved, later-dated compliance timeline.',
      bess: 'A battery here can earn regulation, reserves, seasonal capacity and arbitrage through a market participant.',
      sources: [{ label: 'MISO markets & operations', url: 'https://www.misoenergy.org/markets-and-operations/' }]
    },
    spp: {
      key: 'spp', label: 'SPP (Southwest Power Pool)', ferc: true,
      capacity: { exists: false, name: null, words: 'No centralized capacity auction: resource adequacy is a planning-reserve-margin obligation on load-responsible entities, met bilaterally.' },
      ancillary: 'Regulation up/down, spinning and supplemental reserves are biddable in the Integrated Marketplace.',
      storage: 'Storage participates under SPP’s electric storage resource rules (FERC Order 841).',
      aggregation: 'DER aggregation under FERC Order 2222 follows SPP’s approved compliance plan.',
      bess: 'A battery here earns regulation, reserves and arbitrage through a market participant; there is NO capacity-auction stream — capacity value is a bilateral contract with a load-responsible entity.',
      sources: [{ label: 'SPP Integrated Marketplace', url: 'https://www.spp.org/markets-operations/integrated-marketplace/' }]
    },
    ercot: {
      key: 'ercot', label: 'ERCOT', ferc: false,
      capacity: { exists: false, name: null, words: 'Energy-only: no capacity market; scarcity pricing (the operating reserve demand curve) carries the capacity signal.' },
      ancillary: 'Regulation, responsive reserve (RRS), ERCOT contingency reserve (ECRS) and non-spin are biddable.',
      storage: 'Energy storage resources are full market participants under ERCOT’s own rules.',
      aggregation: 'FERC Orders 841/2222 do not apply — ERCOT’s wholesale market is not FERC-jurisdictional; it runs its own aggregated-DER framework.',
      bess: 'A battery here earns ancillary services and energy (scarcity) revenue; there is no capacity auction, so the case leans on volatile energy and AS prices.',
      sources: [{ label: 'ERCOT market information', url: 'https://www.ercot.com/mktinfo' }]
    },
    caiso: {
      key: 'caiso', label: 'CAISO', ferc: true,
      capacity: { exists: false, name: null, words: 'No central capacity auction: Resource Adequacy is procured bilaterally under CPUC rules, with CAISO backstop mechanisms.' },
      ancillary: 'Regulation up/down and spinning / non-spinning reserves are biddable.',
      storage: 'Storage participates under the Non-Generator Resource model (FERC Order 841).',
      aggregation: 'Distributed energy resource provider aggregations participate today.',
      bess: 'A battery here earns ancillary services, energy arbitrage and bilateral Resource Adequacy contracts.',
      sources: [{ label: 'CAISO market processes', url: 'https://www.caiso.com/market-operations' }]
    },
    nyiso: {
      key: 'nyiso', label: 'NYISO', ferc: true,
      capacity: { exists: true, name: 'ICAP capacity market', words: 'A centralized capacity market with locational requirements.' },
      ancillary: 'Regulation and operating reserves are biddable.',
      storage: 'Energy Storage Resource participation model (FERC Order 841).',
      aggregation: 'Aggregation participation under NYISO’s DER model.',
      bess: 'A battery here can earn regulation, reserves, capacity (ICAP) and arbitrage.',
      sources: [{ label: 'NYISO markets', url: 'https://www.nyiso.com/markets' }]
    },
    isone: {
      key: 'isone', label: 'ISO New England', ferc: true,
      capacity: { exists: true, name: 'Forward Capacity Market', words: 'A centralized forward capacity market.' },
      ancillary: 'Regulation and reserves are biddable.',
      storage: 'Electric Storage Facility / binary storage participation (FERC Order 841).',
      aggregation: 'DER aggregation under FERC Order 2222 follows ISO-NE’s approved compliance plan.',
      bess: 'A battery here can earn regulation, reserves, forward capacity and arbitrage.',
      sources: [{ label: 'ISO-NE markets', url: 'https://www.iso-ne.com/markets-operations' }]
    },
    none: {
      key: 'none', label: 'no organized wholesale market', ferc: true,
      capacity: { exists: false, name: null, words: 'No organized market at the site: there is no auction to bid into.' },
      ancillary: 'No biddable ancillary products; the serving utility’s own programs are the road.',
      storage: 'Storage value comes from the utility’s tariffs, riders and programs, and bilateral contracts.',
      aggregation: 'In the West, day-ahead market membership (EDAM / Markets+) is in motion — confirm the serving utility’s own membership.',
      bess: 'A battery here earns what the serving utility’s own programs and bilateral contracts pay; an organized market’s value stack does not transfer.',
      sources: [{ label: 'FERC electric power markets', url: 'https://www.ferc.gov/electric-power-markets' }]
    }
  };

  /* ── the serving utility → its market (membership wins over geography).
     `states` constrains a name that exists in more than one market
     (National Grid, Xcel's three operating companies, CenterPoint, Duke). */
  var UTILITIES = [
    { re: /comed|commonwealth edison/i, iso: 'pjm' },
    { re: /pepco|potomac electric/i, iso: 'pjm' }, { re: /\bpeco\b/i, iso: 'pjm' }, { re: /\bppl\b|pennsylvania power & light/i, iso: 'pjm' },
    { re: /\bbge\b|baltimore gas/i, iso: 'pjm' }, { re: /delmarva/i, iso: 'pjm' }, { re: /atlantic city electric/i, iso: 'pjm' },
    { re: /jersey central|jcp&l/i, iso: 'pjm' }, { re: /public service electric|pse&g/i, iso: 'pjm' }, { re: /rockland electric/i, iso: 'pjm' },
    { re: /dominion|virginia electric/i, iso: 'pjm', states: ['VA', 'NC'] },
    { re: /aep ohio|appalachian power|kentucky power|wheeling power|indiana michigan/i, iso: 'pjm' },
    { re: /duke energy ohio|duke energy kentucky/i, iso: 'pjm' }, { re: /aes ohio|dayton power/i, iso: 'pjm' },
    { re: /ohio edison|toledo edison|cleveland electric|met-ed|penelec|penn power|west penn|mon power|potomac edison/i, iso: 'pjm' },
    { re: /east kentucky power/i, iso: 'pjm' }, { re: /dominion energy north carolina/i, iso: 'pjm' },

    { re: /ameren/i, iso: 'miso' }, { re: /entergy/i, iso: 'miso' },
    { re: /consumers energy/i, iso: 'miso' }, { re: /dte electric|detroit edison/i, iso: 'miso' },
    { re: /nipsco|northern indiana public/i, iso: 'miso' }, { re: /aes indiana|indianapolis power/i, iso: 'miso' },
    { re: /duke energy indiana/i, iso: 'miso' }, { re: /centerpoint energy indiana|southern indiana gas/i, iso: 'miso' },
    { re: /we energies|wisconsin electric|wisconsin public service|madison gas/i, iso: 'miso' },
    { re: /alliant|interstate power|wisconsin power & light/i, iso: 'miso' },
    { re: /minnesota power|otter tail|great river energy/i, iso: 'miso' },
    { re: /northern states power/i, iso: 'miso' }, { re: /xcel/i, iso: 'miso', states: ['MN', 'WI', 'ND', 'SD', 'MI'] },
    { re: /cleco/i, iso: 'miso' }, { re: /big rivers/i, iso: 'miso' }, { re: /montana-dakota/i, iso: 'miso' },

    { re: /oklahoma gas (and|&) electric|og&e|oge energy/i, iso: 'spp' },
    { re: /public service (co(mpany)?\.? )?of oklahoma|\bpso\b/i, iso: 'spp' },
    { re: /evergy|westar|kansas city power/i, iso: 'spp' },
    { re: /southwestern electric power|swepco/i, iso: 'spp' },
    { re: /southwestern public service|\bsps\b/i, iso: 'spp' }, { re: /xcel/i, iso: 'spp', states: ['TX', 'NM'] },
    { re: /nebraska public power|omaha public power|lincoln electric system/i, iso: 'spp' },
    { re: /grand river dam|oklahoma municipal power/i, iso: 'spp' },
    { re: /liberty.*empire|empire district/i, iso: 'spp' }, { re: /basin electric/i, iso: 'spp' },
    { re: /black hills/i, iso: 'spp', states: ['SD', 'KS', 'NE', 'WY'] },

    { re: /\boncor\b/i, iso: 'ercot' }, { re: /centerpoint/i, iso: 'ercot', states: ['TX'] },
    { re: /aep texas|texas central|texas north/i, iso: 'ercot' }, { re: /texas-new mexico power|tnmp/i, iso: 'ercot' },
    { re: /austin energy|cps energy/i, iso: 'ercot' },

    { re: /pacific gas (and|&) electric|pg&e/i, iso: 'caiso' },
    { re: /southern california edison|\bsce\b/i, iso: 'caiso' },
    { re: /san diego gas|sdg&e/i, iso: 'caiso' },

    { re: /consolidated edison|coned/i, iso: 'nyiso' }, { re: /nyseg|new york state electric/i, iso: 'nyiso' },
    { re: /rochester gas|rg&e/i, iso: 'nyiso' }, { re: /central hudson|orange (and|&) rockland/i, iso: 'nyiso' },
    { re: /national grid/i, iso: 'nyiso', states: ['NY'] },

    { re: /eversource/i, iso: 'isone' }, { re: /national grid/i, iso: 'isone', states: ['MA', 'RI'] },
    { re: /united illuminating/i, iso: 'isone' }, { re: /rhode island energy/i, iso: 'isone' },
    { re: /unitil|green mountain power|central maine|versant/i, iso: 'isone' },

    { re: /ladwp|los angeles department/i, iso: 'none' }, { re: /imperial irrigation/i, iso: 'none' },
    { re: /salt river project|\bsrp\b/i, iso: 'none' }, { re: /arizona public service|\baps\b/i, iso: 'none' },
    { re: /tucson electric/i, iso: 'none' }, { re: /el paso electric/i, iso: 'none' },
    { re: /public service (co(mpany)?\.? )?of new mexico|\bpnm\b/i, iso: 'none' }, { re: /xcel|public service co(mpany)?\.? of colorado/i, iso: 'none', states: ['CO'] },
    { re: /nv energy/i, iso: 'none' }, { re: /pacificorp|rocky mountain power|pacific power/i, iso: 'none' },
    { re: /portland general|puget sound|idaho power|avista|seattle city light|snohomish/i, iso: 'none' },
    { re: /georgia power|alabama power|mississippi power/i, iso: 'none' },
    { re: /florida power (and|&) light|fpl|duke energy florida|tampa electric|teco|florida public utilities|jea|orlando utilities/i, iso: 'none' },
    { re: /duke energy carolinas|duke energy progress/i, iso: 'none' },
    { re: /santee cooper|dominion energy south carolina/i, iso: 'none' },
    { re: /tennessee valley|\btva\b|memphis light/i, iso: 'none' }
  ];

  /* ── state defaults, split flags wherever more than one market serves
     retail load in the state. The default is the market serving the larger
     share of the state's load; `split` lists every market present. ── */
  var STATES = {
    PA: { iso: 'pjm' }, NJ: { iso: 'pjm' }, MD: { iso: 'pjm' }, DE: { iso: 'pjm' }, DC: { iso: 'pjm' }, OH: { iso: 'pjm' }, WV: { iso: 'pjm' }, VA: { iso: 'pjm' },
    IL: { iso: 'pjm', split: ['pjm', 'miso'], note: 'ComEd is PJM; Ameren Illinois is MISO' },
    KY: { iso: 'none', split: ['none', 'pjm', 'miso'], note: 'LG&E/KU are outside the RTOs; Kentucky Power and EKPC are PJM; Big Rivers is MISO' },
    IN: { iso: 'miso', split: ['miso', 'pjm'], note: 'most Indiana utilities are MISO; Indiana Michigan Power is PJM' },
    MI: { iso: 'miso', split: ['miso', 'pjm'] },
    MN: { iso: 'miso' }, WI: { iso: 'miso' }, IA: { iso: 'miso' },
    ND: { iso: 'miso', split: ['miso', 'spp'] }, SD: { iso: 'spp', split: ['spp', 'miso'] },
    MO: { iso: 'miso', split: ['miso', 'spp'], note: 'Ameren Missouri is MISO; Evergy is SPP' },
    AR: { iso: 'miso', split: ['miso', 'spp'] }, LA: { iso: 'miso', split: ['miso', 'spp'] },
    MS: { iso: 'miso', split: ['miso', 'none'], note: 'Entergy Mississippi is MISO; Mississippi Power is outside the RTOs' },
    MT: { iso: 'none', split: ['none', 'miso', 'spp'] },
    KS: { iso: 'spp' }, OK: { iso: 'spp' }, NE: { iso: 'spp' },
    NM: { iso: 'none', split: ['none', 'spp'], note: 'SPS is SPP; EPE and PNM are outside the RTOs' },
    TX: { iso: 'ercot', split: ['ercot', 'spp', 'miso', 'none'], note: 'most of Texas is ERCOT; the Panhandle (SPS) is SPP, the southeast corner (Entergy Texas) is MISO, El Paso is outside' },
    CA: { iso: 'caiso', split: ['caiso', 'none'], note: 'the IOUs are CAISO; LADWP, IID and other munis are outside' },
    NY: { iso: 'nyiso' },
    CT: { iso: 'isone' }, MA: { iso: 'isone' }, RI: { iso: 'isone' }, NH: { iso: 'isone' }, VT: { iso: 'isone' }, ME: { iso: 'isone' },
    FL: { iso: 'none' }, GA: { iso: 'none' }, AL: { iso: 'none' }, SC: { iso: 'none' }, TN: { iso: 'none' },
    NC: { iso: 'none', split: ['none', 'pjm'], note: 'Duke’s utilities are outside the RTOs; Dominion’s north-east corner is PJM' },
    AZ: { iso: 'none' }, CO: { iso: 'none' }, NV: { iso: 'none' }, UT: { iso: 'none' }, WY: { iso: 'none', split: ['none', 'spp'] },
    ID: { iso: 'none' }, OR: { iso: 'none' }, WA: { iso: 'none' }, AK: { iso: 'none' }, HI: { iso: 'none' }
  };

  function rules(iso) { var m = MARKETS[iso] || null; return m ? { key: m.key, label: m.label, ferc: m.ferc, capacity: m.capacity, ancillary: m.ancillary, storage: m.storage, aggregation: m.aggregation, bess: m.bess, sources: m.sources, reviewedAt: REVIEWED, note: CONFIRM } : null; }

  /* { state?, utility? } → { iso, label, basis: 'utility'|'state'|null,
     split: [..]|null, words }. iso null = honestly unknown, never a guess. */
  function resolve(input) {
    input = input || {};
    var st = String(input.state || '').toUpperCase().trim().slice(0, 2);
    var ut = String(input.utility || '').trim();
    if (ut) {
      for (var i = 0; i < UTILITIES.length; i++) {
        var u = UTILITIES[i];
        if (!u.re.test(ut)) continue;
        if (u.states && (!st || u.states.indexOf(st) < 0)) continue;
        return { iso: u.iso, label: MARKETS[u.iso].label, basis: 'utility', split: null,
          words: MARKETS[u.iso].label + ' — resolved from the serving utility (' + ut + ')' + (u.iso === 'none' ? ': it is not in an organized wholesale market' : '') };
      }
    }
    var s = STATES[st] || null;
    if (s) {
      var w = MARKETS[s.iso].label + ' — the state default for ' + st;
      if (s.split) w += '; ' + st + ' is split between ' + s.split.map(function (k) { return MARKETS[k].label; }).join(' and ') + (s.note ? ' (' + s.note + ')' : '') + ': the serving utility decides' + (ut ? ', and "' + ut + '" is not one this table knows — confirm its membership' : '');
      return { iso: s.iso, label: MARKETS[s.iso].label, basis: 'state', split: s.split || null, words: w };
    }
    return { iso: null, label: null, basis: null, split: null, words: 'Market unknown: no state on file to resolve it from' };
  }

  /* an ISO/RTO polygon's NAME (the HIFLD layer the Grid Atlas draws) → key */
  function fromName(name) {
    var n = String(name || '').toLowerCase();
    if (!n) return null;
    if (n.indexOf('pjm') >= 0) return 'pjm';
    if (n.indexOf('midcontinent') >= 0 || /\bmiso\b/.test(n)) return 'miso';
    if (n.indexOf('southwest power pool') >= 0 || /\bspp\b/.test(n)) return 'spp';
    if (n.indexOf('ercot') >= 0 || n.indexOf('reliability council of texas') >= 0) return 'ercot';
    if (n.indexOf('california') >= 0 && n.indexOf('independent') >= 0) return 'caiso';
    if (n.indexOf('new york independent') >= 0 || /\bnyiso\b/.test(n)) return 'nyiso';
    if (n.indexOf('new england') >= 0) return 'isone';
    return null;
  }

  var API = { VERSION: VERSION, REVIEWED: REVIEWED, MARKETS: MARKETS, resolve: resolve, rules: rules, fromName: fromName };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (global) global.OmegaIsoMarket = API;
})(typeof window !== 'undefined' ? window : null);
