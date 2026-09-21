'use strict';
const {initializeApp,getApps}=require('firebase-admin/app');
const {getFirestore,FieldValue,Timestamp}=require('firebase-admin/firestore');
const {getAuth}=require('firebase-admin/auth');
const {onCall,onRequest,HttpsError}=require('firebase-functions/v2/https');
const {defineSecret}=require('firebase-functions/params');
const {onSchedule}=require('firebase-functions/v2/scheduler');
const {createService}=require('./service'),{createAuthority}=require('./authority'),gmail=require('./gmail');
const {createRegistry}=require('./providers');
const app=getApps().find(a=>a.name==='[DEFAULT]')||initializeApp(),db=getFirestore(app);
const CLIENT_SECRET=defineSecret('BUSINESS_EMAIL_GOOGLE_CLIENT_SECRET');
const ENCRYPTION_KEY=defineSecret('BUSINESS_EMAIL_ENCRYPTION_KEY');
const inferenceEnabled=process.env.BUSINESS_EMAIL_INFERENCE_ENABLED==='true';
const INFERENCE_KEY=inferenceEnabled?defineSecret('OPENAI_API_KEY'):null;
const microsoftEnabled=process.env.BUSINESS_EMAIL_MICROSOFT_ENABLED==='true';
const MICROSOFT_SECRET=microsoftEnabled?defineSecret('BUSINESS_EMAIL_MICROSOFT_CLIENT_SECRET'):null;
function service() {
  const project=process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT;
  const clientId=process.env.BUSINESS_EMAIL_GOOGLE_CLIENT_ID,redirectUri=process.env.BUSINESS_EMAIL_REDIRECT_URI;
  const clientSecret=CLIENT_SECRET.value(),key=ENCRYPTION_KEY.value();
  const configured=!!clientId&&!!clientSecret&&!!redirectUri&&Buffer.from(key||'','base64').length===32;
  const beta=JSON.parse(process.env.BUSINESS_EMAIL_PRIVATE_BETA||'{}');
  return createService({db,key,project,runOutbound:inferenceEnabled?require('./outbound_runtime').createRuntime({db,apiKey:INFERENCE_KEY.value()}):null,runInference:inferenceEnabled?require('./inference_runtime').createRuntime({db,apiKey:INFERENCE_KEY.value()}):null,scheduleService:require('./schedule_runtime/service').createService({db,FieldValue,authority:require('./schedule_runtime/authority').createAuthority({db,auth:getAuth(app),FieldValue,Timestamp,project,internalAdminUid:process.env.GROWTH_PRODUCTION_ADMIN_UID||''})}),authority:createAuthority({db,auth:getAuth(app),FieldValue,Timestamp,project,beta,configured,
    internalAdminUid:process.env.GROWTH_PRODUCTION_ADMIN_UID||''}),
    providers:createRegistry({google:{...gmail.createProvider({clientId,clientSecret,redirectUri}),configured},
      microsoft:require('./microsoft').createProvider({clientId:process.env.BUSINESS_EMAIL_MICROSOFT_CLIENT_ID,
        clientSecret:microsoftEnabled?MICROSOFT_SECRET.value():null,redirectUri:process.env.BUSINESS_EMAIL_MICROSOFT_REDIRECT_URI}),
      other:require('./other_mail').createProvider()})});
}
const options={region:'us-east1',maxInstances:2,timeoutSeconds:120,secrets:[CLIENT_SECRET,ENCRYPTION_KEY,...(inferenceEnabled?[INFERENCE_KEY]:[]),...(microsoftEnabled?[MICROSOFT_SECRET]:[])]};
exports.businessEmailOperationsV1=onCall({...options,enforceAppCheck:false},async request=>{
  try{return await service().execute(request);}catch(error){
    console.warn('Business Email action held',{code:error.code||'unavailable'});
    throw new HttpsError(error.code||'unavailable',error.code?error.message:'This action needs checking. No automatic retry was made.');
  }
});
exports.businessEmailCallbackV1=onRequest(options,async(req,res)=>{
  res.set('Cache-Control','no-store');res.set('Referrer-Policy','no-referrer');res.set('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'");
  try{if(req.method!=='GET')return res.status(405).send('Method not allowed');await service().callback(req.query);
    return res.status(200).send('<!doctype html><title>Business Email connected</title><h1>Business Email connected</h1><p>Return to ScaledCircle and check your connection. Automatic sending is off.</p>');
  }catch(error){console.warn('Business Email connection held',{code:error.code||'unavailable'});
    return res.status(400).send('<!doctype html><title>Email was not connected</title><h1>Email was not connected</h1><p>Return to ScaledCircle and try again. No email was sent.</p>');}
});
exports.syncBusinessEmailRepliesV1=onSchedule({...options,timeoutSeconds:540,schedule:'every 5 minutes',retryCount:0},async()=>{
  const beta=JSON.parse(process.env.BUSINESS_EMAIL_PRIVATE_BETA||'{}');
  for(const [businessId,record] of Object.entries(beta)) {
    try{await service().syncReplies({auth:{uid:record.ownerUid},data:{businessId}});
      if(record.campaignSendEnabled===true)await service().syncCampaigns({auth:{uid:record.ownerUid},data:{businessId}});}
    catch(error){console.warn('Business reply check held',{code:error.code||'unavailable'});}
  }
});
exports.businessEmailUnsubscribeV1=onRequest({region:'us-east1',maxInstances:2,timeoutSeconds:30},async(req,res)=>{
  res.set('Cache-Control','no-store');res.set('Referrer-Policy','no-referrer');res.set('X-Content-Type-Options','nosniff');
  res.set('Content-Security-Policy',"default-src 'none'; form-action 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'");
  if(!['GET','POST'].includes(req.method))return res.status(405).send('Method not allowed');
  try{
   const token=req.query.token,result=await require('./unsubscribe').createUnsubscribe({db})(token,{confirm:req.method==='POST'});
   if(result.unsubscribed)return res.status(200).send('<!doctype html><title>Unsubscribed</title><h1>You are unsubscribed</h1><p>This Business will no longer send you marketing emails. Account and requested service messages are separate.</p>');
   return res.status(200).send('<!doctype html><title>Stop marketing email</title><h1>Stop marketing emails from this Business</h1><p>No login is required.</p><form method="post"><button type="submit">Unsubscribe</button></form>');
  }catch(_){return res.status(400).send('<!doctype html><title>Check unsubscribe link</title><h1>This link could not be verified</h1><p>Reply to the Business and ask to stop receiving marketing emails.</p>');}
});
