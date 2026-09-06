const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
test('approval deploy registration is staging-only',()=>{
 const prod=JSON.parse(fs.readFileSync('../firebase.json'));const stage=JSON.parse(fs.readFileSync('../firebase.staging.json'));
 assert.equal(prod.functions.some(f=>f.source==='functions-staging-admin'),false);
 assert.equal(stage.functions.filter(f=>f.source==='functions-staging-admin').length,1);
});
test('Admin approval UI has no direct profile or audit writes',()=>{
 const ui=fs.readFileSync('../apps/mobile/lib/screens/admin/staging_scaler_approval_screen.dart','utf8');
 assert.ok(ui.includes("httpsCallable('approveStagingScalerV1')"));assert.ok(ui.includes('AppEnvironmentConfig.isStaging'));
 assert.ok(!ui.includes('FirebaseFirestore'));assert.ok(!ui.includes('betaAccess'));
});
