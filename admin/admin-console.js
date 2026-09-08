/* ══════════════════════════════════════════════════════════════════════
   CLEARSKY-OMEGA · ADMIN CONSOLE
   ----------------------------------------------------------------------
   The ADMIN repository. One internal source of truth for:
     • Client inventory / repo registry (tier 1 Standard, 2 Deluxe, 3 Enterprise)
     • Deployment status board (is anyone down?)
     • Infrastructure ecosystems (catalogs, offerings, partners, finance deals)
     • Partnership agreements (data / engineering / tasks / tooling / capital…)
     • Internal CRM (clients, status reports, tasks, notes)

   ARCHITECTURE (locked project conventions):
     • ES5 only — no arrow fns, template literals, let/const, optional chaining.
     • Single-page, no build step. Firebase compat v9 SDK from gstatic CDN.
     • All admin data lives under Firestore collection 'admin' (this repo's org).
     • Access is gated to internal ClearSky domains (see ADMIN_DOMAINS).
     • Everything degrades to SEED data if Firestore is empty/unavailable, so
       the console is usable the moment it deploys — then persists as you edit.
   ══════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════
   ACCESS REGISTRY  —  WHO CAN OPEN THE CONSOLE, AND AS WHAT
   ----------------------------------------------------------------------
   Map an email DOMAIN to a role. To onboard a collaborator partner, add ONE
   line with their domain. No forking, no redeploy per partner.

   ROLES:
     • 'admin'         — you & the ClearSky team. Full console.
     • 'collaborator'  — trusted partners who use the tools AND help improve
                         them. Per your setup they get FULL admin visibility
                         (all tabs), but their role is recorded so every bug/
                         request/note they file is attributed to them, and so
                         you can downgrade or revoke a single partner later by
                         editing this one map.

   Anyone whose domain is NOT listed here is denied at sign-in.
   ══════════════════════════════════════════════════════════════════════ */
/* NAMED PEOPLE, NOT A DOMAIN. This console can price tenants, change roles,
   suspend accounts and mint password-reset links, so "anyone at the company"
   is the wrong unit. Two addresses hold it.

   isAdmin() in firestore.rules is still domain-wide (clearsky-usa.com OR
   csebuilders.com) and that is what actually enforces every write. This list
   decides who is shown the console, not what the rules permit — narrowing the
   rules is a separate, larger change, because isAdmin() also gates
   omega_contracts, equipment deletes, tenant billing and the org registry. */
var ADMIN_EMAILS = ['tom@clearsky-usa.com', 'dev@clearsky-usa.com'];

function domainOf(email){ return (email || '').split('@')[1] ? email.split('@')[1].toLowerCase() : ''; }
function accessFor(email){
  var e = String(email || '').toLowerCase().trim();
  return ADMIN_EMAILS.indexOf(e) >= 0 ? { role:'admin', label:'ClearSky' } : null;
}
function isAllowed(email){ return !!accessFor(email); }

/* Current signed-in identity's role/label (set at auth). */
var currentRole = null, currentLabel = null;

/* ══════════ FIREBASE INIT ══════════ */
var CFG, auth, db, currentUser = null, currentOrg = null;

function _initFirebase(){
  if (typeof firebase === 'undefined' || !window.CLEARSKY_CONFIG){ setTimeout(_initFirebase, 120); return; }
  CFG = window.CLEARSKY_CONFIG;
  try { firebase.initializeApp(CFG.firebase); }
  catch(e){ if(!/already exists/.test(e.message)) console.error('Firebase init:', e); }
  auth = firebase.auth();
  db = firebase.firestore();
  _wireAuth();
}

var justSignedIn = false;

function _wireAuth(){
  auth.onAuthStateChanged(function(user){
    if (user){
      var email = user.email || '';
      var access = accessFor(email);
      if (!access){
        /* ⚠ NEVER auth.signOut() HERE. This page shares an origin and a
           Firebase app with the portal, so signing out of the console signs
           the person out of their whole workspace — for the offence of
           opening a URL they were not entitled to. Show the wall, leave the
           session alone. */
        showNotAuthorised(email);
        return;
      }
      currentUser = user;
      currentOrg = 'admin';
      currentRole = access.role;
      currentLabel = access.label;
      showApp(user);
      bootData();
    } else {
      /* No second login form. The console is served from the same origin as
         the portal and shares its auth session, so a sign-in here would be a
         second set of credentials for an account that already exists. Send
         them to the portal to sign in once, and come back. */
      sendToPortal();
    }
  });
}

function sendToPortal(){
  var scr = document.getElementById('auth-screen');
  var app = document.getElementById('app');
  if (app) app.style.display = 'none';
  if (!scr) { location.href = '/'; return; }
  scr.style.display = 'flex';
  scr.innerHTML =
      '<div class="auth-card" style="text-align:center">'
    +   '<h1 style="margin:0 0 6px;font-size:20px">Sign in on the portal</h1>'
    +   '<p class="auth-note" style="margin:0 0 18px">The Admin Console uses your ClearSky-OMEGA session. '
    +     'Sign in once on the portal and come straight back.</p>'
    +   '<a class="btn-google" style="display:inline-block;text-decoration:none;padding:11px 20px" href="/">Go to the portal</a>'
    + '</div>';
  /* Bounce automatically if they arrived here cold — a wall with a button is
     for the case where they DID have a session and it lapsed mid-visit. */
  setTimeout(function(){ if (!auth.currentUser) location.href = '/'; }, 2500);
}

function showNotAuthorised(email){
  var scr = document.getElementById('auth-screen');
  var app = document.getElementById('app');
  if (app) app.style.display = 'none';
  if (!scr) return;
  scr.style.display = 'flex';
  scr.innerHTML =
      '<div class="auth-card" style="text-align:center">'
    +   '<h1 style="margin:0 0 6px;font-size:20px">Not your console</h1>'
    +   '<p class="auth-note" style="margin:0 0 18px">' + esc(email) + ' is signed in, but the Admin Console '
    +     'is limited to named ClearSky administrators. You are still signed in to your workspace.</p>'
    +   '<a class="btn-google" style="display:inline-block;text-decoration:none;padding:11px 20px" href="/">Back to my portal</a>'
    + '</div>';
}

function showApp(user){
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  var first = (user.displayName || user.email || 'there').split(' ')[0];
  document.getElementById('welcome-name').textContent = 'Welcome back, ' + first;
  document.getElementById('tb-name').textContent = user.displayName || user.email;
  var chip = document.getElementById('tb-admin-chip');
  if (chip){
    if (currentRole === 'collaborator'){ chip.textContent = 'Collaborator'; chip.title = currentLabel || ''; }
    else { chip.textContent = 'Internal'; }
  }
  var wrap = document.getElementById('tb-avatar-wrap');
  if (user.photoURL){
    wrap.innerHTML = '<img class="tb-avatar" src="' + user.photoURL + '" onerror="this.style.display=&quot;none&quot;">';
  } else {
    wrap.innerHTML = '<div class="tb-avatar-fallback">' + first.charAt(0).toUpperCase() + '</div>';
  }
  var impBtn = document.getElementById('apps-import-btn');
  if (impBtn) impBtn.style.display = (currentRole === 'admin') ? '' : 'none';
}

/* ══════════ GOOGLE / EMAIL AUTH (same pattern as portal) ══════════ */
function signInWithGoogle(){
  var provider = new firebase.auth.GoogleAuthProvider();
  if (CFG.allowedDomain && CFG.allowedDomain.length) provider.setCustomParameters({ hd: CFG.allowedDomain });
  var btn = document.getElementById('google-signin-btn');
  btn.disabled = true; btn.textContent = 'Signing in…';
  justSignedIn = true;
  auth.signInWithPopup(provider).then(function(cred){
    // Pre-check the resolved Google identity's domain BEFORE it becomes a
    // lingering auth session. Without this, any Google account can create an
    // orphaned Firebase auth user even though onAuthStateChanged will reject
    // it a moment later. Sign out immediately if the domain isn't provisioned.
    var email = (cred && cred.user && cred.user.email) || '';
    if (!isAllowed(email)){
      auth.signOut();
      justSignedIn = false;
      showAuthErr('No access is provisioned for ' + (domainOf(email)||'this domain') + '. Contact ClearSky to be added.');
      btn.disabled = false;
      btn.textContent = 'Sign in with Google';
    }
  })['catch'](function(err){
    justSignedIn = false;
    showAuthErr(err.message);
    btn.disabled = false;
    btn.textContent = 'Sign in with Google';
  });
}
function signOut(){ auth.signOut(); }

var authMode = 'signin';
function toggleAuthMode(){
  authMode = (authMode === 'signin') ? 'signup' : 'signin';
  var s = authMode === 'signup';
  document.getElementById('auth-name-wrap').style.display = s ? 'block' : 'none';
  document.getElementById('email-auth-btn').textContent = s ? 'Create account' : 'Sign in';
  document.getElementById('auth-toggle-wrap').innerHTML = s
    ? 'Already have an account? <a onclick="toggleAuthMode()">Sign in</a>'
    : 'New team member? <a onclick="toggleAuthMode()">Create an account</a>';
  clearAuthMsg();
}
function emailAuth(){
  clearAuthMsg();
  var email = document.getElementById('auth-email').value.trim();
  var pass = document.getElementById('auth-pass').value;
  if (!email || !pass){ showAuthErr('Enter your email and password.'); return; }
  if (!isAllowed(email)){ showAuthErr('No access is provisioned for this domain. Contact ClearSky to be added.'); return; }
  var btn = document.getElementById('email-auth-btn');
  btn.disabled = true; btn.textContent = (authMode==='signup') ? 'Creating…' : 'Signing in…';
  justSignedIn = true;
  if (authMode === 'signup'){
    var name = document.getElementById('auth-name').value.trim();
    auth.createUserWithEmailAndPassword(email, pass).then(function(cred){
      if (name && cred.user) return cred.user.updateProfile({ displayName: name });
    })['catch'](function(err){ justSignedIn=false; showAuthErr(friendlyErr(err)); resetEmailBtn(); });
  } else {
    auth.signInWithEmailAndPassword(email, pass)['catch'](function(err){ justSignedIn=false; showAuthErr(friendlyErr(err)); resetEmailBtn(); });
  }
}
function resetEmailBtn(){ var b=document.getElementById('email-auth-btn'); b.disabled=false; b.textContent=(authMode==='signup')?'Create account':'Sign in'; }
function friendlyErr(err){
  var m = (err && err.code) || '';
  if (m==='auth/email-already-in-use') return 'That email already has an account — try signing in.';
  if (m==='auth/wrong-password' || m==='auth/invalid-credential') return 'Incorrect email or password.';
  if (m==='auth/user-not-found') return 'No account found — try creating one.';
  if (m==='auth/weak-password') return 'Password should be at least 6 characters.';
  return (err && err.message) || 'Something went wrong. Try again.';
}
function showAuthErr(msg){ var e=document.getElementById('auth-err'); e.textContent=msg; e.style.display='block'; var o=document.getElementById('auth-ok'); if(o) o.style.display='none'; }
function clearAuthMsg(){ var e=document.getElementById('auth-err'); if(e) e.style.display='none'; var o=document.getElementById('auth-ok'); if(o) o.style.display='none'; }

/* ══════════════════════════════════════════════════════════════════════
   IN-MEMORY STATE  (hydrated from Firestore; seeded if empty)
   ══════════════════════════════════════════════════════════════════════ */
var STATE = { clients: [], partners: [], offerings: [], logs: {}, improvements: [] };
var LIVE = false; // becomes true once Firestore load succeeds

/* ── Seed data: realistic starting point drawn from the current book of business.
      Edit freely, or just add/delete rows in the UI once live. ── */
var SEED_CLIENTS = [
  { id:'c-nextnrg', name:'NextNRG', tier:'tier3', type:'developer', domain:'nextnrg.com', owner:'Tommy',
    repo:'clearsky-nextnrg', url:'https://nextnrg.csebuilders.com', status:'up', progress:100,
    health:'good', next:'Ship Monday.com write-back to editor', soldBy:'Amperage Capital', uptime:99.9, updatedAt:Date.now()-3600000 },
  { id:'c-spatco', name:'SPATCO', tier:'tier2', type:'developer', domain:'spatco.com', owner:'Tommy',
    repo:'clearsky-spatco', url:'https://spatco.csebuilders.com', status:'up', progress:92,
    health:'good', next:'Finalize fuel/EV tool theming', soldBy:'Direct / ClearSky', uptime:99.7, updatedAt:Date.now()-7200000 },
  { id:'c-lionheart', name:'Lionheart Energy', tier:'tier2', type:'developer', domain:'lionheartenergy.com', owner:'Tommy',
    repo:'clearsky-lionheart', url:'https://lionheart.csebuilders.com', status:'building', progress:70,
    health:'watch', next:'National Grid Make-Ready automation QA', soldBy:'SPATCO', uptime:0, updatedAt:Date.now()-1800000 },
  { id:'c-clearsky', name:'ClearSky (internal)', tier:'internal', type:'internal', domain:'csebuilders.com', owner:'Tommy',
    repo:'clearsky-omega', url:'https://app.csebuilders.com', status:'up', progress:100,
    health:'good', next:'Editor v35 — layer manager polish', uptime:99.9, updatedAt:Date.now()-600000 },
  { id:'c-amperage', name:'Amperage Capital', tier:'partner', type:'partner', domain:'amperagecapital.com', owner:'Tommy',
    repo:'clearsky-financing-portal', url:'https://partner.csebuilders.com', status:'up', progress:100,
    health:'good', next:'Onboard 2nd developer org to deal room', uptime:99.8, updatedAt:Date.now()-5400000 },
  { id:'c-csc', name:'Community Storage Coalition', tier:'tier1', type:'developer', domain:'communitystorage.coalition', owner:'Tommy',
    repo:'clearsky-ahj-portal', url:'https://portal.communitystorage.coalition', status:'degraded', progress:88,
    health:'watch', next:'AHJ submission rollup showing stale metrics', soldBy:'Molecule Systems', uptime:98.4, updatedAt:Date.now()-900000 }
];

