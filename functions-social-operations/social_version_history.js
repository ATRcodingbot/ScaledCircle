'use strict';
// Immutable revisions are not content ideas. Read complete bounded history for
// repetition checks; never silently truncate it at the former 100-revision cap.
const MAX_VERSIONS=1000;
async function readVersions({db,uid,read=r=>r.get()}) {
 const snapshot=await read(db.collection('socialContentVersions').where('businessUid','==',uid).limit(MAX_VERSIONS+1));
 if(snapshot.size>MAX_VERSIONS)throw Error('Content revision history exceeds the safe review window. Support must reconcile coverage before preparation can continue.');
 if(snapshot.docs.some(d=>d.data().businessUid!==uid))throw Error('Content history workspace mismatch.');
 return snapshot;
}
module.exports={MAX_VERSIONS,readVersions};
