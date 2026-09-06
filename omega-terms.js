/* ══════════════════════════════════════════════════════════════════════════
   CLEARSKY-OMEGA · TERMS ACCEPTANCE GATE  (omega-terms.js)
   ------------------------------------------------------
   SHARED PLATFORM FILE — byte-identical across every tenant repo. Contains no
   customer name, domain, logo or colour; the tenant's name is read at runtime
   from OMEGA_WORKSPACE, exactly like omega-brand.js does it.

   WHAT THIS DOES
   Two layers, deliberately:

     1. A consent checkbox on the sign-up form. Visible, affirmative consent at
        the moment of account creation. This is the part people expect to see.

     2. A blocking gate after authentication, before the app renders. This is
        the part that actually enforces. The checkbox alone would be trivial to
        bypass and — more importantly — would miss two real cases:

          • Google sign-in. A first-time Google user never touches the sign-up
            form; they click one button and they are in.
          • Version bumps. Raising TERMS_VERSION re-prompts every existing user
            on their next load, which is how you roll out amended terms.

   WHAT MAKES IT COUNT
   Acceptance is written to Firestore at termsAcceptances/{uid} with the user,
   the org, the version accepted and a server timestamp. A checkbox that isn't
   recorded is close to worthless in a dispute — the record is the point. See
   the REQUIRED FIRESTORE RULE at the foot of this file; without it the write
   is denied and the gate fails closed (nobody gets in), which is the safe
   direction but will look like an outage.

   ⚠ NOT LEGAL ADVICE. The terms below are a standard SaaS starting point
   covering platform IP, licence scope, use restrictions, customer data, and
   the engineering-output disclaimer this product specifically needs. Have a
   lawyer review before it protects anything. Two placeholders are marked
   REVIEW: governing law/venue, and the notice address.
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /* Bump this to re-prompt every user on their next page load. Date form keeps
     it self-documenting; any string works as long as it changes. */
  var TERMS_VERSION = '2026-08-08';

  var PLATFORM = 'ClearSky-OMEGA';
  var COMPANY  = 'ClearSky Energy Solutions LLC';

  /* ── The terms ─────────────────────────────────────────────────────────
     Kept as data so the same text serves the modal, the printable view, and
     any future emailed copy. Tenant name is injected at render time. */
  function sections(clientName) {
    var you = clientName ? (clientName + ' ("Customer", "you")') : 'you ("Customer")';
    return [
      ['1. Agreement',
       'These Terms of Service govern access to and use of the ' + PLATFORM + ' platform '
       + '(the "Platform"), operated by ' + COMPANY + ' ("' + COMPANY + '", "we"). By creating an '
       + 'account, signing in, or using the Platform, ' + you + ' agrees to these terms. If you are '
       + 'accepting on behalf of an organisation, you represent that you are authorised to bind it. '
       + 'If you do not agree, do not create an account or use the Platform.'],

      ['2. Licence granted to you',
       'Subject to these terms and to payment of any applicable fees, we grant you a limited, '
       + 'non-exclusive, non-transferable, non-sublicensable, revocable licence to access and use the '
       + 'Platform for your internal business purposes during your subscription or trial period. '
       + 'No rights are granted other than those expressly stated here.'],

      ['3. Ownership of the Platform',
       'The Platform — including its software, source code, interfaces, tools, calculation methods, '
       + 'models, templates, layouts, workflows, documentation, designs, trade marks and all related '
       + 'intellectual property — is and remains the exclusive property of ' + COMPANY + ' and its '
       + 'licensors. This agreement is a licence to use, not a sale. Nothing in it transfers ownership '
       + 'of any part of the Platform to you. All rights not expressly granted are reserved.'],

      ['4. Your data and your outputs',
       'You retain ownership of the project data, site information, customer records and other '
       + 'content you upload or enter ("Customer Data"), and of the specific project deliverables the '
       + 'Platform generates from it for you. We claim no ownership of Customer Data. You grant us a '
       + 'limited licence to host, process, transmit and display Customer Data solely to provide, '
       + 'secure and support the Platform. Your ownership of a generated deliverable does not extend '
       + 'to the underlying templates, calculation methods or software that produced it, which remain '
       + 'ours under section 3.'],

      ['5. Restrictions',
       'You will not, and will not permit anyone else to: (a) copy, modify, translate or create '
       + 'derivative works of the Platform; (b) reverse engineer, decompile, disassemble or otherwise '
       + 'attempt to derive source code, calculation methods or model logic, except where that '
       + 'restriction is prohibited by law; (c) resell, sublicense, rent, lease, distribute or '
       + 'white-label the Platform, or provide it as a service to third parties; (d) use the Platform '
       + 'to build or assist in building a competing product or service, or to benchmark it for that '
       + 'purpose; (e) scrape, crawl or bulk-extract data, templates or content from the Platform by '
       + 'automated means; (f) remove, obscure or alter any proprietary notice, attribution or '
       + 'branding; (g) share account credentials, or allow access by anyone outside your organisation; '
       + 'or (h) use the Platform unlawfully, or in a way that impairs it for others.'],

      ['6. Confidentiality',
       'The Platform\u2019s non-public features, calculation methods, pricing, roadmap and any material '
       + 'marked or reasonably understood as confidential are our confidential information. You will '
       + 'protect it with at least the care you use for your own confidential information, and will '
       + 'not disclose it to third parties without our written consent. This survives termination.'],

      ['7. Trial accounts',
       'Trial access is provided for evaluation only, for the stated period, and may be limited to a '
       + 'subset of tools. We may modify, suspend or end a trial at any time. Trial access is provided '
       + 'as-is, without any warranty or service commitment.'],

      ['8. Feedback',
       'If you send us suggestions, ideas or feedback about the Platform, we may use them without '
       + 'restriction or obligation to you, and any improvements we make from them belong to us.'],

      ['9. Outputs are estimates, not certified engineering',
       'Site plans, one-lines, plot plans, layouts, sizing results, financial models, pro formas and '
       + 'similar outputs are decision-support estimates generated from the inputs you supply. They '
       + 'are not sealed or stamped engineering documents, not a substitute for review by a licensed '
       + 'professional engineer, and not financial, tax, legal or investment advice. You are '
       + 'responsible for verifying every output before relying on it, submitting it for permitting or '
       + 'interconnection, providing it to a customer, or making a financial commitment on it. Accuracy '
       + 'depends on the accuracy of your inputs.'],

      ['10. Disclaimer of warranties',
       'The Platform is provided "as is" and "as available". To the fullest extent permitted by law we '
       + 'disclaim all warranties, express or implied, including merchantability, fitness for a '
       + 'particular purpose, non-infringement, and any warranty that the Platform will be '
       + 'uninterrupted, error-free, or that outputs will be accurate or complete.'],

      ['11. Limitation of liability',
       'To the fullest extent permitted by law, neither party is liable for indirect, incidental, '
       + 'special, consequential or punitive damages, or for lost profits, revenue, data or business '
       + 'opportunity, even if advised of the possibility. Our total aggregate liability arising out of '
       + 'or relating to these terms will not exceed the amounts you paid us for the Platform in the '
       + 'twelve months before the event giving rise to the claim, or one hundred US dollars if you '
       + 'paid nothing. Nothing here limits liability that cannot be limited by law.'],

      ['12. Suspension and termination',
       'We may suspend or terminate access immediately for breach of these terms, for non-payment, or '
       + 'where continued access poses a security or legal risk. You may stop using the Platform at any '
       + 'time. On termination your licence ends and you must stop using the Platform; sections 3, 4, '
       + '5, 6, 8, 9, 10, 11 and 13 survive. We will make Customer Data available for export for a '
       + 'reasonable period after termination unless prohibited by law.'],

      ['13. Governing law',   /* REVIEW: confirm state and venue with counsel. */
       'These terms are governed by the laws of the State of Iowa, USA, without regard to its conflict '
       + 'of laws rules. The state and federal courts located in Iowa have exclusive jurisdiction, and '
       + 'both parties consent to venue there.'],

      ['14. Changes to these terms',
       'We may update these terms. When we do, the version identifier changes and you will be asked to '
       + 'accept the updated terms on your next sign-in. Continued use after acceptance is bound by the '
       + 'updated terms. Material changes will be identified as such.'],

      ['15. Contact',        /* REVIEW: replace with the formal notice address. */
       'Questions about these terms: dev@clearsky-usa.com']
    ];
  }

  /* ── Small DOM helpers ─────────────────────────────────────────────────── */
  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) if (attrs.hasOwnProperty(k)) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }
  function byId(id) { return document.getElementById(id); }

  function injectStyles() {
    if (byId('omega-terms-css')) return;
    var s = el('style', { id: 'omega-terms-css' });
    s.textContent =
      '#ot-modal{position:fixed;inset:0;z-index:99999;background:rgba(12,20,28,.72);' +
        'display:flex;align-items:center;justify-content:center;padding:20px;' +
        'font:14px/1.55 "DM Sans",system-ui,sans-serif}' +
      '#ot-card{background:#fff;border-radius:16px;max-width:720px;width:100%;' +
        'max-height:88vh;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,.3)}' +
      '#ot-head{padding:22px 26px 14px;border-bottom:1px solid #E6E9EC}' +
      '#ot-head h2{margin:0 0 4px;font-size:19px;font-weight:700;color:#12212E}' +
      '#ot-head p{margin:0;font-size:12.5px;color:#5C6B7A}' +
      '#ot-body{padding:18px 26px;overflow-y:auto;flex:1;color:#26333F}' +
      '#ot-body h3{margin:18px 0 5px;font-size:13.5px;font-weight:700;color:#12212E}' +
      '#ot-body h3:first-child{margin-top:0}' +
      '#ot-body p{margin:0;font-size:13px;color:#3E4C59}' +
      '#ot-foot{padding:16px 26px 20px;border-top:1px solid #E6E9EC;' +
        'display:flex;gap:10px;align-items:center;flex-wrap:wrap}' +
      '#ot-foot .ot-spacer{flex:1}' +
      '#ot-foot button{font:600 14px "DM Sans",sans-serif;border-radius:9px;' +
        'padding:11px 20px;cursor:pointer;border:1px solid transparent}' +
      '#ot-accept{background:#12212E;color:#fff}' +
      '#ot-accept[disabled]{opacity:.45;cursor:not-allowed}' +
      '#ot-decline{background:#fff;color:#5C6B7A;border-color:#D5DBE0}' +
      '#ot-scrollnote{font-size:12px;color:#8A97A3}' +
      '#ot-err{color:#B3261E;font-size:12.5px;margin-right:auto}' +
      '.ot-check{display:flex;gap:9px;align-items:flex-start;margin:2px 0 14px;' +
        'font-size:12.5px;line-height:1.45;color:#3E4C59;text-align:left}' +
      '.ot-check input{margin-top:2px;flex:0 0 auto;width:15px;height:15px;cursor:pointer}' +
      '.ot-check a{color:#0F7B6C;text-decoration:underline;cursor:pointer}';
    document.head.appendChild(s);
  }

  function clientName() {
    var ws = global.OMEGA_WORKSPACE || (global.CLEARSKY_CONFIG && global.CLEARSKY_CONFIG.tenant);
    return (ws && ws.clientName) || '';
  }

  /* ── The modal ─────────────────────────────────────────────────────────
     `blocking` = post-auth gate: no dismissing it, Decline signs you out.
     Non-blocking = the "read the terms" link on the sign-up form. */
  function openModal(opts) {
    injectStyles();
    var blocking = !!opts.blocking;
    var wrap = el('div', { id: 'ot-modal' });
    var card = el('div', { id: 'ot-card' });

    var head = el('div', { id: 'ot-head' });
    head.appendChild(el('h2', null, 'Terms of Service'));
    head.appendChild(el('p', null,
      PLATFORM + ' \u00B7 Version ' + TERMS_VERSION +
      (blocking ? ' \u00B7 Please read and accept to continue' : '')));
    card.appendChild(head);

    var body = el('div', { id: 'ot-body' });
    var secs = sections(clientName());
    for (var i = 0; i < secs.length; i++) {
      body.appendChild(el('h3', null, secs[i][0]));
      body.appendChild(el('p', null, secs[i][1]));
    }
    card.appendChild(body);

    var foot = el('div', { id: 'ot-foot' });
    var err = el('div', { id: 'ot-err' });
    foot.appendChild(err);

    if (blocking) {
      var note = el('span', { id: 'ot-scrollnote' }, 'Scroll to the end to enable Accept');
      foot.appendChild(note);
      foot.appendChild(el('div', { 'class': 'ot-spacer' }));

      var decline = el('button', { id: 'ot-decline' }, 'Decline and sign out');
      var accept  = el('button', { id: 'ot-accept', disabled: 'disabled' }, 'Accept');

      /* Require reaching the end before Accept enables. Cheap, and it makes
         "I was never shown the terms" a much harder position to take. */
      body.addEventListener('scroll', function () {
        if (body.scrollTop + body.clientHeight >= body.scrollHeight - 24) {
          accept.removeAttribute('disabled');
          note.textContent = '';
        }
      });
      /* Short viewport, nothing to scroll — don't trap the user. */
      setTimeout(function () {
        if (body.scrollHeight <= body.clientHeight + 24) {
          accept.removeAttribute('disabled');
          note.textContent = '';
        }
      }, 60);

      accept.onclick = function () {
        accept.setAttribute('disabled', 'disabled');
        accept.textContent = 'Recording\u2026';
        err.textContent = '';
        record(opts.user).then(function () {
          close();
          if (opts.onAccept) opts.onAccept();
        })['catch'](function (e) {
          accept.removeAttribute('disabled');
          accept.textContent = 'Accept';
          err.textContent = 'Could not record your acceptance. ' +
            ((e && e.code === 'permission-denied')
              ? 'The termsAcceptances rule is missing in Firestore.'
              : 'Check your connection and try again.');
          if (global.console) console.error('[omega-terms] write failed', e);
        });
      };
      decline.onclick = function () {
        close();
        if (opts.onDecline) opts.onDecline();
      };
      foot.appendChild(decline);
      foot.appendChild(accept);
    } else {
      foot.appendChild(el('div', { 'class': 'ot-spacer' }));
      var closeBtn = el('button', { id: 'ot-accept' }, 'Close');
      closeBtn.onclick = close;
      foot.appendChild(closeBtn);
    }

    card.appendChild(foot);
    wrap.appendChild(card);
    document.body.appendChild(wrap);

    function close() { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
    return { close: close };
  }

  /* ── Firestore read/write ──────────────────────────────────────────────── */
  function db() {
    try {
      return (global.firebase && firebase.apps && firebase.apps.length)
        ? firebase.firestore() : null;
    } catch (e) { return null; }
  }

  function record(user) {
    var d = db();
    if (!d || !user) return Promise.reject(new Error('No Firestore or user.'));
    var ws = global.OMEGA_WORKSPACE || {};
    return d.collection('termsAcceptances').doc(user.uid).set({
      uid:        user.uid,
      email:      user.email || '',
      orgId:      ws.orgId || '',
      version:    TERMS_VERSION,
      acceptedAt: firebase.firestore.FieldValue.serverTimestamp(),
      userAgent:  (global.navigator && navigator.userAgent) || ''
    });
  }

  function hasAccepted(user) {
    var d = db();
    if (!d || !user) return Promise.resolve(false);
    return d.collection('termsAcceptances').doc(user.uid).get()
      .then(function (snap) {
        return !!(snap.exists && snap.data() && snap.data().version === TERMS_VERSION);
      })['catch'](function () {
        /* Read denied or offline. Fail CLOSED — show the gate. Worst case the
           user re-accepts terms they already accepted, which is harmless.
           Failing open would let someone through ungated, which isn't. */
        return false;
      });
  }

  /* ── Layer 1: consent checkbox on the sign-up form ─────────────────────── */
  function mountCheckbox() {
    if (byId('ot-agree-wrap')) return;
    var anchor = byId('auth-name-wrap');
    if (!anchor || !anchor.parentNode) return;
    injectStyles();

    var wrap = el('label', { id: 'ot-agree-wrap', 'class': 'ot-check', style: 'display:none' });
    var box  = el('input', { type: 'checkbox', id: 'ot-agree' });
    var txt  = el('span');
    txt.appendChild(document.createTextNode('I have read and agree to the '));
    var link = el('a', null, 'Terms of Service');
    link.onclick = function (e) {
      e.preventDefault(); e.stopPropagation();
      openModal({ blocking: false });
    };
    txt.appendChild(link);
    txt.appendChild(document.createTextNode(', including the restrictions on use of the '
      + PLATFORM + ' platform and its intellectual property.'));
    wrap.appendChild(box);
    wrap.appendChild(txt);
    anchor.parentNode.insertBefore(wrap, anchor.nextSibling);
  }

  function showCheckbox(on) {
    var w = byId('ot-agree-wrap');
    if (w) w.style.display = on ? 'flex' : 'none';
  }

  /* ── Wire into the host page ───────────────────────────────────────────
     index.html defines these as globals. We wrap rather than edit so the
     host file needs only a single <script> tag added. */
  function wire() {
    if (wire.done) return true;

    /* toggleAuthMode → show the checkbox only in sign-up mode. */
    if (typeof global.toggleAuthMode === 'function' && !global.toggleAuthMode.__ot) {
      var _toggle = global.toggleAuthMode;
      var wrapped = function () {
        _toggle.apply(this, arguments);
        mountCheckbox();
        showCheckbox(global.authMode === 'signup');
      };
      wrapped.__ot = true;
      global.toggleAuthMode = wrapped;
    }

    /* emailAuth → refuse to create an account with the box unticked. */
    if (typeof global.emailAuth === 'function' && !global.emailAuth.__ot) {
      var _email = global.emailAuth;
      var wrappedEmail = function () {
        if (global.authMode === 'signup') {
          var box = byId('ot-agree');
          if (!box || !box.checked) {
            if (typeof global.showAuthErr === 'function') {
              global.showAuthErr('Please accept the Terms of Service to create an account.');
            }
            showCheckbox(true);
            return;
          }
        }
        return _email.apply(this, arguments);
      };
      wrappedEmail.__ot = true;
      global.emailAuth = wrappedEmail;
    }

    /* showApp → the real gate. Runs for every path in, every load. */
    if (typeof global.showApp === 'function' && !global.showApp.__ot) {
      var _showApp = global.showApp;
      var wrappedShow = function (user) {
        var self = this, args = arguments;
        if (!user) return _showApp.apply(self, args);
        hasAccepted(user).then(function (ok) {
          if (ok) return _showApp.apply(self, args);
          openModal({
            blocking: true,
            user: user,
            onAccept: function () { _showApp.apply(self, args); },
            onDecline: function () {
              try { firebase.auth().signOut(); } catch (e) {}
            }
          });
        });
      };
      wrappedShow.__ot = true;
      global.showApp = wrappedShow;
      wire.done = true;
    }

    mountCheckbox();
    return !!wire.done;
  }

  /* showApp is defined in an inline script further down index.html, and
     onAuthStateChanged fires after a network round trip, so a short poll wins
     the race regardless of where the tag is placed. */
  (function poll(n) {
    if (wire() || n > 100) return;
    setTimeout(function () { poll(n + 1); }, 50);
  })(0);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { wire(); });
  }

  global.OmegaTerms = {
    VERSION:     TERMS_VERSION,
    sections:    sections,
    hasAccepted: hasAccepted,
    record:      record,
    show:        function () { return openModal({ blocking: false }); }
  };

})(typeof window !== 'undefined' ? window : this);


