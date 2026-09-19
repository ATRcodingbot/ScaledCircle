'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const parser=require('@babel/parser'),traverse=require('@babel/traverse').default;
const {selectedProgram}=require('./scripts/select_function_program');
test('isolated recurring Social worker has no missing runtime helper bindings',()=>{
 const code=fs.readFileSync(require.resolve('../functions-social-operations/index.js'),'utf8');
 const program=selectedProgram(parser.parse(code),new Set(['runManagedSocialPreparationV1']));
 const globals=new Set(['require','exports','process','console','Buffer','Date','Math','JSON','Object','Array','String','Number','Boolean','Error','Set','Map','Promise','URL','undefined','Infinity','NaN','setTimeout','clearTimeout']);
 const missing=new Set();traverse({type:'File',program},{ReferencedIdentifier(p){if(!p.scope.hasBinding(p.node.name)&&!globals.has(p.node.name))missing.add(p.node.name);}});
 assert.deepEqual([...missing].sort(),[]);
});
