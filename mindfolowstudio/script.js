// Estado de la aplicación y datos del mapa mental
let nodes = {
    'root': {
        id: 'root',
        text: 'Idea Principal',
        x: window.innerWidth / 2 - 75,
        y: window.innerHeight / 2 - 40,
        color: '#4f46e5',
        parentId: null,
        children: []
    }
};

let selectedNodeId = 'root';
let scale = 1;
let panX = 0;
let panY = 0;
let isPanning = false;
let startX = 0;
let startY = 0;
let isDraggingNode = false;
let draggedNodeId = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

// Paleta automática por niveles
const levelColors = ['#4f46e5', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6'];

const viewport = document.getElementById('viewport');
const canvas = document.getElementById('canvas');
const nodesContainer = document.getElementById('nodesContainer');
const connectionsGroup = document.getElementById('connectionsGroup');
const nodeColorPicker = document.getElementById('nodeColorPicker');
const topicDialog = document.getElementById('topicDialog');
const topicForm = document.getElementById('topicForm');
const topicInput = document.getElementById('topicInput');
const imageFileInput = document.getElementById('imageFile');
const imageStatus = document.getElementById('imageStatus');
const btnImportImage = document.getElementById('btnImportImage');

// Inicialización
function init() {
    render();
    setupEventListeners();
}

// Renderizado completo de nodos y conectores SVG
function render() {
    nodesContainer.innerHTML = '';

    // Renderizar nodos
    Object.values(nodes).forEach(node => {
        const el = document.createElement('div');
        el.className = `mind-node ${node.id === 'root' ? 'root-node' : ''} ${node.id === selectedNodeId ? 'selected' : ''}`;
        el.style.left = `${node.x}px`;
        el.style.top = `${node.y}px`;
        if (node.id !== 'root' && node.color) {
            el.style.borderColor = node.color;
        }
        
        el.dataset.id = node.id;
        el.innerHTML = `<span>${escapeHtml(node.text)}</span>`;

        // Doble clic para editar
        el.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            enableInlineEdit(node.id, el);
        });

        // Click para seleccionar
        el.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'INPUT') return;
            selectNode(node.id);
            startDraggingNode(e, node.id);
        });

        nodesContainer.appendChild(el);
    });

    renderConnections();
}

function renderConnections() {
    connectionsGroup.innerHTML = '';

    // Renderizar conectores SVG (Curvas Bézier)
    Object.values(nodes).forEach(node => {
        if (node.parentId && nodes[node.parentId]) {
            const parent = nodes[node.parentId];
            const child = node;

            const pEl = nodesContainer.querySelector(`[data-id="${parent.id}"]`);
            const cEl = nodesContainer.querySelector(`[data-id="${child.id}"]`);

            if (pEl && cEl) {
                const pRect = pEl.getBoundingClientRect();
                const cRect = cEl.getBoundingClientRect();
                const viewportRect = viewport.getBoundingClientRect();

                // El SVG permanece fijo en el viewport, así que los conectores usan coordenadas visibles.
                const x1 = pRect.left + pRect.width / 2 - viewportRect.left;
                const y1 = pRect.top + pRect.height / 2 - viewportRect.top;
                const x2 = cRect.left + cRect.width / 2 - viewportRect.left;
                const y2 = cRect.top + cRect.height / 2 - viewportRect.top;

                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                const dx = (x2 - x1) * 0.5;
                const pathData = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
                
                path.setAttribute('d', pathData);
                path.setAttribute('class', 'connection-line');
                if (child.color) path.style.stroke = child.color;
                
                connectionsGroup.appendChild(path);
            }
        }
    });
}

// Selección de nodo
function selectNode(id) {
    selectedNodeId = id;
    const node = nodes[id];
    if (node && node.color) {
        nodeColorPicker.value = node.color;
    }
    render();
}

