/** Publication geometry from NEO 1.3.5 app.js:5931 and styles.css:1800. */
import PDFDocument from 'pdfkit';
import {readFile} from 'node:fs/promises';
import {screenplayPaginate,legacyScreenplayClasses,type ScreenplayScriptValue,type ScreenplayLineValue,type ScreenplayRunValue,type ScreenplayElementValue} from '@leafloom/document-contracts';
import {pdfGlyphFace,pdfGlyphRuns,type PDFGlyphFace} from './pdf-glyphs.ts';
const unicodeRanges={latin: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD', 'latin-ext': 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF'};
type Fragment={text:string;marks:ScreenplayRunValue['marks'];face:PDFGlyphFace;width:number};
const geometry=(element:ScreenplayElementValue)=>element==='character'?{x:266.4,width:277.2}:element==='parenthetical'?{x:223.2,width:183.6}:element==='dialogue'?{x:180,width:255.6}:{x:108,width:435.6};
const plain=(line:ScreenplayLineValue)=>line.runs.map(run=>run.text).join('');
const bare=(text:string)=>text.replace(/\s*\^\s*$/,'').replace(/\s*\([^)]*\)?\s*$/,'').trim().toUpperCase();
function continued(lines:ScreenplayLineValue[],index:number){const me=bare(plain(lines[index]!));if(!me||/\(/.test(plain(lines[index]!)))return false;let between=false;for(let j=index-1;j>=0;j--){const line=lines[j]!;if(['scene-heading','transition'].includes(line.element))return false;if(line.element==='character')return between&&bare(plain(line))===me;if(['action','shot'].includes(line.element)&&plain(line).trim())between=true;}return false;}
function publicationLines(script:ScreenplayScriptValue){return script.lines.filter((line,index,all)=>plain(line).trim()||(index>0&&index<all.length-1)).map((line,index,all)=>({element:line.element,runs:[...line.runs.map(run=>({...run,text:['scene-heading','character','transition','shot'].includes(line.element)?run.text.toUpperCase():run.text})),...(line.element==='character'&&continued(all,index)?[{text:" (CONT'D)",marks:[] as ScreenplayRunValue['marks']}]:[])]}));}
const variant=(marks:ScreenplayRunValue['marks'])=>marks.includes('bold')?marks.includes('italic')?'BoldItalic':'Bold':marks.includes('italic')?'Italic':'Regular';
async function fontAsset(file:string){try{return await readFile(new URL('./font-assets/'+file,import.meta.url));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;return readFile(new URL('../public/fonts/'+file,import.meta.url));}}
async function screenplayFonts(doc:PDFKit.PDFDocument,outputText:string){
 const faces=new Map<string,PDFGlyphFace[]>();let css='';
 for(const [name,weight,style] of [['Regular',400,'normal'],['Bold',700,'normal'],['Italic',400,'italic'],['BoldItalic',700,'italic']] as const){
  const loaded:PDFGlyphFace[]=[];
  for(const subset of ['latin','latin-ext']){const nameBase=`courier-prime-${subset}-${weight}-${style}`,bytes=await fontAsset(nameBase+'.woff2'),pdfBytes=await fontAsset(nameBase+'.ttf');const key=`Courier-${name}-${subset}`;doc.registerFont(key,pdfBytes);loaded.push(pdfGlyphFace(key,pdfBytes));css+=`@font-face{font-family:'Courier Prime';src:url(data:font/woff2;base64,${bytes.toString('base64')});font-weight:${weight};font-style:${style};unicode-range:${unicodeRanges[subset as keyof typeof unicodeRanges]};}\n`;}
  const fallback=await readFile(new URL(`./fonts/NotoSerif-${name}.ttf`,import.meta.url)),key=`Fallback-${name}`;doc.registerFont(key,fallback);loaded.push(pdfGlyphFace(key,fallback));faces.set(name,loaded);
 }
 const points=Array.from(outputText,char=>char.codePointAt(0)!);
 if(points.some(point=>point!==10&&point!==13&&![...faces.values()].every(variants=>variants.some(face=>face.supports(point))))){
  for(const weight of ['Regular','Bold'] as const){const name='Screenplay-CJK-'+weight,bytes=await readFile(new URL(`./fonts/NotoSerifCJKjp-${weight}.otf`,import.meta.url));doc.registerFont(name,bytes);const face=pdfGlyphFace(name,bytes);faces.get(weight)!.push(face);faces.get(weight==='Regular'?'Italic':'BoldItalic')!.push({...face,oblique:true});}
 }
 return {faces,css};
}
function rows(line:ScreenplayLineValue,faces:Map<string,PDFGlyphFace[]>,maximumWidth?:number):Fragment[][]{
 const tokens:Fragment[]=[];
 for(const run of line.runs){const marks:ScreenplayRunValue['marks']=line.element==='scene-heading'?[...run.marks,'bold']:run.marks;for(const glyphs of pdfGlyphRuns(run.text,faces.get(variant(marks))!))for(const {segment} of new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(glyphs.text))tokens.push({text:segment,marks,face:glyphs.face,width:segment==='\n'?0:glyphs.face.bounds(segment).advance/glyphs.face.metrics.units*12});}
 const result:Fragment[][]=[];let row:Fragment[]=[],width=0;const max=maximumWidth??geometry(line.element).width;
 for(const token of tokens){if(token.text==='\n'){result.push(row);row=[];width=0;continue;}if(width+token.width>max&&row.length){let split=-1;for(let i=row.length-1;i>=0;i--)if(/\s/.test(row[i]!.text)){split=i+1;break;}if(split>0){result.push(row.slice(0,split));row=row.slice(split);width=row.reduce((sum,r)=>sum+r.width,0);}else{result.push(row);row=[];width=0;}}row.push(token);width+=token.width;}
 result.push(row);return result;
}
function drawRow(doc:PDFKit.PDFDocument,row:Fragment[],x:number,y:number){
 const groups:Fragment[]=[];for(const token of row){const previous=groups.at(-1);if(previous&&previous.face===token.face&&JSON.stringify(previous.marks)===JSON.stringify(token.marks)){previous.text+=token.text;previous.width+=token.width;}else groups.push({...token});}
 for(const group of groups){doc.font(group.face.name).fontSize(12).text(group.text,x,y,{lineBreak:false,oblique:group.face.oblique,underline:group.marks.includes('underline'),strike:group.marks.includes('strike')});x+=group.width;}
}
const escape=(text:string)=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export async function screenplayPublication(script:ScreenplayScriptValue,format:'pdf'|'html',language='en'):Promise<Buffer>{
 const doc=new PDFDocument({size:'LETTER',margin:0,compress:false,bufferPages:true,info:{Title:script.title.title,Author:script.title.author},lang:language});
 const chunks:Buffer[]=[];const complete=new Promise<Buffer>((resolve,reject)=>{doc.on('data',chunk=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 const {faces,css}=await screenplayFonts(doc,[...Object.values(script.title),...script.lines.map(plain)].join('\n')),lines=publicationLines(script),wrapped=lines.map(line=>rows(line,faces)),pagination=screenplayPaginate(lines.map((line,index)=>({type:line.element,lines:wrapped[index]!.length})));
 const title=script.title;
 if(format==='html'){
  const htmlRows=Array.from({length:pagination.pages},()=>[] as string[]);let page=1,used=0;
  const rich=(row:Fragment[])=>row.map(run=>{let text=escape(run.text);for(const mark of run.marks){const tag={bold:'b',italic:'i',underline:'u',strike:'s'}[mark];text=`<${tag}>${text}</${tag}>`;}return text;}).join('')||'&nbsp;';
  lines.forEach((line,index)=>{const placement=pagination.at[index]!;if(page<placement.page){page=placement.page;used=0;}used+=placement.before;let first=true;for(const row of wrapped[index]!){if(used>=54){page++;used=0;}htmlRows[page-1]??=[];htmlRows[page-1]!.push(`<p class="${legacyScreenplayClasses[line.element]}" style="margin-top:${first?placement.before:0}em">${rich(row)}</p>`);first=false;used++;}});
  const titlePage=`<div class="page title"><div class="tp-main"><div>${escape(title.title.toUpperCase())}</div>${title.credit?`<div class="gap">${escape(title.credit)}</div>`:''}<div class="${title.credit?'':'gap'}">${escape(title.author)}</div></div><div class="tp-contact">${escape(title.contact??'').replace(/\n/g,'<br>')}</div><div class="tp-draft">${escape(title.draft??'').replace(/\n/g,'<br>')}</div></div>`;
  doc.end();await complete;
  return Buffer.from(`<!DOCTYPE html><html lang="${escape(language)}"><head><meta charset="utf-8"><title>${escape(title.title)}</title><style>${css}\n@page{size:8.5in 11in;margin:0}html,body{margin:0;padding:0;background:#fff}body{font-family:'Courier Prime','Courier New',Courier,monospace;font-size:12pt;line-height:12pt;color:#000}.page{width:8.5in;height:11in;box-sizing:border-box;padding:1in 1in 0 1.5in;position:relative;overflow:hidden;break-after:page}.page:last-child{break-after:auto}.num{position:absolute;top:.5in;right:1in}p{margin:0;width:36.3em;white-space:pre-wrap;overflow-wrap:anywhere}p.sp-character{margin-left:13.2em;width:23.1em}p.sp-paren{margin-left:9.6em;width:15.3em}p.sp-dialogue{margin-left:6em;width:21.3em}p.sp-transition{text-align:right}p.sp-heading{font-weight:bold}.title{text-align:center}.tp-main{position:absolute;top:3.5in;left:1.5in;width:6in}.tp-main .gap{margin-top:2em}.tp-main div+div:not(.gap){margin-top:1em}.tp-contact{position:absolute;left:1.5in;bottom:1in;width:3.5in;text-align:left}.tp-draft{position:absolute;right:1in;bottom:1in;width:2.5in;text-align:right}</style></head><body>${titlePage}${htmlRows.map((page,index)=>`<div class="page">${index?`<div class="num">${index+1}.</div>`:''}${page.join('')}</div>`).join('')}</body></html>`);
 }
 const titleRows=(text:string,width=432)=>rows({element:'action',runs:[{text,marks:[]}]},faces,width);
 let y=252;for(const text of [title.title.toUpperCase(),...(title.credit?[title.credit]:[]),title.author]){for(const row of titleRows(text)){drawRow(doc,row,108+(432-row.reduce((sum,r)=>sum+r.width,0))/2,y);y+=12;}y+=text===title.title.toUpperCase()?24:12;}
 for(const [text,x,width,right] of [[title.contact??'',108,252,false],[title.draft??'',360,180,true]] as const){const block=titleRows(text,width);block.forEach((row,index)=>drawRow(doc,row,x+(right?width-row.reduce((sum,r)=>sum+r.width,0):0),720-block.length*12+index*12));}
 let page=0,used=0;const nextPage=()=>{doc.addPage();page++;used=0;if(page>1){const text=`${page}.`,row=titleRows(text)[0]!;drawRow(doc,row,540-row.reduce((sum,r)=>sum+r.width,0),36);}};nextPage();
 lines.forEach((line,index)=>{const placement=pagination.at[index]!;while(page<placement.page)nextPage();used+=placement.before;for(const row of wrapped[index]!){if(used>=54)nextPage();const geom=geometry(line.element);drawRow(doc,row,geom.x+(line.element==='transition'?geom.width-row.reduce((sum,r)=>sum+r.width,0):0),72+used*12);used++;}});
 doc.end();return complete;
}
