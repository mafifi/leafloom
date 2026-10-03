import {webpCoverPNG} from './webp-cover.ts';
import {exportFonts,systemPDFVariants,type ExportTypography} from './export-fonts.ts';
import {pdfGlyphFace,pdfGlyphRuns,type PDFGlyphFace} from './pdf-glyphs.ts';
import {drawPDFDropCap} from './pdf-dropcap.ts';
import { createHash,randomUUID } from 'node:crypto';
import { JSDOM } from 'jsdom';
import JSZip from 'jszip';
import PDFDocument from 'pdfkit';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Opened } from '@leafloom/editor-contracts';
import {translate,english,type LanguageCatalogValue} from '@leafloom/language-contracts';
const localize=(catalog:LanguageCatalogValue=english)=>(key:string,args:Record<string,string|number>={})=>translate(catalog,key,args);
const moduleURL = import.meta.url;
export type ExportFormat = 'txt' | 'md' | 'html' | 'docx' | 'epub' | 'pdf';
type Run = { text: string; bold: boolean; italic: boolean; break?: boolean;size?:number;caps?:boolean };
type Paragraph = {
  runs: Run[];
  text: string;
  kind: 'prose' | 'poetry' | 'scene-break';
  align: 'left' | 'center' | 'right' | 'justify';
  alignSpecified?:boolean;
};
type ExportIdentity = { book: { metadata: Opened['book']['metadata'] } };
type Section = { id: string; title: string; kind: string; paragraphs: Paragraph[]; navTitle?:string; level?: number;toc?:boolean;partLabel?:string;partTitle?:string };
const markdownMetadata = (text: string) => text.replace(/([\\`*_\[\]#<>])/g, '\\$1');
function markdownRun(run: Run) {
  if (run.break) return '  \n';
  const text = run.text.replace(/([\\*_`])/g, '\\$1');
  const marker = run.bold && run.italic ? '***' : run.bold ? '**' : run.italic ? '*' : '';
  if (!marker || !text.trim()) return text;
  const leading = text.match(/^\s*/)![0], trailing = text.match(/\s*$/)![0];
  return leading + marker + text.slice(leading.length, text.length - trailing.length) + marker + trailing;
}
const escape = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
const textRuns = (runs: Run[]) => runs.map((run) => (run.break ? '\n' : run.text)).join('');
function paragraphHtml(paragraph: Paragraph, classes: string[] = [],defaultAlignment=true) {
  if (paragraph.kind === 'scene-break') return '<p class="scene-break">***</p>';
  return `<p class="${[paragraph.kind,...classes].join(' ')}"${defaultAlignment||paragraph.alignSpecified||paragraph.align!=='left'?` style="text-align:${paragraph.align}"`:''}>${paragraph.runs
    .map((run) => {
      if (run.break) return '<br/>';
      let text = escape(run.text);
      if (run.italic) text = '<em>' + text + '</em>';
      if (run.bold) text = '<strong>' + text + '</strong>';
      return text;
    })
    .join('')}</p>`;
}
const storyKinds=new Set(['chapter','unnumbered','prologue','epilogue']);
const openingDash=/^\s*[-‐‑‒–—―]/;
const attribution=/^(?:[—–]|--?\s)/;
const roman=(n:number)=>{const values:[[number,string],...[number,string][]]=[[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];let text='';for(const[value,token]of values)while(n>=value){text+=token;n-=value;}return text;};
function sectionParagraphs(section:Section,epub=false) {
  const frontPage=['copyright','dedication','epigraph','part','opener'].includes(section.kind);
  let first=epub&&!frontPage||storyKinds.has(section.kind),afterBreak=false;
  return section.paragraphs.map(paragraph=> {
    if(paragraph.kind==='scene-break'){afterBreak=storyKinds.has(section.kind);if(epub&&!frontPage)first=true;return epub?'<p class="scene-break">* * *</p>':paragraphHtml(paragraph);}
    const front=['dedication','epigraph','part','opener'].includes(section.kind),attr=front&&attribution.test(paragraph.text);
    const aligned=front&&!paragraph.alignSpecified?{...paragraph,align:'center' as const}:paragraph;
    if(paragraph.kind==='poetry'){afterBreak=false;return paragraphHtml(aligned,attr?['attr']:[],!epub);}
    const classes:string[]=[];
    if(attr)classes.push('attr');
    if(first)classes.push('first');
    if((first||afterBreak)&&openingDash.test(paragraph.text))classes.push('dialogue');
    first=false;afterBreak=false;
    return paragraphHtml(aligned,classes,!epub);
  }).join('\n');
}
function cleanChapterDocument(html:string,removeGhostScenes:boolean) {
  const document=new JSDOM('<body>'+html+'</body>').window.document;
  if(removeGhostScenes)
  document.querySelectorAll('p.ghost[data-sec-id]').forEach((node) => {
    const id = node.getAttribute('data-sec-id');
    for (const scene of document.querySelectorAll('p.scene-break[data-sec-brk]'))
      if (scene.getAttribute('data-sec-brk') === id) scene.remove();
  });
  document
    .querySelectorAll('.darling-anchor,.ph-mark,.ghost,script,style')
    .forEach((node) => node.remove());
  return document;
}
// NEO reads innerText from a detached holder, which is textContent. Preserve
// whitespace and NBSP exactly; paragraph/BR separators are not inserted.
export function manuscriptTextFromHtml(html:string){return cleanChapterDocument(html,false).body.textContent??'';}
export function paragraphsFromHtml(html:string):Paragraph[]{
  const document=cleanChapterDocument(html,true);
  const paragraphs: Paragraph[] = [];
  for (const element of document.querySelectorAll('p')) {
    const runs: Run[] = [];
    const walk = (node: Node, bold: boolean, italic: boolean) => {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === 3) {
          runs.push({ text: (child.textContent ?? '').replace(/\u00a0/g, ' '), bold, italic });
          continue;
        }
        if (child.nodeType !== 1) continue;
        const el = child as HTMLElement;
        if (el.tagName === 'BR') {
          runs.push({ text: '', bold, italic, break: true });
          continue;
        }
        const style = el.style ?? {},
          isBold =
            ['B', 'STRONG'].includes(el.tagName) ||
            style.fontWeight === 'bold' ||
            parseInt(style.fontWeight, 10) >= 600,
          isItalic = ['I', 'EM'].includes(el.tagName) || style.fontStyle === 'italic';
        walk(el, bold || isBold, italic || isItalic);
      }
    };
    walk(element, false, false);
    const text = textRuns(runs).trim(),
      kind = element.classList.contains('scene-break')
        ? 'scene-break'
        : element.classList.contains('poetry')
          ? 'poetry'
          : 'prose';
    if (text || kind === 'scene-break')
      paragraphs.push({
        runs,
        text,
        kind,
        alignSpecified:!!element.style.textAlign,
        align: ['center', 'right', 'justify'].includes(element.style.textAlign)
          ? (element.style.textAlign as Paragraph['align'])
          : 'left',
      });
  }
  return paragraphs;
}
function sections(opened: Opened): Section[] {
  const metadata = opened.book.metadata,
    titles = metadata.chapterTitles as Record<string, string> | undefined,
    kinds = metadata.chapterKinds as Record<string, string> | undefined;
  let number = 0;
  return opened.book.chapters.map((chapter,index) => {
    const kind = kinds?.[chapter.id] ?? (opened.book.chapters.length>=2&&index===0&&metadata.prologue===chapter.id?'prologue':opened.book.chapters.length>=2&&index===opened.book.chapters.length-1&&metadata.epilogue===chapter.id?'epilogue':'chapter');
    if (kind === 'chapter') number++;
    const supplied = titles?.[chapter.id];
    return {
      id: chapter.id,
      title:
        typeof supplied === 'string' && supplied.trim()
          ? supplied
          : kind === 'chapter'
            ? `Chapter ${number}`
            : kind[0].toUpperCase() + kind.slice(1),
      kind,
      paragraphs: paragraphsFromHtml(chapter.html),
    };
  });
}
// NEO exportChapters: front pages and parts surround the numbered story.
function manuscriptSections(opened:Opened,customTitles=false,catalog?:LanguageCatalogValue):Section[] {
 const t=localize(catalog);
 const raw=sections(opened),meta=opened.book.metadata,titles=meta.chapterTitles as Record<string,string>|undefined;
 const front=['copyright','dedication','epigraph'];const back=['epilogue','acknowledgments','about'];
 let count=0,parts=0,inPart=false;const result:Section[]=[];
 const story=raw.filter(s=>['chapter','unnumbered','prologue','epilogue'].includes(s.kind));const solo=story.length===1?story[0].id:null;
 for(const section of raw){let kind=section.kind;
 if(raw.length>=2&&!(meta.chapterKinds as Record<string,string>|undefined)?.[section.id]){if(meta.prologue===section.id&&raw[0].id===section.id)kind='prologue';if(meta.epilogue===section.id&&raw.at(-1)?.id===section.id)kind='epilogue';}
 if(kind==='part')inPart=true;else if(back.includes(kind))inPart=false;
 if(kind==='contents'){result.push({...section,kind,title:t('Contents'),paragraphs:[]});continue;}
 if(front.includes(kind)){if(section.paragraphs.length)result.push({...section,kind,title:'',level:0});continue;}
 if(['acknowledgments','about'].includes(kind)){if(section.paragraphs.length)result.push({...section,kind,title:t(kind==='about'?'About the Author':'Acknowledgments'),level:0});continue;}
 if(kind==='part'){parts++;if(meta.restartNumbering)count=0;const first=section.paragraphs[0];const titled=first&&first.kind!=='scene-break'&&!/^[-—–]/.test(first.text);result.push({...section,kind,partLabel:t('Part {n}',{n:roman(parts)}),partTitle:titled?first.text:undefined,title:t('Part {n}',{n:roman(parts)})+(titled?': '+first.text:''),paragraphs:titled?section.paragraphs.slice(1):section.paragraphs,level:0});continue;}
 if(!['chapter','unnumbered','prologue','epilogue'].includes(kind))continue;
 if(kind==='chapter')count++;const supplied=typeof titles?.[section.id]==='string'?titles[section.id].trim():'';const name=kind==='chapter'?t('Chapter {n}',{n:count}):kind==='unnumbered'?'':t(kind==='prologue'?'Prologue':'Epilogue');
 const title=section.id===solo?'':kind==='unnumbered'?supplied:supplied?(customTitles?supplied:name+' — '+supplied):name;
 result.push({...section,kind,title,...(section.id===solo?{navTitle:meta.title}:{}),level:inPart?1:0});
 }
 for(const section of result)if(section.kind==='contents')section.paragraphs=result.filter(s=>s.title&&s.kind!=='contents').map(s=>({runs:[{text:s.title,bold:false,italic:false}],text:s.title,kind:'prose',align:'left'}));
 return result;
}
type NavigationEntry = { chapter: Section; index: number; children: NavigationEntry[] };
function navigationEntries(chapters:Section[]){
  const roots: NavigationEntry[] = [],parents: NavigationEntry[] = [];
  chapters.forEach((chapter, index) => {
    if ((!chapter.title&&!chapter.navTitle)||chapter.kind==='contents') return;
    const level = Math.min(chapter.level ?? 0, parents.length),
      entry: NavigationEntry = { chapter, index, children: [] };
    if (level === 0) roots.push(entry);
    else parents[level - 1].children.push(entry);
    parents.length = level;
    parents.push(entry);
  });
  return roots;
}
function navigation(chapters: Section[]) {
  const render = (entries: NavigationEntry[]): string =>
    '<ol>' +
    entries
      .map(
        ({ chapter, index, children }) =>
          `<li><a href="ch${index + 1}.xhtml">${escape(chapter.navTitle??chapter.title)}</a>${children.length ? render(children) : ''}</li>`,
      )
      .join('') +
    '</ol>';
  return render(navigationEntries(chapters));
}
function ncxNavigation(chapters:Section[]){
 let order=2;
 const render=(entries:NavigationEntry[]):string=>entries.map(({chapter,index,children})=>`<navPoint id="ch${index+1}" playOrder="${order++}"><navLabel><text>${escape(chapter.navTitle??chapter.title)}</text></navLabel><content src="ch${index+1}.xhtml"/>${render(children)}</navPoint>`).join('');
 return render(navigationEntries(chapters));
}
const stylesheet =
  'body{font-family:Georgia,serif;max-width:620px;margin:40px auto;padding:0 2em;line-height:1.7;font-size:13pt;color:#1c1c1c}h1,h2,h3,h4,h5,h6,.title{text-align:center}section{break-before:page}p{margin:0;text-indent:2em}.first,.scene-break+p{ text-indent:0}.first.dialogue:not([style*="center"]):not([style*="right"]){text-indent:2em}.poetry{white-space:pre-line;margin:1em 3em;text-indent:0}.scene-break{text-align:center;margin:1em;text-indent:0}.title-page{min-height:80vh;padding-top:30vh;text-align:center}.title-page h1{font-size:30pt;margin:0}.title-page p{ text-indent:0}.title-page .author{margin-top:40px;letter-spacing:3px;text-transform:uppercase;font-size:11pt}.title-page .subtitle{font-style:italic}.copyright{min-height:98vh;display:flex;flex-direction:column;justify-content:flex-end;font-size:9pt;line-height:1.6}.copyright p{text-indent:0;margin-bottom:.9em}.dedication{padding-top:26vh}.epigraph{padding-top:24vh;margin-left:3em;margin-right:3em}.part{padding-top:28vh}.opener{padding-top:25vh}.dedication,.epigraph,.part,.opener{text-align:center}.dedication p,.epigraph p,.part p{font-style:italic;text-indent:0;margin-bottom:.5em}.dedication em,.epigraph em,.part p em{font-style:normal}.dedication .attr,.epigraph .attr,.part .attr,.opener .attr{font-style:normal;font-size:10pt;letter-spacing:1px;margin-top:1.2em}.part .part-label{display:block;font-size:15.5pt;letter-spacing:5px;font-variant-caps:all-small-caps}.part .part-title{display:block;font-size:24pt;margin-top:14px}.opener p{text-indent:0}';
