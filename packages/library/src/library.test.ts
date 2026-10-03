import { describe, it, expect } from 'vitest';
import {
  createLibrary,
  completeFirstRun,
  createShelf,
  moveBook,
  moveShelf,
  addAuthor,
  deleteAuthor,
  bindShelf,
  unbindShelf,
  deleteShelf,
} from './index';
describe('author library commands', () => {
  it('first run creates an author and shelf, with Anonymous fallback', () => {
    const l = completeFirstRun(createLibrary(), '  ');
    expect(l.firstRunDone).toBe(true);
    expect(l.authorName).toBe('Anonymous');
    expect(l.authors[0].name).toBe('Anonymous');
    expect(l.shelves[0].authorId).toBe(l.currentAuthorId);
  });
  it('shelf creation and cross-author book movement do not lose order or identity', () => {
    let l = completeFirstRun(createLibrary(), 'Writer');
    const first = l.shelves[0].id;
    l.shelves[0].bookIds = ['a', 'b'];
    l = addAuthor(l, 'Other');
    l = createShelf(l, 'Later');
    const second = l.shelves.at(-1)!.id;
    const next = moveBook(l, 'a', second, 0);
    expect(next.shelves.find((s) => s.id === first)!.bookIds).toEqual(['b']);
    expect(next.shelves.find((s) => s.id === second)!.bookIds).toEqual(['a']);
    expect(l.shelves.find((s) => s.id === first)!.bookIds).toEqual(['a', 'b']);
  });
  it('moving a shelf keeps author binding; deleting an author moves its shelves without deleting books', () => {
    let l = completeFirstRun(createLibrary(), 'Writer');
    l = createShelf(l, 'Second');
    l = moveShelf(l, l.shelves[1].id, 0);
    expect(l.shelves[0].name).toBe('Second');
    l.shelves[0].bookIds = ['a'];
    const first = l.currentAuthorId;
    l = addAuthor(l, 'Other');
    const next = deleteAuthor(l, first);
    expect(next.shelves.find((s) => s.bookIds.includes('a'))?.authorId).toBe(next.currentAuthorId);
    expect(next.shelves.length).toBe(3);
  });
  it('bound shelves retain original book ids when unbound', () => {
    let l = completeFirstRun(createLibrary(), 'Writer');
    l.shelves[0].bookIds = ['a', 'b'];
    l = bindShelf(l, l.shelves[0].id);
    expect(l.shelves[0].bound).toBe(true);
    const restored = unbindShelf(l, l.shelves[0].id);
    expect(restored.shelves[0].bound).toBe(false);
    expect(restored.shelves[0].bookIds).toEqual(['a', 'b']);
  });
  it('cannot accidentally duplicate a book across shelves or accept invalid target indexes', () => {
    const l = completeFirstRun(createLibrary(), 'Writer');
    l.shelves[0].bookIds = ['a'];
    expect(() => moveBook(l, 'a', 'missing', 0)).toThrow('NOT_FOUND');
    expect(() => moveShelf(l, l.shelves[0].id, 9)).toThrow('INVALID_TARGET');
  });
});

it('deleting a populated shelf relocates its books to another shelf of the same author', () => {
  let l = completeFirstRun(createLibrary(), 'Writer');
  const first = l.shelves[0].id;
  l.shelves[0].bookIds = ['a', 'b'];
  expect(() => deleteShelf(l, first)).toThrow('LAST_SHELF');
  l = createShelf(l, 'Other');
  const next = deleteShelf(l, first);
  expect(next.shelves[0].bookIds).toEqual(['a', 'b']);
  expect(l.shelves[0].bookIds).toEqual(['a', 'b']);
});
it('binding parks source page books in their exact body positions and restores without deleting', () => {
  let l = completeFirstRun(createLibrary(), 'Writer');
  const shelf = l.shelves[0].id;
  l.shelves[0].bookIds = ['cover', 'copyright', 'part', 'a', 'b', 'about'];
  const kinds = {
    cover: 'cover',
    copyright: 'copyright',
    part: 'part',
    a: 'novel',
    b: 'novel',
    about: 'about',
  };
  l = bindShelf(l, shelf);
  l = unbindShelf(l, shelf, kinds);
  expect(l.shelves[0].bookIds).toEqual(['a', 'b']);
  l = bindShelf(l, shelf);
  expect(l.shelves[0].bookIds).toEqual(['cover', 'copyright', 'part', 'a', 'b', 'about']);
});