var SEED_PARTNERS = [
  { id:'p-amperage', name:'Amperage Capital', cat:'financing', status:'signed', contact:'—', eco:'financing', notes:'Anchor capital partner on the Financing Partners Portal deal room.' },
  { id:'p-voltus', name:'Voltus', cat:'aggregator', status:'signed', contact:'—', eco:'aggregators', notes:'VPP / DR dispatch enrollment across the portfolio.' },
  { id:'p-cpower', name:'CPower', cat:'aggregator', status:'signed', contact:'—', eco:'aggregators', notes:'Demand-response market access.' },
  { id:'p-molecule', name:'Molecule Systems', cat:'tooling', status:'signed', contact:'—', eco:'', notes:'VPP software stack integration.' },
  { id:'p-lightsmith', name:'Lightsmith Energy', cat:'tooling', status:'signed', contact:'—', eco:'', notes:'Dispatch optimization layer.' },
  { id:'p-gotion', name:'Gotion', cat:'supply', status:'signed', contact:'—', eco:'procurement', notes:'BESS hardware supply for apartment-grid model.' },
  { id:'p-autel', name:'Autel', cat:'supply', status:'signed', contact:'—', eco:'procurement', notes:'EV charging hardware.' },
  { id:'p-rexel', name:'Rexel Energy Solutions', cat:'supply', status:'signed', contact:'—', eco:'procurement', notes:'Electrical distribution & equipment.' },
  { id:'p-ces', name:'City Electric Supply', cat:'supply', status:'signed', contact:'—', eco:'procurement', notes:'Equipment supply channel.' }
];

var SEED_OFFERINGS = [
  { id:'o-claremont', eco:'financing', kind:'deal', title:'Claremont 5 MWh — Debt/Tax-Equity Package', status:'pending', value:'$3.2M', party:'Amperage Capital', detail:'Investor-facing model: debt/equity allocation, EBITDA waterfall, ITC & depreciation, per-component ITC %.' },
  { id:'o-besh', eco:'financing', kind:'offering', title:'ComEd BESH Rebate Structuring', status:'active', value:'$250/kWh', party:'ComEd', detail:'Rebate capture built into pro forma for IL projects.' },
  { id:'o-gotion', eco:'procurement', kind:'offering', title:'Gotion BESS — Bankable Product Line', status:'active', value:'market', party:'Gotion', detail:'Catalog entry for apartment-grid deployments.' },
  { id:'o-voltus', eco:'aggregators', kind:'partner', title:'Voltus VPP Dispatch', status:'active', value:'rev-share', party:'Voltus', detail:'Enrollment pathway for portfolio sites.' },
  { id:'o-armada', eco:'offtakers', kind:'offering', title:'Armada Edge Compute Offtake', status:'draft', value:'TBD', party:'Armada', detail:'Behind-the-meter compute load for stacked revenue.' }
];

var SEED_LOGS = {
  'c-nextnrg': [
    { id:'l1', kind:'status', text:'Monday.com write-back integration in editor — 80% complete, QA next.', done:false, at:Date.now()-86400000 },
    { id:'l2', kind:'task', text:'Deliver investor tools for Paige Blumer: debt/equity, EBITDA waterfall, ITC/depreciation.', done:false, at:Date.now()-172800000 },
    { id:'l3', kind:'note', text:'Enterprise tier — founding-customer rate. 24/7 support included.', done:false, at:Date.now()-604800000 }
  ],
  'c-csc': [
    { id:'l4', kind:'task', text:'Fix dashboard metric rollup — AHJ submissions showing stale counts.', done:false, at:Date.now()-3600000 }
  ]
};

var SEED_IMPROVEMENTS = [
  { id:'i-1', title:'Pro Forma IRR drifts when debt set to 0%', tool:'BESS Pro Forma', type:'bug', priority:'p2', status:'open',
    reporter:'Tommy', reporterEmail:'tommy@csebuilders.com', assignee:'dev', detail:'With 100% equity the IRR row shows NaN on step 6.', at:Date.now()-172800000, comments:[] },
  { id:'i-2', title:'Add per-component ITC % to Site Investment Analysis', tool:'Site Investment Analysis', type:'feature', priority:'p1', status:'progress',
    reporter:'Tommy', reporterEmail:'tommy@csebuilders.com', assignee:'Tommy', detail:'Paige (NextNRG) needs per-component ITC breakdown in the investor view.', at:Date.now()-86400000, comments:[] },
  { id:'i-3', title:'Editor layer panel — allow rename on double-click', tool:'Editor / SiteMap Designer', type:'improve', priority:'p3', status:'shipped',
    reporter:'Tommy', reporterEmail:'tommy@csebuilders.com', assignee:'Tommy', detail:'AutoCAD-style rename UX.', at:Date.now()-604800000, comments:[] }
];


/* ══════════════════════════════════════════════════════════════════════
   BOOT + DATA LOAD
   ══════════════════════════════════════════════════════════════════════ */
function bootData(){
  renderTabs();
  loadAll();
}

function loadAll(){
  // Try Firestore; if empty or fails, fall back to seed (and keep working locally).
  if (!db){ hydrateSeed(); renderEverything(); return; }
  var col = db.collection('admin');
  col.doc('clients').get().then(function(doc){
    if (doc.exists && doc.data() && doc.data().items && doc.data().items.length){
      LIVE = true;
      STATE.clients   = doc.data().items;
    } else {
      STATE.clients = SEED_CLIENTS.slice();
    }
    return col.doc('partners').get();
  }).then(function(doc){
    STATE.partners = (doc && doc.exists && doc.data() && doc.data().items) ? doc.data().items : SEED_PARTNERS.slice();
    return col.doc('offerings').get();
  }).then(function(doc){
    STATE.offerings = (doc && doc.exists && doc.data() && doc.data().items) ? doc.data().items : SEED_OFFERINGS.slice();
    return col.doc('logs').get();
  }).then(function(doc){
    STATE.logs = (doc && doc.exists && doc.data() && doc.data().map) ? doc.data().map : cloneLogs(SEED_LOGS);
    return col.doc('improvements').get();
  }).then(function(doc){
    STATE.improvements = (doc && doc.exists && doc.data() && doc.data().items) ? doc.data().items : SEED_IMPROVEMENTS.slice();
    renderEverything();
  })['catch'](function(e){
    console.warn('Firestore load failed — using seed data:', e);
    hydrateSeed();
    renderEverything();
  });
}

function hydrateSeed(){
  STATE.clients = SEED_CLIENTS.slice();
  STATE.partners = SEED_PARTNERS.slice();
  STATE.offerings = SEED_OFFERINGS.slice();
  STATE.logs = cloneLogs(SEED_LOGS);
  STATE.improvements = SEED_IMPROVEMENTS.slice();
}
function cloneLogs(src){ return JSON.parse(JSON.stringify(src)); }

/* Persist a single collection doc back to Firestore (best-effort). */
function persist(key){
  if (!db || !currentUser) return;
  var payload;
  if (key === 'logs') payload = { map: STATE.logs };
  else payload = { items: STATE[key] };  db.collection('admin').doc(key).set(payload)['catch'](function(e){ console.warn('Persist ' + key + ' failed:', e); });
}

/* ══════════════════════════════════════════════════════════════════════
   TABS
   ══════════════════════════════════════════════════════════════════════ */
var TABS = [
  { id:'overview',  label:'Overview',       icon:'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z' },
  { id:'clients',   label:'Client Inventory', icon:'M4 6h16M4 12h16M4 18h16', cnt:function(){return STATE.clients.length;} },
  { id:'status',    label:'Status Board',   icon:'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM9 12l2 2 4-4' },
  { id:'infra',     label:'Infrastructure', icon:'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z' },
  { id:'partners',  label:'Partnerships',   icon:'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75', cnt:function(){return STATE.partners.length;} },
  { id:'crm',       label:'Internal CRM',   icon:'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8', cnt:function(){return STATE.clients.length;} },
  { id:'tenants',   label:'Tenants & Users', icon:'M3 21V7l9-4 9 4v14M9 21v-6h6v6M7 11h.01M12 11h.01M17 11h.01', cnt:function(){return STATE.tenants?STATE.tenants.length:0;} },
  { id:'apps',      label:'Applications',   icon:'M13 2L3 14h9l-1 8 10-12h-9l1-8z' },
  { id:'improve',   label:'Tool Improvement', icon:'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.1 2.1-2-2 2.1-2.1z', cnt:function(){return STATE.improvements.length;} }
];
var activeTab = 'overview';

function renderTabs(){
  var html = '';
  for (var i=0;i<TABS.length;i++){
    var t = TABS[i];
    var cnt = t.cnt ? '<span class="tab-cnt">' + t.cnt() + '</span>' : '';
    html += '<button class="tab-btn' + (t.id===activeTab?' on':'') + '" onclick="switchTab(&quot;' + t.id + '&quot;)">'
          + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="' + t.icon + '"/></svg>'
          + t.label + cnt + '</button>';
  }
  document.getElementById('tab-nav').innerHTML = html;
}

function switchTab(id){
  activeTab = id;
  var panels = document.querySelectorAll('.tab-panel');
  for (var i=0;i<panels.length;i++) panels[i].className = 'tab-panel';
  document.getElementById('tab-' + id).className = 'tab-panel on';
  renderTabs();
  window.scrollTo(0,0);
  if (id === 'apps') loadRecentProjects();
}

/* ══════════════════════════════════════════════════════════════════════
   RENDER ALL
   ══════════════════════════════════════════════════════════════════════ */
function renderEverything(){
  renderTabs();
  renderOverview();
  renderClients();
  renderStatus();
  renderInfra();
  renderPartners();
  renderCrm();
  renderApps();
  renderImprove();
  /* Reads Firestore rather than STATE, so it is fired once here and refreshed
     by its own button — not on every re-render, which would put a collection
     read behind every unrelated edit on this page. */
  loadTenants();
  renderQuickBooks();
}

/* ── helpers ── */
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function tierLabel(t){ return {tier1:'Core',tier2:'Performance',tier3:'Enterprise',internal:'Internal',partner:'Partner'}[t] || t; }
function tierShort(t){ return {tier1:'Core',tier2:'Performance',tier3:'Enterprise',internal:'Internal',partner:'Partner'}[t] || t; }
function statusLabel(s){ return {up:'Up',building:'Building',degraded:'Degraded',down:'Down',paused:'Paused'}[s] || s; }
function timeAgo(ts){
  if (!ts) return '—';
  var d = Math.floor((Date.now()-ts)/1000);
  if (d<60) return 'just now';
  if (d<3600) return Math.floor(d/60)+'m ago';
  if (d<86400) return Math.floor(d/3600)+'h ago';
  return Math.floor(d/86400)+'d ago';
}
function openTasks(cid){
  var arr = STATE.logs[cid] || [];
  var n = 0; for (var i=0;i<arr.length;i++){ if (arr[i].kind==='task' && !arr[i].done) n++; }
  return n;
}
function lastStatus(cid){
  var arr = STATE.logs[cid] || [];
  for (var i=arr.length-1;i>=0;i--){ if (arr[i].kind==='status') return arr[i]; }
  return null;
}

