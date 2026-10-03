import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { exportHTML, importHTML, parseHTMLDOM, schema } from '../src/codec';
const document = new JSDOM('<!doctype html>').window.document;
const decode = (html: string) => importHTML(document, html);
function roundTrip(html: string) {
  const model = decode(html);
  const saved = exportHTML(document, model);
  expect(decode(saved).eq(model)).toBe(true);
  const host = document.createElement('div'); host.innerHTML = saved;
  return { model, saved, host };
}
describe('NEO actual ProseMirror HTML codec', () => {
  it('preserves poetry, scenes, ghosts and section anchors', () => {
    const { model, host } = roundTrip('<p class="poetry"><i>Before dawn.</i></p><p class="scene-break" data-sec-brk="sec2">***</p><p class="ghost" data-sec-id="sec2">Turning point</p><p data-sec-id="written">Prose.</p>');
    expect(model.type.schema).toBe(schema); expect(model.childCount).toBe(4);
    expect(host.querySelector('p.poetry i')?.textContent).toBe('Before dawn.');
    expect(host.querySelector('p.scene-break')?.getAttribute('data-sec-brk')).toBe('sec2');
    expect(host.querySelector('p.ghost')?.getAttribute('data-sec-id')).toBe('sec2');
  });
  it('keeps nested marks, styled runs, whitespace, Unicode and hard breaks', () => {
    const { host } = roundTrip('<p>  Mara <b>kept <i>her</i> promise</b>. <span style="font-weight:700;font-style:italic">Été 😺</span><br>  A\u00a0B</p>');
    expect(host.querySelector('b i, i b')?.textContent).toBe('her');
    expect(host.querySelectorAll('br')).toHaveLength(1);
    expect(host.textContent).toBe('  Mara kept her promise. Été 😺  A\u00a0B');
  });
  it('represents placeholders and legacy Darling anchors as noneditable atoms', () => {
    const { model, host } = roundTrip('<p>Before<span class="ph-mark" data-sid="s-a" contenteditable="false">⚑</span> after<span class="darling-anchor" data-did="d-a" contenteditable="false"></span>end</p>');
    const atoms = model.child(0).content.content.filter(node => node.isAtom && !node.isText);
    expect(atoms.map(node => node.type.name)).toEqual(['placeholder','darling_anchor']);
    expect(atoms.map(node => node.attrs.sid || node.attrs.did)).toEqual(['s-a','d-a']);
    expect(host.querySelector('.ph-mark')?.getAttribute('contenteditable')).toBe('false');
    expect(host.querySelector('.ph-mark')?.textContent).toBe('⚑');
  });
  it('retains alignment and safe classes/data while dropping ephemeral display attrs', () => {
    const { host } = roundTrip('<p class="poetry custom-note first" style="text-align:right" data-sec-id="sec1" data-attr="" data-speech="">Text <span class="writer-note" data-note="n1">here</span></p>');
    expect(host.querySelector('p')?.style.textAlign).toBe('right');
    expect(host.querySelector('p')?.classList.contains('custom-note')).toBe(true);
    expect(host.querySelector('p')?.getAttribute('data-sec-id')).toBe('sec1');
    expect(host.querySelector('p')?.hasAttribute('data-attr')).toBe(false);
    expect(host.querySelector('p')?.hasAttribute('data-speech')).toBe(false);
    expect(host.querySelector('span.writer-note')?.getAttribute('data-note')).toBe('n1');
  });
  it('retains rich auxiliary headings, nested lists, quotes, code and safe links', () => {
    const { host } = roundTrip('<h2 class="note-heading">Research</h2><ul><li><p>One</p><ol start="3"><li><p>Two</p></li></ol></li></ul><blockquote><p><u>Quote</u> <s>old</s> <a href="https://example.org/reference">source</a></p></blockquote><pre><code> x\n  y</code></pre>');
    expect(host.querySelector('h2.note-heading')?.textContent).toBe('Research');
    expect(host.querySelector('ul li ol')?.getAttribute('start')).toBe('3');
    expect(host.querySelector('blockquote u')?.textContent).toBe('Quote');
    expect(host.querySelector('blockquote s')?.textContent).toBe('old');
    expect(host.querySelector('a')?.getAttribute('href')).toBe('https://example.org/reference');
    expect(host.querySelector('pre')?.textContent).toBe(' x\n  y');
  });
  it('drops active payloads but retains author text and formatting', () => {
    const { saved, host } = roundTrip('<p onclick="bad()">Keep<script>bad()</script><style>p{display:none}</style><img src="evil"> <a href="javascript:bad()">words</a><span class="note" onmouseover="bad()">safe</span></p>');
    expect(host.textContent).toBe('Keep wordssafe');
    expect(saved).not.toMatch(/script|onclick|onmouseover|javascript:|<img|<style/);
    expect(host.querySelector('span.note')?.textContent).toBe('safe');
  });
  it('preserves browser-created note div paragraphs and their safe classes', () => {
    const { host, model } = roundTrip('<div class="note-line" data-note="n1">First</div><div>Second</div>');
    expect(model.childCount).toBe(2);
    expect(host.querySelector('p.note-line')?.textContent).toBe('First');
    expect(host.querySelector('p.note-line')?.getAttribute('data-note')).toBe('n1');
  });
  it('excludes editor-only trailing breaks, widgets and selection classes', () => {
    const { model, saved, host } = roundTrip('<p class="poetry ProseMirror-selectednode"><br class="ProseMirror-trailingBreak"></p><p>A<br>B<span class="ProseMirror-widget">UI</span></p>');
    expect(model.child(0).content.size).toBe(0);
    expect(host.querySelectorAll('br')).toHaveLength(1);
    expect(host.textContent).toBe('AB');
    expect(saved).not.toContain('ProseMirror');
  });
  it('keeps empty editable paragraphs and makes empty documents valid', () => {
    expect(decode('').childCount).toBe(1);
    const { model, host } = roundTrip('<p></p><p><br></p><p class="poetry"><i><br></i></p>');
    expect(model.childCount).toBe(3); expect(host.querySelectorAll('p')).toHaveLength(3);
  });
  it('ignores root HTML formatting whitespace without changing inline author spacing', () => {
    const { model, host } = roundTrip('\n  <p>  Alpha  beta. </p>\n\t<p class="poetry"><i>Verse  words.</i></p>\n');
    expect(model.childCount).toBe(2);
    expect(host.querySelectorAll('p')).toHaveLength(2);
    expect(model.child(0).textContent).toBe('  Alpha  beta. ');
    expect(model.child(1).textContent).toBe('Verse  words.');
  });
  it('preserves raw plain Notes whitespace when no structural blocks exist', () => {
    expect(decode('  Raw\n  note\t text ').textContent).toBe('  Raw\n  note\t text ');
    expect(decode(' \n\t ').textContent).toBe(' \n\t ');
  });
  it('maps live DOM caret positions through a clone without mutating source nodes', () => {
    const root=document.createElement('div');
    root.innerHTML='\n  <p>  Alpha  beta. </p>\n\t<p>Second</p>\n';
    const before=root.innerHTML, firstText=root.querySelector('p')!.firstChild!;
    const points:{node:Node;offset:number;pos?:number}[]=[{node:firstText,offset:4},{node:root,offset:3},{node:root.childNodes[2],offset:1}];
    const node=parseHTMLDOM(root,{findPositions:points});
    expect(node.childCount).toBe(2);
    expect(points.map(p=>p.pos)).toEqual([5,node.child(0).nodeSize,node.child(0).nodeSize]);
    expect(root.innerHTML).toBe(before);
    expect(root.querySelector('p')!.firstChild).toBe(firstText);
  });
});
