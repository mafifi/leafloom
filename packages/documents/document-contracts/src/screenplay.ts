import { z } from 'zod';
export const ScreenplayElement = z.enum([
  'scene-heading',
  'action',
  'character',
  'parenthetical',
  'dialogue',
  'transition',
  'shot',
]);
export type ScreenplayElementValue = z.infer<typeof ScreenplayElement>;
export const ManuscriptMode = z.enum(['prose', 'screenplay']);
export type ManuscriptModeValue = z.infer<typeof ManuscriptMode>;
export const legacyScreenplayClasses: Readonly<Record<ScreenplayElementValue, string>> = {
  'scene-heading': 'sp-heading',
  action: 'sp-action',
  character: 'sp-character',
  parenthetical: 'sp-paren',
  dialogue: 'sp-dialogue',
  transition: 'sp-transition',
  shot: 'sp-shot',
};
export function screenplayElementFromLegacyClass(classes: string): ScreenplayElementValue | null {
  const names = new Set(classes.split(/\s+/));
  const matches = ScreenplayElement.options.filter((element) =>
    names.has(legacyScreenplayClasses[element]),
  );
  return matches.length === 1 ? matches[0] : null;
}
/** Enter follows authored screenplay semantics; empty lines have their own transitions. */
export function nextScreenplayElement(
  element: ScreenplayElementValue,
  empty = false,
): ScreenplayElementValue {
  if (empty)
    return element === 'action' ? 'character' : element === 'parenthetical' ? 'dialogue' : 'action';
  if (element === 'character' || element === 'parenthetical') return 'dialogue';
  return element === 'transition' ? 'scene-heading' : 'action';
}
export function cycleScreenplayElement(
  element: ScreenplayElementValue,
  reverse = false,
): ScreenplayElementValue {
  if (element === 'dialogue') return 'parenthetical';
  if (element === 'parenthetical') return 'dialogue';
  const order: ScreenplayElementValue[] = [
    'action',
    'character',
    'transition',
    'scene-heading',
    'shot',
  ];
  return order[(order.indexOf(element) + (reverse ? order.length - 1 : 1)) % order.length];
}

export const ScreenplayMark = z.enum(['italic', 'bold', 'underline', 'strike']);
export const ScreenplayRun = z.strictObject({ text: z.string(), marks: z.array(ScreenplayMark) });
export const ScreenplayLine = z.strictObject({
  element: ScreenplayElement,
  runs: z.array(ScreenplayRun),
});
export const ScreenplayTitle = z.strictObject({
  title: z.string().default(''),
  author: z.string().default(''),
  credit: z.string().optional(),
  draft: z.string().optional(),
  contact: z.string().optional(),
});
export const ScreenplayScript = z.strictObject({
  title: ScreenplayTitle,
  lines: z.array(ScreenplayLine),
});
export type ScreenplayLineValue = z.infer<typeof ScreenplayLine>;
export type ScreenplayRunValue = z.infer<typeof ScreenplayRun>;
export type ScreenplayScriptValue = z.infer<typeof ScreenplayScript>;
export function inferScreenplayElement(text: string): ScreenplayElementValue {
  const s = text.trim(),
    caps = s.toUpperCase();
  if (/^(?:INT\.?\/EXT|INT\/EXT|I\/E|INT|EXT|EST)(?:\.|\s)/i.test(s)) return 'scene-heading';
  if (
    /^(?:CUT TO:|DISSOLVE TO:|SMASH CUT TO:|MATCH CUT TO:|JUMP CUT TO:|FADE OUT\.|FADE TO BLACK\.|INTERCUT WITH:)$/i.test(
      s,
    ) ||
    (s === caps && /TO:$/.test(s))
  )
    return 'transition';
  const name = s.replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (
    s &&
    s.length <= 38 &&
    s === caps &&
    /\p{Lu}/u.test(s) &&
    name.split(/\s+/).length <= 4 &&
    !/[.!?,;:—–-]$/.test(name)
  )
    return 'character';
  return 'action';
}
