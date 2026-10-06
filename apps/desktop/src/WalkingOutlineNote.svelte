<script lang="ts">
  import { tick } from 'svelte';
  import type { WalkingOutlineNote as Note } from '@leafloom/editor-contracts';
  import './styles/outline-board.css';
  let {
    presentation,
    actions,
    t,
  }: {
    presentation: { visible: boolean; note: Note | null };
    actions: { dismiss(): void };
    t: (key: string) => string;
  } = $props();
  let element: HTMLDivElement | undefined = $state();
  $effect(() => {
    const note = presentation.visible ? presentation.note : null,
      overlay = element;
    if (!note || !overlay) return;
    let paragraph: HTMLElement | null = null,
      chapter: HTMLElement | null = null,
      observer: ResizeObserver | null = null,
      frame = 0,
      cancelled = false;
    const position = () => {
      frame = 0;
      if (cancelled || !overlay.isConnected) return;
      const current = document.querySelector<HTMLElement>(
        `.chapter-body [data-pid="${CSS.escape(note.passageId)}"]`,
      );
      if (!current) return;
      // The native Surface owns the transient data-walk node decoration.
      paragraph = current;
      chapter = paragraph.closest<HTMLElement>('.chapter');
      const body = paragraph.closest<HTMLElement>('.chapter-body');
      if (!chapter || !body) return;
      const owner = chapter.getBoundingClientRect(),
        bounds = body.getBoundingClientRect();
      overlay.style.left = bounds.left - owner.left + 'px';
      overlay.style.width = bounds.width + 'px';
      // NEO placeWalkNote reserves the measured note line before reading the
      // author's paragraph rectangle (app.js:8961).
      chapter.style.setProperty('--walk-h', overlay.offsetHeight + 8 + 'px');
      const line = paragraph.getBoundingClientRect();
      overlay.style.top = line.bottom - owner.top + 2 + 'px';
    };
    const queue = () => {
      if (!frame) frame = requestAnimationFrame(position);
    };
    void tick().then(() => {
      if (cancelled) return;
      position();
      observer = new ResizeObserver(queue);
      if (chapter) observer.observe(chapter);
      observer.observe(overlay);
    });
    window.addEventListener('resize', queue);
    document.addEventListener('input', queue, true);
    document.addEventListener('selectionchange', queue);
    document.addEventListener('scroll', queue, true);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', queue);
      document.removeEventListener('input', queue, true);
      document.removeEventListener('selectionchange', queue);
      document.removeEventListener('scroll', queue, true);
      chapter?.style.removeProperty('--walk-h');
    };
  });
</script>

{#if presentation.visible && presentation.note}
  <div
    class="walk-note"
    contenteditable="false"
    data-sec={presentation.note.sectionId}
    data-ch={presentation.note.chapterId}
    bind:this={element}
  >
    <span class="wn-text">{presentation.note.text}</span><button
      type="button"
      class="wn-dismiss"
      title={t('Put this outline note away for this section (it stays on its card)')}
      onmousedown={(event) => event.preventDefault()}
      onclick={() => actions.dismiss()}>{t('Dismiss')}</button
    >
  </div>
{/if}
