<script lang="ts">
  import { dialogFocus } from './lib/dialog-focus';
  import type { FontPickerPresentation } from './lib/font-picker';
  let { presentation, actions, familyStyle, t }: {
    presentation: FontPickerPresentation;
    actions: {
      search(query: string): void;
      hover(font: string): void;
      leave(): void;
      choose(font: string): void;
      enter(): void;
      cancel(): void;
    };
    familyStyle: (font: string) => string;
    t: (key: string, args?: Record<string, string | number>) => string;
  } = $props();
  function prepare(node: HTMLInputElement) {
    queueMicrotask(() => {
      if (!node.isConnected) return;
      node.closest('.modal')?.querySelector<HTMLElement>('.font-list .sel')
        ?.scrollIntoView({ block: 'center' });
      node.focus({ preventScroll: true });
    });
  }
</script>

<div
  class="modal-backdrop font-picker"
  role="dialog"
  aria-modal="true"
  aria-label={t('Other font')}
  tabindex="-1"
  use:dialogFocus
  onkeydown={(event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      actions.cancel();
    }
  }}
  onclick={(event) => {
    if (event.target === event.currentTarget) actions.cancel();
  }}
>
  <div class="modal" style="width:320px;max-width:calc(100vw - 40px)">
    <h2 style="font-size:16px">{t('Other font')}</h2>
    <p class="font-now" style="font-size:13px;color:var(--muted);margin-bottom:10px">
      {t('Now: {font}', { font: presentation.current })}
    </p>
    <input
      type="text"
      spellcheck="false"
      aria-label={t('Search {n} installed fonts', { n: presentation.families.length })}
      placeholder={t('Search {n} installed fonts', { n: presentation.families.length })}
      value={presentation.query}
      oninput={(event) => actions.search(event.currentTarget.value)}
      onkeydown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          actions.enter();
        }
      }}
      use:prepare
    />
    <div
      class="font-list"
      role="group"
      aria-label={t('Installed fonts')}
      onmouseleave={() => actions.leave()}
    >
      {#each presentation.rows as font (font)}
        <button
          class="fr-font"
          class:sel={font === presentation.current}
          aria-pressed={font === presentation.current}
          style:font-family={familyStyle(font)}
          onmouseenter={() => actions.hover(font)}
          onfocus={() => actions.hover(font)}
          onclick={() => actions.choose(font)}>{font}</button
        >
      {/each}
    </div>
    <div style="text-align:right;margin-top:14px">
      <button class="m-cancel btn-quiet" onclick={() => actions.cancel()}>{t('Cancel')}</button>
    </div>
  </div>
</div>
