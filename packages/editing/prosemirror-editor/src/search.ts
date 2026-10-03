import type {
  DarlingRow,
  DarlingSearchMatch,
  OutlineRow,
  OutlineSearchMatch,
  SearchMatch,
} from '@leafloom/editor-contracts';
import { importHTML, schema as htmlSchema } from './codec';
import type { PassageInfo } from './model';
export function findDarlings(
  document: Document,
  darlings: readonly DarlingRow[],
  query: string,
): DarlingSearchMatch[] {
  if (!query) return [];
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu'),
    matches: DarlingSearchMatch[] = [];
  for (const darling of darlings) {
    const model = darling.html
      ? importHTML(document, darling.html)
      : htmlSchema.nodes.doc.create(
          null,
          htmlSchema.nodes.paragraph.create(
            null,
            darling.text ? htmlSchema.text(darling.text) : undefined,
          ),
        );
    let runIndex = 0;
    model.descendants((node) => {
      const text = node.isText ? (node.text ?? '') : node.type.name === 'placeholder' ? '⚑' : null;
      if (text !== null) {
        for (const match of text.matchAll(pattern))
          matches.push({
            darlingId: darling.id,
            runIndex,
            from: match.index,
            to: match.index + match[0].length,
          });
        runIndex++;
      }
    });
  }
  return matches;
}
export function findOutline(rows: readonly OutlineRow[], query: string): OutlineSearchMatch[] {
  if (!query) return [];
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu'),
    matches: OutlineSearchMatch[] = [];
  for (const row of rows)
    if (row.kind !== 'part')
      for (const match of row.text.matchAll(pattern))
        matches.push({
          chapterId: row.chapterId,
          ...(row.sectionId ? { sectionId: row.sectionId } : {}),
          from: match.index,
          to: match.index + match[0].length,
        });
  return matches;
}
export function findPassages(
  query: string,
  passages: readonly Pick<PassageInfo, 'id' | 'chapterId' | 'node'>[],
  roleOf: (id: string) => string,
  scope: 'manuscript' | 'notes' | 'outline' | 'all' = 'manuscript',
): SearchMatch[] {
  if (!query) return [];
  const results: SearchMatch[] = [],
    pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
  for (const passage of passages) {
    if (
      scope !== 'all' &&
      (scope === 'manuscript'
        ? roleOf(passage.chapterId) !== 'chapter'
        : passage.chapterId !== scope)
    )
      continue;
    passage.node.descendants((node, offset) => {
      if (!node.isText) return;
      for (const match of node.text!.matchAll(pattern))
        results.push({
          chapterId: passage.chapterId,
          passageId: passage.id,
          from: offset + match.index,
          to: offset + match.index + match[0].length,
        });
    });
  }
  return results;
}
