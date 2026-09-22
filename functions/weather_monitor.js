'use strict';
const geo=require('./weather_geography'),policy=require('./weather_delivery_policy');
const {hasWeatherSubscription}=require('./weather_preference_policy');
const COUNTY_CODES={allegany:'MDC001',anne_arundel:'MDC003',baltimore:'MDC005',baltimore_city:'MDC510',calvert:'MDC009',caroline:'MDC011',carroll:'MDC013',cecil:'MDC015',charles:'MDC017',dorchester:'MDC019',frederick:'MDC021',garrett:'MDC023',harford:'MDC025',howard:'MDC027',kent:'MDC029',montgomery:'MDC031',prince_georges:'MDC033',queen_annes:'MDC035',saint_marys:'MDC037',somerset:'MDC039',talbot:'MDC041',washington:'MDC043',wicomico:'MDC045',worcester:'MDC047'};
function createService({db,getOwner,now=Date.now,fetchImpl=fetch,providerBoundary=null}){
 const zones=new Map();
 async function nws(url){
   if(!/^https:\/\/api\.weather\.gov\/(alerts(?:[/?].*)?|zones\/(county|forecast|fire|marine)\/[A-Z]{2}[CZ]\d{3})$/.test(url))throw Error('weather_provider_url_invalid');
   const r=await fetchImpl(url,{redirect:'error',headers:{Accept:'application/geo+json','User-Agent':'ScaledCircle (support@scaledcircle.com)'},signal:AbortSignal.timeout(12000)});
   if(!r.ok)throw Error('weather_provider_unavailable');return r.json();
 }
 async function zone(url){if(!zones.has(url))zones.set(url,nws(url).catch(error=>{zones.delete(url);throw error;}));return zones.get(url);}
 async function context(uid,{resolveAreas=true}={}){
   const refs=['users/'+uid,'businessSubscriptions/'+uid,'discoveryPreferences/'+uid,'businessGrowthProfiles/'+uid,'businessOperations/'+uid+'/settings/scheduling','weatherMonitoringState/'+uid];
   const [u,s,d,p,h,state]=await Promise.all(refs.map(r=>db.doc(r).get()));
   const user=u.data()||{},preferences=user.weatherMonitoring||{version:0,emailEnabled:user.weatherEmailAlertsEnabled===true,emailEnabledAt:state.data()?.baselineAt||now(),extraCountyIds:[],quietHours:{enabled:false},urgentOutsideQuietHours:false};
   if(user.weatherEmailAlertsEnabled===false)preferences.emailEnabled=false;
   const extras=[];for(const id of resolveAreas?preferences.extraCountyIds||[]:[]){
     if(!COUNTY_CODES[id])throw Error('weather_watch_area_invalid');
     const result=await zone('https://api.weather.gov/zones/county/'+COUNTY_CODES[id]);
     extras.push({id,name:result.properties?.name||id,geometry:result.geometry});
   }
   let timeZone=null;for(const z of [h.data()?.settings?.timeZone,p.data()?.timeZone,p.data()?.businessHours?.timeZone])try{if(z){new Intl.DateTimeFormat('en',{timeZone:z}).format();timeZone=z;break;}}catch{}
   return {uid,user,preferences:preferences?{...preferences,timeZone}:null,entitled:hasWeatherSubscription(user,s.data()||{}),
     coverage:geo.coverage({preferences:d.data(),extraAreas:extras}),timeZone,
     inAppEnabled:d.data()?.notifications?.weatherInMyAreas===true};
 }
 async function owner(uid){const identity=await getOwner(uid);if(identity.disabled||!identity.emailVerified)throw Error('weather_verified_owner_required');return identity;}
 function present(record,timeZone){
   if(!record?.event)return record;const e=record.event;
   const format=t=>timeZone?new Intl.DateTimeFormat('en-US',{timeZone,dateStyle:'medium',timeStyle:'long'}).format(t):new Date(t).toISOString();
   return {...record,event:{...e,status:e.status==='cancelled'?'cancelled':e.expiresAt<=now()?'expired':e.status,issuedLabel:format(e.issuedAt),effectiveLabel:format(e.effectiveAt),expiresLabel:format(e.expiresAt)}};
 }
 async function settings(uid,input){
   const c=await context(uid,{resolveAreas:false});await owner(uid);if(!c.entitled||!['business','admin'].includes(c.user.role))throw Error('weather_entitlement_required');
   if(!input){const monitoring=(await db.doc('weatherMonitoringState/'+uid).get()).data()||null;
     return {preferences:c.preferences,coverage:{areas:c.coverage.areas.map(({geometry,...a})=>a),unresolved:c.coverage.unresolved},timeZone:c.timeZone,monitoring:monitoring?{...monitoring,activeAlerts:(monitoring.activeAlerts||[]).map(r=>present(r,c.timeZone))}:null,legacyEmailEnabled:c.user.weatherEmailAlertsEnabled===true};}
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
     tx.update(ref,{weatherMonitoring:saved,weatherCoverageEnabled:true,weatherEmailAlertsEnabled:input.emailEnabled});
     tx.create(db.doc(`users/${uid}/weatherPreferenceHistory/${saved.version}`),saved);
     return {preferences:{...saved,timeZone:c.timeZone}};
   });
 }
 async function dispatch(job){
   if(job.expiresAt<=now()&&job.eventStatus!=='cancelled')return {state:'suppressed',reason:'weather_event_expired'};
   const c=await context(job.businessUid),identity=await owner(job.businessUid);
   const saved=(await db.doc('weatherMonitoringState/'+job.businessUid).get()).data();
   const latest=saved?.activeAlerts?.find(x=>x.event.eventId===job.eventId)?.event;
   if(latest&&latest.revision!==job.eventRevision)return {state:'suppressed',reason:'weather_event_superseded'};
   const feature=await nws(job.officialUrl),event=policy.event(feature,now());
   const matches=geo.matches(c.coverage,await geo.alertGeometry(feature,zone));
   if(c.coverage.unresolved.length)throw Error('weather_coverage_unresolved');
   const result=policy.decision({userId:job.businessUid,job,preferences:c.preferences,entitled:c.entitled,owner:identity,event,matches,now:now()});
   return {...result,...(result.state==='eligible'?{content:policy.content({event,matches,timeZone:c.timeZone,url:job.viewUrl,preferencesUrl:job.preferencesUrl})}:{})};
 }
 async function monitorUser(uid,features){
   const c=await context(uid);if(!c.entitled)return {status:'not_entitled'};
   const identity=await owner(uid),stateRef=db.doc('weatherMonitoringState/'+uid),at=now();
   if(!c.coverage.areas.length||c.coverage.unresolved.length){await stateRef.set({status:'coverage_unresolved',checkedAt:at},{merge:true});return {status:'coverage_unresolved'};}
   const partialCoverage=!!providerBoundary&&c.coverage.areas.some(a=>!geo.within(a.geometry,providerBoundary));
   const matched=[];
   for(const feature of features){const event=policy.event(feature,at);if(!event)continue;
     const matches=geo.matches(c.coverage,await geo.alertGeometry(feature,zone));if(matches.length)matched.push({event,matches});}
   // Keep only the latest revision of each official event from this provider response.
   const latest=new Map();for(const x of matched){if((latest.get(x.event.eventId)?.event.issuedAt||0)<x.event.issuedAt)latest.set(x.event.eventId,x);}
   matched.splice(0,matched.length,...latest.values());
   if(matched.length>100)throw Error('weather_event_limit_reached');
   const coverageDigest=policy.hash(c.coverage.areas);
   await db.runTransaction(async tx=>{
     const previous=(await tx.get(stateRef)).data(),refs=matched.map(({event:e})=>db.doc('weatherAlertDeliveries/'+uid+'_'+e.eventId+'_'+e.revision));
     const saved=await Promise.all(refs.map(r=>tx.get(r)));
     const boundary=previous?.coverageDigest&&previous.coverageDigest!==coverageDigest?at:(previous?.coverageBaselineAt||previous?.baselineAt||at);
     for(let i=0;i<matched.length;i++){
       const {event:e,matches}=matched[i],ref=refs[i];if(saved[i].exists)continue;
       const id=uid+'_'+e.eventId+'_'+e.revision;
       // First observation establishes a baseline; deployment never replays active history.
       const newEvent=!!previous?.baselineAt&&e.issuedAt>=boundary&&['active','upcoming','cancelled'].includes(e.status);
       const eligible=newEvent&&c.preferences?.emailEnabled===true&&Number.isFinite(c.preferences.emailEnabledAt)&&e.issuedAt>=c.preferences.emailEnabledAt;
       tx.create(ref,{userId:uid,event:e,matches,observedAt:at,baselineOnly:!previous?.baselineAt,emailQueued:eligible&&!!c.timeZone,emailHoldReason:eligible&&!c.timeZone?'weather_timezone_required':null});
       if(newEvent&&c.inAppEnabled){
         tx.create(db.doc('notifications/weather_'+id),{userId:uid,type:'weather_opportunity',title:e.event,message:matches.map(m=>m.reason).join(' '),createdAt:new Date(at),read:false,deepLink:{destination:'weather_alert',alertId:id},source:'National Weather Service'});
       }
       if(eligible&&c.timeZone){
         const viewUrl='https://scaledcircle.com/#/business/weather?alert='+encodeURIComponent(id),preferencesUrl='https://scaledcircle.com/#/business/weather-preferences';
         const message=policy.content({event:e,matches,timeZone:c.timeZone,url:viewUrl,preferencesUrl});
         tx.create(db.doc('outboundEmailJobs/weather_'+id),{template:'weather_alert_v2',businessUid:uid,to:identity.email.toLowerCase(),fromAddress:'support@scaledcircle.com',eventId:e.eventId,eventRevision:e.revision,eventStatus:e.status,expiresAt:e.expiresAt,officialUrl:e.officialUrl,viewUrl,preferencesUrl,...message,status:'queued',attempts:0,createdAtMs:at});
       }
     }
     tx.set(stateRef,{status:partialCoverage?'partial_coverage':'available',reason:partialCoverage?'saved_area_exceeds_maryland_provider_coverage':null,checkedAt:at,baselineAt:previous?.baselineAt||at,coverageBaselineAt:boundary,coverageDigest,activeAlerts:matched.map(x=>({event:x.event,matches:x.matches})),unresolved:[]},{merge:true});
   });
   return {status:'available',matched:matched.length};
 }
 async function readAlert(uid,id){
   const workspace=await settings(uid);if(typeof id!=='string'||!id.startsWith(uid+'_')||id.includes('/'))throw Error('weather_alert_forbidden');
   const record=(await db.doc('weatherAlertDeliveries/'+id).get()).data();if(!record||record.userId!==uid)throw Error('weather_alert_forbidden');
   const relatedWork=[];
   if(record.event.expiresAt>now()&&record.event.status!=='cancelled'){
     const feature=await nws(record.event.officialUrl).catch(()=>null);
     if(feature){const official=await geo.alertGeometry(feature,zone).catch(()=>null);
       if(official){const active=await db.collection('campaignZones').where('businessId','==',uid).where('status','==','in_progress').limit(50).get();
         for(const row of active.docs){const value=row.data();try{
           if(!value.campaignId||!geo.matches({areas:[{id:row.id,name:value.zoneName||'Active work',kind:'service',geometry:geo.geometry({geometry:value.serviceArea})}]},official).length)continue;
           const campaign=(await db.doc('campaigns/'+value.campaignId).get()).data();if(campaign?.businessId===uid)relatedWork.push({zoneId:row.id,label:value.zoneName||'Active outdoor work',route:'/job-room/'+encodeURIComponent(row.id)});
         }catch{ /* Missing authoritative geography does not imply a match. */ }}
       }
     }
   }
   return {...present(record,workspace.timeZone),relatedWork};
 }
 async function resumeDeferred(){
   for(const status of ['held_quiet','held_provider']){
   const held=await db.collection('outboundEmailJobs').where('template','==','weather_alert_v2').where('status','==',status).limit(100).get();
   for(const row of held.docs){const j=row.data();if(j.notBefore>now())continue;
     await db.runTransaction(async tx=>{const current=(await tx.get(row.ref)).data();if(['held_quiet','held_provider'].includes(current?.status)&&current.notBefore<=now())tx.update(row.ref,{status:'retry_requested'});});}
   }
 }
 async function monitor(){
   const [discovery,legacy]=await Promise.all([db.collection('discoveryPreferences').where('role','==','business').limit(500).get(),db.collection('users').where('weatherCoverageEnabled','==',true).limit(500).get()]);
   const ids=[...new Set([...discovery.docs,...legacy.docs].map(d=>d.id))];
   let features=[];
   try{
     if(!providerBoundary){const boundaries=[];for(const code of Object.values(COUNTY_CODES)){boundaries.push(geo.geometry((await zone('https://api.weather.gov/zones/county/'+code)).geometry));}providerBoundary=geo.union(boundaries);}
     let url='https://api.weather.gov/alerts?area=MD&limit=500&start='+encodeURIComponent(new Date(now()-48*3600000).toISOString());
     for(let page=0;url&&page<6;page++){const response=await nws(url);if(!Array.isArray(response.features))throw Error('weather_provider_response_invalid');features.push(...response.features);url=response.pagination?.next||null;}
     if(url)throw Error('weather_provider_response_incomplete');
   }catch(error){const reason=/^weather_[a-z_]+$/.test(error.message)?error.message:'weather_check_unavailable';for(const uid of ids)await db.doc('weatherMonitoringState/'+uid).set({status:'provider_unavailable',checkedAt:now(),reason},{merge:true});return {status:'provider_unavailable',reason};}
   for(const uid of ids){try{await monitorUser(uid,features);}catch(error){await db.doc('weatherMonitoringState/'+uid).set({status:'coverage_or_provider_unavailable',checkedAt:now(),reason:/^weather_[a-z_]+$/.test(error.message)?error.message:'weather_check_unavailable'},{merge:true});}}
   await resumeDeferred();return {status:'checked',workspaces:ids.length};
 }
 return {settings,context,dispatch,monitorUser,nws,monitor,readAlert,resumeDeferred};
}
module.exports={createService,COUNTY_CODES};
