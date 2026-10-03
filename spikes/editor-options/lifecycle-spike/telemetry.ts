import { context,trace,SpanStatusCode,type Context } from '@opentelemetry/api';import { BasicTracerProvider,SimpleSpanProcessor,InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { LifecycleError } from './contracts';
export type Stage='ui.open'|'ui.save'|'ui.reload'|'ipc.open'|'ipc.save'|'ipc.reload'|'ipc.close'|'storage.save'|'host.renderer-recovery';
export class LifecycleTelemetry {
 private exporter=new InMemorySpanExporter();private provider=new BasicTracerProvider({spanProcessors:[new SimpleSpanProcessor(this.exporter)]});private tracer=this.provider.getTracer('neo.lifecycle-spike','1');
 async run<T>(name:Stage,op:(ctx:Context)=>Promise<T>,parent?:Context):Promise<T>{let span;try{span=this.tracer.startSpan(name,{},parent);}catch{}const ctx=span?trace.setSpan(parent??context.active(),span):parent??context.active();try{return await op(ctx);}catch(error){try{span?.setStatus({code:SpanStatusCode.ERROR});if(error instanceof LifecycleError)span?.setAttribute('failure.code',error.code);}catch{}throw error;}finally{try{span?.end();}catch{}}}
 carrier(ctx:Context){const s=trace.getSpanContext(ctx);return s?`00-${s.traceId}-${s.spanId}-${s.traceFlags.toString(16).padStart(2,'0')}`:undefined;}
 parent(value?:string){if(!value)return undefined;const[,traceId,spanId,flags]=value.split('-');return trace.setSpanContext(context.active(),{traceId,spanId,traceFlags:Number.parseInt(flags,16),isRemote:true});}
 async report(){await this.provider.forceFlush();return this.exporter.getFinishedSpans().map(span=>({name:span.name,traceId:span.spanContext().traceId,spanId:span.spanContext().spanId,parentSpanId:span.parentSpanContext?.spanId,attributes:span.attributes,status:span.status.code,milliseconds:span.duration[0]*1000+span.duration[1]/1e6}));}
 async dispose(){await this.provider.shutdown();}
}
