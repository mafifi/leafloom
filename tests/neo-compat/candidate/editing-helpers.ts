import {type Page} from '@playwright/test';
import {test,expect} from './author-fixture';
import {BrowserAuthorDriver} from './browser-driver';
const modifier=process.platform==='darwin'?'Meta':'Control';
export async function writing(page:Page){const driver=new BrowserAuthorDriver(page);await driver.open();await expect.poll(async()=>await page.locator('#firstrun').isVisible()||await page.locator('.new-book').count()>0).toBe(true);if(await page.locator('#firstrun').isVisible())await driver.onboard();await driver.newBook();await driver.title('Parity '+test.info().testId);await driver.select(0,0,0);return driver;}
export async function markedStory(driver:BrowserAuthorDriver){await driver.type('Alpha ');await driver.key(modifier+'+i');await driver.type('beta.');await driver.key(modifier+'+i');await driver.key('Enter');await driver.type('Gamma.');await driver.expectParagraphs([['Alpha beta.','Gamma.']]);}
