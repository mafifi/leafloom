import { verifyReleasePlatform } from './verify-release-platform.mjs';
import { verifyReleaseNotices } from './verify-release-notices.mjs';
import { verifySourceManifest, digest } from './release-source-manifest.mjs';
import { mkdtemp, mkdir, stat, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync,spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const source = resolve(process.argv[2] ?? ''),
  output = resolve(process.argv[3] ?? ''),
  identity = process.argv[4];
if (!source.endsWith('.app') || !output.endsWith('.dmg') || !identity)
  throw Error(
    'Usage: node scripts/release-macos.mjs <Leafloom.app> <new.dmg> <Developer ID identity>',
  );
if (identity !== 'Developer ID Application: Mostafa Afifi (QJJ98A74J8)')
  throw Error('Unexpected signing identity');
await stat(source);
try {
  await stat(output);
  throw Error('Release output already exists');
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
await mkdir(dirname(output), { recursive: true });
const root = dirname(dirname(fileURLToPath(import.meta.url))),
  work = await mkdtemp(join(tmpdir(), 'leafloom-assembly-')),
  stage = join(work, 'image'),
  app = join(stage, 'Leafloom.app');
const signedApp = output.replace(/\.dmg$/, '.app');
try {
  await stat(signedApp);
  throw Error('Signed app output already exists');
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
const receipt = output + '.assembly.json';
for(const path of [output+'.acceptance.json',output+'.source-manifest.json']){
  try { await stat(path); throw Error('Release evidence already exists: '+path); }
  catch(error){if(error.code!=='ENOENT')throw error;}
}
try {
  await stat(receipt);
  throw Error('Release receipt already exists');
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
await writeFile(
  receipt,
  JSON.stringify(
    {
      source,
      output,
      identity,
      started: new Date().toISOString(),
      status: 'assembling',
      notarization: 'not submitted',
    },
    null,
    2,
  ) + '\n',
  { flag: 'wx' },
);
try {
  await mkdir(stage);
  execFileSync('/usr/bin/ditto', [source, app]);
  const sourceBinding=await verifySourceManifest(root,app);
  execFileSync(process.execPath, [join(root, 'scripts/check-bundled-licenses.mjs')], {
    stdio: 'inherit',
    env: { ...process.env, LEAFLOOM_BUNDLE_RESOURCES: join(app, 'Contents/Resources') },
  });
  await verifyReleaseNotices(join(app, 'Contents/Resources/host'));
  await verifyReleasePlatform(app);
  execFileSync('/bin/sh', [join(root, 'scripts/sign-macos-app.sh'), app, identity], {
    stdio: 'inherit',
  });
  await verifySourceManifest(root,app,{unsigned:false});
  const acceptance = execFileSync(
    process.execPath,
    [join(root, 'scripts/verify-macos-app.mjs'), app, '--signed'],
    { encoding: 'utf8' },
  );
  await writeFile(output + '.acceptance.json', acceptance, { flag: 'wx' });
  await writeFile(output+'.source-manifest.json',await readFile(join(app,'Contents/Resources/source-manifest.json')),{flag:'wx'});
  execFileSync('/usr/bin/ditto', [app, signedApp]);
  execFileSync('/bin/ln', ['-s', '/Applications', join(stage, 'Applications')]);
  execFileSync(
    '/usr/bin/hdiutil',
    ['create', '-volname', 'Leafloom', '-srcfolder', stage, '-format', 'UDZO', output],
    { stdio: 'inherit' },
  );
  execFileSync('/usr/bin/codesign', ['--sign', identity, '--timestamp', output], {
    stdio: 'inherit',
  });
  execFileSync('/usr/bin/codesign', ['--verify', '--strict', output], { stdio: 'inherit' });
  execFileSync('/usr/bin/hdiutil', ['verify', output], { stdio: 'inherit' });
  const gatekeeper=[];
  for(const [artifact,args]of[[signedApp,['--assess','--type','execute','--verbose=2',signedApp]],[output,['--assess','--type','open','--context','context:primary-signature','--verbose=2',output]]]){
    const assessment=spawnSync('/usr/sbin/spctl',args,{encoding:'utf8',timeout:30000});
    gatekeeper.push({artifact,status:assessment.status,accepted:assessment.status===0,stdout:assessment.stdout?.trim()??'',stderr:assessment.stderr?.trim()??'',error:assessment.error?.code??null});
  }
  const hash = createHash('sha256')
    .update(await readFile(output))
    .digest('hex');
  await writeFile(
    receipt,
    JSON.stringify(
      {
        source,
        output,
        signedApp,
        identity,
        finished: new Date().toISOString(),
        status: 'signed and verified',
        sha256: hash,
        sourceBinding,
        signedShellSha256:digest(await readFile(join(signedApp,'Contents/MacOS/leafloom-desktop'))),
        signedNodeSha256:digest(await readFile(join(signedApp,'Contents/Resources/host/node'))),
        acceptanceSha256:digest(Buffer.from(acceptance)),
        channel:'manual local release',
        gatekeeper,
        notarization: 'not submitted',
        cleanMachineInstallation: 'not tested',
      },
      null,
      2,
    ) + '\n',
  );
  console.log('Signed distributable: ' + output);
} catch (e) {
  await writeFile(
    receipt,
    JSON.stringify(
      {
        source,
        output,
        identity,
        failed: new Date().toISOString(),
        status: 'failed',
        error: e.message,
        notarization: 'not submitted',
      },
      null,
      2,
    ) + '\n',
  );
  throw e;
} finally {
  await rm(work, { recursive: true, force: true });
}
