// Run: node --test test/
const test = require('node:test');
const assert = require('node:assert/strict');

require('../src/shared/config.js');
require('../src/shared/price.js');
require('../src/shared/extract.js');
require('../src/shared/analyze.js');
// store.js needs chrome.storage only when its async functions are called.
require('../src/shared/store.js');
const PC = globalThis.PC;

const DAY = 86400000;
const NOW = Date.UTC(2026, 10, 27, 12); // Black Friday 2026

test('parsePrice handles all Amazon number formats', () => {
  const cases = [
    ['1.299,99 €', 1299.99],
    ['12,99 €', 12.99],
    ['12,99 €', 12.99],
    ['€1,299.99', 1299.99],
    ['$1,299', 1299],
    ['£12.99', 12.99],
    ['1 299,99 zł', 1299.99],
    ['1 299,00 kr', 1299],
    ['249,00 €249,00 €', 249],
    ['29,99 € - 39,99 €', 29.99],
    ['EUR 5,5', 5.5],
    ['1.299 €', 1299],
    ['0,99 €', 0.99],
    [19.9, 19.9],
  ];
  for (const [input, expected] of cases) assert.equal(PC.parsePrice(input), expected, String(input));
  for (const bad of [null, '', 'gratis', '–', 0]) assert.equal(PC.parsePrice(bad), null, String(bad));
});

test('classifyReference recognises Amazon labels in several languages', () => {
  const cases = {
    'Niedrigster Preis in 30 Tagen:': 'lowest30',
    'Niedrigster Preis der letzten 30 Tage:': 'lowest30',
    'Prix le plus bas des 30 derniers jours :': 'lowest30',
    'UVP:': 'list',
    'Unverb. Preisempf.:': 'list',
    'List Price:': 'list',
    'RRP:': 'list',
    'Typischer Preis:': 'typical',
    'Mittlerer Verkaufspreis:': 'typical',
    'Typical price:': 'typical',
    'Was:': 'was',
    'Statt:': 'was',
    'Sie sparen: (20 %)': 'other',
  };
  for (const [label, kind] of Object.entries(cases)) assert.equal(PC.classifyReference(label), kind, label);
});

test('domainFromHost & comparison links', () => {
  assert.equal(PC.domainFromHost('www.amazon.de'), 'amazon.de');
  assert.equal(PC.domainFromHost('www.amazon.co.uk'), 'amazon.co.uk');
  assert.equal(PC.domainFromHost('www.ebay.de'), null);
  const links = PC.comparisonLinks('amazon.de', 'B0TESTREAL', 'Sony WH-1000XM5 Kabellose Kopfhörer mit Noise Cancelling, Schwarz');
  const ids = links.map((l) => l.id);
  assert.deepEqual(ids, ['keepa', 'camel', 'idealo', 'geizhals', 'google']);
  assert.equal(links[0].url, 'https://keepa.com/#!product/3-B0TESTREAL');
  assert.equal(links[1].url, 'https://de.camelcamelcamel.com/product/B0TESTREAL');
  assert.match(links[2].url, /idealo\.de.*q=Sony%20WH-1000XM5/);
  assert.equal(PC.searchQuery('Sony WH-1000XM5 Kabellose Kopfhörer mit Noise Cancelling, Schwarz'), 'Sony WH-1000XM5 Kabellose Kopfhörer mit Noise Cancelling');
  assert.match(PC.keepaChartUrl('amazon.de', 'B0TESTREAL', 365), /domain=3&range=365/);
  assert.equal(PC.keepaChartUrl('amazon.nl', 'B0TESTREAL', 90), null);
});

function product(price, refs, extra) {
  return Object.assign({ asin: 'B0TESTTEST', domain: 'amazon.de', currency: 'EUR', price, references: refs || [] }, extra || {});
}