// Añadir Nodo Hijo
function addChildNode(parentId = selectedNodeId) {
    if (!nodes[parentId]) return;
    const parent = nodes[parentId];
    const newId = 'node_' + Date.now();
    
    // Determinar nivel y color automático
    let depth = 0;
    let curr = parent;
    while (curr.parentId) {
        depth++;
        curr = nodes[curr.parentId];
    }
    const color = levelColors[(depth + 1) % levelColors.length];

    const newNode = {
        id: newId,
        text: 'Nuevo Nodo',
        x: parent.x + 220,
        y: parent.y + (parent.children.length * 70) - 30,
        color: color,
        parentId: parentId,
        children: []
    };

    nodes[newId] = newNode;
    parent.children.push(newId);
    selectNode(newId);
    render();

    // Editar texto automáticamente al crear
    setTimeout(() => {
        const el = nodesContainer.querySelector(`[data-id="${newId}"]`);
        if (el) enableInlineEdit(newId, el);
    }, 50);
}

// Añadir Nodo Hermano
function addSiblingNode(nodeId = selectedNodeId) {
    if (nodeId === 'root') return;
    const node = nodes[nodeId];
    if (!node || !node.parentId) return;
    addChildNode(node.parentId);
}

function generateTopicMap(topic) {
    const branchTopics = [
        {
            text: 'Fundamentos y contexto',
            children: [
                `¿Qué significa ${topic}?`,
                'Origen y evolución',
                'Principios fundamentales',
                'Términos y definiciones clave'
            ]
        },
        {
            text: 'Conceptos y componentes',
            children: [
                'Elementos que lo componen',
                'Características principales',
                'Actores, recursos y herramientas',
                'Relación entre sus componentes'
            ]
        },
        {
            text: 'Funcionamiento y procesos',
            children: [
                'Etapas y procesos principales',
                'Causas y factores involucrados',
                'Métodos y herramientas utilizados',
                'Resultados que produce'
            ]
        },
        {
            text: 'Tipos y enfoques',
            children: [
                'Clasificaciones existentes',
                'Modelos y corrientes principales',
                'Criterios para diferenciarlos',
                'Cuándo conviene cada enfoque'
            ]
        },
        {
            text: 'Usos y aplicaciones',
            children: [
                'Usos en la vida cotidiana',
                'Aplicaciones profesionales',
                'Sectores relacionados',
                'Caso práctico para investigar'
            ]
        },
        {
            text: 'Beneficios e impacto',
            children: [
                'Ventajas y oportunidades',
                'Impacto social y cultural',
                'Impacto económico y ambiental',
                'Indicadores para medir su impacto'
            ]
        },
        {
            text: 'Retos y limitaciones',
            children: [
                'Problemas frecuentes',
                'Riesgos y efectos no deseados',
                'Barreras para su implementación',
                'Límites y condiciones de uso'
            ]
        },
        {
            text: 'Ejemplos y casos de estudio',
            children: [
                'Ejemplo sencillo para comprenderlo',
                'Caso real para investigar',
                'Comparación de casos',
                'Lecciones aprendidas'
            ]
        },
        {
            text: 'Análisis y conexiones',
            children: [
                `Relación de ${topic} con otros temas`,
                'Diferencias con conceptos similares',
                'Argumentos a favor y perspectivas críticas',
                'Preguntas que siguen abiertas'
            ]
        },
        {
            text: 'Futuro y aprendizaje',
            children: [
                'Tendencias emergentes',
                'Posibles escenarios futuros',
                'Conocimientos y habilidades necesarios',
                'Fuentes y plan para profundizar'
            ]
        }
    ];
    const rootX = 1000;
    const rootY = 1050;
    const root = {
        id: 'root',
        text: topic,
        x: rootX,
        y: rootY,
        color: '#4f46e5',
        parentId: null,
        children: []
    };

    nodes = { root };
    const sideBranchIndexes = [[], []];
    branchTopics.forEach((branch, index) => sideBranchIndexes[index % 2].push(index));

    branchTopics.forEach((branch, index) => {
        const side = index % 2 === 0 ? 1 : -1;
        const sideIndex = sideBranchIndexes[index % 2].indexOf(index);
        const branchY = rootY + (sideIndex - 2) * 420;
        const branchId = `topic_${index + 1}`;
        const children = [];

        branch.children.forEach((text, childIndex) => {
            const childId = `${branchId}_${childIndex + 1}`;
            nodes[childId] = {
                id: childId,
                text,
                x: rootX + side * 700,
                y: branchY + (childIndex - 1.5) * 80,
                color: levelColors[(index + 1) % levelColors.length],
                parentId: branchId,
                children: []
            };
            children.push(childId);
        });

        nodes[branchId] = {
            id: branchId,
            text: branch.text,
            x: rootX + side * 330,
            y: branchY,
            color: levelColors[(index + 1) % levelColors.length],
            parentId: 'root',
            children
        };
        root.children.push(branchId);
    });

    selectedNodeId = 'root';
    nodeColorPicker.value = root.color;
    scale = 1;
    panX = 0;
    panY = 0;
    render();
    fitMapToViewport();
}

