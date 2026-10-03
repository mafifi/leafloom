import assert from 'node:assert/strict';
import {readPDF,sha256} from './document-io.mjs';
/** Output geometry contract over real PDF objects, destinations and glyphs. */
export async function inspectPDFLayout(bytes){
 const parsed=await readPDF(bytes);
 try{
  const {pdf,pages,items}=parsed,outline=await pdf.getOutline();
  assert.ok(pdf.numPages>=8,'Publication edition has distinct front/body/back pages');
  const flatten=list=>(list??[]).flatMap(entry=>[entry,...flatten(entry.items)]);
  const chapters=flatten(outline).filter(entry=>/Chapter [12]/.test(entry.title));assert.equal(chapters.length,2,'Two genuine chapter bookmarks');
  const bodyPages=[];
  for(const entry of chapters){const destination=typeof entry.dest==='string'?await pdf.getDestination(entry.dest):entry.dest;assert.ok(destination);const index=await pdf.getPageIndex(destination[0]);bodyPages.push(index+1);assert.match(items[index].map(item=>item.str).join('').replace(/\s/g,''),/Centeredopening|Closingbody/);assert.ok(items[index].some(item=>item.str===String(index+1)&&item.transform[5]<50),'Body footer agrees with actual physical page');}
  assert.ok(bodyPages[0]<bodyPages[1]);assert.ok(!items[0].some(item=>item.str==='1'&&item.transform[5]<50),'Title page suppresses page-one footer');
  const tocIndex=items.findIndex(page=>page.map(item=>item.str).join('').replace(/\s/g,'').toUpperCase().includes('CONTENTS'));assert.ok(tocIndex>0);const annotations=await pages[tocIndex].getAnnotations(),links=annotations.filter(item=>item.subtype==='Link');assert.ok(links.length>=3,'Actual Contents links');
  for(const number of bodyPages)assert.ok(items[tocIndex].some(item=>item.str.normalize('NFKC')===String(number)),'Contents physical page count');
  for(const link of links){assert.ok(link.dest,'Contents internal destination');const destination=typeof link.dest==='string'?await pdf.getDestination(link.dest):link.dest;assert.ok(destination);const index=await pdf.getPageIndex(destination[0]);assert.ok(index>=0&&index<pdf.numPages,'Contents destination exists');}
  const body=items[bodyPages[0]-1],verse=body.find(item=>item.str.includes('Verse indented line.')),ordinary=body.find(item=>item.str.includes('Ordinary last line.')),right=body.find(item=>item.str.includes('Right edge words.'));assert.ok(verse&&ordinary&&right);assert.ok(verse.transform[4]>ordinary.transform[4],'Poetry indentation differs from ordinary prose');assert.notEqual(verse.fontName,ordinary.fontName,'Poetry uses italic glyph font');assert.ok(right.transform[4]>verse.transform[4],'Right paragraph has distinct alignment');
  return {sha256:sha256(bytes),pages:pdf.numPages,outline,bodyPages,tocPage:tocIndex+1,tocLinks:links.map(link=>({dest:link.dest,rect:link.rect})),items};
 }finally{await parsed.close();}
}
