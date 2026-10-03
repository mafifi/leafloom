<script lang="ts">
 import { onMount } from 'svelte';
 import type { AuthoringUI, WritingPanel } from './ui-contracts';
 let { vm }: { vm:AuthoringUI }=$props();let host:HTMLDivElement;
 onMount(()=>{vm.mount(host);return()=>vm.dispose();});
</script>
<svelte:head><title>NEO · {vm.title}</title></svelte:head>
<div class="workbench" class:dark={vm.dark}>
 <div class="workspace inspector-open">
  <aside class="chapters"><div class="side-title">THE MANUSCRIPT</div><h1>{vm.title}</h1><div class="author">{vm.author}</div><nav class="chapter-list" aria-label="Chapters">{#each vm.chapters as chapter,i (chapter.id)}<button class:current={vm.currentChapter===chapter.id} onclick={()=>vm.navigate(chapter.id)}><span class="chapter-number">{i+1}</span><span>{chapter.title||'Untitled chapter'}</span></button>{/each}</nav><div class="side-foot">{vm.words} words</div></aside>
  <main><div class="paper-toolbar"><span>{vm.title}</span><div><button aria-label="Bold" onmousedown={e=>e.preventDefault()} onclick={()=>vm.format('bold')}><b>B</b></button><button aria-label="Italic" onmousedown={e=>e.preventDefault()} onclick={()=>vm.format('italic')}><i>I</i></button><button aria-label="Undo" onmousedown={e=>e.preventDefault()} disabled={!vm.canUndo} onclick={()=>vm.undo()}>↶</button><button aria-label="Redo" onmousedown={e=>e.preventDefault()} disabled={!vm.canRedo} onclick={()=>vm.redo()}>↷</button></div></div><div class="paper-scroll"><article class="paper"><div bind:this={host} class="editor-host"></div><div class="endmark">❦</div></article></div></main>
  <aside class="inspector"><nav aria-label="Writing panels">{#each ['notes','outline','darlings'] as panel}<button aria-pressed={vm.panel===panel} onclick={()=>vm.selectPanel(panel as WritingPanel)}>{panel==='notes'?'Notes':panel==='outline'?'Outline':'Darlings'}</button>{/each}</nav>
   {#if vm.panel==='notes'}<section><h2>Notes</h2><textarea aria-label="Book notes" value={vm.notes} oninput={e=>vm.setNotes(e.currentTarget.value)} placeholder="Keep a thought…"></textarea></section>
   {:else if vm.panel==='outline'}<section><h2>Outline</h2><textarea aria-label="Book outline" value={vm.outline} oninput={e=>vm.setOutline(e.currentTarget.value)} placeholder="Where the story goes…"></textarea></section>
   {:else}<section><h2>Darlings</h2><button class="action" onmousedown={e=>e.preventDefault()} onclick={()=>vm.archive()}>Keep selected passage</button>{#each vm.darlings as darling (darling.id)}<div class="darling"><blockquote>{darling.text}</blockquote><button onclick={()=>vm.restore(darling.id)}>Restore passage</button></div>{/each}</section>{/if}
  </aside>
 </div>
 <footer><span class="brand">NEO</span><span>{vm.words} words · revision {vm.revision}</span><span role="status">{vm.status}</span><div><button onclick={()=>vm.save()}>Save</button><button onclick={()=>vm.reopen()}>Reopen</button><button aria-label="Toggle dark mode" onclick={()=>vm.toggleDark()}>{vm.dark?'☀':'☾'}</button></div></footer>
</div>