function fitMapToViewport() {
    const nodeElements = [...nodesContainer.children];
    const minX = Math.min(...nodeElements.map(node => node.offsetLeft));
    const minY = Math.min(...nodeElements.map(node => node.offsetTop));
    const maxX = Math.max(...nodeElements.map(node => node.offsetLeft + node.offsetWidth));
    const maxY = Math.max(...nodeElements.map(node => node.offsetTop + node.offsetHeight));
    const mapWidth = maxX - minX;
    const mapHeight = maxY - minY;
    const horizontalPadding = 40;
    const topPadding = 30;
    const bottomPadding = 100;
    const availableWidth = Math.max(viewport.clientWidth - horizontalPadding * 2, 1);
    const availableHeight = Math.max(viewport.clientHeight - topPadding - bottomPadding, 1);

    scale = Math.min(1, availableWidth / mapWidth, availableHeight / mapHeight);
    panX = horizontalPadding + (availableWidth - mapWidth * scale) / 2 - minX * scale;
    panY = topPadding + (availableHeight - mapHeight * scale) / 2 - minY * scale;
    updateTransform();
}

function setImageImportStatus(message, isError = false) {
    imageStatus.textContent = message;
    imageStatus.classList.remove('hidden', 'text-red-400', 'text-slate-300');
    imageStatus.classList.add(isError ? 'text-red-400' : 'text-slate-300');
}

function groupRecognizedWords(words) {
    const recognizedWords = words
        .filter(word => word.text.trim() && word.confidence >= 30 && /[a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ]/.test(word.text))
        .map(word => ({
            text: word.text.trim(),
            bbox: word.bbox,
            centerY: (word.bbox.y0 + word.bbox.y1) / 2,
            height: word.bbox.y1 - word.bbox.y0
        }))
        .sort((a, b) => a.centerY - b.centerY || a.bbox.x0 - b.bbox.x0);
    const rows = [];

    recognizedWords.forEach(word => {
        let row = rows.find(candidate =>
            Math.abs(candidate.centerY - word.centerY) <= Math.max(candidate.height, word.height) * 0.6
        );
        if (!row) {
            row = { centerY: word.centerY, height: word.height, words: [] };
            rows.push(row);
        }
        row.words.push(word);
        row.centerY = row.words.reduce((sum, item) => sum + item.centerY, 0) / row.words.length;
        row.height = Math.max(row.height, word.height);
    });

    const lines = [];
    rows.forEach(row => {
        row.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
        let group = [];
        row.words.forEach((word, index) => {
            const previous = group[group.length - 1];
            const gap = previous ? word.bbox.x0 - previous.bbox.x1 : 0;
            const splitGap = Math.max(24, Math.max(word.height, previous?.height || 0) * 2.5);
            if (previous && gap > splitGap) {
                lines.push(createRecognizedLine(group));
                group = [];
            }
            group.push(word);
            if (index === row.words.length - 1) lines.push(createRecognizedLine(group));
        });
    });

    return lines;
}

