import { type HostMethod, type HostPayload } from '@leafloom/desktop-host';
import { type Annotation, type EditorPort } from '@leafloom/editor-contracts';
import { Library, type LibraryValue } from '@leafloom/library';
import { z } from 'zod';
import type { AppState } from './application';
import { normalizeSpellingWord } from './spelling-tokens';
import { SpellingViewModel } from './spelling-view-model';


export interface ApplicationSpellingContext {
  editor: EditorPort | null;
  value: AppState;
  spellingMenuGeneration: number;
  effectiveSpellLanguage: string;
  spellLanguageGeneration: number;
  request: <M extends HostMethod>(method: M, payload: HostPayload<M>) => Promise<unknown>;
  patch: (patch: Partial<AppState>) => void;
  writable: () => boolean;
  updateLibrary: (value: LibraryValue, history?: boolean) => Promise<void>;
  spellingViewModel: SpellingViewModel;
}

export async function spellingMenu(
  context: ApplicationSpellingContext,
  target: Annotation & { text: string; x: number; y: number },
): Promise<void> {
  if (target.kind !== 'spelling' || !context.editor || !context.value.spellOn) return;
  const editor = context.editor;
  const passage = editor.passageRows().find((row) => row.id === target.passageId);
  if (!passage || passage.text.slice(target.from, target.to) !== target.text) return;
  const text = passage.text,
    generation = ++context.spellingMenuGeneration;
  const language = context.effectiveSpellLanguage,
    languageGeneration = context.spellLanguageGeneration;
  const valid = () =>
    context.editor === editor &&
    context.value.spellOn &&
    generation === context.spellingMenuGeneration &&
    languageGeneration === context.spellLanguageGeneration &&
    language === context.effectiveSpellLanguage &&
    editor.passageRows().find((row) => row.id === target.passageId)?.text === text &&
    editor.annotations.some(
      (row) =>
        row.kind === 'spelling' &&
        row.passageId === target.passageId &&
        row.from === target.from &&
        row.to === target.to,
    );
  if (target.correction !== undefined) {
    const correction = target.correction;
    context.patch({ menu: { allowShortcuts: true, x: target.x, y: target.y, items: [{
      label: correction, localize: false, run: () => {
        if (context.writable() && valid()) editor.replacePassageText(target.passageId, target.from, target.to, correction);
      },
    }] } });
    return;
  }
  const suggestions = z
    .array(z.string())
    .parse(
      await context.request('spellSuggest', { word: normalizeSpellingWord(target.text), language }),
    );
  if (!valid()) return;
  context.patch({
    menu: {
      allowShortcuts: true,
      x: target.x,
      y: target.y,
      items: [
        ...(!suggestions.length ? [{ label: 'No suggestions', disabled: true, run() {} }] : []),
        ...suggestions.map((word) => ({
          label: word,
          localize: false,
          run: () => {
            if (context.writable() && valid())
              editor.replacePassageText(target.passageId, target.from, target.to, word);
          },
        })),
        {
          label: 'Learn “' + target.text + '”',
          run: async () => {
            if (!valid()) return;
            const existing = z.array(z.string()).catch([]).parse(context.value.library.customWords);
            await context.updateLibrary(
              Library.parse({
                ...context.value.library,
                customWords: [...new Set([...existing, normalizeSpellingWord(target.text)])],
              }),
            );
            await context.request('spellLearn', {
              word: normalizeSpellingWord(target.text),
              language,
            });
            await context.spellingViewModel.learned(normalizeSpellingWord(target.text));
          },
        },
      ],
    },
  });
}
