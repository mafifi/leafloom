import type { Manuscript } from './contracts';
export function createFixture(): Manuscript {
  return { schemaVersion: 'neo-spike/v1', id: 'book-lighthouse', title: 'The Light Keeper', author: 'A. Writer', revision: 0, darlings: [], chapters: [
    { id: 'chapter-one', title: 'The arrival', blocks: [
      { id: 'opening', kind: 'paragraph', runs: [{ text: 'The lighthouse was quiet. ' }, { text: 'Too quiet.', italic: true }] },
      { id: 'weather', kind: 'paragraph', runs: [{ text: 'Beyond the glass, ' }, { text: 'the sea', bold: true }, { text: ' kept its own counsel.' }] },
      { id: 'promise', kind: 'paragraph', runs: [{ text: 'Mara had promised to leave before dawn.' }] }
    ] },
    { id: 'chapter-two', title: 'A promise', blocks: [
      { id: 'return', kind: 'paragraph', runs: [{ text: 'At sunrise, somebody knocked.' }] },
      { id: 'question', kind: 'paragraph', runs: [{ text: 'She knew the voice. She opened the door anyway.' }] }
    ] }
  ] };
}
