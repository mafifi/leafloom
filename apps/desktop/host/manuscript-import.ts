import {readFountainDocument,type ScreenplayScriptValue} from '@leafloom/document-contracts';
import { readScreenplay, screenplayHTML } from './screenplay-formats.ts';
/** Manuscript chapterization derived from NEO ed090e9988d446daf1ebbde91bcebc13b599909b, MIT (LICENSE.neo). */
import * as fs from 'node:fs';
import * as path from 'node:path';
import JSZip from 'jszip';
type DocxFormat = { bold?: boolean; italic?: boolean };
export type ImportParagraph = {
  text?: string;
  html?: string;
  scene?: boolean;
  pageBreak?: boolean;
  heading?: boolean;
  title?: boolean;
};
export type ImportedChapter = { title: string; paras: ImportParagraph[]; role: string | null };
export type ImportedManuscript = {
  format?: 'screenplay';
  screenplayTitle?: ScreenplayScriptValue['title'];
  importedNotes?: string;
  name: string;
  title: string | null;
  author: string | null;
  chapters: ImportedChapter[];
};
const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

// Is a formatting tag (<w:b>, <w:i>) present, and is it on? Returns true,
// false (present but switched off — Word writes <w:i w:val="0"/> to cancel
// a style's italics), or undefined when the run says nothing about it.
function docxFormatOn(rpr: string, tag: string) {
  const hit = rpr.match(new RegExp('<' + tag + '(?:\\s[^>]*)?/?>'));
  if (!hit) return undefined;
  const val = (hit[0].match(/w:val="([^"]*)"/) || [])[1];
  return val === undefined || /^(true|1|on)$/i.test(val);
}

// Italics and bold don't always sit on the run: a manuscript may carry them
// in a character style ("Emphasis", Scrivener's "Italic") or a paragraph
// style. Read word/styles.xml once into { styleId: { bold, italic } },
// following basedOn so a style built on an italic one stays italic.
function docxStyleFormats(stylesXml: string) {
  const out: Record<string, DocxFormat> = {};
  if (!stylesXml) return out;
  const raw: Record<string, DocxFormat & { basedOn?: string }> = {};
  for (const m of stylesXml.matchAll(
    /<w:style\s[^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g,
  )) {
    const body = m[2];
    const basedOn = (body.match(/<w:basedOn\s+w:val="([^"]+)"/) || [])[1];
    // only the style's own run properties, not the paragraph-mark ones
    const rpr = (body.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0];
    raw[m[1]] = { basedOn, bold: docxFormatOn(rpr, 'w:b'), italic: docxFormatOn(rpr, 'w:i') };
  }
  const resolve = (id: string, depth: number): DocxFormat => {
    if (out[id]) return out[id];
    const st = raw[id];
    if (!st || depth > 8) return { bold: false, italic: false };
    const base = st.basedOn ? resolve(st.basedOn, depth + 1) : { bold: false, italic: false };
    out[id] = {
      bold: st.bold === undefined ? base.bold : st.bold,
      italic: st.italic === undefined ? base.italic : st.italic,
    };
    return out[id];
  };
  for (const id of Object.keys(raw)) resolve(id, 0);
  return out;
}

// Convert one Word paragraph's bold/italic XML into markdown text with bold/italic
function docxParagraphToMarkdown(p: string, styles: Record<string, DocxFormat> = {}) {
  const pageBreak = /<w:br [^>]*w:type="page"/.test(p) || /<w:pageBreakBefore/.test(p);
  // Word marks headings with a paragraph style such as <w:pStyle w:val="Heading1"/>.
  // Any heading style (Heading1..9, Heading 1..9, or bare "Heading") starts a new chapter and
  // gives it its title — regardless of locale, the underlying style id is
  // always "Heading*".
  const pStyle = (p.match(/<w:pStyle\s+w:val="([^"]*)"/) || [])[1] || '';
  const heading = /^heading\s*\d*$/i.test(pStyle);
  // Google Docs exports each of a document's tabs under a "Title"-styled
  // line, and the book's own title page uses the same style: the first one
  // names the book, later ones start chapters (see chapterize)
  const title = /^title$/i.test(pStyle);
  // what the paragraph's style says, before any run has its say
  const pBase = styles[pStyle] || { bold: false, italic: false };
  const runs = [...p.matchAll(/<w:r[ >][\s\S]*?<\/w:r>/g)].map((rm) => {
    const r = rm[0];
    const rpr = (r.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0];
    const text = [
      ...r.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:br\b[^>]*\/>|<w:tab\b[^>]*\/>/g),
    ]
      .map((t) =>
        t[1] !== undefined
          ? decodeEntities(t[1])
          : t[0].startsWith('<w:tab')
            ? '\t'
            : /w:type="page"/.test(t[0])
              ? ''
              : '\n',
      )
      .join('');
    const rStyle = (rpr.match(/<w:rStyle\s+w:val="([^"]*)"/) || [])[1];
    const rBase = rStyle && styles[rStyle] ? styles[rStyle] : pBase;
    const b = docxFormatOn(rpr, 'w:b');
    const i = docxFormatOn(rpr, 'w:i');
    return {
      text,
      bold: b === undefined ? !!rBase.bold : b,
      italic: i === undefined ? !!rBase.italic : i,
    };
  });
  // make sure **one**"+"**two**" becomes one "**onetwo**", not "**one****two**"
  const merged: { text: string; bold: boolean; italic: boolean }[] = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && last.bold === run.bold && last.italic === run.italic) last.text += run.text;
    else merged.push({ ...run });
  }
  const text = merged
    .map((run) => {
      let t = run.text;
      if (run.bold) t = '**' + t + '**';
      if (run.italic) t = '*' + t + '*';
      return t;
    })
    .join('')
    .trim();
  return { text, pageBreak, heading, title };
}

