import type { Node as PMNode } from 'prosemirror-model';
import type { ScreenplayElementValue } from '@leafloom/document-contracts';
export type ScriptLine = {
  element: ScreenplayElementValue;
  text: string;
  id: string;
  pos: number;
  size: number;
  chapterId: string;
};
export const headingPrefix = /^(?:INT\.?\/EXT|INT\/EXT|I\/E|INT|EXT|EST)(?:\.|\s)/i;
export const times = [
  'DAY',
  'NIGHT',
  'CONTINUOUS',
  'LATER',
  'MORNING',
  'EVENING',
  'DAWN',
  'DUSK',
  'MOMENTS LATER',
  'SAME TIME',
];
export const transitions = [
  'CUT TO:',
  'DISSOLVE TO:',
  'SMASH CUT TO:',
  'MATCH CUT TO:',
  'JUMP CUT TO:',
  'FADE OUT.',
  'FADE TO BLACK.',
  'INTERCUT WITH:',
];
export const extensions = ['V.O.)', 'O.S.)', 'O.C.)', "CONT'D)"];
export function scriptLines(doc: PMNode): ScriptLine[] {
  const lines: ScriptLine[] = [];
  doc.forEach((section, pos) => {
    if (section.attrs.role !== 'chapter') return;
    section.forEach((paragraph, offset) => {
      if (paragraph.type.name === 'paragraph')
        lines.push({
          element: paragraph.attrs.screenplay ?? 'action',
          text: paragraph.textContent,
          id: String(paragraph.attrs.pid),
          pos: pos + 1 + offset,
          size: paragraph.content.size,
          chapterId: String(section.attrs.id),
        });
    });
  });
  return lines;
}
export const bareName = (text: string) =>
  text
    .replace(/\s*\^\s*$/, '')
    .replace(/\s*\([^)]*\)?\s*$/, '')
    .trim()
    .toUpperCase();
export function looksLikeCharacter(text: string): boolean {
  const value = text.trim(),
    name = value
      .replace(/\s*\^\s*$/, '')
      .replace(/\s*\([^)]*\)\s*$/, '')
      .trim();
  if (
    !value ||
    value.length > 38 ||
    value !== value.toUpperCase() ||
    !/\p{Lu}/u.test(value) ||
    !name ||
    !/\p{Lu}/u.test(name)
  )
    return false;
  if (/[.!?,;:—–-]$/.test(name) && !/^(MR|MRS|MS|DR|ST|JR|SR)\.$/.test(name.split(/\s+/).at(-1)!))
    return false;
  return name.split(/\s+/).length <= 4;
}
export const looksLikeTransition = (text: string) =>
  transitions.includes(text.trim().toUpperCase()) ||
  (!!text.trim() &&
    text.trim() === text.trim().toUpperCase() &&
    /\p{Lu}/u.test(text) &&
    /TO:$/.test(text.trim()));
export function parseHeading(text: string) {
  const match = text.match(/^(INT\.?\/EXT\.?|INT\/EXT\.?|I\/E\.?|INT\.?|EXT\.?|EST\.?)\s+(.*)$/i);
  if (!match) return null;
  const rest = match[2],
    dash = rest.search(/\s+[-–—]\s*/);
  return dash < 0
    ? { location: rest, time: null }
    : { location: rest.slice(0, dash).trim(), time: rest.slice(dash).replace(/^\s+[-–—]\s*/, '') };
}
export function complete(partial: string, pool: string[]): string {
  if (!partial) return '';
  const prefix = partial.toUpperCase();
  if (pool.includes(prefix)) return '';
  return (
    pool
      .find((word) => word.startsWith(prefix) && word.length > prefix.length)
      ?.slice(prefix.length) ?? ''
  );
}
function speakerNames(lines: ScriptLine[], skip: number) {
  const names = new Map<string, { name: string; count: number; last: number }>();
  lines.forEach((line, index) => {
    if (index === skip || line.element !== 'character') return;
    const name = bareName(line.text);
    if (!name) return;
    const seen = names.get(name) ?? { name, count: 0, last: 0 };
    seen.count++;
    seen.last = index;
    names.set(name, seen);
  });
  return [...names.values()]
    .sort((a, b) => b.count - a.count || b.last - a.last)
    .map((value) => value.name);
}
export function suggestedText(lines: ScriptLine[], index: number): string {
  const line = lines[index];
  if (!line) return '';
  if (line.element === 'character') {
    const open = line.text.lastIndexOf('(');
    if (open >= 0 && line.text.indexOf(')', open) < 0)
      return complete(line.text.slice(open + 1), extensions);
    if (line.text.trim()) return complete(line.text.trimStart(), speakerNames(lines, index));
    const voices: string[] = [];
    for (let i = index - 1; i >= 0; i--) {
      if (lines[i].element === 'scene-heading') break;
      if (lines[i].element !== 'character') continue;
      const voice = bareName(lines[i].text);
      if (voice && !voices.includes(voice)) voices.push(voice);
      if (voices.length === 2) return voices[1];
    }
  }
  if (line.element === 'scene-heading') {
    const heading = parseHeading(line.text);
    if (!heading) return '';
    if (heading.time === null) {
      if (/\s$/.test(line.text)) return '';
      const places = lines
        .slice()
        .reverse()
        .filter((other) => other !== line && other.element === 'scene-heading')
        .map((other) => parseHeading(other.text)?.location.trim().toUpperCase())
        .filter((value): value is string => !!value);
      return complete(heading.location, [...new Set(places)]);
    }
    const used = lines
      .filter((other) => other !== line && other.element === 'scene-heading')
      .map((other) => parseHeading(other.text)?.time?.trim().toUpperCase())
      .filter((value): value is string => !!value);
    return complete(heading.time, [...new Set(used), ...times]);
  }
  if (line.element === 'transition')
    return complete(line.text.trimStart(), [
      ...lines
        .filter((other) => other !== line && other.element === 'transition' && other.text.trim())
        .map((other) => other.text.trim().toUpperCase()),
      ...transitions,
    ]);
  return '';
}
export function continuedSpeech(lines: ScriptLine[], index: number): boolean {
  const line = lines[index],
    me = line ? bareName(line.text) : '';
  if (!me || /\(/.test(line.text)) return false;
  let action = false;
  for (let i = index - 1; i >= 0; i--) {
    const previous = lines[i];
    if (previous.element === 'scene-heading' || previous.element === 'transition') return false;
    if (previous.element === 'character') return action && bareName(previous.text) === me;
    if (['action', 'shot'].includes(previous.element) && previous.text.trim()) action = true;
  }
  return false;
}
