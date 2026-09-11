/* ==========================================================================
   omega-settings.js  ·  ClearSky-OMEGA shared platform file
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   --------------------------------------------------------------------------
   THE SHARED API KEYS, PER TENANT.

   Seven tools load this file — site-optimizer, site-discovery, power-flow,
   conductor-sizing, interconnection-study, interconnection-screener and
   degradation-warranty. It did not exist. Every one of them 404'd on it,
   fell into its own `typeof OMEGASettings === 'undefined'` branch, and
   printed "Settings module not loaded (omega-settings.js). Deploy it
   alongside this tool."

   So the Settings tab on seven tools has never worked, and a rep who pasted
   a URDB key into site-optimizer had to paste it again into the next tool,
   and again after every reload. The keys are free ones from public
   agencies; the friction was the whole cost, and it was paid seven times.

   WHY IT LIVES IN FIRESTORE AND NOT localStorage. A key is a team fact, not
   a browser fact. One person registers for a URDB key and everybody's tools
   work; localStorage would make that person's laptop the dependency.
   toolData/{orgId}/prefs/apiSettings is the documented home (see the note in
   omega-tools.js) and the deployed rules gate it to the tenant's own org —
   read and write for members, read for ClearSky admins, nothing for anyone
   else.

   IT DEGRADES RATHER THAN BREAKING. With no db and no org — a tool opened
   signed-out, or standalone — every key still works for the session and the
   panel says plainly that nothing will be kept. A settings panel that
   refuses to appear teaches people the tool is broken.

   ES5 and dependency-free, like every omega-*.js: no build step, and it has
   to run in whatever browser a field rep has.
   ========================================================================== */
