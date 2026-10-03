import {it,expect}from'vitest';
import {inflateSync}from'node:zlib';
import {webpCoverPNG,webpDimensions}from'./webp-cover.ts';
// A real libwebp lossless 2×2 fixture: red, half-transparent green, blue, transparent.
export const webpFixture=Buffer.from('UklGRi4AAABXRUJQVlA4TCEAAAAvAUAAEB8w/wKCIv9HExAU+T+agKDouuUCeGfCOkT0PwIA','base64');
it.runIf(Boolean(process.env.LEAFLOOM_IMAGE_DECODER))('decodes actual WebP pixels into a bounded transparent PNG without external runtimes',async()=>{
 expect(webpDimensions(webpFixture)).toEqual({width:2,height:2});
 const png=await webpCoverPNG(webpFixture);expect(png.subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
 expect(png.readUInt32BE(16)).toBe(2);expect(png.readUInt32BE(20)).toBe(2);
 const size=png.readUInt32BE(33),raw=inflateSync(png.subarray(41,41+size));
 expect([...raw]).toEqual([0,255,0,0,255,0,255,0,128,0,0,0,255,255,0,0,0,0]);
});
it('rejects truncated, forged or oversized WebP before invoking the decoder',async()=>{
 expect(()=>webpDimensions(webpFixture.subarray(0,20))).toThrow('INVALID');
 const forged=Buffer.from(webpFixture);forged.writeUInt32LE(0xffffffff,16);expect(()=>webpDimensions(forged)).toThrow('INVALID');
 const oversized=Buffer.alloc(30);oversized.write('RIFF');oversized.writeUInt32LE(22,4);oversized.write('WEBP',8);oversized.write('VP8X',12);oversized.writeUInt32LE(10,16);oversized.writeUIntLE(8192,24,3);oversized.writeUIntLE(8192,27,3);
 await expect(webpCoverPNG(oversized)).rejects.toThrow('INVALID');
});
it.runIf(Boolean(process.env.LEAFLOOM_IMAGE_DECODER))('renders the first animated frame on its declared canvas and preserves transparent placement',async()=>{
 const chunk=(name:string,data:Buffer)=>{const header=Buffer.alloc(8);header.write(name);header.writeUInt32LE(data.length,4);return Buffer.concat([header,data,...(data.length%2?[Buffer.alloc(1)]:[])]);};
 const canvas=Buffer.alloc(10);canvas[0]=0x12;canvas.writeUIntLE(3,4,3);canvas.writeUIntLE(3,7,3);
 const animation=Buffer.alloc(6);animation.writeUInt32LE(0xffffffff);animation.writeUInt16LE(0,4);
 const frame=Buffer.alloc(16);frame.writeUIntLE(1,0,3);frame.writeUIntLE(1,6,3);frame.writeUIntLE(1,9,3);frame[15]=2;
 const body=Buffer.concat([chunk('VP8X',canvas),chunk('ANIM',animation),chunk('ANMF',Buffer.concat([frame,webpFixture.subarray(12)]))]);
 const header=Buffer.alloc(12);header.write('RIFF');header.writeUInt32LE(body.length+4,4);header.write('WEBP',8);
 const png=await webpCoverPNG(Buffer.concat([header,body]));expect(png.readUInt32BE(16)).toBe(4);expect(png.readUInt32BE(20)).toBe(4);
 const raw=inflateSync(png.subarray(41,41+png.readUInt32BE(33)));
 expect([...raw.subarray(0,17)]).toEqual([0,255,255,255,255,255,255,255,255,255,0,0,255,0,255,0,128]);
 expect([...raw.subarray(17,34)]).toEqual([0,255,255,255,255,255,255,255,255,0,0,255,255,0,0,0,0]);
});
