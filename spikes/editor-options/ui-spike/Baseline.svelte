<script lang="ts">
 import { onMount } from 'svelte';
 import { ManuscriptSession } from '../src/session';
 import { createProseMirrorEditor } from '../src/editors/prosemirror';
 import { fixture } from './fixture';
 import { textOf } from '../src/document';
 import { Diagnostics } from './telemetry';
 let host:HTMLDivElement;const doc=fixture(new URLSearchParams(location.search).get('size')==='500'?500:5);
 const session=new ManuscriptSession(doc),editor=createProseMirrorEditor(),diagnostics=new Diagnostics();
 let inputStarted:number|null=null,keyboardInput=false;let document=$state(doc);const words=$derived(document.chapters.flatMap(c=>c.blocks).map(textOf).join(' ').trim().split(/\s+/).filter(Boolean).length);
 onMount(()=>{
  const unsubscribe=session.subscribe(()=>{document=structuredClone(session.document);});
  editor.mount(host,doc,{changed:(document,selection,reason)=>{session.nativeChange(document,selection,reason);if(inputStarted!==null){diagnostics.recordCommit('input',performance.now()-inputStarted);inputStarted=null;}},selectionChanged:selection=>session.setSelection(selection),gesture:()=>{session.setSelection(editor.read().selection);return false;}});
  host.addEventListener('keydown',e=>{if(!e.ctrlKey&&!e.metaKey&&e.key.length===1){keyboardInput=true;inputStarted=performance.now();diagnostics.startFrame('input');}},true);
  host.addEventListener('beforeinput',()=>{if(!keyboardInput){inputStarted=performance.now();diagnostics.startFrame('input');}keyboardInput=false;});(window as unknown as {baseline:unknown}).baseline={diagnostics};
  return()=>{unsubscribe();editor.destroy();void diagnostics.dispose();};
 });
</script>
<svelte:head><title>NEO · original session pipeline</title></svelte:head>
<div class="workbench"><div class="workspace"><aside class="chapters"><h1>{document.title}</h1><p>{words} words · original session pipeline</p></aside><main><div class="paper-scroll"><article class="paper"><div bind:this={host} class="editor-host"></div></article></div></main></div></div>
