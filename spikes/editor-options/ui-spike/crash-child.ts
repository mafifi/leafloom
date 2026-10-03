import { FileBookStore, type SaveStage } from './storage';
import { createFixture } from '../src/fixture';
const [root,target]=process.argv.slice(2);
await new FileBookStore(root,async stage=>{if(stage===target as SaveStage){process.send?.({stage});await new Promise(()=>{});}}).save({...createFixture(),revision:1,title:'Interrupted replacement'});
