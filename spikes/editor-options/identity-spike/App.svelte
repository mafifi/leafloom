<script lang="ts">
 import { onMount } from 'svelte';
 import { ReviewViewModel, type ReviewUI } from './ReviewViewModel.svelte';
 const params=new URLSearchParams(location.search);
 const vm:ReviewUI=new ReviewViewModel(params.has('unsupported')?'<p style="color:red">Keep my original colour.</p>':undefined);
 let paper:HTMLDivElement;
 onMount(()=>vm.mount(paper));
</script>
<svelte:head><title>NEO passage identity spike</title></svelte:head>
<main>
 <nav aria-label="Chapters"><h1>The promise</h1><p>A. Writer</p>{#each vm.chapters as id}<button class:active={vm.activeChapter===id} onclick={()=>vm.switchChapter(id)}>{id}</button>{/each}<small>Document identity spike</small></nav>
 <section class="workspace"><div class="tools"><button onclick={()=>vm.undo()}>Undo</button><button onclick={()=>vm.redo()}>Redo</button><button onclick={()=>vm.move()} disabled={vm.unsupported}>Move first paragraph</button><button onclick={()=>vm.saveAndReopen()}>Save and reopen fixture</button></div><div class="paper" bind:this={paper}></div><p role="status">{vm.status}</p></section>
 <aside aria-label="Reviews"><h2>Reviews</h2><p>Deterministic contract fixtures</p><button onclick={()=>vm.reviewSelection()} disabled={vm.unsupported}>Review selection</button><button onclick={()=>vm.reviewStructure()} disabled={vm.unsupported}>Review structure</button>
 {#each vm.rows as row}<article data-kind={row.kind} data-state={row.state}><header>{row.category} · {row.kind} · {row.state}</header><p>{row.message}</p>{#each row.resolutions as resolution}<div class="reference" data-status={resolution.status}><span>{resolution.status} · {resolution.segments.length} passage(s)</span><blockquote>{resolution.text||'Source unavailable'}</blockquote></div>{/each}{#if row.kind==='suggestion'}<p class="replacement">Suggested: {row.replacement}</p><button disabled={row.state!=='pending'} onclick={()=>vm.accept(row.id)}>Accept</button>{/if}<button disabled={row.state!=='pending'} onclick={()=>vm.reject(row.id)}>Dismiss</button></article>{/each}
 </aside>
</main>
<style>
 :global(body){margin:0;background:#f0eee9;color:#282724;font-family:Georgia,serif}main{display:grid;grid-template-columns:210px minmax(420px,1fr) 340px;min-height:100vh}nav,aside{padding:24px;border-right:1px solid #ddd8cf}nav h1{font-size:24px}nav p,aside>p,small{color:#79766e}nav button{display:block;width:100%;text-align:left;margin:8px 0}nav small{display:block;margin-top:40px}.active{background:#e3dfd5}.workspace{padding:20px}.tools{display:flex;gap:8px;margin-bottom:24px;flex-wrap:wrap}.paper{max-width:760px;min-height:65vh;padding:60px;margin:auto;background:#fffef9;box-shadow:0 2px 20px #00000008}:global(.ProseMirror){outline:none;font-size:22px;line-height:1.7;white-space:pre-wrap}:global(.ProseMirror p){margin:0 0 22px}button{border:1px solid #d5d0c5;border-radius:4px;background:#f8f6f0;padding:9px 12px;color:#454139;cursor:pointer}button:disabled{opacity:.45;cursor:default}aside{border-right:0;border-left:1px solid #ddd8cf}aside h2{font-size:22px}aside>button{margin:0 3px 12px 0}article{background:#f3ead2;border-left:4px solid #b9a471;padding:14px;margin:18px 0}article[data-kind=note]{background:#dfe8e6;border-color:#87aaa1}header,.reference>span{font:12px system-ui;color:#696256}.reference{border-top:1px solid #00000012;padding:10px 0}blockquote{margin:5px 0;font-size:15px}.replacement{font-style:italic}article button{padding:6px 10px;margin-right:6px}[role=status]{font:13px system-ui;color:#6e695f;margin:20px}.reference[data-status=changed],.reference[data-status=unresolved],.reference[data-status=deleted]{color:#a04e3a}
</style>
