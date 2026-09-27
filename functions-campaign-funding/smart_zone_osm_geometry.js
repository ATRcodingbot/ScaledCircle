'use strict';

// Source assembly only. Never closes an open source ring by inventing an edge.
// The caller supplies the maintained ring validator to avoid a planning cycle.
function assemble(element, {valid, contains}) {
  const same = (a, b) => a.latitude === b.latitude && a.longitude === b.longitude;
  const normalize = line => {
    if (!Array.isArray(line)) return null;
    const result = [];
    for (const p of line) {
      if (!Number.isFinite(p?.lat) || !Number.isFinite(p?.lon) || Math.abs(p.lat) > 85 || Math.abs(p.lon) > 180) return null;
      const point = {latitude: p.lat, longitude: p.lon};
      if (!result.length || !same(result.at(-1), point)) result.push(point);
    }
    return result;
  };
  const reasons = new Set(), outer = [], inner = [];
  const closed = ring => ring?.length >= 4 && same(ring[0], ring.at(-1));
  if (Array.isArray(element.geometry)) {
    const ring = normalize(element.geometry);
    if (closed(ring) && valid(ring)) outer.push(ring);
    else reasons.add(closed(ring) ? 'invalid_or_self_crossing_ring' : 'open_or_invalid_way');
  } else if (element.type === 'relation' || Array.isArray(element.members)) {
    if (element.tags?.type && !['multipolygon', 'boundary'].includes(element.tags.type)) reasons.add('unsupported_relation_type');
    const groups = {outer: [], inner: []}, seen = new Map();
    for (const member of element.members || []) {
      if (!['outer', 'inner'].includes(member.role)) { reasons.add('missing_or_unsupported_role'); continue; }
      if (member.type && member.type !== 'way') { reasons.add('unresolved_member_relation'); continue; }
      const line = normalize(member.geometry);
      if (!line || line.length < 2) { reasons.add('missing_member_geometry'); continue; }
      const forward = JSON.stringify(line), reverse = JSON.stringify([...line].reverse());
      const shapeKey = [forward, reverse].sort()[0];
      const key = member.ref == null ? shapeKey : String(member.ref);
      const previous = seen.get(key);
      if (previous) {
        if (previous.role !== member.role || previous.shapeKey !== shapeKey) reasons.add('conflicting_member');
        continue;
      }
      seen.set(key, {role: member.role, shapeKey}); groups[member.role].push(line);
    }
    for (const role of ['outer', 'inner']) {
      const pieces = groups[role];
      // Branching endpoints do not have a unique ring assembly.
      const degree = new Map();
      for (const line of pieces.filter(p => !closed(p))) for (const p of [line[0], line.at(-1)]) {
        const key = JSON.stringify(p); degree.set(key, (degree.get(key) || 0) + 1);
      }
      if ([...degree.values()].some(n => n !== 2)) reasons.add('unjoined_or_branching_members');
      while (pieces.length) {
        const ring = [...pieces.shift()];
        while (!same(ring[0], ring.at(-1))) {
          const matches = pieces.map((p, i) => same(ring.at(-1), p[0]) || same(ring.at(-1), p.at(-1)) ? i : -1).filter(i => i >= 0);
          if (matches.length !== 1) break;
          let next = pieces.splice(matches[0], 1)[0];
          if (!same(ring.at(-1), next[0])) next = [...next].reverse();
          ring.push(...next.slice(1));
        }
        if (closed(ring) && valid(ring)) (role === 'outer' ? outer : inner).push(ring);
        else reasons.add(closed(ring) ? 'invalid_or_self_crossing_ring' : 'unjoined_or_branching_members');
      }
    }
  }
  const footprints = outer.map(polygon => ({polygon, holes: []}));
  const clipping = require('polygon-clipping');
  const coordinates = ring => ring.map(p => [p.longitude, p.latitude]);
  const crosses = (a, b) => {
    // A hole must be wholly inside exactly one outer, with no boundary touch.
    const cross = (p,q,r) => (q.longitude-p.longitude)*(r.latitude-p.latitude)-(q.latitude-p.latitude)*(r.longitude-p.longitude);
    const on = (p,q,r) => Math.abs(cross(p,q,r)) < 1e-14 && r.longitude >= Math.min(p.longitude,q.longitude) && r.longitude <= Math.max(p.longitude,q.longitude) && r.latitude >= Math.min(p.latitude,q.latitude) && r.latitude <= Math.max(p.latitude,q.latitude);
    return a.slice(1).some((p,i) => b.slice(1).some((q,j) => {
      const x=a[i],y=b[j]; return cross(x,p,y)*cross(x,p,q)<0 && cross(y,q,x)*cross(y,q,p)<0 || on(x,p,y)||on(x,p,q)||on(y,q,x)||on(y,q,p);
    }));
  };
  for (const hole of inner) {
    const owners = footprints.filter(f => hole.every(p => contains(p, f.polygon)) && !crosses(hole, f.polygon));
    if (owners.length !== 1 || owners[0].holes.some(h => crosses(h, hole) || contains(hole[0], h) || contains(h[0], hole))) reasons.add('invalid_inner_topology');
    else owners[0].holes.push(hole);
  }
  // Overlapping outers are invalid; valid islands within holes remain possible.
  try {
    for (let i=0;i<footprints.length;i++) for(let j=i+1;j<footprints.length;j++) {
      const multi = f => [coordinates(f.polygon), ...f.holes.map(coordinates)];
      if (clipping.intersection(multi(footprints[i]), multi(footprints[j])).length) reasons.add('overlapping_outers');
    }
  } catch (_) { reasons.add('invalid_ring_topology'); }
  return {footprints, incomplete: reasons.size > 0, reasons: [...reasons].sort()};
}

module.exports = {assemble};