/* ── OVERVIEW · partner & client performance ── */
function renderOverview(){
  var c = STATE.clients;

  // deployment health
  var up=0, down=0, degraded=0, building=0;
  for (var i=0;i<c.length;i++){
    var s=c[i].status;
    if (s==='up') up++; else if (s==='down') down++; else if (s==='degraded') degraded++; else if (s==='building') building++;
  }

  // billable clients = anything not internal (sold to a customer)
  var billable = [];
  for (var b=0;b<c.length;b++){ if (c[b].tier!=='internal') billable.push(c[b]); }
  // onboarded = live billable client
  var onboarded = 0; for (var o=0;o<billable.length;o++){ if (billable[o].status==='up') onboarded++; }

  // tasks (from logs)
  var totalTasks=0; for (var k in STATE.logs){ if(STATE.logs.hasOwnProperty(k)) totalTasks+=openTasks(k); }

  // ops from improvements
  var imp = STATE.improvements||[];
  var doneT=0, openErr=0;
  for (var q=0;q<imp.length;q++){
    var it=imp[q], st=(it.status||'').toLowerCase();
    if (st==='shipped') doneT++;
    var openIt = (st!=='shipped' && st!=='wontfix');
    if (openIt && ((it.type||'').toLowerCase()==='bug' || (it.priority||'').toLowerCase()==='p1')) openErr++;
  }

  // ── HERO KPIs (partner-centric) ──
  var kpis = [
    { l:'Active Partners', v:STATE.partners.length, cls:'blue', foot:'selling &amp; delivery channels' },
    { l:'Clients Sold', v:billable.length, cls:'', foot:up+' live · '+building+' in build' },
    { l:'Clients Onboarded', v:onboarded, cls:'green', foot:pctStr(onboarded,billable.length)+' of sold now live' },
    { l:'Open Tasks', v:totalTasks, cls:'purple', foot:doneT+' shipped · '+openErr+' open error(s)' }
  ];
  document.getElementById('ov-kpi-grid').innerHTML = kpiHtml(kpis);

  // ── CLIENTS BY TIER (Core / Performance / Enterprise) ──
  var t1=0,t2=0,t3=0;
  for (var j=0;j<c.length;j++){ var tt=c[j].tier; if(tt==='tier1')t1++; else if(tt==='tier2')t2++; else if(tt==='tier3')t3++; }
  document.getElementById('ov-tier-grid').innerHTML =
      tierCardHtml('total','Total Onboarded', (t1+t2+t3), 'across all plans', {c:t1,p:t2,e:t3})
    + tierCardHtml('core','Core',          t1, acctStr(t1))
    + tierCardHtml('perf','Performance',   t2, acctStr(t2))
    + tierCardHtml('ent','Enterprise',     t3, acctStr(t3));

  // ── OPS STRIP ──
  var os=document.getElementById('ov-ops-strip');
  if (os){
    os.innerHTML =
        opsHtml('blue', OV_IC.tasks, totalTasks, 'Open Tasks')
      + opsHtml('green',OV_IC.done,  doneT,      'Completed')
      + opsHtml('red',  OV_IC.err,   openErr,    'Open Errors / P1')
      + opsHtml('amber',OV_IC.live,  up,         'Portals Live');
  }

  // ── PARTNER LEADERBOARD ──
  var lb=document.getElementById('ov-leaderboard');
  if (lb){
    var byP={};
    for (var p=0;p<billable.length;p++){
      var cl=billable[p];
      var who=(cl.soldBy&&cl.soldBy.trim())?cl.soldBy.trim():'Direct / ClearSky';
      if(!byP[who]) byP[who]={name:who,count:0,open:0,mix:{tier1:0,tier2:0,tier3:0}};
      byP[who].count++;
      if(byP[who].mix[cl.tier]!==undefined) byP[who].mix[cl.tier]++;
      byP[who].open += openTasks(cl.id);
    }
    var rows=[]; for(var key in byP){ if(byP.hasOwnProperty(key)) rows.push(byP[key]); }
    rows.sort(function(a,b){ return b.count-a.count || b.open-a.open; });
    var max=1; for(var r=0;r<rows.length;r++){ if(rows[r].count>max) max=rows[r].count; }

    var html='<div class="pl-row head"><div>Partner / Channel</div><div>Clients</div><div class="pl-hide">Tier mix</div><div>Open tasks</div></div>';
    if(!rows.length){
      html+='<div class="pl-row"><div class="pl-name">No clients sold yet</div><div class="pl-num">0</div><div class="pl-hide"></div><div class="pl-num">0</div></div>';
    } else {
      for(var rr=0;rr<rows.length;rr++){
        var row=rows[rr], seg='';
        var segMap=[['tier1','core'],['tier2','perf'],['tier3','ent']];
        for(var sm=0;sm<segMap.length;sm++){
          var cnt=row.mix[segMap[sm][0]];
          if(cnt) seg+='<span class="pl-seg '+segMap[sm][1]+'" style="width:'+(cnt*10+8)+'px" title="'+cnt+'"></span>';
        }
        html+='<div class="pl-row">'
          + '<div class="pl-name"><span class="pl-rank'+(rr===0?' g1':'')+'">'+(rr+1)+'</span>'+esc(row.name)+'</div>'
          + '<div><div class="pl-num" style="margin-bottom:5px">'+row.count+'</div><div class="pl-bar"><i style="width:'+Math.round(row.count/max*100)+'%"></i></div></div>'
          + '<div class="pl-hide"><div class="pl-tiermix">'+(seg||'<span style="color:var(--cs-sub);font-size:11px">—</span>')+'</div></div>'
          + '<div class="pl-num">'+row.open+'</div>'
        + '</div>';
      }
    }
    lb.innerHTML=html;
  }

  // ── NEEDS ATTENTION ──
  var att = [];
  for (var m=0;m<c.length;m++){
    var x=c[m];
    if (x.status==='down' || x.status==='degraded' || openTasks(x.id)>0){ att.push(x); }
  }
  var el = document.getElementById('ov-attention');
  if (!att.length){ el.innerHTML = '<div class="empty">All systems healthy and no overdue tasks. 🎉</div>'; return; }
  var arows='';
  for (var n=0;n<att.length;n++){
    var a=att[n];
    var reason = (a.status==='down')?'Portal is DOWN' : (a.status==='degraded')?'Degraded performance' : (openTasks(a.id)+' open task(s)');
    arows += '<tr class="clickable" onclick="openClient(&quot;'+a.id+'&quot;)">'
      + '<td class="site-nm">'+esc(a.name)+'</td>'
      + '<td>'+statusDot(a.status)+'</td>'
      + '<td class="sub-txt">'+esc(reason)+'</td>'
      + '<td class="sub-txt">'+esc(a.next||'—')+'</td></tr>';
  }
  el.innerHTML = '<div class="table-wrap"><table class="ptable"><thead><tr><th>Client</th><th>Status</th><th>Why</th><th>Next Action</th></tr></thead><tbody>'+arows+'</tbody></table></div>';
}

/* overview render helpers */
function pctStr(a,b){ return (b?Math.round(a/b*100):0)+'%'; }
function acctStr(n){ return n===1?'1 account':n+' accounts'; }
var OV_IC={
  tasks:'<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  done:'<polyline points="20 6 9 17 4 12"/>',
  err:'<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  live:'<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>'
};
function ovIco(p){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+p+'</svg>'; }
function opsHtml(cls,icon,val,label){
  return '<div class="ops-card"><div class="ops-ico '+cls+'">'+ovIco(icon)+'</div>'
    + '<div><div class="ops-val">'+val+'</div><div class="ops-lbl">'+esc(label)+'</div></div></div>';
}
function tierCardHtml(cls,name,val,foot,mix){
  var split='';
  if(cls==='total'&&mix){
    split='<div class="tier-split">'
      + '<div>Core<b>'+mix.c+'</b></div>'
      + '<div>Performance<b>'+mix.p+'</b></div>'
      + '<div>Enterprise<b>'+mix.e+'</b></div></div>';
  }
  return '<div class="tier-card '+cls+'"><div class="tier-top"><span class="tier-name">'+esc(name)+'</span><span class="tier-dot"></span></div>'
    + '<div class="tier-val">'+val+'</div><div class="tier-foot">'+esc(foot)+'</div>'+split+'</div>';
}
function kpiHtml(cards){
  var h='';
  for (var i=0;i<cards.length;i++){
    var c=cards[i];
    h += '<div class="kpi '+(c.cls||'')+'"><div class="kpi-label">'+c.l+'</div>'
       + '<div class="kpi-val">'+c.v+'</div>'
       + '<div class="kpi-foot">'+(c.foot||'')+'</div></div>';
  }
  return h;
}
function statusDot(s){ return '<span class="sdot '+s+'"><i></i>'+statusLabel(s)+'</span>'; }

