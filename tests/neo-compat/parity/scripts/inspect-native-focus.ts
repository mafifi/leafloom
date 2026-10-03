import {createReferenceDirectory,launchReference,removeReferenceDirectory} from '../reference/harness.ts';
import {writeFile} from 'node:fs/promises';
const directory=await createReferenceDirectory(),app=await launchReference(directory);
try{
 const state=await app.evaluate(({app,BrowserWindow,screen})=>{
  const win=BrowserWindow.getAllWindows()[0];win.setTitle(`NEO Native Focus Probe ${process.pid}`);app.focus({steal:true});win.show();win.focus();
  return{pid:process.pid,title:win.getTitle(),visible:win.isVisible(),focusable:win.isFocusable(),focused:win.isFocused(),hidden:app.isHidden(),bounds:win.getBounds(),display:screen.getPrimaryDisplay().bounds};
 });
 await writeFile('/tmp/neo-native-focus-probe.json',JSON.stringify(state,null,2));console.log(JSON.stringify(state));
 await new Promise(resolve=>setTimeout(resolve,45000));
 console.log(JSON.stringify(await app.evaluate(({app,BrowserWindow})=>({focused:BrowserWindow.getAllWindows()[0].isFocused(),hidden:app.isHidden()}))));
}finally{await app.close();await removeReferenceDirectory(directory);}
