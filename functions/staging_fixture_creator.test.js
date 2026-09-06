"use strict";
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const creator=require('../functions-staging-admin/fixture_creator');
test('fixture creator exists only in the staging deploy codebase',()=>{
 assert.ok(!JSON.parse(fs.readFileSync('../firebase.json')).functions.some(f=>f.source==='functions-staging-admin'));
 assert.ok(JSON.parse(fs.readFileSync('../firebase.staging.json')).functions.some(f=>f.source==='functions-staging-admin'));
 const source=fs.readFileSync('../functions-staging-admin/index.js','utf8');
 assert.ok(source.includes('exports.createStagingDualMobileQaFixturesV1'));
 assert.ok(!source.includes('validatePacket:'));
});
test('geometry estimators exactly match maintained assignment authority',()=>{
 const source=fs.readFileSync('operational_layer.js','utf8');
 const start=source.indexOf('function haversineMeters(');
 const end=source.indexOf('\n}',source.indexOf('function zoneGeometryDigest('))+2;
 assert.ok(fs.readFileSync('../functions-staging-admin/fixture_geometry.js','utf8').replaceAll('\r\n','\n').includes(source.slice(start,end).replaceAll('\r\n','\n')));
});
test('deterministic binding commits exact purpose, identities, geometry and compensation',()=>{
 const ids=creator.FIXTURES.map(f=>creator.hash(creator.binding(f)));
 assert.equal(new Set(ids).size,2);
 for(const f of creator.FIXTURES){const b=creator.binding(f);assert.equal(b.compensationCents,1500);assert.equal(b.requiredTestFundingCents,1800);assert.equal(b.businessUid,creator.BUSINESS);}
});
test('production rejected before Auth or database use',async()=>{
 await assert.rejects(creator.createFixtureService({projectId:'scaled-circle'})({actorUid:'admin'}),/staging_only/);
});
test('caller cannot submit geometry, compensation or identity overrides',async()=>{
 for(const data of [{businessUid:'other'},{scalerUid:'other'},{geometry:[]},{compensationCents:1}]) {
  await assert.rejects(creator.createFixtureService({projectId:creator.PROJECT})({actorUid:'admin',data}),/empty_request_required/);
 }
});
test('uncommitted geometry rejected',()=>assert.throws(()=>creator.validateGeometry({projectId:creator.PROJECT,immutable:true,version:creator.GEOMETRY_VERSION,geometryHash:creator.GEOMETRY_HASH,geometry:Array(8).fill({latitude:0,longitude:0})}),/geometry_mismatch/));
