/*
 * Persistence helpers on top of chrome.storage.local.
 *   h|<domain>|<asin>  -> { asin, domain, title, image, currency, points: [[ts, price], ...] }
 *   watch              -> { "<domain>|<asin>": { asin, domain, title, targetPrice, addedAt, lastCheck, lastPrice, lastError } }
 *   settings           -> see PC.DEFAULT_SETTINGS
 */
(function (root) {
  const PC = (root.PC = root.PC || {});

  const MAX_POINTS = 1000;
  const MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000;
  const SAME_PRICE_GAP_MS = 6 * 60 * 60 * 1000;

  const local = () => chrome.storage.local;

  PC.itemKey = (domain, asin) => `${domain}|${asin}`;
  PC.historyKey = (domain, asin) => `h|${domain}|${asin}`;

  PC.getSettings = async function () {
    const { settings } = await local().get('settings');
    return Object.assign({}, PC.DEFAULT_SETTINGS, settings || {});
  };

  PC.saveSettings = async function (patch) {
    const current = await PC.getSettings();
    const settings = Object.assign(current, patch);
    await local().set({ settings });
    return settings;
  };

  PC.getHistory = async function (domain, asin) {
    const key = PC.historyKey(domain, asin);
    const data = await local().get(key);
    return data[key] || null;
  };

  /** Pure helper (unit-tested): append a price point with de-duplication & pruning. */
  PC.appendPoint = function (points, price, ts) {
    const pts = (points || []).filter((p) => ts - p[0] <= MAX_AGE_MS);
    const last = pts[pts.length - 1];
    if (last && Math.abs(last[1] - price) < 0.005 && ts - last[0] < SAME_PRICE_GAP_MS) return pts;
    pts.push([ts, price]);
    return pts.length > MAX_POINTS ? pts.slice(pts.length - MAX_POINTS) : pts;
  };

  /** Record one or many observed prices. items: [{ domain, asin, price, title?, image?, currency? }] */
  PC.recordPrices = async function (items, ts) {
    ts = ts || Date.now();
    const valid = (items || []).filter((i) => i && i.domain && i.asin && i.price > 0);
    if (!valid.length) return {};
    const keys = valid.map((i) => PC.historyKey(i.domain, i.asin));
    const existing = await local().get(keys);
    const updates = {};
    for (const i of valid) {
      const key = PC.historyKey(i.domain, i.asin);
      const entry = updates[key] || existing[key] || { asin: i.asin, domain: i.domain, points: [] };
      if (i.title) entry.title = i.title;
      if (i.image) entry.image = i.image;
      entry.currency = i.currency || entry.currency || (PC.DOMAINS[i.domain] || {}).currency;
      entry.points = PC.appendPoint(entry.points, i.price, ts);
      entry.updatedAt = ts;
      updates[key] = entry;
    }
    await local().set(updates);
    return updates;
  };

  PC.getWatchlist = async function () {
    const { watch } = await local().get('watch');
    return watch || {};
  };

  PC.setWatch = async function (item) {
    const watch = await PC.getWatchlist();
    const key = PC.itemKey(item.domain, item.asin);
    watch[key] = Object.assign({ addedAt: Date.now() }, watch[key] || {}, item);
    await local().set({ watch });
    return watch[key];
  };

  /** Update an existing watch entry only (never re-adds a removed one). */
  PC.updateWatch = async function (domain, asin, patch) {
    const watch = await PC.getWatchlist();
    const key = PC.itemKey(domain, asin);
    if (!watch[key]) return null;
    watch[key] = Object.assign({}, watch[key], patch);
    await local().set({ watch });
    return watch[key];
  };

  PC.removeWatch = async function (domain, asin) {
    const watch = await PC.getWatchlist();
    delete watch[PC.itemKey(domain, asin)];
    await local().set({ watch });
  };

  PC.exportAll = async function () {
    return local().get(null);
  };

  /** Import a backup; price histories are merged with existing data, not replaced. */
  PC.importAll = async function (data) {
    if (!data || typeof data !== 'object') throw new Error('Ungültige Datei');
    const keys = Object.keys(data).filter((k) => k === 'settings' || k === 'watch' || k.startsWith('h|'));
    if (!keys.length) throw new Error('Keine Preis-Check-Daten in der Datei gefunden');
    const existing = await local().get(keys);
    const updates = {};
    for (const k of keys) {
      const v = data[k];
      if (!v || typeof v !== 'object') continue;
      if (k.startsWith('h|') && existing[k] && Array.isArray(v.points)) {
        const byTs = new Map();
        for (const p of existing[k].points.concat(v.points)) {
          if (Array.isArray(p) && p[1] > 0) byTs.set(p[0], p);
        }
        const points = [...byTs.values()].sort((a, b) => a[0] - b[0]).slice(-MAX_POINTS);
        updates[k] = Object.assign({}, existing[k], v, { points });
      } else if (existing[k] && k !== 'settings' && !k.startsWith('h|')) {
        updates[k] = Object.assign({}, existing[k], v);
      } else {
        updates[k] = v;
      }
    }
    await local().set(updates);
    return Object.keys(updates).filter((k) => k.startsWith('h|')).length;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = PC;
})(typeof globalThis !== 'undefined' ? globalThis : this);
