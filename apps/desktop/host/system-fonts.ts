import {readdir,readFile,stat} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {create} from 'fontkit';

type Face={path:string;name:string;family:string;bold:boolean;italic:boolean;collection:boolean};
let inventory:Promise<Face[]>|undefined;
// Only OS font directories are scanned. Document data never supplies file paths.
function directories():string[]{
 if(process.platform==='darwin')return ['/System/Library/Fonts','/Library/Fonts',join(homedir(),'Library/Fonts')];
 if(process.platform==='win32')return [join(process.env.SystemRoot??'C:\\Windows','Fonts'),join(process.env.LOCALAPPDATA??homedir(),'Microsoft/Windows/Fonts')];
 return ['/usr/share/fonts','/usr/local/share/fonts',join(homedir(),'.local/share/fonts'),join(homedir(),'.fonts')];
}
async function scan():Promise<Face[]>{
 const faces:Face[]=[];let files=0;
 async function visit(directory:string,depth:number){
  if(depth>8||files>=10000)return;
  let entries;try{entries=await readdir(directory,{withFileTypes:true});}catch(error){if(['ENOENT','EACCES','EPERM'].includes((error as NodeJS.ErrnoException).code??''))return;throw error;}
  for(const entry of entries){
   const path=join(directory,entry.name);
   if(entry.isDirectory()){await visit(path,depth+1);continue;}
   if(!entry.isFile()||! /\.(ttf|otf|ttc|dfont)$/i.test(entry.name)||files++>=10000)continue;
   try{
    if((await stat(path)).size>64*1024*1024)continue;
    const font=create(await readFile(path)),collection='fonts' in font;
    for(const face of collection?font.fonts:[font]){
     const style=face.subfamilyName.toLowerCase();
     faces.push({path,name:face.postscriptName,family:face.familyName,bold:/bold|black|heavy|demi|semibold/.test(style),italic:face.italicAngle!==0||/italic|oblique/.test(style),collection});
    }
   }catch{/* Unsupported or damaged OS fonts are omitted; other installed families remain usable. */}
  }
 }
 for(const directory of directories())await visit(directory,0);
 return faces;
}
export async function installedPDFVariants(family:string){
 const faces=(await(inventory??=scan())).filter(face=>face.family.toLocaleLowerCase()===family.toLocaleLowerCase());
 if(!faces.length)return null;
 const keys=['Regular','Bold','Italic','BoldItalic'] as const;
 const buffers=new Map<string,Buffer>();
 return Object.fromEntries(await Promise.all(keys.map(async(key,index)=>{
  const bold=index===1||index===3,italic=index>=2;
  const face=faces.find(face=>face.bold===bold&&face.italic===italic)??faces.find(face=>!face.bold&&!face.italic)??faces[0]!;
  let bytes=buffers.get(face.path);if(!bytes){bytes=await readFile(face.path);buffers.set(face.path,bytes);}
  return [key,{bytes,family:face.collection?face.name:undefined}];
 })));
}
