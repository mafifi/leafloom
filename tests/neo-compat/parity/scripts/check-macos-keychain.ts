import {createReferenceDirectory,launchReference,removeReferenceDirectory} from '../reference/harness.ts';
import {writeFile} from 'node:fs/promises';
const directory=await createReferenceDirectory();
const observations:{engine:string;electron:string;encryptionAvailable:boolean;roundTrip:boolean;milliseconds:number}[]=[];
let ciphertext:string|undefined;
try{
 for(const engine of [undefined,'prosemirror',undefined] as const){
  const app=await launchReference(directory,engine);let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const started=Date.now();
   const result=await Promise.race([
    app.evaluate(({safeStorage},prior)=>{
     if(!safeStorage.isEncryptionAvailable())throw Error('Native encryption unavailable');
     const text='NEO parity synthetic keychain lifecycle probe';
     const cipher=prior??safeStorage.encryptString(text).toString('base64');
     return{cipher,encryptionAvailable:true,roundTrip:safeStorage.decryptString(Buffer.from(cipher,'base64'))===text,electron:process.versions.electron};
    },ciphertext),
    new Promise<never>((_,reject)=>{timer=setTimeout(()=>{app.process().kill('SIGKILL');reject(Error('Keychain probe exceeded 15 seconds; stopped without retrying.'));},15000);}),
   ]);
   if(!result.roundTrip)throw Error('Native Keychain round trip failed');
   ciphertext=result.cipher;observations.push({engine:engine??'original',electron:result.electron,encryptionAvailable:result.encryptionAvailable,roundTrip:result.roundTrip,milliseconds:Date.now()-started});
  }finally{clearTimeout(timer);await app.close().catch(()=>{});}
 }
 await writeFile('/tmp/neo-signed-keychain-lifecycle.json',JSON.stringify({observations,syntheticOnly:true},null,2));
 console.log(JSON.stringify(observations));
}finally{await removeReferenceDirectory(directory);}
