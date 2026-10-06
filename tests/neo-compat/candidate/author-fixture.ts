import {test as base,expect} from '@playwright/test';
import {createReferenceDirectory,launchReference,bindReferenceApplication} from '../reference/harness';
import {setReferenceRoot} from './storage-probe';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import type {Response} from '@playwright/test';
import {HostSessionLifetime} from './host-session-lifetime';
export {expect};
export const test=base.extend({page:async({page},use)=>{if(process.env.LEAFLOOM_PARITY_DRIVER!=='neo-reference'){
 const root=process.env.LEAFLOOM_TEST_ROOT;
 if(!root || await readFile(path.join(root,'.leafloom-parity-fixture'),'utf8')!=='isolated-leafloom-candidate-v1')throw Error('Unmarked candidate cleanup root');
 const lifetime=new HostSessionLifetime();
 const observe=(response:Response)=>{
  try{
   const url=new URL(response.url());
   if(url.pathname!=='/__leafloom/host' || url.origin!==new URL(page.url()).origin)return;
   const request=response.request();if(request.method()!=='POST')return;
   const body=request.postDataJSON() as {method?:unknown;payload?:unknown};
   if(body.method!=='openBook' && body.method!=='closeBook')return;
   lifetime.observe(url.origin,body.method,body.payload,response.json());
  }catch{/* Unrelated navigation and malformed transport do not grant session authority. */}
 };
 page.on('response',observe);
 try{await use(page);}finally{
  page.off('response',observe);
  await lifetime.close(async(origin,method,payload)=>{
   const response=await page.context().request.post(origin+'/__leafloom/host',{data:{method,payload},headers:{Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'}});
   try{return await response.json();}finally{await response.dispose();}
  });
 }
 return;
}const fixture=await createReferenceDirectory(),app=await launchReference(fixture);try{const referencePage=await app.firstWindow();setReferenceRoot(referencePage,fixture);bindReferenceApplication(referencePage,app);await use(referencePage);}finally{await app.close();}}});