/* ── CLIENT INVENTORY ── */
var clFilter = 'all';
function renderClients(){
  document.getElementById('cl-count').textContent = STATE.clients.length;
  var filters = [['all','All'],['tier1','Core'],['tier2','Performance'],['tier3','Enterprise'],['internal','Internal'],['partner','Partner']];
  var fh='';
  for (var i=0;i<filters.length;i++){ fh += '<button class="fpill'+(clFilter===filters[i][0]?' on':'')+'" onclick="setClFilter(&quot;'+filters[i][0]+'&quot;)">'+filters[i][1]+'</button>'; }
  document.getElementById('cl-filters').innerHTML = fh;

  var rows='';
  for (var j=0;j<STATE.clients.length;j++){
    var c=STATE.clients[j];
    if (clFilter!=='all' && c.tier!==clFilter) continue;
    var pg = Math.max(0,Math.min(100, c.progress||0));
    var pcls = c.status==='up'?'green':(c.status==='building'?'blue':'');
    rows += '<tr class="clickable" onclick="openClient(&quot;'+c.id+'&quot;)">'
      + '<td class="site-nm">'+esc(c.name)+'<div class="sub-txt">'+esc(c.domain||'')+'</div></td>'
      + '<td><span class="chip '+c.tier+'">'+tierShort(c.tier)+'</span></td>'
      + '<td class="mono sub-txt">'+esc(c.repo||'—')+'</td>'
      + '<td>'+(c.url?'<a href="'+esc(c.url)+'" target="_blank" rel="noopener" class="sub-txt" style="color:var(--cs-sky)" onclick="event.stopPropagation()">'+esc(shortUrl(c.url))+'</a>':'<span class="sub-txt">—</span>')+'</td>'
      + '<td>'+statusDot(c.status)+'</td>'
      + '<td><div class="pbar '+pcls+'"><i style="width:'+pg+'%"></i></div><div class="sub-txt" style="margin-top:3px">'+pg+'%</div></td>'
      + '<td class="sub-txt">'+esc(c.type||'—')+'</td>'
      + '<td class="pnext sub-txt">'+esc(c.next||'—')+'</td></tr>';
  }
  document.getElementById('cl-body').innerHTML = rows || '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--cs-sub)">No clients match this filter.</td></tr>';
}
function setClFilter(f){ clFilter=f; renderClients(); }
function shortUrl(u){ return String(u).replace(/^https?:\/\//,'').replace(/\/$/,''); }
/* DNS is where a tenant cutover actually happens — repointing the customer's
   domain at the omega-core Vercel project is the last step and the one that is
   reversible only as fast as TTL allows. Deep-link straight to the zone rather
   than making somebody hunt for it mid-cutover. Registrar-specific by design:
   every domain in this book of business is on GoDaddy, and a generic "manage
   DNS" link that guesses wrong is worse than none. */
function godaddyDns(domain){
  return 'https://dcc.godaddy.com/manage/' + encodeURIComponent(String(domain||'')) + '/dns';
}

/* ── STATUS BOARD ── */
var stFilter='all';
function renderStatus(){
  var filters=[['all','All'],['up','Up'],['degraded','Degraded'],['down','Down'],['building','Building'],['paused','Paused']];
  var fh='';
  for (var i=0;i<filters.length;i++){ fh+='<button class="fpill'+(stFilter===filters[i][0]?' on':'')+'" onclick="setStFilter(&quot;'+filters[i][0]+'&quot;)">'+filters[i][1]+'</button>'; }
  document.getElementById('st-filters').innerHTML=fh;

  var cards='';
  for (var j=0;j<STATE.clients.length;j++){
    var c=STATE.clients[j];
    if (stFilter!=='all' && c.status!==stFilter) continue;
    var up = c.status==='building' ? '—' : ((c.uptime||0).toFixed(1)+'%');
    cards += '<div class="status-card '+c.status+'" onclick="openClient(&quot;'+c.id+'&quot;)">'
      + '<div class="sc-top"><div><div class="sc-name">'+esc(c.name)+'</div><div class="sc-repo">'+esc(c.repo||'—')+'</div></div>'+statusDot(c.status)+'</div>'
      + (c.url?'<a class="sc-url" href="'+esc(c.url)+'" target="_blank" rel="noopener" onclick="event.stopPropagation()">'+esc(shortUrl(c.url))+'</a>':'')
      + '<div class="sc-meta">'
      + '<span class="chip '+c.tier+'">'+tierShort(c.tier)+'</span>'
      + '<span class="sc-metric">Uptime <b>'+up+'</b></span>'
      + '<span class="sc-metric">Checked <b>'+timeAgo(c.updatedAt)+'</b></span>'
      + '</div></div>';
  }
  document.getElementById('st-grid').innerHTML = cards || '<div class="empty">No deployments match this filter.</div>';
}
function setStFilter(f){ stFilter=f; renderStatus(); }

/* Lightweight "health sweep": pings each deployment URL (no-cors best effort),
   marks reachable ones up. Real uptime should come from a monitor webhook →
   Firestore; this gives an instant manual re-check in the meantime. */
function runHealthSweep(){
  toast('Re-checking <b>'+STATE.clients.length+'</b> deployments…');
  var pending = STATE.clients.length;
  if (!pending){ return; }
  for (var i=0;i<STATE.clients.length;i++){
    (function(c){
      if (!c.url || c.status==='paused'){ if(--pending===0) afterSweep(); return; }
      var done=false;
      var img = new Image();
      var t = setTimeout(function(){ if(done)return; done=true; c.updatedAt=Date.now(); if(--pending===0) afterSweep(); }, 6000);
      img.onload = img.onerror = function(){
        if(done)return; done=true; clearTimeout(t);
        // We can't read cross-origin status; onload/onerror both fire on reachable hosts.
        c.updatedAt = Date.now();
        if(--pending===0) afterSweep();
      };
      img.src = c.url.replace(/\/$/,'') + '/favicon.ico?_=' + Date.now();
    })(STATE.clients[i]);
  }
}
function afterSweep(){ persist('clients'); renderStatus(); renderOverview(); toast('Re-check complete.'); }

/* ── INFRASTRUCTURE ── */
var INFRA = [
  { id:'procurement', name:'Procurement Marketplace', sub:'Market-wide equipment pricing & bankable products.',
    icon:'M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2M20 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6' },
  { id:'aggregators', name:'Aggregators', sub:'VPP / DR aggregator network & dispatch enrollment.',
    icon:'M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M19.1 4.9l-2.8 2.8M7.7 16.3l-2.8 2.8' },
  { id:'financing', name:'Financing Partners', sub:'Debt, tax equity & capital partners for projects.',
    icon:'M2 5h20v14H2zM2 10h20' },
  { id:'offtakers', name:'AI Data Offtakers', sub:'Compute / data-center offtake & behind-the-meter load.',
    icon:'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z' }
];
var activeEco = 'procurement';
function renderInfra(){
  var grid='';
  for (var i=0;i<INFRA.length;i++){
    var e=INFRA[i];
    var count = ecoCount(e.id);
    grid += '<a class="pm-tile'+(activeEco===e.id?'':' soon')+'" onclick="setEco(&quot;'+e.id+'&quot;)">'
      + '<span class="pm-badge count">'+count+'</span>'
      + '<div class="pm-ico"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1B4F8A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="'+e.icon+'"/></svg></div>'
      + '<div class="pm-name">'+esc(e.name)+'</div>'
      + '<div class="pm-desc">'+e.sub+'</div></a>';
  }
  document.getElementById('infra-grid').innerHTML = grid;
  renderInfraDetail();
}
function ecoCount(eco){
  var n=0;
  for (var i=0;i<STATE.offerings.length;i++){ if(STATE.offerings[i].eco===eco) n++; }
  for (var j=0;j<STATE.partners.length;j++){ if(STATE.partners[j].eco===eco) n++; }
  return n;
}
function setEco(id){ activeEco=id; renderInfra(); }
function renderInfraDetail(){
  var e=null; for (var i=0;i<INFRA.length;i++){ if(INFRA[i].id===activeEco) e=INFRA[i]; }
  document.getElementById('infra-detail-title').textContent = e ? e.name : '';
  document.getElementById('infra-detail-sub').textContent = 'Catalog, offerings, deals & partners in this ecosystem';

  var cards='';
  // offerings/deals
  for (var j=0;j<STATE.offerings.length;j++){
    var o=STATE.offerings[j];
    if (o.eco!==activeEco) continue;
    cards += '<div class="info-card"><div class="ic-top"><div><div class="ic-name">'+esc(o.title)+'</div><div class="ic-sub">'+esc(o.party||'')+'</div></div><span class="chip '+dealChip(o.status)+'">'+esc(o.status)+'</span></div>'
      + '<div class="ic-row"><span class="lbl">Kind</span><span class="val">'+esc(o.kind)+'</span></div>'
      + '<div class="ic-row"><span class="lbl">Value</span><span class="val">'+esc(o.value||'—')+'</span></div>'
      + (o.detail?'<div class="ic-body">'+esc(o.detail)+'</div>':'')
      + '<div class="ic-actions"><button class="danger" onclick="deleteOffering(&quot;'+o.id+'&quot;)">Remove</button></div></div>';
  }
  // partners tagged to this ecosystem
  for (var k=0;k<STATE.partners.length;k++){
    var p=STATE.partners[k];
    if (p.eco!==activeEco) continue;
    cards += '<div class="info-card"><div class="ic-top"><div><div class="ic-name">'+esc(p.name)+'</div><div class="ic-sub">Partner · '+esc(catLabel(p.cat))+'</div></div><span class="chip '+partnerStatusChip(p.status)+'">'+esc(p.status)+'</span></div>'
      + (p.notes?'<div class="ic-body">'+esc(p.notes)+'</div>':'')
      + '<div class="ic-actions"><button onclick="switchTab(&quot;partners&quot;)">View in Partners</button></div></div>';
  }
  document.getElementById('infra-detail-grid').innerHTML = cards || '<div class="empty">Nothing in this ecosystem yet. Add an offering, deal, or tag a partner to it.</div>';
}
function dealChip(s){ return {active:'partner',pending:'tier3',draft:'gray',closed:'gray'}[s]||'gray'; }

/* ── PARTNERS ── */
var ptFilter='all';
function catLabel(c){ return {data:'Data Supplier',engineering:'Engineering Firm',tasks:'Task / Ops',tooling:'Tooling / Dev',financing:'Financing',aggregator:'Aggregator',offtaker:'AI Offtaker',supply:'Equipment Supply'}[c]||c; }
function partnerStatusChip(s){ return {signed:'partner',loi:'tier2',negotiating:'tier3',prospect:'gray',paused:'gray'}[s]||'gray'; }
function renderPartners(){
  document.getElementById('pt-count').textContent = STATE.partners.length;
  var filters=[['all','All'],['data','Data'],['engineering','Engineering'],['tasks','Tasks / Ops'],['tooling','Tooling'],['financing','Financing'],['aggregator','Aggregators'],['offtaker','Offtakers'],['supply','Supply']];
  var fh='';
  for (var i=0;i<filters.length;i++){ fh+='<button class="fpill'+(ptFilter===filters[i][0]?' on':'')+'" onclick="setPtFilter(&quot;'+filters[i][0]+'&quot;)">'+filters[i][1]+'</button>'; }
  document.getElementById('pt-filters').innerHTML=fh;

  var cards='';
  for (var j=0;j<STATE.partners.length;j++){
    var p=STATE.partners[j];
    if (ptFilter!=='all' && p.cat!==ptFilter) continue;
    cards += '<div class="info-card"><div class="ic-top"><div><div class="ic-name">'+esc(p.name)+'</div><div class="ic-sub">'+esc(catLabel(p.cat))+'</div></div><span class="chip '+partnerStatusChip(p.status)+'">'+esc(p.status)+'</span></div>'
      + (p.notes?'<div class="ic-body">'+esc(p.notes)+'</div>':'')
      + '<div class="ic-tags">'+(p.contact&&p.contact!=='—'?'<span class="chip neutral">'+esc(p.contact)+'</span>':'')+(p.eco?'<span class="chip neutral">'+esc(p.eco)+'</span>':'')+'</div>'
      + '<div class="ic-actions"><button onclick="editPartner(&quot;'+p.id+'&quot;)">Edit</button><button class="danger" onclick="deletePartner(&quot;'+p.id+'&quot;)">Remove</button></div></div>';
  }
  document.getElementById('pt-grid').innerHTML = cards || '<div class="empty">No partners in this category yet.</div>';
}
function setPtFilter(f){ ptFilter=f; renderPartners(); }

/* ── CRM ── */
var crmFilter='all';
function renderCrm(){
  /* Rows come from the JOIN, not from STATE.clients, so a tenant who signed up
     five minutes ago is in this table without anyone re-keying them. */
  var all = reconciledClients();
  document.getElementById('crm-count').textContent = all.length;
  var newOnes = all.filter(function(r){ return r._org && !r._crm; }).length;
  var offPlatform = all.filter(function(r){ return !r._org; }).length;

  var filters=[['all','All'],['tenants','On platform'],['new','New tenants'],
               ['offplatform','Not on platform'],['attention','Needs Attention']];
  var fh='';
  for (var i=0;i<filters.length;i++){
    var k=filters[i][0];
    var n = k==='new'?newOnes : k==='offplatform'?offPlatform
          : k==='tenants'?all.filter(function(r){return !!r._org;}).length : 0;
    fh+='<button class="fpill'+(crmFilter===k?' on':'')+'" onclick="setCrmFilter(&quot;'+k+'&quot;)">'
      + filters[i][1]+(n?(' '+n):'')+'</button>';
  }
  if (newOnes){
    fh += '<button class="fpill" style="margin-left:10px" onclick="syncTenantsIntoCrm()">'
        + '\u21bb Add ' + newOnes + ' to roster</button>';
  }
  document.getElementById('crm-filters').innerHTML=fh;

  var rows='';
  for (var j=0;j<all.length;j++){
    var c=all[j];
    if (crmFilter==='attention'){ if(!(c.status==='down'||c.status==='degraded'||openTasks(c.id)>0)) continue; }
    else if (crmFilter==='tenants'     && !c._org) continue;
    else if (crmFilter==='new'         && !(c._org && !c._crm)) continue;
    else if (crmFilter==='offplatform' && c._org) continue;
    var ls = lastStatus(c.id);
    var ot = openTasks(c.id);
    rows += '<tr class="clickable" onclick="openClient(&quot;'+c.id+'&quot;)">'
      + '<td class="site-nm">'+esc(c.name)+'<div class="sub-txt">'+esc(c._key||'')+'</div></td>'
      + '<td><span class="chip '+esc(c.tier)+'">'+esc(tierShort(c.tier))+'</span></td>'
      + '<td>'+crmSourceChip(c)+'</td>'
      + '<td>'+tierSyncCell(c)+'</td>'
      + '<td class="sub-txt">'+esc(c.owner||'—')+'</td>'
      + '<td>'+healthChip(c)+'</td>'
      + '<td class="num">'+(ot>0?'<b style="color:var(--cs-accent)">'+ot+'</b>':'0')+'</td>'
      + '<td class="sub-txt">'+(ls?esc(truncate(ls.text,52)):'<span class="mut">none yet</span>')+'</td>'
      + '<td class="sub-txt">'+timeAgo(c.updatedAt)+'</td></tr>';
  }
  document.getElementById('crm-body').innerHTML = rows || '<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--cs-sub)">No clients match.</td></tr>';
}
function setCrmFilter(f){ crmFilter=f; renderCrm(); }
function truncate(s,n){ s=String(s); return s.length>n ? s.slice(0,n-1)+'…' : s; }
function healthChip(c){
  if (c.status==='down') return '<span class="sdot down"><i></i>Down</span>';
  if (c.status==='degraded') return '<span class="sdot degraded"><i></i>Watch</span>';
  if (openTasks(c.id)>2) return '<span class="sdot degraded"><i></i>Busy</span>';
  return '<span class="sdot up"><i></i>Good</span>';
}

/* ══════════════════════════════════════════════════════════════════════
   CLIENT DRAWER (CRM record)
   ══════════════════════════════════════════════════════════════════════ */
var drawerClientId = null;
function openClient(id){
  drawerClientId = id;
  var c=null; for (var i=0;i<STATE.clients.length;i++){ if(STATE.clients[i].id===id) c=STATE.clients[i]; }
  if (!c) return;
  document.getElementById('dr-title').textContent = c.name;
  document.getElementById('dr-sub').textContent = tierLabel(c.tier) + ' · ' + (c.owner||'unassigned');
  renderDrawerBody(c);
  document.getElementById('drawer-bg').className='drawer-bg on';
  document.getElementById('drawer').className='drawer on';
}
function closeDrawer(){
  document.getElementById('drawer-bg').className='drawer-bg';
  document.getElementById('drawer').className='drawer';
  drawerClientId=null;
}
function renderDrawerBody(c){
  var logs = STATE.logs[c.id] || [];
  var logHtml='';
  for (var i=logs.length-1;i>=0;i--){
    var l=logs[i];
    var canDone = l.kind==='task';
    logHtml += '<div class="log-item">'
      + '<div class="li-top"><span class="li-kind '+l.kind+'">'+l.kind+'</span><span class="li-date">'+timeAgo(l.at)+'</span></div>'
      + '<div class="li-txt'+(l.done?' li-done':'')+'">'+esc(l.text)+'</div>'
      + (canDone?'<div style="margin-top:7px;display:flex;gap:8px"><button style="font-size:11px;background:#fff;border:1px solid var(--cs-border);border-radius:6px;padding:3px 10px;cursor:pointer;color:'+(l.done?'var(--cs-sub)':'var(--cs-green)')+'" onclick="toggleTask(&quot;'+c.id+'&quot;,&quot;'+l.id+'&quot;)">'+(l.done?'Reopen':'Mark done')+'</button><button style="font-size:11px;background:#fff;border:1px solid var(--cs-border);border-radius:6px;padding:3px 10px;cursor:pointer;color:var(--cs-sub)" onclick="deleteLog(&quot;'+c.id+'&quot;,&quot;'+l.id+'&quot;)">Delete</button></div>':'<div style="margin-top:7px"><button style="font-size:11px;background:#fff;border:1px solid var(--cs-border);border-radius:6px;padding:3px 10px;cursor:pointer;color:var(--cs-sub)" onclick="deleteLog(&quot;'+c.id+'&quot;,&quot;'+l.id+'&quot;)">Delete</button></div>')
      + '</div>';
  }
  if (!logHtml) logHtml='<div class="empty" style="padding:22px">No log entries yet. Add a task, note, or status report.</div>';

  var body = ''
    + '<div class="dr-sec"><div class="dr-sec-title">Record</div>'
    + '<div class="dr-kv">'
    + '<span class="k">Tier</span><span class="v">'+tierLabel(c.tier)+'</span>'
    + '<span class="k">Type</span><span class="v">'+esc(c.type||'—')+'</span>'
    + '<span class="k">Domain</span><span class="v mono">'+esc(c.domain||'—')+'</span>'
    + '<span class="k">Repository</span><span class="v mono">'+esc(c.repo||'—')+'</span>'
    + '<span class="k">Deployment</span><span class="v">'+(c.url?'<a href="'+esc(c.url)+'" target="_blank" rel="noopener" style="color:var(--cs-sky)">'+esc(shortUrl(c.url))+'</a>':'—')+'</span>'
    + '<span class="k">DNS</span><span class="v">'+(c.domain?'<a href="'+esc(godaddyDns(c.domain))+'" target="_blank" rel="noopener" style="color:var(--cs-sky)">'+esc(c.domain)+' zone at GoDaddy</a>':'—')+'</span>'
    + '<span class="k">Status</span><span class="v">'+statusDot(c.status)+'</span>'
    + '<span class="k">Progress</span><span class="v">'+(c.progress||0)+'%</span>'
    + '<span class="k">Owner</span><span class="v">'+esc(c.owner||'—')+'</span>'
    + '<span class="k">Next action</span><span class="v">'+esc(c.next||'—')+'</span>'
    + '</div>'
    + '<div style="margin-top:14px;display:flex;gap:8px"><button class="btn-ghost" onclick="editClient(&quot;'+c.id+'&quot;)">Edit record</button><button class="btn-ghost" onclick="deleteClient(&quot;'+c.id+'&quot;)" style="color:var(--cs-red);border-color:rgba(229,57,53,.3)">Delete</button></div>'
    + '</div>'
    + '<div class="dr-sec"><div class="dr-sec-title">Activity Log <button onclick="openLogModal(&quot;'+c.id+'&quot;)">+ Add entry</button></div>'
    + logHtml + '</div>';
  document.getElementById('dr-body').innerHTML = body;
}

/* ══════════════════════════════════════════════════════════════════════
   MODALS + CRUD
   ══════════════════════════════════════════════════════════════════════ */
function openModal(id){ document.getElementById(id).className='modal-bg on'; }
function closeModal(id){ document.getElementById(id).className='modal-bg'; }

var editingClientId=null;
function openClientModal(){ editingClientId=null; document.getElementById('client-modal-title').textContent='Add Client / Repository';
  setVal('cm-name',''); setVal('cm-tier','tier2'); setVal('cm-type','developer'); setVal('cm-domain',''); setVal('cm-owner',(currentUser&&currentUser.displayName?currentUser.displayName.split(' ')[0]:'Tommy')); setVal('cm-repo',''); setVal('cm-url',''); setVal('cm-status','building'); setVal('cm-progress','0'); setVal('cm-next',''); setVal('cm-soldby','');
  openModal('client-modal'); }
function editClient(id){
  var c=findClient(id); if(!c) return;
  editingClientId=id; document.getElementById('client-modal-title').textContent='Edit Client / Repository';
  setVal('cm-name',c.name); setVal('cm-tier',c.tier); setVal('cm-type',c.type); setVal('cm-domain',c.domain); setVal('cm-owner',c.owner); setVal('cm-repo',c.repo); setVal('cm-url',c.url); setVal('cm-status',c.status); setVal('cm-progress',c.progress); setVal('cm-next',c.next); setVal('cm-soldby',c.soldBy||'');
  openModal('client-modal');
}
function saveClient(){
  var name=val('cm-name').trim(); if(!name){ alert('Enter a client name.'); return; }
  var obj={ name:name, tier:val('cm-tier'), type:val('cm-type'), domain:val('cm-domain').trim(), owner:val('cm-owner').trim(),
    repo:val('cm-repo').trim(), url:val('cm-url').trim(), status:val('cm-status'), progress:parseInt(val('cm-progress'),10)||0,
    next:val('cm-next').trim(), soldBy:val('cm-soldby').trim(), uptime:(val('cm-status')==='up'?100:0), updatedAt:Date.now() };
  if (editingClientId){
    var c=findClient(editingClientId);
    for (var kk in obj){ if(obj.hasOwnProperty(kk)) c[kk]=obj[kk]; }
  } else {
    obj.id = 'c-' + Date.now();
    obj.health='good';
    STATE.clients.push(obj);
    STATE.logs[obj.id] = STATE.logs[obj.id] || [];
  }
  persist('clients'); persist('logs');
  closeModal('client-modal');
  renderEverything();
  if (drawerClientId){ var d=findClient(drawerClientId); if(d) renderDrawerBody(d); }
  toast('Client saved.');
}
function deleteClient(id){
  if (!confirm('Delete this client and its logs?')) return;
  STATE.clients = STATE.clients.filter(function(c){ return c.id!==id; });
  delete STATE.logs[id];
  persist('clients'); persist('logs');
  closeDrawer(); renderEverything(); toast('Client deleted.');
}
function findClient(id){ for(var i=0;i<STATE.clients.length;i++){ if(STATE.clients[i].id===id) return STATE.clients[i]; } return null; }

/* Partners */
var editingPartnerId=null;
function openPartnerModal(){ editingPartnerId=null; document.getElementById('partner-modal-title').textContent='Add Partner';
  setVal('pm-name',''); setVal('pm-cat','data'); setVal('pm-status','prospect'); setVal('pm-contact',''); setVal('pm-eco',''); setVal('pm-notes','');
  openModal('partner-modal'); }
function editPartner(id){ var p=findPartner(id); if(!p)return; editingPartnerId=id; document.getElementById('partner-modal-title').textContent='Edit Partner';
  setVal('pm-name',p.name); setVal('pm-cat',p.cat); setVal('pm-status',p.status); setVal('pm-contact',p.contact); setVal('pm-eco',p.eco||''); setVal('pm-notes',p.notes);
  openModal('partner-modal'); }
function savePartner(){
  var name=val('pm-name').trim(); if(!name){ alert('Enter a partner name.'); return; }
  var obj={ name:name, cat:val('pm-cat'), status:val('pm-status'), contact:val('pm-contact').trim()||'—', eco:val('pm-eco'), notes:val('pm-notes').trim() };
  if (editingPartnerId){ var p=findPartner(editingPartnerId); for(var kk in obj){ if(obj.hasOwnProperty(kk)) p[kk]=obj[kk]; } }
  else { obj.id='p-'+Date.now(); STATE.partners.push(obj); }
  persist('partners'); closeModal('partner-modal'); renderPartners(); renderInfra(); renderOverview(); renderTabs(); toast('Partner saved.');
}
function deletePartner(id){ if(!confirm('Remove this partner?'))return; STATE.partners=STATE.partners.filter(function(p){return p.id!==id;}); persist('partners'); renderPartners(); renderInfra(); renderTabs(); toast('Partner removed.'); }
function findPartner(id){ for(var i=0;i<STATE.partners.length;i++){ if(STATE.partners[i].id===id) return STATE.partners[i]; } return null; }

/* Offerings / deals */
function openOfferingModal(){ setVal('om-title',''); setVal('om-kind','offering'); setVal('om-status','active'); setVal('om-value',''); setVal('om-party',''); setVal('om-detail',''); openModal('offering-modal'); }
function saveOffering(){
  var title=val('om-title').trim(); if(!title){ alert('Enter a title.'); return; }
  var obj={ id:'o-'+Date.now(), eco:activeEco, kind:val('om-kind'), title:title, status:val('om-status'), value:val('om-value').trim(), party:val('om-party').trim(), detail:val('om-detail').trim() };
  STATE.offerings.push(obj); persist('offerings'); closeModal('offering-modal'); renderInfra(); renderOverview(); toast('Added to ' + activeEco + '.');
}
function deleteOffering(id){ if(!confirm('Remove this item?'))return; STATE.offerings=STATE.offerings.filter(function(o){return o.id!==id;}); persist('offerings'); renderInfra(); renderOverview(); toast('Removed.'); }

/* Logs (tasks / notes / status reports) */
var logClientId=null;
function openLogModal(cid){ logClientId=cid; var c=findClient(cid);
  document.getElementById('log-modal-title').textContent='Log Entry — '+(c?c.name:'');
  document.getElementById('log-modal-sub').textContent='Task, note, or status report on this client.';
  setVal('lg-kind','task'); setVal('lg-text',''); openModal('log-modal'); }
function saveLog(){
  var text=val('lg-text').trim(); if(!text){ alert('Enter some content.'); return; }
  if(!STATE.logs[logClientId]) STATE.logs[logClientId]=[];
  STATE.logs[logClientId].push({ id:'l-'+Date.now(), kind:val('lg-kind'), text:text, done:false, at:Date.now() });
  var c=findClient(logClientId); if(c){ c.updatedAt=Date.now(); persist('clients'); }
  persist('logs'); closeModal('log-modal');
  if (drawerClientId){ var d=findClient(drawerClientId); if(d) renderDrawerBody(d); }
  renderCrm(); renderOverview(); toast('Logged.');
}
function toggleTask(cid,lid){
  var arr=STATE.logs[cid]||[]; for(var i=0;i<arr.length;i++){ if(arr[i].id===lid) arr[i].done=!arr[i].done; }
  persist('logs'); var d=findClient(drawerClientId); if(d) renderDrawerBody(d); renderCrm(); renderOverview();
}
function deleteLog(cid,lid){
  STATE.logs[cid]=(STATE.logs[cid]||[]).filter(function(l){return l.id!==lid;});
  persist('logs'); var d=findClient(drawerClientId); if(d) renderDrawerBody(d); renderCrm(); renderOverview();
}

/* ── small utils ── */
function val(id){ return document.getElementById(id).value; }
function setVal(id,v){ document.getElementById(id).value = (v==null?'':v); }
function toast(html){ var t=document.getElementById('toast'); t.innerHTML=html; t.className='toast show'; clearTimeout(window._tt); window._tt=setTimeout(function(){ t.className='toast'; },2600); }

/* close modals on backdrop click */
(function(){
  var bgs=document.querySelectorAll('.modal-bg');
  for (var i=0;i<bgs.length;i++){
    (function(bg){ bg.addEventListener('click', function(e){ if(e.target===bg) bg.className='modal-bg'; }); })(bgs[i]);
  }
})();

/* ══════════════════════════════════════════════════════════════════════
   APPLICATIONS  —  ClearSky's own tool suite (same-repo tool files).
   Links resolve within THIS repo, so they open ClearSky's copies of each
   tool. Projects are created under ClearSky's developer org so the editor
   and recent-projects list scope correctly.
   ══════════════════════════════════════════════════════════════════════ */
/* ClearSky's developer org for projects. Derived from the signed-in email
   domain so it ALWAYS matches the Firestore rule (orgId == userOrg()).
   Falls back to csebuilders.com before auth resolves. */
function clearskyOrg(){
  try {
    if (typeof currentUser !== 'undefined' && currentUser && currentUser.email) {
      return currentUser.email.split('@')[1];
    }
  } catch(e){}
  return 'csebuilders.com';
}

/* ── Applications grid, rendered from the shared registry (omega-tools.js) ──
   Admin console shows ALL tools unlocked (no workspace => everything visible). */
function renderApps(){
  var tools = OMEGATools.all();
  var grid='';
  for (var i=0;i<tools.length;i++){
    var a=tools[i];
    var cls = a.soon ? ' soon' : ' ';
    var badgeTxt = a.badge ? (a.badge==='invest'?'Investors':(a.badge==='new'?'New':a.badge)) : (a.soon?'Soon':'');
    var badge = badgeTxt ? '<span class="pm-badge '+esc(a.badge||'')+'">'+esc(badgeTxt)+'</span>' : '';
    var handler;
    if (a.soon) handler = 'onclick="pmSoon(&quot;'+esc(a.name)+'&quot;)"';
    else if (a.action) handler = 'onclick="openNewProjectModal(&quot;'+(a.action==='new:bess'?'bess':'sandbox')+'&quot;)"';
    else handler = 'href="'+esc(a.file||'#')+'"';
    var stroke = a.soon ? '#9AA6B4' : '#1B4F8A';
    grid += '<a class="pm-tile'+cls+'" '+handler+'>'
      + badge
      + '<div class="pm-ico"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="'+stroke+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="'+a.icon+'"/></svg></div>'
      + '<div class="pm-name">'+esc(a.name)+'</div>'
      + '<div class="pm-desc">'+esc(a.desc)+'</div></a>';
  }
  document.getElementById('apps-grid').innerHTML = grid;
  _showPublishedNote();
}

function pmSoon(name){ toast('<b>'+esc(name)+'</b> is coming online soon.'); }

/* ══════════════════════════════════════════════════════════════════════════
   TENANTS & USERS  —  the live control plane (MERGE.md TODO 8)
   ══════════════════════════════════════════════════════════════════════════
   Client Inventory above is SEED_CLIENTS: a hand-kept book of business, good
   for status and ownership, and completely unrelated to what the platform
   enforces. This tab reads omega_orgs — the record the security rules
   resolve, the portals brand from, and billing hangs off.

   Every mutation goes through /api, never straight to Firestore. The API
   verifies the caller's ID token, and set-role additionally mints custom
   claims so Storage rules and the other functions can trust the role without
   a read. A console that wrote these documents directly would leave the
   claims stale and the two sources disagreeing.
   ══════════════════════════════════════════════════════════════════════════ */
STATE.tenants = STATE.tenants || [];

function _tnStatusChip(st){
  return st==='active' ? 'good' : st==='pending' ? 'warn'
       : st==='suspended' ? 'bad' : st==='cancelled' ? 'bad' : 'neutral';
}

/* Staff-only endpoints want a bearer token. Kept in one place so a missing
   sign-in fails loudly here rather than as a 401 with no explanation. */
function _authedPost(path, body){
  var u = auth && auth.currentUser;
  if (!u) return Promise.reject(new Error('Not signed in'));
  return u.getIdToken().then(function(tok){
    return fetch(path, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+tok },
      body: JSON.stringify(body||{})
    }).then(function(r){
      return r.json().catch(function(){ return {}; }).then(function(j){
        if (!r.ok) throw new Error(j.error || (r.status+' '+r.statusText));
        return j;
      });
    });
  });
}

