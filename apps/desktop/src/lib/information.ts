import type { UpdateStatusValue } from '@leafloom/desktop-host';
export type InformationPresentation = {
  kind: 'help' | 'shortcuts' | 'about' | 'update';
  title: string;
  version: string;
  vim?: boolean;
  update?: UpdateStatusValue;
};
export type HelpBlock = { heading: number; text: string };
export function helpBlocks(source: string): HelpBlock[] {
  return source
    .trim()
    .split(/\n\s*\n/)
    .map((text) => {
      const match = /^(#{1,3}) (.*)$/.exec(text);
      return match ? { heading: match[1].length, text: match[2] } : { heading: 0, text };
    });
}
export function helpInline(source: string): { text: string; strong: boolean }[] {
  return source
    .split(/(\*\*[^*]+\*\*)/)
    .filter(Boolean)
    .map((text) => ({
      text: text.startsWith('**') ? text.slice(2, -2) : text,
      strong: text.startsWith('**'),
    }));
}
export function shortcutSections(IS_MAC: boolean, vimEnabled = false) {
  const tk = (text: string) => text;
  const K = (mac: string, other: string) => (IS_MAC ? mac : other);
  const KPH = K('⌘⇧X', 'Ctrl+Shift+X'),
    KDA = K('⌘⇧D', 'Ctrl+Shift+D'),
    KHELP = K('⌘/', 'Ctrl+/');
  return [
    {
      title: tk('Writing'),
      rows: [
        [tk('Enter ×2'), tk('Insert a section break')],
        [tk('Enter ×3'), tk('Start a new chapter')],
        [
          K('⇧Enter', 'Shift+Enter'),
          tk('Start or continue a poetry paragraph'),
          tk('Also works from a chapter heading.'),
        ],
        [KPH, tk('Insert a placeholder note')],
        [KDA, tk('Move selected text to Darlings')],
      ],
    },
    {
      title: tk('Formatting'),
      rows: [
        [
          ['*…*', '**…**', '***…***'],
          tk('Italic, bold, the Markdown way'),
          tk(
            'Typed around a word (or pasted). Undo right after keeps the asterisks. Format → Markdown Emphasis turns it off.',
          ),
        ],
        [K('⌘⇧L', 'Ctrl+Shift+L'), tk('Align paragraph left')],
        [K('⌘⇧C', 'Ctrl+Shift+C'), tk('Center paragraph')],
        [K('⌘⇧R', 'Ctrl+Shift+R'), tk('Align paragraph right')],
        [K('⌘⇧J', 'Ctrl+Shift+J'), tk('Justify paragraph')],
        [K('⌘+', 'Ctrl++'), tk('Larger text')],
        [K('⌘−', 'Ctrl+−'), tk('Smaller text')],
        [K('⌘0', 'Ctrl+0'), tk('Reset text size and page zoom')],
      ],
    },
    {
      title: tk('Outline'),
      rows: [
        [
          'Tab',
          tk('Turn a chapter into a section'),
          tk('Only empty chapters after the first chapter.'),
        ],
        [K('⇧Tab', 'Shift+Tab'), tk('Turn a section into a chapter')],
      ],
    },
    {
      title: tk('Editing'),
      rows: [
        [K('⌘⌥⇧V', 'Ctrl+Shift+V'), tk('Paste and match style')],
        [K('⌘F', 'Ctrl+F'), tk('Find and replace')],
        [K('⌘;', 'Ctrl+;'), tk('Toggle spellcheck pass')],
      ],
    },
    {
      title: tk('App & files'),
      rows: [
        [KHELP, tk('Keyboard shortcuts')],
        [K('⌘,', 'Ctrl+,'), tk('Goals and writing sprints')],
        [K('⌘⇧I', 'Ctrl+Shift+I'), tk('Import manuscripts')],
        [K('⌘E', 'Ctrl+E'), tk('Email a draft to yourself')],
      ],
    },
    {
      title: tk('View & window'),
      rows: [
        [[K('⌘⇧F', 'Ctrl+Shift+F'), K('⌘Enter', 'Ctrl+Enter')], tk('Toggle full screen')],
        [K('⌘⇧T', 'Ctrl+Shift+T'), tk('Toggle typewriter scrolling')],
        [K('⌘⇧O', 'Ctrl+Shift+O'), tk('Cycle focus mode'), tk('Off → paragraph → sentence → off.')],
        [K('⌥⌘↓', 'Ctrl+Alt+↓'), tk('Go to the next chapter')],
        [K('⌥⌘↑', 'Ctrl+Alt+↑'), tk('Go to the previous chapter')],
        [
          ['F6', K('⌃Tab', 'Ctrl+Tab')],
          tk('Move between the page, the chapters, the notes and the bottom bar'),
          tk(
            'Add Shift to go back. Esc returns to the page. On the shelf: the books, then the header.',
          ),
        ],
        ...(IS_MAC
          ? [
              ['⌘H', tk('Hide Leafloom')],
              ['⌘⌥H', tk('Hide other apps')],
            ]
          : []),
      ],
    },
    // only for writers who turned them on (View → Vim Keys)
    ...(vimEnabled
      ? [
          {
            title: tk('Vim keys'),
            rows: [
              [
                'Esc',
                tk('Stop writing and move around the page'),
                tk('i, a or o goes back to writing.'),
              ],
              ['h j k l', tk('Left, down, up, right')],
              ['w b e', tk('Next word, previous word, end of word')],
              ['0 $', tk('Start or end of the line')],
              ['( )', tk('Previous or next sentence')],
              ['{ }', tk('Previous or next paragraph')],
              ['gg G', tk('Top or end of the chapter')],
              ['[[ ]]', tk('Previous or next chapter')],
              [K('⌃d ⌃u', 'Ctrl+d Ctrl+u'), tk('Down or up half a screen')],
              ['i a I A', tk('Write here, after, at the start or end of the line')],
              ['o O', tk('Write in a new paragraph below or above')],
              ['v', tk('Select'), tk('Move to stretch it, then y to copy or d to cut.')],
              ['x', tk('Delete the letter under the caret')],
              ['/', tk('Find')],
            ],
          },
        ]
      : []),
  ];
}
