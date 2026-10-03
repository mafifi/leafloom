import { ManuscriptSchema } from '../contracts';
import type { ManuscriptStore } from '../contracts';
export function createBrowserStore(key='neo-editor-options-manuscript'): ManuscriptStore {
 return { async save(document) {localStorage.setItem(key,JSON.stringify(ManuscriptSchema.parse(document)));}, async load(){const text=localStorage.getItem(key);return text?ManuscriptSchema.parse(JSON.parse(text)):null;} };
}
