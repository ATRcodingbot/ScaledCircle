'use strict';
const crypto=require('node:crypto');
const sharp=require('sharp');
const {PDFDocument,PDFName}=require('pdf-lib');
const {PDFiumLibrary}=require('@hyzyla/pdfium');
const WIDTH=3375,HEIGHT=1875;
function fail(message){const e=new Error(message);e.code='invalid-argument';throw e;}
async function mailingPanelClear(bytes){
  // The approved rendition supplies the postal panel. Preserve customer art
  // elsewhere; reject artwork that would be covered by the reserved panel.
  const {data,info}=await sharp(bytes).flatten({background:'#fff'}).resize(810,450).removeAlpha().raw().toBuffer({resolveWithObject:true});
  let ink=0,total=0;
  for(let y=18;y<423;y++)for(let x=495;x<792;x++){
    // Existing indicia/address in these exact regions can be normalized.
    if((x>=677&&y<=110)||(x>=503&&y>=143&&y<=173))continue;
    const i=(y*info.width+x)*info.channels;total++;if(Math.min(data[i],data[i+1],data[i+2])<240)ink++;
  }
  return ink/total<0.001;
}
async function preflightArtwork(files){
  if(!Array.isArray(files)||!files.length||files.length>2)fail('Choose one front design, a two-page PDF, or separate front and back files.');
  let totalBytes=0,sourceRasterReview=false;const originals=[],pages=[];
  for(const file of files){
    const bytes=Buffer.from(file.base64||'','base64');totalBytes+=bytes.length;
    if(bytes.length<20||totalBytes>8*1024*1024)fail('Choose intact PDF, PNG or JPG files totaling at most 8 MB.');
    const pdf=bytes.subarray(0,5).toString()==='%PDF-';let contentType='application/pdf';
    if(pdf){
      let parsed;try{parsed=await PDFDocument.load(bytes,{updateMetadata:false});}catch(_){fail('This PDF cannot be opened. Export an unlocked, flattened PDF and try again.');}
      if(parsed.isEncrypted||parsed.getPageCount()>2||parsed.getPageCount()<1)fail('Use an unlocked PDF containing just the front and optional back.');
      if(parsed.catalog.has(PDFName.of('AcroForm'))||parsed.catalog.has(PDFName.of('OpenAction'))||parsed.catalog.has(PDFName.of('AA')))fail('Export a flattened print PDF without forms or interactive actions.');
      for(const p of parsed.getPages()){
        const s=p.getSize();if(Math.abs(s.width-810)>.25||Math.abs(s.height-450)>.25||p.getRotation().angle!==0)fail('The design needs a landscape 11 × 6 inch postcard with edge bleed. Export at 11.25 × 6.25 inches, or use a ScaledCircle template.');
      }
      const library=await PDFiumLibrary.init();let document;
      try{
        document=await library.loadDocument(bytes);
        for(const page of document.pages()){
          if(page.getObjectCount()>5000)fail('This design is too complex. Flatten it in your design app and try again.');
          const objects=[...page.objects()];
          sourceRasterReview ||= objects.some(o=>o.type==='image'||o.type==='form');
          if(objects.length===1&&objects[0].type==='image'){
            const image=await objects[0].getImageDataRaw();
            if(image.width<WIDTH||image.height<HEIGHT)fail('The image inside this PDF is too small for a clear postcard. Upload its original high-resolution artwork.');
          }
          const rendered=await page.render({scale:300/72,render:async({data,width,height})=>sharp(data,{raw:{width,height,channels:4}}).flatten({background:'#fff'}).png().toBuffer()});
          pages.push(Buffer.from(rendered.data));
        }
      }finally{document?.destroy();library.destroy();}
    }else{
      let meta;try{meta=await sharp(bytes,{limitInputPixels:40000000}).metadata();}catch(_){fail('This file is not a readable PDF, PNG or JPG.');}
      if(!['png','jpeg'].includes(meta.format)||meta.pages>1)fail('Use a still PNG or JPG, or a print-ready PDF.');
      if(meta.orientation && meta.orientation!==1)fail('Rotate and export the image in landscape orientation before uploading.');
      if(meta.width<WIDTH||meta.height<HEIGHT)fail('This image is too small for a clear postcard. Choose the original, at least 3375 × 1875 pixels.');
      if(Math.abs(meta.width/meta.height-1.8)>.002)fail('This image has a different shape. Export landscape 11.25 × 6.25 inch artwork; we will not stretch or crop your design.');
      contentType=meta.format==='png'?'image/png':'image/jpeg';
      pages.push(await sharp(bytes).flatten({background:'#fff'}).resize(WIDTH,HEIGHT,{fit:'contain',background:'#fff'}).png().toBuffer());
    }
    originals.push({bytes,contentType,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
  }
  if(pages.length>2)fail('Choose no more than two sides, in front then back order.');
  if(pages[1]&&!await mailingPanelClear(pages[1]))fail('The back has artwork in the mailing area. Leave its right half clear, or upload only the front and let ScaledCircle prepare the back.');
  return {originals,pages,report:{version:'PostcardUploadPreflightV1',dimensions:'pass',bleed:'pass',orientation:'pass',integrity:'pass',outputDpi:300,sourceResolution:sourceRasterReview?'admin_review_required':'pass',safeArea:'visual_approval_required',mailingPanel:pages.length===1?'generated_back':'reserved_panel_verified',noStretch:true,originalPreserved:true}};
}
module.exports={preflightArtwork,mailingPanelClear,WIDTH,HEIGHT};
