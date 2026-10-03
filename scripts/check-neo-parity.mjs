import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evidenceMetadata, referenceMetadata, root } from '../tests/neo-compat/evidence.mjs';
import { verifyProvenance } from './check-repository.mjs';
import { verifyNativeEvidence } from './check-native-evidence.mjs';
export function reportRows(report) {
  const rows = [];
  const visit = (suites, lineage = []) => {
    for (const suite of suites ?? []) {
      const names = [...lineage, suite.title];
      for (const spec of suite.specs ?? [])
        rows.push({ title: spec.title, lineage: names, tests: spec.tests ?? [] });
      visit(suite.suites, names);
    }
  };
  visit(report.suites);
  return rows;
}
export function passingCase(report, entry, fingerprint) {
  const meta = report.config?.metadata;
  if (
    meta?.evidenceSchema !== 'leafloom/parity-v1' ||
    meta.appImplementation !== 'leafloom-production' ||
    meta.referenceCommit !== 'ed090e9988d446daf1ebbde91bcebc13b599909b' ||
    meta.buildSha256 !== fingerprint
  )
    return false;
  if (entry.driver === 'tauri-native' && meta.driver !== 'tauri-native') return false;
  const rows = reportRows(report).filter(
    (row) =>
      row.title === entry.title &&
      (!entry.project || row.tests.some((t) => t.projectName === entry.project)),
  );
  return (
    rows.length === 1 &&
    rows[0].tests.length > 0 &&
    rows[0].tests.every(
      (test) =>
        test.expectedStatus === 'passed' &&
        test.results?.length === 1 &&
        test.results[0].status === 'passed',
    )
  );
}
export function passingReference(report, entry, expected) {
  const meta = report.config?.metadata;
  if (
    meta?.evidenceSchema !== expected.evidenceSchema ||
    meta.appImplementation !== expected.appImplementation ||
    meta.referenceCommit !== expected.referenceCommit ||
    meta.referenceSourceSha256 !== expected.referenceSourceSha256 ||
    meta.referenceHarnessSha256 !== expected.referenceHarnessSha256 ||
    !['electron-reference', 'electron-reference-hidden'].includes(meta.driver) ||
    meta.nativeWindowPolicy !==
      (meta.driver === 'electron-reference-hidden' ? 'hidden' : 'foreground')
  )
    return false;
  const rows = reportRows(report).filter(
    (row) =>
      row.title === entry.title &&
      (!entry.project || row.tests.some((t) => t.projectName === entry.project)),
  );
  return (
    rows.length === 1 &&
    rows[0].tests.length > 0 &&
    rows[0].tests.every(
      (test) =>
        test.expectedStatus === 'passed' &&
        test.results?.length === 1 &&
        test.results[0].status === 'passed',
    )
  );
}
export function requiresNative(environment) {
  return /native|foreground|macOS|installed.font|capacitor/i.test(environment ?? '');
}

/** @typedef {import('./native-evidence-types.ts').AcceptanceCase} NativeCase */
/** Schema-aware dispatch retains native receipts; no Playwright rows are synthesized. */
export async function verifyCandidateEvidence(report, entry, options = {}) {
  if (['native-v1', 'host-startup-v1'].includes(entry.evidenceKind)) {
    if (typeof entry.contractId !== 'string' || !entry.contractId)
      return {
        passed: false,
        kind: entry.evidenceKind,
        problems: ['Native case lacks reviewed contract'],
      };
    try {
      return { ...(await verifyNativeEvidence(report, entry, options)), kind: entry.evidenceKind };
    } catch (error) {
      return {
        passed: false,
        kind: entry.evidenceKind,
        problems: ['Malformed native evidence: ' + error.message],
      };
    }
  }
  if (['tauri-native-hidden', 'node-sidecar-startup'].includes(entry.driver))
    return {
      passed: false,
      kind: 'unknown',
      problems: ['Native or sidecar driver requires explicit reviewed receipt dispatch'],
    };
  if (entry.evidenceKind && entry.evidenceKind !== 'playwright')
    return { passed: false, kind: 'unknown', problems: ['Unknown evidence kind'] };
  return {
    passed: passingCase(report, entry, options.buildSha256),
    kind: 'playwright',
    problems: [],
  };
}

