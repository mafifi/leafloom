import koffi from 'koffi';
import type {Menu,MenuItem} from 'electron';
type Pointer=unknown;
type MenuAPI={setApplicationMenu(menu:Menu|null):void};
const title=(value:string)=>value.replace(/&/g,'').replace(/\s+/g,' ').trim();
let installed=false;
const actions=new Set(['itemSelected:','undo:','redo:','cut:','copy:','paste:','pasteAndMatchStyle:','selectAll:']);
/** Resolve AppKit objects at use time. Menu replacement invalidates old pointers. */
export function installNativeMenuBoundary(api:MenuAPI){
 if(process.platform!=='darwin')return;
 if(installed)throw Error('Native menu boundary must be installed only once per process');installed=true;
 const lib=koffi.load('/usr/lib/libobjc.A.dylib');
 const cls=lib.func('void *objc_getClass(const char *name)') as (name:string)=>Pointer;
 const sel=lib.func('void *sel_registerName(const char *name)') as (name:string)=>Pointer;
 const obj=lib.func('objc_msgSend','void *',['void *','void *']) as (object:Pointer,selector:Pointer)=>Pointer;
 const at=lib.func('objc_msgSend','void *',['void *','void *','long']) as (object:Pointer,selector:Pointer,index:number)=>Pointer;
 const strObj=lib.func('objc_msgSend','void *',['void *','void *','const char *']) as (object:Pointer,selector:Pointer,value:string)=>Pointer;
 const count=lib.func('objc_msgSend','long',['void *','void *']) as (object:Pointer,selector:Pointer)=>number;
 const flag=lib.func('objc_msgSend','bool',['void *','void *']) as (object:Pointer,selector:Pointer)=>boolean;
 const str=lib.func('objc_msgSend','const char *',['void *','void *']) as (object:Pointer,selector:Pointer)=>string;
 const setFlag=lib.func('objc_msgSend','void',['void *','void *','bool']) as (object:Pointer,selector:Pointer,value:boolean)=>void;
 const selName=lib.func('const char *sel_getName(void *sel)') as (selector:Pointer)=>string;
 const observe=lib.func('objc_msgSend','void',['void *','void *','void *','void *','void *','void *']) as (...args:Pointer[])=>void;
 const removeObserver=lib.func('objc_msgSend','void',['void *','void *','void *']) as (center:Pointer,selector:Pointer,watcher:Pointer)=>void;
 const allocClass=lib.func('void *objc_allocateClassPair(void *superclass,const char *name,size_t extra)') as (superclass:Pointer,name:string,extra:number)=>Pointer;
 const registerClass=lib.func('void objc_registerClassPair(void *cls)') as (klass:Pointer)=>void;
 const proto=koffi.proto('void NeoParityMenuIMP(void *self,void *cmd,void *note)');
 const addMethod=lib.func('bool class_addMethod(void *cls,void *name,NeoParityMenuIMP *imp,const char *types)') as (klass:Pointer,name:Pointer,imp:Pointer,types:string)=>boolean;
 let index=-1,ours:(string|null)[]=[],replacing=false,hiding=false,shuttingDown=false;
 const liveEdit=()=>{const app=obj(cls('NSApplication'),sel('sharedApplication')),bar=app&&obj(app,sel('mainMenu'));if(!bar||index<0||index>=count(bar,sel('numberOfItems')))return null;const item=at(bar,sel('itemAtIndex:'),index);return item&&obj(item,sel('submenu'));};
 const hide=()=>{if(shuttingDown||replacing||hiding)return;hiding=true;try{const edit=liveEdit();if(!edit)return;let next=0;for(let i=0,n=count(edit,sel('numberOfItems'));i<n;i++){const item=at(edit,sel('itemAtIndex:'),i);if(!item)continue;const separator=flag(item,sel('isSeparatorItem')),nameObject=separator?null:obj(item,sel('title')),name=nameObject?str(nameObject,sel('UTF8String')):'';const mine=next<ours.length&&(separator?ours[next]===null:ours[next]===title(name));if(mine){next++;continue;}const action=separator?null:obj(item,sel('action'));if(!(action&&actions.has(selName(action)))&&!flag(item,sel('isHidden')))setFlag(item,sel('setHidden:'),true);}}finally{hiding=false;}};
 const imp=koffi.register((_self:Pointer,_cmd:Pointer,note:Pointer)=>{if(shuttingDown||replacing||hiding||!note)return;const changed=obj(note,sel('object')),edit=liveEdit();if(changed&&edit&&koffi.address(changed)===koffi.address(edit))hide();},koffi.pointer(proto));
 let klass=allocClass(cls('NSObject'),'NeoParityLiveMenuWatcher',0);if(klass){addMethod(klass,sel('neoMenuChanged:'),imp,'v@:@');registerClass(klass);}else throw Error('Native menu watcher class already exists');
 const watcher=obj(obj(klass,sel('alloc')),sel('init')),center=obj(cls('NSNotificationCenter'),sel('defaultCenter'));
 for(const name of ['NSMenuDidAddItemNotification','NSMenuDidChangeItemNotification'])observe(center,sel('addObserver:selector:name:object:'),watcher,sel('neoMenuChanged:'),strObj(cls('NSString'),sel('stringWithUTF8String:'),name),null);
 const set=api.setApplicationMenu.bind(api);
 api.setApplicationMenu=menu=>{replacing=true;try{const edit=menu?.items.find((item:MenuItem)=>item.submenu?.items.some(child=>child.role==='copy')&&item.submenu.items.some(child=>child.role==='paste'));index=edit&&menu?menu.items.indexOf(edit):-1;ours=edit?.submenu?.items.map(item=>item.type==='separator'?null:title(item.label))??[];set(menu);}finally{replacing=false;}hide();};
 // Keep the callback and watcher alive for the whole Electron process.
 const dispose=()=>{if(shuttingDown)return;shuttingDown=true;removeObserver(center,sel('removeObserver:'),watcher);koffi.unregister(imp);};
 return {imp,watcher,hide,dispose};
}
