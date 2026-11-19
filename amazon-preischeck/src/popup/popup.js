(async () => {
  const { h } = PC;
  const $ = (id) => document.getElementById(id);

  const fmtFor = (domain, currency) => (v) =>
    PC.formatPrice(v, currency || (PC.DOMAINS[domain] || {}).currency, (PC.DOMAINS[domain] || {}).locale);

  $('open-options').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // ------------------------------------------------ current tab summary
  async function renderCurrent() {
    const box = $('current');
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) return;
      const res = await chrome.tabs.sendMessage(tab.id, { type: 'getCurrentProduct' });
      if (!res || !res.product) return;
      const { product, analysis } = res;
      const fmt = fmtFor(product.domain, product.currency);
      box.hidden = false;
      box.textContent = '';
      box.append(
        h('div', { class: `verdict ${analysis.verdict}` },
          h('div', { class: 'verdict-title' }, analysis.headline),
          h('div', { class: 'verdict-price' }, fmt(product.price)),
          h('div', { class: 'verdict-name' }, product.title),
          h('ul', { class: 'findings' }, analysis.findings.slice(0, 3).map((f) => h('li', { class: f.level }, f.text)))
        )
      );
    } catch (e) {
      // Not an Amazon product tab – nothing to show.
    }
  }

  // ------------------------------------------------------- watchlist
  async function renderWatchlist() {
    const [watch, all, lastRun] = await Promise.all([
      PC.getWatchlist(),
      chrome.storage.local.get(null),
      chrome.storage.local.get('lastWatchRun'),
    ]);
    const list = $('watchlist');
    list.textContent = '';
    const items = Object.values(watch).sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    $('watch-empty').hidden = items.length > 0;
    $('check-now').hidden = items.length === 0;
    const settings = await PC.getSettings();
    $('watch-status').textContent = items.length
      ? `Letzte Prüfung: ${PC.timeAgo(lastRun.lastWatchRun)}` +
        (settings.checkIntervalHours ? ` · alle ${settings.checkIntervalHours} Std.` : ' · automatische Prüfung aus')
      : '';

    for (const item of items) {
      const hist = all[PC.historyKey(item.domain, item.asin)];
      const stats = PC.historyStats(hist ? hist.points : [], Date.now(), 365);
      const fmt = fmtFor(item.domain, hist && hist.currency);
      const hit = item.targetPrice && item.lastPrice && item.lastPrice <= item.targetPrice;
      const image = item.image || (hist && hist.image);
      list.append(
        h('li', { class: `item ${hit ? 'hit' : ''}` },
          image ? h('img', { src: image, alt: '', loading: 'lazy' }) : h('div', { class: 'ph' }),
          h('div', { class: 'item-main' },
            h('a', { href: PC.productUrl(item.domain, item.asin), target: '_blank', class: 'item-title', title: item.title || item.asin }, item.title || item.asin),
            h('div', { class: 'item-meta' },
              h('b', {}, fmt(item.lastPrice)),
              stats && stats.distinctDays >= 2 ? h('span', {}, ` · Tief ${fmt(stats.min)} · Hoch ${fmt(stats.max)}`) : null,
              item.targetPrice ? h('span', { class: hit ? 'chip good' : 'chip' }, hit ? `🎯 unter Ziel ${fmt(item.targetPrice)}` : `Ziel ${fmt(item.targetPrice)}`) : null
            ),
            h('div', { class: item.lastError ? 'item-sub error' : 'item-sub' },
              item.lastError ? `⚠ ${item.lastError}` : `Geprüft ${PC.timeAgo(item.lastCheck)} · ${item.domain}`)
          ),
          h('button', {
            class: 'icon-btn',
            title: 'Von der Merkliste entfernen',
            'aria-label': 'Entfernen',
            onclick: async () => {
              await PC.removeWatch(item.domain, item.asin);
              renderWatchlist();
            },
          }, '×')
        )
      );
    }
  }

  // ---------------------------------------------------- recent history
  async function renderRecent() {
    const all = await chrome.storage.local.get(null);
    const entries = Object.entries(all)
      .filter(([k]) => k.startsWith('h|'))
      .map(([, v]) => v)
      .filter((v) => v && v.points && v.points.length && v.title)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, 8);
    const list = $('recent');
    list.textContent = '';
    $('recent-empty').hidden = entries.length > 0;
    for (const e of entries) {
      const fmt = fmtFor(e.domain, e.currency);
      const last = e.points[e.points.length - 1][1];
      const stats = PC.historyStats(e.points, Date.now(), 365);
      let chip = null;
      if (stats && stats.distinctDays >= 2) {
        if (stats.min < last * 0.98) chip = h('span', { class: 'chip bad' }, `war ${fmt(stats.min)}`);
        else if (stats.max > last * 1.05) chip = h('span', { class: 'chip good' }, 'Tiefstpreis');
      }
      list.append(
        h('li', { class: 'item compact' },
          h('div', { class: 'item-main' },
            h('a', { href: PC.productUrl(e.domain, e.asin), target: '_blank', class: 'item-title', title: e.title }, e.title),
            h('div', { class: 'item-meta' }, h('b', {}, fmt(last)), ` · ${e.points.length} Preis${e.points.length === 1 ? '' : 'e'} seit ${PC.formatDate(stats ? stats.first : e.points[0][0])} `, chip)
          )
        )
      );
    }
  }

  $('check-now').addEventListener('click', async () => {
    const btn = $('check-now');
    btn.disabled = true;
    btn.textContent = 'Prüfe…';
    try {
      const res = await chrome.runtime.sendMessage({ type: 'checkNow' });
      $('watch-status').textContent = res && !res.error
        ? `${res.checked} geprüft${res.drops ? ` · ${res.drops} Preissenkung(en)` : ''}${res.errors ? ` · ${res.errors} Fehler` : ''}`
        : `Fehler: ${(res && res.error) || 'unbekannt'}`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Jetzt prüfen';
      const status = $('watch-status').textContent;
      await renderWatchlist();
      $('watch-status').textContent = status;
    }
  });

  await Promise.all([renderCurrent(), renderWatchlist(), renderRecent()]);
})();
