'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
for(const name of ['business_geography.js','service_area_resolution.js','service_area_geometry_codec.js'])assert.deepEqual(fs.readFileSync(path.join(__dirname,'..',name)),fs.readFileSync(path.join(__dirname,'../../functions-agentic-growth/shared',name)),name+' maintained geography drift');
console.log('Internal workspace uses byte-identical maintained geography primitives.');
