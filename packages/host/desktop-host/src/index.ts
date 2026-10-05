import { z } from 'zod';
import { Metadata } from '@leafloom/document-contracts';
import { Checkpoint, Name, OpenReply, SaveReply } from '@leafloom/editor-contracts';
export { OpenReply, SaveReply };
export const DeletionReply=z.strictObject({deleted:z.literal(true),location:z.enum(['system-trash','library-trash'])});
const Id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/);
const Empty = z.strictObject({});
export const GeneratedCover=z.string().max(14_000_000).regex(/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/);
const EmailDraft = z.strictObject({
  expectedFingerprint:z.string().regex(/^[0-9a-f]{64}$/).optional(),
  generatedCover:GeneratedCover.optional(),
  bookId: Id,
  to: z.email(),
  subject: z.string().max(500),
  body: z.string().max(50000),
  method: z.enum(['mail', 'gmail']),
});
const BookId = z.strictObject({ bookId: Id });
export const CoverQuality = z.enum(['low', 'medium', 'high']);
export const CoverModel = z.string().min(1).max(128).regex(/^[a-zA-Z0-9._-]+$/);
export const CoverOptions = z.strictObject({bookId:Id, provider:z.literal('openai').default('openai'), textModel:CoverModel.optional(), imageModel:CoverModel.optional(), quality:CoverQuality.default('medium')});
export const CoverSecretStatus = z.strictObject({provider:z.literal('openai'),configured:z.boolean(),storage:z.enum(['keychain','credential-manager','secret-service','fixture'])});
export const CoverArtResult = z.strictObject({file:z.string().regex(/^art-[0-9]+\.(jpg|png|webp)$/),brief:z.string().min(1).max(20000),textModel:CoverModel,imageModel:CoverModel});
export const CoverArtJob = z.strictObject({bookId:Id,jobId:z.uuid().optional(),status:z.enum(['idle','brief','painting','saving','done','failed']),code:z.string().optional(),result:CoverArtResult.optional()});
export const ManuscriptFingerprint=z.strictObject({fingerprint:z.string().regex(/^[0-9a-f]{64}$/)});
export const FontFamilies=z.array(z.string().min(1).max(512).refine(value=>!value.startsWith('.')&&!/[\r\n\0]/.test(value))).max(10000);
export type FontFamiliesValue=z.infer<typeof FontFamilies>;
export const HostFailed=z.strictObject({code:z.enum(['HOST_UNAVAILABLE','HOST_PROTOCOL']),canRestart:z.literal(true)});
export const HostRestarted=z.strictObject({restarted:z.literal(true),rebindRequired:z.literal(true)});
export {UpdateStatus,type UpdateStatusValue,type UpdateProvider} from './updates.ts';
export const RuntimeErrorReport = z.strictObject({source:z.enum(['renderer','promise','host']),code:z.literal('UNEXPECTED_RUNTIME'),at:z.iso.datetime()});
export type RuntimeErrorReportValue = z.infer<typeof RuntimeErrorReport>;
export const HostPayloads = {
  reportRuntimeError: RuntimeErrorReport,
  renderEmailDraft: EmailDraft,
  manuscriptFingerprint:BookId,
  runtimeState: Empty,
  libraryPath: Empty,
  createBackup: Empty,
  listBackups: Empty,
  readLibrary: Empty,
  writeLibrary: z.strictObject({ library: z.record(z.string(),z.json()) }),
  listBooks: Empty,
  createBook: z.strictObject({
    title: z.string().max(500),
    author: z.string().max(500).default(''),
    kind: z.string().max(64).optional(),
  }),
  readBookMeta: BookId,
  readCoverArt: BookId,
  readCoverArtJob: BookId,
  writeBookMeta: z.strictObject({ bookId: Id, metadata: Metadata }),
  deleteBook: BookId,
  openBook: BookId,
  closeBook: z.strictObject({ bookId: Id, lease: z.uuid().nullable() }),
  checkpoint: z.strictObject({
    bookId: Id,
    lease: z.uuid(),
    checkpoint: Checkpoint,
    expected: z.record(Name, z.string().regex(/^[0-9a-f]{64}$/)),
  }),
  listLanguages: Empty,
  getLanguage: Empty,
  setLanguage: z.strictObject({ language: z.string().min(2).max(32) }),
  consumeDocumentChanges: Empty,
  getSettings: Empty,
  writeSettings: z.strictObject({ settings: z.record(z.string(), z.json()) }),
  importManuscript: z.strictObject({ source: z.string().min(1) }),
  exportBook: z.strictObject({
    generatedCover:GeneratedCover.optional(),
    bookId: Id,
    format: z.enum(['txt', 'md', 'html', 'docx', 'epub', 'pdf', 'fountain', 'fdx']),
    destination: z.string().min(1),
    language: z
      .string()
      .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/)
      .default('en'),
  }),
  exportChapter: z.strictObject({bookId:Id,chapterId:Id,format:z.enum(['txt','md','html','docx','epub','pdf','fountain','fdx']),destination:z.string().min(1),language:z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/).default('en')}),
  renderChapterPreview: z.strictObject({bookId:Id,chapterId:Id,language:z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/).default('en')}),
  exportCollection: z.strictObject({
    uuid:z.uuid().optional(),
    generatedCover:GeneratedCover.optional(),
    bookIds: z.array(Id).min(1).max(1000),
    title: z.string().min(1).max(500),
    author: z.string().max(500).default(''),
    bound: z.boolean().default(false),
    numbering: z.enum(['through', 'restart']).default('through'),
    format: z.enum(['txt', 'md', 'html', 'docx', 'epub', 'pdf', 'fountain', 'fdx']),
    language: z
      .string()
      .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/)
      .default('en'),
    destination: z.string().min(1),
  }),
  renderPreview: z.strictObject({
    generatedCover:GeneratedCover.optional(),
    bookId: Id,
    language: z
      .string()
      .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/)
      .default('en'),
  }),
  importLegacy: z.strictObject({ source: z.string().min(1) }),
  exportLegacy: z.strictObject({ bookId: Id, destination: z.string().min(1) }),
  setCover: z.strictObject({ bookId: Id, source: z.string().min(1) }),
  removeCover: BookId,
  readCover: z.strictObject({ bookId: Id, mode: z.enum(['active', 'image', 'painted']).default('active') }),
  saveExport: z.strictObject({
    destination: z.string().min(1),
    content: z.string(),
    encoding: z.enum(['utf8', 'base64']).default('utf8'),
  }),
  spellcheck: z.strictObject({
    words: z.array(z.string().max(200)).max(10000),
    language: z.string().default('en-US'),
  }),
  spellSuggest: z.strictObject({
    word: z.string().max(200),
    language: z.string().default('en-US'),
  }),
  spellLearn: z.strictObject({
    word: z.string().min(1).max(200),
    language: z.string().default('en-US'),
  }),
  diagnostics: Empty,
} as const;
export type HostMethod = keyof typeof HostPayloads;
export type HostPayload<M extends HostMethod> = z.input<(typeof HostPayloads)[M]>;
export type HostResult<T = unknown> =
  { ok: true; value: T } | { ok: false; code: string; message?: string };