/* ── SUBSCRIPTION STANDING ────────────────────────────────────────────────
   "Are my tenants current" is the question this console could not answer: the
   status field on omega_orgs says whether an account is switched on, which is
   not the same as whether it has paid. Standing is computed from
   billing/current — an amount outstanding past its date, a date coming up, a
   trial about to lapse.

   NO BILLING DOCUMENT IS NOT AN ARREAR. An account nobody has priced yet
   reads as 'unpriced', deliberately separate from 'current' — a tenant you
   forgot to bill and a tenant who has paid are different problems, and
   collapsing them hides the one you can still fix. */
function _standing(bill, org){
  if ((org.status||'') === 'pending') return { key:'pending', label:'pending approval', chip:'warn' };
  if (!bill || !Object.keys(bill).length) return { key:'unpriced', label:'not priced', chip:'neutral' };
  var now = Date.now(), DAY = 86400000;
  var due = bill.subscriptionDue ? Date.parse(bill.subscriptionDue) : NaN;
  var amt = Number(bill.amountDue||0);
  if (!isNaN(due) && amt > 0 && due < now)               return { key:'overdue',  label:'overdue',        chip:'bad'  };
  if (!isNaN(due) && due - now < 14*DAY && due >= now)   return { key:'duesoon',  label:'due soon',       chip:'warn' };
  var trial = bill.trialEndsAt ? Date.parse(bill.trialEndsAt) : NaN;
  if (!isNaN(trial) && trial - now < 14*DAY)             return { key:'trialend', label:'trial ending',   chip:'warn' };
  if ((bill.tier||'') === 'trial')                       return { key:'trial',    label:'trial',          chip:'neutral' };
  return { key:'current', label:'current', chip:'good' };
}

var tnFilter = 'all';
function setTnFilter(f){ tnFilter=f; renderTenants(); }

/* REFRESH HAS TO SAY SOMETHING.

   This function was already correct — it re-read omega_orgs and redrew every
   table. It just did it silently, and when the records have not changed the
   result is a table that looks exactly the same. Clicking it was
   indistinguishable from clicking a dead button, which is a bad thing to be
   on a console where dead buttons have actually shipped.

   So the button now disables itself while the read is in flight and reports
   the time it finished. Same work, visible. */
function _tnBusy(on, note){
  var b = document.getElementById('tn-refresh');
  if (b){
    b.disabled = !!on;
    b.textContent = on ? '\u21bb Refreshing\u2026' : '\u21bb Refresh';
  }
  var s = document.getElementById('tn-refresh-note');
  if (s && note != null) s.textContent = note;
}

function loadTenants(){
  if (!db){ document.getElementById('tn-body').innerHTML='<div class="empty">Not connected.</div>'; return; }
  _tnBusy(true, '');
  db.collection('omega_orgs').get().then(function(sn){
    var rows=[];
    sn.forEach(function(d){ var v=d.data()||{}; v._id=d.id; rows.push(v); });
    rows.sort(function(a,b){ return String(a.name||a._id).localeCompare(String(b.name||b._id)); });
    /* Billing is a per-tenant subcollection, so standing costs one read each.
       At this size that is the right trade for answering "who owes me" without
       opening thirteen drawers; it is fired once on load, not per render. */
    /* Members are read alongside billing. "Who is paying" and "is anybody
       actually in there" are the same question asked twice, and a tenant on
       enterprise with nobody signed in is the single most useful thing this
       console can tell you — it was not telling anybody. Same cost shape as
       the billing read, fired once on load rather than per render. */
    return Promise.all(rows.map(function(r){
      return Promise.all([
        db.collection('omega_orgs').doc(r._id).collection('billing').doc('current').get()
          .then(function(d){ return d.exists ? d.data() : {}; })
          .catch(function(){ return {}; }),
        db.collection('omega_orgs').doc(r._id).collection('members').get()
          .then(function(sn){
            var m = [];
            sn.forEach(function(d){ var v = d.data() || {}; v._uid = d.id; m.push(v); });
            return m;
          })
          .catch(function(){ return null; })   /* null = could not read, not zero */
      ]).then(function(res){
        r._bill = res[0];
        r._members = res[1];
        r._memberCount = res[1] ? res[1].length : null;
        r._activeMembers = res[1]
          ? res[1].filter(function(m){ return m.status !== 'suspended' && m.status !== 'removed'; }).length
          : null;
        return r;
      });
    }));
  }).then(function(rows){
    STATE.tenants = rows || [];
    renderTenants();
    /* The roster tabs join against STATE.tenants, so they have to redraw once
       the live records land — otherwise they show the hand-kept list only and
       look authoritative while being incomplete. */
    if (typeof renderClients === 'function') renderClients();
    if (typeof renderCrm === 'function') renderCrm();
    /* THE PRICING TABLE TOO. Its "On platform" column reads STATE.tenants,
       and loadTenants() is async while that table renders at boot — so the
       column showed a dash on every row, always, and the tenant data it was
       waiting for arrived to nobody. Same shape as the dashboard blocks that
       mounted before the workspace resolved: the render happened once, at the
       moment the answer was not available yet. */
    if (typeof window.ctRefresh === 'function') window.ctRefresh();
    renderTabs();
    _tnBusy(false, 'Updated ' + new Date().toLocaleTimeString() +
                   ' \u00b7 ' + (rows || []).length + ' tenants');
  }).catch(function(e){
    _tnBusy(false, 'Refresh failed');
    document.getElementById('tn-body').innerHTML =
      '<div class="empty">Could not read omega_orgs — '+esc(e.message||'permission denied')+'</div>';
  });
}

