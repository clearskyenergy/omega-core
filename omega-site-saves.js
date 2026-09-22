/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Durable org-wide /sites saves. ES5 + Firebase compat, no build step.
 *
 * init(orgId, FirebaseUser, cb[, db]); detach() on sign-out.
 * list/get/isSaved; save(record, cb); update/patch(id, fields, cb);
 * remove(id[, {status, note}], cb); onChange(fn) -> unsubscribe.
 * searches.list/get/save/remove; migrate(cb) imports only explicitly scoped
 * browser records. Untagged legacy cs.savedSites is never auto-imported.
 *
 * Callbacks are exactly once: (error, result). LOCAL_ONLY means persisted in
 * this org+user's browser storage, NOT shared. Other errors mean no confirmed
 * persistence. SESSION_CHANGED may follow a write already sent to the old org.
 * State/loading/errors must be surfaced by the host. No automatic write retry
 * or offline sync: local records remain available for explicit migrate().
 *
 * Existing document IDs (including parcel keys) are retained. Conflicting
 * siteId/PIN matches fail closed. Transactions preserve attribution, notes,
 * edits and stage. Rules deny reads of nonexistent /sites documents, so new
 * rows use authenticated Firestore REST createDocument (atomic create-only).
 * The default Firebase database is used; REST requires fetch and getIdToken.
 * Firestore rules remain the security boundary; the caller resolves org aliases.
 */
