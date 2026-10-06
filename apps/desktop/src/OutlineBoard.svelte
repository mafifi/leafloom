<script lang="ts">
  import { tick, onMount, onDestroy } from 'svelte';
  import type { OutlineCard, OutlineCardInsertion, OutlineCardTarget } from '@leafloom/editor-contracts';
  import { editableText } from './lib/editable-text';
  import { cardTarget, eighthsText, newCardLocation, nextOutlineCard, type OutlineBoardActions, type OutlineBoardPresentation } from './lib/outline-board-presentation';
  import { startBoardPointer } from './lib/outline-board-pointer';
  import './styles/outline-board.css';
  let { presentation, actions, t, aside = false }: { presentation: OutlineBoardPresentation; actions: OutlineBoardActions; t: (key: string, args?: Record<string, string | number>) => string; aside?: boolean } = $props();
  let openKey = $state<string | null>(null), draftText = $state(''), draftSlug = $state(''), fresh = $state<OutlineCardInsertion | null>(null), freshCard = $state<OutlineCard | null>(null), freshAnchor = $state<string | null>(null), dragActive = $state(false);
  let stopPointer: (() => void) | null = null, unregisterFlush: (() => void) | undefined;
  const baseCards = $derived(aside ? presentation.looseCards : presentation.cards);
  const cards = $derived.by(() => {
    if (!freshCard) return baseCards;
    const list = [...baseCards], at = freshAnchor ? list.findIndex((card) => card.key === freshAnchor) + 1 : list.length;
    if (!aside && freshCard.kind === 'section') {
      const previous = list[at - 1], following = list[at];
      if (previous) list[at - 1] = { ...previous, last: false };
      list.splice(at, 0, { ...freshCard, last: following?.chapterId !== freshCard.chapterId });
    } else list.splice(at, 0, freshCard);
    return list;
  });
  const placeholder = (card: OutlineCard) => t(card.kind === 'chapter' ? 'What happens in this chapter…' : card.kind === 'scene' ? 'What happens in this scene…' : card.kind === 'loose' ? 'Write a note…' : 'What happens in this section…');
  const displayText = (card: OutlineCard) => card.note || card.excerpt || placeholder(card);
  const cellFor = (key: string) => document.querySelector<HTMLElement>(`${aside ? '#loose-list' : '#outline-board'} .ob-cell[data-card-key="${CSS.escape(key)}"]`);
  function closeCard() {
    if (!openKey) return null;
    const card = cards.find((card) => card.key === openKey), location = fresh;
    openKey = null; fresh = null; freshCard = null; freshAnchor = null;
    if (!card || card.kind === 'part') return null;
    if (location) return actions.insert(location, draftText, draftSlug);
    actions.edit(cardTarget(card), draftText, card.kind === 'scene' ? draftSlug : undefined);
    return cardTarget(card);
  }
  async function openCard(card: OutlineCard) {
    if (card.kind === 'part') return;
    if (card.key !== openKey) closeCard();
    openKey = card.key; draftText = card.note; draftSlug = card.slug ?? '';
    await tick();
    const cell = cellFor(card.key), field = cell?.querySelector<HTMLElement>('.ob-text');
    if (!cell || !field) return;
    const board = cell.closest('#outline-board'), rect = cell.getBoundingClientRect();
    cell.classList.toggle('open-left', Boolean(board && rect.left + rect.width * 2 > board.getBoundingClientRect().right + 4));
    field.focus(); const range = document.createRange(); range.selectNodeContents(field); range.collapse(false);
    const selection = getSelection(); selection?.removeAllRanges(); selection?.addRange(range); cell.scrollIntoView({ block: 'nearest' });
  }
  async function focusTarget(target: OutlineCardTarget | null, edit = false) {
    await tick();
    const card = baseCards.find((card) => target && card.kind === target.kind && card.chapterId === target.chapterId && (target.sectionId ? card.sectionId === target.sectionId : target.passageId ? card.passageId === target.passageId : target.looseId ? card.looseId === target.looseId : true));
    if (!card) return;
    if (edit) await openCard(card); else cellFor(card.key)?.focus();
  }
  async function addAfter(card: OutlineCard) {
    const committed = closeCard();
    await tick();
    if (card.key.startsWith('fresh:') && committed) card = baseCards.find((candidate) => candidate.kind === committed.kind && (committed.sectionId ? candidate.sectionId === committed.sectionId : candidate.passageId === committed.passageId)) ?? card;
    if (card.kind === 'loose') { await focusTarget(actions.insert({ kind: 'loose' }), true); return; }
    const location = newCardLocation(card, presentation.cards), key = 'fresh:' + crypto.randomUUID();
    fresh = location; freshAnchor = card.key;
    freshCard = { key, kind: location.kind === 'scene' ? 'scene' : 'section', chapterId: card.chapterId, label: '+', note: '', excerpt: '', words: 0, written: false, virtual: false, flag: false, first: false, last: false, segmentIndex: -1, ...(location.kind === 'scene' ? { slug: '', cast: [], eighths: null } : {}) };
    openKey = key; draftText = ''; draftSlug = '';
    await tick();
    const field = cellFor(key)?.querySelector<HTMLElement>(location.kind === 'scene' ? '.ob-slug' : '.ob-text'); field?.focus();
  }
  async function addEnd() {
    closeCard();
    if (aside) { await focusTarget(actions.insert({ kind: 'loose' }), true); return; }
    if (presentation.script) {
      const last = presentation.cards.filter((card) => card.kind === 'scene').at(-1);
      if (last) { await addAfter(last); return; }
      fresh = { kind: 'scene', afterScene: -1 }; freshAnchor = null;
      freshCard = { key: 'fresh:' + crypto.randomUUID(), kind: 'scene', chapterId: '', label: '+', note: '', excerpt: '', words: 0, written: false, virtual: false, flag: false, first: false, last: false, slug: '', cast: [], eighths: null };
      openKey = freshCard.key; draftText = ''; draftSlug = ''; await tick(); cellFor(openKey)?.querySelector<HTMLElement>('.ob-slug')?.focus();
    } else await focusTarget(actions.insert({ kind: 'chapter', afterChapterId: presentation.cards.filter((card) => card.kind === 'chapter').at(-1)?.chapterId ?? null }), true);
  }
  function blurCard() {
    setTimeout(() => {
      const current = openKey ? cellFor(openKey) : null;
      if (!current || dragActive || !document.hasFocus()) return;
      if (current.contains(document.activeElement) && (document.activeElement as HTMLElement)?.isContentEditable) return;
      closeCard();
    }, 0);
  }
  async function editKey(event: KeyboardEvent, card: OutlineCard, slug = false) {
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 's') return;
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); const target = closeCard(); await focusTarget(target); return; }
    if (event.isComposing || event.keyCode === 229) return;
    if (slug) {
      if (event.key === 'Enter' || event.key === 'Tab' && !event.shiftKey) { event.preventDefault(); const field = cellFor(card.key)?.querySelector<HTMLElement>('.ob-text'); if (field) { field.focus(); const range = document.createRange(); range.selectNodeContents(field); range.collapse(false); const selection = getSelection(); selection?.removeAllRanges(); selection?.addRange(range); } }
      return;
    }
    if (event.key === 'Enter' && !event.altKey && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      event.preventDefault(); const target = closeCard(); await focusTarget(target); return;
    }
    if (event.key === 'Tab' && !event.altKey && !event.metaKey && !event.ctrlKey) {
      event.preventDefault(); const next = nextOutlineCard(cards, card.key, event.shiftKey ? -1 : 1), target = closeCard();
      await tick(); if (next && baseCards.some((entry) => entry.key === next.key)) await openCard(next); else await focusTarget(target); return;
    }
    if (event.key === 'Enter' && event.altKey && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      if (!draftText.trim() && fresh?.kind === 'section') {
        const chapterId = fresh.chapterId; openKey = null; fresh = null; freshCard = null; freshAnchor = null;
        await focusTarget(actions.insert({ kind: 'chapter', afterChapterId: chapterId }), true);
      } else await addAfter(card);
      return;
    }
    if (event.key === 'Backspace' && !draftText && !slug) {
      if (fresh) {
        event.preventDefault(); const index = cards.findIndex((entry) => entry.key === card.key), previous = cards[index - 1];
        openKey = null; fresh = null; freshCard = null; freshAnchor = null; await tick(); if (previous && previous.kind !== 'part') await openCard(previous);
      } else if (card.kind === 'loose' || card.kind === 'section' && card.sectionId && !card.written) {
        event.preventDefault(); openKey = null; actions.removeNote(cardTarget(card));
      }
    }
  }
  function cardKey(event: KeyboardEvent, card: OutlineCard) {
    if (openKey === card.key || (event.target as HTMLElement).closest('button')) return;
    if (event.key === 'Enter' && event.altKey) { event.preventDefault(); void addAfter(card); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void openCard(card); }
    else if (event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10') { event.preventDefault(); actions.menu(new MouseEvent('contextmenu'), cardTarget(card)); }
    else if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault(); const cells = [...document.querySelectorAll<HTMLElement>(`${aside ? '#loose-list' : '#outline-board'} .ob-cell`)], cell = event.currentTarget as HTMLElement, index = cells.indexOf(cell);
      let next = cells[index + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0)];
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const rect = cell.getBoundingClientRect(), down = event.key === 'ArrowDown'; let best = Infinity; next = undefined!;
        for (const candidate of cells) { const other = candidate.getBoundingClientRect(); if (down ? other.top <= rect.top + 4 : other.top >= rect.top - 4) continue;
          const distance = Math.abs(other.top - rect.top) * 4 + Math.abs(other.left - rect.left); if (distance < best) { best = distance; next = candidate; } }
      }
      next?.focus(); next?.scrollIntoView({ block: 'nearest' });
    }
  }
  function pointer(event: PointerEvent, card: OutlineCard) {
    if (event.button !== 0 || openKey === card.key || (event.target as HTMLElement).closest('button') || freshCard?.key === card.key) return;
    stopPointer?.();
    const cell = event.currentTarget as HTMLElement;
    stopPointer = startBoardPointer(event, cell, { open: () => void openCard(card), begin: () => { closeCard(); }, openAside: () => actions.showAside?.(), menu: (event) => actions.menu(event, cardTarget(card)), drop: (drop) => actions.drop(cardTarget(card), drop.target, drop.side), active: (value) => { dragActive = value; } });
  }
  function pastePlain(event: ClipboardEvent) {
    event.preventDefault(); document.execCommand('insertText', false, (event.clipboardData?.getData('text/plain') ?? '').replace(/\s+/g, ' '));
  }
  $effect(() => { if (!presentation.visible) { closeCard(); stopPointer?.(); } });
  onMount(() => { unregisterFlush = actions.bindFlush?.(() => { closeCard(); }); });
  onDestroy(() => { unregisterFlush?.(); closeCard(); stopPointer?.(); });
