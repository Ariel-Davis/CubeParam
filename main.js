// ─── Complex arithmetic ───────────────────────────────────────────────────────

class C {
  constructor(re, im = 0) { this.re = re; this.im = im; }
  add(b)   { return new C(this.re + b.re, this.im + b.im); }
  sub(b)   { return new C(this.re - b.re, this.im - b.im); }
  mul(b)   { return new C(this.re * b.re - this.im * b.im,
                          this.re * b.im + this.im * b.re); }
  scale(r) { return new C(this.re * r, this.im * r); }
  abs()    { return Math.hypot(this.re, this.im); }
  sq()     { return this.mul(this); }
}

// Fixed constants
const ALPHA = new C(0, -1 / Math.SQRT2);       // -i/√2
const ZETA  = new C(-0.5,  Math.sqrt(3) / 2);  // e^(2πi/3), primitive cube root of unity
const ZETA2 = new C(-0.5, -Math.sqrt(3) / 2);  // e^(4πi/3) = ZETA²
const SQRT12 = Math.sqrt(12);

function zetaPow(n) {
  switch (((n % 3) + 3) % 3) {
    case 0: return new C(1, 0);
    case 1: return ZETA;
    case 2: return ZETA2;
  }
}

// ─── Mode B: c ↔ z radial maps ───────────────────────────────────────────────
//
// Both maps preserve argument; only the modulus transforms.
// f(t) = tan(πt/2)/t  sends [0,1) → [0,∞)   with limit f(0) = π/2
// g(t) = (2/π)·atan(t)/t  sends [0,∞) → [0,1)  with limit g(0) = 2/π

function cToZ(c) {
  const r = c.abs();
  if (r < 1e-10) return new C(0, 0);
  return c.scale(Math.tan(Math.PI / 2 * r) / r);
}

function zToC(z) {
  const r = z.abs();
  if (r < 1e-10) return new C(0, 0);
  return z.scale((2 / Math.PI) * Math.atan(r) / r);
}

// ─── Parametrizations ─────────────────────────────────────────────────────────

// u₃-mode: u₁=(1−z²)/2, u₂=i(z²+1)/2, u₃=z
// At z=0: u₁=½, u₂=i/2 — the standard x,y axes scaled by ½.
// The control point z coincides with u₃.
function paramU3(z) {
  const z2 = z.sq();
  return [
    new C(1, 0).sub(z2).scale(0.5),
    new C(0, 1).mul(z2.add(new C(1, 0))).scale(0.5),
    z,
  ];
}

// Diagonal-mode: wₖ = ⅓(α·ζ^(k−1) + z + α·ζ^(4−k)·z²)  for k = 1,2,3
// The control point z coincides with w₁+w₂+w₃ (the vertex opposite the origin).
// α = -i/√2 is the unique constant (up to sign) making Σwₖ² = 0 for all z.
// ζ = e^(2πi/3) distributes the three vectors under Z/3 symmetry.
function paramDiag(z) {
  const z2 = z.sq();
  return [1, 2, 3].map(k =>
    ALPHA.mul(zetaPow(k - 1))
      .add(z)
      .add(ALPHA.mul(zetaPow(4 - k)).mul(z2))
      .scale(1 / 3)
  );
}

// ─── Height (depth) functions ─────────────────────────────────────────────────
//
// Each hₖ is the coordinate of the k-th cube edge vector along the axis
// orthogonal to the projection plane.
//
// u₃-mode:
//   h'₁ = −Re(z₀),  h'₂ = −Im(z₀),  h'₃ = (1−|z₀|²)/2
//
// Diagonal-mode:
//   hₖ = (1−|z₀|²)/6  +  (√2/3)·Im(ζ^(1−k)·z₀)   for k = 1,2,3
//
// In Mode B, divide by the same s used for the projection vectors.

function heightsU3(z) {
  const r2 = z.re * z.re + z.im * z.im;
  return [-z.re, -z.im, (1 - r2) / 2];
}

function heightsDiag(z) {
  const r2 = z.re * z.re + z.im * z.im;
  const A = (1 - r2) / 6;
  const B = Math.SQRT2 / 3;
  return [1, 2, 3].map(k => A + B * zetaPow(1 - k).mul(z).im);
}

