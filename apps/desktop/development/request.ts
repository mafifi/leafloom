import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';

/** Development HTTP transport only; packaged applications use the native pipe. */
export function developmentRequestError(headers: IncomingHttpHeaders): { status: number; code: string } | null {
  if (headers['sec-fetch-site'] === 'cross-site') return { status: 403, code: 'CROSS_ORIGIN' };
  if (headers.origin !== undefined) {
    try {
      const origin = new URL(headers.origin);
      if (!['http:', 'https:'].includes(origin.protocol) || origin.host !== headers.host || origin.origin !== headers.origin)
        return { status: 403, code: 'CROSS_ORIGIN' };
    } catch { return { status: 403, code: 'CROSS_ORIGIN' }; }
  }
  if (headers['content-type']?.split(';', 1)[0].trim().toLowerCase() !== 'application/json')
    return { status: 415, code: 'JSON_REQUIRED' };
  return null;
}

export async function readDevelopmentJSON(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += value.byteLength;
    if (bytes > 32_000_000) throw Error('REQUEST_TOO_LARGE');
    chunks.push(value);
  }
  // Decode once after assembly: HTTP chunks may bisect an author's UTF-8 character.
  const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, bytes));
  return JSON.parse(text);
}
