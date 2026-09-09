'use strict';
// Mechanical resizing/composition only. Never redraw, trace, recolor or generate
// the approved symbol. The native launch surface deliberately remains the same
// light brand canvas in light/dark OS appearance for legible unchanged artwork.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sharp=require('../functions/node_modules/sharp');
const root=path.resolve(__dirname,'..'),mobile=path.join(root,'apps/mobile');
const source='apps/mobile/assets/brand/scaledcircle-symbol.png';
const sourceHash='1b21dabe8d32acd3e62fd413359caecd39534be6170bb869c6ab35030df420c1';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const bg='#f5f9ff',files={};
async function icon(relative,size,fraction,opaque){
 const symbol=await sharp(path.join(root,source)).resize(Math.round(size*fraction),Math.round(size*fraction),{fit:'inside'}).png().toBuffer();
 let canvas=sharp({create:{width:size,height:size,channels:4,background:opaque?bg:{r:0,g:0,b:0,alpha:0}}}).composite([{input:symbol,gravity:'centre'}]);
 if(opaque)canvas=canvas.flatten({background:bg}).removeAlpha();
 const bytes=await canvas.png().toBuffer();
 const destination=path.join(mobile,relative);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,bytes);
 files[relative]={sha256:hash(bytes),size,opaque};
}
async function main(){
 if(hash(fs.readFileSync(path.join(root,source)))!==sourceHash)throw Error('Approved symbol hash changed. Do not regenerate from unreviewed artwork.');
 const approved=path.join(mobile,'assets/brand/source/scaledcircle-approved-artwork.png');
 if(hash(fs.readFileSync(approved))!=='7fe471f94a00bd5595b9c48ea5ede2ebf52004fc94b6c31ef65a279735d874fb')throw Error('Approved original artwork hash changed.');
 const icons='ios/Runner/Assets.xcassets/AppIcon.appiconset';
 for(const filename of fs.readdirSync(path.join(mobile,icons)).filter(n=>n.endsWith('.png'))){
  const match=/Icon-App-([0-9.]+)x[0-9.]+@([123])x\.png/.exec(filename);if(!match)throw Error('Unreviewed icon filename '+filename);
  await icon(icons+'/'+filename,Math.round(Number(match[1])*Number(match[2])),0.78,true);
 }
 for(const scale of [1,2,3])await icon('ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage'+(scale===1?'':'@'+scale+'x')+'.png',144*scale,0.78,false);
 for(const [density,scale]of [['mdpi',1],['hdpi',1.5],['xhdpi',2],['xxhdpi',3],['xxxhdpi',4]]){
  await icon(`android/app/src/main/res/mipmap-${density}/ic_launcher.png`,48*scale,0.78,true);
  // Foreground fits inside the adaptive-icon safe zone without stretching.
  await icon(`android/app/src/main/res/drawable-${density}/ic_launcher_foreground.png`,108*scale,0.55,false);
  await icon(`android/app/src/main/res/drawable-${density}/launch_symbol.png`,144*scale,0.78,false);
 }
 const manifest={version:'ScaledCircleNativeBrandV1',source,sourceSha256:sourceHash,composition:'Exact proportional symbol; pale brand canvas for launcher and OS launch in both light/dark appearance.',background:bg,files};
 fs.writeFileSync(path.join(mobile,'assets/brand/native-brand-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify({generated:Object.keys(files).length,sourceSha256:sourceHash}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
