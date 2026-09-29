/* ═══════════════════════════════════════════════════════════════════════
   admin/account.js — ONE account, everything ClearSky runs for it
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   /admin/account.html?org=<orgId>. Tommy, 2026-09-28: "i should click an
   account and it opens a page for them so i can manage them and edit them
   and see if they paid and etc. and edit their account or remove it etc.
   other wise its so disorganized."

   The console's Manage drawer lived inline in a table row
   (openTenantDetail, admin-console.js); its controls moved here UNCHANGED —
   the commercial terms, identity and branding, the relationship and the
   projects shared, the dashboard profile, the people and their accounts,
   the Omega Logic bundle — under a header that answers the first
   questions: what is this account, is it on, has it paid, and what does it
   pay for. Every action posts where it always did (tenant-approve,
   set-role, user-admin, logic-onboard, plan-change); billing, branding and
   the relationship write the records the rules already let isAdmin()
   write, with the history row. A workspace's package, its price and its
   activation are the Package panel (admin/package-panel.js), mounted on
   this page; nothing about money is computed here.

   Without a tenant record the page shows the SIGNUP IN PROGRESS for the
   domain (access_requests, source 'signup': the account from the moment
   it is made on /start.html), with the way to set it up or decline it.

   ES5, globals: the moved controls expect the console's names (db,
   currentUser, STATE.tenants, loadTenants, esc, toast, adminFail,
   _authedPost, _standing …), which admin-shared.js and this file provide.
   ═══════════════════════════════════════════════════════════════════════ */

/* the console's globals, as the moved controls read them */
var CFG, auth, db, currentUser = null, currentOrg = null, currentRole = null, currentLabel = null;
var STATE = { tenants: [], clients: [], priceBook: null };
var tnFilter = 'all';
var ORG = (function () { var m = /[?&]org=([^&]*)/.exec(location.search); return m ? decodeURIComponent(m[1]).toLowerCase().trim() : ''; })();
var LAST = null;   /* what the page last drew, redrawn when the price book lands */
var payNote = '';  /* what the last look at the payment said, kept across the re-read */
function $(id){ return document.getElementById(id); }
/* the moved controls refresh through the console's names: here they re-read
   the account. A save keeps the form and its message on the page (soft: the
   header and the two cards are redrawn); a failed role change re-reads the
   truth in full, as the console did. */
function loadTenants(){ loadAccount({ soft: true }); }
function renderTenants(){ loadAccount({ soft: true }); }
function openTenantDetail(){ loadAccount(); }
function dayOf(v){ if (!v) return ''; if (v.toDate) { try { return v.toDate().toISOString().slice(0, 10); } catch (e) { return ''; } } if (typeof v === 'number') return new Date(v).toISOString().slice(0, 10); return String(v).slice(0, 10); }

/* ═══ THE CONTROLS, moved from admin-console.js (2026-09-28) ═══ */

/* ── DASHBOARD PROFILE ─────────────────────────────────────────────────────
   What kind of company this is decides what its dashboard is for. The table
   ships in omega-dashboard-profiles.js and every shell reads the same one;
   this control writes two fields on omega_orgs — dashboardProfile (which row
   of the table; blank = follow the account type) and dashboardBlocks (only
   the blocks that differ from that row, so a later change to the table still
   reaches a tenant that never overrode that block). Nothing here copies the
   table. */
var _DASH_ORG = {};

var _DASH_LABELS = { referrals:'Referrals inbox', quotes:'Quote requests', marketplace:'Marketplace',
                     assets:'Owned assets', portfolio:'Portfolio', pipeline:'Pipeline',
                     analytics:'Analytics', taskflow:'Task flow' };

function _dashWs(orgId){
  var m=_DASH_ORG[orgId]||{}, sel=document.getElementById('tb-dprof-'+orgId);
  return { vertical:m.vertical||'', financeOrgKey:m.financeOrgKey||'',
           dashboardProfile: sel ? sel.value : (m.dashboardProfile||''),
           dashboardBlocks: m.dashboardBlocks||{} };
}

function _dashProfileHtml(orgId, org){
  if (typeof OmegaDashProfiles === 'undefined') return '';
  _DASH_ORG[orgId] = { vertical: org.vertical||'', financeOrgKey: org.financeOrgKey||'',
                       dashboardProfile: org.dashboardProfile||'', dashboardBlocks: org.dashboardBlocks||{} };
  var P=OmegaDashProfiles.PROFILES, ws=_dashWs(orgId), cur=OmegaDashProfiles.resolve(ws);
  var auto=OmegaDashProfiles.keyFor({ vertical: ws.vertical, financeOrgKey: ws.financeOrgKey });
  var h='<div style="margin-top:12px;padding:10px 11px;border:1px solid var(--cs-border,#E1E6EC);border-radius:8px;background:#FBFCFD">';
  h+='<div class="sub-txt" style="font-weight:600;margin-bottom:6px">Dashboard profile</div>';
  h+='<select id="tb-dprof-'+esc(orgId)+'" onchange="dashProfilePicked(&quot;'+esc(orgId)+'&quot;)"'
   + ' style="display:block;width:100%;padding:7px 9px;border:1px solid var(--cs-border,#E1E6EC);border-radius:7px">';
  h+='<option value="">Follow the account type — '+esc(P[auto].label)+'</option>';
  Object.keys(P).forEach(function(k){
    h+='<option value="'+esc(k)+'"'+(ws.dashboardProfile===k?' selected':'')+'>'+esc(P[k].label)+'</option>';
  });
  h+='</select>';
  h+='<div class="sub-txt" id="tb-dhint-'+esc(orgId)+'" style="margin:4px 0 8px">'+esc(cur.hint)+'</div>';
  h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 10px">';
  Object.keys(_DASH_LABELS).forEach(function(b){
    h+='<label class="sub-txt" style="display:block"><input type="checkbox" data-dblock="'+b+'" data-org="'+esc(orgId)+'"'
     + (cur.blocks[b]?' checked':'')+'> '+_DASH_LABELS[b]+'</label>';
  });
  h+='</div>';
  h+='<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">'
   + '<button class="btn" onclick="saveDashProfile(&quot;'+esc(orgId)+'&quot;)">Save dashboard profile</button>'
   + '<button class="btn" onclick="resetStarterBoard(&quot;'+esc(orgId)+'&quot;)">Reset starter board</button>'
   + '</div>';
  h+='<div class="sub-txt" id="tb-dwid-'+esc(orgId)+'" style="margin-top:6px">Starter widgets: '+esc(cur.widgets.join(', '))
   + '. People add more from the palette; a reset rewrites the org default only, never anybody\'s own arrangement.</div>';
  h+='</div>';
  return h;
}

/* Picking a row re-ticks the boxes to that row's defaults — the override
   set starts empty again, which is what "pick a profile" means. */
function dashProfilePicked(orgId){
  if (typeof OmegaDashProfiles === 'undefined') return;
  var ws=_dashWs(orgId); ws.dashboardBlocks={};
  var p=OmegaDashProfiles.resolve(ws);
  Array.prototype.forEach.call(document.querySelectorAll('input[data-dblock][data-org="'+orgId+'"]'), function(cb){
    cb.checked = p.blocks[cb.getAttribute('data-dblock')] === true;
  });
  var hint=document.getElementById('tb-dhint-'+orgId); if (hint) hint.textContent=p.hint;
  var wid=document.getElementById('tb-dwid-'+orgId);
  if (wid) wid.textContent='Starter widgets: '+p.widgets.join(', ')+'. People add more from the palette; a reset rewrites the org default only, never anybody\'s own arrangement.';
}

function saveDashProfile(orgId){
  if (typeof OmegaDashProfiles === 'undefined') return;
  var ws=_dashWs(orgId), key=ws.dashboardProfile||'';
  var baseKey = key || OmegaDashProfiles.keyFor({ vertical: ws.vertical, financeOrgKey: ws.financeOrgKey });
  var base = OmegaDashProfiles.PROFILES[baseKey].blocks, ov = {};
  Array.prototype.forEach.call(document.querySelectorAll('input[data-dblock][data-org="'+orgId+'"]'), function(cb){
    var b=cb.getAttribute('data-dblock');
    if (cb.checked !== (base[b] === true)) ov[b] = cb.checked;
  });
  var FV = firebase.firestore.FieldValue;
  var patch = { dashboardProfile: key || FV['delete'](),
                dashboardBlocks: Object.keys(ov).length ? ov : FV['delete'](),
                dashboardUpdatedAt: FV.serverTimestamp() };
  db.collection('omega_orgs').doc(orgId).set(patch, { merge:true }).then(function(){
    var m=_DASH_ORG[orgId]; if (m){ m.dashboardProfile=key; m.dashboardBlocks=ov; }
    toast('Dashboard profile saved for '+esc(orgId)+'. Their next page load picks it up.');
  })['catch'](function(e){ adminFail('save the dashboard profile', e); });
}

/* omega_orgs/{org}/layouts/default is the first thing a new person's board
   is built from, ahead of the profile table, so an old one written for a
   different kind of company would keep winning. This rewrites it to the
   profile's starter list. Personal layouts (dashboard_layouts) are untouched. */
function resetStarterBoard(orgId){
  if (typeof OmegaDashProfiles === 'undefined') return;
  var p=OmegaDashProfiles.resolve(_dashWs(orgId));
  if (!window.confirm('Rewrite the org-level starter board for '+orgId+' to:\n\n  '+p.widgets.join(', ')
      +'\n\nNew people get this board. Anybody who has already arranged their own keeps it.')) return;
  var u=(firebase.auth().currentUser||{});
  db.collection('omega_orgs').doc(orgId).collection('layouts').doc('default').set({
    widgets: p.widgets, profile: p.key,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: u.email||''
  }, { merge:true }).then(function(){ toast('Starter board reset for '+esc(orgId)+'.'); })
  ['catch'](function(e){ adminFail('reset the starter board', e); });
}

/* The add-on vocabulary, read from the capability layer so this screen and
   the editor cannot disagree about what a word buys. */
function _addonHelp(){
  var G = null;
  try { G = window.OmegaCaps && window.OmegaCaps.ADDON_GRANTS; } catch(e){}
  if (!G) return 'compute, parcelscreen, engineering, schematics, exports, permitting';
  var out = [];
  for (var k in G) {
    if (!G.hasOwnProperty(k) || !G[k].length) continue;
    out.push(k + ' \u2192 ' + G[k].join(' + '));
  }
  return out.join('   \u00b7   ');
}

/* ── SELLING COMPUTE SHOULD BE A SWITCH, NOT A SPELLING TEST ──────────
   Entitlements were a comma-separated text box. To sell Compute to a
   tenant somebody had to know that the word is "compute", that it also
   carries parcel screening, that "Compute Package" or "compute-addon"
   silently grant nothing, and that a plan cap never cancels an add-on. A
   typo looked exactly like a purchase and failed silently in the editor,
   where nobody would connect the two.

   These are the same values written to the same field the save already
   reads, so nothing downstream changes — the boxes and the text stay in
   step in both directions. The text field survives because osa-jv and
   grid-atlas live there too, and because an add-on invented next month
   should not need a console deploy to be typed in.

   Each label says what it actually unlocks, taken from ADDON_GRANTS, so
   the screen cannot drift from what the editor honours. */
var ADDON_UI = [
  ['compute',      'Compute',        'Data-centre campus builder \u2014 also grants parcel screening'],
  ['parcelscreen', 'Parcel screening','Site pre-screening on grid position'],
  ['engineering',  'Engineering',    'Circuits, GIS and the engineering surfaces'],
  ['schematics',   'Schematics',     'Schematic editor and riser diagrams'],
  ['exports',      'Exports',        'Georeferenced and plan-set exports'],
  ['permitting',   'Permitting',     'Permit sets and the AHJ programme']
];

