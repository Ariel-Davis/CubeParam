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
  const r2    = z.re * z.re + z.im * z.im;
  const s     = paramMode === 'diag' ? (1 + r2) / SQRT12 : (1 + r2) / 2;
  if (displayMode === 'B' && s > 1e-10) {
    vecs    = vecs.map(u => u.scale(1 / s));
    heights = heights.map(h => h / s);
  }
  return { vecs, heights, s };
}

// ─── Application state ────────────────────────────────────────────────────────

let paramMode   = 'u3';
let displayMode = 'B';
let controlPt   = new C(0.5, 0.3);
let dragging    = false;
let userScale      = 1.0;
let showAxes       = false;
let perspectiveOn  = false;
let perspectiveP   = 0;      // p = 1/F ∈ [0, 1]; 0 = orthographic, 1 = F at distance 1
let clipBehind     = true;   // skip vertices/segments beyond the focal plane
let perspScaleNodes = false; // scale vertex radius by perspective depth factor
let perspScaleSegs  = false; // taper segment width by perspective depth factor
let darkMode        = false;

// ─── Constants and expression state ───────────────────────────────────────────

let constants      = [];   // [{ id, name, expr, value }]
let nextConstantId = 0;
let omegaMode      = 'off';  // 'off' | 'on' | 'on++'
let activeExprInput    = null;   // the coord input currently focused in edit mode
let _pendingScrollToEdit = false; // trigger scroll-to-edit-entry on next renderVertexList
let _rejectedVertexId = null;    // vertex whose last rename was rejected; shows red in list
let _errorNameEl      = null;    // name input/span currently highlighted red

// ─── Object system state ──────────────────────────────────────────────────────

let vertices         = [];
let nextVertexId     = 0;
let segments         = [];
let nextSegmentId    = 0;
let selectedVertexIds = new Set();
let segmentMode       = 'off';     // 'off' | 'on' | 'on++'
let focusedVertexId   = null;      // vertex id highlighted in the list (canvas click)
let selectedSegmentId = null;      // segment id highlighted in the list (canvas click)
let editingVertexId        = null;  // id of vertex currently in edit mode, or null
let editingOriginal        = null;  // captureState() snapshot taken on vertex edit entry
let editingSegmentId       = null;  // id of segment currently in edit mode, or null
let editingSegmentOriginal = null;  // captureState() snapshot taken on segment edit entry

// ─── Code submenu state ────────────────────────────────────────────────────────

let codeOpen         = false;  // true while the Code submenu is open
let codeLineRecords  = [];     // last parseCodeText() result, one entry per textarea line
let previewOverride  = null;   // { vertices, segments } staged preview while editing, or null

// The "set" cluster shown at the top of VERTICES/SEGMENTS on a fresh Load —
// updated on every Save so the last-saved governing values are what greets
// you next time you open the code file, rather than resetting to the
// built-in defaults. Deliberately outside the undo/redo system (like
// darkMode/userScale) — it's a UI convenience for what new code should
// default to, not part of the object model itself.
let lastSetVertex  = { color: undefined, r: undefined, visible: undefined, label: undefined };
let lastSetSegment = { color: undefined, width: undefined, visible: undefined };

// Reparsing/validation is gated on "leaving a line after changing it" (not on
// every keystroke) — these track the line the caret was in and its text as of
// entering it, so a move to a different line can tell whether anything changed.
let codeCurrentLineIdx      = 0;
let codeCurrentLineSnapshot = '';

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
    vertices:          vertices.map(v => ({ ...v, coords: [...v.coords], exprs: [...(v.exprs ?? ['','',''])] })),
    segments:          segments.map(s => ({ ...s, vertexIds: [...s.vertexIds] })),
    selectedVertexIds: new Set(selectedVertexIds),
    constants:         constants.map(c => ({ ...c })),
  };
}

function snapshot() {
  undoStack.push(captureState());
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack = [];
  updateUndoButtons();
}

function restoreState(state) {
  vertices               = state.vertices;
  segments               = state.segments;
  selectedVertexIds      = state.selectedVertexIds;
  constants              = state.constants ?? [];
  editingVertexId        = null;
  editingOriginal        = null;
  editingSegmentId       = null;
  editingSegmentOriginal = null;
  focusedVertexId        = null;
  selectedSegmentId      = null;
  activeExprInput        = null;
  reEvalObjects();
  renderConstList();
  renderVertexList();
  renderSegmentList();
  draw();
}

function isEditingBlocked() {
  return editingVertexId !== null || editingSegmentId !== null || codeOpen;
}

function undo() {
  if (isEditingBlocked()) return;
  if (undoStack.length === 0) return;
  redoStack.push(captureState());
  restoreState(undoStack.pop());
  updateUndoButtons();
}

function redo() {
  if (isEditingBlocked()) return;
  if (redoStack.length === 0) return;
  undoStack.push(captureState());
  restoreState(redoStack.pop());
  updateUndoButtons();
}

