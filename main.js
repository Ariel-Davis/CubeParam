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
let omegaMode      = 'off';  // 'off' | 'on' | 'on++' — math keyboard
let logicMode      = 'off';  // 'off' | 'on' — logic keyboard (bool-kind consts only)
let addConstKind   = null;   // 'number' | 'color' | 'boolean' | null — add-row's currently picked kind
let activeExprInput    = null;   // the coord input currently focused in edit mode
let activeEndpointInput = null;  // segment endpoint input currently focused; a canvas/list vertex pick fills it instead of selecting
let _pendingScrollToVertexId = null; // vertex id | null — one-shot: the next renderVertexList scrolls this row fully into view, then clears it. Deliberately separate from focusedVertexId, which persists (drives highlighting every render) — conflating the two was the bug where an old selection kept re-stealing the scroll on every later, unrelated render (see NOTES6, "one-shot scroll-to-row").
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
let selectedFaceId    = null;      // face id highlighted in the list (list click only — no canvas face-hit-testing exists)
let faceMode          = 'off';     // 'off' | 'on' — no 'on++' yet, see getFacePickAction() area
let facePickOrder     = [];        // ordered vertex ids picked so far for a new face (order matters, unlike selectedVertexIds)
let pendingListPick   = null;      // { vertexId, btnEl, getAction, applyPick } | null — a face or segment vertex clicked from the list, awaiting its floating confirm button. btnEl is null while the vertex list section is collapsed (see updatePendingButtonPosition) — the pick itself survives, only the button's DOM presence is toggled.
// "Undo the most recently confirmed vertex" (see NOTES6/NOTES7) — a second,
// independent pair of arm states layered on top of facePickOrder/
// selectedVertexIds, not a replacement for them. armedVertexId covers both
// face's "latest" vertex and segment's sole pending vertex (which trivially
// IS "the latest," since segment never has more than one before
// completion) — one tap arms it (yellow→red in the UI), a second, separate
// tap actually removes it. faceCloseArmed is v0's own independent state
// machine for "close the loop" (blue) — structurally can never target the
// same vertex armedVertexId does (v0 is never "the latest" once
// facePickOrder.length >= 3), so no coupling between the two is needed.
let armedVertexId  = null;
let faceCloseArmed = false;
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
let lastSetVertex  = { color: undefined, r: undefined, visible: undefined, label: undefined, naming: undefined, counter: undefined };
let lastSetSegment = { color: undefined, width: undefined, visible: undefined, naming: undefined, counter: undefined };
let lastSetFace    = { color: undefined, visible: undefined, naming: undefined, counter: undefined };

// Reparsing/validation is gated on "leaving a line after changing it" (not on
// every keystroke) — these track the line the caret was in and its text as of
// entering it, so a move to a different line can tell whether anything changed.
// codeCurrentLineCount additionally tracks the *total* line count: pressing
// Enter/Backspace across two blank lines leaves the specific "left" line's
// own text unchanged (blank both before and after), which the content-only
// comparison alone can't see — but the file gained or lost a line regardless,
// which the gutter/auto-grow height need to know about just as much as an
// actual content edit would. See codeCheckLineLeave.
let codeCurrentLineIdx      = 0;
let codeCurrentLineSnapshot = '';
let codeCurrentLineCount    = 1;

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
    nextVertexId, nextSegmentId, nextFaceId, nextConstantId,
    nameCounters:      { ...nameCounters },
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
  nextVertexId           = state.nextVertexId;
  nextSegmentId          = state.nextSegmentId;
  nextFaceId             = state.nextFaceId;
  nextConstantId         = state.nextConstantId;
  nameCounters           = { ...state.nameCounters };
  editingVertexId        = null;
  editingOriginal        = null;
  editingSegmentId       = null;
  editingSegmentOriginal = null;
  focusedVertexId        = null;
  selectedSegmentId      = null;
  selectedFaceId         = null;
  activeExprInput        = null;
  activeEndpointInput    = null;
  // Undo/redo isn't blocked by faceMode the way it's blocked by an actual
  // edit — facePickOrder holds vertex ids that could now be stale once
  // vertices/faces get replaced wholesale below, same risk as the other
  // transient state reset here.
  faceMode               = 'off';
  facePickOrder          = [];
  clearPendingListPick();
  clearArmedStates();
  updateFaceButton();
  // updateSegmentButton() (unlike updateFaceButton() above) was never
  // called here before the name-preview span existed — segmentMode itself
  // is untouched by restore, only the *displayed* preview could otherwise
  // go stale relative to the just-restored nameCounters/lastSetSegment.
  updateSegmentButton();
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
  document.getElementById('btn-face').disabled       = inEdit;
  // Deliberately NOT isEditingBlocked() — that also covers codeOpen, and the
  // interpreter must stay live while the code file is open (that's its
  // primary mode). Only a genuine vertex/segment edit-in-progress disables
  // it: submitInterpreterLine()'s commit reassigns every id from scratch
  // (buildCommittedArraysFromStaged), which would silently corrupt an open
  // edit form's editingVertexId/editingSegmentId reference. codeOpen can
  // never coincide with either anyway — openCodeSubmenu() force-cancels both
  // before it sets codeOpen — so this is never blocked while Code is open.
  document.getElementById('interpreter-input').disabled = editingVertexId !== null || editingSegmentId !== null;
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
  // isFinite, not just isNaN — evalExpr can overflow to Infinity (a literal
  // like 1e400, or arithmetic like 1e200*1e200) without ever producing NaN,
  // and every caller here downstream only meant "a real, usable number."
  return Number.isFinite(v) ? { ok: true, value: v } : { ok: false };
}
function resolveBoolAttr(exprText, boolEnv) {
  if (exprText === 'true')  return { ok: true, value: true };
  if (exprText === 'false') return { ok: true, value: false };
  if (CODE_IDENT_RE.test(exprText) && exprText in boolEnv) return { ok: true, value: boolEnv[exprText] };
  return { ok: false };
}

// One dispatch point for "does this expression fit this *locked* const
// kind" — shared by buildEnvs (per-render cache refresh), parseCodeText's
// 'const' branch when a kind is declared, `edit const`'s validation, and
// the constants list row's direct value edit, so the answer is identical
// everywhere a constant's kind can no longer change but its value can.
function resolveConstByKind(kind, exprText, envs) {
  return kind === 'color'   ? resolveColorAttr(exprText, envs.colorEnv) :
         kind === 'boolean' ? resolveBoolAttr(exprText, envs.boolEnv) :
                               resolveNumAttr(exprText, envs.numericEnv);
}

// Resolves one object's full attribute set (per ATTR_DEFS[type]) against
// whatever's currently governing: an explicit per-line override first
// (`explicitAttrs` — a parsed line's own tok.attrs, or {} for the controls,
// which have no per-object override concept), then `governingText` (the
// order-dependent walk's currentSet[type] during parsing, or lastSetVertex/
// lastSetSegment/lastSetFace for the controls — identical raw-expr-text
// shape either way), then the built-in fallback. Returns { ok:true, fields }
// with both the *Expr text and the resolved value for every attribute,
// ready to spread into a vertex/segment/face literal, or { ok:false,
// errorMsg } naming the first attribute that failed to resolve.
function resolveGoverningAttrs(type, explicitAttrs, governingText, envs) {
  const fields = {};
  for (const def of ATTR_DEFS[type]) {
    const exprText = explicitAttrs[def.token] ?? governingText[def.token] ?? BUILTIN_SET_DEFAULTS[type][def.token];
    const res =
      def.kind === 'color'  ? resolveColorAttr(exprText, envs.colorEnv) :
      def.kind === 'number' ? resolveNumAttr(exprText, envs.numericEnv) :
                               resolveBoolAttr(exprText, envs.boolEnv);
    if (!res.ok) {
      const errorMsg =
        def.kind === 'color'  ? `unknown color '${exprText}'` :
        def.kind === 'number' ? `invalid ${def.label} expression '${exprText}'` :
                                 `invalid ${def.token} value '${exprText}'`;
      return { ok: false, errorMsg };
    }
    fields[def.expr] = exprText;
    fields[def.value] = res.value;
  }
  return { ok: true, fields };
}

// Same resolution rules as resolveGoverningAttrs, but for editing an
// *existing* object: only fields actually present in explicitAttrs are
// touched at all — no governing/builtin fallback for absent ones, since an
// omitted field on an edit line means "leave it alone," not "reset it to
// the current default." Returns { ok:true, fields } with just the touched
// *Expr/value pairs (spread via Object.assign onto the target, never a
// full replacement), or { ok:false, errorMsg }.
function resolveEditFields(type, explicitAttrs, envs) {
  const fields = {};
  for (const def of ATTR_DEFS[type]) {
    if (!(def.token in explicitAttrs)) continue;
    const exprText = explicitAttrs[def.token];
    const res =
      def.kind === 'color'  ? resolveColorAttr(exprText, envs.colorEnv) :
      def.kind === 'number' ? resolveNumAttr(exprText, envs.numericEnv) :
                               resolveBoolAttr(exprText, envs.boolEnv);
    if (!res.ok) {
      const errorMsg =
        def.kind === 'color'  ? `unknown color '${exprText}'` :
        def.kind === 'number' ? `invalid ${def.label} expression '${exprText}'` :
                                 `invalid ${def.token} value '${exprText}'`;
      return { ok: false, errorMsg };
    }
    fields[def.expr] = exprText;
    fields[def.value] = res.value;
  }
  return { ok: true, fields };
}

