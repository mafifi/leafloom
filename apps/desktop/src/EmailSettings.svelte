<script lang="ts">
  import { dialogFocus } from './lib/dialog-focus';
  import type { EmailMethod, EmailPresentation } from './lib/email-draft';
  let { value, choose, cancel, t }: { value: EmailPresentation; choose(method: EmailMethod): void; cancel(): void; t(key: string): string } = $props();
</script>
<div class="modal-backdrop" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) cancel(); }}>
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="email-method-title" tabindex="-1" use:dialogFocus>
    <h2 id="email-method-title">{t('How should Leafloom email your drafts?')}</h2>
    <div class="email-choices">
      <button disabled={value.busy} onclick={() => choose('gmail')}><strong>Gmail</strong><span>{t('Opens a pre-filled compose window in your browser. Leafloom shows you the PDF to drag into it.')}</span></button>
      <button disabled={value.busy} onclick={() => choose('mail')}><strong>Apple Mail</strong><span>{t('The PDF is attached and addressed. Just hit send.')}</span></button>
    </div>
    <div class="modal-actions"><button disabled={value.busy} onclick={cancel}>{t('Cancel')}</button></div>
  </div>
</div>
<style>
  .email-choices { display: grid; gap: 10px; margin-top: 14px; }
  .email-choices button { text-align: left; padding: 14px; }
  strong, span { display: block; }
  span { margin-top: 5px; font-size: 12px; line-height: 1.5; }
</style>
