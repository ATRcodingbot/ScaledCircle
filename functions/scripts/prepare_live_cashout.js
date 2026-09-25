'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'../..'),output=path.join(root,'functions-scaler-cashout');
const files=['scaler_cashout_engine.js','scaler_cashout_shared.js','scaler_cashout_provider.js','scaler_cashout_live.js','scaler_cashout_recovery.js','scaler_cashout_live_store.js','live_work_certification.js','live_work_certification_policy.js','legal_consent.js','market_rollout.js','market_states.js','campaign_reserve_settlement.js','campaign_funding_quote.js','marketplace_finance.js'];
const hashes={};for(const name of files){const b=fs.readFileSync(path.join(root,'functions',name));fs.writeFileSync(path.join(output,name),b);hashes[name]=crypto.createHash('sha256').update(b).digest('hex');}
fs.copyFileSync(path.join(root,'functions-campaign-funding/campaign_funding_lifecycle.js'),path.join(output,'campaign_funding_lifecycle.js'));
for(const name of ['package.json','package-lock.json'])fs.copyFileSync(path.join(root,'functions',name),path.join(output,name));
if(!fs.existsSync(path.join(output,'node_modules')))fs.symlinkSync(path.join(root,'functions/node_modules'),path.join(output,'node_modules'),'junction');
console.log(JSON.stringify({output,files:hashes}));
