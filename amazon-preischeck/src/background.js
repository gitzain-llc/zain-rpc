/*
 * Background service worker
 *  - periodically re-checks watched products (chrome.alarms)
 *  - sends notifications on price drops / target prices
 *  - proxies the Keepa chart image if the Amazon page blocks it
 */
importScripts('shared/config.js', 'shared/price.js', 'shared/analyze.js', 'shared/store.js');

const ALARM = 'preischeck-watchlist';
const OFFSCREEN_URL = 'src/offscreen/offscreen.html';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ alarms

async function scheduleAlarm() {
  const settings = await PC.getSettings();
  await chrome.alarms.clear(ALARM);
  if (settings.checkIntervalHours > 0) {
    chrome.alarms.create(ALARM, { delayInMinutes: 10, periodInMinutes: settings.checkIntervalHours * 60 });
  }
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await scheduleAlarm();
  if (reason === 'install') chrome.runtime.openOptionsPage();
});
chrome.runtime.onStartup.addListener(scheduleAlarm);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.settings) {
    const a = (changes.settings.oldValue || {}).checkIntervalHours;
    const b = (changes.settings.newValue || {}).checkIntervalHours;
    if (a !== b) scheduleAlarm();
  }
  if (changes.watch) updateBadge();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) checkWatchlist({ manual: false });
});

// --------------------------------------------------------------- offscreen

let creatingOffscreen = null;

async function ensureOffscreen() {
  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (contexts.length) return;
  }
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_URL,
        reasons: ['DOM_PARSER'],
        justification: 'Amazon-Produktseiten der Merkliste auslesen, um Preise zu vergleichen.',
      })
      .catch((e) => {
        if (!/single offscreen/i.test(String(e && e.message))) throw e;
      })
      .finally(() => {
        creatingOffscreen = null;
      });
  }
  await creatingOffscreen;
}

async function closeOffscreen() {
  try {
    await chrome.offscreen.closeDocument();
  } catch (e) {
    /* not open */
  }
}

async function parseProductHtml(html, url) {
  await ensureOffscreen();
  return chrome.runtime.sendMessage({ target: 'offscreen', type: 'parseProduct', html, url });
}

// --------------------------------------------------------------- watchlist

let runningCheck = null;

function checkWatchlist(opts) {
  if (!runningCheck) {
    runningCheck = doCheckWatchlist(opts || {}).finally(() => {
      runningCheck = null;
    });
  }
  return runningCheck;
}

async function doCheckWatchlist({ manual }) {
  const settings = await PC.getSettings();
  const items = Object.values(await PC.getWatchlist());
  const summary = { checked: 0, errors: 0, drops: 0 };
  try {
    for (let i = 0; i < items.length; i++) {
      // Be gentle with Amazon: space requests out.
      if (i > 0) await sleep(manual ? 1200 + Math.random() * 1500 : 5000 + Math.random() * 8000);
      const result = await checkItem(items[i], settings);
      summary.checked++;
      if (result.error) summary.errors++;
      if (result.dropped) summary.drops++;
    }
  } finally {
    await closeOffscreen();
    await chrome.storage.local.set({ lastWatchRun: Date.now() });
    updateBadge();
  }
  return summary;
}

async function checkItem(item, settings) {
  const now = Date.now();
  const url = `${PC.productUrl(item.domain, item.asin)}?psc=1`;
  try {
    const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
    if (!res.ok) throw new Error(`Amazon antwortet mit HTTP ${res.status}`);
    const html = await res.text();
    const product = await parseProductHtml(html, url);
    if (!product) throw new Error('Seite konnte nicht ausgelesen werden');
    if (product.captcha) throw new Error('Amazon-Robot-Check – Produktseite einmal im Browser öffnen');
    if (!product.price) throw new Error('Kein Preis gefunden (evtl. nicht lieferbar)');

    await PC.recordPrices([{ domain: item.domain, asin: item.asin, price: product.price, title: product.title, image: product.image, currency: product.currency }], now);
    const prev = item.lastPrice;
    await PC.updateWatch(item.domain, item.asin, { lastPrice: product.price, lastCheck: now, lastError: null, title: item.title || product.title });

    const dropped = prev && product.price < prev * 0.99;
    const hitTarget = item.targetPrice && product.price <= item.targetPrice && !(prev && prev <= item.targetPrice);
    if (settings.notify && (hitTarget || (!item.targetPrice && dropped))) {
      notify(item, product, prev, hitTarget);
    }
    return { dropped: !!dropped };
  } catch (e) {
    await PC.updateWatch(item.domain, item.asin, { lastCheck: now, lastError: String((e && e.message) || e) });
    return { error: true };
  }
}

function notify(item, product, prev, hitTarget) {
  const cfg = PC.DOMAINS[item.domain] || {};
  const fmt = (v) => PC.formatPrice(v, product.currency, cfg.locale);
  const analysis = PC.analyze(product, [], Date.now());
  const title = hitTarget
    ? `🎯 Zielpreis erreicht: ${fmt(product.price)}`
    : `📉 Preis gesunken: ${fmt(product.price)}${prev ? ` (vorher ${fmt(prev)})` : ''}`;
  chrome.notifications.create(`pc|${item.domain}|${item.asin}|${Date.now()}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title,
    message: `${(item.title || product.title || item.asin).slice(0, 110)}\nPreis-Check: ${analysis.headline}`,
    priority: 1,
  });
}

chrome.notifications.onClicked.addListener((id) => {
  const [prefix, domain, asin] = id.split('|');
  if (prefix === 'pc' && domain && asin) chrome.tabs.create({ url: PC.productUrl(domain, asin) });
  chrome.notifications.clear(id);
});

/** Toolbar badge: number of watched items at or below their target price. */
async function updateBadge() {
  const items = Object.values(await PC.getWatchlist());
  const hits = items.filter((i) => i.targetPrice && i.lastPrice && i.lastPrice <= i.targetPrice).length;
  await chrome.action.setBadgeBackgroundColor({ color: '#067d62' });
  await chrome.action.setBadgeText({ text: hits ? String(hits) : '' });
}

// ---------------------------------------------------------------- messages

async function fetchImageAsDataUrl(url) {
  if (!/^https:\/\/graph\.keepa\.com\//.test(url)) throw new Error('URL nicht erlaubt');
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get('content-type') || 'image/png';
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return `data:${type};base64,${btoa(bin)}`;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target === 'offscreen') return false;
  if (sender.id !== chrome.runtime.id) return false;

  if (msg.type === 'fetchImage') {
    fetchImageAsDataUrl(msg.url)
      .then((dataUrl) => sendResponse({ dataUrl }))
      .catch((e) => sendResponse({ error: String(e.message || e) }));
    return true;
  }
  if (msg.type === 'checkNow') {
    checkWatchlist({ manual: true })
      .then((summary) => sendResponse(summary))
      .catch((e) => sendResponse({ error: String(e.message || e) }));
    return true;
  }
  if (msg.type === 'watchChanged') {
    updateBadge();
    return false;
  }
  return false;
});
