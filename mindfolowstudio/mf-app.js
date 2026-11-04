(function (MF) {
  'use strict';

  const { uid, clamp, clone, serialize, slug, esc } = MF.util;
  const L = MF.layout;
  const G = MF.gen;
  const KEY = 'mindflow-studio-v2';
  const MARKERS = ['⭐', '✅', '❗', '💡', '❓', '🚩', '🔴', '🟠', '🟡', '🟢'];
  const VARIANTS = [['map', 'vivid'], ['right', 'pastel'], ['org', 'forest'], ['map', 'dark'], ['right', 'ocean'], ['org', 'mono']];
  const LAYOUT_NAMES = { map: 'Mapa mental', right: 'Lógico', org: 'Organigrama' };
  const DEMO = `MindFlow Studio
# Crear
- Escribir o pegar un texto
- Generar una guía desde un tema
- Replicar un mapa desde una imagen
# Editar
- Tab: tema hijo
- Enter: tema hermano
- Arrastrar un tema sobre otro para moverlo
# Dar estilo
- Diseños: mapa, lógico y organigrama
- Temas de color
- Marcadores y notas`;

  const $ = (s) => document.querySelector(s);
  let viewport;
  let world;
  let doc;
  let selId = null;
  let editing = null;
  let clipboard = null;
  let lastLayout = null;
  let inspId = null;
  let undoStack = [];
  let redoStack = [];
  const views = {};

  // ---------- Modelo ----------
  const newNode = (text) => ({ id: uid(), text, children: [] });
  const newSheet = (title, root, layout = 'map', theme = 'dark') => ({ id: uid('s'), title, layout, theme, root });
  const sheet = () => doc.sheets[doc.active];
  const ser = () => serialize(doc);

  function demoDoc() {
    return { active: 0, sheets: [newSheet('Hoja 1', G.textToMap(DEMO))] };
  }

  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY));
      if (data && Array.isArray(data.sheets) && data.sheets.length && data.sheets.every((s) => s.root && s.root.id)) {
        data.active = clamp(data.active | 0, 0, data.sheets.length - 1);
        return data;
      }
    } catch (e) { /* datos corruptos: se usa el demo */ }
    return demoDoc();
  }

  function persist() {
    try { localStorage.setItem(KEY, ser()); } catch (e) { /* sin espacio */ }
  }

  function find(id) {
    const stack = [[sheet().root, null, 0]];
    while (stack.length) {
      const [n, p, i] = stack.pop();
      if (n.id === id) return { node: n, parent: p, index: i };
      n.children.forEach((c, j) => stack.push([c, n, j]));
    }
    return null;
  }

  const contains = (ancestor, id) => ancestor.id === id || ancestor.children.some((c) => contains(c, id));

  function regen(node) {
    node.id = uid();
    node.children.forEach(regen);
    return node;
  }

  function mutate(fn) {
    undoStack.push(ser());
    if (undoStack.length > 100) undoStack.shift();
    redoStack = [];
    if (fn() === false) {
      undoStack.pop();
      return;
    }
    persist();
    render();
  }

  function restore(json) {
    doc = JSON.parse(json);
    if (selId && !find(selId)) selId = null;
    persist();
    render();
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(ser());
    restore(undoStack.pop());
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(ser());
    restore(redoStack.pop());
  }

  // ---------- Operaciones ----------
  function addChild(id) {
    mutate(() => {
      const f = find(id);
      if (!f) return false;
      f.node.collapsed = false;
      const n = newNode('Tema');
      f.node.children.push(n);
      selId = n.id;
    });
    if (selId) startEdit(selId);
  }

  function addSibling(id) {
    const f = find(id);
    if (!f) return;
    if (!f.parent) return addChild(id);
    mutate(() => {
      const n = newNode('Tema');
      f.parent.children.splice(f.index + 1, 0, n);
      selId = n.id;
    });
    return startEdit(selId);
  }

  function deleteNode(id) {
    const f = find(id);
    if (!f) return;
    if (!f.parent) {
      toast('El tema central no se puede borrar. Usa 🗑 para vaciar todo el mapa.');
      return;
    }
    mutate(() => {
      f.parent.children.splice(f.index, 1, ...f.node.children);
      selId = f.parent.id;
    });
  }

  function reparent(id, targetId) {
    const f = find(id);
    const t = find(targetId);
    if (!f || !t || !f.parent || contains(f.node, targetId) || f.parent.id === targetId) return;
    mutate(() => {
      f.parent.children.splice(f.index, 1);
      t.node.collapsed = false;
      t.node.children.push(f.node);
      selId = id;
    });
  }

  function moveSibling(id, delta) {
    const f = find(id);
    if (!f || !f.parent) return;
    const j = f.index + delta;
    if (j < 0 || j >= f.parent.children.length) return;
    mutate(() => {
      const arr = f.parent.children;
      [arr[f.index], arr[j]] = [arr[j], arr[f.index]];
    });
  }

  function setProp(id, key, value) {
    mutate(() => {
      const f = find(id);
      if (!f) return false;
      if (value === '' || value === undefined || value === null) delete f.node[key];
      else f.node[key] = value;
    });
  }

  function toggleFold(id) {
    const f = find(id);
    if (!f || !f.node.children.length) return;
    mutate(() => {
      if (f.node.collapsed) delete f.node.collapsed;
      else f.node.collapsed = true;
    });
  }

  function copyNode(id, cut) {
    const f = find(id);
    if (!f) return;
    clipboard = clone(f.node);
    toast(cut ? 'Rama cortada' : 'Rama copiada');
    if (cut) deleteSubtree(id);
  }

  function deleteSubtree(id) {
    const f = find(id);
    if (!f || !f.parent) return toast('El tema central no se puede cortar.');
    mutate(() => {
      f.parent.children.splice(f.index, 1);
      selId = f.parent.id;
    });
  }

  function pasteNode(id) {
    if (!clipboard) return;
    const copy = regen(clone(clipboard));
    mutate(() => {
      const f = find(id);
      if (!f) return false;
      f.node.collapsed = false;
      f.node.children.push(copy);
      selId = copy.id;
    });
  }

  function clearAll() {
    if (!confirm('¿Borrar todo el mapa de esta hoja? Podrás deshacerlo con Ctrl+Z.')) return;
    mutate(() => {
      sheet().root = newNode('Idea central');
      selId = sheet().root.id;
    });
  }

  // ---------- Vista (zoom / desplazamiento) ----------
  const view = () => views[sheet().id];

  function applyTransform() {
    const v = view();
    if (!v) return;
    world.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.s})`;
    viewport.style.backgroundSize = `${24 * v.s}px ${24 * v.s}px`;
    viewport.style.backgroundPosition = `${v.x}px ${v.y}px`;
    $('#zoomLabel').textContent = `${Math.round(v.s * 100)}%`;
  }

  function fit() {
    const b = lastLayout.bbox;
    const r = viewport.getBoundingClientRect();
    const pad = 60;
    const s = clamp(Math.min((r.width - pad * 2) / b.w, (r.height - pad * 2) / b.h, 1.2), 0.1, 2.5);
    views[sheet().id] = { s, x: r.width / 2 - (b.x + b.w / 2) * s, y: r.height / 2 - (b.y + b.h / 2) * s };
    applyTransform();
  }

  function zoomAt(next, clientX, clientY) {
    const v = view();
    const r = viewport.getBoundingClientRect();
    const px = clientX - r.left;
    const py = clientY - r.top;
    const s = clamp(next, 0.1, 2.5);
    v.x = px - ((px - v.x) / v.s) * s;
    v.y = py - ((py - v.y) / v.s) * s;
    v.s = s;
    applyTransform();
  }

  function zoomCenter(factor) {
    const r = viewport.getBoundingClientRect();
    zoomAt(view().s * factor, r.left + r.width / 2, r.top + r.height / 2);
  }

  // ---------- Render ----------
  function nodeHTML(n, theme, layout) {
    const st = L.nodeStyle(n, theme);
    const hasKids = n.children.length > 0;
    const side = layout === 'org' ? 'b' : n._parent && n._cx < n._parent._cx ? 'l' : 'r';
    const style = `left:${n._x}px;top:${n._y}px;width:${n._w}px;height:${n._h}px;background:${st.bg};border-color:${st.border};color:${st.fg};font:${st.font};line-height:${st.lh}px;border-radius:${st.radius}px`;
    const fold = hasKids
      ? `<button class="fold ${side}" data-fold="1" title="Plegar / desplegar">${n.collapsed ? n.children.length : '−'}</button>`
      : '';
    return `<div class="node${n.id === selId ? ' sel' : ''}${n.collapsed ? ' has-fold' : ''}" data-id="${n.id}" style="${style}"><div class="t">${n._lines.map(esc).join('<br>')}</div>${n.note ? `<i class="note-dot" title="${esc(n.note)}"></i>` : ''}${fold}</div>`;
  }

  function render() {
    if (editing) {
      editing.done = true;
      editing = null;
    }
    const s = sheet();
    const lay = L.compute(s.root, s.layout, s.theme);
    lastLayout = lay;
    document.documentElement.style.setProperty('--bg', lay.theme.bg);
    document.documentElement.style.setProperty('--grid', lay.theme.grid);

    let svg = '<svg id="links">';
    lay.nodes.forEach((n) => {
      if (n._parent) {
        svg += `<path d="${L.linkPath(n._parent, n, s.layout)}" fill="none" stroke="${n._color}" stroke-width="${L.linkWidth(n)}" stroke-linecap="round"/>`;
      }
    });
    svg += '</svg>';
    world.innerHTML = svg + lay.nodes.map((n) => nodeHTML(n, lay.theme, s.layout)).join('');

    if (!views[s.id]) fit();
    else applyTransform();
    renderChrome();
  }

  function renderChrome() {
    const s = sheet();
    document.querySelectorAll('#layoutSeg button').forEach((b) => b.classList.toggle('active', b.dataset.layout === s.layout));
    $('#themeSel').value = s.theme;
    $('#btnUndo').disabled = !undoStack.length;
    $('#btnRedo').disabled = !redoStack.length;

    $('#sheetbar').innerHTML =
      doc.sheets
        .map((sh, i) => `<button data-sheet="${i}" class="${i === doc.active ? 'active' : ''}" title="Doble clic para renombrar">${esc(sh.title)}${doc.sheets.length > 1 ? `<span class="x" data-del="${i}" title="Eliminar hoja">×</span>` : ''}</button>`)
        .join('') + '<button data-sheet="new" title="Nueva hoja">+</button>';

    renderInspector();
    if (document.activeElement !== $('#outlineText')) $('#outlineText').value = G.toOutline(s.root);
    if (!$('[data-pane="styles"]').hidden) renderGallery();
  }

  function renderInspector() {
    const el = $('#inspector');
    const f = selId && find(selId);
    if (!f) {
      inspId = null;
      el.innerHTML = '<h3>Formato</h3><p class="muted">Selecciona un tema para cambiar su color, añadir un marcador o escribir una nota.</p>';
      return;
    }
    const n = f.node;
    inspId = n.id;
    const theme = L.THEMES[sheet().theme];
    const swatches = theme.palette.map((c) => `<button class="sw" data-act="color" data-v="${c}" style="background:${c}" title="${c}"></button>`).join('');
    const markers = MARKERS.map((m) => `<button data-act="marker" data-v="${m}" class="${n.marker === m ? 'on' : ''}">${m}</button>`).join('');
    el.innerHTML = `<h3>Formato</h3>
      <label>Color de la rama</label>
      <div class="swatches">${swatches}<input type="color" id="customColor" value="${n.color || '#6366f1'}" title="Color personalizado"><button data-act="colorClear" title="Color automático">auto</button></div>
      <label>Marcador</label>
      <div class="markers">${markers}<button data-act="marker" data-v="">✕</button></div>
      <label for="noteInput">Nota</label>
      <textarea id="noteInput" placeholder="Escribe una nota…">${esc(n.note || '')}</textarea>
      <div class="actions">
        <button data-act="child">＋ Hijo</button>
        <button data-act="sibling">＋ Hermano</button>
        <button data-act="fold" ${n.children.length ? '' : 'disabled'}>${n.collapsed ? 'Desplegar' : 'Plegar'}</button>
        <button data-act="delete" class="danger">Borrar</button>
      </div>`;
  }

  function renderGallery() {
    const s = sheet();
    $('#gallery').innerHTML = VARIANTS.map(([layout, theme]) => {
      const current = layout === s.layout && theme === s.theme;
      return `<button class="card${current ? ' current' : ''}" data-layout="${layout}" data-theme="${theme}"><div style="background:${L.THEMES[theme].bg}">${L.thumbSVG(s.root, layout, theme)}</div><span>${LAYOUT_NAMES[layout]} · ${L.THEMES[theme].name}</span></button>`;
    }).join('');
  }

  function select(id) {
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    selId = id;
    world.querySelectorAll('.node.sel').forEach((e) => e.classList.remove('sel'));
    const el = id && nodeEl(id);
    if (el) el.classList.add('sel');
    renderInspector();
  }

  const nodeEl = (id) => world.querySelector(`.node[data-id="${id}"]`);

  // ---------- Edición en línea ----------
  function startEdit(id, initial) {
    const f = find(id);
    const n = f && f.node;
    if (!n || !n._lines) return;
    stopEdit();
    const st = L.nodeStyle(n, lastLayout.theme);
    const ta = document.createElement('textarea');
    ta.className = 'edit-box';
    ta.value = initial !== undefined ? initial : n.text;
    ta.style.cssText = `left:${n._x - 6}px;top:${n._y}px;width:${Math.max(n._w + 12, 140)}px;height:${n._h}px;font:${st.font};line-height:${st.lh}px`;
    world.appendChild(ta);
    const ed = { id, ta, done: false };
    editing = ed;
    const grow = () => {
      ta.style.height = 'auto';
      ta.style.height = `${Math.max(n._h, ta.scrollHeight)}px`;
    };
    ta.addEventListener('input', grow);
    ta.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commitEdit(ed);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        ed.done = true;
        editing = null;
        ta.remove();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        commitEdit(ed);
        addChild(id);
      }
    });
    ta.addEventListener('blur', () => commitEdit(ed));
    ta.focus();
    if (initial !== undefined) ta.setSelectionRange(ta.value.length, ta.value.length);
    else ta.select();
    grow();
  }

  function stopEdit() {
    if (editing) commitEdit(editing);
  }

  function commitEdit(ed) {
    if (ed.done) return;
    ed.done = true;
    if (editing === ed) editing = null;
    const value = ed.ta.value.replace(/\s+/g, ' ').trim();
    const f = find(ed.id);
    ed.ta.remove();
    if (f && value && value !== f.node.text) setProp(ed.id, 'text', value);
  }

  // ---------- Navegación con teclado ----------
  function navigate(key) {
    const f = find(selId);
    if (!f) return;
    const n = f.node;
    const lay = lastLayout;
    const vis = (id) => lay.nodes.find((x) => x.id === id);
    const cur = vis(n.id);
    if (!cur) return;
    const sibs = f.parent ? f.parent.children : [];
    let target = null;

    if (lay.layout === 'org') {
      if (key === 'ArrowUp') target = f.parent;
      else if (key === 'ArrowDown') target = cur._kids[0];
      else target = sibs[f.index + (key === 'ArrowRight' ? 1 : -1)];
    } else if (key === 'ArrowUp' || key === 'ArrowDown') {
      target = sibs[f.index + (key === 'ArrowDown' ? 1 : -1)];
    } else {
      const dirRight = key === 'ArrowRight';
      if (f.parent) {
        const parentIsRight = vis(f.parent.id)._cx > cur._cx;
        target = parentIsRight === dirRight ? f.parent : cur._kids[0];
      } else {
        target = cur._kids.find((k) => (k._cx > cur._cx) === dirRight);
      }
    }
    if (target) select(target.id);
  }

  // ---------- Exportar PNG ----------
  function exportPNG() {
    const lay = lastLayout;
    const s = sheet();
    const pad = 48;
    const scale = 2;
    const b = lay.bbox;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil((b.w + pad * 2) * scale);
    canvas.height = Math.ceil((b.h + pad * 2) * scale);
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = lay.theme.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate(pad - b.x, pad - b.y);

    ctx.lineCap = 'round';
    lay.nodes.forEach((n) => {
      if (!n._parent) return;
      ctx.strokeStyle = n._color;
      ctx.lineWidth = L.linkWidth(n);
      ctx.stroke(new Path2D(L.linkPath(n._parent, n, s.layout)));
    });

    lay.nodes.forEach((n) => {
      const st = L.nodeStyle(n, lay.theme);
      const r = st.radius;
      ctx.beginPath();
      ctx.moveTo(n._x + r, n._y);
      ctx.arcTo(n._x + n._w, n._y, n._x + n._w, n._y + n._h, r);
      ctx.arcTo(n._x + n._w, n._y + n._h, n._x, n._y + n._h, r);
      ctx.arcTo(n._x, n._y + n._h, n._x, n._y, r);
      ctx.arcTo(n._x, n._y, n._x + n._w, n._y, r);
      ctx.closePath();
      ctx.fillStyle = st.bg;
      ctx.fill();
      ctx.strokeStyle = st.border;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = st.fg;
      ctx.font = st.font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      n._lines.forEach((line, i) => ctx.fillText(line, n._cx, n._y + 10 + st.lh * (i + 0.5)));
    });

    canvas.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${slug(s.root.text)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
  }

  // ---------- Generación ----------
  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }

  function setTab(name) {
    document.querySelectorAll('#drawerTabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('#drawer [data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== name; });
    if (name === 'styles') renderGallery();
    if (name === 'outline') $('#outlineText').value = G.toOutline(sheet().root);
  }

  // Si la hoja actual solo tiene el tema central vacío se reemplaza; si no, se crea una hoja nueva.
  function applyGenerated(root) {
    const s = sheet();
    const isEmpty = !s.root.children.length;
    mutate(() => {
      if (isEmpty) {
        s.root = root;
        delete views[s.id];
      } else {
        doc.sheets.push(newSheet(root.text.slice(0, 24), root, s.layout, s.theme));
        doc.active = doc.sheets.length - 1;
      }
      selId = null;
    });
    setTab('styles');
  }

  function generateFromText(topicOnly) {
    const text = $('#genText').value.trim();
    if (!text) return toast('Escribe un tema o pega un texto primero.');
    try {
      applyGenerated(topicOnly ? G.topicMap(text.split('\n')[0]) : G.textToMap(text));
      $('#genStatus').textContent = 'Mapa generado. Prueba otras variantes en la pestaña Estilos.';
    } catch (e) {
      $('#genStatus').textContent = e.message;
    }
  }

  async function generateFromImage(file) {
    const status = $('#genStatus');
    status.textContent = 'Reconociendo texto de la imagen…';
    try {
      const root = await G.imageToMap(file, (p) => { status.textContent = `Reconociendo texto… ${p}%`; });
      applyGenerated(root);
      status.textContent = 'Mapa replicado desde la imagen. Revisa y corrige los temas si hace falta.';
    } catch (e) {
      status.textContent = e.message || 'No se pudo procesar la imagen.';
    }
  }

  // ---------- Eventos ----------
  function bindViewport() {
    let pan = null;
    let drag = null;
    let ghost = null;

    viewport.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('.edit-box') || e.target.closest('.fold')) return;
      stopEdit();
      const el = e.target.closest('.node');
      if (el) {
        select(el.dataset.id);
        drag = { id: el.dataset.id, sx: e.clientX, sy: e.clientY, active: false, target: null };
      } else {
        const v = view();
        pan = { sx: e.clientX, sy: e.clientY, ox: v.x, oy: v.y, moved: false };
        viewport.classList.add('panning');
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (pan) {
        const dx = e.clientX - pan.sx;
        const dy = e.clientY - pan.sy;
        if (Math.abs(dx) + Math.abs(dy) > 3) pan.moved = true;
        const v = view();
        v.x = pan.ox + dx;
        v.y = pan.oy + dy;
        applyTransform();
      } else if (drag) {
        if (!drag.active && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6 && find(drag.id).parent) {
          drag.active = true;
          ghost = document.createElement('div');
          ghost.className = 'ghost';
          ghost.textContent = find(drag.id).node.text;
          document.body.appendChild(ghost);
        }
        if (drag.active) {
          ghost.style.left = `${e.clientX}px`;
          ghost.style.top = `${e.clientY}px`;
          const over = document.elementFromPoint(e.clientX, e.clientY);
          const tEl = over && over.closest('.node');
          const prev = world.querySelector('.node.drop');
          if (prev) prev.classList.remove('drop');
          drag.target = null;
          if (tEl && tEl.dataset.id !== drag.id && !contains(find(drag.id).node, tEl.dataset.id)) {
            tEl.classList.add('drop');
            drag.target = tEl.dataset.id;
          }
        }
      }
    });

    window.addEventListener('pointerup', () => {
      if (pan) {
        if (!pan.moved) select(null);
        pan = null;
        viewport.classList.remove('panning');
      }
      if (drag) {
        const d = drag;
        drag = null;
        if (ghost) ghost.remove();
        ghost = null;
        const prev = world.querySelector('.node.drop');
        if (prev) prev.classList.remove('drop');
        if (d.active && d.target) reparent(d.id, d.target);
      }
    });

    viewport.addEventListener('dblclick', (e) => {
      const el = e.target.closest('.node');
      if (el) startEdit(el.dataset.id);
    });

    viewport.addEventListener('click', (e) => {
      const btn = e.target.closest('.fold');
      if (btn) toggleFold(btn.closest('.node').dataset.id);
    });

    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoomAt(view().s * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    }, { passive: false });
  }

  function bindUI() {
    document.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) b.blur();
    });

    $('#btnUndo').onclick = undo;
    $('#btnRedo').onclick = redo;
    $('#zoomIn').onclick = () => zoomCenter(1.2);
    $('#zoomOut').onclick = () => zoomCenter(1 / 1.2);
    $('#zoomFit').onclick = fit;
    $('#btnClear').onclick = clearAll;
    $('#btnExport').onclick = exportPNG;
    $('#btnHelp').onclick = () => $('#helpDialog').showModal();
    $('#btnDrawer').onclick = () => $('#drawer').classList.toggle('closed');

    document.querySelectorAll('#layoutSeg button').forEach((b) => {
      b.onclick = () => {
        mutate(() => { sheet().layout = b.dataset.layout; });
        fit();
      };
    });

    const themeSel = $('#themeSel');
    themeSel.innerHTML = Object.entries(L.THEMES).map(([k, t]) => `<option value="${k}">${t.name}</option>`).join('');
    themeSel.onchange = () => mutate(() => { sheet().theme = themeSel.value; });

    $('#drawerTabs').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) setTab(b.dataset.tab);
    });

    $('#btnGenText').onclick = () => generateFromText(false);
    $('#btnGenTopic').onclick = () => generateFromText(true);
    $('#textFile').onchange = async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) return toast('El archivo es demasiado grande (máx. 2 MB).');
      $('#genText').value = await file.text();
      generateFromText(false);
    };
    $('#imageFile').onchange = (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (file) generateFromImage(file);
    };

    $('#btnApplyOutline').onclick = () => {
      const text = $('#outlineText').value;
      if (!text.trim()) return toast('El esquema está vacío.');
      try {
        const root = G.finalize(G.parseOutline(text.replace(/\r/g, '').split('\n')));
        mutate(() => { sheet().root = root; selId = null; });
        fit();
      } catch (err) {
        toast(err.message);
      }
    };

    $('#gallery').addEventListener('click', (e) => {
      const card = e.target.closest('.card');
      if (!card) return;
      mutate(() => {
        sheet().layout = card.dataset.layout;
        sheet().theme = card.dataset.theme;
      });
      fit();
    });

    $('#sheetbar').addEventListener('click', (e) => {
      const del = e.target.closest('[data-del]');
      if (del) {
        const i = Number(del.dataset.del);
        if (!confirm(`¿Eliminar la hoja "${doc.sheets[i].title}"?`)) return;
        mutate(() => {
          doc.sheets.splice(i, 1);
          doc.active = clamp(doc.active > i || doc.active === doc.sheets.length ? doc.active - 1 : doc.active, 0, doc.sheets.length - 1);
          selId = null;
        });
        return;
      }
      const b = e.target.closest('[data-sheet]');
      if (!b) return;
      if (b.dataset.sheet === 'new') {
        mutate(() => {
          doc.sheets.push(newSheet(`Hoja ${doc.sheets.length + 1}`, newNode('Idea central'), sheet().layout, sheet().theme));
          doc.active = doc.sheets.length - 1;
          selId = null;
        });
      } else if (Number(b.dataset.sheet) !== doc.active) {
        stopEdit();
        doc.active = Number(b.dataset.sheet);
        selId = null;
        persist();
        render();
      }
    });
    $('#sheetbar').addEventListener('dblclick', (e) => {
      const b = e.target.closest('[data-sheet]');
      if (!b || b.dataset.sheet === 'new') return;
      const i = Number(b.dataset.sheet);
      const name = prompt('Nombre de la hoja:', doc.sheets[i].title);
      if (name && name.trim()) mutate(() => { doc.sheets[i].title = name.trim().slice(0, 40); });
    });

    const insp = $('#inspector');
    insp.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || !inspId) return;
      const id = inspId;
      const act = b.dataset.act;
      if (act === 'color') setProp(id, 'color', b.dataset.v);
      else if (act === 'colorClear') setProp(id, 'color', null);
      else if (act === 'marker') setProp(id, 'marker', find(id).node.marker === b.dataset.v ? null : b.dataset.v);
      else if (act === 'child') addChild(id);
      else if (act === 'sibling') addSibling(id);
      else if (act === 'fold') toggleFold(id);
      else if (act === 'delete') deleteNode(id);
    });
    insp.addEventListener('change', (e) => {
      if (!inspId) return;
      if (e.target.id === 'noteInput') {
        const f = find(inspId);
        if (f && (f.node.note || '') !== e.target.value.trim()) setProp(inspId, 'note', e.target.value.trim());
      } else if (e.target.id === 'customColor') setProp(inspId, 'color', e.target.value);
    });
  }

  function bindKeys() {
    document.addEventListener('keydown', (e) => {
      if (e.target.closest('input, textarea, select, dialog')) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key;

      if (mod) {
        const lower = k.toLowerCase();
        if (lower === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
        else if (lower === 'y') { e.preventDefault(); redo(); }
        else if (lower === 'c' && selId) copyNode(selId, false);
        else if (lower === 'x' && selId) copyNode(selId, true);
        else if (lower === 'v' && selId) pasteNode(selId);
        else if (k === '0') { e.preventDefault(); fit(); }
        else if (k === '+' || k === '=') { e.preventDefault(); zoomCenter(1.2); }
        else if (k === '-') { e.preventDefault(); zoomCenter(1 / 1.2); }
        return;
      }

      if (k === 'Escape') return select(null);
      if (!selId) return;

      if (k === 'Tab') { e.preventDefault(); addChild(selId); }
      else if (k === 'Enter') { e.preventDefault(); addSibling(selId); }
      else if (k === 'F2') { e.preventDefault(); startEdit(selId); }
      else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); deleteNode(selId); }
      else if (k === ' ') { e.preventDefault(); toggleFold(selId); }
      else if (k.startsWith('Arrow')) {
        e.preventDefault();
        if (e.altKey && (k === 'ArrowUp' || k === 'ArrowDown')) moveSibling(selId, k === 'ArrowUp' ? -1 : 1);
        else navigate(k);
      } else if (k.length === 1 && !e.altKey) {
        e.preventDefault();
        startEdit(selId, k);
      }
    });
  }

  function init() {
    viewport = $('#viewport');
    world = $('#world');
    doc = load();
    bindViewport();
    bindUI();
    bindKeys();
    render();
    window.addEventListener('beforeunload', () => stopEdit());
    window.MFApp = { get doc() { return doc; }, get selId() { return selId; }, find, select, render };
  }

  window.addEventListener('DOMContentLoaded', init);
})(window.MF);
