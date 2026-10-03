<script lang="ts">
  import { dialogFocus } from './lib/dialog-focus';
  import type { GoalsDraft, GoalsPresentation } from './lib/goals';
  let {
    presentation,
    actions,
    t,
  }: {
    presentation: GoalsPresentation;
    actions: { edit(field: keyof GoalsDraft, value: string): void; close(): void; sprint(): void };
    t: (key: string, args?: Record<string, string | number>) => string;
  } = $props();
  const focus = (node: HTMLElement) => {
    queueMicrotask(() => node.focus());
  };
  const line = $derived(
    presentation.days
      .map(
        (day, index) =>
          `${index ? 'L' : 'M'}${(6 + index * (508 / 30) + 508 / 30 / 2).toFixed(1)},${(194 - (day.total / presentation.maxTotal) * 168).toFixed(1)}`,
      )
      .join(' '),
  );
</script>

<div
  class="modal-backdrop"
  role="dialog"
  aria-modal="true"
  aria-label={t('Goals')}
  tabindex="-1"
  use:dialogFocus
  use:focus
  onclick={(event) => {
    if (event.target === event.currentTarget) actions.close();
  }}
  onkeydown={(event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      actions.close();
    }
  }}
>
  <div class="modal goals-modal" style={`width:${presentation.title ? 580 : 380}px`}>
    <h2>
      {presentation.title ? t('{title} — progress', { title: presentation.title }) : t('Goals')}
    </h2>
    {#if presentation.title}
      <div class="stats-nums">
        <div>
          <div class="big">{presentation.total.toLocaleString()}</div>
          <div class="lbl">{t('total words')}</div>
        </div>
        <div>
          <div class="big">{presentation.today.toLocaleString()}</div>
          <div class="lbl">{t('today')}</div>
        </div>
        <div>
          <div class="big">
            {Number(presentation.book)
              ? Math.min(100, Math.round((presentation.total / Number(presentation.book)) * 100)) +
                '%'
              : '—'}
          </div>
          <div class="lbl">{t('of book goal')}</div>
        </div>
      </div>
      <svg
        id="stats-chart"
        width="520"
        height="200"
        viewBox="0 0 520 200"
        role="img"
        aria-label={t('Words written over the last 30 days')}
      >
        {#each presentation.days as day, index}<rect
            x={6 + index * (508 / 30)}
            y={194 - Math.round((day.daily / presentation.maxDaily) * 90)}
            width={508 / 30 - 2}
            height={Math.round((day.daily / presentation.maxDaily) * 90)}
            rx="1.5"
            fill="#3d5a4f"><title>{day.date}: {day.daily}</title></rect
          >{/each}
        <path d={line} fill="none" stroke="#c9a86a" stroke-width="2" />
        {#if Number(presentation.book)}<line
            x1="6"
            x2="514"
            y1={194 - (Number(presentation.book) / presentation.maxTotal) * 168}
            y2={194 - (Number(presentation.book) / presentation.maxTotal) * 168}
            stroke="#c9a86a"
            stroke-dasharray="5,4"
            opacity=".7"
          />{/if}
      </svg>
      <div class="stats-legend">
        <span>{t('30 days ago')}</span><span class="sl-daily">▮ {t('daily words')}</span><span
          >— {t('total')}</span
        ><span>{t('today')}</span>
      </div>
    {/if}
    <div class="stats-row stats-goals">
      <label
        >{t('Daily goal')}
        <input
          id="st-daily"
          type="number"
          min="0"
          value={presentation.daily}
          placeholder="500"
          oninput={(event) => actions.edit('daily', event.currentTarget.value)}
        /></label
      >
      {#if presentation.title}<label
          >{t('Book goal')}
          <input
            id="st-book"
            type="number"
            min="0"
            value={presentation.book}
            placeholder="80000"
            oninput={(event) => actions.edit('book', event.currentTarget.value)}
          /></label
        >{/if}
    </div>
    <div class="stats-row stats-goals">
      <label
        >{t('Day ends at')}
        <select
          id="st-dayends"
          value={presentation.cutoff}
          onchange={(event) => actions.edit('cutoff', event.currentTarget.value)}
          >{#each Array.from({ length: 24 }, (_, hour) => hour) as hour}<option value={hour}
              >{new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(
                new Date(2000, 0, 1, hour),
              )}</option
            >{/each}</select
        ></label
      >
    </div>
    {#if presentation.title}<div class="stats-row stats-goals">
        <label
          >{t('Sprint')}
          <input
            id="st-sprint"
            type="number"
            min="50"
            value={presentation.sprint}
            oninput={(event) => actions.edit('sprint', event.currentTarget.value)}
          />
          {t('words')}</label
        ><button id="st-sprint-btn" class="btn-gold" onclick={() => actions.sprint()}
          >{t(presentation.sprinting ? 'End sprint' : 'Start sprint')}</button
        >
      </div>{/if}
    <div style="text-align:right;margin-top:14px">
      <button class="m-ok btn-gold" onclick={() => actions.close()}>{t('Done')}</button>
    </div>
  </div>
</div>
