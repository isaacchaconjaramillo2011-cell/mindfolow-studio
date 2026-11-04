(function (MF) {
  'use strict';

  const { clamp, clone, contrastColor } = MF.util;

  const THEMES = {
    vivid: {
      name: 'Vibrante', bg: '#f8fafc', grid: '#cbd5e1', root: '#1e293b', node: '#ffffff', text: '#0f172a',
      palette: ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#0ea5e9', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#84cc16'],
    },
    pastel: {
      name: 'Pastel', bg: '#fffaf5', grid: '#eaded2', root: '#5b4b8a', node: '#ffffff', text: '#3b3355',
      palette: ['#a5b4fc', '#f9a8d4', '#fcd34d', '#6ee7b7', '#7dd3fc', '#fca5a5', '#c4b5fd', '#5eead4', '#fdba74', '#bef264'],
    },
    dark: {
      name: 'Oscuro', bg: '#0b1220', grid: '#1e293b', root: '#e2e8f0', node: '#111c33', text: '#e2e8f0',
      palette: ['#818cf8', '#f472b6', '#fbbf24', '#34d399', '#38bdf8', '#fb7185', '#a78bfa', '#2dd4bf'],
    },
    forest: {
      name: 'Bosque', bg: '#f7faf5', grid: '#d4e0cc', root: '#14532d', node: '#ffffff', text: '#1a2e1f',
      palette: ['#166534', '#15803d', '#65a30d', '#a16207', '#0f766e', '#4d7c0f', '#854d0e', '#047857'],
    },
    ocean: {
      name: 'Océano', bg: '#f0f9ff', grid: '#bfdbfe', root: '#0c4a6e', node: '#ffffff', text: '#0c2a43',
      palette: ['#0369a1', '#0891b2', '#2563eb', '#7c3aed', '#0d9488', '#1d4ed8', '#0e7490', '#4338ca'],
    },
    mono: {
      name: 'Mono', bg: '#ffffff', grid: '#e5e7eb', root: '#0f172a', node: '#ffffff', text: '#0f172a',
      palette: ['#334155', '#475569', '#64748b', '#1e293b'],
    },
  };

  const FONT = '"Segoe UI", system-ui, -apple-system, Roboto, sans-serif';
  const fontFor = (d) => (d === 0 ? `700 16px ${FONT}` : d === 1 ? `600 14px ${FONT}` : `500 13px ${FONT}`);
  const lineHeight = (d) => (d === 0 ? 22 : 20);

  let ctx = null;
  const widthCache = new Map();

  function textWidth(text, font) {
    const key = `${font}|${text}`;
    let w = widthCache.get(key);
    if (w === undefined) {
      if (!ctx) ctx = document.createElement('canvas').getContext('2d');
      ctx.font = font;
      w = ctx.measureText(text).width * 1.04;
      if (widthCache.size > 5000) widthCache.clear();
      widthCache.set(key, w);
    }
    return w;
  }

  function breakWord(word, font, maxW) {
    const chunks = [];
    let cur = '';
    for (const ch of word) {
      if (cur && textWidth(cur + ch, font) > maxW) {
        chunks.push(cur);
        cur = ch;
      } else {
        cur += ch;
      }
    }
    if (cur) chunks.push(cur);
    return chunks;
  }

  function wrap(text, font, maxW) {
    const pieces = [];
    text.split(/\s+/).filter(Boolean).forEach((w) => {
      if (textWidth(w, font) > maxW) pieces.push(...breakWord(w, font, maxW));
      else pieces.push(w);
    });
    const lines = [];
    let cur = '';
    pieces.forEach((p) => {
      const test = cur ? `${cur} ${p}` : p;
      if (!cur || textWidth(test, font) <= maxW) cur = test;
      else {
        lines.push(cur);
        cur = p;
      }
    });
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  }

  function measureNode(n) {
    const d = n._depth;
    const font = fontFor(d);
    const text = `${n.marker ? `${n.marker} ` : ''}${n.text || ' '}`;
    const lines = wrap(text, font, (d === 0 ? 280 : 260) - 32);
    const widest = Math.max(...lines.map((l) => textWidth(l, font)));
    n._lines = lines;
    n._w = Math.max(d === 0 ? 110 : 56, Math.ceil(widest) + 32);
    n._h = lines.length * lineHeight(d) + 20;
  }

  function nodeStyle(n, theme) {
    const d = n._depth;
    const isFilled = d <= 1;
    return {
      bg: isFilled ? n._color : theme.node,
      border: n._color,
      fg: isFilled ? contrastColor(n._color) : theme.text,
      font: fontFor(d),
      lh: lineHeight(d),
      radius: d === 0 ? 14 : d === 1 ? 10 : 8,
    };
  }

  const GX = 64;
  const GY = 14;
  const VX = 24;
  const VY = 56;

  function subH(n) {
    n._kids.forEach(subH);
    n._kt = n._kids.reduce((s, c) => s + c._sub, 0) + Math.max(0, n._kids.length - 1) * GY;
    n._sub = Math.max(n._h, n._kt);
  }

  function placeH(n, edge, top, dir) {
    n._x = dir > 0 ? edge : edge - n._w;
    n._y = top + (n._sub - n._h) / 2;
    const childEdge = dir > 0 ? n._x + n._w + GX : n._x - GX;
    let cy = top + (n._sub - n._kt) / 2;
    n._kids.forEach((c) => {
      placeH(c, childEdge, cy, dir);
      cy += c._sub + GY;
    });
  }

  function subV(n) {
    n._kids.forEach(subV);
    n._kt = n._kids.reduce((s, c) => s + c._sub, 0) + Math.max(0, n._kids.length - 1) * VX;
    n._sub = Math.max(n._w, n._kt);
  }

  function placeV(n, left, top) {
    n._y = top;
    n._x = left + (n._sub - n._w) / 2;
    let cx = left + (n._sub - n._kt) / 2;
    n._kids.forEach((c) => {
      placeV(c, cx, top + n._h + VY);
      cx += c._sub + VX;
    });
  }

  function compute(root, layout, themeKey) {
    const theme = THEMES[themeKey] || THEMES.vivid;
    const nodes = [];

    (function walk(n, depth, parent, inherited, idx) {
      n._depth = depth;
      n._parent = parent;
      n._color = n.color || (depth === 0 ? theme.root : depth === 1 ? theme.palette[idx % theme.palette.length] : inherited);
      n._kids = n.collapsed ? [] : n.children;
      measureNode(n);
      nodes.push(n);
      n._kids.forEach((c, i) => walk(c, depth + 1, n, n._color, i));
    })(root, 0, null, null, 0);

    if (layout === 'org') {
      subV(root);
      placeV(root, -root._sub / 2, 0);
    } else if (layout === 'right') {
      subH(root);
      placeH(root, 0, -root._sub / 2, 1);
    } else {
      subH(root);
      root._x = -root._w / 2;
      root._y = -root._h / 2;
      const kids = root._kids;
      const total = kids.reduce((s, c) => s + c._sub, 0);
      let acc = 0;
      const right = [];
      const left = [];
      kids.forEach((c) => {
        if (acc < total / 2) right.push(c);
        else left.push(c);
        acc += c._sub;
      });
      [[right, 1], [left, -1]].forEach(([group, dir]) => {
        const sum = group.reduce((s, c) => s + c._sub, 0) + Math.max(0, group.length - 1) * GY;
        let top = -sum / 2;
        const edge = dir > 0 ? root._x + root._w + GX + 10 : root._x - GX - 10;
        group.forEach((c) => {
          placeH(c, edge, top, dir);
          top += c._sub + GY;
        });
      });
    }

    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    nodes.forEach((n) => {
      n._cx = n._x + n._w / 2;
      n._cy = n._y + n._h / 2;
      x0 = Math.min(x0, n._x);
      y0 = Math.min(y0, n._y);
      x1 = Math.max(x1, n._x + n._w);
      y1 = Math.max(y1, n._y + n._h);
    });

    return { nodes, theme, layout, bbox: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
  }

  function linkPath(p, c, layout) {
    if (layout === 'org') {
      const sx = p._cx;
      const sy = p._y + p._h;
      const ex = c._cx;
      const ey = c._y;
      const my = (sy + ey) / 2;
      return `M${sx} ${sy}C${sx} ${my} ${ex} ${my} ${ex} ${ey}`;
    }
    const toRight = c._cx > p._cx;
    const sx = toRight ? p._x + p._w : p._x;
    const ex = toRight ? c._x : c._x + c._w;
    const sy = p._cy;
    const ey = c._cy;
    const mx = (sx + ex) / 2;
    return `M${sx} ${sy}C${mx} ${sy} ${mx} ${ey} ${ex} ${ey}`;
  }

  const linkWidth = (c) => (c._depth === 1 ? 3.5 : c._depth === 2 ? 2.5 : 1.8);

  // Miniatura SVG de un mapa con un diseño y tema concretos (para la galería de estilos).
  function thumbSVG(root, layout, themeKey) {
    const copy = clone(root);
    const lay = compute(copy, layout, themeKey);
    const pad = 30;
    const b = lay.bbox;
    let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}" preserveAspectRatio="xMidYMid meet">`;
    lay.nodes.forEach((n) => {
      if (n._parent) {
        out += `<path d="${linkPath(n._parent, n, layout)}" fill="none" stroke="${n._color}" stroke-width="${linkWidth(n) * 1.6}" stroke-linecap="round"/>`;
      }
    });
    lay.nodes.forEach((n) => {
      const st = nodeStyle(n, lay.theme);
      out += `<rect x="${n._x}" y="${n._y}" width="${n._w}" height="${n._h}" rx="${st.radius}" fill="${st.bg}" stroke="${st.border}" stroke-width="3"/>`;
    });
    return `${out}</svg>`;
  }

  MF.layout = { THEMES, compute, linkPath, linkWidth, nodeStyle, thumbSVG, clamp };
})(window.MF);
