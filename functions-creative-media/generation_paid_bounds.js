'use strict';
// Conservative reservations for one explicitly bounded call, never a forecast
// of a whole queue. USD microdollars; round charges upward, not toward zero.
const IMAGE_RESERVE=500000, REVIEW_RESERVE=100000;
function imageRequest(config,prompt){
 if(config.modelSnapshot!=='gpt-image-2-2026-04-21'||config.size!=='1536x1024'||config.quality!=='medium'||
    Buffer.byteLength(prompt,'utf8')>8192)throw Error('generation_request_outside_cost_bound');
 return {model:config.modelSnapshot,prompt,n:1,size:'1536x1024',quality:'medium',output_format:'webp',moderation:'auto'};
}
function imageCost(usage){
 const text=usage?.input_tokens_details?.text_tokens,image=usage?.input_tokens_details?.image_tokens??0,
  output=usage?.output_tokens_details?.image_tokens??usage?.output_tokens;
 if(![text,image,output].every(n=>Number.isSafeInteger(n)&&n>=0))return null;
 // Existing approved standard rates: $5/$8/$30 per million tokens.
 return Math.ceil(text*5+image*8+output*30);
}
function reviewCost(model,usage){
 const rates={'gpt-4.1-mini':[.4,1.6],'gpt-5.4-mini':[.75,4.5]}[model];
 if(!rates||![usage?.input_tokens,usage?.output_tokens].every(n=>Number.isSafeInteger(n)&&n>=0))return null;
 return Math.ceil(usage.input_tokens*rates[0]+usage.output_tokens*rates[1]);
}
module.exports={IMAGE_RESERVE,REVIEW_RESERVE,imageRequest,imageCost,reviewCost};