/* ══════════════════════════════════════════════════════════════════════
   RECONCILING THE BOOK OF BUSINESS WITH THE PLATFORM
   ══════════════════════════════════════════════════════════════════════
   Two lists described the same companies and neither knew about the other:
   Client Inventory / Internal CRM is a hand-kept roster in admin/clients,
   and omega_orgs is what the security rules actually resolve. A tenant could
   sign up and never appear in the CRM; a CRM row could name a company with no
   account at all. Both were true at once and nothing said so.

   THE JOIN KEY IS THE DOMAIN, because that is already the platform's tenant
   key — orgId IS the email domain, lowercased. Nothing new to maintain.

   THIS IS A VIEW, NOT A MIGRATION. Rows are matched in memory and labelled;
   admin/clients is not rewritten on load. A CRM row whose company never
   signed up keeps its notes and is marked "not on platform" rather than
   vanishing — the sales history is the reason that list exists. Materialising
   a tenant into the CRM is an explicit click, so the roster only grows when
   somebody means it to. */
/* ── ONE TIER, TWO VOCABULARIES ───────────────────────────────────────────
   The roster says tier1/2/3 and labels them Core / Performance / Enterprise.
   billing/current.tier says trial | standard | deluxe | enterprise, and THAT
   is the string omega-tools.js gates every tool on. They describe the same
   commercial fact and nothing kept them in step, which is why NextNRG reads
   "Performance" here and "not yet priced" on its own account page.

   TIER.DELUXE === 2 in omega-tools.js, so Performance (tier2) is deluxe.
   That mapping is the whole reason this table exists rather than a guess at
   the call site.

   tier4 is deliberately absent. It is in the data (CIR) and it is not in
   tierLabel(), TIERS, or the tool gate — so it maps to nothing and pushing it
   would silently pick a default. It is reported as unmapped instead. */
var TIER_CRM_TO_BILLING = {
  tier1: 'standard',      // Core
  tier2: 'deluxe',        // Performance
  tier3: 'enterprise',    // Enterprise
  internal: 'internal',
  partner: 'partner'
};
function billingTierFor(crmTier){ return TIER_CRM_TO_BILLING[String(crmTier||'')] || null; }

/* Pushes the roster's tier onto the tenant's billing document — the record the
   tool gate and the customer's own account page read. Writes billing/current
   directly, which the rules permit for isAdmin(), and appends the same history
   row saveTenantBilling() does so the change is not invisible. */
function pushTierToBilling(orgId, crmTier){
  var target = billingTierFor(crmTier);
  if (!target){
    window.alert('"' + crmTier + '" has no billing equivalent.\n\nKnown: ' +
      Object.keys(TIER_CRM_TO_BILLING).join(', ') +
      '.\nDecide what it maps to before pushing it, or the tool gate falls back to a default.');
    return;
  }
  if (!window.confirm('Set ' + orgId + ' to "' + target + '" (' + tierLabel(crmTier) + ')?\n\n' +
      'This is the tier the tool gate reads and the customer sees on their account page.')) return;

  var FV = firebase.firestore.FieldValue;
  var ref = db.collection('omega_orgs').doc(orgId).collection('billing').doc('current');
  ref.get().then(function(snap){
    var before = snap.exists ? snap.data() : {};
    return ref.set({ tier: target, updatedAt: FV.serverTimestamp(),
                     updatedBy: (currentUser && currentUser.email) || 'console' }, { merge:true })
      .then(function(){
        return ref.collection('history').add({
          at: FV.serverTimestamp(), by: (currentUser && currentUser.email) || 'console',
          changed: { tier: target }, was: { tier: before.tier === undefined ? null : before.tier },
          note: 'pushed from client roster (' + crmTier + ')'
        });
      });
  }).then(function(){ loadTenants(); })
   .catch(function(e){ window.alert('Could not set the tier:\n\n' + (e.message||e)); });
}

function crmKeyOf(c){
  return String((c && (c.domain || c.orgId)) || '').toLowerCase().trim();
}

/* Every company either side knows about, joined. Called by renderClients and
   renderCrm so the two tabs can never disagree again. */
function reconciledClients(){
  var crm = STATE.clients || [], orgs = STATE.tenants || [];
  var byKey = {}, out = [];

  crm.forEach(function(c){
    var k = crmKeyOf(c);
    var row = {}; for (var f in c) row[f] = c[f];
    row._key = k; row._crm = true; row._org = null;
    if (k) byKey[k] = row;
    out.push(row);
  });

  orgs.forEach(function(o){
    var k = String(o._id || '').toLowerCase();
    var hit = byKey[k];
    if (hit){
      hit._org = o;
      hit._billingTier = (o._bill && o._bill.tier) || null;
      /* Mismatch means the roster and the customer's account disagree about
         what they are paying for. That is worth a badge, not a silent win for
         whichever list you happened to open. */
      hit._tierPushable = !!billingTierFor(hit.tier) && hit._billingTier !== billingTierFor(hit.tier);
      return;
    }
    /* A tenant nobody has a CRM row for — a self-serve signup, or an org
       seeded after the roster was last touched. Shown, not written. */
    out.push({
      id: 'org-' + k, name: o.name || k, domain: k,
      tier: (o._bill && o._bill.tier) || '—',
      type: o.vertical || '—', owner: '', status: o.status || 'active',
      progress: 0, health: 'good', next: '', updatedAt: Date.now(),
      _key: k, _crm: false, _org: o
    });
  });

  out.sort(function(a,b){ return String(a.name||'').localeCompare(String(b.name||'')); });
  return out;
}

/* One badge, used by both tabs, so "is this real" is answered the same way
   wherever you are looking. */
/* What the CUSTOMER's account says, next to what the roster says. The two
   were never shown together, so a disagreement could stand indefinitely — and
   the customer's copy is the one that gates their tools. */
function tierSyncCell(r){
  if (!r._org) return '<span class="sub-txt">\u2014</span>';
  var live = r._billingTier;
  var want = billingTierFor(r.tier);
  if (!want) return '<span class="chip neutral" title="No billing equivalent for &quot;'+esc(r.tier)+'&quot;">unmapped</span>';
  if (live === want) return '<span class="chip good">'+esc(live)+'</span>';
  return '<span class="chip warn">'+esc(live || 'not priced')+'</span>'
       + ' <button style="margin-left:6px" onclick="event.stopPropagation();pushTierToBilling(&quot;'
       + esc(r._key)+'&quot;,&quot;'+esc(r.tier)+'&quot;)">Set '+esc(want)+'</button>';
}

function crmSourceChip(r){
  if (r._org && r._crm)  return '<span class="chip good">tenant</span>';
  if (r._org && !r._crm) return '<span class="chip warn">new tenant</span>';
  return '<span class="chip neutral">not on platform</span>';
}

/* Writes the tenants that have no CRM row into admin/clients, once, on
   request. Explicit because it changes the roster rather than the view. */
function syncTenantsIntoCrm(){
  var rows = reconciledClients().filter(function(r){ return r._org && !r._crm; });
  if (!rows.length){ window.alert('Every tenant already has a CRM row.'); return; }
  if (!window.confirm('Add ' + rows.length + ' tenant' + (rows.length===1?'':'s') +
      ' to the client roster?\n\n' + rows.map(function(r){return '· '+r.name;}).join('\n'))) return;
  rows.forEach(function(r){
    var c = {}; for (var f in r) if (f.charAt(0) !== '_') c[f] = r[f];
    STATE.clients.push(c);
  });
  persist('clients');
  renderClients(); renderCrm(); renderTabs();
  window.alert('Added ' + rows.length + '. They are ordinary CRM rows now — give them an owner.');
}

/* ══════════════════════════════════════════════════════════════════════
   SEEDING FROM THE BROWSER
   ══════════════════════════════════════════════════════════════════════
   npm run seed:apply needs FIREBASE_SERVICE_ACCOUNT, and this Google Cloud
   organisation enforces constraints/iam.disableServiceAccountKeyCreation —
   downloadable keys are refused org-wide. That policy is a hardening default
   doing its job, and lifting it to run a one-off seed would be the wrong
   trade.

   It is also unnecessary. omega_orgs create/update, billing/* and
   tenant_public all say `if isAdmin()`, and a signed-in ClearSky address
   already satisfies isAdmin(). Every document the CLI seed writes is a
   document this console is already permitted to write. So it writes them
   from here, as you, through the same rules that govern everything else on
   this page — no key, no policy exemption, no second credential to store.

   IDENTICAL OUTPUT. admin/seed-plan.json is generated from
   tenants/<slug>/tenant.json by the same plan() the CLI uses, so both paths
   produce the same documents. Regenerate it whenever a tenant.json changes.

   WHAT IT DOES NOT DO: custom claims. setCustomUserClaims is Admin SDK only
   and has no client equivalent, so owners are not minted here. That matters
   for Storage rules and api/ functions reading request.auth.token.role — set
   those through /api/set-role once a credential exists. Nothing else in the
   control plane depends on it.

   MERGE, NEVER OVERWRITE. Every write is { merge: true }, so a tier somebody
   has already set by hand survives a re-run. Seeding twice is safe. */
function seedTenantsFromBrowser(){
  var btn = document.getElementById('tn-seed-btn');
  function say(m){ var e=document.getElementById('tn-seed-msg'); if(e) e.textContent=m; }

  fetch('/admin/seed-plan.json').then(function(r){
    if(!r.ok) throw new Error('seed-plan.json '+r.status);
    return r.json();
  }).then(function(m){
    var plans = m.plans || [], skipped = m.skipped || [];
    var msg = 'Seed ' + plans.length + ' tenant' + (plans.length===1?'':'s') + ' into omega_orgs?\n\n'
            + plans.map(function(p){ return '\u00b7 ' + p.orgId + '  (' + p.org.slug + ', ' + p.billing.tier + ')'; }).join('\n');
    if (skipped.length){
      msg += '\n\nHELD BACK \u2014 no orgId decided:\n'
           + skipped.map(function(x){ return '\u00b7 ' + x.slug + '  ' + (x.hosts||[]).join(', '); }).join('\n');
    }
    msg += '\n\nExisting values are preserved (merge). Safe to run twice.';
    if (!window.confirm(msg)) return null;

    if (btn) btn.disabled = true;
    say('Writing…');
    var FV = firebase.firestore.FieldValue, done = 0, failed = [];

    /* One tenant at a time rather than a batch: a batch is atomic, so a
       single bad document rolls back the eleven good ones and you learn
       nothing about which was bad. Sequential writes tell you exactly where
       it stopped. */
    return plans.reduce(function(chain, p){
      return chain.then(function(){
        var ref = db.collection('omega_orgs').doc(p.orgId);
        var stamped = Object.assign({}, p.org, { seededAt: FV.serverTimestamp(),
                                                 seededBy: (currentUser && currentUser.email) || 'console' });
        return ref.set(stamped, { merge:true })
          .then(function(){ return ref.collection('billing').doc('current').set(p.billing, { merge:true }); })
          .then(function(){
            var hosts = (p.pub.domains || []).filter(Boolean);
            return hosts.reduce(function(c, h){
              return c.then(function(){
                return db.collection('tenant_public').doc(h).set(p.pub, { merge:true });
              });
            }, Promise.resolve());
          })
          .then(function(){ done++; say('Writing… ' + done + '/' + plans.length); })
          .catch(function(e){ failed.push(p.orgId + ': ' + (e.message||e)); });
      });
    }, Promise.resolve()).then(function(){
      if (btn) btn.disabled = false;
      say(done + ' seeded' + (failed.length ? (', ' + failed.length + ' failed') : '') + '.');
      if (failed.length) window.alert('Some tenants failed:\n\n' + failed.join('\n'));
      loadTenants();
    });
  }).catch(function(e){
    if (btn) btn.disabled = false;
    say('Could not seed \u2014 ' + (e.message||e));
  });
}

