/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var A = require('./admin'), S = require('./sales');
function clean(b) {
  var name = S.clean(b.ownerName, 100), kind = b.ownerKind;
  if (!name || ['human', 'ai'].indexOf(kind) < 0) throw A.httpError(400, 'Owner name and human/ai type required');
  var amount = b.dealValue === '' || b.dealValue == null ? null : Number(b.dealValue);
  if (amount !== null && (!isFinite(amount) || amount < 0)) throw A.httpError(400, 'Deal value must be a nonnegative USD amount');
  var due = S.clean(b.nextDue, 10);
  if (due && (!/^\d{4}-\d{2}-\d{2}$/.test(due) || new Date(due + 'T00:00:00Z').toISOString().slice(0,10) !== due)) throw A.httpError(400, 'Valid follow-up date required');
  var action = S.clean(b.nextAction, 200);
  if (due && !action) throw A.httpError(400, 'Describe the follow-up');
  return { owner: { name: name, kind: kind }, referral: S.clean(b.referral, 200), dealValue: amount, currency: 'USD', next: { action: action, due: due } };
}
function save(db, caller, b, now) {
  if (!caller.staff) throw A.httpError(403, 'Staff assign owners and deal values');
  var id = S.prospectIdFor({ domain: b.prospectId, email: b.prospectId });
  if (!id || id !== String(b.prospectId).toLowerCase()) throw A.httpError(400, 'Company domain or contact email required');
  if (S.STAGES.indexOf(b.stage) < 0) throw A.httpError(400, 'Valid stage required');
  var patch = clean(b), ref = db.collection('sales_prospects').doc(id);
  return db.runTransaction(function (tx) {
    return tx.get(ref).then(function (snap) {
      var old = snap.exists ? snap.data() : {}, row = Object.assign({}, old, patch, {
        id: id, domain: id.indexOf('@') < 0 ? id : '', company: S.clean(b.company,120) || old.company || id,
        stage: b.stage, createdAt: old.createdAt || new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), updatedBy: caller.by
      });
      row.score = S.score(row, now);
      tx.set(ref, row);
      tx.set(db.collection('sales_activity').doc(), { kind: 'note', at: row.updatedAt, by: caller.by, prospectId: id,
        owner: patch.owner, summary: 'Sales record: ' + row.company + ' · ' + patch.owner.name + ' · ' + row.stage + (patch.referral ? ' · referred by ' + patch.referral : '') });
      return { ok: true, prospect: row };
    });
  });
}
module.exports = { clean: clean, save: save };