</script>

{#if !aside}
  <div id="outline-views" role="group" aria-label={t('Outline view')} hidden={!presentation.visible || presentation.script}>
    {#each ['list', 'cards'] as view}<button type="button" data-view={view} class:on={presentation.view === view} aria-pressed={presentation.view === view} onclick={() => { closeCard(); actions.view(view as 'list' | 'cards'); }}>{t(view === 'list' ? 'List' : 'Cards')}</button>{/each}
  </div>
{/if}
<div id={aside ? 'loose-list' : 'outline-board'} role="grid" aria-label={t(aside ? 'Loose cards' : 'Outline cards')} hidden={!presentation.visible || !aside && !presentation.script && presentation.view !== 'cards'} style={`--cz:${presentation.zoom}`} class:tiles={presentation.zoom < .8} class:script-board={presentation.script && !aside}>
  {#each cards as card (card.key)}
    {#if card.kind === 'part'}
      <div class="ob-part" role="heading" aria-level="3" oncontextmenu={(event) => { event.preventDefault(); actions.menu(event, { kind: 'chapter', chapterId: card.chapterId }); }}><span>{card.label}</span><span class="ob-rule"></span></div>
    {:else}
      {@const opened = openKey === card.key}
      <div class="ob-cell" class:first={card.first} class:last={card.last} class:open={opened} data-card-key={card.key} data-kind={card.kind} data-ch={card.chapterId} data-seg={card.segmentIndex} data-sec={card.sectionId} data-scene={card.sceneIndex} data-sid={card.sceneId} data-passage={card.passageId} data-loose={card.looseId} data-virtual={card.virtual ? '1' : undefined} data-written={card.written ? '1' : undefined} data-new={freshCard?.key === card.key ? '1' : undefined} tabindex="0" role="gridcell" aria-label={card.label + '. ' + displayText(card)} onpointerdown={(event) => pointer(event, card)} onkeydown={(event) => cardKey(event, card)} oncontextmenu={(event) => { if (!opened) { event.preventDefault(); if (!window.matchMedia('(hover: none)').matches) actions.menu(event, cardTarget(card)); } }}>
        <div class={`ob-card ob-${card.kind}`} class:unwritten={card.kind === 'section' && !card.written}>
          {#if card.kind !== 'loose'}<div class="ob-head"><span class={card.kind === 'chapter' ? 'ob-mark' : 'ob-letter'} class:ob-word={card.kind === 'chapter' && !/^\d+$/.test(card.label)}>{card.label === 'The story' ? t('The story') : card.label}</span><span class="ob-words">{card.kind === 'scene' ? card.eighths ? eighthsText(card.eighths) : '' : card.kind === 'chapter' && card.words ? t('{n} words', { n: card.words.toLocaleString() }) : ''}</span>{#if card.flag}<span class="ob-flag" title={t('Unresolved placeholder')}></span>{/if}</div>{/if}
          {#if card.kind === 'scene'}<div class="ob-slug" data-ph={t('INT. PLACE - DAY')} contenteditable={opened} spellcheck="false" role="textbox" aria-readonly={!opened} tabindex={opened ? 0 : undefined} use:editableText={opened ? draftSlug : card.slug} oninput={(event) => { draftSlug = event.currentTarget.textContent ?? ''; }} onkeydown={(event) => editKey(event, card, true)} onblur={blurCard} onpaste={pastePlain}></div>{/if}
          {#if opened && card.excerpt}<div class="ob-from">{card.excerpt}</div>{/if}
          <div class="ob-text" class:excerpt={!opened && !card.note && Boolean(card.excerpt)} class:empty={!opened && !card.note && !card.excerpt} data-ph={opened && card.excerpt ? t('Write a note…') : placeholder(card)} contenteditable={opened} spellcheck="false" role="textbox" aria-readonly={!opened} tabindex={opened ? 0 : undefined} use:editableText={opened ? draftText : displayText(card)} oninput={(event) => { draftText = event.currentTarget.textContent ?? ''; }} onkeydown={(event) => editKey(event, card)} onblur={blurCard} onpaste={pastePlain}></div>
          {#if card.kind === 'section' || card.kind === 'scene'}<div class="ob-foot">{card.kind === 'scene' ? card.cast?.join(' · ') : card.words ? t('{n} words', { n: card.words.toLocaleString() }) : t('not written yet')}</div>{/if}
          {#if opened}<div class="ob-tools">{#if !fresh && !card.virtual && card.kind !== 'loose'}<button class="ob-go" type="button" onmousedown={(event) => event.preventDefault()} onclick={() => { const target = closeCard(); if (target) actions.go(target); }}>{t('Go to the page')}</button>{/if}{#if card.kind !== 'loose'}<button type="button" onmousedown={(event) => event.preventDefault()} onclick={() => void addAfter(card)}>{t(card.kind === 'scene' ? 'New scene' : 'New card')}</button>{/if}<span>{t('Enter: done · Tab: next card · {key}: new card', { key: 'Alt+Enter' })}</span></div>{/if}
        </div>
        {#if card.kind !== 'loose'}<button type="button" class="ob-plus" tabindex="-1" title={t(card.kind === 'scene' ? 'New scene after this one' : 'New card after this one')} aria-label={t(card.kind === 'scene' ? 'New scene after this one' : 'New card after this one')} onclick={() => void addAfter(card)}>+</button>{/if}
      </div>
    {/if}
  {/each}
  <button type="button" class={aside ? 'loose-add' : 'ob-add'} onclick={() => void addEnd()}>{t(aside ? '+ card' : presentation.script ? '+ Scene' : '+ Chapter')}</button>
  {#if aside && !cards.length}<div class="loose-tip">{t('Ideas without a chapter yet. Drag one onto the board when it finds its place.')}</div>{/if}
</div>
{#if !aside}<div id="outline-board-hint" class="ol-hint" hidden={!presentation.visible || !presentation.script && presentation.view !== 'cards'}>{t(presentation.script ? 'Click a card to write on it · drag it to move the scene · right-click for more · + adds a scene' : 'Click a card to write on it · drag it to move it, writing and all · right-click for more · + adds a card')}</div>{/if}
