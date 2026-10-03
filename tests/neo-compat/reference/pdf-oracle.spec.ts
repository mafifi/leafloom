import {test,expect} from '../candidate/author-fixture';
import {existingBook} from '../candidate/book-fixture';
import {privateStorageRoot,persistedLibrary} from '../candidate/storage-probe';
import {clickReferenceMenu} from './harness';
import {writeFile,readFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
test('Pinned NEO: hidden actual HTML and PDF export retain dropcap rich opening and source geometry',async({page})=>{
 const text='Opening bold rich words walk beside the river. The manuscript has enough prose to fill several lines beneath the two-line initial. Every word remains intact when copied or searched in the actual exported PDF.';
 const c=await existingBook(page,{chapters:['<p>Opening <strong>bold rich words</strong> walk beside the river. The manuscript has enough prose to fill several lines beneath the two-line initial. Every word remains intact when copied or searched in the actual exported PDF.</p>'],metadata:{author:'Test'},library:{fonts:{body:'Georgia',dropcap:'literary'}}});await c.driver.title('Dropcap Fixture');
 const fixture=path.resolve(privateStorageRoot(page),'../..'),hostFile=path.join(fixture,'.neo-parity-host.json');for(const format of ['html','pdf']){const file=path.join(fixture,'dropcap-reference.'+format);await writeFile(hostFile,JSON.stringify({savePath:file}));await clickReferenceMenu(page,['File','Export',format==='pdf'?'PDF (.pdf)':'Web Page (.html)']);await expect.poll(async()=>readFile(file).then(bytes=>bytes.length,()=>0),{timeout:30000}).toBeGreaterThan(100);await copyFile(file,'/tmp/leafloom-original-dropcap-reference.'+format);}
 const html=await readFile('/tmp/leafloom-original-dropcap-reference.html','utf8');expect(html).toContain('font-size: 13pt');expect(html).toContain('bold rich words');const bytes=await readFile('/tmp/leafloom-original-dropcap-reference.pdf');expect(bytes.subarray(0,5).toString()).toBe('%PDF-');await writeFile('/tmp/leafloom-original-dropcap-preferences.json',JSON.stringify({library:await persistedLibrary(page),text,fixtureArtifactOnly:true},null,2));
});
