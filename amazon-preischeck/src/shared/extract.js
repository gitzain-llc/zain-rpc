/*
 * Extract product & price information from an Amazon document.
 * Works on the live page (content script) and on fetched HTML parsed
 * with DOMParser (offscreen document for watchlist checks).
 */
(function (root) {
  const PC = (root.PC = root.PC || {});

  const ASIN_RE = /^[A-Z0-9]{10}$/;

  /** Containers that hold the main buy-box price on product pages (new + old layouts). */
  const PRICE_CONTAINERS = [
    '#corePriceDisplay_desktop_feature_div',
    '#corePrice_desktop',
    '#corePrice_feature_div',
    '#apex_desktop',
    '#apex_offerDisplay_desktop',
    '#price',
    '#priceblock_dealprice_row',
    '#buybox',
  ];

  /** Selectors for the price the customer actually pays, most specific first. */
  const CURRENT_PRICE_SELECTORS = [
    '#corePriceDisplay_desktop_feature_div .priceToPay',
    '#corePriceDisplay_desktop_feature_div .apexPriceToPay',
    '#corePrice_desktop .apexPriceToPay',
    '#corePrice_desktop .priceToPay',
    '#apex_desktop .priceToPay',
    '#apex_desktop .apexPriceToPay',
    '#apex_offerDisplay_desktop .priceToPay',
    '#corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price)',
    '#corePrice_feature_div .a-price:not(.a-text-price)',
    '#corePrice_desktop .a-price:not(.a-text-price)',
    '#apex_desktop .a-price:not(.a-text-price)',
    '#tp_price_block_total_price_ww',
    '#priceblock_dealprice',
    '#priceblock_ourprice',
    '#priceblock_saleprice',
    '#price_inside_buybox',
    '#newBuyBoxPrice',
    '#kindle-price',
  ];

  /** Classify the label next to a strikethrough/reference price. */
  PC.classifyReference = function (label) {
    const l = String(label || '').toLowerCase();
    if (/niedrigst|30\s*tage|30\s*days|lowest|le plus bas|più basso|piu basso|más bajo|mas bajo|laagste|najniższ|lägsta/.test(l)) return 'lowest30';
    if (/uvp|unverb|preisempf|list\s*price|rrp|recommended|prix conseill|prezzo consigliato|precio recomendado|adviesprijs|cena katalogowa|rekommenderat/.test(l)) return 'list';
    if (/typisch|mittler|durchschn|typical|median|prix moyen|prezzo medio|precio medio|gemiddeld/.test(l)) return 'typical';
    if (/(^|\s)(was|statt|vorher|früher|ancien prix|prima)\b/.test(l)) return 'was';
    return 'other';
  };

  PC.REFERENCE_LABELS = {
    lowest30: 'Niedrigster Preis (30 Tage)',
    list: 'UVP / Listenpreis',
    typical: 'Typischer Preis',
    was: 'Vorheriger Preis',
    other: 'Durchgestrichener Preis',
  };

  function text(el) {
    return el ? String(el.textContent || '').replace(/\s+/g, ' ').trim() : '';
  }

  /** Read a numeric price from an .a-price / .a-offscreen / legacy price element. */
  PC.readPriceElement = function (el) {
    if (!el) return null;
    const off = el.matches && el.matches('.a-offscreen') ? el : el.querySelector && el.querySelector('.a-offscreen');
    if (off) {
      const p = PC.parsePrice(text(off));
      if (p) return p;
    }
    const whole = el.querySelector && el.querySelector('.a-price-whole');
    if (whole) {
      const digits = text(whole).replace(/\D/g, '');
      const frac = text(el.querySelector('.a-price-fraction')).replace(/\D/g, '') || '00';
      if (digits) {
        const p = Number(`${digits}.${frac}`);
        if (Number.isFinite(p) && p > 0) return p;
      }
    }
    return PC.parsePrice(text(el));
  };

  /** Unit prices like "(12,50 € / kg)" must never be mistaken for product prices. */
  function isUnitPrice(el) {
    if (el.closest('.pricePerUnit, [class*="pricePerUnit"], [class*="PricePerUnit"]')) return true;
    if (el.getAttribute('data-a-size') === 'mini') return true;
    let after = '';
    for (let n = el.nextSibling; n && after.length < 30; n = n.nextSibling) after += n.textContent || '';
    return /^\s*\)?\s*\/\s*\S/.test(after) || /^\s*(pro|per|je)\s/i.test(after);
  }

  function labelFor(priceEl) {
    const holder = priceEl.closest('.basisPrice') || priceEl.closest('tr') || priceEl.parentElement;
    if (!holder) return '';
    // Holder text minus the price itself (and accessibility duplicates of it).
    let label = text(holder);
    const priceText = text(priceEl);
    if (priceText) label = label.split(priceText).join(' ');
    label = label
      .replace(/(?:[€$£]\s?\d[\d.,]*|\d[\d.,]*\s?(?:€|EUR|zł|kr))/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return label.slice(0, 80);
  }

  function findAsin(doc, url) {
    const candidates = [
      doc.querySelector('#ASIN') && doc.querySelector('#ASIN').value,
      doc.querySelector('input[name="ASIN"]') && doc.querySelector('input[name="ASIN"]').value,
      doc.querySelector('[data-asin]#dp') && doc.querySelector('[data-asin]#dp').getAttribute('data-asin'),
    ];
    const m = String(url || '').match(/\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/ASIN)\/([A-Z0-9]{10})(?:[/?#]|$)/i);
    if (m) candidates.push(m[1]);
    const canonical = doc.querySelector('link[rel="canonical"]');
    if (canonical) {
      const c = String(canonical.getAttribute('href') || '').match(/\/dp\/([A-Z0-9]{10})/i);
      if (c) candidates.push(c[1]);
    }
    for (const c of candidates) {
      if (c && ASIN_RE.test(String(c).toUpperCase())) return String(c).toUpperCase();
    }
    return null;
  }

  function findCurrentPrice(doc) {
    for (const sel of CURRENT_PRICE_SELECTORS) {
      const els = doc.querySelectorAll(sel);
      for (const el of els) {
        if (el.closest('[data-a-strike="true"], .a-text-strike')) continue;
        if (isUnitPrice(el)) continue;
        const p = PC.readPriceElement(el);
        if (p) return p;
      }
    }
    return null;
  }

  function findReferences(doc, current) {
    const seen = new Set();
    const refs = [];
    const containers = PRICE_CONTAINERS.map((s) => doc.querySelector(s)).filter(Boolean);
    const scanned = new Set();

    for (const container of containers) {
      for (const el of container.querySelectorAll('.a-price.a-text-price, .a-text-strike, .priceBlockStrikePriceString')) {
        if (scanned.has(el)) continue;
        scanned.add(el);
        if (el.matches('.apexPriceToPay, .priceToPay') || isUnitPrice(el)) continue;
        const price = PC.readPriceElement(el);
        if (!price) continue;
        const label = labelFor(el);
        const kind = PC.classifyReference(label);
        const struck = el.getAttribute('data-a-strike') === 'true' || el.matches('.a-text-strike, .priceBlockStrikePriceString');
        if (!struck && kind === 'other') continue; // some unrelated secondary price
        const key = kind + ':' + price;
        if (seen.has(key)) continue;
        seen.add(key);
        refs.push({ kind, label: label || PC.REFERENCE_LABELS[kind], price });
      }
    }

    // Text fallback for the EU "lowest price of the last 30 days" note.
    if (!refs.some((r) => r.kind === 'lowest30')) {
      const area = containers.map(text).join(' ');
      const m = area.match(/(Niedrigster Preis[^:]{0,50}|Lowest price[^:]{0,50}|Prix le plus bas[^:]{0,50}):\s*([€$£]?\s?[\d.,\s]+\s?(?:€|EUR|\$|£)?)/i);
      if (m) {
        const price = PC.parsePrice(m[2]);
        if (price) refs.push({ kind: 'lowest30', label: m[1].trim(), price });
      }
    }

    // Do not treat the current price itself as a reference.
    return refs.filter((r) => !(current && Math.abs(r.price - current) < 0.005 && r.kind === 'other'));
  }

  function findSavingsPercent(doc) {
    const el = doc.querySelector(
      '#corePriceDisplay_desktop_feature_div .savingsPercentage, #corePrice_desktop .savingsPercentage, #apex_desktop .savingsPercentage, .reinventPriceSavingsPercentageMargin'
    );
    const m = text(el).match(/(\d{1,2})\s*%/);
    return m ? Number(m[1]) / 100 : null;
  }

  function findDealLabel(doc) {
    const els = doc.querySelectorAll(
      '#dealBadge_feature_div, #dealBadgeSupportingText, #dealsAccordionRow, .dealBadge, #apex_desktop .a-badge-text, #corePriceDisplay_desktop_feature_div .a-badge-text, [id*="dealBadge"]'
    );
    for (const el of els) {
      const t = text(el);
      if (/black\s*friday|cyber\s*monday|blitzangebot|lightning|prime\s*day|angebot|deal|offre|offerta|oferta|aanbieding/i.test(t)) {
        return t.slice(0, 60);
      }
    }
    return null;
  }

  function findCoupon(doc) {
    const el = doc.querySelector('#promoPriceBlockMessage_feature_div, #couponBadge_feature_div, [id*="couponBadge"], #vpcButton');
    const t = text(el);
    return /coupon|gutschein/i.test(t) ? t.slice(0, 90) : null;
  }

  /**
   * Extract the product shown on an Amazon product page.
   * @param {Document} doc
   * @param {string} url  page URL (needed for DOMParser documents)
   * @returns {object|null}
   */
  PC.extractProduct = function (doc, url) {
    let host = '';
    try {
      host = new URL(url).hostname;
    } catch (e) {
      /* ignore */
    }
    const domain = PC.domainFromHost(host);
    if (!domain) return null;
    const asin = findAsin(doc, url);
    const titleEl = doc.querySelector('#productTitle, #title');
    if (!asin || !titleEl) return null;

    const price = findCurrentPrice(doc);
    const img = doc.querySelector('#landingImage, #imgBlkFront, #main-image');
    return {
      asin,
      domain,
      url: PC.productUrl(domain, asin),
      title: text(titleEl),
      image: img ? img.getAttribute('data-old-hires') || img.getAttribute('src') || null : null,
      currency: PC.DOMAINS[domain].currency,
      price,
      references: findReferences(doc, price),
      savingsPercent: findSavingsPercent(doc),
      dealLabel: findDealLabel(doc),
      coupon: findCoupon(doc),
      captcha: false,
    };
  };

  /** True when Amazon served its robot check instead of a product page. */
  PC.isCaptchaPage = function (doc) {
    return !!doc.querySelector('form[action*="validateCaptcha"], #captchacharacters');
  };

  /**
   * Extract compact product tiles from search results / deal pages.
   * Returns [{ asin, el, priceEl, price, strikePrice, title }]
   */
  PC.extractListingItems = function (doc) {
    const items = [];
    const nodes = doc.querySelectorAll('[data-asin]');
    for (const el of nodes) {
      const asin = String(el.getAttribute('data-asin') || '').toUpperCase();
      if (!ASIN_RE.test(asin)) continue;
      // Skip nested duplicates: use the outermost element for this ASIN.
      const parent = el.parentElement && el.parentElement.closest(`[data-asin="${el.getAttribute('data-asin')}"]`);
      if (parent) continue;
      const priceEl = el.querySelector('.a-price:not(.a-text-price)');
      if (!priceEl || isUnitPrice(priceEl)) continue;
      const price = PC.readPriceElement(priceEl);
      if (!price) continue;
      const strikeEl = [...el.querySelectorAll('.a-price.a-text-price')].find((s) => !isUnitPrice(s));
      const strikePrice = strikeEl ? PC.readPriceElement(strikeEl) : null;
      const titleEl = el.querySelector('h2, [data-cy="title-recipe"] span, .a-text-normal');
      items.push({
        asin,
        el,
        priceEl,
        price,
        strikePrice: strikePrice && strikePrice > price ? strikePrice : null,
        title: text(titleEl).slice(0, 200),
      });
    }

    // Fallback for deal grids / carousels without data-asin: find the nearest
    // container around a price that links to exactly one product (/dp/ASIN).
    const seen = new Set(items.map((i) => i.el));
    for (const priceEl of doc.querySelectorAll('.a-price:not(.a-text-price)')) {
      const tile = priceEl.closest('[data-asin]');
      if (tile && ASIN_RE.test(String(tile.getAttribute('data-asin')).toUpperCase())) continue;
      if (isUnitPrice(priceEl)) continue;
      let found = null;
      let node = priceEl.parentElement;
      for (let depth = 0; node && depth < 8; depth++, node = node.parentElement) {
        const links = node.querySelectorAll('a[href*="/dp/"]');
        if (!links.length) continue;
        const asins = new Set();
        for (const a of links) {
          const m = String(a.getAttribute('href')).match(/\/dp\/([A-Z0-9]{10})/i);
          if (m) asins.add(m[1].toUpperCase());
        }
        if (asins.size === 1) found = { el: node, asin: [...asins][0] };
        break;
      }
      if (!found || seen.has(found.el)) continue;
      seen.add(found.el);
      const price = PC.readPriceElement(priceEl);
      if (!price) continue;
      const strikeEl = [...found.el.querySelectorAll('.a-price.a-text-price')].find((x) => !isUnitPrice(x));
      const strikePrice = strikeEl ? PC.readPriceElement(strikeEl) : null;
      const titleEl = found.el.querySelector('[class*="title"], h2, h3, img[alt]');
      items.push({
        asin: found.asin,
        el: found.el,
        priceEl,
        price,
        strikePrice: strikePrice && strikePrice > price ? strikePrice : null,
        title: (titleEl && titleEl.tagName === 'IMG' ? titleEl.getAttribute('alt') : text(titleEl)).slice(0, 200),
      });
    }
    return items;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = PC;
})(typeof globalThis !== 'undefined' ? globalThis : this);
