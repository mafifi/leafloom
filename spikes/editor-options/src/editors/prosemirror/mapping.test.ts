import { describe, expect, it } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { createFixture } from '../../fixture';
import { fromEngine, fromSelection, toEngine, toSelection } from './mapping';

describe('ProseMirror canonical mapping', () => {
  it('round trips all chapters, IDs, block kinds and placeholder marks', () => {
    const document = createFixture();
    document.chapters[0].blocks.push(
      { id: 'poem', kind: 'poetry', runs: [{ text: 'A wave\nA light', bold: true, italic: true, placeholder: 'wave-note' }] },
      { id: 'scene', kind: 'scene-break', runs: [] },
    );
    expect(fromEngine(toEngine(document), document)).toEqual(document);
  });

  it('maps offsets in the second chapter and clamps obsolete offsets', () => {
    const doc = toEngine(createFixture());
    const selection = { chapterId: 'chapter-two', blockId: 'question', from: 4, to: 18 };
    const mapped = toSelection(doc, selection);
    expect(mapped).not.toBeNull();
    expect(fromSelection(mapped!)).toEqual(selection);
    const clamped = toSelection(doc, { ...selection, from: -1, to: 1000 });
    expect(fromSelection(clamped!)).toEqual({ ...selection, from: 0, to: 47 });
  });

  it('reports cross-block engine selections as null instead of inventing a range', () => {
    const doc = toEngine(createFixture());
    const first = toSelection(doc, { chapterId: 'chapter-one', blockId: 'opening', from: 1, to: 1 })!;
    const second = toSelection(doc, { chapterId: 'chapter-one', blockId: 'weather', from: 2, to: 2 })!;
    expect(fromSelection(TextSelection.create(doc, first.from, second.to))).toBeNull();
  });
});
