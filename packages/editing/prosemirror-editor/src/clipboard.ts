import { Fragment, type Node as PMNode } from 'prosemirror-model';
import { importHTML, schema } from './codec';
/** Clipboard prose retains emphasis and placeholders, with block edges as paragraphs. */
export function clipboardHTML(document: Document, html: string): PMNode {
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
  const parsed = importHTML(document, holder.innerHTML),
    paragraphs: PMNode[] = [];
  parsed.descendants((node) => {
    if (!node.isTextblock) return;
    let runs: PMNode[] = [];
    const flush = () => {
      const first = runs.findIndex((run) => run.isText),
        last = runs.findLastIndex((run) => run.isText);
      runs = runs.flatMap((run, index) => {
        if (!run.isText) return [run];
        let text = run.text!.replace(/\s+/g, ' ');
        if (index === first) text = text.replace(/^\s+/, '');
        if (index === last) text = text.replace(/\s+$/, '');
        return text
          ? [
              schema.text(
                text,
                run.marks.filter(
                  (mark) => mark.type.name === 'bold' || mark.type.name === 'italic',
                ),
              ),
            ]
          : [];
      });
      if (runs.some((run) => (run.isText && run.text!.trim()) || run.type.name === 'placeholder'))
        paragraphs.push(schema.nodes.paragraph.create(null, Fragment.fromArray(runs)));
      runs = [];
    };
    node.forEach((child) => {
      if (child.type.name === 'hard_break') flush();
      else if (child.isText || child.type.name === 'placeholder') runs.push(child);
    });
    flush();
    return false;
  });
  return schema.nodes.doc.create(
    null,
    paragraphs.length ? paragraphs : schema.nodes.paragraph.create(),
  );
}
