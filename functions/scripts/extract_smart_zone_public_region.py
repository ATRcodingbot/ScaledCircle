"""Offline maintained import: retain complete relevant OSM way/member geometry."""
import json, sys, time, hashlib, gzip
from pathlib import Path

import argparse, os
parser = argparse.ArgumentParser(description='Offline Maryland public geometry extraction; no cloud writes')
parser.add_argument('--pbf', required=True)
parser.add_argument('--download-metadata', required=True)
parser.add_argument('--bounds', required=True, help='west,south,east,north within the source .poly; importer intersects coverage')
parser.add_argument('--output', required=True)
opts = parser.parse_args()
import osmium
PBF = Path(opts.pbf)
BOX = tuple(float(v) for v in opts.bounds.split(','))
if len(BOX) != 4 or not (-180 <= BOX[0] < BOX[2] <= 180 and -90 <= BOX[1] < BOX[3] <= 90):
    raise ValueError('invalid_bounds')
if Path(opts.output).exists(): raise ValueError('output_already_exists')
download = json.loads(Path(opts.download_metadata).read_text(encoding='utf-8'))
with PBF.open('rb') as source:
    if hashlib.file_digest(source, 'sha256').hexdigest() != download['sha256']:
        raise ValueError('source_checksum_mismatch')
ALLOWED = set('building building:levels building:material roof:shape roof:material shop office amenity craft landuse access foot barrier entrance area highway railway natural waterway leisure boundary place type service bridge tunnel layer addr:housenumber addr:street'.split())
BUILDINGS = set('apartments bungalow detached house residential semidetached_house terrace commercial retail school college university hospital civic government industrial warehouse'.split())
AMENITIES = set('school kindergarten college university hospital prison community_centre theatre place_of_worship grave_yard townhall courthouse police fire_station parking'.split())
ROADS = set('residential living_street service unclassified tertiary pedestrian motorway motorway_link trunk trunk_link'.split())

def selected(t, kind):
    return ('addr:housenumber' in t or t.get('building') in BUILDINGS or 'shop' in t or 'office' in t
        or t.get('amenity') in AMENITIES or t.get('landuse') in {'education','institutional','industrial','cemetery','commercial','retail'}
        or t.get('access') in {'private','no','permit'} or kind=='way' and (t.get('highway') in ROADS or t.get('railway') in {'rail','light_rail'})
        or t.get('natural')=='water' or t.get('waterway')=='riverbank' or t.get('leisure') in {'park','nature_reserve','stadium','sports_centre'}
        or kind=='relation' and t.get('boundary')=='place' and t.get('place') in {'neighbourhood','neighborhood','quarter','suburb'})

def within(lon, lat):
    return BOX[0] <= lon <= BOX[2] and BOX[1] <= lat <= BOX[3]

def overlaps(points):
    return points and min(p['lon'] for p in points)<=BOX[2] and max(p['lon'] for p in points)>=BOX[0] and min(p['lat'] for p in points)<=BOX[3] and max(p['lat'] for p in points)>=BOX[1]

def tags(obj):
    return {tag.k:tag.v for tag in obj.tags if tag.k in ALLOWED}

def metadata(obj,kind):
    return {'type':kind,'id':obj.id,'version':obj.version,'timestamp':str(obj.timestamp).replace('+00:00','Z'),'tags':tags(obj)}