(function (root) {
  "use strict";
  var S = { VERSION: "2.0.0" }, COLL = "sites", TOOL_KEY = "sitefinder";
  var DEFAULT_STATUS = "target", FREQUENCIES = ["never", "daily", "weekly"];
  var DB = null, ORG = "", ME = {}, USER = null, EPOCH = 0;
  var MODE = "detached", WHY = "Not initialized.", ROWS = Object.create(null);
  var IDS = Object.create(null), OTHER = 0, SEARCH = [], LISTEN = [];
  var UNSUB = null, UNSUB_TD = null, PENDING = [], SEARCH_ERROR = "";
  function noop() {}
  function now() { return Date.now(); }
  function iso() { return new Date().toISOString(); }
  function stamp() { return now(); }
  function str(v) { return v == null ? "" : String(v); }
  function lower(v) { return str(v).trim().toLowerCase(); }
  function num(v) {
    if ((typeof v !== "number" && typeof v !== "string") || str(v).trim() === "") return null;
    var n = Number(v); return isFinite(n) ? n : null;
  }
  function msg(e) { return str(e && (e.message || e.code) || e); }
  function fail(code, text) { var e = new Error(text); e.code = code; return e; }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function copy(v) {
    if (v == null || typeof v !== "object") return v;
    if (typeof v.toMillis === "function") return v.toMillis();
    if (v instanceof Date) return v.getTime();
    var out = Array.isArray(v) ? [] : {};
    Object.keys(v).forEach(function (k) {
      if (k === "__proto__" || k === "constructor" || k === "prototype") return;
      out[k] = copy(v[k]);
    });
    return out;
  }
  function clean(v) {
    if (v === undefined || typeof v === "function" || typeof v === "symbol")
      throw fail("BAD_VALUE", "Undefined and non-data values cannot be stored.");
    if (typeof v === "number" && !isFinite(v)) throw fail("BAD_VALUE", "Numbers must be finite.");
    if (v && typeof v === "object") Object.keys(v).forEach(function (k) {
      if (k === "__proto__" || k === "constructor" || k === "prototype")
        throw fail("BAD_FIELD", "Unsafe field name.");
      clean(v[k]);
    });
    return copy(v);
  }
  function merge(a, b) {
    var out = copy(a || {});
    Object.keys(b).forEach(function (k) { out[k] = copy(b[k]); });
    return out;
  }
  function emit() { LISTEN.slice().forEach(function (fn) { try { fn(); } catch (e) {} }); }
  function callback(cb) {
    var called = false, epoch = EPOCH;
    function done(err, value) {
      if (called) return;
      called = true;
      var i = PENDING.indexOf(done); if (i >= 0) PENDING.splice(i, 1);
      if (epoch !== EPOCH) { err = fail("SESSION_CHANGED", "The saved-sites session changed."); value = null; }
      /* Consumer exceptions must not become a second persistence callback. */
      try { (typeof cb === "function" ? cb : noop)(err || null, value == null ? null : copy(value)); }
      catch (e) { if (root.console) root.console.error("OmegaSiteSaves callback:", e); }
    }
    PENDING.push(done); return done;
  }
  function active(epoch) {
    if (epoch !== EPOCH) throw fail("SESSION_CHANGED", "The saved-sites session changed.");
  }
  function validId(id) {
    try {
      return typeof id === "string" && id.length > 0 && id !== "." && id !== ".." &&
        id.indexOf("/") < 0 && !/^__.*__$/.test(id) && encodeURIComponent(id).length <= 1400;
    } catch (e) { return false; }
  }
  function ready() {
    if (!ORG || !ME.uid) throw fail("NOT_SCOPED", "Initialize with a signed-in user and resolved orgId.");
    if (MODE !== "shared" && MODE !== "local") throw fail("NOT_READY", WHY || "Saved sites are loading.");
  }
  function key(kind) {
    return "cs.savedSites.v2:" + encodeURIComponent(ORG) + ":" + encodeURIComponent(ME.uid) + ":" + kind;
  }
  function readLocal(kind) {
    if (!ORG || !ME.uid) return [];
    var raw = root.localStorage && root.localStorage.getItem(key(kind));
    var data = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(data)) throw fail("LOCAL_READ", "Invalid browser storage.");
    return data;
  }
  function writeLocal(kind, data) {
    if (!root.localStorage) throw fail("LOCAL_WRITE", "Browser storage is unavailable.");
    try { root.localStorage.setItem(key(kind), JSON.stringify(data)); }
    catch (e) { throw fail("LOCAL_WRITE", msg(e)); }
  }
  function localRows() {
    try { return readLocal("sites").filter(function (r) { return r && r.orgId === ORG; }); }
    catch (e) { WHY = "Browser storage could not be read: " + msg(e); return []; }
  }
  function ms(v) {
    if (v && typeof v.toMillis === "function") return v.toMillis();
    if (typeof v === "number") return v;
    return Date.parse(v) || 0;
  }
  function project(d) {
    if (!d) return null;
    /* Keep legacy card-only fields available, with current saved fields winning. */
    var out = merge(d.legacyRecord || {}, d);
    out.id = out.siteId = str(d.siteId || d.id);
    out.addr = d.address != null ? d.address : (d.addr || "");
    out.feederId = d.feeder != null ? d.feeder : (d.feederId || "");
    out.sizePick = own(d, "size") ? copy(d.size) : (d.sizePick || null);
    out.service = own(d, "phase") ? copy(d.phase) : (d.service || null);
    out.starred = d.saved !== false;
    return out;
  }
  S.siteIdAt = function (lat, lon) {
    var a = num(lat), b = num(lon);
    if (a === null || b === null || Math.abs(a) > 90 || Math.abs(b) > 180) return "";
    return "site:" + a.toFixed(5) + "," + b.toFixed(5);
  };
  S.onChange = function (fn) {
    if (typeof fn !== "function") return noop;
    LISTEN.push(fn);
    return function () { var i = LISTEN.indexOf(fn); if (i >= 0) LISTEN.splice(i, 1); };
  };
  S.list = function () {
    var rows = MODE === "shared" ? Object.keys(ROWS).map(function (id) { return ROWS[id]; }) :
      MODE === "local" ? localRows() : [];
    return rows.filter(function (r) { return r.saved !== false; }).map(project)
      .sort(function (a, b) { return ms(b.savedAt || b.updatedAt) - ms(a.savedAt || a.updatedAt); });
  };
  S.get = function (id) {
    if (MODE === "shared") return own(ROWS, id) ? project(ROWS[id]) : null;
    var rows = MODE === "local" ? localRows() : [], i;
    for (i = 0; i < rows.length; i++) if (rows[i].siteId === id) return project(rows[i]);
    return null;
  };
  S.isSaved = function (id) { var r = S.get(id); return !!(r && r.starred); };
  S.mode = function () { return MODE; };
  S.state = function () {
    return { mode: MODE, shared: MODE === "shared", orgId: ORG, repEmail: ME.email || "",
      count: S.list().length, otherRows: OTHER, why: WHY, searchError: SEARCH_ERROR,
      label: MODE === "shared" ? "Shared · " + ORG : MODE === "local" ? "Local only" : MODE,
      detail: MODE === "shared" ? "Sites are shared with " + ORG + "." :
        "Sites are not confirmed shared. " + WHY };
  };
  S.holdsFor = function (id) {
    var l = root.OmegaLedger;
    return ORG && l && l.allocationsForSite ? copy(l.allocationsForSite(str(id)) || []) : [];
  };
  function srcSet(doc, edits, field, val, editKey) {
    if (val === undefined || val === null || val === "") return;
    if (edits[editKey || field]) return;
    doc[field] = val;
  }
  function sizeOf(rec) {
    var s = rec.size || rec.sizePick;
    if (!s) return undefined;
    var kw = num(s.kw), hours = num(s.hours);
    if (kw === null && hours === null) return undefined;
    var out = { kw: kw, hours: hours, at: str(s.at) || iso() };
    if (s.kwh != null) out.kwh = num(s.kwh);
    out.chosen = s.custom === true || s.chosen === true;
    return out;
  }

  function phaseOf(rec) {
    var p = rec.phase || rec.service;
    if (!p || !p.phase) return undefined;
    return {
      phase: str(p.phase),
      confirmed: p.confirmed === true,
      src: str(p.src),
      at: str(p.at) || iso()
    };
  }

  function marketOf(rec) {
    var m = rec.market;
    if (m && typeof m === "object") return m;
    if (!m && !rec.listed && !rec.broker && !rec.lastSale) return undefined;
    var listed = (m && (m.listing || m.listed)) || rec.listed || null;
    var broker = (m && m.broker) || rec.broker || null;
    var sale   = (m && m.lastSale) || rec.lastSale || null;
    var out = {
      at: str(m && m.at) || iso(),
      src: str((m && m.src) || rec.listingSrc || rec.src),
      assembledBy: "omega-site-saves — from the record in hand; no market " +
        "lookup was made"
    };
    if (listed) {
      out.listing = {
        forSale:  listed.forSale === true,
        forLease: listed.forLease === true,
        askPrice: num(listed.askPrice),
        askRate:  num(listed.askRate),
        capRate:  num(listed.capRate),
        daysOnMarket: num(listed.daysOnMarket),
        url: str(listed.url),
        src: out.src
      };
    }
    if (broker) {
      out.broker = { name: str(broker.name), firm: str(broker.firm),
                     phone: str(broker.phone), email: str(broker.email),
                     src: out.src };
    }
    if (sale) out.parcel = { lastSale: { date: str(sale.date), price: num(sale.price) },
                             src: out.src };
    return out;
  }

  function ownerNameOf(rec) {
    var m = rec.market;
    return str(rec.ownerName) || str(rec.ownerOfRecord) ||
           str(m && m.owner && m.owner.name);
  }

  function estimateOf(rec) {
    return rec.estimate && typeof rec.estimate === "object" ? clean(rec.estimate) : undefined;
  }

  /* Persist supplied capacity only; this module does not model headroom. */
  function capacityOf(rec, doc) {
    ["nameplate", "queue", "hostingCapacityKw"].forEach(function (key) {
      if (rec[key] != null && num(rec[key]) !== null) doc[key] = num(rec[key]);
    });
    if (rec.capacityBasis) doc.capacityBasis = str(rec.capacityBasis);
    if (rec.capacityAt) doc.capacityAt = rec.capacityAt;
  }

  function noteEntry(text) {
    return {
      ts: now(),
      rep: ME.name || ME.email || "unattributed",
      t: str(text).slice(0, 600)
    };
  }

  function bodyFor(siteId, rec, existing, isCreate) {
    var edits = (existing && existing.edits) || {};
    var doc = {}, v;
    doc.orgId = ORG;
    doc.siteId = siteId;
    doc.saved = true;
    doc.savedVia = TOOL_KEY;
    if (isCreate && rec.legacyRecord) doc.legacyRecord = clean(rec.legacyRecord);
    doc.savedAt = now();
    doc.updatedAt = stamp();

    doc.status = (existing && str(existing.status)) || str(rec.status) || DEFAULT_STATUS;

    srcSet(doc, edits, "address", str(rec.address || rec.addr));
    srcSet(doc, edits, "siteName", str(rec.siteName) || str(rec.address || rec.addr), "address");
    srcSet(doc, edits, "ownerName", ownerNameOf(rec));
    srcSet(doc, edits, "ownerPhone", str(rec.ownerPhone));
    if (rec.feeder || rec.feederId) doc.feeder = str(rec.feeder || rec.feederId);
    if (rec.sub) doc.sub = str(rec.sub);
    if (num(rec.lat) !== null && num(rec.lon) !== null) {
      doc.lat = num(rec.lat); doc.lon = num(rec.lon);
    }
    capacityOf(rec, doc);
    ["city", "state", "zip", "clsLabel", "cls", "yearBuilt", "assessedValue",
      "owner", "ownerOfRecord", "annualKwh", "photos", "comed", "comedCovering",
      "buffFt", "queueRefreshed", "geoSrc", "geoInterp", "geoStreet", "approx",
      "approxKind", "offTerritory", "addressResolved", "src", "lastSale"].forEach(function (key) {
      if (rec[key] != null) doc[key] = rec[key];
    });

    if (rec.type) doc.type = str(rec.type);
    if (rec.subtype) doc.subtype = str(rec.subtype);
    if (num(rec.sqft) !== null) doc.sqft = num(rec.sqft);
    if (num(rec.lotAcres) !== null) doc.lotAcres = num(rec.lotAcres);
    if (rec.county) doc.county = str(rec.county);
    if (rec.pin) doc.pin = str(rec.pin);

    if (num(rec.score) !== null) { doc.score = num(rec.score); doc.scoredAt = iso(); }
    if (rec.band) doc.band = str(rec.band);
    v = sizeOf(rec);      if (v !== undefined) doc.size = v;
    v = phaseOf(rec);     if (v !== undefined) doc.phase = v;
    v = marketOf(rec);    if (v !== undefined) doc.market = v;
    v = estimateOf(rec);  if (v !== undefined) doc.estimate = v;

    var carried = (Object.prototype.toString.call(rec.notes) === "[object Array]")
      ? rec.notes : null;
    if (isCreate && carried) {
      doc.notes = rec.note ? carried.concat([noteEntry(rec.note)]) : carried;
    } else if (rec.note) {
      doc.notes = ((existing && existing.notes) || []).concat([noteEntry(rec.note)]);
    }
    if (isCreate) {
      doc.createdAt = stamp();
      doc.identifiedAt = stamp();
      doc.repEmail = ME.email;
      doc.repName = ME.name || (ME.email ? ME.email.split("@")[0] : "");
      if (ME.uid) doc.uid = ME.uid;
    }
    if (existing) Object.keys(doc).forEach(function (field) {
      if (edits[field]) delete doc[field];
    });
    return doc;
  }

  var EDITABLE = ("address siteName ownerName ownerPhone feeder sub lat lon type subtype sqft lotAcres " +
    "county score band size phase market estimate nameplate queue hostingCapacityKw capacityBasis capacityAt " +
    "city state zip annualKwh status note").split(" ");
  function validate(rec, patch) {
    clean(rec);
    if (own(rec, "status") && (typeof rec.status !== "string" || !rec.status.trim()))
      throw fail("BAD_STATUS", "status must be a non-empty string.");
    if (own(rec, "notes") && (!Array.isArray(rec.notes) || patch))
      throw fail("NOTES_SHAPE", "Use note to append text; existing notes cannot be replaced.");
    if (own(rec, "orgId") && rec.orgId !== ORG) throw fail("WRONG_ORG", "Record belongs to another org.");
    if (patch) Object.keys(rec).forEach(function (k) {
      if (EDITABLE.indexOf(k) < 0 && ["addr", "feederId", "sizePick", "service"].indexOf(k) < 0)
        throw fail("BAD_FIELD", "Cannot update protected or unknown field: " + k);
    });
  }
  function build(kind, sid, rec, existing) {
    if (rec.note && existing && existing.notes != null && !Array.isArray(existing.notes))
      throw fail("NOTES_SHAPE", "Existing notes need repair before appending.");
    if (kind === "save") return clean(bodyFor(sid, rec, existing, !existing));
    if (!existing) throw fail("NO_SUCH_SITE", "Save the site before updating or removing it.");
    var body = { orgId: ORG, siteId: sid, updatedAt: stamp(),
      status: rec.status || existing.status || DEFAULT_STATUS };
    if (kind === "remove") {
      body.saved = false; body.unsavedAt = now(); body.unsavedBy = ME.email;
    } else {
      Object.keys(rec).forEach(function (k) {
        if (k !== "note") body[k] = rec[k];
      });
      [["addr", "address"], ["feederId", "feeder"], ["sizePick", "size"], ["service", "phase"]]
        .forEach(function (pair) {
          if (own(body, pair[0])) { if (!own(body, pair[1])) body[pair[1]] = body[pair[0]]; delete body[pair[0]]; }
        });
      [["size", sizeOf], ["phase", phaseOf], ["market", marketOf], ["estimate", estimateOf]]
        .forEach(function (pair) {
          var field = pair[0], wrapped = {};
          if (own(body, field) && body[field] !== null) {
            wrapped[field] = body[field]; body[field] = pair[1](wrapped);
            if (body[field] === undefined) throw fail("BAD_VALUE", "Invalid " + field + ".");
          }
        });
      /* A deliberate correction must survive a later source refresh. */
      ["address", "siteName", "ownerName", "ownerPhone"].forEach(function (field) {
        if (own(rec, field) || (field === "address" && own(rec, "addr"))) {
          body.edits = body.edits || copy(existing.edits || {});
          body.edits[field === "siteName" ? "address" : field] = true;
        }
      });
      if (rec.score != null) body.scoredAt = iso();
    }
    if (rec.note) {
      if (existing.notes != null && !Array.isArray(existing.notes))
        throw fail("NOTES_SHAPE", "Existing notes need repair before appending.");
      body.notes = (existing.notes || []).concat([noteEntry(rec.note)]);
    }
    return clean(body);
  }
  function docId(sid, rec) { return ORG + "__" + (rec.pin ? str(rec.pin) : sid); }
  function candidates(db, org, sid, rec) {
    /* Server query is legal for an empty collection; a missing-document get
       is denied by mineHere(). Also finds existing noncanonical IDs. */
    return db.collection(COLL).where("orgId", "==", org).get({ source: "server" }).then(function (snap) {
      var matches = [];
      snap.forEach(function (d) {
        var r = d.data();
        if (r.orgId !== org) throw fail("WRONG_ORG", "Unexpected org in sites query.");
        if (r.siteId === sid || (rec.pin && str(r.pin) === str(rec.pin)) ||
            d.id === org + "__" + sid || (rec.pin && d.id === org + "__" + str(rec.pin)))
          matches.push({ id: d.id, data: r });
      });
      if (matches.length > 1) throw fail("AMBIGUOUS_SITE", "Multiple site/PIN rows match; reconcile them first.");
      if (matches.length && matches[0].data.siteId && matches[0].data.siteId !== sid)
        throw fail("SITE_KEY_CONFLICT", "This parcel already has a different siteId.");
      return matches[0] || null;
    });
  }
  function wireValue(v) {
    if (v === null) return { nullValue: null };
    if (typeof v === "string") return { stringValue: v };
    if (typeof v === "boolean") return { booleanValue: v };
    if (typeof v === "number") return { doubleValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(wireValue) } };
    var fields = {};
    Object.keys(v).forEach(function (k) { fields[k] = wireValue(v[k]); });
    return { mapValue: { fields: fields } };
  }
  function createOnly(db, user, id, body, epoch) {
    var projectId = db.app && db.app.options && db.app.options.projectId;
    if (!projectId || !root.fetch || !user || !user.getIdToken)
      return Promise.reject(fail("CREATE_UNAVAILABLE", "New sites require fetch, FirebaseUser.getIdToken and db.app.options.projectId."));
    return user.getIdToken().then(function (token) {
      active(epoch);
      return root.fetch("https://firestore.googleapis.com/v1/projects/" + encodeURIComponent(projectId) +
        "/databases/(default)/documents/sites?documentId=" + encodeURIComponent(id), {
        method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ fields: wireValue(body).mapValue.fields })
      });
    }).then(function (response) {
      if (response.ok) return;
      return response.json().then(function (data) {
        throw fail(response.status === 409 ? "ALREADY_EXISTS" : "WRITE_FAILED",
          data.error && data.error.message || "Firestore create failed.");
      });
    });
  }
  function sharedWrite(kind, sid, rec, epoch, importOnly) {
    var db = DB, org = ORG, user = USER;
    function attempt(retry) {
      active(epoch);
      return candidates(db, org, sid, rec).then(function (hit) {
        active(epoch);
        if (importOnly && hit) return { skipped: true, row: hit.data };
        if (!hit) {
          if (kind !== "save") throw fail("NO_SUCH_SITE", "Save the site first.");
          var id = docId(sid, rec), body = build(kind, sid, rec, null);
          if (!validId(id)) throw fail("BAD_ID", "Invalid site/PIN document key.");
          return createOnly(db, user, id, body, epoch).then(function () {
            return { row: body, id: id };
          }, function (err) {
            if (err.code === "ALREADY_EXISTS" && !retry) return attempt(true);
            throw err;
          });
        }
        var ref = db.collection(COLL).doc(hit.id);
        return db.runTransaction(function (tx) {
          active(epoch);
          return tx.get(ref).then(function (snap) {
            active(epoch);
            if (!snap.exists) throw fail("NO_SUCH_SITE", "Site was removed by another writer.");
            var existing = snap.data();
            if (existing.orgId !== org || (existing.siteId && existing.siteId !== sid))
              throw fail("WRONG_ORG", "Site identity changed.");
            var patch = build(kind, sid, rec, existing);
            /* update replaces supplied maps, including explicit nulls. The
               transaction read preserves all other fields and concurrent notes. */
            tx.update(ref, patch);
            return { row: merge(existing, patch), id: hit.id };
          });
        });
      });
    }
    return attempt(false);
  }
  function mutate(kind, id, input, cb) {
    var done = callback(cb), epoch = EPOCH, rec, sid;
    try {
      ready(); rec = clean(input || {});
      sid = str(id || rec.siteId || rec.id) || S.siteIdAt(rec.lat, rec.lon);
      if (!validId(sid)) throw fail("NO_SITE_ID", "A valid siteId or coordinates are required.");
      validate(rec, kind === "update");
      if (MODE === "local") {
        var rows = readLocal("sites"), index = -1;
        rows.forEach(function (r, i) { if (r.orgId === ORG && r.siteId === sid) index = i; });
        var existing = index < 0 ? null : rows[index], body = build(kind, sid, rec, existing);
        var row = merge(existing, body);
        if (index < 0) rows.push(row); else rows[index] = row;
        writeLocal("sites", rows); emit();
        done(fail("LOCAL_ONLY", "Stored on this browser for this org and user only."), project(row)); return;
      }
      sharedWrite(kind, sid, rec, epoch).then(function (result) {
        if (epoch !== EPOCH) { done(fail("SESSION_CHANGED", "Session changed.")); return; }
        /* The stream owns ROWS. Replacing it with a completion callback's
           snapshot can roll back a newer update received during commit. */
        done(null, project(result.row));
      }, function (err) { done(err); });
    } catch (e) { done(e); }
  }
  S.save = function (rec, cb) { mutate("save", null, rec, cb); };
  S.update = S.patch = function (id, fields, cb) { mutate("update", id, fields, cb); };
  S.remove = function (id, opts, cb) {
    if (typeof opts === "function") { cb = opts; opts = {}; }
    mutate("remove", id, opts || {}, cb);
  };
  function searchRef(db, org) { return db.collection("toolData").doc(org).collection("tools").doc(TOOL_KEY); }
  function searchRows(snap) {
    var d = snap && snap.exists ? snap.data() : {};
    return d && d.data && Array.isArray(d.data.searches) ? d.data.searches : [];
  }
  function changeSearch(rec, remove, cb) {
    var done = callback(cb), epoch = EPOCH;
    try {
      ready(); rec = clean(rec || {});
      var id = str(rec.id) || ("srch_" + now().toString(36) + Math.random().toString(36).slice(2));
      function next(rows) {
        active(epoch);
        var old = null, out = [];
        rows.forEach(function (r) { if (r.id === id) old = r; else out.push(r); });
        if (remove && !old) throw fail("NO_SUCH_SEARCH", "Search does not exist.");
        var row = null;
        if (!remove) {
          row = merge(old, rec); row.id = id;
          row.name = str(row.name).slice(0, 120) || "Untitled search";
          var frequency = rec.alertFrequency || (row.alert && row.alert.frequency) || "never";
          row.alert = { frequency: FREQUENCIES.indexOf(frequency) >= 0 ? frequency : "never",
            delivered: false, lastRunAt: null, note: "No alert sender is deployed." };
          row.by = old && old.by || ME.email; row.createdAt = old && old.createdAt || now();
          row.updatedAt = now(); out.unshift(row);
        }
        return { rows: out, row: row };
      }
      if (MODE === "local") {
        var result = next(readLocal("searches"));
        writeLocal("searches", result.rows); SEARCH = result.rows; emit();
        done(fail("LOCAL_ONLY", "Search stored on this browser only."), result.row); return;
      }
      var db = DB, ref = searchRef(db, ORG);
      db.runTransaction(function (tx) {
        active(epoch);
        return tx.get(ref).then(function (snap) {
          var result = next(searchRows(snap));
          tx.set(ref, { data: { searches: result.rows }, updatedAt: now() }, { merge: true });
          return result.row;
        });
      }).then(function (row) { done(null, row); }, function (e) { done(e); });
    } catch (e) { done(e); }
  }
  S.searches = {
    FREQUENCIES: FREQUENCIES.slice(),
    list: function () { return copy(SEARCH).sort(function (a, b) { return ms(b.updatedAt) - ms(a.updatedAt); }); },
    get: function (id) { var rows = S.searches.list(), i; for (i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i]; return null; },
    save: function (rec, cb) { changeSearch(rec, false, cb); },
    remove: function (id, cb) { changeSearch({ id: id }, true, cb); }
  };
  /* Explicit recovery only: old browser stars have no reliable tenant tag.
     Never mutate their source, overwrite an existing site, or import a row
     attributed to a different account. Backup must succeed before any write. */
  S.legacyBackup = function () {
    return root.localStorage && root.localStorage.getItem("cs.savedSites") || "[]";
  };
  S.legacyList = function () {
    if (!ORG || !ME.uid) return [];
    var rows = JSON.parse(S.legacyBackup());
    if (!Array.isArray(rows)) throw fail("LOCAL_READ", "Old starred-site storage is not an array.");
    return rows.filter(function (r) {
      return r && r.starred !== false && r.saved !== false &&
        (!r.orgId || r.orgId === ORG) && (!r.uid || r.uid === ME.uid);
    }).map(copy);
  };
  S.restoreLegacy = function (confirmedOrg, cb) {
    var done = callback(cb), epoch = EPOCH;
    var out = { created: 0, skipped: 0, failed: [] };
    try {
      ready();
      if (confirmedOrg !== ORG) throw fail("NOT_SCOPED", "Confirm the destination organisation first.");
      if (MODE !== "shared") throw fail("NOT_READY", "Restoring stars requires a shared connection.");
      var raw = S.legacyBackup(), rows = S.legacyList();
      var backupKey = "cs.savedSites.backup:" + now();
      root.localStorage.setItem(backupKey, raw);
      if (root.localStorage.getItem(backupKey) !== raw) throw fail("LOCAL_WRITE", "Could not verify the original starred-site backup.");
      var chain = Promise.resolve();
      rows.forEach(function (original) {
        chain = chain.then(function () {
          active(epoch);
          var rec = copy(original), sid = rec.siteId || rec.id || S.siteIdAt(rec.lat, rec.lon);
          if (!validId(sid)) throw fail("BAD_ID", "This original card has no valid site identifier.");
          rec.siteId = sid; rec.legacyRecord = copy(original);
          validate(rec, false);
          return sharedWrite("save", sid, rec, epoch, true);
        }).then(function (result) {
          if (result.skipped) out.skipped++; else out.created++;
        }, function (e) {
          if (epoch !== EPOCH) throw e;
          out.failed.push({ siteId: original.siteId || original.id || "", why: msg(e) });
        });
      });
      chain.then(function () { done(out.failed.length ? fail("PARTIAL", "Some original cards could not be restored; originals and backup remain intact.") : null, out); },
        function (e) { done(e, out); });
    } catch (e) { done(e, out); }
  };
  S.migrate = function (cb) {
    var done = callback(cb), epoch = EPOCH;
    var out = { created: 0, skipped: 0, failed: [], ignoredLegacy: 0, notAttempted: 0 };
    try {
      ready();
      if (MODE !== "shared") throw fail("LOCAL_ONLY", "Migration requires a shared connection.");
      var rows = readLocal("sites"), raw = root.localStorage && root.localStorage.getItem("cs.savedSites");
      var legacy = raw ? JSON.parse(raw) : [];
      if (Array.isArray(legacy)) legacy.forEach(function (r) {
        if (r && r.orgId === ORG && r.uid === ME.uid && r.starred === true) rows.push(r);
        else out.ignoredLegacy++;
      });
      var seen = Object.create(null);
      rows = rows.filter(function (r) {
        var sid = r && (r.siteId || r.id || S.siteIdAt(r.lat, r.lon));
        if (!r || r.orgId !== ORG || r.saved === false || !validId(sid) || seen[sid]) return false;
        seen[sid] = true; r.siteId = sid; return true;
      });
      /* Sequential import; no marker can hide failed or excess rows.
         Existing rows are always skipped, and browser originals remain intact. */
      var chain = Promise.resolve();
      rows.forEach(function (rec) {
        chain = chain.then(function () {
          active(epoch); validate(rec, false);
          return sharedWrite("save", rec.siteId, rec, epoch, true);
        }).then(function (result) { if (result.skipped) out.skipped++; else out.created++; },
          function (e) { if (epoch !== EPOCH) throw e; out.failed.push({ siteId: rec.siteId, why: msg(e) }); });
      });
      chain.then(function () {
        done(out.failed.length || out.notAttempted ? fail("PARTIAL", "Some browser rows were not imported.") : null, out);
      }, function (e) { done(e, out); });
    } catch (e) { done(e, out); }
  };
  S.detach = function () {
    EPOCH++;
    if (UNSUB) { try { UNSUB(); } catch (e) {} }
    if (UNSUB_TD) { try { UNSUB_TD(); } catch (e) {} }
    UNSUB = UNSUB_TD = null; DB = null; USER = null; ORG = ""; ME = {};
    ROWS = Object.create(null); IDS = Object.create(null); SEARCH = []; OTHER = 0;
    MODE = "detached"; WHY = "Signed out or detached."; SEARCH_ERROR = "";
    PENDING.slice().forEach(function (done) { done(fail("SESSION_CHANGED", WHY)); });
    emit();
  };
  S.init = function (org, user, cb, db) {
    S.detach();
    var done = callback(cb), epoch = EPOCH;
    ORG = lower(org); USER = user;
    ME = { uid: str(user && user.uid), email: lower(user && user.email),
      name: str(user && user.displayName) || lower(user && user.email) };
    if (!validId(ORG) || !ME.uid || !ME.email) {
      ORG = ""; ME = {}; MODE = "detached"; WHY = "A signed-in work account and resolved orgId are required.";
      emit(); done(fail("NOT_SCOPED", WHY), S.state()); return;
    }
    DB = db || null;
    if (!DB && root.firebase) { try { DB = root.firebase.firestore(); } catch (e) {} }
    if (!DB) {
      MODE = "local"; WHY = "Firestore unavailable; browser storage is scoped to this org and user.";
      try { SEARCH = readLocal("searches"); } catch (e) { SEARCH_ERROR = msg(e); }
      emit(); done(fail("LOCAL_ONLY", WHY), S.state()); return;
    }
    MODE = "loading"; WHY = "Waiting for a server-confirmed sites snapshot."; emit();
    try {
      UNSUB_TD = searchRef(DB, ORG).onSnapshot(function (snap) {
        if (epoch !== EPOCH) return;
        SEARCH = copy(searchRows(snap)); SEARCH_ERROR = ""; emit();
      }, function (e) {
        if (epoch !== EPOCH) return;
        SEARCH = []; SEARCH_ERROR = msg(e); emit();
      });
      UNSUB = DB.collection(COLL).where("orgId", "==", ORG).onSnapshot(
        { includeMetadataChanges: true }, function (snap) {
          if (epoch !== EPOCH) return;
          if (snap.metadata && snap.metadata.fromCache && MODE !== "shared") return;
          var rows = Object.create(null), ids = Object.create(null), other = 0;
          snap.forEach(function (d) {
            var r = d.data();
            if (!r || r.orgId !== ORG) return;
            if (!r.siteId) { other++; return; }
            if (own(rows, r.siteId)) { other++; return; }
            rows[r.siteId] = r; ids[r.siteId] = d.id;
          });
          ROWS = rows; IDS = ids; OTHER = other;
          MODE = "shared"; WHY = snap.metadata && snap.metadata.fromCache ? "Showing cached shared data; writes require connectivity." : "";
          emit(); done(null, S.state());
        }, function (e) {
          if (epoch !== EPOCH) return;
          ROWS = Object.create(null); IDS = Object.create(null); SEARCH = []; OTHER = 0;
          MODE = "blocked"; WHY = msg(e); emit(); done(e, S.state());
        });
    } catch (e) { MODE = "blocked"; WHY = msg(e); emit(); done(e, S.state()); }
  };
  root.OmegaSiteSaves = S;
})(typeof window !== "undefined" ? window : this);
