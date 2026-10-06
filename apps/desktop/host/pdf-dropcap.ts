import type PDFDocument from 'pdfkit';
import {type PDFGlyphFace} from './pdf-glyphs.ts';
type GlyphRun={text:string;face:PDFGlyphFace;underline?:boolean;strike?:boolean};
type Cluster={text:string;face:PDFGlyphFace;underline?:boolean;strike?:boolean};
const clusters=(runs:GlyphRun[])=>runs.flatMap(run=>Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(run.text),value=>({text:value.segment,face:run.face,underline:run.underline,strike:run.strike})));
function groups(values:Cluster[]):GlyphRun[]{
 const result:GlyphRun[]=[];
 for(const value of values){const previous=result.at(-1);if(previous?.face===value.face&&previous.underline===value.underline&&previous.strike===value.strike)previous.text+=value.text;else result.push({...value});}
 return result;
}

// A two-line initial uses real glyph bounds rather than a guessed font size.
// The semantic paragraph retains its complete text across the initial's face.
export function drawPDFDropCap(doc:InstanceType<typeof PDFDocument>,runs:GlyphRun[],capFaces:PDFGlyphFace[],bodyFace:PDFGlyphFace,left:number,width:number,alignment:PDFKit.Mixins.TextOptions['align'],size=13):boolean {
 const values=clusters(runs),start=values.findIndex(value=>/\S/u.test(value.text));
 if(start<0)return false;
 let end=start+1;
 if(/^\p{P}/u.test(values[start]!.text)){
  while(end<values.length&&end-start<16&&/^\p{P}/u.test(values[end]!.text))end++;
  if(end<values.length&&/^[\p{L}\p{N}]/u.test(values[end]!.text))end++;else end=start+1;
 }
 const initial=values.slice(start,end).map(value=>value.text).join('');
 const points=Array.from(initial,character=>character.codePointAt(0)!);
 const cap=capFaces.find(face=>points.every(point=>face.supports(point)));
 if(!cap)return false;
 const bounds=cap.bounds(initial),height=bounds.maxY-bounds.minY;
 if(height<=0||!Number.isFinite(height))return false;
 const lineHeight=size*1.7,bodyCap=bodyFace.metrics.capHeight/bodyFace.metrics.units*size;
 const capSize=(bodyCap+lineHeight)/height*cap.metrics.units;
 const inkWidth=(bounds.maxX-bounds.minX)/cap.metrics.units*capSize;
 const reserve=inkWidth+3; // CSS initial-letter reserves ink width plus source 4px padding
 if(reserve>=width/2)return false;
 if(doc.y+lineHeight*2>doc.page.height-doc.page.margins.bottom)doc.addPage();
 const top=doc.y,baseline=top+bodyFace.metrics.ascent/bodyFace.metrics.units*size;
 let remainder=values.slice(end);
 const measure=(line:Cluster[])=>groups(line).reduce((total,run)=>total+doc.font(run.face.name).fontSize(size*run.face.scale).widthOfString(run.text),0);
 const take=(available:number)=>{
  let used=0,space=-1;
  while(used<remainder.length&&remainder[used]!.text!=='\n'){
   if(measure(remainder.slice(0,used+1))>available)break;
   if(/\s/u.test(remainder[used]!.text))space=used;
   used++;
  }
  if(used<remainder.length&&remainder[used]!.text!=='\n'&&space>=0)used=space+1;
  if(!used&&remainder[0]?.text!=='\n')used=1;
  const line=remainder.slice(0,used);remainder=remainder.slice(used+(remainder[used]?.text==='\n'?1:0));return line;
 };
 const lines:Cluster[][]=[];for(let index=0;index<2&&remainder.length;index++)lines.push(take(width-reserve));
 const firstLine=lines[0]??[],spaceIndex=firstLine.findIndex(value=>/\s/u.test(value.text));
 const firstWordLength=spaceIndex<0?firstLine.length:spaceIndex;
 // Restrict ActualText to the opening word: spanning multiple baselines
 // makes PDF extractors invent a footer-sized replacement rectangle.
 // PDFKit draws text under a PDF-coordinate transform. Start the semantic
 // span in that same coordinate space so extracted word bounds stay on-page.
 doc.save().transform(1,0,0,-1,0,doc.page.height);
 doc.markContent('Span',{actual:initial+firstLine.slice(0,firstWordLength).map(value=>value.text).join('')});
 doc.restore();
 // The initial remains a selectable font glyph, aligned to the second baseline.
 doc.font(cap.name).fontSize(capSize).text(initial,left-bounds.minX/cap.metrics.units*capSize,baseline+lineHeight+bounds.minY/cap.metrics.units*capSize,{lineBreak:false,baseline:'alphabetic',underline:values[start]!.underline,strike:values[start]!.strike});
 for(const [index,line] of lines.entries()){
  const lineWidth=measure(line),gap=alignment==='right'?width-reserve-lineWidth:alignment==='center'?(width-reserve-lineWidth)/2:0;
  let x=left+reserve+gap;
  const spaces=line.filter(value=>/^\s$/u.test(value.text)).length;
  const extra=alignment==='justify'&&remainder.length&&spaces?(width-reserve-lineWidth)/spaces:0;
  const segments=index===0?[line.slice(0,firstWordLength),line.slice(firstWordLength)]:[line];
  for(const [segmentIndex,segment]of segments.entries()){
   if(index===0&&segmentIndex===1){doc.save().transform(1,0,0,-1,0,doc.page.height);doc.endMarkedContent();doc.restore();}
   for(const run of groups(segment)){
   doc.font(run.face.name).fontSize(size*run.face.scale).text(run.text,x,baseline+index*lineHeight,{lineBreak:false,baseline:'alphabetic',wordSpacing:extra,oblique:run.face.oblique,underline:run.underline,strike:run.strike});
   x+=doc.widthOfString(run.text)+extra*(run.text.match(/\s/g)?.length??0);
   }
  }
 }
 if(!lines.length)doc.endMarkedContent();doc.font(bodyFace.name).fontSize(size);doc.x=left;doc.y=top+lineHeight*2;
 const remaining=groups(remainder);
 for(const [index,run] of remaining.entries()){
  doc.font(run.face.name).fontSize(size*run.face.scale);
  const gap=lineHeight-doc.currentLineHeight(true);
  doc.text(run.text+(index===remaining.length-1?' ':''),left,doc.y,{width,align:alignment,continued:index!==remaining.length-1,oblique:run.face.oblique,underline:run.underline,strike:run.strike,lineGap:gap,indent:0,paragraphGap:0});
 }
 doc.font(bodyFace.name).fontSize(size);return true;
}
