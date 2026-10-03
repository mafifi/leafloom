import { it,expect } from 'vitest';
import { Diagnostics } from './telemetry';
it('standard OTel exports parented save stages, metrics and content-free failure',async()=>{
 const d=new Diagnostics();try{await d.run('save',async parent=>{d.sync('save.snapshot',()=>42,parent);await d.run('save.port',async()=>{},parent);});
 await expect(d.run('reopen',async()=>{throw new Error('Private prose and /personal/path');})).rejects.toThrow();
 const report=await d.report(),save=report.spans.find(s=>s.name==='save')!;expect(report.spans.filter(s=>s.name.startsWith('save.')).every(s=>s.traceId===save.traceId&&s.parentSpanId)).toBe(true);expect(report.metrics.length).toBeGreaterThan(0);expect(JSON.stringify(report)).not.toContain('Private prose');expect(JSON.stringify(report)).not.toContain('/personal/path');
 }finally{await d.dispose();}
});
it('disabled diagnostics executes the operation without exporting',async()=>{const d=new Diagnostics(false);try{expect(await d.run('save',async()=>7)).toBe(7);expect((await d.report()).spans).toEqual([]);}finally{await d.dispose();}});
it('a failing tracer does not prevent the command',async()=>{const d=new Diagnostics();try{(d as unknown as {tracer:{startSpan:()=>never}}).tracer={startSpan:()=>{throw new Error('collector unavailable');}};expect(d.sync('editor.command',()=>8)).toBe(8);}finally{await d.dispose();}});
