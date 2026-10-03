<script lang="ts">
  import { dialogFocus } from './lib/dialog-focus';
  import type { LibrarySettingsPresentation } from './lib/library-settings';
  let {
    value,
    close,
    choose,
    backup,
    reveal,
  }: {
    value: LibrarySettingsPresentation;
    close: () => void;
    choose: (defaultFolder: boolean) => void;
    backup: () => void;
    reveal: () => void;
  } = $props();
</script>

<div
  class="modal-backdrop"
  role="presentation"
  onclick={(event) => {
    if (event.target === event.currentTarget) close();
  }}
>
  <div
    class="modal"
    use:dialogFocus
    role="dialog"
    aria-modal="true"
    aria-labelledby="library-settings-title"
    tabindex="-1"
  >
    <h2 id="library-settings-title">Library folder</h2>
    <p>Your books live in this folder.</p>
    <p class="library-path">{value.current}</p>
    <div class="modal-actions">
      <button disabled={value.busy} onclick={reveal}>Show folder</button>
      <button disabled={value.busy} onclick={() => choose(false)}>Choose folder…</button>
      {#if value.custom}<button disabled={value.busy} onclick={() => choose(true)}
          >Use default folder</button
        >{/if}
    </div>
    <p>Changing the folder restarts Leafloom after saving your open book.</p>
    <h3>Backups</h3>
    <p>Leafloom saves a daily backup and keeps the last fourteen days.</p>
    <button disabled={value.busy} onclick={backup}>Back up now</button>
    {#if value.backups.length}<ul>
        {#each value.backups as entry (entry.name)}<li>
            {entry.name} · {Math.ceil(entry.bytes / 1024)} KB
          </li>{/each}
      </ul>{:else}<p>No backups yet.</p>{/if}
    <div class="modal-actions"><button disabled={value.busy} onclick={close}>Done</button></div>
  </div>
</div>

<style>
  .library-path {
    overflow-wrap: anywhere;
    font-family: monospace;
  }
  ul {
    max-height: 180px;
    overflow: auto;
  }
</style>
