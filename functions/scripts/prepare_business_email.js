'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),dest=path.join(root,'functions-business-email');
fs.mkdirSync(path.join(dest,'shared'),{recursive:true});
for(const file of ['business_workspace.js','business_operation_permissions.js','legal_consent.js','subscription_entitlements.js'])
  fs.copyFileSync(path.join(root,'functions',file),path.join(dest,'shared',file));
for(const file of ['growth_opportunity_preferences.js','growth_opportunities.js'])
  fs.copyFileSync(path.join(root,'functions-agentic-growth',file),path.join(dest,file));
fs.copyFileSync(path.join(dest,'growth_learning.js'),path.join(root,'functions-agentic-growth/mailbox_growth_learning.js'));