// ─── Projection state ─────────────────────────────────────────────────────────
//
// Returns current projection vectors and heights together so normalization
// is applied once and both are scaled by the same factor.
// Closed-form norms: s = (1+|z₀|²)/√12  (diagonal), s = (1+|z₀|²)/2  (u₃)

function getProjectionState() {
  const z     = (displayMode === 'B') ? cToZ(controlPt) : controlPt;
  let vecs    = (paramMode === 'u3') ? paramU3(z)   : paramDiag(z);
  let heights = (paramMode === 'u3') ? heightsU3(z) : heightsDiag(z);
  if (displayMode === 'B') {
    const r2 = z.re * z.re + z.im * z.im;
    const s  = paramMode === 'diag' ? (1 + r2) / SQRT12 : (1 + r2) / 2;
    if (s > 1e-10) {
      vecs    = vecs.map(u => u.scale(1 / s));
      heights = heights.map(h => h / s);
    }
  }
  return { vecs, heights };
}

// ─── Application state ────────────────────────────────────────────────────────

let paramMode   = 'u3';
let displayMode = 'A';
let controlPt   = new C(0.5, 0.3);
let dragging    = false;
let userScale   = 1.0;

// ─── Object system state ──────────────────────────────────────────────────────

let vertices         = [];
let nextVertexId     = 0;
let segments         = [];
let nextSegmentId    = 0;
let selectedVertexIds = new Set();
let segmentMode      = 'off';     // 'off' | 'on' | 'on++'

// ─── Undo / redo ──────────────────────────────────────────────────────────────
//
// Tracks mutations to the object system only (vertices, segments, selection).
// Control point, anchor mode, display mode, and scale are excluded — they are
// continuous or non-destructive parameters, not editing steps.

const HISTORY_LIMIT = 8;
let undoStack = [];
let redoStack = [];

function captureState() {
  return {
    vertices:         vertices.map(v => ({ ...v, coords: [...v.coords] })),
    segments:         segments.map(s => ({ ...s, vertexIds: [...s.vertexIds] })),
    selectedVertexIds: new Set(selectedVertexIds),
  };
}

function snapshot() {
  undoStack.push(captureState());
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack = [];
  updateUndoButtons();
}

function restoreState(state) {
  vertices          = state.vertices;
  segments          = state.segments;
  selectedVertexIds = state.selectedVertexIds;
  renderVertexList();
  renderSegmentList();
  draw();
}

function undo() {
  if (undoStack.length === 0) return;
  redoStack.push(captureState());
  restoreState(undoStack.pop());
  updateUndoButtons();
}

function redo() {
  if (redoStack.length === 0) return;
  undoStack.push(captureState());
  restoreState(redoStack.pop());
  updateUndoButtons();
}

function updateUndoButtons() {
  document.getElementById('btn-undo').disabled = undoStack.length === 0;
  document.getElementById('btn-redo').disabled = redoStack.length === 0;
}

// ─── Object math ──────────────────────────────────────────────────────────────

function projectPoint(coords, vecs, heights) {
  const [a1, a2, a3] = coords;
  const pt    = vecs[0].scale(a1).add(vecs[1].scale(a2)).add(vecs[2].scale(a3));
  const depth = a1 * heights[0] + a2 * heights[1] + a3 * heights[2];
  return { pt, depth };
}

// ─── Canvas setup ─────────────────────────────────────────────────────────────

const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');

function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  draw();
}
window.addEventListener('resize', resize);

function cx() { return canvas.width  / 2; }
function cy() { return canvas.height / 2; }

function getBaseScale() {
  return displayMode === 'A'
    ? 150
    : Math.min(canvas.width, canvas.height) * 0.30;
}

function getDisplayScale() { return getBaseScale() * userScale; }

function toScreen(c, scale) {
  return { x: cx() + c.re * scale, y: cy() - c.im * scale };
}

function fromScreen(px, py, scale) {
  return new C((px - cx()) / scale, -(py - cy()) / scale);
}

// ─── Drawing ──────────────────────────────────────────────────────────────────

