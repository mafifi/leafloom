// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { FilesDroppedSchema } from '../../packages/host/desktop-host/src/index';
import { resolveExternalDrop } from '../../apps/desktop/src/lib/external-drop';

function hit(element: Element | null) {
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: vi.fn(() => element),
  });
}

describe('native external drop target resolution', () => {
  it('snapshots the closed book tile under the logical client drop point', () => {
    document.body.innerHTML =
      '<div id="bookshelf-view"><section class="shelf" data-shelf-id="second-shelf"><button class="book" data-book-id="book-closed"><span id="ink">Closed title</span></button></section></div>';
    hit(document.querySelector('#ink'));
    const reply = resolveExternalDrop(document, {
      paths: ['/fixture/cover.png'],
      position: { x: 240, y: 120 },
    });
    expect(reply).toEqual({
      paths: ['/fixture/cover.png'],
      position: { x: 240, y: 120 },
      target: { kind: 'book', bookId: 'book-closed' },
    });
    document.querySelector('.book')!.setAttribute('data-book-id', 'book-other');
    expect(reply.target).toEqual({ kind: 'book', bookId: 'book-closed' });
    expect(document.elementFromPoint).toHaveBeenCalledWith(240, 120);
  });
  it('uses the intended shelf when the actual drop point is empty shelf space', () => {
    document.body.innerHTML =
      '<div id="bookshelf-view"><section class="shelf" data-shelf-id="second-shelf"><div id="row" class="shelf-books" data-shelf-id="second-shelf"></div></section></div>';
    hit(document.querySelector('#row'));
    expect(
      resolveExternalDrop(document, { paths: ['/fixture/story.txt'], position: { x: 480, y: 240 } })
        .target,
    ).toEqual({ kind: 'shelf', shelfId: 'second-shelf' });
  });
  it('does not invent an image book target for background, editor or a removed DOM target', () => {
    document.body.innerHTML =
      '<div id="bookshelf-view"></div><div id="editor-view" data-book-id="book-open"></div>';
    for (const element of [
      null,
      document.querySelector('#editor-view'),
      document.querySelector('#bookshelf-view'),
    ]) {
      hit(element);
      expect(
        resolveExternalDrop(document, { paths: ['/fixture/cover.png'], position: { x: 50, y: 50 } })
          .target,
      ).toBeUndefined();
    }
  });
  it('does not treat an ancillary page as a cover-image book target', () => {
    document.body.innerHTML =
      '<div id="bookshelf-view"><section class="shelf" data-shelf-id="second-shelf"><button class="book page-tile" data-book-id="book-dedication"><span id="page">Dedication</span></button></section></div>';
    hit(document.querySelector('#page'));
    expect(
      resolveExternalDrop(document, { paths: ['/fixture/cover.png'], position: { x: 50, y: 50 } })
        .target,
    ).toEqual({ kind: 'shelf', shelfId: 'second-shelf' });
  });
  it('validates malformed coordinates and targets before target resolution', () => {
    for (const position of [
      { x: NaN, y: 0 },
      { x: Infinity, y: 0 },
      { x: -1, y: 0 },
      { x: 1_000_001, y: 0 },
      { x: 1, y: 0, screen: true },
    ]) {
      expect(() =>
        resolveExternalDrop(document, { paths: ['/fixture/a.txt'], position }),
      ).toThrow();
    }
    for (const target of [
      { kind: 'book', bookId: '../escape' },
      { kind: 'shelf', shelfId: '' },
      { kind: 'window' },
      { kind: 'book', bookId: 'book-a', grant: true },
    ]) {
      expect(() => FilesDroppedSchema.parse({ paths: ['/fixture/a.txt'], target })).toThrow();
    }
  });
  it('keeps existing unpositioned drops without looking up a different book', () => {
    hit(document.querySelector('#editor-view'));
    expect(resolveExternalDrop(document, { paths: ['/fixture/a.txt'] })).toEqual({
      paths: ['/fixture/a.txt'],
    });
    expect(document.elementFromPoint).not.toHaveBeenCalled();
  });
});
