import {
  parseHostRequest,
  parseOsRequest,
  type OsMethod,
  type OsPayload,
  type DesktopOS,
  type DesktopHost,
  type HostMethod,
  type HostPayload,
  type HostResult,
} from '@leafloom/desktop-host';
import { z } from 'zod';
const Reply = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), value: z.unknown() }),
  z.object({ ok: z.literal(false), code: z.string(), message: z.string().optional() }),
]);
type Native = {
  core: { invoke(command: string, args?: Record<string, unknown>): Promise<unknown> };
  event: {
    listen<T>(event: string, handler: (event: { payload: T }) => void): Promise<() => void>;
  };
};
declare global {
  interface Window {
    __TAURI__?: Native;
  }
}
export const host: DesktopHost = {
  async request<T, M extends HostMethod>(
    method: M,
    payload: HostPayload<M>,
    traceparent?: string,
  ): Promise<HostResult<T>> {
    parseHostRequest(method, payload);
    const raw = window.__TAURI__
      ? await window.__TAURI__.core.invoke('host_request', { method, payload, traceparent })
      : import.meta.env.DEV
        ? await fetch('/__leafloom/host', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ method, payload, traceparent }),
          }).then((r) => r.json())
        : { ok: false, code: 'NATIVE_HOST_REQUIRED' };
    return Reply.parse(raw) as HostResult<T>;
  },
};
export async function osRequest<M extends OsMethod>(
  method: M,
  payload: OsPayload<M>,
): Promise<unknown> {
  parseOsRequest(method, payload);
  if (!window.__TAURI__) throw new Error('NATIVE_HOST_REQUIRED');
  return window.__TAURI__.core.invoke('os_request', { method, payload });
}
export const os: DesktopOS = { request: osRequest };

export async function listenNative<T>(event: string, handler: (payload: T) => void) {
  return window.__TAURI__?.event.listen<T>(event, (event) => handler(event.payload));
}
