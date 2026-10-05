<script lang="ts">
  import { dialogFocus } from './lib/dialog-focus';
  import { focusInput } from './lib/editable-text';
  import { translate } from '@leafloom/language-contracts';
  import Goals from './Goals.svelte';
  import PopupMenu from './PopupMenu.svelte';
  import CoverArt from './CoverArt.svelte';
  import EmailSettings from './EmailSettings.svelte';
  import FontPicker from './FontPicker.svelte';
  import Information from './Information.svelte';
  import LibrarySettings from './LibrarySettings.svelte';
  import PublicationPage from './PublicationPage.svelte';
  import type { AppActions, AppState } from './lib/application-types';
  let { presentation: app, actions: vm }: { presentation: Pick<AppState, 'coverArt' | 'emailSettings' | 'fontPicker' | 'goals' | 'hint' | 'hostRecovery' | 'information' | 'language' | 'librarySettings' | 'menu' | 'modal' | 'publicationPage' | 'update'>; actions: Pick<AppActions, 'answer' | 'backupLibrary' | 'bindPublicationPage' | 'bodyFontStyle' | 'chooseCover' | 'chooseEmailMethod' | 'chooseFont' | 'chooseLibraryFolder' | 'closeCoverArt' | 'closeEmailSettings' | 'closeFontPicker' | 'closeGoals' | 'closeInformation' | 'closeLibrarySettings' | 'closePublicationPage' | 'dismissHint' | 'dismissMenu' | 'editCoverSettings' | 'editGoal' | 'editPublicationTitle' | 'enterPublicationTitle' | 'execute' | 'fontPickerEnter' | 'goalsSprint' | 'leaveFontList' | 'modalValue' | 'pastePublicationTitle' | 'previewFont' | 'publicationRedo' | 'publicationUndo' | 'recoverHost' | 'restartForUpdate' | 'revealLibrary' | 'saveCoverSettings' | 'searchFonts'> } = $props();
  const t = (key: string, values?: Record<string, string | number>) => translate(app.language, key, values);
  const run = (command: () => void | Promise<void>) => vm.execute(command);
</script>
{#if app.modal}<div
    class="modal-backdrop"
    use:dialogFocus
    role="dialog"
    aria-modal="true"
    aria-label={app.modal.title}
  >
    <form
      class="modal"
      onsubmit={(event) => {
        event.preventDefault();
        vm.answer(app.modal?.value ?? '');
      }}
    >
      <h2>{app.modal.title}</h2>
      {#if app.modal.choices}<div class="fr-choices">
          {#each app.modal.choices as choice}<button
              type="button"
              class="fr-choice"
              onclick={() => vm.answer(choice.value)}
            >
              {#if choice.description}<strong
                  >{choice.localize === false ? choice.label : t(choice.label)}</strong
                ><span>{t(choice.description)}</span>
              {:else}{choice.localize === false ? choice.label : t(choice.label)}{/if}
            </button>{/each}
        </div>{:else if app.modal.input === false}<p>{app.modal.label}</p>{:else}
        <label
          >{app.modal.label}<input
            use:focusInput
            value={app.modal.value}
            oninput={(event) => {
              vm.modalValue(event.currentTarget.value);
            }}
          /></label
        >
      {/if}
      <div class="modal-actions">
        <button type="button" onclick={() => vm.answer(null)}>{t('Cancel')}</button
        >{#if !app.modal.choices}<button type="submit">{app.modal.confirm}</button>{/if}
        >
      </div>
    </form>
  </div>{/if}
{#if app.menu}{#key app.menu}<PopupMenu
      value={app.menu}
      cancel={vm.dismissMenu}
      execute={run}
      {t}
    />{/key}{/if}
{#if app.hint}<div id="hint" role="status">
    {app.hint}<button onclick={() => vm.dismissHint()}>×</button>
  </div>{/if}

{#if app.goals}<Goals
    presentation={app.goals}
    actions={{
      edit: vm.editGoal,
      close: () => run(() => vm.closeGoals()),
      sprint: () => run(() => vm.goalsSprint()),
    }}
    {t}
  />{/if}

{#if app.librarySettings}<LibrarySettings
    value={app.librarySettings}
    close={() => vm.closeLibrarySettings()}
    choose={(defaultFolder) => run(() => vm.chooseLibraryFolder(defaultFolder))}
    backup={() => run(() => vm.backupLibrary())}
    reveal={() => run(() => vm.revealLibrary())}
  />{/if}

{#if app.information}<Information
    value={app.information}
    {t}
    close={() => vm.closeInformation()}
    restart={() => run(() => vm.restartForUpdate())}
  />{/if}

{#if app.coverArt}<CoverArt
    presentation={app.coverArt}
    {t}
    actions={{
      edit: (field, value) => vm.editCoverSettings(field, value),
      saveSettings: () => run(() => vm.saveCoverSettings()),
      cancel: () => vm.closeCoverArt(),
      choose: (id, choice) => run(() => vm.chooseCover(id, choice)),
    }}
  />{/if}
{#if app.fontPicker}<FontPicker
    presentation={app.fontPicker}
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

{#if app.emailSettings}<EmailSettings
    value={app.emailSettings}
    {t}
    choose={(method) => run(() => vm.chooseEmailMethod(method))}
    cancel={() => vm.closeEmailSettings()}
  />{/if}

{#if app.hostRecovery}
  <div
    class="host-recovery-banner"
    role="alert"
    style="position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:1200;background:var(--panel);border:1px solid var(--accent);padding:12px 18px;max-width:calc(100vw - 40px)"
  >
    <span>{t('The document service stopped. Your writing is still here.')}</span>
    {#if app.hostRecovery.error}<span
        >{t('Recovery failed: {error}', { error: app.hostRecovery.error })}</span
      >{/if}
    <button disabled={app.hostRecovery.busy} onclick={() => run(() => vm.recoverHost())}>
      {t(app.hostRecovery.busy ? 'Recovering…' : 'Recover document service')}
    </button>
  </div>
{/if}

{#if app.publicationPage}<PublicationPage
    presentation={app.publicationPage}
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

{#if app.update?.status === 'ready' && app.information?.kind !== 'update'}
  <aside class="update-notice" aria-label={t('Update ready')}>
    <span>Leafloom {app.update.latestVersion} {t('is ready to install.')}</span>
    <button onclick={() => run(() => vm.restartForUpdate())}>{t('Save and restart')}</button>
  </aside>
{/if}

<style>
  .update-notice {
    position: fixed;
    right: 16px;
    bottom: 52px;
    z-index: 40;
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 12px;
    background: var(--bg, white);
    color: var(--fg, #222);
    border: 1px solid currentColor;
    border-radius: 6px;
  }
</style>
