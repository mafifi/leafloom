import {test as base,expect} from '@playwright/test';
import {createReferenceDirectory,launchReference,bindReferenceApplication} from '../reference/harness';
import {setReferenceRoot} from './storage-probe';
export {expect};
export const test=base.extend({page:async({page},use)=>{if(process.env.LEAFLOOM_PARITY_DRIVER!=='neo-reference'){await use(page);return;}const fixture=await createReferenceDirectory(),app=await launchReference(fixture);try{const referencePage=await app.firstWindow();setReferenceRoot(referencePage,fixture);bindReferenceApplication(referencePage,app);await use(referencePage);}finally{await app.close();}}});
