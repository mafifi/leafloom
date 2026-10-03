import { it,expect } from 'vitest';import { randomUUID } from 'node:crypto';import { Envelope } from './contracts';
it('IPC rejects renderer paths, unknown commands, invalid trace parents',()=>{
 const id=randomUUID();expect(Envelope.safeParse({requestId:id,command:{method:'open',path:'/arbitrary'}}).success).toBe(false);expect(Envelope.safeParse({requestId:id,command:{method:'shell'}}).success).toBe(false);expect(Envelope.safeParse({requestId:id,command:{method:'open'},traceparent:'00-'+ '0'.repeat(32)+'-'+ '1'.repeat(16)+'-01'}).success).toBe(false);expect(Envelope.safeParse({requestId:id,command:{method:'open'}}).success).toBe(true);
});
