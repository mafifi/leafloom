import { context, trace, SpanStatusCode, type Context } from '@opentelemetry/api';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { MeterProvider, InMemoryMetricExporter, PeriodicExportingMetricReader, AggregationTemporality } from '@opentelemetry/sdk-metrics';
export type Stage='save'|'save.snapshot'|'save.port'|'reopen'|'editor.command'|'editor.apply';
export type FrameKind='input'|'command';
/** Local probe uses standard SDKs; no global provider, prose or host paths. */
export class Diagnostics {
 readonly spans=new InMemorySpanExporter();
 readonly metrics=new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
 private traces=new BasicTracerProvider({spanProcessors:[new SimpleSpanProcessor(this.spans)]});
 private meters=new MeterProvider({readers:[new PeriodicExportingMetricReader({exporter:this.metrics,exportIntervalMillis:60000})]});
 private tracer=this.traces.getTracer('neo.ui-spike','1');
 private latency=this.meters.getMeter('neo.ui-spike').createHistogram('neo.ui.render_ready',{unit:'ms'});
 private commitLatency=this.meters.getMeter('neo.ui-spike').createHistogram('neo.editor.commit',{unit:'ms'});
 private operations=this.meters.getMeter('neo.ui-spike').createCounter('neo.operations');
 frames:{kind:FrameKind;milliseconds:number}[]=[];commits:{kind:FrameKind;milliseconds:number}[]=[];
 recordCommit(kind:FrameKind,milliseconds:number){if(!this.enabled)return;this.commits=[...this.commits.slice(-499),{kind,milliseconds}];try{this.commitLatency.record(milliseconds,{kind});}catch{}};
 constructor(readonly enabled=true){}
 private bound(){if(this.spans.getFinishedSpans().length>1000){const recent=this.spans.getFinishedSpans().slice(-500);this.spans.reset();this.spans.export(recent,()=>{});}}
 startFrame(kind:FrameKind){if(!this.enabled)return;const start=performance.now();requestAnimationFrame(()=>{const milliseconds=performance.now()-start;this.frames=[...this.frames.slice(-499),{kind,milliseconds}];try{this.latency.record(milliseconds,{kind});}catch{/* Diagnostics never interrupt writing. */}});}
 sync<T>(stage:Stage,operation:()=>T,parent?:Context):T{
  let span;try{if(this.enabled)span=this.tracer.startSpan(stage,{},parent);}catch{}
  try{return operation();}catch(error){span?.setStatus({code:SpanStatusCode.ERROR});throw error;}finally{try{span?.end();this.bound();if(this.enabled)this.operations.add(1,{stage});}catch{}}
 }
 async run<T>(stage:Stage,operation:(parent:Context)=>Promise<T>,parent?:Context):Promise<T>{
  let span;try{if(this.enabled)span=this.tracer.startSpan(stage,{},parent);}catch{}
  try{return await operation(span?trace.setSpan(parent??context.active(),span):context.active());}catch(error){span?.setStatus({code:SpanStatusCode.ERROR});throw error;}finally{try{span?.end();this.bound();if(this.enabled)this.operations.add(1,{stage});}catch{}}
 }
 async report(){await this.traces.forceFlush();await this.meters.forceFlush();const report={frames:this.frames,commits:this.commits,spans:this.spans.getFinishedSpans().map(s=>({name:s.name,traceId:s.spanContext().traceId,parentSpanId:s.parentSpanContext?.spanId,status:s.status.code,milliseconds:s.duration[0]*1000+s.duration[1]/1e6,attributes:s.attributes})),metrics:this.metrics.getMetrics()};this.metrics.reset();return report;}
 async dispose(){await Promise.allSettled([this.traces.shutdown(),this.meters.shutdown()]);}
}