function renderTenants(){
  var rows = STATE.tenants || [];
  var cnt=document.getElementById('tn-count'); if(cnt) cnt.textContent=rows.length;

  var pending = rows.filter(function(r){ return (r.status||'')==='pending'; });
  var pw=document.getElementById('tn-pending-wrap');
  if (pw){
    pw.style.display = pending.length ? '' : 'none';
    var pc=document.getElementById('tn-pending-count'); if(pc) pc.textContent=pending.length;
    document.getElementById('tn-pending').innerHTML = pending.map(function(r){
      return '<div class="info-card"><div class="ic-top"><div>'
        + '<div class="ic-name">'+esc(r.name||r._id)+'</div>'
        + '<div class="ic-sub">'+esc(r._id)+(r.vertical?' · '+esc(r.vertical):'')+'</div></div>'
        + '<span class="chip warn">pending</span></div>'
        + '<div class="ic-actions">'
        + '<button onclick="tenantAction(&quot;'+esc(r._id)+'&quot;,&quot;approve&quot;)">Approve</button>'
        + '<button class="danger" onclick="tenantAction(&quot;'+esc(r._id)+'&quot;,&quot;reject&quot;)">Reject</button>'
        + '</div></div>';
    }).join('');
  }

  var counts={all:rows.length};
  rows.forEach(function(r){ var k=_standing(r._bill,r).key; counts[k]=(counts[k]||0)+1; });
  var pills=[['all','All'],['overdue','Overdue'],['duesoon','Due soon'],['trialend','Trial ending'],
             ['unpriced','Not priced'],['current','Current']];
  var fh=pills.map(function(f){
    var n=counts[f[0]]||0;
    return '<button class="fpill'+(tnFilter===f[0]?' on':'')+'" onclick="setTnFilter(&quot;'+f[0]+'&quot;)">'
         + f[1]+(n?(' '+n):'')+'</button>';
  }).join('');

  if (!rows.length){
    document.getElementById('tn-body').innerHTML =
        '<div class="empty" style="padding:26px">'
      +   '<div style="margin-bottom:6px"><b>No tenants yet.</b></div>'
      +   '<div class="sub-txt" style="margin-bottom:14px">omega_orgs is empty. Seed it from '
      +     'tenants/<slug>/tenant.json \u2014 written as you, through the same rules as everything '
      +     'else here. No service account needed.</div>'
      +   '<button id="tn-seed-btn" onclick="seedTenantsFromBrowser()">Seed tenants from tenant.json</button>'
      +   ' <span id="tn-seed-msg" class="sub-txt"></span>'
      + '</div>';
    return;
  }

  var shown = rows.filter(function(r){ return tnFilter==='all' || _standing(r._bill,r).key===tnFilter; });

  var html = '<div class="filter-row">'+fh+'</div>'
    + '<div style="display:flex;gap:8px;align-items:center;margin:0 0 12px">'
    + '<button class="btn-ghost" onclick="openBroadcast()">\u2709 Message '
    +   (tnFilter==='all'?'all tenants':('the '+esc(tnFilter)+' list'))+'</button>'
    + '<span class="sub-txt">'+shown.length+' shown</span></div>';

  /* .table-wrap + .ptable are what every other table on this page uses. The
     previous markup asked for .tbl, which has no rule anywhere in this
     stylesheet, so the tenants list rendered as unstyled text while the tabs
     either side of it looked finished. */
  html += '<div class="table-wrap"><table class="ptable"><thead><tr>'
       +  '<th>Tenant</th><th>orgId</th><th>Plan</th><th>Standing</th><th>Account</th><th>Actions</th>'
       +  '</tr></thead><tbody>';
  shown.forEach(function(r){
    var st=r.status||'active', bill=r._bill||{}, sd=_standing(bill,r);
    var due = bill.subscriptionDue ? ('due '+esc(bill.subscriptionDue)) : '';
    var amt = (Number(bill.amountDue||0)>0) ? ('$'+Number(bill.amountDue).toLocaleString()) : '';
    var sub = [due,amt].filter(Boolean).join(' \u00b7 ');
    html += '<tr><td class="site-nm">'+esc(r.name||r._id)+'</td>'
         +  '<td class="sub-txt">'+esc(r._id)+'</td>'
         +  '<td>'+esc(bill.tier||'\u2014')+'</td>'
         +  '<td><span class="chip '+sd.chip+'">'+esc(sd.label)+'</span>'
         +    (sub?('<div class="sub-txt">'+sub+'</div>'):'')+'</td>'
         +  '<td><span class="chip '+_tnStatusChip(st)+'">'+esc(st)+'</span></td>'
         +  '<td style="white-space:nowrap">'
         +  (st==='suspended'
              ? '<button class="btn-ghost" onclick="tenantAction(&quot;'+esc(r._id)+'&quot;,&quot;reactivate&quot;)">Reactivate</button>'
              : '<button class="btn-ghost" onclick="tenantAction(&quot;'+esc(r._id)+'&quot;,&quot;suspend&quot;)">Suspend</button>')
         +  ' <button class="btn-ghost" onclick="openTenantDetail(&quot;'+esc(r._id)+'&quot;)">Manage</button>'
         +  ' <button class="btn-ghost" onclick="openBroadcast(&quot;'+esc(r._id)+'&quot;)">Message</button>'
         +  '</td></tr>'
         +  '<tr id="tn-users-'+esc(r._id).replace(/[^A-Za-z0-9_-]/g,'_')+'" style="display:none"><td colspan="6" style="background:#F7F9FB"></td></tr>';
  });
  document.getElementById('tn-body').innerHTML = html+'</tbody></table></div>';
}

/* ── MESSAGING TENANTS ────────────────────────────────────────────────────
   Writes omega_orgs/{orgId}/notifications, which the rules already let
   isAdmin() create and the tenant mark read. No service account needed: this
   is a client write governed by the same rules as everything else on this
   page, which is why it works before the API layer is configured.

   ONE DOCUMENT PER TENANT, not one broadcast document everyone reads. A
   shared row would have to be readable across orgs, and the whole isolation
   model here is that a tenant reads only under their own org. */
function openBroadcast(orgId){
  var targets;
  if (orgId){ targets=[orgId]; }
  else {
    var rows=(STATE.tenants||[]).filter(function(r){
      return tnFilter==='all' || _standing(r._bill,r).key===tnFilter; });
    targets=rows.map(function(r){ return r._id; });
  }
  if (!targets.length){ window.alert('No tenants in this list.'); return; }

  var who = orgId ? orgId : (targets.length+' tenant'+(targets.length===1?'':'s')+' ('+tnFilter+')');
  var title = window.prompt('Subject — sent to '+who, '');
  if (!title) return;
  var body = window.prompt('Message body', '');
  if (body === null) return;

  var FV = firebase.firestore.FieldValue;
  var batch = db.batch();
  targets.forEach(function(t){
    var ref = db.collection('omega_orgs').doc(t).collection('notifications').doc();
    batch.set(ref, {
      kind: 'message', title: title, body: body || '',
      from: (currentUser && currentUser.email) || 'ClearSky',
      read: false, createdAt: FV.serverTimestamp()
    });
  });
  batch.commit()
    .then(function(){ window.alert('Sent to '+targets.length+' tenant'+(targets.length===1?'':'s')+'.'); })
    .catch(function(e){ window.alert('Could not send:\n\n'+(e.message||e)); });
}

function tenantAction(orgId, action){
  var verb = { approve:'approve', reject:'REJECT', suspend:'SUSPEND', reactivate:'reactivate' }[action]||action;
  /* Reject and suspend are the two that a customer feels immediately, so they
     are the two that ask. Approve is additive and reversible by suspending. */
  if ((action==='reject'||action==='suspend') &&
      !window.confirm('This will '+verb+' '+orgId+' for every user on it. Continue?')) return;
  _authedPost('/api/tenant-approve', { orgId:orgId, action:action })
    .then(function(){ loadTenants(); })
    .catch(function(e){ window.alert('Could not '+action+' '+orgId+':\n\n'+(e.message||e)); });
}

/* ── TENANT DETAIL ────────────────────────────────────────────────────────
   Everything about one tenant in one place, because the alternative is what
   this console had: a hand-kept inventory row that no rule reads, and the real
   record spread across Firestore, Firebase Auth and Stripe with no screen
   showing all three.

   Billing and the account operations go through /api. The rules would permit a
   direct write for billing, but the endpoint allow-lists the fields and writes
   an audit row — billing you can edit without a trace is not billing anyone
   can defend later. Password resets and email changes act on Firebase Auth,
   which rules cannot express at all. */
