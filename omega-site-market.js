/* ═══════════════════════════════════════════════════════════════════════════
   omega-site-market.js — who owns this building, and is it for sale
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The Site Finder answers two different questions about one pin. The ENERGY
   half — circuit, headroom, load, battery size — is answered by
   omega-comed-layers.js and omega-capacity-ledger.js. This is the MARKET
   half: who owns it, who operates out of it, is it on the market, and who
   does a rep actually telephone.

   ── THREE PEOPLE, NEVER ONE ────────────────────────────────────────────
   A building has up to three contactable parties and they are not the same
   person:

     OWNER OF RECORD   the assessor's name on the parcel. On industrial land
                       this is usually a holding company or a REIT, and it is
                       the signature on a twenty-year lease.
     OCCUPANT          the business operating there. For a behind-the-meter
                       battery this is frequently the better FIRST call — they
                       pay the demand charge — but they cannot sign for the
                       land and are often a tenant who will be gone in three
                       years.
     LISTING CONTACT   a broker, or an economic-development officer who
                       published the site to a public feed. Reachable, well
                       informed, and not a principal in either sense.

   Collapsing any two of these is a NAMED PAST BUG in this codebase, twice
   over. The Illinois EDC feed's contact was rendered in the owner slot and
   produced cards attributing a warehouse to a named individual at a
   development agency — a rep calling the wrong person, and a person who never
   asked to be a sales lead ending up as one. clearsky-sitefinder.html's
   drawer has kept "Owner" and "Listing contact" in separate sections ever
   since, and the record this module returns keeps owner / occupant / broker
   in three separate blocks for the same reason. There is deliberately NO
   convenience accessor that returns "the contact" — if a caller wants one it
   has to choose, in the open, which of the three it means.

   ── CHEAPEST FIRST, AND MOST OF THE TIME FREE ──────────────────────────
     1. THE ROW ITSELF. ci-industrial.js is 5,507 industrial parcels already
        committed to this repo, carrying the assessor's owner, the PIN, the
        acreage, the assessed value, and — on the ones enrich_ci_layer.py
        matched — the operating business with its phone and website. That is
        real data, it costs nothing, and for the target set (owner-occupied
        industrial that has never been listed) it is usually the whole answer.
     2. THE COUNTY PARCEL LAYER via OmegaListings.parcelAt(). Free for the
        registered counties, a live read of the county's own record — the one
        a rep will be quoted back at them. Note that Cook's public layer
        carries NO owner column at all; that is a fact about the layer, not a
        parcel with no owner, and it is reported as such.
     3. /api/listings, op "detail". METERED — a per-record billed vendor
        agreement behind a serverless function. Never fired by panning,
        never fired on open, never fired twice for one site. The page must
        ask for it explicitly, and needsMetered() exists so the page can put
        a button in front of a rep instead of spending their allowance
        silently.

   Each step is skipped when the row already carries what it would fetch, and
   every step that is skipped, fails or returns nothing says so in `sources`.

   ── NEVER FABRICATE ────────────────────────────────────────────────────
   A field nobody returned is ABSENT, and the block it belongs to is null when
   no source filled any of it. "Owner not resolved" is a correct answer that a
   rep can act on; a plausible-looking name is one they will read out on a
   call. Every value carries `src`, and where a block was filled by more than
   one source the odd keys out are named in `srcOf`. Nothing here derives a
   number from another number.

   ── WHAT THIS IS NOT ───────────────────────────────────────────────────
   It is not a conflict checker. clearsky-sitefinder.html's "Verified against
   source" panel already compares the card against the live county record and
   shouts when they differ; this module fills gaps and does not re-litigate
   that comparison. First source to answer a key owns that key.

   It is also not the configured Crexi search path. OmegaListings' own crexi
   provider talks to a Cloudflare worker whose route a tenant sets in
   Settings; that is SEARCH-time enrichment across a viewport and it carries
   no per-org accounting. The metered detail call goes through /api/ because
   that is where the token check, the tenant's billing record and the meter
   live. Per CLAUDE.md: a hidden link is not a gate, a function that refuses
   is.

     OmegaSiteMarket.forSite(row, opts, cb)   cb(err, market)
     OmegaSiteMarket.cached(id)               resolved record, or null
     OmegaSiteMarket.needsMetered(row)        would a paid lookup add anything
     OmegaSiteMarket.gaps(row)                which blocks are still unanswered
     OmegaSiteMarket.allowance()              { used, cap, remaining, resetsAt }
     OmegaSiteMarket.clear(id)
     OmegaSiteMarket.reset()                 discard account state and pending callbacks

   ES5 only, per CLAUDE.md. var/function/callbacks, no build step. Depends on
   OmegaListings only for step 2, and degrades to steps 1 and 3 without it.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  if (root.OmegaSiteMarket) return;

  var VERSION = 'site-market/1.0';

  /* The metered door. Same origin: no CORS step, no origin allowlist to keep
     in step, and the vendor key stays on the server where it belongs. */
  var ENDPOINT = '/api/listings';
  var TIMEOUT_MS = 25000;

  /* A resolved record is a few hundred bytes. The cap exists so a long
     session on a dense corridor cannot grow without bound; PAID records are
     evicted last, because evicting one means the next open buys the same
     answer a second time. */
  var CACHE_MAX = 400;

  /* ── SOURCE STATUS VOCABULARY ────────────────────────────────────────
     Every entry in `sources` carries one of these. The page renders them
     verbatim; nothing downstream should test for anything else.

       ok        the source answered and filled something
       empty     the source answered and had nothing for this site
       skipped   deliberately not asked — the row already had it, it costs
                 money and nobody authorised the spend, or it cannot apply
       refused   a policy answer: not signed in, not entitled, over the cap
       error     it was asked and it did not work. Named, never swallowed. */

  var CACHE = {};     /* siteId -> market record          */
  var ORDER = [];     /* insertion order, for eviction    */
  var INFLIGHT = {};  /* siteId -> [cb]                   */
  var ALLOWANCE = null;
  var EPOCH = 0;      /* Auth generation; old async work must never publish. */

  /* ─────────────────────────────────────────────────────── small helpers */
  function str(v) { return v == null ? '' : String(v).trim(); }
  function num(v) {
    if (v === '' || v == null) return null;
    var n = parseFloat(v);
    return isNaN(n) ? null : n;
  }
  function isBool(v) { return v === true || v === false; }

  /* First writer wins, and the winner is recorded.

     `src` on a block names the source that opened it. When a later source
     fills a key the first one did not have, that key is named in `srcOf`
     rather than quietly inheriting the block's provenance — a value with the
     wrong source attached is worse than a missing one, because it will be
     defended in a meeting. */
  function fill(block, key, value, src) {
    if (value === undefined || value === null || value === '') return false;
    var cur = block[key];
    if (cur !== undefined && cur !== null && cur !== '') return false;
    block[key] = value;
    if (!block.src) { block.src = src; return true; }
    if (block.src !== src) {
      if (!block.srcOf) block.srcOf = {};
      block.srcOf[key] = src;
    }
    return true;
  }

  /* A block nobody filled is null, not an object full of empty strings. The
     drawer tests the block, and an empty object renders a section with five
     "N/A"s that reads as "we looked and there is nothing there". */
  function sealed(block) {
    var k;
    for (k in block) {
      if (!block.hasOwnProperty(k)) continue;
      if (k === 'src' || k === 'srcOf') continue;
      return block;
    }
    return null;
  }

  function source(mk, key, label, status, note) {
    mk.sources.push({ key: key, label: label, status: status, note: note || '' });
  }

  /* Progress, per source, in the convention omega-compute-lease.js already
     uses: the caller passes onSource(key, state, text) and decides how to
     show it. Nothing in this file touches the DOM. */
  function report(opts, key, state, text) {
    if (!opts || typeof opts.onSource !== 'function') return;
    try { opts.onSource(key, state, text); } catch (e) {}
  }

  /* ─────────────────────────────────────────────────────────── the site */

  /* The ledger's siteId, and this module's cache key. Every provider in
     omega-listings-source.js stamps `id`; a row without one cannot be cached
     against anything and is refused rather than resolved into a record that
     will be re-fetched on every open. */
  function siteId(row) { return str(row && row.id); }

  /* Sample data. The demo provider stamps `sample: true` on every record it
     invents, and isSample() in clearsky-sitefinder.html reads the same flag
     off the provider. Money is never spent against invented data, and a demo
     owner name is never presented with a real source. */
  function isSample(row) {
    return !!(row && (row.sample === true || row.src === 'demo'));
  }

  function rowSrc(row) { return 'record:' + (str(row && row.src) || 'unknown'); }

  /* The PIN. Parcel-derived records carry it as `pin`; the ComEd provider
     uses it AS the record id when the bundle had one, which is why a numeric
     id is accepted as an APN and an "edc:" or "site:" id is not. */
  function apnOf(row) {
    var p = str(row.pin);
    if (p) return p;
    var id = str(row.id);
    return /^\d[\d-]{5,}$/.test(id) ? id : '';
  }

  /* ══════════════════════════════════════════════════════════════════════
     STEP 1 — THE ROW ITSELF.  Free, synchronous, always first.

     omega-comed-listings.js has already normalised the CS_CI bundle onto
     this row. Two things about that normalisation drive the code below and
     both are easy to get backwards:

       · `owner.name` on a ComEd parcel record is the BUSINESS where one was
         matched, and the assessor's name only where one was not — fromParcel
         leads with the operating business on purpose, because that is who
         answers the phone. `ownerOfRecord` is always the assessor's name.
         Reading `owner.name` as the owner of record would put "Cheese
         Merchants of America" in the deed slot on a parcel owned by Crest
         Hill Investment LLC.
       · `owner.phone` on that same record is the BUSINESS's phone (bizPhone)
         and never the owner's. On a harvest or PropertyShark row the same
         field genuinely is the owner's. So the split below is driven by
         whether there is business evidence on the record, not by row.src.
     ══════════════════════════════════════════════════════════════════════ */

  /* ── THE ONE RAW-COLUMN FALLBACK ──────────────────────────────────────
     omega-comed-listings.js owns the CS_CI column names and says so in its
     own comment: one function per bundle, and the bundle's field names appear
     nowhere else. Two of them do not survive that function — bizSite and bizM
     are present on 298 and 1,584 of the 5,507 rows respectively and are read
     by nothing, so a normalised record cannot answer "what is their website"
     or "how far from the parcel centroid was that match", and the second one
     is what tells a rep whether the business match is the building or the
     unit next door.

     They are read here, from the raw row, ONLY as a fallback, and this is the
     only place outside that mapper where a bundle column is named. When
     fromParcel carries them through — as `occupant`, ideally — this block is
     dead and should be deleted rather than left to drift. */
  function rawOccupant(row) {
    return {
      name:   str(row.biz),
      kind:   str(row.bizKind),
      phone:  str(row.bizPhone),
      site:   str(row.bizSite),
      metres: num(row.bizM)
    };
  }

  function stepRecord(row, mk) {
    var src = rowSrc(row);
    var raw = rawOccupant(row);
    var ownerBlock = row.owner || {};

    /* Is there an operating business on this record? `businessSrc` is set by
       fromParcel only when the bundle matched one, so its presence is the
       signal that `owner.name` and `owner.phone` describe the occupant. */
    var bizSrc = str(row.businessSrc);
    var hasBiz = !!(raw.name || bizSrc);

    /* -- owner of record ------------------------------------------------ */
    var ofr = str(row.ownerOfRecord);
    if (!ofr && !hasBiz) ofr = str(ownerBlock.name);   /* no business to confuse it with */
    fill(mk.owner, 'name', ofr, src);
    fill(mk.owner, 'mailing', str(ownerBlock.mailing), src);
    fill(mk.owner, 'asOf', str(row.ownerAsOf), src);
    if (!hasBiz) {
      fill(mk.owner, 'phone', str(ownerBlock.phone), src);
      fill(mk.owner, 'email', str(ownerBlock.email), src);
      fill(mk.owner, 'site', str(ownerBlock.site || ownerBlock.website), src);
    }
    var occupant = row.occupant || {};
    ['name', 'phone', 'email', 'site', 'kind'].forEach(function (key) {
      fill(mk.occupant, key, str(occupant[key]), str(occupant.src) || bizSrc || src);
    });

    /* -- the operating business ----------------------------------------- */
    if (hasBiz) {
      fill(mk.occupant, 'name', raw.name || str(ownerBlock.name), bizSrc || src);
      fill(mk.occupant, 'phone', raw.phone || str(ownerBlock.phone), bizSrc || src);
      fill(mk.occupant, 'site', raw.site, bizSrc || src);
      fill(mk.occupant, 'metres', raw.metres, bizSrc || src);
      /* The business kind, only from the raw column. `subtype` on a
         normalised record is bizKind OR the assessor's class string and
         there is no way to tell which from here — reporting an assessor
         class as the occupant's line of business is exactly the kind of
         confident wrongness this file exists to avoid. */
      fill(mk.occupant, 'kind', raw.kind, bizSrc || src);
    }

    /* -- the parcel ------------------------------------------------------ */
    fill(mk.parcel, 'apn', apnOf(row), src);
    fill(mk.parcel, 'acres', num(row.lotAcres), src);
    fill(mk.parcel, 'assessedValue', num(row.assessedValue), src);
    fill(mk.parcel, 'zoning', str(row.zoning), src);
    var ls = row.lastSale || {};
    if (str(ls.date) || num(ls.price) != null) {
      fill(mk.parcel, 'lastSale', { date: str(ls.date), price: num(ls.price) }, src);
    }

    var got = [];
    if (mk.owner.name) got.push('owner of record');
    if (mk.occupant.name) got.push('occupant');
    if (mk.parcel.apn) got.push('PIN');
    source(mk, 'record', 'Site record · ' + (str(row.src) || 'unknown'),
      got.length ? 'ok' : 'empty',
      got.length ? got.join(', ') + ' read off the record already in hand — no lookup was made.'
                 : 'The record in hand carries no owner, occupant or parcel identifier.');

    /* -- already-known listing ------------------------------------------ */
    /* `listed` and `listingContact` arrive on a ComEd row from the Illinois
       EDC bundle, merged onto the parcel by the provider when the two sit on
       the same building. They answer the market question for free, which is
       why the metered step below is skipped when they are present. */
    stepListingOnRecord(row, mk);
    if (row.broker || row.src === 'crexi') applyListingRecord(mk, row, src, row.asOf);
    hydrateSavedMarket(row, mk);
  }

  /* Durable enrichment fills gaps AFTER the current provider. Preserve each
     field's actual provenance, including srcOf overrides; row.src describes
     the provider row, not a saved assessor/Crexi answer. Never attach an old
     party's phone or mailing address to a different current party. */
  function hydrateSavedMarket(row, mk) {
    var saved = row.market;
    if (!saved || typeof saved !== 'object' ||
        (saved.id != null && str(saved.id) !== siteId(row))) return;
    var fields = {
      owner: ['name', 'mailing', 'asOf', 'phone', 'email', 'site'],
      occupant: ['name', 'phone', 'email', 'site', 'kind', 'metres'],
      broker: ['name', 'firm', 'phone', 'email'],
      listing: ['forSale', 'forLease', 'askPrice', 'askRate', 'capRate', 'daysOnMarket', 'url', 'asOf'],
      parcel: ['apn', 'acres', 'assessedValue', 'zoning', 'lastSale']
    };
    Object.keys(fields).forEach(function (group) {
      var prior = saved[group], target = mk[group];
      if (!prior || typeof prior !== 'object') return;
      var identity = group === 'parcel' ? 'apn' : group === 'listing' ? 'url' : 'name';
      if (str(target[identity]) && str(prior[identity]) &&
          str(target[identity]).toLowerCase() !== str(prior[identity]).toLowerCase()) return;
      fields[group].forEach(function (key) {
        var value = prior[key];
        var provenance = str(prior.srcOf && prior.srcOf[key]) || str(prior.src) || 'saved:market';
        if (key === 'lastSale' && value && typeof value === 'object') {
          value = { date: str(value.date), price: num(value.price) };
        } else if (value != null && typeof value === 'object') return;
        fill(target, key, value, provenance);
      });
    });
    /* Copy rather than alias the saved packet. Exact duplicates are omitted
       so repeated save/reload cycles do not multiply the source history. */
    if (Array.isArray(saved.sources)) saved.sources.forEach(function (entry) {
      if (!entry || typeof entry !== 'object') return;
      var item = { key: str(entry.key), label: str(entry.label), status: str(entry.status), note: str(entry.note) };
      var duplicate = mk.sources.some(function (current) {
        return current.key === item.key && current.label === item.label &&
          current.status === item.status && current.note === item.note;
      });
      if (!duplicate) mk.sources.push(item);
    });
    /* spent and allowance are session/account accounting, not saved facts. */
  }

  function stepListingOnRecord(row, mk) {
    var listed = row.listed || null;
    var contact = row.listingContact || null;
    if (!listed && !contact) return;

    /* The EDC feed and Crexi are different origins with different meanings,
       and a Crexi-primary row keeps its own provenance. */
    var src = (str(row.src) === 'comed') ? 'record:edc' : rowSrc(row);

    if (listed) {
      if (isBool(listed.forSale)) fill(mk.listing, 'forSale', listed.forSale, src);
      if (isBool(listed.forLease)) fill(mk.listing, 'forLease', listed.forLease, src);
      /* The EDC bundle's price is a STRING — "$4.25/sf NNN", "Negotiable" —
         and is not the same field as Crexi's numeric asking price. It travels
         as askPrice only when it parses as a number; otherwise it stays in
         the source note rather than being coerced into one. */
      var p = num(listed.askPrice != null ? listed.askPrice : listed.price);
      if (p != null) fill(mk.listing, 'askPrice', p, src);
      fill(mk.listing, 'askRate', num(listed.askRate), src);
      fill(mk.listing, 'capRate', num(listed.capRate), src);
      fill(mk.listing, 'daysOnMarket', num(listed.daysOnMarket), src);
      fill(mk.listing, 'url', str(listed.url), src);
    }
    if (contact) {
      fill(mk.broker, 'name', str(contact.name), src);
      fill(mk.broker, 'firm', str(contact.firm || contact.org), src);
      fill(mk.broker, 'phone', str(contact.phone), src);
      fill(mk.broker, 'email', str(contact.email), src);
    }

    var note = '';
    if (src === 'record:edc') {
      note = 'Published to the Illinois EDC site feed. The contact is whoever ' +
             'published it — usually a broker or an economic-development ' +
             'officer, not the owner. They can point you at the owner; they are ' +
             'not one.';
      var raw = listed && str(listed.price);
      if (raw && num(raw) == null) note += ' Asking price as published: "' + raw + '".';
    } else {
      note = 'Listing fields came with the site record.';
    }
    source(mk, 'edc', 'Listing carried on the site record', 'ok', note);
  }

  /* ══════════════════════════════════════════════════════════════════════
     STEP 2 — THE COUNTY PARCEL LAYER.  Free, and the county's own record.

     OmegaListings.parcelAt() asks the Cloudflare worker's county registry: a
     point-in-polygon against the assessor's live service, which answers "what
     parcel is this" exactly. It reports which column each value was read from
     in `fields`, and that matters here — `fields.owner === null` means the
     county's public layer has NO owner column (Cook), which is a completely
     different answer from a column that came back blank.
     ══════════════════════════════════════════════════════════════════════ */
  function stepAssessor(row, mk, opts, done) {
    var S = root.OmegaListings;

    if (opts.assessor === false) {
      source(mk, 'assessor', 'County parcel layer', 'skipped',
        'The caller turned the county lookup off for this resolution.');
      done(); return;
    }
    if (!S || typeof S.parcelAt !== 'function') {
      source(mk, 'assessor', 'County parcel layer', 'error',
        'omega-listings-source.js is not loaded on this page, so the county ' +
        'layer could not be asked.');
      done(); return;
    }
    var lat = num(row.lat), lon = num(row.lon);
    if (lat == null || lon == null) {
      source(mk, 'assessor', 'County parcel layer', 'skipped',
        'This record has no coordinates, and a parcel is found by point, not ' +
        'by address.');
      done(); return;
    }
    /* A ZIP-centroid pin can sit a mile from the building, and a parcel
       boundary is a legal line — asking with that point returns whichever
       neighbour it happened to land on, confidently. */
    if (row.approx) {
      source(mk, 'assessor', 'County parcel layer', 'skipped',
        'The pin is ' + (str(row.approxKind) || 'approximate') + ', not the ' +
        'building. A parcel read from it would be a neighbour’s.');
      done(); return;
    }
    /* Already answered. The county layer adds owner and PIN; if the record in
       hand has both, there is nothing here worth a round trip. */
    if (mk.owner.name && mk.parcel.apn) {
      source(mk, 'assessor', 'County parcel layer', 'skipped',
        'The record already carries the owner of record and the PIN.');
      done(); return;
    }

    report(opts, 'assessor', 'busy', 'reading the county parcel layer…');

    /* The registry is asked first, separately, because parcelAt() cannot
       distinguish "no parcel at this point" from "the worker never answered
       and there are no counties registered" — both arrive as a null. It is
       cached after the first call, so this costs one request per session.

       An older omega-listings-source.js that has parcelAt but not counties
       still works; it just loses that distinction, and the note says so
       rather than this file throwing on a page that was fine before. */
    if (typeof S.counties !== 'function') {
      askParcel(null, 'This build of omega-listings-source.js does not expose ' +
        'the county registry, so "no parcel here" cannot be told apart from ' +
        '"no county answered".');
      return;
    }
    S.counties(function (regErr, reg) {
      var n = 0, k;
      for (k in reg) if (reg.hasOwnProperty(k)) n++;
      if (regErr || !n) {
        source(mk, 'assessor', 'County parcel layer', 'error',
          'The county registry did not load' +
          (regErr && regErr.message ? ' (' + regErr.message + ')' : '') +
          ', so no assessor layer could be asked.');
        report(opts, 'assessor', 'warn', 'county registry unavailable');
        done(); return;
      }
      askParcel(n, '');
    });

    function askParcel(n, caveat) {
      S.parcelAt(lat, lon, function (err, p) {
        if (err) {
          source(mk, 'assessor', 'County parcel layer', 'error',
            'The county layer did not answer: ' + (err.message || String(err)) + '.');
          report(opts, 'assessor', 'warn', (err.message || 'did not answer'));
          done(); return;
        }
        if (!p) {
          source(mk, 'assessor', 'County parcel layer', 'empty',
            'No registered county layer has a parcel at this point.' +
            (n ? ' ' + n + ' were available to ask.' : '') +
            (caveat ? ' ' + caveat : ''));
          report(opts, 'assessor', 'warn', 'no parcel at this point');
          done(); return;
        }

        var label = (str(p.county) || 'County') + ' parcel layer';
        var src = 'assessor:' + (str(p.countyKey) || str(p.county) || 'county');
        var flds = p.fields || {};

        fill(mk.parcel, 'apn', str(p.pin), src);
        /* Acreage, assessed value and zoning are read only where the registry
           names a column for them. Today it names idField, addr and owner and
           nothing else, so these stay absent — which is the correct answer,
           not a zero. They are read anyway so that adding a column to the
           worker's registry is a Worker deploy and not a change here. */
        fill(mk.parcel, 'acres', num(p.acres), src);
        fill(mk.parcel, 'assessedValue', num(p.assessedValue), src);
        fill(mk.parcel, 'zoning', str(p.zoning), src);

        var ownerNote;
        if (flds.owner === null || flds.owner === undefined) {
          /* Cook. The public parcel layer carries address and PIN only; the
             owner lives on the Assessor's own feed, keyed by PIN. That feed
             is reachable through the worker's Socrata proxy and this module
             does not query it — naming the gap is the honest answer, and
             guessing that feed's column names would not be. */
          ownerNote = str(p.county) + '’s public parcel layer carries no ' +
            'owner column at all — this is not a parcel without an owner. ' +
            'Its Assessor feed has one, keyed by PIN' +
            (str(p.pin) ? ' (' + str(p.pin) + ')' : '') + ', and is not read here.';
        } else if (!str(p.owner)) {
          ownerNote = 'The owner column (' + flds.owner + ') came back empty on ' +
            'this parcel.';
        } else {
          fill(mk.owner, 'name', str(p.owner), src);
          ownerNote = 'Owner of record read from column ' + flds.owner + '.';
        }
        if (str(p.note)) ownerNote += ' ' + str(p.note);

        source(mk, 'assessor', label, 'ok',
          (str(p.pin) ? 'PIN ' + str(p.pin) + '. ' : '') + ownerNote);
        report(opts, 'assessor', 'ok',
          (str(p.pin) ? 'PIN ' + str(p.pin) : 'parcel found') +
          (str(p.owner) ? ' · ' + str(p.owner) : ''));
        done();
      });
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
     STEP 3 — /api/listings, op "detail".  THIS ONE COSTS MONEY.

     The contract, so that the function and this client cannot drift:

       POST /api/listings
       Authorization: Bearer <firebase id token>
       { op:'detail', siteId, address, city, state, zip, lat, lon }

       200 { ok:true, connected:true, found:true, listing:{…}, cache:'hit'|'miss', provider:'crexi',
             allowance:{ used, cap, remaining, resetsAt } }
       200 { ok:true, connected:false OR found:false, reason:'…', allowance:{…} }
       401/403/429 { error:'…', allowance:{…} }

     `record` is the NORMALIZED listing shape omega-listings-source.js already
     produces — owner{}, broker{}, listed{}, lastSale{}, zoning. The vendor's
     own field names and the map that translates them stay on the server, with
     the key and the contract, per CLAUDE.md: pricing, eligibility and vendor
     mapping run in /api/, and the browser renders what comes back. A provider
     may say where its data lives; it never says what the pipeline is called.

     `spent` is the accounting fact: an upstream cache hit is free and must not
     be counted against anybody's allowance. When the endpoint does not say, a
     2xx is counted as SPENT and the source note records that it was assumed —
     the safe direction to be wrong in is the one that over-reports what a
     tenant has used, not the one that hides it.
     ══════════════════════════════════════════════════════════════════════ */
  function idToken(opts, cb) {
    if (str(opts.token)) { cb(null, str(opts.token)); return; }
    if (typeof opts.getToken === 'function') { opts.getToken(cb); return; }
    var u = null;
    try {
      u = root._currentUser ||
          (root.firebase && root.firebase.auth && root.firebase.auth().currentUser);
    } catch (e) {}
    if (!u || typeof u.getIdToken !== 'function') {
      cb(new Error('Sign in to run a listing lookup — the vendor agreement ' +
                   'is behind your account.'));
      return;
    }
    try {
      u.getIdToken().then(function (t) {
        if (str(t)) cb(null, str(t));
        else cb(new Error('Your session did not return an ID token. Sign in again.'));
      }, function (e) {
        cb(new Error('Your session could not be verified: ' +
                     ((e && e.message) || 'no detail') + '.'));
      });
    } catch (e2) { cb(e2); }
  }

  function postJSON(url, token, body, timeoutMs, cb) {
    var x = new XMLHttpRequest(), done = false;
    function finish(err, status, json) {
      if (done) return;
      done = true;
      cb(err, status, json);
    }
    try { x.open('POST', url, true); } catch (e) { finish(e, 0, null); return; }
    x.timeout = timeoutMs;
    x.setRequestHeader('Content-Type', 'application/json');
    x.setRequestHeader('Authorization', 'Bearer ' + token);
    x.onreadystatechange = function () {
      if (x.readyState !== 4) return;
      var j = null;
      try { j = JSON.parse(x.responseText); } catch (e) { j = null; }
      finish(null, x.status, j);
    };
    x.ontimeout = function () {
      finish(new Error('timed out after ' + Math.round(timeoutMs / 1000) + ' s'), 0, null);
    };
    x.onerror = function () {
      finish(new Error('the request did not reach the server'), 0, null);
    };
    try { x.send(JSON.stringify(body)); } catch (e3) { finish(e3, 0, null); }
  }

  /* Whatever the endpoint reports about the tenant's daily allowance, kept
     verbatim. `remaining` is derived only when the endpoint gave both of the
     numbers it derives from; nothing here invents a cap or a reset time, and
     an endpoint that says nothing leaves allowance() answering null rather
     than a reassuring zero. */
  function rememberAllowance(j) {
    var a = j && j.allowance;
    if (!a || typeof a !== 'object') return;
    var out = {
      used: num(a.used),
      cap: num(a.cap),
      remaining: num(a.remaining),
      resetsAt: a.resetsAt == null ? null : a.resetsAt
    };
    if (out.remaining == null && out.used != null && out.cap != null) {
      out.remaining = Math.max(0, out.cap - out.used);
    }
    ALLOWANCE = out;
  }

  function applyListingRecord(mk, rec, src, asOf) {
    if (!rec) return 0;
    var n = 0;
    var listed = rec.listed || rec.listing || null;
    if (listed) {
      if (isBool(listed.forSale) && fill(mk.listing, 'forSale', listed.forSale, src)) n++;
      if (isBool(listed.forLease) && fill(mk.listing, 'forLease', listed.forLease, src)) n++;
      if (fill(mk.listing, 'askPrice', num(listed.askPrice), src)) n++;
      if (fill(mk.listing, 'askRate', num(listed.askRate), src)) n++;
      if (fill(mk.listing, 'capRate', num(listed.capRate), src)) n++;
      if (fill(mk.listing, 'daysOnMarket', num(listed.daysOnMarket), src)) n++;
      if (fill(mk.listing, 'url', str(listed.url), src)) n++;
      if (str(asOf)) fill(mk.listing, 'asOf', str(asOf), src);
    }
    var b = rec.broker || null;
    if (b) {
      if (fill(mk.broker, 'name', str(b.name), src)) n++;
      if (fill(mk.broker, 'firm', str(b.firm || b.company), src)) n++;
      if (fill(mk.broker, 'phone', str(b.phone), src)) n++;
      if (fill(mk.broker, 'email', str(b.email), src)) n++;
    }
    /* A listing's "owner" is the selling entity as the listing states it, not
       an assessor record. It fills the owner block only when nothing else
       did, it is stamped with the listing's own source, and the source note
       below says where it came from so it is never read as a deed. */
    var o = rec.owner || null;
    if (o && !mk.owner.name && fill(mk.owner, 'name', str(o.name), src)) n++;
    if (o && fill(mk.owner, 'mailing', str(o.mailing), src)) n++;
    if (o && (!mk.owner.name || mk.owner.name === str(o.name))) {
      ['phone', 'email', 'site'].forEach(function (key) {
        if (fill(mk.owner, key, str(o[key]), src)) n++;
      });
    }

    if (fill(mk.parcel, 'zoning', str(rec.zoning), src)) n++;
    if (fill(mk.parcel, 'acres', num(rec.lotAcres), src)) n++;
    if (fill(mk.parcel, 'assessedValue', num(rec.assessedValue), src)) n++;
    var ls = rec.lastSale || null;
    if (ls && (str(ls.date) || num(ls.price) != null)) {
      if (fill(mk.parcel, 'lastSale',
               { date: str(ls.date), price: num(ls.price) }, src)) n++;
    }
    return n;
  }

  function stepMetered(row, mk, opts, done, epoch) {
    var LABEL = 'Listing detail · metered';

    if (isSample(row)) {
      source(mk, 'listings', LABEL, 'skipped',
        'This is a sample record. A metered lookup is never spent on demo data.');
      done(null); return;
    }
    if (!wouldAdd(mk)) {
      source(mk, 'listings', LABEL, 'skipped',
        'The free sources already answered whether this site is on the market ' +
        'and who to call about it, so there is nothing to buy.');
      done(null); return;
    }
    if (opts.spend !== true) {
      source(mk, 'listings', LABEL, 'skipped',
        'A listing lookup is metered and nobody authorised this one. Offer it ' +
        'as a button — see OmegaSiteMarket.needsMetered().');
      done(null); return;
    }
    var address = str(row.addr || row.address);
    var lat = num(row.lat), lon = num(row.lon);
    if (!address && (lat == null || lon == null)) {
      source(mk, 'listings', LABEL, 'skipped',
        'No address and no coordinates — there is nothing to look the ' +
        'listing up by.');
      done(null); return;
    }

    report(opts, 'listings', 'busy', 'asking the listing source…');

    idToken(opts, function (tokErr, token) {
      if (epoch !== EPOCH) return;
      if (tokErr) {
        source(mk, 'listings', LABEL, 'refused', tokErr.message || String(tokErr));
        report(opts, 'listings', 'bad', tokErr.message || 'not signed in');
        done(tokErr); return;
      }

      var body = {
        op: 'detail',
        siteId: siteId(row),
        address: address,
        city: str(row.city), state: str(row.state), zip: str(row.zip),
        lat: lat, lon: lon
      };
      var url = str(opts.url) || ENDPOINT;
      var ms = num(opts.timeoutMs) || TIMEOUT_MS;

      postJSON(url, token, body, ms, function (netErr, status, j) {
        if (epoch !== EPOCH) return;
        rememberAllowance(j);

        if (netErr) {
          /* The one case where this side genuinely cannot know whether money
             changed hands. Said out loud rather than recorded as free. */
          source(mk, 'listings', LABEL, 'error',
            'The lookup ' + (netErr.message || 'failed') + '. Whether the ' +
            'vendor was billed upstream cannot be known from here.');
          report(opts, 'listings', 'warn', netErr.message || 'did not answer');
          done(netErr); return;
        }
        if (status === 404) {
          var e404 = new Error(url + ' is not deployed on this host, so no ' +
            'listing lookup is available here.');
          source(mk, 'listings', LABEL, 'error', e404.message);
          report(opts, 'listings', 'bad', 'endpoint not deployed');
          done(e404); return;
        }
        if (status === 401 || status === 403 || status === 429) {
          var msg = (j && (j.error || j.reason)) ||
            (status === 429 ? 'Today’s listing-lookup allowance is used up.'
                            : 'This account is not entitled to listing lookups.');
          var eRef = new Error(msg);
          source(mk, 'listings', LABEL, 'refused', msg);
          report(opts, 'listings', 'bad', msg);
          done(eRef); return;
        }
        if (status < 200 || status >= 300 || !j) {
          var eHttp = new Error('The listing lookup returned HTTP ' + status + '.');
          source(mk, 'listings', LABEL, 'error', eHttp.message +
            ' Whether the vendor was billed upstream cannot be known from here.');
          report(opts, 'listings', 'warn', 'HTTP ' + status);
          done(eHttp); return;
        }

        /* From here the call reached the vendor's door. */
        if (j.connected === false) {
          source(mk, 'listings', LABEL, 'refused', str(j.reason) || 'Crexi is not connected for this organisation.');
          done(null); return;
        }
        var assumed = (j.spent == null && j.cache !== 'hit' && j.cache !== 'miss');
        var spent = j.spent == null ? j.cache !== 'hit' : j.spent === true;
        if (spent) mk.spent = true;

        var vendor = str(j.source || j.provider) || 'listing source';
        var src = 'listings:' + vendor;
        var tail = assumed
          ? ' The endpoint did not report whether this consumed a lookup, so it ' +
            'is counted as spent.'
          : (spent ? ' One metered lookup was consumed.'
                   : ' Served from the endpoint’s own cache — no lookup ' +
                     'was consumed.');

        if (j.ok === false || j.found === false) {
          source(mk, 'listings', LABEL + ' · ' + vendor, 'empty',
            (str(j.reason) || 'No listing matched this address.') + tail);
          report(opts, 'listings', 'warn', str(j.reason) || 'no listing found');
          done(null); return;
        }

        var rec = j.listing || j.record || j.result || null;
        var n = applyListingRecord(mk, rec, src, j.asOf);
        if (!n) {
          source(mk, 'listings', LABEL + ' · ' + vendor, 'empty',
            'The lookup answered but filled nothing this record did not already ' +
            'have.' + tail);
          report(opts, 'listings', 'warn', 'nothing new');
          done(null); return;
        }

        var note = n + ' field' + (n === 1 ? '' : 's') + ' from ' + vendor + '.' + tail;
        if (mk.owner.src === src) {
          note += ' The owner name here is the selling entity as the LISTING ' +
                  'states it, not an assessor record — no county layer ' +
                  'answered for this parcel.';
        }
        source(mk, 'listings', LABEL + ' · ' + vendor, 'ok', note);
        report(opts, 'listings', 'ok', n + ' field' + (n === 1 ? '' : 's') +
          ' from ' + vendor);
        done(null);
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
     WOULD A PAID LOOKUP ADD ANYTHING

     The question the button has to answer before it is drawn. A site already
     known to be listed, or with a reachable listing contact, has answered the
     market question for free — offering to buy it again is offering to spend
     a rep's allowance on something already on their screen.
     ══════════════════════════════════════════════════════════════════════ */
  function wouldAdd(mk) {
    var hasListing = mk.listing && (isBool(mk.listing.forSale) ||
                                    isBool(mk.listing.forLease) ||
                                    mk.listing.url);
    var hasBroker = mk.broker && mk.broker.name;
    return !(hasListing || hasBroker);
  }

  function blank(row) {
    return {
      id: siteId(row),
      at: new Date().toISOString(),
      owner: {}, occupant: {}, listing: {}, broker: {}, parcel: {},
      sources: [],
      spent: false
    };
  }

  function seal(mk) {
    mk.owner = sealed(mk.owner);
    mk.occupant = sealed(mk.occupant);
    mk.listing = sealed(mk.listing);
    mk.broker = sealed(mk.broker);
    mk.parcel = sealed(mk.parcel);
    return mk;
  }

  /* The free half, run on its own. Used by needsMetered() and gaps() so the
     page can ask what it would get before it asks for anything. */
  function freeView(row) {
    var mk = blank(row);
    stepRecord(row, mk);
    return seal(mk);
  }

  function remember(id, mk) {
    if (!CACHE.hasOwnProperty(id)) ORDER.push(id);
    CACHE[id] = mk;
    while (ORDER.length > CACHE_MAX) {
      /* Unpaid answers go first. Evicting a paid one means the next open buys
         the same answer a second time, which is a real cost, not a cache
         miss. If everything held is paid, the oldest goes and the cap holds. */
      var idx = -1, i;
      for (i = 0; i < ORDER.length; i++) {
        if (!(CACHE[ORDER[i]] && CACHE[ORDER[i]].spent)) { idx = i; break; }
      }
      if (idx < 0) idx = 0;
      var drop = ORDER.splice(idx, 1)[0];
      delete CACHE[drop];
    }
  }

  /* ─────────────────────────────────────────────────────────── the API */

  var M = {};
  M.VERSION = VERSION;
  M.ENDPOINT = ENDPOINT;

  /* Render only sourced facts. URL schemes are checked before HTML escaping. */
  M.html = function (row, busy) {
    function esc(v) { return str(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
    function link(v, kind) {
      var value = str(v), url = value;
      if (kind === 'phone') url = 'tel:' + value.replace(/[^+0-9,;]/g, '');
      else if (kind === 'email') url = /^[^\s@]+@[^\s@]+$/.test(value) ? 'mailto:' + encodeURIComponent(value) : '';
      else if (!/^https?:\/\//i.test(value)) url = '';
      return url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" data-noselect>' + esc(value) + '</a>' : esc(value);
    }
    var mk = M.cached(siteId(row)) || freeView(row);
    var html = '<section data-site-id="' + esc(siteId(row)) + '"><h3>Property &amp; market details</h3>';
    var groups = [['owner', 'Owner'], ['occupant', 'Occupant'], ['broker', 'Broker / listing contact'], ['listing', 'Listing']];
    var labels = { name: 'Name', mailing: 'Mailing address', phone: 'Phone', email: 'Email', site: 'Website', firm: 'Firm', kind: 'Business', metres: 'Match distance (m)', asOf: 'As of', forSale: 'For sale', forLease: 'For lease', askPrice: 'Asking price', askRate: 'Asking rate', capRate: 'Cap rate', daysOnMarket: 'Days on market', url: 'Source listing' };
    groups.forEach(function (group) {
      var block = mk[group[0]];
      html += '<h4>' + group[1] + '</h4>';
      if (!block) { html += '<p>Not resolved from available sources.</p>'; return; }
      Object.keys(labels).forEach(function (key) {
        if (block[key] == null || block[key] === '') return;
        var value = typeof block[key] === 'boolean' ? (block[key] ? 'Yes' : 'No') : block[key];
        var rendered = ['phone', 'email', 'site', 'url'].indexOf(key) >= 0 ? link(value, key) : esc(value);
        html += '<div><b>' + labels[key] + ':</b> ' + rendered + ' <small>[' + esc((block.srcOf || {})[key] || block.src) + ']</small></div>';
      });
    });
    if (busy) html += '<p role="status">Looking up property details…</p>';
    else if (M.needsMetered(row)) html += '<button type="button" data-market-id="' + esc(siteId(row)) + '">Look up Crexi details (metered)</button>';
    html += '<p><a href="https://www.crexi.com/" target="_blank" rel="noopener noreferrer" data-noselect>Open Crexi account</a> · Crexi account access and this organisation’s API connection are separate.</p>';
    var allowance = M.allowance();
    if (allowance && allowance.remaining != null) html += '<p>' + esc(allowance.remaining) + ' listing lookups remaining today.</p>';
    mk.sources.forEach(function (s) { html += '<p><small>' + esc(s.label) + ' — ' + esc(s.status) + ': ' + esc(s.note) + '</small></p>'; });
    return html + '</section>';
  };

  /* forSite(row, opts, cb) — the one entry point.

     Fires ONCE per site. A resolved record is served from cache, and
     concurrent calls for the same site share one resolution, so a drawer that
     re-renders, a keyboard repeat and a double click cost what one open
     costs. It is meant to be called on OPEN. Nothing here throttles a pan,
     because nothing here should ever be wired to one.

     opts (all optional):
       spend      true authorises ONE metered lookup. Default false: without
                  it step 3 is skipped and says so. This is the whole point —
                  the page can show what it would cost before it costs it.
       force      re-resolve a site already cached.
       assessor   false skips the county layer.
       token      an ID token, if the page already holds one.
       getToken   fn(cb(err, token)) if the page mints them its own way.
       url        endpoint override. Default /api/listings.
       timeoutMs  default 25 s.
       onSource   fn(key, state, text) progress, in omega-compute-lease.js's
                  convention: state is busy | ok | warn | bad.

     cb(err, market). A market record ALWAYS comes back when there was a site
     to resolve, carrying whatever the free sources answered — a source that
     failed is named in `sources`, not turned into a dead drawer. `err` is
     non-null in exactly two cases: there was no usable row (market is null),
     or the caller authorised a spend and the spend failed (market is still
     the free-sources record, so the drawer paints and the failure is still
     impossible to miss). */
  M.forSite = function (row, opts, cb) {
    if (typeof opts === 'function') { cb = opts; opts = null; }
    opts = opts || {};
    cb = cb || function () {};
    var epoch = EPOCH;
    var originalOpts = opts;
    opts = {};
    Object.keys(originalOpts).forEach(function (key) { opts[key] = originalOpts[key]; });
    opts.onSource = function (key, state, text) {
      if (epoch === EPOCH && typeof originalOpts.onSource === 'function') originalOpts.onSource(key, state, text);
    };

    if (!row) {
      cb(new Error('No site record — there is nothing to resolve.'), null);
      return;
    }
    var id = siteId(row);
    if (!id) {
      cb(new Error('This site record has no id, so a market record cannot be ' +
                   'held against it. Every listing provider stamps one.'), null);
      return;
    }
    if (!opts.force && CACHE.hasOwnProperty(id)) { cb(null, CACHE[id]); return; }
    if (INFLIGHT.hasOwnProperty(id)) { INFLIGHT[id].push(cb); return; }
    INFLIGHT[id] = [cb];

    var mk = blank(row);
    stepRecord(row, mk);
    stepAssessor(row, mk, opts, function () {
      if (epoch !== EPOCH) return;
      stepMetered(row, mk, opts, function (spendErr) {
        if (epoch !== EPOCH) return;
        seal(mk);
        remember(id, mk);
        var q = INFLIGHT[id];
        delete INFLIGHT[id];
        for (var i = 0; i < q.length; i++) {
          if (epoch !== EPOCH) return;
          /* One caller throwing must not strand the others. It is reported,
             not swallowed. */
          try { q[i](spendErr || null, mk); }
          catch (e) {
            if (root.console && root.console.error) {
              root.console.error('omega-site-market: a forSite callback threw for ' +
                                 id + ':', e);
            }
          }
        }
      }, epoch);
    });
  };

  /* A previously resolved record, or null. Not a defensive copy — the drawer
     reads it and must not write to it. */
  M.cached = function (id) {
    id = str(id);
    return (id && CACHE.hasOwnProperty(id)) ? CACHE[id] : null;
  };

  /* Would a metered lookup add anything for this site. False for sample data,
     false once one has been bought, false when the free sources already said
     whether it is on the market and who to call. */
  M.needsMetered = function (row) {
    if (!row || isSample(row)) return false;
    var id = siteId(row);
    var mk = (id && CACHE.hasOwnProperty(id)) ? CACHE[id] : null;
    if (mk) return mk.spent ? false : wouldAdd(mk);
    return wouldAdd(freeView(row));
  };

  /* Which blocks are still unanswered, for a button that says what it is for
     rather than "Look up". Reads the cache when there is one, the row when
     there is not. */
  M.gaps = function (row) {
    if (!row) return [];
    var id = siteId(row);
    var mk = (id && CACHE.hasOwnProperty(id)) ? CACHE[id] : freeView(row);
    var out = [];
    if (!mk.owner || !mk.owner.name) out.push('owner');
    if (!mk.occupant || !mk.occupant.name) out.push('occupant');
    if (!mk.listing) out.push('listing');
    if (!mk.broker || !mk.broker.name) out.push('broker');
    if (!mk.parcel || !mk.parcel.apn) out.push('parcel');
    return out;
  };

  /* What the endpoint last said about this tenant's allowance, or null when
     it has not said anything. Null is not zero: an allowance nobody has
     reported is unknown, and a UI that renders it as "0 of 0 used" is
     inventing a limit. */
  M.allowance = function () {
    if (!ALLOWANCE) return null;
    return { used: ALLOWANCE.used, cap: ALLOWANCE.cap,
             remaining: ALLOWANCE.remaining, resetsAt: ALLOWANCE.resetsAt };
  };

  M.clear = function (id) {
    id = str(id);
    if (!id || !CACHE.hasOwnProperty(id)) return false;
    delete CACHE[id];
    for (var i = 0; i < ORDER.length; i++) {
      if (ORDER[i] === id) { ORDER.splice(i, 1); break; }
    }
    return true;
  };

  /* Call on every auth change. Requests already sent may still finish (and
     incur upstream usage), but cannot publish data, allowance or callbacks.
     The host must clear its own loading indicators on that same auth change. */
  M.reset = function () {
    EPOCH++;
    CACHE = {};
    ORDER = [];
    INFLIGHT = {};
    ALLOWANCE = null;
  };

  root.OmegaSiteMarket = M;
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
})(typeof window !== 'undefined' ? window : this);
