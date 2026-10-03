<script lang="ts">
  import { onDestroy } from 'svelte';
  import { shelfAutoScroll } from './lib/shelf-auto-scroll';
  import { translate } from '@leafloom/language-contracts';
  import { coverGoalProgress } from './lib/cover-goals';
  import { editableText } from './lib/editable-text';
  import {
    boundShelfLayout,
    coverInsertionIndex,
    type LibraryShelfProps,
    type ShelfBook,
  } from './lib/library-shelf';
  let { shelf, books, covers, actions, language, hover = true }: LibraryShelfProps = $props();
  const bound = $derived(Boolean(shelf.binding?.bound || shelf.bound));
  const tiles = $derived(boundShelfLayout(shelf, books, hover));
  const t = (key: string, args: Record<string, string | number> = {}) =>
    translate(language, key, args);
  const pageLabel = (kind: string | undefined, label: string) =>
    kind === 'part' ? t('Part {n}', { n: label.slice(5) }) : t(label);
  const spine = (label: string) =>
    label.length > 17 ? ' longer' : label.length > 12 ? ' long' : '';
  let indicator: HTMLDivElement | null = null;
  const removeIndicator = () => {
    indicator?.parentElement?.classList.remove('drag-over');
    indicator?.remove();
  };
  const dragOver = (event: DragEvent, row: HTMLElement) => {
    if (!event.dataTransfer?.types.includes('application/x-neo-book')) return;
    event.preventDefault();
    row.classList.add('drag-over');
    indicator ??= document.createElement('div');
    indicator.className = 'drop-indicator';
    const candidates = [...row.querySelectorAll<HTMLElement>('.book:not(.dragging)')];
    const index = coverInsertionIndex(
      candidates.map((tile) => tile.getBoundingClientRect()),
      event.clientX,
      event.clientY,
    );
    row.insertBefore(indicator, candidates[index] ?? row.querySelector('.new-book'));
  };
  const rowDrop = (event: DragEvent, row: HTMLElement) => {
    if (!event.dataTransfer?.types.includes('application/x-neo-book')) return;
    event.preventDefault();
    event.stopPropagation();
    let index: number | undefined;
    if (indicator?.parentElement === row) {
      index = 0;
      for (const child of row.children) {
        if (child === indicator) break;
        if (child.classList.contains('book') && !child.classList.contains('dragging')) index++;
      }
    }
    removeIndicator();
    actions.shelfDrop(event, index);
  };
  onDestroy(removeIndicator);
</script>

<svelte:window ondragend={removeIndicator} />

{#snippet coverTile(book: ShelfBook, collection = false)}
  {@const cover = covers[book.id]}
  {@const progress = coverGoalProgress(book, t)}
  <button
    class={(cover
      ? `book cv-${cover.template} ${cover.ink.light ? 'cv-light' : 'cv-dark'} ${cover.ink.scrim ? 'cv-scrim' : ''} ${cover.authorInk.light ? 'cv-au-light' : 'cv-au-dark'} ${cover.authorInk.scrim ? 'cv-au-scrim' : ''} ${cover.longAuthor ? 'cv-au-long' : ''}`
      : 'book') + (collection ? ' bound-cover' : '')}
    style={cover ? `background:#1d1d1d url("${cover.url}") center / cover no-repeat` : ''}
    title={progress.title}
    data-book-id={book.id}
    draggable={!collection}
    ondragstart={(event) => {
      if (!collection) {
        event.currentTarget.classList.add('dragging');
        actions.bookDrag(event, book);
      }
    }}
    ondragend={(event) => event.currentTarget.classList.remove('dragging')}
    onclick={() => (collection ? actions.openCover(book) : actions.openBook(book))}
    oncontextmenu={(event) => actions.bookMenu(event, book)}
  >
    <span class="b-text"
      ><span class="b-title"
        >{#if cover}{#each cover.lines as line}<span
              class="b-line"
              class:b-small={line.small}
              class:b-ital={line.italic}
              style={`font-size:${line.size.toFixed(1)}px`}>{line.text}</span
            >{/each}{:else}<span class="b-line">{collection ? shelf.name : book.title}</span
          >{/if}</span
      ><span class="b-author">{book.author}</span></span
    >
    <div class="b-progress" hidden={!progress.visible}>
      <div style:width={`${progress.percent}%`}></div>
    </div>
  </button>
{/snippet}
<section
  use:shelfAutoScroll
  class="shelf"
  class:bound
  data-shelf-id={shelf.id}
  aria-label={shelf.name}
  ondragover={(event) => event.preventDefault()}
  ondrop={(event) => {
    event.preventDefault();
    actions.shelfDrop(event);
  }}
>
  <span
    class="shelf-grip"
    draggable="true"
    role="button"
    tabindex="0"
    aria-label={t('Drag to reorder shelf')}
    ondragstart={actions.shelfDrag}>⠿</span
  >
  <div
    class="shelf-label"
    use:editableText={shelf.name}
    contenteditable="true"
    role="textbox"
    tabindex="0"
    aria-label={t('Shelf name')}
    spellcheck="false"
    onblur={(event) => {
      const value = event.currentTarget.textContent?.trim() || shelf.name;
      event.currentTarget.textContent = value;
      if (value !== shelf.name) actions.rename(value);
    }}
    onkeydown={(event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        event.currentTarget.blur();
      }
    }}
    oncontextmenu={actions.shelfMenu}
  ></div>
  <div
    class="shelf-books"
    role="group"
    aria-label={t('Books')}
    data-shelf-id={shelf.id}
    ondragover={(event) => dragOver(event, event.currentTarget)}
    ondragleave={(event) => {
      if (
        !(event.relatedTarget instanceof Node) ||
        !event.currentTarget.contains(event.relatedTarget)
      )
        removeIndicator();
    }}
    ondrop={(event) => rowDrop(event, event.currentTarget)}
  >
    {#each tiles as tile, index (index)}
      {#if tile.type === 'book'}{@render coverTile(tile.book)}
      {:else if tile.type === 'cover'}{@render coverTile(tile.book, true)}
      {:else if tile.type === 'page'}
        <button
          class={'book page-tile kind-' +
            tile.book.kind +
            spine(pageLabel(tile.book.kind, tile.label))}
          data-book-id={tile.book.id}
          draggable="false"
          title={pageLabel(tile.book.kind, tile.label)}
          onclick={() => actions.openPage(tile.book, pageLabel(tile.book.kind, tile.label))}
          oncontextmenu={(event) => {
            event.stopPropagation();
            actions.pageMenu(event, tile.book, pageLabel(tile.book.kind, tile.label));
          }}><span class="pt-label">{pageLabel(tile.book.kind, tile.label)}</span></button
        >
      {:else if tile.type === 'ghost'}
        <button
          type="button"
          class={'ghost-page' + spine(t(tile.label))}
          title={t(tile.label)}
          aria-label={t(tile.label)}
          onclick={() => actions.addPage(tile.kind)}
          ><span class="gp-plus" aria-hidden="true">+</span><span class="pt-label"
            >{t(tile.label)}</span
          ></button
        >
      {:else if tile.type === 'seam'}
        <button
          type="button"
          class="part-seam"
          title={t('Start a part here')}
          aria-label={t('Start a part here')}
          onclick={() => actions.addPage('part', tile.beforeId)}
          ><span class="ps-line"></span><span class="ps-plus">+</span></button
        >
      {:else}<button class="book new-book" aria-label={t('New book')} onclick={actions.newBook}
          ><span>＋</span></button
        >{/if}
    {/each}
  </div>
</section>
