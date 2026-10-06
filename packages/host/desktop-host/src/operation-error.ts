import type {HostMethod} from './index.ts';

/** A categorical failure belongs to the request which failed, never a mutable last-request label. */
export class HostOperationError extends Error {
 readonly code:string;
 readonly operation:HostMethod;
 constructor(operation:HostMethod,code:string){
  const category=/^[A-Z][A-Z0-9_]{1,63}$/.test(code)?code:'HOST_PROTOCOL';
  super(category);this.name='HostOperationError';this.code=category;this.operation=operation;
 }
}
