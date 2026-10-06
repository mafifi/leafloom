import '../styles/read-aloud.css';
import {
  ReadAloud,
  type ReadingSentence,
  type LocalSpeechPort,
  type ReadingDocumentPort,
} from './read-aloud';
export interface BrowserReadAloudOptions {
  language(): string;
  active(): boolean;
  hint(message: string): void;
  t(key: string): string;
}
function localSpeech(): LocalSpeechPort | null {
  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return null;
  const speech = window.speechSynthesis;
  const available = new Map<string, SpeechSynthesisVoice>();
  return {
    ready: async () => {
      if (speech.getVoices().length) return true;
      return new Promise((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          speech.removeEventListener('voiceschanged', finish);
          resolve(speech.getVoices().length > 0);
        };
        const timer = setTimeout(finish, 1500);
        speech.addEventListener('voiceschanged', finish);
      });
    },
    voices: () =>
      speech.getVoices().map((voice, index) => {
        const id = voice.voiceURI || voice.name + ':' + index;
        available.set(id, voice);
        return { id, language: voice.lang, default: voice.default, local: voice.localService };
      }),
    speak: (text, voice, events) => {
      const utterance = new window.SpeechSynthesisUtterance(text);
      utterance.voice = available.get(voice.id) ?? null;
      utterance.lang = utterance.voice?.lang ?? voice.language;
      utterance.onstart = events.start;
      utterance.onend = events.end;
      utterance.onerror = (event) => {
        if (event.error !== 'interrupted' && event.error !== 'canceled') events.error();
      };
      speech.speak(utterance);
    },
    cancel: () => speech.cancel(),
  };
}
function point(paragraph: HTMLElement, offset: number) {
  const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
  let last: Node | null = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    last = node;
    const length = node.textContent?.length ?? 0;
    if (offset <= length) return { node, offset };
    offset -= length;
  }
  return { node: last ?? paragraph, offset: last ? (last.textContent?.length ?? 0) : 0 };
}
function readingDocument(): ReadingDocumentPort {
  const paragraphs = new Map<string, HTMLElement>();
  let serial = 0;
  const css = () => window.CSS as typeof CSS & { highlights?: Map<string, unknown> };
  return {
    sentences: (language) => {
      paragraphs.clear();
      const selection = window.getSelection(),
        anchor = selection?.anchorNode;
      const element =
        anchor?.nodeType === Node.ELEMENT_NODE ? (anchor as Element) : anchor?.parentElement;
      let first = element?.closest<HTMLElement>('.chapter-body p,#aux-editor p') ?? null,
        offset = 0;
      if (first && anchor && selection) {
        const prefix = document.createRange();
        prefix.selectNodeContents(first);
        prefix.setEnd(anchor, selection.anchorOffset);
        offset = prefix.toString().length;
      }
      if (!first)
        first = document.querySelector<HTMLElement>('#aux-editor:not([hidden]) p,.chapter-body p');
      if (!first) return [];
      const root = first.closest<HTMLElement>('.chapter-body,#aux-editor');
      if (!root) return [];
      const roots = root.classList.contains('chapter-body')
        ? Array.from(document.querySelectorAll<HTMLElement>('.chapter-body')).slice(
            Array.from(document.querySelectorAll('.chapter-body')).indexOf(root),
          )
        : [root];
      const sentences: ReadingSentence[] = [];
      let began = false;
      let segmenter: Intl.Segmenter;
      try {
        segmenter = new Intl.Segmenter(language, { granularity: 'sentence' });
      } catch {
        segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
      }
      for (const body of roots)
        for (const paragraph of body.querySelectorAll<HTMLElement>('p')) {
          if (paragraph === first) began = true;
          if (!began || paragraph.matches('.scene-break,.ghost')) continue;
          const id = 'reading-' + ++serial;
          paragraphs.set(id, paragraph);
          const text = paragraph.textContent ?? '';
          for (const segment of segmenter.segment(text)) {
            const from = segment.index,
              to = from + segment.segment.length;
            if (!segment.segment.trim() || (paragraph === first && to <= offset)) continue;
            sentences.push({ id, text: segment.segment, from, to });
          }
        }
      return sentences;
    },
    connected: (sentence) => paragraphs.get(sentence.id)?.isConnected ?? false,
    highlight: (sentence) => {
      const paragraph = paragraphs.get(sentence.id);
      if (!paragraph) return;
      const start = point(paragraph, sentence.from),
        end = point(paragraph, sentence.to),
        range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      const HighlightCtor = (
        window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }
      ).Highlight;
      if (css()?.highlights && HighlightCtor)
        css().highlights!.set('leafloom-speak', new HighlightCtor(range));
      const scroll = document.getElementById('paper-scroll'),
        box =
          typeof range.getBoundingClientRect === 'function' ? range.getBoundingClientRect() : null;
      if (scroll && box) {
        const view = scroll.getBoundingClientRect();
        if (box.top < view.top + 40 || box.bottom > view.bottom - 60)
          scroll.scrollTop += box.top - view.top - view.height / 3;
      }
    },
    clearHighlight: () => css()?.highlights?.delete('leafloom-speak'),
    caret: (sentence) => {
      const paragraph = paragraphs.get(sentence.id);
      if (!paragraph) return;
      const root =
        paragraph.closest<HTMLElement>('[contenteditable="true"]') ??
        paragraph.closest<HTMLElement>('.chapter-body,#aux-editor');
      root?.focus({ preventScroll: true });
      const start = point(paragraph, sentence.from),
        range = document.createRange();
      range.setStart(start.node, start.offset);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      // Programmatic caret placement must reach the existing surface mapper
      // synchronously: DOM text offsets exclude hard breaks and textless atoms.
      // The observer owns view.posAtDOM; speech never guesses model positions.
      document.dispatchEvent(new Event('selectionchange'));
    },
  };
}
export class BrowserReadAloud {
  private readonly reader: ReadAloud;
  // Stop at capture time, before the editor snapshots the native input range.
  private readonly keyDown = (event: KeyboardEvent) => {
    this.handleKey(event);
  };
  // Source app.js:10026–10032: typing cancels speech without moving the author caret.
  private readonly beforeInput = () => {
    if (this.reader.reading) this.reader.stop(false);
  };
  constructor(
    private readonly options: BrowserReadAloudOptions,
    speech: LocalSpeechPort | null = localSpeech(),
    documentPort: ReadingDocumentPort = readingDocument(),
  ) {
    this.reader = new ReadAloud({
      speech,
      document: documentPort,
      language: () => options.language(),
      unavailable: () => options.hint(options.t('Read aloud needs a voice on this computer')),
    });
    document.addEventListener('keydown', this.keyDown, true);
    document.addEventListener('beforeinput', this.beforeInput, true);
  }
  get reading() {
    return this.reader.reading;
  }
  async toggle() {
    if (this.options.active()) await this.reader.toggle();
  }
  stop(leaveCaret = true) {
    this.reader.stop(leaveCaret);
  }
  handleKey(event: KeyboardEvent): boolean {
    if (
      (event.metaKey || event.ctrlKey) &&
      event.shiftKey &&
      !event.altKey &&
      event.code === 'KeyU' &&
      this.options.active()
    ) {
      event.preventDefault();
      event.stopPropagation();
      void this.toggle();
      return true;
    }
    if (!this.reader.reading || ['Meta', 'Control', 'Shift', 'Alt'].includes(event.key))
      return false;
    this.stop(event.key === 'Escape');
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      return true;
    }
    return false;
  }
  dispose() {
    document.removeEventListener('keydown', this.keyDown, true);
    document.removeEventListener('beforeinput', this.beforeInput, true);
    this.stop(false);
  }
}
