/** Native reports are retained receipts, never synthesized Playwright outcomes. */
export type NativeSection =
  'documentIO' | 'collectionIO' | 'folderReplacement' | 'quitRestart' | 'updater';
export type NativeCapability =
  'native-files' | 'native-export' | 'native-watcher' | 'native-lifecycle' | 'native-updater';
export type RequiredNativeCapability =
  | NativeCapability
  | 'foreground'
  | 'physical-picker'
  | 'physical-keyboard'
  | 'hardware-ime'
  | 'credential-store';
export interface NativeCase {
  readonly evidenceKind: 'native-v1';
  readonly driver: 'tauri-native-hidden';
  readonly section: NativeSection;
  readonly contractId: string;
  readonly id: string;
  readonly title: string;
  readonly report: string;
  readonly driverActions: readonly string[];
  readonly assertions: readonly string[];
  readonly requiredCapabilities: readonly [RequiredNativeCapability, ...RequiredNativeCapability[]];
  readonly knownGaps?: readonly string[];
}
export interface NativeValidation {
  readonly passed: boolean;
  readonly kind: 'native-v1' | 'host-startup-v1';
  readonly problems: readonly string[];
  readonly qualifications?: readonly string[];
  readonly parsed?: unknown;
}

/** Sidecar startup has no desktop, physical input, picker or credential capability. */
export type HostStartupCapability = 'host-files' | 'host-startup' | 'host-clock';
export interface HostStartupCase {
  readonly evidenceKind: 'host-startup-v1';
  readonly driver: 'node-sidecar-startup';
  readonly section: 'startupBackups';
  readonly contractId: string;
  readonly id: string;
  readonly title: string;
  readonly report: string;
  readonly driverActions: readonly string[];
  readonly assertions: readonly string[];
  readonly requiredCapabilities: readonly [HostStartupCapability, ...HostStartupCapability[]];
  readonly knownGaps?: readonly string[];
}
export type AcceptanceCase = NativeCase | HostStartupCase;
export interface HostStartupReceipt {
  readonly evidenceSchema: 'leafloom/host-startup-v1';
  readonly appImplementation: 'leafloom-production';
  readonly referenceCommit: string;
  readonly driver: 'node-sidecar-startup';
  readonly fixtureKind: string;
  readonly status: 'passed' | 'failed' | 'stale';
  readonly buildSha256: string;
  readonly buildSha256Before: string;
  readonly buildSha256After: string;
  readonly artifactBinding: {
    readonly driverPath: 'scripts/verify-host-backups.mjs';
    readonly driverSha256: string;
    readonly runtimeEntry: string;
    readonly runtimeExecutable: string;
    readonly hostMainSha256: string;
    readonly nodeSha256: string;
    readonly hostBuildSha256: string;
    readonly clockPreloadSha256: string;
    readonly fixtureSha256: string;
  };
  readonly startupBackups: {
    readonly driver: 'node-sidecar-startup';
    readonly artifacts: string;
    readonly qualification: string;
    readonly evidence: readonly {
      readonly id: string;
      readonly title: string;
      readonly status: 'passed' | 'failed';
      readonly driverActions: readonly string[];
      readonly assertions: readonly string[];
      readonly artifact: { readonly sha256: string };
    }[];
    readonly unexecutedClauses: readonly string[];
  };
}
