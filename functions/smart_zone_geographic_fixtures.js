'use strict';
// Synthetic meter-scale geography; never provider records or production fixtures.
const anchor = {latitude: 39.16, longitude: -76.62};
const meters = 111320, longitudeMeters = meters * Math.cos(anchor.latitude * Math.PI / 180);
const p = (x, y) => ({latitude: anchor.latitude + y / meters, longitude: anchor.longitude + x / longitudeMeters});
const osm = (x, y) => ({lat: p(x, y).latitude, lon: p(x, y).longitude});
const ring = (left, bottom, right, top) => [[left, bottom], [right, bottom], [right, top], [left, top], [left, bottom]].map(([x, y]) => osm(x, y));
function grid() {
  const elements = []; let id = 0;
  for (const y of [-180, -60, 60, 180]) {
    elements.push({type: 'way', id: ++id, tags: {highway: 'residential'}, geometry: [-240, -120, 0, 120, 240].map(x => osm(x, y))});
    for (let x = -220; x <= 220; x += 40) elements.push({type: 'node', id: ++id,
      ...osm(x, y + 22), tags: {building: 'house', 'addr:housenumber': String(id), 'addr:street': 'Synthetic Road'}});
  }
  for (const x of [-240, 0, 240]) elements.push({type: 'way', id: ++id,
    tags: {highway: 'residential'}, geometry: [-180, -60, 60, 180].map(y => osm(x, y))});
  return elements;
}
const land = (tags, left, bottom, right, top, id = 1000) => ({type: 'way', id, tags,
  geometry: ring(left, bottom, right, top), center: osm((left + right) / 2, (bottom + top) / 2)});
module.exports = {anchor, p, osm, ring, grid, land};
