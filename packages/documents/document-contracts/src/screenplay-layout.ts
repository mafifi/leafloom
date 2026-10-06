import type {ScreenplayElementValue} from './screenplay.ts';

/** NEO 1.3.5 app.js:4878–4924. Counts are measured rendered line boxes. */
export const SCREENPLAY_LINES_PER_PAGE = 54;
export type ScreenplayMeasuredItem = {type: ScreenplayElementValue; lines: number};
export type ScreenplayPlacement = {page:number; before:number; brk:boolean; fill:number};
export type ScreenplayPagination = {at:ScreenplayPlacement[]; pages:number; used:number};
const before:Record<ScreenplayElementValue,number> = {
 'scene-heading':2, action:1, character:1, parenthetical:0, dialogue:0, transition:1, shot:1,
};
export function screenplayPaginate(items:readonly ScreenplayMeasuredItem[],perPage=SCREENPLAY_LINES_PER_PAGE):ScreenplayPagination {
 const blocks:Array<[number,number]>=[];
 for(let i=0;i<items.length;){let j=i+1;if(items[i]!.type==='character')while(j<items.length&&['dialogue','parenthetical'].includes(items[j]!.type))j++;blocks.push([i,j]);i=j;}
 const at=items.map(()=>({page:1,before:0,brk:false,fill:0}));let page=1,used=0;
 const above=(index:number,top:boolean)=>top||index===0?0:before[items[index]!.type];
 const height=([start,end]:[number,number],top:boolean)=>{let h=0;for(let x=start;x<end;x++)h+=items[x]!.lines+above(x,top&&x===start);return h;};
 blocks.forEach((block,index)=>{
  let need=height(block,used===0);const next=blocks[index+1];
  if(items[block[0]]!.type==='scene-heading'&&next)need+=items[next[0]]!.lines+above(next[0],false);
  if(used>0&&used+need>perPage){at[block[0]]!.brk=true;at[block[0]]!.fill=Math.max(0,perPage-used);page++;used=0;}
  for(let x=block[0];x<block[1];x++){at[x]!.before=above(x,used===0&&x===block[0]);at[x]!.page=page;used+=at[x]!.before+items[x]!.lines;while(used>perPage){used-=perPage;page++;}}
 });
 return {at,pages:page,used};
}
export function screenplayEighths(lines:number,perPage=SCREENPLAY_LINES_PER_PAGE){return Math.max(1,Math.round(lines/perPage*8));}
export function screenplayEighthsText(eighths:number,formatNumber:(value:number)=>string=String){const whole=Math.floor(eighths/8),remainder=eighths%8;return !whole?`${remainder}/8`:remainder?`${formatNumber(whole)} ${remainder}/8`:formatNumber(whole);}
export function screenplayLength(layout:Pick<ScreenplayPagination,'pages'|'used'>,formatNumber:(value:number)=>string=String){const eighths=screenplayEighths((layout.pages-1)*SCREENPLAY_LINES_PER_PAGE+layout.used);return {eighths,text:screenplayEighthsText(eighths,formatNumber),minutes:Math.max(1,Math.round(eighths/8))};}
