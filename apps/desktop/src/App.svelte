<script lang="ts">
  import { dialogFocus } from './lib/dialog-focus';
  import Goals from './Goals.svelte';
  import PopupMenu from './PopupMenu.svelte';
  import CoverArt from './CoverArt.svelte';
  import EmailSettings from './EmailSettings.svelte';
  import FontPicker from './FontPicker.svelte';
  import Information from './Information.svelte';
  import LibrarySettings from './LibrarySettings.svelte';
  import LibraryShelf from './LibraryShelf.svelte';
  import PublicationPage from './PublicationPage.svelte';
  import type { ShelfValue } from '@leafloom/library';
  import type { ShelfBook, LibraryShelfActions } from './lib/library-shelf';
  import { translate } from '@leafloom/language-contracts';
  import { editableText, focusInput } from './lib/editable-text';
  import { bodyFonts, dropcaps } from './lib/presentation';
  import type { AppActions, AppState } from './lib/application';
  import type { Readable } from 'svelte/store';
  let { presentation, actions: vm }: { presentation: Readable<AppState>; actions: AppActions } =
    $props();
  const app = $derived(presentation);
  let step = $state(1);
  let pen = $state('');
  let pickedBody = $state('Georgia');
  let pickedCap = $state('literary');
  let name = $state('');
  let style = $state<'pantser' | 'plotter'>('pantser');
  let replace = $state('');
  let dragged = $state('');
  let draggedShelf = $state('');
  let draggedChapter = $state('');
  let chapterDropIndex = $state<number | null>(null);
  let nearChapterGap = $state<number | null>(null);
  const chapterGapNear = (event: PointerEvent) => {
    if (draggedChapter || event.buttons) return;
    const gaps = Array.from(
      (event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('.nav-gap'),
    );
    const distances = gaps.map((gap) => Math.abs(event.clientY - gap.getBoundingClientRect().top));
    const nearest = distances.indexOf(Math.min(...distances));
    nearChapterGap = nearest >= 0 && distances[nearest] < 9 ? nearest : null;
  };
  const chapterDropBefore = $derived(
    chapterDropIndex === null
      ? null
      : ($app.chapters.filter((chapter) => chapter.id !== draggedChapter)[chapterDropIndex]?.id ??
          'end'),
  );
  const finishChapterDrag = () => {
    draggedChapter = '';
    chapterDropIndex = null;
  };
  const chapterDragOver = (event: DragEvent) => {
    if (
      !draggedChapter ||
      $app.readOnly ||
      !event.dataTransfer?.types.includes('application/x-neo-chapter')
    )
      return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const rows = Array.from(
      (event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('.nav-item'),
    ).filter((row) => row.dataset.chid !== draggedChapter);
    const before = rows.findIndex((row) => {
      const bounds = row.getBoundingClientRect();
      return event.clientY < bounds.top + bounds.height / 2;
    });
    chapterDropIndex = before < 0 ? rows.length : before;
  };
  const chapterDrop = (event: DragEvent) => {
    const id = event.dataTransfer?.getData('application/x-neo-chapter');
    if (!id || id !== draggedChapter || chapterDropIndex === null || $app.readOnly) {
      finishChapterDrag();
      return;
    }
    event.preventDefault();
    const index = chapterDropIndex;
    finishChapterDrag();
    run(() => vm.reorderChapter(id, index));
  };
  let penRack = $state(false);
  const t = (key: string, args: Record<string, string | number> = {}) =>
    translate($app.language, key, args);
  const flaggedChapters = $derived(
    new Set($app.stickies.filter((note) => !note.resolved).map((note) => note.chapterId)),
  );
  const storyKinds = ['chapter', 'unnumbered', 'prologue', 'epilogue'];
  const storyEntries = $derived(
    $app.chapters.filter((row) => storyKinds.includes(row.kind) || row.kind === 'part'),
  );
  const soloChapter = $derived(
    storyEntries.length === 1 && storyEntries[0].kind === 'chapter' ? storyEntries[0].id : null,
  );
  const tabLabel = (tab: string) => {
    const names = $app.book?.tabNames;
    const name =
      names && typeof names === 'object' && !Array.isArray(names) ? names[tab] : undefined;
    return typeof name === 'string' ? name : t(tab[0].toUpperCase() + tab.slice(1));
  };
  const run = (command: () => void | Promise<void>) => void vm.execute(command);
  const stringRecord = (value: unknown): Record<string, string> | undefined => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const result: Record<string, string> = {};
    for (const [key, entry] of Object.entries(value))
      if (typeof entry === 'string') result[key] = entry;
    return result;
  };
  const shelfBooks: ShelfBook[] = $derived(
    $app.books.map((book) => ({
      id: book.id,
      title: book.title,
      author: book.author,
      ...(typeof book.kind === 'string' ? { kind: book.kind } : {}),
      ...(typeof book.wordCount === 'number' && Number.isFinite(book.wordCount)
        ? { wordCount: book.wordCount }
        : {}),
      ...(typeof book.wordGoal === 'number' && Number.isFinite(book.wordGoal)
        ? { wordGoal: book.wordGoal }
        : {}),
      ...(typeof book.coverImage === 'string' ? { coverImage: book.coverImage } : {}),
      chapterKinds: stringRecord(book.chapterKinds),
      chapterOrder: Array.isArray(book.chapterOrder)
        ? book.chapterOrder.filter((id): id is string => typeof id === 'string')
        : undefined,
    })),
  );
  const shelfActions = (shelf: ShelfValue): LibraryShelfActions => ({
    rename: (name) => void vm.execute(() => vm.renameShelf(shelf.id, name), { closeMenu: false }),
    shelfDrag: (event) => {
      draggedShelf = shelf.id;
      event.dataTransfer?.setData('application/x-neo-shelf', shelf.id);
      event.dataTransfer?.setData('text/plain', shelf.id);
    },
    shelfDrop: (event, index) => {
      draggedShelf = event.dataTransfer?.getData('application/x-neo-shelf') || draggedShelf;
      dragged = event.dataTransfer?.getData('application/x-neo-book') || dragged;
      if (draggedShelf) run(() => vm.moveShelf(draggedShelf, $app.library.shelves.indexOf(shelf)));
      else if (dragged) run(() => vm.moveBook(dragged, shelf.id, index));
      draggedShelf = '';
      dragged = '';
    },
    bookDrag: (event, book) => {
      dragged = book.id;
      event.dataTransfer?.setData('application/x-neo-book', book.id);
      event.dataTransfer?.setData('text/plain', book.id);
    },
    openBook: (book) => run(() => vm.openBook(book.id)),
    openPage: (book, label) => run(() => vm.openPublicationPage(book.id, label, shelf.id)),
    openCover: (book) => run(() => vm.openPublicationPage(book.id, undefined, shelf.id)),
    addPage: (kind, beforeId) => run(() => vm.addBoundPage(shelf.id, kind, beforeId)),
    newBook: () => run(() => vm.newBook(shelf.id)),
    pageMenu: (event, book, label) =>
      vm.menu(event, [
        { label: 'Open', run: () => vm.openPublicationPage(book.id, label, shelf.id) },
        { label: 'Remove page', run: () => vm.deleteBook(book.id) },
      ]),
    bookMenu: (event, book) =>
      vm.menu(
        event,
        book.kind === 'cover'
          ? [
              {
                label: book.coverImage ? 'Replace cover art…' : 'Set cover art…',
                run: () => vm.setCover(book.id),
              },
              ...(book.coverImage
                ? [{ label: 'Remove cover art', danger: true, run: () => vm.removeCover(book.id) }]
                : []),
              { label: 'New cover', run: () => vm.regenerateCover(book.id) },
              { label: 'Export the book…', run: () => vm.exportBoundBook(shelf.id) },
              { label: 'Unbind', run: () => vm.bindShelf(shelf.id, false) },
            ]
          : [
              { label: 'Open', run: () => vm.openBook(book.id) },
              { label: 'Show book folder', run: () => vm.showBookFolder(book.id) },
              { label: 'Rename…', run: () => vm.renameBook(book.id) },
              ...$app.library.authors
                .filter((author) => author.id !== shelf.authorId)
                .map((author) => ({
                  label: 'Move to ' + author.name,
                  localize: false,
                  run: () => vm.moveToAuthor(book.id, author.id),
                })),
              { label: 'New cover', run: () => vm.openCoverChoices(book.id) },
              {
                label: book.coverImage ? 'Replace cover art…' : 'Set cover art…',
                run: () => vm.setCover(book.id),
              },
              ...(book.coverImage
                ? [{ label: 'Remove cover art', danger: true, run: () => vm.removeCover(book.id) }]
                : []),
              { label: 'Set word goal…', run: () => vm.setCoverGoal(book.id) },
              { label: 'Remove from bookshelf', run: () => vm.removeFromShelf(book.id) },
              { label: 'Delete book…', run: () => vm.deleteBook(book.id) },
            ],
      ),
    shelfMenu: (event) =>
      vm.menu(event, [
        { label: 'Rename shelf…', run: () => vm.renameShelf(shelf.id) },
        {
          label: shelf.binding?.bound || shelf.bound ? 'Unbind shelf' : 'Bind shelf',
          run: () => vm.bindShelf(shelf.id, !(shelf.binding?.bound || shelf.bound)),
        },
        ...(shelf.binding?.bound
          ? [
              'copyright',
              'dedication',
              'epigraph',
              'prologue',
              'part',
              'epilogue',
              'acknowledgments',
              'about',
            ].map((kind) => ({ label: 'Add ' + kind, run: () => vm.addBoundPage(shelf.id, kind) }))
          : []),
        {
          label: 'Move shelf up',
          run: () => vm.moveShelf(shelf.id, Math.max(0, $app.library.shelves.indexOf(shelf) - 1)),
        },
        {
          label: 'Move shelf down',
          run: () =>
            vm.moveShelf(
              shelf.id,
              Math.min($app.library.shelves.length - 1, $app.library.shelves.indexOf(shelf) + 1),
            ),
        },
        {
          label:
            shelf.binding?.bound || shelf.bound ? 'Export the book…' : 'Export shelf as anthology…',
          run: () =>
            shelf.binding?.bound || shelf.bound
              ? vm.exportBoundBook(shelf.id)
              : vm.exportShelfAnthology(shelf.id),
        },
        ...(shelf.binding?.bound
          ? [
              {
                label:
                  shelf.binding.numbering === 'restart'
                    ? 'Number chapters continuously'
                    : 'Restart chapter numbers for each book',
                run: () => vm.shelfNumbering(shelf.id),
              },
            ]
          : []),
        { label: 'Delete shelf', run: () => vm.deleteShelf(shelf.id) },
      ]),
  });
</script>

<svelte:document onkeydowncapture={(event) => vm.fieldTypographyKey(event)} />
<svelte:window
  ondragend={() => {
    penRack = false;
    dragged = '';
    draggedShelf = '';
  }}
  onkeydown={(event) => vm.key(event)}
  onclick={() => vm.dismissMenu()}
/>
{#if $app.loading}<div class="loading">{t('Opening Leafloom…')}</div>
{:else if $app.view === 'library'}
  <div id="bookshelf-view">
    <header id="shelf-header">
      <h1>{t('LEAFLOOM')}</h1>
      <button
        id="author-chip"
        ondragenter={(event) => {
          if (dragged || event.dataTransfer?.types.includes('application/x-neo-book')) {
            event.preventDefault();
            penRack = true;
          }
        }}
        ondragover={(event) => event.preventDefault()}
        onclick={(event) =>
          vm.menu(event, [
            ...$app.library.authors.map((author) => ({
              label: author.name,
              localize: false,
              run: () => vm.chooseAuthor(author.id),
            })),
            { label: 'New author…', run: () => vm.newAuthor() },
            { label: 'Rename author…', run: () => vm.renameAuthor($app.library.currentAuthorId) },
            { label: 'Delete author', run: () => vm.deleteAuthor($app.library.currentAuthorId) },
          ])}
        >{$app.library.authors.find((a) => a.id === $app.library.currentAuthorId)?.name ??
          'Anonymous'}</button
      >
      <div class="shelf-actions">
        {#if !$app.nativeMenus}<button id="file-menu" onclick={(event) => vm.fileMenu(event)}
            >{t('File')}</button
          >{/if}
        <button id="import-btn" onclick={() => run(() => vm.importBooks())}>{t('Import')}</button
        ><button id="add-shelf-btn" onclick={() => run(() => vm.newShelf())}
          >{t('New Shelf')}</button
        >
      </div>
    </header>
    {#if penRack}<div
        id="pen-rack"
        class="open"
        style="top:64px;right:24px;"
        role="group"
        aria-label="Move book to another author"
      >
        {#each $app.library.authors.filter((a) => a.id !== $app.library.currentAuthorId) as author}<button
            class="pen-slot"
            data-author-id={author.id}
            ondragover={(event) => event.preventDefault()}
            ondrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const id = event.dataTransfer?.getData('application/x-neo-book') || dragged;
              penRack = false;
              if (id) run(() => vm.moveToAuthor(id, author.id));
              dragged = '';
            }}>{author.name}</button
          >{/each}
      </div>{/if}
    <main id="shelves">
      {#each $app.library.shelves.filter((s) => s.authorId === $app.library.currentAuthorId) as shelf (shelf.id)}
        <LibraryShelf
          {shelf}
          books={shelfBooks}
          covers={$app.covers}
          language={$app.language}
          actions={shelfActions(shelf)}
        />
      {/each}
    </main>
  </div>
  {#if !$app.library.firstRunDone}
    <div id="firstrun" class="modal-backdrop">
      <div class="modal">
        <div id="fr-step1" hidden={step !== 1}>
          <h2>{t('Welcome to Leafloom')}</h2>
          <p>{t('A few quick questions, then the page is yours.')}</p>
          <label
            >{t('Your name')}<input
              id="fr-name"
              placeholder={t('Anonymous')}
              bind:value={name}
            /></label
          ><label
            >{t('Pen name')}<span class="soft">(optional)</span><input
              id="fr-pen"
              bind:value={pen}
            /></label
          >
          <div class="fr-style">
            <p>{t('Are you a pantser or a plotter?')}</p>
            <div class="fr-choices">
              <button
                class="fr-choice"
                data-style="pantser"
                onclick={() => {
                  style = 'pantser';
                  step = 2;
                }}
                ><strong>{t('Pantser')}</strong><span>{t('I discover the story as I write.')}</span
                ></button
              ><button
                class="fr-choice"
                data-style="plotter"
                onclick={() => {
                  style = 'plotter';
                  step = 2;
                }}><strong>{t('Plotter')}</strong><span>{t('I outline first.')}</span></button
              >
            </div>
          </div>
        </div>
        <div id="fr-step2" hidden={step !== 2}>
          <h2>{t('How should the page look?')}</h2>
          <p>{t('Pick a typeface and a drop-cap style.')}</p>
          <div
            id="fr-sample"
            style={`--body-font:${bodyFonts[pickedBody]};--dropcap-font:${dropcaps[pickedCap]}`}
          >
            <p id="fr-sample-text">
              It was the best of times, it was the worst of times, it was the age of wisdom, it was
              the age of foolishness…
            </p>
          </div>
          <p>{t('Body typeface')}</p>
          <div id="fr-bodyfonts" class="fr-fontrow">
            {#each ['Georgia', 'Palatino', 'Baskerville', 'Hoefler Text', 'Iowan Old Style', 'Jost'] as font}<button
                class="fr-font"
                class:sel={font === pickedBody}
                style={`font-family:${bodyFonts[font]}`}
                onclick={() => (pickedBody = font)}>{font}</button
              >{/each}
          </div>
          <p>{t('Drop cap')}</p>
          <div id="fr-dropcaps" class="fr-fontrow">
            {#each ['literary', 'fantasy', 'scifi'] as cap}<button
                class="fr-font"
                class:sel={cap === pickedCap}
                onclick={() => (pickedCap = cap)}
                ><span class="fr-cap" style={`font-family:${dropcaps[cap]}`}>{t('A')}</span>{cap ===
                'scifi'
                  ? 'Sci-Fi'
                  : cap[0].toUpperCase() + cap.slice(1)}</button
              >{/each}
          </div>
          <div style="text-align:right;margin-top:20px">
            <button
              id="fr-done"
              class="btn-gold"
              onclick={() =>
                run(() => vm.onboard(name, style, pen, { body: pickedBody, dropcap: pickedCap }))}
              >{t('Start writing')}</button
            >
          </div>
        </div>
      </div>
    </div>
  {/if}
{:else}
  <div id="editor-view" class:nav-pinned={$app.navPinned} class:side-pinned={$app.sidePinned}>
    <div id="nav-hotzone" role="presentation" onpointerenter={() => vm.showNav(true)}></div>
    <aside
      id="nav-pane"
      class:open={$app.navOpen || $app.navPinned}
      onpointermove={chapterGapNear}
      onpointerleave={() => {
        nearChapterGap = null;
        vm.showNav(false);
      }}
    >
      <button id="nav-pin" aria-pressed={$app.navPinned} onclick={() => vm.toggleNav()}
        >{t('Pin chapters')}</button
      >
      <nav
        id="nav-list"
        ondragover={chapterDragOver}
        ondrop={chapterDrop}
        ondragleave={(event) => {
          if (
            !(event.relatedTarget instanceof Node) ||
            !event.currentTarget.contains(event.relatedTarget)
          )
            chapterDropIndex = null;
        }}
      >
        {#each $app.chapters as chapter, index (chapter.id)}
          <div class="nav-gap" class:near={nearChapterGap === index}>
            <button
              class="ng-plus"
              tabindex="-1"
              aria-label={t('Add')}
              disabled={$app.readOnly}
              onclick={(event) => vm.menu(event, vm.chapterInsertionContext(index))}
              oncontextmenu={(event) => vm.menu(event, vm.chapterInsertionContext(index))}>+</button
            >
          </div>
          {#if chapterDropBefore === chapter.id}<div class="nav-drop-ind"></div>{/if}
          {@const outline = $app.outlineRows.find(
            (row) => row.chapterId === chapter.id && row.kind === 'chapter',
          )}
          <div
            class="nav-item"
            class:current={$app.currentChapter === chapter.id}
            class:dragging={draggedChapter === chapter.id}
            data-chid={chapter.id}
            data-ch-id={chapter.id}
            oncontextmenu={(event) => vm.menu(event, vm.chapterContext(chapter.id, index))}
            role="group"
          >
            <button
              class="nav-title n-row"
              draggable={!$app.readOnly}
              ondragstart={(event) => {
                if ($app.readOnly || !event.dataTransfer) {
                  event.preventDefault();
                  return;
                }
                draggedChapter = chapter.id;
                chapterDropIndex = null;
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('application/x-neo-chapter', chapter.id);
                vm.showNav(true);
              }}
              ondragend={finishChapterDrag}
              onkeydown={(event) => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  const rows = Array.from(
                    document.querySelectorAll<HTMLButtonElement>('#nav-list .nav-title'),
                  );
                  rows[index + (event.key === 'ArrowDown' ? 1 : -1)]?.focus();
                }
              }}
              onclick={() => vm.focusChapter(chapter.id)}
              >{chapter.title || chapter.label}{#if flaggedChapters.has(chapter.id)}<span
                  class="n-flag"
                  role="img"
                  aria-label="Unresolved margin note"
                ></span>{/if}</button
            >
            {#if outline}<div
                class="nav-note"
                use:editableText={outline.text}
                contenteditable={!$app.readOnly}
                role="textbox"
                tabindex="0"
                aria-label="Chapter note"
                onblur={(event) =>
                  vm.editOutline({ chapterId: chapter.id }, event.currentTarget.textContent ?? '')}
                onkeydown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
              ></div>{/if}
          </div>
        {/each}
        {#if chapterDropBefore === 'end'}<div class="nav-drop-ind"></div>{/if}
        <div class="nav-gap" class:near={nearChapterGap === $app.chapters.length}>
          <button
            class="ng-plus"
            tabindex="-1"
            aria-label={t('Add')}
            disabled={$app.readOnly}
            onclick={(event) => vm.menu(event, vm.chapterInsertionContext($app.chapters.length))}
            oncontextmenu={(event) =>
              vm.menu(event, vm.chapterInsertionContext($app.chapters.length))}>+</button
          >
        </div>
      </nav>
      <button id="nav-add" onclick={() => vm.createChapter()}>＋ Chapter</button>
    </aside>
    <div id="side-hotzone" role="presentation" onpointerenter={() => vm.showSide(true)}></div>
    <aside
      id="side-pane"
      class:open={$app.sideOpen || $app.sidePinned}
      onpointerleave={() => vm.showSide(false)}
    >
      <button id="side-pin" aria-pressed={$app.sidePinned} onclick={() => vm.toggleSide()}
        >{t('Pin notes')}</button
      >
      <div id="sticky-list">
        {#each $app.stickies.filter((sticky) => !sticky.resolved) as sticky (sticky.id)}<div
            class="sticky"
            class:unresolved={!sticky.resolved}
            data-sticky-id={sticky.id}
          >
            <button class="s-ch" onclick={() => vm.selectSticky(sticky.id)}
              >{t('Go to passage')}</button
            ><textarea
              value={sticky.text}
              oninput={(event) => vm.updateSticky(sticky.id, event.currentTarget.value)}
              onkeydown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  run(() => vm.selectSticky(sticky.id));
                }
              }}
              aria-label="Margin note"></textarea>
            <div class="s-actions">
              <button onclick={() => vm.resolveSticky(sticky.id, !sticky.resolved)}
                >{t('Resolve')}</button
              ><button onclick={() => vm.removeSticky(sticky.id)}>{t('Delete')}</button>
            </div>
          </div>{/each}
      </div>
    </aside>
    <div id="searchbar" hidden={!$app.searchOpen}>
      <input
        id="search-input"
        onkeydown={(event) => vm.searchKey(event)}
        placeholder={t('Find')}
        value={$app.search}
        oninput={(event) => vm.search(event.currentTarget.value)}
      /><span id="search-count"
        >{$app.searchedQuery
          ? $app.matches.length
            ? $app.matchIndex < 0
              ? `${$app.matches.length} found`
              : `${$app.matchIndex + 1} of ${$app.matches.length}`
            : 'none'
          : ''}</span
      ><button id="search-prev" onclick={() => vm.nextMatch(-1)}>↑</button><button
        id="search-next"
        onclick={() => vm.nextMatch(1)}>↓</button
      ><input
        id="replace-input"
        hidden={$app.panel !== 'manuscript'}
        onkeydown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            vm.replace(replace);
          }
        }}
        placeholder={t('Replace')}
        bind:value={replace}
      /><button
        hidden={$app.panel !== 'manuscript'}
        id="replace-one"
        onclick={() => vm.replace(replace)}>{t('Replace')}</button
      ><button
        id="replace-all"
        hidden={$app.panel !== 'manuscript'}
        onclick={() => vm.replace(replace, true)}>{t('All')}</button
      ><button id="search-close" onclick={() => vm.closeSearch()}>×</button>
    </div>
    {#if $app.externalChange}<div class="external-change" role="alert">
        This book changed on disk. Your unsaved writing remains here.
        <button onclick={() => run(() => vm.keepExternalCopy())}
          >{t('Keep my writing in a separate book')}</button
        >
        <button onclick={() => run(() => vm.reloadExternal())}>{t('Reload from disk')}</button>
      </div>{/if}
    <main
      onscroll={() => vm.trackVisibleChapter()}
      id="paper-scroll"
      style={`--page-zoom:${$app.zoom}`}
    >
      <div id="paper" hidden={$app.panel !== 'manuscript'}>
        <section id="title-page" class="sheet">
          <div
            id="tp-title"
            use:editableText={$app.book?.title === 'Untitled' ? '' : $app.book?.title}
            data-ph="Untitled"
            contenteditable={!$app.readOnly}
            role="textbox"
            tabindex="0"
            aria-label="Title"
            oninput={(event) =>
              vm.editMetadataField('title', event.currentTarget.textContent ?? '')}
            onblur={() => vm.finishMetadataField('title')}
            onkeydown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                vm.enterTitlePage();
              }
            }}
          ></div>
          <div
            id="tp-subtitle"
            use:editableText={String($app.book?.subtitle ?? '')}
            contenteditable={!$app.readOnly}
            role="textbox"
            tabindex="0"
            aria-label="Subtitle"
            oninput={(event) =>
              vm.editMetadataField('subtitle', event.currentTarget.textContent ?? '')}
            onblur={() => vm.finishMetadataField('subtitle')}
            onkeydown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                vm.enterTitlePage();
              }
            }}
          ></div>
          <div
            id="tp-author"
            use:editableText={$app.book?.author}
            contenteditable={!$app.readOnly}
            role="textbox"
            tabindex="0"
            aria-label="Author"
            oninput={(event) =>
              vm.editMetadataField('author', event.currentTarget.textContent ?? '')}
            onblur={() => vm.finishMetadataField('author')}
          ></div>
        </section>
        <div id="chapters">
          {#each $app.chapters as chapter, index (chapter.id)}<section
              class={`chapter sheet kind-${chapter.kind}`}
              class:bookpage={!storyKinds.includes(chapter.kind)}
              class:solo={soloChapter === chapter.id}
              data-chid={chapter.id}
            >
              <header
                class="chapter-head"
                class:no-number={chapter.kind === 'unnumbered'}
                class:has-title={Boolean(chapter.title)}
              >
                <span class="ch-num">{t(chapter.label)}</span>
                {#if storyKinds.includes(chapter.kind)}<span class="ch-sep" aria-hidden="true"
                    >—</span
                  ><span
                    class="ch-title"
                    use:editableText={chapter.title}
                    contenteditable={!$app.readOnly}
                    role="textbox"
                    tabindex="0"
                    aria-label="Chapter title"
                    onblur={(event) =>
                      vm.renameChapter(chapter.id, event.currentTarget.textContent ?? '')}
                    onkeydown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        if (event.shiftKey) vm.openingPoetry(chapter.id);
                        else {
                          event.currentTarget.blur();
                          event.stopPropagation();
                        }
                      }
                    }}
                  ></span>{/if}
              </header>
              <div
                class="chapter-body"
                data-chid={chapter.id}
                hidden={chapter.kind === 'contents'}
              ></div>
              {#if chapter.kind === 'contents'}<ul class="toc-list">
                  {#each $app.contentsRows as row}<li
                      class={`t-${row.type}`}
                      class:lv1={row.level === 1}
                    >
                      <button onclick={() => vm.focusChapter(row.chapterId)}>{row.label}</button>
                    </li>{/each}
                </ul>{/if}
            </section>{/each}
        </div>
        <button class="add-chapter" onclick={() => vm.createChapter()}>{t('Add chapter')}</button>
      </div>
      <div id="aux-paper" class="sheet" hidden={$app.panel === 'manuscript'}>
        <h1 id="aux-title">{tabLabel($app.panel)}</h1>
        <div id="aux-editor" hidden={$app.panel !== 'notes'}></div>
        <div id="outline-list" hidden={$app.panel !== 'outline'}>
          {#each $app.outlineRows as row (`${row.chapterId}:${row.sectionId ?? ''}`)}
            <div
              class={`ol-line ol-${row.kind}`}
              data-ch-id={row.chapterId}
              data-sec-id={row.sectionId}
              oncontextmenu={(event) => vm.menu(event, vm.outlineContext(row))}
              role="group"
            >
              <span class="ol-num">{row.label}</span>
              {#if row.kind === 'part'}<div class="ol-part-name">{row.text}</div>
              {:else}<div
                  class="ol-text"
                  use:editableText={row.text}
                  contenteditable={!$app.readOnly}
                  role="textbox"
                  tabindex="0"
                  aria-label={row.kind === 'chapter' ? 'Chapter outline' : 'Section outline'}
                  spellcheck="false"
                  onblur={(event) => vm.editOutline(row, event.currentTarget.textContent ?? '')}
                  onkeydown={(event) => vm.outlineKey(row, event)}
                ></div>{/if}
            </div>
          {/each}
          <div class="ol-hint">
            Enter — new chapter or section · Tab — turn a fresh chapter into a section · Shift+Tab —
            turn a section into a chapter · Backspace removes an empty line
          </div>
        </div>
        <div id="darlings-list" hidden={$app.panel !== 'darlings'}>
          {#if !$app.darlings.length}<p class="darlings-empty">
              Select a passage in the manuscript and save it to Darlings.
            </p>{/if}
          {#each $app.darlings as darling (darling.id)}<article
              class="darling"
              data-darling-id={darling.id}
            >
              <div class="darling-text" tabindex="-1">{@html darling.preview}</div>
              <div class="darling-meta">
                {darling.chapterLabel ?? 'Manuscript'}{darling.date
                  ? ' · ' + new Date(darling.date).toLocaleDateString()
                  : ''}
              </div>
              <button onclick={() => vm.restore(darling.id)}>{t('Restore')}</button><button
                onclick={() => run(() => vm.removeDarling(darling.id))}>{t('Delete')}</button
              >
            </article>{/each}
        </div>
      </div>
    </main>
    <footer id="bottombar">
      <button id="back-to-shelf" onclick={() => run(() => vm.closeBook())}>← Library</button>
      <div id="tabs" role="tablist" aria-label="Book sections">
        {#each ['manuscript', 'notes', 'outline', 'darlings'] as tab}<button
            class="tab"
            role="tab"
            aria-selected={$app.panel === tab}
            onkeydown={(event) => {
              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault();
                const tabs = ['manuscript', 'notes', 'outline', 'darlings'];
                const next = tabs[(tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : 3)) % 4];
                document.querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)?.focus();
              }
            }}
            class:active={$app.panel === tab}
            data-tab={tab}
            ondragover={(event) => {
              if (tab === 'darlings') event.preventDefault();
            }}
            ondrop={(event) => {
              if (tab === 'darlings') {
                event.preventDefault();
                event.stopPropagation();
                vm.archiveDropped();
              }
            }}
            onclick={() => vm.setPanel(tab)}
            ondblclick={() => {
              if (tab === 'notes' || tab === 'outline') run(() => vm.renameTab(tab));
            }}>{tabLabel(tab)}</button
          >{/each}
      </div>
      <button id="export-menu" onclick={(event) => vm.exportMenu(event)}>{t('Export')}</button
      ><button id="format-menu" onclick={(event) => vm.formatMenu(event)}>{t('Format')}</button
      ><button id="view-menu" onclick={(event) => vm.viewMenu(event)}>{t('View')}</button><span
        id="goal-counter"
        onkeydown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            run(() => vm.dailyGoal());
          }
        }}
        onclick={() => run(() => vm.dailyGoal())}
        role="button"
        tabindex="0"
        class:goal-met={Number($app.library.dailyGoal) > 0 &&
          $app.todayWords >= Number($app.library.dailyGoal)}
        >{$app.sprint && !$app.sprint.completed
          ? `⚡ ${$app.sprint.progress} / ${$app.sprint.target}`
          : Number($app.library.dailyGoal)
            ? t('{n} / {goal} today', { n: $app.todayWords, goal: Number($app.library.dailyGoal) })
            : t('{n} today', { n: $app.todayWords })}</span
      ><span id="pos-counter">{$app.positionLabel}</span><button
        id="word-counter"
        onclick={() => vm.cycleWordCounter()}>{$app.wordLabel}</button
      ><span class="save-state"
        >{$app.readOnly ? 'Read only' : $app.dirty ? 'Unsaved' : 'Saved'}</span
      >
      <div id="zoom-control">
        <button id="zoom-out" onclick={() => vm.zoom(-0.1)}>−</button><span id="zoom-level"
          >{Math.round($app.zoom * 100)}%</span
        ><button id="zoom-in" onclick={() => vm.zoom(0.1)}>＋</button>
      </div>
    </footer>
  </div>
{/if}
{#if $app.modal}<div
    class="modal-backdrop"
    use:dialogFocus
    role="dialog"
    aria-modal="true"
    aria-label={$app.modal.title}
  >
    <form
      class="modal"
      onsubmit={(event) => {
        event.preventDefault();
        vm.answer($app.modal?.value ?? '');
      }}
    >
      <h2>{$app.modal.title}</h2>
      {#if $app.modal.choices}<div class="fr-choices">
          {#each $app.modal.choices as choice}<button
              type="button"
              class="fr-choice"
              onclick={() => vm.answer(choice.value)}
            >
              {#if choice.description}<strong
                  >{choice.localize === false ? choice.label : t(choice.label)}</strong
                ><span>{t(choice.description)}</span>
              {:else}{choice.localize === false ? choice.label : t(choice.label)}{/if}
            </button>{/each}
        </div>{:else if $app.modal.input === false}<p>{$app.modal.label}</p>{:else}
        <label
          >{$app.modal.label}<input
            use:focusInput
            value={$app.modal.value}
            oninput={(event) => {
              vm.modalValue(event.currentTarget.value);
            }}
          /></label
        >
      {/if}
      <div class="modal-actions">
        <button type="button" onclick={() => vm.answer(null)}>{t('Cancel')}</button
        >{#if !$app.modal.choices}<button type="submit">{$app.modal.confirm}</button>{/if}
        >
      </div>
    </form>
  </div>{/if}
{#if $app.menu}{#key $app.menu}<PopupMenu
      value={$app.menu}
      cancel={vm.dismissMenu}
      execute={run}
      {t}
    />{/key}{/if}
{#if $app.hint}<div id="hint" role="status">
    {$app.hint}<button onclick={() => vm.dismissHint()}>×</button>
  </div>{/if}

{#if $app.goals}<Goals
    presentation={$app.goals}
    actions={{
      edit: vm.editGoal,
      close: () => run(() => vm.closeGoals()),
      sprint: () => run(() => vm.goalsSprint()),
    }}
    {t}
  />{/if}

{#if $app.librarySettings}<LibrarySettings
    value={$app.librarySettings}
    close={() => vm.closeLibrarySettings()}
    choose={(defaultFolder) => run(() => vm.chooseLibraryFolder(defaultFolder))}
    backup={() => run(() => vm.backupLibrary())}
    reveal={() => run(() => vm.revealLibrary())}
  />{/if}

{#if $app.information}<Information
    value={$app.information}
    {t}
    close={() => vm.closeInformation()}
  />{/if}

{#if $app.coverArt}<CoverArt
    presentation={$app.coverArt}
    {t}
    actions={{
      edit: (field, value) => vm.editCoverSettings(field, value),
      saveSettings: () => run(() => vm.saveCoverSettings()),
      cancel: () => vm.closeCoverArt(),
      choose: (id, choice) => run(() => vm.chooseCover(id, choice)),
    }}
  />{/if}
{#if $app.fontPicker}<FontPicker
    presentation={$app.fontPicker}
    {t}
    familyStyle={vm.bodyFontStyle}
    actions={{
      search: (query) => vm.searchFonts(query),
      hover: (font) => vm.previewFont(font),
      leave: () => vm.leaveFontList(),
      choose: (font) => run(() => vm.chooseFont(font)),
      enter: () => run(() => vm.fontPickerEnter()),
      cancel: () => vm.closeFontPicker(),
    }}
  />{/if}

{#if $app.emailSettings}<EmailSettings
    value={$app.emailSettings}
    {t}
    choose={(method) => run(() => vm.chooseEmailMethod(method))}
    cancel={() => vm.closeEmailSettings()}
  />{/if}

{#if $app.hostRecovery}
  <div
    class="host-recovery-banner"
    role="alert"
    style="position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:1200;background:var(--panel);border:1px solid var(--accent);padding:12px 18px;max-width:calc(100vw - 40px)"
  >
    <span>{t('The document service stopped. Your writing is still here.')}</span>
    {#if $app.hostRecovery.error}<span
        >{t('Recovery failed: {error}', { error: $app.hostRecovery.error })}</span
      >{/if}
    <button disabled={$app.hostRecovery.busy} onclick={() => run(() => vm.recoverHost())}>
      {t($app.hostRecovery.busy ? 'Recovering…' : 'Recover document service')}
    </button>
  </div>
{/if}

{#if $app.publicationPage}<PublicationPage
    presentation={$app.publicationPage}
    {t}
    actions={{
      bind: vm.bindPublicationPage,
      edit: vm.editPublicationTitle,
      pasteTitle: vm.pastePublicationTitle,
      enter: (field) => run(() => vm.enterPublicationTitle(field)),
      close: () => run(() => vm.closePublicationPage()),
      undo: vm.publicationUndo,
      redo: vm.publicationRedo,
    }}
  />{/if}
