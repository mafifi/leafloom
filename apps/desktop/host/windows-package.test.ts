import {it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
it('[NEO135-001] Windows packaging supplies a current-user NSIS installer and real Windows icon without enabling an unsigned update channel',async()=>{
 const base=JSON.parse(await readFile(new URL('../src-tauri/tauri.conf.json',import.meta.url),'utf8'));
 const windows=JSON.parse(await readFile(new URL('../src-tauri/tauri.windows.conf.json',import.meta.url),'utf8'));
 expect(windows.bundle.targets).toEqual(['nsis']);expect(windows.bundle.windows.nsis.installMode).toBe('currentUser');expect(windows.bundle.icon).toContain('icons/icon.ico');
 const icon=await readFile(new URL('../src-tauri/icons/icon.ico',import.meta.url));expect(icon.readUInt16LE(0)).toBe(0);expect(icon.readUInt16LE(2)).toBe(1);expect(icon.readUInt16LE(4)).toBeGreaterThan(0);
 expect(base.plugins?.updater).toBeUndefined();expect(windows.plugins?.updater).toBeUndefined();const cargo=await readFile(new URL('../src-tauri/Cargo.toml',import.meta.url),'utf8');expect(cargo).toContain('tauri-plugin-updater = "=2.10.1"');
});