export interface DesktopHost {
  request<T = unknown, M extends HostMethod = HostMethod>(
    method: M,
    payload: HostPayload<M>,
    traceparent?: string,
  ): Promise<HostResult<T>>;
}
export type ParsedHostRequest = {
  [M in HostMethod]: { method: M; payload: z.output<(typeof HostPayloads)[M]> };
}[HostMethod];
export function parseHostRequest(method: string, payload: unknown): ParsedHostRequest {
  if (!Object.hasOwn(HostPayloads, method)) throw new Error('INVALID');
  return {
    method: method as HostMethod,
    payload: HostPayloads[method as HostMethod].parse(payload),
  } as ParsedHostRequest;
}

export const OsPayloads = {
  setSecret: z.strictObject({provider:z.literal('openai'),value:z.string().max(4096).nullable()}),
  hasSecret: z.strictObject({provider:z.literal('openai')}),
  paintCover: CoverOptions,
  coverArtJob: BookId,
  emailDraft: EmailDraft,
  setMenuState: z.strictObject({
    writingStyle:z.enum(['pantser','plotter']).optional(),
    typewriter:z.boolean().optional(),vim:z.boolean().optional(),markdownEmphasis:z.boolean().optional(),uiBright:z.boolean().optional(),poetry:z.boolean().optional(),interfaceZoom:z.number().min(1).max(3).optional(),
    bodyFont: z.string().optional(),
    dropcap: z.string().optional(),
    align: z.string().optional(),
    language: z.string().optional(),
    spellLanguage: z.string().optional(),
    pageTheme: z.string().optional(),
    focus: z.string().optional(),
  }),
  getWindowState: Empty,
  closeWindow: Empty,
  getLibraryConfiguration: Empty,
  selectLibraryFolder: Empty,
  configureLibraryFolder: z.strictObject({ path: z.string().min(1).nullable() }),
  restartApp: Empty,
  restartHost: Empty,
  quitApp: Empty,
  updateStatus: Empty,
  checkForUpdates: Empty,
  installUpdatePending: Empty,
  restartToUpdate: Empty,
  fullscreenEscape: Empty,
  platformInfo: Empty,
  setTheme: z.strictObject({ theme: z.enum(['dark', 'light', 'system']) }),
  fontFamilies: Empty,
  readClipboard: Empty,
  writeClipboard: z.strictObject({
    text: z.string().max(32 * 1024 * 1024),
    html: z
      .string()
      .max(32 * 1024 * 1024)
      .optional(),
  }),
  printChapter:z.strictObject({bookId:Id,chapterId:Id,language:z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/).default('en')}),
  printManuscript: z.strictObject({ bookId: Id, language: z.string().default('en'),generatedCover:GeneratedCover.optional() }),
  selectImportDirectory: Empty,
  selectImportFiles: Empty,
  selectCover: Empty,
  selectCoverImage: Empty,
  selectExportDirectory: z.strictObject({ name: z.string().optional() }),
  selectExportFile: z.strictObject({ name: z.string().optional() }),
  showLibrary: Empty,
  showBookFolder: BookId,
  openExternal: z.strictObject({ url: z.string().url() }),
  toggleFullscreen: Empty,
  version: Empty,
} as const;
export type OsMethod = keyof typeof OsPayloads;
export type OsPayload<M extends OsMethod> = z.input<(typeof OsPayloads)[M]>;
export interface DesktopOS { request<M extends OsMethod>(method:M,payload:OsPayload<M>):Promise<unknown>; }
export const FullscreenChangedSchema = z.strictObject({ fullscreen: z.boolean() });
export const DropPositionSchema = z.strictObject({
  x: z.number().finite().min(0).max(1_000_000),
  y: z.number().finite().min(0).max(1_000_000),
});
export const DropTargetSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('book'), bookId: Id }),
  z.strictObject({ kind: z.literal('shelf'), shelfId: z.string().min(1).max(128) }),
]);
export type DropTargetValue = z.infer<typeof DropTargetSchema>;
/** Native positions use logical coordinates relative to the WebView client area. */
export const FilesDroppedSchema = z.strictObject({
  paths: z.array(z.string().min(1)).max(1000),
  position: DropPositionSchema.optional(),
  target: DropTargetSchema.optional(),
});
export type FilesDroppedValue = z.infer<typeof FilesDroppedSchema>;
export const DocumentChangeSchema = z.strictObject({
  bookId: Id,
  versions: z.record(Name, z.string().regex(/^[0-9a-f]{64}$/)).optional(),
  code: z.enum(['CORRUPT', 'RECOVERY_REQUIRED', 'UNAVAILABLE']).optional(),
});
export type DocumentChange = {
  bookId: string;
  versions?: Record<'manuscript' | 'reviews' | 'notes' | 'outline', string>;
  code?: 'CORRUPT' | 'RECOVERY_REQUIRED' | 'UNAVAILABLE';
};

export type ParsedOsRequest = {
  [M in OsMethod]: { method: M; payload: z.output<(typeof OsPayloads)[M]> };
}[OsMethod];
export function parseOsRequest(method: string, payload: unknown): ParsedOsRequest {
  if (!Object.hasOwn(OsPayloads, method)) throw Error('INVALID');
  return {
    method: method as OsMethod,
    payload: OsPayloads[method as OsMethod].parse(payload),
  } as ParsedOsRequest;
}
