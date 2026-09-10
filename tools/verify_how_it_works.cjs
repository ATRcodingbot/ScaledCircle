'use strict';
// Render the real HTML at mobile, tablet and desktop widths. No form submits,
// product actions, account access or provider mutations are performed.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const args=process.argv.slice(2),arg=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const {chromium}=require(arg('--playwright-module','playwright'));
const url=arg('--url','http://127.0.0.1:18622/how-it-works/'),output=path.resolve(arg('--output','.firebase/how-it-works-verification'));
(async()=>{
 fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({headless:true,channel:'chrome'}),results=[];
 try{for(const width of [320,375,390,768,1024,1440]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'networkidle'});
  assert.equal(await page.locator('h1').count(),1);assert.equal(await page.locator('.steps > li').count(),4);
  assert.equal(await page.locator('.intelligence-grid > article').count(),4);assert.equal(await page.locator('.tools-grid > article').count(),6);
  assert.equal(await page.locator('main').count(),1);assert.equal(await page.locator('img').count(),0);
  assert.equal(await page.locator('.button.primary').count(),2);
  const layout=await page.evaluate(()=>({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,headerHeight:document.querySelector('nav').getBoundingClientRect().height,
   overflowing:[...document.querySelectorAll('#marketing *')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.right>innerWidth+1;}).map(e=>e.tagName+'.'+e.className).filter(n=>!n.includes('skip-link'))}));
  assert.ok(layout.scrollWidth<=width,JSON.stringify(layout));assert.deepEqual(layout.overflowing,[]);
  if(width<=760){assert.ok(layout.headerHeight<=70);await page.locator('summary').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('details').getAttribute('open'),'');
   assert.equal(await page.locator('.menu-links a:visible').count(),5);
   if(width===390)await page.screenshot({path:path.join(output,'mobile-menu.png')});
   await page.locator('summary').click();assert.equal(await page.locator('.menu-links a:visible').count(),0);
  }else assert.equal(await page.locator('.desktop-links a:visible').count(),5);
  if([390,1440].includes(width)){const name=width===390?'mobile':'desktop';await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});await page.screenshot({path:path.join(output,name+'-top.png')});await page.locator('#workflow').screenshot({path:path.join(output,name+'-workflow.png')});}
  const referral=new URL(url);referral.searchParams.set('ref','ABC234');await page.goto(referral.href,{waitUntil:'networkidle'});
  assert.equal(await page.getByRole('link',{name:'Grow My Business'}).getAttribute('href'),'/?ref=ABC234#/businesses');
  assert.equal(await page.getByRole('link',{name:'Find Work'}).getAttribute('href'),'/?ref=ABC234#/scalers');
  assert.equal(await page.getByRole('link',{name:'Contact support'}).getAttribute('href'),'mailto:support@scaledcircle.com');
  assert.equal(await page.locator('flutter-view').count(),0);assert.deepEqual(errors,[]);
  results.push({width,status:'PASS',...layout});await page.close();
 }
 fs.writeFileSync(path.join(output,'render-verification.json'),JSON.stringify({url,results},null,2));console.log(JSON.stringify({status:'PASS',url,widths:results.map(r=>r.width),screenshots:output}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