export async function checkParity() {
  const ledger = JSON.parse(
    await readFile(path.join(root, 'docs/migration/leafloom-scenarios.json'), 'utf8'),
  );
  const inventory = JSON.parse(
    await readFile(path.join(root, 'docs/migration/feature-inventory.json'), 'utf8'),
  );
  const problems = await verifyProvenance();
  const expected = inventory.features
    .filter((f) => f.status === 'required')
    .flatMap((f) =>
      f.scenarios.map((s) => ({ id: s.id, feature: f.id, environment: s.environment })),
    );
  const ids = ledger.scenarios.map((s) => s.id);
  for (const id of new Set(ids)) {
    if (ids.filter((value) => value === id).length !== 1)
      problems.push(`${id}: duplicate migration entries`);
  }
  for (const entry of ledger.scenarios) {
    if (!expected.some((row) => row.id === entry.id))
      problems.push(`${entry.id}: unknown required scenario`);
  }
  const fingerprint = (await evidenceMetadata()).buildSha256;
  const originalFingerprint = await referenceMetadata();
  const reports = new Map();
  let covered = 0;
  for (const row of expected) {
    const entry = ledger.scenarios.find((s) => s.id === row.id && s.featureId === row.feature);
    if (!entry) {
      problems.push(`${row.id}: missing migration entry`);
      continue;
    }
    const prior = problems.length;
    if (
      entry.migrationStatus === 'ported' &&
      (!entry.acceptanceReview?.driverActions?.length ||
        !entry.acceptanceReview?.assertions?.length ||
        entry.acceptanceReview.inventoryThen !== entry.acceptance.then)
    )
      problems.push(`${row.id}: source acceptance review missing or stale`);
    if (
      entry.migrationStatus !== 'ported' ||
      entry.knownGaps?.length ||
      !entry.candidateCases?.length
    )
      problems.push(`${row.id}: production port or acceptance evidence missing`);
    for (const item of entry.candidateCases ?? []) {
      if (item.report.includes('/parity/') || item.report.includes('spikes/')) {
        problems.push(`${row.id}: historical bridge report cannot prove Leafloom`);
        continue;
      }
      let data = reports.get(item.report);
      if (!data) {
        try {
          data = JSON.parse(await readFile(path.resolve(root, item.report), 'utf8'));
        } catch {
          data = {};
        }
        reports.set(item.report, data);
      }
      if (
        requiresNative(row.environment) &&
        !['tauri-native', 'tauri-native-hidden'].includes(item.driver)
      )
        problems.push(`${row.id}: source-native acceptance requires actual Tauri-native evidence`);
      const outcome = await verifyCandidateEvidence(data, item, {
        root,
        buildSha256: fingerprint,
        scenarioId: row.id,
        environment: row.environment,
      });
      if (!outcome.passed)
        problems.push(
          `${row.id}: candidate result missing, stale, skipped, retried or failed${outcome.problems.length ? ': ' + outcome.problems.join('; ') : ''}`,
        );
    }
    for (const item of entry.referenceCases ?? []) {
      let data = reports.get(item.report);
      if (!data) {
        try {
          data = JSON.parse(await readFile(path.resolve(root, item.report), 'utf8'));
        } catch {
          data = {};
        }
        reports.set(item.report, data);
      }
      if (requiresNative(row.environment) && data.config?.metadata?.nativeWindowPolicy === 'hidden')
        problems.push(
          `${row.id}: hidden original reference cannot prove native foreground acceptance`,
        );
      if (!passingReference(data, item, originalFingerprint))
        problems.push(
          `${row.id}: original reference result missing, stale, skipped, retried or failed`,
        );
    }
    if (entry.oracle?.kind === 'neo-reference' && !entry.referenceCases?.length)
      problems.push(`${row.id}: original reference evidence missing`);
    else if (entry.oracle?.kind === 'contract-output' && !entry.oracle.sourceEvidence)
      problems.push(`${row.id}: source-derived output oracle missing`);
    if (problems.length === prior) covered++;
  }
  const result = { required: expected.length, covered, buildSha256: fingerprint, problems };
  const directory = path.join(root, '.leafloom/evidence');
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, 'parity-status.json'),
    JSON.stringify(result, null, 2) + '\n',
  );
  return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkParity();
  console.log(`${result.covered}/${result.required} production Leafloom scenarios verified.`);
  if (result.problems.length) {
    console.error(result.problems.slice(0, 25).join('\n'));
    console.error(
      `${result.problems.length} unmet checks; complete report .leafloom/evidence/parity-status.json`,
    );
    process.exitCode = 1;
  }
}