test('analyze: price equal to 30-day low is not a real deal', () => {
  const a = PC.analyze(product(249, [
    { kind: 'list', label: 'UVP:', price: 399 },
    { kind: 'lowest30', label: 'Niedrigster Preis in 30 Tagen:', price: 239 },
  ], { savingsPercent: 0.38 }), [], NOW);
  assert.equal(a.verdict, 'bad');
  assert.equal(a.stats.claimedRef.kind, 'list');
  assert.equal(a.stats.claimedDiscount, 0.38);
  assert.match(a.findings[0].text, /Kein echter Rabatt/);
});

test('analyze: big discount vs. 30-day low is a real deal', () => {
  const a = PC.analyze(product(199, [{ kind: 'lowest30', label: 'Niedrigster Preis in 30 Tagen:', price: 279 }]), [], NOW);
  assert.equal(a.verdict, 'good');
  assert.ok(a.stats.vsLowest30 > 0.28 && a.stats.vsLowest30 < 0.29);
});

test('analyze: UVP-only discount is flagged as questionable', () => {
  const a = PC.analyze(product(19.99, [{ kind: 'list', label: 'UVP:', price: 24.99 }]), [], NOW);
  assert.equal(a.verdict, 'ok');
  assert.ok(a.findings.some((f) => /UVP/.test(f.text)));
});

test('analyze: own history shows it was cheaper recently -> bad', () => {
  const pts = [
    [NOW - 20 * DAY, 199],
    [NOW - 10 * DAY, 229],
    [NOW, 249],
  ];
  const a = PC.analyze(product(249, [{ kind: 'list', label: 'UVP:', price: 399 }]), pts, NOW);
  assert.equal(a.verdict, 'bad');
  assert.ok(a.findings.some((f) => /Schon günstiger gesehen: 199,00/.test(f.text)));
});

test('analyze: price anchoring (raised before Black Friday) is detected', () => {
  const pts = [
    [NOW - 60 * DAY, 99],
    [NOW - 45 * DAY, 99],
    [NOW - 20 * DAY, 139],
    [NOW - 5 * DAY, 139],
    [NOW, 99],
  ];
  const a = PC.analyze(product(99, [{ kind: 'list', label: 'UVP:', price: 139 }]), pts, NOW);
  assert.equal(a.verdict, 'bad');
  assert.ok(a.findings.some((f) => /Preisanker/.test(f.text)));
});

test('analyze: lowest price since tracking -> good', () => {
  const pts = [
    [NOW - 30 * DAY, 129],
    [NOW - 10 * DAY, 119],
    [NOW, 89],
  ];
  const a = PC.analyze(product(89, []), pts, NOW);
  assert.equal(a.verdict, 'good');
  assert.ok(a.findings.some((f) => /Tiefster Preis/.test(f.text)));
});

test('analyze: no price -> unknown', () => {
  const a = PC.analyze(product(null, []), [], NOW);
  assert.equal(a.verdict, 'unknown');
});

test('appendPoint de-duplicates unchanged prices within 6h and prunes old data', () => {
  let pts = PC.appendPoint([], 10, NOW);
  pts = PC.appendPoint(pts, 10, NOW + 3600e3);
  assert.equal(pts.length, 1);
  pts = PC.appendPoint(pts, 10, NOW + 7 * 3600e3);
  assert.equal(pts.length, 2);
  pts = PC.appendPoint(pts, 9, NOW + 7 * 3600e3 + 1);
  assert.equal(pts.length, 3);
  const pruned = PC.appendPoint([[NOW - 500 * DAY, 5]], 6, NOW);
  assert.deepEqual(pruned, [[NOW, 6]]);
});

test('historyStats', () => {
  const s = PC.historyStats([[NOW - 2 * DAY, 10], [NOW - DAY, 8], [NOW, 12]], NOW, 365);
  assert.equal(s.min, 8);
  assert.equal(s.max, 12);
  assert.equal(s.avg, 10);
  assert.equal(s.distinctDays, 3);
  assert.equal(s.minDate, NOW - DAY);
});
