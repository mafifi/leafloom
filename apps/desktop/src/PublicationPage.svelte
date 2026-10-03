<script lang="ts">
  import { dialogFocus } from './lib/dialog-focus';
  import type { PublicationPagePresentation, TitleField } from './lib/publication-page';
  let {
    presentation,
    actions,
    t,
  }: {
    presentation: PublicationPagePresentation;
    actions: {
      bind(body: HTMLElement, auxiliary: HTMLElement): void;
      edit(field: TitleField, text: string): void;
      pasteTitle(field: TitleField, text: string, from: number, to: number): void;
      enter(field: TitleField): void;
      close(): void;
      undo(): void;
      redo(): void;
    };
    t: (key: string) => string;
  } = $props();
  let body: HTMLElement | undefined = $state(),
    auxiliary: HTMLElement | undefined = $state();
  $effect(() => {
    if (body && auxiliary) actions.bind(body, auxiliary);
  });
  function fieldContent(
    node: HTMLElement,
    data: { field: TitleField; value: string; focus: PublicationPagePresentation['focus'] },
  ) {
    let token = -1;
    const apply = (value: typeof data) => {
      if (node.textContent !== value.value) node.textContent = value.value;
      if (!value.focus || value.focus.field !== value.field || value.focus.token === token) return;
      token = value.focus.token;
      const focus = value.focus;
      queueMicrotask(() => {
        if (!node.isConnected) return;
        node.focus({ preventScroll: true });
        if (!node.firstChild) node.appendChild(node.ownerDocument.createTextNode(''));
        const text = node.firstChild;
        if (!text) return;
        const range = node.ownerDocument.createRange();
        range.setStart(text, Math.min(focus.from, text.textContent?.length ?? 0));
        range.setEnd(text, Math.min(focus.to, text.textContent?.length ?? 0));
        const selection = node.ownerDocument.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      });
    };
    apply(data);
    return { update: apply };
  }
  function offsets(node: HTMLElement) {
    const selection = node.ownerDocument.getSelection();
    if (
      !selection?.rangeCount ||
      !node.contains(selection.anchorNode) ||
      !node.contains(selection.focusNode)
    )
      return { from: node.textContent?.length ?? 0, to: node.textContent?.length ?? 0 };
    const selectionRange = selection.getRangeAt(0),
      range = node.ownerDocument.createRange();
    range.selectNodeContents(node);
    range.setEnd(selectionRange.startContainer, selectionRange.startOffset);
    const from = range.toString().length;
    range.setEnd(selectionRange.endContainer, selectionRange.endOffset);
    return { from, to: range.toString().length };
  }
</script>

<div
  class="modal-backdrop page-sheet-backdrop"
  role="presentation"
  onclick={(event) => {
    if (event.target === event.currentTarget) actions.close();
  }}
>
  <div
    class="page-sheet"
    class:tp-sheet={presentation.kind === 'cover'}
    role="dialog"
    aria-modal="true"
    aria-label={presentation.label}
    tabindex="-1"
    use:dialogFocus={{ initialFocus: false }}
    onkeydown={(event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        actions.close();
      }
      if (
        presentation.kind === 'cover' &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'z'
      ) {
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) actions.redo();
        else actions.undo();
      }
    }}
  >
    <header class="ps-bar">
      <span class="ps-name">{presentation.label}</span><button
        class="ps-done"
        onclick={() => actions.close()}
        disabled={presentation.saving || presentation.blocked}>{t('Done')}</button
      >
    </header>
    {#if presentation.failure}<p class="ps-recovery" role="alert">
        {t(
          presentation.failure === 'disk'
            ? 'Your changes are here. Free up space and try Done again.'
            : presentation.failure === 'conflict'
              ? 'Your changes are here. Resolve the changed file before saving.'
              : 'Your changes are here. Reconnect to save this page.',
        )}
      </p>{/if}
    <div class="ps-paper kind-{presentation.kind === 'cover' ? 'title' : presentation.kind}">
      {#if presentation.kind === 'cover'}
        {#each ['title', 'subtitle', 'author'] as name}
          {@const field = name as TitleField}
          <div
            class="tp-field {field === 'title' ? 'tp-t' : field === 'subtitle' ? 'tp-s' : 'tp-a'}"
            role="textbox"
            aria-label={t(
              field === 'title' ? 'Title' : field === 'subtitle' ? 'Subtitle' : 'Author',
            )}
            aria-multiline="false"
            contenteditable={!presentation.readOnly &&
              !presentation.blocked &&
              !presentation.closing}
            tabindex="0"
            spellcheck="false"
            data-ph={t(field === 'title' ? 'Title' : field === 'subtitle' ? 'Subtitle' : 'Author')}
            use:fieldContent={{ field, value: presentation[field], focus: presentation.focus }}
            oninput={(event) => actions.edit(field, event.currentTarget.textContent || '')}
            onpaste={(event) => {
              event.preventDefault();
              const range = offsets(event.currentTarget);
              actions.pasteTitle(
                field,
                event.clipboardData?.getData('text/plain') || '',
                range.from,
                range.to,
              );
            }}
            onkeydown={(event) => {
              if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) {
                event.preventDefault();
                actions.enter(field);
              }
            }}
          ></div>
        {/each}
      {:else}
        {#if ['part', 'epilogue', 'acknowledgments', 'about'].includes(presentation.kind)}<div
            class="ps-label"
          >
            {presentation.label}
          </div>{/if}
        <div class="ps-body-host" bind:this={body}></div>
        <div hidden bind:this={auxiliary}></div>
      {/if}
    </div>
  </div>
</div>
