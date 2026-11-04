(function (MF) {
  'use strict';

  let counter = 0;

  function uid(prefix = 't') {
    counter += 1;
    return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  // Las propiedades que empiezan con "_" son datos de layout y nunca se copian ni guardan.
  const stripPrivate = (key, value) => (key[0] === '_' ? undefined : value);
  const clone = (value) => JSON.parse(JSON.stringify(value, stripPrivate));
  const serialize = (value) => JSON.stringify(value, stripPrivate);

  function hexToRgb(hex) {
    let h = String(hex).replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16);
    if (h.length < 6 || Number.isNaN(n)) return { r: 0, g: 0, b: 0 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function contrastColor(hex) {
    const { r, g, b } = hexToRgb(hex);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#0f172a' : '#ffffff';
  }

  function slug(text) {
    const value = String(text)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return value || 'mapa-mental';
  }

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  MF.util = { uid, clamp, clone, serialize, hexToRgb, contrastColor, slug, esc };
})((window.MF = window.MF || {}));
