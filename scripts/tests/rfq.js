function _esc(s){
  return String(s==null?'':s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function _rfqLabel(t) {
  return '<div style="font-size:9px;color:#8BA3C4;text-transform:uppercase;letter-spacing:.6px;'
    + 'font-weight:700;margin-bottom:5px">' + _esc(t) + '</div>';
}
function _rfqInput(id, val, ph) {
  return '<input id="' + id + '" type="text" value="' + _esc(val) + '" placeholder="' + _esc(ph) + '" '
    + 'style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.05);'
    + 'border:1px solid rgba(255,255,255,.14);color:#E8F0FE;border-radius:6px;padding:7px 9px;'
    + 'font-family:inherit;font-size:12px">';
}
function _bomRenderRfq(bom, byVendor, unknown, total) {
  var host = document.getElementById('bom-rfq');
  if (!host) return;
  var vendors = Object.keys(byVendor);
  window._BOM_RFQ = { byVendor: byVendor, bom: bom, unknown: unknown, total: total };

  var head = '<div style="font-size:11px;font-weight:700;color:#E8F0FE;margin-bottom:6px">'
    + '✉ Request for Quote</div>';

  var rows = vendors.map(function (v) {
    var g = byVendor[v];
    var qty = g.lines.reduce(function (a, l) { return a + (+l.qty || 0); }, 0);
    return '<div style="display:flex;align-items:baseline;gap:8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.05)">'
      + '<span style="font-size:10.5px;color:#E8F0FE;font-weight:600">' + _esc(g.name) + '</span>'
      + '<span style="font-size:9px;color:#6B8299;font-family:\'IBM Plex Mono\',monospace">' + _esc(g.org) + '</span>'
      + '<span style="margin-left:auto;font-size:9.5px;color:#60A5FA">' + g.lines.length
      +   ' line' + (g.lines.length === 1 ? '' : 's') + ' · ' + qty + ' units</span></div>';
  }).join('');

  /* ── WHY THE BUTTON IS ALWAYS OFFERED ──────────────────────────────────
     This used to refuse to show anything unless a BOM line matched a partner
     MANUFACTURER's catalogue SKU. That is the rarer half of the business: most
     of a BOM is conduit, wire, gear and terminations, which nobody makes under
     a partner SKU and which a DISTRIBUTOR prices as one package. A takeoff
     with no manufacturer SKU on it is still an order — refusing to route it
     was the bug, not the safeguard. */
  var lead = vendors.length
    ? rows
      + '<div style="font-size:9px;color:#6B8299;margin-top:8px;line-height:1.5">'
      +   'Each manufacturer above receives only their own lines — never the whole BOM, '
      +   'and never your identity until you accept their quote.'
      +   (unknown ? ' ' + unknown + ' line' + (unknown === 1 ? ' is' : 's are') + ' not in the '
        + 'partner catalogue; a distributor prices those.' : '')
      + '</div>'
    : '<div style="font-size:9.5px;color:#6B8299;line-height:1.5">'
      +   'No line on this BOM belongs to a partner manufacturer, so nothing routes to a factory. '
      +   'A distribution partner can price the whole package — which is how most takeoffs get '
      +   'quoted anyway.</div>';

  host.innerHTML = head
    + '<div style="background:rgba(96,165,250,.07);border:1px solid rgba(96,165,250,.25);border-radius:7px;padding:10px 12px">'
    +   lead
    +   '<button onclick="openRfqFile()" style="margin-top:10px;width:100%;background:linear-gradient(135deg,#2563EB,#1D4ED8);border:none;color:#fff;border-radius:7px;padding:9px;cursor:pointer;font-family:inherit;font-size:11px;font-weight:700">'
    +     'File RFQ →</button>'
    +   '<div id="bom-rfq-msg" style="font-size:9.5px;margin-top:7px;line-height:1.5"></div>'
    + '</div>';
}
function openRfqFile() {
  var st = window._BOM_RFQ;
  if (!st || !st.bom) { st = { byVendor: {}, bom: window._BOM_CACHE || null }; }
  if (!st.bom || !(st.bom.items || []).length) {
    if (typeof showBanner === 'function') showBanner('cal', 'Build the BOM first — there is nothing to quote yet.');
    return;
  }
  window._BOM_RFQ = st;

  var old = document.getElementById('rfq-file-modal');
  if (old) old.remove();

  var host = document.createElement('div');
  host.id = 'rfq-file-modal';
  host.style.cssText = 'position:fixed;inset:0;background:rgba(4,10,20,.78);z-index:10010;'
    + 'display:flex;align-items:center;justify-content:center;padding:24px';
  host.onclick = function (e) { if (e.target === host) host.remove(); };

  var name = (document.getElementById('pname') || {}).value || 'Untitled project';
  var addr = '';
  try { addr = (typeof siteAddress === 'function' && siteAddress()) || ''; } catch (e) {}
  var zip = _rfqPrefillZip();
  var pid = _rfqProjectId();

  var vendors = Object.keys(st.byVendor || {});
  var mfr = vendors.length
    ? '<div style="margin-top:14px">'
      + _rfqLabel('Manufacturers on this BOM')
      + '<div style="font-size:10px;color:#8BA3C4;line-height:1.6">'
      + vendors.map(function (v) {
          var g = st.byVendor[v];
          return _esc(g.name) + ' <span style="color:#6B8299">· ' + g.lines.length
            + ' line' + (g.lines.length === 1 ? '' : 's') + '</span>';
        }).join('<br>')
      + '</div><div style="font-size:9px;color:#6B8299;margin-top:5px;line-height:1.5">'
      + 'Routed automatically — each sees only its own lines, and your identity only if you '
      + 'accept its quote.</div></div>'
    : '';

  host.innerHTML =
    '<div style="background:#0E1926;border:1px solid rgba(197,165,90,.28);border-radius:12px;'
    + 'width:min(560px,100%);max-height:88vh;display:flex;flex-direction:column;'
    + 'box-shadow:0 24px 60px rgba(0,0,0,.55)">'
    + '<div style="display:flex;align-items:center;gap:10px;padding:16px 20px 12px;'
    +   'border-bottom:1px solid rgba(255,255,255,.08)">'
    +   '<div style="flex:1"><div style="font-size:14px;font-weight:700;color:#E8F0FE">File Request for Quote</div>'
    +     '<div style="font-size:10px;color:#8BA3C4;margin-top:2px">Confirm where it ships and who prices it.</div></div>'
    +   '<button onclick="document.getElementById(\'rfq-file-modal\').remove()" style="background:rgba(255,255,255,.08);'
    +     'border:1px solid rgba(255,255,255,.15);color:#8BA3C4;border-radius:6px;padding:4px 10px;'
    +     'cursor:pointer;font-family:inherit;font-size:13px">✕</button>'
    + '</div>'
    + '<div style="overflow:auto;padding:16px 20px;flex:1">'
    +   (pid ? '' :
        '<div style="margin-bottom:14px;padding:9px 12px;background:rgba(245,158,11,.1);'
        + 'border:1px solid rgba(245,158,11,.32);border-radius:7px;font-size:10px;color:#F59E0B;line-height:1.5">'
        + 'This drawing has not been saved as a project yet. Save it first — an RFQ has to hang off a '
        + 'project so the quote has somewhere to come back to.</div>')
    +   _rfqLabel('Project')
    +   '<div style="font-size:12px;color:#E8F0FE;font-weight:600;margin-bottom:12px">' + _esc(name) + '</div>'
    +   _rfqLabel('Site address')
    +   _rfqInput('rfq-addr', addr, '1200 W Industrial Dr, Elgin IL')
    +   '<div style="height:12px"></div>'
    +   _rfqLabel('Site ZIP')
    +   '<input id="rfq-zip" type="text" maxlength="5" value="' + _esc(zip) + '" placeholder="60601" '
    +     'oninput="this.value=this.value.replace(/\\D/g,\'\').slice(0,5)" '
    +     'style="width:120px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.14);'
    +     'color:#E8F0FE;border-radius:6px;padding:7px 9px;font-family:inherit;font-size:12px">'
    +   '<div style="font-size:9px;color:#6B8299;margin-top:4px">Sets the branch that quotes it and the tax jurisdiction.</div>'
    +   '<div style="height:16px"></div>'
    +   _rfqLabel('Distribution partner')
    +   '<div id="rfq-dists" style="font-size:10px;color:#8BA3C4">Loading partners…</div>'
    +   mfr
    +   '<div style="height:16px"></div>'
    +   _rfqLabel('Note (optional)')
    +   '<textarea id="rfq-note" rows="2" placeholder="Needed on site by —, tax exempt, will call, etc." '
    +     'style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.05);'
    +     'border:1px solid rgba(255,255,255,.14);color:#E8F0FE;border-radius:6px;padding:7px 9px;'
    +     'font-family:inherit;font-size:12px;resize:vertical"></textarea>'
    + '</div>'
    + '<div style="padding:14px 20px;border-top:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.2);'
    +   'border-radius:0 0 12px 12px">'
    +   '<div id="rfq-file-msg" style="font-size:10px;line-height:1.5;margin-bottom:9px"></div>'
    +   '<div style="display:flex;gap:8px">'
    +     '<button onclick="document.getElementById(\'rfq-file-modal\').remove()" style="padding:10px 16px;'
    +       'background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);color:#8BA3C4;'
    +       'border-radius:7px;cursor:pointer;font-family:inherit;font-size:12px">Cancel</button>'
    +     '<button id="rfq-send-btn" onclick="submitRfqFile()" style="flex:1;padding:10px;'
    +       'background:linear-gradient(135deg,#2563EB,#1D4ED8);border:none;color:#fff;font-weight:700;'
    +       'border-radius:7px;cursor:pointer;font-family:inherit;font-size:12px">Send RFQ</button>'
    +   '</div>'
    + '</div></div>';

  document.body.appendChild(host);
  _rfqLoadDistributors();
}
function _rfqPrefillZip() {
  var ids = ['vs-zip', 'gm-zip', 'fom-zipcode', 'bm-solar-zip', 'ce-thru-zip', 'sbs-zip'];
  for (var i = 0; i < ids.length; i++) {
    var el = document.getElementById(ids[i]);
    var v = el && String(el.value || '').replace(/\D/g, '');
    if (v && v.length >= 5) return v.slice(0, 5);
  }
  try {
    var a = (typeof siteAddress === 'function' && siteAddress()) || '';
    var m = /(\d{5})(?:-\d{4})?\s*$/.exec(String(a).trim());
    if (m) return m[1];
  } catch (e) {}
  return '';
}
function _rfqProjectId() {
  if (typeof _projectId !== 'undefined' && _projectId) return _projectId;
  if (typeof S !== 'undefined' && S && S.projectId) return S.projectId;
  return '';
}
function _rfqLoadDistributors() {
  var box = document.getElementById('rfq-dists');
  if (!box) return;
  window._RFQ_DISTS = [];

  var u = null;
  try { u = firebase.auth().currentUser; } catch (e) {}
  if (!u) {
    box.innerHTML = '<span style="color:#F59E0B">Sign in to see your distribution partners.</span>';
    return;
  }

  u.getIdToken().then(function (tok) {
    return fetch('/api/rfq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
      body: JSON.stringify({ action: 'distributors' })
    });
  }).then(function (r) {
    return r.text().then(function (t) {
      var j = null; try { j = JSON.parse(t); } catch (e) {}
      if (!r.ok) {
        var d = (j && (j.detail || j.error)) || ('HTTP ' + r.status);
        box.innerHTML = '<span style="color:#F59E0B">Could not load partners — ' + _esc(d)
          + '. Manufacturer routing still works.</span>';
        return;
      }
      var list = (j && j.distributors) || [];
      window._RFQ_DISTS = list;
      if (!list.length) {
        box.innerHTML = '<span style="color:#6B8299">No distribution partner is set up for your '
          + 'account yet. The manufacturers below still receive their lines.</span>';
        return;
      }
      /* The account field sits OUTSIDE the <label>. Inside one, a click meant
         for the text box activates the label and toggles the checkbox, so
         typing an account number would untick the partner you are typing it
         for. */
      box.innerHTML = list.map(function (d, i) {
        return '<div style="display:flex;align-items:center;gap:9px;padding:7px 0;'
          + 'border-bottom:1px solid rgba(255,255,255,.05)">'
          + '<label for="rfq-d-' + i + '" style="display:flex;align-items:center;gap:9px;flex:1;cursor:pointer">'
          +   '<input type="checkbox" id="rfq-d-' + i + '" style="accent-color:#2563EB;width:15px;height:15px;flex:none">'
          +   '<span style="font-size:11.5px;color:#E8F0FE;font-weight:600">' + _esc(d.name) + '</span>'
          + '</label>'
          + '<input type="text" id="rfq-acct-' + i + '" placeholder="Account #" aria-label="Account number with ' + _esc(d.name) + '" '
          +   'style="width:110px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.14);'
          +   'color:#E8F0FE;border-radius:5px;padding:5px 7px;font-family:inherit;font-size:11px">'
          + '</div>';
      }).join('')
      + '<div style="font-size:9px;color:#6B8299;margin-top:6px;line-height:1.5">'
      + 'A partner you tick receives the whole BOM, your project name and the ship-to — they cannot '
      + 'price a named account otherwise. Your account number goes only to the partner it belongs to.</div>';
    });
  })['catch'](function (e) {
    box.innerHTML = '<span style="color:#F59E0B">Could not reach the quote service: '
      + _esc((e && e.message) || 'network error') + '</span>';
  });
}
function submitRfqFile() {
  var box = document.getElementById('rfq-file-msg');
  var st = window._BOM_RFQ;
  function say(msg, bad) {
    if (box) box.innerHTML = '<span style="color:' + (bad ? '#F59E0B' : '#22C55E') + '">' + msg + '</span>';
  }
  if (!st || !st.bom) return say('The BOM is no longer loaded — reopen it and try again.', true);

  var pid = _rfqProjectId();
  if (!pid) return say('Save this drawing as a project first — an RFQ has to hang off a project.', true);

  var zip = String((document.getElementById('rfq-zip') || {}).value || '').replace(/\D/g, '');
  if (zip.length !== 5) return say('A 5-digit site ZIP is required — it decides which branch quotes it.', true);

  var dists = window._RFQ_DISTS || [];
  var toOrgIds = [], accounts = {};
  dists.forEach(function (d, i) {
    var cb = document.getElementById('rfq-d-' + i);
    if (!cb || !cb.checked) return;
    toOrgIds.push(d.orgId);
    var a = String((document.getElementById('rfq-acct-' + i) || {}).value || '').trim();
    if (a) accounts[d.orgId] = a;
  });

  var mfrCount = Object.keys((st.byVendor) || {}).length;
  if (!toOrgIds.length && !mfrCount) {
    return say('Pick at least one distribution partner — no line on this BOM routes to a manufacturer, '
      + 'so there is nobody else to ask.', true);
  }

  var u = null;
  try { u = firebase.auth().currentUser; } catch (e) {}
  if (!u) return say('Sign in first — a quote request has to carry who it is from.', true);

  var btn = document.getElementById('rfq-send-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  say('Sending…');

  /* The whole BOM goes up. The SERVER decides who sees which slice of it,
     because that decision is not the client's to make. */
  var payload = {
    projectId: pid,
    zip: zip,
    address: String((document.getElementById('rfq-addr') || {}).value || '').trim(),
    toOrgIds: toOrgIds,
    accounts: accounts,
    note: String((document.getElementById('rfq-note') || {}).value || '').trim(),
    bom: (st.bom.items || []).map(function (it) {
      return { sku: it.sku || '', description: it.description, qty: it.qty,
               unit: it.unit, category: it.category };
    })
  };

  function done() { if (btn) { btn.disabled = false; btn.textContent = 'Send RFQ'; } }

  u.getIdToken().then(function (tok) {
    return fetch('/api/rfq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
      body: JSON.stringify(payload)
    });
  }).then(function (r) {
    return r.text().then(function (t) {
      var j = null; try { j = JSON.parse(t); } catch (e) {}
      done();
      if (r.ok) {
        var n = (j && j.recipients && j.recipients.length) || 0;
        if (!n) return say('Nothing was routed — ' + ((j && j.skipped) || 'no eligible recipient')
          + '. The BOM is unchanged.', true);
        var m = document.getElementById('bom-rfq-msg');
        if (m) m.innerHTML = '<span style="color:#22C55E">RFQ filed with ' + n + ' partner'
          + (n === 1 ? '' : 's') + '. Track it under RFQs on the project.</span>';
        var host = document.getElementById('rfq-file-modal');
        if (host) host.remove();
        if (typeof showBanner === 'function') {
          showBanner('cal', 'RFQ filed with ' + n + ' partner' + (n === 1 ? '' : 's')
            + ' — replies land on this project.');
        }
        return;
      }
      /* Name the reason. "It didn't work" costs somebody twenty minutes. */
      var d = (j && (j.detail || j.error)) || t.slice(0, 200) || ('HTTP ' + r.status);
      if (r.status === 500 && /SERVICE_ACCOUNT/i.test(d)) {
        say('Quote routing is not switched on yet — the server is missing its Firebase '
          + 'credential, so it cannot write the request. The BOM is unchanged. '
          + 'Export the sourcing CSV and send it directly in the meantime.', true);
        return;
      }
      say('Could not send: ' + _esc(d), true);
    });
  })['catch'](function (e) {
    done();
    say('Could not reach the quote service: ' + _esc((e && e.message) || 'network error'), true);
  });
}
module.exports={_esc,_rfqLabel,_rfqInput,_bomRenderRfq,openRfqFile,_rfqPrefillZip,_rfqProjectId,_rfqLoadDistributors,submitRfqFile};