class Region(osmium.SimpleHandler):
    def __init__(self):
        super().__init__();self.elements=[];self.ways={};self.way_bounds={};self.relation_index={};self.relations=[];self.missing=set();self.invalid=0
    def node(self,n):
        if n.location.valid() and within(n.location.lon,n.location.lat):
            t=tags(n)
            if selected(t,'node'): self.elements.append({**metadata(n,'node'),'lat':n.location.lat,'lon':n.location.lon})
    def way(self,w):
        if any(not n.location.valid() for n in w.nodes): self.invalid+=1;return
        line=[{'lat':n.lat,'lon':n.lon} for n in w.nodes]
        if not line: return
        self.way_bounds[w.id]=(min(p['lon'] for p in line), min(p['lat'] for p in line), max(p['lon'] for p in line), max(p['lat'] for p in line))
        if not overlaps(line): return
        self.ways[w.id]=line
        if selected(tags(w),'way'): self.elements.append({**metadata(w,'way'),'geometry':line})
    def relation(self,r):
        t=tags(r)
        self.relation_index[r.id]=[{'type':{'w':'way','n':'node','r':'relation'}[m.type],'ref':m.ref,'role':m.role} for m in r.members]
        if not selected(t,'relation'): return
        # Complete aggregate bounds also catch a multi-way footprint enclosing
        # the crop when none of its individual edge ways intersects that crop.
        boxes=[self.way_bounds[m.ref] for m in r.members if m.type=='w' and m.ref in self.way_bounds]
        if boxes:
            rb=(min(b[0] for b in boxes),min(b[1] for b in boxes),max(b[2] for b in boxes),max(b[3] for b in boxes))
            if rb[0]>BOX[2] or rb[2]<BOX[0] or rb[1]>BOX[3] or rb[3]<BOX[1]: return
        members=[{'type':{'w':'way','n':'node','r':'relation'}[m.type],'ref':m.ref,'role':m.role} for m in r.members]
        self.relations.append({**metadata(r,'relation'),'members':members})
        self.missing.update(m['ref'] for m in members if m['type']=='way' and m['ref'] not in self.ways)

def expand_members(members, index, seen=None):
    seen = set() if seen is None else seen
    result = []
    for member in members:
        if member['type'] != 'relation':
            result.append(dict(member)); continue
        ref = member['ref']
        if ref in seen or ref not in index or member['role'] not in {'outer', 'inner'}:
            result.append(dict(member)); continue
        for child in expand_members(index[ref], index, seen | {ref}):
            if child['role'] not in {'outer', 'inner'}:
                result.append(dict(member)); break
            if member['role'] == 'inner':
                child['role'] = 'outer' if child['role'] == 'inner' else 'inner'
            result.append(child)
    return result

class Missing(osmium.SimpleHandler):
    def __init__(self,region): super().__init__();self.region=region
    def way(self,w):
        if w.id in self.region.missing and all(n.location.valid() for n in w.nodes):
            self.region.ways[w.id]=[{'lat':n.lat,'lon':n.lon} for n in w.nodes]

start=time.monotonic();region=Region()
region.apply_file(str(PBF),locations=True,idx='flex_mem')
pass1=time.monotonic()-start
print(json.dumps({'stage':'initial_extract','seconds':round(pass1,3),'elements':len(region.elements),'relations':len(region.relations),'missingMembers':len(region.missing)}),flush=True)
for relation in region.relations:
    relation['members'] = expand_members(relation['members'], region.relation_index, {relation['id']})
    region.missing.update(m['ref'] for m in relation['members'] if m['type']=='way' and m['ref'] not in region.ways)
if region.missing: Missing(region).apply_file(str(PBF),locations=True,idx='flex_mem')
missing=[];nested=[]
for r in region.relations:
    for m in r['members']:
        if m['type']=='way':
            if m['ref'] in region.ways: m['geometry']=region.ways[m['ref']]
            else: missing.append(m['ref'])
        elif m['type']=='relation': nested.append(m['ref'])
    region.elements.append(r)
reader=osmium.io.Reader(str(PBF));header=reader.header();timestamp=header.get('osmosis_replication_timestamp');reader.close()

payload={'source':'OpenStreetMap via Geofabrik Maryland regional extract','sourceDataTimestamp':timestamp,
 'retrievedAt':download['retrievedAt'],'sourceSha256':download['sha256'],'bounds':BOX,'referenceIncomplete':bool(missing or nested),
 'invalidSourceWays':region.invalid,'missingMemberWays':missing,'unsupportedNestedRelations':nested,'elements':region.elements}
encoded=json.dumps(payload,separators=(',',':')).encode();compressed=gzip.compress(encoded,mtime=0)
Path(opts.output).write_bytes(encoded)
Path(opts.output + '.gz').write_bytes(compressed)
result={'stage':'complete','sourceDataTimestamp':timestamp,'elements':len(region.elements),'bufferedBounds':BOX,
 'missingMemberWays':len(missing),'unsupportedNestedRelations':len(nested),'invalidSourceWays':region.invalid,
 'jsonBytes':len(encoded),'gzipBytes':len(compressed),'sha256':hashlib.sha256(encoded).hexdigest(),'seconds':round(time.monotonic()-start,3)}
Path(opts.output + '.receipt.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps(result,indent=2))
