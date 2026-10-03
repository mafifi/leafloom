import { describe, expect, it } from 'vitest';
import { createEditor, $getRoot, $applyNodeReplacement } from 'lexical';
import { ChapterNode, ManuscriptParagraphNode, ManuscriptTextNode } from './nodes';

function engine() { return createEditor({ namespace: 'lexical-provider-test', nodes: [ChapterNode, ManuscriptParagraphNode, ManuscriptTextNode], onError: error => { throw error; } }); }

describe('Lexical canonical node provider', () => {
  it('persists chapter, paragraph, poetry and placeholder identities in actual immutable state', () => {
    const editor = engine();
    editor.update(() => {
      const chapter = $applyNodeReplacement(new ChapterNode('chapter', 'A chapter'));
      const block = $applyNodeReplacement(new ManuscriptParagraphNode('poem', 'poetry'));
      const text = $applyNodeReplacement(new ManuscriptTextNode('A name', 'character-name'));
      text.toggleFormat('bold'); text.toggleFormat('italic'); block.append(text); chapter.append(block); $getRoot().append(chapter);
    }, { discrete: true });
    const exported = editor.getEditorState().toJSON();
    const restored = engine(); restored.setEditorState(restored.parseEditorState(JSON.stringify(exported)));
    restored.getEditorState().read(() => {
      const chapter = $getRoot().getFirstChild() as ChapterNode;
      const block = chapter.getFirstChild() as ManuscriptParagraphNode;
      const text = block.getFirstChild() as ManuscriptTextNode;
      expect(chapter.__chapterId).toBe('chapter'); expect(chapter.__title).toBe('A chapter');
      expect(block.__blockId).toBe('poem'); expect(block.__kind).toBe('poetry');
      expect(text.__placeholder).toBe('character-name'); expect(text.hasFormat('bold')).toBe(true); expect(text.hasFormat('italic')).toBe(true);
    });
  });
  it('preserves IDs when formatting clones state and placeholder metadata when text splits', () => {
    const editor = engine();
    editor.update(() => {
      const chapter = $applyNodeReplacement(new ChapterNode('chapter', 'Title'));
      const block = $applyNodeReplacement(new ManuscriptParagraphNode('block'));
      block.append($applyNodeReplacement(new ManuscriptTextNode('Named person', 'person'))); chapter.append(block); $getRoot().append(chapter);
    }, { discrete: true });
    const before = editor.getEditorState();
    editor.update(() => {
      const block = $getRoot().getFirstChildOrThrow<ChapterNode>().getFirstChildOrThrow<ManuscriptParagraphNode>();
      const text = block.getFirstChildOrThrow<ManuscriptTextNode>();
      const pieces = text.splitText(5); pieces[0].toggleFormat('bold');
    }, { discrete: true });
    expect(editor.getEditorState()).not.toBe(before);
    editor.getEditorState().read(() => {
      const block = $getRoot().getFirstChildOrThrow<ChapterNode>().getFirstChildOrThrow<ManuscriptParagraphNode>();
      expect(block.__blockId).toBe('block');
      expect(block.getAllTextNodes().map(node => (node as ManuscriptTextNode).__placeholder)).toEqual(['person', 'person']);
    });
    before.read(() => expect($getRoot().getTextContent()).toBe('Named person'));
  });
});
