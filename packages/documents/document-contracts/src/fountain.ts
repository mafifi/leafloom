/** Portable Fountain reader; NEO 1.3.5 app.js:4927–5073, MIT attribution in NOTICE. */
import {ScreenplayScript,ScreenplayMark,type ScreenplayScriptValue,type ScreenplayRunValue,type ScreenplayLineValue,type ScreenplayElementValue} from './screenplay.ts';
export class ScreenplayCodecError extends Error {
  readonly code = 'UNSUPPORTED_SCREENPLAY';
  constructor() { super('UNSUPPORTED_SCREENPLAY'); }
}
export function normalizeScreenplayRuns(runs: ScreenplayRunValue[]): ScreenplayRunValue[] {
  const result: ScreenplayRunValue[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const marks = ScreenplayMark.options.filter(mark=>run.marks.includes(mark));
    const last = result.at(-1);
    if (last && JSON.stringify(last.marks) === JSON.stringify(marks)) last.text += run.text;
    else result.push({ text: run.text, marks });
  }
  return result;
}
function fountainRuns(text: string): ScreenplayRunValue[] {
  const runs: ScreenplayRunValue[]=[];
  const active={bold:false,italic:false,underline:false};let buffer='';
  const flush=()=>{if(buffer)runs.push({text:buffer,marks:ScreenplayMark.options.filter(mark=>mark!=='strike'&&active[mark])});buffer='';};
  for(let k=0;k<text.length;k++){
    const char=text[k];
    if(char==='\\'&&k+1<text.length){buffer+=text[++k];continue;}
    if(char==='*'){
      let n=1;while(text[k+n]==='*'&&n<3)n++;
      const on=n===3?active.bold&&active.italic:n===2?active.bold:active.italic;
      if(on||text.indexOf('*'.repeat(n),k+n)>-1){flush();if(n===3){active.bold=!on;active.italic=!on;}else if(n===2)active.bold=!active.bold;else active.italic=!active.italic;k+=n-1;continue;}
    }
    if(char==='_'&&(active.underline||text.indexOf('_',k+1)>-1)){flush();active.underline=!active.underline;continue;}
    buffer+=char;
  }
  flush();return normalizeScreenplayRuns(runs);
}
const heading=/^(?:INT\.?\/EXT|INT\/EXT|I\/E|INT|EXT|EST)(?:\.|\s)/i;
const transitions=['CUT TO:','DISSOLVE TO:','SMASH CUT TO:','MATCH CUT TO:','JUMP CUT TO:','FADE OUT.','FADE TO BLACK.','INTERCUT WITH:'];
const looksTransition=(s:string)=>transitions.includes(s.toUpperCase())||!!s&&s===s.toUpperCase()&&/\p{Lu}/u.test(s)&&/TO:$/.test(s);
function looksCharacter(s:string){
  if(!s||s.length>38||s!==s.toUpperCase()||!/\p{Lu}/u.test(s))return false;
  const name=s.replace(/\s*\^\s*$/,'').replace(/\s*\([^)]*\)\s*$/,'').trim();
  if(!name||!/\p{Lu}/u.test(name))return false;
  if(/[.!?,;:—–-]$/.test(name)&&!/^(MR|MRS|MS|DR|ST|JR|SR)\.$/.test(name.split(/\s+/).at(-1)!))return false;
  return name.split(/\s+/).length<=4;
}
const dropContinued=(s:string)=>s.replace(/\s*\(\s*cont(?:['’]?d|inued)\s*\)\s*$/i,'').trim();
export function readFountainScreenplay(source:string,options:{projection?:'paste'}={}):ScreenplayScriptValue {
  if (!options.projection && /\[\[|\/\*|^\s*(?:#|=|===)/m.test(source)) throw new ScreenplayCodecError();
  const rows = source.replace(/\r\n?/g, '\n').replace(/\t/g,'    ').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\[\[[\s\S]*?\]\]/g,'').split('\n'),
    title: ScreenplayScriptValue['title'] = { title: '', author: '' };
  let cursor = 0;
  const titleKeys:Record<string,keyof ScreenplayScriptValue['title']>={title:'title',credit:'credit',author:'author',authors:'author','draft date':'draft',date:'draft',contact:'contact'};
  const titleHeader=/^(title|credit|author|authors|source|draft date|date|contact|copyright|notes|revision)\s*:/i;
  if(titleHeader.test(rows[0]||'')){
    let key:keyof ScreenplayScriptValue['title']|undefined;
    while(cursor<rows.length&&rows[cursor]!.trim()!==''){
      const row=rows[cursor]!,match=!/^\s/.test(row)&&/^([^:]+):\s*(.*)$/.exec(row);
      if(match){key=titleKeys[match[1]!.trim().toLowerCase()];if(key)title[key]=match[2]!.trim();}
      else if(key&&row.trim())title[key]=(title[key]?title[key]+'\n':'')+row.trim();
      cursor++;
    }
  }
  const raw:{element:ScreenplayElementValue;text:string}[]=[];
  let speech=false,joinable=false;
  const blank=(k:number)=>k<cursor||k>=rows.length||rows[k]!.trim()==='';
  const push=(element:ScreenplayElementValue,text:string,join=false)=>{const last=raw.at(-1);if(join&&joinable&&last?.element===element)last.text+=' '+text;else raw.push({element,text});joinable=join;};
  for(let k=cursor;k<rows.length;k++){
    const text=rows[k]!.trim();
    if(!text){speech=false;joinable=false;continue;}
    if(/^={3,}$/.test(text)||/^#/.test(text)||/^=[^=]/.test(text)||text==='='||/^(?:\d{1,3}[A-Z]?\.|\(MORE\)|\(?CONTINUED\)?:?|CONTINUED:)$/i.test(text))continue;
    if(speech){if(/^\(.*\)$/.test(text))push('parenthetical',text);else push('dialogue',text.replace(/^~\s*/,''),true);continue;}
    if(text.startsWith('!')){push('action',text.slice(1).trim(),true);continue;}
    if(/^\.[^.\s]/.test(text)){push('scene-heading',text.slice(1).trim().replace(/\s*#[^#\s]+#$/,''));continue;}
    if(text.startsWith('>')&&text.endsWith('<')){push('action',text.slice(1,-1).trim());continue;}
    if(text.startsWith('>')){push('transition',text.slice(1).trim());continue;}
    if(text.startsWith('~')){push('action',text.slice(1).trim());continue;}
    if(text.startsWith('@')){push('character',dropContinued(text.slice(1).trim().replace(/\s*\^$/,'')));speech=true;continue;}
    if(heading.test(text)&&blank(k-1)){push('scene-heading',text.replace(/\s*#[^#\s]+#$/,''));continue;}
    if(looksTransition(text)&&blank(k-1)&&blank(k+1)){push('transition',text);continue;}
    if(blank(k-1)&&!blank(k+1)&&looksCharacter(text.replace(/\s*\^$/,''))){push('character',dropContinued(text.replace(/\s*\^$/,'')));speech=true;continue;}
    push('action',text,true);
  }
  const lines:ScreenplayLineValue[]=raw.map(line=>({element:line.element,runs:fountainRuns(line.text)}));
  return ScreenplayScript.parse({title,lines});
}

/** Transient import envelope. Author annotations belong in existing book notes, not script metadata. */
export function readFountainDocument(source:string):{script:ScreenplayScriptValue;annotations:string[]} {
  const annotations:{at:number;text:string}[]=[];
  let narrative=source.replace(/\/\*[\s\S]*?\*\//g,(text,at:number)=>{annotations.push({at,text});return text.replace(/[^\r\n]/g,' ');});
  if(/\/\*|\*\//.test(narrative))throw new ScreenplayCodecError();
  narrative=narrative.replace(/\[\[[\s\S]*?\]\]/g,(text,at:number)=>{annotations.push({at,text});return text.replace(/[^\r\n]/g,' ');});
  if(/\[\[|\]\]/.test(narrative))throw new ScreenplayCodecError();
  const titleHeader=/^(title|credit|author|authors|source|draft date|date|contact|copyright|notes|revision)\s*:/i;
  if(titleHeader.test(narrative.split('\n')[0]||'')){
    const core=new Set(['title','credit','author','authors','draft date','date','contact']);
    const side=new Set(['source','copyright','notes','revision']);
    let at=0,stanza:{at:number;text:string}|undefined;
    const retain=()=>{if(stanza)annotations.push(stanza);stanza=undefined;};
    for(const row of narrative.split('\n')){
      if(!row.trim()){retain();break;}
      const match=!/^\s/.test(row)&&/^([^:]+):/.exec(row);
      if(match){retain();const key=match[1]!.trim().toLowerCase();if(!core.has(key)&&!side.has(key))throw new ScreenplayCodecError();if(side.has(key))stanza={at,text:source.slice(at,at+row.length)};}
      else if(stanza)stanza.text+='\n'+source.slice(at,at+row.length);
      at+=row.length+1;
    }
    retain();
  }
  let offset=0;
  for(const row of narrative.split('\n')){
    const text=row.trim();
    if(/^#/.test(text)||/^=[^=]/.test(text)||text==='='||/^={3,}$/.test(text))annotations.push({at:offset,text:source.slice(offset,offset+row.length)});
    offset+=row.length+1;
  }
  return {script:readFountainScreenplay(source,{projection:'paste'}),annotations:annotations.sort((a,b)=>a.at-b.at).map(item=>item.text)};
}
