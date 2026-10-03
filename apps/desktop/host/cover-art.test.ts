import {it,expect} from 'vitest';
import {CoverArtProvider,artExcerpt,CoverProviderError} from './cover-art.ts';
it('cover brief reads opening/end excerpt, retired models fall back through live catalog, and portrait image options stay source compatible',async()=>{
  const calls:{path:string;payload:Record<string,unknown>|null}[]=[];
  const phases:string[]=[];
  const transport:typeof fetch=async(input,init)=>{
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer synthetic-fixture-key');
    const path=new URL(String(input)).pathname,payload=init?.body?JSON.parse(String(init.body)):null;calls.push({path,payload});
    const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
    if(path.endsWith('/models'))return response({data:[{id:'gpt-6-mini'},{id:'gpt-image-2'}]});
    if(path.endsWith('/chat/completions'))return payload.model==='gpt-6-mini'?response({choices:[{message:{content:'A cinematic portrait of the river at dusk, without lettering.'}}]}):response({error:{code:'model_not_found'}},404);
    if(path.endsWith('/images/generations'))return payload.model==='gpt-image-2'?response({data:[{b64_json:Buffer.from([0xff,0xd8,0xff,0xd9]).toString('base64')}]}):response({error:{code:'model_not_found'}},404);
    throw Error('unexpected fixture path');
  };
  const text=Array.from({length:7000},(_,i)=>'word'+i).join(' ');
  const result=await new CoverArtProvider(transport).paint({apiKey:'synthetic-fixture-key',text,quality:'low'},phase=>{phases.push(phase);});
  expect(phases).toEqual(['brief','painting']);expect(result.textModel).toBe('gpt-6-mini');expect(result.imageModel).toBe('gpt-image-2');expect(result.ext).toBe('jpg');
  const request=calls.find(call=>call.payload?.model==='gpt-6-mini')!.payload!;
  const messages=request.messages as {content:string}[];
  expect(messages[1].content).toContain('word0');expect(messages[1].content).toContain('word6999');expect(messages[1].content).not.toContain('word5000 ');
  const image=calls.find(call=>call.payload?.model==='gpt-image-2')!.payload!;expect(image.size).toBe('1024x1536');expect(image.output_format).toBe('jpeg');expect(image.quality).toBe('low');expect(image.prompt).toContain('absolutely no text');
  expect(artExcerpt(text).split(' ').length).toBeLessThan(6010);
});
it('authorization failures do not retry paid requests or return provider prose or credentials',async()=>{
  let posts=0;const transport:typeof fetch=async(_url,init)=>{if(init?.method==='POST')posts++;return new Response(JSON.stringify({error:{message:'synthetic-fixture-key PRIVATE PROSE',code:'invalid_api_key'}}),{status:401});};
  let error:unknown;try{await new CoverArtProvider(transport).paint({apiKey:'synthetic-fixture-key',text:'synthetic manuscript'});}catch(failure){error=failure;}
  expect(error).toBeInstanceOf(CoverProviderError);expect((error as Error).message).toBe('INVALID_API_KEY');expect(posts).toBe(1);
});
it('invalid model identifiers are rejected before any network operation',async()=>{
  let calls=0;const transport:typeof fetch=async()=>{calls++;throw Error();};
  await expect(new CoverArtProvider(transport).paint({apiKey:'synthetic-fixture-key',text:'fixture',textModel:'model\nAuthorization: injected'})).rejects.toThrow();expect(calls).toBe(0);
});