function createRecognizedLine(words) {
    const bbox = {
        x0: Math.min(...words.map(word => word.bbox.x0)),
        y0: Math.min(...words.map(word => word.bbox.y0)),
        x1: Math.max(...words.map(word => word.bbox.x1)),
        y1: Math.max(...words.map(word => word.bbox.y1))
    };
    return {
        text: words.map(word => word.text).join(' '),
        bbox,
        centerX: (bbox.x0 + bbox.x1) / 2,
        centerY: (bbox.y0 + bbox.y1) / 2
    };
}

function createMapFromRecognizedLines(lines, imageWidth, imageHeight) {
    const imageCenter = { x: imageWidth / 2, y: imageHeight / 2 };
    const rootIndex = lines.reduce((closestIndex, line, index) => {
        const closest = lines[closestIndex];
        const lineDistance = Math.hypot(line.centerX - imageCenter.x, line.centerY - imageCenter.y);
        const closestDistance = Math.hypot(closest.centerX - imageCenter.x, closest.centerY - imageCenter.y);
        return lineDistance < closestDistance ? index : closestIndex;
    }, 0);
    const coordinateScale = Math.min(1, 2400 / Math.max(imageWidth, imageHeight));
    const positionedLines = lines.map((line, index) => ({
        ...line,
        id: index === rootIndex ? 'root' : `image_${index}`,
        x: 100 + line.bbox.x0 * coordinateScale,
        y: 100 + line.bbox.y0 * coordinateScale,
        distanceFromRoot: Math.hypot(line.centerX - lines[rootIndex].centerX, line.centerY - lines[rootIndex].centerY)
    }));

    nodes = {};
    positionedLines.forEach(line => {
        nodes[line.id] = {
            id: line.id,
            text: line.text,
            x: line.x,
            y: line.y,
            color: line.id === 'root' ? '#4f46e5' : '#10b981',
            parentId: null,
            children: []
        };
    });

    const rootLine = positionedLines[rootIndex];
    positionedLines.forEach(line => {
        if (line.id === 'root') return;

        const closerLines = positionedLines.filter(candidate =>
            candidate.distanceFromRoot < line.distanceFromRoot
        );
        const parentLine = closerLines.reduce((nearest, candidate) => {
            const distance = Math.hypot(line.centerX - candidate.centerX, line.centerY - candidate.centerY);
            const nearestDistance = Math.hypot(line.centerX - nearest.centerX, line.centerY - nearest.centerY);
            return distance < nearestDistance ? candidate : nearest;
        }, rootLine);

        const parent = nodes[parentLine.id];
        let depth = 1;
        let ancestor = parent;
        while (ancestor.parentId) {
            depth++;
            ancestor = nodes[ancestor.parentId];
        }
        nodes[line.id].parentId = parentLine.id;
        nodes[line.id].color = levelColors[depth % levelColors.length];
        parent.children.push(line.id);
    });

    selectedNodeId = 'root';
    nodeColorPicker.value = nodes.root.color;
    scale = 1;
    panX = 0;
    panY = 0;
    render();
    fitMapToViewport();
}

async function replicateMindMapFromImage(file) {
    btnImportImage.disabled = true;
    setImageImportStatus('Preparando el reconocimiento local...');
    let worker;
    let image;

    try {
        if (!window.Tesseract) {
            throw new Error('No se pudo cargar el lector OCR. Revisa tu conexión e inténtalo de nuevo.');
        }

        worker = await Tesseract.createWorker('spa+eng', 1, {
            logger: message => {
                if (message.status === 'recognizing text') {
                    setImageImportStatus(`Leyendo imagen: ${Math.round(message.progress * 100)}%`);
                }
            }
        });
        const result = await worker.recognize(file);
        await worker.terminate();
        worker = null;

        image = await createImageBitmap(file);
        const lines = groupRecognizedWords(result.data.words);

        if (!lines.length) {
            throw new Error('No se reconoció texto. Prueba con una imagen más nítida y con texto legible.');
        }

        createMapFromRecognizedLines(lines, image.width, image.height);
        setImageImportStatus(`Mapa creado con ${lines.length} textos. Revisa las conexiones aproximadas.`);
    } catch (error) {
        console.error('Error al replicar el mapa desde la imagen:', error);
        setImageImportStatus(error.message || 'No se pudo procesar la imagen.', true);
    } finally {
        if (image) image.close();
        if (worker) {
            try {
                await worker.terminate();
            } catch (error) {
                console.error('No se pudo cerrar el lector OCR:', error);
                setImageImportStatus('El mapa se procesó, pero no se pudo cerrar el lector OCR correctamente.', true);
            }
        }
        btnImportImage.disabled = false;
        imageFileInput.value = '';
    }
}

