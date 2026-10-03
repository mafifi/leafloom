import { z } from 'zod';
import { Fragment, Slice, type Node as PMNode } from 'prosemirror-model';
import { bookSchema, type Section } from './model';
import { inspectHTML } from './fidelity';
export const Darling = z
  .object({
    id: z.string(),
    html: z.string().nullish(),
    text: z.string().optional(),
    chapterId: z.string().nullish(),
    date: z.json().optional(),
    chapterLabel: z.json().optional(),
  })
  .passthrough();
export type DarlingValue = z.infer<typeof Darling> & {
  html: string;
  date?: string;
  chapterLabel?: string;
};
export function projectDarlings(records: unknown): DarlingValue[] {
  if (!Array.isArray(records)) throw Error('INVALID_DARLINGS');
  return records.flatMap((d) => {
    const parsed = Darling.safeParse(d);
    if (!parsed.success) return [];
    const date = parsed.data.date,
      time = typeof date === 'number' ? new Date(date) : null;
    return [
      {
        ...parsed.data,
        html: parsed.data.html ?? '',
        date:
          typeof date === 'string'
            ? date
            : time && !Number.isNaN(time.getTime())
              ? time.toISOString()
              : undefined,
        chapterLabel:
          typeof parsed.data.chapterLabel === 'string' ? parsed.data.chapterLabel : undefined,
      },
    ];
  });
}
export function locateDarlingContext(
  section: Section,
  prefix: string,
  suffix: string,
): number | null {
  const pieces: { start: number; end: number; position: number }[] = [],
    strings: string[] = [];
  let length = 0;
  section.node.descendants((node, position) => {
    const text = node.isText ? node.text! : node.type.name === 'placeholder' ? '⚑' : '';
    if (text) {
      strings.push(text);
      pieces.push({
        start: length,
        end: length + text.length,
        position: section.pos + 1 + position,
      });
      length += text.length;
    }
  });
  const text = strings.join('');
  let index = prefix + suffix ? text.indexOf(prefix + suffix) : -1;
  if (index !== -1) index += prefix.length;
  else if (prefix && (index = text.indexOf(prefix)) !== -1) index += prefix.length;
  else if (suffix) index = text.indexOf(suffix);
  if (index < 0) return null;
  const piece = pieces.find((piece) => index <= piece.end);
  return piece ? piece.position + Math.max(0, index - piece.start) : null;
}
export function parseRestorableDarling(
  document: Document,
  record: DarlingValue,
): { model: PMNode; slice: Slice } {
  const source =
      record.html ||
      '<p>' +
        String(record.text ?? '')
          .split(/\n+/)
          .map((line) => line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
          .join('</p><p>') +
        '</p>',
    parsed = inspectHTML(document, source);
  if (!parsed.supported) throw Error('UNSUPPORTED_TARGET');
  let slice: Slice;
  if (record.slice !== undefined) {
    const saved = z
      .strictObject({
        content: z.array(z.json()),
        openStart: z.number().int().nonnegative(),
        openEnd: z.number().int().nonnegative(),
      })
      .parse(record.slice);
    slice = new Slice(
      Fragment.fromArray(saved.content.map((node) => bookSchema.nodeFromJSON(node))),
      saved.openStart,
      saved.openEnd,
    );
  } else {
    const content = Fragment.fromArray(
      Array.from(parsed.model.content.content, (node) => bookSchema.nodeFromJSON(node.toJSON())),
    );
    slice =
      parsed.model.childCount === 1 && parsed.model.child(0).isTextblock
        ? new Slice(content.child(0).content, 0, 0)
        : new Slice(content, 1, 1);
  }
  return { model: parsed.model, slice };
}
