import assert from 'node:assert/strict';
import path from 'node:path';
import JSZip from 'jszip';
import {JSDOM} from 'jsdom';
import {inspectEdition,sha256} from './document-io.mjs';
export const coverPNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64');
export async function inspectCoverEPUB(bytes,expectedImage=coverPNG){
 const structure=await inspectEdition('epub',bytes),zip=await JSZip.loadAsync(bytes),name=Object.keys(zip.files).find(name=>name.endsWith('.opf'));
 const document=new JSDOM(await zip.file(name).async('string'),{contentType:'text/xml'}).window.document,base=path.posix.dirname(name);
 const items=[...document.getElementsByTagName('item')],cover=items.find(item=>item.getAttribute('properties')?.split(/\s+/).includes('cover-image'));
 assert.ok(cover,'Real cover-image manifest property');const image=await zip.file(path.posix.join(base,cover.getAttribute('href')))?.async('nodebuffer');assert.deepEqual(image,expectedImage,'Exact original custom image bytes');
 const identifier=document.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/','identifier')[0]?.textContent;assert.ok(identifier,'Actual EPUB identifier');
 const nav=items.find(item=>item.getAttribute('properties')?.split(/\s+/).includes('nav'));const navDocument=new JSDOM(await zip.file(path.posix.join(base,nav.getAttribute('href'))).async('string'),{contentType:'text/xml'}).window.document;
 for(const link of navDocument.getElementsByTagName('a')){const [target,fragment]=link.getAttribute('href').split('#');const resource=zip.file(path.posix.join(base,target));assert.ok(resource,'Actual link target');if(fragment)assert.ok(new JSDOM(await resource.async('string'),{contentType:'text/xml'}).window.document.getElementById(fragment),'Actual navigation fragment '+fragment);}
 return{...structure,identifier,image:{sha256:sha256(image),bytes:image.length,href:cover.getAttribute('href')}};
}
