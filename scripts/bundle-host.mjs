import {verifyReleaseFonts} from './verify-release-fonts.mjs';
import { stageReleaseNotices } from './stage-release-notices.mjs';
import { build } from 'esbuild';
import { mkdir, rm, cp, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname, relative } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const finalOutput = join(root, 'apps/desktop/src-tauri/binaries/host');
const output = finalOutput + '.stage-' + randomUUID(),
  previous = finalOutput + '.previous-' + randomUUID();
const dependencies = [];
try {
  await mkdir(output, { recursive: true });
  const compilerInputs=[];
  await build({
    entryPoints: [join(root, 'apps/desktop/host/main.ts')],
    outfile: join(output, 'main.mjs'),
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'esm',
    sourcemap: false,
    banner: {
      js: "import { createRequire as createHostRequire } from 'node:module'; const require = createHostRequire(import.meta.url);",
    },
    external: ['@farscrl/hunspell-wasm', 'jsdom', 'pdfkit'],
    plugins:[{name:'exact-input-provenance',setup(builder){builder.onLoad({filter:/\.(?:[cm]?[jt]sx?|json)$/},async({path})=>{const contents=await readFile(path);compilerInputs.push({path:relative(root,path),sha256:createHash('sha256').update(contents).digest('hex')});const extension=path.split('.').at(-1);return {contents,loader:extension==='json'?'json':extension==='tsx'?'tsx':extension==='jsx'?'jsx':extension==='ts'?'ts':'js'};});}}],
  });
  await writeFile(join(output,'host-build.json'),JSON.stringify({formatVersion:1,target:'node24',platform:'node',mainSha256:createHash('sha256').update(await readFile(join(output,'main.mjs'))).digest('hex'),compilerInputs:compilerInputs.sort((a,b)=>a.path.localeCompare(b.path))},null,2)+'\n');
  const hostPackage = JSON.parse(
    await readFile(join(root, 'apps/desktop/host/package.json'), 'utf8'),
  );
  async function stagePackage(source, destination, ancestors = []) {
    source = await realpath(source);
    const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8')),
      id = manifest.name + '@' + manifest.version;
    if (ancestors.includes(id)) return;
    dependencies.push({
      name: manifest.name,
      version: manifest.version,
      license: manifest.license ?? null,
      path: relative(output, destination),
      manifestSha256: createHash('sha256')
        .update(await readFile(join(source, 'package.json')))
        .digest('hex'),
    });
    await mkdir(dirname(destination), { recursive: true });
    await cp(source, destination, {
      recursive: true,
      dereference: true,
      filter: (path) => !path.slice(source.length).split('/').includes('node_modules'),
    });
    const require = createRequire(join(source, 'package.json'));
    for (const name of Object.keys({
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
    })) {
      let directory;
      for (const search of require.resolve.paths(name + '/') ?? []) {
        const candidate = join(search, name);
        try {
          const metadata = JSON.parse(await readFile(join(candidate, 'package.json'), 'utf8'));
          if (metadata.name === name) {
            directory = candidate;
            break;
          }
        } catch {}
      }
      if (!directory) {
        if (Object.hasOwn(manifest.optionalDependencies ?? {}, name)) continue;
        throw Error('Cannot locate shipped dependency ' + name);
      }
      await stagePackage(directory, join(destination, 'node_modules', name), [...ancestors, id]);
    }
  }
  for (const dependency of Object.keys(hostPackage.dependencies).filter(
    (name) =>
      ['@farscrl/hunspell-wasm', 'jsdom', 'pdfkit'].includes(name) ||
      name.startsWith('dictionary-'),
  ))
    await stagePackage(
      join(root, 'apps/desktop/host/node_modules', dependency),
      join(output, 'node_modules', dependency),
    );
  await cp(join(root, 'apps/desktop/host/locales'), join(output, 'locales'), { recursive: true });
  await verifyReleaseFonts(join(root, 'apps/desktop/host/fonts'));
  await cp(join(root, 'apps/desktop/host/fonts'), join(output, 'fonts'), { recursive: true });
  await cp(join(root,'apps/desktop/public/fonts'),join(output,'font-assets'),{recursive:true});
  await cp(join(root,'apps/desktop/host/fontfaces.json'),join(output,'fontfaces.json'));
  execFileSync(process.execPath, [join(root, 'scripts/stage-node-runtime.ts'), output], {
    stdio: 'inherit',
  });

  for (const [name, version] of Object.entries({
    '@farscrl/hunspell-wasm': '1.0.1',
    'dictionary-ro': '3.0.0',
    'dictionary-pt': '4.0.0',
  })) {
    const manifest = JSON.parse(
      await readFile(join(output, 'node_modules', name, 'package.json'), 'utf8'),
    );
    if (manifest.version !== version)
      throw Error('Upstream license provenance version mismatch: ' + name);
  }
  await cp(join(root, 'docs/migration/bundled-licenses'), join(output, 'licenses'), {
    recursive: true,
  });
  for (const name of ['LICENSE', 'LICENSE.neo', 'NOTICE']) {
    await cp(join(root, name), join(output, name));
    await cp(join(root, name), join(output, 'licenses', name));
  }
  try {
    await cp(join(root, 'apps/desktop/host/licenses'), join(output, 'licenses'), {
      recursive: true,
    });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await stageReleaseNotices(output);
  await writeFile(
    join(output, 'bundled-dependencies.json'),
    JSON.stringify({ formatVersion: 1, dependencies }, null, 2) + '\n',
  );
  try {
    await rename(finalOutput, previous);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  try {
    await rename(output, finalOutput);
  } catch (error) {
    await rename(previous, finalOutput).catch(() => {});
    throw error;
  }
} finally {
  await rm(output, { recursive: true, force: true });
  await rm(previous, { recursive: true, force: true });
}
