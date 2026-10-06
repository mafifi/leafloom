type Method = 'openBook' | 'closeBook';
type Payload = {bookId: string; lease?: string | null};
type Call = (origin: string, method: Method, payload: Payload) => Promise<unknown>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : null;
function authority(reply: unknown, bookId: string): {lease: string | null} | null {
  const envelope=record(reply), opened=record(envelope?.value), book=record(opened?.book), metadata=record(book?.metadata);
  if(envelope?.ok !== true || metadata?.id !== bookId) return null;
  const lease=opened?.lease;
  return lease === null || typeof lease === 'string' && uuid.test(lease) ? {lease} : null;
}
/** Test-window lifetime mirrors host session release without saving author content. */
export class HostSessionLifetime {
  private readonly observations: Promise<{origin:string;method:Method;payload:Payload;reply:unknown} | null>[]=[];
  observe(origin: string, method: unknown, payload: unknown, reply: Promise<unknown>) {
    const request=record(payload), bookId=request?.bookId;
    if((method!=='openBook'&&method!=='closeBook') || typeof bookId!=='string' ||
       !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(bookId)) {void reply.catch(()=>{});return;}
    if(method==='closeBook' && request?.lease!==null &&
       !(typeof request?.lease==='string' && uuid.test(request.lease))) {void reply.catch(()=>{});return;}
    const event={origin,method,payload:{bookId,...(method==='closeBook'?{lease:request?.lease as string|null}:{})}};
    this.observations.push(reply.then(value=>({...event,reply:value})).catch(()=>null));
  }
  async close(call: Call) {
    const sessions=new Map<string,{origin:string;bookId:string;lease:string|null}>(), malformed=new Map<string,{origin:string;bookId:string}>();
    // Observation order follows received responses, not asynchronous JSON completion.
    for(const event of await Promise.all(this.observations)) {
      if(!event)continue;
      const key=event.origin+'\n'+event.payload.bookId, reply=record(event.reply);
      if(reply?.ok!==true)continue;
      if(event.method==='openBook') {
        const opened=authority(event.reply,event.payload.bookId);
        if(opened){sessions.set(key,{origin:event.origin,bookId:event.payload.bookId,lease:opened.lease});malformed.delete(key);}
        else if(!sessions.has(key))malformed.set(key,{origin:event.origin,bookId:event.payload.bookId});
      }else if(reply.value===true && sessions.get(key)?.lease===event.payload.lease) {
        sessions.delete(key);malformed.delete(key);
      }
    }
    const errors: unknown[]=[];
    for(const session of sessions.values()) {
      try {
        let reply=record(await call(session.origin,'closeBook',{bookId:session.bookId,lease:session.lease}));
        if(reply?.ok===false && reply.code==='UNAUTHORIZED') {
          // A renderer test may replace a well-formed lease. Recover only this
          // observed private session through the genuine host response.
          const reopened=authority(await call(session.origin,'openBook',{bookId:session.bookId}),session.bookId);
          if(!reopened)throw Error('Fixture host did not return a valid recovery lease');
          reply=record(await call(session.origin,'closeBook',{bookId:session.bookId,lease:reopened.lease}));
        }
        if(reply?.ok!==true || reply.value!==true)throw Error('Fixture host session did not close');
      }catch(error){errors.push(error);}
    }
    for(const session of malformed.values()) {
      try {
        const reply=await call(session.origin,'openBook',{bookId:session.bookId}), envelope=record(reply);
        if(envelope?.ok===false && ['MISSING','UNSUPPORTED','UNSUPPORTED_CONTENT','UNSUPPORTED_SCREENPLAY'].includes(String(envelope.code)))continue;
        const opened=authority(reply,session.bookId);
        if(!opened)throw Error('Fixture host did not return valid session authority');
        const closed=record(await call(session.origin,'closeBook',{bookId:session.bookId,lease:opened.lease}));
        if(closed?.ok!==true || closed.value!==true)throw Error('Fixture recovered session did not close');
      }catch(error){errors.push(error);}
    }
    if(errors.length)throw new AggregateError(errors,'Candidate fixture host cleanup failed');
  }
}
