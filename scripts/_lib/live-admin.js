/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   scripts/_lib/live-admin.js — the live Firestore for a script run with
   --apply. FIREBASE_SERVICE_ACCOUNT (a service account key, as the API uses)
   when it is set; else the Firebase CLI's signed-in account (firebase login):
   its refresh token becomes an application-default authorized_user file in
   the OS temp dir for this run, removed on exit, never in the repo. The
   client id/secret are firebase-tools' own public OAuth client. */
'use strict';
var fs = require('fs'), path = require('path'), os = require('os');
module.exports = function live(A) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) return A;
  var store = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
  var tokens = store.tokens || (store.activeAccounts && store.activeAccounts[0] && store.activeAccounts[0].tokens);
  if (!tokens || !tokens.refresh_token) throw new Error('Not signed in: run `firebase login` (or set FIREBASE_SERVICE_ACCOUNT)');
  var adcPath = path.join(os.tmpdir(), 'omega-script-adc-' + process.pid + '.json');
  fs.writeFileSync(adcPath, JSON.stringify({ type: 'authorized_user', client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com', client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi', refresh_token: tokens.refresh_token }), { mode: 384 });
  process.env.GOOGLE_APPLICATION_CREDENTIALS = adcPath; process.on('exit', function () { try { fs.unlinkSync(adcPath); } catch (e) {} });
  var admin = require('firebase-admin');
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'clearsky-portal' });
  A.init = function () { return admin; }; A.db = function () { return admin.firestore(); };
  return A;
};
