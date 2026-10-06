// @vitest-environment jsdom
import { it, expect, vi } from 'vitest';
import {
  ReadAloud,
  type ReadingSentence,
  type LocalSpeechPort,
} from '../../apps/desktop/src/lib/read-aloud';
import { BrowserReadAloud } from '../../apps/desktop/src/lib/browser-read-aloud';
it('local sentence progress chooses the exact book voice, cancels stale callbacks and leaves the reached caret', async () => {
  const sentences: ReadingSentence[] = [
    { id: 'a', text: 'First sentence.', from: 0, to: 15 },
    { id: 'b', text: 'Second sentence.', from: 0, to: 16 },
  ];
  const utterances: {
    text: string;
    id: string;
    events: { start(): void; end(): void; error(): void };
  }[] = [];
  const caret = vi.fn(),
    highlight = vi.fn(),
    clearHighlight = vi.fn(),
    cancel = vi.fn();
  const speech: LocalSpeechPort = {
    ready: async () => true,
    voices: () => [
      { id: 'network', language: 'fr-CA', default: true, local: false },
      { id: 'english', language: 'en-US', default: true, local: true },
      { id: 'french', language: 'fr-CA', default: false, local: true },
    ],
    speak: (text, voice, events) => utterances.push({ text, id: voice.id, events }),
    cancel,
  };
  const reader = new ReadAloud({
    speech,
    language: () => 'fr-CA',
    unavailable: vi.fn(),
    document: {
      sentences: () => sentences,
      connected: () => true,
      highlight,
      clearHighlight,
      caret,
    },
  });
  await reader.toggle();
  expect(utterances[0]).toMatchObject({ text: 'First sentence.', id: 'french' });
  utterances[0]!.events.start();
  utterances[0]!.events.end();
  utterances[1]!.events.start();
  reader.stop(true);
  expect(caret).toHaveBeenCalledWith(sentences[1]);
  expect(clearHighlight).toHaveBeenCalled();
  utterances[1]!.events.end();
  expect(utterances).toHaveLength(2);
  expect(reader.reading).toBe(false);
});
it('remote-only voices and unavailable speech stay nonblocking and never touch the document', async () => {
  const unavailable = vi.fn(),
    sentences = vi.fn(() => []),
    highlight = vi.fn();
  const speech: LocalSpeechPort = {
    ready: async () => true,
    voices: () => [{ id: 'network', language: 'en-US', default: true, local: false }],
    speak: vi.fn(),
    cancel: vi.fn(),
  };
  const reader = new ReadAloud({
    speech,
    language: () => 'en',
    unavailable,
    document: {
      sentences,
      connected: () => true,
      highlight,
      clearHighlight: vi.fn(),
      caret: vi.fn(),
    },
  });
  await reader.toggle();
  expect(unavailable).toHaveBeenCalledOnce();
  expect(sentences).not.toHaveBeenCalled();
  expect(speech.speak).not.toHaveBeenCalled();
  expect(reader.reading).toBe(false);
});
it('browser speech reads from inside the caret sentence across chapters and typing stops without moving the author caret or saving HTML marks', async () => {
  document.body.innerHTML =
    '<div class="chapter-body" contenteditable="true"><p>Opening. <em>Second sentence.</em></p></div><div class="chapter-body" contenteditable="true"><p>Third sentence.</p></div>';
  const paragraph = document.querySelectorAll('p')[0]!,
    text = paragraph.querySelector('em')!.firstChild!,
    range = document.createRange();
  range.setStart(text, 3);
  range.collapse(true);
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
  const original = document.body.innerHTML,
    events: { start(): void; end(): void; error(): void }[] = [],
    said: string[] = [];
  const speech: LocalSpeechPort = {
    ready: async () => true,
    voices: () => [{ id: 'local', language: 'en-US', default: true, local: true }],
    speak: (text, _voice, event) => {
      said.push(text);
      events.push(event);
      event.start();
    },
    cancel: vi.fn(),
  };
  const reader = new BrowserReadAloud(
    { active: () => true, language: () => 'en', hint: vi.fn(), t: (key) => key },
    speech,
  );
  try {
    await reader.toggle();
    expect(said).toEqual(['Second sentence.']);
    events[0]!.end();
    expect(said).toEqual(['Second sentence.', 'Third sentence.']);
    const typing = new KeyboardEvent('keydown', { key: 'x', code: 'KeyX', cancelable: true });
    expect(reader.handleKey(typing)).toBe(false);
    expect(typing.defaultPrevented).toBe(false);
    expect(reader.reading).toBe(false);
    const selection = window.getSelection()!;
    expect(selection.anchorNode).toBe(text);
    expect(selection.anchorOffset).toBe(3);
    expect(document.body.innerHTML).toBe(original);
  } finally {
    reader.dispose();
    document.body.innerHTML = '';
  }
});
it('stopping pending voice discovery prevents a late voice event from reading a closed book', async () => {
  let ready!: (value: boolean) => void;
  const speak = vi.fn(),
    reader = new ReadAloud({
      speech: {
        ready: () =>
          new Promise((resolve) => {
            ready = resolve;
          }),
        voices: () => [{ id: 'local', language: 'en', default: true, local: true }],
        speak,
        cancel: vi.fn(),
      },
      language: () => 'en',
      unavailable: vi.fn(),
      document: {
        sentences: () => [{ id: 'a', text: 'Private words.', from: 0, to: 14 }],
        connected: () => true,
        highlight: vi.fn(),
        clearHighlight: vi.fn(),
        caret: vi.fn(),
      },
    });
  const pending = reader.toggle();
  reader.stop(false);
  ready(true);
  await pending;
  expect(speak).not.toHaveBeenCalled();
});

it('typing in a title or modal field stops speech without redirecting field input into the manuscript', async () => {
  document.body.innerHTML =
    '<div class="chapter-body" contenteditable="true"><p>Manuscript sentence.</p></div><input id="title" value="Retain title">';
  const paragraph = document.querySelector('p')!,
    range = document.createRange();
  range.setStart(paragraph.firstChild!, 3);
  range.collapse(true);
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
  const speech: LocalSpeechPort = {
    ready: async () => true,
    voices: () => [{ id: 'local', language: 'en', default: true, local: true }],
    speak: (_text, _voice, event) => event.start(),
    cancel: vi.fn(),
  };
  const reader = new BrowserReadAloud(
    { active: () => true, language: () => 'en', hint: vi.fn(), t: (key) => key },
    speech,
  );
  try {
    await reader.toggle();
    const input = document.querySelector<HTMLInputElement>('input')!;
    input.focus();
    input.setSelectionRange(2, 2);
    input.addEventListener('keydown', (event) => reader.handleKey(event));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', code: 'KeyX', bubbles: true }));
    expect(reader.reading).toBe(false);
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(2);
    expect(input.value).toBe('Retain title');
    expect(paragraph.textContent).toBe('Manuscript sentence.');
  } finally {
    reader.dispose();
    document.body.innerHTML = '';
  }
});
