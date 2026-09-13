'use strict';
const names={followers:'Followers',views:'Views',reach:'Reach',total_interactions:'Interactions',profile_links_taps:'Profile link taps',mediaCount:'Account media count',page_media_view:'Page media views',page_post_engagements:'Post engagements',page_views_total:'Page views',postCount:'Account post count'};
function project(snapshots,plans=[]) {
 return {platforms:['facebook','instagram'].map(provider=>{
  const rows=snapshots.filter(s=>s.schemaVersion==='MetaBaselineV1'&&s.provider===provider&&Number.isFinite(Date.parse(s.observedAt))).sort((a,b)=>Date.parse(a.observedAt)-Date.parse(b.observedAt));
  const first=rows[0],last=rows.at(-1);
  const metrics=(provider==='facebook'?['followers','page_media_view','page_post_engagements','page_views_total','postCount']:['followers','views','reach','total_interactions','profile_links_taps','mediaCount']).map(key=>{
   const a=first?.metrics?.[key],b=last?.metrics?.[key];
   const identitySame=first?.providerAccountId===last?.providerAccountId&&first?.apiVersion===last?.apiVersion;
   // Point-in-time counts may be compared across observations. Period metrics
   // require the exact same provider window; rolling totals are not comparable.
   const instant=['followers','mediaCount'].includes(key);
   const periodSame=!!a?.period&&a.period===b?.period&&!!a.providerEndTime&&a.providerEndTime===b.providerEndTime&&JSON.stringify(first?.requestedRange)===JSON.stringify(last?.requestedRange);
   const comparable=rows.length>1&&identitySame&&(instant||periodSame)&&Number.isFinite(a?.value)&&Number.isFinite(b?.value);
   return {label:names[key],current:Number.isFinite(b?.value)?b.value:null,baseline:Number.isFinite(a?.value)?a.value:null,change:comparable?b.value-a.value:null};
  });
  const published=plans.flatMap(p=>p.items||[]).flatMap(i=>i.variants||[]).filter(v=>v.provider===provider&&v.status==='published').length;
  return {provider,baselineAt:first?.observedAt||null,currentAt:last?.observedAt||null,metrics,published};
 })};
}
module.exports={project};
