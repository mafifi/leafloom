import { get, writable } from 'svelte/store';

export type OnboardingDraft = {
  name: string;
  pen: string;
  style: 'pantser' | 'plotter';
  body: string;
  dropcap: string;
};

export class OnboardingViewModel {
  private readonly draft = writable({
    step: 1,
    name: '',
    pen: '',
    style: 'pantser' as 'pantser' | 'plotter',
    body: '',
    dropcap: 'literary',
    previewBody: '',
    previewCap: '',
  });
  readonly state = { subscribe: this.draft.subscribe };
  private readonly defaultBody: () => string;
  private readonly finish: (draft: OnboardingDraft) => void | Promise<void>;

  constructor(defaultBody: () => string, finish: (draft: OnboardingDraft) => void | Promise<void>) {
    this.defaultBody = defaultBody;
    this.finish = finish;
  }

  edit(field: 'name' | 'pen', value: string): void {
    this.draft.update((draft) => ({ ...draft, [field]: value }));
  }

  chooseStyle(style: OnboardingDraft['style']): void {
    this.draft.update((draft) => ({ ...draft, style, step: 2 }));
  }

  preview(field: 'body' | 'dropcap', value: string): void {
    this.draft.update((draft) => ({
      ...draft,
      [field === 'body' ? 'previewBody' : 'previewCap']: value,
    }));
  }

  chooseFont(field: 'body' | 'dropcap', value: string): void {
    this.draft.update((draft) => ({
      ...draft,
      [field]: value,
      [field === 'body' ? 'previewBody' : 'previewCap']: '',
    }));
  }

  submit(): void | Promise<void> {
    const draft = get(this.draft);
    return this.finish({
      name: draft.name,
      pen: draft.pen,
      style: draft.style,
      body: draft.body || this.defaultBody(),
      dropcap: draft.dropcap,
    });
  }
}
