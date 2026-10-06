import { legacyScreenplayClasses } from '@leafloom/document-contracts';
import { Fragment, type Node as PMNode } from 'prosemirror-model';
import { importHTML, schema } from './codec';
/** One author paragraph boundary is one line; empty paragraphs supply blank lines. */
export function clipboardText(content: Fragment): string {
  return content.textBetween(0, content.size, '\n', '⚑');
}
/** Clipboard prose retains emphasis and placeholders, with block edges as paragraphs. */
export function clipboardHTML(document: Document, html: string, screenplay = false): PMNode {
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content
    .querySelectorAll('script,style,meta,link,iframe,object,embed,img,svg,math,table,head,title')
    .forEach((node) => node.remove());
  const holder = document.createElement('div');
  holder.appendChild(template.content);
  for (const element of Array.from(holder.querySelectorAll('*')))
    for (const attribute of Array.from(element.attributes))
      if (attribute.name.startsWith('on')) element.removeAttribute(attribute.name);
  // Script paste reads author paragraphs, not their clipboard container.
  const source = screenplay
    ? Array.from(holder.querySelectorAll('p'), (paragraph) => paragraph.outerHTML).join('')
    : holder.innerHTML;
  const parsed = importHTML(document, source),
    paragraphs: PMNode[] = [];
  parsed.descendants((node) => {
    if (!node.isTextblock) return;
    let runs: PMNode[] = [];
    const flush = () => {
      const first = runs.findIndex((run) => run.isText),
        last = runs.findLastIndex((run) => run.isText);
      runs = runs.flatMap((run, index) => {
        if (!run.isText) return [run];
        let text = screenplay ? run.text!.replace(/\u00a0/g, ' ') : run.text!.replace(/\s+/g, ' ');
        if (!screenplay && index === first) text = text.replace(/^\s+/, '');
        if (!screenplay && index === last) text = text.replace(/\s+$/, '');
        return text
          ? [
              schema.text(
                text,
                run.marks.filter((mark) =>
                  ['bold', 'italic', 'underline', 'strike'].includes(mark.type.name),
                ),
              ),
            ]
          : [];
      });
      if (screenplay || runs.some((run) => (run.isText && run.text!.trim()) || run.type.name === 'placeholder'))
        paragraphs.push(
          schema.nodes.paragraph.create(
            screenplay
              ? {
                  screenplay: node.attrs.screenplay ?? 'action',
                  class:
                    legacyScreenplayClasses[
                      node.attrs.screenplay as keyof typeof legacyScreenplayClasses
                    ] ?? legacyScreenplayClasses.action,
                }
              : null,
            Fragment.fromArray(runs),
          ),
        );
      runs = [];
    };
    node.forEach((child) => {
      if (child.type.name === 'hard_break') { if (!screenplay) flush(); }
      else if (child.isText || !screenplay && child.type.name === 'placeholder') runs.push(child);
    });
    flush();
    return false;
  });
  return schema.nodes.doc.create(
    null,
    paragraphs.length ? paragraphs : schema.nodes.paragraph.create(),
  );
}
