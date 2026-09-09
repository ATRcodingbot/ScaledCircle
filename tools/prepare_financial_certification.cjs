'use strict';
// Source-only, bounded staging assembly. Deployment is a separate explicit CLI step.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),parser=require(path.join(root,'functions/node_modules/@babel/parser')),
 generate=require(path.join(root,'functions/node_modules/@babel/generator')).default,
 {selectedProgram}=require('../functions/scripts/select_function_program');
const groups={
 'completion-authority-core':{source:'functions',names:['finalizeZoneReview']},
 'default':{source:'functions',names:['getBusinessMembership','previewBusinessMembershipChange','changeBusinessMembership','createSubscriptionCheckoutSession','createBillingPortalSession']},
 'campaign-funding':{source:'functions-campaign-funding',names:['stripeWebhook']},
};
function prepare(destination=path.join(root,'.firebase/final-financial-20260909/staging')){
 fs.mkdirSync(destination,{recursive:true});const config={functions:[]};
 for(const [group,{source,names}]of Object.entries(groups)){
  const from=path.join(root,source),out=path.join(destination,group);fs.mkdirSync(out,{recursive:true});
  const text=generate(selectedProgram(parser.parse(fs.readFileSync(path.join(from,'index.js'),'utf8')),new Set(names)),{comments:true}).code+'\n';
  fs.writeFileSync(path.join(out,'index.js'),text);const seen=new Set();
  function deps(body){for(const m of body.matchAll(/require\(['"]\.\/([A-Za-z0-9_-]+)['"]\)/g)){
   const name=m[1]+'.js';if(seen.has(name))continue;seen.add(name);const b=fs.readFileSync(path.join(from,name),'utf8');fs.writeFileSync(path.join(out,name),b);deps(b);
  }}deps(text);
  const pkg=JSON.parse(fs.readFileSync(path.join(from,'package.json')));delete pkg.scripts;
  fs.writeFileSync(path.join(out,'package.json'),JSON.stringify(pkg,null,2));
  fs.copyFileSync(path.join(from,'package-lock.json'),path.join(out,'package-lock.json'));
  fs.writeFileSync(path.join(out,'.env.scaledcircle-staging'),'APP_ENV=staging\n');
  config.functions.push({source:out.replaceAll('\\','/'),codebase:group,ignore:['node_modules','.git','*.log']});
 }
 const file=path.join(destination,'firebase.staging.private.json');fs.writeFileSync(file,JSON.stringify(config,null,2));
 return {project:'scaledcircle-staging',config:path.relative(root,file).replaceAll('\\','/'),selectors:Object.entries(groups).flatMap(([g,s])=>s.names.map(n=>`functions:${g}:${n}`)),productionDeployed:false};
}
if(require.main===module)console.log(JSON.stringify(prepare()));module.exports={prepare,groups};