function drawDiskBoundary(scale) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.setLineDash([4, 6]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx(), cy(), scale, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

function drawWireframe(vecs, scale) {
  const vx = [];
  for (let mask = 0; mask < 8; mask++) {
    let v = new C(0, 0);
    for (let k = 0; k < 3; k++) {
      if (mask & (1 << k)) v = v.add(vecs[k]);
    }
    vx.push(toScreen(v, scale));
  }
  ctx.save();
  ctx.strokeStyle = 'rgba(100, 200, 255, 0.85)';
  ctx.lineWidth = 1.5;
  for (let a = 0; a < 8; a++) {
    for (let b = a + 1; b < 8; b++) {
      const diff = a ^ b;
      if (diff && !(diff & (diff - 1))) {
        ctx.beginPath();
        ctx.moveTo(vx[a].x, vx[a].y);
        ctx.lineTo(vx[b].x, vx[b].y);
        ctx.stroke();
      }
    }
  }
  ctx.fillStyle = 'rgba(130, 215, 255, 0.80)';
  for (const v of vx) {
    ctx.beginPath();
    ctx.arc(v.x, v.y, 3, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.restore();
}

function drawSegments(vecs, heights, scale) {
  for (const seg of segments) {
    if (!seg.visible) continue;
    const v1 = vertices.find(v => v.id === seg.vertexIds[0]);
    const v2 = vertices.find(v => v.id === seg.vertexIds[1]);
    if (!v1 || !v2) continue;
    const p1 = toScreen(projectPoint(v1.coords, vecs, heights).pt, scale);
    const p2 = toScreen(projectPoint(v2.coords, vecs, heights).pt, scale);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.strokeStyle = seg.color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
}

function drawVertices(vecs, heights, scale) {
  for (const v of vertices) {
    if (!v.visible) continue;
    const { pt } = projectPoint(v.coords, vecs, heights);
    const s = toScreen(pt, scale);

    if (selectedVertexIds.has(v.id)) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(s.x, s.y, 9, 0, 2 * Math.PI);
      ctx.strokeStyle = 'rgba(255, 240, 80, 0.95)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(s.x, s.y, 5, 0, 2 * Math.PI);
    ctx.fillStyle = v.color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.50)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    if (v.showLabel) {
      ctx.save();
      ctx.font = '11px sans-serif';
      ctx.fillStyle = v.color;
      ctx.fillText(v.name, s.x + 9, s.y - 7);
      ctx.restore();
    }
  }
}

function drawControlPoint(scale) {
  const pt = toScreen(controlPt, scale);
  ctx.save();
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, 8, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgba(255, 200, 60, 0.95)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.80)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const base              = getBaseScale();
  const display           = getDisplayScale();
  const { vecs, heights } = getProjectionState();
  if (displayMode === 'B') drawDiskBoundary(base);
  drawWireframe(vecs, display);
  drawSegments(vecs, heights, display);
  drawVertices(vecs, heights, display);
  drawControlPoint(base);
}

// ─── Pointer interaction ──────────────────────────────────────────────────────
//
// Near the control point  → drag (moves the projection parameter)
// Elsewhere, segment mode → tap (selects a vertex); cancelled if pointer
//                           travels > 8px, so dragging never affects selection.

let pointerDownData = null;

function updateFromPointer(e) {
  const rect = canvas.getBoundingClientRect();
  let pt = fromScreen(e.clientX - rect.left, e.clientY - rect.top, getBaseScale());
  if (displayMode === 'B') {
    const r = pt.abs();
    if (r >= 1) pt = pt.scale(0.999 / r);
  }
  controlPt = pt;
  draw();
}

canvas.addEventListener('pointerdown', e => {
  if (e.target !== canvas) return;
  const rect      = canvas.getBoundingClientRect();
  const px        = e.clientX - rect.left;
  const py        = e.clientY - rect.top;
  const ctrlPt    = toScreen(controlPt, getBaseScale());
  const hitRadius = e.pointerType === 'touch' ? 40 : 20;

  if (Math.hypot(px - ctrlPt.x, py - ctrlPt.y) <= hitRadius) {
    dragging = true;
  } else if (segmentMode !== 'off') {
    pointerDownData = { px, py, pointerType: e.pointerType };
  }
});

window.addEventListener('pointermove', e => {
  if (dragging) {
    updateFromPointer(e);
  } else if (pointerDownData) {
    const rect = canvas.getBoundingClientRect();
    const dx   = e.clientX - rect.left - pointerDownData.px;
    const dy   = e.clientY - rect.top  - pointerDownData.py;
    if (Math.hypot(dx, dy) > 8) pointerDownData = null;
  }
});

window.addEventListener('pointerup', () => {
  dragging = false;
  if (pointerDownData) handleCanvasClick(pointerDownData.px, pointerDownData.py, pointerDownData.pointerType);
  pointerDownData = null;
});

window.addEventListener('pointercancel', () => {
  dragging        = false;
  pointerDownData = null;
});

// ─── Canvas click → vertex selection ─────────────────────────────────────────

function handleCanvasClick(px, py, pointerType) {
  const display           = getDisplayScale();
  const { vecs, heights } = getProjectionState();
  const hitR = pointerType === 'touch' ? 28 : 14;

  for (const v of vertices) {
    if (!v.visible) continue;
    const { pt } = projectPoint(v.coords, vecs, heights);
    const s = toScreen(pt, display);
    if (Math.hypot(px - s.x, py - s.y) <= hitR) {
      if (selectedVertexIds.has(v.id)) {
        selectedVertexIds.delete(v.id);
      } else {
        selectedVertexIds.add(v.id);
      }
      checkSelectionComplete();
      draw();
      return;
    }
  }
}

function checkSelectionComplete() {
  if (selectedVertexIds.size < 2) return;
  const [id1, id2] = [...selectedVertexIds];
  const v1    = vertices.find(v => v.id === id1);
  const color = v1 ? v1.color : 'rgba(200,200,200,0.85)';
  snapshot();
  segments.push({ id: nextSegmentId++, vertexIds: [id1, id2], color, visible: true });
  selectedVertexIds.clear();
  if (segmentMode === 'on') segmentMode = 'off';
  updateSegmentButton();
  renderSegmentList();
}

// ─── Toggle buttons ───────────────────────────────────────────────────────────

function setActive(ids, activeId) {
  ids.forEach(id =>
    document.getElementById(id).classList.toggle('active', id === activeId)
  );
}

document.getElementById('btn-u3').addEventListener('click', () => {
  paramMode = 'u3';
  setActive(['btn-u3', 'btn-diag'], 'btn-u3');
  draw();
});

document.getElementById('btn-diag').addEventListener('click', () => {
  paramMode = 'diag';
  setActive(['btn-u3', 'btn-diag'], 'btn-diag');
  draw();
});

document.getElementById('btn-modeA').addEventListener('click', () => {
  if (displayMode === 'B') controlPt = cToZ(controlPt);
  displayMode = 'A';
  setActive(['btn-modeA', 'btn-modeB'], 'btn-modeA');
  draw();
});

document.getElementById('btn-modeB').addEventListener('click', () => {
  if (displayMode === 'A') controlPt = zToC(controlPt);
  displayMode = 'B';
  setActive(['btn-modeA', 'btn-modeB'], 'btn-modeB');
  draw();
});

// ─── Scale controls ───────────────────────────────────────────────────────────

const sliderScale = document.getElementById('slider-scale');
const inputScale  = document.getElementById('input-scale');

function applyScale(value) {
  userScale = Math.max(0.01, value);
  sliderScale.value = Math.min(Math.max(userScale, 0.25), 4);
  inputScale.value  = +userScale.toFixed(3);
  draw();
}

sliderScale.addEventListener('input',  () => applyScale(parseFloat(sliderScale.value)));
inputScale.addEventListener('change', () => {
  const v = parseFloat(inputScale.value);
  if (!isNaN(v) && v > 0) applyScale(v);
});

// ─── Vertex controls ──────────────────────────────────────────────────────────

function renderVertexList() {
  const list = document.getElementById('vertex-list');
  list.innerHTML = '';
  for (const v of vertices) {
    const entry = document.createElement('div');
    entry.className = 'vertex-entry';

    const swatch = document.createElement('span');
    swatch.className = 'v-swatch';
    swatch.style.background = v.color;

    const name = document.createElement('span');
    name.className = 'v-name';
    name.textContent = v.name;

    const coords = document.createElement('span');
    coords.className = 'v-coords';
    coords.textContent = v.coords.map(x => +x.toFixed(2)).join(', ');

    const labelToggle = document.createElement('button');
    labelToggle.className = 'v-toggle';
    labelToggle.textContent = 'A';
    labelToggle.title = v.showLabel ? 'Hide label' : 'Show label';
    labelToggle.style.opacity = v.showLabel ? '1' : '0.3';
    labelToggle.addEventListener('click', () => {
      snapshot();
      v.showLabel = !v.showLabel;
      renderVertexList();
      draw();
    });

    const toggle = document.createElement('button');
    toggle.className = 'v-toggle';
    toggle.textContent = v.visible ? '●' : '○';
    toggle.title = v.visible ? 'Hide' : 'Show';
    toggle.addEventListener('click', () => {
      snapshot();
      v.visible = !v.visible;
      renderVertexList();
      draw();
    });

    const del = document.createElement('button');
    del.className = 'v-delete';
    del.textContent = '×';
    del.title = 'Delete';
    del.addEventListener('click', () => {
      snapshot();
      segments = segments.filter(s => !s.vertexIds.includes(v.id));
      vertices = vertices.filter(u => u.id !== v.id);
      selectedVertexIds.delete(v.id);
      renderVertexList();
      renderSegmentList();
      draw();
    });

    entry.append(swatch, name, coords, labelToggle, toggle, del);
    list.appendChild(entry);
  }
}

function addVertexFromInputs() {
  const nameInput = document.getElementById('v-name');
  const name  = nameInput.value.trim() || `P${nextVertexId}`;
  const a1    = parseFloat(document.getElementById('v-a1').value) || 0;
  const a2    = parseFloat(document.getElementById('v-a2').value) || 0;
  const a3    = parseFloat(document.getElementById('v-a3').value) || 0;
  const color = document.getElementById('v-color').value;
  snapshot();
  vertices.push({ id: nextVertexId++, name, coords: [a1, a2, a3], color, visible: true, showLabel: true });
  nameInput.value = '';
  renderVertexList();
  draw();
}

document.getElementById('btn-add-vertex').addEventListener('click', addVertexFromInputs);

['v-name', 'v-a1', 'v-a2', 'v-a3'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') addVertexFromInputs();
  });
});

