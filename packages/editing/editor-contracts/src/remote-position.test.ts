import { it, expect } from 'vitest';
import { parseRemotePosition, remotePositionEligibility } from './remote-position';
const chapter = { id: 'one', editable: true, passageIds: ['p-one'], paragraphCount: 2 };
const context = {
  hereAt: 100,
  lastActivity: 150,
  panel: 'manuscript',
  modalOpen: false,
  chapter,
  now: 1000,
};
it('validates remote bookmarks and prefers stable passage identity without accepting invalid offsets or timestamps', () => {
  expect(
    parseRemotePosition({ chapterId: 'one', passageId: 'p-one', from: 2, to: 2, at: 200 }),
  ).toMatchObject({ passageId: 'p-one' });
  expect(
    parseRemotePosition({ chapterId: 'one', pIdx: 1, off: 9, scroll: 400, at: 200 }),
  ).toMatchObject({ pIdx: 1 });
  expect(parseRemotePosition({ chapterId: 'one', scroll: 400, at: 200 })).toMatchObject({
    scroll: 400,
  });
  for (const invalid of [
    { chapterId: 'one', pIdx: -1, at: 200 },
    { chapterId: 'one', at: 200 },
    { chapterId: 'one', scroll: Infinity, at: 200 },
    { chapterId: 'one', passageId: 'p-one', from: 3, to: 2, at: 200 },
    { chapterId: 'one', pIdx: 0, at: NaN },
  ])
    expect(parseRemotePosition(invalid)).toBeNull();
});
it('requires a newer remote timestamp than local position and actual activity, manuscript ownership and existing chapter', () => {
  const position = parseRemotePosition({ chapterId: 'one', pIdx: 0, off: 0, at: 200 });
  expect(remotePositionEligibility({ ...context, position })).toBe('ready');
  for (const change of [
    { hereAt: 200 },
    { lastActivity: 200 },
    { panel: 'notes' },
    { modalOpen: true },
    { chapter: null },
    { chapter: { ...chapter, id: 'another' } },
  ])
    expect(remotePositionEligibility({ ...context, ...change, position })).toBe('ignore');
});
it('waits for the real paragraph or stable passage until strictly after the source120-second timeout', () => {
  for (const position of [
    parseRemotePosition({ chapterId: 'one', pIdx: 9, off: 99, at: 200 }),
    parseRemotePosition({ chapterId: 'one', passageId: 'pending', from: 9, to: 9, at: 200 }),
  ]) {
    expect(remotePositionEligibility({ ...context, position })).toBe('wait');
    expect(remotePositionEligibility({ ...context, position, now: 120200 })).toBe('wait');
    expect(remotePositionEligibility({ ...context, position, now: 120201 })).toBe('ready');
    expect(
      remotePositionEligibility({ ...context, position, now: 120201, lastActivity: 300 }),
    ).toBe('ignore');
  }
});
it('allows scroll-only or noneditable pages without inventing caret paragraph availability', () => {
  expect(
    remotePositionEligibility({
      ...context,
      position: parseRemotePosition({ chapterId: 'one', scroll: 400, at: 200 }),
    }),
  ).toBe('ready');
  expect(
    remotePositionEligibility({
      ...context,
      chapter: { ...chapter, editable: false, paragraphCount: 0, passageIds: [] },
      position: parseRemotePosition({ chapterId: 'one', scroll: 400, at: 200 }),
    }),
  ).toBe('ready');
});
it('uses supplemental legacy arrival when a stable identity has not crossed and noneditable positions use raw scroll', () => {
  const position = parseRemotePosition({
    chapterId: 'one',
    passageId: 'pending',
    from: 9,
    to: 9,
    pIdx: 1,
    off: 9,
    at: 200,
  });
  expect(remotePositionEligibility({ ...context, position })).toBe('ready');
  expect(
    remotePositionEligibility({
      ...context,
      chapter: { ...chapter, editable: false, paragraphCount: 0, passageIds: [] },
      position,
    }),
  ).toBe('ready');
});
