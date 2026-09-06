/* ══════════════════════════════════════════════════════════════════════════
   CLEARSKY-OMEGA · MANAGED FLEET CONSOLE  (omega-fleet.js)

   A tenant-neutral module for a firm that OPERATES energy assets it does not
   own — a controls, orchestration or energy-management-software company that
   sells a unit and a subscription into somebody else's facility and then
   dispatches the DERs inside it.

   It ships dark. A deployment turns it on in that deployment's /config.js
   under `tenant.fleet`. No tenant name, domain, product name or colour
   appears in this file, and it must stay that way — this is a shared
   platform file.

   ─────────────────────────────────────────────────────────────────────────
   WHY THIS EXISTS, NEXT TO omega-assets.js AND omega-delivery.js
   ─────────────────────────────────────────────────────────────────────────
   Three modules, three different relationships to an asset:

     omega-assets.js    OWNS it.      What is it worth, what does it earn,
                                      who is bidding on it.
     omega-delivery.js  ADVANCES it.  Somebody else's project, moving through
                                      service lines, handed back.
     omega-fleet.js     RUNS it.      Somebody else's energised asset, under
                                      our control, on our software, forever.

   The fourth relationship — developing a site for yourself — is the stock
   dashboard. A vendor in this shape asks a set of questions none of the
   other three answer:

       How much power do we actually control?      → dispatch capacity
       Where is it?                                → geography + market
       What kinds of assets are they?              → asset mix
       How many units have we sold?                → units, and the gap
       How much of what we sold is actually live?  → the commissioning gap
       Is the saving real or modelled?             → basis, kept separate

   ─────────────────────────────────────────────────────────────────────────
   ⚠ THIS IS NOT A REAL-TIME OPERATIONS SCREEN
   ─────────────────────────────────────────────────────────────────────────
   The most likely misuse of this module is to grow it into a live telemetry
   view — state of charge, dispatch decisions, power flows, agent rationale.
   Do not. A vendor in this shape already has an operations product, that
   product is the thing the customer is paying for, and reproducing a worse
   copy of it inside a portal is both duplicated work and a demo that invites
   a comparison it will lose.

   This block is the COMMERCIAL layer above that product: the fleet as a
   book of business. Per-site live operation belongs behind `optimaUrl` on
   the site record, which is a deep link OUT to the real operations product.
   The link is one hop; the reimplementation is permanent.

   The dividing line, concretely: anything that changes minute to minute
   belongs in the operations product. Anything that changes when a contract
   is signed, a unit ships, or an agent goes live belongs here.

   ─────────────────────────────────────────────────────────────────────────
   DOCUMENT SHAPE  —  {collection}/{id}
   ─────────────────────────────────────────────────────────────────────────
     orgId          string    tenant lock. Scopes every read.
     siteName       string    the facility. REQUIRED.
     customerName   string    THEIR customer — not the tenant.
     segment        string    one of SEGMENTS[].key
     status         string    one of STATUS[].key
     city / state / country / iso / utility / tariff

     -- what is on site. POWER AND ENERGY ARE SEPARATE FIELDS AND ARE NEVER
     -- SUMMED WITH EACH OTHER. See the note on units below.
     bessKw         number    battery inverter power, kW      (dispatchable)
     bessKwh        number    battery energy, kWh
     solarKwDc      number    PV nameplate DC, kW             (observed)
     solarKwAc      number    PV inverter AC, kW              (observed)
     genKw          number    generator, kW                   (dispatchable)
     flexKw         number    curtailable/shiftable load, kW  (dispatchable)
     peakLoadKw     number    facility peak. CONTEXT, NOT MANAGED CAPACITY.

     -- what was sold
     units          number    edge controllers sold for this site
     unitsLive      number    of those, commissioned and reporting
     meterChannels  number
     contractType   string    one of CONTRACTS[].key
     arr            number    annual recurring revenue, $

     -- what it is doing
     savingsBasis   string    'metered' | 'modeled'   ← never mixed in a total
     annualSavings  number    $/yr
     carbonKgYr     number    kg CO2e/yr avoided
     optimaUrl      string    deep link into the real operations product
     editorProjectId string   link to a projects/{id} if one was drawn

     soldAt / liveAt / createdAt / updatedAt   'YYYY-MM-DD' or timestamp

   Everything except orgId, siteName and status degrades safely if absent.

   ─────────────────────────────────────────────────────────────────────────
   THE FOUR THINGS THIS MODULE REFUSES TO FUDGE
   ─────────────────────────────────────────────────────────────────────────
   Each of these is a number a fleet dashboard is normally happy to inflate,
   and each is the one an acquirer, an investor or a customer checks first.

   1. SOLD IS NOT LIVE. A unit sold and not yet commissioned dispatches
      nothing and saves nobody anything. Contracted capacity is reported
      NEXT TO capacity under management, never inside it. The gap between
      them is printed as its own figure, because that gap is the operational
      story of a hardware-plus-software company and hiding it inside a single
      "capacity" number is how a backlog becomes a surprise.

   2. POWER IS NOT ENERGY. A 2 MW / 10 MWh battery is not "12" of anything.
      kW and kWh are tracked in separate fields, rolled up separately, and
      displayed separately. They are never added, and no single "capacity"
      figure silently mixes them.

   3. OBSERVED IS NOT CONTROLLED. A platform that reads a facility's load and
      its PV output but only commands the battery, the generator and the
      flexible load is MANAGING the latter three. Counting site peak load or
      PV nameplate as "capacity under management" is the easiest tenfold
      overstatement available in this business — one 3 MW industrial load
      would swamp a real 1 MW battery. `peakLoadKw` and the solar fields are
      carried, shown, and excluded from the dispatch figure. See dispatchKw().

   4. MODELLED IS NOT METERED. A saving from a digital-twin study on
      historical data is a forecast; a saving from a commissioned site is a
      measurement. They are summed into two different totals and labelled.
      A pilot's modelled result is a genuine sales asset and belongs on the
      board — it just cannot be added to money that actually happened.
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var BLOCK_KEY = 'fleet';
  var MOUNTED   = false;

  /* ── Config ───────────────────────────────────────────────────────────── */

  function tenant() {
    return global.OMEGA_WORKSPACE ||
           (global.CLEARSKY_CONFIG && global.CLEARSKY_CONFIG.tenant) || {};
  }

  function cfg() {
    var f = tenant().fleet || {};
    return {
      enabled:      f.enabled === true,          // OFF unless asked for
      collection:   f.collection || 'managedSites',
      insertAfter:  f.insertAfter || 'apps',
      title:        f.title || 'Managed Fleet',
      subtitle:     f.subtitle ||
                    'Capacity under management, where it sits, and what has shipped.',
      sampleData:   f.sampleData === true,
      registerHref: f.registerHref || '/fleet.html',
      addHref:      f.addHref || '/commission.html',
      segments:     (f.segments && f.segments.length) ? f.segments : DEFAULT_SEGMENTS,
      unitLabel:    f.unitLabel || 'Units',
      unitLabelOne: f.unitLabelOne || 'unit',
      /* Where a site row's "open live view" link goes when the record has no
         optimaUrl of its own. null ⇒ no link rather than a broken one. */
      opsUrlBase:   f.opsUrlBase || null,
      opsName:      f.opsName || 'the live operations view',
      currency:     f.currency || 'USD'
    };
  }

  /* ── The model ────────────────────────────────────────────────────────── */

  /* Lifecycle of a site, from "we think we can sell this" to "the agent is
     in control". The three groups matter more than the individual keys:

       PRE        nothing sold yet          → excluded from every total
       PIPELINE   sold, not yet dispatching → contracted capacity
       LIVE       telemetry flowing         → connected
       DISPATCH   agent in control          → CAPACITY UNDER MANAGEMENT

     `group` is what the rollups read. Adding a status without setting a
     group means it silently lands nowhere, so group is required. */
  var STATUS = [
    { key:'prospect',      label:'Prospect',        short:'Prospect',  color:'#9CA3AF', group:'pre',
      hint:'Identified, nothing sold. Carried so the map is honest about coverage, counted in nothing.' },
    { key:'pilot',         label:'Virtual pilot',   short:'Pilot',     color:'#8B5CF6', group:'pre',
      hint:'Simulation against the customer\u2019s own data. No hardware on site, no capacity managed \u2014 but a real modelled result.' },
    { key:'contracted',    label:'Contracted',      short:'Sold',      color:'#0070F2', group:'pipeline',
      hint:'Signed. Nothing shipped. Dispatches nothing.' },
    { key:'shipped',       label:'Unit shipped',    short:'Shipped',   color:'#0EA5E9', group:'pipeline',
      hint:'Hardware out the door, not yet installed.' },
    { key:'commissioning', label:'Commissioning',   short:'Commiss.',  color:'#14B8A6', group:'pipeline',
      hint:'On site, being integrated. Still dispatching nothing.' },
    { key:'learning',      label:'Learning',        short:'Learning',  color:'#F59E0B', group:'live',
      hint:'Connected and observing. The agent is training, not yet in control \u2014 so capacity is connected, not managed.' },
    { key:'autonomous',    label:'Autonomous',      short:'Live',      color:'#16A34A', group:'dispatch',
      hint:'The agent is dispatching. This, and only this, is capacity under management.' },
    { key:'paused',        label:'Control paused',  short:'Paused',    color:'#DC2626', group:'live',
      hint:'Connected, control suspended. Drops out of managed capacity until it resumes \u2014 that is the point of the state.' },
    { key:'churned',       label:'Ended',           short:'Ended',     color:'#6B7280', group:'ended',
      hint:'Contract over. Units stay counted as sold; capacity does not.' }
  ];

  /* Facility archetypes. A tenant overrides these in config; the defaults
     are the generic grid-edge set. */
  var DEFAULT_SEGMENTS = [
    { key:'industrial',   label:'Industrial' },
    { key:'commercial',   label:'Commercial' },
    { key:'datacenter',   label:'Data centre' },
    { key:'campus',       label:'Campus' },
    { key:'transport',    label:'Transport hub' },
    { key:'microgrid',    label:'Microgrid' },
    { key:'municipal',    label:'Municipal' },
    { key:'other',        label:'Other' }
  ];

  var CONTRACTS = [
    { key:'pilot_unpaid', label:'Pilot (unpaid)' },
    { key:'pilot_paid',   label:'Paid pilot' },
    { key:'subscription', label:'Subscription' },
    { key:'enterprise',   label:'Enterprise' },
    { key:'reseller',     label:'Via reseller' }
  ];

  /* Wholesale markets. The distinction that matters is ORGANIZED vs not:
     a DER in an organized market can be aggregated and bid in; one in a
     bilateral utility territory cannot, whatever the software does. A fleet
     that is mostly non-ISO has a different revenue ceiling than one that is
     not, and the block says so rather than leaving it to be discovered. */
  var MARKETS = [
    { key:'pjm',    label:'PJM',        organized:true },
    { key:'isone',  label:'ISO-NE',     organized:true },
    { key:'nyiso',  label:'NYISO',      organized:true },
    { key:'miso',   label:'MISO',       organized:true },
    { key:'spp',    label:'SPP',        organized:true },
    { key:'ercot',  label:'ERCOT',      organized:true },
    { key:'caiso',  label:'CAISO',      organized:true },
    { key:'nonom',  label:'Non-market', organized:false },
    { key:'other',  label:'Not stated', organized:false }
  ];

  var TARIFFS = [
    { key:'tou',        label:'TOU' },
    { key:'tou_demand', label:'TOU + demand charge' },
    { key:'cbl_rtp',    label:'CBL + real-time' },
    { key:'rtp',        label:'Real-time' },
    { key:'flat',       label:'Flat' },
    { key:'other',      label:'Not stated' }
  ];

  function lookup(list, key, fallbackKey) {
    var k = String(key || '').toLowerCase();
    for (var i = 0; i < list.length; i++) if (list[i].key === k) return list[i];
    var fb = null;
    for (var j = 0; j < list.length; j++) if (list[j].key === fallbackKey) fb = list[j];
    /* An unknown key is REPORTED, not silently mapped to the fallback. A
       record written by an older form or a spreadsheet import keeps its own
       label and gets flagged, because a renamed key that quietly becomes
       "Other" is a migration nobody notices until the counts drift. */
    return fb ? { key: k || fb.key, label: k ? k : fb.label, color: fb.color,
                  group: fb.group, organized: false, unknown: !!k }
              : { key: k, label: k, unknown: true };
  }

  function statusOf(k)   { return lookup(STATUS, k, 'contracted'); }
  function contractOf(k) { return lookup(CONTRACTS, k, 'subscription'); }
  function marketOf(k)   { return lookup(MARKETS, k, 'other'); }
  function tariffOf(k)   { return lookup(TARIFFS, k, 'other'); }
  function segmentOf(k) {
    var segs = cfg().segments;
    var key = String(k || '').toLowerCase();
    for (var i = 0; i < segs.length; i++) if (segs[i].key === key) return segs[i];
    return { key: key || 'other', label: key || 'Other', unknown: !!key };
  }

  /* ── Small helpers ────────────────────────────────────────────────────── */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function num(v) {
    var n = Number(v);
    return (v === '' || v == null || isNaN(n)) ? null : n;
  }

  /* kW in, a human string out. The unit is always printed: a bare "4.5" in a
     business that trades in both kW and kWh is the ambiguity this module
     exists to remove. */
  function kw(v) {
    var n = Number(v) || 0;
    if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + ' MW';
    return Math.round(n) + ' kW';
  }

  function kwh(v) {
    var n = Number(v) || 0;
    if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + ' MWh';
    return Math.round(n) + ' kWh';
  }

  function money(n) {
    n = Number(n) || 0;
    var sign = n < 0 ? '-' : '';
    n = Math.abs(n);
    if (n >= 1e6) return sign + '$' + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
    if (n >= 1e3) return sign + '$' + Math.round(n / 1e3) + 'K';
    return sign + '$' + Math.round(n);
  }

  function tonnes(kgYr) {
    var t = (Number(kgYr) || 0) / 1000;
    if (!t) return '\u2014';
    return (t >= 100 ? Math.round(t) : t.toFixed(1)) + ' t';
  }

  function toDate(v) {
    if (!v) return null;
    if (v.toDate) { try { return v.toDate(); } catch (e) { return null; } }
    if (v instanceof Date) return v;
    if (typeof v === 'number') return new Date(v);
    var d = new Date(String(v));
    return isNaN(d.getTime()) ? null : d;
  }

  function fmtDate(d) {
    d = toDate(d);
    if (!d) return '\u2014';
    var m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return m[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  function pick(raw, names) {
    for (var i = 0; i < names.length; i++) {
      var v = raw[names[i]];
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return null;
  }

  /* ── Normalize ────────────────────────────────────────────────────────── */

  function normalize(id, raw) {
    raw = raw || {};

    /* Capacity may arrive in MW from a spreadsheet or in kW from the form.
       Storing one canonical unit (kW) and accepting both on the way in is
       the difference between a fleet that reads 4,500 kW and one that reads
       4.5 kW because somebody typed the number they had. */
    function cap(kwNames, mwNames) {
      var k = num(pick(raw, kwNames));
      if (k != null) return k;
      var m = num(pick(raw, mwNames));
      return m == null ? null : m * 1000;
    }

    return {
      id:            id,
      orgId:         raw.orgId || '',
      siteName:      pick(raw, ['siteName', 'name', 'facility', 'title']) || 'Unnamed site',
      customerName:  pick(raw, ['customerName', 'customer', 'clientName', 'company']) || '',
      segment:       String(raw.segment || raw.facilityType || 'other').toLowerCase(),
      status:        String(raw.status || 'contracted').toLowerCase(),

      city:          pick(raw, ['city', 'town']) || '',
      state:         String(pick(raw, ['state', 'region', 'province']) || '').toUpperCase(),
      country:       String(pick(raw, ['country']) || 'US').toUpperCase(),
      iso:           String(pick(raw, ['iso', 'market', 'rto']) || 'other').toLowerCase(),
      utility:       pick(raw, ['utility', 'lse']) || '',
      tariff:        String(pick(raw, ['tariff', 'rate']) || 'other').toLowerCase(),

      bessKw:        cap(['bessKw', 'batteryKw', 'powerKw'], ['bessMw', 'batteryMw', 'powerMw']),
      bessKwh:       cap(['bessKwh', 'batteryKwh', 'energyKwh'], ['bessMwh', 'batteryMwh', 'energyMwh']),
      solarKwDc:     cap(['solarKwDc', 'pvKwDc'], ['solarMwDc', 'pvMwDc']),
      solarKwAc:     cap(['solarKwAc', 'pvKwAc', 'solarKw'], ['solarMwAc', 'pvMwAc', 'solarMw']),
      genKw:         cap(['genKw', 'generatorKw'], ['genMw', 'generatorMw']),
      flexKw:        cap(['flexKw', 'flexibleLoadKw'], ['flexMw']),
      peakLoadKw:    cap(['peakLoadKw', 'peakKw', 'loadKw'], ['peakLoadMw', 'peakMw', 'loadMw']),

      units:         num(pick(raw, ['units', 'edgeUnits', 'controllers'])) || 0,
      unitsLive:     num(pick(raw, ['unitsLive', 'edgeUnitsCommissioned', 'unitsCommissioned'])) || 0,
      meterChannels: num(pick(raw, ['meterChannels', 'channels'])) || 0,
      contractType:  String(pick(raw, ['contractType', 'contract']) || 'subscription').toLowerCase(),
      arr:           num(pick(raw, ['arr', 'annualRecurringRevenue', 'acv'])),

      /* Absent basis is treated as MODELLED, never as metered. The safe
         default for an unlabelled number is the one that cannot overstate
         realised performance. */
      savingsBasis:  (String(pick(raw, ['savingsBasis', 'basis']) || 'modeled').toLowerCase() === 'metered')
                       ? 'metered' : 'modeled',
      annualSavings: num(pick(raw, ['annualSavings', 'savingsUsdYr', 'savings'])),
      carbonKgYr:    num(pick(raw, ['carbonKgYr', 'carbonAvoidedKg', 'co2KgYr'])),

      optimaUrl:     pick(raw, ['optimaUrl', 'opsUrl', 'liveUrl']) || '',
      editorProjectId: pick(raw, ['editorProjectId', 'projectId']) || '',
      notes:         raw.notes || '',

      soldAt:        toDate(raw.soldAt || raw.contractedAt),
      liveAt:        toDate(raw.liveAt || raw.commissionedAt || raw.autonomousAt),
      createdAt:     toDate(raw.createdAt),
      updatedAt:     toDate(raw.updatedAt),
      _raw:          raw
    };
  }

  /* ── The capacity question ────────────────────────────────────────────── */

  /* DISPATCHABLE power: what the platform can actually command. Battery
     inverter, generator, and controllable load. NOT solar — a PV array is
     observed and at best curtailed, and counting nameplate PV as managed
     capacity is a claim about control that isn't true. NOT facility peak
     load, which is the single biggest overstatement available here.

     If a deployment genuinely curtails PV under contract, add solarKwAc to
     this function deliberately and say so in the tenant's README — do not
     let it drift in through the rollup. */
  function dispatchKw(r) {
    return (r.bessKw || 0) + (r.genKw || 0) + (r.flexKw || 0);
  }

  /* Everything the platform can SEE, which is a legitimate and different
     number — it is the scope of the digital twin, not the scope of control.
     Reported separately and never as "under management". */
  function observedKw(r) {
    return dispatchKw(r) + (r.solarKwAc || r.solarKwDc || 0) + (r.peakLoadKw || 0);
  }

  function isDispatching(r) { return statusOf(r.status).group === 'dispatch'; }
  function isConnected(r)   { return statusOf(r.status).group === 'live'; }
  function isPipeline(r)    { return statusOf(r.status).group === 'pipeline'; }
  function isPre(r)         { return statusOf(r.status).group === 'pre'; }
  function isEnded(r)       { return statusOf(r.status).group === 'ended'; }

  /* ── Analyse ──────────────────────────────────────────────────────────── */

  function analyse(rows) {
    var C = cfg();
    rows = (rows || []).slice();

    var dispatching = rows.filter(isDispatching);
    var connected   = rows.filter(isConnected);
    var pipeline    = rows.filter(isPipeline);
    var pre         = rows.filter(isPre);
    var ended       = rows.filter(isEnded);

    function sum(list, fn) {
      return list.reduce(function (a, r) { return a + (fn(r) || 0); }, 0);
    }

    /* Units SOLD is cumulative and includes churn: a unit that shipped to a
       site whose contract later ended was still sold, and pretending
       otherwise makes a shipment total that no invoice agrees with. Units
       LIVE is a current-state figure and does not. */
    var sold = rows.filter(function (r) { return !isPre(r); });
    var unitsSold = sum(sold, function (r) { return r.units; });
    var unitsLive = sum(rows.filter(function (r) {
      return isDispatching(r) || isConnected(r);
    }), function (r) { return r.unitsLive || 0; });

    /* Two savings totals, never one. See note 4 in the header.

       Realised savings are drawn from the SAME population as managed
       capacity — dispatching sites only. It is quoted per year, so it is a
       run-rate, and a site whose control is paused is not currently earning
       one. Letting a paused site keep contributing to $/yr while its
       capacity drops out would mean the two headline numbers describe
       different fleets, which is exactly the kind of quiet mismatch
       somebody eventually has to reconcile in front of an investor.

       A site counts as METERED only when it actually carries a figure. A
       commissioned site that has not reached a settled bill period yet has
       basis 'metered' and no number, and counting it as a metered site would
       imply a per-site average that is a third too low for a reason that is
       not real — the same trap as an answered-but-unstamped referral on the
       delivery console. Those sites are counted separately and printed, so
       the gap is visible rather than silent. */
    var metered = dispatching.filter(function (r) {
      return r.savingsBasis === 'metered' && r.annualSavings;
    });
    var awaitingMeter = dispatching.filter(function (r) {
      return r.savingsBasis === 'metered' && !r.annualSavings;
    });
    var modeled = rows.filter(function (r) {
      return r.savingsBasis === 'modeled' && r.annualSavings;
    });

    /* Geography. Grouped by state, because that is the unit a customer, a
       utility filing and a hiring plan are all expressed in. */
    var byPlaceMap = {};
    rows.forEach(function (r) {
      if (isPre(r)) return;
      var key = r.state || '\u2014';
      var g = byPlaceMap[key] || (byPlaceMap[key] = {
        key: key, label: key, sites: 0, live: 0, kw: 0, kwh: 0, cities: {}
      });
      g.sites++;
      if (isDispatching(r)) { g.live++; g.kw += dispatchKw(r); g.kwh += (r.bessKwh || 0); }
      if (r.city) g.cities[r.city] = true;
    });
    var byPlace = Object.keys(byPlaceMap).map(function (k) {
      var g = byPlaceMap[k];
      g.cityCount = Object.keys(g.cities).length;
      return g;
    }).sort(function (a, b) { return b.kw - a.kw || b.sites - a.sites; });

    /* Market. Organized vs not is the split that changes what the fleet can
       earn, so it is totalled as well as listed. */
    var byMarketMap = {};
    rows.forEach(function (r) {
      if (isPre(r)) return;
      var m = marketOf(r.iso);
      var g = byMarketMap[m.key] || (byMarketMap[m.key] = {
        key: m.key, label: m.label, organized: !!m.organized, sites: 0, kw: 0
      });
      g.sites++;
      if (isDispatching(r)) g.kw += dispatchKw(r);
    });
    var byMarket = Object.keys(byMarketMap).map(function (k) { return byMarketMap[k]; })
      .sort(function (a, b) { return b.kw - a.kw || b.sites - a.sites; });

    var organizedKw = byMarket.filter(function (m) { return m.organized; })
      .reduce(function (a, m) { return a + m.kw; }, 0);

    /* Segment. Driven off config, so every configured segment appears even
       at zero — an empty vertical is information, and a vertical that
       silently vanishes from the board is not. */
    var bySegment = C.segments.map(function (s) {
      var mine = rows.filter(function (r) { return r.segment === s.key && !isPre(r); });
      var liveOnes = mine.filter(isDispatching);
      return {
        key: s.key, label: s.label,
        sites: mine.length, live: liveOnes.length,
        kw: sum(liveOnes, dispatchKw),
        kwh: sum(liveOnes, function (r) { return r.bessKwh; })
      };
    }).sort(function (a, b) { return b.kw - a.kw || b.sites - a.sites; });

    /* Sites whose segment key matches nothing configured. Flagged, not
       folded into "Other" — see lookup(). */
    var offSegment = rows.filter(function (r) {
      return !isPre(r) && segmentOf(r.segment).unknown;
    });

    /* Asset mix — the literal "what do we manage" answer. Dispatchable
       classes and observed classes are in one table but in labelled groups,
       and the totals are per-class so nothing gets added across units. */
    var live = dispatching;
    var mix = [
      { key:'bess',  label:'Battery storage', control:true,
        kw: sum(live, function (r) { return r.bessKw; }),
        kwh: sum(live, function (r) { return r.bessKwh; }),
        n: live.filter(function (r) { return r.bessKw || r.bessKwh; }).length },
      { key:'gen',   label:'Generators', control:true,
        kw: sum(live, function (r) { return r.genKw; }), kwh: 0,
        n: live.filter(function (r) { return r.genKw; }).length },
      { key:'flex',  label:'Flexible load', control:true,
        kw: sum(live, function (r) { return r.flexKw; }), kwh: 0,
        n: live.filter(function (r) { return r.flexKw; }).length },
      { key:'solar', label:'Solar PV', control:false,
        kw: sum(live, function (r) { return r.solarKwAc || r.solarKwDc; }), kwh: 0,
        n: live.filter(function (r) { return r.solarKwAc || r.solarKwDc; }).length },
      { key:'load',  label:'Facility load', control:false,
        kw: sum(live, function (r) { return r.peakLoadKw; }), kwh: 0,
        n: live.filter(function (r) { return r.peakLoadKw; }).length }
    ];

    var funnel = ['pilot', 'contracted', 'shipped', 'commissioning', 'learning', 'autonomous']
      .map(function (k) {
        var s = statusOf(k);
        var mine = rows.filter(function (r) { return r.status === k; });
        return { key: k, label: s.label, color: s.color, n: mine.length,
                 kw: sum(mine, dispatchKw) };
      });

    var managedKw  = sum(dispatching, dispatchKw);
    var managedKwh = sum(dispatching, function (r) { return r.bessKwh; });

    return {
      rows: rows,
      dispatching: dispatching, connected: connected, pipeline: pipeline,
      pre: pre, ended: ended,
      byPlace: byPlace, byMarket: byMarket, bySegment: bySegment,
      offSegment: offSegment, mix: mix, funnel: funnel,
      kpi: {
        managedKw:     managedKw,
        managedKwh:    managedKwh,
        sitesLive:     dispatching.length,
        sitesTotal:    rows.filter(function (r) { return !isPre(r); }).length,

        connectedKw:   sum(connected, dispatchKw),
        sitesConnected: connected.length,

        /* The backlog. Sold, paid for, dispatching nothing. */
        contractedKw:  sum(pipeline, dispatchKw),
        sitesPipeline: pipeline.length,

        unitsSold:     unitsSold,
        unitsLive:     unitsLive,
        unitsPending:  Math.max(0, unitsSold - unitsLive),

        states:        byPlace.filter(function (p) { return p.key !== '\u2014'; }).length,
        markets:       byMarket.length,
        organizedKw:   organizedKw,
        organizedPct:  managedKw ? (organizedKw / managedKw) : 0,

        savingsMetered: sum(metered, function (r) { return r.annualSavings; }),
        savingsModeled: sum(modeled, function (r) { return r.annualSavings; }),
        meteredSites:   metered.length,
        modeledSites:   modeled.length,
        awaitingMeter:  awaitingMeter.length,

        carbonKgYr:    sum(dispatching, function (r) { return r.carbonKgYr; }),
        arr:           sum(rows.filter(function (r) { return !isPre(r) && !isEnded(r); }),
                           function (r) { return r.arr; }),
        noLiveLink:    dispatching.filter(function (r) {
                         return !r.optimaUrl && !cfg().opsUrlBase;
                       }).length
      }
    };
  }

  /* ── Firestore ────────────────────────────────────────────────────────── */

  function db() {
    if (global.db) return global.db;
    try { return global.firebase.firestore(); } catch (e) { return null; }
  }

  function orgId() {
    return tenant().orgId ||
           (global.OMEGA_WORKSPACE && global.OMEGA_WORKSPACE.orgId) || '';
  }

  function fetchAll() {
    var d = db(), C = cfg(), org = orgId();
    if (!d || !org) return Promise.resolve([]);
    return d.collection(C.collection).where('orgId', '==', org).get()
      .then(function (snap) {
        var out = [];
        snap.forEach(function (doc) { out.push(normalize(doc.id, doc.data())); });
        return out;
      })['catch'](function (e) {
        /* Name the collection. "Missing or insufficient permissions" with no
           collection in it has sent people to the wrong rules block before. */
        console.error('[omega-fleet] ' + C.collection +
          ' read failed \u2014 deploy firestore-fleet.rules', e);
        return [];
      });
  }

  function create(doc) {
    var d = db(), C = cfg();
    if (!d) return Promise.reject(new Error('Firestore unavailable'));
    var user = null;
    try { user = global.firebase.auth().currentUser; } catch (e) {}
    var stamp = global.firebase.firestore.FieldValue.serverTimestamp();
    var body = Object.assign({}, doc, {
      orgId:     orgId(),
      status:    doc.status || 'contracted',
      createdAt: stamp,
      updatedAt: stamp,
      createdBy: user ? (user.email || user.uid) : null
    });
    return d.collection(C.collection).add(body);
  }

  function patch(id, body) {
    var d = db(), C = cfg();
    if (!d) return Promise.reject(new Error('Firestore unavailable'));
    body = Object.assign({}, body);
    body.updatedAt = global.firebase.firestore.FieldValue.serverTimestamp();
    return d.collection(C.collection).doc(id).update(body);
  }

  /* Moving a site to a dispatching status stamps liveAt once, the same way
     the delivery console stamps a first response: asking for a separate
     click is how a date ends up never recorded. Write-once in the rules. */
  function setStatus(row, next) {
    var body = { status: next };
    if (statusOf(next).group === 'dispatch' && !row.liveAt) {
      body.liveAt = global.firebase.firestore.FieldValue.serverTimestamp();
    }
    return patch(row.id, body);
  }

  /* ── Sample book ──────────────────────────────────────────────────────── */

  /* Shaped on the published case studies of a firm in this business, so the
     numbers are the right ORDER OF MAGNITUDE rather than invented — a few
     MWh of storage per site, MW-scale inverters, C&I facility peaks.

     Deliberately imperfect, for the same reason the delivery console's
     sample is: one site sold four months ago and still not commissioned,
     one paused, one live with no metered saving yet, one pilot with a
     modelled number that must not be added to real money, and one site
     with a segment key nobody configured. A board where everything is
     green teaches nobody how to read it. */
  function sampleRows() {
    var d = function (s) { return s; };
    return [
      {
        id:'s1', siteName:'Bio-manufacturing plant', customerName:'Confidential \u2014 bio-manufacturing',
        segment:'industrial', status:'autonomous', city:'Greenville', state:'SC', iso:'nonom',
        utility:'Duke Energy Progress', tariff:'cbl_rtp',
        bessKw:2000, bessKwh:10000, solarKwDc:1500, solarKwAc:1200, peakLoadKw:3400,
        flexKw:250, units:1, unitsLive:1, meterChannels:15, contractType:'subscription',
        arr:96000, savingsBasis:'metered', annualSavings:434498, carbonKgYr:5579,
        soldAt:d('2025-11-04'), liveAt:d('2026-02-18'), optimaUrl:''
      },
      {
        id:'s2', siteName:'Regional airport \u2014 terminal campus', customerName:'Southeast airport authority',
        segment:'transport', status:'autonomous', city:'Columbia', state:'SC', iso:'nonom',
        utility:'Dominion Energy SC', tariff:'tou',
        bessKw:2500, bessKwh:10000, solarKwDc:2500, solarKwAc:2100, peakLoadKw:1600,
        flexKw:400, genKw:800, units:2, unitsLive:2, meterChannels:30,
        contractType:'enterprise', arr:180000,
        savingsBasis:'metered', annualSavings:36000, carbonKgYr:19400,
        soldAt:d('2025-08-12'), liveAt:d('2025-12-01')
      },
      {
        id:'s3', siteName:'University campus \u2014 central plant', customerName:'State university system',
        segment:'campus', status:'autonomous', city:'Columbia', state:'SC', iso:'nonom',
        utility:'Dominion Energy SC', tariff:'cbl_rtp',
        bessKw:2000, bessKwh:4000, solarKwDc:1250, solarKwAc:960, peakLoadKw:900,
        flexKw:600, units:1, unitsLive:1, meterChannels:15,
        contractType:'subscription', arr:84000,
        savingsBasis:'metered', annualSavings:275087, carbonKgYr:41200,
        soldAt:d('2025-09-30'), liveAt:d('2026-01-20')
      },
      {
        /* Live, but the saving has never been metered. Reads "—" rather
           than 0: a site can be dispatching and simply not have a settled
           bill period yet, and a zero here would drag the realised total
           down for a reason that is not real. */
        id:'s4', siteName:'Cold storage distribution centre', customerName:'National 3PL operator',
        segment:'industrial', status:'autonomous', city:'Atlanta', state:'GA', iso:'nonom',
        utility:'Georgia Power', tariff:'tou_demand',
        bessKw:1000, bessKwh:4500, solarKwDc:1000, solarKwAc:1000, peakLoadKw:2900,
        units:1, unitsLive:1, meterChannels:15, contractType:'subscription', arr:72000,
        savingsBasis:'metered', annualSavings:null,
        soldAt:d('2026-03-02'), liveAt:d('2026-06-15')
      },
      {
        /* Control paused. Drops out of managed capacity — that is the point
           of the state, and a fleet number that ignores it is a fiction. */
        id:'s5', siteName:'Office campus \u2014 building A', customerName:'Commercial REIT',
        segment:'commercial', status:'paused', city:'Charlotte', state:'NC', iso:'nonom',
        utility:'Duke Energy Carolinas', tariff:'tou_demand',
        bessKw:200, bessKwh:800, solarKwDc:200, solarKwAc:200, peakLoadKw:450,
        units:1, unitsLive:1, meterChannels:15, contractType:'subscription', arr:36000,
        savingsBasis:'metered', annualSavings:31000, carbonKgYr:3100,
        soldAt:d('2025-10-15'), liveAt:d('2026-01-08'),
        notes:'Customer suspended dispatch during chiller replacement.'
      },
      {
        id:'s6', siteName:'Microgrid \u2014 municipal complex', customerName:'City utility',
        segment:'microgrid', status:'learning', city:'Burlington', state:'VT', iso:'isone',
        utility:'Burlington Electric', tariff:'tou',
        bessKw:500, bessKwh:2000, solarKwDc:400, solarKwAc:350, genKw:750, peakLoadKw:800,
        units:1, unitsLive:1, meterChannels:15, contractType:'pilot_paid', arr:24000,
        savingsBasis:'modeled', annualSavings:62000,
        soldAt:d('2026-05-06'), liveAt:d('2026-07-28')
      },
      {
        /* Sold in April, still not commissioned. The commissioning gap, and
           the row anybody reading this board should open first. */
        id:'s7', siteName:'Data centre \u2014 hall 2', customerName:'Colocation operator',
        segment:'datacenter', status:'shipped', city:'Ashburn', state:'VA', iso:'pjm',
        utility:'Dominion Energy VA', tariff:'rtp',
        bessKw:3000, bessKwh:6000, flexKw:1800, peakLoadKw:9000,
        units:3, unitsLive:0, meterChannels:45, contractType:'enterprise', arr:240000,
        savingsBasis:'modeled', annualSavings:512000,
        soldAt:d('2026-04-21')
      },
      {
        id:'s8', siteName:'EV depot \u2014 north yard', customerName:'Municipal transit fleet',
        segment:'transport', status:'contracted', city:'Newark', state:'NJ', iso:'pjm',
        utility:'PSE&G', tariff:'tou_demand',
        bessKw:600, bessKwh:1200, flexKw:1400, peakLoadKw:2200,
        units:1, unitsLive:0, meterChannels:15, contractType:'subscription', arr:48000,
        savingsBasis:'modeled', annualSavings:88000,
        soldAt:d('2026-07-09')
      },
      {
        /* A virtual pilot: real modelled result, no hardware, no capacity.
           It belongs on the board and must not touch managed capacity or
           realised savings. */
        id:'s9', siteName:'Chemical plant \u2014 feasibility', customerName:'Speciality chemicals group',
        segment:'industrial', status:'pilot', city:'Baton Rouge', state:'LA', iso:'miso',
        utility:'Entergy Louisiana', tariff:'rtp',
        bessKw:2000, bessKwh:10000, peakLoadKw:11000,
        units:0, unitsLive:0, contractType:'pilot_unpaid',
        savingsBasis:'modeled', annualSavings:319379
      },
      {
        /* Segment key nobody configured. Flagged in red rather than folded
           quietly into "Other". */
        id:'s10', siteName:'Naval support activity \u2014 pier', customerName:'Federal facility',
        segment:'defense', status:'commissioning', city:'Norfolk', state:'VA', iso:'pjm',
        utility:'Dominion Energy VA', tariff:'tou',
        bessKw:1500, bessKwh:6000, genKw:2000, peakLoadKw:2400,
        units:2, unitsLive:0, meterChannels:30, contractType:'enterprise', arr:150000,
        savingsBasis:'modeled', annualSavings:141000,
        soldAt:d('2026-06-11')
      }
    ].map(function (r) { return normalize(r.id, r); });
  }

  /* ── Styles ───────────────────────────────────────────────────────────── */

  function injectStyles() {
    if (document.getElementById('mf-styles')) return;
    var s = document.createElement('style');
    s.id = 'mf-styles';
    s.textContent = [
      '#mf-block .mf-ribbon{display:flex;align-items:center;gap:9px;margin:0 0 12px;padding:9px 13px;',
        'border:1px solid #E3C77A;background:#FDF6E3;border-radius:10px;font-size:12.5px;color:#6B551C}',
      '#mf-block .mf-ribbon .mf-tag{background:#8A6D1F;color:#fff;border-radius:5px;padding:2px 7px;',
        'font-size:10px;font-weight:700;letter-spacing:.6px;text-transform:uppercase}',
      '#mf-block .mf-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(146px,1fr));gap:10px;margin-bottom:14px}',
      '#mf-block .mf-kpi{background:#fff;border:1px solid var(--pol-border,#DCE3EA);border-radius:12px;padding:13px 15px}',
      '#mf-block .mf-kpi.hero{border-color:#BBD9F5;background:linear-gradient(180deg,#F7FBFF,#fff)}',
      '#mf-block .mf-kpi .l{font-size:10.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;',
        'color:var(--sap-ink-2,#6B7A88)}',
      '#mf-block .mf-kpi .v{font-size:23px;font-weight:700;color:var(--sap-num,#12212E);margin-top:5px;',
        'font-variant-numeric:tabular-nums;letter-spacing:-.5px}',
      '#mf-block .mf-kpi .s{font-size:11px;color:var(--sap-ink-2,#6B7A88);margin-top:3px;line-height:1.45}',
      '#mf-block .mf-kpi.bad .v{color:#B3261E}',
      '#mf-block .mf-kpi.warn .v{color:#8A5A00}',
      '#mf-block .mf-kpi.good .v{color:#15803D}',
      '#mf-block .mf-cols{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}',
      '#mf-block .mf-card{background:#fff;border:1px solid var(--pol-border,#DCE3EA);border-radius:14px;',
        'padding:18px 20px;box-shadow:var(--pol-shadow,0 1px 3px rgba(20,40,60,.06))}',
      '#mf-block .mf-card-h{font-size:13px;font-weight:700;color:var(--sap-num,#12212E);margin-bottom:2px}',
      '#mf-block .mf-card-s{font-size:11px;color:var(--sap-ink-2,#6B7A88);margin-bottom:14px;line-height:1.5}',
      /* rows with a bar */
      '#mf-block .row{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid #EDF1F5}',
      '#mf-block .row:first-child{border-top:0}',
      '#mf-block .row .nm{flex:1;min-width:0;font-size:12.5px;color:var(--sap-num,#12212E);font-weight:600}',
      '#mf-block .row .nm small{display:block;font-weight:400;color:var(--sap-ink-2,#6B7A88);font-size:11px;',
        'margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '#mf-block .row .bar{width:88px;height:7px;background:#EDF1F5;border-radius:4px;overflow:hidden;flex:0 0 auto}',
      '#mf-block .row .bar i{display:block;height:100%;background:var(--sap-blue,#0070F2);border-radius:4px}',
      '#mf-block .row .bar.dim i{background:#B6C4D1}',
      '#mf-block .row .n{min-width:64px;text-align:right;font-weight:700;font-variant-numeric:tabular-nums;',
        'color:var(--sap-num,#12212E);font-size:12.5px;flex:0 0 auto}',
      '#mf-block .row .n small{display:block;font-weight:400;color:var(--sap-ink-2,#6B7A88);font-size:10.5px}',
      '#mf-block .flag{font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:20px;flex:0 0 auto}',
      '#mf-block .flag.live{background:#E7F6EC;color:#15803D}',
      '#mf-block .flag.idle{background:#F0F2F5;color:#8A96A2}',
      '#mf-block .flag.bad{background:#FDECEA;color:#B3261E}',
      '#mf-block .flag.obs{background:#EEF2F6;color:#5C6B7A}',
      /* funnel */
      '#mf-block .fun{display:flex;flex-direction:column;gap:9px}',
      '#mf-block .fun-row{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--sap-ink,#3E4C59)}',
      '#mf-block .fun-row .fl{width:104px;flex:0 0 auto}',
      '#mf-block .fun-bar{flex:1;height:7px;background:#EDF1F5;border-radius:4px;overflow:hidden}',
      '#mf-block .fun-bar i{display:block;height:100%;border-radius:4px}',
      '#mf-block .fun-n{width:26px;text-align:right;font-weight:700;color:var(--sap-num,#12212E);',
        'font-variant-numeric:tabular-nums}',
      /* table */
      '#mf-block .mf-tbl{width:100%;border-collapse:collapse;font-size:12.5px}',
      '#mf-block .mf-tbl th{text-align:left;font-size:10.5px;font-weight:700;letter-spacing:.5px;',
        'text-transform:uppercase;color:var(--sap-ink-2,#6B7A88);padding:0 12px 9px 0;white-space:nowrap}',
      '#mf-block .mf-tbl td{padding:10px 12px 10px 0;border-top:1px solid #EDF1F5;color:var(--sap-ink,#3E4C59);',
        'vertical-align:top}',
      '#mf-block .mf-tbl td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}',
      '#mf-block .mf-tbl td.nm{font-weight:600;color:var(--sap-num,#12212E)}',
      '#mf-block .mf-tbl td.nm small{display:block;font-weight:400;color:var(--sap-ink-2,#6B7A88);',
        'font-size:11px;margin-top:2px}',
      '#mf-block .mf-tbl tr:hover td{background:#F7FAFC}',
      '#mf-block .chip{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10.5px;',
        'font-weight:700;white-space:nowrap}',
      '#mf-block .mf-act{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:14px}',
      '#mf-block .mf-btn{display:inline-block;border-radius:8px;padding:8px 14px;font-size:12.5px;',
        'font-weight:600;text-decoration:none;cursor:pointer;border:1px solid var(--pol-border,#DCE3EA);',
        'background:#fff;color:var(--sap-ink,#3E4C59)}',
      '#mf-block .mf-btn.pri{background:var(--sap-blue,#0070F2);border-color:var(--sap-blue,#0070F2);color:#fff}',
      '#mf-block .mf-btn:hover{border-color:var(--sap-blue,#0070F2)}',
      '#mf-block .mf-foot{font-size:11px;color:var(--sap-ink-2,#6B7A88);margin-top:12px;line-height:1.55}',
      '#mf-block .mf-note{font-size:11px;color:#6B551C;background:#FDF8EC;border:1px solid #EFDFB8;',
        'border-radius:8px;padding:8px 11px;margin-top:12px;line-height:1.55}',
      '#mf-block .mf-empty{padding:26px 20px;text-align:center;color:var(--sap-ink-2,#6B7A88);',
        'font-size:13px;line-height:1.65}',
      '@media(max-width:1100px){#mf-block .mf-cols{grid-template-columns:1fr}}',
      '@media(max-width:760px){#mf-block .mf-scroll{overflow-x:auto}#mf-block .mf-tbl{min-width:760px}}'
    ].join('');
    document.head.appendChild(s);
  }

  /* ── Render ───────────────────────────────────────────────────────────── */

  function kpiCards(a) {
    var k = a.kpi, C = cfg();

    /* Order is the argument: what we control, then how much storage, then
       where, then what we sold, then the gap between sold and live. */
    var cards = [
      { l:'Power under management', v: k.managedKw ? kw(k.managedKw) : '\u2014',
        s: k.sitesLive + ' site' + (k.sitesLive === 1 ? '' : 's') + ' dispatching',
        cls:'hero' },
      { l:'Storage under management', v: k.managedKwh ? kwh(k.managedKwh) : '\u2014',
        s:'Battery energy, not power', cls:'hero' },
      { l:'Where', v: k.states || '\u2014',
        s: k.states === 1 ? 'state' : 'states \u00B7 ' + k.markets + ' markets' },
      { l: C.unitLabel + ' sold', v: k.unitsSold || '\u2014',
        s: k.unitsLive + ' commissioned and reporting' },
      { l:'Awaiting commissioning', v: k.unitsPending || 0,
        s: k.sitesPipeline + ' site' + (k.sitesPipeline === 1 ? '' : 's') + ' \u00B7 ' +
           (k.contractedKw ? kw(k.contractedKw) + ' contracted' : 'no capacity stated'),
        cls: k.unitsPending ? 'warn' : 'good' },
      { l:'Realised savings', v: k.savingsMetered ? money(k.savingsMetered) + '/yr' : '\u2014',
        s: (k.awaitingMeter
              ? k.meteredSites + ' metered \u00B7 ' + k.awaitingMeter + ' live, not yet billed'
              : (k.savingsModeled ? money(k.savingsModeled) + '/yr modelled, held apart'
                                  : 'Metered sites only')) }
    ];

    return '<div class="mf-kpis">' + cards.map(function (c) {
      return '<div class="mf-kpi ' + (c.cls || '') + '">' +
             '<div class="l">' + esc(c.l) + '</div>' +
             '<div class="v">' + esc(String(c.v)) + '</div>' +
             '<div class="s">' + esc(c.s) + '</div></div>';
    }).join('') + '</div>';
  }

  /* WHERE — the card the brief asks for. State rollup on top, market
     rollup underneath, because "which state" and "which market" are two
     different questions and only one of them changes what the fleet earns. */
  function placeCard(a) {
    var max = 1;
    a.byPlace.forEach(function (p) { if (p.kw > max) max = p.kw; });

    var rows = a.byPlace.length ? a.byPlace.slice(0, 8).map(function (p) {
      var sub = p.cityCount ? p.cityCount + (p.cityCount === 1 ? ' location' : ' locations') : '';
      var flag = p.live ? '<span class="flag live">' + p.live + ' live</span>'
                        : '<span class="flag idle">none live</span>';
      return '<div class="row">' +
        '<div class="nm">' + esc(p.label) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>' +
        flag +
        '<span class="bar"><i style="width:' + Math.round(p.kw / max * 100) + '%"></i></span>' +
        '<span class="n">' + esc(p.kw ? kw(p.kw) : '\u2014') +
          '<small>' + p.sites + ' site' + (p.sites === 1 ? '' : 's') + '</small></span>' +
        '</div>';
    }).join('') : '<div class="mf-empty">No sites logged yet.</div>';

    var mk = a.byMarket.map(function (m) {
      return '<span class="chip" style="background:' + (m.organized ? '#E7F0FD' : '#F0F2F5') +
             ';color:' + (m.organized ? '#0B4FA8' : '#5C6B7A') + ';margin:0 6px 6px 0">' +
             esc(m.label) + ' \u00B7 ' + m.sites + '</span>';
    }).join('');

    /* The market note. Organized-market share is the ceiling on anything a
       fleet can earn from aggregation, and it is worth stating plainly
       rather than leaving somebody to infer it from a chip row. */
    var pct = Math.round(a.kpi.organizedPct * 100);
    var note = a.kpi.managedKw
      ? '<div class="mf-note"><b>' + pct + '%</b> of managed power sits in an organized ' +
        'wholesale market' + (pct < 50 ? ', so most of this fleet cannot be aggregated and bid in ' +
        'as it stands \u2014 savings there come from the customer\u2019s own bill, not from market ' +
        'participation.' : '. Aggregation revenue is available to that share.') + '</div>'
      : '';

    return '<div class="mf-card">' +
      '<div class="mf-card-h">Where the fleet sits</div>' +
      '<div class="mf-card-s">Dispatchable power by state. Bars are power under management; ' +
      'the site count includes everything sold, live or not.</div>' +
      rows +
      '<div style="margin-top:14px;padding-top:12px;border-top:1px solid #EDF1F5">' +
      '<div class="mf-card-s" style="margin-bottom:8px">By wholesale market</div>' + mk + '</div>' +
      note + '</div>';
  }

  /* ASSET MIX — the literal "managed assets" answer, split by whether the
     platform commands the asset or merely watches it. */
  function mixCard(a) {
    var max = 1;
    a.mix.forEach(function (m) { if (m.kw > max) max = m.kw; });

    function group(control) {
      return a.mix.filter(function (m) { return m.control === control; }).map(function (m) {
        return '<div class="row">' +
          '<div class="nm">' + esc(m.label) +
            '<small>' + (m.n ? m.n + ' live site' + (m.n === 1 ? '' : 's') : 'none live') + '</small></div>' +
          (control ? '' : '<span class="flag obs">observed</span>') +
          '<span class="bar' + (control ? '' : ' dim') + '"><i style="width:' +
            Math.round(m.kw / max * 100) + '%"></i></span>' +
          '<span class="n">' + esc(m.kw ? kw(m.kw) : '\u2014') +
            (m.kwh ? '<small>' + esc(kwh(m.kwh)) + '</small>' : '') + '</span>' +
        '</div>';
      }).join('');
    }

    return '<div class="mf-card">' +
      '<div class="mf-card-h">What we manage</div>' +
      '<div class="mf-card-s">Across dispatching sites only. Power and energy are separate ' +
      'figures and are never added together.</div>' +
      group(true) +
      '<div style="margin-top:14px;padding-top:12px;border-top:1px solid #EDF1F5">' +
      '<div class="mf-card-s" style="margin-bottom:4px">Observed, not controlled</div>' +
      group(false) + '</div>' +
      '<div class="mf-foot">Only the first group counts toward power under management. ' +
      'Solar is observed and at most curtailed; facility load is context. Counting either ' +
      'as managed capacity would overstate the fleet several times over.</div>' +
      '</div>';
  }

  function segmentCard(a) {
    var max = 1;
    a.bySegment.forEach(function (s) { if (s.kw > max) max = s.kw; });

    var rows = a.bySegment.map(function (s) {
      var flag = s.live ? '<span class="flag live">' + s.live + ' live</span>'
                        : (s.sites ? '<span class="flag idle">' + s.sites + ' sold</span>'
                                   : '<span class="flag idle">none</span>');
      return '<div class="row">' +
        '<div class="nm">' + esc(s.label) + '</div>' + flag +
        '<span class="bar"><i style="width:' + Math.round(s.kw / max * 100) + '%"></i></span>' +
        '<span class="n">' + esc(s.kw ? kw(s.kw) : '\u2014') + '</span></div>';
    }).join('');

    var off = a.offSegment.length
      ? '<div class="mf-note"><b>' + a.offSegment.length + '</b> site' +
        (a.offSegment.length === 1 ? ' carries' : 's carry') +
        ' a facility type that is not in this ' +
        'workspace\u2019s list (' +
        esc(a.offSegment.map(function (r) { return r.segment; })
             .filter(function (v, i, s2) { return s2.indexOf(v) === i; }).join(', ')) +
        '). They are counted in the totals but sit outside every row above \u2014 add the ' +
        'key to <code>fleet.segments</code> or correct the record.</div>'
      : '';

    return '<div class="mf-card">' +
      '<div class="mf-card-h">By facility type</div>' +
      '<div class="mf-card-s">Where the fleet is concentrated. Bars are dispatchable power at ' +
      'live sites; the tag counts sites.</div>' + rows + off + '</div>';
  }

  function funnelCard(a) {
    var max = 1;
    a.funnel.forEach(function (f) { if (f.n > max) max = f.n; });

    var rows = a.funnel.map(function (f) {
      return '<div class="fun-row"><span class="fl">' + esc(f.label) + '</span>' +
        '<span class="fun-bar"><i style="width:' + Math.round(f.n / max * 100) +
        '%;background:' + f.color + '"></i></span>' +
        '<span class="fun-n">' + f.n + '</span></div>';
    }).join('');

    var k = a.kpi;
    var gap = k.contractedKw
      ? '<div class="mf-note"><b>' + kw(k.contractedKw) + '</b> is contracted but not yet ' +
        'dispatching, across ' + k.sitesPipeline + ' site' + (k.sitesPipeline === 1 ? '' : 's') +
        '. That is revenue signed and capacity not yet earned \u2014 it is deliberately outside ' +
        'the headline figure.</div>'
      : '';

    return '<div class="mf-card">' +
      '<div class="mf-card-h">Deployment stage</div>' +
      '<div class="mf-card-s">Sites by where they are between sold and autonomous.</div>' +
      '<div class="fun">' + rows + '</div>' + gap + '</div>';
  }

  function siteTable(a) {
    var C = cfg();
    var rows = a.rows.slice().sort(function (x, y) {
      return dispatchKw(y) - dispatchKw(x);
    }).slice(0, 8);

    if (!rows.length) {
      return '<div class="mf-card"><div class="mf-empty">No sites yet. ' +
        '<a href="' + esc(C.addHref) + '">Add the first one</a>.</div></div>';
    }

    var body = rows.map(function (r) {
      var st = statusOf(r.status);
      var where = [r.city, r.state].filter(Boolean).join(', ');
      var savings = r.annualSavings
        ? money(r.annualSavings) + '/yr' +
          (r.savingsBasis === 'modeled'
            ? ' <span class="chip" style="background:#F3EEFB;color:#6D28D9">modelled</span>' : '')
        : '\u2014';
      return '<tr>' +
        '<td class="nm">' + esc(r.siteName) +
          '<small>' + esc(r.customerName || 'Customer not stated') + '</small></td>' +
        '<td>' + esc(where || '\u2014') +
          '<small style="display:block;color:#8A96A2;font-size:11px">' +
          esc(marketOf(r.iso).label) + '</small></td>' +
        '<td>' + esc(segmentOf(r.segment).label) + '</td>' +
        '<td class="n">' +
          (!dispatchKw(r) ? '\u2014'
            : isDispatching(r)
              ? esc(kw(dispatchKw(r)))
              /* Not dispatching: the capacity exists but is not under
                 management, so it is greyed and qualified rather than
                 printed as a live figure somebody could read off into a
                 total. Same treatment as the register. */
              : '<span style="color:#8A96A2">' + esc(kw(dispatchKw(r))) + ' when live</span>') +
          (r.bessKwh ? '<small style="display:block;color:#8A96A2;font-size:11px">' +
            esc(kwh(r.bessKwh)) + '</small>' : '') + '</td>' +
        '<td class="n">' + (r.units || '\u2014') +
          (r.units && r.unitsLive < r.units
            ? '<small style="display:block;color:#B3261E;font-size:11px">' +
              (r.units - r.unitsLive) + ' pending</small>' : '') + '</td>' +
        '<td><span class="chip" style="background:' + st.color + '1A;color:' + st.color + '">' +
          esc(st.label) + '</span></td>' +
        '<td class="n">' + savings + '</td>' +
        '</tr>';
    }).join('');

    return '<div class="mf-card"><div class="mf-card-h">Largest sites</div>' +
      '<div class="mf-card-s">By dispatchable power. The full register has the rest.</div>' +
      '<div class="mf-scroll"><table class="mf-tbl"><thead><tr>' +
      '<th>Site</th><th>Where</th><th>Type</th><th style="text-align:right">Dispatchable</th>' +
      '<th style="text-align:right">' + esc(C.unitLabel) + '</th><th>Stage</th>' +
      '<th style="text-align:right">Savings</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></div></div>';
  }

  function render(a, sample) {
    var C = cfg();
    var host = document.getElementById('mf-block');
    if (!host) return;

    injectStyles();

    var head =
      '<div class="block-head"><div>' +
      '<div class="block-title">' + esc(C.title) + '</div>' +
      '<div class="block-sub">' + esc(C.subtitle) + '</div>' +
      '</div></div>';

    var ribbon = sample
      ? '<div class="mf-ribbon"><span class="mf-tag">Sample</span>' +
        '<span>An illustrative fleet, shown only while your register is empty. ' +
        'The first real site replaces this permanently.</span></div>'
      : '';

    var actions =
      '<div class="mf-act">' +
      '<a class="mf-btn pri" href="' + esc(C.addHref) + '">Add a site</a>' +
      '<a class="mf-btn" href="' + esc(C.registerHref) + '">Open the fleet register</a>' +
      '<a class="mf-btn" href="/projects.html">Projects in the editor</a>' +
      '</div>';

    host.innerHTML = head + ribbon + actions + kpiCards(a) +
      '<div class="mf-cols">' + placeCard(a) + mixCard(a) + '</div>' +
      '<div class="mf-cols">' + segmentCard(a) + funnelCard(a) + '</div>' +
      siteTable(a);
  }

  /* ── Mount ────────────────────────────────────────────────────────────── */

  function mount() {
    var C = cfg();
    if (!C.enabled || MOUNTED) return false;
    var hostRoot = document.getElementById('dev-fixed');
    if (!hostRoot) return false;

    injectStyles();
    var block = document.createElement('div');
    block.className = 'dash-block';
    block.id = 'mf-block';
    block.setAttribute('data-block', BLOCK_KEY);

    var anchor = hostRoot.querySelector('.dash-block[data-block="' + C.insertAfter + '"]');
    if (anchor && anchor.nextSibling) hostRoot.insertBefore(block, anchor.nextSibling);
    else if (anchor) hostRoot.appendChild(block);
    else hostRoot.insertBefore(block, hostRoot.firstChild);

    MOUNTED = true;
    refresh();
    return true;
  }

  function refresh() {
    if (!MOUNTED) return Promise.resolve();
    var C = cfg();
    return fetchAll().then(function (rows) {
      var sample = false;
      if (!rows.length && C.sampleData) { rows = sampleRows(); sample = true; }
      render(analyse(rows), sample);
    })['catch'](function (e) {
      console.error('[omega-fleet] refresh failed', e);
      render(analyse([]), false);
    });
  }

  /* Ride along with the dashboard's own recompute rather than polling. */
  function hookRollup() {
    if (typeof global.computeLiveRollup !== 'function' || global.computeLiveRollup.__mf) return;
    var orig = global.computeLiveRollup;
    var wrapped = function () {
      var r = orig.apply(this, arguments);
      try { refresh(); } catch (e) {}
      return r;
    };
    wrapped.__mf = true;
    global.computeLiveRollup = wrapped;
  }

  var tries = 0;
  function boot() {
    if (!cfg().enabled) return;
    if (tries++ > 150) return;                      // ~60s, then give up quietly
    hookRollup();
    if (global.OMEGA_WORKSPACE && document.getElementById('dev-fixed')) {
      if (mount()) return;
    }
    setTimeout(boot, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.OmegaFleet = {
    STATUS: STATUS, CONTRACTS: CONTRACTS, MARKETS: MARKETS, TARIFFS: TARIFFS,
    statusOf: statusOf, segmentOf: segmentOf, contractOf: contractOf,
    marketOf: marketOf, tariffOf: tariffOf,
    segments: function () { return cfg().segments; },
    cfg: cfg, esc: esc, kw: kw, kwh: kwh, money: money, tonnes: tonnes,
    toDate: toDate, fmtDate: fmtDate,
    dispatchKw: dispatchKw, observedKw: observedKw,
    isDispatching: isDispatching, isConnected: isConnected,
    isPipeline: isPipeline, isPre: isPre, isEnded: isEnded,
    normalize: normalize, analyse: analyse,
    fetchAll: fetchAll, create: create, patch: patch, setStatus: setStatus,
    sampleRows: sampleRows, refresh: refresh, render: render, orgId: orgId
  };

})(window);
