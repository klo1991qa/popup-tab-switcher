import assert from 'assert';
import puppeteer from 'puppeteer';
import PuppeteerPopupHelper, { getPagePath } from './utils/PuppeteerPopupHelper';
import { launchOptions } from './utils/config';
import { defaultSettings } from '../src/utils/settings';

let browser;
/** @type {PuppeteerPopupHelper} */
let helper;

before(async () => {
  browser = await puppeteer.launch(launchOptions);
  helper = new PuppeteerPopupHelper(browser);
});

after(function () {
  browser.close();
});

describe('Pop-up', function () {
  this.timeout(1000000);

  describe('One page', function () {
    after(async () => {
      await helper.closeTabs();
    });

    async function popupOpens(page) {
      await helper.selectTabForward();

      const display = await page.$eval('#popup-tab-switcher', popup => getComputedStyle(popup)
        .getPropertyValue('display'));
      assert(display === 'flex', 'popup visible');
    }

    it('Opens on "Alt+Y"', async () => {
      const [page] = await browser.pages();
      await helper.openPage('wikipedia.html', page);
      await popupOpens(page);

      // Works after page reload
      await popupOpens(await helper.openPage('wikipedia.html', page));
    });

    it('Opens on "Alt+Y" even if the page has popup-tab-switcher element', async () => {
      const [page] = await browser.pages();
      await helper.openPage('page-with-popup-tab-switcher.html', page);
      await popupOpens(page);
    });

    it('Opens on file pages', async () => {
      await popupOpens(await helper.openPage('file.png'));
      await popupOpens(await helper.openPage('file.pdf'));
      await popupOpens(await helper.openPage('file.js'));
    });

    it('Hides on "Alt" release', async () => {
      const page = await helper.openPage('wikipedia.html');
      await popupOpens(page);
      await page.keyboard.up('Alt');
      const display = await page.$eval('#popup-tab-switcher', popup => getComputedStyle(popup)
        .getPropertyValue('display'));
      assert.strictEqual(display, 'none', 'popup hidden');
    });

    it('Hides the popup if a user selects other tab in a browser top bar', async () => {
      // the closing behaviour is based on a blur event
      const pageWikipedia = await helper.openPage('wikipedia.html');
      await helper.selectTabForward();
      await pageWikipedia.evaluate(() => {
        window.dispatchEvent(new Event('blur'));
      });
      const display = await pageWikipedia.$eval('#popup-tab-switcher', el => getComputedStyle(el).display);
      assert.strictEqual(display, 'none', 'The popup is closed');
    });
  });

  describe('Many pages', function () {
    beforeEach(async () => {
      await helper.closeTabs();
    });

    it('Adds visited pages to the registry in correct order', async () => {
      const expectedTexts = [
        'Tour - Stack Overflow',
        'Example Domain',
        'Wikipedia',
      ];
      await helper.openPage('wikipedia.html');
      await helper.openPage('example.html');
      const pageStOverflow = await helper.openPage('stackoverflow.html');
      await helper.selectTabForward();
      const elTexts = await pageStOverflow.queryPopup('.tab', els => els.map(el => el.textContent));
      assert.deepStrictEqual(elTexts, expectedTexts, '3 tabs were added');
    });

    it('Updates tab list on closing open tabs', async () => {
      const expectedTexts = [
        'Tour - Stack Overflow',
        'Wikipedia',
      ];
      await helper.openPage('wikipedia.html');
      const pageExample = await helper.openPage('example.html');
      const pageStOverflow = await helper.openPage('stackoverflow.html');
      await pageExample.close();
      await helper.selectTabForward();
      const elTexts = await pageStOverflow.queryPopup('.tab', els => els.map(el => el.textContent));
      assert.deepStrictEqual(elTexts, expectedTexts, '2 tabs were left');
    });

    it('Selects proper tab names in the popup', async () => {
      await helper.openPage('wikipedia.html');
      const pageExample = await helper.openPage('example.html');
      const pageStOverflow = await helper.openPage('stackoverflow.html');
      await helper.selectTabForward();
      let elText = await pageStOverflow.queryPopup('.tab_selected', ([el]) => el.textContent);
      assert.strictEqual(elText, 'Example Domain');
      await pageStOverflow.keyboard.press('KeyY');
      elText = await pageStOverflow.queryPopup('.tab_selected', ([el]) => el.textContent);
      assert.strictEqual(elText, 'Wikipedia');
      await pageStOverflow.keyboard.press('KeyY');
      elText = await pageStOverflow.queryPopup('.tab_selected', ([el]) => el.textContent);
      assert.strictEqual(elText, 'Tour - Stack Overflow');
      await helper.switchToSelectedTab();
      await helper.selectTabBackward();
      elText = await pageStOverflow.queryPopup('.tab_selected', ([el]) => el.textContent);
      assert.strictEqual(elText, 'Wikipedia');
      await helper.selectTabBackward();
      elText = await pageStOverflow.queryPopup('.tab_selected', ([el]) => el.textContent);
      assert.strictEqual(elText, 'Example Domain');
      await helper.selectTabBackward(); // selected Tour - Stack Overflow
      await pageExample.close();
      await helper.selectTabForward();
      elText = await pageStOverflow.queryPopup('.tab_selected', ([el]) => el.textContent);
      assert.strictEqual(elText, 'Wikipedia');
    });

    it('Switches between tabs on Alt release', async () => {
      await helper.openPage('wikipedia.html');
      await helper.openPage('example.html');
      await helper.openPage('stackoverflow.html');
      let curTab = await helper.switchTab();
      let elText = await curTab.$eval('title', el => el.textContent);
      assert.strictEqual(elText, 'Example Domain');
      curTab = await helper.switchTab();
      elText = await curTab.$eval('title', el => el.textContent);
      assert.strictEqual(elText, 'Tour - Stack Overflow');
      curTab = await helper.switchTab(2);
      elText = await curTab.$eval('title', el => el.textContent);
      assert.strictEqual(elText, 'Wikipedia');
      curTab = await helper.switchTab(3);
      elText = await curTab.$eval('title', el => el.textContent);
      assert.strictEqual(elText, 'Wikipedia');
      curTab = await helper.switchTab(2);
      elText = await curTab.$eval('title', el => el.textContent);
      assert.strictEqual(elText, 'Example Domain');
    });

    it('Switches to previously opened tab when current one closes', async () => {
      const pageWikipedia = await helper.openPage('wikipedia.html');
      const pageExample = await helper.openPage('example.html');
      await helper.openPage('stackoverflow.html');
      await pageWikipedia.bringToFront();
      await pageWikipedia.close();
      let curTab = await helper.getActiveTab();
      let elText = await curTab.$eval('title', el => el.textContent);
      assert.strictEqual(elText, 'Tour - Stack Overflow');
      await helper.openPage('wikipedia.html');
      await pageExample.bringToFront();
      await pageExample.close();
      curTab = await helper.getActiveTab();
      elText = await curTab.$eval('title', el => el.textContent);
      assert.strictEqual(elText, 'Wikipedia');
    });

    it('Switches to the tab that was clicked', async () => {
      await helper.openPage('wikipedia.html');
      await helper.openPage('example.html');
      const pageStOverflow = await helper.openPage('stackoverflow.html');
      await helper.selectTabForward();
      await pageStOverflow.queryPopup('.tab:nth-child(3)', ([el]) => {
        el.click();
      });
      await pageStOverflow.keyboard.up('Alt');
      const curTab = await helper.getActiveTab();
      const elText = await curTab.$eval('title', el => el.textContent);
      assert.strictEqual(elText, 'Wikipedia', 'switches to the clicked tab');
    });

    it('Pressing ESC stops switching', async () => {
      await helper.openPage('wikipedia.html');
      await helper.openPage('example.html');
      const pageStOverflow = await helper.openPage('stackoverflow.html');
      await helper.selectTabForward();
      await pageStOverflow.keyboard.press('Escape');
      const isPopupClosed = await pageStOverflow.$eval('#popup-tab-switcher', el => getComputedStyle(el).display === 'none');
      assert(isPopupClosed, 'hides on pressing Esc button');
      await pageStOverflow.keyboard.up('Alt');
      const curTab = await helper.getActiveTab();
      const elText = await curTab.$eval('title', el => el.textContent);
      assert.strictEqual(elText, 'Tour - Stack Overflow', 'stays on the same tab');
    });

    it('Switches between windows', async () => {
      const pageWikipedia = await helper.openPage('wikipedia.html');
      const pageExample = await helper.openPage('example.html');
      const newPagePromise = new Promise(resolve => browser.once('targetcreated', target => resolve(target.page())));
      await pageExample.evaluate((url) => {
        window.open(url, '_blank', 'width=500,height=500');
      }, getPagePath('stackoverflow.html'));
      const pageStOverflow = await newPagePromise;
      await pageStOverflow.keyboard.down('Alt');
      await pageStOverflow.keyboard.press('KeyY');
      await pageStOverflow.keyboard.press('KeyY');
      await pageStOverflow.keyboard.up('Alt');
      // document.hasFocus() does not work here as expected
      const activePage = await helper.getActiveTab();
      let isStOverflowFocused = await pageStOverflow.evaluate(() => document.hasFocus());
      assert(pageWikipedia === activePage && !isStOverflowFocused, 'Switched back to a previous window');

      await pageStOverflow.keyboard.down('Alt');
      await pageStOverflow.keyboard.press('KeyY');
      await pageStOverflow.keyboard.up('Alt');
      isStOverflowFocused = await pageStOverflow.evaluate(() => document.hasFocus());
      assert(isStOverflowFocused, 'Switched between two windows');
    });

    it('Stores unlimited number of opened tabs in history', async () => {
      const pages = [await helper.openPage('wikipedia.html')];
      const numberOfTabsToOpen = defaultSettings.numberOfTabsToShow + 3;
      for (let i = 0; i < numberOfTabsToOpen; i += 1) {
        // We need to open tabs with focusing on them to populate tab registry
        // eslint-disable-next-line no-await-in-loop
        pages.push(await helper.openPage('example.html'));
      }
      await helper.selectTabForward();
      let activeTab = await helper.getActiveTab();
      let numberOfShownTabs = await activeTab.queryPopup('.tab', els => els.length);
      assert.strictEqual(numberOfShownTabs, defaultSettings.numberOfTabsToShow, 'The number of shown tabs is correct');
      const closingPagesPromises = [];
      for (let i = pages.length - 1; i > 2; i -= 1) {
        closingPagesPromises.push(pages[i].close());
      }
      await Promise.all(closingPagesPromises);
      await helper.selectTabForward();
      activeTab = await helper.getActiveTab();
      numberOfShownTabs = await activeTab.queryPopup('.tab', els => els.length);
      assert.strictEqual(numberOfShownTabs, 3, 'The number of shown tabs is correct after closing multiple tabs');
      const tabTitle = await activeTab.queryPopup('.tab:nth-child(3)', ([el]) => el.textContent);
      assert.strictEqual(tabTitle, 'Wikipedia');
    });
  });
});
