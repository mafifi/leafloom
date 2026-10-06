import {type Page} from '@playwright/test';
import {test,expect} from './author-fixture';
import {BrowserAuthorDriver} from './browser-driver';
import {persistedLibrary} from './storage-probe';
import {clickReferenceMenu} from '../reference/harness';
const modifier=process.platform==='darwin'?'Meta':'Control';
/** Preserve the pinned 1.2.4 action; 1.3.5 moved poetry creation to Mod Shift Enter. */
export const poetryShortcut = process.env.LEAFLOOM_PARITY_DRIVER === 'neo-reference' && process.env.LEAFLOOM_REFERENCE_VERSION !== '1.3.5'
  ? 'Shift+Enter'
  : modifier + '+Shift+Enter';
export async function writing(page:Page){const driver=new BrowserAuthorDriver(page);await driver.open();await expect.poll(async()=>await page.locator('#firstrun').isVisible()||await page.locator('.new-book').count()>0).toBe(true);if(await page.locator('#firstrun').isVisible())await driver.onboard();await driver.newBook();
 // Ordinary author journeys begin in writing mode even after a preceding Vim journey.
 if((await persistedLibrary(page)).vimKeys){
  if(process.env.LEAFLOOM_PARITY_DRIVER==='neo-reference')await clickReferenceMenu(page,['View','Vim Keys']);
  else{await page.locator('#format-menu').click();await page.getByRole('menuitem',{name:'Vim mode',exact:true}).click();}
  await expect.poll(async()=>Boolean((await persistedLibrary(page)).vimKeys)).toBe(false);
  await expect(page.locator('body')).not.toHaveClass(/vim-nav/);
 }
 await driver.title('Parity '+test.info().testId);await driver.select(0,0,0);return driver;}
export async function markedStory(driver:BrowserAuthorDriver){await driver.type('Alpha ');await driver.key(modifier+'+i');await driver.type('beta.');await driver.key(modifier+'+i');await driver.key('Enter');await driver.type('Gamma.');await driver.expectParagraphs([['Alpha beta.','Gamma.']]);}
