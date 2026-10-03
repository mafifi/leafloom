import {JSDOM} from 'jsdom';
import {importHTML,exportHTML} from './codec';
let document:Document|undefined;
/** Serialize the author document before the existing disk-writing IPC handler.
 * The compatibility controllers read innerHTML in auxiliary/page saves. Their
 * view decorations belong to PM, never to NEO's portable document format.
 */
export function serializePersistenceHTML(html:string):string{
 if(!/ProseMirror/.test(html))return html;
 document??=new JSDOM('').window.document;
 return exportHTML(document,importHTML(document,html));
}
export function persistenceArguments(channel:string,args:unknown[]):unknown[]{
 if(!['chapter:write','aux:write'].includes(channel)||typeof args[3]!=='string')return args;
 const normalized=serializePersistenceHTML(args[3]);
 if(normalized===args[3])return args;
 const out=[...args];out[3]=normalized;return out;
}
export {installNativeMenuBoundary} from './native-menu-boundary';
