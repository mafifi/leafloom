import { z } from 'zod';
export const CoverMetadata = z.object({
  id: z.string(),
  title: z.string(),
  author: z.string(),
  coverSeed: z.string().optional(),
});
export const CoverPresentation = z.object({
  url: z.string().startsWith('data:image/'),
  template: z.string(),
  lines: z.array(
    z.object({
      text: z.string(),
      small: z.boolean(),
      italic: z.boolean(),
      size: z.number().positive(),
    }),
  ),
  ink: z.object({ light: z.boolean(), scrim: z.boolean(), mean: z.number(), sd: z.number() }),
  authorInk: z.object({ light: z.boolean(), scrim: z.boolean(), mean: z.number(), sd: z.number() }),
  seed: z.string(),
  longAuthor: z.boolean(),
});
export type CoverMetadataValue = z.infer<typeof CoverMetadata>;
export type CoverPresentationValue = z.infer<typeof CoverPresentation>;
export interface CoverProvider {
  renderFull?(metadata: CoverMetadataValue): Promise<string>;
  render(metadata: CoverMetadataValue, image?: string): Promise<CoverPresentationValue>;
}
