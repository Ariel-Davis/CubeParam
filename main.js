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
let showPointer    = true;   // controls the draggable control-point marker
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
let faces            = [];
let nextFaceId       = 0;
let selectedVertexIds = new Set();
let segmentMode       = 'off';     // 'off' | 'on' | 'on++'
let focusedVertexId   = null;      // vertex id highlighted in the list (canvas click)
let selectedSegmentId = null;      // segment id highlighted in the list (canvas click)
let editingVertexId        = null;  // id of vertex currently in edit mode, or null
let editingOriginal        = null;  // captureState() snapshot taken on vertex edit entry
let editingSegmentId       = null;  // id of segment currently in edit mode, or null
let editingSegmentOriginal = null;  // captureState() snapshot taken on segment edit entry

// Collapse state for the Display submenu's object lists — pure UI/view
// state (like showAxes/darkMode/userScale), not object-model data, so it's
// excluded from captureState/restoreState and undo/redo.
let listSectionOpen = { vertex: true, segment: true, face: true };

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
let lastSetFace    = { color: undefined, visible: undefined };

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
    faces:             faces.map(f => ({ ...f, vertexIds: [...f.vertexIds] })),
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
  faces                  = state.faces ?? [];
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
  renderFaceList();
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
  for (const fc of faces) {
    if (fc.colorExpr)   { const r = resolveColorAttr(fc.colorExpr, colorEnv); if (r.ok) fc.color   = r.value; }
    if (fc.visibleExpr) { const r = resolveBoolAttr(fc.visibleExpr, boolEnv); if (r.ok) fc.visible  = r.value; }
  }
}

function renameInExpr(expr, oldName, newName) {
  const esc = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return expr.replace(new RegExp('(?<!\\\\)\\b' + esc + '\\b', 'g'), newName);
}

// Renames every reference to a constant, wherever one might be hiding —
// deliberately driven by naming *convention* rather than a hardcoded field
// list per object type, so a future attribute on an existing object (or a
// whole new object type, once its array is added to the two lists below)
// needs no update here to stay correct. Two conventions this relies on,
// both already established throughout the codebase:
//   - any object field named `<name>Expr` holds raw expression text that
//     may reference a constant by name (colorExpr, radiusExpr, ...);
//   - lastSet*/pendingDefaults objects' fields are always bare identifiers
//     or literals, never compound expressions, when they came from a `set`
//     line — so a plain equality check (not renameInExpr's regex) applies
//     uniformly across whatever fields each one happens to have.
function renameConstantEverywhere(oldName, newName) {
  for (const c of constants)
    c.expr = renameInExpr(c.expr, oldName, newName);

  // Which object types exist, and their per-instance/singleton state, comes
  // from OBJECT_TYPES — a type with no `list` (constants, and functions/
  // curves until implemented) simply has nothing to walk here. The actual
  // per-field scan stays driven by the `*Expr` naming convention rather
  // than each type's explicit `attrs` list: that's what lets it stay
  // correct automatically as attributes are added, with nothing to
  // remember to update in this function specifically.
  for (const t of OBJECT_TYPES) {
    if (!t.list) continue;
    for (const obj of t.list()) {
      for (const f of Object.keys(obj)) {
        if (f.endsWith('Expr') && obj[f]) obj[f] = renameInExpr(obj[f], oldName, newName);
      }
    }
    for (const stateObj of [t.lastSet?.(), t.pendingDefaults?.()]) {
      if (!stateObj) continue;
      for (const f of Object.keys(stateObj)) {
        if (stateObj[f] === oldName) stateObj[f] = newName;
      }
    }
  }
  // Vertex coordinates (`exprs`) are the one exception: a plain array, not
  // a `*Expr`-suffixed field, so they need their own pass.
  for (const v of vertices) {
    if (v.exprs) v.exprs = v.exprs.map(e => renameInExpr(e, oldName, newName));
  }
}

function isNameTakenIn(name, vertexList, constList, faceList = [], excludeVertexId = null, excludeConstId = null, excludeFaceId = null) {
  return vertexList.some(v => v.name === name && v.id !== excludeVertexId)
      || constList.some(c => c.name === name && c.id !== excludeConstId)
      || faceList.some(f => f.name === name && f.id !== excludeFaceId);
}

