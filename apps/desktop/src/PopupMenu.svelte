<script lang="ts">
  import { popupMenu, type PopupMenuItem } from './lib/popup-menu';
  let { value, cancel, execute, t }: { value: { x: number; y: number; title?: string; allowShortcuts?: boolean; items: PopupMenuItem[] }; cancel(): void; execute(command: () => void | Promise<void>): void; t(key: string): string } = $props();
</script>
<div class="pop-menu" role="menu" aria-label={value.title} tabindex="-1" use:popupMenu={{ x: value.x, y: value.y, allowShortcuts: value.allowShortcuts, cancel }}>
  {#if value.title}<div class="pm-title">{value.title}</div>{/if}
  {#each value.items as item}
    {#if item.separator}<div class="pm-sep" role="separator"></div>{:else}
      <button role={item.checked === undefined ? 'menuitem' : 'menuitemradio'} aria-checked={item.checked} class:on={item.checked} class:danger={item.danger} disabled={item.disabled} tabindex="-1" onmouseenter={(event) => { if (!item.disabled) event.currentTarget.focus({ preventScroll: true }); }} onclick={() => execute(item.run)}>{item.localize === false ? item.label : t(item.label)}</button>
    {/if}
  {/each}
</div>
