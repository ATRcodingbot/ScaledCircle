'use strict';
// Source-only permission adapter for pinned production handlers. Financial
// formulas and stored contracts remain in the original archived handlers.
const path=require('node:path');
const parser=require(path.join(__dirname,'../functions/node_modules/@babel/parser'));
function adapt(source,name,{wrap=true,contextPath='./workspace_access'}={}) {
 if(!['./workspace_access','../workspace_access'].includes(contextPath))throw Error('Unreviewed context module');
 const context=`require('${contextPath}').CONTEXT`;
 source=source.replace('async function authenticatedUserContext(request, message) {',
   `async function authenticatedUserContext(request, message) {\n  if(request[${context}])return request[${context}];`);
 source=source.replace('const businessId = request.auth.uid;',`const businessId = request[${context}]?.businessId || request.auth.uid;`);
 if(wrap){
  const node=parser.parse(source).program.body.find(n=>n.type==='ExpressionStatement'&&n.expression?.type==='AssignmentExpression'&&n.expression.left?.object?.name==='exports'&&n.expression.left?.property?.name===name);
  if(!node)throw Error('Pinned export missing '+name);
  const handler=node.expression.right.arguments?.at(-1);
  if(!['ArrowFunctionExpression','FunctionExpression'].includes(handler?.type))throw Error('Pinned handler shape changed '+name);
  source=source.slice(0,handler.start)+`productionBusinessOperation('${name}',`+source.slice(handler.start,handler.end)+')'+source.slice(handler.end);
  source+=`\nfunction productionBusinessOperation(name,handler){return async request=>{
    const workspace=require('./business_workspace').createWorkspaceService({db,auth:require('firebase-admin/auth').getAuth(),FieldValue,Timestamp,origin:'https://scaledcircle.com'});
    try{return await require('./workspace_access').createAccessAdapter({db,workspace,FieldValue})(name,request,handler);}
    catch(error){if(error instanceof HttpsError)throw error;
      if(['unauthenticated','permission-denied','invalid-argument','failed-precondition','not-found','resource-exhausted'].includes(error.code))throw new HttpsError(error.code,error.message);
      throw new HttpsError('internal','The workspace operation could not complete. Please retry.');}
  };}\n`;
 }
 return source;
}
module.exports={adapt};