// Eliminar solo el nodo seleccionado y conservar sus hijos.
function deleteNode(id = selectedNodeId) {
    if (id === 'root') {
        alert('No se puede eliminar el nodo principal.');
        return;
    }
    const node = nodes[id];
    if (!node) return;

    const parent = nodes[node.parentId];
    if (!parent) {
        throw new Error(`No se puede eliminar el nodo "${id}": falta su nodo padre.`);
    }

    const childIndex = parent.children.indexOf(id);
    const children = node.children || [];
    if (childIndex === -1 || children.some(childId => !nodes[childId])) {
        throw new Error(`No se puede eliminar el nodo "${id}": la estructura del mapa no es válida.`);
    }

    parent.children.splice(childIndex, 1, ...children);
    children.forEach(childId => {
        nodes[childId].parentId = parent.id;
    });
    delete nodes[id];
    selectedNodeId = parent.id;
    render();
}

function clearMap() {
    const root = nodes.root;
    if (!root) {
        throw new Error('No se puede borrar el mapa: falta el nodo principal.');
    }

    const hasMapContent = Object.keys(nodes).length > 1 || root.text !== 'Idea Principal';
    if (hasMapContent && !confirm('¿Seguro que quieres borrar todo el mapa? Esta acción no se puede deshacer.')) {
        return;
    }

    nodes = {
        root: {
            id: 'root',
            text: 'Idea Principal',
            x: viewport.clientWidth / 2 - 75,
            y: viewport.clientHeight / 2 - 40,
            color: '#4f46e5',
            parentId: null,
            children: []
        }
    };
    selectedNodeId = 'root';
    scale = 1;
    panX = 0;
    panY = 0;
    nodeColorPicker.value = nodes.root.color;
    render();
    updateTransform();
}

// Edición en vivo de texto
function enableInlineEdit(id, element) {
    const node = nodes[id];
    element.innerHTML = `<input type="text" id="inlineInput" value="${node.text}" class="bg-slate-900 text-white text-xs px-2 py-1 rounded border border-indigo-500 outline-none w-full text-center">`;
    const input = document.getElementById('inlineInput');
    input.focus();
    input.select();

    const saveEdit = () => {
        const val = input.value.trim();
        if (val) node.text = val;
        render();
    };

    input.addEventListener('blur', saveEdit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            saveEdit();
        } else if (e.key === 'Escape') {
            render();
        }
    });
}

// Gestión de Arrastrar Nodo
function startDraggingNode(e, id) {
    isDraggingNode = true;
    draggedNodeId = id;
    const node = nodes[id];
    const el = nodesContainer.querySelector(`[data-id="${id}"]`);
    const rect = el.getBoundingClientRect();
    const containerRect = canvas.getBoundingClientRect();

    dragOffsetX = (e.clientX - rect.left) / scale;
    dragOffsetY = (e.clientY - rect.top) / scale;
}

