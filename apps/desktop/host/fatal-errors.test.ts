import {it,expect} from 'vitest';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {RuntimeErrorReport} from '@leafloom/desktop-host';

for(const kind of ['uncaughtException','unhandledRejection'] as const)it(`actual host ${kind} persists a sanitized receipt and terminates`,async()=>{
  const root=await mkdtemp(join(tmpdir(),'leafloom-host-fatal-'));
  try {
    const trigger=kind==='uncaughtException'?"throw new Error('PRIVATE manuscript prose')":"void Promise.reject(new Error('PRIVATE manuscript prose'))";
    // Trigger only after the actual production entry has initialized its private root.
    const entry=pathToFileURL(join(process.cwd(),'apps/desktop/host/main.ts')).href;
    const code=`const write=process.stdout.write.bind(process.stdout);let triggered=false;process.stdout.write=(chunk,...args)=>{const result=write(chunk,...args);if(!triggered&&String(chunk).includes('"ready":true')){triggered=true;setImmediate(()=>{${trigger}});}return result;};await import(${JSON.stringify(entry)});`;
    const child=spawn(process.execPath,['--experimental-transform-types','--input-type=module','--eval',code],{env:{...process.env,LEAFLOOM_LIBRARY_ROOT:root},stdio:['pipe','pipe','pipe']});
    let stdout='',stderr='';
    child.stdout.on('data',bytes=>stdout+=bytes);child.stderr.on('data',bytes=>stderr+=bytes);
    const result=await new Promise<{code:number|null;signal:NodeJS.Signals|null}>((resolve,reject)=>{
      const timeout=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('Fatal host did not terminate'));},10000);
      child.once('error',error=>{clearTimeout(timeout);reject(error);});
      child.once('exit',(code,signal)=>{clearTimeout(timeout);resolve({code,signal});});
    });
    expect(result).toEqual({code:1,signal:null});
    expect(stdout).toContain('"ready":true');
    expect(stderr).toContain('"event":"host.fatal"');
    expect(stdout+stderr).not.toContain('PRIVATE');
    const bytes=await readFile(join(root,'leafloom-errors.log'),'utf8');
    const rows=bytes.trim().split('\n').map(row=>RuntimeErrorReport.parse(JSON.parse(row)));
    expect(rows).toHaveLength(1);expect(rows[0]?.source).toBe('host');
    expect(rows[0]?.code).toBe('UNEXPECTED_RUNTIME');expect(bytes).not.toContain('PRIVATE');
  } finally {await rm(root,{recursive:true,force:true});}
});