function _addonToggles(orgId, addons){
  var have = {};
  (addons||[]).forEach(function(a){
    have[String(a||'').toLowerCase().replace(/[\s_\-]+/g,'')] = 1;
  });
  var h = '<div class="sub-txt" style="margin-bottom:6px">Add-ons</div>'
        + '<div id="tb-addonbox-'+orgId+'" style="display:grid;grid-template-columns:1fr 1fr;'
        + 'gap:6px 14px;margin-bottom:10px">';
  ADDON_UI.forEach(function(a){
    var on = !!have[a[0]];
    h += '<label style="display:flex;gap:8px;align-items:flex-start;font:500 12px system-ui;cursor:pointer">'
      +  '<input type="checkbox" data-addon="'+esc(a[0])+'"'+(on?' checked':'')
      +  ' onchange="_addonsFromBoxes(&quot;'+esc(orgId)+'&quot;)" style="margin-top:2px">'
      +  '<span><b>'+esc(a[1])+'</b>'
      +  '<span style="display:block;font-weight:400;opacity:.7;font-size:11px;line-height:1.4">'
      +  esc(a[2])+'</span></span></label>';
  });
  return h + '</div>';
}

/* Boxes -> field. Anything typed by hand that is not one of the six is kept,
   so ticking a box never quietly deletes osa-jv or a newer key. */
function _addonsFromBoxes(orgId){
  var box = document.getElementById('tb-addonbox-'+orgId);
  var fld = document.getElementById('tb-addons-'+orgId);
  if (!box || !fld) return;
  var known = {}; ADDON_UI.forEach(function(a){ known[a[0]] = 1; });
  var extra = String(fld.value||'').split(',').map(function(x){ return x.trim(); })
    .filter(function(x){ return x && !known[x.toLowerCase().replace(/[\s_\-]+/g,'')]; });
  var picked = [];
  Array.prototype.forEach.call(box.querySelectorAll('input[data-addon]'), function(i){
    if (i.checked) picked.push(i.getAttribute('data-addon'));
  });
  fld.value = picked.concat(extra).join(', ');
}

/* Field -> boxes, so typing still drives the switches and the two can never
   disagree about what this tenant has bought. */
function _addonsToBoxes(orgId){
  var box = document.getElementById('tb-addonbox-'+orgId);
  var fld = document.getElementById('tb-addons-'+orgId);
  if (!box || !fld) return;
  var have = {};
  String(fld.value||'').split(',').forEach(function(x){
    var k = x.trim().toLowerCase().replace(/[\s_\-]+/g,''); if (k) have[k] = 1;
  });
  Array.prototype.forEach.call(box.querySelectorAll('input[data-addon]'), function(i){
    i.checked = !!have[i.getAttribute('data-addon')];
  });
}

function _tnField(label, id, val, type, ph){
  return '<label class="sub-txt" style="display:block;margin-bottom:10px">'+esc(label)
    + '<input id="'+id+'" type="'+(type||'text')+'" value="'+esc(val==null?'':String(val))+'"'
    + (ph?' placeholder="'+esc(ph)+'"':'')
    + ' style="display:block;width:100%;margin-top:4px;padding:7px 9px;border:1px solid var(--cs-border,#E1E6EC);border-radius:7px;font:500 12.5px system-ui"></label>';
}

/* The union, so the headline number matches the table under it. Counting
   member rows alone reported 1 for NextNRG while three people had signed in. */
function _peopleCount(members, seen){
  var e={}, i;
  (members||[]).forEach(function(m){ var k=String(m.email||m._id||'').toLowerCase(); if(k) e[k]=1; });
  (seen||[]).forEach(function(t){ var k=String(t.email||'').toLowerCase(); if(k) e[k]=1; });
  return Object.keys(e).length;
}