function openTenantDetail(orgId){
  var rowId='tn-users-'+orgId.replace(/[^A-Za-z0-9_-]/g,'_');
  var tr=document.getElementById(rowId); if(!tr) return;
  if (tr.style.display!=='none'){ tr.style.display='none'; return; }
  tr.style.display='';
  var cell=tr.firstChild;
  cell.innerHTML='<div class="sub-txt">Loading '+esc(orgId)+'…</div>';

  var org=(STATE.tenants||[]).filter(function(t){return t._id===orgId;})[0]||{};

  Promise.all([
    db.collection('omega_orgs').doc(orgId).collection('billing').doc('current').get()
      .then(function(d){ return d.exists?d.data():{}; }).catch(function(){ return {}; }),
    db.collection('omega_orgs').doc(orgId).collection('members').get()
      .then(function(sn){ var out=[]; sn.forEach(function(d){ var m=d.data()||{}; m._id=d.id; out.push(m); }); return out; })
      .catch(function(){ return []; }),
    /* Counted on open, never on the table render — one query per tenant is
       fine when somebody asks for it and thirteen on every page load is not. */
    db.collection('projects').where('orgId','==',orgId).get()
      .then(function(sn){ return sn.size; }).catch(function(){ return null; }),
    /* Who has ACTUALLY signed in. team_members has been recording people since
       long before omega_orgs existed, and it is keyed by email. The control
       plane keys members by uid, which only the Admin SDK can resolve from an
       email — so this is shown, not silently merged. */
    db.collection('team_members').where('orgId','==',orgId).get()
      .then(function(sn){ var o=[]; sn.forEach(function(d){ o.push(d.data()||{}); }); return o; })
      .catch(function(){ return []; })
  ]).then(function(r){
    var bill=r[0], members=r[1], projects=r[2], seen=r[3];
    cell.innerHTML = _tnDetailHtml(orgId, org, bill, members, projects, seen);
  }).catch(function(e){
    cell.innerHTML='<div class="sub-txt">Could not load '+esc(orgId)+' — '+esc(e.message||'denied')+'</div>';
  });
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
  h+='</div>';

  /* ── Identity & usage ── */
  h+='<div><div class="block-title" style="font-size:13px;margin-bottom:8px">Identity &amp; usage</div>';
  h+=_tnField('Display name','tb-name-'+orgId,org.name||'','text','');
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
     was shown the OSA link. */
  h+='<div class="block-title" style="font-size:13px;margin:16px 0 8px">Relationship</div>';
  h+='<label class="sub-txt" style="display:block;margin-bottom:6px">'
   + '<input type="checkbox" id="tb-osa-'+esc(orgId)+'"'+(org.osaMember===true?' checked':'')+'> '
   + 'OSA member \u2014 may enter the OSA workspace</label>';
  h+='<label class="sub-txt" style="display:block;margin-bottom:8px">'
   + '<input type="checkbox" id="tb-jd-'+esc(orgId)+'"'+(org.jdPartner===true?' checked':'')+'> '
   + 'JD partner \u2014 joint development agreement, sees JD Partners only</label>';
  h+='<button onclick="saveTenantRelationship(&quot;'+esc(orgId)+'&quot;)">Save relationship</button>';
  h+=' <span id="tbrel-msg-'+esc(orgId)+'" class="sub-txt"></span>';
  h+='<div style="display:flex;gap:18px;margin-top:14px">'
   + '<div><div class="sub-txt">People</div><div style="font:700 20px system-ui">'+_peopleCount(members,seen)+'</div></div>'
   + '<div><div class="sub-txt">Projects</div><div style="font:700 20px system-ui">'+(projects==null?'—':projects)+'</div></div>'
   + '<div><div class="sub-txt">Vertical</div><div style="font:700 20px system-ui">'+esc(org.vertical||'—')+'</div></div>'
   + '</div>';
  h+='<div class="sub-txt" style="margin-top:10px">Hostnames: '+esc((org.domains||[]).join(', ')||'—')+'</div>';
  h+='</div></div>';

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

function saveTenantBilling(orgId){
  var msg=document.getElementById('tb-msg-'+orgId);
  function v(id){ var el=document.getElementById(id+'-'+orgId); return el?String(el.value||'').trim():''; }
  var addons=v('tb-addons').split(',').map(function(x){return x.trim();}).filter(Boolean);

  var allow = v('tb-allow').split(',').map(function(x){return x.trim();}).filter(Boolean);
  var patch={ tier:v('tb-tier'), addons:addons, capTier: v('tb-cap') || null,
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
function saveTenantRelationship(orgId){
  var msg=document.getElementById('tbrel-msg-'+orgId);
  var osa=document.getElementById('tb-osa-'+orgId);
  var jd =document.getElementById('tb-jd-'+orgId);
  if(msg) msg.textContent='Saving...';
  db.collection('omega_orgs').doc(orgId).set({
    osaMember: !!(osa&&osa.checked),
    jdPartner: !!(jd&&jd.checked)
  }, { merge:true })
    .then(function(){ if(msg) msg.textContent='Saved - takes effect at their next sign-in.'; loadTenants(); })
    .catch(function(e){ if(msg) msg.textContent='Failed - '+(e.message||e); });
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

/* ── QUICKBOOKS: NOT CONNECTED ────────────────────────────────────────────
   Deliberately inert. Rendering sample invoices to "show the shape" is the
   one thing an accounting screen must never do — a placeholder that looks
   like data eventually gets reconciled against, and by then nobody remembers
   it was a mock.

   What it is waiting on is a decision, not code:

     · DIRECTION. Push OMEGA invoices INTO QuickBooks, or pull payment status
       OUT of it? They are different integrations. Push means OMEGA is the
       system of record for what a tenant owes and QBO is the ledger. Pull
       means QBO is the record and OMEGA displays it. Building both is how you
       get two sources of truth for the same number.
     · An Intuit app registration (client id + secret, as Vercel env vars) and
       the target Realm/Company ID.
     · Sandbox or production. Intuit's sandbox uses different hosts entirely,
       so this is not a flag flipped later.

   Stripe already answers "what was billed and what was paid" through
   /api/stripe-invoices. QuickBooks earns its place only if ClearSky's books
   need the entries, which is an accounting decision rather than a product
   one. */
function renderQuickBooks(){
  var host = document.getElementById('qb-panel');
  if (!host) return;
  host.innerHTML =
      '<div class="info-card">'
    +   '<div class="ic-top"><div>'
    +     '<div class="ic-name">QuickBooks Online</div>'
    +     '<div class="ic-sub">No connection configured</div>'
    +   '</div><span class="chip neutral">not connected</span></div>'
    +   '<div class="ic-body">'
    +     '<div style="margin-bottom:8px">Before this can be switched on, three things have to be settled:</div>'
    +     '<div class="sub-txt">1 &#183; <b>Direction.</b> Push OMEGA invoices into QuickBooks, or pull payment status out of it? Different integrations \u2014 building both gives the same number two sources of truth.</div>'
    +     '<div class="sub-txt">2 &#183; <b>Intuit app.</b> Client id and secret as Vercel environment variables, plus the Realm / Company ID to write against.</div>'
    +     '<div class="sub-txt">3 &#183; <b>Sandbox or production.</b> Intuit uses different hosts for each, so it is not a flag flipped later.</div>'
    +   '</div>'
    +   '<div class="ic-tags"><span class="chip neutral">Stripe covers invoices today</span></div>'
    +   '<div class="ic-actions"><button disabled title="Needs an Intuit app registration first">Connect QuickBooks</button></div>'
    + '</div>';
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

/* ── Import / Update Applications — publish catalog to Firestore. ADMIN ONLY. ── */
function publishApps(){
  if (currentRole !== 'admin'){ toast('Only ClearSky admins can publish the catalog.'); return; }
  var btn = document.getElementById('apps-import-btn');
  if (!db || !currentUser){ toast('Sign in first.'); return; }
  if (btn){ btn.disabled = true; btn.textContent = 'Publishing…'; }
  OMEGATools.publishToFirestore(db, firebase).then(function(){
    return db.collection('meta').doc('tools').set({
      publishedAt: firebase.firestore.FieldValue.serverTimestamp(),
      publishedBy: currentUser.email || currentUser.uid,
      count: OMEGATools.SEED_TOOLS.length
    }, { merge:true });
  }).then(function(){
    toast('<b>'+OMEGATools.SEED_TOOLS.length+' applications</b> published to all portals.');
    if (btn){ btn.disabled = false; btn.textContent = '\u21bb Import / Update Applications'; }
    _showPublishedNote();
  })['catch'](function(e){
    toast('Publish failed: '+esc(e.message));
    if (btn){ btn.disabled = false; btn.textContent = '\u21bb Import / Update Applications'; }
  });
}

function _showPublishedNote(){
  var note = document.getElementById('apps-published-note');
  if (!note || !db) return;
  db.collection('meta').doc('tools').get().then(function(snap){
    if (!snap.exists){ note.textContent = ' · Not yet published.'; return; }
    var d = snap.data();
    var when = (d.publishedAt && d.publishedAt.toDate) ? d.publishedAt.toDate().toLocaleString() : '—';
    note.textContent = ' · Last published ' + when + ' (' + (d.count||0) + ' apps).';
  })['catch'](function(){});
}

/* ── Populate the Improvement "Tool" dropdown from the registry ── */
function fillImproveToolOptions(){
  var sel = document.getElementById('im-tool');
  if (!sel) return;
  var tools = OMEGATools.all();
  var html = '';
  for (var i=0;i<tools.length;i++){ html += '<option>'+esc(tools[i].name)+'</option>'; }
  html += '<option>Editor / SiteMap Designer</option><option>Platform / Other</option>';
  sel.innerHTML = html;
}

/* ── Recent ClearSky projects (live Firestore, scoped to ClearSky org) ── */
function loadRecentProjects(){
  var container = document.getElementById('apps-recent');
  if (!db || !currentUser){ container.innerHTML = '<div class="empty">Sign in to load projects.</div>'; return; }
  container.innerHTML = '<div class="loading"><div class="spin"></div> Loading projects…</div>';

  // Admins see EVERY project across all orgs (their own site maps live under
  // whichever tenant portal they were created in — NextNRG, Solela, ClearSky,
  // etc.). Non-admins only see their own org's projects. The Firestore rules
  // allow the cross-org read only for isAdmin() accounts, so this is safe.
  var _email = (currentUser.email || '').toLowerCase();
  var _isAdmin = /@(clearsky-usa|csebuilders)\.com$/.test(_email);
  // Collaborators (sunesol.com, ogisolar.com) get read-only visibility into
  // every project too. Firestore rules gate this cross-org read on
  // isConsoleViewer(), which covers admins + these collaborator domains.
  var _canViewAll = _isAdmin || /@(sunesol|ogisolar)\.com$/.test(_email);

  var q = _canViewAll
    ? db.collection('projects').orderBy('updatedAt','desc').limit(60)
    : db.collection('projects').where('orgId','==',clearskyOrg()).orderBy('updatedAt','desc').limit(30);

  q.get()
    .then(function(snap){
      document.getElementById('apps-proj-count').textContent = snap.size;
      if (snap.empty){ container.innerHTML = '<div class="empty">No projects yet. Create your first site map above.</div>'; return; }
      var cards='';
      snap.forEach(function(doc){
        var d=doc.data();
        var date = (d.updatedAt && d.updatedAt.toDate) ? d.updatedAt.toDate().toLocaleDateString() : '—';
        var tags = [d.type || 'BESS'];
        if (d.bessList && d.bessList.length) tags.push(d.bessList.length + ' BESS unit(s)');
        // For admins, show which org/tenant the project belongs to so you can
        // tell your NextNRG / Solela / ClearSky projects apart at a glance.
        if (_canViewAll && d.orgId) tags.unshift(d.orgId);
        var tagHtml=''; for (var t=0;t<tags.length;t++){ tagHtml += '<span class="pc-tag">'+esc(tags[t])+'</span>'; }
        cards += '<a class="proj-card" onclick="openProject(&quot;'+doc.id+'&quot;)">'
          + '<div class="pc-name">'+esc(d.name||'Untitled')+'</div>'
          + '<div class="pc-addr">'+esc(d.address||'No address')+'</div>'
          + '<div class="pc-meta">'+tagHtml+'</div>'
          + '<div class="pc-date">Updated '+date+'</div></a>';
      });
      container.innerHTML = '<div class="proj-grid">'+cards+'</div>';
    })['catch'](function(e){
      console.error('Error loading projects:', e);
      container.innerHTML = '<div class="empty">Error loading projects. Check Firestore rules.</div>';
    });
}

/* ── New project flow (creates under ClearSky org, opens editor) ── */
var newProjType = 'bess';
function openNewProjectModal(type){
  newProjType = type || 'bess';
  document.getElementById('np-type').value = newProjType;
  document.getElementById('new-proj-modal').className = 'modal-bg on';
  setTimeout(function(){ document.getElementById('np-name').focus(); }, 100);
}
function closeNewProjectModal(){ document.getElementById('new-proj-modal').className = 'modal-bg'; }
function createProject(){
  var name = document.getElementById('np-name').value.trim();
  var addr = document.getElementById('np-addr').value.trim();
  var type = document.getElementById('np-type').value;
  var client = document.getElementById('np-client').value.trim();
  if (!name){ alert('Please enter a project name.'); return; }
  if (!db || !currentUser){ alert('Not signed in.'); return; }
  db.collection('projects').add({
    uid: currentUser.uid,
    orgId: clearskyOrg(),
    name:name, address:addr, type:type, client:client,
    stage:'candidate',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    elements:[], conduits:[], bessList:[], annotations:[]
  }).then(function(ref){
    closeNewProjectModal();
    openProject(ref.id);
  })['catch'](function(e){ alert('Error creating project: ' + e.message); });
}
function openProject(id){ window.location.href = '/editor.html?id=' + id; }

/* ══════════════════════════════════════════════════════════════════════
   TOOL IMPROVEMENT BOARD  —  shared bug/feature tracker for you + partners.
   Every item is attributed to the signed-in reporter so you always know who
   filed it and who's working it.
   ══════════════════════════════════════════════════════════════════════ */
var impFilter = 'all';
function impTypeLabel(t){ return {bug:'Bug',feature:'Feature',improve:'Improvement',idea:'Idea'}[t]||t; }
function impTypeChip(t){ return {bug:'red2',feature:'blue2',improve:'gold2',idea:'gray'}[t]||'gray'; }
function impPriLabel(p){ return {p1:'P1',p2:'P2',p3:'P3',p4:'P4'}[p]||p; }
function impStatusLabel(s){ return {open:'Open',progress:'In Progress',review:'In Review',shipped:'Shipped',wontfix:"Won't Fix"}[s]||s; }
function impStatusDot(s){
  var map={open:'building',progress:'degraded',review:'building',shipped:'up',wontfix:'paused'};
  return '<span class="sdot '+(map[s]||'paused')+'"><i></i>'+impStatusLabel(s)+'</span>';
}
function impPriChip(p){
  var cls={p1:'red',p2:'gold',p3:'blue',p4:'gray'}[p]||'gray';
  return '<span class="chip pri-'+cls+'">'+impPriLabel(p)+'</span>';
}

function renderImprove(){
  document.getElementById('imp-count').textContent = STATE.improvements.length;
  var arr = STATE.improvements;
  var open=0, prog=0, shipped=0, bugs=0;
  for (var i=0;i<arr.length;i++){
    var s=arr[i].status;
    if (s==='open') open++; else if (s==='progress'||s==='review') prog++; else if (s==='shipped') shipped++;
    if (arr[i].type==='bug' && s!=='shipped' && s!=='wontfix') bugs++;
  }
  document.getElementById('imp-kpis').innerHTML = kpiHtml([
    { l:'Open Items', v:open, cls:'', foot:'awaiting work' },
    { l:'In Progress', v:prog, cls:'blue', foot:'being worked' },
    { l:'Open Bugs', v:bugs, cls:(bugs>0?'red':''), foot:'not yet fixed' },
    { l:'Shipped', v:shipped, cls:'green', foot:'done' }
  ]);

  var filters=[['all','All'],['open','Open'],['progress','In Progress'],['shipped','Shipped'],['bug','Bugs'],['feature','Features']];
  var fh='';
  for (var f=0;f<filters.length;f++){ fh+='<button class="fpill'+(impFilter===filters[f][0]?' on':'')+'" onclick="setImpFilter(&quot;'+filters[f][0]+'&quot;)">'+filters[f][1]+'</button>'; }
  document.getElementById('imp-filters').innerHTML=fh;

  // sort: open/in-progress first, then by priority, newest first
  var order={open:0,progress:1,review:2,shipped:4,wontfix:5};
  var sorted = arr.slice().sort(function(a,b){
    var oa=order[a.status]==null?3:order[a.status], ob=order[b.status]==null?3:order[b.status];
    if (oa!==ob) return oa-ob;
    if (a.priority!==b.priority) return a.priority<b.priority?-1:1;
    return (b.at||0)-(a.at||0);
  });

  var rows='';
  for (var j=0;j<sorted.length;j++){
    var it=sorted[j];
    if (impFilter==='open' && it.status!=='open') continue;
    if (impFilter==='progress' && !(it.status==='progress'||it.status==='review')) continue;
    if (impFilter==='shipped' && it.status!=='shipped') continue;
    if (impFilter==='bug' && it.type!=='bug') continue;
    if (impFilter==='feature' && it.type!=='feature') continue;
    rows += '<tr class="clickable" onclick="openImproveEdit(&quot;'+it.id+'&quot;)">'
      + '<td class="site-nm">'+esc(it.title)+(it.detail?'<div class="sub-txt">'+esc(truncate(it.detail,70))+'</div>':'')+'</td>'
      + '<td class="sub-txt">'+esc(it.tool)+'</td>'
      + '<td><span class="chip '+impTypeChip(it.type)+'">'+impTypeLabel(it.type)+'</span></td>'
      + '<td>'+impPriChip(it.priority)+'</td>'
      + '<td>'+impStatusDot(it.status)+'</td>'
      + '<td class="sub-txt">'+esc(it.reporter||'—')+'</td>'
      + '<td class="sub-txt">'+esc(it.assignee||'—')+'</td>'
      + '<td class="sub-txt">'+timeAgo(it.at)+'</td></tr>';
  }
  document.getElementById('imp-body').innerHTML = rows || '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--cs-sub)">No items match this filter.</td></tr>';
}
function setImpFilter(f){ impFilter=f; renderImprove(); }

function meName(){ return (currentUser && (currentUser.displayName || currentUser.email)) ? (currentUser.displayName || currentUser.email).split(' ')[0] : 'me'; }
function meEmail(){ return currentUser ? (currentUser.email||'') : ''; }

function openImproveModal(){
  fillImproveToolOptions();
  setVal('im-title',''); setVal('im-tool','BESS Pro Forma'); setVal('im-type','bug'); setVal('im-priority','p2'); setVal('im-assignee',''); setVal('im-detail','');
  openModal('improve-modal');
}
function saveImprove(){
  var title=val('im-title').trim(); if(!title){ alert('Enter a title.'); return; }
  var obj={ id:'i-'+Date.now(), title:title, tool:val('im-tool'), type:val('im-type'), priority:val('im-priority'),
    status:'open', reporter:meName(), reporterEmail:meEmail(), assignee:val('im-assignee').trim(), detail:val('im-detail').trim(), at:Date.now(), comments:[] };
  STATE.improvements.push(obj);
  persist('improvements'); closeModal('improve-modal'); renderImprove(); renderOverview(); renderTabs(); toast('Item filed.');
}

var editingImpId=null;
function findImp(id){ for(var i=0;i<STATE.improvements.length;i++){ if(STATE.improvements[i].id===id) return STATE.improvements[i]; } return null; }
function openImproveEdit(id){
  var it=findImp(id); if(!it) return;
  editingImpId=id;
  document.getElementById('ie-sub').textContent = it.title + ' · ' + it.tool + ' · filed by ' + (it.reporter||'—');
  setVal('ie-status',it.status); setVal('ie-priority',it.priority); setVal('ie-assignee',it.assignee||''); setVal('ie-comment','');
  openModal('improve-edit-modal');
}
function saveImproveEdit(){
  var it=findImp(editingImpId); if(!it) return;
  it.status=val('ie-status'); it.priority=val('ie-priority'); it.assignee=val('ie-assignee').trim(); it.at=Date.now();
  var c=val('ie-comment').trim();
  if (c){ if(!it.comments) it.comments=[]; it.comments.push({ by:meName(), text:c, at:Date.now() }); }
  persist('improvements'); closeModal('improve-edit-modal'); renderImprove(); renderOverview(); toast('Item updated.');
}
function deleteImprove(){
  if (!confirm('Delete this item?')) return;
  STATE.improvements = STATE.improvements.filter(function(x){ return x.id!==editingImpId; });
  persist('improvements'); closeModal('improve-edit-modal'); renderImprove(); renderOverview(); renderTabs(); toast('Item deleted.');
}

/* ══════════ BOOT ══════════ */
if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', _initFirebase); }
else { _initFirebase(); }
