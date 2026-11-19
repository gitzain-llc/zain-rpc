/*
 * Price parsing & formatting helpers (locale independent).
 */
(function (root) {
  const PC = (root.PC = root.PC || {});

  /**
   * Parse a price string as Amazon renders it in any marketplace.
   *   "1.299,99 €" -> 1299.99    "€1,299.99" -> 1299.99
   *   "12,99 €"    -> 12.99      "1 299,99 zł" -> 1299.99
   *   "$1,299"     -> 1299       "£12.99" -> 12.99
   * Returns null if no plausible price is found.
   */
  PC.parsePrice = function (input) {
    if (input == null) return null;
    if (typeof input === 'number') return Number.isFinite(input) && input > 0 ? input : null;
    const text = String(input).replace(/[   ]/g, ' ');
    // First number-like token, allowing thousands separators (space, dot, comma, apostrophe).
    const m = text.match(/\d(?:[\d.,']|\s(?=\d{3}(?:\D|$)))*/);
    if (!m) return null;
    let token = m[0].replace(/[\s']/g, '').replace(/[.,]+$/, '');
    if (!token) return null;

    const lastDot = token.lastIndexOf('.');
    const lastComma = token.lastIndexOf(',');
    let decimalSep = null;

    if (lastDot !== -1 && lastComma !== -1) {
      decimalSep = lastDot > lastComma ? '.' : ',';
    } else if (lastDot !== -1 || lastComma !== -1) {
      const sep = lastDot !== -1 ? '.' : ',';
      const occurrences = token.split(sep).length - 1;
      const digitsAfter = token.length - token.lastIndexOf(sep) - 1;
      // A single separator followed by 1-2 digits is a decimal separator,
      // followed by exactly 3 digits it is a thousands separator.
      if (occurrences === 1 && digitsAfter > 0 && digitsAfter <= 2) decimalSep = sep;
    }

    let normalized;
    if (decimalSep) {
      const thousandsSep = decimalSep === '.' ? ',' : '.';
      normalized = token.split(thousandsSep).join('').replace(decimalSep, '.');
    } else {
      normalized = token.replace(/[.,]/g, '');
    }
    const value = Number(normalized);
    return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
  };

  PC.formatPrice = function (value, currency, locale) {
    if (value == null || !Number.isFinite(value)) return '–';
    try {
      return new Intl.NumberFormat(locale || 'de-DE', { style: 'currency', currency: currency || 'EUR' }).format(value);
    } catch (e) {
      return value.toFixed(2) + ' ' + (currency || '');
    }
  };

  /** 0.237 -> "24 %" (German style) */
  PC.formatPercent = function (fraction, withSign) {
    if (fraction == null || !Number.isFinite(fraction)) return '–';
    const pct = Math.round(fraction * 100);
    const sign = withSign && pct > 0 ? '+' : pct < 0 ? '−' : '';
    return `${sign}${Math.abs(pct)} %`;
  };

  PC.formatDate = function (ts) {
    if (!ts) return '–';
    return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = PC;
})(typeof globalThis !== 'undefined' ? globalThis : this);
