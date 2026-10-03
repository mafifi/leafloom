import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chapterEditionFixture, inspectChapterEdition } from '../shared/chapter-edition-io.mjs';

/** Native callback draft: only public author DOM events and the existing actual export action. */
export async function runChapterEditionIO({
  script,
  click,
  type,
  until,
  seed,
  exportFile,
  textClick,
  shelf,
  open,
  manuscript,
  paragraphs,
  captureSnapshot,
  fixture,
  bookId,
}) {
  await seed(chapterEditionFixture);
  const menu = async (id) => {
    await script(
      'const row=document.querySelector(".nav-item[data-chid=\\""+arguments[0]+"\\"] .n-row");if(!row)throw Error("Missing actual chapter context row");row.scrollIntoView({block:"nearest"});const b=row.getBoundingClientRect();row.dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true,clientX:b.left+20,clientY:b.top+b.height/2}));return true;',
      [id],
    );
    await until(
      () => script('return !!document.querySelector(".pop-menu");'),
      'actual chapter context menu',
    );
  };
  await script(
    'const view=document.querySelector(".chapter-body[data-chid=\\"ch-5\\"] .ProseMirror"),node=view?.querySelector("p")?.firstChild;if(!view||!node)throw Error("Actual rich opening missing");view.focus({preventScroll:true});const range=document.createRange();range.setStart(node,0);range.collapse(true);getSelection().removeAllRanges();getSelection().addRange(range);return true;',
  );
  await type('.chapter-body[data-chid="ch-5"] .ProseMirror', 'Edited ');
  await until(
    () =>
      script(
        'return document.querySelector(".chapter-body[data-chid=\\"ch-5\\"] p")?.textContent.startsWith("Edited Alpha");',
      ),
    'actual current rich author edit',
  );
  await script(
    'document.querySelector("#nav-hotzone").dispatchEvent(new PointerEvent("pointerenter",{bubbles:true}));return true;',
  );
  if (
    !(await script(
      'return document.querySelector("#nav-pin")?.getAttribute("aria-pressed")==="true";',
    ))
  )
    await click('#nav-pin');
  await menu('ch-4');
  await textClick('.pop-menu button', 'Restart Chapter Numbers at Each Part');
  await until(
    () =>
      script(
        'return ["ch-5","ch-7"].every(id=>document.querySelector(".chapter[data-chid=\\""+id+"\\"] .ch-num")?.textContent==="Chapter 1");',
      ),
    'actual per-Part reset labels',
  );
  const evidence = [];
  const stage = async (name) => {
    const live = await paragraphs(),
      exported = [];
    for (const format of ['html', 'md']) {
      const output = await exportFile(format, 'chapter-edition-' + name);
      // Preserve actual checkpoint bytes even when an independent oracle rejects output.
      await captureSnapshot('chapter-edition/' + name + '-' + format);
      const artifact = inspectChapterEdition(format, output, name);
      assert.deepEqual(await paragraphs(), live, 'Export preserves actual visible author book');
      exported.push({ format, artifact });
    }
    await shelf();
    const book = await manuscript();
    assert.equal(book.metadata.restartNumbering, true);
    assert.equal(book.metadata.chapterTitles['ch-8'], 'Interlude');
    assert.equal(book.metadata.chapterTitles['ch-9'], '');
    assert.equal(
      book.chapters.find((chapter) => chapter.id === 'ch-9').html,
      '<p>Unnamed prose.</p>',
    );
    assert.ok(
      book.chapters
        .find((chapter) => chapter.id === 'ch-5')
        .html.includes('Edited Alpha <b>bold</b>'),
    );
    assert.equal(
      await readFile(path.join(fixture, bookId, 'notes.html'), 'utf8'),
      chapterEditionFixture.notes,
    );
    assert.equal(await readFile(path.join(fixture, bookId, 'outline.html'), 'utf8'), '');
    const snapshot = await captureSnapshot('chapter-edition/' + name);
    await open();
    assert.deepEqual(
      await paragraphs(),
      live,
      'Durably reopened native book preserves every rich paragraph',
    );
    for (const { format, artifact } of exported)
      evidence.push({
        id: format === 'md' ? 'NEO-259-B' : 'NEO-053-A',
        supplementalIds: ['NEO-055-A'],
        title: `[${format === 'md' ? 'NEO-259-B' : 'NEO-053-A'}][NEO-055-A] Leafloom: actual native ${name} ${format} edited edition retains reset Contents and unique Part and unnumbered headings`,
        driverActions: [
          'Type Edited through actual native manuscript input',
          'Choose actual Part chapter-number reset',
          ...(name === 'after'
            ? [
                'Insert Part through actual gap menu',
                'Deliver actual DOM drag to reorder an existing Part',
                'Choose Delete for the original Part',
              ]
            : []),
          'Choose actual Export ' + format.toUpperCase(),
          'Supply private native picker destination',
          'Close and reopen the actual book',
        ],
        assertions: [
          'Independently parsed output headings agree with source and author order',
          ...(format === 'html'
            ? [
                'Contents links resolve to every actual story including blank unnumbered title fallback',
              ]
            : ['Markdown title is escaped and printed Contents is omitted']),
          'Part headings occur once; custom unnumbered title occurs once and blank unnumbered has no invented heading',
          'Actual durable rich paragraphs, identities, Notes and Outline remain',
        ],
        artifact,
        durableArtifacts: { snapshot },
        qualification:
          'Hidden WebView public contextmenu/pointer/HTML drag events and actual native text input; private picker responses. Physical pointer and OS picker panel unproved.',
      });
    return book;
  };
  await stage('before');
  const ids = await script(
    'return Array.from(document.querySelectorAll(".nav-item")).map(row=>row.dataset.chid);',
  );
  const gapSelector = await script(
    'const gap=document.querySelectorAll("#nav-list .nav-gap")[6];if(!gap)throw Error("Missing actual Part insertion seam");gap.scrollIntoView({block:"nearest"});const b=gap.getBoundingClientRect();document.querySelector("#nav-pane").dispatchEvent(new PointerEvent("pointermove",{bubbles:true,clientX:b.left+10,clientY:b.top,buttons:0}));return "#nav-list > :nth-child("+(Array.from(gap.parentElement.children).indexOf(gap)+1)+") button";',
  );
  await click(gapSelector);
  await until(
    () => script('return !!document.querySelector(".pop-menu");'),
    'actual insertion menu',
  );
  await textClick('.pop-menu button', 'Part');
  await until(
    () => script('return document.querySelectorAll(".nav-item").length===11;'),
    'actual inserted Part',
  );
  const inserted = await script(
    'return Array.from(document.querySelectorAll(".nav-item")).map(row=>row.dataset.chid).find(id=>!arguments[0].includes(id));',
    [ids],
  );
  assert.equal(typeof inserted, 'string');
  await script(
    'const row=document.querySelector(".nav-item[data-chid=\\"ch-6\\"] .n-row"),target=document.querySelector(".nav-item[data-chid=\\"ch-5\\"]"),nav=document.querySelector("#nav-list");if(!row||!target||!nav)throw Error("Missing actual Part drag targets");row.scrollIntoView({block:"nearest"});const data=new DataTransfer();row.dispatchEvent(new DragEvent("dragstart",{bubbles:true,cancelable:true,dataTransfer:data}));const b=target.getBoundingClientRect();nav.dispatchEvent(new DragEvent("dragover",{bubbles:true,cancelable:true,dataTransfer:data,clientX:b.left+20,clientY:b.top+1}));nav.dispatchEvent(new DragEvent("drop",{bubbles:true,cancelable:true,dataTransfer:data,clientX:b.left+20,clientY:b.top+1}));row.dispatchEvent(new DragEvent("dragend",{bubbles:true,dataTransfer:data}));return true;',
  );
  await until(
    () =>
      script(
        'const ids=Array.from(document.querySelectorAll(".nav-item")).map(row=>row.dataset.chid);return ids.indexOf("ch-6")<ids.indexOf("ch-5");',
      ),
    'actual reordered Part',
  );
  await menu('ch-4');
  await textClick('.pop-menu button', 'Delete');
  await until(
    () => script('return !document.querySelector(".chapter[data-chid=\\"ch-4\\"]");'),
    'actual deleted old Part',
  );
  const after = await stage('after');
  assert.deepEqual(
    after.chapters.map((chapter) => chapter.id),
    ['ch-1', 'ch-2', 'ch-3', 'ch-6', 'ch-5', inserted, 'ch-7', 'ch-8', 'ch-9', 'ch-10'],
  );
  assert.equal(after.metadata.chapterKinds[inserted], 'part');
  assert.ok(
    after.darlings.some((darling) => darling.html === chapterEditionFixture.chapters[3]),
    'Deleted rich Part remains recoverable',
  );
  return evidence;
}