function _tnDetailHtml(orgId, org, bill, members, projects, seen){
  seen = seen || [];
  var TIERS=['trial','standard','deluxe','enterprise','partner','internal'];
  var h='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:22px;padding:6px 2px 12px">';

  /* ── Commercial terms ── */
  /* ⚠ TWO TIER VOCABULARIES EXIST IN THIS PLATFORM AND THEY ARE NOT THE SAME
     STRINGS. billing/current.tier is what the tool gate reads and what the
     seed writes: trial | standard | deluxe | enterprise. The client inventory
     on this console, and the financing portal, say tier1 | tier2 | tier3 and
     label them Core / Performance / Enterprise. "Tier 2" in conversation is
     Performance, which is DELUXE here — TIER.DELUXE === 2 in omega-tools.js.
     Both names are printed on every option so nobody has to remember the
     mapping, and so picking the wrong one is visible rather than silent. */
  var TIERS=[['trial','trial \u2014 free / evaluation'],
             ['standard','standard \u2014 Core (Tier 1)'],
             ['deluxe','deluxe \u2014 Performance (Tier 2)'],
             ['enterprise','enterprise \u2014 Enterprise (Tier 3)'],
             ['partner','partner \u2014 JV / channel'],
             ['internal','internal \u2014 ClearSky']];
  h+='<div><div class="block-title" style="font-size:13px;margin-bottom:8px">Commercial terms</div>';
  if (bill.packaged !== true) h+='<a href="#package-panel">Move this workspace to a package (the Package panel above)</a>';
  if (bill.packaged !== true) {
  h+=logicEnrollmentHtml(orgId, bill);
  h+='<label class="sub-txt" style="display:block;margin-bottom:10px">Plan'
   + '<select id="tb-tier-'+esc(orgId)+'" style="display:block;width:100%;margin-top:4px;padding:7px 9px;border:1px solid var(--cs-border,#E1E6EC);border-radius:7px">'
   + TIERS.map(function(t){ return '<option value="'+t[0]+'"'+((bill.tier||'trial')===t[0]?' selected':'')+'>'+esc(t[1])+'</option>'; }).join('')
   + '</select></label>';
  /* A CEILING BELOW THE PAID PLAN. Some accounts are billed at one level and
     scoped to less inside the editor — enterprise for tools, seats and
     reporting, designer only for the drawing. Without this the two could not
     be said separately, and the only alternative was a hardcoded domain in
     omega-caps.js, which CLAUDE.md forbids and the console could not see.
     Blank means the plan applies in full. It can only narrow: a cap above
     the plan is ignored. */
  var CAPS=[['','\u2014 no cap, the plan applies in full'],
            ['trial','designer only \u2014 draw, place, annotate'],
            ['standard','+ plot plan and one-line'],
            ['deluxe','+ schematics, riser, engineering, parcel screening']];
  h+='<label class="sub-txt" style="display:block;margin-bottom:10px">Editor cap'
   + '<select id="tb-cap-'+esc(orgId)+'" style="display:block;width:100%;margin-top:4px;padding:7px 9px;border:1px solid var(--cs-border,#E1E6EC);border-radius:7px">'
   + CAPS.map(function(t){ return '<option value="'+t[0]+'"'+((bill.capTier||'')===t[0]?' selected':'')+'>'+esc(t[1])+'</option>'; }).join('')
   + '</select>'
   + '<span class="sub-txt" style="display:block;margin-top:3px;font-size:11px">Caps what the '
   + 'EDITOR grants. Does not change the plan, the invoice, or which tools they see.</span></label>';
  /* JARVIS. The editor's assistant answers on ClearSky's platform AI key
     (ANTHROPIC_API_KEY on the deployment); this switch is the per-tenant
     gate the endpoint reads from billing/current.jarvis. Default on. */
  h+='<label class="sub-txt" style="display:block;margin-bottom:10px">Jarvis (editor assistant)'
   + '<select id="tb-jarvis-'+esc(orgId)+'" style="display:block;width:100%;margin-top:4px;padding:7px 9px;border:1px solid var(--cs-border,#E1E6EC);border-radius:7px">'
   + '<option value="on"'+(bill.jarvis===false?'':' selected')+'>On — answers on the ClearSky platform key</option>'
   + '<option value="off"'+(bill.jarvis===false?' selected':'')+'>Off — the editor says Jarvis is switched off for this workspace</option>'
   + '</select>'
   + '<span class="sub-txt" style="display:block;margin-top:3px;font-size:11px">Needs ANTHROPIC_API_KEY on the deployment '
   + '(Server health lists it). A tenant-specific key, AI_KEY_&lt;ORG&gt;, overrides the platform key for that tenant.</span></label>';
  /* THE ALLOWLIST. Blank means the plan decides, which is how every account
     behaved before this existed. Filled, it is the WHOLE list — the tier,
     unlockedTools and requiredTools are all ignored beneath it, because an
     allowlist something else can widen is not an allowlist.

     Keys, not names, because keys are what the gate matches and a display
     name that drifts would silently unlock or lock a tool. The catalog is
     printed underneath so nobody has to guess one. */
  var _allKeys = [];
  try {
    _allKeys = (window.OMEGATools && (OMEGATools._tools || OMEGATools.SEED_TOOLS) || [])
      .map(function(t){ return t.key; }).filter(Boolean).sort();
  } catch(e){}
  h+='<label class="sub-txt" style="display:block;margin-bottom:10px">Tools allowed'
   + '<input id="tb-allow-'+esc(orgId)+'" type="text" value="'
   +   esc((bill.toolAccess||[]).join(', '))+'" placeholder="blank = whatever the plan includes" '
   +   'style="display:block;width:100%;margin-top:4px;padding:7px 9px;border:1px solid var(--cs-border,#E1E6EC);border-radius:7px">'
   + '<span class="sub-txt" style="display:block;margin-top:3px;font-size:11px">'
   +   'Comma-separated tool keys. When set, ONLY these \u2014 the plan, unlockedTools '
   +   'and requiredTools are all overridden.</span>'
   + (_allKeys.length
      ? '<details style="margin-top:4px"><summary class="sub-txt" style="font-size:11px;cursor:pointer">'
        + _allKeys.length + ' available keys</summary>'
        + '<div class="sub-txt" style="font-size:10.5px;font-family:ui-monospace,monospace;'
        + 'line-height:1.6;margin-top:4px">' + esc(_allKeys.join(', ')) + '</div></details>'
      : '')
   + '</label>';
  /* ── WHAT AN ADD-ON ACTUALLY UNLOCKS ─────────────────────────────────
     This field has been editable since the console was built and, until
     today, nothing in the EDITOR read it — it fed the tool list and stopped
     there. So "NextNRG bought Compute" was a string that unlocked nothing
     they could see, and there was no way to tell from this screen which
     words did anything at all.

     The list is printed rather than described because the only thing that
     matters when typing into a free-text field is which words are real. It
     is read from omega-caps.js when that file is loaded here, so it cannot
     drift from what the editor honours; the hardcoded copy is a fallback for
     the console being open without it. */
  h+=_addonToggles(orgId, bill.addons||[]);
  /* The same field the save reads, with the switches above bound to it in
     both directions — typing here re-ticks the boxes, so the two views can
     never disagree about what a tenant has bought. */
  h+='<label class="sub-txt" style="display:block;margin-bottom:10px">Add-ons (comma separated)'
   + '<input id="tb-addons-'+orgId+'" type="text" value="'+esc((bill.addons||[]).join(', '))+'"'
   + ' placeholder="compute, engineering"'
   + ' oninput="_addonsToBoxes(&quot;'+esc(orgId)+'&quot;)"'
   + ' style="display:block;width:100%;margin-top:4px;padding:7px 9px;'
   + 'border:1px solid var(--cs-border,#E1E6EC);border-radius:7px;font:500 12.5px system-ui"></label>';
  h+='<div class="sub-txt" style="font-size:10.5px;margin:-6px 0 12px;line-height:1.55">'
   +  'Unlocks in the editor on top of the plan, and a plan cap never cancels one. '
   +  '<b>' + esc(_addonHelp()) + '</b>'
   +  '<br>osa-jv and grid-atlas are handled by the JV roster and the tool list \u2014 they grant nothing in the editor.'
   +  '</div>';
  h+=_tnField('Amount due (USD)','tb-amt-'+orgId,bill.amountDue==null?'':bill.amountDue,'number','0');
  h+=_tnField('Next payment (YYYY-MM-DD)','tb-due-'+orgId,bill.subscriptionDue||'','text','2026-11-21');
  /* Paid-upfront is the ordinary case here and there was nowhere to record it:
     half on signature, balance later. Without these two the account reads as
     "nothing due" and the money already taken is invisible. */
  h+=_tnField('Paid to date (USD)','tb-paid-'+orgId,bill.amountPaid==null?'':bill.amountPaid,'number','0');
  h+=_tnField('Last payment received (YYYY-MM-DD)','tb-paidat-'+orgId,bill.lastPaidAt||'','text','2026-09-06');
  h+=_tnField('Payment link (https)','tb-link-'+orgId,bill.paymentLink||'','text','https://buy.stripe.com/\u2026');
  h+=_tnField('Billing note','tb-note-'+orgId,bill.note||'','text','50% on signature, balance 21 Nov');
  h+='<button onclick="saveTenantBilling(&quot;'+esc(orgId)+'&quot;)">Save terms</button>';
  h+=' <span id="tb-msg-'+esc(orgId)+'" class="sub-txt"></span>';
  h+='<div class="sub-txt" style="margin-top:8px">Provider: '+esc(bill.paymentProvider||'\u2014')
   + (bill.stripeCustomerId?(' \u00b7 Stripe '+esc(bill.stripeCustomerId)):'')+'</div>';
  } else {
    /* a packaged workspace: the facts, in words, and the one door for changes */
    var onNow = Array.isArray(bill.modules) ? bill.modules : [], bought = _pkgModules(bill), sdp = _standing(bill, org);
    h+='<div id="tb-package-'+esc(orgId)+'" class="sub-txt" style="line-height:1.75">'
     + '<div><b style="color:var(--cs-navy)">'+esc(_pkgPlanName(bill))+'</b>'+(bill.monthlyDisplay ? ' \u00b7 '+esc(bill.monthlyDisplay) : '')+(bill.interval ? ' \u00b7 '+(bill.interval === 'annual' ? 'yearly, ten months of twelve' : 'monthly') : '')+'</div>'
     + '<div>Package: '+esc(_pkgModuleNames(bought).join(', ') || '\u2014')+(bought.join() !== onNow.join() && onNow.length ? ' (on now: '+esc(_pkgModuleNames(onNow).join(', '))+')' : '')+'</div>'
     + '<div>Standing: <span class="chip '+sdp.chip+'">'+esc(sdp.label)+'</span></div>'
     + (bill.nextInvoiceOn ? '<div>Next invoice: '+esc(bill.nextInvoiceOn)+(bill.paidThrough ? ' \u00b7 paid through '+esc(bill.paidThrough) : '')+'</div>' : '')
     + (Number(bill.amountDue||0) > 0 ? '<div>Amount due: $'+Number(bill.amountDue).toLocaleString()+(bill.paymentLink ? ' \u00b7 <a href="'+esc(bill.paymentLink)+'" target="_blank" rel="noopener">'+(bill.billingProvider === 'stripe' ? 'Stripe' : 'QuickBooks')+' pay link</a>' : '')+'</div>' : '')
     + (bill.reconcileNote ? '<div>Review: '+esc(bill.reconcileNote)+'</div>' : '')
     + '</div>'
     + '<p style="margin:10px 0 4px"><button onclick="document.getElementById(&quot;package-panel&quot;).scrollIntoView({behavior:&quot;smooth&quot;})">Open the Package panel</button></p>'
     + '<p class="sub-txt">Modules, activation, the price and every billing change are made on the Package panel above. The legacy tier fields do not apply to a packaged workspace.</p>';
  }
  h+='</div>';

  /* ── Identity & usage ── */
  h+='<div><div class="block-title" style="font-size:13px;margin-bottom:8px">Identity &amp; usage</div>';
  h+=_tnField('Display name','tb-name-'+orgId,org.name||'','text','');

  /* ── WHOLESALER / DISTRIBUTOR ──────────────────────────────────────────
     receivesFullBom is not a preference, it is the routing rule: /api/rfq.js
     sends a partner manufacturer only the lines carrying its own SKUs, and
     sends anyone with this flag the WHOLE bill of materials. A distributor
     quotes the package, not a line, so a half-BOM is no use to them.

     Setting it is what turns an ordinary tenant into one that can receive
     RFQs at all — Walters, City Electric Supply — and it is what their
     dashboard keys the distributor workspace off. Hence a switch here rather
     than a field somebody has to know the name of. */
  h+='<label style="display:flex;gap:9px;align-items:flex-start;margin:10px 0 4px;cursor:pointer">'
   + '<input type="checkbox" id="tb-dist-'+esc(orgId)+'"'+(org.receivesFullBom?' checked':'')+'>'
   + '<span><b style="font-size:12.5px">Wholesaler / distributor</b>'
   + '<div class="sub-txt">Receives the whole BOM on every RFQ, not just their own SKUs, '
   + 'and gets the sourcing workspace on their dashboard.</div></span></label>';
  /* ── BRANDS THIS ORG MAKES ─────────────────────────────────────────────
     The other half of the routing rule, for the other kind of supplier. A
     distributor is found by a flag; a MANUFACTURER is found by its product
     appearing on somebody's drawing — and the only thing a BOM line carries
     is the brand printed on the container. /api/rfq.js matches that brand
     against this list when no /equipment row names the vendor, which is the
     usual case: the editor's seed catalogue has hundreds of models and no
     catalogue rows behind them.

     Comma-separated, stored lowercased, matched exactly. "FENECON" on a BOM
     line finds the org listing `fenecon`. Leave it empty for anyone who does
     not manufacture — an empty list matches nothing, which is correct. */
  h+=_tnField('Brands they make','tb-brands-'+orgId,(org.brands||[]).join(', '),'text','fenecon, fenecon usa');
  h+='<div class="sub-txt" style="margin:-4px 0 8px">Comma-separated. A BOM line carrying one of '
   + 'these brands routes its quote request to this org.</div>';
  h+=_tnField('Logo URL','tb-logo-'+orgId,org.logoUrl||'','text','/tenants/'+orgId+'/logo.png');

  /* ── UPLOAD, NOT JUST A URL ────────────────────────────────────────────
     The field alone meant hosting the file somewhere first — commit it to
     tenants/<slug>/ and deploy, or upload to Storage by hand and paste the
     download URL back. Neither is a thing to ask somebody to do thirteen
     times.

     storage.rules has permitted this the whole time: tenants/{orgId}/ is
     writable by an admin domain under okLogo(), which caps it at 2 MB and
     requires an image content type. The console simply had no upload, and
     the Storage SDK was not even loaded on the page.

     The same constraints are enforced here as well as there, so somebody
     picking a 6 MB TIFF is told why before a request is made rather than
     after it is refused. */
  h+='<div class="sub-txt" style="margin:-4px 0 10px">'
   + '<input type="file" id="tb-logof-'+esc(orgId)+'" accept="image/png,image/jpeg,image/svg+xml,image/webp" '
   +   'style="font-size:11px;max-width:210px">'
   + ' <button onclick="uploadTenantLogo(&quot;'+esc(orgId)+'&quot;)">Upload</button>'
   + '<div style="margin-top:3px;font-size:11px">PNG, JPEG, SVG or WebP, under 2 MB. '
   +   'Goes to Storage at <span class="mono">tenants/'+esc(orgId)+'/</span> and fills the URL above. '
   +   'That path is world-readable by design \u2014 it is a logo on a sign-in page \u2014 '
   +   'so put nothing else there.</div>'
   + (org.logoUrl ? '<div style="margin-top:6px"><img src="'+esc(org.logoUrl)+'" alt="" '
       + 'style="max-height:34px;max-width:150px;background:#fff;border:1px solid var(--cs-border,#E1E6EC);'
       + 'border-radius:5px;padding:3px" onerror="this.style.display=\'none\';'
       + 'this.insertAdjacentHTML(\'afterend\',\'<span class=&quot;sub-txt&quot;>Logo URL is set but the '
       + 'image did not load.</span>\')"></div>' : '')
   + '</div>';
  h+='<button onclick="saveTenantBranding(&quot;'+esc(orgId)+'&quot;)">Save branding</button>';
  h+=' <span id="tbr-msg-'+esc(orgId)+'" class="sub-txt"></span>';

  /* ── RELATIONSHIP ─────────────────────────────────────────────────────
     TWO GRANTS, NOT ONE, and the difference is the whole point:
       osaMember  may enter the OSA workspace. The JV itself.
       jdPartner  has a joint development agreement with us, sees JD Partners
                  and their own side of it, and does NOT see OSA.
     Every OSA member is implicitly a JD partner; the reverse is not true.
     These were one test once, which is why a tenant with no JV relationship
     was shown the OSA link.

     ⚠ THE FLAG WAS NEVER THE WHOLE RELATIONSHIP. jdPartner:true reveals a nav
     item (omega-jd-nav.js) and nothing else. The two pages behind that item
     read THREE more fields, and nothing on this console has ever written one
     of them:

       jdPartnerOrg  the workspace they co-develop WITH. The org whose
                     projects are shared with them, below.
       jdPartnerOf   what that workspace is CALLED on their screen. Unset,
                     jd-workspace.html greets them as "the partner workspace".
       jdRole        which end of it they are on. design = work handed TO them
                     to draw; originator = projects they bring over. That one
                     field decides which page jd-workspace.html is.

     So ticking the box left a half-configured partner and said nothing about
     it; finishing the job meant editing Firestore by hand. All four fields
     are written together now, and the partner workspace is required — a JD
     partner with nobody to partner with is exactly the state this ends. */
  var jdOrgs = [], jdSeen = {};
  (STATE.tenants||[]).forEach(function(t){
    if (!t._id || t._id === orgId || jdSeen[t._id]) return;
    jdSeen[t._id] = 1; jdOrgs.push({ id:t._id, name:t.name||t._id });
  });
  /* A stored partner that is no longer in omega_orgs still has to appear, or
     saving anything else on this card silently re-points the relationship. */
  if (org.jdPartnerOrg && !jdSeen[org.jdPartnerOrg])
    jdOrgs.unshift({ id:org.jdPartnerOrg, name:org.jdPartnerOrg + ' (not in omega_orgs)' });
  jdOrgs.sort(function(a,b){ return String(a.name).localeCompare(String(b.name)); });

  h+='<div class="block-title" style="font-size:13px;margin:16px 0 8px">Relationship</div>';
  h+='<label class="sub-txt" style="display:block;margin-bottom:6px">'
   + '<input type="checkbox" id="tb-osa-'+esc(orgId)+'"'+(org.osaMember===true?' checked':'')+'> '
   + 'OSA member — may enter the OSA workspace</label>';
  h+='<label class="sub-txt" style="display:block;margin-bottom:8px">'
   + '<input type="checkbox" id="tb-jd-'+esc(orgId)+'"'+(org.jdPartner===true?' checked':'')+' '
   + 'onchange="jdToggleBox(&quot;'+esc(orgId)+'&quot;)"> '
   + 'JD partner — joint development agreement, sees JD Partners only</label>';

  h+='<div id="tb-jdbox-'+esc(orgId)+'" style="'+(org.jdPartner===true?'':'display:none;')
   + 'margin:0 0 10px;padding:10px 11px;border:1px solid var(--cs-border,#E1E6EC);border-radius:8px;background:#FBFCFD">';
  h+='<label class="sub-txt" style="display:block;margin-bottom:8px">They co-develop with'
   + '<select id="tb-jdorg-'+esc(orgId)+'" onchange="jdPartnerPicked(&quot;'+esc(orgId)+'&quot;)"'
   + ' style="display:block;width:100%;margin-top:4px;padding:7px 9px;border:1px solid var(--cs-border,#E1E6EC);border-radius:7px">'
   + '<option value="">— pick a workspace —</option>'
   + jdOrgs.map(function(o){
       return '<option value="'+esc(o.id)+'"'+(org.jdPartnerOrg===o.id?' selected':'')+'>'
            + esc(o.name)+' · '+esc(o.id)+'</option>'; }).join('')
   + '</select></label>';
  h+=_tnField('Called, on their screen','tb-jdlabel-'+esc(orgId),org.jdPartnerOf||'','text','OSA');
  h+='<label class="sub-txt" style="display:block;margin-bottom:6px">Their side of it'
   + '<select id="tb-jdrole-'+esc(orgId)+'"'
   + ' style="display:block;width:100%;margin-top:4px;padding:7px 9px;border:1px solid var(--cs-border,#E1E6EC);border-radius:7px">'
   + '<option value="design"'+(org.jdRole!=='originator'?' selected':'')+'>'
   +   'design — they draw what is handed to them</option>'
   + '<option value="originator"'+(org.jdRole==='originator'?' selected':'')+'>'
   +   'originator — they bring projects over</option>'
   + '</select></label>';
  h+='<div class="sub-txt" style="margin-top:2px">Takes effect at their next page load. '
   + 'It opens two pages for them: <span class="mono">/jda</span> (the responsibilities matrix) '
   + 'and <span class="mono">/jd-workspace.html</span> (the queue).</div>';
  h+='</div>';

  h+='<button onclick="saveTenantRelationship(&quot;'+esc(orgId)+'&quot;)">Save relationship</button>';
  h+=' <span id="tbrel-msg-'+esc(orgId)+'" class="sub-txt"></span>';
  h+='<div style="display:flex;gap:18px;margin-top:14px">'
   + '<div><div class="sub-txt">People</div><div style="font:700 20px system-ui">'+_peopleCount(members,seen)+'</div></div>'
   + '<div><div class="sub-txt">Projects</div><div style="font:700 20px system-ui">'+(projects==null?'—':projects)+'</div></div>'
   + '<div><div class="sub-txt">Vertical</div><div style="font:700 20px system-ui">'+esc(org.vertical||'—')+'</div></div>'
   + '</div>';
  h+='<div class="sub-txt" style="margin-top:10px">Hostnames: '+esc((org.domains||[]).join(', ')||'—')+'</div>';
  h+=_dashProfileHtml(orgId, org);
  h+='</div></div>';

  /* ── PROJECTS SHARED WITH THEM ────────────────────────────────────────
     THE FLAG IS NOT THE ACCESS. firestore.rules grants a partner read and
     update on a project through ONE clause — `userOrg() in orgsInvolved[]`,
     the Silmarillion JDA roster — and nothing else. No relationship field
     opens a project; no tier does. So marking somebody a JD partner and
     expecting them to see the other workspace's pipeline was always going to
     show them an empty page, correctly.

     Until now the only thing that put an org on a roster was OSA's own
     per-deal design handoff (tenants/osa/portfolio-data.js), one project at a
     time, from inside OSA's console. This is the same write, in bulk, from
     the place where the partnership is set up in the first place.

     DELIBERATELY A PICKER AND NOT A SWITCH. "Every project this workspace
     owns" was the other way to build it and it is one forgotten tick away
     from handing a partner the whole book, including sites signed under a
     different NDA and every project created after the decision was made.
     Sharing stays a thing somebody chose, site by site. */
  h+='<div class="block-title" style="font-size:13px;margin:18px 0 6px">Projects shared with them</div>';
  if (org.jdPartner !== true){
    h+='<div class="sub-txt">Not a joint-development partner. Tick <b>JD partner</b> above, '
     + 'pick the workspace they co-develop with, and save — then the projects to share appear here.</div>';
  } else {
    h+='<div class="sub-txt" style="margin-bottom:8px">Ticking a project puts <span class="mono">'
     + esc(orgId)+'</span> on its roster (<span class="mono">orgsInvolved</span>). That is what opens it '
     + 'to them: the responsibilities matrix on <span class="mono">/jda</span>, the shared task board, '
     + 'the documents, and update rights on the project itself. Unticking takes it back — the project '
     + 'stays exactly as it is, they simply stop seeing it.</div>';
    h+='<div id="tb-jdshare-'+esc(orgId)+'"><div class="sub-txt">Loading…</div></div>';
  }

  /* ── People ── */
  h+='<div class="block-title" style="font-size:13px;margin:6px 0 8px">People</div>';
  /* BOTH LISTS, ALWAYS. The previous version only showed who had signed in
     when there were ZERO member rows, so a tenant with one member hid
     everybody else — NextNRG showed test@ and concealed the rest. Members and
     sign-ins are different facts and neither substitutes for the other:
     a member row is a ROLE, a team_members row is EVIDENCE SOMEBODY LOGGED IN.
     Merge on the email, show the union, and mark which is which. */
  var byEmail = {};
  members.forEach(function(m){
    var e = String(m.email || m._id || '').toLowerCase();
    if (e) byEmail[e] = { email:e, role:m.role||'member', status:m.status||'active', uid:m._id, member:true };
  });
  seen.forEach(function(t){
    var e = String(t.email || '').toLowerCase();
    if (!e) return;
    if (byEmail[e]) { byEmail[e].name = t.name || byEmail[e].name; byEmail[e].lastSeen = t.lastSeen; return; }
    byEmail[e] = { email:e, name:t.name||'', lastSeen:t.lastSeen, member:false };
  });
  var people = Object.keys(byEmail).map(function(k){ return byEmail[k]; })
                     .sort(function(a,b){ return a.email.localeCompare(b.email); });

  if (!people.length){
    h+='<div class="sub-txt">Nobody from '+esc(orgId)+' has signed in yet. A row appears on first sign-in.</div>';
  } else {
    var pending = people.filter(function(x){ return !x.member; }).length;
    if (pending){
      h+='<div class="sub-txt" style="margin-bottom:8px">'
       + pending+' '+(pending===1?'person has':'people have')+' signed in without a control-plane row yet. '
       + 'omega_orgs was empty until it was seeded, so the self-registration in omega-tenant.js had nothing '
       + 'to write under. Each row appears on that person\u2019s next sign-in, and the role dropdown works once it does.</div>';
    }
    h+='<table class="ptable"><thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Status</th><th>Account</th></tr></thead><tbody>';
    people.forEach(function(m){
      h+='<tr><td class="sub-txt">'+esc(m.email)+'</td>'
       + '<td class="sub-txt">'+esc(m.name||'\u2014')+'</td><td>';
      if (m.member){
        h+='<select onchange="setMemberRole(&quot;'+esc(orgId)+'&quot;,&quot;'+esc(m.uid)+'&quot;,this.value)">'
         + ['owner','admin','member','viewer'].map(function(r){
             return '<option value="'+r+'"'+(m.role===r?' selected':'')+'>'+r+'</option>'; }).join('')
         + '</select>';
      } else {
        h+='<span class="chip warn">no role row yet</span>';
      }
      h+='</td><td class="sub-txt">'+esc(m.member?(m.status||'active'):(m.lastSeen?('seen '+timeAgo(m.lastSeen)):'signed in'))+'</td>'
       + '<td style="white-space:nowrap">'
       + '<button class="btn-ghost" onclick="userAdmin(&quot;resetLink&quot;,&quot;'+esc(m.email)+'&quot;)">Reset link</button> '
       + '<button class="btn-ghost" onclick="userAdmin(&quot;setEmail&quot;,&quot;'+esc(m.email)+'&quot;)">Change email</button> '
       + '<button class="btn-ghost" onclick="userAdmin(&quot;disable&quot;,&quot;'+esc(m.email)+'&quot;)">Disable</button>'
       + '</td></tr>';
    });
    h+='</tbody></table>';
  }
  return h;
}

