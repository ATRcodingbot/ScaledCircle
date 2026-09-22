'use strict';
const geo=require('./weather_geography'),policy=require('./weather_delivery_policy');
const {hasWeatherSubscription}=require('./weather_preference_policy');
const COUNTY_CODES={allegany:'MDC001',anne_arundel:'MDC003',baltimore:'MDC005',baltimore_city:'MDC510',calvert:'MDC009',caroline:'MDC011',carroll:'MDC013',cecil:'MDC015',charles:'MDC017',dorchester:'MDC019',frederick:'MDC021',garrett:'MDC023',harford:'MDC025',howard:'MDC027',kent:'MDC029',montgomery:'MDC031',prince_georges:'MDC033',queen_annes:'MDC035',saint_marys:'MDC037',somerset:'MDC039',talbot:'MDC041',washington:'MDC043',wicomico:'MDC045',worcester:'MDC047'};
function createService({db,getOwner,now=Date.now,fetchImpl=fetch}){
 const zones=new Map();
 async function nws(url){
   if(!/^https:\/\/api\.weather\.gov\/(alerts(?:[/?].*)?|zones\/(county|forecast|fire|marine)\/[A-Z]{2}[CZ]\d{3})$/.test(url))throw Error('weather_provider_url_invalid');
   const r=await fetchImpl(url,{redirect:'error',headers:{Accept:'application/geo+json','User-Agent':'ScaledCircle (support@scaledcircle.com)'},signal:AbortSignal.timeout(12000)});
   if(!r.ok)throw Error('weather_provider_unavailable');return r.json();
 }
 async function zone(url){if(!zones.has(url))zones.set(url,nws(url));return zones.get(url);}
 async function context(uid){
   const refs=['users/'+uid,'businessSubscriptions/'+uid,'discoveryPreferences/'+uid,'businessGrowthProfiles/'+uid,'businessOperations/'+uid+'/settings/scheduling'];
   const [u,s,d,p,h]=await Promise.all(refs.map(r=>db.doc(r).get()));
   const user=u.data()||{},preferences=user.weatherMonitoring||null;
   const extras=[];for(const id of preferences?.extraCountyIds||[]){
     if(!COUNTY_CODES[id])throw Error('weather_watch_area_invalid');
     const result=await zone('https://api.weather.gov/zones/county/'+COUNTY_CODES[id]);
     extras.push({id,name:result.properties?.name||id,geometry:result.geometry});
   }
   let timeZone=null;for(const z of [h.data()?.settings?.timeZone,p.data()?.timeZone,p.data()?.businessHours?.timeZone])try{if(z){new Intl.DateTimeFormat('en',{timeZone:z}).format();timeZone=z;break;}}catch{}
   return {uid,user,preferences:preferences?{...preferences,timeZone}:null,entitled:hasWeatherSubscription(user,s.data()||{}),
     coverage:geo.coverage({preferences:d.data(),extraAreas:extras}),timeZone};
 }
 async function owner(uid){const identity=await getOwner(uid);if(identity.disabled||!identity.emailVerified)throw Error('weather_verified_owner_required');return identity;}
 async function settings(uid,input){
   const c=await context(uid);await owner(uid);if(!c.entitled||!['business','admin'].includes(c.user.role))throw Error('weather_entitlement_required');
   if(!input)return {preferences:c.preferences,coverage:{areas:c.coverage.areas.map(({geometry,...a})=>a),unresolved:c.coverage.unresolved},timeZone:c.timeZone};
   if(Object.keys(input).some(k=>!['expectedVersion','emailEnabled','extraCountyIds','quietHours','urgentOutsideQuietHours'].includes(k))||
     !Number.isInteger(input.expectedVersion)||typeof input.emailEnabled!=='boolean'||typeof input.urgentOutsideQuietHours!=='boolean'||
     !Array.isArray(input.extraCountyIds)||input.extraCountyIds.length>24||input.extraCountyIds.some(id=>!COUNTY_CODES[id])||
     typeof input.quietHours?.enabled!=='boolean')throw Error('weather_preferences_invalid');
   if(input.emailEnabled&&!c.timeZone)throw Error('weather_timezone_required');
   policy.quietUntil(input.quietHours,c.timeZone||'UTC',now());
   return db.runTransaction(async tx=>{
     const ref=db.doc('users/'+uid),user=(await tx.get(ref)).data()||{},previous=user.weatherMonitoring;
     if((previous?.version||0)!==input.expectedVersion)throw Error('weather_preferences_changed');
     const at=now(),saved={version:input.expectedVersion+1,followSavedServiceAreas:true,emailEnabled:input.emailEnabled,
       emailEnabledAt:input.emailEnabled?(previous?.emailEnabled===true?previous.emailEnabledAt:at):null,
       extraCountyIds:[...new Set(input.extraCountyIds)],quietHours:input.quietHours,
       urgentOutsideQuietHours:input.urgentOutsideQuietHours,updatedAt:at,updatedBy:uid};
     tx.update(ref,{weatherMonitoring:saved,weatherEmailAlertsEnabled:input.emailEnabled});
     tx.create(db.doc(`users/${uid}/weatherPreferenceHistory/${saved.version}`),saved);
     return {preferences:{...saved,timeZone:c.timeZone}};
   });
 }
 async function dispatch(job){
   const c=await context(job.businessUid),identity=await owner(job.businessUid);
   const feature=await nws(job.officialUrl),event=policy.event(feature,now());
   const matches=geo.matches(c.coverage,await geo.alertGeometry(feature,zone));
   return policy.decision({userId:job.businessUid,job,preferences:c.preferences,entitled:c.entitled,owner:identity,event,matches,now:now()});
 }
 async function monitorUser(uid,features){
   const c=await context(uid);if(!c.entitled)return {status:'not_entitled'};
   const identity=await owner(uid),stateRef=db.doc('weatherMonitoringState/'+uid),at=now();
   if(!c.coverage.areas.length||c.coverage.unresolved.length){await stateRef.set({status:'coverage_unresolved',checkedAt:at},{merge:true});return {status:'coverage_unresolved'};}
   const matched=[];
   for(const feature of features){const event=policy.event(feature,at);if(!event)continue;
     const matches=geo.matches(c.coverage,await geo.alertGeometry(feature,zone));if(matches.length)matched.push({event,matches});}
   await db.runTransaction(async tx=>{
     const previous=(await tx.get(stateRef)).data(),refs=matched.map(({event:e})=>db.doc('weatherAlertDeliveries/'+uid+'_'+e.eventId+'_'+e.revision));
     const saved=await Promise.all(refs.map(r=>tx.get(r)));
     for(let i=0;i<matched.length;i++){
       const {event:e,matches}=matched[i],ref=refs[i];if(saved[i].exists)continue;
       const id=uid+'_'+e.eventId+'_'+e.revision;
       // First observation establishes a baseline; deployment never replays active history.
       const eligible=!!previous?.baselineAt&&e.issuedAt>=previous.baselineAt&&c.preferences?.emailEnabled===true&&e.issuedAt>=c.preferences.emailEnabledAt&&['active','upcoming','cancelled'].includes(e.status);
       tx.create(ref,{userId:uid,event:e,matches,observedAt:at,baselineOnly:!previous?.baselineAt,emailQueued:eligible});
       if(eligible){
         const message=policy.content({event:e,matches,timeZone:c.timeZone,url:'https://scaledcircle.com/#/business/weather?alert='+encodeURIComponent(id),preferencesUrl:'https://scaledcircle.com/#/business/weather-preferences'});
         tx.create(db.doc('outboundEmailJobs/weather_'+id),{template:'weather_alert_v2',businessUid:uid,to:identity.email.toLowerCase(),fromAddress:'support@scaledcircle.com',eventId:e.eventId,eventRevision:e.revision,officialUrl:e.officialUrl,...message,status:'queued',attempts:0,createdAtMs:at});
       }
     }
     tx.set(stateRef,{status:'available',checkedAt:at,baselineAt:previous?.baselineAt||at,activeAlerts:matched.map(x=>({event:x.event,matches:x.matches})),unresolved:[]},{merge:true});
   });
   return {status:'available',matched:matched.length};
 }
 return {settings,context,dispatch,monitorUser,nws};
}
module.exports={createService,COUNTY_CODES};
