<script lang="ts">
 import AuthoringView from './AuthoringView.svelte';
 import { AuthoringViewModel } from './AuthoringViewModel.svelte';
 import { HttpBookStore } from './http-store';
 import { fixture } from './fixture';
 const query=new URLSearchParams(location.search);const vm=new AuthoringViewModel(fixture(query.get('size')==='500'?500:5),new HttpBookStore(query.get('book')??'manual'));
 // Public probe diagnostics are isolated from the production app.
 window.uiSpike=vm;
</script>
<AuthoringView {vm}/>
