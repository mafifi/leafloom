import {GeneratedCover} from '@leafloom/desktop-host';
import {LifecycleError} from '@leafloom/editor-contracts';
export function generatedCover(raw?:string){
 if(raw===undefined)return null;
 const value=GeneratedCover.parse(raw),comma=value.indexOf(','),data=value.slice(comma+1),bytes=Buffer.from(data,'base64');
 if(bytes.toString('base64')!==data||bytes.length>10*1024*1024)throw new LifecycleError('INVALID');
 rasterDimensions(bytes,value.startsWith('data:image/png;')?'image/png':'image/jpeg');
 return {mime:value.startsWith('data:image/png;')?'image/png':'image/jpeg',data};
}
export function rasterDimensions(bytes:Buffer,mime:'image/png'|'image/jpeg',maximumBytes=10*1024*1024){
 if(bytes.length>maximumBytes)throw new LifecycleError('INVALID');
 let width=0,height=0;
 if(mime==='image/png'){
  if(bytes.length<45||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.readUInt32BE(8)!==13||bytes.subarray(12,16).toString()!=='IHDR'||!bytes.subarray(-12).equals(Buffer.from([0,0,0,0,73,69,78,68,174,66,96,130])))throw new LifecycleError('INVALID');
  width=bytes.readUInt32BE(16);height=bytes.readUInt32BE(20);
 }else{
  if(bytes.length<12||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)throw new LifecycleError('INVALID');
  let offset=2;
  while(offset+4<=bytes.length){
   if(bytes[offset++]!==255)break;while(bytes[offset]===255)offset++;
   const marker=bytes[offset++]!;if(marker===218||marker===217)break;
   if(marker===1||marker>=208&&marker<=215)continue;
   if(offset+2>bytes.length)throw new LifecycleError('INVALID');
   const length=bytes.readUInt16BE(offset);if(length<2||offset+length>bytes.length)break;
   if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&length>=8){height=bytes.readUInt16BE(offset+3);width=bytes.readUInt16BE(offset+5);break;}
   offset+=length;
  }
 }
 if(!width||!height||width>8192||height>8192||width*height>64_000_000)throw new LifecycleError('INVALID');
 return {width,height};
}