/* WRITES FIRESTORE DIRECTLY, and that is deliberate rather than a shortcut.
   The rules already permit isAdmin() to write billing/current; the endpoint
   at /api/tenant-billing exists to allow-list fields and append history, and
   it needs FIREBASE_SERVICE_ACCOUNT, which this deployment does not yet have.
   Routing through it would mean the console cannot price a tenant until an
   env var lands. So the write goes direct and the history row is appended
   here — the rule makes that row append-only, so the audit property survives
   either path. When the endpoint is live, switch this back and it behaves
   identically from the outside. */
/* Uploads and writes the URL straight onto omega_orgs, because a logo that
   uploads but does not get saved is a worse outcome than no upload at all —
   the file is there, the tenant still has no logo, and nothing says why. */
function uploadTenantLogo(orgId){
  var msg = document.getElementById('tbr-msg-'+orgId);
  function say(t){ if (msg) msg.textContent = t; }
  var inp = document.getElementById('tb-logof-'+orgId);
  var f = inp && inp.files && inp.files[0];
  if (!f) { say('Choose an image first.'); return; }
  if (!/^image\//.test(f.type)) { say('That is not an image.'); return; }
  if (f.size > 2 * 1024 * 1024) {
    say('That file is ' + Math.round(f.size/1024/1024*10)/10 + ' MB. The limit is 2 MB.');
    return;
  }
  if (typeof firebase === 'undefined' || !firebase.storage) {
    say('The Storage SDK did not load on this page.'); return;
  }
  var ext = (f.name.match(/\.([a-z0-9]+)$/i) || [,'png'])[1].toLowerCase();
  var path = 'tenants/' + orgId + '/logo-' + Date.now() + '.' + ext;
  say('Uploading\u2026');
  firebase.storage().ref(path).put(f, { contentType: f.type })
    .then(function(snap){ return snap.ref.getDownloadURL(); })
    .then(function(url){
      var fld = document.getElementById('tb-logo-'+orgId);
      if (fld) fld.value = url;
      return db.collection('omega_orgs').doc(orgId).set({ logoUrl: url }, { merge:true });
    })
    .then(function(){
      say('Logo uploaded and saved.');
      if (typeof loadTenants === 'function') loadTenants();
    })
    ['catch'](function(e){
      /* Name the refusal. "Upload failed" sends somebody to check their wifi
         while Storage is refusing the write. */
      say(e && e.code === 'storage/unauthorized'
        ? 'Storage refused the upload \u2014 that path allows an admin domain only.'
        : 'Upload failed: ' + ((e && (e.code || e.message)) || 'unknown'));
    });
}

/* Enrollment uses the authenticated server; a visible switch is not a grant. */
function logicEnrollmentHtml(orgId, bill){
  if (!currentUser || String(currentUser.email).toLowerCase() !== 'tom@clearsky-usa.com') return '';
  var lite=bill.editorLite||{}, enabled=(bill.addons||[]).indexOf('omega-logic')>=0 || bill.omegaLogic===true;
  var mods=Array.isArray(lite.modules)?lite.modules:['bess'];
  var h='<fieldset style="border:1px solid #abd8d7;border-radius:8px;padding:14px;margin:0 0 18px"><legend>Omega Logic bundle</legend>';
  h+='<label><input type="checkbox" id="ol-enabled-'+esc(orgId)+'"'+(enabled?' checked':'')+'> Enroll this tenant in Omega Logic</label>';
  h+='<p class="sub-txt">Office + plant portals, website sizer / platform lite, and white-label Editor Lite. Subscription pricing remains in commercial terms below. No charge is made by enrollment.</p><div>Editor Lite modules</div>';
  [['bess','BESS'],['compute','Compute'],['ev','EV charging'],['solar','Solar']].forEach(function(m){
    h+='<label style="display:inline-block;margin:8px 12px 8px 0"><input type="checkbox" id="ol-'+m[0]+'-'+esc(orgId)+'"'+(mods.indexOf(m[0])>=0?' checked':'')+'> '+m[1]+'</label>';
  });
  h+='<div><button onclick="saveLogicEnrollment(&quot;'+esc(orgId)+'&quot;)">Save Omega Logic bundle</button></div>';
  h+='<label>Customer Editor Lite price · USD per month<input id="ol-customer-price-'+esc(orgId)+'" type="number" min="1" max="100000" step="0.01" value="'+esc(((bill.customerEditorLite||{}).monthlyPriceCents||79900)/100)+'"></label><p class="sub-txt">For this OEM’s customers, not platform users. Free customer accounts remain available. Changing the offer does not charge anyone or reprice existing subscriptions.</p><button onclick="saveLogicCustomerPrice(&quot;'+esc(orgId)+'&quot;)">Save customer subscription price</button><p><a href="/portals/customer/admin.html?org='+encodeURIComponent(orgId)+'">Manage this client’s customers →</a></p>';
  h+='<p class="sub-txt">Payment automation stays separately gated on QuickBooks setup. Turning the bundle off preserves all tenant data.</p>';
  h+='<details><summary>Company administrator</summary>';
  h+=_tnField('Full name','ol-name-'+orgId,'','text','Company administrator');
  h+=_tnField('Work email','ol-email-'+orgId,'','email','admin@'+orgId);
  h+=_tnField('Temporary password — new account only','ol-password-'+orgId,'','password','Never saved in tenant settings');
  h+='<label style="display:block;margin:12px 0"><input type="checkbox" id="ol-support-'+esc(orgId)+'"> ClearSky-managed support account (admin@ only): I control this mailbox; skip email verification</label>';
  h+='<p class="sub-txt">Creates a tenant admin membership. Ordinary sign-ins require mailbox verification; explicitly attested support accounts do not. Existing passwords are preserved. Replace temporary passwords before handing over access.</p>';
  h+='<button onclick="createLogicAdministrator(&quot;'+esc(orgId)+'&quot;)">Create / assign company administrator</button></details>';
  h+='<p id="ol-msg-'+esc(orgId)+'" class="sub-txt" role="status"></p>';
  if(enabled) h+='<a href="/omega-logic?org='+encodeURIComponent(orgId)+'">Open office</a> · <a href="/plant/manager?org='+encodeURIComponent(orgId)+'">Plant manager</a> · <a href="/plant/manager?org='+encodeURIComponent(orgId)+'#flow">Production flow</a> · <a href="/logic-urls?org='+encodeURIComponent(orgId)+'">URL Generator</a>';
  return h+'</fieldset>';
}

function saveLogicEnrollment(orgId){
  var msg=document.getElementById('ol-msg-'+orgId), mods=['bess','compute','ev','solar'].filter(function(m){return document.getElementById('ol-'+m+'-'+orgId).checked;});
  msg.textContent='Saving enrollment…';
  _authedPost('/api/logic-onboard',{action:'bundle',org:orgId,enabled:document.getElementById('ol-enabled-'+orgId).checked,modules:mods})
    .then(function(){msg.textContent='Saved. Financial automation is unchanged.';loadTenants();})
    .catch(function(e){msg.textContent='Not saved: '+e.message;});
}

function saveLogicCustomerPrice(orgId){
  var msg=document.getElementById('ol-msg-'+orgId);
  var value=Number(document.getElementById('ol-customer-price-'+orgId).value);
  msg.textContent='Saving customer offer…';
  _authedPost('/api/logic-onboard',{action:'customer-editor-price',org:orgId,monthlyPriceCents:Math.round(value*100)})
    .then(function(r){msg.textContent=r.note;}).catch(function(e){msg.textContent='Not saved: '+e.message;});
}

function createLogicAdministrator(orgId){
  var msg=document.getElementById('ol-msg-'+orgId), pw=document.getElementById('ol-password-'+orgId);
  var email=document.getElementById('ol-email-'+orgId).value.trim();
  if(!confirm('Assign '+email+' as a company administrator for '+orgId+'? This grants office and plant administration, not ClearSky access.'+(document.getElementById('ol-support-'+orgId).checked?' You attest that you control this support mailbox; it will be trusted without an email verification step.':''))) return;
  msg.textContent='Provisioning administrator…';
  var body={action:'administrator',org:orgId,name:document.getElementById('ol-name-'+orgId).value,email:email,password:pw.value,supportAccount:document.getElementById('ol-support-'+orgId).checked};
  pw.value='';
  _authedPost('/api/logic-onboard',body).then(function(r){msg.textContent=(r.created?'Account created. ':'Existing sign-in retained. ')+r.note;})
    .catch(function(e){msg.textContent='Not completed: '+e.message;});
}

function saveTenantBilling(orgId){
  var msg=document.getElementById('tb-msg-'+orgId);
  function v(id){ var el=document.getElementById(id+'-'+orgId); return el?String(el.value||'').trim():''; }
  var addons=v('tb-addons').split(',').map(function(x){return x.trim();}).filter(Boolean);

  var allow = v('tb-allow').split(',').map(function(x){return x.trim();}).filter(Boolean);
  var patch={ tier:v('tb-tier'), addons:addons, capTier: v('tb-cap') || null,
              jarvis: v('tb-jarvis') !== 'off',
              /* null, not [], so "no allowlist" and "an allowlist of nothing"
                 stay distinguishable — an empty array would lock the account
                 out of every tool it has. */
              toolAccess: allow.length ? allow : null };
  if(v('tb-amt')!=='')    patch.amountDue=Number(v('tb-amt'));
  if(v('tb-paid')!=='')   patch.amountPaid=Number(v('tb-paid'));
  patch.subscriptionDue = v('tb-due')    || null;
  patch.lastPaidAt      = v('tb-paidat') || null;
  patch.paymentLink     = v('tb-link')   || null;
  patch.note            = v('tb-note')   || null;

  if(patch.paymentLink && !/^https:\/\//.test(patch.paymentLink)){
    if(msg) msg.textContent='Payment link must start with https://';
    return;
  }
  ['subscriptionDue','lastPaidAt'].forEach(function(k){
    /* A date the customer sees. An unparseable one renders as "Invalid Date"
       on their own account page, which reads as a broken product. */
    if(patch[k] && isNaN(Date.parse(patch[k]))) throw new Error(k+' is not a date (use YYYY-MM-DD)');
  });

  if(msg) msg.textContent='Saving…';
  var FV=firebase.firestore.FieldValue;
  var ref=db.collection('omega_orgs').doc(orgId).collection('billing').doc('current');

  ref.get().then(function(snap){
    var before=snap.exists?snap.data():{};
    if (before.packaged === true) throw new Error('Use the Package panel for this subscription.');
    /* A Stripe payment for an earlier figure holds Plan & billing's Pay
       (stripeDueHold, api/_lib/stripe-customer.js) until ClearSky has looked:
       saving the amount due here, the same figure included, is that look,
       and the history row keeps the hold it released. */
    if (before.stripeDueHold && patch.amountDue !== undefined) patch.stripeDueHold = null;
    var write=Object.assign({}, patch, {
      updatedAt: FV.serverTimestamp(),
      updatedBy: (currentUser && currentUser.email) || 'console'
    });
    return ref.set(write,{merge:true}).then(function(){
      var was={};
      Object.keys(patch).forEach(function(k){ was[k]= before[k]===undefined?null:before[k]; });
      return ref.collection('history').add({
        at: FV.serverTimestamp(),
        by: (currentUser && currentUser.email) || 'console',
        changed: patch, was: was
      });
    });
  }).then(function(){
    if(msg) msg.textContent='Saved.';
    loadTenants();
  }).catch(function(e){
    if(msg) msg.textContent='Failed — '+(e.message||e);
  });
}

/* Writes omega_orgs directly — the rules already permit isAdmin(), and unlike
   branding there is no server mirror to run, because nothing outside this
   document reads these two flags. The portal reads them at sign-in to decide
   which doors to show; the doors themselves are gated by omega_users and by
   what the caller can already read, so a wrong tick shows somebody a link
   rather than handing them data. */
/* ── SAVING THE RELATIONSHIP ──────────────────────────────────────────────
   Four fields, written together, because three of them were never written at
   all and the fourth on its own is a half-configured partner: the nav item
   appears, the pages behind it do not know who the partner is, and the only
   way to finish the setup was a hand edit in the Firestore console.

   UNMARKING CLEARS THE OTHER THREE. Left behind, jdPartnerOf keeps painting
   the JD Workspace entry in their sidebar (omega-tenant.js reveals it on that
   field alone, count or no count) — so a partner you had un-partnered would
   still see the door. Deleting the fields is not deleting their work: the
   rosters, the projects and the boards are untouched, and re-ticking the box
   restores the relationship in one save. */
function saveTenantRelationship(orgId){
  var FV  = firebase.firestore.FieldValue;
  var msg = document.getElementById('tbrel-msg-'+orgId);
  var osa = document.getElementById('tb-osa-'+orgId);
  var jd  = document.getElementById('tb-jd-'+orgId);
  function say(t){ if(msg) msg.textContent=t; }

  var body = { osaMember: !!(osa&&osa.checked), jdPartner: !!(jd&&jd.checked) };

  if (body.jdPartner){
    var selOrg = document.getElementById('tb-jdorg-'+orgId);
    var selRol = document.getElementById('tb-jdrole-'+orgId);
    var fLabel = document.getElementById('tb-jdlabel-'+orgId);
    var pOrg   = (selOrg && selOrg.value) || '';
    if (!pOrg){ say('Pick the workspace they co-develop with — a JD partner with nobody to partner with sees an empty page.'); return; }
    if (pOrg === orgId){ say('That is the same organisation.'); return; }
    body.jdPartnerOrg = pOrg;
    body.jdRole       = (selRol && selRol.value === 'originator') ? 'originator' : 'design';
    body.jdPartnerOf  = String((fLabel && fLabel.value) || '').trim() || jdOrgLabel(pOrg);
  } else {
    body.jdPartnerOrg = FV.delete();
    body.jdRole       = FV.delete();
    body.jdPartnerOf  = FV.delete();
  }

  say('Saving...');
  db.collection('omega_orgs').doc(orgId).set(body, { merge:true })
    .then(function(){
      say(body.jdPartner
            ? 'Saved — ' + orgId + ' co-develops with ' + body.jdPartnerOrg
              + ' as ' + body.jdRole + '. Share projects below.'
            : 'Saved — takes effect at their next sign-in.');
      /* The share panel keys off the partner org that was just chosen, so it
         reloads here rather than waiting for the card to be reopened. */
      try { jdShareLoad(orgId, body.jdPartner ? body.jdPartnerOrg : '',
                        body.jdPartner ? body.jdRole : ''); } catch(e){}
      loadTenants();
    })
    .catch(function(e){ say('Failed - '+(e.message||e)); });
}

/* The name somebody typed, not the domain — the same reason omega-tenant.js
   prefers omega_orgs.name over the derived one. */
function jdOrgLabel(orgId){
  var t = (STATE.tenants||[]).filter(function(x){ return x._id===orgId; })[0];
  return (t && t.name) || String(orgId||'').toUpperCase();
}

function jdToggleBox(orgId){
  var jd  = document.getElementById('tb-jd-'+orgId);
  var box = document.getElementById('tb-jdbox-'+orgId);
  if (box) box.style.display = (jd && jd.checked) ? '' : 'none';
}

/* Filling the label from the chosen workspace, but only while it is empty —
   overwriting a label somebody typed because they changed the org underneath
   it is the kind of helpfulness that loses work. */
function jdPartnerPicked(orgId){
  var selOrg = document.getElementById('tb-jdorg-'+orgId);
  var fLabel = document.getElementById('tb-jdlabel-'+orgId);
  var pOrg   = (selOrg && selOrg.value) || '';
  if (fLabel && !String(fLabel.value||'').trim() && pOrg) fLabel.value = jdOrgLabel(pOrg);
  var selRol = document.getElementById('tb-jdrole-'+orgId);
  jdShareLoad(orgId, pOrg, (selRol && selRol.value) || 'design');
}

/* ── THE ROSTER, AS A LIST OF TICKS ───────────────────────────────────────
   Reads the partner workspace's own projects — this console is ClearSky
   staff, so isOmegaStaff() already grants that read — and shows which of them
   name this org on their roster. One query per opened card, not per render.

   ⚠ It lists what the PARTNER WORKSPACE owns (projects.orgId == their org),
   not everything they can see. A project OSA is itself a collaborator on
   belongs to somebody else, and re-sharing another tenant's project out of
   this panel would be ClearSky quietly widening an agreement it is not a
   party to. */
function jdShareLoad(orgId, partnerOrg, role){
  var host = document.getElementById('tb-jdshare-'+orgId);
  if (!host) return;
  if (!partnerOrg){
    host.innerHTML = '<div class="sub-txt">Pick the workspace they co-develop with above and save — '
                   + 'its projects appear here to share.</div>';
    return;
  }
  host.innerHTML = '<div class="sub-txt">Reading '+esc(partnerOrg)+'’s projects…</div>';
  db.collection('projects').where('orgId','==',partnerOrg).get().then(function(sn){
    var rows=[];
    sn.forEach(function(d){ var v=d.data()||{}; v._id=d.id; rows.push(v); });
    rows.sort(function(a,b){
      return String(a.name||a.address||a._id).localeCompare(String(b.name||b.address||b._id)); });
    if (!rows.length){
      host.innerHTML = '<div class="sub-txt">'+esc(partnerOrg)+' owns no projects yet, so there is '
                     + 'nothing to share. Projects created there appear here.</div>';
      return;
    }
    var on = 0, h = '';
    /* THE ROSTER OPENS THE PROJECT; IT DOES NOT ASK FOR ANYTHING. A design
       partner's queue (jd-workspace.html) lists projects carrying a design
       handoff — design.status — because "shared with you" and "please draw
       this" are different statements and only the second one belongs in a
       queue with a due date. Ticking this makes the share the second one. */
    if (role !== 'originator'){
      h += '<label class="sub-txt" style="display:block;margin-bottom:8px">'
         + '<input type="checkbox" id="tb-jddraw-'+esc(orgId)+'" checked> '
         + 'Also put newly shared projects in their draw queue — they appear on their '
         + 'JD Workspace as <b>To draw</b>. Projects that already carry a design handoff are left alone.'
         + '</label>';
    }
    h += '<div style="max-height:260px;overflow:auto;border:1px solid var(--cs-border,#E1E6EC);'
       + 'border-radius:8px;padding:8px 10px;background:#fff">';
    rows.forEach(function(p){
      var shared = (p.orgsInvolved||[]).indexOf(orgId) >= 0;
      if (shared) on++;
      var dz = p.design || {};
      h += '<label class="sub-txt" style="display:block;margin:4px 0">'
         + '<input type="checkbox" data-jdp="'+esc(p._id)+'" data-was="'+(shared?'1':'0')+'"'
         +   ' data-design="'+(dz && dz.status ? '1':'0')+'"'+(shared?' checked':'')+'> '
         + esc(p.name||p.address||p._id)
         + (dz.status ? ' <span style="opacity:.65">· '+esc(dz.status)+'</span>' : '')
         + '</label>';
    });
    h += '</div>';
    h += '<div style="margin-top:9px">'
       + '<button onclick="jdShareSave(&quot;'+esc(orgId)+'&quot;,&quot;'+esc(partnerOrg)+'&quot;)">'
       +   'Save shared projects</button>'
       + ' <span id="tb-jdshare-msg-'+esc(orgId)+'" class="sub-txt">'
       +   on+' of '+rows.length+' shared</span></div>';
    host.innerHTML = h;
  }).catch(function(e){
    host.innerHTML = '<div class="sub-txt">Could not read '+esc(partnerOrg)+'’s projects — '
                   + esc(e.message||'denied')+'</div>';
  });
}

/* ONLY WHAT CHANGED. A batch that rewrote every roster would touch projects
   nobody edited, and arrayUnion/arrayRemove on the one field keeps a partner
   added by OSA's own handoff from being dropped by a stale copy of this list
   — the same reason jda.html refuses to write orgsInvolved from its own
   in-memory copy. */
function jdShareSave(orgId, partnerOrg){
  var host = document.getElementById('tb-jdshare-'+orgId); if (!host) return;
  var msg  = document.getElementById('tb-jdshare-msg-'+orgId);
  var FV   = firebase.firestore.FieldValue;
  var draw = document.getElementById('tb-jddraw-'+orgId);
  var wantDraw = !!(draw && draw.checked);
  var stamp = new Date().toISOString();
  var batch = db.batch(), added = 0, removed = 0;

  Array.prototype.forEach.call(host.querySelectorAll('input[data-jdp]'), function(b){
    var was = b.getAttribute('data-was') === '1';
    if (was === b.checked) return;
    var ref = db.collection('projects').doc(b.getAttribute('data-jdp'));
    if (b.checked){
      var body = { orgsInvolved: FV.arrayUnion(orgId), updatedAt: stamp };
      /* Never over an existing handoff: that object carries the brief, the
         due date and who asked, and replacing it with a blank one loses the
         instructions the drawing was supposed to follow. */
      if (wantDraw && b.getAttribute('data-design') !== '1'){
        body.design = { status:'in_design', fromOrg:partnerOrg, assignedOrgs:[orgId],
                        assignees:[], lead:'', dueAt:null, brief:'',
                        sentAt:stamp, sentBy:(currentUser&&currentUser.email)||'ClearSky' };
      }
      batch.update(ref, body); added++;
    } else {
      /* The roster only. design.status stays where it is — flag, don't drop:
         the work was really sent, and OSA's own views read that field. */
      batch.update(ref, { orgsInvolved: FV.arrayRemove(orgId), updatedAt: stamp });
      removed++;
    }
  });

  if (!added && !removed){ if (msg) msg.textContent = 'Nothing changed.'; return; }
  if (msg) msg.textContent = 'Saving…';
  batch.commit().then(function(){
    if (msg) msg.textContent = 'Saved — '+added+' shared, '+removed+' taken back.';
    var selRol = document.getElementById('tb-jdrole-'+orgId);
    jdShareLoad(orgId, partnerOrg, (selRol && selRol.value) || 'design');
  }).catch(function(e){
    if (msg) msg.textContent = 'Failed — '+(e.message||e);
  });
}

/* WRITES DIRECT, FOR THE SAME REASON saveTenantBilling DOES.
   This posted to /api/tenant-branding, which needs FIREBASE_SERVICE_ACCOUNT
   — an env var this deployment does not have — so every save came back
   "Failed: FIREBASE_SERVICE_ACCOUNT is not set". The logo uploaded to
   Storage perfectly well (that call is already client-side) and then the
   branding never saved, which is the worst shape of all: the file is there,
   the tenant still has no logo, and the reason names an environment
   variable rather than anything a person can act on.

   THE MIRROR IS THE POINT, not an extra. The endpoint wrote omega_orgs and
   then copied a public snapshot to tenant_public/{host} for every hostname
   on the org, because the sign-in page paints BEFORE anyone is
   authenticated and cannot read omega_orgs. Saving only omega_orgs would
   have looked like it worked and left the sign-in page on the old logo —
   the logo still would not have stuck. Both writes happen here, in the
   endpoint's own order and with its exact snapshot shape.

   The rules already allow it: omega_orgs is `allow update: if isAdmin()`
   and tenant_public is `allow write: if isAdmin()`, and only ClearSky staff
   reach this console. When the service account lands, switching back to the
   endpoint behaves identically from the outside. */
function saveTenantBranding(orgId){
  var msg=document.getElementById('tbr-msg-'+orgId);
  function say(t){ if(msg) msg.textContent=t; }
  var FV = firebase.firestore.FieldValue;
  var nameEl = document.getElementById('tb-name-'+orgId);
  var logoEl = document.getElementById('tb-logo-'+orgId);
  var patch = { updatedAt: FV.serverTimestamp() };
  if (nameEl && String(nameEl.value||'').trim()) patch.name = String(nameEl.value).trim();
  if (logoEl && String(logoEl.value||'').trim()) patch.logoUrl = String(logoEl.value).trim();
  var distEl = document.getElementById('tb-dist-'+orgId);
  /* Written unconditionally — unticking it has to mean something, and a
     falsy-skip would make the flag impossible to turn off. */
  if (distEl) patch.receivesFullBom = !!distEl.checked;
  /* Same reasoning: clearing the field has to clear the list, or a brand set
     by mistake can never be taken off and keeps routing quotes. */
  var brandEl = document.getElementById('tb-brands-'+orgId);
  if (brandEl) {
    patch.brands = String(brandEl.value||'').split(',')
      .map(function(x){ return String(x||'').trim().toLowerCase(); })
      .filter(function(x, i, a){ return x && a.indexOf(x) === i; });
  }

  say('Saving\u2026');
  var ref = db.collection('omega_orgs').doc(orgId);
  ref.set(patch, { merge:true })
    .then(function(){ return ref.get(); })
    .then(function(snap){
      var org = (snap && snap.data()) || {};
      var hosts = org.domains || [];
      if (!hosts.length) return { mirrored: 0 };
      var pub = {
        orgId: orgId, name: org.name || orgId, logoUrl: org.logoUrl || '',
        colors: org.colors || null, exportBrand: org.exportBrand || null,
        tier: (org.publicTier || 'standard'), vertical: org.vertical || null,
        /* The dashboard reads its shell from tenant_public, so the flag has to
           travel with the rest of the branding or the workspace never appears. */
        receivesFullBom: org.receivesFullBom === true,
        shell: org.shell || 'default', domains: hosts, updatedAt: FV.serverTimestamp()
      };
      var batch = db.batch();
      hosts.forEach(function(h){
        batch.set(db.collection('tenant_public').doc(String(h).toLowerCase()), pub, { merge:true });
      });
      return batch.commit().then(function(){ return { mirrored: hosts.length }; });
    })
    .then(function(r){
      say(r.mirrored
        ? 'Saved \u2014 mirrored to ' + r.mirrored + ' hostname' + (r.mirrored===1?'':'s') + '.'
        : 'Saved \u2014 no hostname on this org yet, so nothing to mirror. '
          + 'Add one under domains and save again, or the sign-in page keeps the old logo.');
      loadTenants();
    })
    ['catch'](function(e){
      /* Name the refusal rather than the plumbing. */
      say(e && e.code === 'permission-denied'
        ? 'Firestore refused the write \u2014 this console needs a ClearSky admin account.'
        : 'Failed \u2014 ' + ((e && (e.message || e.code)) || 'unknown'));
    });
}

/* Role changes go through /api/set-role rather than a direct write, because
   the endpoint also mints the Auth custom claims. Writing the members document
   alone leaves request.auth.token.role stale, and Storage rules and the other
   functions read the claim — so the two sources disagree and the bug shows up
   somewhere far away from here. */
function setMemberRole(orgId, uid, role){
  _authedPost('/api/set-role', { orgId:orgId, targetUid:uid, role:role })
    .then(function(){ /* the select already shows the new value */ })
    .catch(function(e){
      window.alert('Could not set role:\n\n'+(e.message||e));
      var rowId='tn-users-'+orgId.replace(/[^A-Za-z0-9_-]/g,'_');
      var tr=document.getElementById(rowId);
      if(tr){ tr.style.display='none'; openTenantDetail(orgId); }   /* re-read the truth */
    });
}

/* Reset links are shown, never sent. The endpoint mints a credential-bearing
   URL, and emailing it from software means one wrong address in a support
   ticket hands over the account. Staff pass it on deliberately. */
function userAdmin(action, email){
  var body={ action:action, targetEmail:email };
  if(action==='setEmail'){
    var next=window.prompt('New sign-in address for '+email+'.\n\nThis changes which tenant they resolve to — the email domain IS the org key.', '');
    if(!next) return;
    body.newEmail=next.trim();
  }
  if(action==='disable' && !window.confirm('Disable '+email+'? They will be unable to sign in until re-enabled.')) return;
  _authedPost('/api/user-admin', body)
    .then(function(r){
      if(action==='resetLink' && r && r.link){
        window.prompt('Password reset link for '+email+' — copy it and send it to them yourself:', r.link);
      } else {
        window.alert(action+' done for '+email+'.');
      }
      renderTenants();
    })
    .catch(function(e){ window.alert('Could not '+action+':\n\n'+(e.message||e)); });
}


/* ═══ THE PAGE ═══════════════════════════════════════════════════════════ */

function _initFirebase(){
  if (typeof firebase === 'undefined' || !window.CLEARSKY_CONFIG){ setTimeout(_initFirebase, 120); return; }
  CFG = window.CLEARSKY_CONFIG;
  try { firebase.initializeApp(CFG.firebase); }
  catch(e){ if(!/already exists/.test(e.message)) console.error('Firebase init:', e); }
  auth = firebase.auth();
  db = firebase.firestore();
  auth.onAuthStateChanged(function(user){
    if (!user){ sendToPortal(); return; }
    var access = accessFor(user.email || '');
    /* never auth.signOut() here: the page shares the portal's session (admin-console.js says why) */
    if (!access){ showNotAuthorised(user.email); return; }
    currentUser = user; currentOrg = 'admin'; currentRole = access.role; currentLabel = access.label;
    showApp(user);
    loadPriceBook();
    loadAccount();
  });
}
function wall(html){
  var scr = $('auth-screen'), app = $('app');
  if (app) app.style.display = 'none';
  if (scr){ scr.style.display = 'flex'; scr.innerHTML = '<div class="auth-card">' + html + '</div>'; }
}
function sendToPortal(){
  wall('<h1>Sign in on the portal</h1><p class="auth-note">The account page uses your ClearSky-OMEGA session. Sign in once on the portal and come straight back.</p><p><a class="btn-add" href="/">Go to the portal</a></p>');
  setTimeout(function(){ if (!auth.currentUser) location.href = '/'; }, 2500);
}
function showNotAuthorised(email){
  wall('<h1>Not your console</h1><p class="auth-note">' + esc(email) + ' is signed in, but the admin console is for the ClearSky team. <a href="/">Back to the portal</a></p>');
}
function showApp(user){
  $('auth-screen').style.display = 'none'; $('app').style.display = 'block';
  $('tb-name').textContent = user.displayName || user.email;
}
function signOut(){ auth.signOut().then(function(){ location.href = '/'; }); }

/* the price book's words for a package: GET /api/offerings, never a copy (admin-console.js loadPriceBook) */
function loadPriceBook(){
  if (!window.fetch) return;
  fetch('/api/offerings', { cache: 'no-store' }).then(function(r){ return r.ok ? r.json() : null; }).then(function(o){
    if (!o) return; STATE.priceBook = o;
    /* the book's words for the package, wherever the page already drew keys */
    if (LAST && LAST.args) { if (LAST.args[0]) renderTop(LAST.args[0], LAST.args[1]); else render.apply(null, LAST.args); }
  })['catch'](function(){});
}

/* ── the reads: the record, its billing, its people, its projects, who signed in, a signup in progress, every workspace's name ── */
function loadAccount(opts){
  if (!db || !ORG) return;
  var soft = !!(opts && opts.soft);
  var root = db.collection('omega_orgs').doc(ORG);
  Promise.all([
    root.get().then(function(d){ return d.exists ? (d.data() || {}) : null; }),
    root.collection('billing').doc('current').get().then(function(d){ return d.exists ? (d.data() || {}) : {}; })['catch'](function(){ return {}; }),
    root.collection('members').get().then(function(sn){ var out=[]; sn.forEach(function(d){ var m=d.data()||{}; m._id=d.id; out.push(m); }); return out; })['catch'](function(){ return []; }),
    db.collection('projects').where('orgId','==',ORG).get().then(function(sn){ return sn.size; })['catch'](function(){ return null; }),
    db.collection('team_members').where('orgId','==',ORG).get().then(function(sn){ var o=[]; sn.forEach(function(d){ o.push(d.data()||{}); }); return o; })['catch'](function(){ return []; }),
    db.collection('access_requests').where('domain','==',ORG).get().then(function(sn){ var o=[]; sn.forEach(function(d){ var v=d.data()||{}; v._id=d.id; o.push(v); }); return o; })['catch'](function(){ return []; }),
    /* every workspace's name: the relationship picker and the JD label read STATE.tenants as the console fills it */
    db.collection('omega_orgs').get().then(function(sn){ var o=[]; sn.forEach(function(d){ var v=d.data()||{}; o.push({ _id:d.id, name:v.name||d.id, jdPartnerOrg:v.jdPartnerOrg||null }); }); return o; })['catch'](function(){ return []; })
  ]).then(function(r){
    var org=r[0], bill=r[1]||{}, members=r[2], projects=r[3], seen=r[4], reqs=r[5];
    STATE.tenants = r[6];
    /* this account's row as the console's table carries it: tenantAction reads _bill off it */
    var me = STATE.tenants.filter(function(t){ return t._id===ORG; })[0];
    if (org && me) me._bill = bill; else if (org) STATE.tenants.push({ _id: ORG, name: org.name || ORG, _bill: bill });
    render(org, bill, members, projects, seen, reqs, soft);
  })['catch'](function(e){
    $('acct-signup').style.display = 'none';
    $('acct-body').innerHTML = '<div class="empty">Could not read ' + esc(ORG) + ' — ' + esc((e && e.message) || 'denied') + '</div>';
  });
}

/* ── the page ───────────────────────────────────────────────────────────── */
function render(org, bill, members, projects, seen, reqs, soft){
  LAST = { args: [org, bill, members, projects, seen, reqs] };
  var pending = (reqs || []).filter(function(r){ return (r.status || 'pending') === 'pending'; });
  document.title = (org ? (org.name || ORG) : ORG) + ' — ClearSky OMEGA admin';
  $('acct-name').textContent = org ? (org.name || ORG) : ORG;
  $('acct-org').textContent = ORG;
  if (!org){ renderNoRecord(bill, projects, pending, reqs); return; }
  renderTop(org, bill);
  $('acct-signup').style.display = 'none'; $('acct-body').style.display = '';
  if (soft && $('acct-detail').firstChild) return;   /* a save: the form and its message stay as they are */
  $('acct-detail').innerHTML = _tnDetailHtml(ORG, org, bill, members, projects, seen);
  if (org.jdPartner === true){ try { jdShareLoad(ORG, org.jdPartnerOrg || '', org.jdRole || 'design'); } catch(e){} }
  if (window.OmegaPackagePanel && currentUser){ try { OmegaPackagePanel.mount($('package-panel'), ORG, currentUser); } catch(e){} }
}
function renderTop(org, bill){
  var st = org.status || 'active', sd = _standing(bill, org), packaged = bill.packaged === true;
  $('acct-chips').innerHTML = '<span class="chip ' + _tnStatusChip(st) + '">' + esc(st) + '</span> <span class="chip ' + sd.chip + '">' + esc(sd.label) + '</span>'
    + (packaged ? ' <span class="chip neutral">packaged</span>' : '') + (org.vertical ? ' <span class="chip neutral">' + esc(org.vertical) + '</span>' : '');
  $('acct-sub').textContent = [(org.domains || []).join(', '), org.createdAt ? 'since ' + dayOf(org.createdAt) : '', org.signup && org.signup.email ? 'signed up by ' + org.signup.email : ''].filter(Boolean).join(' · ');
  $('acct-tools').innerHTML = toolLinks(org, bill);
  $('acct-status').innerHTML = statusCard(org, bill, st, packaged);
  $('acct-pay').innerHTML = payCard(org, bill, sd, packaged);
}
function toolLinks(org, bill){
  var q = '?org=' + encodeURIComponent(ORG), logic = (bill.addons || []).indexOf('omega-logic') >= 0 || bill.omegaLogic === true || (bill.modules || []).some(function(m){ return /^logic-/.test(String(m)); });
  var links = [['#package-panel', 'Package, price & activation'], ['/admin/tenant.html' + q, 'Systems & customers'], ['/subscription-proposal.html' + q, 'Send a proposal'],
    ['/portals/customer/admin.html' + q, 'Their customers'], ['/whitelabel-setup.html' + q, 'White-label setup'], ['/?wlpreview=' + encodeURIComponent(ORG), 'Preview as this tenant']];
  if (logic) links.splice(1, 0, ['/logic-admin.html' + q, 'Omega Logic subscriber']);
  return links.map(function(l){ return '<a class="btn-ghost" href="' + esc(l[0]) + '">' + esc(l[1]) + '</a>'; }).join(' ');
}
function statusCard(org, bill, st, packaged){
  var h = '<div class="ic-top"><div><div class="ic-name">Account</div><div class="ic-sub">Whether the workspace is switched on, and by whom.</div></div><span class="chip ' + _tnStatusChip(st) + '">' + esc(st) + '</span></div>';
  var rows = [];
  if (org.createdAt) rows.push(['Created', dayOf(org.createdAt) + (org.signup && org.signup.email ? ' by ' + org.signup.email : '')]);
  if (org.approvedAt) rows.push(['Approved', dayOf(org.approvedAt) + (org.approvedBy ? ' by ' + org.approvedBy : '')]);
  if (org.selfServe) rows.push(['Opened by', 'their own payment (self-serve)']);
  if (org.payNowError) rows.push(['Pay now', 'the first invoice could not be issued; the request came to ClearSky instead']);
  if (org.reviewNote) rows.push(['Note', org.reviewNote]);
  if (org.suspendedAt) rows.push(['Suspended', dayOf(org.suspendedAt)]);
  h += kv(rows);
  var acts = [];
  if (st === 'pending') acts.push(packaged
    ? '<button onclick="document.getElementById(&quot;package-panel&quot;).scrollIntoView({behavior:&quot;smooth&quot;})">Review the package to approve</button>'
    : '<button onclick="tenantAction(ORG,&quot;approve&quot;)">Approve</button>');
  if (st === 'suspended' || st === 'cancelled') acts.push('<button onclick="tenantAction(ORG,&quot;reactivate&quot;)">Reactivate</button>');
  else acts.push('<button onclick="tenantAction(ORG,&quot;suspend&quot;)">Suspend</button>');
  if (st !== 'cancelled') acts.push('<button class="danger" onclick="cancelAccount()">Cancel account</button>');
  acts.push('<button onclick="openBroadcast(ORG)">Message them</button>');
  return h + '<div class="ic-actions">' + acts.join('') + '</div><div class="sub-txt" id="acct-status-msg" style="margin-top:8px">' + (st === 'cancelled' ? 'Cancelled: sign-ins keep working, the tools stay locked, the records are kept. Reactivate switches it back on.' : 'Suspend pauses every user at once; Cancel releases the hostname and locks the tools — nothing is deleted.') + '</div>';
}
function kv(rows){
  if (!rows.length) return '';
  return '<div class="ic-body">' + rows.map(function(r){ return '<div class="ic-row"><span class="lbl">' + esc(r[0]) + '</span><span class="val" style="font-family:inherit;text-align:right">' + (r[2] ? r[1] : esc(r[1])) + '</span></div>'; }).join('') + '</div>';
}
function money(n){ return '$' + Number(n || 0).toLocaleString(); }
function payCard(org, bill, sd, packaged){
  var h = '<div class="ic-top"><div><div class="ic-name">Payment</div><div class="ic-sub">' + (packaged ? 'A packaged workspace, judged by its billing state machine.' : 'Billed outside the engine: the terms ClearSky set, editable below.') + '</div></div><span class="chip ' + sd.chip + '">' + esc(sd.label) + '</span></div>';
  var rows = [], onNow = Array.isArray(bill.modules) ? bill.modules : [], bought = _pkgModules(bill);
  if (!bill || !Object.keys(bill).length){ rows.push(['Billing', 'nothing on record yet — not priced']); }
  else if (packaged){
    rows.push(['Plan', _pkgPlanName(bill) + (bill.monthlyDisplay ? ' · ' + bill.monthlyDisplay : '') + (bill.interval ? ' · ' + (bill.interval === 'annual' ? 'yearly, ten months of twelve' : 'monthly') : '')]);
    rows.push(['Package', _pkgModuleNames(bought).join(', ') || '—']);
    /* a negotiated tier price (2026-09-28): what ClearSky set by hand, the list it replaced, who and when; à la carte pays for what it adds and never carries one */
    var po = bill.priceOverride;
    if (po && po.amountCents != null) rows.push(['Negotiated price', money(po.amountCents / 100) + '/month for ' + _pkgPlanName({ plan: po.plan }) + (po.listCents != null ? ' (list ' + money(po.listCents / 100) + ')' : '') + (po.reason ? ' — ' + po.reason : '') + (po.by ? ' · ' + po.by : '') + (po.at ? ' ' + dayOf(po.at) : '')]);
    if (bought.slice().sort().join() !== onNow.slice().sort().join()) rows.push(['On now', _pkgModuleNames(onNow).join(', ') || 'nothing']);
    rows.push(['State', String(bill.packagingState || '—').replace(/_/g, ' ')]);
    if (bill.nextInvoiceOn) rows.push(['Next invoice', bill.nextInvoiceOn]);
    if (bill.paidThrough) rows.push(['Paid through', dayOf(bill.paidThrough)]);
    if (bill.accessUntil) rows.push(['Access until', dayOf(bill.accessUntil)]);
    if (bill.lastPaidAt) rows.push(['Last paid', dayOf(bill.lastPaidAt)]);
    if (Number(bill.amountDue || 0) > 0) rows.push(['Amount due', money(bill.amountDue) + (bill.paymentLink ? ' · <a href="' + esc(bill.paymentLink) + '" target="_blank" rel="noopener">pay link</a>' : ''), true]);
    rows.push(['Billed through', bill.billingProvider || bill.paymentProvider || '—']);
    if (bill.reconcileNote) rows.push(['Review', bill.reconcileNote]);
    if (bill.reconciliationRequired === true) rows.push(['Accounting', 'a reconciliation needs a look (access unchanged)']);
  } else {
    rows.push(['Plan', bill.tier || '—']);
    if ((bill.addons || []).length) rows.push(['Add-ons', bill.addons.join(', ')]);
    if (Array.isArray(bill.toolAccess)) rows.push(['Tools allowed', bill.toolAccess.length + ' (an allowlist)']);
    rows.push(['Amount due', Number(bill.amountDue || 0) > 0 ? money(bill.amountDue) + (bill.paymentLink ? ' · <a href="' + esc(bill.paymentLink) + '" target="_blank" rel="noopener">pay link</a>' : '') : 'nothing', true]);
    if (bill.subscriptionDue) rows.push(['Next payment', dayOf(bill.subscriptionDue)]);
    if (bill.amountPaid != null) rows.push(['Paid to date', money(bill.amountPaid)]);
    if (bill.lastPaidAt) rows.push(['Last payment', dayOf(bill.lastPaidAt)]);
    if (bill.trialEndsAt) rows.push(['Trial ends', dayOf(bill.trialEndsAt)]);
    rows.push(['Provider', (bill.paymentProvider || '—') + (bill.stripeCustomerId ? ' · Stripe ' + bill.stripeCustomerId : '')]);
    if (bill.stripeDueHold) rows.push(['Stripe', 'a payment for an earlier figure holds Pay until the amount due is saved again']);
    if (bill.note) rows.push(['Note', bill.note]);
  }
  h += kv(rows);
  var acts = packaged
    ? '<button onclick="lookAtPayment()">Look at the payment now</button><button onclick="document.getElementById(&quot;package-panel&quot;).scrollIntoView({behavior:&quot;smooth&quot;})">Package, price &amp; activation</button>'
    : '<button onclick="document.getElementById(&quot;acct-detail&quot;).scrollIntoView({behavior:&quot;smooth&quot;})">Edit the terms</button><button onclick="document.getElementById(&quot;package-panel&quot;).scrollIntoView({behavior:&quot;smooth&quot;})">Move to a package</button>';
  return h + '<div class="ic-actions">' + acts + '</div><div class="sub-txt" id="acct-pay-msg" style="margin-top:8px">' + esc(payNote) + '</div>';
}
/* "I've paid" from ClearSky's side: the same look plan-change reconcile-now gives the tenant (throttled to one per eight seconds), then the account is read again */
function lookAtPayment(){
  var m = $('acct-pay-msg'); payNote = ''; if (m) m.textContent = 'Looking at the payment…';
  _authedPost('/api/plan-change', { orgId: ORG, action: 'reconcile-now' }).then(function(r){
    payNote = r.paid ? 'Paid — the package is on.' : r.throttled ? 'Looked a moment ago: not paid yet. Try again in a few seconds.' : r.error ? r.error : 'Not paid yet as far as the provider shows' + (r.packagingState ? ' (' + String(r.packagingState).replace(/_/g, ' ') + ')' : '') + '.';
    loadAccount({ soft: true });
  })['catch'](function(e){ payNote = 'Could not look: ' + ((e && e.message) || e); if (m) m.textContent = payNote; });
}
/* Cancel is tenant-approve's reject: status cancelled, the hostname released, every record kept. There is no delete (omega_orgs is never deleted). */
function cancelAccount(){
  if (!window.confirm('Cancel ' + ORG + '?\n\nEvery sign-in at ' + ORG + ' keeps working but loses the workspace: the tools lock, the status reads cancelled and the reserved hostname is released. Projects, billing history and people are kept — nothing is deleted, and Reactivate switches it back on.')) return;
  var m = $('acct-status-msg'); if (m) m.textContent = 'Cancelling…';
  _authedPost('/api/tenant-approve', { orgId: ORG, action: 'reject' }).then(function(){ loadAccount(); })
    ['catch'](function(e){ window.alert(typeof OmegaAuthError !== 'undefined' ? OmegaAuthError.opText(e, 'The cancel on ' + ORG) : ((e && e.message) || e)); loadAccount(); });
}

/* ── no tenant record: the signup in progress, or a legacy workspace never seeded ── */
function renderNoRecord(bill, projects, pending, all){
  $('acct-chips').innerHTML = '<span class="chip warn">no workspace record</span>';
  $('acct-sub').textContent = projects ? projects + ' project' + (projects === 1 ? '' : 's') + ' under this domain (a legacy workspace that was never seeded)' : 'No workspace for this domain yet';
  $('acct-tools').innerHTML = ''; $('acct-body').style.display = 'none';
  var box = $('acct-signup'); box.style.display = '';
  if (!pending.length){
    var past = (all || []).filter(function(r){ return (r.status || 'pending') !== 'pending'; });
    box.innerHTML = '<div class="ic-top"><div><div class="ic-name">Nothing to manage yet</div><div class="ic-sub">' + esc(ORG) + ' has no tenant record' + (past.length ? '; its last request was ' + esc(past[0].status) + (past[0].orgId ? ' (' + esc(past[0].orgId) + ')' : '') : ' and nobody from it is signing up') + '.</div></div></div>'
      + '<div class="ic-actions"><a class="btn-ghost" href="/admin/#tenants">New tenant in the console</a></div>';
    return;
  }
  box.innerHTML = pending.map(function(r){
    var signup = _isSignup(r), who = r.email || (r.source === 'clearsky' ? 'queued by ' + (r.requestedBy || 'ClearSky') : '');
    return '<div class="ic-top"><div><div class="ic-name">' + esc(r.company || who || ORG) + '</div>'
      + '<div class="ic-sub">' + esc(who) + (r.vertical ? ' · ' + esc(r.vertical) : '') + (r.createdAt ? ' · since ' + esc(dayOf(r.createdAt)) : '') + '</div>'
      + (signup ? '<div class="sub-txt" style="margin-top:6px">' + esc(_reqSignupLine(r, _pkgModuleNames)) + '</div>' : '')
      + (r.note ? '<div class="sub-txt" style="margin-top:6px">“' + esc(r.note) + '”</div>' : '')
      + '</div><span class="chip warn">' + (signup ? 'in signup' : 'requested') + '</span></div>'
      + '<div class="ic-actions"><a class="btn-ghost" href="/admin/?setup=' + encodeURIComponent(r._id) + '#tenants">Set up the workspace</a>'
      + '<button class="danger" onclick="declineRequest(&quot;' + esc(r._id) + '&quot;)">Decline</button><span class="sub-txt" id="req-msg-' + esc(r._id) + '"></span></div>'
      + (signup ? '<div class="sub-txt" style="margin-top:8px">They are building their own workspace on /start: the system they choose is priced by the server as they go, and their first invoice by card opens it. Set it up by hand only if they ask.</div>' : '');
  }).join('<hr style="border:0;border-top:1px solid var(--cs-border);margin:14px 0">');
}
function declineRequest(id){
  if (!window.confirm('Decline the request ' + id + ' for ' + ORG + '?\n\nTheir sign-in keeps working; they simply never get a workspace.')) return;
  var m = $('req-msg-' + id); if (m) m.textContent = 'Declining…';
  db.collection('access_requests').doc(id).update({ status: 'declined', decidedBy: (currentUser && currentUser.email) || 'console', decidedAt: firebase.firestore.FieldValue.serverTimestamp() })
    .then(loadAccount)['catch'](function(e){ if (m) m.textContent = 'Failed — ' + ((e && e.message) || e); });
}

/* ══════════ BOOT ══════════ */
if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', _initFirebase); }
else { _initFirebase(); }
