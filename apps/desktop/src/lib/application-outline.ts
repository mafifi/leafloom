import { type EditorPort, type OutlineTarget } from '@leafloom/editor-contracts';
import { z } from 'zod';
import type { AppState } from './application';


export interface ApplicationOutlineContext {
  writable: () => boolean;
  value: AppState;
  prompt: (
    title: string,
    value?: string,
    label?: string,
    confirm?: string,
  ) => Promise<string | null>;
  editor: EditorPort | null;
  preference: (key: string, value: unknown) => Promise<void>;
  rendered: () => Promise<void>;
  editOutline: (target: OutlineTarget, value: string) => void;
  focusOutline: (target?: OutlineTarget) => void;
  patch: (patch: Partial<AppState>) => void;
}

export async function renameTab(
  context: ApplicationOutlineContext,
  tab: 'notes' | 'outline',
): Promise<void> {
  if (!context.writable()) return;
  const names = z.record(z.string(), z.string()).catch({}).parse(context.value.book?.tabNames);
  const title = await context.prompt(
    'Rename tab',
    names[tab] ?? (tab === 'notes' ? 'Notes' : 'Outline'),
    'New tab name',
  );
  if (!title?.trim()) return;
  context.editor?.updateMetadata({ tabNames: { ...names, [tab]: title.trim() } });
  const defaults = z
    .record(z.string(), z.string())
    .catch({})
    .parse(context.value.library.tabDefaults);
  await context.preference('tabDefaults', { ...defaults, [tab]: title.trim() });
}

export function focusOutline(context: ApplicationOutlineContext, target?: OutlineTarget): void {
  if (!target) return;
  void context.rendered().then(() => {
    const selector = target.sectionId
      ? `.ol-line[data-sec-id="${CSS.escape(target.sectionId)}"] .ol-text`
      : `.ol-chapter[data-ch-id="${CSS.escape(target.chapterId)}"] .ol-text`;
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) return;
    element.focus();
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
}

export function editOutline(
  context: ApplicationOutlineContext,
  target: OutlineTarget,
  value: string,
): void {
  if (
    !context.editor?.outlineRows.some(
      (row) => row.chapterId === target.chapterId && row.sectionId === target.sectionId,
    )
  )
    return;
  if (context.writable())
    context.editor?.editOutlineRow(
      {
        chapterId: target.chapterId,
        ...(target.sectionId ? { sectionId: target.sectionId } : {}),
      },
      value.trim(),
    );
}

export function outlineKey(
  context: ApplicationOutlineContext,
  target: OutlineTarget,
  event: KeyboardEvent,
): void {
  if (!context.writable() || !context.editor) return;
  target = {
    chapterId: target.chapterId,
    ...(target.sectionId ? { sectionId: target.sectionId } : {}),
  };
  const element = event.currentTarget as HTMLElement;
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault();
    const rows = context.editor.outlineRows.filter((row) => row.kind !== 'part');
    const index = rows.findIndex(
      (row) => row.chapterId === target.chapterId && row.sectionId === target.sectionId,
    );
    context.editOutline(target, element.textContent ?? '');
    context.focusOutline(rows[index + (event.key === 'ArrowUp' ? -1 : 1)]);
    return;
  }
  if (
    event.key !== 'Enter' &&
    event.key !== 'Tab' &&
    !(event.key === 'Backspace' && !element.textContent?.trim())
  )
    return;
  event.preventDefault();
  event.stopPropagation();
  const selection = window.getSelection();
  let before = false;
  if (element.textContent?.trim() && selection?.isCollapsed && selection.rangeCount) {
    const prefix = selection.getRangeAt(0).cloneRange();
    prefix.selectNodeContents(element);
    prefix.setEnd(selection.anchorNode!, selection.anchorOffset);
    before = prefix.toString().length === 0;
  }
  context.editOutline(target, element.textContent ?? '');
  if (event.key === 'Enter') context.focusOutline(context.editor.outlineEnter(target, before));
  else if (event.key === 'Tab') {
    const result = context.editor.outlineIndent(target, event.shiftKey);
    if (result.notice) context.patch({ hint: result.notice });
    context.focusOutline(result.target);
  } else
    context.focusOutline(
      context.editor.outlineDelete({
        chapterId: target.chapterId,
        ...(target.sectionId ? { sectionId: target.sectionId } : {}),
      }),
    );
}
