import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const version = (value) => value.split('.').reduce((sum, part, index) => sum + Number(part) * 100 ** (2-index), 0);
export async function verifyReleasePlatform(app) {
  const minimum = execFileSync('/usr/bin/plutil',['-extract','LSMinimumSystemVersion','raw',join(app,'Contents/Info.plist')],{encoding:'utf8'}).trim();
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(minimum)) throw Error('App minimum system version invalid');
  if(minimum!=='14.0')throw Error('Leafloom release minimum macOS must be 14.0');
  const identifier=execFileSync('/usr/bin/plutil',['-extract','CFBundleIdentifier','raw',join(app,'Contents/Info.plist')],{encoding:'utf8'}).trim();
  const appVersion=execFileSync('/usr/bin/plutil',['-extract','CFBundleShortVersionString','raw',join(app,'Contents/Info.plist')],{encoding:'utf8'}).trim();
  if(identifier!=='org.mafifi.leafloom'||appVersion!=='0.1.0')throw Error('Leafloom release identifier/version mismatch');
  const resources = join(app,'Contents/Resources/host');
  const manifest = JSON.parse(await readFile(join(resources,'runtime.json'),'utf8'));
  if (manifest.platform !== 'darwin' || manifest.arch !== 'arm64' || manifest.minimumMacOS !== '13.5') throw Error('Node runtime platform manifest mismatch');
  const inspected = [];
  for (const [name,path] of [['shell',join(app,'Contents/MacOS/leafloom-desktop')],['node',join(resources,'node')]]) {
    const architectures = execFileSync('/usr/bin/lipo',['-archs',path],{encoding:'utf8'}).trim();
    if (architectures !== 'arm64') throw Error('Release binary architecture mismatch: '+name);
    const commands = execFileSync('/usr/bin/otool',['-l',path],{encoding:'utf8'});
    const binaryMinimum = commands.match(/cmd LC_BUILD_VERSION[\s\S]*?minos ([0-9.]+)/)?.[1] ?? commands.match(/cmd LC_VERSION_MIN_MACOSX[\s\S]*?version ([0-9.]+)/)?.[1];
    if (!binaryMinimum || version(binaryMinimum) > version(minimum)) throw Error('App minimum OS does not cover binary requirement: '+name);
    if (name === 'node' && binaryMinimum !== manifest.minimumMacOS) throw Error('Node minimum OS manifest mismatch');
    const dylibs = execFileSync('/usr/bin/otool',['-L',path],{encoding:'utf8'}).trim().split('\n').slice(1).map(line=>line.trim().split(' (')[0]);
    if (dylibs.some(path=>!path.startsWith('/System/Library/')&&!path.startsWith('/usr/lib/'))) throw Error('Release depends on non-system dylib: '+name);
    inspected.push({name,architectures,minimumMacOS:binaryMinimum,systemDylibs:dylibs.length});
  }
  return {identifier,version:appVersion,architecture:'arm64',minimumMacOS:minimum,nodeSupportPolicy:manifest.supportPolicy,binaries:inspected};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { if(!process.argv[2])throw Error('Usage: node scripts/verify-release-platform.mjs <Leafloom.app>');console.log(JSON.stringify(await verifyReleasePlatform(resolve(process.argv[2])))); }
