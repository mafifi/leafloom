// Source-derived from NEO art.js (MIT); provider transport and validation owned by Leafloom.
import {z} from 'zod';
import {CoverModel,CoverQuality} from '@leafloom/desktop-host';
const BRIEF_SYSTEM = `You are an art director at a major publisher, briefing a cover illustrator. Read the manuscript excerpt and write ONE paragraph of 90 to 130 words describing the image for this book's cover. It must look like a real, commercial book cover — the kind that sells the story at a glance — not an abstract or a logo.

Decide these, in this order, and state them plainly:
1. STYLE — commit to one: cinematic photoreal, painterly concept art, retro pulp paperback, vintage engraving or woodcut, noir, mid-century poster, watercolour, etc. Choose what suits the story's genre and tone.
2. SCENE — one specific moment, place, or object from the manuscript, rendered in full: setting, scale, weather, time of day, and the single most striking detail. A lone figure is welcome (seen from behind, in silhouette, or at a distance — never a close-up face).
3. LIGHT AND PALETTE — the light source and two or three dominant colours, named plainly.
4. MOOD — one line.
5. COMPOSITION — where the subject sits, and which third of the frame (top or bottom) stays calmer so a title can be set there later.

Never describe or request any text, lettering, title, author name, logo, or border. Reply with the paragraph only.`;

const PAINT_SUFFIX = ' Professional book cover illustration, full-bleed, portrait format, dramatic lighting, rich atmosphere, strong focal point, high production value. The image contains absolutely no text, letters, words, numbers, watermarks, signatures, borders, or logos of any kind.';


export const PaintInput = z.strictObject({apiKey:z.string().min(1).max(4096),text:z.string(),textModel:CoverModel.optional(),imageModel:CoverModel.optional(),quality:CoverQuality.default('medium')});
export type PaintInputValue = z.input<typeof PaintInput>;
export type CoverProgress = 'brief'|'painting';
export class CoverProviderError extends Error { readonly code: string; readonly modelProblem: boolean; constructor(code:string,modelProblem=false){super(code);this.code=code;this.modelProblem=modelProblem;} }
export function artExcerpt(text:string) {const words=text.replace(/\s+/g,' ').trim().split(' ');return words.length<=6000?words.join(' '):words.slice(0,4500).join(' ')+'\n\n[…]\n\n'+words.slice(-1500).join(' ');}
export class CoverArtProvider {
  constructor(private transport:typeof fetch=fetch,private base='https://api.openai.com/v1') {}
  private async json(path:string,key:string,payload?:Record<string,unknown>) {
    let response:Response;try{response=await this.transport(this.base+path,{method:payload?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},...(payload?{body:JSON.stringify(payload)}:{}),signal:AbortSignal.timeout(120000)});}catch{throw new CoverProviderError('PROVIDER_UNAVAILABLE');}
    const reader=response.body?.getReader();let bytes=0;const chunks:Uint8Array[]=[];
    if(reader)for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.length;if(bytes>40_000_000){await reader.cancel();throw new CoverProviderError('PROVIDER_RESPONSE_TOO_LARGE');}chunks.push(next.value);}
    let body:unknown;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{body=null;}
    if(!response.ok){const error=z.object({error:z.object({code:z.string().optional(),type:z.string().optional(),message:z.string().optional()}).optional()}).safeParse(body);const detail=error.success?error.data.error:undefined;const modelProblem=response.status!==401 && response.status!==403 && response.status!==429 && (response.status===404 || /model/i.test(detail?.code??detail?.type??'') || /model|not (found|supported|exist|available)|no longer|deprecated|retired/i.test(detail?.message??''));throw new CoverProviderError(modelProblem?'MODEL_UNAVAILABLE':response.status===401?'INVALID_API_KEY':response.status===429?'PROVIDER_RATE_LIMIT':'PROVIDER_REJECTED',modelProblem);}
    return body;
  }
  private async candidates(key:string,kind:'text'|'image',preferred?:string) {
    const defaults=kind==='text'?['gpt-5-mini','gpt-4.1-mini','gpt-4o-mini']:['gpt-image-1-mini','gpt-image-1'];
    let discovered:string[]=[];
    try{const models=z.object({data:z.array(z.object({id:z.string()}))}).parse(await this.json('/models',key)).data.map(model=>model.id);const rank=(name:string)=>{const v=name.match(/(\d+)(?:\.(\d+))?/);return v?Number(v[1])*100+Number(v[2]??0):0;};discovered=models.filter(name=>kind==='text'?/^gpt-\d+(\.\d+)?-mini$/.test(name):/^gpt-image-\d+(\.\d+)?(-mini)?$/.test(name)).sort((a,b)=>rank(b)-rank(a)||a.length-b.length);}catch{}
    return [...new Set([...(preferred?[preferred]:[]),...defaults,...discovered])];
  }
  private async withModels<T>(models:string[],fn:(model:string)=>Promise<T>) {let error:unknown;for(const model of models){try{return {model,result:await fn(model)};}catch(failure){error=failure;if(!(failure instanceof CoverProviderError&&failure.modelProblem))throw failure;}}throw error??new CoverProviderError('MODEL_UNAVAILABLE');}
  async paint(raw:PaintInputValue,progress:(phase:CoverProgress)=>void|Promise<void>=()=>{}) {
    const input=PaintInput.parse(raw);try{await progress('brief');
    const brief=await this.withModels(await this.candidates(input.apiKey,'text',input.textModel),async model=>{
      const body=await this.json('/chat/completions',input.apiKey,{model,messages:[{role:'system',content:BRIEF_SYSTEM},{role:'user',content:'MANUSCRIPT EXCERPT:\n\n'+artExcerpt(input.text)}],max_completion_tokens:800,...(/^gpt-5|^o\d/.test(model)?{reasoning_effort:'low'}:{})});
      const reply=z.object({choices:z.array(z.object({message:z.object({content:z.string().max(20000).nullable()})}))}).parse(body).choices[0]?.message.content?.trim();if(!reply)throw new CoverProviderError('EMPTY_BRIEF');return reply;
    });await progress('painting');
    const image=await this.withModels(await this.candidates(input.apiKey,'image',input.imageModel),async model=>{
      const body=await this.json('/images/generations',input.apiKey,{model,prompt:brief.result+PAINT_SUFFIX,n:1,size:'1024x1536',quality:input.quality,output_format:'jpeg'});
      const base64=z.object({data:z.array(z.object({b64_json:z.string().min(1).max(30_000_000)}))}).parse(body).data[0]?.b64_json;
      if(!base64||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))throw new CoverProviderError('EMPTY_IMAGE');const buffer=Buffer.from(base64,'base64');if(buffer.length>20_000_000)throw new CoverProviderError('PROVIDER_RESPONSE_TOO_LARGE');
      const ext=buffer[0]===0xff&&buffer[1]===0xd8?'jpg':buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':buffer.subarray(0,4).toString()==='RIFF'&&buffer.subarray(8,12).toString()==='WEBP'?'webp':null;if(!ext)throw new CoverProviderError('INVALID_IMAGE');return {buffer,ext};
    });return {buffer:image.result.buffer,ext:image.result.ext,brief:brief.result,textModel:brief.model,imageModel:image.model};}catch(error){if(error instanceof z.ZodError)throw new CoverProviderError('PROVIDER_PROTOCOL');throw error;}
  }
}
