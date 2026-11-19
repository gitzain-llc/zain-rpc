/* Small DOM helpers for extension pages (popup / options). */
(function (root) {
  const PC = (root.PC = root.PC || {});

  PC.h = function h(tag, attrs, ...children) {
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
  };

  PC.timeAgo = function (ts) {
    if (!ts) return 'nie';
    const min = Math.round((Date.now() - ts) / 60000);
    if (min < 1) return 'gerade eben';
    if (min < 60) return `vor ${min} Min.`;
    const hours = Math.round(min / 60);
    if (hours < 24) return `vor ${hours} Std.`;
    const days = Math.round(hours / 24);
    return `vor ${days} Tag${days === 1 ? '' : 'en'}`;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
