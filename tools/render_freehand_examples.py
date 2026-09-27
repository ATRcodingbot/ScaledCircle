"""Render synthetic review geometry exported by the maintained Dart helper."""
import json
from pathlib import Path
import math
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
folder = root / 'docs' / 'qa-artifacts'
examples = json.loads((folder / 'freehand-repair-examples.json').read_text(encoding='utf-8'))
image = Image.new('RGB', (1200, 1040), '#f7f9fc')
draw = ImageDraw.Draw(image)
fonts = Path('C:/Windows/Fonts')
title = ImageFont.truetype(str(fonts / 'arialbd.ttf'), 27)
normal = ImageFont.truetype(str(fonts / 'arial.ttf'), 19)
small = ImageFont.truetype(str(fonts / 'arial.ttf'), 16)
draw.text((30, 20), 'Freehand cleanup — synthetic local traces', font=title, fill='#10243b')
draw.text((30, 57), 'Not production territory. Orange dashed: raw stroke. Blue: proposed unsaved boundary.', font=normal, fill='#334960')

def plot(item, box, limits=None):
    raw = item['rawMeters']
    preview = item['previewMeters']
    left, top, right, bottom = box
    if limits is None:
        xs, ys = zip(*raw)
        lo_x, hi_x, lo_y, hi_y = min(xs)-10, max(xs)+10, min(ys)-10, max(ys)+10
    else:
        lo_x, hi_x, lo_y, hi_y = limits
    scale = min((right-left)/(hi_x-lo_x), (bottom-top)/(hi_y-lo_y))
    def transform(points):
        return [(left+(x-lo_x)*scale, bottom-(y-lo_y)*scale) for x, y in points]
    draw.rectangle(box, fill='white', outline='#d5deeb')
    # Draw into a local crop so zoomed raw lines never escape the inset.
    layer = Image.new('RGB', image.size, 'white')
    layer_draw = ImageDraw.Draw(layer)
    if preview:
        pts = transform(preview)
        layer_draw.polygon(pts, fill='#e6f3fc')
        layer_draw.line(pts+[pts[0]], fill='#087bac', width=4)
    points = transform(raw)
    for a, b in zip(points, points[1:] + [points[0]]):
        length = math.dist(a,b)
        if length == 0:
            continue
        for start in range(0, math.ceil(length), 12):
            segment = [(a[0]+(b[0]-a[0])*t/length, a[1]+(b[1]-a[1])*t/length) for t in [start, min(start+6,length)]]
            layer_draw.line(segment, fill='#d16b19', width=2)
    image.paste(layer.crop(box), (left, top))
    draw.rectangle(box, outline='#c4d3e4', width=1)

for index, item in enumerate(examples):
    x, y = 30 + (index % 2)*590, 110 + (index//2)*455
    draw.text((x, y), item['name'], font=normal, fill='#10243b')
    status = f"Repaired preview · {item['areaSquareMeters']:,.0f} m²" if item['valid'] else 'Ambiguous — Draw Again; no proposed area'
    draw.text((x, y+27), status, font=small, fill='#334960')
    plot(item, (x, y+60, x+540, y+380))
    draw.text((x, y+390), 'Equal horizontal/vertical scale · local metres', font=small, fill='#566d86')
    if index < 2:
        plot(item, (x+365, y+90, x+525, y+250), (-5,7,-5,7) if index == 0 else (98,105,48,56))
        draw.text((x+365, y+260), 'Local detail', font=small, fill='#334960')
image.save(folder / 'freehand-repair-examples.png')
