'use strict';
// Copy the maintained production start gate into a read-only factory. The
// returned commit callback is deliberately never exposed or executed.
module.exports = function build(source) {
  const parser=require('../functions/node_modules/@babel/parser');
  const ast=parser.parse(source);
  const names=['campaignWorkPolicy','materialRequiredForCampaign','assertOperationalStart'];
  const declarations=names.map(name=>{
    const node=ast.program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);
    if(!node)throw Error('missing_start_gate_'+name);
    return source.slice(node.start,node.end);
  }).join('\n');
  return `'use strict';\nmodule.exports=({db,Timestamp,HttpsError,legalService})=>{
    const operations=require('./operational_layer');
    const legalConsent=require('./legal_consent');
    const canvassingCompletion=require('./canvassing_completion');
    async function requireCurrentLegalConsents(uid,agreementTypes,transaction){
      return legalService.requireCurrent({uid,agreementTypes,transaction});
    }
    ${declarations}
    return async (transaction,input)=>{await assertOperationalStart(transaction,input);return true;};
  };\n`;
};
