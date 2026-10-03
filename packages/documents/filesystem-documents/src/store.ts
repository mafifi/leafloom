import type { DocumentStore, CheckpointValue, DocumentName } from '@leafloom/editor-contracts';
import { BookFiles } from './files.ts';
/** A leased filesystem implementation of the portable DocumentStore contract. */
export class FilesystemDocumentStore implements DocumentStore {
  readonly files: BookFiles;
  constructor(root: string) {
    this.files = new BookFiles(root);
  }
  async open() {
    await this.files.acquire();
    return this.files.load();
  }
  save(value: CheckpointValue, expected: Record<DocumentName, string>, traceparent?: string) {
    return this.files.checkpoint(value, expected, traceparent);
  }
  close() {
    return this.files.release();
  }
}
