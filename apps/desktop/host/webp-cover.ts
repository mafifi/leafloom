import {spawn} from 'node:child_process';
import {open} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {deflateSync} from 'node:zlib';
import {LifecycleError} from '@leafloom/editor-contracts';

// Preflight the RIFF canvas before libwebp can allocate decoded pixels.
export function webpDimensions(bytes:Buffer){
 if(bytes.length<20||bytes.length>20_000_000||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP'||bytes.readUInt32LE(4)+8!==bytes.length)throw new LifecycleError('INVALID');
 let dimensions:{width:number;height:number}|undefined;
 for(let position=12;position<bytes.length;){
  if(position+8>bytes.length)throw new LifecycleError('INVALID');
  const type=bytes.toString('ascii',position,position+4),size=bytes.readUInt32LE(position+4),start=position+8,end=start+size;
  if(end+(size&1)>bytes.length)throw new LifecycleError('INVALID');
  if(type==='VP8X'&&size>=10)dimensions={width:bytes.readUIntLE(start+4,3)+1,height:bytes.readUIntLE(start+7,3)+1};
  if(type==='VP8 '&&size>=10&&bytes.subarray(start+3,start+6).equals(Buffer.from([0x9d,1,0x2a]))){const coded={width:bytes.readUInt16LE(start+6)&0x3fff,height:bytes.readUInt16LE(start+8)&0x3fff};if(dimensions&&(dimensions.width!==coded.width||dimensions.height!==coded.height))throw new LifecycleError('INVALID');dimensions=coded;}
  if(type==='VP8L'&&size>=5&&bytes[start]===0x2f){const packed=bytes.readUInt32LE(start+1);const coded={width:(packed&0x3fff)+1,height:((packed>>>14)&0x3fff)+1};if(dimensions&&(dimensions.width!==coded.width||dimensions.height!==coded.height))throw new LifecycleError('INVALID');dimensions=coded;}
  position=end+(size&1);
 }
 if(!dimensions||dimensions.width<1||dimensions.height<1||dimensions.width>8192||dimensions.height>8192||dimensions.width*dimensions.height>16_000_000)throw new LifecycleError('INVALID');
 return dimensions;
}

function firstFrame(bytes:Buffer,canvas:{width:number;height:number}){
 let background=[0,0,0,0],frame:{bytes:Buffer;width:number;height:number;x:number;y:number;replace:boolean}|undefined;
 for(let position=12;position<bytes.length;){
  const type=bytes.toString('ascii',position,position+4),size=bytes.readUInt32LE(position+4),start=position+8;
  if(type==='ANIM'&&size>=6)background=[bytes[start+2]!,bytes[start+1]!,bytes[start]!,bytes[start+3]!];
  if(type==='ANMF'&&!frame){
   if(size<16)throw new LifecycleError('INVALID');
   const x=bytes.readUIntLE(start,3)*2,y=bytes.readUIntLE(start+3,3)*2,width=bytes.readUIntLE(start+6,3)+1,height=bytes.readUIntLE(start+9,3)+1;
   if(x+width>canvas.width||y+height>canvas.height)throw new LifecycleError('INVALID');
   const payload=bytes.subarray(start+16,start+size),alpha=payload.toString('ascii',0,4)==='ALPH';
   const extra=alpha?Buffer.alloc(18):Buffer.alloc(0);
   if(alpha){extra.write('VP8X');extra.writeUInt32LE(10,4);extra[8]=0x10;extra.writeUIntLE(width-1,12,3);extra.writeUIntLE(height-1,15,3);}
   const riff=Buffer.alloc(12);riff.write('RIFF');riff.writeUInt32LE(4+extra.length+payload.length,4);riff.write('WEBP',8);
   const still=Buffer.concat([riff,extra,payload]),coded=webpDimensions(still);
   if(coded.width!==width||coded.height!==height)throw new LifecycleError('INVALID');
   frame={bytes:still,width,height,x,y,replace:Boolean(bytes[start+15]!&2)};
  }
  position=start+size+(size&1);
 }
 return frame?{...frame,background}:null;
}

const crcTable=Uint32Array.from({length:256},(_,index)=>{let value=index;for(let bit=0;bit<8;bit++)value=(value&1)?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
function pngChunk(type:string,data:Buffer){
 const name=Buffer.from(type),payload=Buffer.concat([name,data]);let crc=0xffffffff;
 for(const value of payload)crc=crcTable[(crc^value)&255]!^(crc>>>8);
 const size=Buffer.alloc(4),checksum=Buffer.alloc(4);size.writeUInt32BE(data.length);checksum.writeUInt32BE((crc^0xffffffff)>>>0);
 return Buffer.concat([size,payload,checksum]);
}
const codecABI=Buffer.from('LEAFLOOM_PIPE_CODEC_V1\0');
const verifiedCodecs=new Map<string,string>();
async function verifyCodec(executable:string){
 const file=await open(executable,'r');
 try{
  const stat=await file.stat(),identity=[stat.ino,stat.size,stat.mtimeMs].join(':');
  if(!stat.isFile()||stat.size>256_000_000)throw new LifecycleError('INVALID');
  if(verifiedCodecs.get(executable)===identity)return;
  const buffer=Buffer.alloc(1_048_576);let tail=Buffer.alloc(0),position=0;
  while(position<stat.size){const{bytesRead}=await file.read(buffer,0,buffer.length,position);if(!bytesRead)break;const block=Buffer.concat([tail,buffer.subarray(0,bytesRead)]);if(block.includes(codecABI)){verifiedCodecs.set(executable,identity);return;}tail=Buffer.from(block.subarray(Math.max(0,block.length-codecABI.length+1)));position+=bytesRead;}
  throw new LifecycleError('INVALID');
 }finally{await file.close();}
}
async function decodeWebP(bytes:Buffer,executable=process.env.LEAFLOOM_IMAGE_DECODER):Promise<{width:number;height:number;data:Uint8ClampedArray}>{
 if(!executable||!isAbsolute(executable))throw new LifecycleError('INVALID');
 // Never invoke an older application that would interpret this flag as a UI launch.
 try{await verifyCodec(executable);}catch{throw new LifecycleError('INVALID');}
 const output=await new Promise<Buffer>((resolve,reject)=>{
  const child=spawn(executable,['--leafloom-decode-webp'],{stdio:['pipe','pipe','ignore'],windowsHide:true});
  const chunks:Buffer[]=[];let size=0,settled=false;
  const fail=()=>{if(!settled){settled=true;child.kill('SIGKILL');reject(new LifecycleError('INVALID'));}};
  const timer=setTimeout(fail,10000);timer.unref();
  child.once('error',fail);child.stdin.once('error',fail);
  child.stdout.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>64_000_008+codecABI.length){fail();return;}chunks.push(chunk);});
  child.once('close',code=>{clearTimeout(timer);if(settled)return;if(code!==0){fail();return;}settled=true;resolve(Buffer.concat(chunks));});
  child.stdin.end(bytes);
 });
 if(output.length<codecABI.length+8||!output.subarray(0,codecABI.length).equals(codecABI))throw new LifecycleError('INVALID');
 const width=output.readUInt32LE(codecABI.length),height=output.readUInt32LE(codecABI.length+4);
 if(width<1||height<1||width>8192||height>8192||width*height>16_000_000||output.length!==codecABI.length+8+width*height*4)throw new LifecycleError('INVALID');
 return {width,height,data:new Uint8ClampedArray(output.subarray(codecABI.length+8))};
}
export async function webpCoverPNG(bytes:Buffer,executable?:string):Promise<Buffer>{
 const expected=webpDimensions(bytes),frame=firstFrame(bytes,expected),input=frame?.bytes??bytes;
 const image=await decodeWebP(input,executable);
 if(image.width!==(frame?.width??expected.width)||image.height!==(frame?.height??expected.height)||image.data.length!==image.width*image.height*4)throw new LifecycleError('INVALID');
 let pixels=image.data;
 if(frame){
  pixels=new Uint8ClampedArray(expected.width*expected.height*4);
  for(let position=0;position<pixels.length;position+=4)pixels.set(frame.background,position);
  for(let y=0;y<frame.height;y++)for(let x=0;x<frame.width;x++){
   const source=(y*frame.width+x)*4,destination=((frame.y+y)*expected.width+frame.x+x)*4;
   if(frame.replace){pixels.set(image.data.subarray(source,source+4),destination);continue;}
   const alpha=image.data[source+3]!/255,base=frame.background[3]!/255,total=alpha+base*(1-alpha);
   for(let channel=0;channel<3;channel++)pixels[destination+channel]=total?Math.round((image.data[source+channel]!*alpha+frame.background[channel]!*base*(1-alpha))/total):0;
   pixels[destination+3]=Math.round(total*255);
  }
 }
 const stride=expected.width*4,rows=Buffer.alloc((stride+1)*expected.height);
 for(let row=0;row<expected.height;row++){rows[row*(stride+1)]=0;rows.set(pixels.subarray(row*stride,(row+1)*stride),row*(stride+1)+1);}
 const header=Buffer.alloc(13);header.writeUInt32BE(expected.width);header.writeUInt32BE(expected.height,4);header[8]=8;header[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',header),pngChunk('IDAT',deflateSync(rows)),pngChunk('IEND',Buffer.alloc(0))]);
}
