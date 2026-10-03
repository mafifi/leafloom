import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {installedPDFVariants} from './system-fonts.ts';
const moduleURL=import.meta.url;
const Face=z.object({family:z.string(),file:z.string().regex(/^[a-z0-9-]+\.(woff2|ttf|otf)$/),weight:z.number(),style:z.enum(['normal','italic']), 'unicode-range':z.string().optional(),'size-adjust':z.string().optional(),'ascent-override':z.string().optional(),'descent-override':z.string().optional(),'line-gap-override':z.string().optional()});
export type ExportTypography={bodyFont?:string;dropcap?:string};
export function dropCapTypography(choice='literary',platform:NodeJS.Platform=process.platform){
 if(choice==='none')return null;
 const kind=choice==='fantasy'||choice==='scifi'?choice:'literary';
 const system={literary:{family:'Didot',stack:"'Didot','Bodoni 72',Georgia,serif"},fantasy:{family:'Apple Chancery',stack:"'Apple Chancery','Snell Roundhand',cursive"},scifi:{family:'Futura',stack:"'Futura','Avenir Next','Helvetica Neue',sans-serif"}};
 const bundled={literary:{family:'Libre Bodoni',stack:"'Libre Bodoni','Didot','Bodoni 72',Georgia,serif"},fantasy:{family:'TeX Gyre Chorus',stack:"'TeX Gyre Chorus','Apple Chancery','Snell Roundhand',cursive"},scifi:{family:'Jost',stack:"'Jost','Futura','Avenir Next','Helvetica Neue',sans-serif"}};
 return {...(platform==='darwin'||platform==='win32'?system:bundled)[kind],fallback:bundled[kind].family};
}
export async function exportFonts(options:ExportTypography={},platform:NodeJS.Platform=process.platform) {
 const requested=options.bodyFont&&options.bodyFont.length<=512&&!/[\x00-\x1f\x7f]/.test(options.bodyFont)?options.bodyFont:'Georgia';
 // NEO resolves legacy macOS/Windows family names to its bundled Linux faces.
 const linuxAliases:Record<string,string>={Georgia:'Gelasio',Palatino:'TeX Gyre Pagella',Baskerville:'Libre Baskerville','Hoefler Text':'Alegreya','Iowan Old Style':'Source Serif Pro',Cambria:'Source Serif Pro',Constantia:'Libre Baskerville'};
 const body=platform==='linux'&&Object.hasOwn(linuxAliases,requested)?linuxAliases[requested]!:requested;
 const cssFamily=(value:string)=>value.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/</g,'\\3c ');
 const dropcap=dropCapTypography(options.dropcap,platform),cap=dropcap?.family;
 const faces=z.array(Face).parse(JSON.parse(await readFile(new URL('./fontfaces.json',moduleURL),'utf8')));
 const asset=async(file:string)=>{try{return await readFile(new URL('./font-assets/'+file,moduleURL));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;return readFile(new URL('../public/fonts/'+file,moduleURL));}};
 const selected=faces.filter(face=>face.family===body||face.family===cap||face.family===dropcap?.fallback),loaded=await Promise.all(selected.map(async face=>({...face,bytes:await asset(face.file)})));
 let css=loaded.map(face=>{const ext=face.file.split('.').at(-1);return `@font-face{font-family:'${face.family}';src:url(data:font/${ext};base64,${face.bytes.toString('base64')});font-weight:${face.weight};font-style:${face.style};${['unicode-range','size-adjust','ascent-override','descent-override','line-gap-override'].map(key=>key in face?key+':'+face[key as keyof typeof face]+';':'').join('')}}`;}).join('\n');
 css+=`\nbody{font-family:'${cssFamily(body)}',Georgia,serif}`;
 if(cap)css+=`\nsection.story p.first:not(.dialogue)::first-letter{initial-letter:2;-webkit-initial-letter:2;padding-right:4px;font-family:${dropcap!.stack}}`;
 const matches=(bold:boolean,italic:boolean)=>loaded.filter(face=>face.family===body&&face.style===(italic?'italic':'normal')&&(bold?face.weight>=600:face.weight<600));
 const variant=(bold:boolean,italic:boolean)=>matches(bold,italic).find(face=>!face['unicode-range']);
 const companion=(bold:boolean,italic:boolean)=>matches(bold,italic).filter(face=>face['unicode-range']);
 return {css,body,dropcap,capBytes:loaded.find(face=>face.family===cap&&face.style==='normal')?.bytes??loaded.find(face=>face.family===dropcap?.fallback&&face.style==='normal')?.bytes,variants:{Regular:variant(false,false)?.bytes,Bold:variant(true,false)?.bytes,Italic:variant(false,true)?.bytes,BoldItalic:variant(true,true)?.bytes},companions:{Regular:companion(false,false),Bold:companion(true,false),Italic:companion(false,true),BoldItalic:companion(true,true)}};
}
// System fonts are read only for PDF subsetting; HTML/EPUB retain the family name.
export async function systemPDFVariants(body:string) {
 if(process.platform!=='darwin')return installedPDFVariants(body);
 const supplemental='/System/Library/Fonts/Supplemental/';
 const collections:Record<string,{file:string;families:[string,string,string,string]}>= {
  Palatino:{file:'/System/Library/Fonts/Palatino.ttc',families:['Palatino-Roman','Palatino-Bold','Palatino-Italic','Palatino-BoldItalic']},
  Baskerville:{file:supplemental+'Baskerville.ttc',families:['Baskerville','Baskerville-Bold','Baskerville-Italic','Baskerville-BoldItalic']},
  'Hoefler Text':{file:supplemental+'Hoefler Text.ttc',families:['HoeflerText-Regular','HoeflerText-Black','HoeflerText-Italic','HoeflerText-BlackItalic']},
  'Iowan Old Style':{file:supplemental+'Iowan Old Style.ttc',families:['IowanOldStyle-Roman','IowanOldStyle-Bold','IowanOldStyle-Italic','IowanOldStyle-BoldItalic']},
 };
 const keys=['Regular','Bold','Italic','BoldItalic'] as const;
 try{
 if(body==='Georgia'){const names=['Georgia.ttf','Georgia Bold.ttf','Georgia Italic.ttf','Georgia Bold Italic.ttf'];return Object.fromEntries(await Promise.all(keys.map(async(key,index)=>[key,{bytes:await readFile(supplemental+names[index]),family:undefined}])));}
 const collection=collections[body];if(!collection)return installedPDFVariants(body);const bytes=await readFile(collection.file);return Object.fromEntries(keys.map((key,index)=>[key,{bytes,family:collection.families[index]}]));
 }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
}
