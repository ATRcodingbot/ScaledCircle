'use strict';
// Lossless computation over supplied permitted street evidence. No provider,
// connector, territory selection, execution-route authority or persistence.
const crypto=require('node:crypto');
const key=p=>`${p.latitude.toFixed(7)},${p.longitude.toFixed(7)}`;
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const semantics=e=>JSON.stringify(stable(Object.fromEntries(Object.entries(e).filter(([k])=>!['from','to','id','meters','targetIds','geometricKey'].includes(k)))));
function compact(edges,features,separation){
 const adjacency=new Map(),targetIds=new Map();
 for(const e of edges){targetIds.set(e.id,[]);for(const p of [e.from,e.to]){const k=key(p);if(!adjacency.has(k))adjacency.set(k,[]);adjacency.get(k).push(e);}}
 const ordered=[...edges].sort((a,b)=>a.id.localeCompare(b.id));
 for(const list of adjacency.values())list.sort((a,b)=>a.id.localeCompare(b.id));
 // Each target stays attached to its original nearest permitted atomic segment.
 for(const f of [...features].sort((a,b)=>String(a.addressKey||a.id||a.sourceId).localeCompare(String(b.addressKey||b.id||b.sourceId)))){
  let best=null,distance=Infinity;for(const e of ordered){const d=separation(f,e);if(d<distance){distance=d;best=e;}}
  if(!best||distance>60)return {unavailable:'Some targets lack an association within the maintained 60 m street-support limit.'};
  targetIds.get(best.id).push(String(f.addressKey||f.id||f.sourceId));
 }
 // Never remove a junction, access distinction, or target-bearing edge endpoint.
 const anchors=new Set([...adjacency].filter(([,es])=>es.length!==2||es.some(e=>targetIds.get(e.id).length)||semantics(es[0])!==semantics(es[1])).map(([k])=>k));
 const seen=new Set(),chains=[];
 function trace(start,first){let current=start,e=first;const atoms=[];
  while(e&&!seen.has(e.id)){seen.add(e.id);atoms.push(e);current=key(e.from)===current?key(e.to):key(e.from);
   if(anchors.has(current))break;e=adjacency.get(current).find(n=>!seen.has(n.id));}
  const ids=atoms.map(e=>e.id);chains.push({id:crypto.createHash('sha256').update(JSON.stringify(ids)).digest('hex').slice(0,24),fromKey:start,toKey:current,
   meters:atoms.reduce((s,e)=>s+e.meters,0),atoms:atoms.map(e=>({id:e.id,meters:e.meters})),targetIds:ids.flatMap(id=>targetIds.get(id))});
 }
 for(const k of [...anchors].sort())for(const e of adjacency.get(k))if(!seen.has(e.id))trace(k,e);
 for(const e of ordered)if(!seen.has(e.id))trace([key(e.from),key(e.to)].sort()[0],e); // isolated cycles
 const nodes=new Map();for(const c of chains)for(const k of [c.fromKey,c.toKey]){if(!nodes.has(k))nodes.set(k,[]);nodes.get(k).push(c);}
 const used=new Set(),components=[];
 for(const c of [...chains].sort((a,b)=>a.id.localeCompare(b.id))){if(used.has(c.id))continue;const pending=[c],group=[];used.add(c.id);
  while(pending.length){const n=pending.pop();group.push(n);for(const k of [n.fromKey,n.toKey])for(const a of nodes.get(k))if(!used.has(a.id)){used.add(a.id);pending.push(a);}}
  components.push(group.sort((a,b)=>a.id.localeCompare(b.id)));
 }
 return {chains,components:components.sort((a,b)=>a[0].id.localeCompare(b[0].id)),atomicSegmentCount:edges.length};
}
function walk(chains){
 // Doubling every supplied chain realizes the existing twice-network walking
 // assumption on each connected component. It never draws a new connector.
 const nodes=new Map();for(const c of chains)for(let copy=0;copy<2;copy++){
  const e={id:c.id+'/'+copy,chain:c};for(const k of [c.fromKey,c.toKey]){if(!nodes.has(k))nodes.set(k,[]);nodes.get(k).push(e);}}
 for(const es of nodes.values())es.sort((a,b)=>b.id.localeCompare(a.id));
 const seen=new Set(),stack=[{node:[...nodes.keys()].sort()[0]}],circuit=[];
 while(stack.length){const top=stack.at(-1),es=nodes.get(top.node);while(es.length&&seen.has(es.at(-1).id))es.pop();const e=es.pop();
  if(e){seen.add(e.id);stack.push({node:e.chain.fromKey===top.node?e.chain.toKey:e.chain.fromKey,edge:e});}
  else{const last=stack.pop();if(last.edge)circuit.push({...last.edge,toKey:last.node});}}
 const handled=new Set();return circuit.reverse().map(e=>{const c=e.chain,first=!handled.has(c.id);handled.add(c.id);
  return {id:e.id,fromKey:c.fromKey===e.toKey?c.toKey:c.fromKey,toKey:e.toKey,meters:c.meters,walkingMinutes:c.meters/80,targetIds:first?c.targetIds:[],atoms:c.atoms,traversals:1};});
}
module.exports={compact,walk,semantics};
