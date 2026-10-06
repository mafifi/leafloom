import { ScreenplayCodecError } from './screenplay-formats.ts';
import { ZodError } from 'zod';
import { LifecycleError } from '@leafloom/editor-contracts';
import { PDFExportError } from './pdf-glyphs.ts';
import { CoverProviderError } from './cover-art.ts';

/** Both development and packaged transports expose categories, never raw host messages. */
export function hostErrorCode(error: unknown): string {
  if (
    error instanceof ScreenplayCodecError ||
    error instanceof PDFExportError ||
    error instanceof CoverProviderError ||
    error instanceof LifecycleError
  )
    return error.code;
  if (error instanceof ZodError || (error instanceof Error && error.message === 'INVALID'))
    return 'INVALID';
  const code=(error as NodeJS.ErrnoException|null)?.code;
  if(code&&['EPERM','EACCES','EROFS'].includes(code))return 'WRITE_REFUSED';
  return code==='ENOSPC'?'DISK_FULL':'DISK_ERROR';
}
