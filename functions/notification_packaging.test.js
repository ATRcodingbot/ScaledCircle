'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('selected notification callable initializes Admin before opening its store',async()=>{
 const ast=require('@babel/parser').parse(fs.readFileSync(require.resolve('../functions-mobile-notifications/index'),'utf8'));
 const code=require('@babel/generator').default(require('./scripts/select_function_program').selectedProgram(ast,new Set(['mobileNotificationsV1']))).code;
 let initialized=false,opened=0;
 const context={exports:{},process:{env:{GCLOUD_PROJECT:'scaled-circle',APP_ENV:'production'}},require(name){
  if(name==='firebase-admin/app')return {getApps:()=>initialized?[{name:'[DEFAULT]'}]:[{name:'__firebase_functions_admin'}],initializeApp:()=>{initialized=true;return {name:'[DEFAULT]'};}};
  if(name==='firebase-admin/firestore')return {getFirestore:()=>{assert(initialized,'default app missing');return {};}};
  if(name==='firebase-admin/auth')return {getAuth:()=>({})};
  if(name==='firebase-admin/messaging')return {getMessaging:()=>({})};
  if(name==='firebase-functions/v2/https')return {onCall:(_,fn)=>fn,HttpsError:class extends Error{}};
  if(name==='./policy')return {validEnvironment:()=>true};
  if(name==='./service')return {createService:()=>({actor:async()=>{},open:async()=>{opened++;return {available:true};}})};
  throw Error(name);
 }};
 vm.runInNewContext(code,context);
 assert.equal((await context.exports.mobileNotificationsV1({auth:{uid:'owner'},data:{action:'open',input:{notificationId:'notice'}}})).available,true);
 assert.equal(opened,1);
});
