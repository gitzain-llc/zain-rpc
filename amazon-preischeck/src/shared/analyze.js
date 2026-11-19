/*
 * Decide whether an Amazon offer is a real deal.
 *
 * Evidence used (strongest first):
 *  1. Amazon's own "lowest price of the last 30 days" (EU price indication
 *     directive) – the legally required reference for discounts.
 *  2. Your own locally recorded price history for this product.
 *  3. Amazon's "typical price" / median price.
 *  4. UVP / list price – weakest, often inflated.
 */
(function (root) {
  const PC = (root.PC = root.PC || {});

  const DAY = 24 * 60 * 60 * 1000;
  const RANK = { bad: 3, good: 2, ok: 1, info: 0 };

  /** Summary statistics over recorded [timestamp, price] points. */
  PC.historyStats = function (points, now, windowDays) {
    const since = (now || Date.now()) - (windowDays || 365) * DAY;
    const pts = (points || []).filter((p) => p && p[0] >= since && p[1] > 0);
    if (!pts.length) return null;
    let min = pts[0];
    let max = pts[0];
    let sum = 0;
    const days = new Set();
    for (const p of pts) {
      if (p[1] < min[1] || (p[1] === min[1] && p[0] > min[0])) min = p;
      if (p[1] > max[1]) max = p;
      sum += p[1];
      days.add(new Date(p[0]).toDateString());
    }
    return {
      count: pts.length,
      distinctDays: days.size,
      first: pts.reduce((a, p) => Math.min(a, p[0]), Infinity),
      min: min[1],
      minDate: min[0],
      max: max[1],
      maxDate: max[0],
      avg: Math.round((sum / pts.length) * 100) / 100,
    };
  };

  /**
   * @param {object} product  result of PC.extractProduct (price, references, ...)
   * @param {Array}  points   [[timestamp, price], ...] recorded locally (may include the current visit)
   * @param {number} [now]
   */
  PC.analyze = function (product, points, now) {
    now = now || Date.now();
    const fmt = (v) => PC.formatPrice(v, product.currency, (PC.DOMAINS[product.domain] || {}).locale);
    const findings = [];
    const add = (level, text) => findings.push({ level, text });
    const price = product.price;

    const refs = product.references || [];
    const byKind = (k) => refs.find((r) => r.kind === k && r.price > 0);
    const lowest30 = byKind('lowest30');
    const list = byKind('list');
    const typical = byKind('typical') || byKind('was');
    const other = byKind('other');

    const stats = {
      price,
      claimedRef: null,
      claimedDiscount: null,
      lowest30: lowest30 ? lowest30.price : null,
      vsLowest30: null,
      typical: typical ? typical.price : null,
      vsTypical: null,
      list: list ? list.price : null,
      history: PC.historyStats(points, now, 365),
    };

    if (!price) {
      return {
        verdict: 'unknown',
        headline: 'Kein Preis gefunden',
        findings: [{ level: 'info', text: 'Auf dieser Seite wurde kein Kaufpreis erkannt (evtl. nicht verfügbar oder nur über andere Verkäufer).' }],
        stats,
      };
    }

    // What Amazon advertises: the struck-through price shown next to the deal.
    const claimed = [list, typical, other, lowest30].filter(Boolean).find((r) => r.price > price);
    if (claimed) {
      stats.claimedRef = claimed;
      stats.claimedDiscount = product.savingsPercent != null ? product.savingsPercent : (claimed.price - price) / claimed.price;
    }

    // 1) EU 30-day lowest price
    if (lowest30) {
      const d = (lowest30.price - price) / lowest30.price;
      stats.vsLowest30 = d;
      if (d <= 0.005) {
        add('bad', `Kein echter Rabatt: In den letzten 30 Tagen gab es den Artikel schon für ${fmt(lowest30.price)} – der Preis ist jetzt ${d < -0.005 ? 'sogar höher' : 'gleich'}.`);
      } else if (d >= 0.15) {
        add('good', `Echter Rabatt: ${PC.formatPercent(d)} unter dem niedrigsten Preis der letzten 30 Tage (${fmt(lowest30.price)}).`);
      } else if (d >= 0.05) {
        add('ok', `Moderater Rabatt: ${PC.formatPercent(d)} unter dem 30-Tage-Tiefstpreis (${fmt(lowest30.price)}).`);
      } else {
        add('ok', `Nur minimal günstiger als der 30-Tage-Tiefstpreis (${fmt(lowest30.price)}, ${PC.formatPercent(d)}).`);
      }
    }

    // 2) Own recorded history
    const h = stats.history;
    if (h && h.distinctDays >= 2) {
      const cheaperBy = (price - h.min) / price;
      const ageDays = Math.round((now - h.minDate) / DAY);
      if (cheaperBy >= 0.02) {
        const when = ageDays <= 0 ? 'heute' : ageDays === 1 ? 'gestern' : `vor ${ageDays} Tagen`;
        add(ageDays <= 30 ? 'bad' : 'ok', `Schon günstiger gesehen: ${fmt(h.min)} am ${PC.formatDate(h.minDate)} (${when}) – laut deinem Preisverlauf.`);
      } else if (h.max > price * 1.05) {
        add('good', `Tiefster Preis, seit du den Artikel verfolgst (seit ${PC.formatDate(h.first)}, ${h.count} Messpunkte). Höchster Preis war ${fmt(h.max)}.`);
      } else {
        add('info', `Preis laut deinem Verlauf seit ${PC.formatDate(h.first)} praktisch unverändert (${fmt(h.min)} – ${fmt(h.max)}).`);
      }
      // Classic Black-Friday trick: price raised shortly before the "deal".
      const recentMax = (points || []).filter((p) => p[0] >= now - 30 * DAY).reduce((m, p) => Math.max(m, p[1]), 0);
      const olderPts = (points || []).filter((p) => p[0] < now - 30 * DAY);
      if (olderPts.length && recentMax > 0) {
        const olderMin = olderPts.reduce((m, p) => Math.min(m, p[1]), Infinity);
        if (recentMax >= olderMin * 1.1 && price >= olderMin * 0.98) {
          add('bad', `Preisanker-Verdacht: Der Preis wurde in den letzten 30 Tagen auf bis zu ${fmt(recentMax)} angehoben – vorher lag er bei ${fmt(olderMin)}.`);
        }
      }
    } else if (!lowest30) {
      add('info', 'Noch kein eigener Preisverlauf. Die Extension merkt sich ab jetzt jeden Preis, den du siehst – für den langfristigen Verlauf den Keepa-Chart prüfen.');
    }

    // 3) Typical / median price
    if (typical && !lowest30) {
      const d = (typical.price - price) / typical.price;
      stats.vsTypical = d;
      if (d >= 0.15) add('good', `${PC.formatPercent(d)} unter dem typischen Preis (${fmt(typical.price)}).`);
      else if (d > 0.005) add('ok', `Nur ${PC.formatPercent(d)} unter dem typischen Preis (${fmt(typical.price)}).`);
      else add('bad', `Nicht günstiger als der typische Preis (${fmt(typical.price)}).`);
    }

    // 4) List price / UVP
    if (list && list.price > price && !lowest30 && !typical) {
      add('ok', `Der Rabatt (${PC.formatPercent((list.price - price) / list.price)}) bezieht sich nur auf die UVP von ${fmt(list.price)}. UVPs sind oft künstlich hoch – Marktpreise bei idealo/Keepa vergleichen.`);
    } else if (list && list.price > price && claimed === list && lowest30) {
      add('info', `Die angezeigte Ersparnis bezieht sich auf die UVP (${fmt(list.price)}), nicht auf echte frühere Preise.`);
    }

    if (other && !lowest30 && !typical && !list && other.price > price) {
      add('ok', `Durchgestrichener Preis (${fmt(other.price)}) ohne Angabe, worauf er sich bezieht – mit Vorsicht genießen.`);
    }

    if (product.dealLabel && !findings.some((f) => f.level === 'good' || f.level === 'bad')) {
      add('info', `„${product.dealLabel}“ allein sagt nichts über die Preishistorie aus.`);
    }
    if (product.coupon) {
      add('info', `Zusätzlicher Coupon verfügbar: ${product.coupon}`);
    }

    // Overall verdict: any red flag wins, then real evidence of a discount.
    let verdict = 'unknown';
    const levels = findings.map((f) => f.level);
    if (levels.includes('bad')) verdict = 'bad';
    else if (levels.includes('good')) verdict = 'good';
    else if (levels.includes('ok')) verdict = 'ok';

    const headlines = {
      good: 'Echtes Angebot',
      ok: 'Mittelmäßig – genauer prüfen',
      bad: 'Kein echtes Schnäppchen',
      unknown: 'Zu wenig Daten',
    };

    findings.sort((a, b) => RANK[b.level] - RANK[a.level]);
    return { verdict, headline: headlines[verdict], findings, stats };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = PC;
})(typeof globalThis !== 'undefined' ? globalThis : this);