(function (root) {
  "use strict";

  var DOC = "apiSettings";

  /* The keys these tools actually ask for. A key not in this list still
     round-trips through get/set — the list decides what the PANEL offers, so
     a tool can use a key this file has never heard of without being blocked
     by it. */
  var KEYS = [
    { k: "urdb", label: "OpenEI URDB",
      what: "Utility Rate Database — tariff lookup by rate name.",
      where: "Free from openei.org/services/api. Used by the site optimizer." },
    { k: "nrel", label: "NREL developer key",
      what: "PVWatts and the NREL data APIs — irradiance and PV yield.",
      where: "Free from developer.nrel.gov/signup. Used by the site optimizer "
           + "and site discovery." },
    { k: "google", label: "Google Maps",
      what: "Geocoding and Street View where the free geocoders cannot resolve "
          + "an address.",
      where: "Billed per call. Leave empty and the tools fall back to the free "
           + "US Census and OpenStreetMap geocoders." },
    { k: "crexi", label: "Crexi listing API",
      what: "Commercial listings — what is on the market, with a verified "
          + "address, building size and a named broker.",
      where: "A partnership, not a signup: integrations@crexi.com, and ask for "
           + "OUTBOUND access explicitly. Their documented Listing API is for "
           + "pushing listings onto Crexi, which is the other direction." },
    { k: "eia", label: "EIA",
      what: "US Energy Information Administration series — generation and "
          + "price history.",
      where: "Free from eia.gov/opendata." }
  ];

  var S = {
    _db: null, _org: null, _vals: {}, _loaded: false, _err: ""
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* A key is shown as its last four characters. Enough to tell which key is
     in the box without putting the whole thing on a shared screen — these
     panels get opened in demos. */
  function masked(v) {
    v = String(v || "");
    if (v.length <= 4) return v ? "••••" : "";
    return "•••• " + v.slice(-4);
  }

  function init(db, orgId) {
    S._db = db || null;
    S._org = orgId || null;
    if (!S._db || !S._org) {
      S._loaded = true;
      return Promise.resolve(S._vals);
    }
    return S._db.collection("toolData").doc(S._org)
      .collection("prefs").doc(DOC).get()
      .then(function (snap) {
        var d = snap.exists ? (snap.data() || {}) : {};
        /* Written under `data` by the toolData convention; a flat document is
           accepted too, because an early hand-seeded one will not have the
           wrapper and refusing it would lose a key somebody already set. */
        S._vals = (d.data && typeof d.data === "object") ? d.data : d;
        if (!S._vals || typeof S._vals !== "object") S._vals = {};
        delete S._vals.updatedAt;
        S._loaded = true;
        return S._vals;
      })
      ["catch"](function (e) {
        /* Denied or offline. The tools still work with keys typed into their
           own fields; this only means nothing is shared or kept. */
        S._err = (e && e.message) || "could not be read";
        S._loaded = true;
        return S._vals;
      });
  }

  function get(k) {
    var v = S._vals ? S._vals[k] : null;
    return (typeof v === "string") ? v : "";
  }

  /* Some settings are not one string. A provider configuration is an
     endpoint, a field map and a switch, and splitting that across four
     string keys would let three of them be saved and the fourth lost. */
  function getObj(k) {
    var v = S._vals ? S._vals[k] : null;
    return (v && typeof v === "object" && !(v instanceof Array)) ? v : {};
  }
  function setObj(k, obj) {
    S._vals[k] = obj || {};
    if (!S._db || !S._org) return Promise.resolve(false);
    var payload = { data: S._vals };
    if (root.firebase && root.firebase.firestore &&
        root.firebase.firestore.FieldValue) {
      payload.updatedAt = root.firebase.firestore.FieldValue.serverTimestamp();
    }
    return S._db.collection("toolData").doc(S._org)
      .collection("prefs").doc(DOC).set(payload, { merge: true })
      .then(function () { return true; })
      ["catch"](function (e) {
        S._err = (e && e.message) || "could not be saved";
        return false;
      });
  }

  function set(k, v) {
    if (!k) return Promise.resolve(false);
    v = (v == null) ? "" : String(v).trim();
    if (v === get(k)) return Promise.resolve(true);   /* nothing changed */
    S._vals[k] = v;
    if (!S._db || !S._org) return Promise.resolve(false);   /* session only */
    var payload = { data: S._vals };
    if (root.firebase && root.firebase.firestore &&
        root.firebase.firestore.FieldValue) {
      payload.updatedAt = root.firebase.firestore.FieldValue.serverTimestamp();
    }
    return S._db.collection("toolData").doc(S._org)
      .collection("prefs").doc(DOC).set(payload, { merge: true })
      .then(function () { return true; })
      ["catch"](function (e) {
        S._err = (e && e.message) || "could not be saved";
        return false;
      });
  }

  function scopeNote() {
    if (!S._db || !S._org) {
      return '<p class="omsNote omsWarn">Not signed in, so nothing here is kept. ' +
             'Keys work for this session and are gone on reload.</p>';
    }
    if (S._err) {
      return '<p class="omsNote omsWarn">Saved keys could not be reached (' +
             esc(S._err) + '). Anything you enter works for this session only.</p>';
    }
    return '<p class="omsNote">Shared with everyone at <b>' + esc(S._org) +
           '</b>. One person registers a key and every tool has it.</p>';
  }

  /* ══════════════════════════════════════════════════════════════════════
     LISTING FEED — THE STRUCTURE TO TAKE A PARTNER'S DATA IN

     Every Crexi field name in omega-listings-source.js was written from
     their public documentation before any live record existed, with a note
     saying to confirm each one before it reached a customer. Confirming
     them meant editing that file, which meant a deploy — so the integration
     could never be finished by the person who actually holds the
     credentials and the sample payload.

     This is that person's screen. Endpoint, and a field map from their
     names to ours, saved against the organisation.

     THE SAMPLE CHECK IS THE POINT. Paste one real listing and it says
     exactly which of our fields their record fills, by which path, and
     which of THEIR fields nothing is reading — which is usually where the
     useful thing is hiding. Against a realistic payload the built-in
     guesses filled one field of twenty-seven; a map takes it to thirteen.
     Finding that out on a customer's screen is the outcome this prevents.

     NO KEY IS STORED HERE. The route is a proxy; the credential rides on
     the request the proxy makes, server-side, so a browser that can read
     the page cannot read the key. The key field above is for the proxy's
     own configuration, not for the browser to send. */
  var LISTING_FIELDS = [
    ["id", "listing id"], ["addr", "street address"], ["city", "city"],
    ["state", "state"], ["zip", "postcode"], ["lat", "latitude"],
    ["lon", "longitude"], ["sqft", "building size"], ["lotAcres", "lot size"],
    ["type", "property type"], ["subtype", "sub-type"], ["yearBuilt", "year built"],
    ["zoning", "zoning"], ["ownerName", "owner"], ["brokerName", "broker name"],
    ["brokerFirm", "broker firm"], ["brokerPhone", "broker phone"],
    ["brokerEmail", "broker email"], ["dealType", "sale or lease"],
    ["askPrice", "asking price"], ["askRate", "asking rate"], ["capRate", "cap rate"],
    ["daysOnMarket", "days on market"], ["url", "listing link"],
    ["lastSaleDate", "last sale date"], ["lastSalePrice", "last sale price"],
    ["photos", "photos"]
  ];

  function renderListingsTab(elId, providerKey) {
    var host = (typeof elId === "string") ? document.getElementById(elId) : elId;
    if (!host) return;
    providerKey = providerKey || "crexi";
    var cfg = getObj(providerKey), map = cfg.map || {};

    var h = '<style>' +
      '.omlRow{display:grid;grid-template-columns:150px 1fr;gap:8px;align-items:center;' +
        'padding:4px 0}' +
      '.omlRow label{font-size:11.5px;opacity:.8}' +
      '.omlRow input{font:inherit;font-size:12px;padding:5px 7px;border-radius:6px;' +
        'border:1px solid rgba(0,0,0,.18);width:100%}' +
      '.omlMap{max-height:300px;overflow:auto;border:1px solid rgba(0,0,0,.12);' +
        'border-radius:8px;padding:8px;margin-top:6px}' +
      '.omlBar{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}' +
      '.omlBar button{font:inherit;font-size:12px;font-weight:600;padding:6px 12px;' +
        'border-radius:6px;border:1px solid rgba(0,0,0,.18);background:#fff;cursor:pointer}' +
      '.omlSample{width:100%;min-height:96px;font-family:ui-monospace,Menlo,monospace;' +
        'font-size:11px;padding:8px;border-radius:8px;border:1px solid rgba(0,0,0,.18)}' +
      '.omlRep{margin-top:8px;font-size:11.5px;line-height:1.6}' +
      '.omlOk{color:#1f6f3a}.omlNo{color:#8a5a00}' +
      '.omlHint{font-size:11px;opacity:.7;line-height:1.5;margin:4px 0 0}' +
      '</style>' + scopeNote();

    h += '<div class="omlRow"><label>Feed endpoint</label>' +
      '<input id="omlProxy" type="text" placeholder="https://…/crexi" value="' +
      esc(cfg.proxy || "") + '"></div>' +
      '<p class="omlHint">The proxy route this platform calls. It holds the ' +
      'credential server-side and answers <code>/crexi/search</code> and ' +
      '<code>/crexi/detail</code>. Leave empty and the provider stays off.</p>';

    h += '<p class="omlHint" style="margin-top:12px"><b>Check a real listing.</b> ' +
      'Paste one record of their JSON and see what lands where before any of ' +
      'it reaches a card.</p>' +
      '<textarea class="omlSample" id="omlSample" placeholder=\'{ "propertyId": "…", "propertyAddress": "…" }\'></textarea>' +
      '<div class="omlBar">' +
        '<button type="button" id="omlCheck">Check mapping</button>' +
        '<button type="button" id="omlSave">Save feed settings</button>' +
        '<span id="omlMsg" class="omlRep"></span>' +
      '</div><div id="omlRep"></div>';

    h += '<div class="omlMap" id="omlMapBox">';
    for (var i = 0; i < LISTING_FIELDS.length; i++) {
      var f = LISTING_FIELDS[i][0];
      h += '<div class="omlRow"><label>' + esc(LISTING_FIELDS[i][1]) + '</label>' +
        '<input type="text" data-oml="' + esc(f) + '" placeholder="their field, e.g. ' +
        esc(f) + '" value="' + esc((map[f] || []).join(", ")) + '"></div>';
    }
    h += '</div>';
    host.innerHTML = h;

    function readMap() {
      var out = {}, inputs = host.querySelectorAll("[data-oml]"), j;
      for (j = 0; j < inputs.length; j++) {
        var v = String(inputs[j].value || "").trim();
        if (!v) continue;
        out[inputs[j].getAttribute("data-oml")] =
          v.split(",").map(function (x) { return x.trim(); })
           .filter(function (x) { return !!x; });
      }
      return out;
    }

    if (!host._omlWired) {
      host._omlWired = true;
      host.addEventListener("click", function (e) {
        var t = e.target;
        if (!t || !t.id) return;

        if (t.id === "omlCheck") {
          var box = document.getElementById("omlRep");
          var raw = (document.getElementById("omlSample") || {}).value || "";
          var obj = null;
          try { obj = JSON.parse(raw); }
          catch (err) {
            box.innerHTML = '<span class="omlNo">That is not valid JSON: ' +
                            esc(err.message) + '</span>';
            return;
          }
          if (obj instanceof Array) obj = obj[0];
          var LS = root.OmegaListings;
          if (!LS || !LS.mapReport) {
            box.innerHTML = '<span class="omlNo">omega-listings-source.js is not ' +
              'loaded on this page, so the mapping cannot be checked here.</span>';
            return;
          }
          var rep = LS.mapReport(obj, readMap());
          var html = '<div class="omlRep"><b>' + rep.filled.length + ' of ' +
            (rep.filled.length + rep.empty.length) + ' fields filled.</b></div>';
          if (rep.filled.length) {
            html += '<div class="omlRep omlOk">' + rep.filled.map(function (x) {
              return esc(x.field) + " \u2190 " + esc(x.path);
            }).join(" \u00b7 ") + '</div>';
          }
          if (rep.empty.length) {
            html += '<div class="omlRep omlNo">Nothing found for: ' +
              rep.empty.map(function (x) { return esc(x.field); }).join(", ") + '</div>';
          }
          if (rep.unused.length) {
            html += '<div class="omlRep omlNo">Their fields nothing reads: ' +
              rep.unused.map(esc).join(", ") +
              ' \u2014 usually where the useful thing is hiding.</div>';
          }
          box.innerHTML = html;
          return;
        }

        if (t.id === "omlSave") {
          var msg = document.getElementById("omlMsg");
          var proxy = (document.getElementById("omlProxy") || {}).value || "";
          var next = { proxy: String(proxy).trim(), map: readMap(),
                       enabled: !!String(proxy).trim() };
          if (msg) msg.textContent = "Saving\u2026";
          setObj(providerKey, next).then(function (ok) {
            /* Applied immediately, so a page that already has the provider
               loaded uses the new map without a reload. */
            if (root.OmegaListings && root.OmegaListings.configure) {
              root.OmegaListings.configure(providerKey, next);
            }
            if (msg) {
              msg.innerHTML = ok
                ? '<span class="omlOk">Saved for ' + esc(S._org) + '.</span>'
                : '<span class="omlNo">Kept for this session only \u2014 not saved.</span>';
            }
          });
        }
      });
    }
  }

  function renderTab(elId) {
    var host = (typeof elId === "string") ? document.getElementById(elId) : elId;
    if (!host) return;

    var h = '<style>' +
      '.omsRow{display:grid;grid-template-columns:1fr;gap:4px;padding:11px 0;' +
        'border-top:1px solid rgba(0,0,0,.09)}' +
      '.omsRow:first-of-type{border-top:0}' +
      '.omsHd{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}' +
      '.omsHd b{font-size:13px}' +
      '.omsSet{font-size:10px;letter-spacing:.05em;text-transform:uppercase;' +
        'padding:1px 6px;border-radius:4px;background:#e8f5ee;color:#1f6f3a}' +
      '.omsUnset{background:#f1f3f5;color:#6b7683}' +
      '.omsWhat{font-size:11.5px;opacity:.8;line-height:1.5}' +
      '.omsWhere{font-size:11px;opacity:.65;line-height:1.5}' +
      '.omsIn{display:flex;gap:6px;margin-top:3px}' +
      '.omsIn input{flex:1;min-width:0;font:inherit;font-size:12.5px;padding:6px 8px;' +
        'border:1px solid rgba(0,0,0,.18);border-radius:6px}' +
      '.omsIn button{font:inherit;font-size:12px;font-weight:600;padding:6px 12px;' +
        'border-radius:6px;border:1px solid rgba(0,0,0,.18);background:#fff;cursor:pointer}' +
      '.omsNote{font-size:11.5px;opacity:.8;margin:0 0 10px;line-height:1.5}' +
      '.omsWarn{color:#8a5a00}' +
      '.omsMsg{font-size:11.5px;margin-left:2px}' +
      '</style>' + scopeNote();

    for (var i = 0; i < KEYS.length; i++) {
      var K = KEYS[i], cur = get(K.k);
      h += '<div class="omsRow">' +
        '<div class="omsHd"><b>' + esc(K.label) + '</b>' +
          '<span class="omsSet' + (cur ? '' : ' omsUnset') + '">' +
            (cur ? masked(cur) : 'not set') + '</span></div>' +
        '<div class="omsWhat">' + esc(K.what) + '</div>' +
        '<div class="omsWhere">' + esc(K.where) + '</div>' +
        '<div class="omsIn">' +
          '<input type="text" id="oms_' + esc(K.k) + '" placeholder="' +
            (cur ? 'replace the saved key' : 'paste the key') + '" autocomplete="off">' +
          '<button type="button" data-oms-save="' + esc(K.k) + '">Save</button>' +
          (cur ? '<button type="button" data-oms-clear="' + esc(K.k) + '">Clear</button>' : '') +
        '</div>' +
        '<div class="omsMsg" id="omsMsg_' + esc(K.k) + '"></div>' +
      '</div>';
    }
    host.innerHTML = h;

    /* Delegated on the host, so one listener survives every re-render —
       and so it cannot become the kind of button that looks like a button
       and does nothing. */
    if (!host._omsWired) {
      host._omsWired = true;
      host.addEventListener("click", function (e) {
        var t = e.target;
        if (!t || !t.getAttribute) return;
        var sk = t.getAttribute("data-oms-save");
        var ck = t.getAttribute("data-oms-clear");
        var k = sk || ck;
        if (!k) return;
        e.preventDefault();
        var msg = document.getElementById("omsMsg_" + k);
        var input = document.getElementById("oms_" + k);
        var val = ck ? "" : (input ? input.value.trim() : "");
        if (sk && !val) {
          if (msg) msg.innerHTML = '<span class="omsWarn">Nothing to save.</span>';
          return;
        }
        if (msg) msg.textContent = ck ? "Clearing…" : "Saving…";
        set(k, val).then(function (ok) {
          if (input) input.value = "";
          renderTab(host);
          var m2 = document.getElementById("omsMsg_" + k);
          if (!m2) return;
          m2.innerHTML = ok
            ? (ck ? "Cleared." : "Saved for " + esc(S._org || "this session") + ".")
            : '<span class="omsWarn">Kept for this session only — not saved.</span>';
        });
      });
    }
  }

  root.OMEGASettings = {
    init: init, get: get, set: set, getObj: getObj, setObj: setObj,
    renderTab: renderTab, renderListingsTab: renderListingsTab,
    LISTING_FIELDS: LISTING_FIELDS,
    KEYS: KEYS, doc: DOC,
    /* For tests and for a tool that wants to show its own scope line. */
    scope: function () { return { org: S._org, saved: !!(S._db && S._org), err: S._err }; }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = root.OMEGASettings;
})(typeof window !== "undefined" ? window : this);
