<script lang="ts">
  import { dialogFocus } from './lib/dialog-focus';
  import type { CoverArtPresentation, CoverArtDraft, CoverChoice } from './lib/cover-art';
  let {
    presentation,
    actions,
    t,
  }: {
    presentation: CoverArtPresentation;
    actions: {
      edit(field: keyof CoverArtDraft, value: string | boolean): void;
      saveSettings(): void;
      cancel(): void;
      choose(bookId: string, choice: CoverChoice): void;
    };
    t: (key: string, args?: Record<string, string | number>) => string;
  } = $props();
  const focusKey = (node: HTMLInputElement) => {
    queueMicrotask(() => {
      if (node.isConnected) node.focus();
    });
  };
</script>

<div
  class="modal-backdrop"
  role="dialog"
  aria-modal="true"
  aria-label={presentation.kind === 'settings'
    ? t('Cover art')
    : t('Cover for “{title}”', { title: presentation.title })}
  tabindex="-1"
  use:dialogFocus
  onclick={(event) => {
    if (event.target === event.currentTarget) actions.cancel();
  }}
  onkeydown={(event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      actions.cancel();
    }
  }}
>
  <div class="modal cover-art-modal" style="width:540px;max-width:calc(100vw - 40px)">
    {#if presentation.kind === 'settings'}
      <h2 style="font-size:17px">{t('Cover art')}</h2>
      <p>
        {t(
          'Every book gets a cover on the shelf: an abstract with the title set in type. With an OpenAI key, Leafloom can also read a story once it passes {n} words and paint a cover from the text. Paintings stay on your shelf — exports never include them.',
          { n: 1000 },
        )}
      </p>
      <div class="stats-row">
        <select id="ca-provider" hidden aria-label={t('Provider')}
          ><option value="openai">OpenAI</option></select
        >
        <label class="st-check"
          ><input
            id="ca-auto"
            type="checkbox"
            checked={presentation.draft.auto}
            disabled={presentation.busy}
            onchange={(event) => actions.edit('auto', event.currentTarget.checked)}
          />{t('paint at {n} words', { n: 1000 })}</label
        >
      </div>
      <div class="stats-row st-covers">
        <label
          >{t('API key')}
          <input
            id="ca-key"
            type="password"
            autocomplete="off"
            spellcheck="false"
            placeholder={t('{name} key ({hint})', { name: 'OpenAI', hint: 'sk-…' })}
            value={presentation.draft.key}
            disabled={presentation.busy}
            oninput={(event) => actions.edit('key', event.currentTarget.value)}
            use:focusKey
            style="width:300px;max-width:100%"
          /></label
        >
      </div>
      <p class="soft" id="ca-note" style="margin:-6px 0 12px;font-size:12px" aria-live="polite">
        {#if presentation.configured === true}{t(
            'A {name} key is saved, encrypted, outside your library folder. Paste a new one to replace it, or type “{remove}” to forget it.',
            { name: 'OpenAI', remove: t('remove') },
          )}
        {:else if presentation.configured === false}{t(
            'Get a key at {where} ({cost}). It’s stored encrypted on this computer and only ever sent to {name}.',
            {
              where: 'platform.openai.com → API keys',
              cost: t('a few cents a picture'),
              name: 'OpenAI',
            },
          )}
        {:else}{t('Checking saved key…')}{/if}
      </p>
      <details class="st-advanced">
        <summary class="soft">{t('Models')}</summary>
        <div class="stats-row">
          <label
            >{t('Brief')}
            <input
              id="ca-tmodel"
              type="text"
              spellcheck="false"
              placeholder="gpt-5-mini"
              value={presentation.draft.textModel}
              disabled={presentation.busy}
              oninput={(event) => actions.edit('textModel', event.currentTarget.value)}
            /></label
          ><label
            >{t('Paint')}
            <input
              id="ca-imodel"
              type="text"
              spellcheck="false"
              placeholder="gpt-image-1-mini"
              value={presentation.draft.imageModel}
              disabled={presentation.busy}
              oninput={(event) => actions.edit('imageModel', event.currentTarget.value)}
            /></label
          ><label id="ca-quality-wrap"
            >{t('Quality')}
            <select
              id="ca-quality"
              value={presentation.draft.quality}
              disabled={presentation.busy}
              onchange={(event) => actions.edit('quality', event.currentTarget.value)}
              >{#each ['low', 'medium', 'high'] as quality}<option value={quality}
                  >{t(quality)}</option
                >{/each}</select
            ></label
          >
        </div>
        <p class="soft" style="font-size:12px;margin:0 0 6px">
          {t(
            'Leave blank for Leafloom’s defaults. Names drift; if a provider retires one, Leafloom tries its own list before giving up.',
          )}
        </p>
      </details>
      {#if presentation.error}<p role="alert" class="cover-art-error">{presentation.error}</p>{/if}
      <div style="text-align:right;margin-top:14px">
        <button
          class="m-cancel btn-quiet"
          style="margin-right:10px"
          disabled={presentation.busy}
          onclick={() => actions.cancel()}>{t('Cancel')}</button
        ><button
          class="m-ok btn-gold"
          disabled={presentation.busy}
          onclick={() => actions.saveSettings()}>{t('Save')}</button
        >
      </div>
    {:else}
      <h2>{t('Cover for “{title}”', { title: presentation.title })}</h2>
      <div class="option-list">
        {#each presentation.options as option}<button
            class="option"
            disabled={option.disabled}
            onclick={() =>
              actions.choose(
                presentation.kind === 'choices' ? presentation.bookId : '',
                option.value,
              )}
            ><strong>{option.label}</strong><span class="soft">{option.description}</span></button
          >{/each}
      </div>
      <div style="text-align:right;margin-top:14px">
        <button class="m-cancel btn-quiet" onclick={() => actions.cancel()}>{t('Cancel')}</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .option-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .option {
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 14px;
  }
  .cover-art-error {
    color: var(--red, #a64242);
  }
  .st-advanced .stats-row {
    flex-wrap: wrap;
  }
</style>
