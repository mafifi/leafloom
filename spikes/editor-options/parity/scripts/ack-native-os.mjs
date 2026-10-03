// Records an action already performed and observed through the root CUA driver.
import {readFileSync,writeFileSync} from 'node:fs';
const [id,observedTitle,timestamp,key,observedAfter]=process.argv.slice(2);
const requestPath='/tmp/neo-parity-os-shortcut.json',ackPath=requestPath+'.ack.json';
const request=JSON.parse(readFileSync(requestPath,'utf8'));
const identity=observedTitle?.match(/^NEO OS (original|prosemirror) (\d+) ([a-f0-9-]+)$/);
if(request.id!==id||Date.now()>request.deadline||request.ackPath!==ackPath||!identity||identity[1]!==request.engine||Number(identity[2])!==request.mainPid||identity[3]!==request.nonce)throw Error('Stale or mismatched observed native action');
const keys={'CMD+;':'super+semicolon','CMD+/':'super+slash','ESC':'Escape','CMD+0':'super+0','CMD+SHIFT+F':'super+shift+f','CMD+ENTER':'super+Return','CMD+E':'super+e'};
if(keys[request.keys.join('+')]!==key||!Number.isFinite(Date.parse(timestamp))||!observedAfter)throw Error('Incomplete native observation');
writeFileSync(ackPath,JSON.stringify({id,engine:request.engine,nonce:request.nonce,observedTitle,observedPid:Number(identity[2]),action:request.action,keys:request.keys,driver:'cua-native-app',timestamp,log:[{tool:'cua.App.getAXState',observedWindow:observedTitle},{tool:'cua.App.pressKey',key},{tool:'cua.App.getAXState',observedAfter}]},null,2));
