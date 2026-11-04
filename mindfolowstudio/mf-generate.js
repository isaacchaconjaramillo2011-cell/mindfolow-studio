(function (MF) {
  'use strict';

  const { uid } = MF.util;
  const MAX_NODES = 400;

  const mk = (text, children = [], extra = {}) => ({ text, children, ...extra });

  function finalize(node) {
    node.id = uid();
    node.text = String(node.text || 'Tema').trim() || 'Tema';
    node.children = (node.children || []).map(finalize);
    return node;
  }

  const clean = (s) =>
    String(s)
      .replace(/\*\*|__|`/g, '')
      .replace(/^[\s\-*•+>]+/, '')
      .replace(/\s+/g, ' ')
      .replace(/[:：]\s*$/, '')
      .trim();

  function shorten(text, maxWords) {
    const words = clean(text).split(' ');
    return words.length > maxWords ? `${words.slice(0, maxWords).join(' ')}…` : words.join(' ');
  }

  function countNodes(n) {
    return 1 + n.children.reduce((s, c) => s + countNodes(c), 0);
  }

  // ---------- Texto con estructura (viñetas, numeración, encabezados, sangría) ----------
  function parseOutline(lines) {
    const virtual = { text: '', children: [] };
    const stack = [{ key: -1, node: virtual }];
    let heading = 0;

    lines.forEach((raw) => {
      if (!raw.trim()) return;
      const indent = raw.match(/^[ \t]*/)[0].replace(/\t/g, '    ').length;
      const body = raw.trim();
      let key;
      let text;
      let m;
      if ((m = body.match(/^(#{1,6})\s+(.*)$/))) {
        heading = m[1].length;
        key = heading * 100;
        text = m[2];
      } else if ((m = body.match(/^(\d+(?:\.\d+)*)[.)]?\s+(.*)$/))) {
        key = heading * 100 + 10 + indent + (m[1].split('.').length - 1) * 4;
        text = m[2];
      } else if ((m = body.match(/^[-*•+]\s+(.*)$/))) {
        key = heading * 100 + 10 + indent;
        text = m[1];
      } else {
        key = heading ? heading * 100 + 10 + indent : indent;
        text = body;
      }
      text = clean(text);
      if (!text) return;
      while (stack.length > 1 && stack[stack.length - 1].key >= key) stack.pop();
      const node = mk(text);
      stack[stack.length - 1].node.children.push(node);
      stack.push({ key, node });
    });

    if (virtual.children.length === 1) return virtual.children[0];
    return mk('Mapa mental', virtual.children);
  }

  // ---------- Prosa: párrafos y oraciones ----------
  function sentencesOf(text) {
    return text
      .split(/(?<=[.!?…])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function leafFromSentence(s) {
    const text = shorten(s, 12);
    return mk(text, [], clean(s) !== text ? { note: clean(s) } : {});
  }

  function branchFromParagraph(par) {
    const colon = par.match(/^([^:.\n]{3,60}):\s+([\s\S]+)$/);
    if (colon) {
      return mk(clean(colon[1]), sentencesOf(colon[2]).map(leafFromSentence));
    }
    const sents = sentencesOf(par);
    if (sents.length === 1) return leafFromSentence(sents[0]);
    const [first, ...rest] = sents;
    return mk(shorten(first, 6), rest.map(leafFromSentence), { note: clean(first) });
  }

  function parseProse(text) {
    let paragraphs = text.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
    let title = null;

    if (paragraphs.length > 1 && paragraphs[0].length <= 80 && !/[.!?]$/.test(paragraphs[0])) {
      title = clean(paragraphs.shift());
    }

    let branches;
    if (paragraphs.length === 1) {
      const sents = sentencesOf(paragraphs[0]);
      branches = [];
      for (let i = 0; i < sents.length; i += 3) {
        const group = sents.slice(i, i + 3);
        branches.push(mk(shorten(group[0], 6), group.slice(1).map(leafFromSentence), { note: clean(group[0]) }));
      }
      if (!title) title = shorten(sents[0], 5);
    } else {
      branches = paragraphs.map(branchFromParagraph);
      if (!title) title = 'Resumen';
    }
    return mk(title, branches);
  }

  function textToTree(text) {
    const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim());
    if (!lines.length) throw new Error('El texto está vacío.');
    if (lines.length === 1 && lines[0].length <= 90 && !/[.!?]$/.test(lines[0])) return topicTree(lines[0]);

    const structured = lines.filter((l) => /^\s*([-*•+]|\d+[.)]|#{1,6})\s+/.test(l) || /^[ \t]{2,}\S/.test(l)).length;
    const flat = lines.length >= 2 && lines.every((l) => l.trim().length <= 70 && !/[.!?]$/.test(l.trim()));
    const tree = structured >= 2 || flat ? parseOutline(lines) : parseProse(text);

    if (countNodes(tree) > MAX_NODES) throw new Error(`El texto genera demasiados temas (máximo ${MAX_NODES}). Usa un texto más corto.`);
    return tree;
  }

  // ---------- Guía extensa a partir de un tema ----------
  function topicTree(topic) {
    const t = clean(topic);
    const data = [
      ['Definición y alcance', [`Qué es ${t}`, 'Objetivos principales', 'Alcance y límites', 'Terminología básica']],
      ['Historia y origen', ['Antecedentes', 'Hitos importantes', 'Personajes y organizaciones clave', 'Evolución en el tiempo']],
      ['Conceptos clave', ['Principios fundamentales', 'Elementos esenciales', 'Relaciones entre conceptos', 'Errores y mitos comunes']],
      ['Estructura y componentes', ['Partes principales', 'Roles y responsables', 'Recursos necesarios', 'Cómo se relacionan']],
      ['Funcionamiento y procesos', ['Pasos o fases', 'Entradas y salidas', 'Reglas y criterios', 'Buenas prácticas']],
      ['Tipos y clasificación', ['Categorías principales', 'Criterios de clasificación', 'Variantes y subtipos', 'Comparación entre tipos']],
      ['Aplicaciones y casos de uso', ['Ejemplos reales', 'Sectores o áreas de uso', 'Casos de éxito', 'Fracasos y lecciones']],
      ['Ventajas y desventajas', ['Beneficios', 'Limitaciones', 'Riesgos', 'Cuándo conviene usarlo']],
      ['Herramientas y recursos', ['Herramientas recomendadas', 'Libros y artículos', 'Cursos y comunidades', 'Glosario y referencias']],
      ['Tendencias y futuro', ['Innovaciones recientes', 'Retos pendientes', 'Tendencias emergentes', 'Cómo seguir aprendiendo']],
    ];
    return mk(
      t,
      data.map(([b, subs]) => mk(b, subs.map((s) => mk(s)))),
      { note: 'Estructura base generada localmente. Completa cada rama con la información de tu tema.' }
    );
  }

  const textToMap = (text) => finalize(textToTree(text));
  const topicMap = (topic) => finalize(topicTree(topic));

  function toOutline(root) {
    const out = [root.text];
    (function walk(n, depth) {
      n.children.forEach((c) => {
        out.push(`${'  '.repeat(depth)}- ${c.text}`);
        walk(c, depth + 1);
      });
    })(root, 0);
    return out.join('\n');
  }

  // ---------- Imagen -> mapa (OCR local con Tesseract.js) ----------
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('No se pudo cargar el motor de reconocimiento (se necesita internet).'));
      document.head.appendChild(s);
    });
  }

  function groupWords(rawWords) {
    const words = rawWords
      .filter((w) => w.text && w.text.trim() && (w.confidence === undefined || w.confidence > 35))
      .map((w) => ({ t: w.text.trim(), x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 }));
    if (!words.length) return [];

    const heights = words.map((w) => w.y1 - w.y0).sort((a, b) => a - b);
    const mh = heights[heights.length >> 1] || 10;
    words.sort((a, b) => a.y0 + a.y1 - (b.y0 + b.y1));

    const rows = [];
    words.forEach((w) => {
      const cy = (w.y0 + w.y1) / 2;
      const row = rows.find((r) => Math.abs(r.cy - cy) < mh * 0.6);
      if (row) {
        row.w.push(w);
        row.cy = (row.cy * (row.w.length - 1) + cy) / row.w.length;
      } else rows.push({ cy, w: [w] });
    });

    let items = [];
    const push = (cur, cy) => {
      const x0 = Math.min(...cur.map((w) => w.x0));
      const x1 = Math.max(...cur.map((w) => w.x1));
      items.push({ text: cur.map((w) => w.t).join(' '), x0, x1, y0: Math.min(...cur.map((w) => w.y0)), y1: Math.max(...cur.map((w) => w.y1)), cx: (x0 + x1) / 2, cy });
    };
    rows.forEach((row) => {
      row.w.sort((a, b) => a.x0 - b.x0);
      let cur = [row.w[0]];
      for (let i = 1; i < row.w.length; i += 1) {
        if (row.w[i].x0 - row.w[i - 1].x1 > mh * 1.8) {
          push(cur, row.cy);
          cur = [row.w[i]];
        } else cur.push(row.w[i]);
      }
      push(cur, row.cy);
    });

    // Une frases de varias líneas (una justo debajo de otra con solapamiento horizontal).
    items.sort((a, b) => a.cy - b.cy);
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const a = items[i];
        const b = items[j];
        const overlap = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
        if (b.y0 - a.y1 < mh * 0.8 && b.y0 >= a.y0 && overlap > 0.5 * Math.min(a.x1 - a.x0, b.x1 - b.x0)) {
          a.text += ` ${b.text}`;
          a.x0 = Math.min(a.x0, b.x0);
          a.x1 = Math.max(a.x1, b.x1);
          a.y1 = b.y1;
          a.cx = (a.x0 + a.x1) / 2;
          a.cy = (a.y0 + a.y1) / 2;
          items.splice(j, 1);
          j -= 1;
        }
      }
    }
    return items;
  }

  function itemsToTree(items, width, height) {
    const dist = (a, b) => Math.hypot(a.cx - b.cx, a.cy - b.cy);
    const center = { cx: width / 2, cy: height / 2 };
    const sorted = [...items].sort((a, b) => dist(a, center) - dist(b, center));
    const rootItem = sorted[0];
    rootItem.node = mk(rootItem.text);
    const placed = [rootItem];
    sorted.slice(1).forEach((it) => {
      const parent = placed.reduce((best, p) => (dist(it, p) < dist(it, best) ? p : best), rootItem);
      it.node = mk(it.text);
      parent.node.children.push(it.node);
      placed.push(it);
    });
    placed.forEach((p) => p.node.children.sort((a, b) => itemOf(placed, a).cy - itemOf(placed, b).cy));
    return rootItem.node;
  }

  const itemOf = (placed, node) => placed.find((p) => p.node === node);

  // Combina palabras de varias pasadas: descarta ruido y duplicados (mismo texto en la misma zona).
  function mergeWords(passes) {
    const out = [];
    passes.flat().forEach((w) => {
      const t = (w.text || '').trim();
      if (t.replace(/[^\p{L}\p{N}]/gu, '').length < 2 || w.confidence < 60) return;
      const cx = (w.bbox.x0 + w.bbox.x1) / 2;
      const cy = (w.bbox.y0 + w.bbox.y1) / 2;
      const h = w.bbox.y1 - w.bbox.y0;
      const dup = out.some((o) => {
        const ocx = (o.bbox.x0 + o.bbox.x1) / 2;
        const ocy = (o.bbox.y0 + o.bbox.y1) / 2;
        return Math.abs(ocx - cx) < Math.max(h, o.bbox.y1 - o.bbox.y0) * 1.2 + (o.bbox.x1 - o.bbox.x0) * 0.4 && Math.abs(ocy - cy) < h;
      });
      if (!dup) out.push({ ...w, text: t });
    });
    return out;
  }

  const wordsOf = (data) => data.words || (data.blocks || []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)));

  // Tesseract falla de forma distinta según el modo, así que se combinan varias pasadas:
  // imagen completa en tres modos y 4 cuadrantes solapados.
  async function readImage(worker, bitmap, onProgress) {
    const W = bitmap.width;
    const H = bitmap.height;
    const jobs = [];
    ['3', '12', '6'].forEach((psm) => jobs.push({ psm, x: 0, y: 0, w: W, h: H }));
    if (W > 300 && H > 200) {
      const tw = W * 0.6;
      const th = H * 0.6;
      [0, W - tw].forEach((x) => [0, H - th].forEach((y) => jobs.push({ psm: '6', x, y, w: tw, h: th })));
    }
    const passes = [];
    for (let i = 0; i < jobs.length; i += 1) {
      const j = jobs[i];
      const c = document.createElement('canvas');
      c.width = Math.round(j.w);
      c.height = Math.round(j.h);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(bitmap, j.x, j.y, j.w, j.h, 0, 0, c.width, c.height);
      await worker.setParameters({ tessedit_pageseg_mode: j.psm });
      const { data } = await worker.recognize(c);
      passes.push(wordsOf(data).map((w) => ({
        text: w.text,
        confidence: w.confidence,
        bbox: { x0: w.bbox.x0 + j.x, y0: w.bbox.y0 + j.y, x1: w.bbox.x1 + j.x, y1: w.bbox.y1 + j.y },
      })));
      if (onProgress) onProgress(Math.round(((i + 1) / jobs.length) * 100));
    }
    return mergeWords(passes);
  }

  async function imageToMap(file, onProgress) {
    if (!window.Tesseract) await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch (e) {
      throw new Error('No se pudo leer la imagen.');
    }
    const worker = await window.Tesseract.createWorker('spa+eng', 1);
    let words;
    try {
      words = await readImage(worker, bitmap, onProgress);
    } finally {
      await worker.terminate();
    }
    const items = groupWords(words);
    if (items.length < 2) throw new Error('No se detectó suficiente texto en la imagen para armar un mapa.');
    if (items.length > MAX_NODES) throw new Error('La imagen contiene demasiado texto.');
    return finalize(itemsToTree(items, bitmap.width, bitmap.height));
  }


  MF.gen = { textToMap, topicMap, toOutline, imageToMap, parseOutline, finalize };
})(window.MF);