function isNameTaken(name, excludeVertexId = null, excludeConstId = null, excludeFaceId = null) {
  return isNameTakenIn(name, vertices, constants, faces, excludeVertexId, excludeConstId, excludeFaceId);
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

// Curated quick-pick list for the color picker popover's "Presets" section —
// 4 neutrals (including DEFAULT_COLOR, for a fast "back to default") plus 12
// hues spaced ~30° apart for strong visual separation between many objects.
const PRESET_COLORS = [
  { name: 'Black',       hex: '#000000' },
  { name: 'White',       hex: '#ffffff' },
  { name: 'Default gray', hex: DEFAULT_COLOR },
  { name: 'Light gray',  hex: '#b3b3b3' },
  { name: 'Red',         hex: '#e53935' },
  { name: 'Orange',      hex: '#fb8c00' },
  { name: 'Yellow',      hex: '#fdd835' },
  { name: 'Lime',        hex: '#7cb342' },
  { name: 'Green',       hex: '#43a047' },
  { name: 'Teal',        hex: '#00897b' },
  { name: 'Cyan',        hex: '#00acc1' },
  { name: 'Blue',        hex: '#1e88e5' },
  { name: 'Indigo',      hex: '#3949ab' },
  { name: 'Purple',      hex: '#8e24aa' },
  { name: 'Magenta',     hex: '#d81b60' },
  { name: 'Brown',       hex: '#6d4c41' },
];

// What the GUI "add vertex"/"create segment" rows currently default to —
// raw expr text per field (a literal, or a constant reference for color),
// mirroring lastSetVertex/lastSetSegment's shape. Synced from lastSet* on
// every code-file exit (syncAddRowDefaultsFromLastSet), and mutated directly
// by touching the add-row's own controls (native color input flattens,
// color-constant grid links, visible/label expander toggles). This is what
// addVertexFromInputs()/checkSelectionComplete() actually read when creating
// a new object, so a GUI-created vertex/segment can inherit a live constant
// link exactly like one typed in the code file with `set ... color=c` can.
let pendingVertexDefaults  = { color: DEFAULT_COLOR, r: '5', visible: 'true', label: 'true' };
let pendingSegmentDefaults = { color: DEFAULT_COLOR, width: '1.5', visible: 'true' };

// The two add-row color pickers (see setupColorPicker) — static DOM, wired
// once at init, refreshed on demand from renderAddRowDefaults().
let vColorPicker, segColorPicker;

// ─── Code submenu: parser & serializer ─────────────────────────────────────────
//
// Canonical text format (see NOTES2.md for the full spec). A leading '#'
// opens a section header — '=' bars for the two auxiliary (non-drawn)
// sections, '-' bars for the three display (drawn) sections:
//   #======== CONSTANTS ========
//   #======== FUNCTIONS ========
//   #-------- VERTICES --------
//   #-------- SEGMENTS --------
//   #-------- CURVES --------
//   #----------------------------------------     (divider — no name)
// A '#' line that isn't one of those header-bar shapes is a plain comment —
// ignored by parsing, left exactly where it is by Sort.
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

// The canonical registry of section/object kinds — the "big shiny list"
// every future object type (and every future attribute of an existing one)
// gets added to exactly once, rather than remembering to update several
// separate hardcoded lists scattered around the file (that was the actual
// shape of the bug renameConstantEverywhere used to have).
//
// constants/functions/curves aren't (yet, or ever, for constants) real
// displayable object types with their own array — they keep only the
// section-parsing fields (key/title/style/match) they've always needed.
// vertices/segments/faces additionally carry:
//   - list: () => the live array, for anything that needs to walk every
//     instance (rename propagation today; re-eval, undo-capture, etc. are
//     candidates to migrate onto this later, opportunistically)
//   - attrs: the explicit, human-maintained checklist of this type's
//     per-instance settable fields and what kind of value each holds
//     (color / bool / number) — populated for a type once its attributes
//     are actually designed, not guessed ahead of time (curves stays [] —
//     see below — until that design happens)
//   - lastSet / pendingDefaults: accessors for the two pieces of singleton
//     "current defaults" state each of these types has (see lastSetVertex
//     and pendingVertexDefaults below) — faces have no add-row, so no
//     pendingDefaults
const OBJECT_TYPES = [
  { key: 'constants', title: 'CONSTANTS', style: 'eq',   match: /CONSTANT/i },
  { key: 'functions', title: 'FUNCTIONS', style: 'eq',   match: /FUNCTION/i },
  { key: 'vertices',  title: 'VERTICES',  style: 'dash', match: /VERT/i,
    list: () => vertices, attrs: [
      { field: 'colorExpr',   kind: 'color'  },
      { field: 'radiusExpr',  kind: 'number' },
      { field: 'visibleExpr', kind: 'bool'   },
      { field: 'labelExpr',   kind: 'bool'   },
    ], lastSet: () => lastSetVertex, pendingDefaults: () => pendingVertexDefaults },
  { key: 'segments',  title: 'SEGMENTS',  style: 'dash', match: /SEGMENT/i,
    list: () => segments, attrs: [
      { field: 'colorExpr',   kind: 'color'  },
      { field: 'widthExpr',   kind: 'number' },
      { field: 'visibleExpr', kind: 'bool'   },
    ], lastSet: () => lastSetSegment, pendingDefaults: () => pendingSegmentDefaults },
  { key: 'faces',     title: 'FACES',     style: 'dash', match: /FACE/i,
    list: () => faces, attrs: [
      { field: 'colorExpr',   kind: 'color' },
      { field: 'visibleExpr', kind: 'bool'  },
    ], lastSet: () => lastSetFace },
  // No `list`/`attrs` yet — curves aren't implemented, and their attributes
  // (if any beyond the ones above) haven't been designed. Add both once
  // that design happens; this entry existing at all is what makes it hard
  // to forget the section-parsing side of introducing them.
  { key: 'curves',    title: 'CURVES',    style: 'dash', match: /CURVE/i, attrs: [] },
];
const SECTION_ORDER = OBJECT_TYPES.map(d => d.key);

const CODE_HEADER_EQ_RE   = /^#=+\s*(.*?)\s*=+$/;
const CODE_HEADER_DASH_RE = /^#-+\s*(.*?)\s*-+$/;
const CODE_OBJECT_RE = /^(const|vertex|segment|face|function|slider|curve)\b\s*([^:]*):(.*)$/;
const CODE_SET_RE    = /^set\s+(vertex|segment|face)\s+(.+)$/;
const CODE_IDENT_RE  = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const CODE_COLOR_RE  = /^#[0-9a-fA-F]{6}$/;

// field -> canonical syntax token name (also used by tokenizeAttrs' error text)
const FIELD_TOKEN_NAME = { color: 'color', r: 'r', width: 'w', visible: 'visible', label: 'label', x: 'x', y: 'y', z: 'z' };

function formatFieldToken(field, value) {
  return `${FIELD_TOKEN_NAME[field]}=${value}`;
}

function classifyHeaderSection(headerText) {
  const def = OBJECT_TYPES.find(d => d.match.test(headerText));
  return def ? def.key : null;
}

function makeHeaderLine(style, title) {
  const bar = style === 'eq' ? '========' : '--------';
  return `#${bar} ${title} ${bar}`;
}

function makeDividerLine() {
  return '#----------------------------------------';
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
  face:    ['color', 'visible'],
};
// Text-typed (not number/boolean) for consistency — every field is raw expr
// text everywhere else now, so these fall-back defaults are too.
const BUILTIN_SET_DEFAULTS = {
  vertex:  { color: DEFAULT_COLOR, r: '5', visible: 'true', label: 'true' },
  segment: { color: DEFAULT_COLOR, width: '1.5', visible: 'true' },
  face:    { color: DEFAULT_COLOR, visible: 'true' },
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
  const stagedFaces     = [];
  // Three environments, built incrementally in the same left-to-right walk
  // as everything else — a const can only reference an earlier const of the
  // same kind, exactly like the pre-existing numeric-only rule.
  const numericEnv       = {};
  const colorEnv         = {};
  const boolEnv          = {};
  const vertexByName    = new Map(); // name -> staged vertex, built incrementally
  let autoVertexN = 0;
  let autoConstN  = 0;
  let autoFaceN   = 0;

  // Order-dependent "current set" state, like a paintbrush: a `set vertex
  // color=...` line updates this and every later vertex line that omits
  // that field picks it up, until the next `set` for that field (or file
  // end). Resolved once here at parse time into a concrete value on the
  // staged/committed object — never stored as a lazily-resolved reference —
  // so relocating a line later (Sort) can never change what it resolved to.
  const currentSet = {
    vertex:  { color: undefined, r: undefined, visible: undefined, label: undefined },
    segment: { color: undefined, width: undefined, visible: undefined },
    face:    { color: undefined, visible: undefined },
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

    // A bare `#` line that isn't one of the header-bar patterns above is a
    // plain comment — ignored by parsing/validation, and (via targetSection
    // staying null, same as 'set'/'header'/'divider') left exactly where it
    // is by Sort rather than being treated as an error or relocated.
    if (trimmed.startsWith('#')) {
      rec.kind = 'comment';
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
      const allowed = SET_FIELD_ORDER[setType];
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
        do { finalName = `k${autoConstN++}`; } while (isNameTakenIn(finalName, stagedVertices, stagedConstants, stagedFaces));
      } else if (!CODE_IDENT_RE.test(finalName)) {
        rec.valid = false; rec.errorMsg = `invalid constant name '${finalName}'`; lines.push(rec); continue;
      } else if (finalName === 'true' || finalName === 'false') {
        rec.valid = false; rec.errorMsg = `'${finalName}' is reserved and cannot be used as a constant name`; lines.push(rec); continue;
      } else if (isNameTakenIn(finalName, stagedVertices, stagedConstants, stagedFaces)) {
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
        do { finalName = `P${autoVertexN++}`; } while (isNameTakenIn(finalName, stagedVertices, stagedConstants, stagedFaces));
      } else if (!CODE_IDENT_RE.test(finalName)) {
        rec.valid = false; rec.errorMsg = `invalid vertex name '${finalName}'`; lines.push(rec); continue;
      } else if (isNameTakenIn(finalName, stagedVertices, stagedConstants, stagedFaces)) {
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

    if (keyword === 'face') {
      rec.kind = 'face';
      rec.targetSection = 'faces';
      const tok = tokenizeAttrs(rest, ['color', 'visible']);
      if (tok.error) { rec.valid = false; rec.errorMsg = tok.error; lines.push(rec); continue; }
      if (tok.positional.length < 3) {
        rec.valid = false; rec.errorMsg = `expected at least 3 vertex names, found ${tok.positional.length}`; lines.push(rec); continue;
      }
      const faceVerts = tok.positional.map(n => vertexByName.get(n));
      const missingIdx = faceVerts.findIndex(v => !v);
      if (missingIdx !== -1) {
        rec.valid = false; rec.errorMsg = `unknown vertex '${tok.positional[missingIdx]}'`; lines.push(rec); continue;
      }

      let finalName = name;
      if (finalName === '') {
        do { finalName = `F${autoFaceN++}`; } while (isNameTakenIn(finalName, stagedVertices, stagedConstants, stagedFaces));
      } else if (!CODE_IDENT_RE.test(finalName)) {
        rec.valid = false; rec.errorMsg = `invalid face name '${finalName}'`; lines.push(rec); continue;
      } else if (isNameTakenIn(finalName, stagedVertices, stagedConstants, stagedFaces)) {
        rec.valid = false; rec.errorMsg = `name '${finalName}' already used`; lines.push(rec); continue;
      }

      const faceColorExprText   = tok.attrs.color   ?? currentSet.face.color   ?? DEFAULT_COLOR;
      const faceVisibleExprText = tok.attrs.visible ?? currentSet.face.visible ?? 'true';

      const faceColorRes = resolveColorAttr(faceColorExprText, colorEnv);
      if (!faceColorRes.ok) { rec.valid = false; rec.errorMsg = `unknown color '${faceColorExprText}'`; lines.push(rec); continue; }
      const faceVisibleRes = resolveBoolAttr(faceVisibleExprText, boolEnv);
      if (!faceVisibleRes.ok) { rec.valid = false; rec.errorMsg = `invalid visible value '${faceVisibleExprText}'`; lines.push(rec); continue; }

      const obj = {
        name: finalName,
        vertexNames: faceVerts.map(v => v.name),
        color: faceColorRes.value,     colorExpr: faceColorExprText,
        visible: faceVisibleRes.value, visibleExpr: faceVisibleExprText,
      };
      stagedFaces.push(obj);
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

  return { lines, stagedConstants, stagedVertices, stagedSegments, stagedFaces, finalSet: currentSet };
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

// vertsForFace need only a `.name` each — callers may pass either full vertex
// objects (serializeState) or a staged face's resolved-name list, same
// convention as formatSegmentLine.
function formatFaceLine(vertsForFace, f) {
  const colorExpr   = f.colorExpr   ?? f.color ?? DEFAULT_COLOR;
  const visibleExpr = f.visibleExpr ?? String(f.visible !== false);
  const names = vertsForFace.map(v => v.name).join('  ');
  return `face ${f.name}: ${names}  ${formatFieldToken('color', colorExpr)}  ${formatFieldToken('visible', visibleExpr)}`;
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
  if (rec.kind === 'face')    return formatFaceLine(rec.parsed.vertexNames.map(n => ({ name: n })), rec.parsed);
  if (rec.kind === 'set')     return formatSetLine(rec.parsed);
  return rec.raw;
}

function serializeState(vertsArr, constsArr, segsArr, facesArr) {
  const out = [];
  emitSection(out, 'eq',   'CONSTANTS', constsArr.map(formatConstLine));
  emitSection(out, 'eq',   'FUNCTIONS', []);
  // Committed vertex/segment/face objects carry no memory of any `set` line
  // that once governed them individually (each one's own resolved value/expr
  // is what persists, via its own color=/r=/etc.) — but the *cluster itself*
  // remembers the last-saved governing values (lastSetVertex/lastSetSegment/
  // lastSetFace) so a fresh Load shows what you left off with, not the
  // built-in defaults.
  emitSection(out, 'dash', 'VERTICES',  buildSetBlock('vertex', lastSetVertex), vertsArr.map(formatVertexLine));
  const segLines = segsArr.map(seg => {
    const v1 = vertsArr.find(v => v.id === seg.vertexIds[0]);
    const v2 = vertsArr.find(v => v.id === seg.vertexIds[1]);
    return (v1 && v2) ? formatSegmentLine(v1, v2, seg) : null;
  }).filter(Boolean);
  emitSection(out, 'dash', 'SEGMENTS', buildSetBlock('segment', lastSetSegment), segLines);
  const faceLines = (facesArr ?? []).map(f => {
    const verts = f.vertexIds.map(id => vertsArr.find(v => v.id === id));
    return verts.every(Boolean) ? formatFaceLine(verts, f) : null;
  }).filter(Boolean);
  emitSection(out, 'dash', 'FACES', buildSetBlock('face', lastSetFace), faceLines);
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
    const def = OBJECT_TYPES.find(d => d.key === key);
    const objectLines = perSection[key].map(formatLineForOutput);
    if (key === 'vertices') {
      emitSection(out, def.style, def.title, buildSetBlock('vertex', finalSet.vertex), objectLines);
    } else if (key === 'segments') {
      emitSection(out, def.style, def.title, buildSetBlock('segment', finalSet.segment), objectLines);
    } else if (key === 'faces') {
      emitSection(out, def.style, def.title, buildSetBlock('face', finalSet.face), objectLines);
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

// ─── Face depth-ordering ──────────────────────────────────────────────────────
//
// Faces are planar, so depth is an *affine* function of pre-perspective
// projected (x,y): depth(x,y) = A*x + B*y + C. Solved once per face per frame
// from any 3 of its projected vertices (closed-form, no iteration) — this is
// what lets two faces be compared correctly at the specific point where they
// actually overlap, rather than by a lossy single "average depth" number,
// which can get the order backwards even for convex, non-scissoring geometry
// (a large tilted face's average can be dragged far from its own near-peak's
// true local depth — see the plan for the worked counterexample).
//
// That "point where they actually overlap" has to be measured in the same
// space as what's actually painted — the POST-perspective screen point (see
// applyPerspective), not the pre-perspective (x,y) the affine formula above
// is stated in. Perspective divides each face by its own d(x,y) = 1-depth/F,
// which is a different warp per face (their planes differ), so two faces can
// overlap on screen with no overlap pre-perspective, or the reverse — using
// pre-perspective (x,y) for overlap/comparison is simply asking about the
// wrong picture once perspective is on. faceScreenDepthFn below inverts the
// divide in closed form so the comparison can be done correctly, in the
// space that's actually rendered.

function det3(m) {
  return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
       - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
       + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
}

// pts: 3 points [x, y, depth]. Returns { A, B, C } (depth = A*x + B*y + C),
// or null if the 3 points are (numerically) collinear in projection — caller
// should retry with a different triple.
function solveAffineDepth(pts) {
  const M = pts.map(([x, y]) => [x, y, 1]);
  const detM = det3(M);
  if (Math.abs(detM) < 1e-9) return null;
  const col = i => pts.map(p => p[i]);
  const withCol = (base, i, replacement) => base.map((row, r) => row.map((v, c) => c === i ? replacement[r] : v));
  const A = det3(withCol(M, 0, col(2))) / detM;
  const B = det3(withCol(M, 1, col(2))) / detM;
  const C = det3(withCol(M, 2, col(2))) / detM;
  return { A, B, C };
}

// Tries consecutive vertex triples until a non-degenerate (non-collinear) one
// is found — handles the common n=3 case trivially and copes with a
// coincidentally-collinear early triple in larger polygons.
function faceAffineDepth(pts2D) {
  for (let k = 2; k < pts2D.length; k++) {
    const coeffs = solveAffineDepth([pts2D[0], pts2D[1], pts2D[k]]);
    if (coeffs) return coeffs;
  }
  return null;
}

// Given a face's pre-perspective affine depth coefficients and the focal
// distance F currently in effect (Infinity when perspective is off), returns
// a function mapping a POST-perspective screen point — after
// applyPerspective's 1/d divide, before toScreen's pixel remapping — back to
// the true depth the face has there.
//
// Derivation: screen (xs,ys) = (x,y)/d with d = 1 - depth(x,y)/F and
// depth(x,y) = A*x+B*y+C, so x = xs*d, y = ys*d. Substituting:
//   depth = A*xs*d + B*ys*d + C = d*(A*xs+B*ys) + C
//   d     = 1 - depth/F
// Solving the pair for depth directly (no iteration):
//   depth(xs,ys) = (A*xs+B*ys+C) / (1 + (A*xs+B*ys)/F)
// When F=Infinity this reduces exactly to the plain affine formula, since
// screen coordinates equal pre-perspective coordinates when there's no
// perspective divide to invert.
function faceScreenDepthFn(A, B, C, F) {
  return (xs, ys) => {
    const linear = A * xs + B * ys;
    return (linear + C) / (1 + linear / F);
  };
}

function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

function polygonCentroid(poly) {
  let sx = 0, sy = 0;
  for (const [x, y] of poly) { sx += x; sy += y; }
  return [sx / poly.length, sy / poly.length];
}

function segIntersect(p1, p2, p3, p4) {
  const [x1, y1] = p1, [x2, y2] = p2, [x3, y3] = p3, [x4, y4] = p4;
  const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
  const u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / d;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
}

// Finds every candidate point worth testing in the intersection of two
// projected polygons — centroids and their midpoint first (cheap, common
// case), then vertex-in-polygon, then edge-intersection points. Returns them
// ALL, in preference order, rather than just the first hit: for two faces
// that share a 3D edge, the shared vertices sit exactly on both polygons'
// boundary, so pointInPolygon's ray-cast test can go either way on floating-
// point noise there — a single-answer version of this function can easily
// hand back a point exactly on the shared edge, which is meaningless for
// depth comparison (see compareFaceDepths). Returning every candidate lets
// the caller skip degenerate ones and keep looking for a real one.
function findOverlapCandidates(polyA, polyB) {
  const out = [];
  const cA = polygonCentroid(polyA), cB = polygonCentroid(polyB);
  if (pointInPolygon(cA[0], cA[1], polyB)) out.push(cA);
  if (pointInPolygon(cB[0], cB[1], polyA)) out.push(cB);
  const mid = [(cA[0] + cB[0]) / 2, (cA[1] + cB[1]) / 2];
  if (pointInPolygon(mid[0], mid[1], polyA) && pointInPolygon(mid[0], mid[1], polyB)) out.push(mid);
  for (const v of polyA) if (pointInPolygon(v[0], v[1], polyB)) out.push(v);
  for (const v of polyB) if (pointInPolygon(v[0], v[1], polyA)) out.push(v);
  for (let i = 0; i < polyA.length; i++) {
    const a1 = polyA[i], a2 = polyA[(i + 1) % polyA.length];
    for (let j = 0; j < polyB.length; j++) {
      const b1 = polyB[j], b2 = polyB[(j + 1) % polyB.length];
      const pt = segIntersect(a1, a2, b1, b2);
      if (pt) out.push(pt);
    }
  }
  return out;
}

// Threshold well above float noise on a tied (shared-edge) comparison
// (observed ~1e-16) and well below any genuine depth difference observed on
// this app's scenes (observed >= ~1e-2 whenever two faces truly overlap in
// projection) — separates a real signal from a degenerate tie.
const FACE_DEPTH_TIE_EPS = 1e-6;

// Compares two faces' true depth at a point where they actually overlap in
// projection. Walks findOverlapCandidates' list and returns the delta
// (depthA - depthB) at the first candidate that isn't a near-zero tie —
// positive means A has the larger depth value (A is nearer the observer,
// draws last), negative means B is nearer.
// Returns null if every candidate is a tie (including "no overlap at all",
// which is the common case for two faces that only touch along a shared
// edge): since each face's depth is an affine function of (x,y), the two
// faces' depth difference is also affine, so it is either exactly zero
// everywhere they're both defined (coplanar) or zero only on a line — a
// candidate landing near that line, with no other candidate clearing the
// threshold, means there's no pixel where their order is actually decided,
// not that the algorithm failed to find one.
function compareFaceDepths(polyA, depthFnA, polyB, depthFnB) {
  for (const [x, y] of findOverlapCandidates(polyA, polyB)) {
    const delta = depthFnA(x, y) - depthFnB(x, y);
    if (Math.abs(delta) > FACE_DEPTH_TIE_EPS) return delta;
  }
  return null;
}

// Kahn's algorithm, modified to never fail: `edges` are [fartherIdx, nearerIdx]
// pairs (farther must draw before nearer). When stuck with a real cycle
// (genuine mutual occlusion — out of scope for Phase 1's simple layering),
// breaks it by force-picking the remaining node with the smallest average
// depth (farthest — depth is larger when nearer) rather than failing to
// produce an order at all.
function topoSortFaces(n, edges, avgDepth) {
  const inDegree = new Array(n).fill(0);
  const adj = Array.from({ length: n }, () => []);
  for (const [farther, nearer] of edges) { adj[farther].push(nearer); inDegree[nearer]++; }
  const remaining = new Set(Array.from({ length: n }, (_, i) => i));
  const order = [];
  while (remaining.size > 0) {
    let next = [...remaining].find(i => inDegree[i] === 0);
    if (next === undefined) {
      next = [...remaining].sort((a, b) => avgDepth[a] - avgDepth[b])[0];
    }
    order.push(next);
    remaining.delete(next);
    for (const nb of adj[next]) inDegree[nb]--;
  }
  return order;
}

// The pluggable ordering step: given projected+depth-annotated face items,
// returns a back-to-front draw order (indices into `items`). Everything else
// in drawFaces (projection, screen coordinates, the actual fill calls) is
// fixed pipeline around this — an alternate strategy (e.g. a precomputed
// BSP-tree traversal) can replace this function's body without touching
// anything else.
function computeFaceDrawOrder(items) {
  const edges = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const delta = compareFaceDepths(items[i].screenPoly, items[i].screenDepthFn, items[j].screenPoly, items[j].screenDepthFn);
      if (delta === null) continue; // no pixel where their order is decided
      // depth = a1*h1 + a2*h2 + a3*h3 is LARGER when a point is nearer the
      // observer. Farther (smaller depth) must draw first (painter's algorithm).
      if (delta > 0) edges.push([j, i]); else edges.push([i, j]);
    }
  }
  return topoSortFaces(items.length, edges, items.map(it => it.avgDepth));
}

// Projects every visible face's vertices, derives each one's affine depth
// formula and its screen-space equivalent, computes a back-to-front draw
// order via computeFaceDrawOrder, and fills each face in that order. Drawn
// before drawSegments/drawVertices in draw() — faces are a simple base layer
// for Phase 1, not yet interleaved in depth with the wireframe (see plan).
function drawFaces(facesArr, vertsArr, vecs, heights, scale, normS) {
  const F = perspectiveOn ? perspPtoF(perspectiveP) : Infinity;
  const items = [];
  for (const f of facesArr) {
    if (!f.visible) continue;
    const vs = f.vertexIds.map(id => vertsArr.find(v => v.id === id));
    if (vs.some(v => !v)) continue;
    const pts2D = [];      // [x, y, depth] pre-perspective, for avgDepth
    const screenPoly = []; // [x, y] post-perspective, pre-toScreen, for ordering
    const screenPts = [];  // {x,y} post-perspective pixel coords, for the fill path
    let bad = false;
    for (const v of vs) {
      const { pt, depth } = projectPoint(v.coords, vecs, heights);
      if (isNaN(depth) || isNaN(pt.re) || isNaN(pt.im)) { bad = true; break; }
      pts2D.push([pt.re, pt.im, depth]);
      const a = applyPerspective(pt, depth, normS);
      if (!a.ok) { bad = true; break; }
      screenPoly.push([a.pt.re, a.pt.im]);
      screenPts.push(toScreen(a.pt, scale));
    }
    if (bad) continue;
    const coeffs = faceAffineDepth(pts2D);
    if (!coeffs) continue; // degenerate (all vertices collinear in projection)
    items.push({
      face: f,
      screenPoly,
      screenPts,
      screenDepthFn: faceScreenDepthFn(coeffs.A, coeffs.B, coeffs.C, F),
      avgDepth: pts2D.reduce((s, p) => s + p[2], 0) / pts2D.length,
    });
  }
  if (items.length === 0) return;

  const order = computeFaceDrawOrder(items);

  for (const idx of order) {
    const { face: f, screenPts: sp } = items[idx];
    ctx.beginPath();
    ctx.moveTo(sp[0].x, sp[0].y);
    for (let k = 1; k < sp.length; k++) ctx.lineTo(sp[k].x, sp[k].y);
    ctx.closePath();
    ctx.fillStyle = themeColor(f.color);
    ctx.fill();
  }
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
  const activeFaces = codeOpen && previewOverride ? previewOverride.faces : faces;
  if (displayMode === 'B') drawDiskBoundary(base);
  if (showAxes) drawAxes(vecs, display);
  drawFaces(activeFaces, activeVerts, vecs, heights, display, s);
  drawSegments(activeSegs, activeVerts, vecs, heights, display, s);
  drawVertices(activeVerts, vecs, heights, display, s);
  if (showPointer) drawControlPoint(base);
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

  if (showPointer && Math.hypot(px - ctrlPt.x, py - ctrlPt.y) <= hitRadius) {
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
  const colorExpr = pendingSegmentDefaults.color;
  const colorRes   = resolveColorAttr(colorExpr, buildEnvs().colorEnv);
  const color      = colorRes.ok ? colorRes.value : DEFAULT_COLOR;
  const lineWidth = Math.max(0.5, parseFloat(document.getElementById('seg-width').value) || 1.5);
  const visible   = pendingSegmentDefaults.visible === 'true';
  // Clear the selection *before* snapshotting — otherwise the undo-captured
  // "before" state still has both vertices selected, and undoing restores
  // that stale selection, corrupting the next segment (its two leftover
  // members get silently reused as the "first two" the next time a third
  // vertex is clicked, recreating the just-undone segment instead of
  // forming a new one).
  selectedVertexIds.clear();
  snapshot();
  segments.push({
    id: nextSegmentId++, vertexIds: [id1, id2], color, lineWidth, visible,
    colorExpr, widthExpr: String(lineWidth), visibleExpr: String(visible),
  });
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

document.getElementById('btn-show-pointer').addEventListener('click', () => {
  showPointer = !showPointer;
  document.getElementById('btn-show-pointer').classList.toggle('active', showPointer);
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
  renderFaceList();
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
      renderVertexList();
      renderSegmentList();
      renderFaceList();
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
      reEvalObjects(); renderConstList(); renderVertexList(); renderSegmentList(); renderFaceList(); draw();
    });

    entry.append(btnSlot, nameInp, eq, exprInp, valSpan, del);
    list.appendChild(entry);
  }

  // Constants changing (add/edit/rename/delete) is exactly when a color
  // linked in an add-row needs its live preview/grid refreshed too.
  renderAddRowDefaults();
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

// ─── Add-row defaults (mirrors code-file `set` values) ─────────────────────────
//
// pendingVertexDefaults/pendingSegmentDefaults are what addVertexFromInputs()/
// checkSelectionComplete() actually use when creating a new object — a two-
// step refresh mirroring the buildEnvs()/reEvalObjects() split: sync (rare —
// only when the underlying last-saved values change, i.e. on code-file exit)
// vs. render (frequent — called via the renderConstList() hook below so a
// color linked to a constant stays live as that constant is edited).

// Copies lastSetVertex/lastSetSegment (raw expr text, possibly undefined per
// field) into the pending-defaults state, falling back to BUILTIN_SET_DEFAULTS
// exactly like buildSetBlock() does for the code file's own display.
function syncAddRowDefaultsFromLastSet() {
  for (const field of SET_FIELD_ORDER.vertex)
    pendingVertexDefaults[field] = lastSetVertex[field] ?? BUILTIN_SET_DEFAULTS.vertex[field];
  for (const field of SET_FIELD_ORDER.segment)
    pendingSegmentDefaults[field] = lastSetSegment[field] ?? BUILTIN_SET_DEFAULTS.segment[field];
}

// Shared by all 4 "color picker" locations (vertex/segment x add-row/edit-
// mode): one row button (rowBtn) opens a small popover showing, all at once
// (no mode-switching): a scrollable list of preset colors, a scrollable list
// of color constants (own field, independent scroll from presets so a long
// preset list never buries the constants), and a "Custom…" control for
// reaching an arbitrary color. That control is a real native
// <input type="color"> overlaid (invisible) directly on top of a decorative
// "Custom…" label — not a button forwarding a synthetic .click() into a
// hidden input. Safari doesn't reliably honor a forwarded click as user-
// initiated for this input type, so the click that opens the OS picker has
// to be genuinely real; this function never touches that input's click
// behavior at all, only its input/change events.
//
// getExpr()/setExpr(value) read/write whatever the caller's linkable field is
// (pendingVertexDefaults.color, or a live vertex/segment's colorExpr) — this
// function only knows about the DOM. onLiteralChange(hex) fires on every
// native-input tick (cheap: model + rowBtn preview + draw() only, no DOM
// rebuild, since a rebuild mid-drag could close the OS color picker).
// onPicked() fires once, after a preset/constant is clicked (or a custom
// pick finishes) and the popover has already closed, so it's safe for it to
// do a full re-render.
//
// Popover position is computed from rowBtn's bounding rect (position:fixed)
// rather than a CSS-relative ancestor, so it isn't clipped by the vertex/
// segment list's own overflow:auto scrolling.
function setupColorPicker(rowBtn, popoverEl, presetListEl, constListEl, nativeInput, getExpr, setExpr, onLiteralChange, onPicked) {
  function onOutsideClick(e) {
    if (e.target !== rowBtn && !popoverEl.contains(e.target)) close();
  }

  // Anchored below-and-right of rowBtn by default, but clamped to the
  // viewport: if there isn't room below, the popover shifts up so its own
  // bottom edge lands at the viewport's bottom edge (not the button's); same
  // idea horizontally. Measuring real offsetWidth/Height requires the
  // popover to already be laid out (display:flex), so it's briefly measured
  // invisibly before being revealed at its final position to avoid a
  // visible jump.
  function open() {
    refresh();
    popoverEl.style.visibility = 'hidden';
    popoverEl.style.top  = '0px';
    popoverEl.style.left = '0px';
    popoverEl.style.display = 'flex';
    const r       = rowBtn.getBoundingClientRect();
    const popRect = popoverEl.getBoundingClientRect();
    const margin  = 4;
    let top  = r.bottom + margin;
    let left = r.left;
    top  = Math.min(top,  window.innerHeight - popRect.height - margin);
    left = Math.min(left, window.innerWidth  - popRect.width  - margin);
    top  = Math.max(top,  margin);
    left = Math.max(left, margin);
    popoverEl.style.top  = top  + 'px';
    popoverEl.style.left = left + 'px';
    popoverEl.style.visibility = '';
    document.addEventListener('pointerdown', onOutsideClick, true);
  }
  function close() {
    popoverEl.style.display = 'none';
    document.removeEventListener('pointerdown', onOutsideClick, true);
  }

  rowBtn.addEventListener('click', () => {
    if (popoverEl.style.display === 'none') open(); else close();
  });
  nativeInput.addEventListener('input', () => onLiteralChange(nativeInput.value));
  // A custom pick needs its own refresh() — unlike preset/constant clicks
  // (whose row handlers already trigger one via onPicked), nothing else
  // would clear a stale .linked highlight left over from before this pick.
  nativeInput.addEventListener('change', () => { onLiteralChange(nativeInput.value); refresh(); close(); });

  function makeRow(name, hex, linked, onClick) {
    const row = document.createElement('div');
    row.className = 'color-preset-row' + (linked ? ' linked' : '');
    const swatch = document.createElement('span');
    swatch.className = 'v-swatch';
    swatch.style.background = hex;
    row.append(swatch, document.createTextNode(name));
    row.addEventListener('click', onClick);
    return row;
  }

  // Rebuilds both lists — called whenever `constants` changes (via
  // renderAddRowDefaults/renderConstList for add-rows) or, for edit-mode,
  // simply because the whole row is rebuilt fresh on every relevant render.
  function refresh() {
    presetListEl.innerHTML = '';
    for (const p of PRESET_COLORS) {
      presetListEl.appendChild(makeRow(p.name, p.hex, getExpr() === p.hex, () => {
        setExpr(p.hex);
        close();
        onPicked();
      }));
    }

    constListEl.innerHTML = '';
    const colorConsts = constants.filter(c => c.kind === 'color');
    if (colorConsts.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'color-const-row empty';
      empty.textContent = 'No color constants yet';
      constListEl.appendChild(empty);
    } else {
      for (const c of colorConsts) {
        const row = makeRow(c.name, c.value, getExpr() === c.name, () => {
          setExpr(c.name);
          close();
          onPicked();
        });
        row.classList.replace('color-preset-row', 'color-const-row');
        constListEl.appendChild(row);
      }
    }
  }

  return { refresh, close };
}

function renderAddRowDefaults() {
  const { numericEnv, colorEnv, boolEnv } = buildEnvs();

  const vColorRes = resolveColorAttr(pendingVertexDefaults.color, colorEnv);
  const vColorResolved = vColorRes.ok ? vColorRes.value : DEFAULT_COLOR;
  document.getElementById('v-color').value = vColorResolved;
  document.getElementById('v-color-btn').style.background = vColorResolved;
  const vRadiusRes = resolveNumAttr(pendingVertexDefaults.r, numericEnv);
  document.getElementById('v-radius').value = vRadiusRes.ok ? vRadiusRes.value : 5;
  // visible/label have no constant-linking UI (snapshot-only) — collapse
  // straight to a resolved literal 'true'/'false', there's no raw reference
  // worth preserving once resolved.
  const vVisibleRes = resolveBoolAttr(pendingVertexDefaults.visible, boolEnv);
  const vLabelRes   = resolveBoolAttr(pendingVertexDefaults.label, boolEnv);
  pendingVertexDefaults.visible = String(vVisibleRes.ok ? vVisibleRes.value : true);
  pendingVertexDefaults.label   = String(vLabelRes.ok   ? vLabelRes.value   : true);
  const vVisibleBtn = document.getElementById('v-add-visible');
  const vLabelBtn   = document.getElementById('v-add-label');
  vVisibleBtn.textContent   = pendingVertexDefaults.visible === 'true' ? '●' : '○';
  vVisibleBtn.style.opacity = pendingVertexDefaults.visible === 'true' ? '1' : '0.3';
  vLabelBtn.style.opacity   = pendingVertexDefaults.label   === 'true' ? '1' : '0.3';
  vColorPicker.refresh();

  const sColorRes = resolveColorAttr(pendingSegmentDefaults.color, colorEnv);
  const sColorResolved = sColorRes.ok ? sColorRes.value : DEFAULT_COLOR;
  document.getElementById('seg-color').value = sColorResolved;
  document.getElementById('seg-color-btn').style.background = sColorResolved;
  const sWidthRes = resolveNumAttr(pendingSegmentDefaults.width, numericEnv);
  document.getElementById('seg-width').value = sWidthRes.ok ? sWidthRes.value : 1.5;
  const sVisibleRes = resolveBoolAttr(pendingSegmentDefaults.visible, boolEnv);
  pendingSegmentDefaults.visible = String(sVisibleRes.ok ? sVisibleRes.value : true);
  const sVisibleBtn = document.getElementById('seg-add-visible');
  sVisibleBtn.textContent   = pendingSegmentDefaults.visible === 'true' ? '●' : '○';
  sVisibleBtn.style.opacity = pendingSegmentDefaults.visible === 'true' ? '1' : '0.3';
  segColorPicker.refresh();
}

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

      const colorBtn = document.createElement('button');
      colorBtn.className = 'color-picker-btn';
      colorBtn.title = 'Color';
      colorBtn.style.background = v.color;

      const colorPopover = document.createElement('div');
      colorPopover.className = 'color-popover';
      colorPopover.style.display = 'none';

      const presetLabel = document.createElement('div');
      presetLabel.className = 'color-section-label';
      presetLabel.textContent = 'Presets';
      const presetList = document.createElement('div');
      presetList.className = 'color-preset-list';

      const constLabel = document.createElement('div');
      constLabel.className = 'color-section-label';
      constLabel.textContent = 'Constants';
      const colorGrid = document.createElement('div');
      colorGrid.className = 'color-const-list';

      const customWrap = document.createElement('div');
      customWrap.className = 'color-custom-wrap';
      const customBtn = document.createElement('div');
      customBtn.className = 'color-custom-btn';
      customBtn.textContent = 'Custom…';

      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = v.color;
      colorInput.className = 'color-native-overlay';

      customWrap.append(customBtn, colorInput);
      colorPopover.append(presetLabel, presetList, constLabel, colorGrid, customWrap);

      setupColorPicker(colorBtn, colorPopover, presetList, colorGrid, colorInput,
        () => v.colorExpr,
        name => { v.colorExpr = name; },
        hex => { v.color = hex; v.colorExpr = hex; colorBtn.style.background = hex; draw(); },
        () => {
          const r = resolveColorAttr(v.colorExpr, buildEnvs().colorEnv);
          if (r.ok) v.color = r.value;
          draw();
          renderVertexList();
        }
      ).refresh();

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

      mainRow.append(colorBtn, colorPopover, nameInput, radiusInp, commitBtn, cancelBtn);
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
  updateListToggle('vertex');
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
  // Color comes from pendingVertexDefaults (not the native input directly) so
  // a constant link survives into the new vertex's colorExpr — the native
  // input can only ever show the resolved literal preview. Radius has no
  // linking UI, so it's read straight off its own live input as always.
  const colorExpr = pendingVertexDefaults.color;
  const colorRes   = resolveColorAttr(colorExpr, buildEnvs().colorEnv);
  const color      = colorRes.ok ? colorRes.value : DEFAULT_COLOR;
  const radius     = Math.max(1, parseFloat(document.getElementById('v-radius').value) || 5);
  const visible    = pendingVertexDefaults.visible === 'true';
  const showLabel  = pendingVertexDefaults.label   === 'true';
  snapshot();
  vertices.push({
    id: nextVertexId++, name, coords: vals, exprs, color, radius, visible, showLabel,
    colorExpr, radiusExpr: String(radius), visibleExpr: String(visible), labelExpr: String(showLabel),
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

// Touching the native swatch directly always flattens to a literal, exactly
// like every other "materialize on touch" GUI control in this codebase.
vColorPicker = setupColorPicker(
  document.getElementById('v-color-btn'),
  document.getElementById('v-color-popover'),
  document.getElementById('v-color-presets'),
  document.getElementById('v-color-grid'),
  document.getElementById('v-color'),
  () => pendingVertexDefaults.color,
  name => { pendingVertexDefaults.color = name; },
  hex => { pendingVertexDefaults.color = hex; document.getElementById('v-color-btn').style.background = hex; },
  renderAddRowDefaults
);

document.getElementById('v-add-more').addEventListener('click', () => {
  const row  = document.getElementById('v-add-extra');
  const btn  = document.getElementById('v-add-more');
  const open = row.style.display === 'none';
  row.style.display = open ? '' : 'none';
  btn.classList.toggle('active', open);
});
document.getElementById('v-add-label').addEventListener('click', () => {
  pendingVertexDefaults.label = pendingVertexDefaults.label === 'true' ? 'false' : 'true';
  renderAddRowDefaults();
});
document.getElementById('v-add-visible').addEventListener('click', () => {
  pendingVertexDefaults.visible = pendingVertexDefaults.visible === 'true' ? 'false' : 'true';
  renderAddRowDefaults();
});

// ─── Segment edit mode ────────────────────────────────────────────────────────

function enterSegmentEditMode(id) {
  editingSegmentId       = id;
  editingSegmentOriginal = captureState();
  updateUndoButtons();
  renderSegmentList();
  renderFaceList();
}

function commitSegmentEdit() {
  undoStack.push(editingSegmentOriginal);
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack              = [];
  editingSegmentId       = null;
  editingSegmentOriginal = null;
  updateUndoButtons();
  renderSegmentList();
  renderFaceList();
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
  renderFaceList();
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

      const colorBtn = document.createElement('button');
      colorBtn.className = 'color-picker-btn';
      colorBtn.title = 'Color';
      colorBtn.style.background = seg.color;

      const colorPopover = document.createElement('div');
      colorPopover.className = 'color-popover';
      colorPopover.style.display = 'none';

      const presetLabel = document.createElement('div');
      presetLabel.className = 'color-section-label';
      presetLabel.textContent = 'Presets';
      const presetList = document.createElement('div');
      presetList.className = 'color-preset-list';

      const constLabel = document.createElement('div');
      constLabel.className = 'color-section-label';
      constLabel.textContent = 'Constants';
      const colorGrid = document.createElement('div');
      colorGrid.className = 'color-const-list';

      const customWrap = document.createElement('div');
      customWrap.className = 'color-custom-wrap';
      const customBtn = document.createElement('div');
      customBtn.className = 'color-custom-btn';
      customBtn.textContent = 'Custom…';

      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = seg.color;
      colorInput.className = 'color-native-overlay';

      customWrap.append(customBtn, colorInput);
      colorPopover.append(presetLabel, presetList, constLabel, colorGrid, customWrap);

      setupColorPicker(colorBtn, colorPopover, presetList, colorGrid, colorInput,
        () => seg.colorExpr,
        name => { seg.colorExpr = name; },
        hex => { seg.color = hex; seg.colorExpr = hex; colorBtn.style.background = hex; draw(); },
        () => {
          const r = resolveColorAttr(seg.colorExpr, buildEnvs().colorEnv);
          if (r.ok) seg.color = r.value;
          draw();
          renderSegmentList();
        }
      ).refresh();

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

      entry.append(colorBtn, colorPopover, label, widthInp, commitBtn, cancelBtn);

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
  updateListToggle('segment');
}

// Read-only for Phase 1 (per plan) — visibility toggle + delete only, no
// edit mode, no color popover, no canvas selection. Faces are defined in the
// code file only; this list is for quick control, not creation.
function renderFaceList() {
  const list   = document.getElementById('face-list');
  const savedScroll = list.scrollTop;
  list.innerHTML = '';
  const inEdit = editingVertexId !== null || editingSegmentId !== null;

  for (const f of faces) {
    const entry = document.createElement('div');
    entry.className = 'segment-entry';

    const swatch = document.createElement('span');
    swatch.className = 's-swatch';
    swatch.style.background = f.color;

    const label = document.createElement('span');
    label.className = 's-name';
    label.textContent = f.name;

    const toggle = document.createElement('button');
    toggle.className = 'v-toggle';
    toggle.textContent = f.visible ? '●' : '○';
    toggle.title = f.visible ? 'Hide' : 'Show';
    toggle.disabled = inEdit;
    toggle.addEventListener('click', () => {
      snapshot();
      f.visible = !f.visible;
      f.visibleExpr = String(f.visible);
      renderFaceList();
      draw();
    });

    const del = document.createElement('button');
    del.className = 'v-delete';
    del.textContent = '×';
    del.title = 'Delete';
    del.disabled = inEdit;
    del.addEventListener('click', () => {
      snapshot();
      faces = faces.filter(x => x.id !== f.id);
      renderFaceList();
      draw();
    });

    entry.append(swatch, label, toggle, del);
    list.appendChild(entry);
  }
  list.scrollTop = savedScroll;
  updateListToggle('face');
}

// ─── Collapsible object-list sections (Display submenu) ───────────────────────

const LIST_SECTION_COUNTS = { vertex: () => vertices.length, segment: () => segments.length, face: () => faces.length };

function updateListToggle(key) {
  const btn     = document.querySelector(`.list-toggle[data-list="${key}"]`);
  const section = document.querySelector(`.list-section[data-list="${key}"]`);
  const list    = document.getElementById(`${key}-list`);
  const open    = listSectionOpen[key];
  // Open: just a compact arrow overlaid in the list's own gutter (see
  // .list-toggle-compact) — the label+count only earn a full row when
  // closed, since that's the only state where nothing else is showing.
  btn.textContent = open ? '▾' : `▸ ${btn.dataset.label} (${LIST_SECTION_COUNTS[key]()})`;
  btn.classList.toggle('list-toggle-compact', open);
  section.classList.toggle('list-open', open);
  list.style.display = open ? '' : 'none';
  btn.disabled = editingVertexId !== null || editingSegmentId !== null;
}

document.querySelectorAll('.list-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.list;
    listSectionOpen[key] = !listSectionOpen[key];
    updateListToggle(key);
  });
});

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

segColorPicker = setupColorPicker(
  document.getElementById('seg-color-btn'),
  document.getElementById('seg-color-popover'),
  document.getElementById('seg-color-presets'),
  document.getElementById('seg-color-grid'),
  document.getElementById('seg-color'),
  () => pendingSegmentDefaults.color,
  name => { pendingSegmentDefaults.color = name; },
  hex => { pendingSegmentDefaults.color = hex; document.getElementById('seg-color-btn').style.background = hex; },
  renderAddRowDefaults
);

document.getElementById('seg-add-more').addEventListener('click', () => {
  const row  = document.getElementById('seg-add-extra');
  const btn  = document.getElementById('seg-add-more');
  const open = row.style.display === 'none';
  row.style.display = open ? '' : 'none';
  btn.classList.toggle('active', open);
});
document.getElementById('seg-add-visible').addEventListener('click', () => {
  pendingSegmentDefaults.visible = pendingSegmentDefaults.visible === 'true' ? 'false' : 'true';
  renderAddRowDefaults();
});

// ─── Controls panel toggle ────────────────────────────────────────────────────

document.getElementById('btn-toggle-controls').addEventListener('click', () => {
  const body = document.getElementById('controls-main');
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
  const newFaces = staged.stagedFaces.map((f, i) => ({
    id: i,
    name: f.name,
    vertexIds: f.vertexNames.map(n => nameToId.get(n)),
    color: f.color,     colorExpr: f.colorExpr,
    visible: f.visible, visibleExpr: f.visibleExpr,
  }));
  return { newVertices, newConstants, newSegments, newFaces };
}

function refreshCodeGutterAndErrors() {
  const gutter    = document.getElementById('code-gutter');
  const errorList = document.getElementById('code-error-list');
  const textarea  = document.getElementById('code-textarea');
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
        const lines = textarea.value.split('\n');
        let pos = 0;
        for (let j = 0; j < i; j++) pos += lines[j].length + 1;
        textarea.focus();
        textarea.setSelectionRange(pos, pos + lines[i].length);
      });
      errorList.appendChild(errRow);
    }
  });

  // Rebuilding via innerHTML = '' resets the gutter's own scrollTop to 0 —
  // restore it to match the textarea's current scroll position immediately,
  // rather than leaving the two desynced until the next native scroll event
  // on the textarea happens to fire and correct it.
  gutter.scrollTop = textarea.scrollTop;
}

// Synchronous reparse + staged preview refresh. Called whenever the caret
// leaves a line that actually changed (see the line-tracking listeners near
// the bottom of this section) and directly by Sort/Save/Exit, which always
// need up-to-date results regardless of caret position.
function reparseAndPreview() {
  const textarea = document.getElementById('code-textarea');
  const staged = parseCodeText(textarea.value);
  codeLineRecords = staged.lines;
  const { newVertices, newSegments, newFaces } = buildCommittedArraysFromStaged(staged);
  previewOverride = { vertices: newVertices, segments: newSegments, faces: newFaces };
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
  const { newVertices, newConstants, newSegments, newFaces } = buildCommittedArraysFromStaged(staged);

  // Remember this save's governing `set` values so the next Load starts
  // from here instead of resetting to the built-in defaults.
  lastSetVertex  = { ...staged.finalSet.vertex };
  lastSetSegment = { ...staged.finalSet.segment };
  lastSetFace    = { ...staged.finalSet.face };

  snapshot();
  vertices          = newVertices;
  nextVertexId      = newVertices.length;
  constants         = newConstants;
  nextConstantId    = newConstants.length;
  segments          = newSegments;
  nextSegmentId     = newSegments.length;
  faces             = newFaces;
  nextFaceId        = newFaces.length;
  selectedVertexIds = new Set();
  focusedVertexId   = null;
  selectedSegmentId = null;

  reEvalObjects();
  renderConstList();
  renderVertexList();
  renderSegmentList();
  renderFaceList();
  previewOverride = null;
  draw();

  codeLineRecords = staged.lines;
  refreshCodeGutterAndErrors();
  resetCodeLineTracking();
}

// Remembers which of Aux/Display were open before the Code submenu forced
// them shut, so closeCodeSubmenu() can restore exactly that state instead of
// leaving them permanently hidden.
let _preCodeSubVisibility = null;

function openCodeSubmenu() {
  if (editingVertexId !== null)  cancelEdit();
  if (editingSegmentId !== null) cancelSegmentEdit();

  _preCodeSubVisibility = {
    aux:  document.getElementById('sub-aux').style.display  !== 'none',
    disp: document.getElementById('sub-disp').style.display !== 'none',
  };

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
  textarea.value = serializeState(vertices, constants, segments, faces);
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

  if (_preCodeSubVisibility) {
    document.getElementById('sub-aux').style.display = _preCodeSubVisibility.aux ? '' : 'none';
    document.getElementById('btn-sub-aux').classList.toggle('active', _preCodeSubVisibility.aux);
    document.getElementById('sub-disp').style.display = _preCodeSubVisibility.disp ? '' : 'none';
    document.getElementById('btn-sub-disp').classList.toggle('active', _preCodeSubVisibility.disp);
    _preCodeSubVisibility = null;
  }

  // The add-rows should show whatever was last actually saved — whether this
  // particular exit came via Save+Exit or a plain Exit that discarded
  // unsaved edits, lastSetVertex/lastSetSegment already reflect that.
  syncAddRowDefaultsFromLastSet();
  renderAddRowDefaults();

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

  // The focus ring lives on the whole gutter+textarea wrap, not just the
  // textarea itself (see .code-editor-wrap.focused), so gutter and code
  // read as one cohesive unit rather than the highlight cutting between them.
  const codeEditorWrapEl = document.querySelector('.code-editor-wrap');
  codeTextareaEl.addEventListener('focus', () => codeEditorWrapEl.classList.add('focused'));
  codeTextareaEl.addEventListener('blur',  () => codeEditorWrapEl.classList.remove('focused'));

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

  // Some browsers (notably Safari on macOS) "smart"-insert an extra space on
  // either side of text pasted mid-line — tuned for prose, where you don't
  // want pasted words gluing onto their neighbors, but a real nuisance in
  // this space-sensitive syntax. Take over paste entirely and insert the
  // clipboard text exactly as copied, bypassing whatever smart-insertion
  // logic the browser would otherwise apply.
  codeTextareaEl.addEventListener('paste', e => {
    e.preventDefault();
    const text  = e.clipboardData.getData('text/plain');
    const start = codeTextareaEl.selectionStart;
    const end   = codeTextareaEl.selectionEnd;
    codeTextareaEl.setRangeText(text, start, end, 'end');
    codeCheckLineLeave(false);
  });
}

// Bidirectional so a scroll gesture can start from either side and the two
// stay locked together — e.g. the user should be able to scroll by touching
// the row-numbers column itself, not just the code. Safe from feedback loops:
// assigning a scrollTop that's already at that value doesn't fire another
// 'scroll' event, so each gesture settles after one mirrored update.
document.getElementById('code-textarea').addEventListener('scroll', () => {
  document.getElementById('code-gutter').scrollTop = document.getElementById('code-textarea').scrollTop;
});
document.getElementById('code-gutter').addEventListener('scroll', () => {
  document.getElementById('code-textarea').scrollTop = document.getElementById('code-gutter').scrollTop;
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
  document.getElementById('persp-row').style.display       = show;
  document.getElementById('scale-persp-row').style.display = show;
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
syncAddRowDefaultsFromLastSet();
renderConstList();
renderVertexList();
renderSegmentList();
renderFaceList();
resize();
