/*
 * End-to-end test: loads the unpacked extension into Chromium and serves
 * Amazon-like fixture pages via request interception (no real Amazon traffic).
 *
 *   node test/e2e.js [screenshotDir]
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert/strict');
const { chromium } = require('playwright');

const EXT = path.resolve(__dirname, '..');
const FIX = path.join(__dirname, 'fixtures');
const SHOTS = process.argv[2] || null;
const DAY = 86400000;

const PAGES = {
  '/dp/B0TESTFAKE': 'product-fake.html',
  '/dp/B0TESTREAL': 'product-real.html',
  '/dp/B0TESTOLD1': 'product-table.html',
  '/s': 'search.html',
};

async function main() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-e2e-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1100, height: 900 },
    deviceScaleFactor: SHOTS ? 2 : 1,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  const amazonRequests = [];
  await context.route('https://www.amazon.de/**', (route) => {
    const url = new URL(route.request().url());
    amazonRequests.push(url.pathname);
    const file = PAGES[url.pathname];
    if (!file) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(path.join(FIX, file)) });
  });
  await context.route('https://graph.keepa.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: fs.readFileSync(path.join(FIX, 'chart-placeholder.png')) })
  );

  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  console.log('extension id', extId);

  // Seed a recorded price history.
  const now = Date.now();
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extId}/src/options/options.html`);
  await options.evaluate(
    async ({ now, DAY }) => {
      await chrome.storage.local.set({
        'h|amazon.de|B0TESTFAKE': { asin: 'B0TESTFAKE', domain: 'amazon.de', currency: 'EUR', title: 'Testmarke ProSound X5', points: [[now - 40 * DAY, 279], [now - 20 * DAY, 199], [now - 8 * DAY, 289]] },
        'h|amazon.de|B0LIST0001': { asin: 'B0LIST0001', domain: 'amazon.de', currency: 'EUR', points: [[now - 10 * DAY, 39.99], [now - 5 * DAY, 59.99]] },
        'h|amazon.de|B0LIST0002': { asin: 'B0LIST0002', domain: 'amazon.de', currency: 'EUR', points: [[now - 20 * DAY, 79.99], [now - 10 * DAY, 69.99]] },
      });
    },
    { now, DAY }
  );

  const page = await context.newPage();
  const cardText = async () => {
    await page.waitForSelector('#preischeck-card-host', { timeout: 10000 });
    await page.waitForFunction(() => document.querySelector('#preischeck-card-host').shadowRoot.querySelector('.card'));
    return page.evaluate(() => {
      const root = document.querySelector('#preischeck-card-host').shadowRoot;
      return { verdict: root.querySelector('.card').dataset.verdict, text: root.querySelector('.card').innerText };
    });
  };

  // 1) Fake discount: UVP-based -38 %, but 30-day low was cheaper and own history shows 199 €.
  await page.goto('https://www.amazon.de/dp/B0TESTFAKE');
  let card = await cardText();
  console.log('\n--- FAKE ---\n' + card.text);
  assert.equal(card.verdict, 'bad');
  assert.match(card.text, /Kein echtes Schnäppchen/);
  assert.match(card.text, /Kein echter Rabatt/);
  assert.match(card.text, /Schon günstiger gesehen: 199,00/);
  assert.match(card.text, /Black Friday Angebot/);
  assert.match(card.text, /Amazon sagt −38 %/);
  await page.waitForFunction(() => {
    const img = document.querySelector('#preischeck-card-host').shadowRoot.querySelector('.chart img');
    return img && img.complete && img.naturalWidth > 0;
  });
  if (SHOTS) {
    await page.locator('#preischeck-card-host').screenshot({ path: path.join(SHOTS, 'card-fake.png') });
    await page.screenshot({ path: path.join(SHOTS, 'page-fake.png') });
  }

  // 2) Real discount (offscreen price empty -> whole/fraction fallback, unit price ignored).
  await page.goto('https://www.amazon.de/dp/B0TESTREAL');
  card = await cardText();
  console.log('\n--- REAL ---\n' + card.text);
  assert.equal(card.verdict, 'good');
  assert.match(card.text, /Aktueller Preis\s+1\.199,00/);
  assert.match(card.text, /29 % unter dem niedrigsten Preis der letzten 30 Tage/);
  if (SHOTS) await page.locator('#preischeck-card-host').screenshot({ path: path.join(SHOTS, 'card-real.png') });

  // Add to watchlist with a target price.
  await page.evaluate(() => {
    const root = document.querySelector('#preischeck-card-host').shadowRoot;
    root.querySelector('.watch input').value = '1.100';
    root.querySelector('.watch .btn.primary').click();
  });
  await page.waitForFunction(() => /Wird beobachtet/.test(document.querySelector('#preischeck-card-host').shadowRoot.textContent));

  // 3) Old table layout with UVP only.
  await page.goto('https://www.amazon.de/dp/B0TESTOLD1');
  card = await cardText();
  console.log('\n--- TABLE ---\n' + card.text);
  assert.equal(card.verdict, 'ok');
  assert.match(card.text, /Aktueller Preis\s+19,99/);
  assert.match(card.text, /bezieht sich nur auf die UVP von 24,99/);

  // 4) Search results: badges from recorded history.
  await page.goto('https://www.amazon.de/s?k=kopfhoerer');
  await page.waitForFunction(() => document.querySelectorAll('.preischeck-badge').length >= 2, null, { timeout: 10000 });
  const badges = await page.evaluate(() =>
    [...document.querySelectorAll('[data-asin]')].map((el) => {
      const b = el.querySelector('.preischeck-badge');
      return [el.getAttribute('data-asin'), b ? b.shadowRoot.textContent.replace(/\s+/g, ' ').replace(/^.*\}/, '').trim() : null];
    })
  );
  console.log('\n--- SEARCH BADGES ---', badges);
  assert.match(badges[0][1], /War schon 39,99/);
  assert.match(badges[1][1], /Tiefstpreis seit/);
  assert.equal(badges[2][1], null);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'search.png') });

  // Prices from the search page were recorded.
  const recorded = await options.evaluate(() => chrome.storage.local.get(['h|amazon.de|B0LIST0003', 'h|amazon.de|B0DEAL0001']));
  assert.equal(recorded['h|amazon.de|B0LIST0003'].points[0][1], 19.99);
  // Deal grid tile without data-asin (fallback via /dp/ link).
  assert.equal(recorded['h|amazon.de|B0DEAL0001'].points[0][1], 24.99);
  assert.equal(recorded['h|amazon.de|B0DEAL0001'].title, 'Testmarke Bluetooth-Lautsprecher Mini');

  // 5) Popup shows the watchlist; background check goes through the offscreen parser.
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 390, height: 600 });
  await popup.goto(`chrome-extension://${extId}/src/popup/popup.html`);
  await popup.waitForSelector('#watchlist .item');
  const checkResult = await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'checkNow' }));
  console.log('\n--- WATCHLIST CHECK ---', checkResult);
  const watch = await popup.evaluate(() => chrome.storage.local.get('watch'));
  const entry = watch.watch['amazon.de|B0TESTREAL'];
  console.log('watch entry', entry);
  assert.equal(entry.targetPrice, 1100);
  assert.equal(entry.lastPrice, 1199);
  assert.equal(checkResult.checked, 1);
  assert.equal(entry.lastError, null, 'background check should parse the fixture without error');
  assert.ok(amazonRequests.includes('/dp/B0TESTREAL'));
  await popup.reload();
  await popup.waitForSelector('#watchlist .item');
  const popupText = await popup.evaluate(() => document.body.innerText);
  console.log('\n--- POPUP ---\n' + popupText);
  assert.match(popupText, /Kaffeevollautomat/);
  assert.match(popupText, /Ziel 1\.100,00/);
  if (SHOTS) {
    await popup.screenshot({ path: path.join(SHOTS, 'popup.png'), fullPage: true });
    await options.reload();
    await options.screenshot({ path: path.join(SHOTS, 'options.png'), fullPage: true });
  }

  await context.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
  console.log('\nE2E OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
