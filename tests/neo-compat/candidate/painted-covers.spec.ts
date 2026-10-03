import {test,expect} from './author-fixture';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {root} from '../evidence.mjs';
import {existingBook} from './book-fixture';
/** Same browser/font environment, immutable original algorithm versus production canvas provider. Not native host parity. */
test('Leafloom canvas fidelity: all seven original painted styles and cover templates match actual pixel output',async({page})=>{
 await existingBook(page);const source=await readFile(path.join(root,'tests/reference/neo/covers.js'),'utf8');await page.addScriptTag({content:source+'\nwindow.leafloomOriginalCovers = NeoCovers;'});
 const result=await page.evaluate(async(moduleURL)=>{
  const production=await import(moduleURL) as typeof import('../../../packages/presentation/painted-covers/src/index');
  const original=(window as unknown as {leafloomOriginalCovers:typeof production}).leafloomOriginalCovers;await Promise.all([original.ready,production.ready]);
  const digest=async(text:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const styles=new Set<string>(),templates=new Set<string>(),rows=[];
  for(let i=0;i<96;i++){
   const seed='leafloom-cover-fidelity-'+i,meta={id:'book-fidelity',coverSeed:seed,title:i%2?'The Quiet Door of Winter':'Сад и тихая дверь',author:'A Writer With A Long Name'};
   const sourceArt=original.paintAbstract(seed),candidateArt=production.paintAbstract(seed),sourcePlan=original.plan(meta,null),candidatePlan=production.plan(meta,null);styles.add(sourceArt.style!);templates.add(sourcePlan.template);
   const sourceFull=original.renderFull(meta,{width:416}),candidateFull=production.renderFull(meta,{width:416});
   rows.push({seed,style:sourceArt.style,candidateStyle:candidateArt.style,sourceArt:await digest(sourceArt.url),candidateArt:await digest(candidateArt.url),sourceExport:await digest(sourceFull.toDataURL()),candidateExport:await digest(candidateFull.toDataURL()),planEqual:JSON.stringify(sourcePlan)===JSON.stringify(candidatePlan)});
   if(styles.size===7&&templates.size===production.TEMPLATES.length)break;
  }
  return{styles:[...styles],templates:[...templates],templateCount:production.TEMPLATES.length,rows};
 },'/@fs/'+path.join(root,'packages/presentation/painted-covers/src/index.ts'));
 await test.info().attach('canvas-reference-comparison',{body:JSON.stringify(result,null,2),contentType:'application/json'});expect(result.styles).toHaveLength(7);expect(result.templates).toHaveLength(result.templateCount);for(const row of result.rows){expect(row.candidateStyle,row.seed).toBe(row.style);expect(row.candidateArt,row.seed+' art').toBe(row.sourceArt);expect(row.candidateExport,row.seed+' full cover').toBe(row.sourceExport);expect(row.planEqual,row.seed+' title and author layout').toBe(true);}await test.info().attach('canvas-reference-comparison',{body:JSON.stringify(result,null,2),contentType:'application/json'});
});
