import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { evidenceMetadata, root as repositoryRoot } from '../tests/neo-compat/evidence.mjs';
import { nativeContract, inspectNativeArtifacts } from './native-artifact-contracts.mjs';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const commit = 'ed090e9988d446daf1ebbde91bcebc13b599909b';
const moduleFields = [
  ['tests/neo-compat/native/document-io.mjs', (r) => r.documentIO?.callbackSha256],
  ['tests/neo-compat/shared/document-io.mjs', (r) => r.documentIO?.sharedSha256],
  ...['native/io-cover-edge.mjs', 'shared/io-cover-edge.mjs', 'shared/pdf-layout.mjs'].map(
    (name) => ['tests/neo-compat/' + name, (r) => r.documentIO?.edgeModuleHashes?.[name]],
  ),
];
/** Native receipts retain their own schema; no synthetic Playwright outcomes are constructed. */
export async function verifyNativeEvidence(receipt, entry, options = {}) {
  const root = options.root ?? repositoryRoot;
  const contract = entry.contractId ? nativeContract(entry.contractId) : undefined;
  const section = contract?.section ?? 'documentIO';
  const problems = [];
  const require = (condition, message) => {
    if (!condition) problems.push(message);
  };
  require(receipt?.evidenceSchema === 'leafloom/native-v1', 'Native evidence schema missing');
  require(receipt?.appImplementation === 'leafloom-production' &&
    receipt.referenceCommit === commit, 'Production implementation/provenance missing');
  require(receipt?.driver === 'tauri-native-hidden' &&
    receipt.hiddenWindow === true &&
    /marked.*private|private.*marked/.test(
      receipt.fixtureKind ?? '',
    ), 'Hidden private fixture policy missing');
  require(receipt?.status === 'passed', 'Native run failed or incomplete');
  require(!receipt?.frontendErrors?.length, 'Native frontend errors were recorded');
  const fingerprint =
    options.buildSha256 ?? (await evidenceMetadata('tauri-native-hidden')).buildSha256;
  require(receipt?.buildSha256 === fingerprint &&
    receipt?.buildSha256Before === fingerprint &&
    receipt?.buildSha256After === fingerprint, 'Production source changed or receipt is stale');
  const inside = async (name, base = root) => {
    const resolved = await realpath(name),
      directory = await realpath(base);
    if (resolved !== directory && !resolved.startsWith(directory + path.sep))
      throw Error('Artifact escapes declared root');
    return resolved;
  };
  const check = async (name, expected, base = root) => {
    try {
      require(typeof expected === 'string' && /^[a-f0-9]{64}$/.test(expected), 'Missing SHA256: ' +
        name);
      require(digest(await readFile(await inside(name, base))) ===
        expected, 'Artifact bytes changed: ' + name);
    } catch {
      problems.push('Artifact missing or outside repository: ' + name);
    }
  };
  const binding = receipt?.artifactBinding ?? {};
  await check(path.join(root, 'scripts/verify-macos-native.mjs'), binding.driverSha256);
  await check(receipt?.binary ?? '', binding.binarySha256);
  await check(binding.runtimeEntry ?? '', binding.hostMainSha256);
  await check(binding.runtimeExecutable ?? '', binding.nodeSha256);
  require(path.basename(binding.runtimeEntry ?? '') ===
    'main.mjs', 'Unexpected executed host entry');
  if (section === 'documentIO')
    for (const [name, value] of moduleFields)
      await check(path.join(root, name), value(receipt ?? {}));
  else {
    const module = section === 'collectionIO' ? 'collection-output.mjs' : 'folder-replacement.mjs';
    await check(
      path.join(root, 'tests/neo-compat/native', module),
      receipt?.[section]?.callbackSha256,
    );
  }
  const assets = binding.webAssets ?? [];
  require(Array.isArray(assets) &&
    assets.some((a) => a.path?.endsWith('.js')) &&
    assets.some((a) => a.path?.endsWith('.css')), 'Actual served JavaScript/CSS bindings missing');
  const seen = new Set();
  for (const asset of Array.isArray(assets) ? assets : []) {
    require(typeof asset.path === 'string' &&
      /^\/assets\/[^/]+\.(js|css)$/.test(asset.path), 'Invalid served asset path');
    require(!seen.has(asset.path), 'Duplicate served asset');
    seen.add(asset.path);
    if (typeof asset.path === 'string')
      await check(
        path.join(root, 'apps/desktop/dist', asset.path),
        asset.sha256,
        path.join(root, 'apps/desktop/dist'),
      );
  }
  const io = receipt?.[section];
  if (entry.contractId) {
    require(Boolean(contract), 'Unreviewed native contract');
    require(entry.evidenceKind === 'native-v1' &&
      entry.driver === 'tauri-native-hidden', 'Invalid native case dispatch');
    require(entry.section === section, 'Native section differs from reviewed contract');
    for (const key of ['id', 'title', 'driverActions', 'assertions'])
      require(JSON.stringify(entry[key]) === JSON.stringify(contract?.[key]), 'Native case ' +
        key +
        ' differs from independently reviewed contract');
    const requested = entry.requiredCapabilities;
    require(Array.isArray(requested) &&
      requested.length > 0 &&
      new Set(requested).size ===
        requested.length, 'Native required capabilities missing or duplicated');
    require(Array.isArray(requested) &&
      requested.every((value) =>
        contract?.capabilities.includes(value),
      ) && contract?.capabilities.every((value) => requested.includes(value)), 'Hidden receipt lacks required capability');
    if (options.scenarioId)
      require([contract?.id, ...(contract?.title.match(/NEO-\d+-[A-Z]/g) ?? [])].includes(
        options.scenarioId,
      ), 'Native contract does not cover inventory scenario');
    require(!/foreground|physical|hardware|credential|keychain|unlocked|activation/i.test(
      options.environment ?? '',
    ), 'Hidden native evidence cannot prove physical or foreground environment');
  }
  require(io?.driver === 'tauri-native-hidden', 'Native section driver missing');
  if (section === 'documentIO')
    require(typeof io?.pickerQualification === 'string' &&
      io.pickerQualification.includes('physical'), 'Native picker qualification missing');
  const rows = (Array.isArray(io?.evidence) ? io.evidence : []).filter(
    (row) => row?.id === entry.id && row?.title === entry.title,
  );
  require(rows.length === 1, 'Exact finite acceptance row missing or duplicated');
  const row = rows[0];
  require(row?.status === undefined ||
    row.status === 'passed', 'Native finite row failed or incomplete');
  for (const key of ['driverActions', 'assertions']) {
    require(Array.isArray(entry[key]) && entry[key].length > 0, 'Acceptance contract lacks ' + key);
    require(JSON.stringify(row?.[key]) === JSON.stringify(entry[key]), 'Acceptance ' +
      key +
      ' differ from reviewed contract');
  }
  require(!(Array.isArray(io?.unexecutedClauses) ? io.unexecutedClauses : []).some(
    (clause) => String(clause).includes(entry.id) || String(clause).includes(entry.title),
  ), 'Acceptance clause was unexecuted');
  require(!entry.knownGaps?.length, 'Acceptance retains known gaps');
  require(!entry.requiresForeground &&
    !entry.requiresCredentialStore &&
    !entry.requiresPhysicalPicker, 'Hidden fixture cannot prove foreground, credential store or physical picker');
  if (row?.artifact?.sha256) {
    const artifactFile = contract?.parser.file ?? entry.artifactFile;
    require(typeof artifactFile ===
      'string', 'Parsed output acceptance lacks its retained artifact path');
    if (entry.artifactFile !== undefined && contract)
      require(entry.artifactFile ===
        contract.parser.file, 'Artifact path differs from reviewed contract');
    if (typeof artifactFile === 'string')
      await check(
        path.resolve(io?.artifacts ?? '', artifactFile),
        row.artifact.sha256,
        path.join(root, '.leafloom/evidence'),
      );
  }
  for (const artifact of entry.requiredArtifacts ?? [])
    await check(
      path.resolve(io?.artifacts ?? '', artifact.path),
      artifact.sha256,
      path.join(root, '.leafloom/evidence'),
    );
  let parsed;
  if (contract && problems.length === 0) {
    try {
      parsed = await inspectNativeArtifacts(contract, receipt, { root });
    } catch (error) {
      problems.push('Native artifact semantic validation failed: ' + error.message);
    }
  }
  return {
    passed: problems.length === 0,
    problems,
    parsed,
    qualifications: [io?.pickerQualification, row?.qualification].filter(Boolean),
  };
}
