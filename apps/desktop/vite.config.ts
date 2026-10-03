import {defineConfig,type Plugin} from 'vite';
import {svelte} from '@sveltejs/vite-plugin-svelte';
import {resolve} from 'node:path';
import {LibraryHost} from './host/library';
import {hostErrorCode} from './host/error-code';
import {readFile} from 'node:fs/promises';
import {developmentRequestError,readDevelopmentJSON} from './development/request';
function fixtureHost():Plugin {
 let host:LibraryHost;
 return {name:'leafloom-development-host',apply:'serve',async configureServer(server){
  const fixture=process.env.LEAFLOOM_TEST_ROOT;
  if(fixture && await readFile(resolve(fixture,'.leafloom-parity-fixture'),'utf8') !== 'isolated-leafloom-candidate-v1') throw Error('UNMARKED_TEST_ROOT');
  host=new LibraryHost(resolve(fixture??'../../.leafloom/development-library'));
  await host.initialize();
  server.httpServer?.on('close',()=>void host.shutdown());
  server.middlewares.use('/__leafloom/host',async(req,res)=>{
   if(req.method!=='POST'){res.statusCode=405;res.end();return;}
   const denied=developmentRequestError(req.headers);
   if(denied){res.statusCode=denied.status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:false,code:denied.code}));return;}
   try{
    const {method,payload,traceparent}=await readDevelopmentJSON(req) as {method:string;payload:unknown;traceparent?:string};const value=await host.request(method,payload,traceparent);
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,value}));
   }catch(error){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:false,code:hostErrorCode(error)}));}
  });
 }};
}
export default defineConfig({define:{__LEAFLOOM_TELEMETRY_TEST__:JSON.stringify(process.env.LEAFLOOM_TELEMETRY_TEST==='1')},plugins:[svelte(),fixtureHost()],clearScreen:false,server:{hmr:process.env.LEAFLOOM_TEST_ROOT?false:undefined,host:'localhost',port:5190,strictPort:true},build:{outDir:'dist',emptyOutDir:true}});
