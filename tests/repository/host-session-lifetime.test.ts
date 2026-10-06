import {it,expect,vi} from 'vitest';
import {HostSessionLifetime} from '../neo-compat/candidate/host-session-lifetime';
const origin='http://localhost:5192', lease='12345678-1234-4234-8234-123456789abc', stale='87654321-1234-4234-8234-123456789abc';
const opened=(bookId:string,held:string|null)=>({ok:true,value:{book:{metadata:{id:bookId}},lease:held,readOnly:held===null}});
it('late JSON completion cannot resurrect an already closed session and a read-only lease closes as null',async()=>{
 const lifetime=new HostSessionLifetime();let resolve!:(reply:unknown)=>void;
 lifetime.observe(origin,'openBook',{bookId:'book-one'},new Promise(yes=>{resolve=yes;}));
 lifetime.observe(origin,'closeBook',{bookId:'book-one',lease},Promise.resolve({ok:true,value:true}));
 lifetime.observe(origin,'openBook',{bookId:'book-reader'},Promise.resolve(opened('book-reader',null)));
 const call=vi.fn(async()=>({ok:true,value:true}));const cleanup=lifetime.close(call);
 resolve(opened('book-one',lease));await cleanup;
 expect(call.mock.calls).toEqual([[origin,'closeBook',{bookId:'book-reader',lease:null}]]);
});
it('a replaced lease recovers only the observed book after Unauthorized and closes the real host lease',async()=>{
 const lifetime=new HostSessionLifetime();lifetime.observe(origin,'openBook',{bookId:'book-one'},Promise.resolve(opened('book-one',stale)));
 const call=vi.fn(async(_origin:string,method:string,payload:{bookId:string;lease?:string|null})=>{
  if(method==='openBook')return opened(payload.bookId,lease);
  return payload.lease===stale?{ok:false,code:'UNAUTHORIZED'}:{ok:true,value:true};
 });
 await lifetime.close(call);
 expect(call.mock.calls).toEqual([
  [origin,'closeBook',{bookId:'book-one',lease:stale}],
  [origin,'openBook',{bookId:'book-one'}],
  [origin,'closeBook',{bookId:'book-one',lease}],
 ]);
});
it('a malformed or mismatched response never grants its claimed book ID and recovers the validated request ID',async()=>{
 const lifetime=new HostSessionLifetime();lifetime.observe(origin,'openBook',{bookId:'book-owned'},Promise.resolve(opened('book-foreign',stale)));
 const call=vi.fn(async(_origin:string,method:string,payload:{bookId:string})=>method==='openBook'?opened(payload.bookId,lease):{ok:true,value:true});
 await lifetime.close(call);
 expect(call.mock.calls).toEqual([[origin,'openBook',{bookId:'book-owned'}],[origin,'closeBook',{bookId:'book-owned',lease}]]);
});
it('aborted observations and invalid request IDs cannot grant cleanup authority',async()=>{
 const lifetime=new HostSessionLifetime();
 lifetime.observe(origin,'openBook',{bookId:'../foreign'},Promise.reject(Error('aborted')));
 lifetime.observe(origin,'openBook',{bookId:'book-owned'},Promise.reject(Error('aborted')));
 const call=vi.fn(async()=>({ok:true,value:true}));await lifetime.close(call);expect(call).not.toHaveBeenCalled();
});
