// Reference only. Leafloom production code is never injected into this host.
const path=require('node:path');
if(process.env.LEAFLOOM_NATIVE_REFERENCE!=='1')throw Error('Native reference requires explicit LEAFLOOM_NATIVE_REFERENCE=1');
if(process.env.NEO_PARITY_ENGINE)throw Error('Leafloom reference adapter cannot launch a compatibility candidate');
const version=process.env.LEAFLOOM_REFERENCE_VERSION??'1.2.4';
if(!['1.2.4','1.3.5'].includes(version))throw Error('Unpinned NEO reference version');
process.env.NEO_REFERENCE_ROOT=path.resolve(__dirname,'../../reference',version==='1.3.5'?'neo-1.3.5':'neo');
process.env.NEO_REFERENCE_DEPENDENCIES=path.resolve(__dirname,'node_modules');
if(process.env.LEAFLOOM_REFERENCE_HIDDEN==='1')require('./hidden-host.cjs');
require('../parity/reference/launch.cjs');
