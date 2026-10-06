import type { EditorPort } from '@leafloom/editor-contracts';
import { storyKinds } from '@leafloom/document-contracts';
export function pagePosition(editor: EditorPort, chapterId: string | null) {
 const totalWords = editor.chapters.filter(c => storyKinds.some(kind=>kind===c.kind)).reduce((n,c)=>n+editor.wordCountFor(c.id),0);
 const total = Math.max(1, Math.ceil(totalWords / 250));
 return {total, page: Math.min(total, Math.floor((chapterId ? editor.wordsBeforeCaret(chapterId) : 0) / 250) + 1)};
}