const sectionHeading=(chapter:Section,epub=false)=>{const heading=epub?1:Math.min(6,2+(chapter.level??0));if(!chapter.title)return '';const part=chapter.kind==='part'?(chapter.partLabel?[chapter.title,chapter.partLabel,chapter.partTitle]:chapter.title.match(/^(Part [IVXLCDM\d]+)(?:: (.*))?$/)):null;return `<h${heading}>${part?`<span class="part-label">${escape(part[1]!)}</span>${part[2]?`<span class="part-title">${escape(part[2])}</span>`:''}`:escape(chapter.title)}</h${heading}>`;};
const contentsHtml=(chapters:Section[],epub=false)=>'<ol>'+chapters.flatMap((chapter,index)=>chapter.title&&chapter.kind!=='contents'&&(epub||chapter.toc!==false)?[`<li style="margin-left:${(chapter.level??0)*1.5}em"><a href="${epub?'ch'+(index+1)+'.xhtml':'#'+escape(chapter.id)}">${escape(chapter.navTitle??chapter.title)}</a></li>`]:[]).join('')+'</ol>';
function htmlDocument(opened: ExportIdentity, chapters: Section[], language: string, fontCSS='',cover?:{mime:string;data:string}|null) {
  const meta = opened.book.metadata;
  return `<!DOCTYPE html><html lang="${escape(language)}"><head><meta charset="utf-8"><title>${escape(meta.title)}</title><style>${stylesheet}\n${fontCSS}</style></head><body>${cover?`<section class="cover-page" style="text-align:center;break-after:page"><img alt="${escape(meta.title)}" style="width:100%;max-height:95vh;object-fit:contain" src="data:${cover.mime};base64,${cover.data}"/></section>`:''}<section class="title-page"><h1>${escape(meta.title)}</h1><p class="title subtitle">${escape(String(meta.subtitle ?? ''))}</p><p class="title author">${escape(meta.author)}</p></section>${chapters.map((ch) => `<section class="${['chapter','unnumbered','prologue','epilogue'].includes(ch.kind)?'story':escape(ch.kind)}" id="${escape(ch.id)}">${sectionHeading(ch)}${ch.kind==='contents'?contentsHtml(chapters):sectionParagraphs(ch)}</section>`).join('\n')}</body></html>`;
}
type DocxOptions={before?:number;after?:number;size?:number;pageBreak?:boolean;flip?:boolean;caps?:boolean;indent?:boolean;indentLeft?:number};
function docxParagraph(paragraph: Paragraph, heading?: string,options:DocxOptions={}) {
  const properties=(heading?`<w:pStyle w:val="${heading}"/>`:'')+(options.pageBreak?'<w:pageBreakBefore/>':'')+
    (options.before||options.after?`<w:spacing w:before="${options.before??0}" w:after="${options.after??0}" w:line="360" w:lineRule="auto"/>`:'')+
    (options.indentLeft?`<w:ind w:left="${options.indentLeft}"/>`:paragraph.kind==='poetry'?'<w:ind w:left="720" w:right="720"/>':!heading&&options.indent!==false&&paragraph.align==='left'&&paragraph.kind==='prose'?'<w:ind w:firstLine="480"/>':'')+
    `<w:jc w:val="${heading||paragraph.kind==='scene-break'?'center':paragraph.align==='justify'?'both':paragraph.align}"/>`;
  const runs:Run[] =
    paragraph.kind === 'scene-break'
      ? [{ text: '***', bold: false, italic: false }]
      : paragraph.runs;
  return `<w:p><w:pPr>${properties}</w:pPr>${runs.map((run) => (run.break ? '<w:r><w:br/></w:r>' : `<w:r><w:rPr>${run.bold ? '<w:b/>' : ''}${(options.flip?!run.italic:run.italic) ? '<w:i/>' : ''}${run.size||options.size?`<w:sz w:val="${run.size??options.size}"/>`:''}${run.caps===false?'<w:caps w:val="0"/>':run.caps||options.caps?'<w:caps/>':''}</w:rPr><w:t xml:space="preserve">${escape(run.text)}</w:t></w:r>`)).join('')}</w:p>`;
}
const headingParagraph = (text: string): Paragraph => ({
  runs: [{ text, bold: false, italic: false }],
  text,
  kind: 'prose',
  align: 'center',
});
async function docx(opened: ExportIdentity, chapters: Section[],bodyFont='Georgia') {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    'word/_rels/document.xml.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
  );
  zip.file(
    'word/styles.xml',
    `<?xml version="1.0"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${escape(bodyFont)}" w:hAnsi="${escape(bodyFont)}"/><w:sz w:val="24"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:keepNext/><w:pageBreakBefore/><w:spacing w:before="1200"/><w:jc w:val="center"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:caps/><w:sz w:val="28"/></w:rPr></w:style>` +
      [2, 3, 4]
        .map(
          (level) =>
            `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Heading1"/><w:pPr><w:outlineLvl w:val="${level - 1}"/></w:pPr></w:style>`,
        )
        .join('') +
      '</w:styles>',
  );
  const meta=opened.book.metadata;
  const body = [docxParagraph({...headingParagraph(meta.title),runs:[{text:meta.title,bold:true,italic:false}]},undefined,{before:3000,size:56}),
    ...(meta.subtitle?[docxParagraph({...headingParagraph(String(meta.subtitle)),runs:[{text:String(meta.subtitle),bold:false,italic:true}]},undefined,{size:32})]:[]),
    docxParagraph(headingParagraph(meta.author),undefined,{before:800}),
    ...chapters.flatMap(ch=>{
      const heading='Heading'+Math.min(3,(ch.level??0)+1);
      if(ch.kind==='contents')return [docxParagraph(headingParagraph(ch.title),undefined,{pageBreak:true,before:1200,size:28,caps:true}),...chapters.filter(entry=>entry.title&&entry.kind!=='contents'&&entry.toc!==false).map(entry=>docxParagraph({...headingParagraph(entry.title),align:'left'},undefined,{indent:false,indentLeft:480*(entry.level??0),before:entry.kind==='part'?240:0,caps:entry.kind==='part'}))];
      if(ch.kind==='copyright')return ch.paragraphs.map((p,index)=>docxParagraph({...p,align:'left'},undefined,{pageBreak:index===0,before:index===0?6000:0,after:120,size:18,indent:false}));
      if(['dedication','epigraph'].includes(ch.kind))return ch.paragraphs.map((p,index)=>docxParagraph({...p,align:'center'},undefined,{pageBreak:index===0,before:index===0?(ch.kind==='dedication'?3600:3200):attribution.test(p.text)?240:0,flip:!attribution.test(p.text),size:attribution.test(p.text)?20:undefined,indent:false}));
      const front=['part','opener'].includes(ch.kind);
      const part=ch.kind==='part'?(ch.partLabel?[ch.title,ch.partLabel,ch.partTitle]:ch.title.match(/^(Part [IVXLCDM\d]+)(?:: (.*))?$/)):null;
      const headingValue=part?{...headingParagraph(ch.title),runs:[{text:part[1]!,bold:false,italic:false},...(part[2]?[{text:'',bold:false,italic:false,break:true},{text:'',bold:false,italic:false,break:true},{text:part[2],bold:false,italic:false,caps:false,size:48}]:[])]}:headingParagraph(ch.title);
      return [ch.title?docxParagraph(headingValue,heading,{before:front?3600:undefined,after:ch.kind==='part'?480:undefined,size:ch.kind==='opener'?44:undefined}):docxParagraph(headingParagraph(''),undefined,{pageBreak:true}),...ch.paragraphs.map(p=>docxParagraph(front?{...p,align:'center'}:p,undefined,{flip:ch.kind==='part'&&!attribution.test(p.text),size:front&&attribution.test(p.text)?20:undefined,before:attribution.test(p.text)&&front?240:p.kind==='scene-break'?240:0,indent:!front}))];
    }),
  ].join('');
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:bottom="1440" w:left="1440" w:right="1440"/></w:sectPr></w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
async function epub(
  opened: ExportIdentity,
  chapters: Section[],
  language: string,
  cover?: { mime: string; data: string } | null,
  catalog?:LanguageCatalogValue,
) {
  const t=localize(catalog);
  const zip = new JSZip(),
    meta = opened.book.metadata;
  const rawIdentifier=String(meta.uuid??meta.id),identifier=meta.uuid&&!rawIdentifier.startsWith('urn:')?'urn:uuid:'+rawIdentifier:rawIdentifier;
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  );
  // Reader-controlled serif typography matches NEO EPUB, independently of the
  // selected writing font embedded in HTML/PDF.
  zip.file('OEBPS/style.css', `body{font-family:serif;line-height:1.5;margin:1em}h1{text-align:center;font-weight:normal;letter-spacing:.2em;text-transform:uppercase;font-size:1.2em;margin:3em 0 2em}p{text-indent:1.2em;margin:0}p.first,.scene-break+p{ text-indent:0}.first.dialogue:not([style*="center"]):not([style*="right"]){text-indent:1.2em}.poetry{white-space:pre-line;text-indent:0;margin:0 2em}p:not(.poetry)+p.poetry,h1+p.poetry,.poetry+p:not(.poetry){margin-top:.9em}.scene-break{text-align:center;text-indent:0;margin:2.5em 0;letter-spacing:.5em}.copyright{margin-top:40%;font-size:.8em;line-height:1.5}.copyright p{text-indent:0;margin-bottom:.9em}.dedication,.epigraph,.part,.opener{text-align:center;margin-top:30%}.epigraph{margin-left:2em;margin-right:2em}.dedication p,.epigraph p,.part p{font-style:italic;text-indent:0;margin-bottom:.5em}.dedication em,.epigraph em,.part p em{font-style:normal}.attr{font-style:normal!important;font-size:.85em;letter-spacing:.05em;margin-top:1em!important}.part h1{margin:0 0 2em}.part-label{display:block}.part-title{display:block;margin-top:.8em;font-size:1.6em;letter-spacing:0;text-transform:none}.opener h1{margin:0;font-size:1.8em;letter-spacing:.02em;text-transform:none}.opener p{text-indent:0}.title-page{text-align:center;margin-top:30%}.title-page h1{font-size:2em;margin:0}.subtitle{font-style:italic}.author{text-indent:0;margin-top:4em;letter-spacing:.3em;text-transform:uppercase}`);
  if (cover) {
    zip.file(
      'OEBPS/cover.' +
        (cover.mime === 'image/jpeg' ? 'jpg' : cover.mime === 'image/webp' ? 'webp' : 'png'),
      Buffer.from(cover.data, 'base64'),
    );
  }
  const xhtml = (title: string, content: string) =>
    `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escape(language)}"><head><title>${escape(title)}</title><link rel="stylesheet" href="style.css"/></head><body>${content}</body></html>`;
  if (cover)
    zip.file(
      'OEBPS/cover.xhtml',
      xhtml(
        t('Cover'),
        `<img alt="${escape(meta.title)}" style="width:100%" src="cover.${cover.mime === 'image/jpeg' ? 'jpg' : cover.mime === 'image/webp' ? 'webp' : 'png'}"/>`,
      ),
    );
  zip.file(
    'OEBPS/title.xhtml',
    xhtml(
      meta.title,
      `<section class="title-page"><h1>${escape(meta.title)}</h1>${meta.subtitle?`<p class="title subtitle">${escape(String(meta.subtitle))}</p>`:''}<p class="title author">${escape(meta.author)}</p></section>`,
    ),
  );
  for (const [index, ch] of chapters.entries())
    zip.file(
      `OEBPS/ch${index + 1}.xhtml`,
      xhtml(ch.title, `<section class="${escape(ch.kind)}" epub:type="${({copyright:'copyright-page',dedication:'dedication',epigraph:'epigraph',part:'part',opener:'volume',acknowledgments:'acknowledgments',about:'backmatter',prologue:'prologue',epilogue:'epilogue',contents:'toc'} as Record<string,string>)[ch.kind]??'chapter'}">${sectionHeading(ch,true)}${ch.kind==='contents'?contentsHtml(chapters,true):sectionParagraphs(ch,true)}</section>`),
    );
  const beginning=chapters.findIndex(chapter=>storyKinds.has(chapter.kind));
  const startFile=`ch${(beginning<0?0:beginning)+1}.xhtml`;
  const landmarks=`<nav epub:type="landmarks" hidden=""><ol>${cover?`<li><a epub:type="cover" href="cover.xhtml">${escape(t('Cover'))}</a></li>`:''}<li><a epub:type="toc" href="nav.xhtml">${escape(t('Table of Contents'))}</a></li><li><a epub:type="bodymatter" href="${startFile}">${escape(t('Beginning'))}</a></li></ol></nav>`;
  zip.file(
    'OEBPS/nav.xhtml',
    `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${escape(t('Table of Contents'))}</title><link rel="stylesheet" href="style.css"/></head><body><nav epub:type="toc"><h1>${escape(t('Contents'))}</h1>${navigation(chapters).replace('<ol>',`<ol><li><a href="title.xhtml">${escape(t('Title Page'))}</a></li>`)}</nav>${landmarks}</body></html>`,
  );
  zip.file('OEBPS/toc.ncx',`<?xml version="1.0" encoding="UTF-8"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${escape(identifier)}"/></head><docTitle><text>${escape(meta.title)}</text></docTitle><navMap><navPoint id="titlepage" playOrder="1"><navLabel><text>${escape(t('Title Page'))}</text></navLabel><content src="title.xhtml"/></navPoint>${ncxNavigation(chapters)}</navMap></ncx>`);
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">${escape(identifier)}</dc:identifier><dc:title>${escape(meta.title)}</dc:title><dc:creator>${escape(meta.author)}</dc:creator><dc:language>${escape(language)}</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta></metadata><manifest>${cover ? `<item id="cover-image" href="cover.${cover.mime === 'image/jpeg' ? 'jpg' : cover.mime === 'image/webp' ? 'webp' : 'png'}" media-type="${cover.mime}" properties="cover-image"/><item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>` : ''}<item id="title" href="title.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="css" href="style.css" media-type="text/css"/>${chapters.map((_, i) => `<item id="ch${i + 1}" href="ch${i + 1}.xhtml" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine toc="ncx">${cover ? '<itemref idref="cover" linear="no"/>' : ''}<itemref idref="title"/>${chapters.map((_, i) => `<itemref idref="ch${i + 1}"/>`).join('')}</spine><guide>${cover?`<reference type="cover" title="${escape(t('Cover'))}" href="cover.xhtml"/>`:''}<reference type="toc" title="${escape(t('Table of Contents'))}" href="nav.xhtml"/><reference type="text" title="${escape(t('Beginning'))}" href="${startFile}"/></guide></package>`,
  );
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
export function pdfPaperSize(country?:string){
 let region=country??process.env.LEAFLOOM_OS_COUNTRY;
 if(!region){try{region=new Intl.Locale(Intl.DateTimeFormat().resolvedOptions().locale).maximize().region;}catch{}}
 return ['US','CA','MX','PH'].includes(region??'')?'LETTER':'A4';
}
async function pdf(opened:ExportIdentity,chapters:Section[],fonts?:string,typography:ExportTypography&{language?:string;paperCountry?:string;catalog?:LanguageCatalogValue;cover?:{mime:string;data:string}|null}={}) {
 const doc=new PDFDocument({size:pdfPaperSize(typography.paperCountry),margin:72,info:{Title:opened.book.metadata.title,Author:opened.book.metadata.author},compress:false,bufferPages:true,tagged:true,displayTitle:true,pdfVersion:'1.7',lang:typography.language??'en'}),chunks:Buffer[]=[];
 const complete=new Promise<Buffer>((resolve,reject)=>{doc.on('data',chunk=>chunks.push(chunk));doc.on('error',reject);doc.on('end',()=>resolve(Buffer.concat(chunks)));});
 const fontRoot=fonts??fileURLToPath(new URL('./fonts/',moduleURL));
 const selected=await exportFonts(typography);
 // Match the source CSS stack when a chosen family is absent on this machine.
 const system=await systemPDFVariants(selected.body)??(!selected.variants.Regular?await systemPDFVariants('Georgia'):null);
 const glyphFaces=new Map<string,PDFGlyphFace[]>();
 for(const variant of ['Regular','Bold','Italic','BoldItalic'] as const){
  const fallback=await readFile(join(fontRoot,'NotoSerif-'+variant+'.ttf'));
  doc.registerFont('Fallback-'+variant,fallback);
  const source=system?.[variant]?.bytes??selected.variants[variant]??fallback,family=system?.[variant]?.family;
  let base:PDFGlyphFace;
  try{doc.registerFont('Book-'+variant,source,family);doc.font('Book-'+variant);base=pdfGlyphFace('Book-'+variant,source,family);}
  catch{doc.registerFont('Book-'+variant,fallback);base=pdfGlyphFace('Book-'+variant,fallback);}
  const companions=selected.companions[variant].flatMap((face,index)=>{
   const name='Companion-'+variant+'-'+index;
   const scale=face['size-adjust']?parseFloat(face['size-adjust'])/100:1;
   try{
    const glyphs=pdfGlyphFace(name,face.bytes,undefined,scale,face['unicode-range'],true);
    doc.registerFont(name,face.bytes);return [glyphs];
   }catch{return [];}// Unsupported subsets retain the Unicode fallback.
  });
  glyphFaces.set(variant,[base,...companions,pdfGlyphFace('Fallback-'+variant,fallback)]);
 }
 // Load portable CJK fallbacks only when an actual output glyph is missing.
 const outputText=[opened.book.metadata.title,opened.book.metadata.author,String(opened.book.metadata.subtitle??''),...chapters.flatMap(ch=>[ch.title,ch.navTitle??'',ch.partLabel??'',ch.partTitle??'',...ch.paragraphs.map(p=>p.text)])].join('\n');
 const points=Array.from(outputText,char=>char.codePointAt(0)!);
 if(points.some(point=>point!==10&&point!==13&&![...glyphFaces.values()].every(faces=>faces.some(face=>face.supports(point))))){
  for(const weight of ['Regular','Bold'] as const){
   const name='CJK-'+weight,bytes=await readFile(join(fontRoot,'NotoSerifCJKjp-'+weight+'.otf'));
   doc.registerFont(name,bytes);
   const face=pdfGlyphFace(name,bytes);
   glyphFaces.get(weight)!.push(face);
   glyphFaces.get(weight==='Regular'?'Italic':'BoldItalic')!.push({...face,oblique:true});
  }
 }
 // Reject missing glyphs before a destination is replaced, including labels.
 for(const faces of glyphFaces.values())pdfGlyphRuns(outputText,faces);
 let capFace:PDFGlyphFace|undefined;
 if(selected.dropcap){
  const capSystem=await systemPDFVariants(selected.dropcap.family),source=capSystem?.Regular;
  const bytes=source?.bytes??selected.capBytes;
  if(bytes){try{capFace=pdfGlyphFace('DropCap',bytes,source?.family,1,undefined,true);doc.registerFont('DropCap',bytes,source?.family);}catch{/* Use a supported body face when the initial font cannot be subset. */}}
 }
 const regularLabel=(text:string,size:number,options:PDFKit.Mixins.TextOptions={})=>{
  const runs=pdfGlyphRuns(text,glyphFaces.get('Regular')!);
  for(const [index,run]of runs.entries())doc.font(run.face.name).fontSize(size*run.face.scale).text(run.text,{...options,continued:index<runs.length-1,oblique:run.face.oblique});
  doc.fontSize(size);
 };
 const structure=doc.struct('Document');doc.addStructure(structure);
 if(typography.cover){const coverBytes=Buffer.from(typography.cover.data,'base64');const pdfCover=typography.cover.mime==='image/webp'?await webpCoverPNG(coverBytes):coverBytes;structure.add(doc.struct('Figure',{alt:opened.book.metadata.title},()=>doc.image(pdfCover,72,72,{fit:[doc.page.width-144,doc.page.height-144],align:'center',valign:'center'})));doc.addPage();}
 const tagged=(parent:PDFKit.PDFStructureElement,type:string,draw:()=>void)=>parent.add(doc.struct(type,{},draw));
 const pageIndex=()=>doc.bufferedPageRange().count-1;
 const pages=new Map<string,number>();
 const references:{page:number,y:number,target:string,node:PDFKit.PDFStructureElement}[]=[];
 const contents=chapters.filter(chapter=>chapter.title&&chapter.kind!=='contents'&&chapter.toc!==false);
 const outline:PDFKit.PDFOutline[]=[];
 const numberedPages=new Set<number>();let numberPages=false;
 doc.on('pageAdded',()=>{if(numberPages)numberedPages.add(pageIndex());});
 const title=doc.struct('Sect',{title:localize(typography.catalog)('Title Page')});structure.add(title);
 doc.font('Book-Regular').fontSize(30);doc.y=doc.page.height*.3;
 tagged(title,'H1',()=>regularLabel(opened.book.metadata.title+' ',30,{align:'center'}));
 if(typeof opened.book.metadata.subtitle==='string'){doc.moveDown();tagged(title,'P',()=>regularLabel(String(opened.book.metadata.subtitle)+' ',13,{align:'center'}));}
 doc.moveDown(2);tagged(title,'P',()=>regularLabel(opened.book.metadata.author+' ',11,{align:'center'}));title.end();
 for(const chapter of chapters){
  numberPages=!['copyright','dedication','epigraph','part','opener','contents'].includes(chapter.kind);
  doc.addPage();pages.set(chapter.id,pageIndex()+1);
  const section=doc.struct(chapter.kind==='contents'?'TOC':'Sect',{title:chapter.navTitle??chapter.title});structure.add(section);
  const heading=chapter.navTitle??chapter.title;
  if(heading){const level=Math.min(chapter.level??0,outline.length);const parent=level===0?doc.outline:outline[level-1];outline[level]=parent.addItem(heading);outline.length=level+1;}
  const padding:Record<string,number>={dedication:.26,epigraph:.24,part:.28,opener:.25};
  if(padding[chapter.kind])doc.y=doc.page.height*padding[chapter.kind]!;
  doc.addNamedDestination(chapter.id,'XYZ',72,doc.y,null);
  if(chapter.title){
   const part=chapter.kind==='part'?(chapter.partLabel?[chapter.title,chapter.partLabel,chapter.partTitle]:chapter.title.match(/^(Part [IVXLCDM\d]+)(?:: (.*))?$/)):null;
   doc.font('Book-Regular').fontSize(part?15.5:17);if(!padding[chapter.kind])doc.moveDown(2);
   tagged(section,'H',()=>{if(part){regularLabel(part[1]!+' ',15.5,{align:'center'});if(part[2]){doc.moveDown(.7);regularLabel(part[2]+' ',24,{align:'center'});}}else regularLabel(chapter.title+' ',17,{align:'center'});});doc.moveDown(2);
  }
  doc.font('Book-Regular').fontSize(13);
  if(chapter.kind==='contents'){
   for(const entry of contents){
    const indent=(entry.level??0)*18,width=doc.page.width-144-36-indent;
    const height=doc.heightOfString(entry.title,{width});if(doc.y+height>doc.page.height-72)doc.addPage();
    const node=doc.struct('TOCI');section.add(node);references.push({page:pageIndex(),y:doc.y,target:entry.id,node});
    doc.x=72+indent;tagged(node,'Span',()=>regularLabel(entry.title+' ',13,{width,lineGap:4,goTo:entry.id}));doc.moveDown(.4);
   }
   continue;
  }
  let first=storyKinds.has(chapter.kind),afterBreak=false;
  if(chapter.kind==='copyright'){
   doc.font('Book-Regular').fontSize(9);
   const height=chapter.paragraphs.reduce((total,p)=>total+doc.heightOfString(p.text,{width:doc.page.width-144,lineGap:5.4})+8.1,0);
   doc.y=Math.max(72,doc.page.height-72-height);
  }
  for(const paragraph of chapter.paragraphs){
   const initial=first&&paragraph.kind==='prose'&&storyKinds.has(chapter.kind)&&!openingDash.test(paragraph.text);
   const isFront=['copyright','dedication','epigraph','part','opener'].includes(chapter.kind);
   const alignment=paragraph.kind==='scene-break'?'center':isFront&&chapter.kind!=='copyright'&&!paragraph.alignSpecified?'center':paragraph.align;
   let indent=0;
   if(paragraph.kind==='prose'&&!isFront){indent=first||afterBreak?0:26;if((first||afterBreak)&&openingDash.test(paragraph.text))indent=26;first=false;afterBreak=false;}
   if(paragraph.kind==='scene-break'){doc.moveDown(1);afterBreak=true;}
   const poetry=paragraph.kind==='poetry',inset=poetry||chapter.kind==='epigraph'||chapter.kind==='part'?32.5:0,left=72+inset,width=doc.page.width-144-inset*2;
   const attr=isFront&&chapter.kind!=='copyright'&&attribution.test(paragraph.text),frontItalic=['dedication','epigraph','part'].includes(chapter.kind);
   if(attr)doc.moveDown(1.2);
   doc.fontSize(chapter.kind==='copyright'?9:attr?10:13);
   tagged(section,'P',()=>{
    const runs=paragraph.runs.flatMap(run=>{
     const italic=frontItalic&&!attr?!run.italic:run.italic;
     const variant=run.bold&&italic?'BoldItalic':run.bold?'Bold':italic?'Italic':'Regular';
     return pdfGlyphRuns(run.break?'\n':run.text,glyphFaces.get(variant)!);
    });
    const size=chapter.kind==='copyright'?9:attr?10:13;
    if(initial&&selected.dropcap&&drawPDFDropCap(doc,runs,[...(capFace?[capFace]:[]),...glyphFaces.get('Regular')!],glyphFaces.get('Regular')![0]!,left,width,alignment,size))return;
    for(const [index,run]of runs.entries()){
     doc.font(run.face.name).fontSize(size*run.face.scale);
     const final=index===runs.length-1;
     doc.text(run.text+(final?' ':''),left,doc.y,{width,align:alignment,continued:!final,oblique:run.face.oblique,indent,lineGap:size*(chapter.kind==='copyright'?1.6:1.7)-doc.currentLineHeight(true),paragraphGap:0});
    }
    doc.fontSize(size);
   });
   if(paragraph.kind!=='prose'||isFront)doc.moveDown(.9);
  }
  section.end();
 }
 // Reserve fixed-width number columns during layout, then fill them after
 // all target pages are known. Numbers cannot move the manuscript's layout.
 for(const reference of references){doc.switchToPage(reference.page);doc.font('Book-Regular').fontSize(13);tagged(reference.node,'Reference',()=>doc.text(String(pages.get(reference.target)??''),doc.page.width-108,reference.y,{width:36,align:'right',lineBreak:false,goTo:reference.target}));reference.node.end();}
 numberPages=false;
 for(const index of numberedPages){doc.switchToPage(index);doc.font('Book-Regular').fontSize(9);const label=String(index+1);doc.markContent('Artifact',{type:'Pagination'});doc.text(label,(doc.page.width-doc.widthOfString(label))/2,doc.page.height-45,{lineBreak:false});doc.endMarkedContent();}
 structure.end();doc.end();return complete;
}
export async function renderManuscript(
  opened: Opened,
  format: ExportFormat,
  options: {
    language?: string;paperCountry?:string;catalog?:LanguageCatalogValue;
    customChapterTitles?:boolean;
    bodyFont?:string;dropcap?:string;
    fonts?: string;
    cover?: { mime: string; data: string } | null;
  } = {},
): Promise<Buffer> {
  return renderSections(opened, manuscriptSections(opened,options.customChapterTitles,options.catalog), format, options);
}
export async function renderChapter(opened:Opened,chapterId:string,format:ExportFormat,options:{language?:string;catalog?:LanguageCatalogValue;bodyFont?:string;dropcap?:string;customChapterTitles?:boolean;cover?:{mime:string;data:string}|null}={}):Promise<Buffer> {
 const chapter=manuscriptSections(opened,options.customChapterTitles,options.catalog).find(chapter=>chapter.id===chapterId);
 if(!chapter||!["chapter","unnumbered","prologue","epilogue"].includes(chapter.kind)||!chapter.paragraphs.some(p=>p.text.trim()))throw new Error('INVALID');
 return renderSections(opened,[{...chapter,level:0}],format,{...options,cover:format==='epub'?options.cover:null});
}
async function renderSections(
  opened: ExportIdentity,
  chapters: Section[],
  format: ExportFormat,
  options: { language?: string;paperCountry?:string;catalog?:LanguageCatalogValue;bodyFont?:string;dropcap?:string; fonts?: string; cover?: { mime: string; data: string } | null },
): Promise<Buffer> {
  const language = options.language ?? 'en';
  if (format === 'docx') return docx(opened, chapters,(await exportFonts(options)).body);
  if (format === 'epub') return epub(opened, chapters, language, options.cover,options.catalog);
  if (format === 'pdf') return pdf(opened, chapters, options.fonts,options);
  if (format === 'html') return Buffer.from(htmlDocument(opened, chapters, language,(await exportFonts(options)).css,options.cover));
  if (format === 'txt')
    return Buffer.from(
      [
        opened.book.metadata.title,
        opened.book.metadata.author,
        ...chapters.flatMap((ch) => [
          ch.title,
          ...ch.paragraphs.map((p) => (p.kind === 'scene-break' ? '***' : p.text)),
        ]),
      ].join('\n\n') + '\n',
    );
  return Buffer.from(
    [
      '# ' + markdownMetadata(opened.book.metadata.title),
      opened.book.metadata.author,
      ...chapters.flatMap((ch) => [
        '## ' + markdownMetadata(ch.title),
        ...ch.paragraphs.map((p) =>
          p.kind === 'scene-break'
            ? '***'
            : p.runs.map(markdownRun)                .join(''),
        ),
      ]),
    ].join('\n\n') + '\n',
  );
}

// NEO's shelfBookData conventions: bound pages, title openers, single-story
// sections, and either continuous or per-title chapter numbering.
export async function renderCollection(
  books: Opened[],
  format: ExportFormat,
  options: {
    title: string;
    author: string;
    bodyFont?:string;dropcap?:string;customChapterTitles?:boolean;
    bound?: boolean;
    uuid?:string;
    numbering?: 'through' | 'restart';
    language?: string;catalog?:LanguageCatalogValue;
    cover?: { mime: string; data: string } | null;
  },
): Promise<Buffer> {
  const t=localize(options.catalog);
  const pageKinds = [
    'cover',
    'copyright',
    'dedication',
    'epigraph',
    'part',
    'prologue',
    'epilogue',
    'acknowledgments',
    'about',
  ];
  const included = books.filter(
    (book) => options.bound || !pageKinds.includes(String(book.book.metadata.kind ?? '')),
  );
  const titles = included.filter(
    (book) => !pageKinds.includes(String(book.book.metadata.kind ?? '')),
  );
  const chapters: Section[] = [];
  let number = 0,
    partNumber = 0,
    inPart = false;
  const push = (section: Section) =>
    chapters.push({ ...section, id: `collection-${chapters.length + 1}` });
  const label = (kind: string) => t(kind==='about'?'About the Author':kind[0].toUpperCase() + kind.slice(1));
  for (const book of included) {
    const meta = book.book.metadata,
      kind = String(meta.kind ?? ''),
      source = sections(book);
    if (kind === 'cover') continue;
    if (pageKinds.includes(kind)) {
      let paragraphs = source.flatMap((section, index) =>
        index && ['prologue', 'epilogue'].includes(kind)
          ? [
              { runs: [], text: '', kind: 'scene-break' as const, align: 'center' as const },
              ...section.paragraphs,
            ]
          : section.paragraphs,
      );
      if (!paragraphs.length && kind !== 'part') continue;
      let title = ['copyright', 'dedication', 'epigraph'].includes(kind) ? '' : label(kind);
      if (kind === 'part') {
        title = t('Part {n}',{n:roman(++partNumber)});
        inPart = true;
        if (paragraphs[0]?.kind !== 'scene-break' && paragraphs[0]?.text&&!attribution.test(paragraphs[0].text)) {
          title += ': ' + paragraphs[0].text;
          paragraphs = paragraphs.slice(1);
        }
      } else if (
        ['prologue', 'epilogue'].includes(kind) &&
        meta.title &&
        !/^untitled$/i.test(meta.title)
      )
        title = meta.title;
      push({ id: '', title, kind, paragraphs, level: 0,...(kind==='part'?{partLabel:t('Part {n}',{n:roman(partNumber)}),partTitle:title.includes(': ')?title.slice(title.indexOf(': ')+2):undefined}:{}) });
      if (['acknowledgments', 'about', 'prologue', 'epilogue'].includes(kind)) inPart = false;
      continue;
    }
    if (!options.bound || options.numbering === 'restart') number = 0;
    const story = source.filter((section) =>
      ['chapter', 'unnumbered', 'prologue', 'epilogue', 'part'].includes(section.kind),
    );
    while (story.at(-1)?.kind === 'part') story.pop();
    if (!story.length) continue;
    const level = inPart ? 1 : 0;
    const byline =
      meta.author && meta.author !== options.author ? [headingParagraph(meta.author)] : [];
    if (story.length === 1) {
      push({
        ...story[0],
        title: titles.length === 1 ? '' : meta.title,
        level,
        paragraphs: [...byline, ...story[0].paragraphs],
      });
      continue;
    }
    if (titles.length > 1)
      push({ id: '', title: meta.title, kind: 'opener', paragraphs: byline, level });
    let titleParts = 0,
      underPart = false;
    const chapterLevel = level + (titles.length > 1 ? 1 : 0);
    for (const section of story) {
      let title = ['prologue','epilogue'].includes(section.kind)?label(section.kind):section.title;
      if (section.kind === 'part') {
        underPart = true;
        if (meta.restartNumbering) number = 0;
        title = t('Part {n}',{n:roman(++titleParts)});
        if (section.paragraphs[0]?.text&&section.paragraphs[0].kind!=='scene-break'&&!attribution.test(section.paragraphs[0].text)) {
          title += ': ' + section.paragraphs[0].text;
          section.paragraphs = section.paragraphs.slice(1);
        }
      } else {
        const custom = (meta.chapterTitles as Record<string, string> | undefined)?.[section.id]?.trim()??'';
        if(section.kind==='chapter')number++;
        const heading=section.kind==='chapter'?t('Chapter {n}',{n:number}):section.kind==='unnumbered'?'':label(section.kind);
        title=section.kind==='unnumbered'?custom:custom?(options.customChapterTitles?custom:heading+' — '+custom):heading;
      }
      if (section.kind === 'epilogue') underPart = false;
      push({
        ...section,
        title,...(section.kind==='part'?{partLabel:t('Part {n}',{n:roman(titleParts)}),partTitle:title.includes(': ')?title.slice(title.indexOf(': ')+2):undefined}:{}),
        toc:section.kind==='part'||titles.length===1,
        level: chapterLevel + (underPart && section.kind !== 'part' ? 1 : 0),
      });
    }
  }
  const first = books[0];
  if (!first || !chapters.length) throw Error('INVALID');
  if(['pdf','html','docx'].includes(format)&&(titles.length>1||(titles.length===1&&sections(titles[0]!).some(section=>section.kind==='contents')))){
    let index=chapters.findIndex(section=>!['copyright','dedication','epigraph'].includes(section.kind));if(index<0)index=chapters.length;
    chapters.splice(index,0,{id:'collection-contents',kind:'contents',title:t('Contents'),paragraphs:[],level:0});
  }
  const identity = createHash('sha256')
    .update(
      JSON.stringify({
        ids: books.map((book) => book.book.metadata.id),
        title: options.title,
        bound: !!options.bound,
      }),
    )
    .digest('hex');
  const metadata = {
    ...first.book.metadata,
    id: 'collection-' + identity.slice(0, 32),
    uuid: options.uuid??randomUUID(),
    title: options.title,
    author: options.author,
    subtitle: '',
  };
  return renderSections({ book: { metadata } }, chapters, format, {
    language: options.language,catalog:options.catalog,
    bodyFont:options.bodyFont,dropcap:options.dropcap,
    cover: options.cover,
  });
}
