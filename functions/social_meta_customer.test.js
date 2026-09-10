'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const customer=require('../functions-social-operations/social_meta_customer');
test('customer publishing pilot never inherits internal Admin or another workspace grant',()=>{
 const business={uid:'owner',role:'business',planId:'managed_growth',isAdmin:false};
 assert.equal(customer.available(business,'owner'),true);assert.equal(customer.available({...business,isAdmin:true},'owner'),false);
 assert.equal(customer.available({...business,uid:'other'},'owner'),false);assert.equal(customer.available(business,''),false);
 assert.equal(customer.available({...business,planId:'starter'},'owner'),false);
});
test('permission upgrade binds the already-selected Page and current credential',()=>{
 const c={status:'connected_read_only',providerUserId:'123',credentialId:'cred'};
 const target=customer.publishingTarget(c),a={purpose:customer.PURPOSE,customerTarget:target};
 customer.assertTarget(a,c,{accountId:'123'});
 for(const [connection,account] of [[c,{accountId:'999'}],[{...c,credentialId:'new'},{accountId:'123'}],[{...c,providerUserId:'999'},{accountId:'123'}]])assert.throws(()=>customer.assertTarget(a,connection,account));
 assert.throws(()=>customer.publishingTarget({...c,status:'not_connected'}));
});
test('ordinary analytics uses exact selected identity, GET-only, no internal Page substitution',async()=>{
 const c={providerUserId:'123',credentialId:'cred',capabilities:{analytics:true},accountDisplayName:'Customer'};let calls=0;
 const result=await customer.readBaseline({surface:'facebook',connection:c,credential:{id:'cred'},account:{accountId:'123'},tokens:{userAccessToken:'test-user'},fetchImpl:async(url,opts)=>{calls++;assert.equal(url.pathname,'/v26.0/123');assert.equal(opts.method,'GET');assert.equal(opts.headers.Authorization,'Bearer test-user');return {ok:true,json:async()=>({id:'123',access_token:'test-page'})};},collect:async x=>{assert.equal(x.account.pageName,'Customer');assert.equal(x.tokens.pageAccessToken,'test-page');return {metrics:{followers:{value:null,status:'UNAVAILABLE'}}};}});
 assert.equal(calls,1);assert.equal(result.metrics.followers.value,null);
 await assert.rejects(customer.readBaseline({surface:'facebook',connection:{...c,providerUserId:'999'},credential:{id:'cred'},account:{accountId:'123'},tokens:{},collect:()=>{throw Error('must not call');}}),/identity_or_permission/);
});
