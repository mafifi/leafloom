<script lang="ts">
  import { dialogFocus } from './lib/dialog-focus';
  import help from '../../../docs/HELP.md?raw';
  import {
    helpBlocks,
    helpInline,
    shortcutSections,
    type InformationPresentation,
  } from './lib/information';
  let {
    value,
    close,
    t,
  }: { value: InformationPresentation; close: () => void; t: (key: string) => string } = $props();
  const blocks = helpBlocks(help);
  const sections = $derived(
    shortcutSections(navigator.platform.toLowerCase().includes('mac'), Boolean(value.vim)),
  );
</script>

<div
  class="modal-backdrop"
  role="presentation"
  onclick={(event) => {
    if (event.target === event.currentTarget) close();
  }}
>
  <div
    class="modal information"
    use:dialogFocus={{ trap: value.kind === 'shortcuts' }}
    role="dialog"
    aria-modal="true"
    aria-labelledby="information-title"
    tabindex="-1"
  >
    <h2 id="information-title">{value.title}</h2>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (The source shortcut reference is a keyboard-focusable reading region.) -->
    <div
      class="information-content"
      class:shortcuts-content={value.kind === 'shortcuts'}
      tabindex={value.kind === 'shortcuts' ? 0 : undefined}
      role={value.kind === 'shortcuts' ? 'region' : undefined}
      aria-label={value.kind === 'shortcuts' ? t('Shortcut reference') : undefined}
    >
      {#if value.kind === 'help'}
        {#each blocks as block}
          {#if block.heading === 1}<h3>{block.text}</h3>{:else if block.heading}<h4>
              {block.text}
            </h4>{:else}<p>
              {#each helpInline(block.text) as part}{#if part.strong}<strong>{part.text}</strong
                  >{:else}{part.text}{/if}{/each}
            </p>{/if}
        {/each}
      {:else if value.kind === 'shortcuts'}
        {#each sections as section}<section class="shortcuts-section">
            <h3>{t(section.title)}</h3>
            <dl>
              {#each section.rows as [keys, label, detail]}<div class="shortcut-row">
                  <dt>
                    {t(label as string)}{#if detail}<small>{t(detail as string)}</small>{/if}
                  </dt>
                  <dd>
                    {#each [keys].flat() as key}<kbd>{t(key)}</kbd>{/each}
                  </dd>
                </div>{/each}
            </dl>
          </section>{/each}
      {:else if value.kind === 'about'}<p>Version {value.version}</p>
        <p>A word processor for authors.</p>
      {:else}<p>Leafloom {value.version}</p>
        <p>
          This build uses manual updates. Install a newer Leafloom package to update the app.
        </p>{/if}
    </div>
    <div class="modal-actions">
      <button onclick={close}
        >{value.kind === 'shortcuts' ? t('Done') : t('Back to writing')}</button
      >
    </div>
  </div>
</div>

<style>
  .information {
    width: min(680px, 90vw);
  }
  .information-content {
    max-height: 65vh;
    overflow: auto;
    line-height: 1.6;
  }
  h4 {
    margin: 20px 0 8px;
  }
</style>
