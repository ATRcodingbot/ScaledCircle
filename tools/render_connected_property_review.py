"""Render a source-coordinate diagnostic map; no fabricated basemap or UI."""
import json,math
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
root=Path(__file__).resolve().parents[1]
out=root/'docs/review-connected-property-20260930'
data=json.loads((out/'service-comparison.json').read_text(encoding='utf-8'))
osm=json.loads((root/'functions/fixtures/21061-corkran-osm-public.json').read_text(encoding='utf-8'))
boundary=osm['selectedBoundary'];c=data['comparisons'][-1]
w,e=min(p['longitude'] for p in boundary),max(p['longitude'] for p in boundary)
s,n=min(p['latitude'] for p in boundary),max(p['latitude'] for p in boundary)
cosine=math.cos((n+s)/2*math.pi/180);scale=640/(n-s)
left=round(620-(e-w)*cosine*scale/2);right=1240-left
xy=lambda p:(round(620+(p['longitude']-(e+w)/2)*cosine*scale),round(175+(n-p['latitude'])*scale))
font=lambda size:ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',size)
image=Image.new('RGB',(1240,1030),'#f6f9fc');d=ImageDraw.Draw(image)
d.text((45,24),'Connected territory: retained Corkran evidence',font=font(32),fill='#133445')
d.text((45,77),'Diagnostic replay only — not the exact physical Ferndale boundary',font=font(24),fill='#9d3737')
d.text((45,116),'2 marketers × 4 hours · Stay together · one shared planning area',font=font(24),fill='#24475b')
d.polygon([xy(p) for p in boundary],fill='#e9eff5',outline='#526c82',width=3)
for elem in osm['elements']:
 if elem.get('tags',{}).get('highway') and elem.get('geometry'):
  pts=[xy({'latitude':p['lat'],'longitude':p['lon']}) for p in elem['geometry']]
  if len(pts)>1:d.line(pts,fill='#c6d2df',width=2)
school=next(e for e in osm['elements'] if str(e['id'])==str(osm['schoolFeature']['id']))
if school.get('geometry'):
 pts=[xy({'latitude':p['lat'],'longitude':p['lon']}) for p in school['geometry']]
 d.polygon(pts,fill='#efbcbc',outline='#943b3b',width=2)
 d.text(pts[0],'School excluded',font=font(19),fill='#802525')
for i,a in enumerate(c['candidates']):
 d.polygon([xy(p) for p in a['geometry']],fill='#b2e9d9',outline='#137f67',width=3)
 for line in a['networkSegments']:d.line([xy(line['from']),xy(line['to'])],fill='#236984',width=3)
 for p in a['features']:
  x,y=xy(p);d.ellipse((x-4,y-4,x+4,y+4),fill='#067d61')
for box in [(0,0,1239,174),(0,816,1239,1029),(0,175,left-1,815),(right+1,175,1239,815)]:d.rectangle(box,fill='#f6f9fc')
d.text((45,24),'Connected territory: retained Corkran evidence',font=font(32),fill='#133445')
d.text((45,77),'Diagnostic replay only — not the exact physical Ferndale boundary',font=font(24),fill='#9d3737')
d.text((45,116),'2 marketers × 4 hours · Stay together · one shared planning area',font=font(24),fill='#24475b')
d.text((45,842),f"{c['mappedTargets']} mapped targets · 739 m supporting streets · {c['knownSubsetMinutes']} min known subset",font=font(27),fill='#133445')
d.text((45,889),'Full area/team workload incomplete. Execution route not verified.',font=font(24),fill='#713e24')
d.text((45,933),'OSM contributors · snapshot 2026-09-26 · MD iMAP source months Feb / May 2026',font=font(19),fill='#526579')
d.text((45,969),'No basemap, household verification, relocation connector or production acceptance implied.',font=font(19),fill='#526579')
image.save(out/'retained-connected-plan.png')
print(out/'retained-connected-plan.png')
