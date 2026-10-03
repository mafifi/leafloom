const fs=require('node:fs'),path=require('node:path'),os=require('node:os');const {app}=require('electron');
const root=fs.realpathSync(process.env.NEO_COMPOSITION_ROOT);
if(!root.startsWith(fs.realpathSync(os.tmpdir())+path.sep)||fs.readFileSync(path.join(root,'.composition-fixture'),'utf8')!=='neo-composition-v1')throw Error('Invalid private lifecycle root');
fs.mkdirSync(path.join(root,'profile'),{recursive:true});app.setName('NEO Parity');app.setPath('userData',path.join(root,'profile'));app.setPath('temp',root);if(process.platform==='darwin')app.setActivationPolicy('accessory');
void import('../composition-dist/host/main.js').catch(error=>{console.error(error);app.exit(1);});
