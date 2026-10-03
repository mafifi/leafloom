import { mount } from 'svelte';
import App from './App.svelte';
import '../src/styles.css';
import './style.css';
mount(App,{target:document.getElementById('app')!});