// Configuración de Eventos Generales
function setupEventListeners() {
    btnImportImage.addEventListener('click', () => imageFileInput.click());
    imageFileInput.addEventListener('change', event => {
        const file = event.target.files[0];
        if (file) replicateMindMapFromImage(file);
    });

    document.getElementById('btnOpenTopicDialog').addEventListener('click', () => {
        topicDialog.showModal();
        topicInput.focus();
    });
    document.getElementById('btnCancelTopic').addEventListener('click', () => topicDialog.close());
    topicDialog.addEventListener('click', (e) => {
        if (e.target === topicDialog) topicDialog.close();
    });
    topicInput.addEventListener('input', () => topicInput.setCustomValidity(''));
    topicForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const topic = topicInput.value.trim();
        if (!topic) {
            topicInput.setCustomValidity('Escribe un tema para generar el mapa.');
            topicInput.reportValidity();
            return;
        }
        generateTopicMap(topic);
        topicDialog.close();
        topicInput.value = '';
    });

    // Zoom y Pan en el Viewport
    viewport.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || e.target.closest('.mind-node, #canvasControls')) return;
        isPanning = true;
        startX = e.clientX - panX;
        startY = e.clientY - panY;
    });

    window.addEventListener('mousemove', (e) => {
        if (isPanning) {
            panX = e.clientX - startX;
            panY = e.clientY - startY;
            updateTransform();
        } else if (isDraggingNode && draggedNodeId) {
            const containerRect = canvas.getBoundingClientRect();
            const x = (e.clientX - containerRect.left) / scale - dragOffsetX;
            const y = (e.clientY - containerRect.top) / scale - dragOffsetY;
            nodes[draggedNodeId].x = x;
            nodes[draggedNodeId].y = y;
            render();
        }
    });

    window.addEventListener('mouseup', () => {
        isPanning = false;
        isDraggingNode = false;
        draggedNodeId = null;
    });

    // Zoom con rueda del ratón
    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomFactor = 1.1;
        const nextScale = e.deltaY < 0
            ? Math.min(scale * zoomFactor, 2.5)
            : Math.max(scale / zoomFactor, 0.3);
        zoomAtPoint(nextScale, e.clientX, e.clientY);
    }, { passive: false });

    // Botones de Control UI
    document.getElementById('btnAddChild').addEventListener('click', () => addChildNode());
    document.getElementById('btnDelete').addEventListener('click', clearMap);
    
    document.getElementById('btnZoomIn').addEventListener('click', () => zoomAtViewportCenter(Math.min(scale * 1.2, 2.5)));
    document.getElementById('btnZoomOut').addEventListener('click', () => zoomAtViewportCenter(Math.max(scale / 1.2, 0.3)));
    document.getElementById('btnResetView').addEventListener('click', () => { scale = 1; panX = 0; panY = 0; updateTransform(); });

    // Selector de Color Individual
    nodeColorPicker.addEventListener('input', (e) => {
        if (nodes[selectedNodeId]) {
            nodes[selectedNodeId].color = e.target.value;
            render();
        }
    });

    // Atajos de teclado
    window.addEventListener('keydown', (e) => {
        if (document.activeElement.tagName === 'INPUT') return;

        if (e.key === 'Tab') {
            e.preventDefault();
            addChildNode();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            addSiblingNode();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            deleteNode();
        }
    });

    // Exportar PNG
    document.getElementById('btnExportPng').addEventListener('click', () => {
        const target = document.getElementById('canvas');
        html2canvas(target, { backgroundColor: '#0b0f19', scale: 2 }).then(canvasImg => {
            const link = document.createElement('a');
            link.download = 'mapa_mental.png';
            link.href = canvasImg.toDataURL('image/png');
            link.click();
        });
    });

}

function updateTransform() {
    canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    renderConnections();
}

function zoomAtPoint(nextScale, clientX, clientY) {
    if (nextScale === scale) return;

    const viewportRect = viewport.getBoundingClientRect();
    const pointX = clientX - viewportRect.left;
    const pointY = clientY - viewportRect.top;
    panX = pointX - (pointX - panX) * (nextScale / scale);
    panY = pointY - (pointY - panY) * (nextScale / scale);
    scale = nextScale;
    updateTransform();
}

function zoomAtViewportCenter(nextScale) {
    const viewportRect = viewport.getBoundingClientRect();
    zoomAtPoint(nextScale, viewportRect.left + viewportRect.width / 2, viewportRect.top + viewportRect.height / 2);
}

function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

// Ejecutar al cargar
window.onload = init;