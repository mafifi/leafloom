<script lang="ts">
  import { OnboardingViewModel, type OnboardingDraft } from './lib/onboarding-view-model';
  import type { FontChoicesValue } from './lib/font-choices';
  let {
    fonts,
    t,
    complete,
  }: {
    fonts: FontChoicesValue;
    t: (key: string) => string;
    complete: (draft: OnboardingDraft) => void | Promise<void>;
  } = $props();
  const model = new OnboardingViewModel(
    () => fonts.defaultBody,
    (draft) => complete(draft),
  );
  const form = model.state;
  const selectedBody = $derived($form.body || fonts.defaultBody);
</script>

<div id="firstrun" class="modal-backdrop">
  <div class="modal">
    <div id="fr-step1" hidden={$form.step !== 1}>
      <h2>{t('Welcome to Leafloom')}</h2>
      <p>{t('A few quick questions, then the page is yours.')}</p>
      <label
        >{t('Your name')}<input
          id="fr-name"
          placeholder={t('Anonymous')}
          value={$form.name}
          oninput={(event) => model.edit('name', event.currentTarget.value)}
        /></label
      >
      <label
        >{t('Pen name')}<span class="soft">(optional)</span><input
          id="fr-pen"
          value={$form.pen}
          oninput={(event) => model.edit('pen', event.currentTarget.value)}
        /></label
      >
      <div class="fr-style">
        <p>{t('Are you a pantser or a plotter?')}</p>
        <div class="fr-choices">
          <button
            class="fr-choice"
            data-style="pantser"
            onclick={() => model.chooseStyle('pantser')}
            ><strong>{t('Pantser')}</strong><span>{t('I discover the story as I write.')}</span
            ></button
          >
          <button
            class="fr-choice"
            data-style="plotter"
            onclick={() => model.chooseStyle('plotter')}
            ><strong>{t('Plotter')}</strong><span>{t('I outline first.')}</span></button
          >
        </div>
      </div>
    </div>
    <div id="fr-step2" hidden={$form.step !== 2}>
      <h2>{t('How should the page look?')}</h2>
      <p>{t('Pick a typeface and a drop-cap style.')}</p>
      <div
        id="fr-sample"
        style={`--body-font:${fonts.bodyStacks[$form.previewBody || selectedBody]};--dropcap-font:${fonts.dropcaps[$form.previewCap || $form.dropcap]}`}
      >
        <p id="fr-sample-text">
          It was the best of times, it was the worst of times, it was the age of wisdom, it was the
          age of foolishness…
        </p>
      </div>
      <p>{t('Body typeface')}</p>
      <div id="fr-bodyfonts" class="fr-fontrow">
        {#each fonts.body as font}
          <button
            class="fr-font"
            class:sel={font === selectedBody}
            style={`font-family:${fonts.bodyStacks[font]}`}
            onmouseenter={() => model.preview('body', font)}
            onmouseleave={() => model.preview('body', '')}
            onclick={() => model.chooseFont('body', font)}>{font}</button
          >
        {/each}
      </div>
      <p>{t('Drop cap')}</p>
      <div id="fr-dropcaps" class="fr-fontrow">
        {#each ['literary', 'fantasy', 'scifi'] as cap}
          <button
            class="fr-font"
            class:sel={cap === $form.dropcap}
            onmouseenter={() => model.preview('dropcap', cap)}
            onmouseleave={() => model.preview('dropcap', '')}
            onclick={() => model.chooseFont('dropcap', cap)}
            ><span class="fr-cap" style={`font-family:${fonts.dropcaps[cap]}`}>{t('A')}</span
            >{cap === 'scifi' ? 'Sci-Fi' : cap[0].toUpperCase() + cap.slice(1)}</button
          >
        {/each}
      </div>
      <div style="text-align:right;margin-top:20px">
        <button id="fr-done" class="btn-gold" onclick={() => model.submit()}
          >{t('Start writing')}</button
        >
      </div>
    </div>
  </div>
</div>