/* ══════════════════════════════════════════════════════════════════════════
   REQUIRED FIRESTORE RULE — add to firestore.rules and DEPLOY.
   Without this the acceptance write is denied, the gate fails closed, and
   nobody can get past the modal.

     match /termsAcceptances/{uid} {
       // A user may read only their own acceptance.
       allow read: if request.auth != null && request.auth.uid == uid;

       // A user may write only their own, only with their own uid and email,
       // and only with a server timestamp. Records are append-only: once a
       // version is accepted that document is immutable, so acceptance can't
       // be backdated or rewritten after the fact. A new version writes a new
       // document under termsAcceptances/{uid}/history/{version} if you want
       // full history; the top-level doc always holds the current version.
       allow create: if request.auth != null
                     && request.auth.uid == uid
                     && request.resource.data.uid == uid
                     && request.resource.data.email == request.auth.token.email
                     && request.resource.data.version is string
                     && request.resource.data.acceptedAt == request.time;

       // Updates permitted ONLY to move to a newer version string.
       allow update: if request.auth != null
                     && request.auth.uid == uid
                     && request.resource.data.uid == uid
                     && request.resource.data.version != resource.data.version
                     && request.resource.data.acceptedAt == request.time;

       allow delete: if false;
     }

   Note: the client uses .set(), which is a create on first acceptance and an
   update on a version bump — both are covered above.
   ══════════════════════════════════════════════════════════════════════════ */
