"use strict";
// Display-only, after Job Room membership has been established. No profile edits.
async function load(db, room, actor) {
  const ids=[...new Set([room.scalerId,...(Array.isArray(room.scalerIds)?room.scalerIds:[])].filter(v=>typeof v==="string"&&v))];
  if (!actor?.uid || (!actor.isAdmin && actor.uid!==room.businessId && !ids.includes(actor.uid))) {
    throw new Error("job_room_member_required");
  }
  if(ids.length>50)return {available:false,participants:[]};
  const visible=actor.isAdmin||actor.uid===room.businessId?ids:ids.filter(id=>id===actor.uid);
  try {
    const participants=await Promise.all(visible.map(async uid=>{
      const profile=(await db.collection("users").doc(uid).get()).data()||{};
      const name=typeof profile.displayName==="string"?profile.displayName.trim().slice(0,120):null;
      return {uid,displayName:name||null};
    }));
    return {available:true,participants};
  } catch (_) {return {available:false,participants:[]};}
}
module.exports={load};
