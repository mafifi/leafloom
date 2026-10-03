import {create,type Font} from 'fontkit';

export type PDFGlyphFace={name:string;scale:number;oblique?:boolean;supports:(point:number)=>boolean;metrics:{units:number;ascent:number;descent:number;gap:number;capHeight:number};bounds:(text:string)=>{minX:number;minY:number;maxX:number;maxY:number;advance:number}};
export class PDFExportError extends Error {
  readonly code = 'PDF_GLYPH_UNAVAILABLE';
  constructor() { super('PDF_GLYPH_UNAVAILABLE'); }
}
export function pdfGlyphFace(name:string,bytes:Buffer,family?:string,scale=1,range?:string,checkSubset=false):PDFGlyphFace {
 const font=create(bytes,family);
 if('fonts' in font)throw Error('PDF_FONT_COLLECTION_REQUIRES_FACE');
 const intervals=range?.split(',').map(value=>{
  const match=value.trim().match(/^U\+([0-9A-F]+)(?:-([0-9A-F]+))?$/i);
  if(!match)throw Error('INVALID_FONT_RANGE');
  return [parseInt(match[1]!,16),parseInt(match[2]??match[1]!,16)] as const;
 });
 if(checkSubset){
  const subset=font.createSubset();
  for(const point of font.characterSet)if(!intervals||intervals.some(([from,to])=>point>=from&&point<=to))subset.includeGlyph(font.glyphForCodePoint(point));
  subset.encode();
 }
 return {name,scale,metrics:{units:font.unitsPerEm,ascent:font.ascent,descent:font.descent,gap:font.lineGap,capHeight:Number.isFinite(font.capHeight)&&font.capHeight>0?font.capHeight:font.layout('H').bbox.maxY},bounds:text=>{const run=font.layout(text);return {...run.bbox,advance:run.advanceWidth};},supports:point=>(!intervals||intervals.some(([from,to])=>point>=from&&point<=to))&&(font as Font).hasGlyphForCodePoint(point)};
}

// Keep words and combining sequences in one supported face when possible:
// fragmenting a word across fonts loses shaping and can split PDF extraction.
export function pdfGlyphRuns(text:string,faces:PDFGlyphFace[]):{text:string;face:PDFGlyphFace}[]{
 const result:{text:string;face:PDFGlyphFace}[]=[];
 const supported=(text:string)=>faces.find(face=>Array.from(text,char=>char.codePointAt(0)!).every(point=>point===10||point===13||face.supports(point)));
 const add=(text:string,face:PDFGlyphFace)=>{const previous=result.at(-1);if(previous?.face===face)previous.text+=text;else result.push({text,face});};
 for(const {segment}of new Intl.Segmenter(undefined,{granularity:'word'}).segment(text)){
  const face=supported(segment);
  if(face){add(segment,face);continue;}
  for(const {segment:cluster}of new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(segment)){
   const face=supported(cluster);if(!face)throw new PDFExportError();add(cluster,face);
  }
 }
 return result;
}
