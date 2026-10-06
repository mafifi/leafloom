<script lang="ts">
  import {editableText} from './lib/editable-text';
  let {credit,draft,contact,readOnly,change,finish,finishContact,enter,t}: {credit:string;draft:string;contact:string;readOnly:boolean;change:(field:'credit'|'draft'|'contact',text:string)=>void;finish:(field:'credit'|'draft')=>void;finishContact:()=>void;enter:()=>void;t:(key:string)=>string}=$props();
  const fields=$derived([{field:'credit' as const,label:'Written by',text:credit},{field:'contact' as const,label:'Contact',text:contact},{field:'draft' as const,label:'Draft and date',text:draft}]);
  function key(event:KeyboardEvent,field:string) {
    if(event.key!=='Enter'||event.isComposing)return;
    event.preventDefault();
    if(field==='credit')enter();else document.execCommand('insertLineBreak');
  }
</script>
{#each fields as field (field.field)}
  <div id={`tp-${field.field}`} role="textbox" tabindex="0" aria-label={t(field.label)} aria-multiline={field.field!=='credit'} data-ph={t(field.label)} contenteditable={!readOnly} spellcheck="false" use:editableText={field.text} oninput={event=>change(field.field,(event.currentTarget.innerText??event.currentTarget.textContent??'').replace(/\n+$/,''))} onblur={()=>{if(field.field==='contact')finishContact();else finish(field.field);}} onkeydown={event=>key(event,field.field)}></div>
{/each}