// Headings that are only NEO's own numbering, in the languages NEO speaks
const CHAPTER_WORDS = new RegExp(
  '^(' +
    [
      'chapter',
      'prologue',
      'epilogue',
      'part', // en
      'chapitre',
      'épilogue',
      'partie', // fr
      'capítulo',
      'capitulo',
      'prólogo',
      'prologo',
      'epílogo',
      'epilogo',
      'parte', // es, pt, it
      'capitolo', // it
      'kapitel',
      'prolog',
      'epilog',
      'teil', // de
      'hoofdstuk',
      'proloog',
      'epiloog',
      'deel', // nl
      'rozdział',
      'rozdzial',
      'część',
      'czesc', // pl
      // ro (prolog, epilog above). A bare "Capitol" only before a number:
      // on its own it is an English word, and "Capitol Hill was quiet." is prose
      'capitol(?=\\s+\\d)',
      'capitolul',
      'partea',
      'глава',
      'пролог',
      'эпилог',
      'часть', // ru
      'κεφάλαιο',
      'κεφαλαιο',
      'πρόλογος',
      'προλογος',
      'επίλογος',
      'επιλογος',
      'μέρος',
      'μερος',
      'ραψωδία',
      'ραψωδια', // el
    ].join('|') +
    ')(?![\\p{L}\\d])',
  'iu',
);

// A manuscript's own Prologue / Epilogue headings give those chapters their role
const PROLOGUE_WORDS = /^(prologue|prólogo|prologo|prolog|proloog)(?![\p{L}\d])/iu;
const EPILOGUE_WORDS = /^(epilogue|épilogue|epílogo|epilogo|epilog|epiloog)(?![\p{L}\d])/iu;

// Bound decompressed XML before parsing: the archive's compressed size cannot
// establish how much manuscript memory it will require.
async function boundedZipText(file: JSZip.JSZipObject, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[]=[];
    let length=0, settled=false;
    // JSZip 3 exposes this documented method but omits it from ZipObject's declaration.
    const streamed=file as JSZip.JSZipObject & {internalStream(type:'uint8array'):JSZip.JSZipStreamHelper<Uint8Array>};
    const stream=streamed.internalStream('uint8array');
    stream.on('data',(chunk:Uint8Array)=> {
      if(settled)return;
      length+=chunk.byteLength;
      if(length>limit){settled=true;stream.pause();chunks.length=0;reject(new Error('INVALID'));return;}
      chunks.push(chunk);
    });
    stream.on('error',()=>{if(!settled){settled=true;reject(new Error('INVALID'));}});
    stream.on('end',()=> {
      if(settled)return;settled=true;
      try {
        const bytes=new Uint8Array(length);let offset=0;
        for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
        resolve(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
      }catch{reject(new Error('INVALID'));}
    });
    stream.resume();
  });
}