function updateUndoButtons() {
  const inEdit = isEditingBlocked();
  document.getElementById('btn-undo').disabled       = inEdit || undoStack.length === 0;
  document.getElementById('btn-redo').disabled       = inEdit || redoStack.length === 0;
  document.getElementById('btn-add-vertex').disabled = inEdit;
  document.getElementById('btn-segment').disabled    = inEdit;
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

// ─── Expression parser ────────────────────────────────────────────────────────
//
// Evaluates a math expression string in an environment of named constants.
// Supports: numbers, +  -  *  /  ^, unary minus, parentheses,
//           \pi  \e  \sin(x)  \cos(x)  \tan(x)  \sqrt(x)  \abs(x),
//           and any user-defined constant name (identifier).
// Returns NaN on parse error or domain error (div-by-zero, sqrt of negative).

function evalExpr(src, env) {
  let pos = 0;
  const s = (src ?? '').trim();

  function skipWS() { while (pos < s.length && /\s/.test(s[pos])) pos++; }
  function peek()   { return s[pos]; }

  function parseExpr()    { return parseAddSub(); }

  function parseAddSub() {
    let v = parseMulDiv(); skipWS();
    while (pos < s.length && (peek() === '+' || peek() === '-')) {
      const op = s[pos++]; skipWS();
      const r  = parseMulDiv();
      v = op === '+' ? v + r : v - r;
      skipWS();
    }
    return v;
  }

  function parseMulDiv() {
    let v = parsePow(); skipWS();
    while (pos < s.length && (peek() === '*' || peek() === '/')) {
      const op = s[pos++]; skipWS();
      const r  = parsePow();
      v = op === '*' ? v * r : (r === 0 ? NaN : v / r);
      skipWS();
    }
    return v;
  }

  function parsePow() {
    const base = parseUnary(); skipWS();
    if (pos < s.length && peek() === '^') {
      pos++; skipWS();
      return Math.pow(base, parseUnary());
    }
    return base;
  }

  function parseUnary() {
    skipWS();
    if (pos < s.length && peek() === '-') { pos++; skipWS(); return -parseAtom(); }
    if (pos < s.length && peek() === '+') { pos++; skipWS(); return  parseAtom(); }
    return parseAtom();
  }

  function applyFunc(fn) {
    skipWS();
    if (peek() !== '(') return NaN;
    pos++;
    const arg = parseExpr();
    skipWS();
    if (pos < s.length && peek() === ')') pos++;
    return fn(arg);
  }

  function parseAtom() {
    skipWS();
    if (pos >= s.length) return NaN;

    // Parenthesised sub-expression
    if (peek() === '(') {
      pos++;
      const v = parseExpr();
      skipWS();
      if (pos < s.length && peek() === ')') pos++;
      return v;
    }

    // Number literal (with optional scientific notation)
    if (/[\d.]/.test(peek())) {
      const m = /^\d*\.?\d+([eE][+\-]?\d+)?/.exec(s.slice(pos));
      if (m) { pos += m[0].length; return parseFloat(m[0]); }
      return NaN;
    }

    // Backslash token: \pi, \e, \sin, \cos, \tan, \sqrt, \abs
    if (peek() === '\\') {
      pos++;
      let name = '';
      while (pos < s.length && /[a-zA-Z]/.test(s[pos])) name += s[pos++];
      switch (name) {
        case 'pi':   return Math.PI;
        case 'e':    return Math.E;
        case 'sin':  return applyFunc(Math.sin);
        case 'cos':  return applyFunc(Math.cos);
        case 'tan':  return applyFunc(Math.tan);
        case 'sqrt': return applyFunc(x => x < 0 ? NaN : Math.sqrt(x));
        case 'abs':  return applyFunc(Math.abs);
        default:     return NaN;
      }
    }

    // Identifier: user constant name
    if (/[a-zA-Z_]/.test(peek())) {
      let name = '';
      while (pos < s.length && /[a-zA-Z0-9_]/.test(s[pos])) name += s[pos++];
      return (name in env) ? env[name] : NaN;
    }

    return NaN;
  }

  try {
    const result = parseExpr();
    skipWS();
    return pos < s.length ? NaN : result;  // leftover chars = parse error
  } catch (_) {
    return NaN;
  }
}

// A settable field's raw text (typed literally, or a reference to a
// constant, or — for numeric fields — any expression) is resolved against
// the environment built by buildEnvs(). Referenced by the code-file parser
// (validating a line the moment it's reached) and by reEvalObjects() below
// (re-resolving everything whenever `constants` changes) — one source of
// truth for "what does this expression mean," mirroring evalExpr's role as
// the sole numeric resolver.
function resolveColorAttr(exprText, colorEnv) {
  if (CODE_COLOR_RE.test(exprText)) return { ok: true, value: exprText };
  if (CODE_IDENT_RE.test(exprText) && exprText in colorEnv) return { ok: true, value: colorEnv[exprText] };
  return { ok: false };
}
function resolveNumAttr(exprText, numericEnv) {
  const v = evalExpr(exprText, numericEnv);
  return isNaN(v) ? { ok: false } : { ok: true, value: v };
}
function resolveBoolAttr(exprText, boolEnv) {
  if (exprText === 'true')  return { ok: true, value: true };
  if (exprText === 'false') return { ok: true, value: false };
  if (CODE_IDENT_RE.test(exprText) && exprText in boolEnv) return { ok: true, value: boolEnv[exprText] };
  return { ok: false };
}

// Builds all three constant environments in one order-dependent left-to-
// right pass (a constant can only reference an earlier constant of the same
// kind) — kind is inferred from the expression's shape: `#rrggbb` is always
// a color, `true`/`false` is always boolean, everything else is numeric.
// `#rrggbb` can never collide with an identifier (CODE_IDENT_RE requires a
// leading letter/underscore); `true`/`false` are handled as a reserved-name
// exception at the constant-name-validation sites instead (see NOTES2.md).
function buildEnvs() {
  const numericEnv = {}, colorEnv = {}, boolEnv = {};
  for (const c of constants) {
    const rest = c.expr.trim();
    const asColor = resolveColorAttr(rest, colorEnv);
    const asBool  = resolveBoolAttr(rest, boolEnv);
    if (CODE_COLOR_RE.test(rest) || (asColor.ok && CODE_IDENT_RE.test(rest))) {
      c.kind = 'color'; c.value = asColor.value; colorEnv[c.name] = c.value;
    } else if (rest === 'true' || rest === 'false' || (asBool.ok && CODE_IDENT_RE.test(rest))) {
      c.kind = 'boolean'; c.value = asBool.value; boolEnv[c.name] = c.value;
    } else {
      c.kind = 'number';
      c.value = evalExpr(rest, numericEnv);
      if (!isNaN(c.value)) numericEnv[c.name] = c.value;
    }
  }
  return { numericEnv, colorEnv, boolEnv };
}

// Re-resolves every expression-backed field (coordinates plus color/radius/
// visible/label on vertices, color/width/visible on segments) whenever
// `constants` changes — the mechanism that makes editing a constant bulk-
// update everything referencing it, persistently, across Saves.
function reEvalObjects() {
  const { numericEnv, colorEnv, boolEnv } = buildEnvs();
  for (const v of vertices) {
    for (let i = 0; i < 3; i++) {
      const expr = v.exprs?.[i];
      if (expr) v.coords[i] = evalExpr(expr, numericEnv);
    }
    if (v.colorExpr)   { const r = resolveColorAttr(v.colorExpr, colorEnv);  if (r.ok) v.color     = r.value; }
    if (v.radiusExpr)  { const r = resolveNumAttr(v.radiusExpr, numericEnv); if (r.ok) v.radius    = r.value; }
    if (v.visibleExpr) { const r = resolveBoolAttr(v.visibleExpr, boolEnv);  if (r.ok) v.visible   = r.value; }
    if (v.labelExpr)   { const r = resolveBoolAttr(v.labelExpr, boolEnv);    if (r.ok) v.showLabel = r.value; }
  }
  for (const s of segments) {
    if (s.colorExpr)   { const r = resolveColorAttr(s.colorExpr, colorEnv);  if (r.ok) s.color     = r.value; }
    if (s.widthExpr)   { const r = resolveNumAttr(s.widthExpr, numericEnv);  if (r.ok) s.lineWidth = r.value; }
    if (s.visibleExpr) { const r = resolveBoolAttr(s.visibleExpr, boolEnv);  if (r.ok) s.visible   = r.value; }
  }
}

function renameInExpr(expr, oldName, newName) {
  const esc = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return expr.replace(new RegExp('(?<!\\\\)\\b' + esc + '\\b', 'g'), newName);
}

function renameConstantEverywhere(oldName, newName) {
  for (const c of constants)
    c.expr = renameInExpr(c.expr, oldName, newName);
  for (const v of vertices) {
    if (v.exprs) v.exprs = v.exprs.map(e => renameInExpr(e, oldName, newName));
    for (const f of ['colorExpr', 'radiusExpr', 'visibleExpr', 'labelExpr'])
      if (v[f]) v[f] = renameInExpr(v[f], oldName, newName);
  }
  for (const s of segments) {
    for (const f of ['colorExpr', 'widthExpr', 'visibleExpr'])
      if (s[f]) s[f] = renameInExpr(s[f], oldName, newName);
  }
}

function isNameTakenIn(name, vertexList, constList, excludeVertexId = null, excludeConstId = null) {
  return vertexList.some(v => v.name === name && v.id !== excludeVertexId)
      || constList.some(c => c.name === name && c.id !== excludeConstId);
}

function isNameTaken(name, excludeVertexId = null, excludeConstId = null) {
  return isNameTakenIn(name, vertices, constants, excludeVertexId, excludeConstId);
}

function setNameError(el) {
  if (_errorNameEl && _errorNameEl !== el) _errorNameEl.classList.remove('expr-invalid');
  _errorNameEl = el;
  if (el) el.classList.add('expr-invalid');
}

function clearNameError() {
  if (_errorNameEl) { _errorNameEl.classList.remove('expr-invalid'); _errorNameEl = null; }
  _rejectedVertexId = null;
}

function mobileTextInput(inp) {
  inp.setAttribute('autocapitalize', 'none');
  inp.setAttribute('autocorrect',    'off');
  inp.spellcheck = false;
}

function insertAtCursor(input, text, offset) {
  const start  = input.selectionStart;
  const end    = input.selectionEnd;
  input.value  = input.value.slice(0, start) + text + input.value.slice(end);
  const newPos = start + text.length - offset;
  input.setSelectionRange(newPos, newPos);
  input.dispatchEvent(new Event('input'));
}

const DEFAULT_COLOR = '#4d4d4d';  // 30% grey, used for new vertices and segments

// ─── Code submenu: parser & serializer ─────────────────────────────────────────
//
// Canonical text format (see NOTES2.md for the full spec). Two literal
// backslashes open a section header — '=' bars for the two auxiliary
// (non-drawn) sections, '-' bars for the three display (drawn) sections:
//   \\======== CONSTANTS ========
//   \\======== FUNCTIONS ========
//   \\-------- VERTICES --------
//   \\-------- SEGMENTS --------
//   \\-------- CURVES --------
//   \\----------------------------------------     (divider — no name)
// Below the divider is the scratch area: a place to type new objects of any
// kind without caring which section they belong in. Sort always relocates
// every *valid* recognized object out of the scratch area into its home
// section, leaving only invalid/unrecognized text behind there.
//
// Object lines: "keyword name?: rest". const/vertex/segment are supported;
// function/slider/curve are recognized but rejected (Phase 1 — no evaluator
// support for them yet, but their sections still exist so the file format
// doesn't need to change again once they are). Everything else is
// 'unrecognized'.
//
// parseCodeText() is a pure function: it only reads its `text` argument and
// calls evalExpr()/isNameTakenIn(), so it can build a fully independent staged
// object set without touching the live vertices/constants/segments arrays.

const SECTION_DEFS = [
  { key: 'constants', title: 'CONSTANTS', style: 'eq',   match: /CONSTANT/i },
  { key: 'functions', title: 'FUNCTIONS', style: 'eq',   match: /FUNCTION/i },
  { key: 'vertices',  title: 'VERTICES',  style: 'dash', match: /VERT/i },
  { key: 'segments',  title: 'SEGMENTS',  style: 'dash', match: /SEGMENT/i },
  { key: 'curves',    title: 'CURVES',    style: 'dash', match: /CURVE/i },
];
const SECTION_ORDER = SECTION_DEFS.map(d => d.key);

const CODE_HEADER_EQ_RE   = /^\\\\=+\s*(.*?)\s*=+$/;
const CODE_HEADER_DASH_RE = /^\\\\-+\s*(.*?)\s*-+$/;
const CODE_OBJECT_RE = /^(const|vertex|segment|function|slider|curve)\b\s*([^:]*):(.*)$/;
const CODE_SET_RE    = /^set\s+(vertex|segment)\s+(.+)$/;
const CODE_IDENT_RE  = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const CODE_COLOR_RE  = /^#[0-9a-fA-F]{6}$/;

// field -> canonical syntax token name (also used by tokenizeAttrs' error text)
const FIELD_TOKEN_NAME = { color: 'color', r: 'r', width: 'w', visible: 'visible', label: 'label', x: 'x', y: 'y', z: 'z' };

function formatFieldToken(field, value) {
  return `${FIELD_TOKEN_NAME[field]}=${value}`;
}

function classifyHeaderSection(headerText) {
  const def = SECTION_DEFS.find(d => d.match.test(headerText));
  return def ? def.key : null;
}

function makeHeaderLine(style, title) {
  const bar = style === 'eq' ? '========' : '--------';
  return `\\\\${bar} ${title} ${bar}`;
}

function makeDividerLine() {
  return '\\\\----------------------------------------';
}

// Pushes one canonical section: header, exactly one blank line, then each
// non-empty content block (e.g. a "set" cluster, then the object list),
// each followed by exactly one blank line — an empty section is just its
// header followed by a single blank line, and an empty block contributes
// nothing (no double blank between two adjacent blocks, one empty one not).
function emitSection(outLines, style, title, ...blocks) {
  outLines.push(makeHeaderLine(style, title));
  outLines.push('');
  for (const block of blocks) {
    if (!block || block.length === 0) continue;
    for (const l of block) outLines.push(l);
    outLines.push('');
  }
}

// Which fields are settable per type, in the fixed order they're written in
// a "set" cluster, and the ultimate built-in fallback for a field that was
// never set anywhere in the file.
const SET_FIELD_ORDER = {
  vertex:  ['color', 'r', 'visible', 'label'],
  segment: ['color', 'width', 'visible'],
};
// Text-typed (not number/boolean) for consistency — every field is raw expr
// text everywhere else now, so these fall-back defaults are too.
const BUILTIN_SET_DEFAULTS = {
  vertex:  { color: DEFAULT_COLOR, r: '5', visible: 'true', label: 'true' },
  segment: { color: DEFAULT_COLOR, width: '1.5', visible: 'true' },
};

// Builds the consolidated "set" cluster for one type from the *final* state
// of a whole-file order-dependent walk (parseCodeText's returned `finalSet`)
// — always fully populated (every field, defaulted if never set) so the
// cluster is a complete, self-documenting summary of what currently governs
// new objects of that type, regardless of how many scattered `set` lines
// (if any) contributed to it.
function buildSetBlock(type, finalValues) {
  return SET_FIELD_ORDER[type].map(field => {
    const value = finalValues[field] ?? BUILTIN_SET_DEFAULTS[type][field];
    return `set ${type} ${formatFieldToken(field, value)}`;
  });
}

// Splits the text after a colon into positional tokens and recognized
// attribute tokens (classified by shape, not position). `allowedAttrs` is
// the subset of {color, r, width, visible, label, x, y, z} legal for this
// line kind. Bare `#rrggbb` is still accepted (lenient read of the older
// syntax) alongside the canonical `color=#rrggbb`.
// Every attribute field captures its RAW TEXT here (a literal, or a
// constant-reference identifier, or — for numeric fields — any expression);
// validating/resolving it against the current environments is the caller's
// job (parseCodeText's object/set branches), since only the caller knows
// what's in scope at this point in the order-dependent walk.
function tokenizeAttrs(rest, allowedAttrs) {
  const tokens = rest.split(/\s+/).filter(t => t.length > 0);
  const positional = [];
  const attrs = {};
  for (const tok of tokens) {
    if (CODE_COLOR_RE.test(tok)) {
      if (!allowedAttrs.includes('color')) return { error: `'${tok}' not valid here` };
      attrs.color = tok;
    } else if (/^color=/.test(tok)) {
      if (!allowedAttrs.includes('color')) return { error: `'color=' not valid here` };
      attrs.color = tok.slice(6);
    } else if (/^x=/.test(tok)) {
      if (!allowedAttrs.includes('x')) return { error: `'x=' not valid here` };
      attrs.x = tok.slice(2);
    } else if (/^y=/.test(tok)) {
      if (!allowedAttrs.includes('y')) return { error: `'y=' not valid here` };
      attrs.y = tok.slice(2);
    } else if (/^z=/.test(tok)) {
      if (!allowedAttrs.includes('z')) return { error: `'z=' not valid here` };
      attrs.z = tok.slice(2);
    } else if (/^r=/.test(tok)) {
      if (!allowedAttrs.includes('r')) return { error: `'r=' not valid here` };
      attrs.r = tok.slice(2);
    } else if (/^w=/.test(tok)) {
      if (!allowedAttrs.includes('width')) return { error: `'w=' not valid here` };
      attrs.width = tok.slice(2);
    } else if (/^visible=/.test(tok)) {
      if (!allowedAttrs.includes('visible')) return { error: `'visible=' not valid here` };
      attrs.visible = tok.slice(8);
    } else if (/^label=/.test(tok)) {
      if (!allowedAttrs.includes('label')) return { error: `'label=' not valid here` };
      attrs.label = tok.slice(6);
    } else {
      positional.push(tok);
    }
  }
  return { positional, attrs };
}

function parseCodeText(text) {
  const lines           = [];
  const stagedConstants = [];
  const stagedVertices  = [];
  const stagedSegments  = [];
  // Three environments, built incrementally in the same left-to-right walk
  // as everything else — a const can only reference an earlier const of the
  // same kind, exactly like the pre-existing numeric-only rule.
  const numericEnv       = {};
  const colorEnv         = {};
  const boolEnv          = {};
  const vertexByName    = new Map(); // name -> staged vertex, built incrementally
  let autoVertexN = 0;
  let autoConstN  = 0;

  // Order-dependent "current set" state, like a paintbrush: a `set vertex
  // color=...` line updates this and every later vertex line that omits
  // that field picks it up, until the next `set` for that field (or file
  // end). Resolved once here at parse time into a concrete value on the
  // staged/committed object — never stored as a lazily-resolved reference —
  // so relocating a line later (Sort) can never change what it resolved to.
  const currentSet = {
    vertex:  { color: undefined, r: undefined, visible: undefined, label: undefined },
    segment: { color: undefined, width: undefined, visible: undefined },
  };

  for (const raw of text.split('\n')) {
    const trimmed = raw.trim();
    const rec = { raw, kind: 'blank', targetSection: null, headerSection: null, valid: true, errorMsg: null, parsed: null };

    if (trimmed === '') { lines.push(rec); continue; }

    const eqMatch   = trimmed.match(CODE_HEADER_EQ_RE);
    const dashMatch = !eqMatch ? trimmed.match(CODE_HEADER_DASH_RE) : null;
    if (eqMatch || dashMatch) {
      const captured = (eqMatch ? eqMatch[1] : dashMatch[1]).trim();
      if (captured === '') {
        rec.kind = 'divider';
      } else {
        rec.kind = 'header';
        rec.headerSection = classifyHeaderSection(captured);
      }
      lines.push(rec);
      continue;
    }

    const setMatch = trimmed.match(CODE_SET_RE);
    if (setMatch) {
      const [, setType, fieldTok] = setMatch;
      rec.kind = 'set';
      // targetSection stays null deliberately: a `set` line's effect is
      // entirely positional (which object lines follow it), unlike const/
      // vertex/segment lines whose meaning doesn't depend on where within
      // their section they sit — so Sort must never relocate it.
      const allowed = setType === 'vertex' ? ['color', 'r', 'visible', 'label'] : ['color', 'width', 'visible'];
      const tok = tokenizeAttrs(fieldTok.trim(), allowed);
      const attrKeys = tok.error ? [] : Object.keys(tok.attrs);
      if (tok.error || tok.positional.length > 0 || attrKeys.length !== 1) {
        rec.valid = false;
        rec.errorMsg = tok.error || 'expected exactly one field=value';
        lines.push(rec);
        continue;
      }
      const field = attrKeys[0];
      const rawText = tok.attrs[field];
      // Validate now (catches a typo/unknown-constant immediately, before
      // Sort ever runs) but store the RAW TEXT, not the resolved value —
      // that's what an inheriting vertex/segment line picks up as its own
      // *Expr, which is what makes it stay live-linked to a referenced
      // constant rather than getting baked to a snapshot value.
      const resolveResult =
        field === 'color' ? resolveColorAttr(rawText, colorEnv) :
        (field === 'r' || field === 'width') ? resolveNumAttr(rawText, numericEnv) :
        resolveBoolAttr(rawText, boolEnv);
      if (!resolveResult.ok) {
        rec.valid = false;
        rec.errorMsg = `invalid ${field} value '${rawText}'`;
        lines.push(rec);
        continue;
      }
      currentSet[setType][field] = rawText;
      rec.parsed = { setType, field, value: rawText };
      lines.push(rec);
      continue;
    }

    const objMatch = trimmed.match(CODE_OBJECT_RE);
    if (!objMatch) {
      rec.kind = 'unrecognized';
      rec.valid = false;
      rec.errorMsg = trimmed.includes(':')
        ? 'unknown object type (expected const/vertex/segment)'
        : "missing ':' — expected 'keyword: ...'";
      lines.push(rec);
      continue;
    }

    const [, keyword, nameRaw, restRaw] = objMatch;
    const name = nameRaw.trim();
    const rest = restRaw.trim();

    if (keyword === 'function' || keyword === 'slider' || keyword === 'curve') {
      rec.kind = 'unsupported';
      rec.valid = false;
      rec.errorMsg = `${keyword} objects are not yet supported`;
      rec.targetSection = keyword === 'function' ? 'functions' : keyword === 'curve' ? 'curves' : null;
      lines.push(rec);
      continue;
    }

    if (keyword === 'const') {
      rec.kind = 'const';
      rec.targetSection = 'constants';
      let finalName = name;
      if (finalName === '') {
        do { finalName = `k${autoConstN++}`; } while (isNameTakenIn(finalName, stagedVertices, stagedConstants));
      } else if (!CODE_IDENT_RE.test(finalName)) {
        rec.valid = false; rec.errorMsg = `invalid constant name '${finalName}'`; lines.push(rec); continue;
      } else if (finalName === 'true' || finalName === 'false') {
        rec.valid = false; rec.errorMsg = `'${finalName}' is reserved and cannot be used as a constant name`; lines.push(rec); continue;
      } else if (isNameTakenIn(finalName, stagedVertices, stagedConstants)) {
        rec.valid = false; rec.errorMsg = `name '${finalName}' already used`; lines.push(rec); continue;
      }

      // Kind is inferred from rest's shape: #rrggbb -> color, true/false ->
      // boolean, an identifier already known in colorEnv/boolEnv -> aliases
      // that kind, otherwise numeric (existing behavior, unchanged).
      let kind, value;
      const asColor = resolveColorAttr(rest, colorEnv);
      const asBool  = resolveBoolAttr(rest, boolEnv);
      if (CODE_COLOR_RE.test(rest) || (asColor.ok && CODE_IDENT_RE.test(rest))) {
        kind = 'color'; value = asColor.value;
      } else if (rest === 'true' || rest === 'false' || (asBool.ok && CODE_IDENT_RE.test(rest))) {
        kind = 'boolean'; value = asBool.value;
      } else {
        kind = 'number';
        value = evalExpr(rest, numericEnv);
        if (isNaN(value)) {
          rec.valid = false; rec.errorMsg = 'invalid expression'; lines.push(rec); continue;
        }
      }
      const obj = { name: finalName, expr: rest, value, kind };
      if (kind === 'number') numericEnv[finalName] = value;
      else if (kind === 'color') colorEnv[finalName] = value;
      else boolEnv[finalName] = value;
      stagedConstants.push(obj);
      rec.parsed = obj;
      lines.push(rec);
      continue;
    }

    if (keyword === 'vertex') {
      rec.kind = 'vertex';
      rec.targetSection = 'vertices';
      const tok = tokenizeAttrs(rest, ['color', 'r', 'visible', 'label', 'x', 'y', 'z']);
      if (tok.error) { rec.valid = false; rec.errorMsg = tok.error; lines.push(rec); continue; }

      const namedUsed = tok.attrs.x !== undefined || tok.attrs.y !== undefined || tok.attrs.z !== undefined;
      let coordExprs;
      if (namedUsed) {
        const allThree = tok.attrs.x !== undefined && tok.attrs.y !== undefined && tok.attrs.z !== undefined;
        if (!allThree || tok.positional.length > 0) {
          rec.valid = false;
          rec.errorMsg = 'named coordinates need all of x=, y=, z= (no bare coordinates mixed in)';
          lines.push(rec); continue;
        }
        coordExprs = [tok.attrs.x, tok.attrs.y, tok.attrs.z];
      } else {
        if (tok.positional.length !== 3) {
          rec.valid = false; rec.errorMsg = `expected 3 coordinates, found ${tok.positional.length}`; lines.push(rec); continue;
        }
        coordExprs = tok.positional;
      }

      let finalName = name;
      if (finalName === '') {
        do { finalName = `P${autoVertexN++}`; } while (isNameTakenIn(finalName, stagedVertices, stagedConstants));
      } else if (!CODE_IDENT_RE.test(finalName)) {
        rec.valid = false; rec.errorMsg = `invalid vertex name '${finalName}'`; lines.push(rec); continue;
      } else if (isNameTakenIn(finalName, stagedVertices, stagedConstants)) {
        rec.valid = false; rec.errorMsg = `name '${finalName}' already used`; lines.push(rec); continue;
      }
      const coords = coordExprs.map(t => evalExpr(t, numericEnv));
      if (coords.some(isNaN)) {
        rec.valid = false; rec.errorMsg = 'invalid coordinate expression'; lines.push(rec); continue;
      }

      const colorExprText   = tok.attrs.color   ?? currentSet.vertex.color   ?? DEFAULT_COLOR;
      const radiusExprText  = tok.attrs.r       ?? currentSet.vertex.r       ?? '5';
      const visibleExprText = tok.attrs.visible ?? currentSet.vertex.visible ?? 'true';
      const labelExprText   = tok.attrs.label   ?? currentSet.vertex.label   ?? 'true';

      const colorRes = resolveColorAttr(colorExprText, colorEnv);
      if (!colorRes.ok) { rec.valid = false; rec.errorMsg = `unknown color '${colorExprText}'`; lines.push(rec); continue; }
      const radiusRes = resolveNumAttr(radiusExprText, numericEnv);
      if (!radiusRes.ok) { rec.valid = false; rec.errorMsg = `invalid radius expression '${radiusExprText}'`; lines.push(rec); continue; }
      const visibleRes = resolveBoolAttr(visibleExprText, boolEnv);
      if (!visibleRes.ok) { rec.valid = false; rec.errorMsg = `invalid visible value '${visibleExprText}'`; lines.push(rec); continue; }
      const labelRes = resolveBoolAttr(labelExprText, boolEnv);
      if (!labelRes.ok) { rec.valid = false; rec.errorMsg = `invalid label value '${labelExprText}'`; lines.push(rec); continue; }

      const obj = {
        name: finalName,
        coords,
        exprs: coordExprs.slice(),
        color: colorRes.value,     colorExpr: colorExprText,
        radius: radiusRes.value,   radiusExpr: radiusExprText,
        visible: visibleRes.value, visibleExpr: visibleExprText,
        showLabel: labelRes.value, labelExpr: labelExprText,
      };
      stagedVertices.push(obj);
      vertexByName.set(finalName, obj);
      rec.parsed = obj;
      lines.push(rec);
      continue;
    }

    // segment — per settled decision, syntax is always "segment: v1 v2" (no
    // name field on segments); a hand-typed name token is tolerated but discarded.
    rec.kind = 'segment';
    rec.targetSection = 'segments';
    const tok = tokenizeAttrs(rest, ['color', 'width', 'visible']);
    if (tok.error) { rec.valid = false; rec.errorMsg = tok.error; lines.push(rec); continue; }
    if (tok.positional.length !== 2) {
      rec.valid = false; rec.errorMsg = `expected 2 vertex names, found ${tok.positional.length}`; lines.push(rec); continue;
    }
    const v1 = vertexByName.get(tok.positional[0]);
    const v2 = vertexByName.get(tok.positional[1]);
    if (!v1 || !v2) {
      rec.valid = false; rec.errorMsg = `unknown vertex '${!v1 ? tok.positional[0] : tok.positional[1]}'`; lines.push(rec); continue;
    }
    const segColorExprText   = tok.attrs.color   ?? currentSet.segment.color   ?? DEFAULT_COLOR;
    const segWidthExprText   = tok.attrs.width   ?? currentSet.segment.width   ?? '1.5';
    const segVisibleExprText = tok.attrs.visible ?? currentSet.segment.visible ?? 'true';

    const segColorRes = resolveColorAttr(segColorExprText, colorEnv);
    if (!segColorRes.ok) { rec.valid = false; rec.errorMsg = `unknown color '${segColorExprText}'`; lines.push(rec); continue; }
    const segWidthRes = resolveNumAttr(segWidthExprText, numericEnv);
    if (!segWidthRes.ok) { rec.valid = false; rec.errorMsg = `invalid width expression '${segWidthExprText}'`; lines.push(rec); continue; }
    const segVisibleRes = resolveBoolAttr(segVisibleExprText, boolEnv);
    if (!segVisibleRes.ok) { rec.valid = false; rec.errorMsg = `invalid visible value '${segVisibleExprText}'`; lines.push(rec); continue; }

    const obj = {
      v1Name: v1.name,
      v2Name: v2.name,
      color: segColorRes.value,     colorExpr: segColorExprText,
      lineWidth: segWidthRes.value, widthExpr: segWidthExprText,
      visible: segVisibleRes.value, visibleExpr: segVisibleExprText,
    };
    stagedSegments.push(obj);
    rec.parsed = obj;
    lines.push(rec);
  }

  return { lines, stagedConstants, stagedVertices, stagedSegments, finalSet: currentSet };
}

function formatCoordExpr(v, i) {
  const expr = v.exprs?.[i];
  if (expr) return expr.replace(/\s+/g, '');
  return String(+v.coords[i].toFixed(6));
}

function formatConstLine(c) {
  return `const ${c.name}: ${c.expr}`;
}

// Every field is always written out explicitly — necessary now that a
// preceding `set` line can change what the "default" for an omitted field
// even means. A reformatted line's fields are the fully resolved values at
// the moment it was parsed, baked in as literal tokens, so relocating it
// (Sort) can never change what it resolves to on a later re-parse.
// Writes the *Expr* text (a literal or a constant reference), not the
// resolved value — this is what makes `color=red` round-trip through Sort/
// Save as `color=red` rather than getting flattened to `color=#ff0000`.
// The `?? v.color`-style fallback is defensive only, for an object somehow
// missing the new field (shouldn't happen once every creation path sets it).
function formatVertexLine(v) {
  const axisTags = ['x', 'y', 'z'].map((axis, i) => formatFieldToken(axis, formatCoordExpr(v, i))).join('  ');
  const colorExpr   = v.colorExpr   ?? v.color ?? DEFAULT_COLOR;
  const radiusExpr  = v.radiusExpr  ?? String(v.radius ?? 5);
  const visibleExpr = v.visibleExpr ?? String(v.visible !== false);
  const labelExpr   = v.labelExpr   ?? String(v.showLabel !== false);
  return `vertex ${v.name}: ${axisTags}  ${formatFieldToken('color', colorExpr)}  ${formatFieldToken('r', radiusExpr)}  ${formatFieldToken('visible', visibleExpr)}  ${formatFieldToken('label', labelExpr)}`;
}

// v1/v2 need only a `.name` — callers may pass either full vertex objects
// (serializeState) or a staged segment's {v1Name, v2Name} wrapped as {name}.
function formatSegmentLine(v1, v2, seg) {
  const colorExpr   = seg.colorExpr   ?? seg.color ?? DEFAULT_COLOR;
  const widthExpr    = seg.widthExpr   ?? String(seg.lineWidth ?? 1.5);
  const visibleExpr = seg.visibleExpr ?? String(seg.visible !== false);
  return `segment:  ${v1.name}  ${v2.name}  ${formatFieldToken('color', colorExpr)}  ${formatFieldToken('width', widthExpr)}  ${formatFieldToken('visible', visibleExpr)}`;
}

function formatSetLine(parsed) {
  return `set ${parsed.setType} ${formatFieldToken(parsed.field, parsed.value)}`;
}

// Shared by Sort's rebuild and Save's re-canonicalization: valid recognized
// lines are rewritten to their canonical (now fully explicit) form; every
// other line (blank, header, invalid, unsupported, unrecognized) keeps its
// raw text untouched — this is what keeps an unfixed error line visible
// after Save instead of disappearing (no cascade-delete).
function formatLineForOutput(rec) {
  if (!rec.valid || !rec.parsed) return rec.raw;
  if (rec.kind === 'const')   return formatConstLine(rec.parsed);
  if (rec.kind === 'vertex')  return formatVertexLine(rec.parsed);
  if (rec.kind === 'segment') return formatSegmentLine({ name: rec.parsed.v1Name }, { name: rec.parsed.v2Name }, rec.parsed);
  if (rec.kind === 'set')     return formatSetLine(rec.parsed);
  return rec.raw;
}

function serializeState(vertsArr, constsArr, segsArr) {
  const out = [];
  emitSection(out, 'eq',   'CONSTANTS', constsArr.map(formatConstLine));
  emitSection(out, 'eq',   'FUNCTIONS', []);
  // Committed vertex/segment objects carry no memory of any `set` line that
  // once governed them individually (each one's own resolved value/expr is
  // what persists, via its own color=/r=/etc.) — but the *cluster itself*
  // remembers the last-saved governing values (lastSetVertex/lastSetSegment)
  // so a fresh Load shows what you left off with, not the built-in defaults.
  emitSection(out, 'dash', 'VERTICES',  buildSetBlock('vertex', lastSetVertex), vertsArr.map(formatVertexLine));
  const segLines = segsArr.map(seg => {
    const v1 = vertsArr.find(v => v.id === seg.vertexIds[0]);
    const v2 = vertsArr.find(v => v.id === seg.vertexIds[1]);
    return (v1 && v2) ? formatSegmentLine(v1, v2, seg) : null;
  }).filter(Boolean);
  emitSection(out, 'dash', 'SEGMENTS', buildSetBlock('segment', lastSetSegment), segLines);
  emitSection(out, 'dash', 'CURVES', []);
  out.push(makeDividerLine());
  out.push('');
  return out.join('\n');
}

// Rebuilds the file from scratch: five canonical sections (each followed by
// exactly one blank line when it has content, none of the growing-gap effect
// a naive splice-in-place produces), a divider, then the scratch area. Every
// *valid* recognized const/vertex/segment always lands in its home section
// regardless of where it started (which is what empties the scratch area of
// anything usable), and gets reformatted to its fully-explicit canonical form
// in the process. Invalid/unrecognized lines never move — they stay within
// whichever section (or the scratch area) they were structurally sitting in,
// raw text untouched. `set` lines are also never moved (their effect is
// purely positional — which object lines follow them — so relocating one
// would silently change what it governs) but are still reformatted in place.
function sortCodeText(text) {
  const { lines, finalSet } = parseCodeText(text);

  const headerIdx = {};
  let dividerIdx = -1;
  lines.forEach((rec, i) => {
    if (rec.kind === 'header' && rec.headerSection && !(rec.headerSection in headerIdx)) {
      headerIdx[rec.headerSection] = i;
    }
    if (rec.kind === 'divider' && dividerIdx === -1) dividerIdx = i;
  });

  const markers = SECTION_ORDER
    .map(key => ({ key, idx: headerIdx[key] ?? -1 }))
    .concat([{ key: '__divider__', idx: dividerIdx }])
    .filter(m => m.idx !== -1)
    .sort((a, b) => a.idx - b.idx);

  const ranges = {};
  markers.forEach((m, i) => {
    if (m.key === '__divider__') return;
    const start = m.idx + 1;
    const end   = i + 1 < markers.length ? markers[i + 1].idx : lines.length;
    ranges[m.key] = [start, end];
  });
  for (const key of SECTION_ORDER) if (!(key in ranges)) ranges[key] = [0, 0];
  const scratchStart = dividerIdx === -1 ? lines.length : dividerIdx + 1;
  const scratchRange = [scratchStart, lines.length];

  function homeOf(idx) {
    for (const key of SECTION_ORDER) {
      const [s, e] = ranges[key];
      if (idx >= s && idx < e) return key;
    }
    if (idx >= scratchRange[0] && idx < scratchRange[1]) return 'scratch';
    return null;
  }

  const perSection = Object.fromEntries(SECTION_ORDER.map(k => [k, []]));
  const scratchKept = [];

  lines.forEach((rec, i) => {
    if (rec.kind === 'header' || rec.kind === 'divider' || rec.kind === 'blank') return;
    // Every valid `set` line, wherever it is, is consolidated into a single
    // canonical cluster per type (built below from `finalSet`) — drop the
    // scattered instance entirely rather than re-emitting it in place. An
    // invalid one (bad field/value) is left untouched, same as any other
    // invalid line, so the user can see and fix it.
    if (rec.kind === 'set' && rec.valid) return;
    if (rec.valid && SECTION_ORDER.includes(rec.targetSection)) {
      perSection[rec.targetSection].push(rec);
      return;
    }
    const loc = homeOf(i);
    if (loc && loc !== 'scratch') perSection[loc].push(rec);
    else scratchKept.push(rec);
  });

  const out = [];
  for (const key of SECTION_ORDER) {
    const def = SECTION_DEFS.find(d => d.key === key);
    const objectLines = perSection[key].map(formatLineForOutput);
    if (key === 'vertices') {
      emitSection(out, def.style, def.title, buildSetBlock('vertex', finalSet.vertex), objectLines);
    } else if (key === 'segments') {
      emitSection(out, def.style, def.title, buildSetBlock('segment', finalSet.segment), objectLines);
    } else {
      emitSection(out, def.style, def.title, objectLines);
    }
  }
  out.push(makeDividerLine());
  out.push('');
  for (const rec of scratchKept) out.push(formatLineForOutput(rec));

  return out.join('\n');
}

// ─── Theme helpers ────────────────────────────────────────────────────────────

function themeColor(hex) {
  if (!darkMode) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const M = Math.max(r, g, b), m = Math.min(r, g, b);
  const c = M + m - 255;
  const cl = x => Math.max(0, Math.min(255, x));
  return '#' + [cl(r - c), cl(g - c), cl(b - c)].map(x => x.toString(16).padStart(2, '0')).join('');
}

function darkInk(alpha) {
  return darkMode ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
}

// ─── Drawing ──────────────────────────────────────────────────────────────────

function drawDiskBoundary(scale) {
  ctx.save();
  ctx.strokeStyle = darkInk(0.18);
  ctx.setLineDash([4, 6]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx(), cy(), scale, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

const AXIS_COLORS   = ['#cc3333', '#228822', '#2255cc'];  // x, y, z
const AXIS_LABELS   = ['x', 'y', 'z'];
const ARROW_HEAD    = 12;   // arrowhead length in pixels

function drawAxes(vecs, scale) {
  const ox = cx(), oy = cy();

  // Small origin dot
  ctx.save();
  ctx.beginPath();
  ctx.arc(ox, oy, 3, 0, 2 * Math.PI);
  ctx.fillStyle = darkInk(0.35);
  ctx.fill();
  ctx.restore();

  for (let k = 0; k < 3; k++) {
    const tip   = toScreen(vecs[k], scale);
    const dx    = tip.x - ox;
    const dy    = tip.y - oy;
    const len   = Math.hypot(dx, dy);
    const color = themeColor(AXIS_COLORS[k]);
    if (len < 1) continue;

    const ux = dx / len, uy = dy / len;   // unit vector toward tip
    const angle = Math.atan2(dy, dx);
    const a1 = angle + Math.PI * 5 / 6;   // arrowhead wing angles (150° back)
    const a2 = angle - Math.PI * 5 / 6;

    // Shaft — stops just before arrowhead base so they don't overlap
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(tip.x - ux * ARROW_HEAD, tip.y - uy * ARROW_HEAD);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // Filled arrowhead triangle
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(tip.x + ARROW_HEAD * Math.cos(a1), tip.y + ARROW_HEAD * Math.sin(a1));
    ctx.lineTo(tip.x + ARROW_HEAD * Math.cos(a2), tip.y + ARROW_HEAD * Math.sin(a2));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();

    // Label just beyond the tip
    ctx.save();
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(AXIS_LABELS[k], tip.x + ux * 16, tip.y + uy * 16);
    ctx.restore();
  }
}

// Maps the slider parameter p ∈ [0,1] to focal distance F > 0.
// p=0 → F=∞ (orthographic); p=1 → F=1 (most extreme).
// Replace this function if a different p↦F curve is preferred.
function perspPtoF(p) {
  return 1 / p;   // current mapping: p = 1/F
}

// Applies perspective correction to a projected 2D point.
// normS is the frame normalization factor s from getProjectionState().
// Returns { pt: corrected C, ok: bool }; ok=false means skip this point.
function applyPerspective(pt, depth, normS) {
  if (!perspectiveOn) return { pt, ok: true, factor: 1 };
  const h = displayMode === 'A' ? depth / normS : depth;
  const F = perspPtoF(perspectiveP);
  const d = 1 - h / F;   // = 1 - p·h when F=1/p; Infinity case: h/∞=0 → d=1
  if (clipBehind && d <= 0) return { pt: null, ok: false, factor: 1 };
  return { pt: pt.scale(1 / d), ok: true, factor: 1 / d };
}

function drawSegments(segs, verts, vecs, heights, scale, normS) {
  for (const seg of segs) {
    if (!seg.visible) continue;
    const v1 = verts.find(v => v.id === seg.vertexIds[0]);
    const v2 = verts.find(v => v.id === seg.vertexIds[1]);
    if (!v1 || !v2) continue;
    const r1 = projectPoint(v1.coords, vecs, heights);
    const r2 = projectPoint(v2.coords, vecs, heights);
    if (isNaN(r1.depth) || isNaN(r1.pt.re) || isNaN(r2.depth) || isNaN(r2.pt.re)) continue;
    const a1 = applyPerspective(r1.pt, r1.depth, normS);
    const a2 = applyPerspective(r2.pt, r2.depth, normS);
    if (!a1.ok || !a2.ok) continue;
    const p1 = toScreen(a1.pt, scale);
    const p2 = toScreen(a2.pt, scale);
    const w = seg.lineWidth ?? 1.5;
    ctx.save();
    if (perspScaleSegs) {
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.5) { ctx.restore(); continue; }
      const px = -dy / len, py = dx / len;   // unit perpendicular
      const hw1 = Math.min(w * a1.factor / 2, 10);
      const hw2 = Math.min(w * a2.factor / 2, 10);
      if (seg.id === selectedSegmentId) {
        const e = 3;
        ctx.beginPath();
        ctx.moveTo(p1.x + px*(hw1+e), p1.y + py*(hw1+e));
        ctx.lineTo(p2.x + px*(hw2+e), p2.y + py*(hw2+e));
        ctx.lineTo(p2.x - px*(hw2+e), p2.y - py*(hw2+e));
        ctx.lineTo(p1.x - px*(hw1+e), p1.y - py*(hw1+e));
        ctx.closePath();
        ctx.fillStyle = 'rgba(30,100,220,0.28)';
        ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(p1.x + px*hw1, p1.y + py*hw1);
      ctx.lineTo(p2.x + px*hw2, p2.y + py*hw2);
      ctx.lineTo(p2.x - px*hw2, p2.y - py*hw2);
      ctx.lineTo(p1.x - px*hw1, p1.y - py*hw1);
      ctx.closePath();
      ctx.fillStyle = themeColor(seg.color);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      if (seg.id === selectedSegmentId) {
        ctx.strokeStyle = 'rgba(30,100,220,0.28)';
        ctx.lineWidth = w + 6;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
      }
      ctx.strokeStyle = themeColor(seg.color);
      ctx.lineWidth = seg.id === selectedSegmentId ? w + 1 : w;
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawVertices(verts, vecs, heights, scale, normS) {
  for (const v of verts) {
    if (!v.visible) continue;
    const { pt, depth } = projectPoint(v.coords, vecs, heights);
    if (isNaN(depth) || isNaN(pt.re) || isNaN(pt.im)) continue;
    const { pt: ppt, ok, factor } = applyPerspective(pt, depth, normS);
    if (!ok) continue;
    const scr = toScreen(ppt, scale);

    const baseR = v.radius ?? 5;
    const r     = perspScaleNodes ? Math.min(baseR * factor, 30) : baseR;

    if (selectedVertexIds.has(v.id) && segmentMode !== 'off') {
      // Rim: crisp ring(s) to signal segment-creation selection
      ctx.save();
      ctx.beginPath();
      ctx.arc(scr.x, scr.y, r + 4, 0, 2 * Math.PI);
      ctx.strokeStyle = 'rgba(30, 100, 220, 0.90)';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (segmentMode === 'on++') {
        ctx.beginPath();
        ctx.arc(scr.x, scr.y, r + 9, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(30, 100, 220, 0.50)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();
    } else if (selectedVertexIds.has(v.id) || v.id === focusedVertexId) {
      // No rim: soft filled glow — either primed selection in off mode, or passive focus
      ctx.save();
      ctx.beginPath();
      ctx.arc(scr.x, scr.y, r + 6, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(60, 130, 255, 0.20)';
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(scr.x, scr.y, r, 0, 2 * Math.PI);
    ctx.fillStyle = themeColor(v.color);
    ctx.fill();
    ctx.strokeStyle = darkInk(0.25);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    if (v.showLabel) {
      ctx.save();
      ctx.font = '11px sans-serif';
      ctx.fillStyle = themeColor(v.color);
      ctx.fillText(v.name, scr.x + r + 4, scr.y - 7);
      ctx.restore();
    }
  }
}

function drawControlPoint(scale) {
  const pt = toScreen(controlPt, scale);
  ctx.save();
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, 8, 0, 2 * Math.PI);
  ctx.fillStyle = darkMode ? 'rgba(8,29,127,0.95)' : 'rgba(128,149,247,0.95)';
  ctx.fill();
  ctx.strokeStyle = darkInk(0.50);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const base                 = getBaseScale();
  const display              = getDisplayScale();
  const { vecs, heights, s } = getProjectionState();
  const activeVerts = codeOpen && previewOverride ? previewOverride.vertices : vertices;
  const activeSegs  = codeOpen && previewOverride ? previewOverride.segments : segments;
  if (displayMode === 'B') drawDiskBoundary(base);
  if (showAxes) drawAxes(vecs, display);
  drawSegments(activeSegs, activeVerts, vecs, heights, display, s);
  drawVertices(activeVerts, vecs, heights, display, s);
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
  } else {
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

// ─── Canvas click → vertex / segment focus and selection ─────────────────────

function distToSegmentPx(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx*dx + dy*dy;
  if (lenSq === 0) return Math.hypot(px-ax, py-ay);
  const t = Math.max(0, Math.min(1, ((px-ax)*dx + (py-ay)*dy) / lenSq));
  return Math.hypot(px - (ax + t*dx), py - (ay + t*dy));
}

function handleCanvasClick(px, py, pointerType) {
  if (isEditingBlocked()) return;
  const display              = getDisplayScale();
  const { vecs, heights, s } = getProjectionState();
  const hitR = pointerType === 'touch' ? 28 : 14;

  // Vertex hit test (perspective-corrected)
  for (const v of vertices) {
    if (!v.visible) continue;
    const { pt, depth } = projectPoint(v.coords, vecs, heights);
    if (isNaN(depth) || isNaN(pt.re) || isNaN(pt.im)) continue;
    const { pt: ppt, ok } = applyPerspective(pt, depth, s);
    if (!ok) continue;
    const scr = toScreen(ppt, display);
    if (Math.hypot(px - scr.x, py - scr.y) <= hitR) {
      if (segmentMode !== 'off') {
        if (selectedVertexIds.has(v.id)) selectedVertexIds.delete(v.id);
        else selectedVertexIds.add(v.id);
        checkSelectionComplete();
      } else {
        // Off mode: single-vertex priming — replace any prior selection
        if (selectedVertexIds.has(v.id)) selectedVertexIds.delete(v.id);
        else { selectedVertexIds.clear(); selectedVertexIds.add(v.id); }
      }
      focusedVertexId   = v.id;
      selectedSegmentId = null;
      renderVertexList();
      renderSegmentList();
      draw();
      return;
    }
  }

  // Segment hit test (perpendicular distance to screen-space line)
  for (const seg of segments) {
    if (!seg.visible) continue;
    const v1 = vertices.find(v => v.id === seg.vertexIds[0]);
    const v2 = vertices.find(v => v.id === seg.vertexIds[1]);
    if (!v1 || !v2) continue;
    const r1 = projectPoint(v1.coords, vecs, heights);
    const r2 = projectPoint(v2.coords, vecs, heights);
    if (isNaN(r1.depth) || isNaN(r1.pt.re) || isNaN(r2.depth) || isNaN(r2.pt.re)) continue;
    const a1 = applyPerspective(r1.pt, r1.depth, s);
    const a2 = applyPerspective(r2.pt, r2.depth, s);
    if (!a1.ok || !a2.ok) continue;
    const p1 = toScreen(a1.pt, display);
    const p2 = toScreen(a2.pt, display);
    if (distToSegmentPx(px, py, p1.x, p1.y, p2.x, p2.y) <= hitR) {
      if (segmentMode !== 'off') return;  // give user another shot at a vertex
      selectedSegmentId = seg.id === selectedSegmentId ? null : seg.id;
      focusedVertexId   = null;
      selectedVertexIds.clear();
      renderVertexList();
      renderSegmentList();
      draw();
      return;
    }
  }

  // Empty space: clear all focus; also clear primed vertex selection in off mode
  focusedVertexId   = null;
  selectedSegmentId = null;
  if (segmentMode === 'off') selectedVertexIds.clear();
  renderVertexList();
  renderSegmentList();
  draw();
}

function checkSelectionComplete() {
  if (selectedVertexIds.size < 2) return;
  const [id1, id2] = [...selectedVertexIds];
  const color     = document.getElementById('seg-color').value;
  const lineWidth = Math.max(0.5, parseFloat(document.getElementById('seg-width').value) || 1.5);
  snapshot();
  segments.push({
    id: nextSegmentId++, vertexIds: [id1, id2], color, lineWidth, visible: true,
    colorExpr: color, widthExpr: String(lineWidth), visibleExpr: 'true',
  });
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

sliderScale.addEventListener('input', () => applyScale(parseFloat(sliderScale.value)));
inputScale.addEventListener('change', () => {
  const v = parseFloat(inputScale.value);
  if (!isNaN(v) && v > 0) applyScale(v);
});

// ─── Axes button ──────────────────────────────────────────────────────────────

document.getElementById('btn-axes').addEventListener('click', () => {
  showAxes = !showAxes;
  document.getElementById('btn-axes').classList.toggle('active', showAxes);
  draw();
});

// ─── Vertex edit mode ─────────────────────────────────────────────────────────

function enterEditMode(id) {
  _pendingScrollToEdit = true;
  const v = vertices.find(u => u.id === id);
  if (v && !v.exprs) v.exprs = ['', '', ''];
  editingVertexId   = id;
  editingOriginal   = captureState();
  selectedVertexIds.clear();
  selectedSegmentId = null;
  focusedVertexId   = id;
  if (omegaMode === 'on') omegaMode = 'off';
  updateUndoButtons();
  updateSciKeyboard();
  renderVertexList();
  renderSegmentList();
  renderConstList();
  draw();
}

function commitEdit() {
  undoStack.push(editingOriginal);
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack       = [];
  focusedVertexId = editingVertexId;
  editingVertexId = null;
  editingOriginal = null;
  if (omegaMode === 'on') omegaMode = 'off';
  activeExprInput = null;
  updateUndoButtons();
  updateSciKeyboard();
  renderVertexList();
  renderConstList();
  draw();
}

function cancelEdit() {
  if (editingOriginal) {
    const orig = editingOriginal.vertices.find(u => u.id === editingVertexId);
    const v    = vertices.find(u => u.id === editingVertexId);
    if (orig && v) {
      v.name      = orig.name;
      v.coords    = [...orig.coords];
      v.exprs     = [...(orig.exprs ?? ['', '', ''])];
      v.color     = orig.color;
      v.colorExpr = orig.colorExpr;
      v.radius    = orig.radius ?? 5;
      v.radiusExpr = orig.radiusExpr;
      v.visible   = orig.visible;
      v.visibleExpr = orig.visibleExpr;
      v.showLabel = orig.showLabel;
      v.labelExpr = orig.labelExpr;
    }
  }
  focusedVertexId = editingVertexId;
  editingVertexId = null;
  editingOriginal = null;
  if (omegaMode === 'on') omegaMode = 'off';
  activeExprInput = null;
  updateUndoButtons();
  updateSciKeyboard();
  renderVertexList();
  renderConstList();
  draw();
}

// ─── Science keyboard ─────────────────────────────────────────────────────────

function positionSciKeyboard() {
  const kbd = document.getElementById('sci-keyboard');
  if (kbd.style.display === 'none') return;
  if (kbd.offsetHeight === 0) { requestAnimationFrame(positionSciKeyboard); return; }
  const wrapper = document.getElementById('controls-wrapper');
  if (!wrapper) return;
  // Find the currently active Ω button (vertex edit or focused const entry)
  let omegaBtn = document.getElementById('btn-omega');
  if (!omegaBtn) {
    for (const btn of document.querySelectorAll('.const-omega-btn')) {
      if (btn.style.visibility !== 'hidden') { omegaBtn = btn; break; }
    }
  }
  if (!omegaBtn) return;
  const wRect = wrapper.getBoundingClientRect();
  const oRect = omegaBtn.getBoundingClientRect();
  const omegaMid = oRect.top - wRect.top + oRect.height / 2;
  kbd.style.marginTop = Math.max(0, omegaMid - kbd.offsetHeight / 2) + 'px';
}


function updateSciKeyboard() {
  const kbd  = document.getElementById('sci-keyboard');
  const show = omegaMode !== 'off' && (editingVertexId !== null || activeExprInput !== null);
  kbd.style.display = show ? '' : 'none';
  const omegaText  = omegaMode === 'on++' ? 'Ω+' : 'Ω';
  const omegaSuffix = omegaMode === 'on' ? ' active' : omegaMode === 'on++' ? ' active-loop' : '';
  const vertexOmega = document.getElementById('btn-omega');
  if (vertexOmega) {
    vertexOmega.textContent = omegaText;
    vertexOmega.className   = 'v-toggle' + omegaSuffix;
  }
  document.querySelectorAll('.const-omega-btn').forEach(btn => {
    btn.textContent = omegaText;
    btn.className   = 'v-toggle const-omega-btn' + omegaSuffix;
  });
  if (show) requestAnimationFrame(positionSciKeyboard);
}

document.getElementById('vertex-list').addEventListener('scroll', positionSciKeyboard);

document.getElementById('sci-keyboard').querySelectorAll('.sk-btn').forEach(btn => {
  btn.addEventListener('mousedown', e => {
    e.preventDefault();  // keep focus on expr input
    if (!activeExprInput) return;
    insertAtCursor(activeExprInput, btn.dataset.insert, parseInt(btn.dataset.offset ?? '0'));
  });
});

// ─── Constants controls ───────────────────────────────────────────────────────

// Renders a constant's resolved value into `valSpan`, branching on kind —
// number keeps the existing numeric-text display, boolean shows true/false
// as text, color shows a small swatch (reusing the .v-swatch convention
// already used for vertex list rows) alongside the hex text.
function renderConstValSpan(valSpan, c) {
  valSpan.innerHTML = '';
  if (c.kind === 'color') {
    const swatch = document.createElement('span');
    swatch.className = 'v-swatch';
    swatch.style.background = c.value;
    swatch.style.display = 'inline-block';
    valSpan.appendChild(swatch);
    valSpan.appendChild(document.createTextNode(' ' + c.value));
  } else if (c.kind === 'boolean') {
    valSpan.textContent = String(c.value);
  } else {
    valSpan.textContent = isNaN(c.value) ? '?' : +c.value.toFixed(4);
  }
}

function renderConstList() {
  const list = document.getElementById('const-list');
  list.innerHTML = '';
  buildEnvs(); // side effect: computes c.kind/c.value for every constant

  for (const c of constants) {
    const entry = document.createElement('div');
    entry.className = 'const-entry';

    // Ω button slot — visible only while this entry's expr input is focused
    const btnSlot = document.createElement('div');
    btnSlot.className = 'const-btn-slot';
    const omegaBtn = document.createElement('button');
    omegaBtn.className = 'v-toggle const-omega-btn' + (omegaMode === 'on' ? ' active' : omegaMode === 'on++' ? ' active-loop' : '');
    omegaBtn.textContent = omegaMode === 'on++' ? 'Ω+' : 'Ω';
    omegaBtn.style.visibility = 'hidden';
    omegaBtn.addEventListener('mousedown', e => e.preventDefault());
    omegaBtn.addEventListener('click', () => {
      if      (omegaMode === 'off')  omegaMode = 'on';
      else if (omegaMode === 'on')   omegaMode = 'on++';
      else                           omegaMode = 'off';
      updateSciKeyboard();
    });
    btnSlot.appendChild(omegaBtn);

    const nameInp = document.createElement('input');
    nameInp.type = 'text';
    mobileTextInput(nameInp);
    nameInp.className = 'const-name-input';
    nameInp.value = c.name;
    nameInp.addEventListener('change', () => {
      const n = nameInp.value.trim();
      if (n && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(n)) {
        if (n === 'true' || n === 'false') { nameInp.value = c.name; setNameError(nameInp); return; }
        if (isNameTaken(n, null, c.id)) { nameInp.value = c.name; setNameError(nameInp); return; }
        snapshot();
        const oldName = c.name;
        c.name = n;
        renameConstantEverywhere(oldName, n);
        reEvalObjects();
        renderConstList();
        if (editingVertexId !== null) renderVertexList();
        draw();
      } else { nameInp.value = c.name; }
    });

    const eq = document.createElement('span');
    eq.className = 'const-eq';
    eq.textContent = '=';

    const exprInp = document.createElement('input');
    exprInp.type = 'text';
    mobileTextInput(exprInp);
    exprInp.className = 'expr-input';
    exprInp.value = c.expr;
    exprInp.disabled = editingVertexId !== null;

    exprInp.addEventListener('focus', () => {
      activeExprInput = exprInp;
      omegaBtn.style.visibility = '';
      updateSciKeyboard();
      requestAnimationFrame(positionSciKeyboard);
    });
    exprInp.addEventListener('blur', () => {
      setTimeout(() => {
        omegaBtn.style.visibility = 'hidden';
        if (activeExprInput === exprInp) { activeExprInput = null; updateSciKeyboard(); }
      }, 0);
    });
    exprInp.addEventListener('change', () => {
      c.expr = exprInp.value;
      buildEnvs();
      renderConstValSpan(valSpan, c);
      exprInp.classList.toggle('expr-invalid', c.kind === 'number' && isNaN(c.value) && c.expr.trim() !== '');
      reEvalObjects();
      draw();
    });

    const valSpan = document.createElement('span');
    valSpan.className = 'const-value';
    valSpan.dataset.constVal = c.id;
    renderConstValSpan(valSpan, c);

    const del = document.createElement('button');
    del.className = 'v-delete';
    del.textContent = '×';
    del.title = 'Delete constant';
    del.addEventListener('click', () => {
      snapshot();
      constants = constants.filter(x => x.id !== c.id);
      reEvalObjects(); renderConstList(); draw();
    });

    entry.append(btnSlot, nameInp, eq, exprInp, valSpan, del);
    list.appendChild(entry);
  }
}

document.getElementById('btn-add-const').addEventListener('click', () => {
  const nameInp = document.getElementById('c-name');
  const exprInp = document.getElementById('c-expr');
  const name = nameInp.value.trim();
  const expr = exprInp.value.trim();
  if (!name || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) return;
  if (name === 'true' || name === 'false') { setNameError(nameInp); return; }
  if (isNameTaken(name)) { setNameError(nameInp); return; }
  snapshot();
  constants.push({ id: nextConstantId++, name, expr, value: NaN });
  nameInp.value = '';
  exprInp.value = '';
  reEvalObjects();
  renderConstList();
  draw();
});

document.getElementById('c-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-add-const').click();
});
document.getElementById('c-expr').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-add-const').click();
});

// ─── Vertex controls ──────────────────────────────────────────────────────────

function renderVertexList() {
  const list       = document.getElementById('vertex-list');
  const savedScroll = list.scrollTop;
  list.innerHTML   = '';
  const inEdit     = editingVertexId !== null || editingSegmentId !== null;
  let   editEntry    = null;
  let   focusedEntry = null;

  for (const v of vertices) {
    const entry = document.createElement('div');
    entry.className = 'vertex-entry';

    if (v.id === editingVertexId) {
      // ── Edit block (column layout) ─────────────────────────────────────────
      entry.className = 'vertex-entry vertex-editing';
      editEntry = entry;
      if (!v.exprs) v.exprs = ['', '', ''];

      // Row 1: color / name / radius / ✓ ✗
      const mainRow = document.createElement('div');
      mainRow.className = 'vertex-edit-row';

      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = v.color;
      colorInput.className = 'v-edit-color';
      colorInput.addEventListener('input', () => { v.color = colorInput.value; v.colorExpr = colorInput.value; draw(); });

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      mobileTextInput(nameInput);
      nameInput.value = v.name;
      nameInput.className = 'v-name-input';
      nameInput.addEventListener('blur', () => {
        const n = nameInput.value.trim();
        if (n && n !== v.name && isNameTaken(n, v.id)) {
          nameInput.value = v.name;
          _rejectedVertexId = v.id;
          setNameError(nameInput);
        } else if (n) {
          v.name = n;
        }
      });
      nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') commitEdit(); });

      const radiusInp = document.createElement('input');
      radiusInp.type = 'number';
      radiusInp.value = v.radius ?? 5;
      radiusInp.className = 'v-coord';
      radiusInp.style.width = '38px';
      radiusInp.min = '1';
      radiusInp.step = '0.5';
      radiusInp.title = 'Node radius';
      radiusInp.addEventListener('blur', () => {
        const n = parseFloat(radiusInp.value);
        if (!isNaN(n) && n >= 1) { v.radius = n; v.radiusExpr = String(n); draw(); }
      });
      radiusInp.addEventListener('keydown', e => { if (e.key === 'Enter') commitEdit(); });

      const commitBtn = document.createElement('button');
      commitBtn.textContent = '✓';
      commitBtn.className = 'v-toggle';
      commitBtn.title = 'Commit changes';
      commitBtn.addEventListener('click', commitEdit);

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = '✗';
      cancelBtn.className = 'v-delete';
      cancelBtn.title = 'Cancel edit';
      cancelBtn.addEventListener('click', cancelEdit);

      mainRow.append(colorInput, nameInput, radiusInp, commitBtn, cancelBtn);
      entry.appendChild(mainRow);

      // Rows 2–4: coordinate expression inputs
      const env = buildEnvs().numericEnv;
      ['a₁', 'a₂', 'a₃'].forEach((lbl, i) => {
        const row = document.createElement('div');
        row.className = 'vertex-edit-row';

        const btnSlot = document.createElement('div');
        btnSlot.className = 'coord-btn-slot';
        if (i === 1) {
          const omegaBtn = document.createElement('button');
          omegaBtn.id = 'btn-omega';
          omegaBtn.textContent = omegaMode === 'on++' ? 'Ω+' : 'Ω';
          omegaBtn.className = 'v-toggle' + (omegaMode === 'on' ? ' active' : omegaMode === 'on++' ? ' active-loop' : '');
          omegaBtn.title = 'Science keyboard';
          omegaBtn.addEventListener('mousedown', e => e.preventDefault());
          omegaBtn.addEventListener('click', () => {
            if      (omegaMode === 'off')  omegaMode = 'on';
            else if (omegaMode === 'on')   omegaMode = 'on++';
            else                           omegaMode = 'off';
            updateSciKeyboard();
          });
          btnSlot.appendChild(omegaBtn);
        }
        row.appendChild(btnSlot);

        const coordLabel = document.createElement('span');
        coordLabel.className = 'coord-label';
        coordLabel.textContent = lbl + ' =';
        row.appendChild(coordLabel);

        const exprVal = v.exprs[i] || String(+v.coords[i].toFixed(6));
        const exprInp = document.createElement('input');
        exprInp.type = 'text';
        mobileTextInput(exprInp);
        exprInp.className = 'expr-input';
        exprInp.value = exprVal;
        exprInp.addEventListener('focus', () => {
          activeExprInput = exprInp;
          if (omegaMode !== 'off') { updateSciKeyboard(); requestAnimationFrame(positionSciKeyboard); }
        });
        exprInp.addEventListener('blur', () => {
          setTimeout(() => { if (activeExprInput === exprInp) activeExprInput = null; }, 0);
        });
        exprInp.addEventListener('input', () => {
          v.exprs[i] = exprInp.value;
          const val  = evalExpr(exprInp.value, buildEnvs().numericEnv);
          const bad  = isNaN(val) && exprInp.value.trim() !== '';
          exprInp.classList.toggle('expr-invalid', bad);
          if (!isNaN(val)) { v.coords[i] = val; valSpan.textContent = +val.toFixed(4); }
          else              { valSpan.textContent = '?'; }
          draw();
        });
        exprInp.addEventListener('keydown', e => { if (e.key === 'Enter') commitEdit(); });
        row.appendChild(exprInp);

        const valSpan = document.createElement('span');
        valSpan.className = 'coord-value';
        const curVal = evalExpr(exprVal, env);
        valSpan.textContent = isNaN(curVal) ? '?' : +curVal.toFixed(4);
        row.appendChild(valSpan);

        entry.appendChild(row);
      });


    } else {
      // ── Display row ───────────────────────────────────────────────────────
      if (selectedVertexIds.has(v.id) || v.id === focusedVertexId) {
        entry.classList.add('list-selected');
      }
      if (v.id === focusedVertexId) focusedEntry = entry;

      const swatch = document.createElement('span');
      swatch.className = 'v-swatch';
      swatch.style.background = v.color;

      const name = document.createElement('span');
      name.className = 'v-name';
      name.textContent = v.name;
      if (_rejectedVertexId === v.id) setNameError(name);

      const coords = document.createElement('span');
      coords.className = 'v-coords';
      coords.textContent = v.coords.map(x => +x.toFixed(2)).join(', ');

      const labelToggle = document.createElement('button');
      labelToggle.className = 'v-toggle';
      labelToggle.textContent = 'A';
      labelToggle.title = v.showLabel ? 'Hide label' : 'Show label';
      labelToggle.style.opacity = v.showLabel ? '1' : '0.3';
      labelToggle.disabled = inEdit;
      labelToggle.addEventListener('click', () => {
        snapshot();
        v.showLabel = !v.showLabel;
        v.labelExpr = String(v.showLabel);
        renderVertexList();
        draw();
      });

      const editBtn = document.createElement('button');
      editBtn.textContent = '✎';
      editBtn.className = 'v-toggle';
      editBtn.title = 'Edit';
      editBtn.disabled = inEdit;
      editBtn.addEventListener('click', () => enterEditMode(v.id));

      const toggle = document.createElement('button');
      toggle.className = 'v-toggle';
      toggle.textContent = v.visible ? '●' : '○';
      toggle.title = v.visible ? 'Hide' : 'Show';
      toggle.disabled = inEdit;
      toggle.addEventListener('click', () => {
        snapshot();
        v.visible = !v.visible;
        v.visibleExpr = String(v.visible);
        renderVertexList();
        draw();
      });

      const del = document.createElement('button');
      del.className = 'v-delete';
      del.textContent = '×';
      del.title = 'Delete';
      del.disabled = inEdit;
      del.addEventListener('click', () => {
        snapshot();
        segments = segments.filter(s => !s.vertexIds.includes(v.id));
        vertices = vertices.filter(u => u.id !== v.id);
        selectedVertexIds.delete(v.id);
        if (focusedVertexId === v.id) focusedVertexId = null;
        if (segments.every(s => s.id !== selectedSegmentId)) selectedSegmentId = null;
        renderVertexList();
        renderSegmentList();
        draw();
      });

      entry.append(swatch, name, coords, labelToggle, editBtn, toggle, del);
    }

    list.appendChild(entry);
  }

  if (_pendingScrollToEdit && editEntry) {
    _pendingScrollToEdit = false;
    editEntry.scrollIntoView({ block: 'nearest' });
  } else if (focusedEntry) {
    focusedEntry.scrollIntoView({ block: 'nearest' });
  } else {
    list.scrollTop = savedScroll;
  }
}

function addVertexFromInputs() {
  const nameInput = document.getElementById('v-name');
  const coordIds  = ['v-a1', 'v-a2', 'v-a3'];
  const coordInps = coordIds.map(id => document.getElementById(id));
  const env       = buildEnvs().numericEnv;
  const exprs     = coordInps.map(inp => inp.value.trim() || '0');
  const vals      = exprs.map(expr => evalExpr(expr, env));
  coordInps.forEach((inp, k) => inp.classList.toggle('expr-invalid', isNaN(vals[k])));
  if (vals.some(isNaN)) return;
  const name   = nameInput.value.trim() || `P${nextVertexId}`;
  if (isNameTaken(name)) { setNameError(nameInput); return; }
  const color  = document.getElementById('v-color').value;
  const radius = Math.max(1, parseFloat(document.getElementById('v-radius').value) || 5);
  snapshot();
  vertices.push({
    id: nextVertexId++, name, coords: vals, exprs, color, radius, visible: true, showLabel: true,
    colorExpr: color, radiusExpr: String(radius), visibleExpr: 'true', labelExpr: 'true',
  });
  nameInput.value = '';
  coordInps.forEach(inp => { inp.value = '0'; inp.classList.remove('expr-invalid'); });
  renderVertexList();
  draw();
}

document.getElementById('btn-add-vertex').addEventListener('click', addVertexFromInputs);

['v-name', 'v-a1', 'v-a2', 'v-a3'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') addVertexFromInputs();
  });
});

['v-a1', 'v-a2', 'v-a3', 'v-radius'].forEach(id => {
  document.getElementById(id).addEventListener('focus', function() {
    const el = this;
    setTimeout(() => el.select(), 0);
  });
});

// ─── Segment edit mode ────────────────────────────────────────────────────────

function enterSegmentEditMode(id) {
  editingSegmentId       = id;
  editingSegmentOriginal = captureState();
  updateUndoButtons();
  renderSegmentList();
}

function commitSegmentEdit() {
  undoStack.push(editingSegmentOriginal);
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack              = [];
  editingSegmentId       = null;
  editingSegmentOriginal = null;
  updateUndoButtons();
  renderSegmentList();
  draw();
}

function cancelSegmentEdit() {
  if (editingSegmentOriginal) {
    const orig = editingSegmentOriginal.segments.find(s => s.id === editingSegmentId);
    const seg  = segments.find(s => s.id === editingSegmentId);
    if (orig && seg) {
      seg.color = orig.color; seg.colorExpr = orig.colorExpr;
      seg.lineWidth = orig.lineWidth ?? 1.5; seg.widthExpr = orig.widthExpr;
    }
  }
  editingSegmentId       = null;
  editingSegmentOriginal = null;
  updateUndoButtons();
  renderSegmentList();
  draw();
}

// ─── Segment controls ─────────────────────────────────────────────────────────

function updateSegmentButton() {
  const btn = document.getElementById('btn-segment');
  btn.classList.toggle('active',      segmentMode === 'on');
  btn.classList.toggle('active-loop', segmentMode === 'on++');
  btn.textContent = segmentMode === 'on++' ? 'segment +' : 'segment';
}

function renderSegmentList() {
  const list   = document.getElementById('segment-list');
  list.innerHTML = '';
  const inEdit = editingVertexId !== null || editingSegmentId !== null;

  for (const seg of segments) {
    const v1 = vertices.find(v => v.id === seg.vertexIds[0]);
    const v2 = vertices.find(v => v.id === seg.vertexIds[1]);

    const entry = document.createElement('div');
    entry.className = 'segment-entry';

    if (seg.id === editingSegmentId) {
      // ── Edit row ──────────────────────────────────────────────────────────
      entry.className = 'segment-entry vertex-editing';

      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = seg.color;
      colorInput.className = 'v-edit-color';
      colorInput.addEventListener('input', () => { seg.color = colorInput.value; seg.colorExpr = colorInput.value; draw(); });

      const label = document.createElement('span');
      label.className = 's-name';
      label.textContent = `${v1?.name ?? '?'} – ${v2?.name ?? '?'}`;

      const widthInp = document.createElement('input');
      widthInp.type = 'number';
      widthInp.value = seg.lineWidth ?? 1.5;
      widthInp.className = 'v-coord';
      widthInp.style.width = '38px';
      widthInp.min = '0.5';
      widthInp.step = '0.5';
      widthInp.title = 'Line width';
      widthInp.addEventListener('blur', () => {
        const n = parseFloat(widthInp.value);
        if (!isNaN(n) && n >= 0.5) { seg.lineWidth = n; seg.widthExpr = String(n); draw(); }
      });
      widthInp.addEventListener('keydown', e => { if (e.key === 'Enter') commitSegmentEdit(); });

      const commitBtn = document.createElement('button');
      commitBtn.textContent = '✓';
      commitBtn.className = 'v-toggle';
      commitBtn.title = 'Commit changes';
      commitBtn.addEventListener('click', commitSegmentEdit);

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = '✗';
      cancelBtn.className = 'v-delete';
      cancelBtn.title = 'Cancel edit';
      cancelBtn.addEventListener('click', cancelSegmentEdit);

      entry.append(colorInput, label, widthInp, commitBtn, cancelBtn);

    } else {
      // ── Display row ───────────────────────────────────────────────────────
      if (seg.id === selectedSegmentId) entry.classList.add('list-selected');

      const swatch = document.createElement('span');
      swatch.className = 's-swatch';
      swatch.style.background = seg.color;
      swatch.style.height = `${Math.min(Math.max(seg.lineWidth ?? 1.5, 1), 8)}px`;

      const label = document.createElement('span');
      label.className = 's-name';
      label.textContent = `${v1?.name ?? '?'} – ${v2?.name ?? '?'}`;

      const editBtn = document.createElement('button');
      editBtn.textContent = '✎';
      editBtn.className = 'v-toggle';
      editBtn.title = 'Edit';
      editBtn.disabled = inEdit;
      editBtn.addEventListener('click', () => enterSegmentEditMode(seg.id));

      const toggle = document.createElement('button');
      toggle.className = 'v-toggle';
      toggle.textContent = seg.visible ? '●' : '○';
      toggle.title = seg.visible ? 'Hide' : 'Show';
      toggle.disabled = inEdit;
      toggle.addEventListener('click', () => {
        snapshot();
        seg.visible = !seg.visible;
        seg.visibleExpr = String(seg.visible);
        renderSegmentList();
        draw();
      });

      const del = document.createElement('button');
      del.className = 'v-delete';
      del.textContent = '×';
      del.title = 'Delete';
      del.disabled = inEdit;
      del.addEventListener('click', () => {
        snapshot();
        segments = segments.filter(s => s.id !== seg.id);
        if (selectedSegmentId === seg.id) selectedSegmentId = null;
        renderSegmentList();
        draw();
      });

      entry.append(swatch, label, editBtn, toggle, del);
    }

    list.appendChild(entry);
    if (seg.id === selectedSegmentId) entry.scrollIntoView({ block: 'nearest' });
  }
}

document.getElementById('btn-segment').addEventListener('click', () => {
  if      (segmentMode === 'off')  segmentMode = 'on';
  else if (segmentMode === 'on')   segmentMode = 'on++';
  else                             segmentMode = 'off';
  if (segmentMode !== 'off') selectedSegmentId = null;
  updateSegmentButton();
  renderVertexList();
  renderSegmentList();
  draw();
});

// ─── Controls panel toggle ────────────────────────────────────────────────────

document.getElementById('btn-toggle-controls').addEventListener('click', () => {
  const body = document.getElementById('controls-body');
  const btn  = document.getElementById('btn-toggle-controls');
  body.classList.toggle('collapsed');
  btn.classList.toggle('active', !body.classList.contains('collapsed'));
});

['view', 'aux', 'disp'].forEach(key => {
  document.getElementById(`btn-sub-${key}`).addEventListener('click', () => {
    const sub  = document.getElementById(`sub-${key}`);
    const btn  = document.getElementById(`btn-sub-${key}`);
    const open = sub.style.display === 'none';
    sub.style.display = open ? '' : 'none';
    btn.classList.toggle('active', open);
  });
});

// ─── Code submenu ───────────────────────────────────────────────────────────
//
// The textarea is a UI-only buffer. Typing never touches the real vertices/
// constants/segments arrays — it only rebuilds `previewOverride` (consumed by
// draw()) so editing gives live canvas feedback without disturbing the undo
// stack. Only Save/Save+Exit actually commit, via the same snapshot()-then-
// mutate pattern every other action in this file already uses.

// Assigns fresh sequential ids to a staged parse result, mirroring
// restoreState()'s full-replace convention — segments reference the
// freshly-assigned vertex ids from this same build.
function buildCommittedArraysFromStaged(staged) {
  const newVertices = staged.stagedVertices.map((v, i) => ({
    id: i,
    name: v.name,
    coords: [...v.coords],
    exprs: [...v.exprs],
    color: v.color,         colorExpr: v.colorExpr,
    radius: v.radius,       radiusExpr: v.radiusExpr,
    visible: v.visible,     visibleExpr: v.visibleExpr,
    showLabel: v.showLabel, labelExpr: v.labelExpr,
  }));
  const nameToId = new Map(newVertices.map(v => [v.name, v.id]));
  const newConstants = staged.stagedConstants.map((c, i) => ({
    id: i,
    name: c.name,
    expr: c.expr,
    value: c.value,
    kind: c.kind,
  }));
  const newSegments = staged.stagedSegments.map((s, i) => ({
    id: i,
    vertexIds: [nameToId.get(s.v1Name), nameToId.get(s.v2Name)],
    color: s.color,         colorExpr: s.colorExpr,
    lineWidth: s.lineWidth, widthExpr: s.widthExpr,
    visible: s.visible,     visibleExpr: s.visibleExpr,
  }));
  return { newVertices, newConstants, newSegments };
}

function refreshCodeGutterAndErrors() {
  const gutter    = document.getElementById('code-gutter');
  const errorList = document.getElementById('code-error-list');
  gutter.innerHTML    = '';
  errorList.innerHTML = '';

  codeLineRecords.forEach((rec, i) => {
    const lineDiv = document.createElement('div');
    lineDiv.className = 'code-gutter-line' + (!rec.valid ? ' code-line-error' : '');
    lineDiv.textContent = String(i + 1);
    gutter.appendChild(lineDiv);

    if (!rec.valid) {
      const errRow = document.createElement('div');
      errRow.className = 'code-error-row';
      errRow.textContent = `Line ${i + 1}: ${rec.errorMsg}`;
      errRow.addEventListener('click', () => {
        const textarea = document.getElementById('code-textarea');
        const lines = textarea.value.split('\n');
        let pos = 0;
        for (let j = 0; j < i; j++) pos += lines[j].length + 1;
        textarea.focus();
        textarea.setSelectionRange(pos, pos + lines[i].length);
      });
      errorList.appendChild(errRow);
    }
  });
}

// Synchronous reparse + staged preview refresh. Called whenever the caret
// leaves a line that actually changed (see the line-tracking listeners near
// the bottom of this section) and directly by Sort/Save/Exit, which always
// need up-to-date results regardless of caret position.
function reparseAndPreview() {
  const textarea = document.getElementById('code-textarea');
  const staged = parseCodeText(textarea.value);
  codeLineRecords = staged.lines;
  const { newVertices, newSegments } = buildCommittedArraysFromStaged(staged);
  previewOverride = { vertices: newVertices, segments: newSegments };
  refreshCodeGutterAndErrors();
  draw();
}

// Resyncs the line-change-tracking state to wherever the caret currently is —
// needed after any programmatic rewrite of textarea.value (Sort/Save/Load),
// since those don't go through the caret-driven listeners themselves.
function resetCodeLineTracking() {
  const textarea = document.getElementById('code-textarea');
  const lines = textarea.value.split('\n');
  codeCurrentLineIdx      = textarea.value.slice(0, textarea.selectionStart).split('\n').length - 1;
  codeCurrentLineSnapshot = lines[codeCurrentLineIdx] ?? '';
}

function codeSort() {
  const textarea = document.getElementById('code-textarea');
  textarea.value = sortCodeText(textarea.value);
  reparseAndPreview();
  resetCodeLineTracking();
}

function codeSave() {
  // codeSort() already reformats every valid line to its canonical form (via
  // formatLineForOutput) as part of reassembling the text, so the textarea
  // is fully canonical by the time it returns — no separate re-serialize
  // pass needed. Invalid lines are left exactly as typed either way, so the
  // user can still see and fix them (no cascade-delete).
  codeSort();
  const textarea = document.getElementById('code-textarea');
  const staged = parseCodeText(textarea.value);
  const { newVertices, newConstants, newSegments } = buildCommittedArraysFromStaged(staged);

  // Remember this save's governing `set` values so the next Load starts
  // from here instead of resetting to the built-in defaults.
  lastSetVertex  = { ...staged.finalSet.vertex };
  lastSetSegment = { ...staged.finalSet.segment };

  snapshot();
  vertices          = newVertices;
  nextVertexId      = newVertices.length;
  constants         = newConstants;
  nextConstantId    = newConstants.length;
  segments          = newSegments;
  nextSegmentId     = newSegments.length;
  selectedVertexIds = new Set();
  focusedVertexId   = null;
  selectedSegmentId = null;

  reEvalObjects();
  renderConstList();
  renderVertexList();
  renderSegmentList();
  previewOverride = null;
  draw();

  codeLineRecords = staged.lines;
  refreshCodeGutterAndErrors();
  resetCodeLineTracking();
}

function openCodeSubmenu() {
  if (editingVertexId !== null)  cancelEdit();
  if (editingSegmentId !== null) cancelSegmentEdit();

  document.getElementById('sub-aux').style.display = 'none';
  document.getElementById('btn-sub-aux').classList.remove('active');
  document.getElementById('btn-sub-aux').disabled = true;
  document.getElementById('sub-disp').style.display = 'none';
  document.getElementById('btn-sub-disp').classList.remove('active');
  document.getElementById('btn-sub-disp').disabled = true;

  codeOpen = true;
  document.getElementById('sub-code').style.display = '';
  document.getElementById('btn-sub-code').classList.add('active');

  const textarea = document.getElementById('code-textarea');
  textarea.value = serializeState(vertices, constants, segments);
  reparseAndPreview();
  resetCodeLineTracking();
  updateUndoButtons();

  // Sync the gutter's height now rather than waiting on the ResizeObserver —
  // while '#sub-code' was display:none the textarea measured 0-height, so a
  // stale 0px may still be sitting on the gutter from that; correct it the
  // instant the panel actually becomes visible and has a real layout.
  document.getElementById('code-gutter').style.height = textarea.offsetHeight + 'px';
}

function closeCodeSubmenu() {
  codeOpen        = false;
  previewOverride = null;
  codeLineRecords = [];
  document.getElementById('code-gutter').innerHTML    = '';
  document.getElementById('code-error-list').innerHTML = '';

  document.getElementById('sub-code').style.display = 'none';
  document.getElementById('btn-sub-code').classList.remove('active');

  document.getElementById('btn-sub-aux').disabled  = false;
  document.getElementById('btn-sub-disp').disabled = false;

  updateUndoButtons();
  draw();
}

function codeExit() {
  codeSort();
  closeCodeSubmenu();
}

function codeSaveExit() {
  codeSave();
  closeCodeSubmenu();
}

document.getElementById('btn-sub-code').addEventListener('click', () => {
  if (!codeOpen) openCodeSubmenu();
  else           codeExit();
});

document.getElementById('btn-code-sort').addEventListener('click', codeSort);
document.getElementById('btn-code-save').addEventListener('click', codeSave);
document.getElementById('btn-code-exit').addEventListener('click', codeExit);
document.getElementById('btn-code-save-exit').addEventListener('click', codeSaveExit);

// Validation/live-preview is gated on "leaving a line after changing it" —
// not on every keystroke — so errors don't flash up mid-edit. Arrow keys,
// clicks, and Enter all move the caret (and 'keyup' fires after the browser
// has already applied the move), so checking on keyup/click/blur is enough;
// plain typing within a line never trips it since the caret's line index
// doesn't change.
{
  const codeTextareaEl = document.getElementById('code-textarea');

  function codeCheckLineLeave(forceCheck) {
    const idxNow = codeTextareaEl.value.slice(0, codeTextareaEl.selectionStart).split('\n').length - 1;
    const movedLine = idxNow !== codeCurrentLineIdx;
    if (movedLine || forceCheck) {
      const leftLineNow = codeTextareaEl.value.split('\n')[codeCurrentLineIdx] ?? '';
      if (leftLineNow !== codeCurrentLineSnapshot) reparseAndPreview();
    }
    if (movedLine) {
      codeCurrentLineIdx      = idxNow;
      codeCurrentLineSnapshot = codeTextareaEl.value.split('\n')[idxNow] ?? '';
    }
  }

  codeTextareaEl.addEventListener('keyup', () => codeCheckLineLeave(false));
  codeTextareaEl.addEventListener('click', () => codeCheckLineLeave(false));
  codeTextareaEl.addEventListener('blur',  () => codeCheckLineLeave(true));

  // Plain textareas treat Tab as "move focus to the next element" — insert a
  // literal tab character instead (the syntax spec already treats tabs as
  // valid column separators).
  codeTextareaEl.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const start = codeTextareaEl.selectionStart;
    const end   = codeTextareaEl.selectionEnd;
    codeTextareaEl.setRangeText('\t', start, end, 'end');
  });
}

document.getElementById('code-textarea').addEventListener('scroll', () => {
  document.getElementById('code-gutter').scrollTop = document.getElementById('code-textarea').scrollTop;
});

// The gutter's CSS height matches the textarea's default 260px so it clips
// (and can therefore scroll) rather than just growing to fit every line —
// but the textarea is user-resizable (resize:vertical), so keep the gutter's
// height in sync with whatever height the textarea actually ends up at.
// offsetHeight (border-box, like the CSS `height` we're setting) is used
// rather than the ResizeObserver entry's contentRect, which excludes padding
// and would otherwise leave the two consistently 12px out of sync.
new ResizeObserver(() => {
  const textarea = document.getElementById('code-textarea');
  document.getElementById('code-gutter').style.height = textarea.offsetHeight + 'px';
}).observe(document.getElementById('code-textarea'));

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

// ─── Perspective controls ─────────────────────────────────────────────────────

function updatePerspectiveUI() {
  document.getElementById('btn-perspective').classList.toggle('active', perspectiveOn);
  const show = perspectiveOn ? '' : 'none';
  document.getElementById('persp-row').style.display        = show;
  document.getElementById('clip-row').style.display         = show;
  document.getElementById('scale-nodes-row').style.display  = show;
  document.getElementById('scale-segs-row').style.display   = show;
}

document.getElementById('btn-perspective').addEventListener('click', () => {
  perspectiveOn = !perspectiveOn;
  updatePerspectiveUI();
  draw();
});

const sliderPersp = document.getElementById('slider-persp');
const inputPersp  = document.getElementById('input-persp');

function applyPerspParam(value) {
  perspectiveP      = Math.max(0, Math.min(1, value));
  sliderPersp.value = perspectiveP;
  inputPersp.value  = +perspectiveP.toFixed(4);
  draw();
}

sliderPersp.addEventListener('input',  () => applyPerspParam(parseFloat(sliderPersp.value)));
inputPersp.addEventListener('change',  () => {
  const v = parseFloat(inputPersp.value);
  if (!isNaN(v)) applyPerspParam(v);
});

document.getElementById('btn-clip').addEventListener('click', () => {
  clipBehind = !clipBehind;
  document.getElementById('btn-clip').classList.toggle('active', clipBehind);
  draw();
});

document.getElementById('btn-scale-nodes').addEventListener('click', () => {
  perspScaleNodes = !perspScaleNodes;
  document.getElementById('btn-scale-nodes').classList.toggle('active', perspScaleNodes);
  draw();
});

document.getElementById('btn-scale-segs').addEventListener('click', () => {
  perspScaleSegs = !perspScaleSegs;
  document.getElementById('btn-scale-segs').classList.toggle('active', perspScaleSegs);
  draw();
});


// ─── Dark mode ────────────────────────────────────────────────────────────────

document.getElementById('btn-dark').addEventListener('click', () => {
  darkMode = !darkMode;
  document.body.classList.toggle('dark-mode', darkMode);
  document.getElementById('btn-dark').classList.toggle('active', darkMode);
  draw();
});

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('pointerdown', clearNameError, true);
document.addEventListener('keydown',     clearNameError, true);

updateUndoButtons();
renderConstList();
resize();
