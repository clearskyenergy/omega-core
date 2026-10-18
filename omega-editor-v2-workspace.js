/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
(function (root) {
  'use strict';
  var tab = 'site-plan-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  function session(interactive) {
    var A = root.OmegaEditorV2Auth;
    return A.whenReady().then(function () {
      var u = root.firebase && root.firebase.auth().currentUser;
      return u || (interactive ? A.signIn() : null);
    }).then(function (u) {
      if (!u) throw new Error('Sign in to open your workspace.');
      return u.getIdTokenResult().then(function (r) {
        var org = r.claims.orgId || String(u.email || '').split('@')[1] || '';
        org = org.toLowerCase();
        if (org === 'fenecon.de' || org === 'fenecon.us') org = 'fenecon.com';
        if (!org || !root.firebase.firestore) throw new Error('Your workspace is unavailable.');
        return { user: u, org: org, db: root.firebase.firestore() };
      });
    });
  }
  function clean(record) { return JSON.parse(JSON.stringify(record)); }
  function save(doc) {
    return session(true).then(function (s) {
      var id = doc.remoteProjectId || doc.projectId;
      if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) throw new Error('Invalid project reference.');
      var ref = s.db.collection('projects').doc(id), now = Math.max(Date.now(), (doc.workspaceRevision || 0) + 1);
      var record = root.OmegaEditorV2Bridge.withSavedBy(root.OmegaEditorV2Bridge.project(doc), { email:s.user.email, tab:tab, at:now });
      if (!doc.remoteProjectId) {
        record.orgId=s.org; record.remoteProjectId=id; record.uid=s.user.uid; record.createdAt=now; record.updatedAt=now;
        record.editorV2.remoteProjectId=id; record.editorV2.orgId=s.org; record.editorV2.workspaceRevision=now;
        return createDocument(s,'projects',id,record).then(function(){return {id:id,orgId:s.org,revision:now};});
      }
      return s.db.runTransaction(function (tx) {
        return tx.get(ref).then(function (snap) {
          var old = snap.exists ? snap.data() : null;
          if (old && (!doc.remoteProjectId || old.editor !== 'v2')) throw new Error('This record belongs to another drawing. Save a new Site Plan instead.');
          if (old && (old.savedBy && old.savedBy.at || 0) !== (doc.workspaceRevision || 0)) throw new Error('Someone saved a newer version. Reopen the workspace project before saving; your draft is still here.');
          record.orgId = old ? old.orgId : s.org;
          record.remoteProjectId = id;
          record.uid = old ? old.uid : s.user.uid;
          record.updatedAt = now;
          record.editorV2.remoteProjectId = id;
          record.editorV2.orgId = record.orgId;
          record.editorV2.workspaceRevision = now;
          if (old) { delete record.stage; delete record.uid; }
          else record.createdAt = now;
          tx.update(ref, clean(record));
          return { id:id, orgId:record.orgId, revision:now };
        });
      });
    });
  }
  function open(id) {
    return session(true).then(function (s) {
      return s.db.collection('projects').doc(id).get({source:'server'}).then(function (snap) {
        if (!snap.exists) throw new Error('Project not found.');
        var r = snap.data();
        if (!r.editorV2) throw new Error('This project uses the original editor. It has not been changed.');
        r.remoteProjectId = snap.id;
        r.editorV2.workspaceRevision = r.savedBy && r.savedBy.at || 0;
        return r;
      });
    });
  }
  function list() {
    return session(true).then(function (s) {
      return s.db.collection('projects').where('orgId','==',s.org).get({source:'server'}).then(function (snap) {
        var out=[]; snap.forEach(function (d) {var p=d.data(); if(p.editor==='v2') out.push({id:d.id,name:p.name,address:p.address});}); return out;
      });
    });
  }
  function value(v) {
    if(v===null) return {nullValue:null};
    if(Array.isArray(v)) return {arrayValue:{values:v.map(value)}};
    if(typeof v==='object') return {mapValue:{fields:fields(v)}};
    if(typeof v==='number') return {doubleValue:v};
    if(typeof v==='boolean') return {booleanValue:v};
    return {stringValue:String(v)};
  }
  function fields(v) {var out={};Object.keys(v).forEach(function(k){out[k]=value(v[k]);});return out;}
  function createDocument(s, collection, id, data) {
    return s.user.getIdToken().then(function(token){
      var base='projects/'+root.OmegaEditorV2Auth.projectId()+'/databases/(default)/documents';
      return fetch('https://firestore.googleapis.com/v1/'+base+':commit',{
        method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:JSON.stringify({writes:[{update:{name:base+'/'+collection+'/'+id,fields:fields(data)},currentDocument:{exists:false}}]})
      }).then(function(r){if(r.ok)return;var e=new Error(r.status===409?'A project with this reference already exists. Reopen it from your workspace.':'The workspace could not save this project. Check your access and connection.');e.status=r.status;throw e;});
    });
  }
  function marketplace(doc) {
    return session(true).then(function (s) {
      if (!doc.remoteProjectId) throw new Error('Save this project first.');
      return s.db.collection('fin_profiles').doc(s.user.uid).get({source:'server'}).then(function (p) {
        if (!p.exists) throw new Error('Complete your marketplace profile first, then return here to submit.');
        var prof=p.data(), q=root.OmegaEditorV2Doc.summary(doc);
        var id='site-plan-'+s.user.uid+'-'+doc.remoteProjectId;
        var ref=s.db.collection('fin_projects').doc(id);
        var record={name:doc.name,address:doc.address,sourceProjectId:doc.remoteProjectId,projectId:doc.remoteProjectId,
          sourceOrgId:doc.orgId,sourceTool:'editor-v2',tech:q.solarKwDc>0?(q.bessKw>0?'solar_bess':'solar'):(q.bessKw>0?'storage':'ev'),
          mw:((q.solarKwDc||0)+(q.bessKw||0))/1000,mwh:(q.bessKwh||0)/1000,
          sizePending:!(q.solarKwDc>0||q.bessKw>0||q.chargerKw>0),
          links:[{label:'OMEGA Site Plan trial',url:location.origin+'/editor-v2?id='+encodeURIComponent(doc.remoteProjectId)}],updatedAt:Date.now()};
        var create=clean(record);
        create.developerUid=s.user.uid;create.status='open';create.awardedTo=null;create.org=prof.org||'';
        if(prof.orgKey) create.orgKey=prof.orgKey;
        create.submittedBy=s.user.displayName||s.user.email;create.submittedByEmail=s.user.email;
        create.createdAt=Date.now();create.outcome='active';create.bidders=0;create.offers=0;
        /* A create precondition avoids both an unreadable missing document and
           overwriting a live negotiation on a repeat submission. REST uses the
           same Firebase ID token and the same Firestore rules as the SDK. */
        return createDocument(s,'fin_projects',id,create).then(function(){return id;},function(e){
          if(e.status===409) return ref.update(record).then(function(){return id;});
          throw e;
        });
      });
    });
  }
  function feedback(doc, message) {
    return session(true).then(function(s){
      if(!doc.remoteProjectId) throw new Error('Save the project first.');
      var note={by:s.user.uid,email:s.user.email||'',at:Date.now(),message:String(message).slice(0,2000),tool:'site-plan-trial'};
      return s.db.collection('projects').doc(doc.remoteProjectId).update({sitePlanFeedback:root.firebase.firestore.FieldValue.arrayUnion(note)});
    });
  }
  function quote(doc, bom) {
    return root.OmegaEditorV2Auth.idToken().then(function(token){
      if(!token) throw new Error('Sign in to request a quote.');
      return fetch('/api/rfq',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:JSON.stringify({projectId:doc.remoteProjectId,bom:bom})}).then(function(r){
          return r.json().then(function(j){if(!r.ok) throw new Error(j.error||'Quote request failed.');return j;});
        });
    });
  }
  function href(doc, target) {
    var id=encodeURIComponent(doc.remoteProjectId||''), org=encodeURIComponent(doc.orgId||'');
    if(target==='prime') return '/omega-prime.html?project='+id+'&org='+org+'&editor=v2&type='+encodeURIComponent(root.OmegaEditorV2Bridge.project(doc).type)+'&addr='+encodeURIComponent(doc.address||'')+'&lat='+doc.anchor.lat+'&lng='+doc.anchor.lng;
    return '/omega-logic.html?org='+org+'&project='+id;
  }
  root.OmegaEditorV2Workspace={save:save,open:open,list:list,marketplace:marketplace,feedback:feedback,quote:quote,href:href};
})(typeof window !== 'undefined' ? window : global);
