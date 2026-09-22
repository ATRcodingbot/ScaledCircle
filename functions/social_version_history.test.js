const {test}=require('node:test'),assert=require('node:assert/strict');
const {MAX_VERSIONS,readVersions}=require('../functions-social-operations/social_version_history');
function fixture(size,wrong=false){const snapshot={size,docs:Array.from({length:size},(_,i)=>({id:'post_v'+i,data:()=>({businessUid:wrong?'other':'owner',variants:[{copy:'history '+i}]})}))};
 return {snapshot,db:{collection:n=>{assert.equal(n,'socialContentVersions');return {where:(key,op,uid)=>{assert.deepEqual([key,op,uid],['businessUid','==','owner']);return {limit:limit=>{assert.equal(limit,MAX_VERSIONS+1);return {get:async()=>snapshot};}};}};}}};}
test('complete 101-revision history survives and preserves the last repetition evidence',async()=>{const f=fixture(101);assert.equal(await readVersions({db:f.db,uid:'owner'}),f.snapshot);assert.equal(f.snapshot.docs[100].data().variants[0].copy,'history 100');});
test('complete bounded history fails closed rather than presenting truncated data',async()=>{const f=fixture(1001);await assert.rejects(readVersions({db:f.db,uid:'owner'}),/safe review window/);});
test('workspace isolation remains enforced on history results',async()=>{const f=fixture(1,true);await assert.rejects(readVersions({db:f.db,uid:'owner'}),/workspace mismatch/);});
