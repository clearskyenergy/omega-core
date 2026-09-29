/* ═══════════════════════════════════════════════════════════════════════
   admin/admin-shared.js — the rules the admin console and the account page share
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   ONE copy of what both pages read (2026-09-28, Tommy: "i should click an
   account and it opens a page for them so i can manage them and edit them
   and see if they paid"): who may open the console, a workspace's STANDING
   (current, awaiting its first payment, overdue, on a trial), the price
   book's words for a package, the status chip, the account operations that
   post to tenant-approve, the message to a tenant, and how a signup in
   progress reads. Loaded before admin-console.js on /admin/ and before
   account.js on /admin/account.html. ES5, globals, as the console has
   always been; the functions moved here unchanged from admin-console.js.
   ═══════════════════════════════════════════════════════════════════════ */

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

/* ── helpers ── */
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function timeAgo(ts){
  if (!ts) return '—';
  var d = Math.floor((Date.now()-ts)/1000);
  if (d<60) return 'just now';
  if (d<3600) return Math.floor(d/60)+'m ago';
  if (d<86400) return Math.floor(d/3600)+'h ago';
  return Math.floor(d/86400)+'d ago';
}

function toast(html){ var t=document.getElementById('toast'); t.innerHTML=html; t.className='toast show'; clearTimeout(window._tt); window._tt=setTimeout(function(){ t.className='toast'; },2600); }

/* ── SAYING WHY, IN THE ONE PLACE THAT NEEDS IT ────────────────────────────
   "Contact your account administrator" is the right answer on a customer's
   sign-in screen. It is the wrong answer here: this console IS the account
   administrator, and telling them to contact themselves hides the only fact
   that would let them act. The first provisioning failure said exactly that
   and nobody could tell whether it was a permission, a bad field or a
   timeout.

   So: the reason, verbatim — these endpoints answer in their own plain words
   ("ClearSky staff only", "orgId must be an email domain"), not in vendor
   codes. scrub() is still applied, so if an unexpected 500 surfaces a
   Firebase string it is replaced rather than printed. The rule was never
   "hide the cause"; it was "never show the vendor's words to a customer". */
