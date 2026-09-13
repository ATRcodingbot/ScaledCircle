'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
for(const name of ['business_workspace.js','business_operation_permissions.js','legal_consent.js'])
 fs.copyFileSync(path.join(root,'functions',name),path.join(root,'functions-social-operations',name));
fs.copyFileSync(path.join(root,'functions-social-operations/social_performance_presentation.js'),path.join(root,'functions-agentic-growth/social_performance_presentation.js'));
