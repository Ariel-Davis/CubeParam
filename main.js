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
    new C(1, 0).sub(z2).scale(0.5),                   // (1 − z²) / 2
    new C(0, 1).mul(z2.add(new C(1, 0))).scale(0.5),  // i(z² + 1) / 2
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

// Scale vectors so s = 1  (unit-cube normalization for Mode B)
// Closed-form norms: s = (1+|z₀|²)/√12  (diagonal), s = (1+|z₀|²)/2  (u₃)
// z₀ is the mathematical parameter after the c→z map, not the control point c.
function normalizeToUnit(vecs, z) {
  const r2 = z.re * z.re + z.im * z.im;
  const s  = paramMode === 'diag' ? (1 + r2) / SQRT12 : (1 + r2) / 2;
  return s < 1e-10 ? vecs : vecs.map(u => u.scale(1 / s));
}

// ─── Application state ────────────────────────────────────────────────────────

let paramMode   = 'u3';           // 'u3' | 'diag'
let displayMode = 'A';            // 'A' (free z) | 'B' (disk c)
let controlPt   = new C(0.5, 0.3);
let dragging    = false;
let userScale   = 1.0;

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

// Base scale: governs control point position and disk boundary. Unaffected by userScale.
function getBaseScale() {
  return displayMode === 'A'
    ? 150
    : Math.min(canvas.width, canvas.height) * 0.30;
}

// Display scale: governs wireframe size. Affected by userScale.
function getDisplayScale() {
  return getBaseScale() * userScale;
}

// Complex → canvas pixel  (note: canvas y-axis points down, math y-axis points up)
function toScreen(c, scale) {
  return { x: cx() + c.re * scale, y: cy() - c.im * scale };
}

// Canvas pixel → complex
function fromScreen(px, py, scale) {
  return new C((px - cx()) / scale, -(py - cy()) / scale);
}

// ─── Compute current projection vectors ───────────────────────────────────────

function getVectors() {
  const z = (displayMode === 'B') ? cToZ(controlPt) : controlPt;
  let vecs = (paramMode === 'u3') ? paramU3(z) : paramDiag(z);
  if (displayMode === 'B') vecs = normalizeToUnit(vecs, z);
  return vecs;
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
  // The 8 vertices of the parallelepiped are all subset-sums Σ_{k∈S} uₖ
  const vx = [];
  for (let mask = 0; mask < 8; mask++) {
    let v = new C(0, 0);
    for (let k = 0; k < 3; k++) {
      if (mask & (1 << k)) v = v.add(vecs[k]);
    }
    vx.push(toScreen(v, scale));
  }

  // 12 edges: pairs of vertices whose bitmasks differ by exactly one bit
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

  // Vertices
  ctx.fillStyle = 'rgba(130, 215, 255, 0.80)';
  for (const v of vx) {
    ctx.beginPath();
    ctx.arc(v.x, v.y, 3, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.restore();
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
  const base    = getBaseScale();
  const display = getDisplayScale();
  if (displayMode === 'B') drawDiskBoundary(base);
  drawWireframe(getVectors(), display);
  drawControlPoint(base);
}

// ─── Pointer interaction ──────────────────────────────────────────────────────

function updateFromPointer(e) {
  const rect = canvas.getBoundingClientRect();
  let pt = fromScreen(e.clientX - rect.left, e.clientY - rect.top, getBaseScale());

  if (displayMode === 'B') {
    const r = pt.abs();
    if (r >= 1) pt = pt.scale(0.999 / r);  // keep c strictly inside the open disk
  }

  controlPt = pt;
  draw();
}

canvas.addEventListener('pointerdown', e => {
  if (e.target !== canvas) return;
  const rect     = canvas.getBoundingClientRect();
  const px       = e.clientX - rect.left;
  const py       = e.clientY - rect.top;
  const pt       = toScreen(controlPt, getBaseScale());
  const hitRadius = e.pointerType === 'touch' ? 40 : 20;
  if (Math.hypot(px - pt.x, py - pt.y) <= hitRadius) {
    dragging = true;
  }
});

window.addEventListener('pointermove',   e => { if (dragging) updateFromPointer(e); });
window.addEventListener('pointerup',     ()  => { dragging = false; });
window.addEventListener('pointercancel', ()  => { dragging = false; });

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
  if (displayMode === 'B') controlPt = cToZ(controlPt);  // convert c → z on switch
  displayMode = 'A';
  setActive(['btn-modeA', 'btn-modeB'], 'btn-modeA');
  draw();
});

document.getElementById('btn-modeB').addEventListener('click', () => {
  if (displayMode === 'A') controlPt = zToC(controlPt);  // convert z → c on switch
  displayMode = 'B';
  setActive(['btn-modeA', 'btn-modeB'], 'btn-modeB');
  draw();
});

// ─── Scale controls ───────────────────────────────────────────────────────────

const sliderScale = document.getElementById('slider-scale');
const inputScale  = document.getElementById('input-scale');

function applyScale(value) {
  userScale = Math.max(0.01, value);
  sliderScale.value = Math.min(Math.max(userScale, 0.25), 4);  // clamp slider to its range
  inputScale.value  = +userScale.toFixed(3);
  draw();
}

sliderScale.addEventListener('input', () => applyScale(parseFloat(sliderScale.value)));

inputScale.addEventListener('change', () => {
  const v = parseFloat(inputScale.value);
  if (!isNaN(v) && v > 0) applyScale(v);
});

// ─── Init ─────────────────────────────────────────────────────────────────────

resize();