// ─── Segment controls ─────────────────────────────────────────────────────────

function updateSegmentButton() {
  const btn = document.getElementById('btn-segment');
  btn.classList.toggle('active',      segmentMode === 'on');
  btn.classList.toggle('active-loop', segmentMode === 'on++');
  btn.textContent = segmentMode === 'on++' ? 'segment +' : 'segment';
}

function renderSegmentList() {
  const list = document.getElementById('segment-list');
  list.innerHTML = '';
  for (const seg of segments) {
    const v1 = vertices.find(v => v.id === seg.vertexIds[0]);
    const v2 = vertices.find(v => v.id === seg.vertexIds[1]);

    const entry = document.createElement('div');
    entry.className = 'segment-entry';

    const swatch = document.createElement('span');
    swatch.className = 's-swatch';
    swatch.style.background = seg.color;

    const label = document.createElement('span');
    label.className = 's-name';
    label.textContent = `${v1?.name ?? '?'} – ${v2?.name ?? '?'}`;

    const toggle = document.createElement('button');
    toggle.className = 'v-toggle';
    toggle.textContent = seg.visible ? '●' : '○';
    toggle.title = seg.visible ? 'Hide' : 'Show';
    toggle.addEventListener('click', () => {
      snapshot();
      seg.visible = !seg.visible;
      renderSegmentList();
      draw();
    });

    const del = document.createElement('button');
    del.className = 'v-delete';
    del.textContent = '×';
    del.title = 'Delete';
    del.addEventListener('click', () => {
      snapshot();
      segments = segments.filter(s => s.id !== seg.id);
      renderSegmentList();
      draw();
    });

    entry.append(swatch, label, toggle, del);
    list.appendChild(entry);
  }
}

document.getElementById('btn-segment').addEventListener('click', () => {
  if      (segmentMode === 'off')  segmentMode = 'on';
  else if (segmentMode === 'on')   segmentMode = 'on++';
  else                             segmentMode = 'off';
  if (segmentMode === 'off') selectedVertexIds.clear();
  updateSegmentButton();
  draw();
});

// ─── Undo / redo controls ─────────────────────────────────────────────────────

document.getElementById('btn-undo').addEventListener('click', undo);
document.getElementById('btn-redo').addEventListener('click', redo);

window.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    if (e.key === 'z' &&  e.shiftKey) { e.preventDefault(); redo(); }
    if (e.key === 'y')                { e.preventDefault(); redo(); }
  }
});

// ─── Init ─────────────────────────────────────────────────────────────────────

updateUndoButtons();
resize();