function adminFail(what, e){
  var why = (e && e.message) ? String(e.message) : '';
  if (typeof OmegaAuthError !== 'undefined') why = OmegaAuthError.scrub(why);
  window.alert('Could not ' + what + '.\n\n' + (why || 'No reason was returned.')
    + '\n\nNothing was changed. The console log has the full response.');
  try { console.error('[admin] ' + what + ' failed:', e); } catch(_){}
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

function _tnStatusChip(st){
  return st==='active' ? 'good' : st==='pending' ? 'warn'
       : st==='suspended' ? 'bad' : st==='cancelled' ? 'bad' : 'neutral';
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
  if (bill && bill.packaged === true) {
    /* A PACKAGED workspace is judged by its state machine (api/_lib/package-billing.js),
       never by the legacy due date. Each state has its own key so the pills,
       the filter and the broadcast list agree; the label says what a person
       does next. */
    var ps = bill.packagingState, DAYp = 86400000, nowp = Date.now();
    /* a reconciliation a person has to look at: access is unchanged (the engine never cuts it for our own bookkeeping), the chip says so */
    if (bill.reconciliationRequired === true) return { key: 'review', chip: 'warn', label: (ps === 'paid' ? 'Active · ' : '') + 'Accounting review' };
    if (bill.reissueRequired === true) return { key: 'overdue', chip: 'bad', label: 'First invoice voided' };
    if (ps === 'paid') {
      var nxt = bill.nextInvoiceOn ? Date.parse(bill.nextInvoiceOn) : NaN;
      if (!isNaN(nxt) && nxt - nowp < 14 * DAYp) return { key: 'duesoon', chip: 'good', label: 'Active · invoice ' + bill.nextInvoiceOn };
      return { key: 'current', chip: 'good', label: 'Active' };
    }
    if (ps === 'trial') return { key: 'trialend', chip: 'warn', label: 'Trial ends ' + new Date(bill.trialEndsAt).toLocaleDateString() };
    if (ps === 'past_due_lite') return { key: 'overdue', chip: 'bad', label: 'Past due · Omega Design only' };
    if (ps === 'unpaid') return { key: 'overdue', chip: 'bad', label: 'Unpaid' };
    if (ps === 'awaiting_payment') return { key: 'awaiting', chip: 'warn', label: 'Awaiting first payment' };
    if (ps === 'pending' || (org && (org.status || '') === 'pending')) return { key: 'pending', chip: 'warn', label: 'Package proposed' };
    return { key: 'unpriced', chip: 'warn', label: 'Package review' };
  }

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

function _pkgPlanName(bill){
  var p = bill.plan || (bill.subscription && bill.subscription.plan) || (bill.proposedPackage && bill.proposedPackage.plan) || '';
  var book = STATE.priceBook, hit = book && book.plans ? book.plans.filter(function(x){ return x.key === p; })[0] : null;
  if (hit) return hit.name;
  return { alacarte: 'Lite + modules', field: 'Field', pro: 'Pro', enterprise: 'Enterprise' }[p] || (p ? String(p) : 'Lite + modules');
}

function _pkgModules(bill){ return (bill.subscription && Array.isArray(bill.subscription.modules)) ? bill.subscription.modules : Array.isArray(bill.modules) ? bill.modules : (bill.proposedPackage && bill.proposedPackage.modules) || []; }

function _pkgModuleNames(keys){
  var names = {}; ((STATE.priceBook && STATE.priceBook.modules) || []).forEach(function(m){ names[m.key] = m.name; });
  return (keys || []).map(function(k){ return names[k] || k; });
}


/* ── ONE PAGE PER ACCOUNT ──────────────────────────────────────────────────
   /admin/account.html?org= is where an account is managed: its status,
   whether it has paid, the package, billing, the people, the edits and the
   cancel. Every list on the console links there; a row click opens it. */
function _accountHref(orgId){ return '/admin/account.html?org=' + encodeURIComponent(String(orgId || '').toLowerCase()); }
function openAccount(ev, orgId){
  /* a button or link inside the row keeps its own job */
  var t = ev && ev.target; while (t && t.tagName) { if (/^(A|BUTTON|SELECT|INPUT|LABEL)$/.test(t.tagName)) return; t = t.parentNode; }
  location.href = _accountHref(orgId);
}

/* ── THE SIGNUP IN PROGRESS (2026-09-28) ──────────────────────────────────
   api/tenant-signup 'progress' keeps one access_requests row per account
   from the moment it is made on /start.html: source 'signup', the stage,
   the system chosen so far, priced by the server. The console lists it in
   the same queue as a request, in these words; the account page opens it
   by domain; the row leaves the queue (status 'converted') when the
   workspace is made, and the tenant record takes over. */
var SIGNUP_STAGES = { account: 'Creating the account', work: 'Choosing what their team does', system: 'Building their system',
                      verify: 'Confirming their email', billing: 'Entering billing', pay: 'Paying the first invoice', done: 'Workspace made' };
function _isSignup(r){ return !!(r && r.source === 'signup'); }
function _reqSignupLine(r, names){
  var s = (r && r.signup) || {}, parts = [SIGNUP_STAGES[s.stage] || 'Signing up'];
  names = names || function (keys) { return keys; };
  if (Array.isArray(s.modules) && s.modules.length) parts.push('System: ' + names(s.modules).join(', ') + (s.priceDisplay ? ' · ' + s.priceDisplay + (s.interval === 'annual' ? ' (yearly)' : '') : ''));
  else parts.push('No system chosen yet');
  if (s.emailVerified === false) parts.push('email not confirmed');
  if (s.updatedAt) parts.push('last step ' + String(s.updatedAt).slice(0, 10));
  return parts.join(' · ');
}

function tenantAction(orgId, action){
  var tenant = (STATE.tenants || []).filter(function (t) { return t._id === orgId; })[0];
  if (action === 'approve' && tenant && tenant._bill && tenant._bill.packaged === true) { location.href = _accountHref(orgId) + '#package-panel'; return; }
  var verb = { approve:'approve', reject:'REJECT', suspend:'SUSPEND', reactivate:'reactivate' }[action]||action;
  /* Reject and suspend are the two that a customer feels immediately, so they
     are the two that ask. Approve is additive and reversible by suspending. */
  if ((action==='reject'||action==='suspend') &&
      !window.confirm('This will '+verb+' '+orgId+' for every user on it. Continue?')) return;
  _authedPost('/api/tenant-approve', { orgId:orgId, action:action })
    .then(function(){ loadTenants(); })
    .catch(function(e){ window.alert(OmegaAuthError.opText(e, 'The ' + action + ' on ' + orgId)); });
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
    .catch(function(e){ window.alert(OmegaAuthError.opText(e, 'Sending')); });
}
