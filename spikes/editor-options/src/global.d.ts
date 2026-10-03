import type { Manuscript, Selection } from './contracts';
import type { WorkbenchViewModel } from './WorkbenchViewModel.svelte';
declare global { interface Window { spikeHost?:{save(document:Manuscript):Promise<void>;load():Promise<unknown>;path():Promise<string>}; spike?:WorkbenchViewModel; } }
export {};
