/*
 * Content script for Amazon pages.
 *  - Product pages: injects a "Preis-Check" card under the price that compares the
 *    offer with the 30-day lowest price, the struck-through price, your own
 *    recorded price history and the Keepa price chart.
 *  - Search results / deal pages: records prices and adds small badges
 *    ("war schon günstiger" / "Tiefstpreis").
 */
(() => {
  if (window.__preisCheckLoaded) return;
  window.__preisCheckLoaded = true;

  const PC = globalThis.PC;
  const domain = PC.domainFromHost(location.hostname);
  if (!domain) return;
  const cfg = PC.DOMAINS[domain];
  const fmt = (v) => PC.formatPrice(v, cfg.currency, cfg.locale);

  let settings = Object.assign({}, PC.DEFAULT_SETTINGS);
  let current = null; // { product, analysis }

  // ---------------------------------------------------------------- helpers

  /** Tiny DOM builder – never uses innerHTML for page-provided text. */
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  function svg(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
    return el;
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  const VERDICT_ICON = { good: '✓', ok: '!', bad: '✕', unknown: '?' };

  const CARD_CSS = `
    :host { all: initial; display: block; margin: 10px 0 14px; }
    * { box-sizing: border-box; }
    .card { font: 13px/1.45 "Amazon Ember", Arial, sans-serif; color: #0f1111; background: #fff;
      border: 1px solid #d5d9d9; border-left: 5px solid var(--c); border-radius: 8px; padding: 10px 12px; max-width: 640px; }
    .good { --c: #067d62; --bg: #e6f4f1; }
    .ok { --c: #b7791f; --bg: #fdf3e1; }
    .bad { --c: #c40000; --bg: #fdeaea; }
    .unknown { --c: #6b7280; --bg: #f1f2f4; }
    .head { display: flex; align-items: center; gap: 8px; }
    .brand { font-weight: 700; font-size: 13px; color: #565959; white-space: nowrap; }
    .pill { display: inline-flex; align-items: center; gap: 6px; background: var(--bg); color: var(--c);
      font-weight: 700; padding: 3px 10px; border-radius: 999px; font-size: 13px; }
    .pill b { display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 50%;
      background: var(--c); color: #fff; font-size: 11px; }
    .spacer { flex: 1; }
    button { font: inherit; cursor: pointer; }
    .icon-btn { border: none; background: none; color: #565959; font-size: 16px; padding: 0 4px; line-height: 1; }
    .body[hidden] { display: none; }
    ul { margin: 8px 0 6px; padding: 0; list-style: none; }
    li { position: relative; padding: 3px 0 3px 20px; }
    li::before { position: absolute; left: 2px; top: 3px; font-weight: 700; }
    li.good::before { content: "✓"; color: #067d62; }
    li.ok::before { content: "!"; color: #b7791f; left: 6px; }
    li.bad::before { content: "✕"; color: #c40000; }
    li.info::before { content: "i"; color: #007185; left: 6px; font-style: italic; font-family: Georgia, serif; }
    table { border-collapse: collapse; width: 100%; margin: 6px 0; }
    td { padding: 3px 6px 3px 0; vertical-align: top; border-top: 1px solid #f0f2f2; }
    td:first-child { color: #565959; width: 46%; }
    td.num { font-weight: 700; white-space: nowrap; }
    .delta { font-weight: 400; color: #565959; margin-left: 6px; }
    .delta.neg { color: #067d62; } .delta.pos { color: #c40000; }
    .spark { display: block; width: 100%; height: 46px; margin: 4px 0 2px; }
    .spark-legend { display: flex; justify-content: space-between; font-size: 11px; color: #565959; }
    .chart { margin-top: 8px; }
    .chart img { width: 100%; max-width: 640px; height: auto; border: 1px solid #f0f2f2; border-radius: 6px; display: block; }
    .chart .note { font-size: 11px; color: #565959; margin-top: 2px; }
    .btn { border: 1px solid #d5d9d9; background: #fff; border-radius: 999px; padding: 4px 12px; color: #0f1111;
      box-shadow: 0 1px 2px rgba(15,17,17,.12); }
    .btn:hover { background: #f7fafa; }
    .btn.primary { background: #ffd814; border-color: #fcd200; }
    .btn.primary:hover { background: #f7ca00; }
    .links { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .links a { color: #007185; text-decoration: none; border: 1px solid #d5d9d9; border-radius: 999px; padding: 2px 10px; font-size: 12px; }
    .links a:hover { color: #c7511f; border-color: #c7511f; }
    .watch { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 10px; padding-top: 8px; border-top: 1px solid #f0f2f2; }
    .watch input { width: 90px; padding: 4px 6px; border: 1px solid #888c8c; border-radius: 4px; font: inherit; }
    .muted { color: #565959; font-size: 12px; }
  `;

  // ------------------------------------------------------------ product page

  let hostEl = null;
  let shadow = null;
  let lastSignature = null;

  function findAnchor() {
    const sel = [
      '#corePriceDisplay_desktop_feature_div',
      '#corePrice_desktop',
      '#corePrice_feature_div',
      '#apex_desktop',
      '#price',
      '#titleSection',
    ];
    for (const s of sel) {
      const el = document.querySelector(s);
      if (el && el.parentElement) return el;
    }
    return null;
  }

  function ensureHost() {
    if (hostEl && hostEl.isConnected) return true;
    const anchor = findAnchor();
    if (!anchor) return false;
    hostEl = document.createElement('div');
    hostEl.id = 'preischeck-card-host';
    shadow = hostEl.attachShadow({ mode: 'open' });
    anchor.insertAdjacentElement('afterend', hostEl);
    return true;
  }

  function signature(product) {
    return [product.asin, product.price, (product.references || []).map((r) => r.kind + r.price).join(',')].join('|');
  }

  async function runProduct(force) {
    const product = PC.extractProduct(document, location.href);
    if (!product) return;
    const sig = signature(product);
    if (!force && sig === lastSignature && hostEl && hostEl.isConnected) return;
    lastSignature = sig;

    if (product.price) {
      await PC.recordPrices([
        { domain, asin: product.asin, price: product.price, title: product.title, image: product.image, currency: product.currency },
      ]);
    }
    const [hist, watchlist] = await Promise.all([PC.getHistory(domain, product.asin), PC.getWatchlist()]);
    const watch = watchlist[PC.itemKey(domain, product.asin)];
    const analysis = PC.analyze(product, hist ? hist.points : [], Date.now());
    current = { product, analysis };
    if (watch && product.price) {
      PC.updateWatch(domain, product.asin, { lastPrice: product.price, lastCheck: Date.now(), lastError: null });
    }
    if (ensureHost()) renderCard(product, analysis, hist, watch);
  }

  function deltaSpan(fraction) {
    if (fraction == null || !Number.isFinite(fraction)) return null;
    // fraction > 0 means the current price is BELOW the reference.
    const cls = fraction > 0.005 ? 'neg' : fraction < -0.005 ? 'pos' : '';
    const label = fraction > 0.005 ? `${PC.formatPercent(fraction)} günstiger` : fraction < -0.005 ? `${PC.formatPercent(-fraction)} teurer` : 'gleich';
    return h('span', { class: `delta ${cls}` }, label);
  }

  function statsTable(product, analysis) {
    const s = analysis.stats;
    const rows = [];
    const row = (label, value, extra) => rows.push(h('tr', {}, h('td', {}, label), h('td', { class: 'num' }, value, extra || null)));

    row('Aktueller Preis', fmt(s.price));
    if (s.claimedRef) {
      row(`Durchgestrichen: ${s.claimedRef.label.replace(/:$/, '')}`, fmt(s.claimedRef.price),
        h('span', { class: 'delta' }, `Amazon sagt −${Math.round(s.claimedDiscount * 100)} %`));
    }
    if (s.lowest30 && (!s.claimedRef || s.claimedRef.kind !== 'lowest30')) {
      row('Niedrigster Preis (30 Tage)', fmt(s.lowest30), deltaSpan(s.vsLowest30));
    } else if (s.lowest30) {
      row('Echter Rabatt ggü. 30-Tage-Tief', PC.formatPercent(s.vsLowest30));
    }
    if (s.typical && (!s.claimedRef || s.claimedRef.price !== s.typical)) {
      row('Typischer Preis (Amazon)', fmt(s.typical), deltaSpan((s.typical - s.price) / s.typical));
    }
    if (s.list && (!s.claimedRef || s.claimedRef.price !== s.list)) {
      row('UVP', fmt(s.list), deltaSpan((s.list - s.price) / s.list));
    }
    const hs = s.history;
    if (hs && hs.distinctDays >= 2) {
      row('Dein Tiefstpreis', fmt(hs.min), h('span', { class: 'delta' }, `am ${PC.formatDate(hs.minDate)}`));
      row('Dein Höchstpreis', fmt(hs.max), h('span', { class: 'delta' }, `am ${PC.formatDate(hs.maxDate)}`));
      row('Dein Durchschnitt', fmt(hs.avg), deltaSpan((hs.avg - s.price) / hs.avg));
    }
    if (hs) {
      row('Beobachtet seit', PC.formatDate(hs.first), h('span', { class: 'delta' }, `${hs.count} Messpunkt${hs.count === 1 ? '' : 'e'}`));
    }
    return h('table', {}, rows);
  }

  function sparkline(points) {
    const pts = (points || []).slice(-120);
    if (pts.length < 2) return null;
    const W = 600;
    const H = 46;
    const P = 4;
    const t0 = pts[0][0];
    const t1 = pts[pts.length - 1][0];
    const vals = pts.map((p) => p[1]);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const x = (t) => P + ((t - t0) / Math.max(1, t1 - t0)) * (W - 2 * P);
    const y = (v) => (hi === lo ? H / 2 : P + (1 - (v - lo) / (hi - lo)) * (H - 2 * P));
    // Step line: a price holds until the next observation.
    let d = `M${x(pts[0][0]).toFixed(1)},${y(pts[0][1]).toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      d += ` H${x(pts[i][0]).toFixed(1)} V${y(pts[i][1]).toFixed(1)}`;
    }
    const el = svg('svg', { class: 'spark', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': 'Dein Preisverlauf' });
    el.append(svg('path', { d, fill: 'none', stroke: '#007185', 'stroke-width': '2', 'vector-effect': 'non-scaling-stroke' }));
    const last = pts[pts.length - 1];
    el.append(svg('circle', { cx: x(last[0]), cy: y(last[1]), r: 3.5, fill: '#c7511f' }));
    const wrap = h('div', {},
      h('div', { class: 'muted' }, 'Dein aufgezeichneter Preisverlauf'),
      el,
      h('div', { class: 'spark-legend' }, h('span', {}, PC.formatDate(t0)), h('span', {}, `${fmt(lo)} – ${fmt(hi)}`), h('span', {}, PC.formatDate(t1)))
    );
    return wrap;
  }

  function keepaChart(product) {
    const url = PC.keepaChartUrl(domain, product.asin, settings.chartRangeDays);
    if (!url) return null;
    const box = h('div', { class: 'chart' });
    const load = () => {
      box.textContent = '';
      const img = h('img', { alt: 'Keepa-Preisverlauf', referrerpolicy: 'no-referrer' });
      let triedFallback = false;
      img.addEventListener('error', async () => {
        if (triedFallback) return;
        triedFallback = true;
        // Fallback: fetch through the extension background (bypasses page CSP).
        try {
          const res = await chrome.runtime.sendMessage({ type: 'fetchImage', url });
          if (res && res.dataUrl) {
            img.src = res.dataUrl;
            return;
          }
        } catch (e) {
          /* ignore */
        }
        img.replaceWith(h('div', { class: 'muted' }, 'Keepa-Chart konnte nicht geladen werden – nutze den Keepa-Link unten.'));
      });
      img.src = url;
      box.append(img, h('div', { class: 'note' }, `Preisverlauf der letzten ${settings.chartRangeDays} Tage (orange = Amazon, blau = Drittanbieter neu) · Quelle: Keepa`));
    };
    if (settings.autoChart) load();
    else box.append(h('button', { class: 'btn', onclick: load }, `📈 Keepa-Preisverlauf (${settings.chartRangeDays} Tage) anzeigen`));
    return box;
  }

  function watchRow(product, watch) {
    const box = h('div', { class: 'watch' });
    if (watch) {
      box.append(
        h('span', {}, '🔔 Wird beobachtet'),
        h('span', { class: 'muted' }, watch.targetPrice ? `Zielpreis ${fmt(watch.targetPrice)}` : 'Benachrichtigung bei jeder Preissenkung'),
        h('span', { class: 'spacer' }),
        h('button', {
          class: 'btn',
          onclick: async () => {
            await PC.removeWatch(domain, product.asin);
            runProduct(true);
          },
        }, 'Nicht mehr beobachten')
      );
    } else {
      const input = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'optional', 'aria-label': 'Zielpreis' });
      box.append(
        h('span', {}, 'Zielpreis'),
        input,
        h('button', {
          class: 'btn primary',
          onclick: async () => {
            const target = PC.parsePrice(input.value);
            await PC.setWatch({
              domain,
              asin: product.asin,
              title: product.title,
              image: product.image,
              targetPrice: target || null,
              lastPrice: product.price,
              lastCheck: Date.now(),
            });
            chrome.runtime.sendMessage({ type: 'watchChanged' }).catch(() => {});
            runProduct(true);
          },
        }, '🔔 Preis beobachten'),
        h('span', { class: 'muted' }, 'Die Extension prüft den Preis regelmäßig und meldet sich bei Preissenkungen.')
      );
    }
    return box;
  }

  function renderCard(product, analysis, hist, watch) {
    const collapsed = !!settings.cardCollapsed;
    const body = h('div', { class: 'body', hidden: collapsed },
      h('ul', {}, analysis.findings.map((f) => h('li', { class: f.level }, f.text))),
      statsTable(product, analysis),
      sparkline(hist ? hist.points : []),
      keepaChart(product),
      h('div', { class: 'links' },
        PC.comparisonLinks(domain, product.asin, product.title).map((l) =>
          h('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer' }, `${l.label} ↗`)
        )
      ),
      watchRow(product, watch)
    );
    const toggle = h('button', {
      class: 'icon-btn',
      title: collapsed ? 'Ausklappen' : 'Einklappen',
      'aria-expanded': String(!collapsed),
      onclick: async () => {
        settings.cardCollapsed = !settings.cardCollapsed;
        body.hidden = settings.cardCollapsed;
        toggle.textContent = settings.cardCollapsed ? '▸' : '▾';
        toggle.setAttribute('aria-expanded', String(!settings.cardCollapsed));
        PC.saveSettings({ cardCollapsed: settings.cardCollapsed });
      },
    }, collapsed ? '▸' : '▾');

    const card = h('div', { class: `card ${analysis.verdict}`, 'data-verdict': analysis.verdict },
      h('div', { class: 'head' },
        h('span', { class: 'brand' }, '🏷️ Preis-Check'),
        h('span', { class: 'pill' }, h('b', {}, VERDICT_ICON[analysis.verdict]), analysis.headline),
        product.dealLabel ? h('span', { class: 'muted' }, product.dealLabel) : null,
        h('span', { class: 'spacer' }),
        toggle
      ),
      body
    );
    shadow.textContent = '';
    shadow.append(h('style', {}, CARD_CSS), card);
  }

  // ---------------------------------------------------------- listing pages

  const BADGE_CSS = `
    :host { all: initial; display: inline-block; margin: 2px 0; }
    span { font: 600 11px/1.3 Arial, sans-serif; padding: 2px 7px; border-radius: 999px; display: inline-block; white-space: nowrap; }
    .bad { background: #fdeaea; color: #c40000; }
    .good { background: #e6f4f1; color: #067d62; }
  `;
  const processed = new WeakMap(); // tile element -> price last processed

  function listingBadge(item, stats) {
    if (!stats || stats.distinctDays < 2) return null;
    if (stats.min < item.price * 0.98) {
      return { level: 'bad', text: `⚠ War schon ${fmt(stats.min)} (${PC.formatDate(stats.minDate)})` };
    }
    if (stats.max > item.price * 1.05) {
      return { level: 'good', text: `✓ Tiefstpreis seit ${PC.formatDate(stats.first)}` };
    }
    return null;
  }

  async function runListing() {
    const now = Date.now();
    const items = PC.extractListingItems(document).filter((i) => processed.get(i.el) !== i.price);
    if (!items.length) return;
    items.forEach((i) => processed.set(i.el, i.price));

    // Read history BEFORE recording, so badges compare against earlier sightings.
    const keys = items.map((i) => PC.historyKey(domain, i.asin));
    const data = await chrome.storage.local.get(keys);
    if (settings.listingRecord) {
      await PC.recordPrices(items.map((i) => ({ domain, asin: i.asin, price: i.price, title: i.title, currency: cfg.currency })), now);
    }
    if (!settings.listingBadges) return;

    for (const item of items) {
      const hist = data[PC.historyKey(domain, item.asin)];
      const points = (hist ? hist.points : []).concat([[now, item.price]]);
      const badge = listingBadge(item, PC.historyStats(points, now, 365));
      const old = item.el.querySelector(':scope .preischeck-badge');
      if (old) old.remove();
      if (!badge) continue;
      const host = document.createElement('div');
      host.className = 'preischeck-badge';
      const root = host.attachShadow({ mode: 'open' });
      root.append(h('style', {}, BADGE_CSS), h('span', { class: badge.level, title: 'Preis-Check: laut deinem Preisverlauf' }, badge.text));
      const anchor = item.priceEl.closest('.a-row, [data-cy="price-recipe"]') || item.priceEl.parentElement;
      anchor.insertAdjacentElement('afterend', host);
    }
  }

  // ------------------------------------------------------------- bootstrap

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'getCurrentProduct') {
      sendResponse(current ? { product: current.product, analysis: current.analysis } : null);
    }
    return false;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.settings) {
      const before = settings;
      settings = Object.assign({}, PC.DEFAULT_SETTINGS, changes.settings.newValue || {});
      const chartUnchanged = ['autoChart', 'chartRangeDays'].every((k) => before[k] === settings[k]);
      if (isProductPage() && !chartUnchanged) runProduct(true);
    }
    if (changes.watch && isProductPage() && current) {
      const key = PC.itemKey(domain, current.product.asin);
      const a = (changes.watch.oldValue || {})[key];
      const b = (changes.watch.newValue || {})[key];
      if (!!a !== !!b || (a && b && a.targetPrice !== b.targetPrice)) runProduct(true);
    }
  });

  function isProductPage() {
    return !!document.querySelector('#productTitle') && /\/(dp|gp\/product|gp\/aw\/d)\//.test(location.pathname + '/');
  }

  /** After an extension update/reload the old content script loses its API access. */
  const contextAlive = () => {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  };

  async function start() {
    settings = await PC.getSettings();
    const product = isProductPage();
    const run = product ? runProduct : runListing;
    await run();
    const observer = new MutationObserver(
      debounce(() => {
        if (!contextAlive()) return observer.disconnect();
        run().catch((e) => console.debug('[Preis-Check]', e));
      }, product ? 700 : 900)
    );
    observer.observe(document.body, { childList: true, subtree: true, characterData: product });
  }

  start().catch((e) => console.warn('[Preis-Check]', e));
})();