// Builds all three constant environments in one order-dependent left-to-
// right pass (a constant can only reference an earlier constant of the same
// kind). Kind is no longer guessed here — it's declared once at creation
// and stored on `c.kind` for life (see the 'const' branch of parseCodeText
// and resolveEditFields's `edit const` handling), so this just resolves
// each constant's current expression against its own already-known kind,
// mirroring the `def.kind` dispatch used throughout ATTR_DEFS-driven code.
// An expression that fails to resolve under its locked kind (e.g. a
// dangling reference after something it depended on was deleted) leaves
// `c.value` at NaN/undefined and is simply not registered in that kind's
// env, so anything referencing it fails with a clear "unknown identifier"
// rather than silently propagating a broken value.
function buildEnvs() {
  const envs = { numericEnv: {}, colorEnv: {}, boolEnv: {} };
  for (const c of constants) {
    const res = resolveConstByKind(c.kind, c.expr.trim(), envs);
    c.value = res.ok ? res.value : undefined;
    if (!res.ok) continue;
    if (c.kind === 'color') envs.colorEnv[c.name] = c.value;
    else if (c.kind === 'boolean') envs.boolEnv[c.name] = c.value;
    else envs.numericEnv[c.name] = c.value;
  }
  return envs;
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
//   - lastSet* objects' fields are always bare identifiers or literals,
//     never compound expressions, when they came from a `set` line — so a
//     plain equality check (not renameInExpr's regex) applies uniformly
//     across whatever fields each one happens to have.
function renameConstantEverywhere(oldName, newName) {
  for (const c of constants)
    c.expr = renameInExpr(c.expr, oldName, newName);

  // Which object types exist, and their per-instance/singleton state, comes
  // from OBJECT_TYPES — a type with no `list` (constants, and functions/
  // curves until implemented) simply has nothing to walk here. The actual
  // per-field scan stays driven by the `*Expr` naming convention rather than
  // any explicit per-type field list (see ATTR_DEFS, used elsewhere for
  // resolution, not renaming): that's what lets it stay correct
  // automatically as attributes are added, with nothing to remember to
  // update in this function specifically.
  for (const t of OBJECT_TYPES) {
    if (!t.list) continue;
    for (const obj of t.list()) {
      for (const f of Object.keys(obj)) {
        if (f.endsWith('Expr') && obj[f]) obj[f] = renameInExpr(obj[f], oldName, newName);
      }
    }
    const stateObj = t.lastSet?.();
    if (!stateObj) continue;
    for (const f of Object.keys(stateObj)) {
      if (stateObj[f] === oldName) stateObj[f] = newName;
    }
  }
  // Vertex coordinates (`exprs`) are the one exception: a plain array, not
  // a `*Expr`-suffixed field, so they need their own pass.
  for (const v of vertices) {
    if (v.exprs) v.exprs = v.exprs.map(e => renameInExpr(e, oldName, newName));
  }
}

function isNameTakenIn(name, vertexList, constList, faceList = [], segList = [], excludeVertexId = null, excludeConstId = null, excludeFaceId = null, excludeSegId = null) {
  return vertexList.some(v => v.name === name && v.id !== excludeVertexId)
      || constList.some(c => c.name === name && c.id !== excludeConstId)
      || faceList.some(f => f.name === name && f.id !== excludeFaceId)
      || segList.some(s => s.name === name && s.id !== excludeSegId);
}

function isNameTaken(name, excludeVertexId = null, excludeConstId = null, excludeFaceId = null, excludeSegId = null) {
  return isNameTakenIn(name, vertices, constants, faces, segments, excludeVertexId, excludeConstId, excludeFaceId, excludeSegId);
}

// Persistent per-prefix auto-name counters for controls-driven creation —
// decoupled from the id counters (nextVertexId/nextSegmentId/nextFaceId),
// which must always advance on every creation regardless of what name ends
// up used. A name counter only ever moves when an auto-generated name is
// actually consumed (including any collision skip below, folded into the
// same lookup) or when undo/redo restores a prior value — never on an
// explicit typed name, a rename, or a deletion.
let nameCounters = { P: 0, S: 0, F: 0 };

// Next free `${prefix}${n}` name, starting from that prefix's own counter
// (in whichever `counters` map — the live one above, or a code-file parse's
// own local one, see parseCodeText) and skipping past any collision (e.g. a
// hand-typed name sitting in the code file). A prefix not seen before (a
// fresh custom `naming=` template) starts from 0, same as the three
// built-in prefixes do. Doesn't mutate `counters` itself — see
// advanceAutoName/peekAutoName below, which both build on this.
function findNextAutoName(counters, prefix, isTaken) {
  let n = counters[prefix] ?? 0;
  let name = `${prefix}${n}`;
  while (isTaken(name)) { n++; name = `${prefix}${n}`; }
  return { name, n };
}

// Actually consumes the next free name — advances `counters` past it. Pure
// with respect to `counters` (the only thing it mutates) so the live and
// parse-local call sites can never resolve "next free name" differently.
function advanceAutoName(counters, prefix, isTaken) {
  const { name, n } = findNextAutoName(counters, prefix, isTaken);
  counters[prefix] = n + 1;
  return name;
}

// Read-only lookahead — same answer advanceAutoName would consume, but
// never mutates `counters`. Used by the controls' live name-preview: the
// prediction itself must not be what "consumes" a name, or merely focusing
// the add-row (or leaving "draw" engaged) would burn through the counter
// with nothing ever actually created.
function peekAutoName(counters, prefix, isTaken) {
  return findNextAutoName(counters, prefix, isTaken).name;
}

function nextAutoName(prefix) {
  return advanceAutoName(nameCounters, prefix, isNameTaken);
}

// Called after a code-file/interpreter commit (codeSave, submitInterpreterLine)
// to let an explicit `counter=` in the file carry forward into the live
// session — otherwise a `set vertex: counter=50` with no actual name
// collision at P0..P49 would have no effect on the *next* controls-driven
// "+" click, silently defeating the whole point of declaring one. Only
// moves the live counter forward (max, never regresses it) — a save that
// happened to touch this prefix less than the live session already has
// must not roll a further-along live counter backward.
function syncNameCounterFromParse(governing, defaultPrefix, staged) {
  const prefix = governing.naming ?? defaultPrefix;
  if (staged.nameCounters[prefix] === undefined) return;
  nameCounters[prefix] = Math.max(nameCounters[prefix] ?? 0, staged.nameCounters[prefix]);
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

// The two add-row color pickers (see setupColorPicker) — static DOM, wired
// once at init, refreshed on demand from renderAddRowDefaults().
let vColorPicker, segColorPicker, faceColorPicker, cAddColorPicker;

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
//   - lastSet: accessor for the type's "currently governing defaults" state
//     (see lastSetVertex below, and ATTR_DEFS/resolveGoverningAttrs, which
//     is the single source of truth for per-type settable attributes now —
//     faces have no add-row, but lastSetFace still governs bare face lines)
const OBJECT_TYPES = [
  { key: 'constants', title: 'CONSTANTS', style: 'eq',   match: /CONSTANT/i },
  { key: 'functions', title: 'FUNCTIONS', style: 'eq',   match: /FUNCTION/i },
  { key: 'vertices',  title: 'VERTICES',  style: 'dash', match: /VERT/i,
    list: () => vertices, lastSet: () => lastSetVertex },
  { key: 'segments',  title: 'SEGMENTS',  style: 'dash', match: /SEGMENT/i,
    list: () => segments, lastSet: () => lastSetSegment },
  { key: 'faces',     title: 'FACES',     style: 'dash', match: /FACE/i,
    list: () => faces, lastSet: () => lastSetFace },
  // No `list` yet — curves aren't implemented. This entry existing at all is
  // what makes it hard to forget the section-parsing side of introducing them.
  { key: 'curves',    title: 'CURVES',    style: 'dash', match: /CURVE/i },
];
const SECTION_ORDER = OBJECT_TYPES.map(d => d.key);

const CODE_HEADER_EQ_RE   = /^#=+\s*(.*?)\s*=+$/;
const CODE_HEADER_DASH_RE = /^#-+\s*(.*?)\s*-+$/;
const CODE_OBJECT_RE = /^(const|vertex|segment|face|function|slider|curve)\b\s*([^:]*):(.*)$/;
// Canonical form is colon-uniform (`set vertex: color=X`), matching every
// other line kind — but the colon is optional on read: `set vertex
// color=X` (the original, pre-decision shape) still parses, silently
// normalized to the colon form on next Sort/Save, same backward-compat
// treatment `const`'s shortcut forms already get.
const CODE_SET_RE    = /^set\s+(vertex|segment|face)(?:\s*:\s*|\s+)(.+)$/;
const CODE_EDIT_RE   = /^edit\s+(vertex|segment|face|const)\b\s*([^:]*):(.*)$/;
const CODE_IDENT_RE  = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const CODE_COLOR_RE  = /^#[0-9a-fA-F]{6}$/;

// A face's vertex list must never contain the same vertex twice — relied
// upon by the whole face-editing design (name-based `replace` is only
// well-defined if names are unique within the face) but never actually
// enforced anywhere, including at creation, until now. Shared by face
// creation here and by `replace`/`overwrite`'s result once those exist —
// a pure name-list check, independent of how the list was produced.
function hasDuplicateVertexNames(names) {
  return new Set(names).size !== names.length;
}

// Parses a `replace OLD with NEW OLD with NEW ...` payload into an ordered
// list of {old, new} pairs — shared by segment's `replace` (below) and
// face's own `replace` once it exists. Purely syntactic: doesn't know or
// care what OLD/NEW get validated against, which differs between
// segment's fixed 2-endpoint arity and face's variable-length vertex list.
function parseReplacePairs(rest) {
  const tokens = rest.trim().split(/\s+/).filter(t => t.length > 0);
  const pairs = [];
  let i = 0;
  while (i < tokens.length) {
    const oldName = tokens[i];
    if (tokens[i + 1] !== 'with' || tokens[i + 2] === undefined) {
      return { error: `expected '${oldName} with <name>'` };
    }
    pairs.push({ old: oldName, new: tokens[i + 2] });
    i += 3;
  }
  if (pairs.length === 0) return { error: `expected at least one 'OLD with NEW' pair` };
  return { pairs };
}

// Dispatches a face `edit` line's structural verb (replace/insert/remove/
// overwrite) against the target's CURRENT vertexNames, producing the
// resulting name list — or an error. `positional` is tokenizeAttrs'
// leftover bare-token list with the verb as its first element (any
// color=/visible= tokens and cosmetic semicolons were already stripped
// before this runs). One verb per line, enforced for free: a second verb
// keyword appearing later just fails to match the first verb's own
// grammar (e.g. "replace P with Q remove R" chokes on `parseReplacePairs`
// expecting "remove with <name>"), no separate check needed.
function parseFaceVertexListEdit(positional, target, vertexByName) {
  const [verb, ...rest] = positional;
  const current = target.vertexNames;

  if (verb === 'replace') {
    const parsedPairs = parseReplacePairs(rest.join(' '));
    if (parsedPairs.error) return { error: parsedPairs.error };
    // Simultaneous substitution — build the whole {old: new} map first,
    // apply once against the ORIGINAL list, never sequentially (same
    // semantics as segment's replace, and for the same reason: applying
    // pairs one at a time can pass through a momentarily-duplicate state
    // depending on listing order, when the final result is perfectly
    // valid). NEW deliberately does not need to already be a member —
    // that's the primary use case (swapping in a vertex that was never
    // part of the face, e.g. correcting a mis-picked one), not an edge case.
    const subst = {};
    for (const { old: oldName, new: newName } of parsedPairs.pairs) {
      if (!current.includes(oldName)) return { error: `'${oldName}' is not currently a member of '${target.name}'` };
      if (!vertexByName.has(newName)) return { error: `unknown vertex '${newName}'` };
      subst[oldName] = newName;
    }
    const names = current.map(n => subst[n] ?? n);
    if (hasDuplicateVertexNames(names)) return { error: 'a face cannot list the same vertex twice' };
    return { names };
  }

  if (verb === 'remove') {
    if (rest.length === 0) return { error: `expected at least one vertex name after 'remove'` };
    // Dedupe *before* the membership check — this is what makes
    // "remove P P" on a face containing P succeed as a no-op removal of P
    // once (mathematically {P,P}={P}), while "remove P9 P" where P9 isn't
    // a member still correctly fails as a whole — the second mention of a
    // repeated name is never tested against an already-depleted
    // intermediate state, because there is no intermediate state here,
    // just one set checked once against the original list.
    const toRemove = [...new Set(rest)];
    const missing = toRemove.find(n => !current.includes(n));
    if (missing) return { error: `'${missing}' is not currently a member of '${target.name}'` };
    const names = current.filter(n => !toRemove.includes(n));
    if (names.length < 3) return { error: 'a face needs at least 3 vertices' };
    return { names };
  }

  if (verb === 'insert') {
    if (rest.length !== 4 || rest[1] !== 'between') return { error: `expected 'insert NEW between A B'` };
    const [newName, , a, b] = rest;
    if (!vertexByName.has(newName)) return { error: `unknown vertex '${newName}'` };
    if (a === b) return { error: `'between' requires two distinct vertices` };
    // A and B must be currently adjacent — checked both orders, since
    // "between A B" and "between B A" describe the same unordered edge.
    // The wrap-around pair (last, first) counts as adjacent too (faces
    // render as closed polygons) and always appends to the end — the one
    // case with any real ambiguity to resolve, since an ordinary interior
    // pair already has exactly one valid splice position.
    const n = current.length;
    let insertIdx = -1;
    for (let idx = 0; idx < n; idx++) {
      const next = (idx + 1) % n;
      if ((current[idx] === a && current[next] === b) || (current[idx] === b && current[next] === a)) {
        insertIdx = (next === 0) ? n : next;
        break;
      }
    }
    if (insertIdx === -1) return { error: `'${a}' and '${b}' are not currently adjacent in '${target.name}'` };
    const names = [...current.slice(0, insertIdx), newName, ...current.slice(insertIdx)];
    if (hasDuplicateVertexNames(names)) return { error: 'a face cannot list the same vertex twice' };
    return { names };
  }

  if (verb === 'overwrite') {
    if (rest.length < 3) return { error: `expected at least 3 vertex names, found ${rest.length}` };
    const missingIdx = rest.findIndex(n => !vertexByName.has(n));
    if (missingIdx !== -1) return { error: `unknown vertex '${rest[missingIdx]}'` };
    if (hasDuplicateVertexNames(rest)) return { error: 'a face cannot list the same vertex twice' };
    return { names: [...rest] };
  }

  return { error: `unrecognized face edit verb '${verb}'` };
}
// A const's kind (number/color/bool) is declared once at creation and
// locked forever after — see the 'const' branch below and resolveConstKind.
// 'bool' is the DSL-facing keyword; internally a boolean-kind constant's
// `.kind` is still stored as 'boolean', matching every existing reader of
// that field (renderConstValSpan, buildEnvs, etc.) — only the parser needs
// to know about the shorter keyword.
const CONST_KIND_KEYWORDS = ['number', 'color', 'bool'];

// field -> canonical syntax token name (also used by tokenizeAttrs' error text)
const FIELD_TOKEN_NAME = { color: 'color', r: 'r', width: 'w', visible: 'visible', label: 'label', x: 'x', y: 'y', z: 'z', naming: 'naming', counter: 'counter' };

// Built-in auto-name prefix per type, absent any `naming=` override.
const AUTO_NAME_PREFIX = { vertex: 'P', segment: 'S', face: 'F' };

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
// `naming=` rides along here too — it's a persistent governing default
// exactly like color/r/visible/label ("template override = persistent,
// sticky, tier-2 governing state"), so it belongs in the same always-
// redisplayed cluster, and needs to be for a real reason beyond
// consistency: serializeState()'s reconstructed text is the *only* thing a
// later parse (a second interpreter submission, reopening the code file)
// has to go on — if naming= weren't redeclared here, that later parse would
// silently forget which prefix currently governs.
const SET_FIELD_ORDER = {
  vertex:  ['color', 'r', 'visible', 'label', 'naming'],
  segment: ['color', 'width', 'visible', 'naming'],
  face:    ['color', 'visible', 'naming'],
};
// `counter=` is also settable via a `set` line, but deliberately left out
// of SET_FIELD_ORDER above — unlike naming (a stable template choice),
// counter is a one-time imperative ("jump the counter to N right now"), not
// a governing setting: its effect is applied immediately at parse time
// (seeding parseNameCounters — see parseCodeText) and from then on lives
// only in the resulting object names and the live nameCounters it advances
// (see syncNameCounterFromParse), the same way an `edit` line's effect
// lives on only in the target object it already mutated. Auto-redisplaying
// it here would also churn the file on every single object creation, which
// naming/color/etc. never do since they're stable across many creations.
const SET_SETTABLE_FIELDS = {
  vertex:  [...SET_FIELD_ORDER.vertex,  'counter'],
  segment: [...SET_FIELD_ORDER.segment, 'counter'],
  face:    [...SET_FIELD_ORDER.face,    'counter'],
};
// Text-typed (not number/boolean) for consistency — every field is raw expr
// text everywhere else now, so these fall-back defaults are too.
const BUILTIN_SET_DEFAULTS = {
  vertex:  { color: DEFAULT_COLOR, r: '5', visible: 'true', label: 'true', naming: AUTO_NAME_PREFIX.vertex },
  segment: { color: DEFAULT_COLOR, width: '1.5', visible: 'true', naming: AUTO_NAME_PREFIX.segment },
  face:    { color: DEFAULT_COLOR, visible: 'true', naming: AUTO_NAME_PREFIX.face },
};

// Per-type table of settable attributes: the set/object-line token (matches
// SET_FIELD_ORDER), the raw-text *Expr field it's stored as, the resolved-
// value field it feeds, and which resolver kind applies. resolveGoverningAttrs()
// below is the only thing that walks this — it's the single source of truth
// shared by parseCodeText (the code-file/interpreter path) and the controls'
// object-creation functions, so the two can never resolve an attribute
// differently from each other.
const ATTR_DEFS = {
  vertex: [
    { token: 'color',   expr: 'colorExpr',   value: 'color',     kind: 'color'  },
    { token: 'r',       expr: 'radiusExpr',  value: 'radius',    kind: 'number', label: 'radius' },
    { token: 'visible', expr: 'visibleExpr', value: 'visible',   kind: 'bool'   },
    { token: 'label',   expr: 'labelExpr',   value: 'showLabel', kind: 'bool'   },
  ],
  segment: [
    { token: 'color',   expr: 'colorExpr',   value: 'color',     kind: 'color'  },
    { token: 'width',   expr: 'widthExpr',   value: 'lineWidth', kind: 'number', label: 'width' },
    { token: 'visible', expr: 'visibleExpr', value: 'visible',   kind: 'bool'   },
  ],
  face: [
    { token: 'color',   expr: 'colorExpr',   value: 'color',   kind: 'color' },
    { token: 'visible', expr: 'visibleExpr', value: 'visible', kind: 'bool'  },
  ],
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
    return `set ${type}: ${formatFieldToken(field, value)}`;
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
    } else if (/^v0=/.test(tok)) {
      if (!allowedAttrs.includes('v0')) return { error: `'v0=' not valid here` };
      attrs.v0 = tok.slice(3);
    } else if (/^v1=/.test(tok)) {
      if (!allowedAttrs.includes('v1')) return { error: `'v1=' not valid here` };
      attrs.v1 = tok.slice(3);
    } else if (/^w=/.test(tok)) {
      if (!allowedAttrs.includes('width')) return { error: `'w=' not valid here` };
      attrs.width = tok.slice(2);
    } else if (/^visible=/.test(tok)) {
      if (!allowedAttrs.includes('visible')) return { error: `'visible=' not valid here` };
      attrs.visible = tok.slice(8);
    } else if (/^label=/.test(tok)) {
      if (!allowedAttrs.includes('label')) return { error: `'label=' not valid here` };
      attrs.label = tok.slice(6);
    } else if (/^naming=/.test(tok)) {
      if (!allowedAttrs.includes('naming')) return { error: `'naming=' not valid here` };
      attrs.naming = tok.slice(7);
    } else if (/^counter=/.test(tok)) {
      if (!allowedAttrs.includes('counter')) return { error: `'counter=' not valid here` };
      attrs.counter = tok.slice(8);
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
  const segmentByName   = new Map(); // name -> staged segment, built incrementally (edit target lookup)
  const faceByName      = new Map(); // name -> staged face, built incrementally (edit target lookup)
  const constByName     = new Map(); // name -> staged constant, built incrementally (edit target lookup)
  let autoConstN   = 0;
  // Per-prefix auto-name counters, local to this one parse (mutations here
  // never touch the live nameCounters directly — see syncNameCounterFromParse,
  // called only after a real commit) — but *seeded* from the live session's
  // counters, not started fresh at 0. This is what carries a `naming=`/
  // `counter=` override across separate interpreter submissions: each
  // submission reparses serializeState()'s freshly-reconstructed text (which
  // only ever redeclares the *current* governing naming=, not a full history
  // of mid-file switches — see buildSetBlock), so without this seed a second
  // submission would silently forget the first one's override. Collision-
  // skip (advanceAutoName) still accounts for everything actually staged in
  // this parse regardless of the seed, so a stale/wrong seed can only waste
  // a few skip iterations, never cause an actual collision. Keyed by prefix,
  // not type, matching `naming=`'s own per-prefix (not per-type) scope — two
  // types sharing a custom prefix interleave through the same counter.
  const parseNameCounters = { ...nameCounters };

  // Order-dependent "current set" state, like a paintbrush: a `set vertex
  // color=...` line updates this and every later vertex line that omits
  // that field picks it up, until the next `set` for that field (or file
  // end). Resolved once here at parse time into a concrete value on the
  // staged/committed object — never stored as a lazily-resolved reference —
  // so relocating a line later (Sort) can never change what it resolved to.
  // `naming`/`counter` ride along in the same per-type governing state as
  // color/r/visible/label — naming picks which prefix a later blank-name
  // line of that type auto-generates from; counter (applied immediately
  // below, not deferred) seeds parseNameCounters for whichever prefix
  // currently governs at the moment the `counter=` line itself is parsed.
  const currentSet = {
    vertex:  { color: undefined, r: undefined, visible: undefined, label: undefined, naming: undefined, counter: undefined },
    segment: { color: undefined, width: undefined, visible: undefined, naming: undefined, counter: undefined },
    face:    { color: undefined, visible: undefined, naming: undefined, counter: undefined },
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

    // "edit TYPE NAME: field=value ..." — patches an object that already
    // exists (found by name), rather than defining a new one. Only touches
    // the fields actually given (resolveEditFields), applied immediately via
    // Object.assign onto the *same object reference* already staged in
    // stagedVertices/stagedSegments/stagedFaces — so the target's own line
    // already reflects the edit by the time Sort/serializeState format it.
    // targetSection stays null so Sort never relocates this line itself; it
    // gets dropped entirely once absorbed (see sortCodeText), same treatment
    // as `set`.
    const editMatch = trimmed.match(CODE_EDIT_RE);
    if (editMatch) {
      const [, editType, nameRaw, editRest] = editMatch;
      rec.kind = 'edit';
      const targetName = nameRaw.trim();
      if (targetName === '') {
        rec.valid = false; rec.errorMsg = 'edit requires an object name'; lines.push(rec); continue;
      }
      const byName = editType === 'vertex' ? vertexByName : editType === 'segment' ? segmentByName : editType === 'face' ? faceByName : constByName;
      const target = byName.get(targetName);
      if (!target) {
        rec.valid = false; rec.errorMsg = `unknown ${editType} '${targetName}'`; lines.push(rec); continue;
      }

      // A constant only ever has one editable thing — its value — so
      // `edit const NAME: value` takes a bare expression, not field=value
      // tokens like the other three types, and never touches the
      // constant's own locked kind: the new expression is resolved against
      // whatever kind this constant already has (resolveConstByKind),
      // rejected if it doesn't fit. Kind can't move between environments
      // mid-parse now that it's locked, so a later line in the same parse
      // just needs this one env entry refreshed to see the new value.
      if (editType === 'const') {
        const newExpr = editRest.trim();
        if (newExpr === '') {
          rec.valid = false; rec.errorMsg = 'edit const requires a value'; lines.push(rec); continue;
        }
        const res = resolveConstByKind(target.kind, newExpr, { numericEnv, colorEnv, boolEnv });
        if (!res.ok) {
          rec.valid = false;
          rec.errorMsg =
            target.kind === 'color'   ? `unknown color '${newExpr}'` :
            target.kind === 'boolean' ? `invalid bool value '${newExpr}'` :
                                         `invalid expression '${newExpr}'`;
          lines.push(rec); continue;
        }
        target.expr = newExpr;
        target.value = res.value;
        if (target.kind === 'color') colorEnv[target.name] = res.value;
        else if (target.kind === 'boolean') boolEnv[target.name] = res.value;
        else numericEnv[target.name] = res.value;
        rec.parsed = { editType, targetName, newExpr, newValue: res.value };
        lines.push(rec);
        continue;
      }

      // `edit segment S: replace P with Q` — addresses an endpoint by its
      // current identity instead of its v0/v1 position (useful since a
      // closed segment list doesn't show you which is which). Resolves to
      // the exact same `endpointEdits` shape v0=/v1= already produces
      // below, so every downstream consumer (this branch's own tail,
      // the interpreter's cheap-commit path) needs no changes at all —
      // only the parsing/validation differs by source.
      let fieldsRes, coordEdits = {}, endpointEdits = {}, faceVertexNames = null;
      const replaceMatch = editType === 'segment' ? editRest.trim().match(/^replace\s+(.+)$/) : null;
      if (replaceMatch) {
        const parsedPairs = parseReplacePairs(replaceMatch[1]);
        if (parsedPairs.error) { rec.valid = false; rec.errorMsg = parsedPairs.error; lines.push(rec); continue; }
        // Simultaneous substitution, not sequential — build the whole
        // {old: new} map first, apply once against the segment's ORIGINAL
        // pair, so listing order of multiple pairs never matters (same
        // semantics face's own `replace` will use).
        const subst = {};
        let replaceErr = null;
        for (const { old: oldName, new: newName } of parsedPairs.pairs) {
          if (oldName !== target.v1Name && oldName !== target.v2Name) {
            replaceErr = `'${oldName}' is not currently an endpoint of '${targetName}'`; break;
          }
          if (!vertexByName.has(newName)) { replaceErr = `unknown vertex '${newName}'`; break; }
          subst[oldName] = newName;
        }
        if (!replaceErr) {
          const finalV0 = subst[target.v1Name] ?? target.v1Name;
          const finalV1 = subst[target.v2Name] ?? target.v2Name;
          if (finalV0 === finalV1) replaceErr = 'segment endpoints must be distinct';
          else endpointEdits = { v0: finalV0, v1: finalV1 };
        }
        if (replaceErr) { rec.valid = false; rec.errorMsg = replaceErr; lines.push(rec); continue; }
        fieldsRes = { ok: true, fields: {} };
      } else if (editType === 'face') {
        // A structural verb (replace/insert/remove/overwrite) combines
        // freely with plain attribute edits on the same line, so this
        // can't be a simple "verb or attrs" branch the way segment's
        // replace is — both can appear together. tokenizeAttrs already
        // separates key=value tokens (color=/visible=) from bare ones
        // regardless of where they sit in the line, so the bare leftovers
        // (tok.positional) are exactly "the verb and its payload, if any."
        // A semicolon is purely cosmetic here (visually separating the
        // positional payload from trailing attributes) — never load-
        // bearing, so it's stripped to a space before tokenizing, same as
        // any other whitespace.
        const tok = tokenizeAttrs(editRest.replace(/;/g, ' ').trim(), ['color', 'visible']);
        if (tok.error) { rec.valid = false; rec.errorMsg = tok.error; lines.push(rec); continue; }
        fieldsRes = resolveEditFields('face', tok.attrs, { numericEnv, colorEnv, boolEnv });
        if (!fieldsRes.ok) { rec.valid = false; rec.errorMsg = fieldsRes.errorMsg; lines.push(rec); continue; }
        if (tok.positional.length > 0) {
          const verbResult = parseFaceVertexListEdit(tok.positional, target, vertexByName);
          if (verbResult.error) { rec.valid = false; rec.errorMsg = verbResult.error; lines.push(rec); continue; }
          faceVertexNames = verbResult.names;
        }
      } else {
        const allowed = ATTR_DEFS[editType].map(d => d.token);
        if (editType === 'vertex')  allowed.push('x', 'y', 'z');
        if (editType === 'segment') allowed.push('v0', 'v1');
        const tok = tokenizeAttrs(editRest.trim(), allowed);
        if (tok.error || tok.positional.length > 0) {
          rec.valid = false; rec.errorMsg = tok.error || `unexpected '${tok.positional[0]}'`; lines.push(rec); continue;
        }
        fieldsRes = resolveEditFields(editType, tok.attrs, { numericEnv, colorEnv, boolEnv });
        if (!fieldsRes.ok) { rec.valid = false; rec.errorMsg = fieldsRes.errorMsg; lines.push(rec); continue; }

        // Coordinate edits: any subset of x/y/z, each independently optional —
        // the opposite of a fresh vertex line's "all three or none" rule (see
        // the namedUsed/allThree check above), since editing is inherently
        // partial. Not part of ATTR_DEFS/resolveEditFields at all — coords
        // live in their own coords[]/exprs[] arrays, indexed 0/1/2.
        if (editType === 'vertex') {
          let coordErr = null;
          for (const axis of ['x', 'y', 'z']) {
            if (!(axis in tok.attrs)) continue;
            const exprText = tok.attrs[axis];
            const val = evalExpr(exprText, numericEnv);
            if (!Number.isFinite(val)) { coordErr = `invalid ${axis} expression '${exprText}'`; break; }
            coordEdits[axis] = { expr: exprText, value: val };
          }
          if (coordErr) { rec.valid = false; rec.errorMsg = coordErr; lines.push(rec); continue; }
        }

        // Endpoint edits: v0=/v1=, each independently optional, resolved by
        // name (staged segments reference vertices by name — v1Name/v2Name —
        // not id; ids don't exist until buildCommittedArraysFromStaged runs).
        // The *resulting* pair must be distinct, checked against whichever
        // endpoint wasn't given (falls back to the target's current one), so
        // a line editing only v0 can't silently collapse it onto the
        // already-existing v1, and vice versa.
        if (editType === 'segment') {
          let endpointErr = null;
          for (const key of ['v0', 'v1']) {
            if (!(key in tok.attrs)) continue;
            const vname = tok.attrs[key];
            if (!vertexByName.has(vname)) { endpointErr = `unknown vertex '${vname}'`; break; }
            endpointEdits[key] = vname;
          }
          if (!endpointErr) {
            const finalV0 = endpointEdits.v0 ?? target.v1Name;
            const finalV1 = endpointEdits.v1 ?? target.v2Name;
            if (finalV0 === finalV1) endpointErr = 'segment endpoints must be distinct';
          }
          if (endpointErr) { rec.valid = false; rec.errorMsg = endpointErr; lines.push(rec); continue; }
        }
      }

      Object.assign(target, fieldsRes.fields);
      for (const axis of ['x', 'y', 'z']) {
        if (!(axis in coordEdits)) continue;
        const idx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
        target.coords[idx] = coordEdits[axis].value;
        target.exprs[idx]  = coordEdits[axis].expr;
      }
      if ('v0' in endpointEdits) target.v1Name = endpointEdits.v0;
      if ('v1' in endpointEdits) target.v2Name = endpointEdits.v1;
      if (faceVertexNames) target.vertexNames = faceVertexNames;
      rec.parsed = { editType, targetName, fields: fieldsRes.fields, coordEdits, endpointEdits, faceVertexNames };
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
      const allowed = SET_SETTABLE_FIELDS[setType];
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
      // naming=/counter= aren't object attributes at all (no *Expr/value
      // pair feeds into ATTR_DEFS) — naming just needs to be a syntactically
      // valid prefix (so prefix+digits stays a valid name); counter just
      // needs to be a plain non-negative integer (a starting position, not
      // a computed expression, so a constant reference wouldn't mean
      // anything here) — and additionally bounded to a safe integer: past
      // Number.MAX_SAFE_INTEGER, `n++` in advanceAutoName/findNextAutoName
      // silently stops incrementing at all (float precision), which turns
      // that function's collision-skip loop into an infinite one the moment
      // anything ever collides with the frozen name — confirmed by an actual
      // hang during stress testing, not a theoretical concern.
      const resolveResult =
        field === 'color'   ? resolveColorAttr(rawText, colorEnv) :
        (field === 'r' || field === 'width') ? resolveNumAttr(rawText, numericEnv) :
        field === 'naming'  ? { ok: CODE_IDENT_RE.test(rawText) } :
        field === 'counter' ? { ok: /^\d+$/.test(rawText) && Number.isSafeInteger(parseInt(rawText, 10)) } :
        resolveBoolAttr(rawText, boolEnv);
      if (!resolveResult.ok) {
        rec.valid = false;
        rec.errorMsg = `invalid ${field} value '${rawText}'`;
        lines.push(rec);
        continue;
      }
      if (field === 'counter') {
        // Applied immediately, unlike every other set field (which only
        // takes effect on a later object line) — a counter's whole job is
        // seeding parseNameCounters for whichever prefix currently governs
        // this type, right here, at the moment this line is parsed.
        const prefix = currentSet[setType].naming ?? AUTO_NAME_PREFIX[setType];
        parseNameCounters[prefix] = parseInt(rawText, 10);
      }
      currentSet[setType][field] = rawText;
      rec.parsed = { setType, field, value: rawText };
      lines.push(rec);
      continue;
    }

    // "new" is optional, purely-cosmetic sugar on any creation line ("new
    // const number c: 5", "new vertex P0: ...") — stripped here before
    // matching, and never re-emitted by the canonical formatters (see
    // formatConstLine/formatVertexLine/etc.), so it never round-trips
    // through Sort/Save even when the user typed it.
    const objLine  = trimmed.replace(/^new\b\s*/, '');
    const objMatch = objLine.match(CODE_OBJECT_RE);
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

      // An optional kind token (number/color/bool) may lead the name field
      // — "const number c: 5". Declaring it locks the constant's kind for
      // life (see buildEnvs/resolveEditFields's `edit const` branch below);
      // omitting it falls back to the old shape-inference behavior, run
      // once here at creation instead of on every render, which is what
      // makes the shorter legacy forms ("const c: 5") keep working.
      const nameTokens = name === '' ? [] : name.split(/\s+/);
      let declaredKind = null;
      if (nameTokens.length && CONST_KIND_KEYWORDS.includes(nameTokens[0])) {
        const kindTok = nameTokens.shift();
        declaredKind = kindTok === 'bool' ? 'boolean' : kindTok; // 'number' | 'color'
      }
      let finalName = nameTokens.join(' ');

      if (finalName === '') {
        do { finalName = `k${autoConstN++}`; } while (isNameTakenIn(finalName, stagedVertices, stagedConstants, stagedFaces, stagedSegments));
      } else if (!CODE_IDENT_RE.test(finalName)) {
        rec.valid = false; rec.errorMsg = `invalid constant name '${finalName}'`; lines.push(rec); continue;
      } else if (finalName === 'true' || finalName === 'false' || CONST_KIND_KEYWORDS.includes(finalName)) {
        rec.valid = false; rec.errorMsg = `'${finalName}' is reserved and cannot be used as a constant name`; lines.push(rec); continue;
      } else if (isNameTakenIn(finalName, stagedVertices, stagedConstants, stagedFaces, stagedSegments)) {
        rec.valid = false; rec.errorMsg = `name '${finalName}' already used`; lines.push(rec); continue;
      }

      let kind, value, resOk = true, errMsg = 'invalid expression';
      if (declaredKind) {
        kind = declaredKind;
        const res = resolveConstByKind(kind, rest, { numericEnv, colorEnv, boolEnv });
        value = res.value; resOk = res.ok;
        errMsg = kind === 'color' ? `unknown color '${rest}'` : kind === 'boolean' ? `invalid bool value '${rest}'` : 'invalid expression';
      } else {
        // No kind declared — infer once from rest's shape: #rrggbb -> color,
        // true/false -> boolean, an identifier already known in colorEnv/
        // boolEnv -> aliases that kind, otherwise numeric.
        const asColor = resolveColorAttr(rest, colorEnv);
        const asBool  = resolveBoolAttr(rest, boolEnv);
        if (CODE_COLOR_RE.test(rest) || (asColor.ok && CODE_IDENT_RE.test(rest))) {
          kind = 'color'; value = asColor.value;
        } else if (rest === 'true' || rest === 'false' || (asBool.ok && CODE_IDENT_RE.test(rest))) {
          kind = 'boolean'; value = asBool.value;
        } else {
          kind = 'number';
          value = evalExpr(rest, numericEnv);
          resOk = Number.isFinite(value);
        }
      }
      if (!resOk) { rec.valid = false; rec.errorMsg = errMsg; lines.push(rec); continue; }

      const obj = { name: finalName, expr: rest, value, kind };
      if (kind === 'number') numericEnv[finalName] = value;
      else if (kind === 'color') colorEnv[finalName] = value;
      else boolEnv[finalName] = value;
      stagedConstants.push(obj);
      constByName.set(finalName, obj);
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
        finalName = advanceAutoName(parseNameCounters, currentSet.vertex.naming ?? AUTO_NAME_PREFIX.vertex,
          n => isNameTakenIn(n, stagedVertices, stagedConstants, stagedFaces, stagedSegments));
      } else if (!CODE_IDENT_RE.test(finalName)) {
        rec.valid = false; rec.errorMsg = `invalid vertex name '${finalName}'`; lines.push(rec); continue;
      } else if (isNameTakenIn(finalName, stagedVertices, stagedConstants, stagedFaces, stagedSegments)) {
        rec.valid = false; rec.errorMsg = `name '${finalName}' already used`; lines.push(rec); continue;
      }
      const coords = coordExprs.map(t => evalExpr(t, numericEnv));
      if (coords.some(c => !Number.isFinite(c))) {
        rec.valid = false; rec.errorMsg = 'invalid coordinate expression'; lines.push(rec); continue;
      }

      const attrRes = resolveGoverningAttrs('vertex', tok.attrs, currentSet.vertex, { numericEnv, colorEnv, boolEnv });
      if (!attrRes.ok) { rec.valid = false; rec.errorMsg = attrRes.errorMsg; lines.push(rec); continue; }

      const obj = {
        name: finalName,
        coords,
        exprs: coordExprs.slice(),
        ...attrRes.fields,
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
      if (hasDuplicateVertexNames(tok.positional)) {
        rec.valid = false; rec.errorMsg = 'a face cannot list the same vertex twice'; lines.push(rec); continue;
      }

      let finalName = name;
      if (finalName === '') {
        finalName = advanceAutoName(parseNameCounters, currentSet.face.naming ?? AUTO_NAME_PREFIX.face,
          n => isNameTakenIn(n, stagedVertices, stagedConstants, stagedFaces, stagedSegments));
      } else if (!CODE_IDENT_RE.test(finalName)) {
        rec.valid = false; rec.errorMsg = `invalid face name '${finalName}'`; lines.push(rec); continue;
      } else if (isNameTakenIn(finalName, stagedVertices, stagedConstants, stagedFaces, stagedSegments)) {
        rec.valid = false; rec.errorMsg = `name '${finalName}' already used`; lines.push(rec); continue;
      }

      const attrRes = resolveGoverningAttrs('face', tok.attrs, currentSet.face, { numericEnv, colorEnv, boolEnv });
      if (!attrRes.ok) { rec.valid = false; rec.errorMsg = attrRes.errorMsg; lines.push(rec); continue; }

      const obj = {
        name: finalName,
        vertexNames: faceVerts.map(v => v.name),
        ...attrRes.fields,
      };
      stagedFaces.push(obj);
      faceByName.set(finalName, obj);
      rec.parsed = obj;
      lines.push(rec);
      continue;
    }

    // segment — named, same as vertex/face, joining the same shared name
    // namespace (see isNameTakenIn's segList param).
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

    let finalName = name;
    if (finalName === '') {
      finalName = advanceAutoName(parseNameCounters, currentSet.segment.naming ?? AUTO_NAME_PREFIX.segment,
        n => isNameTakenIn(n, stagedVertices, stagedConstants, stagedFaces, stagedSegments));
    } else if (!CODE_IDENT_RE.test(finalName)) {
      rec.valid = false; rec.errorMsg = `invalid segment name '${finalName}'`; lines.push(rec); continue;
    } else if (isNameTakenIn(finalName, stagedVertices, stagedConstants, stagedFaces, stagedSegments)) {
      rec.valid = false; rec.errorMsg = `name '${finalName}' already used`; lines.push(rec); continue;
    }

    const attrRes = resolveGoverningAttrs('segment', tok.attrs, currentSet.segment, { numericEnv, colorEnv, boolEnv });
    if (!attrRes.ok) { rec.valid = false; rec.errorMsg = attrRes.errorMsg; lines.push(rec); continue; }

    const obj = {
      name: finalName,
      v1Name: v1.name,
      v2Name: v2.name,
      ...attrRes.fields,
    };
    stagedSegments.push(obj);
    segmentByName.set(finalName, obj);
    rec.parsed = obj;
    lines.push(rec);
  }

  return { lines, stagedConstants, stagedVertices, stagedSegments, stagedFaces, finalSet: currentSet, nameCounters: parseNameCounters };
}

function formatCoordExpr(v, i) {
  const expr = v.exprs?.[i];
  if (expr) return expr.replace(/\s+/g, '');
  return String(+v.coords[i].toFixed(6));
}

function formatConstLine(c) {
  const kindTok = c.kind === 'boolean' ? 'bool' : c.kind; // 'number' | 'color' | 'bool'
  return `const ${kindTok} ${c.name}: ${c.expr}`;
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
  return `segment ${seg.name}:  ${v1.name}  ${v2.name}  ${formatFieldToken('color', colorExpr)}  ${formatFieldToken('width', widthExpr)}  ${formatFieldToken('visible', visibleExpr)}`;
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
  return `set ${parsed.setType}: ${formatFieldToken(parsed.field, parsed.value)}`;
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
    // invalid line, so the user can see and fix it. This covers `naming=`
    // too now (SET_FIELD_ORDER includes it) — only the actual object names
    // downstream carry the historical evidence of a mid-file naming switch,
    // same as how a mid-file color switch already only shows up on the
    // objects created under it, not as a preserved trail of `set` lines.
    // `counter=` never reaches here at all (see the `field === 'counter'`
    // branch above) — its effect already applied immediately at parse time,
    // so it drops for the same reason `edit` does two branches down: nothing
    // left to re-emit once absorbed.
    if (rec.kind === 'set' && rec.valid) return;
    // A valid `edit` line's effect is already baked into its target's own
    // line (Object.assign in parseCodeText, at parse time) — it never had
    // anything of its own to re-emit, unlike `set` there's no consolidated
    // block to build either. It just vanishes once absorbed.
    if (rec.kind === 'edit' && rec.valid) return;
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

// Dims an object's own color for its "ghost" marker — the ghost stands in
// for a hidden-but-currently-picked/selected object, so it needs to be
// this object's actual color, just faded, not a generic grey. Shared
// across object types (vertex today; segment/face/curve reuse this
// unchanged once each grows its own ghost-marker treatment) rather than
// duplicated per type — themeColor() is applied first so dark mode's own
// color inversion still applies underneath the fade.
function fadedColor(hex, alpha) {
  const c = themeColor(hex);
  const r = parseInt(c.slice(1, 3), 16);
  const g = parseInt(c.slice(3, 5), 16);
  const b = parseInt(c.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Pick-highlight RGB triplets shared across drawVertices' ring rendering —
// green (face pick), blue (segment pick / v0 close-armed), yellow (the
// latest confirmed vertex, unarmed), red (the latest confirmed vertex,
// armed for removal). Rings are recolored via this map rather than layering
// an extra ring on top, per the user's correction (NOTES7) — same shape,
// different hue, so the arm state reads as "this vertex," not "an
// additional halo."
const PICK_HUE = { green: '30, 150, 90', blue: '30, 100, 220', yellow: '230, 180, 20', red: '200, 50, 50' };

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
    // A selected-but-hidden face still needs an on-canvas anchor — same
    // pattern as drawVertices/drawSegments (see NOTES6, "highlighting a
    // hidden object"). Face's only highlight state is selectedFaceId.
    if (!f.visible && f.id !== selectedFaceId) continue;
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
    // Selection halo: a wide translucent stroke along the boundary, drawn
    // before the fill so the fill's opaque interior covers its inward half
    // — same technique and color as drawSegments' own halo, applied to a
    // face's boundary (which is, after all, just a loop of segments).
    // Chosen over a true outward polygon offset specifically to avoid
    // needing to solve Minkowski-offsetting for an arbitrary — possibly
    // concave, possibly self-intersecting-once-projected — polygon.
    if (f.id === selectedFaceId) {
      ctx.save();
      ctx.strokeStyle = 'rgba(30,100,220,0.28)';
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.restore();
    }
    // Ghost fill when hidden (only reachable here because f.id ===
    // selectedFaceId, per the gate above) — same faded-real-color
    // treatment as vertex's ghost marker and segment's ghost line.
    ctx.fillStyle = f.visible ? themeColor(f.color) : fadedColor(f.color, 0.4);
    ctx.fill();
  }
}

function drawSegments(segs, verts, vecs, heights, scale, normS) {
  for (const seg of segs) {
    // A selected-but-hidden segment still needs an on-canvas anchor — same
    // reasoning as drawVertices' isHighlighted gate above (see NOTES6,
    // "highlighting a hidden object"). Segment's only highlight state is
    // selectedSegmentId (no in-progress-pick equivalent the way vertex has).
    const isHighlighted = seg.id === selectedSegmentId;
    if (!seg.visible && !isHighlighted) continue;
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
    // Ghost stand-in when hidden (only reachable here because isHighlighted
    // is true) — same faded-real-color treatment as vertex's ghost marker,
    // not a generic grey. The selection halo below is drawn at full
    // strength either way, same as vertex's glow never dimmed either.
    const strokeColor = seg.visible ? themeColor(seg.color) : fadedColor(seg.color, 0.4);
    ctx.save();
    if (perspScaleSegs) {
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.5) { ctx.restore(); continue; }
      const px = -dy / len, py = dx / len;   // unit perpendicular
      const hw1 = Math.min(w * a1.factor / 2, 10);
      const hw2 = Math.min(w * a2.factor / 2, 10);
      if (isHighlighted) {
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
      ctx.fillStyle = strokeColor;
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      if (isHighlighted) {
        ctx.strokeStyle = 'rgba(30,100,220,0.28)';
        ctx.lineWidth = w + 6;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
      }
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = isHighlighted ? w + 1 : w;
      ctx.stroke();
    }
    ctx.restore();
  }
}

// Dashed preview line through the vertices picked so far for an in-progress
// face (canvas- or list-driven) — not closed back to the first vertex, since
// the face isn't committed yet. A vertex that fails to project is just
// skipped from the polyline; this is a preview aid, not a rendered object.
function drawFacePickPreview(verts, vecs, heights, scale, normS) {
  if (faceMode === 'off' || facePickOrder.length < 2) return;
  const pts = [];
  for (const id of facePickOrder) {
    const v = verts.find(u => u.id === id);
    if (!v) continue;
    const { pt, depth } = projectPoint(v.coords, vecs, heights);
    if (isNaN(depth) || isNaN(pt.re) || isNaN(pt.im)) continue;
    const a = applyPerspective(pt, depth, normS);
    if (!a.ok) continue;
    pts.push(toScreen(a.pt, scale));
  }
  if (pts.length < 2) return;
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = 'rgba(30, 150, 90, 0.70)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  ctx.restore();
}

function drawVertices(verts, vecs, heights, scale, normS) {
  // Computed once per draw, not per vertex — both are always already a
  // member of facePickOrder/selectedVertexIds, so the isHighlighted
  // computation below needs no changes to account for them.
  const latestPickId = currentLatestPickId();
  const closePickId  = currentClosePickId();
  for (const v of verts) {
    // A picked/selected vertex still needs an on-canvas anchor even when
    // hidden (see NOTES6, "highlighting a hidden object") — projectPoint
    // et al. don't depend on visibility, so compute the highlight state
    // before deciding whether to bail out entirely. Same conditions as the
    // if/else-if chain below, loosened to "would any branch fire."
    const isHighlighted = (pendingListPick && pendingListPick.vertexId === v.id) ||
                           facePickOrder.includes(v.id) ||
                           selectedVertexIds.has(v.id) || v.id === focusedVertexId;
    if (!v.visible && !isHighlighted) continue;
    const { pt, depth } = projectPoint(v.coords, vecs, heights);
    if (isNaN(depth) || isNaN(pt.re) || isNaN(pt.im)) continue;
    const { pt: ppt, ok, factor } = applyPerspective(pt, depth, normS);
    if (!ok) continue;
    const scr = toScreen(ppt, scale);

    const baseR = v.radius ?? 5;
    const r     = perspScaleNodes ? Math.min(baseR * factor, 30) : baseR;

    // Undo-latest-vertex arm state (NOTES6/7) recolors the existing rings
    // below rather than adding a new one on top — same shape, different
    // hue, so arming reads as "this vertex changed state," not "an extra
    // halo appeared" (corrected from an earlier layered-ring draft, see
    // NOTES7). No v0 exception: v0 gets the ordinary yellow/red recolor,
    // not the close-armed blue, whenever it's also the latest
    // (facePickOrder.length === 1) — isLatest is checked first below,
    // exactly mirroring getFacePickAction's own precedence. Segment's
    // canvas gesture itself is unchanged (see selectVertexById) but
    // armedVertexId can still be set for its sole vertex via the list, so
    // the recolor applies here regardless of which entry point armed it.
    const isLatest  = v.id === latestPickId;
    const latestHue = isLatest ? (armedVertexId === v.id ? 'red' : 'yellow') : null;
    const closeHue  = (v.id === closePickId && faceCloseArmed) ? 'blue' : null;

    if (pendingListPick && pendingListPick.vertexId === v.id) {
      // Glow matches the floating button's own color (blue = use/close,
      // red = error) — fully overrides whatever static highlight this
      // vertex would otherwise show (e.g. the first-pick green), since
      // "pending confirmation" supersedes it until resolved either way.
      // pendingListPick.getAction is whichever of getFacePickAction/
      // getSegmentPickAction created this pending pick (see handleListPick).
      const isError = pendingListPick.getAction(v.id).kind === 'reject';
      ctx.save();
      ctx.beginPath();
      ctx.arc(scr.x, scr.y, r + 6, 0, 2 * Math.PI);
      ctx.fillStyle = isError ? 'rgba(200, 50, 50, 0.30)' : 'rgba(30, 100, 220, 0.30)';
      ctx.fill();
      ctx.restore();
    } else if (facePickOrder.includes(v.id) && faceMode !== 'off') {
      // Rim: ring(s) to signal an in-progress face pick — green by default,
      // recolored yellow/red when this is the latest vertex, blue when
      // this is v0 armed for closing. Double ring on the first-picked
      // vertex — re-clicking it is what closes the loop.
      const hue = PICK_HUE[latestHue ?? closeHue ?? 'green'];
      ctx.save();
      ctx.beginPath();
      ctx.arc(scr.x, scr.y, r + 4, 0, 2 * Math.PI);
      ctx.strokeStyle = `rgba(${hue}, 0.90)`;
      ctx.lineWidth = 2;
      ctx.stroke();
      if (v.id === facePickOrder[0]) {
        if (faceMode === 'on++') {
          // Fills the annulus between the two rings rather than adding a
          // third one, to indicate draw+ (stays primed for the next face)
          // without over-cluttering the first vertex's marker.
          ctx.beginPath();
          ctx.arc(scr.x, scr.y, r + 6.5, 0, 2 * Math.PI);
          ctx.strokeStyle = `rgba(${hue}, 0.55)`;
          ctx.lineWidth = 5;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(scr.x, scr.y, r + 9, 0, 2 * Math.PI);
        ctx.strokeStyle = `rgba(${hue}, 0.50)`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();
    } else if (facePickOrder.includes(v.id)) {
      // faceMode is 'off' here but the pick survived (paused, resumable via
      // "draw") — same soft-glow-instead-of-rim treatment segment mode
      // already gets when paused, just in green to stay a face vertex.
      // Always green: currentLatestPickId/currentClosePickId both gate on
      // the mode actually being active, so latestHue/closeHue are already
      // null throughout a pause — nothing to recolor here.
      ctx.save();
      ctx.beginPath();
      ctx.arc(scr.x, scr.y, r + 6, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(30, 150, 90, 0.20)';
      ctx.fill();
      ctx.restore();
    } else if (selectedVertexIds.has(v.id) && segmentMode !== 'off') {
      // Rim: crisp ring(s) to signal segment-creation selection — blue by
      // default, recolored yellow/red when armed (segment's sole pending
      // vertex is always "the latest" the moment segmentMode is active, so
      // this fires unconditionally once armed via the list).
      const hue = PICK_HUE[latestHue ?? 'blue'];
      ctx.save();
      ctx.beginPath();
      ctx.arc(scr.x, scr.y, r + 4, 0, 2 * Math.PI);
      ctx.strokeStyle = `rgba(${hue}, 0.90)`;
      ctx.lineWidth = 2;
      ctx.stroke();
      if (segmentMode === 'on++') {
        ctx.beginPath();
        ctx.arc(scr.x, scr.y, r + 9, 0, 2 * Math.PI);
        ctx.strokeStyle = `rgba(${hue}, 0.50)`;
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

    if (v.visible) {
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
    } else {
      // Ghost marker — only reachable when isHighlighted is true (see the
      // bail-out above). No stroke and no label, unlike the real marker:
      // both are part of what reads as "ghost, not actually here" rather
      // than just a dimmer version of the same thing.
      ctx.save();
      ctx.beginPath();
      ctx.arc(scr.x, scr.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = fadedColor(v.color, 0.4);
      ctx.fill();
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
  drawFacePickPreview(activeVerts, vecs, heights, display, s);
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

// Whether a pointerdown this close to the control point is about to become
// a drag (view rotation) rather than a click — used both by canvas's own
// pointerdown handler (to decide drag-vs-click) and by the
// pendingListPick-clearing listener below (rotating the view is never a
// decision about a pending pick, so it shouldn't clear one — NOTES7).
function isControlPointDragStart(e) {
  if (e.target !== canvas) return false;
  const rect      = canvas.getBoundingClientRect();
  const px        = e.clientX - rect.left;
  const py        = e.clientY - rect.top;
  const ctrlPt    = toScreen(controlPt, getBaseScale());
  const hitRadius = e.pointerType === 'touch' ? 40 : 20;
  return showPointer && Math.hypot(px - ctrlPt.x, py - ctrlPt.y) <= hitRadius;
}

// Whether a pointerdown is landing on vertexId's own on-screen position —
// the narrow condition under which the pendingListPick-clearing listener
// below should treat a canvas pointerdown as "about to confirm this exact
// pending pick" rather than "clicked elsewhere, abandon it" (NOTES7).
// Deliberately vertex-specific, not a blanket "any canvas click is fine"
// exemption: reuses the identical projection math handleCanvasClick's own
// hit test uses, so the two can never disagree about what's under the
// pointer. Visibility is irrelevant here on purpose — the whole point is
// letting a *hidden* pending vertex's ghost marker be clicked too.
function isPointerOnVertex(e, vertexId) {
  if (e.target !== canvas) return false;
  const v = vertices.find(u => u.id === vertexId);
  if (!v) return false;
  const rect                 = canvas.getBoundingClientRect();
  const px                   = e.clientX - rect.left;
  const py                   = e.clientY - rect.top;
  const display               = getDisplayScale();
  const { vecs, heights, s }  = getProjectionState();
  const { pt, depth } = projectPoint(v.coords, vecs, heights);
  if (isNaN(depth) || isNaN(pt.re) || isNaN(pt.im)) return false;
  const { pt: ppt, ok } = applyPerspective(pt, depth, s);
  if (!ok) return false;
  const scr  = toScreen(ppt, display);
  const hitR = e.pointerType === 'touch' ? 28 : 14;
  return Math.hypot(px - scr.x, py - scr.y) <= hitR;
}

canvas.addEventListener('pointerdown', e => {
  if (e.target !== canvas) return;
  if (isControlPointDragStart(e)) { dragging = true; return; }
  const rect = canvas.getBoundingClientRect();
  pointerDownData = { px: e.clientX - rect.left, py: e.clientY - rect.top, pointerType: e.pointerType };
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

// Shared by canvas vertex hits and vertex-list row clicks so the two entry
// points can never drift apart: off mode replace-selects (single-vertex
// priming), draw/draw+ mode toggles membership and may complete a segment.
function selectVertexById(id) {
  if (activeEndpointInput) {
    const v = vertices.find(u => u.id === id);
    if (!v) return;
    const next = activeEndpointInput._nextEndpointInput;
    activeEndpointInput.value = v.name;
    activeEndpointInput.dispatchEvent(new Event('input'));
    if (next) next.focus();
    return;
  }
  if (isEditingBlocked()) return;
  // The mode-dispatch branches below are only ever reached via a canvas
  // vertex hit (handleCanvasClick) — list-driven clicks either return
  // above or fall through to the plain off-mode selection below. If this
  // canvas click is confirming the exact vertex pendingListPick was
  // previewing, the global pointerdown listener deliberately left it
  // uncleared (isPointerOnVertex — see that listener's comment, NOTES7),
  // so it needs resolving here, once, right where canvas actually enters
  // the picking logic — a no-op in every other case, since the listener
  // has already cleared anything that doesn't match.
  if (faceMode !== 'off' || segmentMode !== 'off') clearPendingListPick();
  if (faceMode !== 'off') {
    applyFacePick(id);
    return;
  }
  if (segmentMode !== 'off') {
    if (selectedVertexIds.has(id)) selectedVertexIds.delete(id);
    else selectedVertexIds.add(id);
    // Canvas always resolves this directly, single tap, regardless of any
    // arm state the list may have set on this same vertex — deliberate "no
    // behavior change" for segment's own canvas gesture (see NOTES6/7); the
    // two-step arm/remove is specifically a list-side affordance here.
    armedVertexId = null;
    checkSelectionComplete();
  } else {
    // Off mode: single-vertex priming — replace any prior selection
    if (selectedVertexIds.has(id)) selectedVertexIds.delete(id);
    else { selectedVertexIds.clear(); selectedVertexIds.add(id); }
  }
  focusedVertexId   = id;
  _pendingScrollToVertexId = id;
  selectedSegmentId = null;
  selectedFaceId    = null;
  renderVertexList();
  renderSegmentList();
  renderFaceList();
  draw();
}

// Whether a HIDDEN vertex should still be canvas-clickable (NOTES7) — "any
// vertex where a click would do something," not every vertex. Deliberately
// scoped to actual picking, not off-mode priming/focus: a vertex only
// qualifies via pendingListPick (any outcome, including a reject/"error" —
// see applyFacePick) or membership in an *actively* in-progress pick
// (facePickOrder while faceMode !== 'off', selectedVertexIds while
// segmentMode !== 'off') — same active-not-paused gating
// currentLatestPickId/currentClosePickId already use. A brand-new,
// never-yet-touched candidate is correctly excluded: it has no ghost
// marker to click in the first place (drawVertices never draws one for a
// vertex that isn't already highlighted for some other reason).
function isHiddenVertexClickable(v) {
  if (pendingListPick && pendingListPick.vertexId === v.id) return true;
  if (faceMode !== 'off' && facePickOrder.includes(v.id)) return true;
  if (segmentMode !== 'off' && selectedVertexIds.has(v.id)) return true;
  return false;
}

function handleCanvasClick(px, py, pointerType) {
  // Normally all clicks are blocked while editing, but a focused segment
  // endpoint box is an exception: a vertex pick should fill it rather than
  // being swallowed, so the vertex hit test below is allowed to run.
  if (isEditingBlocked() && !activeEndpointInput) return;
  const display              = getDisplayScale();
  const { vecs, heights, s } = getProjectionState();
  const hitR = pointerType === 'touch' ? 28 : 14;

  // Vertex hit test (perspective-corrected) — hidden vertices are included
  // too, but only when isHiddenVertexClickable says clicking them would
  // actually do something (see NOTES7).
  for (const v of vertices) {
    if (!v.visible && !isHiddenVertexClickable(v)) continue;
    const { pt, depth } = projectPoint(v.coords, vecs, heights);
    if (isNaN(depth) || isNaN(pt.re) || isNaN(pt.im)) continue;
    const { pt: ppt, ok } = applyPerspective(pt, depth, s);
    if (!ok) continue;
    const scr = toScreen(ppt, display);
    if (Math.hypot(px - scr.x, py - scr.y) <= hitR) {
      selectVertexById(v.id);
      return;
    }
  }

  // A miss with a focused endpoint box: still fully editing-blocked below,
  // same as any other click that isn't a vertex pick.
  if (isEditingBlocked()) return;

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
      selectedFaceId    = null;
      focusedVertexId   = null;
      selectedVertexIds.clear();
      renderVertexList();
      renderSegmentList();
      renderFaceList();
      draw();
      return;
    }
  }

  // Empty space: clear all focus; also clear primed vertex selection in off
  // mode, and — mirroring that same rule — a paused face pick, since
  // faceMode === 'off' is the only state where there's no other resume-vs-
  // abandon signal for facePickOrder to react to.
  focusedVertexId   = null;
  selectedSegmentId = null;
  selectedFaceId    = null;
  if (segmentMode === 'off') selectedVertexIds.clear();
  if (faceMode === 'off') facePickOrder = [];
  // Empty space is always an "outside click" for the undo-latest-vertex arm
  // states, mode-active or not — unlike facePickOrder/selectedVertexIds
  // themselves, which only get wiped while paused (see above). Unlike
  // pendingListPick (see the global pointerdown listener, which already
  // clears that on any canvas click that isn't landing on the pending
  // vertex itself), armedVertexId/faceCloseArmed have no such listener
  // coverage for canvas — that listener exempts canvas entirely, since
  // every canvas-reachable path (applyFacePick, selectVertexById's segment
  // branch) already sets them explicitly in every branch — so empty space
  // needs this explicit clear too, to be one of those branches.
  clearArmedStates();
  renderVertexList();
  renderSegmentList();
  renderFaceList();
  draw();
}

// The vertex "undo the most recently confirmed vertex" currently targets,
// or null if no picking is in progress. Face: the last-pushed member of
// facePickOrder. Segment: its sole pending vertex (segment never holds more
// than one before checkSelectionComplete fires, so "most recent" and "the
// only one" already coincide — see NOTES6). Gated on the mode actually
// being active (not just paused), matching every other interactive-picking
// entry point in this file.
function currentLatestPickId() {
  if (faceMode !== 'off' && facePickOrder.length > 0) return facePickOrder[facePickOrder.length - 1];
  if (segmentMode !== 'off' && selectedVertexIds.size === 1) return [...selectedVertexIds][0];
  return null;
}

// The vertex "close the loop" currently targets, or null — always v0, and
// only once facePickOrder.length >= 3 (below that, re-picking v0 is a plain
// reject, not something to arm — see getFacePickAction). Face-only; segment
// has no closing gesture at all.
function currentClosePickId() {
  return (faceMode !== 'off' && facePickOrder.length >= 3) ? facePickOrder[0] : null;
}

// Clears both arm states — called everywhere a pick sequence is abandoned,
// completed, or replaced wholesale (mirrors every clearPendingListPick()
// call site), so an arm never survives past the context that made it
// meaningful. Safe to call unconditionally; a no-op when nothing's armed.
function clearArmedStates() {
  armedVertexId  = null;
  faceCloseArmed = false;
}

function checkSelectionComplete() {
  if (selectedVertexIds.size < 2) return;
  const [id1, id2] = [...selectedVertexIds];
  const attrRes = resolveGoverningAttrs('segment', {}, lastSetSegment, buildEnvs());
  // lastSetSegment/BUILTIN_SET_DEFAULTS.segment are always independently
  // valid — every write path validates before storing — so attrRes.ok is
  // guaranteed here.
  // Clear the selection *before* snapshotting — otherwise the undo-captured
  // "before" state still has both vertices selected, and undoing restores
  // that stale selection, corrupting the next segment (its two leftover
  // members get silently reused as the "first two" the next time a third
  // vertex is clicked, recreating the just-undone segment instead of
  // forming a new one).
  selectedVertexIds.clear();
  clearArmedStates();
  snapshot();
  // nextAutoName mutates nameCounters, so it must run after snapshot() —
  // see addVertexFromInputs for why.
  const name = nextAutoName(lastSetSegment.naming ?? AUTO_NAME_PREFIX.segment);
  segments.push({
    id: nextSegmentId++, name, vertexIds: [id1, id2], ...attrRes.fields,
  });
  if (segmentMode === 'on') segmentMode = 'off';
  updateSegmentButton();
  renderSegmentList();
}

// Pure rule for what clicking `vertexId` would do to the in-progress segment
// pick — mirrors getFacePickAction below, but a segment's fixed 2-vertex
// cardinality means there's no 'close' case: a second distinct pick always
// completes the segment automatically (checkSelectionComplete). Re-picking
// the one already-picked vertex is now 'arm'/'remove' (the undo-latest
// two-step — segment's sole pending vertex trivially IS "the latest," see
// currentLatestPickId), not the plain 'reject' this used to be — but only
// via this, the list-confirm path (see handleListPick below); the direct
// canvas path (selectVertexById) keeps its own existing single-tap
// toggle-add/remove behavior completely unchanged (see NOTES6/7, "no
// behavior change" for segment's canvas gesture).
function getSegmentPickAction(vertexId) {
  if (!selectedVertexIds.has(vertexId)) return { kind: 'append' };
  return armedVertexId === vertexId ? { kind: 'remove' } : { kind: 'arm' };
}

// List-confirm path only (see handleListPick below) — the direct canvas
// path (selectVertexById) keeps its own existing toggle-add/remove behavior
// unchanged, since that wasn't the reported gap.
function applySegmentPick(id) {
  const action = getSegmentPickAction(id);
  // Arming (unlike a plain append) requires further list interaction — the
  // user has to find and press the new "remove" button — so unlike append,
  // it needs to scroll the row into view even when the arming click itself
  // came from canvas (see NOTES7: "confirming intermediate vertices on
  // canvas is automatic, arming isn't"). Harmless/no-op when it was already
  // a list click, since the row's already visible then.
  if (action.kind === 'arm')    { armedVertexId = id; _pendingScrollToVertexId = id; renderVertexList(); draw(); return; }
  if (action.kind === 'remove') { selectedVertexIds.delete(id); armedVertexId = null; renderVertexList(); draw(); return; }
  // action.kind === 'append'
  armedVertexId = null;
  selectedVertexIds.add(id);
  checkSelectionComplete();
  renderVertexList();
  draw();
}

// Pure rule for what clicking `vertexId` would do to the in-progress face
// pick — shared by the direct canvas path (applyFacePick, below) and the
// list's pending-button label/enabled-state (renderVertexList), so the two
// can never disagree about what a given click means.
//   'append'    — a fresh vertex: add it to the end.
//   'arm'       — the latest (last-pushed) vertex, not yet armed: arm it (yellow→red).
//   'remove'    — the latest vertex, already armed: undo it, handing "latest" to the runner-up.
//   'armClose'  — v0, with >=3 already picked, not yet armed: arm the close gesture (blue).
//   'close'     — v0, with >=3 already picked, already armed: complete the face.
//   'reject'    — v0 too early (< 3 picked), or any other already-picked, non-latest vertex.
// The latest-vertex check runs first and unconditionally — v0 gets no
// exception when it's also the latest (facePickOrder.length === 1): same
// color path, same two-step, as any other vertex (see NOTES6, "Question 1").
function getFacePickAction(vertexId) {
  if (facePickOrder.length > 0 && vertexId === facePickOrder[facePickOrder.length - 1]) {
    return armedVertexId === vertexId ? { kind: 'remove' } : { kind: 'arm' };
  }
  if (facePickOrder.length > 0 && vertexId === facePickOrder[0]) {
    if (facePickOrder.length >= 3) return faceCloseArmed ? { kind: 'close' } : { kind: 'armClose' };
    return { kind: 'reject' };
  }
  if (facePickOrder.includes(vertexId)) return { kind: 'reject' };
  return { kind: 'append' };
}

// Canvas path: applies getFacePickAction's rule directly, no confirmation
// step beyond the arm states themselves baked into getFacePickAction — a
// canvas click already shows you exactly what you're clicking, so no extra
// preview layer is needed on top (see NOTES6, "confirmation/cueing exists
// only to compensate for missing disambiguating context"). Also the direct
// commit path for the list's own "latest"/"close" companion buttons and
// row clicks on an already-armable vertex (see renderVertexList) — those
// don't get a preview step either, since the arm/red or arm/blue state
// itself already *is* the confirmation.
function applyFacePick(id) {
  const action = getFacePickAction(id);
  if (action.kind === 'reject') {
    // A click elsewhere counts as abandoning whatever's currently armed —
    // mirrors pendingListPick's own clear-on-outside-click precedent.
    clearArmedStates();
    // Surfaces the same "error" feedback a reject already gets when
    // reached via the list (red row, disabled floating button, red canvas
    // glow) — previously canvas stayed completely silent on an invalid
    // click, which reads as "did my click even register?" rather than
    // "that's not a valid target" (see NOTES7). Reusing handleListPick
    // directly means canvas and list share one mechanism for this, not
    // two — and its existing _pendingScrollToVertexId assignment is what
    // scrolls the row into view for a canvas-triggered error, matching
    // the request that the information be shown once, on the spot.
    handleListPick(id, getFacePickAction, applyFacePick);
    return;
  }
  // Arming needs the list scrolled to the row even when triggered from
  // canvas — unlike a plain append (fully automatic, no further input
  // needed), arming requires the user to then find and press a button (see
  // NOTES7). Both branches set the same one-shot scroll target
  // renderVertexList already consumes.
  if (action.kind === 'arm')      { armedVertexId = id; faceCloseArmed = false; _pendingScrollToVertexId = id; renderVertexList(); draw(); return; }
  if (action.kind === 'armClose') { faceCloseArmed = true; armedVertexId = null; _pendingScrollToVertexId = id; renderVertexList(); draw(); return; }
  if (action.kind === 'remove')   { facePickOrder.pop(); armedVertexId = null; renderVertexList(); draw(); return; }
  if (action.kind === 'close')    { checkFaceComplete(); return; }
  // action.kind === 'append'
  clearArmedStates();
  facePickOrder.push(id);
  renderVertexList();
  draw();
}

function checkFaceComplete() {
  const attrRes   = resolveGoverningAttrs('face', {}, lastSetFace, buildEnvs());
  const vertexIds = [...facePickOrder];
  // Clear the pick *before* snapshotting — same reasoning as
  // checkSelectionComplete(): the undo-captured "before" state must not
  // still hold an in-progress pick, or undoing would resurrect it.
  facePickOrder = [];
  clearArmedStates();
  if (faceMode === 'on') faceMode = 'off'; // 'on++' stays primed for another face
  snapshot();
  // nextAutoName mutates nameCounters, so it must run after snapshot() —
  // see addVertexFromInputs for why.
  const name = nextAutoName(lastSetFace.naming ?? AUTO_NAME_PREFIX.face);
  faces.push({
    id: nextFaceId++, name, vertexIds, ...attrRes.fields,
  });
  updateFaceButton();
  renderFaceList();
  renderVertexList();
  draw();
}

// List-driven picking gets a confirm step canvas doesn't need — the list
// doesn't show you *where* a vertex is until you look, so a click there
// previews (highlight on canvas + list, floating button) rather than acting
// immediately. Shared by face picking (which can also "close" — revisit the
// first vertex once >=3 are picked) and segment picking (which never can,
// see getSegmentPickAction) — `getAction`/`applyPick` are stashed on
// pendingListPick itself so updatePendingButtonPosition can (re)create the
// button at any time without needing them passed back in. Cleared by the
// global pointerdown listener below on any other click, or explicitly when
// its own button is used.
function clearPendingListPick() {
  if (!pendingListPick) return;
  // btnEl can already be null — the vertex list section may be collapsed
  // (see updatePendingButtonPosition), which removes the button but keeps
  // pendingListPick itself alive.
  if (pendingListPick.btnEl) pendingListPick.btnEl.remove();
  pendingListPick = null;
}

function handleListPick(vertexId, getAction, applyPick) {
  clearPendingListPick();
  pendingListPick = { vertexId, btnEl: null, getAction, applyPick };
  // Scroll the picked row fully into view, once — previously missing
  // entirely for a list-driven pick (see NOTES6, "one-shot scroll-to-row").
  _pendingScrollToVertexId = vertexId;
  // renderVertexList() calls updatePendingButtonPosition() itself at its own
  // end, so the button gets created/positioned as a side effect of this.
  renderVertexList();
  // Pre-existing gap, caught while verifying an earlier refactor: drawVertices'
  // pendingListPick glow (blue/red fill matching this button) needs an
  // actual draw() to appear — renderVertexList() alone never repainted the
  // canvas, so a list-driven pending pick's canvas-side highlight never
  // actually showed (for face either, before that fix).
  draw();
}

function handleFaceListPick(vertexId) {
  handleListPick(vertexId, getFacePickAction, applyFacePick);
}

function handleSegmentListPick(vertexId) {
  handleListPick(vertexId, getSegmentPickAction, applySegmentPick);
}

// Repositions (or creates/hides) the floating "use"/"error"/"close" button
// for the current pendingListPick, based on where its row currently sits
// relative to the vertex list's own visible band. Cases:
//   - The row's vertex no longer exists (deleted mid-pick): abandon the
//     pick entirely — nothing left to point at.
//   - The vertex list section is collapsed: hide the button (nothing
//     sensible to position it against), but leave pendingListPick's
//     vertexId/getAction/applyPick alone — the canvas glow and the list's
//     own pending-highlight class both key off pendingListPick directly,
//     not the button's existence, so they keep showing while collapsed.
//     Reopening the section calls this again and the button reappears,
//     still describing the same pick.
//   - A "reject" (the disabled "error" button): purely informational, not
//     waiting on any interaction (NOTES7) — doesn't clamp to the list's
//     edge the way "use"/"close?" do; it simply disappears once its row
//     scrolls out of the visible band, same treatment as the collapsed
//     case above. The one-shot scroll-into-view already set by whatever
//     triggered this pick (handleListPick) is what actually surfaces the
//     information, once, at the moment it's relevant — it doesn't need to
//     keep following you afterward.
//   - Otherwise ("use"/"close?"): the row is looked up fresh by
//     data-vertex-id (never a cached reference — renderVertexList rebuilds
//     every row from scratch on any change) and the button is clamped into
//     the list's own visible band — follows the row, centered, while it's
//     fully in view; sticks to whichever edge the row goes past once it's
//     clipped or fully scrolled out, so the button never leaves the screen
//     and the stuck edge itself tells you which way to scroll. See NOTES6,
//     "clamped pending-pick button".
// Called after creating a pick, on every scroll of any scrollable ancestor
// (capture-phase listener below), on the vertex list section's own
// open/close toggle, and at the end of every renderVertexList — cheap and
// a no-op whenever nothing is pending, so it's safe to call liberally
// rather than track exactly which changes could have moved the row.
function updatePendingButtonPosition() {
  if (!pendingListPick) return;
  const list = document.getElementById('vertex-list');
  const row  = list.querySelector(`[data-vertex-id="${pendingListPick.vertexId}"]`);
  if (!row) { clearPendingListPick(); return; }

  if (!listSectionOpen.vertex) {
    if (pendingListPick.btnEl) { pendingListPick.btnEl.remove(); pendingListPick.btnEl = null; }
    return;
  }

  // Recomputed every call, not just at creation — action.kind determines
  // both the label and (for 'reject') whether this call even keeps the
  // button around, so it can't be a one-time snapshot.
  const action  = pendingListPick.getAction(pendingListPick.vertexId);
  const isError = action.kind === 'reject';

  if (isError) {
    const listRect = list.getBoundingClientRect();
    const rowRect  = row.getBoundingClientRect();
    const rowFullyVisible = rowRect.top >= listRect.top && rowRect.bottom <= listRect.bottom;
    if (!rowFullyVisible) {
      if (pendingListPick.btnEl) { pendingListPick.btnEl.remove(); pendingListPick.btnEl = null; }
      return;
    }
  }

  if (!pendingListPick.btnEl) {
    const btn = document.createElement('button');
    btn.className = 'face-pick-btn';
    btn.textContent = action.kind === 'close' ? 'close?' : isError ? 'error' : 'use';
    btn.disabled = isError;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const { vertexId, applyPick } = pendingListPick;
      clearPendingListPick();
      applyPick(vertexId);
      renderVertexList();
    });
    document.body.appendChild(btn);
    pendingListPick.btnEl = btn;
  }

  positionRowButton(pendingListPick.btnEl, row, list);
}

// Shared clamped-position math for every floating per-row button this app
// uses (the pending-pick "use"/"close?"/"error" button above, and the
// undo-latest-vertex "latest"/"remove?"/"close?" buttons below) — measured
// only after the button is actually laid out in the DOM (offsetWidth needs
// real layout). Follows the row (centered) while it's fully within the
// vertex list's own visible band; sticks to whichever edge the row scrolls
// past otherwise, so the button never leaves the screen and the stuck edge
// itself tells you which way to scroll. See NOTES6, "clamped pending-pick
// button".
function positionRowButton(btn, row, list) {
  const rowRect  = row.getBoundingClientRect();
  const listRect = list.getBoundingClientRect();
  const btnRect  = btn.getBoundingClientRect();
  const clippedTop    = rowRect.top    < listRect.top;
  const clippedBottom = rowRect.bottom > listRect.bottom;
  const top = clippedTop    ? listRect.top
            : clippedBottom ? listRect.bottom - btnRect.height
            :                 rowRect.top + rowRect.height / 2 - btnRect.height / 2;
  btn.style.left = (rowRect.left - btnRect.width - 6) + 'px';
  btn.style.top  = top + 'px';
}

// The two companion buttons for "undo the most recently confirmed vertex"
// (NOTES6/7) — unlike pendingListPick's button, these aren't click-
// triggered previews: they're a continuous status display, automatically
// shown/hidden/repositioned every render (and every scroll/collapse-toggle,
// same trigger points as updatePendingButtonPosition) purely as a function
// of current state. Unlike the row's own .list-latest/.list-face-first
// highlight classes, though, the button only exists once the vertex is
// actually armed — an unarmed latest/closeable vertex gets *only* the row
// highlight, no button (see NOTES7's correction: only an active row gets a
// button, so a scrolled-to-the-edge list never has two competing sticky
// buttons at once). Clicking the button always performs the confirm action
// (remove/close) — arming itself only ever happens via a row click (see
// renderVertexList), never via this button, since the button doesn't exist
// until after that arm has already happened.
let latestBtnEl = null;
let closeBtnEl  = null;

function updateLatestButtonPosition() {
  const id   = currentLatestPickId();
  const list = document.getElementById('vertex-list');
  const row  = (id !== null && armedVertexId === id) ? list.querySelector(`[data-vertex-id="${id}"]`) : null;
  if (!row || !listSectionOpen.vertex) {
    if (latestBtnEl) { latestBtnEl.remove(); latestBtnEl = null; }
    return;
  }
  if (!latestBtnEl) {
    latestBtnEl = document.createElement('button');
    latestBtnEl.className = 'face-pick-btn latest-pick-btn';
    latestBtnEl.textContent = 'remove';
    latestBtnEl.addEventListener('click', e => {
      e.stopPropagation();
      const currentId = currentLatestPickId();
      if (currentId === null) return;
      if (faceMode !== 'off') applyFacePick(currentId); else applySegmentPick(currentId);
    });
    document.body.appendChild(latestBtnEl);
  }
  positionRowButton(latestBtnEl, row, list);
}

function updateCloseButtonPosition() {
  const id   = currentClosePickId();
  const list = document.getElementById('vertex-list');
  const row  = (id !== null && faceCloseArmed) ? list.querySelector(`[data-vertex-id="${id}"]`) : null;
  if (!row || !listSectionOpen.vertex) {
    if (closeBtnEl) { closeBtnEl.remove(); closeBtnEl = null; }
    return;
  }
  if (!closeBtnEl) {
    closeBtnEl = document.createElement('button');
    closeBtnEl.className = 'face-pick-btn close-pick-btn';
    closeBtnEl.textContent = 'close';
    closeBtnEl.addEventListener('click', e => {
      e.stopPropagation();
      const currentId = currentClosePickId();
      if (currentId === null) return;
      applyFacePick(currentId);
    });
    document.body.appendChild(closeBtnEl);
  }
  positionRowButton(closeBtnEl, row, list);
}

// Single entry point for refreshing every per-row floating button this
// feature owns — called everywhere updatePendingButtonPosition already was
// (end of renderVertexList, the scroll listener, the list-toggle handler),
// so all three buttons stay in sync with the same triggers.
function updateArmButtons() {
  updateLatestButtonPosition();
  updateCloseButtonPosition();
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
  if (Number.isFinite(v) && v > 0) applyScale(v);
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
  _pendingScrollToVertexId = id;
  const v = vertices.find(u => u.id === id);
  if (v && !v.exprs) v.exprs = ['', '', ''];
  editingVertexId   = id;
  editingOriginal   = captureState();
  selectedVertexIds.clear();
  selectedSegmentId = null;
  selectedFaceId    = null;
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
  _pendingScrollToVertexId = editingVertexId;
  editingVertexId = null;
  editingOriginal = null;
  if (omegaMode === 'on') omegaMode = 'off';
  activeExprInput = null;
  updateUndoButtons();
  updateSciKeyboard();
  renderVertexList();
  renderSegmentList();
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
  _pendingScrollToVertexId = editingVertexId;
  editingVertexId = null;
  editingOriginal = null;
  if (omegaMode === 'on') omegaMode = 'off';
  activeExprInput = null;
  updateUndoButtons();
  updateSciKeyboard();
  renderVertexList();
  renderSegmentList();
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


// `activeExprInput` is shared across every expression-holding box in the
// app (vertex coords, segment endpoints, const values of any kind) — a
// bool-kind const box also sets it (see refreshConstAddRowAux / the const
// list rows below) so the logic keyboard can find it, but the *math*
// keyboard must not show for one. Every box that isn't specifically a
// bool-kind const box leaves `dataset.exprKind` unset, so this check never
// affects vertex/segment fields or number/color const boxes.
function updateSciKeyboard() {
  const kbd  = document.getElementById('sci-keyboard');
  const isBoolBox = activeExprInput?.dataset.exprKind === 'boolean';
  const show = omegaMode !== 'off' && (editingVertexId !== null || (activeExprInput !== null && !isBoolBox));
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

// ─── Logic keyboard ───────────────────────────────────────────────────────────
// Sibling of the science keyboard above, not a repurposing of it — a bool-
// kind const box has a different grammar (for now: just `true`/`false`).
// Mirrors positionSciKeyboard/updateSciKeyboard exactly, one level simpler
// (no on++ variant — there's nothing here yet for a loop-style mode to mean).

function positionLogicKeyboard() {
  const kbd = document.getElementById('logic-keyboard');
  if (kbd.style.display === 'none') return;
  if (kbd.offsetHeight === 0) { requestAnimationFrame(positionLogicKeyboard); return; }
  const wrapper = document.getElementById('controls-wrapper');
  if (!wrapper) return;
  let logicBtn = null;
  for (const btn of document.querySelectorAll('.const-logic-btn')) {
    if (btn.style.visibility !== 'hidden') { logicBtn = btn; break; }
  }
  if (!logicBtn) return;
  const wRect = wrapper.getBoundingClientRect();
  const bRect = logicBtn.getBoundingClientRect();
  const mid = bRect.top - wRect.top + bRect.height / 2;
  kbd.style.marginTop = Math.max(0, mid - kbd.offsetHeight / 2) + 'px';
}

function updateLogicKeyboard() {
  const kbd  = document.getElementById('logic-keyboard');
  const isBoolBox = activeExprInput?.dataset.exprKind === 'boolean';
  const show = logicMode !== 'off' && activeExprInput !== null && isBoolBox;
  kbd.style.display = show ? '' : 'none';
  document.querySelectorAll('.const-logic-btn').forEach(btn => {
    btn.className = 'v-toggle const-logic-btn' + (logicMode === 'on' ? ' active' : '');
  });
  if (show) requestAnimationFrame(positionLogicKeyboard);
}

document.getElementById('logic-keyboard').querySelectorAll('.sk-btn').forEach(btn => {
  btn.addEventListener('mousedown', e => {
    e.preventDefault();
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
    if (c.value === undefined) { valSpan.textContent = '?'; return; }
    const swatch = document.createElement('span');
    swatch.className = 'v-swatch';
    swatch.style.background = c.value;
    swatch.style.display = 'inline-block';
    valSpan.appendChild(swatch);
    valSpan.appendChild(document.createTextNode(' ' + c.value));
  } else if (c.kind === 'boolean') {
    valSpan.textContent = c.value === undefined ? '?' : String(c.value);
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

    // Auxiliary-button slot: exactly one widget, chosen by this constant's
    // own locked kind (never a picker here — kind can't change post-
    // creation) — math keyboard toggle for number, a color-picker button
    // for color, a logic keyboard toggle for boolean. Filled in below,
    // after exprInp/valSpan exist, since each kind's wiring touches them.
    const btnSlot = document.createElement('div');
    btnSlot.className = 'const-btn-slot';

    const nameInp = document.createElement('input');
    nameInp.type = 'text';
    mobileTextInput(nameInp);
    nameInp.className = 'const-name-input';
    nameInp.value = c.name;
    nameInp.addEventListener('change', () => {
      const n = nameInp.value.trim();
      if (n && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(n)) {
        if (n === 'true' || n === 'false' || CONST_KIND_KEYWORDS.includes(n)) { nameInp.value = c.name; setNameError(nameInp); return; }
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
    exprInp.dataset.exprKind = c.kind === 'boolean' ? 'boolean' : '';

    const valSpan = document.createElement('span');
    valSpan.className = 'const-value';
    valSpan.dataset.constVal = c.id;
    renderConstValSpan(valSpan, c);

    // The value can still change freely; the kind it must resolve under
    // cannot — resolveConstByKind is the same check `edit const` uses, so
    // a wrong-kind edit is rejected here exactly as it would be from the
    // code file/interpreter, closing the hole a plain always-accepting text
    // box used to leave open (see the const-editing design notes).
    const commitExprChange = newExpr => {
      const res = resolveConstByKind(c.kind, newExpr, buildEnvs());
      if (!res.ok) { exprInp.value = c.expr; setNameError(exprInp); return; }
      c.expr = newExpr;
      c.value = res.value;
      renderConstValSpan(valSpan, c);
      reEvalObjects();
      renderVertexList();
      renderSegmentList();
      renderFaceList();
      draw();
    };

    if (c.kind === 'number') {
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
    } else if (c.kind === 'boolean') {
      const logicBtn = document.createElement('button');
      logicBtn.className = 'v-toggle const-logic-btn' + (logicMode === 'on' ? ' active' : '');
      logicBtn.textContent = '𝔹';
      logicBtn.style.visibility = 'hidden';
      logicBtn.addEventListener('mousedown', e => e.preventDefault());
      logicBtn.addEventListener('click', () => {
        logicMode = logicMode === 'off' ? 'on' : 'off';
        updateLogicKeyboard();
      });
      btnSlot.appendChild(logicBtn);

      exprInp.addEventListener('focus', () => {
        activeExprInput = exprInp;
        logicBtn.style.visibility = '';
        updateLogicKeyboard();
        requestAnimationFrame(positionLogicKeyboard);
      });
      exprInp.addEventListener('blur', () => {
        setTimeout(() => {
          logicBtn.style.visibility = 'hidden';
          if (activeExprInput === exprInp) { activeExprInput = null; updateLogicKeyboard(); }
        }, 0);
      });
    } else {
      // color
      const colorBtn = document.createElement('button');
      colorBtn.className = 'color-picker-btn';
      colorBtn.title = 'Color';
      colorBtn.style.background = c.value ?? '#4d4d4d';
      btnSlot.appendChild(colorBtn);

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
      colorInput.value = c.value ?? '#4d4d4d';
      colorInput.className = 'color-native-overlay';
      customWrap.append(customBtn, colorInput);
      colorPopover.append(presetLabel, presetList, constLabel, colorGrid, customWrap);
      entry.appendChild(colorPopover);

      setupColorPicker(colorBtn, colorPopover, presetList, colorGrid, colorInput,
        () => c.expr,
        val => { exprInp.value = val; commitExprChange(val); colorBtn.style.background = c.value ?? '#4d4d4d'; },
        hex => { exprInp.value = hex; commitExprChange(hex); colorBtn.style.background = c.value ?? '#4d4d4d'; },
        () => { colorBtn.style.background = c.value ?? '#4d4d4d'; }
      ).refresh();
    }

    exprInp.addEventListener('change', () => commitExprChange(exprInp.value.trim()));

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

// Reflects `addConstKind` (and whether c-expr currently has content) into
// every visible piece of the add-row: the kind picker's own visibility and
// active-button highlight, c-expr's placeholder, which single auxiliary
// widget shows (math keyboard / color picker / logic keyboard), and
// c-expr's `dataset.exprKind` (what updateSciKeyboard/updateLogicKeyboard
// key off of). Called on every kind pick, every c-expr keystroke, and every
// c-expr focus/blur — see callers below.
function refreshConstAddRowAux() {
  const exprInp = document.getElementById('c-expr');
  const empty   = exprInp.value.trim() === '';
  const focused = document.activeElement === exprInp;

  document.getElementById('c-kind-picker').style.display = empty ? '' : 'none';
  document.querySelectorAll('.c-kind-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.kind === (addConstKind === 'boolean' ? 'bool' : addConstKind));
  });

  exprInp.placeholder =
    addConstKind === 'number'  ? 'insert number' :
    addConstKind === 'color'   ? 'insert color'  :
    addConstKind === 'boolean' ? 'insert bool'   :
                                  'select aux type ---->';
  exprInp.dataset.exprKind = addConstKind === 'boolean' ? 'boolean' : '';

  const omegaBtn = document.getElementById('c-add-omega');
  const colorBtn = document.getElementById('c-add-color-btn');
  const logicBtn = document.getElementById('c-add-logic');
  omegaBtn.style.display = addConstKind === 'number'  ? '' : 'none';
  colorBtn.style.display = addConstKind === 'color'   ? '' : 'none';
  logicBtn.style.display = addConstKind === 'boolean' ? '' : 'none';
  omegaBtn.style.visibility = (addConstKind === 'number'  && focused) ? '' : 'hidden';
  logicBtn.style.visibility = (addConstKind === 'boolean' && focused) ? '' : 'hidden';

  updateSciKeyboard();
  updateLogicKeyboard();
}

document.querySelectorAll('.c-kind-btn').forEach(btn => {
  btn.addEventListener('mousedown', e => e.preventDefault()); // keep focus on c-expr
  btn.addEventListener('click', () => {
    addConstKind = btn.dataset.kind === 'bool' ? 'boolean' : btn.dataset.kind;
    refreshConstAddRowAux();
  });
});

cAddColorPicker = setupColorPicker(
  document.getElementById('c-add-color-btn'),
  document.getElementById('c-add-color-popover'),
  document.getElementById('c-add-color-presets'),
  document.getElementById('c-add-color-grid'),
  document.getElementById('c-add-color-native'),
  () => document.getElementById('c-expr').value,
  val => { document.getElementById('c-expr').value = val; refreshConstAddRowAux(); },
  hex => { document.getElementById('c-expr').value = hex; refreshConstAddRowAux(); },
  () => {}
);

document.getElementById('c-expr').addEventListener('input', refreshConstAddRowAux);
document.getElementById('c-expr').addEventListener('focus', () => {
  if (addConstKind === 'number' || addConstKind === 'boolean') activeExprInput = document.getElementById('c-expr');
  refreshConstAddRowAux();
});
document.getElementById('c-expr').addEventListener('blur', () => {
  setTimeout(() => {
    if (activeExprInput === document.getElementById('c-expr')) activeExprInput = null;
    refreshConstAddRowAux();
  }, 0);
});

document.getElementById('btn-add-const').addEventListener('click', () => {
  const nameInp = document.getElementById('c-name');
  const exprInp = document.getElementById('c-expr');
  const name = nameInp.value.trim();
  const expr = exprInp.value.trim();
  if (!name || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) return;
  if (name === 'true' || name === 'false' || CONST_KIND_KEYWORDS.includes(name)) { setNameError(nameInp); return; }
  if (isNameTaken(name)) { setNameError(nameInp); return; }
  if (!addConstKind || !expr) { setNameError(exprInp); return; }
  const res = resolveConstByKind(addConstKind, expr, buildEnvs());
  if (!res.ok) { setNameError(exprInp); return; }
  snapshot();
  constants.push({ id: nextConstantId++, name, expr, value: res.value, kind: addConstKind });
  nameInp.value = '';
  exprInp.value = '';
  addConstKind = null;
  refreshConstAddRowAux();
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

refreshConstAddRowAux();

// ─── Add-row defaults (mirrors code-file `set` values) ─────────────────────────
//
// The add-rows read/write lastSetVertex/lastSetSegment/lastSetFace directly —
// the exact same state a `set` line in the code file/interpreter populates —
// so there's one governing-defaults object per type, not a separately-synced
// shadow copy that can drift out of date. renderAddRowDefaults() (below) is
// the only thing that *displays* it; touching a control is the only thing
// that *writes* it.

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
// (lastSetVertex.color, or a live vertex/segment's colorExpr) — this
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

// Displays one boolean field's resolved state (opacity, plus the ●/○ dot
// glyph for dot-style toggles like "visible" — "label" keeps its fixed "A"
// glyph, only fading) and, when it's currently linked to a constant rather
// than a literal, the constant's name as a small subscript. Read-only —
// write-back happens only in the caller's own click handler, never here, so
// calling this on every render (e.g. from the renderConstList() hook, so a
// linked dot stays live as the constant is edited) can never silently
// detach anything. Element-based so both the governing add-row toggles
// (via the id-based wrapper below) and per-instance list-row toggles
// (vertex/segment/face, called directly with their own dynamically-created
// elements) share one implementation.
function applyBoolToggleDisplay(btn, sub, exprText, boolEnv, useDotGlyph = true) {
  const res = resolveBoolAttr(exprText, boolEnv);
  const val = res.ok ? res.value : true;
  if (useDotGlyph) btn.textContent = val ? '●' : '○';
  btn.style.opacity = val ? '1' : '0.3';
  sub.textContent   = (exprText === 'true' || exprText === 'false') ? '' : exprText;
}

function renderBoolToggle(btnId, subId, exprText, boolEnv, useDotGlyph = true) {
  applyBoolToggleDisplay(document.getElementById(btnId), document.getElementById(subId), exprText, boolEnv, useDotGlyph);
}

// Click handler for a governing boolean toggle: always sets a literal equal
// to the opposite of whatever's currently resolving — the exact same rule
// whether that means flipping an existing literal or detaching a constant
// link, matching the numeric widget's "direct interaction always yields a
// literal" behavior (see wireNumericAttrInput). The only way to (re)link a
// constant is via the interpreter or code file.
function toggleGoverningBool(governingText, field, builtinDefault, boolEnv) {
  const exprText = governingText[field] ?? builtinDefault;
  const res      = resolveBoolAttr(exprText, boolEnv);
  governingText[field] = String(!(res.ok ? res.value : true));
  renderAddRowDefaults();
}

// A governing numeric field's box (v-radius/seg-width): structurally can
// only ever produce a literal on direct edit — beforeinput rejects any
// insertion (typed or pasted) that wouldn't leave a valid in-progress
// signed-decimal string in the box, so a keystroke can never turn it into
// anything resembling a constant name. Unfocused, it always shows the true
// governing expr text (via the returned refresh function) — a number when a
// literal governs, the constant's name when one does — same discipline as
// makeEndpointInput's plain-text-plus-live-validation pattern, just with a
// numeric grammar instead of a vertex-name lookup.
function wireNumericAttrInput(input, getExprText, setLiteral) {
  function refresh() {
    if (document.activeElement === input) return; // don't fight an in-progress edit
    input.value = getExprText();
  }
  input.addEventListener('beforeinput', e => {
    if (e.data == null) return; // deletions etc. always pass through
    const prospective = input.value.slice(0, input.selectionStart) + e.data + input.value.slice(input.selectionEnd);
    if (!/^-?\d*\.?\d*$/.test(prospective)) e.preventDefault();
  });
  input.addEventListener('input', () => {
    const n   = parseFloat(input.value);
    // isFinite, not just isNaN — the beforeinput grammar above blocks
    // scientific notation, but a long-enough plain digit string still
    // overflows a double to Infinity on its own (e.g. pasted).
    const bad = input.value.trim() !== '' && !Number.isFinite(n);
    input.classList.toggle('expr-invalid', bad);
    if (Number.isFinite(n)) setLiteral(n);
  });
  input.addEventListener('blur', refresh);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
  refresh();
  return refresh;
}

function renderAddRowDefaults() {
  const { colorEnv, boolEnv } = buildEnvs();

  const vColorRes = resolveColorAttr(lastSetVertex.color ?? DEFAULT_COLOR, colorEnv);
  const vColorResolved = vColorRes.ok ? vColorRes.value : DEFAULT_COLOR;
  document.getElementById('v-color').value = vColorResolved;
  document.getElementById('v-color-btn').style.background = vColorResolved;
  refreshVRadius();
  renderBoolToggle('v-add-visible', 'v-add-visible-sub', lastSetVertex.visible ?? BUILTIN_SET_DEFAULTS.vertex.visible, boolEnv);
  renderBoolToggle('v-add-label',   'v-add-label-sub',   lastSetVertex.label   ?? BUILTIN_SET_DEFAULTS.vertex.label,   boolEnv, false);
  vColorPicker.refresh();

  const sColorRes = resolveColorAttr(lastSetSegment.color ?? DEFAULT_COLOR, colorEnv);
  const sColorResolved = sColorRes.ok ? sColorRes.value : DEFAULT_COLOR;
  document.getElementById('seg-color').value = sColorResolved;
  document.getElementById('seg-color-btn').style.background = sColorResolved;
  refreshSegWidth();
  renderBoolToggle('seg-add-visible', 'seg-add-visible-sub', lastSetSegment.visible ?? BUILTIN_SET_DEFAULTS.segment.visible, boolEnv);
  segColorPicker.refresh();

  const fColorRes = resolveColorAttr(lastSetFace.color ?? DEFAULT_COLOR, colorEnv);
  const fColorResolved = fColorRes.ok ? fColorRes.value : DEFAULT_COLOR;
  document.getElementById('face-color').value = fColorResolved;
  document.getElementById('face-color-btn').style.background = fColorResolved;
  renderBoolToggle('face-add-visible', 'face-add-visible-sub', lastSetFace.visible ?? BUILTIN_SET_DEFAULTS.face.visible, boolEnv);
  faceColorPicker.refresh();

  // The const add-row's own color-kind picker (only relevant while a color
  // kind is actually selected there) needs the same live refresh so its
  // "Constants" section stays current as other color constants come and go.
  cAddColorPicker.refresh();
}

// ─── Vertex controls ──────────────────────────────────────────────────────────

function renderVertexList() {
  const list       = document.getElementById('vertex-list');
  const savedScroll = list.scrollTop;
  list.innerHTML   = '';
  const inEdit     = editingVertexId !== null || editingSegmentId !== null;

  for (const v of vertices) {
    const entry = document.createElement('div');
    entry.className = 'vertex-entry';
    // Stable lookup key for updatePendingButtonPosition — it re-queries the
    // row fresh every time rather than caching a node, since this function
    // rebuilds every row from scratch on any change.
    entry.dataset.vertexId = v.id;

    if (v.id === editingVertexId) {
      // ── Edit block (column layout) ─────────────────────────────────────────
      entry.className = 'vertex-entry vertex-editing';
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
        // CODE_IDENT_RE too, not just collision — same reasoning as
        // addVertexFromInputs above: a shape the code-file grammar would
        // reject silently gets destroyed on the next Save otherwise.
        if (n && n !== v.name && (!CODE_IDENT_RE.test(n) || isNameTaken(n, v.id))) {
          nameInput.value = v.name;
          _rejectedVertexId = v.id;
          setNameError(nameInput);
        } else if (n) {
          v.name = n;
        }
      });
      nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') commitEdit(); });

      // A validated text input, not <input type="number"> — same widget as
      // the add-row's v-radius (wireNumericAttrInput), so a radius governed
      // by a constant shows that constant's name here too instead of
      // flattening to its current numeric value the moment edit mode opens.
      const radiusInp = document.createElement('input');
      radiusInp.type = 'text';
      mobileTextInput(radiusInp);
      radiusInp.inputMode = 'decimal';
      radiusInp.className = 'v-coord';
      radiusInp.style.width = '38px';
      radiusInp.title = 'Node radius';
      wireNumericAttrInput(radiusInp,
        () => v.radiusExpr ?? String(v.radius ?? 5),
        n => { v.radius = n; v.radiusExpr = String(n); draw(); }
      );
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
          // isFinite, not just isNaN — a free-form expression box (unlike
          // wireNumericAttrInput's restricted grammar) can reach Infinity
          // via a literal like 1e400 or overflowing arithmetic, with no NaN
          // ever produced along the way.
          const bad  = !Number.isFinite(val) && exprInp.value.trim() !== '';
          exprInp.classList.toggle('expr-invalid', bad);
          if (Number.isFinite(val)) { v.coords[i] = val; valSpan.textContent = +val.toFixed(4); }
          else                       { valSpan.textContent = '?'; }
          draw();
        });
        exprInp.addEventListener('keydown', e => { if (e.key === 'Enter') commitEdit(); });
        row.appendChild(exprInp);

        const valSpan = document.createElement('span');
        valSpan.className = 'coord-value';
        const curVal = evalExpr(exprVal, env);
        valSpan.textContent = Number.isFinite(curVal) ? +curVal.toFixed(4) : '?';
        row.appendChild(valSpan);

        entry.appendChild(row);
      });


    } else {
      // ── Display row ───────────────────────────────────────────────────────
      if (selectedVertexIds.has(v.id) || v.id === focusedVertexId) {
        entry.classList.add('list-selected');
      }
      // Accumulated middle picks get no list highlight at all — with the
      // canvas already showing every pick, repeating that in the list adds
      // little. The first pick is the one exception (it's the vertex that
      // closes the loop), highlighted green to match its canvas rim —
      // unless it's currently the pending candidate (blue/red, matching the
      // floating button), the latest pick (yellow/red, the undo-latest-
      // vertex feature — takes priority over the plain green even for v0,
      // when v0 is also the latest: no exception, see getFacePickAction),
      // or v0 itself once armed for closing (blue, layered on top of its
      // own green — see NOTES6/7).
      const latestPickId = currentLatestPickId();
      if (pendingListPick && pendingListPick.vertexId === v.id) {
        const action = pendingListPick.getAction(v.id);
        entry.classList.add(action.kind === 'reject' ? 'list-pending-error' : 'list-pending-use');
      } else if (v.id === latestPickId) {
        entry.classList.add(armedVertexId === v.id ? 'list-latest-armed' : 'list-latest');
      } else if (facePickOrder[0] === v.id) {
        // No faceMode gate — the first pick's green highlight also survives
        // a pause, matching the canvas's paused-glow treatment.
        entry.classList.add('list-face-first');
        if (faceCloseArmed) entry.classList.add('list-close-armed');
      }
      entry.addEventListener('click', () => {
        // An active endpoint-fill box (or any other edit in progress) takes
        // priority over starting a new pick — same guard selectVertexById
        // already applies internally for the plain (non-picking) click path,
        // and handleFaceListPick/handleSegmentListPick don't check it
        // themselves.
        if (activeEndpointInput || isEditingBlocked()) { selectVertexById(v.id); return; }
        if (faceMode !== 'off') {
          // 'append'/'reject' still go through the list's own preview-then-
          // confirm step (the list doesn't show you where a vertex is, so a
          // fresh pick needs that disambiguation). 'arm'/'armClose' target
          // an *unarmed* latest/closeable vertex — a row click arms it,
          // same as any other row-click-to-select elsewhere in this list.
          // 'remove'/'close' means this vertex is *already* armed — a row
          // click does nothing there; only the companion button (which
          // exists precisely because it's armed) can confirm, per NOTES7's
          // correction ("only an active row gets a button," and pressing
          // that button is required — re-clicking the row a second time no
          // longer confirms anything).
          const action = getFacePickAction(v.id);
          if (action.kind === 'append' || action.kind === 'reject') handleFaceListPick(v.id);
          else if (action.kind === 'arm' || action.kind === 'armClose') applyFacePick(v.id);
        } else if (segmentMode !== 'off') {
          const action = getSegmentPickAction(v.id);
          if (action.kind === 'append') handleSegmentListPick(v.id);
          else if (action.kind === 'arm') applySegmentPick(v.id);
        } else {
          selectVertexById(v.id);
        }
      });

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

      // Radius: same validated-text widget as the add-row/edit-row (shows a
      // governing constant's name, never lets typing/pasting produce one —
      // beforeinput restricts to a plain signed-decimal grammar) rather than
      // a bare number, so the list mirrors the definition line's own
      // display instead of only ever showing a flattened value.
      const radiusInp = document.createElement('input');
      radiusInp.type = 'text';
      mobileTextInput(radiusInp);
      radiusInp.inputMode = 'decimal';
      radiusInp.className = 'v-coord';
      radiusInp.style.width = '32px';
      radiusInp.title = 'Node radius';
      radiusInp.disabled = inEdit;
      radiusInp.addEventListener('click', e => e.stopPropagation());
      radiusInp.addEventListener('focus', () => snapshot());
      wireNumericAttrInput(radiusInp,
        () => v.radiusExpr ?? String(v.radius ?? 5),
        n => { v.radius = n; v.radiusExpr = String(n); draw(); }
      );

      const boolEnv = buildEnvs().boolEnv;

      const labelWrap = document.createElement('span');
      labelWrap.className = 'v-toggle-wrap';
      const labelToggle = document.createElement('button');
      labelToggle.className = 'v-toggle';
      labelToggle.textContent = 'A';
      labelToggle.disabled = inEdit;
      const labelSub = document.createElement('sub');
      labelSub.className = 'v-toggle-const';
      labelWrap.append(labelToggle, labelSub);
      applyBoolToggleDisplay(labelToggle, labelSub, v.labelExpr ?? String(v.showLabel !== false), boolEnv, false);
      labelToggle.title = v.showLabel ? 'Hide label' : 'Show label';
      labelToggle.addEventListener('click', e => {
        e.stopPropagation();
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
      editBtn.addEventListener('click', e => { e.stopPropagation(); enterEditMode(v.id); });

      const visibleWrap = document.createElement('span');
      visibleWrap.className = 'v-toggle-wrap';
      const toggle = document.createElement('button');
      toggle.className = 'v-toggle';
      toggle.disabled = inEdit;
      const visibleSub = document.createElement('sub');
      visibleSub.className = 'v-toggle-const';
      visibleWrap.append(toggle, visibleSub);
      applyBoolToggleDisplay(toggle, visibleSub, v.visibleExpr ?? String(v.visible !== false), boolEnv);
      toggle.title = v.visible ? 'Hide' : 'Show';
      toggle.addEventListener('click', e => {
        e.stopPropagation();
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
      del.addEventListener('click', e => {
        e.stopPropagation();
        snapshot();
        segments = segments.filter(s => !s.vertexIds.includes(v.id));
        // Faces need the exact same cascade segments already got — without
        // this, a face referencing the deleted vertex becomes a "zombie":
        // still sitting in the live array and the face list, invisible on
        // canvas (drawFaces already guards against a missing vertex), and
        // silently dropped the next time the code file is saved (serializeState
        // guards too) — with no warning anywhere that it happened.
        faces    = faces.filter(f => !f.vertexIds.includes(v.id));
        vertices = vertices.filter(u => u.id !== v.id);
        selectedVertexIds.delete(v.id);
        if (focusedVertexId === v.id) focusedVertexId = null;
        if (segments.every(s => s.id !== selectedSegmentId)) selectedSegmentId = null;
        if (faces.every(f => f.id !== selectedFaceId)) selectedFaceId = null;
        renderVertexList();
        renderSegmentList();
        renderFaceList();
        draw();
      });

      entry.append(swatch, name, coords, radiusInp, labelWrap, editBtn, visibleWrap, del);
    }

    list.appendChild(entry);
  }

  // One-shot: scroll a specific row into view only on the render that
  // immediately follows the action that requested it (a fresh selection, a
  // list-driven pick, entering/leaving edit mode) — never on a later,
  // unrelated render, which is what let a stale target keep re-stealing the
  // scroll indefinitely (see NOTES6, "one-shot scroll-to-row").
  let scrollTarget = null;
  if (_pendingScrollToVertexId !== null) {
    scrollTarget = list.querySelector(`[data-vertex-id="${_pendingScrollToVertexId}"]`);
    _pendingScrollToVertexId = null;
  }
  if (scrollTarget) scrollTarget.scrollIntoView({ block: 'nearest' });
  else list.scrollTop = savedScroll;
  updateListToggle('vertex');
  // Rows were just rebuilt from scratch — any pending pick's button needs
  // to resync against its (possibly moved, possibly newly-stale) row.
  updatePendingButtonPosition();
  updateArmButtons();
}

function addVertexFromInputs() {
  const nameInput = document.getElementById('v-name');
  const coordIds  = ['v-a1', 'v-a2', 'v-a3'];
  const coordInps = coordIds.map(id => document.getElementById(id));
  const env       = buildEnvs().numericEnv;
  const exprs     = coordInps.map(inp => inp.value.trim() || '0');
  const vals      = exprs.map(expr => evalExpr(expr, env));
  // isFinite, not just isNaN — a literal like 1e400 or overflowing
  // arithmetic evaluates to Infinity, never NaN, and would otherwise be
  // silently accepted as a coordinate (confirmed reachable during stress
  // testing: `vertex P0: 1e400 2 3`).
  coordInps.forEach((inp, k) => inp.classList.toggle('expr-invalid', !Number.isFinite(vals[k])));
  if (vals.some(v => !Number.isFinite(v))) return;
  const typed = nameInput.value.trim();
  // CODE_IDENT_RE too, not just collision — a name the code-file grammar
  // wouldn't accept (e.g. a bare "5") used to slip through here, rendering
  // fine until the next Save silently dropped it (buildCommittedArraysFromStaged
  // only keeps validly-reparsed objects) — confirmed as real data loss, not
  // just a cosmetic gap, since nothing ever told the user why.
  if (typed && (!CODE_IDENT_RE.test(typed) || isNameTaken(typed))) { setNameError(nameInput); return; }
  const attrRes = resolveGoverningAttrs('vertex', {}, lastSetVertex, buildEnvs());
  snapshot();
  // nextAutoName mutates nameCounters, so it must run after snapshot() —
  // otherwise undo would restore a state that already reflects this
  // creation's counter advance, defeating the point of restoring it at all.
  const name = typed || nextAutoName(lastSetVertex.naming ?? AUTO_NAME_PREFIX.vertex);
  vertices.push({
    id: nextVertexId++, name, coords: vals, exprs, ...attrRes.fields,
  });
  nameInput.value = '';
  coordInps.forEach(inp => { inp.value = '0'; inp.classList.remove('expr-invalid'); });
  renderVertexList();
  updateVertexNamePreview();
  draw();
}

document.getElementById('btn-add-vertex').addEventListener('click', addVertexFromInputs);

['v-name', 'v-a1', 'v-a2', 'v-a3'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') addVertexFromInputs();
  });
});

// Grey placeholder preview of the name a blank-name "+" would actually
// produce right now — a pure peek (peekAutoName), never consumes a name by
// itself. Triggered by focusing anywhere in the add-row (not continuously),
// per the design: nothing else in this single-focus-at-a-time app can
// invalidate a shown prediction while the row stays focused, so there's no
// need to recompute it on every keystroke — only re-entering the row, or an
// actual creation elsewhere (handled by the explicit call in
// addVertexFromInputs above), can ever change the answer.
function updateVertexNamePreview() {
  document.getElementById('v-name').placeholder =
    peekAutoName(nameCounters, lastSetVertex.naming ?? AUTO_NAME_PREFIX.vertex, isNameTaken);
}
['v-name', 'v-a1', 'v-a2', 'v-a3'].forEach(id => {
  document.getElementById(id).addEventListener('focus', updateVertexNamePreview);
});

['v-a1', 'v-a2', 'v-a3', 'v-radius', 'seg-width'].forEach(id => {
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
  () => lastSetVertex.color ?? DEFAULT_COLOR,
  name => { lastSetVertex.color = name; },
  hex => { lastSetVertex.color = hex; document.getElementById('v-color-btn').style.background = hex; },
  renderAddRowDefaults
);

const refreshVRadius = wireNumericAttrInput(document.getElementById('v-radius'),
  () => lastSetVertex.r ?? BUILTIN_SET_DEFAULTS.vertex.r,
  n  => { lastSetVertex.r = String(n); });

document.getElementById('v-add-more').addEventListener('click', () => {
  const row  = document.getElementById('v-add-extra');
  const btn  = document.getElementById('v-add-more');
  const open = row.style.display === 'none';
  row.style.display = open ? '' : 'none';
  btn.classList.toggle('active', open);
});
document.getElementById('v-add-label').addEventListener('click', () => {
  toggleGoverningBool(lastSetVertex, 'label', BUILTIN_SET_DEFAULTS.vertex.label, buildEnvs().boolEnv);
});
document.getElementById('v-add-visible').addEventListener('click', () => {
  toggleGoverningBool(lastSetVertex, 'visible', BUILTIN_SET_DEFAULTS.vertex.visible, buildEnvs().boolEnv);
});

// ─── Segment edit mode ────────────────────────────────────────────────────────

function enterSegmentEditMode(id) {
  editingSegmentId       = id;
  editingSegmentOriginal = captureState();
  activeEndpointInput    = null;
  updateUndoButtons();
  renderVertexList();
  renderSegmentList();
  renderFaceList();
}

function commitSegmentEdit() {
  undoStack.push(editingSegmentOriginal);
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack              = [];
  editingSegmentId       = null;
  editingSegmentOriginal = null;
  activeEndpointInput    = null;
  updateUndoButtons();
  renderVertexList();
  renderSegmentList();
  renderFaceList();
  draw();
}

function cancelSegmentEdit() {
  if (editingSegmentOriginal) {
    const orig = editingSegmentOriginal.segments.find(s => s.id === editingSegmentId);
    const seg  = segments.find(s => s.id === editingSegmentId);
    if (orig && seg) {
      seg.name = orig.name;
      seg.color = orig.color; seg.colorExpr = orig.colorExpr;
      seg.lineWidth = orig.lineWidth ?? 1.5; seg.widthExpr = orig.widthExpr;
      seg.vertexIds = [...orig.vertexIds];
    }
  }
  editingSegmentId       = null;
  editingSegmentOriginal = null;
  activeEndpointInput    = null;
  updateUndoButtons();
  renderVertexList();
  renderSegmentList();
  renderFaceList();
  draw();
}

// ─── Segment controls ─────────────────────────────────────────────────────────

function updateSegmentButton() {
  const btn = document.getElementById('btn-segment');
  btn.classList.toggle('active',      segmentMode === 'on');
  btn.classList.toggle('active-loop', segmentMode === 'on++');
  btn.textContent = segmentMode === 'on++' ? 'draw +' : 'draw';
  // No persistent name field to attach a placeholder to (segments/faces are
  // always auto-named at controls-creation time) — a grey preview span next
  // to the button fills that role instead, shown only while draw is
  // actually engaged (this function already runs at every point that
  // matters: mode toggling, after a creation in 'on++' loop mode, and undo/
  // redo — see the call sites). Pure peek, never consumes a name itself.
  document.getElementById('seg-name-preview').textContent = segmentMode === 'off' ? '' :
    peekAutoName(nameCounters, lastSetSegment.naming ?? AUTO_NAME_PREFIX.segment, isNameTaken);
}

function updateFaceButton() {
  const btn = document.getElementById('btn-face');
  btn.classList.toggle('active',      faceMode === 'on');
  btn.classList.toggle('active-loop', faceMode === 'on++');
  btn.textContent = faceMode === 'on++' ? 'draw +' : 'draw';
  document.getElementById('face-name-preview').textContent = faceMode === 'off' ? '' :
    peekAutoName(nameCounters, lastSetFace.naming ?? AUTO_NAME_PREFIX.face, isNameTaken);
}

function renderSegmentList() {
  const list   = document.getElementById('segment-list');
  const savedScroll = list.scrollTop;
  list.innerHTML = '';
  const inEdit = editingVertexId !== null || editingSegmentId !== null;
  let selectedEntry = null;

  for (const seg of segments) {
    const v1 = vertices.find(v => v.id === seg.vertexIds[0]);
    const v2 = vertices.find(v => v.id === seg.vertexIds[1]);

    const entry = document.createElement('div');
    entry.className = 'segment-entry';

    if (seg.id === editingSegmentId) {
      // ── Edit row ──────────────────────────────────────────────────────────
      entry.className = 'segment-entry vertex-editing';
      const mainRow = document.createElement('div');
      mainRow.className = 'vertex-edit-row';

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

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      mobileTextInput(nameInput);
      nameInput.value = seg.name;
      nameInput.className = 'v-name-input';
      nameInput.addEventListener('blur', () => {
        const n = nameInput.value.trim();
        // CODE_IDENT_RE too, not just collision — same reasoning as the
        // vertex rename/add-row fixes above.
        if (n && n !== seg.name && (!CODE_IDENT_RE.test(n) || isNameTaken(n, null, null, null, seg.id))) {
          nameInput.value = seg.name;
          setNameError(nameInput);
        } else if (n) {
          seg.name = n;
        }
      });
      nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') commitSegmentEdit(); });

      // Endpoint pickers — let the user re-point either end of the segment
      // at a different vertex instead of it being fixed at creation time.
      // Plain text, live-validated: goes .expr-invalid (red) on an unknown
      // name or one that would collapse the segment onto a single vertex,
      // and only applies (+draws) once it resolves to a real, distinct
      // vertex — same discipline as color/width, reverted wholesale by
      // cancelSegmentEdit if the user backs out. A dropdown/typeahead is
      // still worth revisiting, but not until iPad Safari's rendering of
      // one is sorted out (native <datalist> and a hand-built popover both
      // fell over there) — this sidesteps that entirely in the meantime.
      function makeEndpointInput(endpointIdx) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'seg-endpoint-input';
        input.value = vertices.find(v => v.id === seg.vertexIds[endpointIdx])?.name ?? '';
        input.addEventListener('input', () => {
          const otherIdx = 1 - endpointIdx;
          const match = vertices.find(v => v.name === input.value.trim());
          const bad = !match || match.id === seg.vertexIds[otherIdx];
          input.classList.toggle('expr-invalid', bad);
          if (!bad) { seg.vertexIds[endpointIdx] = match.id; draw(); }
        });
        input.addEventListener('keydown', e => { if (e.key === 'Enter') commitSegmentEdit(); });
        input.addEventListener('focus', () => { activeEndpointInput = input; });
        input.addEventListener('blur', () => {
          // Deferred: a canvas/list click blurs this input before its own
          // click handler runs, and that handler needs activeEndpointInput
          // to still point here — same discipline as activeExprInput.
          setTimeout(() => { if (activeEndpointInput === input) activeEndpointInput = null; }, 0);
        });
        return input;
      }
      const v1Input = makeEndpointInput(0);
      const dash = document.createElement('span');
      dash.className = 'seg-endpoint-dash';
      dash.textContent = '–';
      const v2Input = makeEndpointInput(1);
      // A vertex pick that fills v1 advances focus to v2, so "click A, click
      // B" fills both ends without the user tabbing between the boxes.
      v1Input._nextEndpointInput = v2Input;

      // Same widget as vertex's radiusInp above (wireNumericAttrInput) —
      // shows the governing constant's name when linked, instead of
      // flattening to the current numeric value on entering edit mode.
      const widthInp = document.createElement('input');
      widthInp.type = 'text';
      mobileTextInput(widthInp);
      widthInp.inputMode = 'decimal';
      widthInp.className = 'v-coord';
      widthInp.style.width = '38px';
      widthInp.title = 'Line width';
      wireNumericAttrInput(widthInp,
        () => seg.widthExpr ?? String(seg.lineWidth ?? 1.5),
        n => { seg.lineWidth = n; seg.widthExpr = String(n); draw(); }
      );
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

      mainRow.append(colorBtn, colorPopover, nameInput, v1Input, dash, v2Input, widthInp, commitBtn, cancelBtn);
      entry.appendChild(mainRow);

    } else {
      // ── Display row ───────────────────────────────────────────────────────
      if (seg.id === selectedSegmentId) entry.classList.add('list-selected');

      // Baseline list-click-to-canvas-highlight, the segment equivalent of
      // what vertex list rows already get via selectVertexById's off-mode
      // branch — previously missing entirely (only this row's own
      // sub-widgets had click handlers). Mirrors handleCanvasClick's own
      // segment-hit-test branch exactly: same segmentMode guard (a click
      // during active segment-drawing is reserved for vertex picks, not
      // reinterpreted as selecting an existing segment), same toggle-off,
      // same clearing of vertex focus/selection.
      entry.addEventListener('click', () => {
        if (isEditingBlocked() || segmentMode !== 'off') return;
        selectedSegmentId = seg.id === selectedSegmentId ? null : seg.id;
        selectedFaceId    = null;
        focusedVertexId   = null;
        selectedVertexIds.clear();
        renderVertexList();
        renderSegmentList();
        renderFaceList();
        draw();
      });

      const swatch = document.createElement('span');
      swatch.className = 's-swatch';
      swatch.style.background = seg.color;
      swatch.style.height = `${Math.min(Math.max(seg.lineWidth ?? 1.5, 1), 8)}px`;

      const label = document.createElement('span');
      label.className = 's-name';
      label.textContent = `${seg.name}: ${v1?.name ?? '?'} – ${v2?.name ?? '?'}`;

      // Same validated-text widget as the add-row/edit-row (see vertex's
      // radiusInp above) — shows a governing constant's name rather than a
      // flattened number, and typing/pasting can never produce one.
      const widthInp = document.createElement('input');
      widthInp.type = 'text';
      mobileTextInput(widthInp);
      widthInp.inputMode = 'decimal';
      widthInp.className = 'v-coord';
      widthInp.style.width = '32px';
      widthInp.title = 'Line width';
      widthInp.disabled = inEdit;
      widthInp.addEventListener('click', e => e.stopPropagation());
      widthInp.addEventListener('focus', () => snapshot());
      wireNumericAttrInput(widthInp,
        () => seg.widthExpr ?? String(seg.lineWidth ?? 1.5),
        n => { seg.lineWidth = n; seg.widthExpr = String(n); draw(); }
      );

      const editBtn = document.createElement('button');
      editBtn.textContent = '✎';
      editBtn.className = 'v-toggle';
      editBtn.title = 'Edit';
      editBtn.disabled = inEdit;
      editBtn.addEventListener('click', e => { e.stopPropagation(); enterSegmentEditMode(seg.id); });

      const boolEnv = buildEnvs().boolEnv;
      const visibleWrap = document.createElement('span');
      visibleWrap.className = 'v-toggle-wrap';
      const toggle = document.createElement('button');
      toggle.className = 'v-toggle';
      toggle.disabled = inEdit;
      const visibleSub = document.createElement('sub');
      visibleSub.className = 'v-toggle-const';
      visibleWrap.append(toggle, visibleSub);
      applyBoolToggleDisplay(toggle, visibleSub, seg.visibleExpr ?? String(seg.visible !== false), boolEnv);
      toggle.title = seg.visible ? 'Hide' : 'Show';
      toggle.addEventListener('click', e => {
        e.stopPropagation();
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
      del.addEventListener('click', e => {
        e.stopPropagation();
        snapshot();
        segments = segments.filter(s => s.id !== seg.id);
        if (selectedSegmentId === seg.id) selectedSegmentId = null;
        renderSegmentList();
        draw();
      });

      entry.append(swatch, label, widthInp, editBtn, visibleWrap, del);
    }

    list.appendChild(entry);
    if (seg.id === selectedSegmentId) selectedEntry = entry;
  }
  // Deferred until the full list is built (see NOTES6, "scroll-into-view
  // timing bug") — calling scrollIntoView mid-loop computes "nearest"
  // against a container that doesn't have its later rows appended yet,
  // producing a wrong (truncated-height) scroll amount instead of the
  // correct minimal one.
  if (selectedEntry) selectedEntry.scrollIntoView({ block: 'nearest' });
  else list.scrollTop = savedScroll;
  updateListToggle('segment');
}

// No edit mode yet, no color popover — the text/interpreter `edit face`
// command exists (replace/insert/remove/overwrite), but no buttons/fields
// for it in the control panel yet (see SotU backlog). Visibility toggle,
// delete, and (as of this session) list-click-to-canvas-highlight, same
// baseline vertex/segment rows already have.
function renderFaceList() {
  const list   = document.getElementById('face-list');
  const savedScroll = list.scrollTop;
  list.innerHTML = '';
  const inEdit = editingVertexId !== null || editingSegmentId !== null;
  let selectedEntry = null;

  for (const f of faces) {
    const entry = document.createElement('div');
    entry.className = 'segment-entry';
    if (f.id === selectedFaceId) entry.classList.add('list-selected');

    // Baseline list-click-to-canvas-highlight — same pattern segment's row
    // just got: sets selectedFaceId (drawn as a boundary halo in
    // drawFaces), clears the other object types' selection, and stays out
    // of the way of an in-progress face draw-mode pick.
    entry.addEventListener('click', () => {
      if (isEditingBlocked() || faceMode !== 'off') return;
      selectedFaceId    = f.id === selectedFaceId ? null : f.id;
      selectedSegmentId = null;
      focusedVertexId   = null;
      selectedVertexIds.clear();
      renderVertexList();
      renderSegmentList();
      renderFaceList();
      draw();
    });

    const swatch = document.createElement('span');
    swatch.className = 's-swatch';
    swatch.style.background = f.color;

    const label = document.createElement('span');
    label.className = 's-name';
    label.textContent = f.name;

    const visibleWrap = document.createElement('span');
    visibleWrap.className = 'v-toggle-wrap';
    const toggle = document.createElement('button');
    toggle.className = 'v-toggle';
    toggle.disabled = inEdit;
    const visibleSub = document.createElement('sub');
    visibleSub.className = 'v-toggle-const';
    visibleWrap.append(toggle, visibleSub);
    applyBoolToggleDisplay(toggle, visibleSub, f.visibleExpr ?? String(f.visible !== false), buildEnvs().boolEnv);
    toggle.title = f.visible ? 'Hide' : 'Show';
    toggle.addEventListener('click', e => {
      e.stopPropagation();
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
    del.addEventListener('click', e => {
      e.stopPropagation();
      snapshot();
      faces = faces.filter(x => x.id !== f.id);
      if (selectedFaceId === f.id) selectedFaceId = null;
      renderFaceList();
      draw();
    });

    entry.append(swatch, label, visibleWrap, del);
    list.appendChild(entry);
    if (f.id === selectedFaceId) selectedEntry = entry;
  }
  // Deferred until the full list is built — see the identical comment in
  // renderSegmentList (NOTES6, "scroll-into-view timing bug"). Face had a
  // second, compounding issue: the old code always ran `list.scrollTop =
  // savedScroll` unconditionally right after the loop, which silently
  // undid whatever the (also mistimed) mid-loop scrollIntoView had just
  // done — the reason face's selection scroll appeared to do nothing at
  // all, not just the wrong amount.
  if (selectedEntry) selectedEntry.scrollIntoView({ block: 'nearest' });
  else list.scrollTop = savedScroll;
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
    // Only actually matters for key === 'vertex' (collapsing/reopening that
    // section is what hides/reshows the button — see
    // updatePendingButtonPosition) — harmless, cheap no-op otherwise, not
    // worth gating on which key this is.
    updatePendingButtonPosition();
    updateArmButtons();
  });
});

document.getElementById('btn-segment').addEventListener('click', () => {
  const wasOff = segmentMode === 'off';
  if      (segmentMode === 'off')  segmentMode = 'on';
  else if (segmentMode === 'on')   segmentMode = 'on++';
  else                             segmentMode = 'off';
  if (segmentMode !== 'off') { selectedSegmentId = null; selectedFaceId = null; }
  // Mutually exclusive with face mode, but only pauses it — facePickOrder
  // is preserved (same as segmentMode itself never clearing
  // selectedVertexIds), resumable later by clicking "draw" on the face row.
  faceMode = 'off';
  clearPendingListPick();
  clearArmedStates();
  if (wasOff && segmentMode !== 'off' && selectedVertexIds.size === 0 && facePickOrder.length === 1) {
    // Symmetric counterpart to btn-face's own adoption below — without
    // this, a single vertex sitting in facePickOrder (whether itself
    // carried over from off-mode priming, or from one genuine face click)
    // was stranded the moment segment mode activated: segmentMode never
    // touched facePickOrder, so selectedVertexIds stayed empty and the
    // vertex's green ring became purely cosmetic — primed for nothing.
    // Gating on selectedVertexIds being empty (not on facePickOrder's
    // history) mirrors exactly how btn-face's own adoption is gated on
    // *its* target set being empty, so this activates in precisely the
    // same class of situation, just mirrored.
    selectedVertexIds = new Set(facePickOrder);
    facePickOrder = [];
  }
  updateSegmentButton();
  updateFaceButton();
  renderVertexList();
  renderSegmentList();
  renderFaceList();
  draw();
});

document.getElementById('btn-face').addEventListener('click', () => {
  const wasOff = faceMode === 'off';
  if      (faceMode === 'off')  faceMode = 'on';
  else if (faceMode === 'on')   faceMode = 'on++';
  else                          faceMode = 'off';
  // facePickOrder itself is never touched here, on any transition — same
  // precedent as segmentMode never clearing selectedVertexIds, so on++ can
  // step back down to on (or pause at off and resume) without losing
  // progress. Only the transient "still deciding" list UI gets dismissed,
  // since a floating confirm button describing a now-stale action would be
  // confusing.
  clearPendingListPick();
  clearArmedStates();
  if (wasOff && faceMode !== 'off') {
    // Starting fresh or resuming a paused pick — mutually exclusive with
    // segment mode either way.
    segmentMode       = 'off';
    selectedSegmentId = null;
    selectedFaceId    = null;
    updateSegmentButton();
    // Off-mode single-vertex priming carries over as the first pick, same
    // as segment mode already carries selectedVertexIds forward — but only
    // when there's no paused pick already waiting to be resumed. btn-segment
    // has the exact mirror of this block, for the reverse direction.
    if (facePickOrder.length === 0 && selectedVertexIds.size === 1) {
      facePickOrder = [...selectedVertexIds];
    }
    selectedVertexIds.clear();
    focusedVertexId = null;
  }
  updateFaceButton();
  renderVertexList();
  renderSegmentList();
  renderFaceList();
  draw();
});

segColorPicker = setupColorPicker(
  document.getElementById('seg-color-btn'),
  document.getElementById('seg-color-popover'),
  document.getElementById('seg-color-presets'),
  document.getElementById('seg-color-grid'),
  document.getElementById('seg-color'),
  () => lastSetSegment.color ?? DEFAULT_COLOR,
  name => { lastSetSegment.color = name; },
  hex => { lastSetSegment.color = hex; document.getElementById('seg-color-btn').style.background = hex; },
  renderAddRowDefaults
);

const refreshSegWidth = wireNumericAttrInput(document.getElementById('seg-width'),
  () => lastSetSegment.width ?? BUILTIN_SET_DEFAULTS.segment.width,
  n  => { lastSetSegment.width = String(n); });

faceColorPicker = setupColorPicker(
  document.getElementById('face-color-btn'),
  document.getElementById('face-color-popover'),
  document.getElementById('face-color-presets'),
  document.getElementById('face-color-grid'),
  document.getElementById('face-color'),
  () => lastSetFace.color ?? DEFAULT_COLOR,
  name => { lastSetFace.color = name; },
  hex => { lastSetFace.color = hex; document.getElementById('face-color-btn').style.background = hex; },
  renderAddRowDefaults
);

document.getElementById('face-add-more').addEventListener('click', () => {
  const row  = document.getElementById('face-add-extra');
  const btn  = document.getElementById('face-add-more');
  const open = row.style.display === 'none';
  row.style.display = open ? '' : 'none';
  btn.classList.toggle('active', open);
});
document.getElementById('face-add-visible').addEventListener('click', () => {
  toggleGoverningBool(lastSetFace, 'visible', BUILTIN_SET_DEFAULTS.face.visible, buildEnvs().boolEnv);
});

document.getElementById('seg-add-more').addEventListener('click', () => {
  const row  = document.getElementById('seg-add-extra');
  const btn  = document.getElementById('seg-add-more');
  const open = row.style.display === 'none';
  row.style.display = open ? '' : 'none';
  btn.classList.toggle('active', open);
});
document.getElementById('seg-add-visible').addEventListener('click', () => {
  toggleGoverningBool(lastSetSegment, 'visible', BUILTIN_SET_DEFAULTS.segment.visible, buildEnvs().boolEnv);
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
    name: s.name,
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

  // Auto-grow the textarea to exactly its content height (never scrolls
  // internally — .code-editor-wrap is the sole scroll container, see its
  // CSS comment) and match the gutter's height to it. Resetting to 'auto'
  // first is required — reading scrollHeight without it would report a
  // stale, too-large value carried over from the previous (taller) height
  // whenever content shrinks (e.g. after deleting lines). This runs on
  // every call site that changes the text (typing across a line boundary,
  // paste, Sort, Save, Load, interpreter submit) since they all funnel
  // through this function already — no separate hook needed anywhere else.
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
  gutter.style.height   = textarea.style.height;
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
  codeCurrentLineCount    = lines.length;
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
  // Let an explicit `counter=` (or a run of blank-name lines under a custom
  // `naming=`) carry forward into future controls-driven creation too.
  syncNameCounterFromParse(lastSetVertex,  AUTO_NAME_PREFIX.vertex,  staged);
  syncNameCounterFromParse(lastSetSegment, AUTO_NAME_PREFIX.segment, staged);
  syncNameCounterFromParse(lastSetFace,    AUTO_NAME_PREFIX.face,    staged);

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
  selectedFaceId    = null;
  clearArmedStates();

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

  document.getElementById('interpreter-input').classList.add('interpreter-expanded');
  document.getElementById('btn-interpreter-submit').style.display = '';
  resizeInterpreterInput();

  const textarea = document.getElementById('code-textarea');
  textarea.value = serializeState(vertices, constants, segments, faces);
  // '#sub-code' is already display:'' by this point (set above), so
  // reparseAndPreview()'s auto-grow (inside refreshCodeGutterAndErrors)
  // measures a real, laid-out scrollHeight here — no separate height-sync
  // needed the way the old ResizeObserver-based approach required.
  reparseAndPreview();
  resetCodeLineTracking();
  updateUndoButtons();
}

function closeCodeSubmenu() {
  codeOpen        = false;
  previewOverride = null;
  codeLineRecords = [];
  document.getElementById('code-gutter').innerHTML    = '';
  document.getElementById('code-error-list').innerHTML = '';

  document.getElementById('sub-code').style.display = 'none';
  document.getElementById('btn-sub-code').classList.remove('active');

  document.getElementById('interpreter-input').classList.remove('interpreter-expanded');
  document.getElementById('interpreter-input').style.height = '';
  document.getElementById('btn-interpreter-submit').style.display = 'none';

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
  // unsaved edits, lastSetVertex/lastSetSegment already reflect that, and
  // renderAddRowDefaults() reads them directly (no separate sync needed).
  renderAddRowDefaults();

  updateUndoButtons();
  draw();
}

function codeExit() {
  submitInterpreterToFile();
  codeSort();
  closeCodeSubmenu();
}

function codeSaveExit() {
  submitInterpreterToFile();
  codeSave();
  closeCodeSubmenu();
}

// ─── Interpreter (command line) ────────────────────────────────────────────
//
// Single shared textarea (#interpreter-input): one row while the code file
// is closed, a capped/scrollable staging area at its tail while open. Both
// modes feed the exact same parsing/commit machinery the Code submenu
// already uses — no separate resolution logic of its own.

// Grows the textarea to fit its content (typed content can only ever be
// multi-line in open mode, since closed mode's Enter always submits instead
// of inserting a newline) — CSS max-height/overflow does the actual capping
// and scroll once content exceeds it.
function resizeInterpreterInput() {
  const input = document.getElementById('interpreter-input');
  input.style.height = 'auto';
  input.style.height = input.scrollHeight + 'px';
}

// Closed mode: resolves the typed/pasted content — normally one line, but a
// multi-line paste is handled the same way — against the current fully-
// archived state (serializeState is always canonical) and commits it
// immediately as first-class objects, or updates the governing `set`
// defaults — same tail as codeSave(), just fed this content instead of a
// whole edited file. All-or-nothing: every submitted line must be valid, or
// nothing is committed — held in the box, flagged, never written anywhere,
// since closed mode has no code view to show a partial result in.
function submitInterpreterLine() {
  const input = document.getElementById('interpreter-input');
  const line  = input.value;
  if (line.trim() === '') return;

  const staged    = parseCodeText(serializeState(vertices, constants, segments, faces) + '\n' + line);
  // The submitted content is always exactly the tail of the combined text —
  // serializeState(...) supplies everything before it — so its own line
  // count pinpoints which staged.lines entries are newly submitted, however
  // many there are.
  const newRecs   = staged.lines.slice(-line.split('\n').length);
  const badIdx    = newRecs.findIndex(r => !r.valid);

  if (badIdx !== -1) {
    input.classList.add('expr-invalid');
    const msg = newRecs[badIdx].errorMsg ?? 'invalid line';
    input.title = newRecs.length > 1 ? `Line ${badIdx + 1}: ${msg}` : msg;
    return;
  }

  input.classList.remove('expr-invalid');
  input.removeAttribute('title');

  // A lone `edit` line gets a cheap, targeted commit instead of the full
  // reparse-and-rebuild below: it only ever mutates the one named object in
  // place, so there's no reason to reassign every object's id on every
  // edit the way create/set commits already do. (A multi-line paste mixing
  // edit with other line kinds falls through to the full pipeline below,
  // which still applies the edit correctly — parseCodeText already mutated
  // the staged object in place above — just not via this cheap path; that
  // mix is rare enough not to warrant its own branch.)
  if (newRecs.length === 1 && newRecs[0].kind === 'edit') {
    const parsed = newRecs[0].parsed;
    const { editType, targetName } = parsed;

    // A const edit has no fields/coords/endpoints to Object.assign — just
    // the one value, already validated against the constant's locked kind
    // during the parse above (resolveConstByKind) — so it gets its own
    // tiny commit rather than reusing the vertex/segment/face shape below.
    if (editType === 'const') {
      const target = constants.find(c => c.name === targetName);
      snapshot();
      target.expr  = parsed.newExpr;
      target.value = parsed.newValue;
      reEvalObjects();
      renderConstList();
      renderVertexList();
      renderSegmentList();
      renderFaceList();
      draw();
      input.value = '';
      resizeInterpreterInput();
      return;
    }

    const { fields, coordEdits, endpointEdits, faceVertexNames } = parsed;
    const liveArray = editType === 'vertex' ? vertices : editType === 'segment' ? segments : faces;
    const target = liveArray.find(o => o.name === targetName);
    snapshot();
    Object.assign(target, fields);
    // Live vertices carry the identical coords[]/exprs[] shape staged ones
    // do (buildCommittedArraysFromStaged copies them straight across), so
    // this applies exactly the same way parseCodeText already applied it
    // to the staged object above — no name/id translation needed here,
    // unlike segment endpoints below.
    if (coordEdits) {
      for (const axis of ['x', 'y', 'z']) {
        if (!(axis in coordEdits)) continue;
        const idx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
        target.coords[idx] = coordEdits[axis].value;
        target.exprs[idx]  = coordEdits[axis].expr;
      }
    }
    // Live segments reference vertices by id (vertexIds), not name — unlike
    // the staged v1Name/v2Name parseCodeText already validated/applied
    // above, so the given name needs resolving to a live vertex's id here.
    // The name is guaranteed to resolve: it was already confirmed to exist
    // during the validation parse above, and nothing can have removed it
    // in between (single-threaded).
    if (endpointEdits) {
      if ('v0' in endpointEdits) target.vertexIds[0] = vertices.find(v => v.name === endpointEdits.v0).id;
      if ('v1' in endpointEdits) target.vertexIds[1] = vertices.find(v => v.name === endpointEdits.v1).id;
    }
    // Live faces reference vertices by id, not name — same translation
    // segment endpoints needed above, just for a variable-length list
    // instead of two fixed slots. Every name is guaranteed to resolve for
    // the same reason: already confirmed to exist during the validation
    // parse above, single-threaded so nothing can have changed since.
    if (faceVertexNames) {
      target.vertexIds = faceVertexNames.map(n => vertices.find(v => v.name === n).id);
    }
    reEvalObjects();
    renderVertexList();
    renderSegmentList();
    renderFaceList();
    draw();
    input.value = '';
    resizeInterpreterInput();
    return;
  }

  const { newVertices, newConstants, newSegments, newFaces } = buildCommittedArraysFromStaged(staged);

  lastSetVertex  = { ...staged.finalSet.vertex };
  lastSetSegment = { ...staged.finalSet.segment };
  lastSetFace    = { ...staged.finalSet.face };
  // lastSet* just changed — renderConstList() below (via its own
  // renderAddRowDefaults() call) picks it up automatically, since the
  // add-rows now read lastSetVertex/lastSetSegment/lastSetFace directly
  // rather than a separately-synced shadow copy.
  syncNameCounterFromParse(lastSetVertex,  AUTO_NAME_PREFIX.vertex,  staged);
  syncNameCounterFromParse(lastSetSegment, AUTO_NAME_PREFIX.segment, staged);
  syncNameCounterFromParse(lastSetFace,    AUTO_NAME_PREFIX.face,    staged);

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
  selectedFaceId    = null;
  clearArmedStates();

  reEvalObjects();
  renderConstList();
  renderVertexList();
  renderSegmentList();
  renderFaceList();
  draw();

  input.value = '';
  resizeInterpreterInput();
}

// Open mode: pure relocation, no parsing/sorting — appends the interpreter's
// raw text to the bottom of the code file verbatim (valid or not; the code
// editor's own error display takes over once it's there). Sorting stays a
// separate, deliberate action ("archiving"), never a side effect of this.
function submitInterpreterToFile() {
  const input = document.getElementById('interpreter-input');
  const text  = input.value;
  if (text.trim() === '') return;

  const textarea = document.getElementById('code-textarea');
  textarea.value = textarea.value.replace(/\n*$/, '') + '\n\n' + text;

  input.value = '';
  resizeInterpreterInput();

  reparseAndPreview();
  resetCodeLineTracking();
}

document.getElementById('btn-sub-code').addEventListener('click', () => {
  if (!codeOpen) openCodeSubmenu();
  else           codeExit();
});

document.getElementById('btn-code-sort').addEventListener('click', codeSort);
document.getElementById('btn-code-save').addEventListener('click', codeSave);
document.getElementById('btn-code-exit').addEventListener('click', codeExit);
document.getElementById('btn-code-save-exit').addEventListener('click', codeSaveExit);

{
  const interpreterEl = document.getElementById('interpreter-input');
  interpreterEl.addEventListener('input', () => {
    interpreterEl.classList.remove('expr-invalid');
    interpreterEl.removeAttribute('title');
    resizeInterpreterInput();
  });
  // Closed: Enter — with or without Shift/Ctrl/etc. — always submits the
  // single line immediately; no keyboard combination is allowed to insert a
  // newline here (paste is still unaffected, since it never fires a
  // keydown). Open: Enter is a normal newline — the interpreter is a
  // multi-line staging area there, committed only via the submit button.
  interpreterEl.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || codeOpen) return;
    e.preventDefault();
    submitInterpreterLine();
  });
  document.getElementById('btn-interpreter-submit').addEventListener('click', submitInterpreterToFile);
}

// Validation/live-preview is gated on "leaving a line after changing it" —
// not on every keystroke — so errors don't flash up mid-edit. Arrow keys,
// clicks, and Enter all move the caret (and 'keyup' fires after the browser
// has already applied the move), so checking on keyup/click/blur is enough;
// plain typing within a line never trips it since the caret's line index
// doesn't change.
{
  const codeTextareaEl = document.getElementById('code-textarea');

  function codeCheckLineLeave(forceCheck) {
    const lines  = codeTextareaEl.value.split('\n');
    const idxNow = codeTextareaEl.value.slice(0, codeTextareaEl.selectionStart).split('\n').length - 1;
    const movedLine = idxNow !== codeCurrentLineIdx;
    if (movedLine || forceCheck) {
      const leftLineNow  = lines[codeCurrentLineIdx] ?? '';
      // Total line count too, not just the left line's own text — pressing
      // Enter/Backspace across two blank lines leaves that comparison blind
      // (blank equals blank) even though the file just gained or lost a
      // line, which the gutter/auto-grow height need to know about.
      const countChanged = lines.length !== codeCurrentLineCount;
      if (leftLineNow !== codeCurrentLineSnapshot || countChanged) reparseAndPreview();
    }
    if (movedLine) {
      codeCurrentLineIdx      = idxNow;
      codeCurrentLineSnapshot = lines[idxNow] ?? '';
    }
    codeCurrentLineCount = lines.length;
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

// No scroll-sync listeners or ResizeObserver needed here anymore — the
// gutter and textarea are unscrolled, natural-height content inside
// .code-editor-wrap, the one real scroll container (see its CSS comment).
// Scrolling by touching the row-numbers column still works for free: with
// no scroll capability of its own, the gesture simply bubbles to the
// wrapper, same as touching any other non-scrollable content inside it
// would. Height matching between gutter and textarea is handled entirely
// by refreshCodeGutterAndErrors's auto-grow step, which already runs on
// every content change.

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

// ─── Mathematical-background overlay ───────────────────────────────────────────
// Closes the same way the color popovers do (a click that lands on the
// backdrop itself, not a descendant, per the `e.target === overlay` check —
// mirrors setupColorPicker's onOutsideClick), plus an explicit ✗ and Escape.
function openAboutOverlay() {
  document.getElementById('about-overlay').style.display = 'flex';
  // Re-renders on every open (cheap — the parsed PDF itself is cached by
  // pdf-viewer.js, only the per-page canvas draw repeats) so it always
  // fits the panel's *current* width, even if the window was resized
  // since the last time this was opened.
  if (window.renderMathBackgroundPdf) {
    window.renderMathBackgroundPdf(document.getElementById('about-frame'));
  }
}
function closeAboutOverlay() {
  document.getElementById('about-overlay').style.display = 'none';
}
document.getElementById('btn-about').addEventListener('click', openAboutOverlay);
document.getElementById('btn-about-close').addEventListener('click', closeAboutOverlay);
document.getElementById('about-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeAboutOverlay();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.getElementById('about-overlay').style.display !== 'none') closeAboutOverlay();
});

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('pointerdown', clearNameError, true);
document.addEventListener('keydown',     clearNameError, true);

// A clicked button keeps native keyboard focus afterward by default, which
// on every browser tested (iPad/laptop x Safari/Chrome) renders as a
// visibly darker grey — indistinguishable from an actual toggled-on state,
// or muddying a toggled-off one. A click is a momentary interaction, not a
// state of its own, so every button should drop focus the instant its own
// handler has run. One delegated listener covers every button in the app
// (submenu toggles, "…" buttons, draw, Ω, label/visible, etc.) without
// needing a blur() call added to each individual handler — and doesn't
// touch non-button elements (a text input blurring itself on click would
// break typing).
document.addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (btn) btn.blur();
});

// Any click anywhere except the pending button itself clears an in-progress
// list-driven pick (face or segment) — capture phase, same idiom as
// onOutsideClick/clearNameError above, and the e.target guard is what lets
// the button's own click still land (pointerdown fires first and would
// otherwise remove it from the DOM before its click handler ever runs).
// Same reasoning exempts the vertex list's own collapse/expand toggle —
// without it, this listener would destroy the pick outright (pointerdown
// fires before the toggle's click handler) every time the section got
// collapsed, instead of letting updatePendingButtonPosition just hide the
// button while leaving the pick itself alive.
//
// Two more canvas-specific exemptions, both narrow — NOT "ignore canvas
// entirely" (NOTES7; an earlier draft of this fix did exactly that, and
// was walked back after realizing it was broader than the actual problem
// warranted):
//   - isControlPointDragStart: rotating the view is never a decision about
//     a pending pick (fixes a real bug — dragging the pointer used to
//     silently discard one).
//   - isPointerOnVertex(e, pendingListPick.vertexId): a pointerdown that's
//     about to land on the *exact* vertex currently pending — this is the
//     same race the button-itself exemption above solves, just for
//     canvas's own confirm gesture (hidden vertices became canvas-
//     clickable this session, including the pending one itself — pointerdown
//     always precedes the pointerup that would otherwise confirm it, so
//     without this the listener would clear the pick a frame before
//     handleCanvasClick got to act on it).
// Every *other* canvas pointerdown — a different vertex, empty space, a
// segment — still clears the pick exactly as before; only these two exact
// situations are carved out.
document.addEventListener('pointerdown', e => {
  if (!pendingListPick) return;
  if (e.target === pendingListPick.btnEl) return;
  if (e.target.closest('.list-toggle[data-list="vertex"]')) return;
  if (isControlPointDragStart(e)) return;
  if (isPointerOnVertex(e, pendingListPick.vertexId)) return;
  clearPendingListPick();
}, true);

// Same clear-on-outside-click precedent as pendingListPick above, for the
// undo-latest-vertex arm states — except canvas is exempted entirely: its
// own click handling (applyFacePick, or the segment toggle's own inline
// logic in selectVertexById) already resolves arm state correctly on its
// own, invoked from pointerup, and would otherwise have its arm cleared out
// from under it by this pointerdown-phase listener before that handler
// ever runs (the same race the pendingListPick.btnEl exemption above
// solves for its own button). Also exempts the armed vertex's own row (or
// v0's row, while its close-arm is active) and both companion buttons, for
// the identical reason — those are exactly the taps meant to *resolve* the
// arm, not cancel it.
document.addEventListener('pointerdown', e => {
  if (armedVertexId === null && !faceCloseArmed) return;
  if (e.target === canvas) return;
  if (e.target === latestBtnEl || e.target === closeBtnEl) return;
  const row   = e.target.closest && e.target.closest('.vertex-entry');
  const rowId = row ? Number(row.dataset.vertexId) : null;
  if (rowId === armedVertexId) return;
  if (faceCloseArmed && facePickOrder.length > 0 && rowId === facePickOrder[0]) return;
  clearArmedStates();
  renderVertexList();
  draw();
}, true);

// Keeps the pending-pick button clamped to its row as any scrollable
// ancestor moves it — `scroll` events don't bubble, but do reach capture-
// phase listeners on ancestors, so this one listener catches #vertex-list's
// own scrolling and #controls-body's (if that's ever what's scrolling)
// without needing to know which one. No-ops immediately when nothing is
// pending. See updatePendingButtonPosition's own comment for the full
// clamping behavior. updateArmButtons follows the same clamping logic for
// the undo-latest-vertex buttons, for the same reason.
document.addEventListener('scroll', updatePendingButtonPosition, true);
document.addEventListener('scroll', updateArmButtons, true);

updateUndoButtons();
renderConstList();
renderVertexList();
renderSegmentList();
renderFaceList();
resize();
