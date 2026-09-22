const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {verify}=require('./verify_local_require_closure.cjs');
test('package verification includes deferred validation dependencies',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sc-email-package-'));const entry=path.join(dir,'index.js');
 fs.writeFileSync(entry,"exports.validate=()=>require('./templates').valid();");
 assert.throws(()=>verify(entry),/Missing packaged dependency/);
 fs.writeFileSync(path.join(dir,'templates.js'),'exports.valid=()=>true;');assert.equal(verify(entry),2);
 // Only delete the two fixture files created by this test, without recursion.
 fs.unlinkSync(entry);fs.unlinkSync(path.join(dir,'templates.js'));fs.rmdirSync(dir);
});
