import {
  DropTargetSchema,
  FilesDroppedSchema,
  type FilesDroppedValue,
} from '@leafloom/desktop-host';

/** Snapshot the visible destination before an asynchronous application command is queued. */
export function resolveExternalDrop(document: Document, raw: unknown): FilesDroppedValue {
  const { paths, position } = FilesDroppedSchema.parse(raw);
  const drop: FilesDroppedValue = position ? { paths, position } : { paths };
  if (!position) return drop;
  const hit = document.elementFromPoint(position.x, position.y);
  if (!hit?.isConnected || !hit.closest('#bookshelf-view')) return drop;
  const shelf = hit.closest('section.shelf[data-shelf-id]');
  if (!shelf) return drop;
  const book = hit.closest('button.book[data-book-id]:not(.page-tile)');
  drop.target = DropTargetSchema.parse(
    book && shelf.contains(book)
      ? { kind: 'book', bookId: book.getAttribute('data-book-id') }
      : { kind: 'shelf', shelfId: shelf.getAttribute('data-shelf-id') },
  );
  return drop;
}
