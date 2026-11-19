/*
 * Shared configuration for all extension contexts
 * (content script, popup, options, background, offscreen).
 * Classic script: attaches to globalThis.PC so it works everywhere
 * without a bundler. Also exports for Node-based unit tests.
 */
(function (root) {
  const PC = (root.PC = root.PC || {});

  /**
   * Supported Amazon marketplaces.
   * keepa: Keepa domain id (null = Keepa does not cover this marketplace)
   * camel: camelcamelcamel locale subdomain (null = not covered)
   * idealo: idealo host for price comparison search (null = none)
   */
  PC.DOMAINS = {
    'amazon.de': { keepa: 3, camel: 'de', idealo: 'www.idealo.de', geizhals: 'geizhals.de', currency: 'EUR', locale: 'de-DE' },
    'amazon.fr': { keepa: 4, camel: 'fr', idealo: 'www.idealo.fr', geizhals: null, currency: 'EUR', locale: 'fr-FR' },
    'amazon.it': { keepa: 8, camel: 'it', idealo: 'www.idealo.it', geizhals: null, currency: 'EUR', locale: 'it-IT' },
    'amazon.es': { keepa: 9, camel: 'es', idealo: 'www.idealo.es', geizhals: null, currency: 'EUR', locale: 'es-ES' },
    'amazon.nl': { keepa: null, camel: null, idealo: null, geizhals: null, currency: 'EUR', locale: 'nl-NL' },
    'amazon.com.be': { keepa: null, camel: null, idealo: null, geizhals: null, currency: 'EUR', locale: 'fr-BE' },
    'amazon.pl': { keepa: null, camel: null, idealo: null, geizhals: null, currency: 'PLN', locale: 'pl-PL' },
    'amazon.se': { keepa: null, camel: null, idealo: null, geizhals: null, currency: 'SEK', locale: 'sv-SE' },
    'amazon.co.uk': { keepa: 2, camel: 'uk', idealo: 'www.idealo.co.uk', geizhals: null, currency: 'GBP', locale: 'en-GB' },
    'amazon.com': { keepa: 1, camel: 'us', idealo: null, geizhals: null, currency: 'USD', locale: 'en-US' },
    'amazon.ca': { keepa: 6, camel: 'ca', idealo: null, geizhals: null, currency: 'CAD', locale: 'en-CA' },
  };

  PC.DEFAULT_SETTINGS = {
    autoChart: true, // Keepa-Chart automatisch laden
    chartRangeDays: 90, // Zeitraum des Keepa-Charts
    listingBadges: true, // Hinweise in Suchergebnissen / Deal-Seiten
    listingRecord: true, // Preise aus Suchergebnissen mitspeichern
    checkIntervalHours: 12, // Merkliste automatisch prüfen (0 = aus)
    notify: true, // Benachrichtigung bei Preissenkung / Zielpreis
    cardCollapsed: false, // Info-Karte eingeklappt
  };

  /** "www.amazon.de" -> "amazon.de" (null if not a supported marketplace) */
  PC.domainFromHost = function (host) {
    if (!host) return null;
    const h = String(host).toLowerCase().replace(/^(www|smile)\./, '');
    return PC.DOMAINS[h] ? h : null;
  };

  PC.productUrl = function (domain, asin) {
    return `https://www.${domain}/dp/${asin}`;
  };

  /** Shorten a product title into a useful search query for comparison sites. */
  PC.searchQuery = function (title) {
    if (!title) return '';
    let t = String(title)
      .replace(/[\[(].*?[\])]/g, ' ') // remove bracketed marketing noise
      .replace(/[|,–—:;].*$/, '') // cut at first separator (usually feature list)
      .replace(/\s+/g, ' ')
      .trim();
    if (t.length < 8) t = String(title).replace(/\s+/g, ' ').trim();
    const words = t.split(' ').slice(0, 8);
    let q = words.join(' ');
    if (q.length > 70) q = q.slice(0, 70).replace(/\s+\S*$/, '');
    return q;
  };

  PC.comparisonLinks = function (domain, asin, title) {
    const cfg = PC.DOMAINS[domain] || {};
    const q = encodeURIComponent(PC.searchQuery(title));
    const links = [];
    if (cfg.keepa) {
      links.push({ id: 'keepa', label: 'Keepa', url: `https://keepa.com/#!product/${cfg.keepa}-${asin}` });
    }
    if (cfg.camel) {
      const host = cfg.camel === 'us' ? 'camelcamelcamel.com' : `${cfg.camel}.camelcamelcamel.com`;
      links.push({ id: 'camel', label: 'CamelCamelCamel', url: `https://${host}/product/${asin}` });
    }
    if (cfg.idealo && q) {
      links.push({ id: 'idealo', label: 'idealo', url: `https://${cfg.idealo}/preisvergleich/MainSearchProductCategory.html?q=${q}` });
    }
    if (cfg.geizhals && q) {
      links.push({ id: 'geizhals', label: 'Geizhals', url: `https://${cfg.geizhals}/?fs=${q}` });
    }
    if (q) {
      links.push({ id: 'google', label: 'Google Shopping', url: `https://www.google.com/search?tbm=shop&q=${q}` });
    }
    return links;
  };

  /** Keepa price-history chart (public image, no API key needed). */
  PC.keepaChartUrl = function (domain, asin, rangeDays) {
    const cfg = PC.DOMAINS[domain];
    if (!cfg || !cfg.keepa || !asin) return null;
    const range = [30, 90, 180, 365].includes(Number(rangeDays)) ? Number(rangeDays) : 90;
    return `https://graph.keepa.com/pricehistory.png?asin=${encodeURIComponent(asin)}&domain=${cfg.keepa}` +
      `&range=${range}&amazon=1&new=1&used=0&salesrank=0&width=640&height=260`;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = PC;
})(typeof globalThis !== 'undefined' ? globalThis : this);
