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
  readonly kind: 'native-v1';
  readonly problems: readonly string[];
  readonly qualifications?: readonly string[];
  readonly parsed?: unknown;
}