export async function parseManuscript(fp: string): Promise<ImportedManuscript> {
  if (!/\.(docx|txt|md|fountain|fdx)$/i.test(fp)) throw new Error('INVALID');
  if (fs.statSync(fp).size > 50_000_000) throw new Error('INVALID');
  const name = path.basename(fp).replace(/\.[^.]+$/, '');
  const ext = path.extname(fp).toLowerCase();
  if (ext === '.fountain' || ext === '.fdx') {
    let raw:string;try{raw=new TextDecoder('utf-8',{fatal:true}).decode(fs.readFileSync(fp));}catch{throw Error('INVALID');}
    const envelope=ext==='.fountain'?readFountainDocument(raw):null;
    const script=envelope?.script??readScreenplay(raw,'fdx');
    return {name,...(envelope?.annotations.length?{importedNotes:envelope.annotations.join('\n')}:{}),title:script.title.title||null,author:script.title.author||null,format:'screenplay',screenplayTitle:script.title,chapters:[{title:'',role:null,paras:script.lines.map(line=>({html:screenplayHTML([line])}))}]};
  }
  let paras: ImportParagraph[] = [];

  if (ext === '.docx') {
    const zip = await JSZip.loadAsync(fs.readFileSync(fp));
    const docFile = zip.file('word/document.xml');
    if (!docFile) throw new Error('INVALID');
    const xml = await boundedZipText(docFile, 20_000_000);
    const stylesFile = zip.file('word/styles.xml');
    const styles = docxStyleFormats(stylesFile ? await boundedZipText(stylesFile, 5_000_000) : '');
    paras = [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((m) =>
      docxParagraphToMarkdown(m[0], styles),
    );
  } else {
    let raw:string;
    try{raw=new TextDecoder('utf-8',{fatal:true}).decode(fs.readFileSync(fp));}catch{throw new Error('INVALID');}
    paras = raw
      .split(/\r?\n\s*\r?\n/)
      .map((b) => ({ text: b.replace(/\s*\r?\n\s*/g, ' ').trim(), pageBreak: false }))
      .filter((p) => p.text);
  }

  // Chapterize: page breaks and heading lines start new chapters. Headings
  // include "Chapter N" styles plus bare chapter numbers — "7", "VII",
  // "Seven" — which get stripped so NEO's own numbering doesn't duplicate them.
  const SPELLED =
    /^(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\.?$/i;
  const isNumeralish = (t: string) =>
    /^\d{1,3}\.?$/.test(t) || /^[IVXLC]{1,7}\.?$/.test(t) || SPELLED.test(t);
  // Bare numbers only count as chapter markers when there's a ladder of them —
  // a story that merely OPENS with "Seven." keeps its seven.
  const numeralMode = paras.filter((p) => p.text && isNumeralish(p.text.trim())).length >= 2;
  // A markdown heading: one or more "#" then text — any "size" (depth) counts.
  const isMdHeading = (t: string) => /^#{1,6}\s+\S/.test(t);
  const mdTitleOf = (t: string) => t.replace(/^#{1,6}\s*/, '').trim();
  // A heading that is purely NEO's own numbering ("Chapter 2", "Prologue",
  // bare "7") carries no title — NEO numbers chapters itself. A line that
  // only opens with one of those words and reads as a sentence ("Part of me
  // wanted to run.", "Часть денег пропала.") is prose: it stays in the text.
  const readsAsSentence = (t: string) =>
    /[.!?…][”’"'»)]*$/.test(t) && t.trim().split(/\s+/).length > 2;
  const isNumberedHeading = (t: string) =>
    (CHAPTER_WORDS.test(t) && t.length < 60 && !readsAsSentence(t)) ||
    (numeralMode && isNumeralish(t));
  const isHeading = (t: string | undefined) => t && (isMdHeading(t) || isNumberedHeading(t));
  // The chapter title that a heading contributes. Markdown hashes and any
  // emphasis markers are stripped, and pure numbering yields no title.
  const titleOf = (t: string) => {
    if (isMdHeading(t)) t = mdTitleOf(t);
    t = t
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/_([^_]+)_/g, '$1');
    return isNumberedHeading(t) ? '' : t;
  };
  const isBreak = (t: string | undefined) => /^\s*([*#•~⁂—–-]\s*){1,7}$/.test(t || '');

  let styledTitle: string | null = null; // a Title-styled first line: the book's name
  const chapterize = (usePageBreaks: boolean) => {
    const chapters: ImportedChapter[] = [];
    let cur: ImportParagraph[] = [];
    let curTitle = '';
    let curRole: string | null = null;
    let seenProse = false;
    let lastWasHeading = false;
    styledTitle = null;
    const close = () => {
      if (cur.length) chapters.push({ title: curTitle, paras: cur, role: curRole });
      cur = [];
      curTitle = '';
      curRole = null;
    };
    for (const p of paras) {
      const brk = usePageBreaks && p.pageBreak;
      if (!p.text && !brk && !p.heading && !p.title) continue;
      // a Title line before any prose is the book's title, not a chapter's
      if (p.title && !seenProse && styledTitle === null && p.text) {
        styledTitle = titleOf(p.text);
        continue;
      }
      const isH = p.heading || p.title || isHeading(p.text);
      if (brk || isH) {
        // a heading that follows another with no prose between (a Google
        // Docs tab named "Chapter 2" holding a "The Long Way Home" heading)
        // refines the chapter's title instead of opening an empty chapter
        if (isH && lastWasHeading && !cur.length && !brk) {
          const t = titleOf(p.text || '');
          if (t) curTitle = curTitle ? `${curTitle} — ${t}` : t;
          continue;
        }
        close();
      }
      if (isH) {
        const h = (p.text || '').replace(/^#{1,6}\s*/, '').trim();
        curRole = PROLOGUE_WORDS.test(h) ? 'prologue' : EPILOGUE_WORDS.test(h) ? 'epilogue' : null;
        curTitle = titleOf(p.text || '');
        lastWasHeading = true;
        continue;
      } // the heading line is replaced by NEO's numbering
      lastWasHeading = false;
      if (isBreak(p.text)) {
        cur.push({ scene: true });
        continue;
      }
      if (p.text) {
        cur.push({ text: p.text });
        seenProse = true;
      }
    }
    close();
    return chapters;
  };

  const countAllWords = (list: ImportedChapter[]) =>
    list.reduce(
      (n, ch) =>
        n + ch.paras.reduce((m, p) => m + (p.text ? p.text.trim().split(/\s+/).length : 0), 0),
      0,
    );

  // First pass trusts page breaks. Some word processors sprinkle page-break
  // formatting on every paragraph, exploding a story into confetti — if the
  // result is absurd (lots of tiny "chapters"), re-run trusting headings only.
  let chapters = chapterize(true);
  if (chapters.length > 6 && countAllWords(chapters) / chapters.length < 250) {
    chapters = chapterize(false);
  }
  if (!chapters.length) chapters.push({ title: '', paras: [{ text: '' }], role: null });

  // Front matter: a short title line and a "by Author" line belong on the
  // title page, not in the body. Detect, harvest, and remove them.
  let title: string | null = styledTitle || null;
  let author: string | null = null;
  // letters of any script; NFC because a Mac may hand over the file name
  // decomposed while the text inside is composed
  const norm = (s: string) =>
    s
      .normalize('NFC')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, '');
  // "by Jane Doe" — or its equivalent in another language. Those words also
  // open ordinary sentences ("Par une nuit…", "Von Anfang an"), so outside
  // English the rest must look like a name: capitalized words (name
  // particles aside), no sentence punctuation.
  const bylineOf = (s: string) => {
    const en = s.match(/^by\s+(.{2,60})$/i);
    if (en) return en[1];
    // Romanian "de Ion Creangă" is lowercase on a title page; a capital "De"
    // opens titles ("De Profundis", Dutch "De Eerste Dag") and stays text
    const m =
      s.match(/^(?:par|por|von|di|door|autor:?|автор:?)\s+(.{2,60})$/iu) ||
      s.match(/^de\s+(.{2,60})$/u);
    if (!m || /[.!?,;…]/.test(m[1])) return null;
    const words = m[1].trim().split(/\s+/);
    const particle = /^(de|da|di|do|dos|das|du|des|del|della|la|le|van|von|der|den|ten|ter|y|e)$/;
    return words.length <= 5 && words.every((w) => /^\p{Lu}/u.test(w) || particle.test(w))
      ? m[1]
      : null;
  };
  const first = chapters[0];
  if (first && first.paras.length) {
    const t0 = (first.paras[0].text || '').trim();
    const t1 = first.paras.length > 1 ? (first.paras[1].text || '').trim() : '';
    const titleish =
      t0 &&
      t0.length < 90 &&
      !/[.!?]$/.test(t0) &&
      ((norm(t0).length > 3 && norm(name).includes(norm(t0))) ||
        !!bylineOf(t1) ||
        (t0 === t0.toUpperCase() && /\p{Lu}.*\p{Lu}/u.test(t0) && t0.length < 60));
    if (titleish) {
      title = t0;
      first.paras.shift();
    }
    const bl = first.paras.length ? bylineOf((first.paras[0].text || '').trim()) : null;
    if (bl) {
      author = bl.trim();
      first.paras.shift();
    }
    if (!first.paras.length) chapters.shift();
    if (!chapters.length) chapters.push({ title: '', paras: [{ text: '' }], role: null });
  }

  // a role only holds in its place: the prologue first, the epilogue last
  chapters.forEach((ch, i) => {
    if (
      (ch.role === 'prologue' && i !== 0) ||
      (ch.role === 'epilogue' && i !== chapters.length - 1) ||
      chapters.length < 2
    )
      ch.role = null;
  });
  return { name, title, author, chapters };
}
