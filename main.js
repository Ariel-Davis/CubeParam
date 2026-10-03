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
let functions       = [];  // [{ id, name, params: [...], bodyExpr }] — no `value`/auto-name (see parseCodeText's function branch): a function is registered, not evaluated, until something calls it, and an unnamed function would be uncallable.
let nextFunctionId  = 0;
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
let curves           = [];
let nextCurveId      = 0;
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
let previewOverride  = null;   // { vertices, segments, faces, curves } staged preview while editing, or null

// The "set" cluster shown at the top of VERTICES/SEGMENTS on a fresh Load —
// updated on every Save so the last-saved governing values are what greets
// you next time you open the code file, rather than resetting to the
// built-in defaults. Deliberately outside the undo/redo system (like
// darkMode/userScale) — it's a UI convenience for what new code should
// default to, not part of the object model itself.
let lastSetVertex  = { color: undefined, r: undefined, visible: undefined, label: undefined, naming: undefined, counter: undefined };
let lastSetSegment = { color: undefined, width: undefined, visible: undefined, naming: undefined, counter: undefined };
let lastSetFace    = { color: undefined, visible: undefined, naming: undefined, counter: undefined };
let lastSetCurve   = { color: undefined, visible: undefined, naming: undefined, counter: undefined };

// This governing-default cluster is deliberately outside captureState()/
// restoreState() (see above) since ordinary undo/redo shouldn't touch it —
// but demo mode swaps to an entirely different document temporarily, which
// *does* need to save/restore it, or a demo scene's own governing defaults
// (e.g. `set face: color=c5`) leak into the user's real document once demo
// mode exits. These two helpers are demo mode's own save/restore pair for
// exactly this cluster, kept separate from captureState()/restoreState() on
// purpose.
function captureLastSet() {
  return {
    vertex:  { ...lastSetVertex },
    segment: { ...lastSetSegment },
    face:    { ...lastSetFace },
    curve:   { ...lastSetCurve },
  };
}
function applyLastSet(s) {
  lastSetVertex  = { ...s.vertex };
  lastSetSegment = { ...s.segment };
  lastSetFace    = { ...s.face };
  lastSetCurve   = { ...s.curve };
}

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
    curves:            curves.map(c => ({ ...c, points: [...(c.points ?? [])], domainIntervals: c.domainIntervals.map(iv => ({ ...iv })) })),
    selectedVertexIds: new Set(selectedVertexIds),
    constants:         constants.map(c => ({ ...c })),
    functions:         functions.map(f => ({ ...f, params: [...f.params] })),
    nextVertexId, nextSegmentId, nextFaceId, nextCurveId, nextConstantId, nextFunctionId,
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
  curves                 = state.curves ?? [];
  selectedVertexIds      = state.selectedVertexIds;
  constants              = state.constants ?? [];
  functions              = state.functions ?? [];
  nextVertexId           = state.nextVertexId;
  nextSegmentId          = state.nextSegmentId;
  nextFaceId             = state.nextFaceId;
  nextCurveId            = state.nextCurveId ?? 0;
  nextConstantId         = state.nextConstantId;
  nextFunctionId         = state.nextFunctionId ?? 0;
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
// Two-stage design (parse once to an AST, then either evaluate it or
// statically walk it for name references) — needed once user-defined
// functions exist: evaluating a call means re-evaluating the callee's own
// body against fresh argument bindings (can't be done inline against raw
// text the way the old single-pass evaluator worked), and the dependency
// graph that lets constants/functions reference each other in any order
// (see topoSortDependencies below) needs to know *which names* an
// expression references without evaluating it at all.
//
// Grammar (numeric and boolean unified into one grammar/evaluator, not two
// separate ones — every value-expression position in this app already
// bottlenecks through this one parser, so extending it directly makes
// every new construct usable anywhere a value-expression already can be,
// for free, rather than needing bespoke bridging logic at every call
// site):
//          numbers, +  -  *  /  ^, unary minus, parentheses,
//          \pi  \e  \sin(x)  \cos(x)  \tan(x)  \sqrt(x)  \abs(x) (builtins,
//          always backslash-prefixed, fixed arity — 0 for \pi/\e, 1 for the
//          rest, never user-overridable),
//          a bare identifier (a constant or a function parameter), and
//          NAME(arg [, arg ...]) — a call to a user-defined function
//          (bare, never backslash-prefixed — the backslash is what keeps
//          "the fixed builtin vocabulary" and "the open user namespace"
//          from ever colliding syntactically);
//          true / false (bool literals — CODE_IDENT_RE already reserves
//          both words, so there's no identifier-collision risk recognizing
//          them here), !  &  | (not/and/or, in that precedence order —
//          tightest to loosest — matching Python's own not/and/or
//          convention, not C's ! && ||), == != < <= > >= (comparisons,
//          binding tighter than !/&/| but looser than arithmetic, so
//          `!a==b` reads as `!(a==b)` and `a+1==b*2` reads as
//          `(a+1)==(b*2)`, again matching Python; non-chaining — `a<b<c`
//          is not supported, avoiding an ambiguous reading). == and !=
//          are tolerance-based (see CMP_EPSILON below), not bit-exact —
//          deliberate, not a compromise: proving two arbitrary expressions
//          symbolically equal is undecidable in general for a language
//          that includes +, ×, exp, sin, integers and π (Richardson's
//          theorem), so bit-exact equality would incorrectly reject
//          expressions that are mathematically identical but reached via
//          independent floating-point paths (e.g. 2*\sqrt(5) vs \sqrt(20),
//          or \cos(x)^2+\sin(x)^2 vs 1) — tolerance comparison is the
//          standard, correct tool for exactly this situation, not a
//          fallback. < <= > >= stay ordinary IEEE comparisons, deliberately
//          not fuzzed — equality tests a measure-zero target, which is
//          uniquely fragile under rounding; a half-line test isn't, except
//          exactly at a boundary, which is an inherent edge case for real
//          numbers regardless of representation.

// Parses `src` into an AST or returns { ok:false } on a syntax error —
// separated from evaluation because collectAstRefs (below) needs a parsed
// AST but no environment at all, and evalAst needs the AST but no
// re-parsing. Node shapes: {type:'num',value} (always number-producing),
// {type:'lit',value} (a bool literal, always bool-producing — kept
// distinct from 'num' so a node's own type already says which kind it
// produces, no separate tag needed), {type:'id',name} (kind determined at
// eval time by whichever env actually has the name — a name belongs to
// exactly one kind, enforced elsewhere), {type:'neg',arg},
// {type:'binop',op,left,right} (+ - * / ^, always number-producing),
// {type:'builtin',name,arg} (one of sin/cos/tan/sqrt/abs — pi/e are
// resolved immediately to a 'num' node, they're literals, not calls),
// {type:'call',name,args} (a user function call — kind determined by
// whatever the callee's body itself produces, naturally polymorphic),
// {type:'not',arg} / {type:'boolop',op,left,right} (op: '&'|'|', always
// bool-producing), {type:'cmp',op,left,right} (op one of the six
// comparisons, always bool-producing, left/right are ordinary arithmetic
// sub-expressions, not booleans).
function parseExprAst(src) {
  let pos = 0;
  const s = (src ?? '').trim();
  let failed = false;

  function skipWS() { while (pos < s.length && /\s/.test(s[pos])) pos++; }
  function peek()   { return s[pos]; }
  function startsWith(tok) { return s.slice(pos, pos + tok.length) === tok; }

  // Guarded/case expression: `cond{payload},cond{payload},...` — a
  // formal case-select, not arithmetic, usable anywhere a plain
  // value-expression already can be (constant values, vertex coordinates,
  // any ATTR_DEFS-driven attribute) since it's parsed at the very top of
  // this same grammar, above parseOr. Nestable — a payload can itself be
  // another guarded expression, recursively. `otherwise{payload}` (a
  // reserved keyword, only legal in a condition position) or a bare
  // trailing value with no condition/braces (equivalent shorthand,
  // unambiguous since every other term is `cond{payload}`-shaped) marks
  // the catch-all — either must be the last term. Node shape:
  // {type:'guard', terms:[{cond, payload, isOtherwise}, ...]} — cond is
  // null when isOtherwise is true.
  //
  // Deliberately tries an ordinary value expression first and only
  // commits to guard-parsing if a `{` actually follows it — `{` isn't
  // recognized anywhere else in this grammar, so this never backtracks
  // and every existing plain expression (no `{` anywhere) parses exactly
  // as before, unwrapped, with zero AST-shape change.
  function matchOtherwiseKeyword() {
    skipWS();
    if (!startsWith('otherwise')) return false;
    const after = s[pos + 'otherwise'.length];
    if (after !== undefined && /[a-zA-Z0-9_]/.test(after)) return false; // e.g. an identifier merely starting with "otherwise"
    pos += 'otherwise'.length;
    return true;
  }

  function parseExpr() {
    const terms = [];
    while (true) {
      skipWS();
      let cond = null, isOtherwise = false;
      if (matchOtherwiseKeyword()) {
        isOtherwise = true;
      } else {
        const parsedVal = parseOr();
        skipWS();
        if (peek() !== '{') {
          if (terms.length === 0) return parsedVal; // not guard-shaped at all — plain expression
          // Bare trailing value — shorthand for otherwise{...}. Must be
          // the last term; a trailing comma or anything else after it is
          // simply unparsed leftover content, caught by parseExprAst's own
          // "extra content at end" check, same as any other malformed line.
          terms.push({ cond: null, payload: parsedVal, isOtherwise: true });
          return { type: 'guard', terms };
        }
        cond = parsedVal;
      }
      skipWS();
      if (peek() !== '{') { failed = true; return { type: 'guard', terms }; }
      pos++;
      const payload = parseExpr(); // nestable — a payload may itself be a guarded expression
      skipWS();
      if (peek() === '}') pos++; else failed = true;
      terms.push({ cond, payload, isOtherwise });
      if (isOtherwise) return { type: 'guard', terms }; // otherwise/bare-value must be last
      skipWS();
      if (peek() === ',') { pos++; continue; }
      return { type: 'guard', terms };
    }
  }

  function parseOr() {
    let v = parseAnd(); skipWS();
    while (pos < s.length && peek() === '|') {
      pos++; skipWS();
      v = { type: 'boolop', op: '|', left: v, right: parseAnd() };
      skipWS();
    }
    return v;
  }

  function parseAnd() {
    let v = parseNot(); skipWS();
    while (pos < s.length && peek() === '&') {
      pos++; skipWS();
      v = { type: 'boolop', op: '&', left: v, right: parseNot() };
      skipWS();
    }
    return v;
  }

  function parseNot() {
    skipWS();
    if (pos < s.length && peek() === '!') { pos++; skipWS(); return { type: 'not', arg: parseNot() }; }
    return parseComparison();
  }

  // At most one comparison per this level — deliberately non-chaining
  // (`a<b<c` isn't legal here), and falls straight through to a bare
  // arithmetic result when no comparison operator follows, so this level
  // is transparent for every existing purely-arithmetic expression.
  function parseComparison() {
    const left = parseAddSub();
    skipWS();
    // 'in' membership test against a set literal (`a in {1,2,3}`) — reuses
    // parseSetExprAstAt, a *different* top-level parser/closure, entered
    // mid-expression and resumed from exactly where it stops (see that
    // function's own comment for why this needs an explicit position
    // rather than just calling parseSetExprAst on a substring).
    if (/^in(?![a-zA-Z0-9_])/.test(s.slice(pos))) {
      pos += 2; skipWS();
      const setRes = parseSetExprAstAt(s, pos);
      if (!setRes.ok) { failed = true; return left; }
      pos = setRes.endPos;
      return { type: 'in', numArg: left, setAst: setRes.ast };
    }
    let op = null;
    if (startsWith('==')) op = '==';
    else if (startsWith('!=')) op = '!=';
    else if (startsWith('<=')) op = '<=';
    else if (startsWith('>=')) op = '>=';
    else if (peek() === '<') op = '<';
    else if (peek() === '>') op = '>';
    if (!op) return left;
    pos += op.length; skipWS();
    return { type: 'cmp', op, left, right: parseAddSub() };
  }

  function parseAddSub() {
    let v = parseMulDiv(); skipWS();
    while (pos < s.length && (peek() === '+' || peek() === '-')) {
      const op = s[pos++]; skipWS();
      v = { type: 'binop', op, left: v, right: parseMulDiv() };
      skipWS();
    }
    return v;
  }

  function parseMulDiv() {
    let v = parsePow(); skipWS();
    while (pos < s.length && (peek() === '*' || peek() === '/')) {
      const op = s[pos++]; skipWS();
      v = { type: 'binop', op, left: v, right: parsePow() };
      skipWS();
    }
    return v;
  }

  function parsePow() {
    const base = parseUnary(); skipWS();
    if (pos < s.length && peek() === '^') {
      pos++; skipWS();
      return { type: 'binop', op: '^', left: base, right: parseUnary() };
    }
    return base;
  }

  function parseUnary() {
    skipWS();
    if (pos < s.length && peek() === '-') { pos++; skipWS(); return { type: 'neg', arg: parseAtom() }; }
    if (pos < s.length && peek() === '+') { pos++; skipWS(); return parseAtom(); }
    return parseAtom();
  }

  // Builtins are strictly one-arg, no commas — matches the pre-existing
  // grammar exactly (only comma-separated argument lists, parsed by
  // parseArgList below, are new — reserved for user function calls).
  function parseSingleArg() {
    skipWS();
    if (peek() !== '(') { failed = true; return { type: 'num', value: NaN }; }
    pos++;
    const arg = parseExpr();
    skipWS();
    if (peek() === ')') pos++; else failed = true;
    return arg;
  }

  function parseArgList() {
    skipWS();
    if (peek() !== '(') { failed = true; return []; }
    pos++; skipWS();
    const args = [];
    if (peek() === ')') { pos++; return args; }
    args.push(parseExpr()); skipWS();
    while (peek() === ',') {
      pos++; skipWS();
      args.push(parseExpr()); skipWS();
    }
    if (peek() === ')') pos++; else failed = true;
    return args;
  }

  function parseAtom() {
    skipWS();
    if (pos >= s.length) { failed = true; return { type: 'num', value: NaN }; }

    if (peek() === '(') {
      pos++;
      const v = parseExpr();
      skipWS();
      if (pos < s.length && peek() === ')') pos++; else failed = true;
      return v;
    }

    if (/[\d.]/.test(peek())) {
      const m = /^\d*\.?\d+([eE][+\-]?\d+)?/.exec(s.slice(pos));
      if (m) { pos += m[0].length; return { type: 'num', value: parseFloat(m[0]) }; }
      failed = true; return { type: 'num', value: NaN };
    }

    // Color literal — a new atom kind, added so a guard's payload can be
    // written inline (`b{#ff0000},otherwise{#00ff00}`) the same way a
    // plain color= attribute already is, rather than only ever a
    // reference to a pre-declared color constant. '#' is never used
    // elsewhere in expression text (comments are stripped before any
    // text reaches parseExprAst at all), so this is unambiguous.
    if (peek() === '#') {
      const m = /^#[0-9a-fA-F]{6}/.exec(s.slice(pos));
      if (m) { pos += m[0].length; return { type: 'colorlit', value: m[0] }; }
      failed = true; return { type: 'num', value: NaN };
    }

    if (peek() === '\\') {
      pos++;
      let name = '';
      while (pos < s.length && /[a-zA-Z]/.test(s[pos])) name += s[pos++];
      if (name === 'pi') return { type: 'num', value: Math.PI };
      if (name === 'e')  return { type: 'num', value: Math.E };
      if (name === 'sin' || name === 'cos' || name === 'tan' || name === 'sqrt' || name === 'abs') {
        return { type: 'builtin', name, arg: parseSingleArg() };
      }
      failed = true; return { type: 'num', value: NaN };
    }

    if (/[a-zA-Z_]/.test(peek())) {
      let name = '';
      while (pos < s.length && /[a-zA-Z0-9_]/.test(s[pos])) name += s[pos++];
      // true/false are reserved everywhere a name can appear (CODE_IDENT_RE),
      // so recognizing them as literals here can never shadow or collide
      // with a real identifier.
      if (name === 'true')  return { type: 'lit', value: true };
      if (name === 'false') return { type: 'lit', value: false };
      const save = pos;
      skipWS();
      if (peek() === '(') return { type: 'call', name, args: parseArgList() };
      pos = save; // no call parens — plain identifier, don't consume trailing whitespace we peeked past
      return { type: 'id', name };
    }

    failed = true;
    return { type: 'num', value: NaN };
  }

  const ast = parseExpr();
  skipWS();
  if (pos < s.length) failed = true;
  return failed ? { ok: false } : { ok: true, ast };
}

// Tolerance for == and != — see parseExprAst's own comment for why this is
// deliberate, not a compromise. Combined relative+absolute form (matches
// numpy.isclose / Python's math.isclose): tight enough to correctly reject
// values that actually differ, loose enough (many orders of magnitude
// above ordinary double-precision rounding noise, ~1e-15/1e-16) to accept
// expressions that are mathematically identical but reached via
// independent floating-point paths. Not yet exposed as a user-facing
// setting — revisit if a real case ever needs a different tolerance.
const CMP_EPSILON = 1e-9;
function numsClose(a, b) {
  return Math.abs(a - b) <= CMP_EPSILON * Math.max(Math.abs(a), Math.abs(b), 1);
}

// Evaluates a parsed AST. ctx = { numericEnv, boolEnv, functionEnv } — one
// evaluator for both kinds (not two separate ones), each node's *type*
// already says which kind it produces (see parseExprAst's own node-shape
// comment), so evaluation never needs an externally-supplied "which kind
// am I expecting" hint — a caller expecting a number checks
// `Number.isFinite` on the result, a caller expecting a bool checks
// `typeof result === 'boolean'` (see resolveNumAttr/resolveBoolAttr
// below), exactly the same way a caller already has to check `!parsed.ok`
// for a syntax error. Every arithmetic/boolean operator explicitly guards
// its operands' actual runtime kind and returns NaN on a mismatch (e.g. a
// bool referenced inside `+`, or a number referenced inside `&`) rather
// than letting JS silently coerce (`true + true` would otherwise silently
// become `2`) — this is what makes a type mistake fail loudly (as NaN,
// surfacing as "invalid expression" downstream, the same path every other
// unmet reference already takes) instead of silently producing a
// plausible-looking wrong answer.
//
// A function call binds its params into *fresh copies* of the caller's
// numericEnv/boolEnv (never mutates the caller's) — each parameter is
// explicitly cleared from *both* before being set in whichever one
// actually matches its evaluated argument's kind, so a parameter can never
// resolve against a stale outer value of the wrong kind even if its name
// happens to collide with an outer constant of the other kind (a genuine
// possibility — parameter names aren't checked against the shared
// constant/vertex/etc. namespace, shadowing is the whole point). Recursion
// through several distinct functions naturally nests correctly this way;
// recursion back into the *same* function can't happen at all, since a
// genuine self-reference is a self-loop in the dependency graph and gets
// rejected as a cycle before any function is ever registered (see
// topoSortDependencies).
function evalAst(ast, ctx) {
  switch (ast.type) {
    case 'num': return ast.value;
    case 'lit': return ast.value;
    case 'colorlit': return ast.value;
    case 'id': {
      if (ast.name in ctx.numericEnv) return ctx.numericEnv[ast.name];
      if (ctx.boolEnv && ast.name in ctx.boolEnv) return ctx.boolEnv[ast.name];
      if (ctx.colorEnv && ast.name in ctx.colorEnv) return ctx.colorEnv[ast.name];
      return NaN;
    }
    case 'neg': {
      const v = evalAst(ast.arg, ctx);
      return typeof v === 'number' ? -v : NaN;
    }
    case 'binop': {
      const l = evalAst(ast.left, ctx), r = evalAst(ast.right, ctx);
      if (typeof l !== 'number' || typeof r !== 'number') return NaN;
      if (ast.op === '+') return l + r;
      if (ast.op === '-') return l - r;
      if (ast.op === '*') return l * r;
      if (ast.op === '/') return r === 0 ? NaN : l / r;
      if (ast.op === '^') return Math.pow(l, r);
      return NaN;
    }
    case 'builtin': {
      const v = evalAst(ast.arg, ctx);
      if (typeof v !== 'number') return NaN;
      if (ast.name === 'sin')  return Math.sin(v);
      if (ast.name === 'cos')  return Math.cos(v);
      if (ast.name === 'tan')  return Math.tan(v);
      if (ast.name === 'sqrt') return v < 0 ? NaN : Math.sqrt(v);
      if (ast.name === 'abs')  return Math.abs(v);
      return NaN;
    }
    case 'not': {
      const v = evalAst(ast.arg, ctx);
      return typeof v === 'boolean' ? !v : NaN;
    }
    case 'boolop': {
      const l = evalAst(ast.left, ctx), r = evalAst(ast.right, ctx);
      if (typeof l !== 'boolean' || typeof r !== 'boolean') return NaN;
      return ast.op === '&' ? (l && r) : (l || r);
    }
    case 'cmp': {
      const l = evalAst(ast.left, ctx), r = evalAst(ast.right, ctx);
      if (typeof l !== 'number' || typeof r !== 'number' || !Number.isFinite(l) || !Number.isFinite(r)) return NaN;
      if (ast.op === '==') return numsClose(l, r);
      if (ast.op === '!=') return !numsClose(l, r);
      if (ast.op === '<')  return l < r;
      if (ast.op === '<=') return l <= r;
      if (ast.op === '>')  return l > r;
      if (ast.op === '>=') return l >= r;
      return NaN;
    }
    case 'in': {
      const v = evalAst(ast.numArg, ctx);
      if (typeof v !== 'number' || !Number.isFinite(v)) return NaN;
      return evalSetAst(ast.setAst).has(v);
    }
    case 'call': {
      const fn = ctx.functionEnv?.[ast.name];
      if (!fn || ast.args.length !== fn.params.length) return NaN;
      const argVals = ast.args.map(a => evalAst(a, ctx));
      const localNumericEnv = { ...ctx.numericEnv };
      const localBoolEnv    = { ...ctx.boolEnv };
      const localColorEnv   = { ...ctx.colorEnv };
      fn.params.forEach((p, i) => {
        delete localNumericEnv[p];
        delete localBoolEnv[p];
        delete localColorEnv[p];
        if (typeof argVals[i] === 'number') localNumericEnv[p] = argVals[i];
        else if (typeof argVals[i] === 'boolean') localBoolEnv[p] = argVals[i];
        else if (typeof argVals[i] === 'string') localColorEnv[p] = argVals[i];
        // else: argVals[i] is NaN (an invalid argument) — leave the param
        // unresolved in all three, so any reference to it inside the body
        // fails as an ordinary unmet reference rather than reading a stale
        // outer value of the wrong kind.
      });
      return evalAst(fn.bodyAst, { numericEnv: localNumericEnv, boolEnv: localBoolEnv, colorEnv: localColorEnv, functionEnv: ctx.functionEnv });
    }
    case 'guard': {
      // First match wins, left to right — a formal case-select, not
      // literal arithmetic (see parseExprAst's own comment). Whatever
      // kind the matched payload produces is what this whole node
      // produces — inherently kind-polymorphic, same as 'id'/'call'.
      // "No branch matched" can only reach here for a guard the parse-time
      // totality checker (findGuardTotalityError) didn't get a chance to
      // validate — NaN is the correct, already-established "invalid"
      // signal for that case, not a crash.
      for (const term of ast.terms) {
        if (term.isOtherwise) return evalAst(term.payload, ctx);
        if (evalAst(term.cond, ctx) === true) return evalAst(term.payload, ctx);
      }
      return NaN;
    }
    default: return NaN;
  }
}

// Statically collects the set of GLOBAL names (other constants/functions)
// an AST references — used to build the dependency graph in
// topoSortDependencies below, *not* used during ordinary evaluation.
// `localNames` (a function's own parameters) are excluded — they're bound
// at call time, not global references, exactly mirroring how a curve's own
// bound parameter already shadows a same-named constant within its body.
// Builtins never contribute an edge (they're not part of the user
// namespace at all, backslash-prefixed specifically so they can never be
// confused with one). Grammar-agnostic by construction — a node type it
// doesn't recognize (e.g. 'num'/'lit', which never reference anything)
// just falls through with no ref added, so this needed no changes for the
// numeric/bool unification beyond adding cases for the new node types that
// *can* reference something.
function collectAstRefs(ast, localNames) {
  const refs = new Set();
  function walk(node) {
    if (!node) return;
    switch (node.type) {
      case 'id':
        if (!localNames.has(node.name)) refs.add(node.name);
        return;
      case 'call':
        if (!localNames.has(node.name)) refs.add(node.name);
        node.args.forEach(walk);
        return;
      case 'neg':     walk(node.arg); return;
      case 'binop':   walk(node.left); walk(node.right); return;
      case 'builtin': walk(node.arg); return;
      case 'not':     walk(node.arg); return;
      case 'boolop':  walk(node.left); walk(node.right); return;
      case 'cmp':     walk(node.left); walk(node.right); return;
      case 'in':      walk(node.numArg); return; // setAst never references a name — set members are plain integer literals
      case 'guard':
        node.terms.forEach(t => { if (t.cond) walk(t.cond); walk(t.payload); });
        return;
    }
  }
  walk(ast);
  return refs;
}

// Finds every 'guard' node anywhere in an AST (top-level or nested inside
// ordinary arithmetic/boolean structure, or inside another guard's own
// terms) — used to validate each one's exhaustiveness independently. Each
// guard is checked purely against its *own* local conditions, never an
// enclosing guard's — this is what lets nesting "just work": a nested
// guard only has to cover the subspace it was reached in, and checking it
// in isolation, ignoring how it got there, is exactly correct for that
// (see NOTES13's nesting discussion).
function findAllGuardNodes(ast) {
  const found = [];
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'guard') {
      found.push(node);
      node.terms.forEach(t => { if (t.cond) walk(t.cond); walk(t.payload); });
      return;
    }
    switch (node.type) {
      case 'neg': case 'not':   walk(node.arg); return;
      case 'binop': case 'boolop': case 'cmp': walk(node.left); walk(node.right); return;
      case 'builtin': walk(node.arg); return;
      case 'call': node.args.forEach(walk); return;
      case 'in': walk(node.numArg); return; // setAst never contains a guard — set members are plain integer literals
      default: return; // num, lit, id, colorlit — leaves, nothing to recurse into
    }
  }
  walk(ast);
  return found;
}

// A bare, non-negative integer bounding how many total combinations a
// single guard's exhaustiveness proof will attempt to enumerate
// (2^EXHAUSTIVENESS_CHECK_CAP, worst case) — past this, the check is
// refused rather than attempted, same "reject at the boundary rather than
// let an unbounded computation run" instinct as this project's other
// safety caps (the `counter=` safe-integer bound, the BSP pivot-search
// sample cap). A guard this wide should have an explicit `otherwise`
// clause anyway. Originally just "how many free bool variables" (each
// contributing a factor of 2); generalized (`NOTES15.md`) to bound the
// full Cartesian product's total size instead, now that a free variable
// can also be a domain-restricted number contributing an arbitrary
// (not-necessarily-2) factor — the bound and its meaning ("don't attempt
// a combinatorial explosion") are unchanged, only what's being counted.
const EXHAUSTIVENESS_CHECK_CAP = 20;

// Verifies one guard node always produces a value, for every reachable
// combination of the *free variables* its own conditions reference — lazy
// semantics (first match wins) still require *some* match; exclusivity is
// deliberately not checked (see NOTES13 — otherwise stops making sense
// under a strict/exclusivity-checked model). Returns an error string, or
// null if the guard is provably total.
//
// A free variable is enumerable if it has a known *finite* set of legal
// values: a global bool constant or a function's own bool-role parameter
// (`envs.boolEnv`, extended by the function-registration call site to
// also carry its own bool-role params — see classifyFunctionParamKinds)
// — true/false, exactly as before — or a number with a *declared domain*
// (`envs.domainEnv`, `NOTES15.md`'s extension) — its domain's own values,
// not just two. Anything else (a number with no declared domain, or
// anything not resolvable in either env at all — a local function
// parameter with no fixed bool role, an undeclared name) can't be
// enumerated and requires an explicit `otherwise` instead of an automatic
// proof.
//
// Deliberately scoped, not fully general: treating every directly-
// referenced free name as independently free, rather than walking into a
// *derived* bool/number's own definition to find its true independent
// roots, is a deliberate simplification, not an oversight — it can only
// ever test a *superset* of the states actually reachable (an impossible
// combination, where two referenced variables are secretly correlated
// through a shared derivation, just adds an extra constraint to satisfy),
// which can make this check reject a guard that a fuller analysis would
// have accepted, but can never make it accept one that a fuller analysis
// would have rejected. Sound, not maximally precise; revisit only if a
// real case actually needs the precision.
function checkGuardExhaustive(guardNode, envs) {
  const { numericEnv, boolEnv, functionEnv, domainEnv = {} } = envs;
  if (guardNode.terms.some(t => t.isOtherwise)) return null;

  const refs = new Set();
  for (const t of guardNode.terms) {
    if (t.cond) collectAstRefs(t.cond, new Set()).forEach(r => refs.add(r));
  }

  const evalCtx = (nEnv, bEnv) => ({ numericEnv: nEnv, boolEnv: bEnv, functionEnv });

  if (refs.size === 0) {
    for (const t of guardNode.terms) {
      if (evalAst(t.cond, evalCtx(numericEnv, boolEnv)) === true) return null;
    }
    return 'guard is not exhaustive (no branch matches, and no `otherwise` clause)';
  }

  // Each free variable contributes its own finite list of possible
  // values — [true, false] for a bool, or the declared domain's own
  // members for a domain-restricted number — rather than assuming every
  // variable is boolean the way the original bool-only version could.
  const freeVars = []; // [{ name, kind: 'bool'|'number', values: [...] }]
  for (const name of refs) {
    if (name in boolEnv) { freeVars.push({ name, kind: 'bool', values: [true, false] }); continue; }
    if (name in domainEnv) { freeVars.push({ name, kind: 'number', values: [...domainEnv[name]] }); continue; }
    if (name in numericEnv) {
      return `guard cannot be proven exhaustive — condition references a number ('${name}') with no declared domain to enumerate; add an \`otherwise\` clause`;
    }
    return `guard cannot be proven exhaustive — '${name}' isn't a known bool constant or domain-restricted number (a function parameter with no fixed bool role can't yet be proven exhaustive automatically); add an \`otherwise\` clause`;
  }

  const totalCombinations = freeVars.reduce((acc, v) => acc * v.values.length, 1);
  if (totalCombinations > (1 << EXHAUSTIVENESS_CHECK_CAP)) {
    return `guard's free variables span too many combinations (${totalCombinations}) to verify exhaustiveness automatically — add an \`otherwise\` clause`;
  }

  // Mixed-radix counter over the free variables' own value lists — a
  // direct generalization of the old 1<<n bitmask loop, which was really
  // just the special case where every variable's radix happened to be 2.
  const indices = new Array(freeVars.length).fill(0);
  while (true) {
    const hypNumericEnv = { ...numericEnv };
    const hypBoolEnv = { ...boolEnv };
    freeVars.forEach((v, i) => {
      const val = v.values[indices[i]];
      if (v.kind === 'bool') hypBoolEnv[v.name] = val; else hypNumericEnv[v.name] = val;
    });
    const matched = guardNode.terms.some(t => evalAst(t.cond, evalCtx(hypNumericEnv, hypBoolEnv)) === true);
    if (!matched) {
      const assignment = freeVars.map((v, i) => `${v.name}=${v.values[indices[i]]}`).join(', ');
      return `guard is not exhaustive — no branch matches when ${assignment}`;
    }
    let carry = true;
    for (let i = 0; i < indices.length && carry; i++) {
      indices[i]++;
      if (indices[i] >= freeVars[i].values.length) indices[i] = 0;
      else carry = false;
    }
    if (carry) break; // wrapped around after the last combination
  }
  return null;
}

// Validates every guard anywhere in an AST, returning the first problem
// found (or null). Called at parse time, not at every ordinary
// evaluation — this is deliberately a one-time, up-front check (see
// EXHAUSTIVENESS_CHECK_CAP's own reasoning for why it needs to stay
// bounded), not something re-run on every render.
function findGuardTotalityError(ast, envs) {
  for (const g of findAllGuardNodes(ast)) {
    const err = checkGuardExhaustive(g, envs);
    if (err) return err;
  }
  return null;
}

// Phase 6 — kind-generic ("template") function parameters. A function
// parameter's role is fixed by *syntactic position*, the same
// disambiguation-by-position principle this whole grammar already leans
// on: appearing anywhere an operator structurally requires a specific
// kind (an arithmetic/builtin/'in' operand, a comparison operand, a
// boolop/not operand, a guard condition) locks that parameter to that
// kind, no declaration needed — exactly how a literal already gets its
// kind from its own syntax. A parameter with *no* such occurrence
// anywhere is left generic: its concrete kind isn't fixed at definition,
// it's substituted fresh from each call's actual arguments instead (see
// inferExprKind below, which does the real per-call verification). Two
// *different* fixed-kind requirements for the same parameter (used as a
// number somewhere, a bool somewhere else) can never be satisfied by any
// single call — a genuine definition-time error, independent of how the
// function is ever called, checked once at registration exactly like
// guard totality already is.
//
// Renamed from findFunctionParamKindConflict and extended to also return
// `roles` (`NOTES15.md`'s totality-checker extension) — the totality
// checker reuses this same fixed-kind classification to let a guard
// condition reference a function's own bool-role *parameter*, not just a
// global bool constant, and still be proven exhaustive automatically.
function classifyFunctionParamKinds(fn) {
  const paramSet = new Set(fn.params);
  let conflict = null;
  const fixedKind = {};
  function note(name, kind) {
    if (conflict || !paramSet.has(name)) return;
    if (!(name in fixedKind)) fixedKind[name] = kind;
    else if (fixedKind[name] !== kind) conflict = { name, kinds: [fixedKind[name], kind] };
  }
  function walk(node, ctxKind) {
    if (!node || conflict) return;
    if (node.type === 'id') { if (ctxKind) note(node.name, ctxKind); return; }
    switch (node.type) {
      case 'neg': case 'builtin': walk(node.arg, 'number'); return;
      case 'binop': walk(node.left, 'number'); walk(node.right, 'number'); return;
      case 'not': walk(node.arg, 'boolean'); return;
      case 'boolop': walk(node.left, 'boolean'); walk(node.right, 'boolean'); return;
      case 'cmp': walk(node.left, 'number'); walk(node.right, 'number'); return;
      case 'in': walk(node.numArg, 'number'); return;
      case 'call': node.args.forEach(a => walk(a, null)); return;
      case 'guard':
        node.terms.forEach(t => { if (t.cond) walk(t.cond, 'boolean'); walk(t.payload, null); });
        return;
      default: return; // num, lit, colorlit — leaves, nothing to fix
    }
  }
  walk(fn.bodyAst, null);
  const roles = {};
  for (const p of fn.params) roles[p] = fixedKind[p] ?? 'generic';
  return { roles, conflict };
}

// The actual novel piece Phase 6 needs: a structural, per-call
// kind-consistency check that walks *every* branch of *every* guard, not
// just the one that would fire for particular values — necessary because
// ordinary evaluation only ever touches the branch that fires, so a kind
// mismatch hiding in an untaken branch (calling
// `f: x,y,z -> b1{x},!b1{b2{y},!b2{z}}` with x a number but y/z colors)
// would otherwise go completely undetected whenever b1 happens to be
// true. `kindCtx` substitutes one concrete kind for every name currently
// in scope that isn't a global (a function's own parameters, for this one
// call/verification) — {} at the true top level of an ordinary DSL
// expression, where every identifier is either a global constant or
// another function call. Returns { kind } (kind is
// 'number'|'boolean'|'color'|null — null meaning "references something
// unresolved," a *different*, already-handled error class, not this
// checker's problem) or { error }.
//
// Deliberately not scoped to "only calls to a function with a generic
// parameter" — this walks into *every* call it finds, including a fully
// non-generic ("closed") one, and — as a natural consequence of the same
// branch-unification a generic parameter's payload occurrences need
// anyway — also catches a guard whose branches disagree in kind even with
// no function involved at all (e.g. `visible: b{true},!b{5}`, currently
// unchecked at every kind before this). A related, previously-uncaught
// gap this same mechanism closes for free, not separately designed.
// Not cached — mirrors this project's own established BSP precedent (see
// the face-rendering section) of trading a caching optimization for
// guaranteed correctness once the underlying computation is cheap enough
// not to matter: re-run fresh every time the containing expression is
// (re)validated, negligible at this app's scale (function bodies a few
// nodes deep, "a handful to a few dozen hand-authored objects" per the
// architecture notes). Well-founded despite recursing into nested calls —
// a self- or mutually-recursive function can never reach functionEnv in
// the first place (topoSortDependencies evicts any such cycle before this
// ever runs), so there is no infinite-recursion risk here.
function inferExprKind(node, kindCtx, envs) {
  switch (node.type) {
    case 'num': return { kind: 'number' };
    case 'lit': return { kind: 'boolean' };
    case 'colorlit': return { kind: 'color' };
    case 'id': {
      if (node.name in kindCtx) return { kind: kindCtx[node.name] };
      if (node.name in envs.numericEnv) return { kind: 'number' };
      if (envs.boolEnv && node.name in envs.boolEnv) return { kind: 'boolean' };
      if (envs.colorEnv && node.name in envs.colorEnv) return { kind: 'color' };
      return { kind: null }; // unresolved — ordinary NaN path handles this
    }
    case 'neg': {
      const a = inferExprKind(node.arg, kindCtx, envs);
      if (a.error) return a;
      if (a.kind !== null && a.kind !== 'number') return { error: 'unary minus requires a number' };
      return { kind: 'number' };
    }
    case 'binop': {
      const l = inferExprKind(node.left, kindCtx, envs); if (l.error) return l;
      const r = inferExprKind(node.right, kindCtx, envs); if (r.error) return r;
      if ((l.kind !== null && l.kind !== 'number') || (r.kind !== null && r.kind !== 'number'))
        return { error: `'${node.op}' requires numbers` };
      return { kind: 'number' };
    }
    case 'builtin': {
      const a = inferExprKind(node.arg, kindCtx, envs);
      if (a.error) return a;
      if (a.kind !== null && a.kind !== 'number') return { error: `\\${node.name} requires a number` };
      return { kind: 'number' };
    }
    case 'not': {
      const a = inferExprKind(node.arg, kindCtx, envs);
      if (a.error) return a;
      if (a.kind !== null && a.kind !== 'boolean') return { error: '! requires a bool' };
      return { kind: 'boolean' };
    }
    case 'boolop': {
      const l = inferExprKind(node.left, kindCtx, envs); if (l.error) return l;
      const r = inferExprKind(node.right, kindCtx, envs); if (r.error) return r;
      if ((l.kind !== null && l.kind !== 'boolean') || (r.kind !== null && r.kind !== 'boolean'))
        return { error: `'${node.op}' requires bools` };
      return { kind: 'boolean' };
    }
    case 'cmp': {
      const l = inferExprKind(node.left, kindCtx, envs); if (l.error) return l;
      const r = inferExprKind(node.right, kindCtx, envs); if (r.error) return r;
      if ((l.kind !== null && l.kind !== 'number') || (r.kind !== null && r.kind !== 'number'))
        return { error: 'comparison requires numbers' };
      return { kind: 'boolean' };
    }
    case 'in': {
      const a = inferExprKind(node.numArg, kindCtx, envs);
      if (a.error) return a;
      if (a.kind !== null && a.kind !== 'number') return { error: "'in' requires a number" };
      return { kind: 'boolean' };
    }
    case 'call': {
      const fn = envs.functionEnv?.[node.name];
      if (!fn || node.args.length !== fn.params.length) return { kind: null }; // unresolved call — ordinary NaN path
      const argKinds = [];
      for (const a of node.args) {
        const r = inferExprKind(a, kindCtx, envs);
        if (r.error) return r;
        argKinds.push(r.kind);
      }
      // An argument whose own kind couldn't be pinned down (null) can't
      // usefully substitute into the callee — skip checking that callee
      // for this occurrence, same "not this checker's problem" deferral
      // as an unresolved 'id'.
      if (argKinds.some(k => k === null)) return { kind: null };
      const calleeCtx = {};
      fn.params.forEach((p, i) => { calleeCtx[p] = argKinds[i]; });
      const bodyRes = inferExprKind(fn.bodyAst, calleeCtx, envs);
      if (bodyRes.error) return { error: `in call to '${node.name}': ${bodyRes.error}` };
      return { kind: bodyRes.kind };
    }
    case 'guard': {
      let unified = null;
      for (const t of node.terms) {
        if (t.cond) {
          const c = inferExprKind(t.cond, kindCtx, envs);
          if (c.error) return c;
          if (c.kind !== null && c.kind !== 'boolean') return { error: 'guard condition must be a bool' };
        }
        const p = inferExprKind(t.payload, kindCtx, envs);
        if (p.error) return p;
        if (p.kind !== null) {
          if (unified === null) unified = p.kind;
          else if (unified !== p.kind) return { error: `guard branches produce different kinds ('${unified}' vs '${p.kind}')` };
        }
      }
      return { kind: unified };
    }
    default: return { kind: null };
  }
}

// Evaluates an expression string in an environment of named constants,
// bools, and (optionally) user-defined functions. Thin wrapper over
// parse+eval — functionEnv/boolEnv both default to empty, so every
// pre-existing call site keeps working unchanged (a bool/function
// reference there just resolves to NaN via the normal "unknown
// identifier" path, same as any other unmet reference).
// Returns NaN (number contexts) on a parse error, a domain error
// (div-by-zero, sqrt of negative, unknown identifier/function, wrong
// argument count), or a kind mismatch (e.g. a bool value where the caller
// wanted a number) — or a genuine `false` result is possible too now for
// a bool-context caller, so a bool-expecting caller must check
// `typeof result === 'boolean'`, never treat any non-NaN result as success
// the way a number-only caller safely could before.
function evalExpr(src, numericEnv, functionEnv = {}, boolEnv = {}) {
  const parsed = parseExprAst(src);
  if (!parsed.ok) return NaN;
  return evalAst(parsed.ast, { numericEnv, functionEnv, boolEnv });
}

// Parses, validates any guard's exhaustiveness, and evaluates — one call,
// with a *specific* error message on failure (a syntax error, a
// non-exhaustive guard, or — same convention as evalExpr elsewhere — a
// generic "invalid expression" for anything else, since NaN's own
// "kind mismatch or unmet reference" ambiguity doesn't carry a more
// specific reason). This is what resolveNumAttr/resolveBoolAttr actually
// call now (not plain evalExpr), which is what gives guard totality
// checking its broad, "usable anywhere a value-expression already can be"
// coverage — every attribute both of those already resolve inherits it
// for free. `envs` is `{numericEnv, functionEnv, boolEnv}`.
function evalGuardedExpr(exprText, envs) {
  const parsed = parseExprAst(exprText);
  if (!parsed.ok) return { ok: false, errorMsg: 'invalid expression' };
  const totalityErr = findGuardTotalityError(parsed.ast, envs);
  if (totalityErr) return { ok: false, errorMsg: totalityErr };
  // Phase 6: verify kind-consistency across every guard branch/generic
  // function call this expression reaches, structurally (not just the
  // branch that would fire right now) — see inferExprKind's own comment.
  const kindErr = inferExprKind(parsed.ast, {}, envs).error;
  if (kindErr) return { ok: false, errorMsg: kindErr };
  return { ok: true, value: evalAst(parsed.ast, envs) };
}

// Topologically sorts a set of named items that can reference each other —
// number-kind and bool-kind constants, plus functions, share this one
// graph, so any of the three can reference either of the others in any
// order (a bool comparing two numbers, a number gated by a bool via a
// future guard, a function of either kind). Color is the one kind NOT
// part of this graph — no expression grammar at all, so no reason to pay
// for forward-reference support; it stays on its own simpler, earlier-
// only-reference track (see the "Named object resolution" section of
// parseCodeText). `items` is a Map<name, {ast, localNames}>, grammar- and
// kind-agnostic — this function only ever looks at `ast`/`localNames`,
// never at whatever `kind`/`keyword` tag a caller stashes on the same
// entry for its own post-processing. Uses depth-first search with a
// 3-state visit marker
// (unvisited/visiting/done) to detect a cycle *and* name one concrete
// path through it, not just report "a cycle exists somewhere" — e.g.
// `number a: b`, `function b: -> a` (a 0-arg function, legal per the
// grammar) reports the cycle as ['a','b','a']. A reference to a name
// outside this combined set (unknown identifier, or belonging to a
// different kind entirely) is simply not an edge here — it resolves to
// NaN at evaluation time and surfaces as an ordinary "invalid expression"
// error downstream, exactly like every other unmet reference already does.
function topoSortDependencies(items) {
  const deps = new Map();
  for (const [name, item] of items) {
    deps.set(name, new Set([...collectAstRefs(item.ast, item.localNames)].filter(r => items.has(r))));
  }

  const order = [];
  const state = new Map();
  let cycle = null;

  function visit(name, path) {
    if (cycle || state.get(name) === 'done') return;
    if (state.get(name) === 'visiting') {
      cycle = path.slice(path.indexOf(name)).concat(name);
      return;
    }
    state.set(name, 'visiting');
    for (const dep of deps.get(name)) {
      visit(dep, [...path, name]);
      if (cycle) return;
    }
    state.set(name, 'done');
    order.push(name);
  }

  for (const name of items.keys()) {
    visit(name, []);
    if (cycle) return { ok: false, cycle };
  }
  return { ok: true, order };
}

// A settable field's raw text (typed literally, or a reference to a
// constant, or — for numeric fields — any expression) is resolved against
// the environment built by buildEnvs(). Referenced by the code-file parser
// (validating a line the moment it's reached) and by reEvalObjects() below
// (re-resolving everything whenever `constants` changes) — one source of
// truth for "what does this expression mean," mirroring evalExpr's role as
// the sole numeric resolver.
// The two fast paths (bare hex literal, bare identifier lookup) stay
// exactly as they always were — cheap, and cover the overwhelming common
// case with no parsing at all. Anything else now falls through to the
// real grammar (numericEnv/functionEnv/boolEnv default to {} so every
// pre-existing 2-arg call site keeps working unchanged, same convention
// resolveBoolAttr already has) — this is what makes a guarded color
// payload (`b{#ff0000},otherwise{#00ff00}`) work, via the new `colorlit`
// atom and colorEnv now threaded through evalAst. Color constants
// deliberately stay outside the number/bool/function dependency graph
// (see buildEnvs/resolveConstantsAndFunctions) — a guarded color
// expression referencing another color constant still needs that
// constant to be *earlier*, exactly like a plain (non-guarded) color
// reference already required; guards don't relax that.
function resolveColorAttr(exprText, colorEnv, numericEnv = {}, functionEnv = {}, boolEnv = {}, domainEnv = {}) {
  if (CODE_COLOR_RE.test(exprText)) return { ok: true, value: exprText };
  if (CODE_IDENT_RE.test(exprText) && exprText in colorEnv) return { ok: true, value: colorEnv[exprText] };
  const res = evalGuardedExpr(exprText, { numericEnv, functionEnv, boolEnv, colorEnv, domainEnv });
  if (!res.ok) return { ok: false, errorMsg: res.errorMsg };
  return (typeof res.value === 'string' && CODE_COLOR_RE.test(res.value)) ? { ok: true, value: res.value } : { ok: false };
}
// isFinite, not just isNaN — evaluation can overflow to Infinity (a
// literal like 1e400, or arithmetic like 1e200*1e200) without ever
// producing NaN, and every caller here downstream only meant "a real,
// usable number." Routes through evalGuardedExpr (not plain evalExpr) so
// a guarded expression's exhaustiveness gets validated here too, with a
// specific error message threaded through when that's the actual failure
// — every other rejection reason still falls back to the caller's own
// generic message, unchanged.
function resolveNumAttr(exprText, numericEnv, functionEnv = {}, boolEnv = {}, domainEnv = {}) {
  const res = evalGuardedExpr(exprText, { numericEnv, functionEnv, boolEnv, domainEnv });
  if (!res.ok) return { ok: false, errorMsg: res.errorMsg };
  return Number.isFinite(res.value) ? { ok: true, value: res.value } : { ok: false };
}
// Routes through the real, unified grammar (!/&/|, comparisons, bool
// constants/functions, guards) instead of the old literal-or-identifier-
// only check — numericEnv/functionEnv default to {} so every pre-existing
// 2-arg call site keeps working unchanged (it just can't resolve a
// numeric comparison inside a bool expression from that spot, same
// "unmet reference" fallback evalExpr already has everywhere else).
function resolveBoolAttr(exprText, boolEnv, numericEnv = {}, functionEnv = {}, domainEnv = {}) {
  const res = evalGuardedExpr(exprText, { numericEnv, functionEnv, boolEnv, domainEnv });
  if (!res.ok) return { ok: false, errorMsg: res.errorMsg };
  return typeof res.value === 'boolean' ? { ok: true, value: res.value } : { ok: false };
}

// One dispatch point for "does this expression fit this *locked* const
// kind" — shared by buildEnvs (per-render cache refresh), parseCodeText's
// number/color/bool branch, `edit number`/`edit color`/`edit bool`'s
// validation, and the constants list row's direct value edit, so the
// answer is identical everywhere a constant's kind can no longer change
// but its value can.
function resolveConstByKind(kind, exprText, envs) {
  return kind === 'color'   ? resolveColorAttr(exprText, envs.colorEnv, envs.numericEnv, envs.functionEnv, envs.boolEnv, envs.domainEnv) :
         kind === 'boolean' ? resolveBoolAttr(exprText, envs.boolEnv, envs.numericEnv, envs.functionEnv, envs.domainEnv) :
                               resolveNumAttr(exprText, envs.numericEnv, envs.functionEnv, envs.boolEnv, envs.domainEnv);
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
      def.kind === 'color'  ? resolveColorAttr(exprText, envs.colorEnv, envs.numericEnv, envs.functionEnv, envs.boolEnv, envs.domainEnv) :
      def.kind === 'number' ? resolveNumAttr(exprText, envs.numericEnv, envs.functionEnv, envs.boolEnv, envs.domainEnv) :
                               resolveBoolAttr(exprText, envs.boolEnv, envs.numericEnv, envs.functionEnv, envs.domainEnv);
    if (!res.ok) {
      // res.errorMsg is only ever set for a guard-specific failure
      // (non-exhaustive, or a syntax error) — resolveNumAttr/
      // resolveBoolAttr's own doing; everything else (kind mismatch,
      // unmet reference, unknown color) still falls back to this
      // function's own generic per-field message, unchanged.
      const errorMsg = res.errorMsg ?? (
        def.kind === 'color'  ? `unknown color '${exprText}'` :
        def.kind === 'number' ? `invalid ${def.label} expression '${exprText}'` :
                                 `invalid ${def.token} value '${exprText}'`
      );
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
      def.kind === 'color'  ? resolveColorAttr(exprText, envs.colorEnv, envs.numericEnv, envs.functionEnv, envs.boolEnv, envs.domainEnv) :
      def.kind === 'number' ? resolveNumAttr(exprText, envs.numericEnv, envs.functionEnv, envs.boolEnv, envs.domainEnv) :
                               resolveBoolAttr(exprText, envs.boolEnv, envs.numericEnv, envs.functionEnv, envs.domainEnv);
    if (!res.ok) {
      // res.errorMsg is only ever set for a guard-specific failure
      // (non-exhaustive, or a syntax error) — resolveNumAttr/
      // resolveBoolAttr's own doing; everything else (kind mismatch,
      // unmet reference, unknown color) still falls back to this
      // function's own generic per-field message, unchanged.
      const errorMsg = res.errorMsg ?? (
        def.kind === 'color'  ? `unknown color '${exprText}'` :
        def.kind === 'number' ? `invalid ${def.label} expression '${exprText}'` :
                                 `invalid ${def.token} value '${exprText}'`
      );
      return { ok: false, errorMsg };
    }
    fields[def.expr] = exprText;
    fields[def.value] = res.value;
  }
  return { ok: true, fields };
}

// Builds all four environments (numeric, color, bool, function). Color and
// bool constants keep their original, simpler treatment — a strict order-
// dependent left-to-right chain, only ever referencing an earlier
// same-kind constant, resolved via resolveConstByKind exactly as before
// (they never go through evalExpr's numeric grammar, so a function call
// can never appear in one anyway). Number-kind constants and functions are
// different: since either can now reference the other, in *any* order (a
// function built from named constants, or a constant defined via a
// function call — see NOTES9), a simple left-to-right pass can no longer
// answer "what does this reference" — this builds a real dependency graph
// (collectAstRefs) and resolves it via topoSortDependencies, same as the
// code-editor parser's own resolveConstantsAndFunctions. A cycle removes
// every member of that cycle from resolution (matches the pre-existing
// "failed to resolve" convention: c.value stays undefined, nothing gets
// registered in any env, so any reference to it fails as a plain unknown-
// identifier rather than something bespoke) and keeps going — one cycle in
// a corner of the model shouldn't block everything else. Kind is fixed
// forever by which keyword (number/color/bool) created a constant, stored
// on `c.kind` for life — this never re-derives it.
function buildEnvs() {
  const colorEnv = {};
  const boolEnv  = {};

  const items = new Map(); // name -> { ast, localNames, kind, ref, params? }
  for (const c of constants) {
    if (c.kind === 'number') {
      const parsed = parseExprAst(c.expr.trim());
      if (parsed.ok) items.set(c.name, { ast: parsed.ast, localNames: new Set(), kind: 'number', ref: c });
    } else if (c.kind === 'boolean') {
      // Bool shares number/function's any-order dependency graph instead
      // of a separate earlier-in-file-only walk. Now routes through the
      // real, unified parseExprAst/evalAst (!/&/|, comparisons, bool
      // functions), not a bool-only stopgap — a bool constant's own
      // expression can therefore reference number constants too (via a
      // comparison), which is exactly why this needed to be the same
      // graph as number/function in the first place, not a separate one.
      // Color stays outside this graph: no expression grammar, no reason
      // to need forward-reference.
      const parsed = parseExprAst(c.expr.trim());
      if (parsed.ok) items.set(c.name, { ast: parsed.ast, localNames: new Set(), kind: 'boolean', ref: c });
    }
  }
  for (const fn of functions) {
    const parsed = parseExprAst(fn.bodyExpr);
    if (parsed.ok) items.set(fn.name, { ast: parsed.ast, localNames: new Set(fn.params), kind: 'function', ref: fn, params: fn.params });
  }

  const numericEnv  = {};
  const functionEnv = {};
  // Mirrors numericEnv but only for names with a declared domain (Set of
  // legal values) — the totality checker's own domain-aware enumeration
  // needs the *set*, not just the current value, to prove a guard
  // condition on a domain-restricted number covers every reachable case.
  const domainEnv   = {};
  let workingItems = items;
  while (true) {
    const topo = topoSortDependencies(workingItems);
    if (topo.ok) {
      for (const name of topo.order) {
        const item = workingItems.get(name);
        if (item.kind === 'number') {
          const value = evalAst(item.ast, { numericEnv, boolEnv, functionEnv });
          // This is the site most likely to get missed, and the one the
          // whole enforcement effort is really for: a domain violation can
          // appear purely from an *upstream* dependency changing, with no
          // edit ever touching this constant's own line — buildEnvs()
          // re-derives every value on every render pass, so this is where
          // that has to be caught, not just at the moment of a direct edit.
          const domainOk = !item.ref.domain || item.ref.domain.has(value);
          item.ref.value = (Number.isFinite(value) && domainOk) ? value : undefined;
          if (Number.isFinite(value) && domainOk) {
            numericEnv[name] = value;
            if (item.ref.domain) domainEnv[name] = item.ref.domain;
          }
        } else if (item.kind === 'boolean') {
          const value = evalAst(item.ast, { numericEnv, boolEnv, functionEnv });
          item.ref.value = (typeof value === 'boolean') ? value : undefined;
          if (typeof value === 'boolean') boolEnv[name] = value;
        } else {
          functionEnv[name] = { params: item.params, bodyAst: item.ast };
        }
      }
      break;
    }
    workingItems = new Map(workingItems);
    for (const name of new Set(topo.cycle)) {
      const item = workingItems.get(name);
      if (item.kind === 'number' || item.kind === 'boolean') item.ref.value = undefined;
      workingItems.delete(name);
    }
  }

  for (const c of constants) {
    if (c.kind === 'number' || c.kind === 'boolean') {
      if (!items.has(c.name)) c.value = undefined; // failed to even parse
    } else {
      const res = resolveColorAttr(c.expr.trim(), colorEnv, numericEnv, functionEnv, boolEnv, domainEnv);
      c.value = res.ok ? res.value : undefined;
      if (res.ok) colorEnv[c.name] = c.value;
    }
  }

  return { numericEnv, colorEnv, boolEnv, functionEnv, domainEnv };
}

// Perpendicular distance from p to the segment a-b (clamped projection,
// not the infinite line) — the "is this chord still a good approximation
// of the curve" measurement tessellateCurve's adaptive refinement uses.
function pointToSegmentDistance3D(p, a, b) {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const apx = p[0] - a[0], apy = p[1] - a[1], apz = p[2] - a[2];
  const abLenSq = abx * abx + aby * aby + abz * abz;
  const t = abLenSq === 0 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / abLenSq));
  const cx = a[0] + t * abx, cy = a[1] + t * aby, cz = a[2] + t * abz;
  return Math.hypot(p[0] - cx, p[1] - cy, p[2] - cz);
}

function vecSub3D(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function vecLen3D(v) { return Math.hypot(v[0], v[1], v[2]); }
function dot3D(u, v) { return u[0] * v[0] + u[1] * v[1] + u[2] * v[2]; }
function cross3D(u, v) {
  return [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ];
}

// Menger curvature of three points — 1/(circumradius of the triangle they
// span), equal to 4*Area/(|ab|*|bc|*|ca|). Converges to the curve's true
// curvature as the three points converge to one; used as a cheap,
// derivative-free local curvature estimate built from points already being
// evaluated for the distance test, no extra curve evaluations needed.
function mengerCurvature(a, b, c) {
  const ab = vecLen3D(vecSub3D(b, a));
  const bc = vecLen3D(vecSub3D(c, b));
  const ca = vecLen3D(vecSub3D(a, c));
  if (ab === 0 || bc === 0 || ca === 0) return 0;
  const twiceArea = vecLen3D(cross3D(vecSub3D(b, a), vecSub3D(c, a)));
  return (2 * twiceArea) / (ab * bc * ca);
}

// Angle between the incoming segment (a->b) and outgoing segment (b->c) —
// 0 for a straight continuation, up to pi for a full reversal. A pair of
// coincident sample points carries no direction information, so it's
// treated as "no deflection" and left to the distance/curvature test.
function deflectionAngle(a, b, c) {
  const v1 = vecSub3D(b, a), v2 = vecSub3D(c, b);
  const l1 = vecLen3D(v1), l2 = vecLen3D(v2);
  if (l1 === 0 || l2 === 0) return 0;
  const cosAngle = Math.max(-1, Math.min(1, dot3D(v1, v2) / (l1 * l2)));
  return Math.acos(cosAngle);
}

const CURVE_MAX_DEPTH      = 16;
// Dimensionless: allowed chord sagitta as a fraction of the LOCAL radius of
// curvature (via mengerCurvature below), not a fixed world-space distance.
// A fixed absolute tolerance made tessellation density depend on the
// curve's raw size in model units — confirmed as a real bug: the same
// helix at radius 1 and radius 1/8 (compensated by view zoom to look the
// same size on screen) tessellated to smooth loops and to visible octagons
// respectively, because the same 0.01 world-space sagitta is generous
// relative to a radius-1 curve and barely inside a radius-1/8 curve's own
// 45-degree-step sagitta. A curvature-relative tolerance is scale-covariant
// by construction (scale the curve, both sagitta and local radius scale
// together, ratio unchanged) and, critically, local — a large curve with a
// small sharply-curved feature gets fine resolution exactly there, not
// coarsened by the curve's own overall size. 0.01 chosen to reproduce, at
// unit local radius, the same absolute behavior the old fixed 0.01 gave.
const CURVE_REL_TOLERANCE  = 0.01;
// Max allowed direction change (radians) between consecutive sampled
// sub-segments before a chord is rejected outright, independent of the
// distance test above — catches a low-amplitude S-bend that can sit close
// to its chord in distance terms while still visibly changing direction, a
// blind spot pure chord-distance testing can't see (it bounds position
// error, not tangent direction). ~8.6 degrees, a first-guess default like
// every other tunable here — not yet tuned under real testing.
const CURVE_ANGLE_TOLERANCE = 0.15;
// Checked against the chord at each candidate split, not just the exact
// midpoint. Deliberately golden-ratio-derived (frac(n*phi) for n=1,2,3),
// not round fractions like 0.25/0.5/0.75 — the golden ratio is famously
// the real number *worst* approximated by rationals, which is exactly the
// property wanted here: a periodic curve (sin/cos-based) tested at simple
// fractions of a domain that's a round multiple of its period lands every
// test point on an exact repeat of the period, measuring zero deviation
// for a chord that actually loops around several times — confirmed as a
// real failure (t in [0, 8*pi], a plain circle: 4 exact periods, three
// simple-fraction test points all landing on repeats, the whole curve
// accepted as a straight line). Irrational-ratio fractions make that kind
// of exact alignment enormously less likely for any "round" domain a user
// would actually choose. Note this only reduces the *chance* of periodic
// aliasing, same as CURVE_MIN_DEPTH below only bounds it structurally for
// near-top-level chords — neither guarantees congruent tessellation of two
// exact repeats of a period; see the tessellateCurve comment below for why
// that needs real period detection, not a tweak here.
const CURVE_TEST_FRACTIONS = [0.236, 0.618, 0.854];
// Forces at least this many levels of unconditional subdivision before the
// deviation test is even consulted — a structural backstop, not just a
// probabilistic one: no single top-level (or near-top-level) chord can
// ever be accepted outright no matter how its sample points happen to
// align, however unluckily. Adaptive refinement almost always exceeds
// this floor anyway for genuinely curved content, so it rarely ends up
// being the limiting factor — it only bites for the specific pathological
// case this exists to catch.
const CURVE_MIN_DEPTH      = 5;

// Tessellates a curve into a polyline via pure recursive chord-deviation
// subdivision, starting from just the two domain endpoints — deliberately
// *not* seeded with a fixed number of uniform samples first (an earlier
// version of this function was, and that was a real bug: a fixed seed
// count spread over the domain makes the starting resolution a function
// of domain *length*, not curve geometry — a longer domain got coarser
// seed spacing regardless of how much the curve actually curves, so two
// domains of different length over the same-shaped curve visibly
// tessellated at different granularities. Purely recursive, deviation-
// triggered subdivision has no such coupling: how finely a stretch of
// curve gets split depends only on how much it deviates from a straight
// chord, never on the raw size of the domain it happens to sit in.
function isFiniteXYZ(p) {
  return Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2]);
}

// How many straight-line sub-segments the final render polyline uses per
// adaptively-chosen interval, each evaluating the clamped cubic spline (not
// the raw curve) below. The adaptive tessellation still decides *where*
// detail is needed (via curvature/angle/distance); this only decides how
// finely the resulting genuinely-C^2 spline gets flattened into straight
// lines for canvas rendering — cheap (line segments, not curve
// evaluations), affects visual smoothness only, never geometry. First-guess
// default, like every other tunable here.
const CURVE_SPLINE_SAMPLES_PER_SEGMENT = 8;

// Estimates y'(ta) from a quadratic fit through three knots (ta,ya),
// (tb,yb), (tc,yc) — written purely in terms of signed differences, so it
// works whether ta is the smallest or largest t among the three. That's
// what lets boundaryDerivative below call it unchanged at either end of a
// run (nearest-knot-first), with no separate "which direction" case to get
// the sign wrong on. O(h^2) accurate — the curvature-proportional error
// term a plain 2-point secant carries cancels exactly — vs. the secant's
// O(h); see this session's NOTES for the derivation.
function quadraticDerivativeAt(ta, ya, tb, yb, tc, yc) {
  return (
    ya * ((ta - tb) + (ta - tc)) / ((ta - tb) * (ta - tc)) +
    yb * (ta - tc) / ((tb - ta) * (tb - tc)) +
    yc * (ta - tb) / ((tc - ta) * (tc - tb))
  );
}

// Estimates dy/dt at one end of a knot run — i0/step is 0/+1 for the run's
// first knot, n/-1 for its last — to clamp the spline's tangent there
// instead of assuming zero curvature (see solveClampedCubicSpline below).
// Prefers the 3-point quadraticDerivativeAt over a plain 2-point secant
// whenever a third knot exists in that direction; the secant fallback only
// fires for a single-interval run (exactly 2 knots total, no third knot to
// reach for). A single-knot run (i1 out of range) returns 0 — the estimate
// is meaningless with nothing to difference against, but also unused,
// since solveClampedCubicSpline no-ops for that case anyway.
function boundaryDerivative(ts, ys, i0, step) {
  const i1 = i0 + step;
  if (i1 < 0 || i1 >= ts.length) return 0;
  const i2 = i1 + step;
  if (i2 >= 0 && i2 < ts.length) {
    return quadraticDerivativeAt(ts[i0], ys[i0], ts[i1], ys[i1], ts[i2], ys[i2]);
  }
  return (ys[i1] - ys[i0]) / (ts[i1] - ts[i0]);
}

// Clamped cubic spline through (t_i, y_i) pairs — matches value and second
// derivative at every interior knot (true C^2 continuity, same as the
// natural spline this replaces), but pins the FIRST derivative (tangent) at
// each free end to a supplied estimate (mLo/mHi, from boundaryDerivative
// above) instead of assuming zero curvature there. "Natural" (zero second
// derivative at both ends) is the principled choice for unweighted discrete
// data with no known boundary behavior, but the wrong one here — CubeParam
// holds the real analytic x(t)/y(t)/z(t), so the true tangent is available
// and cheap to estimate, and using it removes the visible flattening the
// natural condition caused at a curve's free ends (most visible at a closed
// curve's seam, but present, just less noticeable, at any open curve's
// endpoints too). Same standard tridiagonal moment system as the natural
// version, just with the two boundary rows replaced by the clamped-
// derivative condition instead of "M = 0" — a full (n+1)-unknown system
// now, not the natural spline's reduced (n-1)-unknown one, since both
// boundary moments are determined by the derivative constraint rather than
// fixed. Still diagonally dominant at every row, boundary rows included
// (|h| < |2h| trivially), so this still never needs pivoting.
function solveClampedCubicSpline(ts, ys, mLo, mHi) {
  const n = ts.length - 1;
  if (n < 1) return new Array(ts.length).fill(0); // 0 intervals: nothing to solve

  const h = new Array(n);
  for (let i = 0; i < n; i++) h[i] = ts[i + 1] - ts[i];

  const sub = new Array(n + 1), diag = new Array(n + 1), sup = new Array(n + 1), rhs = new Array(n + 1);

  // Left boundary row: 2h0*M0 + h0*M1 = 6*[(y1-y0)/h0 - mLo].
  sub[0] = 0; diag[0] = 2 * h[0]; sup[0] = h[0];
  rhs[0] = 6 * ((ys[1] - ys[0]) / h[0] - mLo);

  for (let i = 1; i < n; i++) {
    sub[i]  = h[i - 1];
    diag[i] = 2 * (h[i - 1] + h[i]);
    sup[i]  = h[i];
    rhs[i]  = 6 * ((ys[i + 1] - ys[i]) / h[i] - (ys[i] - ys[i - 1]) / h[i - 1]);
  }

  // Right boundary row: h[n-1]*M[n-1] + 2h[n-1]*M[n] = 6*[mHi - (yn-y(n-1))/h(n-1)].
  sub[n] = h[n - 1]; diag[n] = 2 * h[n - 1]; sup[n] = 0;
  rhs[n] = 6 * (mHi - (ys[n] - ys[n - 1]) / h[n - 1]);

  // Thomas algorithm over the full (n+1)-row system (was interior-only,
  // m = n-1 rows, under the natural boundary condition).
  for (let k = 1; k <= n; k++) {
    const w = sub[k] / diag[k - 1];
    diag[k] -= w * sup[k - 1];
    rhs[k]  -= w * rhs[k - 1];
  }
  const M = new Array(n + 1);
  M[n] = rhs[n] / diag[n];
  for (let k = n - 1; k >= 0; k--) {
    M[k] = (rhs[k] - sup[k] * M[k + 1]) / diag[k];
  }
  return M;
}

// Evaluates the clamped-cubic-spline segment covering [tLo, tHi] at
// parameter t, given that segment's endpoint values/moments. Standard
// normalized moment-form cubic spline evaluation (a+b=1 by construction) —
// unchanged from the natural-spline version, since the boundary condition
// only affects how the moments were *solved for*, not how a segment is
// evaluated from them once known.
function evalSplineSegment(t, tLo, tHi, yLo, yHi, mLo, mHi) {
  const h = tHi - tLo;
  const a = (tHi - t) / h, b = (t - tLo) / h;
  return a * yLo + b * yHi + ((a * a * a - a) * mLo + (b * b * b - b) * mHi) * (h * h) / 6;
}

// Fits a clamped cubic spline through one contiguous, all-finite run of
// (ts[i], points[i]) knots — independently for x(t), y(t), z(t), sharing
// the same t knots — then re-evaluates it at a denser, uniform-within-
// each-interval grid for final rendering. For a closed curve, this run's
// two physical ends are the same point, evaluated independently at t=lo
// and t=hi of the curve's own domain — their two locally-estimated
// tangents necessarily converge to the same true derivative, so seam
// continuity falls out of using ground truth at both ends, with no
// separate closed-curve detection or handling anywhere in this function.
function splineResampleRun(ts, points) {
  const n = ts.length - 1;
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]), zs = points.map(p => p[2]);
  const Mx = solveClampedCubicSpline(ts, xs, boundaryDerivative(ts, xs, 0, 1), boundaryDerivative(ts, xs, n, -1));
  const My = solveClampedCubicSpline(ts, ys, boundaryDerivative(ts, ys, 0, 1), boundaryDerivative(ts, ys, n, -1));
  const Mz = solveClampedCubicSpline(ts, zs, boundaryDerivative(ts, zs, 0, 1), boundaryDerivative(ts, zs, n, -1));

  const out = [];
  for (let i = 0; i < n; i++) {
    const tLo = ts[i], tHi = ts[i + 1];
    for (let k = 0; k < CURVE_SPLINE_SAMPLES_PER_SEGMENT; k++) {
      const t = tLo + (tHi - tLo) * (k / CURVE_SPLINE_SAMPLES_PER_SEGMENT);
      out.push([
        evalSplineSegment(t, tLo, tHi, xs[i], xs[i + 1], Mx[i], Mx[i + 1]),
        evalSplineSegment(t, tLo, tHi, ys[i], ys[i + 1], My[i], My[i + 1]),
        evalSplineSegment(t, tLo, tHi, zs[i], zs[i + 1], Mz[i], Mz[i + 1]),
      ]);
    }
  }
  out.push(points[n]); // exact final knot — the loop above only ever emits t < tHi
  return out;
}

// Turns the raw, adaptively-tessellated (ts[i], points[i]) knots into the
// final rendered polyline by fitting the natural cubic spline above through
// them — this is what makes the rendered curve C^2 (matching value,
// tangent, and curvature at every knot) rather than the raw tessellation's
// piecewise-*linear* polyline, which is only ever C^0 no matter how finely
// it's adaptively refined: refining *where* straight segments sit can never
// make their joints stop being joints, only fitting an actually-smooth
// interpolant between them can.
//
// A spline fit is global — one non-finite knot would corrupt every
// segment's moments, not just the ones touching it, since the tridiagonal
// solve couples every interior point together. tessellateCurve relies on a
// non-finite point marking a genuine break (an asymptote/discontinuity
// within the domain), which drawCurves uses to lift the pen rather than
// draw through it — so this splits the raw tessellation into maximal
// finite runs first, splines each run independently, and re-inserts a
// single non-finite marker between runs to preserve that exact break
// behavior.
function splineResample(ts, points) {
  const out = [];
  let runTs = [], runPts = [];
  function flushRun() {
    if (runPts.length === 0) return;
    if (out.length > 0) out.push([NaN, NaN, NaN]);
    out.push(...splineResampleRun(runTs, runPts));
    runTs = []; runPts = [];
  }
  for (let i = 0; i < points.length; i++) {
    if (!isFiniteXYZ(points[i])) { flushRun(); continue; }
    runTs.push(ts[i]);
    runPts.push(points[i]);
  }
  flushRun();
  return out;
}

// Public entry point: tessellates a curve over a *disjoint union* of one
// or more parameter intervals (see parseDomainIntervals) — each interval
// gets its own independent call to tessellateOneInterval below, and the
// results are concatenated with a non-finite break marker between them,
// reusing the exact mechanism drawCurves already uses to lift the pen at
// a genuine discontinuity (splineResample already relies on this same
// idea internally, to keep one bad knot from corrupting a whole spline
// fit — a union's gap between intervals is architecturally the same kind
// of break, just intentional rather than a domain touching an asymptote).
// Called from reEvalObjects (the cache-invalidation step for a curve's
// resolved `.points`) and at creation time in parseCodeText.
function tessellateCurve(xExpr, yExpr, zExpr, param, intervals, numericEnv, functionEnv = {}) {
  const out = [];
  for (const { lo, hi } of intervals) {
    if (out.length > 0) out.push([NaN, NaN, NaN]);
    out.push(...tessellateOneInterval(xExpr, yExpr, zExpr, param, lo, hi, numericEnv, functionEnv));
  }
  return out;
}

// Known open limitation, not fixed by anything below: two exact repeats of
// a periodic curve (e.g. two loops of a helix) are only guaranteed to
// tessellate congruently when (domain width / period) happens to be a
// power of two — the recursion always bisects whatever interval it's
// currently holding at that interval's own midpoint, so the full set of
// possible breakpoints is a dyadic grid of the *domain*, and dyadic
// (base-2) splitting can only land exactly on period boundaries when the
// period count is itself a power of two. No choice of anchor point fixes
// this for other period counts (3, 5, 6, ...) — it would need genuine
// period detection in the parsed expression (tessellate one period,
// replicate it), a separate, larger feature, not implemented here.
function tessellateOneInterval(xExpr, yExpr, zExpr, param, lo, hi, numericEnv, functionEnv) {
  function evalAt(t) {
    const env = { ...numericEnv, [param]: t };
    return [evalExpr(xExpr, env, functionEnv), evalExpr(yExpr, env, functionEnv), evalExpr(zExpr, env, functionEnv)];
  }
  function isFinitePoint(p) {
    return Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2]);
  }
  function chordNeedsSplit(tLo, tHi, pLo, pHi) {
    const pts = CURVE_TEST_FRACTIONS.map(frac => evalAt(tLo + (tHi - tLo) * frac));
    if (pts.some(p => !isFinitePoint(p))) return true;

    // Curvature-relative distance test: local radius of curvature from the
    // interval's endpoints and its middle test point (mengerCurvature). A
    // zero-curvature (locally straight) reading allows an unbounded chord
    // — correct, a straight stretch needs no further splitting regardless
    // of how long it is.
    const kappa = mengerCurvature(pLo, pts[1], pHi);
    const localTolerance = kappa > 0 ? CURVE_REL_TOLERANCE / kappa : Infinity;
    for (const p of pts) {
      if (pointToSegmentDistance3D(p, pLo, pHi) > localTolerance) return true;
    }

    // Angle test, independent of the distance test above — see
    // CURVE_ANGLE_TOLERANCE.
    const chain = [pLo, ...pts, pHi];
    for (let i = 1; i < chain.length - 1; i++) {
      if (deflectionAngle(chain[i - 1], chain[i], chain[i + 1]) > CURVE_ANGLE_TOLERANCE) return true;
    }

    return false;
  }

  const points = [];
  const ts = [];
  const p0 = evalAt(lo);
  points.push(p0);
  ts.push(lo);

  function subdivide(tLo, tHi, pLo, pHi, depth) {
    // A NaN endpoint (e.g. domain touches an asymptote) can't have its
    // deviation measured — accept the chord as-is rather than recursing
    // toward a discontinuity that will never converge; drawCurves breaks
    // the rendered path at the NaN point instead of connecting through it.
    const mustSplit = depth < CURVE_MIN_DEPTH;
    if (!isFinitePoint(pLo) || !isFinitePoint(pHi) || depth >= CURVE_MAX_DEPTH || (!mustSplit && !chordNeedsSplit(tLo, tHi, pLo, pHi))) {
      points.push(pHi);
      ts.push(tHi);
      return;
    }
    const tMid = (tLo + tHi) / 2;
    const pMid = evalAt(tMid);
    subdivide(tLo, tMid, pLo, pMid, depth + 1);
    subdivide(tMid, tHi, pMid, pHi, depth + 1);
  }

  subdivide(lo, hi, p0, evalAt(hi), 0);
  return splineResample(ts, points);
}

// Re-resolves every expression-backed field (coordinates plus color/radius/
// visible/label on vertices, color/width/visible on segments) whenever
// `constants` changes — the mechanism that makes editing a constant bulk-
// update everything referencing it, persistently, across Saves.
function reEvalObjects() {
  const { numericEnv, colorEnv, boolEnv, functionEnv, domainEnv } = buildEnvs();
  for (const v of vertices) {
    for (let i = 0; i < 3; i++) {
      const expr = v.exprs?.[i];
      if (expr) v.coords[i] = evalExpr(expr, numericEnv, functionEnv, boolEnv);
    }
    if (v.colorExpr)   { const r = resolveColorAttr(v.colorExpr, colorEnv, numericEnv, functionEnv, boolEnv, domainEnv);  if (r.ok) v.color     = r.value; }
    if (v.radiusExpr)  { const r = resolveNumAttr(v.radiusExpr, numericEnv, functionEnv, boolEnv, domainEnv); if (r.ok) v.radius    = r.value; }
    if (v.visibleExpr) { const r = resolveBoolAttr(v.visibleExpr, boolEnv, numericEnv, functionEnv, domainEnv);  if (r.ok) v.visible   = r.value; }
    if (v.labelExpr)   { const r = resolveBoolAttr(v.labelExpr, boolEnv, numericEnv, functionEnv, domainEnv);    if (r.ok) v.showLabel = r.value; }
  }
  for (const s of segments) {
    if (s.colorExpr)   { const r = resolveColorAttr(s.colorExpr, colorEnv, numericEnv, functionEnv, boolEnv, domainEnv);  if (r.ok) s.color     = r.value; }
    if (s.widthExpr)   { const r = resolveNumAttr(s.widthExpr, numericEnv, functionEnv, boolEnv, domainEnv);  if (r.ok) s.lineWidth = r.value; }
    if (s.visibleExpr) { const r = resolveBoolAttr(s.visibleExpr, boolEnv, numericEnv, functionEnv, domainEnv);  if (r.ok) s.visible   = r.value; }
  }
  for (const fc of faces) {
    if (fc.colorExpr)   { const r = resolveColorAttr(fc.colorExpr, colorEnv, numericEnv, functionEnv, boolEnv, domainEnv); if (r.ok) fc.color   = r.value; }
    if (fc.visibleExpr) { const r = resolveBoolAttr(fc.visibleExpr, boolEnv, numericEnv, functionEnv, domainEnv); if (r.ok) fc.visible  = r.value; }
  }
  for (const cv of curves) {
    if (cv.colorExpr)   { const r = resolveColorAttr(cv.colorExpr, colorEnv, numericEnv, functionEnv, boolEnv, domainEnv); if (r.ok) cv.color   = r.value; }
    if (cv.visibleExpr) { const r = resolveBoolAttr(cv.visibleExpr, boolEnv, numericEnv, functionEnv, domainEnv); if (r.ok) cv.visible  = r.value; }
    // Domain bounds are expressions too (may reference constants) — re-
    // resolve every interval before re-tessellating, same relationship
    // vertex's exprs->coords has to reEvalObjects. Only commits (and
    // re-tessellates) if *every* interval still resolves — a single bad
    // interval leaves the curve at its last-good tessellation rather than
    // silently dropping to a partial union.
    let intervalsOk = true;
    const resolvedIntervals = cv.domainIntervals.map(iv => {
      const lo = evalExpr(iv.loExpr, numericEnv, functionEnv, boolEnv);
      const hi = evalExpr(iv.hiExpr, numericEnv, functionEnv, boolEnv);
      if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo >= hi) intervalsOk = false;
      return { ...iv, lo, hi };
    });
    if (intervalsOk) {
      cv.domainIntervals = resolvedIntervals;
      cv.points = tessellateCurve(cv.xExpr, cv.yExpr, cv.zExpr, cv.param, resolvedIntervals, numericEnv, functionEnv);
    }
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
        if (!f.endsWith('Expr') || !obj[f]) continue;
        // A curve's own bound parameter shadows any same-named constant
        // within its x=/y=/z= body — renaming that constant elsewhere must
        // not corrupt what's actually a reference to the local parameter.
        // (obj.param is undefined for every other type, so this is a
        // no-op everywhere except curves.)
        if (obj.param && oldName === obj.param && (f === 'xExpr' || f === 'yExpr' || f === 'zExpr')) continue;
        // A function's own parameters shadow a same-named constant within
        // its body, same principle as a curve's bound parameter just
        // above — a function can have several params, unlike a curve's
        // single one, so this checks membership in the whole list rather
        // than equality against one field.
        if (obj.params && obj.params.includes(oldName) && f === 'bodyExpr') continue;
        obj[f] = renameInExpr(obj[f], oldName, newName);
      }
    }
    const stateObj = t.lastSet?.();
    if (!stateObj) continue;
    for (const f of Object.keys(stateObj)) {
      // naming/counter hold a name *prefix* / a raw integer, never a
      // symbolic reference — a plain equality scan over every field would
      // otherwise happily "rename" a governing `naming=P` prefix the
      // moment a constant literally named "P" gets renamed, a real
      // (if narrow) latent bug found while generalizing this same logic
      // for the `rename` interpreter command, not hypothetical.
      if (f === 'naming' || f === 'counter') continue;
      if (stateObj[f] === oldName) stateObj[f] = newName;
    }
  }
  // Vertex coordinates (`exprs`) are a structural exception: a plain array,
  // not a `*Expr`-suffixed field, so they need their own pass.
  for (const v of vertices) {
    if (v.exprs) v.exprs = v.exprs.map(e => renameInExpr(e, oldName, newName));
  }
  // A curve's domain bounds (`domainIntervals`) are the same kind of
  // exception — an array of {loExpr, hiExpr} pairs, not flat `*Expr`
  // fields. No shadowing concern here unlike x=/y=/z= above: domain bounds
  // are resolved in the ambient environment, before the curve's own bound
  // parameter is ever bound to a value, so it can never legitimately
  // appear in one.
  for (const cv of curves) {
    if (cv.domainIntervals) {
      cv.domainIntervals = cv.domainIntervals.map(iv => ({
        ...iv,
        loExpr: renameInExpr(iv.loExpr, oldName, newName),
        hiExpr: renameInExpr(iv.hiExpr, oldName, newName),
      }));
    }
  }
}

// Interpreter-command counterpart to renameConstantEverywhere, for the
// `rename TYPE OLD_NAME: NEW_NAME` line (NOTES16.md) — same "rename
// everywhere" logic, including the exact same function-parameter/
// curve-bound-parameter shadowing exclusions, but operating on the
// *staged* arrays parseCodeText builds up mid-parse rather than live
// committed state, and generalized to all six renameable kinds, not just
// constants:
//   - number/color/bool/function are referenced *symbolically*, inside
//     arbitrary expression text anywhere — the renameInExpr regex pass.
//   - vertex is referenced *structurally*, by exact name, only in
//     segment.v1Name/v2Name and face.vertexNames — never inside
//     expression text (vertices never appear in numericEnv/boolEnv/etc.).
//   - segment/face/curve are referenced from nowhere else in the current
//     grammar at all — nothing further is needed beyond the caller's own
//     byName-map/object-identity update once this returns.
// Deliberately a separate function rather than one core shared with
// renameConstantEverywhere: the staged and live shapes differ in real
// ways (a staged segment carries v1Name/v2Name directly; a live one only
// carries numeric vertexIds, translated from names exactly once at
// commit — see buildCommittedArraysFromStaged) — not worth coupling an
// already-working, separately-tested live path to this for the sake of
// avoiding some structural duplication.
function renameStagedObjectEverywhere(renameType, oldName, newName, staged) {
  const { stagedVertices, stagedConstants, stagedSegments, stagedFaces, stagedCurves, stagedFunctions, currentSet } = staged;

  const isSymbolic = renameType === 'number' || renameType === 'color' || renameType === 'bool' || renameType === 'function';
  if (isSymbolic) {
    // Constants use a bare `expr` field, not `*Expr` — the one name that
    // doesn't fit the suffix convention the generic scan below relies on
    // (same reason renameConstantEverywhere needs its own explicit pass).
    for (const c of stagedConstants) c.expr = renameInExpr(c.expr, oldName, newName);
    for (const fn of stagedFunctions) {
      if (fn.params.includes(oldName)) continue; // shadowed by its own parameter
      fn.bodyExpr = renameInExpr(fn.bodyExpr, oldName, newName);
    }
    for (const list of [stagedVertices, stagedSegments, stagedFaces, stagedCurves]) {
      for (const obj of list) {
        for (const f of Object.keys(obj)) {
          if (!f.endsWith('Expr') || !obj[f]) continue;
          // A curve's own bound parameter shadows any same-named constant
          // within its x=/y=/z= body only — not its domain bounds, which
          // resolve before the curve's parameter is ever bound (see
          // renameConstantEverywhere's own comment for the full reasoning).
          if (obj.param && oldName === obj.param && (f === 'xExpr' || f === 'yExpr' || f === 'zExpr')) continue;
          obj[f] = renameInExpr(obj[f], oldName, newName);
        }
      }
    }
    // Vertex coordinates (`exprs`) and a curve's domain bounds
    // (`domainIntervals`) are the same kind of structural exception
    // renameConstantEverywhere already has to handle — plain arrays, not
    // flat `*Expr` fields.
    for (const v of stagedVertices) {
      if (v.exprs) v.exprs = v.exprs.map(e => renameInExpr(e, oldName, newName));
    }
    for (const cv of stagedCurves) {
      if (cv.domainIntervals) {
        cv.domainIntervals = cv.domainIntervals.map(iv => ({
          ...iv,
          loExpr: renameInExpr(iv.loExpr, oldName, newName),
          hiExpr: renameInExpr(iv.hiExpr, oldName, newName),
        }));
      }
    }
    // currentSet is this one parse's own order-dependent "paintbrush"
    // state — the exact parse-time analogue of lastSetVertex/etc. A
    // governing default set *earlier* in the same file (`set vertex:
    // visible=oldName`) needs the same rewrite, so an object created
    // *later* in the file (inheriting it) picks up the new name, not a
    // reference to a name that's about to stop existing.
    for (const type of ['vertex', 'segment', 'face', 'curve']) {
      const stateObj = currentSet[type];
      for (const f of Object.keys(stateObj)) {
        if (f === 'naming' || f === 'counter') continue; // a prefix/integer, never a symbolic reference
        if (stateObj[f] === oldName) stateObj[f] = newName;
      }
    }
  }

  if (renameType === 'vertex') {
    for (const s of stagedSegments) {
      if (s.v1Name === oldName) s.v1Name = newName;
      if (s.v2Name === oldName) s.v2Name = newName;
    }
    for (const f of stagedFaces) {
      if (f.vertexNames) f.vertexNames = f.vertexNames.map(n => (n === oldName ? newName : n));
    }
  }
}

function isNameTakenIn(name, vertexList, constList, faceList = [], segList = [], excludeVertexId = null, excludeConstId = null, excludeFaceId = null, excludeSegId = null, curveList = [], excludeCurveId = null, functionList = [], excludeFunctionId = null) {
  return vertexList.some(v => v.name === name && v.id !== excludeVertexId)
      || constList.some(c => c.name === name && c.id !== excludeConstId)
      || faceList.some(f => f.name === name && f.id !== excludeFaceId)
      || segList.some(s => s.name === name && s.id !== excludeSegId)
      || curveList.some(cv => cv.name === name && cv.id !== excludeCurveId)
      || functionList.some(fn => fn.name === name && fn.id !== excludeFunctionId);
}

function isNameTaken(name, excludeVertexId = null, excludeConstId = null, excludeFaceId = null, excludeSegId = null, excludeCurveId = null, excludeFunctionId = null) {
  return isNameTakenIn(name, vertices, constants, faces, segments, excludeVertexId, excludeConstId, excludeFaceId, excludeSegId, curves, excludeCurveId, functions, excludeFunctionId);
}

// Persistent per-prefix auto-name counters for controls-driven creation —
// decoupled from the id counters (nextVertexId/nextSegmentId/nextFaceId),
// which must always advance on every creation regardless of what name ends
// up used. A name counter only ever moves when an auto-generated name is
// actually consumed (including any collision skip below, folded into the
// same lookup) or when undo/redo restores a prior value — never on an
// explicit typed name, a rename, or a deletion.
let nameCounters = { P: 0, S: 0, F: 0, C: 0 };

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
// to let any counter change from that one parse — an explicit `counter=`
// (either `set TYPE: counter=N`, resolved against whichever naming= that
// type currently has selected, or `set naming PREFIX: counter=N`,
// addressing a scheme directly by its own name) or ordinary auto-name
// consumption from a blank-name object line — carry forward into the live
// session, in either direction (up or down; see below for why a downward
// reset needs to actually take effect, not just be computed and discarded).
//
// A blanket sync over *every* prefix `parsedCounters` knows about, not just
// whichever single prefix each of the four object types currently has
// selected (an earlier version resolved one prefix per type and synced
// only those four) — that narrower version silently failed to sync a
// `set naming PREFIX: ...` reset for any prefix that wasn't already some
// type's active naming=, which is exactly the case that construct exists
// for. Safe as a blanket copy: `parsedCounters` starts as an exact snapshot
// of the live counters at the start of that one parse (see parseCodeText),
// so any prefix this parse didn't actually touch already equals its live
// value — this only ever changes what a real counter= or auto-name
// consumption in this specific parse actually computed.
//
// The sync direction itself is a direct assignment, not a max — a save's
// resulting counter becomes the live value outright, whether that's higher
// (new auto-named objects created) or lower (a deliberate reset, e.g. after
// deleting some trailing objects to close a naming gap on purpose). An
// earlier version capped this at Math.max(...), reasoning that a save
// touching a prefix less than the live session already had must not roll a
// further-along live counter backward — but that scenario can't actually
// arise: `counter=` is one-time/absorbed (never re-emitted by
// serializeState, so a stale value can't linger into a later save), and
// object creation via the control panel is disabled outright while the
// code editor is open, so there's no interleaved race to protect against
// either. The real safety net against a duplicate name is the collision-
// skip in advanceAutoName/findNextAutoName, which runs at the moment of
// each actual creation regardless of which direction the counter moved —
// so capping this sync direction was never load-bearing for correctness,
// only an overcautious leftover that happened to block a deliberate reset.
function syncNameCountersFromParse(parsedCounters) {
  Object.assign(nameCounters, parsedCounters);
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
// Canonical text format (see NOTES2.md for the early spec sketch — the real
// grammar has moved on from it in several ways, this comment is the current
// source of truth). A leading '#' opens a section header — '=' bars for the
// auxiliary (non-drawn) sections, '-' bars for the display (drawn) ones:
//   #======== VIEW SETTINGS ========      (cosmetic banner — no
//                                           OBJECT_TYPES entry, nothing
//                                           routes here yet)
//   #======== AUXILIARY CONSTANTS ========
//   #======== POLYTOPES ========          (cosmetic banner, wraps the next
//                                           three — each still its own
//                                           independent real section)
//   #-------- VERTICES --------
//   #-------- SEGMENTS --------
//   #-------- FACES --------
//   #======== AUXILIARY FUNCTIONS ========  (holds both function and
//                                             domain lines, flatly, no
//                                             subheaders)
//   #-------- CURVES --------
//   #----------------------------------------     (divider — no name)
// A '#' line that isn't one of those header-bar shapes is a plain comment —
// ignored by parsing, left exactly where it is by Sort. A header-bar-shaped
// line whose title doesn't match any OBJECT_TYPES entry (VIEW SETTINGS,
// POLYTOPES) is classified the same inert way — never relocated, never
// treated as an insertion anchor for real object lines.
// Below the divider is the scratch area: a place to type new objects of any
// kind without caring which section they belong in. Sort always relocates
// every *valid* recognized object out of the scratch area into its home
// section, leaving only invalid/unrecognized text behind there.
//
// Object lines: "keyword name?: rest". number/color/bool/vertex/segment/
// face/curve are supported; domain/function/slider are recognized but
// rejected (no evaluator support for them yet, but their sections still
// exist so the file format doesn't need to change again once they are).
// curve's own grammar is `curve NAME: x=expr ; y=expr ; z=expr ; PARAM in
// [lo, hi] [color=... visible=...]` — see the keyword === 'curve' branch.
// Everything else is 'unrecognized'.
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
  // No `list`/`lastSet` — view settings are singleton live state (darkMode,
  // paramMode, displayMode, controlPt, ...), not a per-instance array, so
  // this entry exists purely for section header classification/ordering
  // and the sortCodeText 'view' branch (see buildViewSettingsBlock) — the
  // same minimal shape 'constants' already has (no list of its own either,
  // before functions/curves existed).
  { key: 'view',      title: 'VIEW SETTINGS',      style: 'eq', match: /VIEW SETTING/i },
  { key: 'constants', title: 'AUXILIARY CONSTANTS', style: 'eq', match: /CONSTANT/i },
  { key: 'vertices',  title: 'VERTICES',  style: 'dash', match: /VERT/i,
    list: () => vertices, lastSet: () => lastSetVertex },
  { key: 'segments',  title: 'SEGMENTS',  style: 'dash', match: /SEGMENT/i,
    list: () => segments, lastSet: () => lastSetSegment },
  { key: 'faces',     title: 'FACES',     style: 'dash', match: /FACE/i,
    list: () => faces, lastSet: () => lastSetFace },
  // Both `function` and `domain` keyword lines route into this one section
  // (rec.targetSection = 'functions' for both — see the object-creation
  // dispatch below) — a single key, a single header emission, no
  // subheaders. A second OBJECT_TYPES entry for 'domain' would make
  // sortCodeText's per-key loop emit a second, duplicate "AUXILIARY
  // FUNCTIONS" header, since that loop emits one section per SECTION_ORDER
  // key regardless of title text. `domain` is still unimplemented (see
  // parseCodeText) — `list` only ever walks real `function` objects.
  { key: 'functions', title: 'AUXILIARY FUNCTIONS', style: 'eq', match: /FUNCTION/i,
    list: () => functions },
  { key: 'curves',    title: 'CURVES',    style: 'dash', match: /CURVE/i,
    list: () => curves, lastSet: () => lastSetCurve },
];
const SECTION_ORDER = OBJECT_TYPES.map(d => d.key);

const CODE_HEADER_EQ_RE   = /^#=+\s*(.*?)\s*=+$/;
const CODE_HEADER_DASH_RE = /^#-+\s*(.*?)\s*-+$/;
const CODE_OBJECT_RE = /^(number|color|bool|domain|vertex|segment|face|function|slider|curve)\b\s*([^:]*):(.*)$/;

// Peels an optional trailing ` in {SetExpr}` domain-restriction clause off
// a `number` line's raw pre-colon text — `CODE_OBJECT_RE`'s own name
// group captures everything up to the colon as one blob, so this has to
// happen before the plain-identifier check, mirroring how curve's own
// `PARAM in [lo,hi]` domain clause is a distinct trailing piece rather
// than folded into the identifier. `in` only ever appears here as this
// keyword — a real name can never itself contain a space, so a single
// whole-word scan is unambiguous regardless of what a name preceding or
// following it happens to look like (verified directly: a name ending in
// "in", like "bin", or containing it, like "wintotal", never mis-splits,
// since \w*'s own greediness already stops at the real word boundary and
// only backtracks when the match actually requires it).
function splitNameAndDomainClause(nameRaw) {
  const trimmed = nameRaw.trim();
  const m = /^(\w*)\s*\bin\b\s+(\S[\s\S]*)$/.exec(trimmed);
  if (m && (m[1] === '' || CODE_IDENT_RE.test(m[1]))) {
    return { name: m[1], domainText: m[2].trim() };
  }
  return { name: trimmed, domainText: null };
}

// Set-literal grammar — deliberately scoped to domain-restricted numeric
// declarations (`number NAME in {SetExpr}: value`) and the inline
// membership condition it enables (`a in {SetExpr}`, wired into
// parseExprAst's own parseComparison); not a general-purpose value usable
// anywhere a number can go, same scoping a curve's own `[lo,hi]` domain
// clause already has.
//   SetExpr := SetTerm ('U' SetTerm)*          -- bare capital U, exactly
//                                                  matching curve domain
//                                                  unions' own convention
//   SetTerm := '{' Int (',' Int)* '}'  |  '\range' '(' Int ',' Int ')'
// `\range(a,b)` is Python's own half-open convention: {a, a+1, ..., b-1},
// exclusive upper bound. Deliberately backslash-prefixed, and not merely
// for stylistic consistency with `\sin`/`\sqrt` — unprefixed, `range(a,b)`
// would be lexically identical to a user calling their own function named
// `range` (bare `name(args)` is already the call grammar).
//
// Deliberate simplification, not a design commitment: set members and
// \range's endpoints are plain integer literals only, not full
// expressions/constant references — this keeps this parser fully
// self-contained (no environment, no re-entrant dependency on
// parseExprAst's own numeric layer). Extend later if a real case needs a
// constant reference inside a set literal.
//
// parseSetExprAstAt(s, startPos) is the re-entrant core, taking an
// explicit position rather than owning its own string — this is what
// lets parseComparison (a *different* closure, parsing a *different*
// grammar) call into this mid-expression and resume from wherever it left
// off, without the two parsers needing to share any internal state beyond
// the string and a position. parseSetExprAst(src) is the standalone
// top-level entry (domain declarations), requiring the whole string
// consumed.
function parseSetExprAstAt(s, startPos) {
  let pos = startPos;
  let failed = false;
  const skipWS = () => { while (pos < s.length && /\s/.test(s[pos])) pos++; };
  const peek = () => s[pos];
  const startsWith = (tok) => s.slice(pos, pos + tok.length) === tok;

  function parseIntLit() {
    skipWS();
    const m = /^-?\d+/.exec(s.slice(pos));
    if (!m) { failed = true; return NaN; }
    pos += m[0].length;
    return parseInt(m[0], 10);
  }

  function parseTerm() {
    skipWS();
    if (peek() === '{') {
      pos++; skipWS();
      const values = [];
      if (peek() !== '}') {
        values.push(parseIntLit()); skipWS();
        while (peek() === ',') { pos++; skipWS(); values.push(parseIntLit()); skipWS(); }
      }
      if (peek() === '}') pos++; else failed = true;
      return { type: 'setlist', values };
    }
    if (startsWith('\\range')) {
      pos += '\\range'.length; skipWS();
      if (peek() !== '(') { failed = true; return { type: 'setlist', values: [] }; }
      pos++; skipWS();
      const lo = parseIntLit(); skipWS();
      if (peek() !== ',') { failed = true; return { type: 'setrange', lo, hi: lo }; }
      pos++; skipWS();
      const hi = parseIntLit(); skipWS();
      if (peek() === ')') pos++; else failed = true;
      return { type: 'setrange', lo, hi };
    }
    failed = true;
    return { type: 'setlist', values: [] };
  }

  skipWS();
  const terms = [parseTerm()];
  skipWS();
  while (!failed && /^U(?![a-zA-Z0-9_])/.test(s.slice(pos))) {
    pos += 1; skipWS();
    terms.push(parseTerm());
    skipWS();
  }
  return failed
    ? { ok: false, endPos: pos }
    : { ok: true, ast: { type: 'setunion', terms }, endPos: pos };
}
function parseSetExprAst(src) {
  const s = (src ?? '').trim();
  const r = parseSetExprAstAt(s, 0);
  if (!r.ok || r.endPos !== s.length) return { ok: false };
  return { ok: true, ast: r.ast };
}

// Flattens a parsed set AST into a concrete Set<number> — no environment
// needed, since set members are plain integer literals (see
// parseSetExprAstAt above). `\range(lo,hi)` is exclusive on `hi` (Python's
// own convention); `lo >= hi` is simply an empty range, same as Python's
// `range()`, not an error.
function evalSetAst(ast) {
  const out = new Set();
  for (const term of ast.terms) {
    if (term.type === 'setlist') {
      for (const v of term.values) out.add(v);
    } else {
      for (let v = term.lo; v < term.hi; v++) out.add(v);
    }
  }
  return out;
}
// Canonical form is colon-uniform (`set vertex: color=X`), matching every
// other line kind — but the colon is optional on read: `set vertex
// color=X` (the original, pre-decision shape) still parses, silently
// normalized to the colon form on next Sort/Save.
const CODE_SET_RE    = /^set\s+(vertex|segment|face|curve)(?:\s*:\s*|\s+)(.+)$/;
// `set naming PREFIX: counter=N` — addresses a naming scheme directly, by
// its own prefix, rather than indirectly via whichever type currently has
// it selected (`set TYPE: counter=N` above). See NOTES20: needed
// specifically for a scheme that isn't any type's active `naming=` right
// now — the only other way to reach it is to temporarily reassign some
// type's `naming=` just to seed it, then switch back. The prefix itself is
// captured loosely here (any non-whitespace run) and validated against
// CODE_IDENT_RE below, same "match loosely, validate the captured piece for
// a specific error" pattern every other identifier in this grammar uses —
// not baked into the regex the way vertex/segment/face/curve are above,
// since a prefix is an open-ended user choice, not a fixed keyword set.
const CODE_SET_NAMING_RE = /^set\s+naming\s+(\S+)\s*:\s*(.+)$/;
const CODE_EDIT_RE   = /^edit\s+(vertex|segment|face|number|color|bool)\b\s*([^:]*):(.*)$/;
// Deliberately covers all six renameable kinds, not just the four `edit`
// currently does — curve/function have nothing else about them to edit
// yet, but renaming one is exactly as well-defined as any other kind
// (NOTES16.md).
const CODE_RENAME_RE = /^rename\s+(vertex|segment|face|curve|number|color|bool|function)\b\s*([^:]*):(.*)$/;
const CODE_IDENT_RE  = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const CODE_COLOR_RE  = /^#[0-9a-fA-F]{6}$/;

// ─── View settings (camera/display state) ──────────────────────────────────────
//
// Singleton tier-2 state (SotU's "governing singleton" tier, same as
// lastSetVertex/etc.) exposed in the code editor as a fixed block of
// `keyword: value` lines under the VIEW SETTINGS header — one keyword per
// live global, no user-chosen name (unlike vertex/segment/etc., there's
// nothing to name; a bare TYPE NAME: shape doesn't apply here at all).
// Each keyword only ever appears as the line's very first token, so it can
// never collide with any other line kind (object creation always needs its
// own leading keyword first, `edit`/`set` always start with those words) —
// same "keywords only ever appear in fixed structural positions" principle
// this grammar already relies on everywhere else.
// Deliberately excluded from undo/redo and from the code editor's live
// preview-while-typing mechanism, same as `set` lines — takes effect only
// on Save or a direct interpreter-line submission (see applyViewSettings).
const VIEW_SETTINGS_FIELDS = [
  { token: 'darkMode',      kind: 'bool' },
  { token: 'mode',          kind: 'enum', values: ['compact', 'polynomial'] },
  { token: 'anchor',        kind: 'enum', values: ['zaxis', 'diagonal'] },
  { token: 'pointer',       kind: 'point' },
  { token: 'showPointer',   kind: 'bool' },
  { token: 'showAxes',      kind: 'bool' },
  { token: 'scale',         kind: 'posnumber' },
  { token: 'perspective',   kind: 'bool' },
  { token: 'invF',          kind: 'unit' },
  { token: 'scaleNodes',    kind: 'bool' },
  { token: 'scaleSegments', kind: 'bool' },
  { token: 'clipBehind',    kind: 'bool' },
];
const CODE_VIEW_RE = /^(darkMode|mode|anchor|pointer|showPointer|showAxes|scale|perspective|invF|scaleNodes|scaleSegments|clipBehind)\s*:\s*(.*)$/;

// Validates/parses one view-setting line's raw value text against its
// field's fixed kind. Returns { ok:true, value } or { ok:false, errorMsg }.
function parseViewSettingValue(token, rawText) {
  const def = VIEW_SETTINGS_FIELDS.find(f => f.token === token);
  if (rawText === '') return { ok: false, errorMsg: `${token} requires a value` };
  if (def.kind === 'bool') {
    if (rawText === 'true')  return { ok: true, value: true };
    if (rawText === 'false') return { ok: true, value: false };
    return { ok: false, errorMsg: `invalid ${token} value '${rawText}' (expected true or false)` };
  }
  if (def.kind === 'enum') {
    if (def.values.includes(rawText)) return { ok: true, value: rawText };
    return { ok: false, errorMsg: `invalid ${token} value '${rawText}' (expected ${def.values.join(' or ')})` };
  }
  if (def.kind === 'point') {
    const parts = rawText.split(',').map(s => s.trim());
    const re = parts.length === 2 ? parseFloat(parts[0]) : NaN;
    const im = parts.length === 2 ? parseFloat(parts[1]) : NaN;
    if (!Number.isFinite(re) || !Number.isFinite(im)) {
      return { ok: false, errorMsg: `invalid pointer value '${rawText}' (expected 're, im')` };
    }
    return { ok: true, value: { re, im } };
  }
  if (def.kind === 'posnumber') {
    const v = parseFloat(rawText);
    if (!Number.isFinite(v) || v <= 0) return { ok: false, errorMsg: `invalid ${token} value '${rawText}' (expected a positive number)` };
    return { ok: true, value: v };
  }
  if (def.kind === 'unit') {
    const v = parseFloat(rawText);
    if (!Number.isFinite(v) || v < 0 || v > 1) return { ok: false, errorMsg: `invalid ${token} value '${rawText}' (expected a number in [0, 1])` };
    return { ok: true, value: v };
  }
  return { ok: false, errorMsg: `unrecognized ${token} value` };
}

// A face's vertex list must never contain the same vertex twice — relied
// upon by the whole face-editing design (name-based `replace` is only
// well-defined if names are unique within the face) but never actually
// enforced anywhere, including at creation, until now. Shared by face
// creation here and by `replace`/`overwrite`'s result once those exist —
// a pure name-list check, independent of how the list was produced.
function hasDuplicateVertexNames(names) {
  return new Set(names).size !== names.length;
}

// Finds the first comma not nested inside parentheses. Needed because a
// domain bound expression can itself contain a function call with its own
// comma-separated arguments (`[0, f(1,2)]`) — a naive first-comma split
// would misparse that as lo="f(1", hi="2), 3" or similar. Returns
// [before, after] or null if no top-level comma exists.
function splitTopLevelComma(s) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') depth--;
    else if (s[i] === ',' && depth === 0) return [s.slice(0, i), s.slice(i + 1)];
  }
  return null;
}

// Parses "[lo1, hi1] U [lo2, hi2] U ... [loN, hiN]" — a curve domain as a
// disjoint union of one or more intervals — followed by optional trailing
// attributes (color=/visible=). `U` is bare, never backslash-prefixed
// (unlike the fixed builtin vocabulary \sin/\pi/etc.) and case-sensitive
// (a lowercase `u` is deliberately not recognized, user's own call) — safe
// because it only ever appears in this one fixed structural position,
// right after a closing `]` and before the next `[`, never confusable
// with a same-named constant used *inside* a bound expression (`[0, U]`
// — that U sits inside the brackets, a different position entirely),
// exactly the same "keywords only appear in fixed structural positions"
// principle every other bare keyword in this grammar already relies on.
// Not required to be disjoint or in increasing order — a union doesn't
// mathematically require either, and rejecting either would be an
// arbitrary restriction with no correctness payoff.
// Returns { intervals: [{loExpr, hiExpr}, ...], attrTail } or { error }.
function parseDomainIntervals(s) {
  const intervals = [];
  let pos = 0;
  while (true) {
    while (pos < s.length && /\s/.test(s[pos])) pos++;
    if (s[pos] !== '[') {
      if (intervals.length === 0) return { error: `expected '[lo, hi]'` };
      break;
    }
    const closeIdx = s.indexOf(']', pos);
    if (closeIdx === -1) return { error: `unterminated '[' in domain clause` };
    const inner = s.slice(pos + 1, closeIdx);
    const split = splitTopLevelComma(inner);
    if (!split) return { error: `expected 'lo, hi' inside '[...]'` };
    const loExpr = split[0].trim();
    const hiExpr = split[1].trim();
    if (!loExpr || !hiExpr) return { error: `expected 'lo, hi' inside '[...]'` };
    intervals.push({ loExpr, hiExpr });
    pos = closeIdx + 1;
    while (pos < s.length && /\s/.test(s[pos])) pos++;
    // A standalone 'U' token (not the start of a longer identifier like
    // "Undefined") continues to another interval; anything else — trailing
    // attrs, or nothing — ends the domain clause here.
    if (s[pos] !== 'U' || /[a-zA-Z0-9_]/.test(s[pos + 1] ?? '')) break;
    pos += 1;
    while (pos < s.length && /\s/.test(s[pos])) pos++;
    if (s[pos] !== '[') return { error: `expected '[lo, hi]' after 'U'` };
  }
  return { intervals, attrTail: s.slice(pos) };
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
// A const's kind (number/color/bool) is fixed forever by which bare
// keyword created it — see the number/color/bool branch below. 'bool' is
// the DSL-facing keyword; internally a boolean-kind constant's `.kind` is
// still stored as 'boolean', matching every existing reader of that field
// (renderConstValSpan, buildEnvs, etc.) — only the parser needs to know
// about the shorter keyword. No reserved-word list is needed for these
// three anymore (unlike when they could optionally appear as a kind-token
// inside `const`'s name-field position) — they're true top-level keywords
// now, matched before name-position is ever reached, so a constant can
// legally be named "number" the same way a vertex can be named "vertex".

// field -> canonical syntax token name (also used by tokenizeAttrs' error text)
const FIELD_TOKEN_NAME = { color: 'color', r: 'r', width: 'w', visible: 'visible', label: 'label', x: 'x', y: 'y', z: 'z', naming: 'naming', counter: 'counter' };

// Built-in auto-name prefix per type, absent any `naming=` override.
const AUTO_NAME_PREFIX = { vertex: 'P', segment: 'S', face: 'F', curve: 'C' };

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
  curve:   ['color', 'visible', 'naming'],
};
// `counter=` is also settable via a `set` line, but deliberately left out
// of SET_FIELD_ORDER above — unlike naming (a stable template choice),
// counter is a one-time imperative ("jump the counter to N right now"), not
// a governing setting: its effect is applied immediately at parse time
// (seeding parseNameCounters — see parseCodeText) and from then on lives
// only in the resulting object names and the live nameCounters it advances
// (see syncNameCountersFromParse), the same way an `edit` line's effect
// lives on only in the target object it already mutated. Auto-redisplaying
// it here would also churn the file on every single object creation, which
// naming/color/etc. never do since they're stable across many creations.
const SET_SETTABLE_FIELDS = {
  vertex:  [...SET_FIELD_ORDER.vertex,  'counter'],
  segment: [...SET_FIELD_ORDER.segment, 'counter'],
  face:    [...SET_FIELD_ORDER.face,    'counter'],
  curve:   [...SET_FIELD_ORDER.curve,   'counter'],
};
// Text-typed (not number/boolean) for consistency — every field is raw expr
// text everywhere else now, so these fall-back defaults are too.
const BUILTIN_SET_DEFAULTS = {
  vertex:  { color: DEFAULT_COLOR, r: '5', visible: 'true', label: 'true', naming: AUTO_NAME_PREFIX.vertex },
  segment: { color: DEFAULT_COLOR, width: '1.5', visible: 'true', naming: AUTO_NAME_PREFIX.segment },
  face:    { color: DEFAULT_COLOR, visible: 'true', naming: AUTO_NAME_PREFIX.face },
  curve:   { color: DEFAULT_COLOR, visible: 'true', naming: AUTO_NAME_PREFIX.curve },
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
  curve: [
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

// Text-level (not AST-level) guard-structure splitter for object-creation
// lines (vertex today; segment/face/curve deferred) — where a branch's
// payload isn't a simple scalar value expression but this object type's
// own whole creation sub-grammar (positional/named coordinates plus
// trailing attributes, for vertex), which tokenizeAttrs's plain
// whitespace-splitting can't safely coexist with directly (a guard
// payload's own internal spaces, e.g. `{0 1 2}`, would otherwise get
// chopped into separate positional tokens *before* any guard parsing ever
// ran — a real gap found and confirmed during the previous phase, not
// hypothetical). Reused by handing each branch's raw payload text back to
// the caller's own existing per-type parsing logic, rather than teaching
// this splitter every object type's grammar — deliberately separate from
// parseExprAst's own (AST-based) guard parsing, which resolves a payload
// via recursive evaluation, not raw text; object-creation payloads need
// the opposite, so a little structural duplication of the comma/
// otherwise/brace-matching logic here is clearer than forcing one
// mechanism to serve two very different payload shapes.
//
// Returns null if `rest` isn't guard-shaped at the top level at all (the
// ordinary, far more common case — caller falls through to its existing,
// completely unchanged parsing path). Otherwise `{ ok:true, terms:
// [{condText, payloadText, isOtherwise}] }` (condText/payloadText still
// raw, unparsed strings — the caller parses payloadText with its own
// per-type logic, and condText via parseExprAst/evalAst exactly like any
// other boolean condition) or `{ ok:false, error }` for a line that IS
// guard-shaped but malformed.
function splitGuardedObjectLine(rest) {
  const s = rest;
  let pos = 0;
  const skipWS = () => { while (pos < s.length && /\s/.test(s[pos])) pos++; };
  const matchOtherwise = () => {
    skipWS();
    if (s.slice(pos, pos + 'otherwise'.length) !== 'otherwise') return false;
    const after = s[pos + 'otherwise'.length];
    if (after !== undefined && /[a-zA-Z0-9_]/.test(after)) return false;
    pos += 'otherwise'.length;
    return true;
  };
  const findNextTopLevelBrace = (from) => {
    let depth = 0;
    for (let i = from; i < s.length; i++) {
      if (s[i] === '{') { if (depth === 0) return i; depth++; }
      else if (s[i] === '}') depth--;
    }
    return -1;
  };
  const readCond = () => {
    const braceIdx = findNextTopLevelBrace(pos);
    if (braceIdx === -1) return { ok: false };
    const condText = s.slice(pos, braceIdx).trim();
    if (!parseExprAst(condText).ok) return { ok: false };
    pos = braceIdx;
    return { ok: true, condText };
  };

  skipWS();
  let isOtherwise = matchOtherwise();
  let condText = null;
  if (!isOtherwise) {
    const r = readCond();
    if (!r.ok) return null; // not guard-shaped at all — normal parsing takes over
    condText = r.condText;
  }

  const terms = [];
  while (true) {
    skipWS();
    if (s[pos] !== '{') return { ok: false, error: "expected '{' after condition in guarded line" };
    pos++;
    const payloadStart = pos;
    let depth = 1;
    while (pos < s.length && depth > 0) {
      if (s[pos] === '{') depth++;
      else if (s[pos] === '}') depth--;
      if (depth > 0) pos++;
    }
    if (depth !== 0) return { ok: false, error: 'unterminated { in guarded line' };
    const payloadText = s.slice(payloadStart, pos);
    pos++; // consume '}'
    terms.push({ condText, payloadText, isOtherwise });
    if (isOtherwise) break;
    skipWS();
    if (s[pos] !== ',') break;
    pos++;
    skipWS();
    isOtherwise = matchOtherwise();
    if (!isOtherwise) {
      const r = readCond();
      if (!r.ok) return { ok: false, error: 'expected another guarded term after ,' };
      condText = r.condText;
    } else {
      condText = null;
    }
  }
  skipWS();
  if (pos !== s.length) return { ok: false, error: 'unexpected content after guarded line' };
  return { ok: true, terms };
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

// Pre-scans the raw text once, before parseCodeText's main per-line walk,
// to fully resolve every number/color/bool/function line — this is what
// lets a number or bool constant and a function reference each other in
// *any* order (see topoSortDependencies), rather than the strict "only an
// earlier constant" rule alone. Color constants are the one kind NOT part
// of the dependency graph here — no expression grammar at all (a color is
// always a literal or an earlier-same-kind lookup), so there's no forward-
// reference to support and no reason to pay for it; only its NAME gets
// assigned here (so the one shared blank-name counter across number/
// color/bool stays correct — see below), its VALUE is still resolved
// inline in the main walk, unchanged.
//
// Collision-checking here only covers *this* combined set (numbers,
// colors, bools, functions all share one namespace, same as every other
// pair of kinds in this DSL) — not vertex/segment/face/curve names, which
// aren't known until the main walk runs. That's fine, not a gap: the main
// walk's own existing checks already test every vertex/segment/face/curve
// name against stagedConstants (and, once this lands, stagedFunctions),
// and this function's results are staged before the main walk starts, so
// a cross-kind collision is still always caught — just reported from
// whichever line the main walk reaches second, not necessarily the one
// that would have reported it under the old single-pass design.
//
// Returns { byLineIdx: Map<number, result>, numericEnv, boolEnv, functionEnv }.
// A `result` is either { ok:false, errorMsg } or one of:
//   { ok:true, keyword:'color', name, rest }
//   { ok:true, keyword:'number'|'bool', name, value }
//   { ok:true, keyword:'function', name, params, bodyExpr, bodyAst, value }
// (rest is the raw, not-yet-resolved expression text — only color still
// carries this, resolved inline in the main walk same as always; number/
// bool/function are already fully resolved here, `value` meaningful for
// number and bool).
function resolveConstantsAndFunctions(rawLines) {
  const candidates = []; // { lineIdx, keyword, name, rest, error }
  const seenNames  = new Set();
  let autoConstN   = 0;

  for (let i = 0; i < rawLines.length; i++) {
    const trimmed = rawLines[i].trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const objLine = trimmed.replace(/^new\b\s*/, '');
    const m = objLine.match(CODE_OBJECT_RE);
    if (!m) continue;
    const [, keyword, nameRaw, restRaw] = m;
    if (keyword !== 'number' && keyword !== 'color' && keyword !== 'bool' && keyword !== 'function') continue;
    // A `number` name may carry a trailing ` in {SetExpr}` domain-
    // restriction clause — peeled off *before* the identifier-shape check
    // below, same reason curve's own `PARAM in [lo,hi]` domain clause is
    // handled as a distinct trailing piece rather than folded into the
    // name itself. Only `number` supports this — color/bool/function
    // names are never split this way.
    let domain = null, domainError = null;
    let nameTyped;
    if (keyword === 'number') {
      const split = splitNameAndDomainClause(nameRaw);
      nameTyped = split.name;
      if (split.domainText !== null) {
        const setParsed = parseSetExprAst(split.domainText);
        if (!setParsed.ok) domainError = `invalid domain '${split.domainText}'`;
        else domain = evalSetAst(setParsed.ast);
      }
    } else {
      nameTyped = nameRaw.trim();
    }
    const rest = restRaw.trim();
    let name = nameTyped;
    let error = null;

    // Unlike every other kind here, a blank function name is a hard error,
    // not an auto-name candidate — an anonymous function could never
    // actually be called by anything.
    if (keyword === 'function') {
      if (name === '') error = 'function requires a name';
    } else if (name === '') {
      do { name = `k${autoConstN++}`; } while (seenNames.has(name));
    }
    if (!error && name !== '') {
      if (!CODE_IDENT_RE.test(name)) error = `invalid ${keyword} name '${name}'`;
      else if (name === 'true' || name === 'false' || name === 'otherwise') error = `'${name}' is reserved and cannot be used as a name`;
      else if (seenNames.has(name)) error = `name '${name}' already used`;
    }
    if (!error && domainError) error = domainError;
    if (!error) seenNames.add(name);
    candidates.push({ lineIdx: i, keyword, name, rest, error, domain });
  }

  // `edit number|color|bool NAME: value` is how a name's expression gets
  // *replaced*, not a separate temporal event — "new"/"edit" together
  // assemble one final symbolic model, which is what everything downstream
  // (the dependency graph, color's own earlier-only walk) should resolve
  // from, regardless of where in the file the edit line physically sits
  // relative to anything that references NAME. So before any of that
  // resolution runs, find each name's *final* expression: its own creation
  // text, unless a valid `edit` targets it, in which case the edit's text
  // wins (the last one, by line order, if it's edited more than once).
  // "Valid" mirrors exactly what the main walk's own `edit` branch already
  // requires (unchanged there, not duplicated — this only needs to know
  // which edits are legitimate enough to fold in here): a same-name,
  // same-kind, error-free creation candidate that appears *earlier* in the
  // file. An edit whose target doesn't qualify — unknown name, wrong kind,
  // or (the case this exists to keep impossible) targeting something not
  // yet defined — is simply left unmerged here; the main walk's existing
  // check rejects that exact line on its own, same as always.
  const mergedExpr = new Map(); // name -> the final expr text to resolve
  for (let i = 0; i < rawLines.length; i++) {
    const trimmed = rawLines[i].trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const em = trimmed.match(CODE_EDIT_RE);
    if (!em) continue;
    const [, editType, editNameRaw, editRest] = em;
    if (editType !== 'number' && editType !== 'color' && editType !== 'bool') continue;
    const targetName = editNameRaw.trim();
    const newExpr = editRest.trim();
    if (newExpr === '') continue; // blank value — invalid, main walk reports it, nothing to merge
    const target = candidates.find(c => !c.error && c.keyword === editType && c.name === targetName && c.lineIdx < i);
    if (!target) continue;
    mergedExpr.set(targetName, newExpr);
  }

  // Parse every syntactically-named number/function body into an AST (a
  // malformed expression fails right here, independent of the graph), and
  // build the combined dependency graph from those ASTs.
  const items       = new Map(); // name -> { ast, localNames, keyword, params?, bodyExpr? }
  const parseErrors = new Map(); // name -> error message
  for (const c of candidates) {
    if (c.error || (c.keyword !== 'number' && c.keyword !== 'function' && c.keyword !== 'bool')) continue;
    if (c.keyword === 'number' || c.keyword === 'bool') {
      // A creation line's own validity must never depend on whether some
      // *edit* targeting it happens to be well-formed — an edit's own
      // validity is entirely the edit line's own concern (checked
      // independently, in parseCodeText's main walk). So: if this name
      // has an edit merged in, keep the *original* (pre-edit) AST as a
      // fallback too — if the merged version fails to parse, silently
      // fall back to the original for graph/creation-line purposes,
      // exactly as if the bad edit had never been merged. (A merged
      // value that parses fine but fails validation *at evaluation time*
      // — wrong kind, or a domain violation — gets the same fallback
      // treatment further below, in the topo-order evaluation loop,
      // since that failure mode can only be detected there.) This closes
      // a real bug found via Phase 5's own domain-enforcement testing: a
      // syntactically- or semantically-bad edit value was corrupting the
      // *creation* line into "invalid expression"/"unknown NAME" for any
      // later reference, not just failing its own edit line as intended.
      const hasMerge = mergedExpr.has(c.name);
      const merged = parseExprAst(mergedExpr.get(c.name) ?? c.rest);
      let chosen = merged, usedFallback = false;
      if (!merged.ok && hasMerge) {
        const original = parseExprAst(c.rest);
        if (original.ok) { chosen = original; usedFallback = true; }
      }
      if (!chosen.ok) {
        parseErrors.set(c.name, c.keyword === 'number' ? 'invalid expression' : 'invalid bool value');
        continue;
      }
      const originalAst = (hasMerge && !usedFallback) ? (parseExprAst(c.rest).ok ? parseExprAst(c.rest).ast : null) : null;
      items.set(c.name, {
        ast: chosen.ast, localNames: new Set(), keyword: c.keyword,
        domain: c.keyword === 'number' ? c.domain : undefined,
        originalAst, // only set when the merged parse *succeeded* but might still fail at eval time
      });
    } else {
      // Functions aren't editable (CODE_EDIT_RE has no `function` arm), so
      // mergedExpr never has an entry for one — c.rest is always final.
      const arrowIdx = c.rest.indexOf('->');
      if (arrowIdx === -1) { parseErrors.set(c.name, "expected 'PARAM[, PARAM...] -> expr'"); continue; }
      const paramsPart = c.rest.slice(0, arrowIdx).trim();
      const bodyPart   = c.rest.slice(arrowIdx + 2).trim();
      const params = paramsPart === '' ? [] : paramsPart.split(',').map(p => p.trim());
      const badParam = params.find(p => !CODE_IDENT_RE.test(p));
      if (badParam !== undefined) { parseErrors.set(c.name, `invalid parameter name '${badParam}'`); continue; }
      if (new Set(params).size !== params.length) { parseErrors.set(c.name, 'duplicate parameter name'); continue; }
      if (bodyPart === '') { parseErrors.set(c.name, 'function body cannot be empty'); continue; }
      const parsed = parseExprAst(bodyPart);
      if (!parsed.ok) { parseErrors.set(c.name, 'invalid function body'); continue; }
      items.set(c.name, { ast: parsed.ast, localNames: new Set(params), keyword: 'function', params, bodyExpr: bodyPart });
    }
  }

  // Topologically sort, removing and re-trying past any cycle found —
  // every member of a cycle gets the same precise "circular dependency"
  // error, naming the cycle; everything outside it still resolves
  // normally, in dependency order. Loops rather than a single retry
  // because more than one independent cycle can exist in the same file.
  let workingItems = items;
  let order;
  while (true) {
    const topo = topoSortDependencies(workingItems);
    if (topo.ok) { order = topo.order; break; }
    const msg = `circular dependency: ${topo.cycle.join(' → ')}`;
    workingItems = new Map(workingItems);
    for (const name of new Set(topo.cycle)) {
      parseErrors.set(name, msg);
      workingItems.delete(name);
    }
  }

  const numericEnv  = {};
  const boolEnv     = {};
  const functionEnv = {};
  // Mirrors numericEnv but only for names with a declared domain — see
  // buildEnvs()'s own domainEnv for the full reasoning (the totality
  // checker's domain-aware enumeration needs the *set*, not just the
  // current value).
  const domainEnv   = {};
  const resultByName = new Map();
  for (const name of order) {
    const item = items.get(name);
    if (item.keyword === 'number' || item.keyword === 'bool') {
      // Validates one candidate AST (guard exhaustiveness, then
      // evaluation, then — for number — the declared domain, locked
      // forever once a number is created since no code path ever mutates
      // item.domain/the committed constant's own .domain after this).
      // Tried first against the *merged* (edit-folded) AST; if that
      // fails for *any* reason and this name has an edit merged in,
      // retried against item.originalAst (the pre-edit definition) —
      // an edit's own validity is entirely that edit line's own concern,
      // checked independently in parseCodeText's main walk, and must
      // never be able to drag the creation line down with it (a real bug
      // found via Phase 5's domain-enforcement testing, not hypothetical
      // — even a syntactically-garbage edit value used to corrupt the
      // creation line into "invalid expression" for any later reference).
      const tryEval = (ast) => {
        const totalityErr = findGuardTotalityError(ast, { numericEnv, boolEnv, functionEnv, domainEnv });
        if (totalityErr) return { ok: false, err: totalityErr };
        const kindErr = inferExprKind(ast, {}, { numericEnv, boolEnv, functionEnv }).error;
        if (kindErr) return { ok: false, err: kindErr };
        const value = evalAst(ast, { numericEnv, boolEnv, functionEnv });
        if (item.keyword === 'number') {
          if (!Number.isFinite(value)) return { ok: false, err: 'invalid expression' };
          if (item.domain && !item.domain.has(value)) {
            return { ok: false, err: `${value} is outside ${name}'s declared domain` };
          }
        } else if (typeof value !== 'boolean') {
          return { ok: false, err: 'invalid bool value' };
        }
        return { ok: true, value };
      };
      let res = tryEval(item.ast);
      if (!res.ok && item.originalAst) res = tryEval(item.originalAst);
      if (!res.ok) { parseErrors.set(name, res.err); continue; }
      if (item.keyword === 'number') {
        numericEnv[name] = res.value;
        if (item.domain) domainEnv[name] = item.domain;
        resultByName.set(name, { ok: true, keyword: 'number', name, value: res.value, domain: item.domain });
      } else {
        boolEnv[name] = res.value;
        resultByName.set(name, { ok: true, keyword: 'bool', name, value: res.value });
      }
    } else {
      // Phase 6: a parameter used as more than one fixed kind (e.g. both a
      // number and a bool operand somewhere in the body) can never be
      // satisfied by any call — reject the definition itself, once, rather
      // than deferring to whichever call site happens to trip over it
      // first (findFunctionParamKindConflict's own comment has the full
      // reasoning). Independent of the per-call check inferExprKind does
      // at every actual call site below (evalGuardedExpr/tryEval) — this
      // one exists purely for a clean, call-independent error message.
      // Computed *before* the totality check below since its `roles`
      // result is also what lets a bool-role parameter (not just a global
      // bool constant) be enumerated as a free variable there.
      const fnShape = { params: item.params, bodyAst: item.ast };
      const { roles, conflict } = classifyFunctionParamKinds(fnShape);
      if (conflict) {
        const label = k => (k === 'boolean' ? 'bool' : k);
        parseErrors.set(name, `parameter '${conflict.name}' is used as both a ${label(conflict.kinds[0])} and a ${label(conflict.kinds[1])}`);
        continue;
      }
      // A function's own bool-role parameter is enumerable exactly like a
      // global bool constant — merging it into a *copy* of boolEnv (never
      // the shared one) is enough to make checkGuardExhaustive pick it up
      // as a free variable; the placeholder value itself is never read,
      // since the enumeration loop overwrites every free variable's entry
      // with each hypothetical value before evaluating anything.
      const boolEnvForTotality = { ...boolEnv };
      for (const p of item.params) if (roles[p] === 'boolean') boolEnvForTotality[p] = false;
      const totalityErr = findGuardTotalityError(item.ast, { numericEnv, boolEnv: boolEnvForTotality, functionEnv, domainEnv });
      if (totalityErr) { parseErrors.set(name, totalityErr); continue; }
      functionEnv[name] = { params: item.params, bodyAst: item.ast };
      resultByName.set(name, { ok: true, keyword: 'function', name, params: item.params, bodyExpr: item.bodyExpr, bodyAst: item.ast });
    }
  }

  const byLineIdx = new Map();
  for (const c of candidates) {
    if (c.error) { byLineIdx.set(c.lineIdx, { ok: false, errorMsg: c.error }); continue; }
    if (c.keyword === 'color') {
      // Still resolved inline, in file order, by parseCodeText's own walk
      // below (color keeps its earlier-only-reference rule, unchanged) —
      // but `rest` here is the *final*, edit-merged text, exactly like
      // number/bool above, so a same-parse edit is reflected regardless of
      // where in the file it sits relative to this creation line.
      byLineIdx.set(c.lineIdx, { ok: true, keyword: c.keyword, name: c.name, rest: mergedExpr.get(c.name) ?? c.rest });
      continue;
    }
    if (parseErrors.has(c.name)) { byLineIdx.set(c.lineIdx, { ok: false, errorMsg: parseErrors.get(c.name) }); continue; }
    byLineIdx.set(c.lineIdx, resultByName.get(c.name));
  }

  return { byLineIdx, numericEnv, boolEnv, functionEnv, domainEnv };
}

function parseCodeText(text) {
  const rawLines         = text.split('\n');
  const lines            = [];
  const stagedConstants  = [];
  const stagedFunctions  = [];
  const stagedVertices   = [];
  const stagedSegments   = [];
  const stagedFaces      = [];
  const stagedCurves     = [];
  // Number- and bool-kind constants, plus functions, are fully resolved
  // *before* this walk even starts — see resolveConstantsAndFunctions —
  // since any of the three can now reference each other in any order, not
  // just "an earlier one." So numericEnv/boolEnv/functionEnv all start out
  // already complete here (an `edit number`/`edit bool` line reached later
  // in this walk still mutates its entry in place, same as always — this
  // is about initial resolution order, not about the envs becoming
  // read-only). colorEnv is the one exception, still built incrementally
  // from scratch in this same left-to-right walk (a color constant can
  // only ever reference an earlier color constant — no expression grammar
  // to need forward-reference for).
  const constFns          = resolveConstantsAndFunctions(rawLines);
  const numericEnv        = constFns.numericEnv;
  const functionEnv       = constFns.functionEnv;
  const boolEnv           = constFns.boolEnv;
  const colorEnv          = {};
  const vertexByName    = new Map(); // name -> staged vertex, built incrementally
  const segmentByName   = new Map(); // name -> staged segment, built incrementally (edit target lookup)
  const faceByName      = new Map(); // name -> staged face, built incrementally (edit target lookup)
  const constByName     = new Map(); // name -> staged constant, built incrementally (edit target lookup)
  const functionByName  = new Map(); // name -> staged function, built incrementally
  const curveByName     = new Map(); // name -> staged curve, built incrementally
  // Per-prefix auto-name counters, local to this one parse (mutations here
  // never touch the live nameCounters directly — see syncNameCountersFromParse,
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
    curve:   { color: undefined, visible: undefined, naming: undefined, counter: undefined },
  };
  // View settings have no per-type structure like currentSet above (there's
  // only ever one of each field, not one per object type) — just a flat
  // map of whichever fields actually appeared, last occurrence wins, same
  // order-dependent-overwrite shape as currentSet's own fields.
  const currentView = {};

  for (let lineIdx = 0; lineIdx < rawLines.length; lineIdx++) {
    const raw = rawLines[lineIdx];
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

    // "darkMode: true" / "mode: compact" / "pointer: 0.5, 0.3" / etc. — one
    // of the 12 fixed view-setting keywords (VIEW_SETTINGS_FIELDS), always
    // matched before edit/set/object lines since it's the simplest shape
    // (no name, no type keyword, just a fixed token). Applied immediately
    // (like `edit`, not deferred like `set`) — targetSection stays null,
    // same reasoning as `edit`: nothing else ever needs to relocate this
    // line, it gets consolidated into one canonical block and dropped (see
    // sortCodeText) regardless of where in the file it was typed.
    const viewMatch = trimmed.match(CODE_VIEW_RE);
    if (viewMatch) {
      const [, token, rawText] = viewMatch;
      rec.kind = 'view';
      const res = parseViewSettingValue(token, rawText.trim());
      if (!res.ok) {
        rec.valid = false; rec.errorMsg = res.errorMsg; lines.push(rec); continue;
      }
      currentView[token] = res.value;
      rec.parsed = { token, value: res.value };
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
      // `edit number/color/bool NAME: value` takes a bare expression, not
      // field=value tokens like the other three types, and never touches
      // the constant's own locked kind: the new expression is resolved
      // against whatever kind this constant already has (resolveConstByKind),
      // rejected if it doesn't fit. Kind can't move between environments
      // mid-parse now that it's locked, so a later line in the same parse
      // just needs this one env entry refreshed to see the new value.
      if (editType === 'number' || editType === 'color' || editType === 'bool') {
        // Since the edit keyword now states a kind explicitly (unlike the
        // old generic `edit const`), a mismatched keyword needs its own
        // rejection — otherwise it would silently resolve against the
        // target's real kind and the wrong keyword would go unnoticed.
        const editKind = editType === 'bool' ? 'boolean' : editType;
        if (target.kind !== editKind) {
          rec.valid = false;
          rec.errorMsg = `'${targetName}' is a ${target.kind === 'boolean' ? 'bool' : target.kind}, not a ${editType}`;
          lines.push(rec); continue;
        }
        const newExpr = editRest.trim();
        if (newExpr === '') {
          rec.valid = false; rec.errorMsg = `edit ${editType} requires a value`; lines.push(rec); continue;
        }
        const res = resolveConstByKind(target.kind, newExpr, { numericEnv, colorEnv, boolEnv, functionEnv });
        if (!res.ok) {
          rec.valid = false;
          rec.errorMsg =
            target.kind === 'color'   ? `unknown color '${newExpr}'` :
            target.kind === 'boolean' ? `invalid bool value '${newExpr}'` :
                                         `invalid expression '${newExpr}'`;
          lines.push(rec); continue;
        }
        // A declared domain is locked forever (edit can never change it,
        // since nothing here ever touches target.domain) but every write
        // to the *value* — this one included — still has to respect it.
        if (target.domain && !target.domain.has(res.value)) {
          rec.valid = false;
          rec.errorMsg = `${res.value} is outside '${targetName}'s declared domain`;
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
        fieldsRes = resolveEditFields('face', tok.attrs, { numericEnv, colorEnv, boolEnv, functionEnv });
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
        fieldsRes = resolveEditFields(editType, tok.attrs, { numericEnv, colorEnv, boolEnv, functionEnv });
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
            const res = evalGuardedExpr(exprText, { numericEnv, functionEnv, boolEnv });
            if (!res.ok || !Number.isFinite(res.value)) {
              coordErr = res.errorMsg ?? `invalid ${axis} expression '${exprText}'`;
              break;
            }
            coordEdits[axis] = { expr: exprText, value: res.value };
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

    // `rename TYPE OLD_NAME: NEW_NAME` (NOTES16.md) — a sibling of `edit`
    // in shape (same target-must-exist-via-an-earlier-line requirement,
    // which falls out for free from byName only ever containing what's
    // already been staged by this point in the order-dependent walk; same
    // kind-mismatch check for number/color/bool, which share one byName
    // map/namespace) but covers all six renameable kinds, including
    // curve/function, which `edit` doesn't support at all yet — renaming
    // one is exactly as well-defined as any other kind, with no
    // attribute-editing machinery needed. Absorbed by Sort once applied,
    // same as `edit` — nothing of its own left to re-emit once every
    // affected object's own line already reflects the new name.
    const renameMatch = trimmed.match(CODE_RENAME_RE);
    if (renameMatch) {
      const [, renameType, nameRaw, newNameRaw] = renameMatch;
      rec.kind = 'rename';
      const targetName = nameRaw.trim();
      if (targetName === '') {
        rec.valid = false; rec.errorMsg = 'rename requires an object name'; lines.push(rec); continue;
      }
      const byName =
        renameType === 'vertex'   ? vertexByName :
        renameType === 'segment'  ? segmentByName :
        renameType === 'face'     ? faceByName :
        renameType === 'curve'    ? curveByName :
        renameType === 'function' ? functionByName :
                                     constByName;
      const target = byName.get(targetName);
      if (!target) {
        rec.valid = false; rec.errorMsg = `unknown ${renameType} '${targetName}'`; lines.push(rec); continue;
      }
      if (renameType === 'number' || renameType === 'color' || renameType === 'bool') {
        const renameKind = renameType === 'bool' ? 'boolean' : renameType;
        if (target.kind !== renameKind) {
          rec.valid = false;
          rec.errorMsg = `'${targetName}' is a ${target.kind === 'boolean' ? 'bool' : target.kind}, not a ${renameType}`;
          lines.push(rec); continue;
        }
      }
      const newName = newNameRaw.trim();
      if (newName === '') {
        rec.valid = false; rec.errorMsg = 'rename requires a new name'; lines.push(rec); continue;
      }
      // Same name -> harmless no-op, matching the control panel's own
      // name-input fields (a rename to the current name already does
      // nothing there, silently, not an error).
      if (newName !== targetName) {
        if (!CODE_IDENT_RE.test(newName)) {
          rec.valid = false; rec.errorMsg = `invalid name '${newName}'`; lines.push(rec); continue;
        }
        if (newName === 'true' || newName === 'false' || newName === 'otherwise') {
          rec.valid = false; rec.errorMsg = `'${newName}' is reserved and cannot be used as a name`; lines.push(rec); continue;
        }
        if (isNameTakenIn(newName, stagedVertices, stagedConstants, stagedFaces, stagedSegments, null, null, null, null, stagedCurves, null, stagedFunctions)) {
          rec.valid = false; rec.errorMsg = `name '${newName}' already used`; lines.push(rec); continue;
        }
        renameStagedObjectEverywhere(renameType, targetName, newName, {
          stagedVertices, stagedConstants, stagedSegments, stagedFaces, stagedCurves, stagedFunctions, currentSet,
        });
        target.name = newName;
        byName.delete(targetName);
        byName.set(newName, target);
      }
      rec.parsed = { renameType, targetName, newName };
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
        field === 'color'   ? resolveColorAttr(rawText, colorEnv, numericEnv, functionEnv, boolEnv) :
        (field === 'r' || field === 'width') ? resolveNumAttr(rawText, numericEnv, functionEnv, boolEnv) :
        field === 'naming'  ? { ok: CODE_IDENT_RE.test(rawText) } :
        field === 'counter' ? { ok: /^\d+$/.test(rawText) && Number.isSafeInteger(parseInt(rawText, 10)) } :
        resolveBoolAttr(rawText, boolEnv, numericEnv, functionEnv);
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

    const setNamingMatch = trimmed.match(CODE_SET_NAMING_RE);
    if (setNamingMatch) {
      const [, prefix, fieldTok] = setNamingMatch;
      rec.kind = 'setNaming';
      if (!CODE_IDENT_RE.test(prefix)) {
        rec.valid = false;
        rec.errorMsg = `invalid naming scheme '${prefix}'`;
        lines.push(rec);
        continue;
      }
      // Only `counter=` is meaningful on a naming scheme addressed directly
      // like this — it has no other properties (no color, no visibility,
      // ...) the way an object type does.
      const tok = tokenizeAttrs(fieldTok.trim(), ['counter']);
      const attrKeys = tok.error ? [] : Object.keys(tok.attrs);
      if (tok.error || tok.positional.length > 0 || attrKeys.length !== 1) {
        rec.valid = false;
        rec.errorMsg = tok.error || 'expected counter=value';
        lines.push(rec);
        continue;
      }
      const rawText = tok.attrs.counter;
      if (!(/^\d+$/.test(rawText) && Number.isSafeInteger(parseInt(rawText, 10)))) {
        rec.valid = false;
        rec.errorMsg = `invalid counter value '${rawText}'`;
        lines.push(rec);
        continue;
      }
      // Applied immediately, same as `set TYPE: counter=N` above — seeds
      // parseNameCounters for this prefix directly, with no indirection
      // through any type's current naming= at all.
      parseNameCounters[prefix] = parseInt(rawText, 10);
      rec.parsed = { prefix, field: 'counter', value: rawText };
      lines.push(rec);
      continue;
    }

    // "new" is optional, purely-cosmetic sugar on any creation line ("new
    // number c: 5", "new vertex P0: ...") — stripped here before
    // matching, and never re-emitted by the canonical formatters (see
    // formatConstLine/formatVertexLine/etc.), so it never round-trips
    // through Sort/Save even when the user typed it.
    const objLine  = trimmed.replace(/^new\b\s*/, '');
    const objMatch = objLine.match(CODE_OBJECT_RE);
    if (!objMatch) {
      rec.kind = 'unrecognized';
      rec.valid = false;
      rec.errorMsg = trimmed.includes(':')
        ? 'unknown object type (expected number/color/bool/vertex/segment/face)'
        : "missing ':' — expected 'keyword: ...'";
      lines.push(rec);
      continue;
    }

    const [, keyword, nameRaw, restRaw] = objMatch;
    const name = nameRaw.trim();
    const rest = restRaw.trim();

    if (keyword === 'slider' || keyword === 'domain') {
      rec.kind = 'unsupported';
      rec.valid = false;
      rec.errorMsg = `${keyword} objects are not yet supported`;
      rec.targetSection = (keyword === 'domain') ? 'functions' : null;
      lines.push(rec);
      continue;
    }

    // number/bool/function are all fully resolved already, up front, by
    // resolveConstantsAndFunctions — this just looks up that result and
    // stages it. See that function's own comment for why: any of the
    // three can reference each other in any order, so resolving them one
    // line at a time in this walk (as color below still does) can't work.
    if (keyword === 'number' || keyword === 'bool' || keyword === 'function') {
      rec.kind = keyword === 'function' ? 'function' : 'const';
      rec.targetSection = keyword === 'function' ? 'functions' : 'constants';
      const res = constFns.byLineIdx.get(lineIdx);
      if (!res.ok) { rec.valid = false; rec.errorMsg = res.errorMsg; lines.push(rec); continue; }
      if (isNameTakenIn(res.name, stagedVertices, stagedConstants, stagedFaces, stagedSegments, null, null, null, null, stagedCurves, null, stagedFunctions)) {
        rec.valid = false; rec.errorMsg = `name '${res.name}' already used`; lines.push(rec); continue;
      }
      if (keyword === 'function') {
        const obj = { name: res.name, params: res.params, bodyExpr: res.bodyExpr, bodyAst: res.bodyAst };
        stagedFunctions.push(obj);
        functionByName.set(res.name, obj);
        rec.parsed = obj;
      } else {
        const kind = keyword === 'bool' ? 'boolean' : 'number';
        const obj = { name: res.name, expr: rest, value: res.value, kind, domain: res.domain ?? null };
        stagedConstants.push(obj);
        constByName.set(res.name, obj);
        rec.parsed = obj;
      }
      lines.push(rec);
      continue;
    }

    if (keyword === 'color') {
      rec.kind = 'const';
      rec.targetSection = 'constants';
      const res = constFns.byLineIdx.get(lineIdx);
      if (!res.ok) { rec.valid = false; rec.errorMsg = res.errorMsg; lines.push(rec); continue; }
      const finalName = res.name;
      if (isNameTakenIn(finalName, stagedVertices, stagedConstants, stagedFaces, stagedSegments, null, null, null, null, stagedCurves, null, stagedFunctions)) {
        rec.valid = false; rec.errorMsg = `name '${finalName}' already used`; lines.push(rec); continue;
      }

      const valRes = resolveConstByKind('color', res.rest, { numericEnv, colorEnv, boolEnv, functionEnv });
      if (!valRes.ok) {
        rec.valid = false;
        rec.errorMsg = `unknown color '${res.rest}'`;
        lines.push(rec); continue;
      }
      const value = valRes.value;

      const obj = { name: finalName, expr: res.rest, value, kind: 'color' };
      colorEnv[finalName] = value;
      stagedConstants.push(obj);
      constByName.set(finalName, obj);
      rec.parsed = obj;
      lines.push(rec);
      continue;
    }

    if (keyword === 'vertex') {
      rec.kind = 'vertex';
      rec.targetSection = 'vertices';

      // Whole-line guard: `vertex NAME: cond{x y z},otherwise{...}` (or a
      // guarded named form) — the one place the *relaxed* totality rule
      // applies (see splitGuardedObjectLine's own comment): if no branch
      // matches and there's no otherwise, the vertex simply isn't
      // created at all, not an error. Deliberately checked *before* any
      // name resolution below — if nothing gets created, nothing should
      // claim the name or advance the auto-name counter either (no
      // reservation for an object that was never made).
      let effectiveRest = rest;
      const guarded = splitGuardedObjectLine(rest);
      if (guarded) {
        if (!guarded.ok) { rec.valid = false; rec.errorMsg = guarded.error; lines.push(rec); continue; }
        let matched = null;
        for (const term of guarded.terms) {
          if (term.isOtherwise) { matched = term; break; }
          const condAst = parseExprAst(term.condText);
          if (condAst.ok && evalAst(condAst.ast, { numericEnv, boolEnv, functionEnv }) === true) { matched = term; break; }
        }
        if (!matched) {
          rec.valid = true;
          rec.parsed = null;
          lines.push(rec);
          continue;
        }
        effectiveRest = matched.payloadText;
      }

      const tok = tokenizeAttrs(effectiveRest, ['color', 'r', 'visible', 'label', 'x', 'y', 'z']);
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
          n => isNameTakenIn(n, stagedVertices, stagedConstants, stagedFaces, stagedSegments, null, null, null, null, stagedCurves, null, stagedFunctions));
      } else if (!CODE_IDENT_RE.test(finalName)) {
        rec.valid = false; rec.errorMsg = `invalid vertex name '${finalName}'`; lines.push(rec); continue;
      } else if (isNameTakenIn(finalName, stagedVertices, stagedConstants, stagedFaces, stagedSegments, null, null, null, null, stagedCurves, null, stagedFunctions)) {
        rec.valid = false; rec.errorMsg = `name '${finalName}' already used`; lines.push(rec); continue;
      }
      const coordResults = coordExprs.map(t => evalGuardedExpr(t, { numericEnv, functionEnv, boolEnv }));
      const badCoord = coordResults.find(r => !r.ok || !Number.isFinite(r.value));
      if (badCoord) {
        rec.valid = false; rec.errorMsg = badCoord.errorMsg ?? 'invalid coordinate expression'; lines.push(rec); continue;
      }
      const coords = coordResults.map(r => r.value);

      const attrRes = resolveGoverningAttrs('vertex', tok.attrs, currentSet.vertex, { numericEnv, colorEnv, boolEnv, functionEnv });
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

      // Whole-line guard, same mechanism/granularity as vertex above (see
      // its own comment) — the guard applies to the *entire* payload (the
      // whole vertex list plus attrs), never a single list entry; a face's
      // vertex-list guard granularity was an explicit open question until
      // this line was actually reached (NOTES13's own note), resolved here
      // by extending the exact same "atomic or whole, never a pair" rule
      // vertex already established, not inventing a separate finer-grained
      // per-entry mechanism.
      let effectiveRest = rest;
      const guarded = splitGuardedObjectLine(rest);
      if (guarded) {
        if (!guarded.ok) { rec.valid = false; rec.errorMsg = guarded.error; lines.push(rec); continue; }
        let matched = null;
        for (const term of guarded.terms) {
          if (term.isOtherwise) { matched = term; break; }
          const condAst = parseExprAst(term.condText);
          if (condAst.ok && evalAst(condAst.ast, { numericEnv, boolEnv, functionEnv }) === true) { matched = term; break; }
        }
        if (!matched) {
          rec.valid = true;
          rec.parsed = null;
          lines.push(rec);
          continue;
        }
        effectiveRest = matched.payloadText;
      }

      const tok = tokenizeAttrs(effectiveRest, ['color', 'visible']);
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
          n => isNameTakenIn(n, stagedVertices, stagedConstants, stagedFaces, stagedSegments, null, null, null, null, stagedCurves, null, stagedFunctions));
      } else if (!CODE_IDENT_RE.test(finalName)) {
        rec.valid = false; rec.errorMsg = `invalid face name '${finalName}'`; lines.push(rec); continue;
      } else if (isNameTakenIn(finalName, stagedVertices, stagedConstants, stagedFaces, stagedSegments, null, null, null, null, stagedCurves, null, stagedFunctions)) {
        rec.valid = false; rec.errorMsg = `name '${finalName}' already used`; lines.push(rec); continue;
      }

      const attrRes = resolveGoverningAttrs('face', tok.attrs, currentSet.face, { numericEnv, colorEnv, boolEnv, functionEnv });
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

    if (keyword === 'curve') {
      rec.kind = 'curve';
      rec.targetSection = 'curves';

      // Whole-line guard, same mechanism as vertex/face above — applies to
      // the entire payload (all four `;`-separated clauses at once, plus
      // trailing attrs), never a single clause.
      let effectiveRest = rest;
      const guarded = splitGuardedObjectLine(rest);
      if (guarded) {
        if (!guarded.ok) { rec.valid = false; rec.errorMsg = guarded.error; lines.push(rec); continue; }
        let matched = null;
        for (const term of guarded.terms) {
          if (term.isOtherwise) { matched = term; break; }
          const condAst = parseExprAst(term.condText);
          if (condAst.ok && evalAst(condAst.ast, { numericEnv, boolEnv, functionEnv }) === true) { matched = term; break; }
        }
        if (!matched) {
          rec.valid = true;
          rec.parsed = null;
          lines.push(rec);
          continue;
        }
        effectiveRest = matched.payloadText;
      }

      // Semicolons are the clause separator here, not whitespace inside
      // tokenizeAttrs (which has no idea `;` exists at all) — this DSL's
      // only prior semicolon precedent (face's `edit` verb) strips them to
      // spaces before its own tokenizeAttrs call; curve's clauses have a
      // different grammatical shape per position (x=/y=/z=/domain), so
      // splitting on `;` up front and parsing each piece by position is
      // more direct than trying to force everything through one call.
      const clauses = effectiveRest.split(';').map(s => s.trim()).filter(s => s !== '');
      if (clauses.length !== 4) {
        rec.valid = false;
        rec.errorMsg = `expected 4 clauses (x=... ; y=... ; z=... ; PARAM in [a,b]), found ${clauses.length}`;
        lines.push(rec); continue;
      }
      const [xClause, yClause, zClause, domainClause] = clauses;
      if (!xClause.startsWith('x=')) { rec.valid = false; rec.errorMsg = `expected 'x=...' as the first clause`; lines.push(rec); continue; }
      if (!yClause.startsWith('y=')) { rec.valid = false; rec.errorMsg = `expected 'y=...' as the second clause`; lines.push(rec); continue; }
      if (!zClause.startsWith('z=')) { rec.valid = false; rec.errorMsg = `expected 'z=...' as the third clause`; lines.push(rec); continue; }
      const xExpr = xClause.slice(2).trim();
      const yExpr = yClause.slice(2).trim();
      const zExpr = zClause.slice(2).trim();
      if (!xExpr || !yExpr || !zExpr) {
        rec.valid = false; rec.errorMsg = 'x=/y=/z= clauses cannot be empty'; lines.push(rec); continue;
      }

      // Domain clause: "PARAM in [lo, hi] [U [lo2, hi2] ...]", optionally
      // followed by trailing color=/visible= attrs — a disjoint union of
      // one or more intervals (see parseDomainIntervals). PARAM is
      // inferred here, never hardcoded to "t" — any valid identifier names
      // the bound variable.
      const inMatch = domainClause.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s+in\s+(.*)$/);
      if (!inMatch) {
        rec.valid = false;
        rec.errorMsg = `expected 'PARAM in [lo, hi]' as the fourth clause`;
        lines.push(rec); continue;
      }
      const [, param, afterIn] = inMatch;
      if (!CODE_IDENT_RE.test(param)) {
        rec.valid = false; rec.errorMsg = `invalid parameter name '${param}'`; lines.push(rec); continue;
      }
      const domainParse = parseDomainIntervals(afterIn);
      if (domainParse.error) {
        rec.valid = false; rec.errorMsg = domainParse.error; lines.push(rec); continue;
      }

      const tok = tokenizeAttrs(domainParse.attrTail.trim(), ['color', 'visible']);
      if (tok.error) { rec.valid = false; rec.errorMsg = tok.error; lines.push(rec); continue; }
      if (tok.positional.length > 0) {
        rec.valid = false; rec.errorMsg = `unexpected '${tok.positional[0]}' after the domain clause`; lines.push(rec); continue;
      }

      const domainIntervals = [];
      let domainErr = null;
      for (const { loExpr, hiExpr } of domainParse.intervals) {
        const lo = evalExpr(loExpr, numericEnv, functionEnv, boolEnv);
        const hi = evalExpr(hiExpr, numericEnv, functionEnv, boolEnv);
        if (!Number.isFinite(lo) || !Number.isFinite(hi)) { domainErr = 'invalid domain bound expression'; break; }
        if (lo >= hi) { domainErr = 'domain lower bound must be less than upper bound'; break; }
        domainIntervals.push({ loExpr, hiExpr, lo, hi });
      }
      if (domainErr) { rec.valid = false; rec.errorMsg = domainErr; lines.push(rec); continue; }

      let finalName = name;
      if (finalName === '') {
        finalName = advanceAutoName(parseNameCounters, currentSet.curve.naming ?? AUTO_NAME_PREFIX.curve,
          n => isNameTakenIn(n, stagedVertices, stagedConstants, stagedFaces, stagedSegments, null, null, null, null, stagedCurves, null, stagedFunctions));
      } else if (!CODE_IDENT_RE.test(finalName)) {
        rec.valid = false; rec.errorMsg = `invalid curve name '${finalName}'`; lines.push(rec); continue;
      } else if (isNameTakenIn(finalName, stagedVertices, stagedConstants, stagedFaces, stagedSegments, null, null, null, null, stagedCurves, null, stagedFunctions)) {
        rec.valid = false; rec.errorMsg = `name '${finalName}' already used`; lines.push(rec); continue;
      }

      // Sanity-check x=/y=/z= at the first interval's own lower bound
      // (with the bound parameter present) so a typo'd/unknown name
      // surfaces as a clear parse error immediately, rather than silently
      // producing an empty/NaN-riddled tessellation at render time.
      const testEnv = { ...numericEnv, [param]: domainIntervals[0].lo };
      const testX = evalExpr(xExpr, testEnv, functionEnv);
      const testY = evalExpr(yExpr, testEnv, functionEnv);
      const testZ = evalExpr(zExpr, testEnv, functionEnv);
      if (!Number.isFinite(testX) || !Number.isFinite(testY) || !Number.isFinite(testZ)) {
        rec.valid = false; rec.errorMsg = 'invalid x=/y=/z= expression'; lines.push(rec); continue;
      }

      const attrRes = resolveGoverningAttrs('curve', tok.attrs, currentSet.curve, { numericEnv, colorEnv, boolEnv, functionEnv });
      if (!attrRes.ok) { rec.valid = false; rec.errorMsg = attrRes.errorMsg; lines.push(rec); continue; }

      const obj = {
        name: finalName,
        xExpr, yExpr, zExpr, param,
        domainIntervals,
        points: tessellateCurve(xExpr, yExpr, zExpr, param, domainIntervals, numericEnv, functionEnv),
        ...attrRes.fields,
      };
      stagedCurves.push(obj);
      curveByName.set(finalName, obj);
      rec.parsed = obj;
      lines.push(rec);
      continue;
    }

    // segment — named, same as vertex/face, joining the same shared name
    // namespace (see isNameTakenIn's segList param).
    rec.kind = 'segment';
    rec.targetSection = 'segments';

    // Whole-line guard, same mechanism as vertex/face/curve above.
    let effectiveRest = rest;
    {
      const guarded = splitGuardedObjectLine(rest);
      if (guarded) {
        if (!guarded.ok) { rec.valid = false; rec.errorMsg = guarded.error; lines.push(rec); continue; }
        let matched = null;
        for (const term of guarded.terms) {
          if (term.isOtherwise) { matched = term; break; }
          const condAst = parseExprAst(term.condText);
          if (condAst.ok && evalAst(condAst.ast, { numericEnv, boolEnv, functionEnv }) === true) { matched = term; break; }
        }
        if (!matched) {
          rec.valid = true;
          rec.parsed = null;
          lines.push(rec);
          continue;
        }
        effectiveRest = matched.payloadText;
      }
    }

    const tok = tokenizeAttrs(effectiveRest, ['color', 'width', 'visible']);
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
        n => isNameTakenIn(n, stagedVertices, stagedConstants, stagedFaces, stagedSegments, null, null, null, null, stagedCurves, null, stagedFunctions));
    } else if (!CODE_IDENT_RE.test(finalName)) {
      rec.valid = false; rec.errorMsg = `invalid segment name '${finalName}'`; lines.push(rec); continue;
    } else if (isNameTakenIn(finalName, stagedVertices, stagedConstants, stagedFaces, stagedSegments, null, null, null, null, stagedCurves, null, stagedFunctions)) {
      rec.valid = false; rec.errorMsg = `name '${finalName}' already used`; lines.push(rec); continue;
    }

    const attrRes = resolveGoverningAttrs('segment', tok.attrs, currentSet.segment, { numericEnv, colorEnv, boolEnv, functionEnv });
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

  return { lines, stagedConstants, stagedFunctions, stagedVertices, stagedSegments, stagedFaces, stagedCurves, finalSet: currentSet, finalView: currentView, nameCounters: parseNameCounters };
}

function formatCoordExpr(v, i) {
  const expr = v.exprs?.[i];
  if (expr) return expr.replace(/\s+/g, '');
  return String(+v.coords[i].toFixed(6));
}

function formatConstLine(c) {
  const kindTok = c.kind === 'boolean' ? 'bool' : c.kind; // 'number' | 'color' | 'bool'
  // A declared domain always re-emits as a flat, sorted {v1,v2,...} set
  // literal — never the original \range/U sugar the user may have typed
  // — same "canonicalize, don't preserve input sugar" convention every
  // other shortcut form in this grammar already has (`new`, `naming=`
  // shortcuts, etc.). This is what keeps a domain-restricted constant's
  // restriction alive across any reconstruction of the text (Sort, Save,
  // and — critically — every interpreter submission, which reconstructs
  // the whole file via serializeState() before appending the new line;
  // without this, the domain silently vanished on the very next submission).
  const domainClause = c.domain ? ` in {${[...c.domain].sort((a, b) => a - b).join(',')}}` : '';
  return `${kindTok} ${c.name}${domainClause}: ${c.expr}`;
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

function formatFunctionLine(fn) {
  return `function ${fn.name}: ${fn.params.join(', ')} -> ${fn.bodyExpr}`;
}

function formatCurveLine(c) {
  const colorExpr   = c.colorExpr   ?? c.color ?? DEFAULT_COLOR;
  const visibleExpr = c.visibleExpr ?? String(c.visible !== false);
  const domainStr = c.domainIntervals.map(iv => `[${iv.loExpr}, ${iv.hiExpr}]`).join(' U ');
  return `curve ${c.name}: x=${c.xExpr} ; y=${c.yExpr} ; z=${c.zExpr} ; ${c.param} in ${domainStr}  ${formatFieldToken('color', colorExpr)}  ${formatFieldToken('visible', visibleExpr)}`;
}

function formatSetLine(parsed) {
  return `set ${parsed.setType}: ${formatFieldToken(parsed.field, parsed.value)}`;
}

// Reads the current live view-setting globals into the same shape a parse's
// finalView produces — this is what a view-setting field falls back to when
// a given parse didn't mention it (e.g. re-serializing straight from live
// state when the code editor opens, or a hand-edited file missing a line).
// There is no built-in-constant-style default for a camera/display setting
// the way BUILTIN_SET_DEFAULTS supplies one for a fresh vertex — "whatever
// it currently is live" is the only sensible fallback.
function currentViewSettingsSnapshot() {
  // 'pointer' always round-trips as z (the polynomial-mode/Mode-A value),
  // regardless of which mode is actually active — dissolves two problems at
  // once (see applyViewSettings): there's no unit-disc constraint to
  // validate against (zToC always lands inside the open disc, for any
  // finite z), and switching `mode` never needs to convert `pointer` at
  // all, since z doesn't depend on which mode is displaying it. controlPt
  // itself is only ever the *live* representation (C in compact mode, z in
  // polynomial mode — see getProjectionState) — cToZ here is what
  // normalizes that back to the one DSL-facing convention.
  const z = displayMode === 'B' ? cToZ(controlPt) : controlPt;
  return {
    darkMode:      darkMode,
    mode:          displayMode === 'A' ? 'polynomial' : 'compact',
    anchor:        paramMode === 'diag' ? 'diagonal' : 'zaxis',
    pointer:       { re: z.re, im: z.im },
    showPointer:   showPointer,
    showAxes:      showAxes,
    scale:         userScale,
    perspective:   perspectiveOn,
    invF:          perspectiveP,
    scaleNodes:    perspScaleNodes,
    scaleSegments: perspScaleSegs,
    clipBehind:    clipBehind,
  };
}

function formatViewSettingValue(token, value) {
  if (token === 'pointer') return `${+value.re.toFixed(6)}, ${+value.im.toFixed(6)}`;
  if (typeof value === 'number') return String(+value.toFixed(6));
  return String(value);
}

// Always fully populated (every one of the 12 fields), same "archive, not a
// diff" convention as buildSetBlock — `finalView`'s fields (whatever a parse
// actually saw) take priority, current live state fills in anything the
// parse never mentioned.
function buildViewSettingsBlock(finalView) {
  const live = currentViewSettingsSnapshot();
  return VIEW_SETTINGS_FIELDS.map(({ token }) => {
    const value = (finalView && token in finalView) ? finalView[token] : live[token];
    return `${token}: ${formatViewSettingValue(token, value)}`;
  });
}

// Shared by Sort's rebuild and Save's re-canonicalization: valid recognized
// lines are rewritten to their canonical (now fully explicit) form; every
// other line (blank, header, invalid, unsupported, unrecognized) keeps its
// raw text untouched — this is what keeps an unfixed error line visible
// after Save instead of disappearing (no cascade-delete).
function formatLineForOutput(rec) {
  if (!rec.valid || !rec.parsed) return rec.raw;
  if (rec.kind === 'const')    return formatConstLine(rec.parsed);
  if (rec.kind === 'function') return formatFunctionLine(rec.parsed);
  if (rec.kind === 'vertex')   return formatVertexLine(rec.parsed);
  if (rec.kind === 'segment')  return formatSegmentLine({ name: rec.parsed.v1Name }, { name: rec.parsed.v2Name }, rec.parsed);
  if (rec.kind === 'face')     return formatFaceLine(rec.parsed.vertexNames.map(n => ({ name: n })), rec.parsed);
  if (rec.kind === 'curve')    return formatCurveLine(rec.parsed);
  if (rec.kind === 'set')      return formatSetLine(rec.parsed);
  return rec.raw;
}

function serializeState(vertsArr, constsArr, segsArr, facesArr, curvesArr, functionsArr) {
  const out = [];
  // VIEW SETTINGS is now a real section (see buildViewSettingsBlock) —
  // always emitted from current live state, since view settings have no
  // committed-object array of their own to read from. POLYTOPES stays a
  // purely decorative banner — no OBJECT_TYPES entry, never classified by
  // classifyHeaderSection, never touched by Sort's relocation logic — has
  // to be emitted explicitly here (rather than relying on Sort to preserve
  // it) because this function rebuilds the textarea from scratch from live
  // state, not from whatever text happened to be typed before.
  emitSection(out, 'eq', 'VIEW SETTINGS', buildViewSettingsBlock({}));
  emitSection(out, 'eq',   'AUXILIARY CONSTANTS', constsArr.map(formatConstLine));
  out.push(makeHeaderLine('eq', 'POLYTOPES'));
  out.push('');
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
  // Functions/domain moved here (after FACES, before CURVES) to match the
  // control-panel submenu order (View / Auxiliary / Polytopes / Curves /
  // Functions) — was previously emitted right after AUXILIARY CONSTANTS.
  const functionLines = (functionsArr ?? []).map(formatFunctionLine);
  emitSection(out, 'eq',   'AUXILIARY FUNCTIONS', functionLines);
  const curveLines = (curvesArr ?? []).map(formatCurveLine);
  emitSection(out, 'dash', 'CURVES', buildSetBlock('curve', lastSetCurve), curveLines);
  out.push(makeDividerLine());
  out.push('');
  return out.join('\n');
}

// Rebuilds the file from scratch: canonical sections (each followed by
// exactly one blank line when it has content, none of the growing-gap effect
// a naive splice-in-place produces), a divider, then the scratch area. Every
// *valid* recognized number/color/bool/vertex/segment/face line always
// lands in its home section regardless of where it started (which is what
// empties the scratch area of anything usable), and gets reformatted to
// its fully-explicit canonical form in the process. Invalid/unrecognized lines never move — they stay within
// whichever section (or the scratch area) they were structurally sitting in,
// raw text untouched. `set` lines are also never moved (their effect is
// purely positional — which object lines follow them — so relocating one
// would silently change what it governs) but are still reformatted in place.
// Returns { text, nameCounters } rather than a bare string — nameCounters is
// this call's own parse's result, needed by codeSave() below because a valid
// `counter=` line is dropped from `text` right here (absorbed, one-time,
// same as `edit` — see the loop below), so it's already gone from the text
// codeSave() goes on to re-parse for the actual commit. Without threading
// this out, an explicit counter reset with no auto-named object to "carry"
// it forward via a baked-in literal name (see NOTES20-era discussion) would
// silently vanish before syncNameCountersFromParse ever saw it, regardless of
// that function's own fix — a Save with no other change touching the prefix
// simply re-seeds from the live value, since nothing in the re-parsed text
// mentions the prefix at all any more.
function sortCodeText(text) {
  const { lines, finalSet, finalView, nameCounters: parsedCounters } = parseCodeText(text);

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
    // `set naming PREFIX: counter=N` — same reasoning as `counter=` just
    // above, one line up: a one-time imperative, already applied at parse
    // time, nothing left to re-emit once absorbed.
    if (rec.kind === 'setNaming' && rec.valid) return;
    // A valid `edit` line's effect is already baked into its target's own
    // line (Object.assign in parseCodeText, at parse time) — it never had
    // anything of its own to re-emit, unlike `set` there's no consolidated
    // block to build either. It just vanishes once absorbed.
    if (rec.kind === 'edit' && rec.valid) return;
    // A valid `rename` line, same reasoning as `edit` just above — every
    // affected object's own line already reflects the new name by the
    // time Sort/serialize format it.
    if (rec.kind === 'rename' && rec.valid) return;
    // A valid view-setting line is consolidated exactly like `set` (one
    // canonical block, built below from `finalView`) — dropped regardless
    // of where it was typed. An invalid one falls through to homeOf(i)
    // below, same as any other invalid line.
    if (rec.kind === 'view' && rec.valid) return;
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
    } else if (key === 'curves') {
      emitSection(out, def.style, def.title, buildSetBlock('curve', finalSet.curve), objectLines);
    } else if (key === 'view') {
      // objectLines here holds only INVALID view-setting lines that
      // couldn't be homed anywhere else (valid ones were dropped above,
      // already folded into the canonical block) — printed after it,
      // unchanged, so the user can still see and fix them.
      emitSection(out, def.style, def.title, buildViewSettingsBlock(finalView), objectLines);
    } else {
      emitSection(out, def.style, def.title, objectLines);
    }
  }
  out.push(makeDividerLine());
  out.push('');
  for (const rec of scratchKept) out.push(formatLineForOutput(rec));

  return { text: out.join('\n'), nameCounters: parsedCounters };
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

// ─── Face BSP (object-space depth ordering) ────────────────────────────────────
//
// Replaced the old per-frame, post-projection pairwise depth comparison
// (computeFaceDrawOrder and its dependencies — removed entirely, see
// NOTES10 for the full design arc) with a real binary space partition
// built from faces' true 3D planes — the tree structure itself never
// depends on the current view or on perspective; only per-frame
// *traversal* does (see NOTES10 for the full reasoning, including why a
// finite perspective eye position — not just a view direction — is needed
// to traverse correctly, and the F≈5 near-degenerate case that turned out,
// on rigorous verification, not to actually need a special-case backstop).
//
// This section holds the geometry primitives (plane construction, point/
// polygon classification, half-space clipping) and the tree build itself;
// the traversal functions live in their own section further down, and
// drawFaces (in the rendering section) is what actually calls all of this.

// Constructs the true 3D plane a planar face lies in, from any 3 of its
// vertices (tries consecutive triples until a non-collinear one is found).
// Returns { normal (unit length), d } such that normal·p + d = 0 exactly
// on the plane and > 0 on the side `normal` points toward — or null if
// every triple was degenerate (all vertices collinear; shouldn't be
// reachable given face creation already requires >= 3 vertices, but not
// assumed here).
// Newell's method: a polygon's (unnormalized) normal as a sum over every
// edge, rather than a cross product anchored at one specific vertex pair.
// Used by both planeFromPoints (below) and polygonArea3D (its magnitude is
// exactly twice the polygon's real area) — sharing this one computation
// keeps "what counts as this polygon's plane/area" a single definition.
// Chosen over the old points[0]/points[1]-anchored cross product
// specifically for robustness: a BSP fragment that's been clipped several
// times over routinely ends up with two vertices coincident to float
// precision (the clip's own interpolated crossing point landing on top of
// an existing vertex — the routine case for a fragment sharing an edge
// with the splitter it's being clipped against, not a rare one). Anchoring
// on a single pair meant one bad pair poisoned every candidate third point;
// summing over every edge means one near-zero edge contributes ~nothing,
// so the fragment's real (possibly large) area still comes through.
function polygonNormalRaw(points) {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return [nx, ny, nz];
}

function polygonArea3D(points) {
  const [nx, ny, nz] = polygonNormalRaw(points);
  return 0.5 * Math.hypot(nx, ny, nz);
}

function planeFromPoints(points) {
  const [nx, ny, nz] = polygonNormalRaw(points);
  const len = Math.hypot(nx, ny, nz);
  if (len <= 1e-9) return null;
  const normal = [nx / len, ny / len, nz / len];
  // d anchored at the centroid, not any single vertex — same "don't trust
  // one possibly-noisy point" reasoning as the normal itself above.
  const c = points.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0])
    .map(v => v / points.length);
  return { normal, d: -dot3D(normal, c) };
}

function planeSignedDistance(plane, p) {
  return dot3D(plane.normal, p) + plane.d;
}

// Separates a real classification signal from float noise on a vertex
// that's exactly (up to precision) shared between two faces — the common
// case for adjacent polytope faces, not a rare edge case, so this has to
// be generous enough to treat a shared edge as "on the plane," not
// spuriously split it.
const BSP_PLANE_EPS = 1e-6;

function classifyPoint(plane, p, eps = BSP_PLANE_EPS) {
  const dist = planeSignedDistance(plane, p);
  if (dist > eps) return 'front';
  if (dist < -eps) return 'back';
  return 'on';
}

// Classifies a whole polygon (list of 3D points) against a plane:
// 'front' (every vertex front-or-on, at least one strictly front), 'back'
// (mirror image), 'coplanar' (every vertex within eps — e.g. the splitter
// face itself, or a genuinely coplanar different face), or 'straddling'
// (genuine vertices strictly on both sides — needs clipping).
function classifyPolygon(plane, points, eps = BSP_PLANE_EPS) {
  let hasFront = false, hasBack = false;
  for (const p of points) {
    const c = classifyPoint(plane, p, eps);
    if (c === 'front') hasFront = true;
    else if (c === 'back') hasBack = true;
  }
  if (hasFront && hasBack) return 'straddling';
  if (hasFront) return 'front';
  if (hasBack) return 'back';
  return 'coplanar';
}

// Coincidence tolerance for dropping a near-duplicate vertex right where a
// clip produces it — an order below BSP_PLANE_EPS (deliberately: this is
// "is this the same point," not "is this on the plane," a tighter
// question) but well above the ~1e-16 float noise a clip's own
// interpolated crossing point routinely lands within of an existing vertex
// when the cut is near-tangent (see planeFromPoints' own comment above —
// same root cause, addressed here at the source instead of downstream).
const VERTEX_DEDUP_EPS = 1e-9;

function pointsCoincide(a, b, eps = VERTEX_DEDUP_EPS) {
  return Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps && Math.abs(a[2] - b[2]) < eps;
}

// Sutherland–Hodgman: clips a planar polygon (3D points, but coplanar so
// the algorithm's 2D reasoning still applies edge-by-edge) to one side of
// a half-space — the front-or-on side if keepFront, back-or-on otherwise.
// Walks each edge in turn; a vertex on the kept side is emitted as-is, and
// any edge that crosses the plane contributes the exact intersection
// point via linear interpolation. Returns a new point list — empty if the
// whole polygon was clipped away, unchanged (up to floating point) if
// nothing crossed. The same primitive serves two roles once wired up:
// splitting a face against another face's plane (BSP build) and clipping
// a fragment against the current focal plane (fixing the existing whole-
// face-vanishes-behind-the-camera behavior in drawFaces as a byproduct —
// see NOTES10).
//
// Deduplicates as it emits (`pushUnique`, against the immediately-prior
// point and, at the end, against the wraparound closure back to the
// first) — a real, routine case, not a rare one: clipping a fragment that
// shares an edge with the splitter (the common case for adjacent faces in
// a mesh) makes the plane pass almost exactly through that edge, so the
// interpolated crossing point this loop computes can land within float
// noise of a vertex already emitted. Left undeduplicated, that near-
// duplicate pair fed straight into planeFromPoints and could poison a
// downstream node's own plane computation — see NOTES-N for the real,
// visible mis-layering this traced to on the trefoil-knot scene.
function clipPolygonToHalfSpace(points, plane, keepFront) {
  if (points.length === 0) return [];
  const side = p => {
    const d = planeSignedDistance(plane, p);
    return keepFront ? d : -d;
  };
  const out = [];
  const pushUnique = p => { if (out.length === 0 || !pointsCoincide(out[out.length - 1], p)) out.push(p); };
  for (let i = 0; i < points.length; i++) {
    const curr = points[i], next = points[(i + 1) % points.length];
    const sCurr = side(curr), sNext = side(next);
    const currIn = sCurr >= -BSP_PLANE_EPS, nextIn = sNext >= -BSP_PLANE_EPS;
    if (currIn) pushUnique(curr);
    if (currIn !== nextIn) {
      const t = sCurr / (sCurr - sNext);
      pushUnique([
        curr[0] + t * (next[0] - curr[0]),
        curr[1] + t * (next[1] - curr[1]),
        curr[2] + t * (next[2] - curr[2]),
      ]);
    }
  }
  if (out.length > 1 && pointsCoincide(out[0], out[out.length - 1])) out.pop();
  return out;
}

// A polygon whose real area is negligible relative to its own spatial
// extent — floating-point noise from a near-tangent clip (a real, non-zero
// vertex spread that's nonetheless collapsed flat), not a genuinely thin
// but intentional sliver. Compared against the polygon's own bounding-box
// diagonal squared (area scales as length², so this ratio is scale-
// invariant) rather than a flat absolute constant — a scene-wide constant
// would silently stop working if the scene's own coordinate scale changed
// (e.g. this app's own `s` constant), and would need re-tuning per scene;
// this doesn't. The threshold itself (1e-9) is deliberately generous:
// every genuinely-degenerate fragment found on the real trefoil-knot scene
// that motivated this measured a ratio around 1e-16, seven orders of
// magnitude below this cutoff.
const DEGENERATE_AREA_REL_EPS = 1e-9;

function isDegenerateFragment(points) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
    minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]);
  }
  const diag2 = (maxX - minX) ** 2 + (maxY - minY) ** 2 + (maxZ - minZ) ** 2;
  return polygonArea3D(points) < diag2 * DEGENERATE_AREA_REL_EPS;
}

// Splits one straddling fragment into its front and back pieces against
// `plane` — composes two clips (Sutherland-Hodgman only ever keeps one
// side per pass). A side collapsing to fewer than 3 points (a sliver
// clipped down to an edge or a point, possible right at a near-tangent
// crossing) is treated as nothing on that side, not a degenerate polygon —
// and so is one that kept 3+ points but is degenerate by area (the other
// shape a near-tangent clip's leftover sliver takes: a thin string running
// along the near-shared edge rather than collapsing to a single point).
// Dropping these outright, rather than letting them become real tree
// nodes, is what it means for them to be harmless: a fragment with
// negligible area renders negligible pixels regardless of where in the
// paint order it lands, so removing it can't change the visible picture —
// and it closes off the "a degenerate fragment gets used as a splitter and
// planeFromPoints has nothing to work with" failure mode at its root
// rather than papering over one symptom of it.
function splitFragment(fragment, plane) {
  const front = clipPolygonToHalfSpace(fragment.polygon, plane, true);
  const back  = clipPolygonToHalfSpace(fragment.polygon, plane, false);
  return {
    front: front.length >= 3 && !isDegenerateFragment(front) ? { polygon: front, sourceFace: fragment.sourceFace } : null,
    back:  back.length  >= 3 && !isDegenerateFragment(back)  ? { polygon: back,  sourceFace: fragment.sourceFace } : null,
  };
}

// Builds one initial fragment per face, in true 3D object-space
// coordinates, from whatever `facesArr` it's actually given — visibility
// filtering is the caller's job (drawFaces passes only visible-or-selected
// faces, see its own comment for why), not this function's. A face with
// any non-finite vertex coordinate (a broken expression) is skipped
// entirely — the post-projection path would already have discarded it
// downstream, same as today.
function buildFaceFragments(facesArr, vertsArr) {
  const fragments = [];
  for (const f of facesArr) {
    const vs = f.vertexIds.map(id => vertsArr.find(v => v.id === id));
    if (vs.some(v => !v)) continue;
    const polygon = vs.map(v => v.coords);
    if (polygon.some(p => !p.every(Number.isFinite))) continue;
    fragments.push({ polygon, sourceFace: f });
  }
  return fragments;
}

// Chooses which fragment to use as a node's splitter — minimizes the
// number of *actual* splits it would induce among the rest (the standard
// BSP-construction heuristic), not just "whichever's first." A naive
// always-pick-first choice looked fine on the small test scenes this was
// originally verified against, but produced severely over-fragmented
// trees on a real, complex scene (a 24-face trefoil-knot tube mesh — up
// to 7 fragments for a single face) — the excess splits are directly what
// caused visible seams between same-colored fragments (see NOTES10).
// Caps how many candidates get evaluated (`BSP_PIVOT_SAMPLE_CAP`) so this
// stays affordable at larger fragment counts, since the tree is rebuilt
// fresh every render call, not cached — a real BSP compiler would do the
// same kind of sampling for large inputs, not exhaustively search.
const BSP_PIVOT_SAMPLE_CAP = 24;

function chooseSplitterIndex(fragments) {
  const n = fragments.length;
  const sampleCount = Math.min(n, BSP_PIVOT_SAMPLE_CAP);
  let bestIdx = 0, bestSplits = Infinity;
  for (let c = 0; c < sampleCount; c++) {
    const plane = planeFromPoints(fragments[c].polygon);
    if (!plane) continue;
    let splits = 0;
    for (let i = 0; i < n; i++) {
      if (i === c) continue;
      if (classifyPolygon(plane, fragments[i].polygon) === 'straddling') splits++;
    }
    if (splits < bestSplits) {
      bestSplits = splits;
      bestIdx = c;
      if (splits === 0) break; // can't do better than zero induced splits
    }
  }
  return bestIdx;
}

// Recursively builds a BSP tree from a flat fragment list (see
// buildFaceFragments). Every fragment other than the chosen splitter is
// classified against its plane: cleanly in front or behind joins that
// side's list unsplit (the common, economical case for adjacent polytope
// faces — see NOTES10's square/tilted-rectangle example), genuinely
// straddling gets clipped into exactly two pieces, coplanar (including
// the splitter itself) joins this node's own bucket. Purely a function of
// object-space geometry — never touches the current view, perspective, or
// control point; see traverseFaceBsp for the per-frame, view-dependent
// part.
function buildFaceBsp(fragments) {
  if (fragments.length === 0) return null;
  const splitterIdx = chooseSplitterIndex(fragments);
  const splitter = fragments[splitterIdx];
  const rest = fragments.filter((_, i) => i !== splitterIdx);
  const plane = planeFromPoints(splitter.polygon);
  if (!plane) {
    // Degenerate splitter (collinear vertices) — shouldn't be reachable
    // for a validly-created face, but don't let a corrupted one crash the
    // tree: park it in an otherwise-planeless node and keep going.
    return { splitterFace: splitter.sourceFace, plane: null, coplanar: [splitter], front: null, back: buildFaceBsp(rest) };
  }
  const coplanar = [splitter];
  const front = [];
  const back = [];
  for (const frag of rest) {
    const kind = classifyPolygon(plane, frag.polygon);
    if (kind === 'front') front.push(frag);
    else if (kind === 'back') back.push(frag);
    else if (kind === 'coplanar') coplanar.push(frag);
    else {
      const { front: f, back: b } = splitFragment(frag, plane);
      if (f) front.push(f);
      if (b) back.push(b);
    }
  }
  return {
    splitterFace: splitter.sourceFace,
    plane,
    coplanar,
    front: buildFaceBsp(front),
    back: buildFaceBsp(back),
  };
}

// Not cached across frames — built fresh from drawFaces' own `facesArr`/
// `vertsArr` parameters every call (see drawFaces below). Originally tried
// caching this at reEvalObjects() time, matching every other resolved
// value's (vertex coords, curve tessellation) lifecycle — reverted after
// finding real staleness bugs that approach couldn't cover cleanly: the
// draw-tool's own face-creation path and the vertex/face delete buttons
// mutate `faces`/`vertices` without ever calling reEvalObjects(), and the
// code editor's live-preview mechanism (`previewOverride`) renders an
// entirely separate pair of arrays that reEvalObjects() never even sees
// (see NOTES10). Rebuilding fresh from whatever drawFaces was actually
// asked to render sidesteps every one of those at once, rather than
// chasing scattered call sites — genuinely cheap at this app's scale (a
// handful to a few dozen hand-authored faces), so trading the "build once
// per geometry change" optimization for guaranteed correctness here is a
// deliberate, considered choice, not an oversight.

// ─── Face BSP traversal (per-frame, view-dependent) ────────────────────────────
//
// The tree above is pure object-space geometry, built once. Traversal is
// the part that depends on the current view — walked fresh every frame,
// cheap (one plane-vs-eye test per node, no geometry work) — producing a
// back-to-front (farthest-first) list of fragments ready to paint.
//
// Handles both orthographic (F === Infinity) and perspective (finite F) in
// one walk — they differ only in what "which side of a node's splitting
// plane is nearer" is tested against, not in the recursion shape.
//
// Orthographic: the eye is effectively at infinity along the current view
// direction (`heights`), so the test is a single sign check against that
// direction — depth = coords·heights is LARGER (nearer) as coords moves
// along +heights, so the plane's front side is the nearer side exactly
// when its normal and the view direction point the same general way.
//
// Perspective: applyPerspective's d = 1 - depth/F is algebraically a
// genuine central projection with the eye at a FINITE object-space point,
// depth F along the current view direction, looking back toward the
// scene (derived and verified in NOTES10) — so the test needs that actual
// point, not just its direction. `heights` forms a genuine orthonormal
// frame with the projection basis at every control point tested, in both
// parametrization modes, in Mode B (verified directly) — but Mode A's
// frame, while still orthogonal, is uniformly scaled by a non-unit
// factor, so `heights` is explicitly normalized here rather than assumed
// already unit, to stay correct regardless of display mode.
//
// Does not yet include the near-degenerate backstop (a splitting plane
// passing very close to the eye — see NOTES10's F≈5 finding) or focal-
// plane clipping — later steps.
function traverseFaceBsp(node, heights, F) {
  let eye = null;
  if (F !== Infinity) {
    const hLen = vecLen3D(heights);
    eye = hLen > 1e-9 ? heights.map(h => (h / hLen) * F) : [0, 0, 0];
  }
  function frontIsNear(plane) {
    return eye === null ? dot3D(plane.normal, heights) > 0 : planeSignedDistance(plane, eye) > 0;
  }
  function walk(n, out) {
    if (!n) return out;
    if (!n.plane) { walk(n.back, out); out.push(...n.coplanar); return out; }
    const near = frontIsNear(n.plane) ? n.front : n.back;
    const far  = frontIsNear(n.plane) ? n.back  : n.front;
    walk(far, out);
    out.push(...n.coplanar);
    walk(near, out);
    return out;
  }
  return walk(node, []);
}

// The current focal plane as a half-space clip target — depth = F is
// itself an affine plane in object space, so the exact same
// clipPolygonToHalfSpace primitive the BSP split uses also clips a
// fragment to the visible (depth < F) side of the camera, rather than
// needing separate clipping logic. Normalizing `heights` here exactly
// matches applyPerspective's own Mode-A/-B handling — Mode A's `depth /
// normS` division is algebraically the same normalization, just computed
// differently there (see NOTES10) — so this one formula is correct
// regardless of display mode, with no mode branch needed. Returns null
// for orthographic (F === Infinity) or a degenerate view direction,
// meaning "nothing to clip."
function focalPlane(heights, F) {
  if (F === Infinity) return null;
  const hLen = vecLen3D(heights);
  if (hLen < 1e-9) return null;
  return { normal: heights.map(h => -h / hLen), d: F };
}

// Clips one fragment to the visible side of the current focal plane, if
// perspective is on — returns null if it's entirely beyond the focal
// plane (nothing left to draw), or the same fragment untouched if
// `plane` is null (orthographic). A fragment straddling the focal plane
// is cut down to its visible portion instead of vanishing outright — the
// existing per-vertex clipBehind test in drawFaces instead drops a face
// *entirely* the moment any one vertex fails it, which this fixes as a
// byproduct of needing the same clip primitive for the BSP split anyway
// (see NOTES10).
function clipFragmentToFocalPlane(fragment, plane) {
  if (!plane) return fragment;
  const polygon = clipPolygonToHalfSpace(fragment.polygon, plane, true);
  return polygon.length >= 3 ? { polygon, sourceFace: fragment.sourceFace } : null;
}

// Renders every face via an object-space BSP — buildFaceBsp/buildFaceFragments
// build it fresh from this call's own facesArr/vertsArr (not cached; see
// their own comment for why), traverseFaceBsp does the per-frame, view-
// dependent ordering work (cheap: one plane-vs-eye test per tree node, no
// geometry), clipFragmentToFocalPlane clips each fragment to the current
// focal plane (replacing the old per-vertex all-or-nothing clipBehind
// check — a fragment straddling the focal plane now keeps its visible
// portion instead of the whole face vanishing, see NOTES10). Supersedes
// the old per-frame pairwise-comparison ordering (computeFaceDrawOrder
// and its dependencies, removed entirely — see NOTES10 for the design arc).
//
// Two passes: first resolve every fragment actually worth drawing down to
// real on-screen points (discarding invisible/clipped-away/degenerate
// ones), *then* group and paint. The grouping step is what avoids a real,
// user-found artifact on complex real-world geometry (a 24-face trefoil-
// knot mesh — see NOTES10): a face the BSP split into several fragments
// used to get filled as several separate ctx.fill() calls, and two
// adjacent same-colored fills sharing an edge show a visible antialiasing
// seam at that edge (a standard, well-known 2D-rasterizer artifact,
// sometimes called a "crack") even though they're the same color and
// should look like one continuous face. Consecutive same-source-face
// entries (in the already-filtered, already-correctly-ordered list) are
// safe to combine into one multi-subpath fill — safe *by construction*,
// not by re-deriving overlap safety from scratch: they were already going
// to draw back-to-back with nothing else in between, so combining them
// changes nothing about visibility relative to anything else, only how
// the shared internal edge rasterizes.
//
// `facesArr` is filtered to visible-or-selected before the tree is even
// built (`f.id === selectedFaceId` kept for the same hidden-but-selected
// ghost-render precedent buildFaceFragments used to encode itself) — a
// hidden face contributes nothing to what's ever painted, so classifying
// and splitting against its plane is pure waste, not a rare edge case:
// confirmed on a real 5-tetrahedra-compound scene where 16 hidden faces
// were driving 247 total tree fragments (49 of them splitting the 4
// actually-visible faces) for geometry that renders identically, and
// far cheaper, as 4 whole, unsplit fragments once the hidden ones are
// excluded before the build (see NOTES-N).
function drawFaces(facesArr, vertsArr, vecs, heights, scale, normS) {
  const visibleFacesArr = facesArr.filter(f => f.visible || f.id === selectedFaceId);
  const tree = buildFaceBsp(buildFaceFragments(visibleFacesArr, vertsArr));
  if (!tree) return;
  const F = perspectiveOn ? perspPtoF(perspectiveP) : Infinity;
  const ordered = traverseFaceBsp(tree, heights, F);
  // Only actually clip when perspective is on and clipBehind is enabled —
  // matches applyPerspective's own existing gating exactly (clipBehind
  // off deliberately still renders the folded/mirrored behind-camera
  // artifact, a pre-existing, intentional debugging affordance).
  const clipPlane = (perspectiveOn && clipBehind) ? focalPlane(heights, F) : null;

  const resolved = [];
  for (const frag of ordered) {
    const f = frag.sourceFace;
    // A selected-but-hidden face still needs an on-canvas anchor — same
    // pattern as drawVertices/drawSegments (see NOTES6, "highlighting a
    // hidden object"). Face's only highlight state is selectedFaceId.
    // Checked per-fragment (not once per face) since a split face's
    // fragments can only be evaluated once traversal has resolved them.
    if (!f.visible && f.id !== selectedFaceId) continue;
    const clipped = clipFragmentToFocalPlane(frag, clipPlane);
    if (!clipped) continue;

    const screenPts = [];
    let bad = false;
    for (const p of clipped.polygon) {
      const { pt, depth } = projectPoint(p, vecs, heights);
      if (!Number.isFinite(depth) || !Number.isFinite(pt.re) || !Number.isFinite(pt.im)) { bad = true; break; }
      const a = applyPerspective(pt, depth, normS);
      if (!a.ok) { bad = true; break; }
      screenPts.push(toScreen(a.pt, scale));
    }
    if (bad || screenPts.length < 3) continue;
    resolved.push({ face: f, screenPts });
  }

  let i = 0;
  while (i < resolved.length) {
    const face = resolved[i].face;
    let j = i + 1;
    while (j < resolved.length && resolved[j].face === face) j++;

    ctx.beginPath();
    for (let k = i; k < j; k++) {
      const sp = resolved[k].screenPts;
      ctx.moveTo(sp[0].x, sp[0].y);
      for (let m = 1; m < sp.length; m++) ctx.lineTo(sp[m].x, sp[m].y);
      ctx.closePath();
    }
    // Selection halo used to be stroked right here, per fragment-group —
    // moved to drawSelectedFaceHalo (see its own comment), a separate,
    // whole-face, unconditionally-foreground pass, since tracing only
    // whichever consecutive run of a split face's fragments landed
    // together in paint order isn't the face's true boundary (see NOTES-N).
    // Ghost fill when hidden (only reachable here because face.id ===
    // selectedFaceId, per the gate above) — same faded-real-color
    // treatment as vertex's ghost marker and segment's ghost line.
    ctx.fillStyle = face.visible ? themeColor(face.color) : fadedColor(face.color, 0.4);
    ctx.fill();

    i = j;
  }
}

// Selection halo — a face's own ordered `vertexIds` loop, projected
// directly, never derived from the BSP's fragments at all. Two real fixes
// over the old per-fragment-group stroke this replaces (used to live
// inside drawFaces' own paint loop): (1) traces the face's true outer
// boundary always, not whichever consecutive run of fragments happened to
// land together in paint order — sidesteps needing to solve Minkowski-
// offsetting a possibly-concave fragment union entirely, since the
// original, never-split vertex loop was already sitting on the committed
// face object the whole time; (2) called from draw() in its own pass
// after everything else (faces, segments, curves, vertices, pointer), so
// a selected face buried behind nearer geometry still shows its halo — a
// selection halo communicates UI state, not scene content, the same
// convention most editors use for a selected-object outline, so it
// deliberately ignores true depth entirely rather than being composited
// into it (see NOTES-N for the discussion this settled). Ghost fill for a
// hidden-but-selected face is unaffected — that still happens per-fragment
// inside drawFaces, at its true composited depth, which is the point of a
// ghost (NOTES10 already verified it composites correctly under nearer
// geometry; this pass only ever adds a stroke on top, never touches fill).
// Bails with no stroke at all — never a partial one — if any vertex is
// missing or fails to project; a halo tracing only part of a boundary
// would be more confusing than none.
function drawSelectedFaceHalo(facesArr, vertsArr, vecs, heights, scale, normS) {
  if (selectedFaceId === null) return;
  const face = facesArr.find(f => f.id === selectedFaceId);
  if (!face) return;
  const screenPts = [];
  for (const id of face.vertexIds) {
    const v = vertsArr.find(vv => vv.id === id);
    if (!v) return;
    const { pt, depth } = projectPoint(v.coords, vecs, heights);
    if (!Number.isFinite(depth) || !Number.isFinite(pt.re) || !Number.isFinite(pt.im)) return;
    const a = applyPerspective(pt, depth, normS);
    if (!a.ok) return;
    screenPts.push(toScreen(a.pt, scale));
  }
  if (screenPts.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(screenPts[0].x, screenPts[0].y);
  for (let m = 1; m < screenPts.length; m++) ctx.lineTo(screenPts[m].x, screenPts[m].y);
  ctx.closePath();
  ctx.save();
  ctx.strokeStyle = 'rgba(30,100,220,0.28)';
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.restore();
}

// ─── Segment-vs-segment crossing resolution (NOTES19.md, mechanism 3,
// standalone — no face interleaving yet) ────────────────────────────────
//
// Two segments whose *projected* images cross on screen, but that don't
// truly meet in 3D, need a depth-based occlusion decision right at that
// crossing — the nearer one should read as passing in front, the farther
// one should show a real gap. A hairline cut at the zero-width centerline
// crossing doesn't work once strokes have real rendered width: cutting a
// wide ribbon at a single point doesn't correctly compute where the other
// ribbon's own width actually covers it. The fix (the classical
// knot-diagram crossing convention — an actual gap in the "under" strand,
// not a point-cut) carves an actual gap out of the far ("under") ribbon,
// bounded by the *near* ("over") ribbon's own two edges (parallel to it,
// not perpendicular to the far one) — what remains of the far ribbon on
// either side of the gap is therefore a trapezoid, not a rectangle
// (derived and verified, NOTES19.md).
//
// Segments don't have genuine 3D width (`lineWidth` is a cosmetic,
// screen-space-only quantity, matching how vertex radius already works —
// `scaleNodes: false`), so "depth across a ribbon's width" isn't a
// separately meaningful quantity; a ribbon's own centerline depth is used
// throughout. Width is also treated as *constant* along a segment's own
// length here (`perspScaleSegs`/`scaleSegments` tapering is NOT applied
// in this path) — constant width is what keeps a ribbon's edges genuine
// straight lines, which the whole construction below depends on;
// combining this with tapered width is a real, separate follow-up, not
// attempted here. Vertex/segment-vs-face interleaving (mechanism 2) is
// also explicitly not part of this yet — faces still render entirely
// separately via drawFaces, unchanged.
// 3-or-more-ribbon mutual overlap is a known, deferred limitation (medium-
// low priority backlog item, SotU.md) — not guarded against here.

// 2D line-line intersection — both given as {point:[x,y], dir:[x,y]}
// (dir need not be unit). Returns the intersection point, or null if
// parallel (within a small tolerance) — a real edge case (near-coincident
// directions) skipped rather than guessed at.
function intersectLines2D(a, b) {
  const [ax, ay] = a.point, [adx, ady] = a.dir;
  const [bx, by] = b.point, [bdx, bdy] = b.dir;
  const denom = adx * bdy - ady * bdx;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((bx - ax) * bdy - (by - ay) * bdx) / denom;
  return [ax + t * adx, ay + t * ady];
}

// Where line a crosses line b, as a's own parameter (a.point + t*a.dir) —
// same math as intersectLines2D, returning the scalar instead of the
// point. Used only to order which of a segment's two candidate cut lines
// is encountered first along its own length.
function lineParamAtCrossing2D(a, b) {
  const [ax, ay] = a.point, [adx, ady] = a.dir;
  const [bx, by] = b.point, [bdx, bdy] = b.dir;
  const denom = adx * bdy - ady * bdx;
  if (Math.abs(denom) < 1e-9) return null;
  return ((bx - ax) * bdy - (by - ay) * bdx) / denom;
}

// Do open segments p1-p2 and p3-p4 (each [x,y]) cross at a point strictly
// interior to both? A small epsilon margin excludes near-endpoint
// touches — genuinely shared endpoints/3D-coincident crossings are a
// separate case (NOTES19.md), not handled by this path at all yet.
const SEG_CROSS_EPS = 1e-6;
function screenSegmentsCross(p1, p2, p3, p4) {
  const d1x = p2[0] - p1[0], d1y = p2[1] - p1[1];
  const d2x = p4[0] - p3[0], d2y = p4[1] - p3[1];
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return null; // parallel (or near-parallel) on screen
  const t = ((p3[0] - p1[0]) * d2y - (p3[1] - p1[1]) * d2x) / denom;
  const s = ((p3[0] - p1[0]) * d1y - (p3[1] - p1[1]) * d1x) / denom;
  if (t <= SEG_CROSS_EPS || t >= 1 - SEG_CROSS_EPS) return null;
  if (s <= SEG_CROSS_EPS || s >= 1 - SEG_CROSS_EPS) return null;
  return { t, s };
}

// Exact perspective-correct interpolation of depth at screen parameter u
// (0..1) along a segment, given each endpoint's own `depth` (from
// projectPoint) and `factor` (= 1/d, from applyPerspective — already 1
// under orthographic, so this one formula needs no mode branch). Screen
// position is a *rational*, not affine, function of the original 3D
// parameter once perspective divides — but factor(u) and depth(u)*factor(u)
// are each exactly affine in screen-space u (the standard "1/w is affine
// in screen space" rasterizer identity), so this is exact, not an
// approximation.
function depthAtScreenParam(depth0, factor0, depth1, factor1, u) {
  const f = (1 - u) * factor0 + u * factor1;
  return ((1 - u) * depth0 * factor0 + u * depth1 * factor1) / f;
}

function drawSegments(segs, verts, vecs, heights, scale, normS) {
  // Pass 1: project every visible-or-highlighted segment's endpoints once.
  const items = [];
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
    if (!Number.isFinite(r1.depth) || !Number.isFinite(r1.pt.re) || !Number.isFinite(r2.depth) || !Number.isFinite(r2.pt.re)) continue;
    const a1 = applyPerspective(r1.pt, r1.depth, normS);
    const a2 = applyPerspective(r2.pt, r2.depth, normS);
    if (!a1.ok || !a2.ok) continue;
    const p1 = toScreen(a1.pt, scale);
    const p2 = toScreen(a2.pt, scale);
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) continue; // degenerate on screen -- nothing meaningful to draw or notch
    const dir = [dx / len, dy / len];
    const perp = [-dir[1], dir[0]];
    const halfWidth = (seg.lineWidth ?? 1.5) / 2;
    items.push({
      seg, isHighlighted,
      p1: [p1.x, p1.y], p2: [p2.x, p2.y], dir, perp, halfWidth,
      depth1: r1.depth, factor1: a1.factor, depth2: r2.depth, factor2: a2.factor,
      notches: [], // filled in pass 2, {t, entryCorners, exitCorners} — see below
    });
  }

  // Pass 2: every pair, find real screen crossings, resolve which one is
  // nearer at that point (larger interpolated depth = nearer the viewer,
  // the same convention traverseFaceBsp's own frontIsNear uses — see
  // NOTES19.md), and record a notch on the losing (farther) one.
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const A = items[i], B = items[j];
      const crossing = screenSegmentsCross(A.p1, A.p2, B.p1, B.p2);
      if (!crossing) continue;
      const depthA = depthAtScreenParam(A.depth1, A.factor1, A.depth2, A.factor2, crossing.t);
      const depthB = depthAtScreenParam(B.depth1, B.factor1, B.depth2, B.factor2, crossing.s);
      const winner = depthA > depthB ? A : B;
      const loser  = depthA > depthB ? B : A;
      const loserParam = depthA > depthB ? crossing.s : crossing.t;
      const winnerLeft  = { point: [winner.p1[0] + winner.perp[0] * winner.halfWidth, winner.p1[1] + winner.perp[1] * winner.halfWidth], dir: winner.dir };
      const winnerRight = { point: [winner.p1[0] - winner.perp[0] * winner.halfWidth, winner.p1[1] - winner.perp[1] * winner.halfWidth], dir: winner.dir };
      const loserCenterline = { point: loser.p1, dir: loser.dir };
      // Which of the winner's two edges does the loser's own centerline
      // cross first (smaller parameter along the loser's own p1->p2
      // direction)? That's the notch's entry boundary; the other is exit.
      const tLeft  = lineParamAtCrossing2D(loserCenterline, winnerLeft);
      const tRight = lineParamAtCrossing2D(loserCenterline, winnerRight);
      if (tLeft === null || tRight === null) continue; // near-parallel -- skip this notch rather than guess
      const entryLine = tLeft < tRight ? winnerLeft : winnerRight;
      const exitLine  = tLeft < tRight ? winnerRight : winnerLeft;
      const loserLeft  = { point: [loser.p1[0] + loser.perp[0] * loser.halfWidth, loser.p1[1] + loser.perp[1] * loser.halfWidth], dir: loser.dir };
      const loserRight = { point: [loser.p1[0] - loser.perp[0] * loser.halfWidth, loser.p1[1] - loser.perp[1] * loser.halfWidth], dir: loser.dir };
      const entryCorners = [intersectLines2D(loserLeft, entryLine), intersectLines2D(loserRight, entryLine)];
      const exitCorners  = [intersectLines2D(loserLeft, exitLine),  intersectLines2D(loserRight, exitLine)];
      if (entryCorners.some(c => !c) || exitCorners.some(c => !c)) continue; // near-parallel edge case -- skip
      loser.notches.push({ t: loserParam, entryCorners, exitCorners });
    }
  }

  // Pass 3: build each segment's visible piece(s) (its full ribbon, minus
  // any notches, in order along its own length) and paint them.
  for (const item of items) {
    const { seg, isHighlighted, p1, p2, perp, halfWidth, notches } = item;
    notches.sort((a, b) => a.t - b.t);
    const startCap = [
      [p1[0] + perp[0] * halfWidth, p1[1] + perp[1] * halfWidth],
      [p1[0] - perp[0] * halfWidth, p1[1] - perp[1] * halfWidth],
    ];
    const endCap = [
      [p2[0] + perp[0] * halfWidth, p2[1] + perp[1] * halfWidth],
      [p2[0] - perp[0] * halfWidth, p2[1] - perp[1] * halfWidth],
    ];
    const pieces = [];
    let prevCorners = startCap;
    for (const n of notches) {
      pieces.push([prevCorners[0], n.entryCorners[0], n.entryCorners[1], prevCorners[1]]);
      prevCorners = n.exitCorners;
    }
    pieces.push([prevCorners[0], endCap[0], endCap[1], prevCorners[1]]);

    // Ghost stand-in when hidden (only reachable here because isHighlighted
    // is true) — same faded-real-color treatment as vertex's ghost marker,
    // not a generic grey.
    const fillColor = seg.visible ? themeColor(seg.color) : fadedColor(seg.color, 0.4);
    ctx.save();
    if (isHighlighted) {
      ctx.strokeStyle = 'rgba(30,100,220,0.28)';
      ctx.lineWidth = halfWidth * 2 + 6;
      ctx.beginPath();
      ctx.moveTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.stroke();
    }
    ctx.fillStyle = fillColor;
    ctx.beginPath();
    for (const piece of pieces) {
      ctx.moveTo(piece[0][0], piece[0][1]);
      for (let k = 1; k < piece.length; k++) ctx.lineTo(piece[k][0], piece[k][1]);
      ctx.closePath();
    }
    ctx.fill();
    ctx.restore();
  }
}

// Renders each curve's cached tessellated points (see tessellateCurve) as
// a continuous stroke — but breaks the path (new subpath) at any point
// that fails to project, rather than silently connecting across the gap
// the way drawFacePickPreview's preview line does. Connecting point i-1
// straight to i+1 across a skipped point would draw a spurious line
// through invalid space, and the more points a primitive has the worse
// that gets — unlike a 2-point segment (drawSegments), where "skip the
// whole thing" is really the only option anyway.
function drawCurves(curvesArr, vecs, heights, scale, normS) {
  for (const cv of curvesArr) {
    if (!cv.visible) continue;
    const pts = cv.points ?? [];
    if (pts.length < 2) continue;
    ctx.save();
    ctx.strokeStyle = themeColor(cv.color);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let penDown = false;
    for (const coords of pts) {
      const { pt, depth } = projectPoint(coords, vecs, heights);
      if (isNaN(depth) || isNaN(pt.re) || isNaN(pt.im)) { penDown = false; continue; }
      const a = applyPerspective(pt, depth, normS);
      if (!a.ok) { penDown = false; continue; }
      const scr = toScreen(a.pt, scale);
      if (penDown) ctx.lineTo(scr.x, scr.y);
      else { ctx.moveTo(scr.x, scr.y); penDown = true; }
    }
    ctx.stroke();
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

    // A reject specifically is handled *inside* the facePickOrder branch
    // below, not here — a reject only ever targets a vertex already in
    // facePickOrder (v0 too early, or a middle pick), so it always has an
    // existing role-halo worth keeping visible underneath the red (see
    // NOTES7 — corrected from an earlier version where the red glow fully
    // replaced the halo). 'append' (a genuinely new, not-yet-picked
    // candidate) has no such halo to preserve, so it keeps the original
    // full-disc treatment here.
    const pendingIsError = pendingListPick && pendingListPick.vertexId === v.id &&
                            pendingListPick.getAction(v.id).kind === 'reject';
    if (pendingListPick && pendingListPick.vertexId === v.id && !pendingIsError) {
      // Glow matches the floating button's own color (blue = use) — fully
      // overrides whatever static highlight this vertex would otherwise
      // show, since "pending confirmation" supersedes it until resolved.
      // pendingListPick.getAction is whichever of getFacePickAction/
      // getSegmentPickAction created this pending pick (see handleListPick).
      ctx.save();
      ctx.beginPath();
      ctx.arc(scr.x, scr.y, r + 6, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(30, 100, 220, 0.30)';
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
      if (pendingIsError) {
        // The reject glow itself: confined to the gap between the vertex's
        // own marker and its nearest hard ring (r+4), rather than a big
        // disc that would blot out the rings just drawn above — "retain
        // the hard halo, fill the gap beneath it" (the user's own framing,
        // NOTES7). Deliberately doesn't reach past the first ring even for
        // v0's double-ring — only "the gap from the vertex" fills, not the
        // whole structure.
        ctx.beginPath();
        ctx.arc(scr.x, scr.y, r + 4, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(200, 50, 50, 0.30)';
        ctx.fill();
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
  const activeCurves = codeOpen && previewOverride ? previewOverride.curves : curves;
  if (displayMode === 'B') drawDiskBoundary(base);
  if (showAxes) drawAxes(vecs, display);
  drawFaces(activeFaces, activeVerts, vecs, heights, display, s);
  drawSegments(activeSegs, activeVerts, vecs, heights, display, s);
  drawCurves(activeCurves, vecs, heights, display, s);
  drawFacePickPreview(activeVerts, vecs, heights, display, s);
  drawVertices(activeVerts, vecs, heights, display, s);
  if (showPointer) drawControlPoint(base);
  drawSelectedFaceHalo(activeFaces, activeVerts, vecs, heights, display, s);
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
  syncViewSettingToEditor('pointer', false);
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
  const wasDragging = dragging;
  dragging = false;
  // The gesture's one settling point (see syncViewSettingToEditor) —
  // updateFromPointer() only did the cheap per-frame text splice while this
  // was in flight; now catch codeLineRecords/the gutter/error list up for
  // real, once, rather than on every pointermove.
  if (wasDragging) syncViewSettingToEditor('pointer', true);
  if (pointerDownData) handleCanvasClick(pointerDownData.px, pointerDownData.py, pointerDownData.pointerType);
  pointerDownData = null;
});

window.addEventListener('pointercancel', () => {
  const wasDragging = dragging;
  dragging        = false;
  pointerDownData = null;
  if (wasDragging) syncViewSettingToEditor('pointer', true);
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
  // Whatever's about to happen is now authoritative, so any stale list
  // preview for a *different* vertex resolves here — needed because the
  // pointerdown listeners that would otherwise clear pendingListPick/
  // armedVertexId now defer entirely to a vertex row's own click handler
  // (see those listeners' comments, NOTES7) rather than clearing pre-
  // emptively, so this function is where that deferred resolution lands.
  clearPendingListPick();
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
    // handleListPick has its own re-targeting-the-same-vertex no-op check
    // (see its comment) — deliberately not pre-empted by a clear here, so
    // that check still applies to a repeated canvas click too.
    handleListPick(id, getFacePickAction, applyFacePick);
    return;
  }
  // Every other outcome resolves any stale, unrelated list preview here —
  // needed now that the pendingListPick-clearing listener defers entirely
  // to a vertex row's own click handler instead of clearing pre-emptively
  // on pointerdown (see that listener's comment, NOTES7); this is where
  // that deferred resolution actually lands once the click resolves.
  clearPendingListPick();
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
  // Re-targeting the exact same vertex with the exact same outcome (e.g.
  // re-clicking a row that's already showing "use"/"error") is a genuine
  // no-op — nothing about the resulting state actually changes. Previously
  // this unconditionally tore the button down and rebuilt it regardless,
  // which the user traced to a real, reproducible flicker (both the
  // button itself and, downstream, a native grey highlight flash on the
  // row) — "close"/"remove" never had this problem because re-clicking an
  // already-armed row was already a true no-op (see renderVertexList's row
  // dispatch). getAction is compared by reference (getFacePickAction vs.
  // getSegmentPickAction) rather than re-invoked, since it's a pure
  // function of current state — same vertexId + same getAction always
  // means the same computed kind, so there's nothing left to check.
  if (pendingListPick && pendingListPick.vertexId === vertexId && pendingListPick.getAction === getAction) {
    return;
  }
  // A genuinely new pick supersedes any stale arm state left over from a
  // different vertex — needed now that the arm-clearing listener defers
  // entirely to a vertex row's own click handler (see that listener's
  // comment, NOTES7) instead of clearing pre-emptively on pointerdown.
  clearArmedStates();
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
// True once the vertex list is hidden by *any* collapsed ancestor —
// its own .list-toggle, the Display submenu, or the whole control panel
// (all three ultimately use display:none, per their own toggle handlers,
// so offsetParent reliably goes null under any of them). Checking this
// directly, rather than only listSectionOpen.vertex, closes a real bug:
// the Display-submenu and whole-panel toggles never called any of these
// update functions at all, so a floating button collapsed along with
// neither of those two would just keep floating on screen, stale, with
// nothing left underneath it (see NOTES7 — user-caught, iPad/laptop
// Chrome and Safari both).
function isVertexListHidden(list) {
  return list.offsetParent === null;
}

function updatePendingButtonPosition() {
  if (!pendingListPick) return;
  const list = document.getElementById('vertex-list');
  const row  = list.querySelector(`[data-vertex-id="${pendingListPick.vertexId}"]`);
  if (!row) { clearPendingListPick(); return; }

  if (!listSectionOpen.vertex || isVertexListHidden(list)) {
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
  if (!row || !listSectionOpen.vertex || isVertexListHidden(list)) {
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
  if (!row || !listSectionOpen.vertex || isVertexListHidden(list)) {
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
  syncViewSettingToEditor('anchor', true);
  draw();
});

document.getElementById('btn-diag').addEventListener('click', () => {
  paramMode = 'diag';
  setActive(['btn-u3', 'btn-diag'], 'btn-diag');
  syncViewSettingToEditor('anchor', true);
  draw();
});

document.getElementById('btn-modeA').addEventListener('click', () => {
  if (displayMode === 'B') controlPt = cToZ(controlPt);
  displayMode = 'A';
  setActive(['btn-modeA', 'btn-modeB'], 'btn-modeA');
  // No 'pointer' sync needed here — it's always z in the editor (see
  // applyViewSettings), and the cToZ conversion above is exactly what keeps
  // that z value the same true point; only the 'mode' line itself changed.
  syncViewSettingToEditor('mode', true);
  draw();
});

document.getElementById('btn-modeB').addEventListener('click', () => {
  if (displayMode === 'A') controlPt = zToC(controlPt);
  displayMode = 'B';
  setActive(['btn-modeA', 'btn-modeB'], 'btn-modeB');
  syncViewSettingToEditor('mode', true);
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

// 'input' fires continuously while the slider thumb is dragged -- cheap sync
// only. 'change' fires once, when the drag actually ends (native behavior of
// <input type=range>) -- that's the gesture's one settling point.
sliderScale.addEventListener('input', () => {
  applyScale(parseFloat(sliderScale.value));
  syncViewSettingToEditor('scale', false);
});
sliderScale.addEventListener('change', () => syncViewSettingToEditor('scale', true));
inputScale.addEventListener('change', () => {
  const v = parseFloat(inputScale.value);
  if (Number.isFinite(v) && v > 0) { applyScale(v); syncViewSettingToEditor('scale', true); }
});

// ─── Axes button ──────────────────────────────────────────────────────────────

document.getElementById('btn-axes').addEventListener('click', () => {
  showAxes = !showAxes;
  document.getElementById('btn-axes').classList.toggle('active', showAxes);
  syncViewSettingToEditor('showAxes', true);
  draw();
});

document.getElementById('btn-show-pointer').addEventListener('click', () => {
  showPointer = !showPointer;
  document.getElementById('btn-show-pointer').classList.toggle('active', showPointer);
  syncViewSettingToEditor('showPointer', true);
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
        if (n === 'true' || n === 'false' || n === 'otherwise') { nameInp.value = c.name; setNameError(nameInp); return; }
        if (isNameTaken(n, null, c.id)) { nameInp.value = c.name; setNameError(nameInp); return; }
        snapshot();
        const oldName = c.name;
        c.name = n;
        renameConstantEverywhere(oldName, n);
        reEvalObjects();
        renderConstList();
        // Unconditional, not just "if a vertex happens to be mid-edit" —
        // renameConstantEverywhere already rewrites every *Expr field on
        // every vertex/segment/face (not just the one being edited), so
        // every one of these lists' own displayed text (a visible/label
        // toggle's sub-label, in particular — normal, non-edit-mode rows
        // show it too, not just the edit row) needs the same refresh, or
        // it silently keeps showing the pre-rename name until something
        // unrelated happens to re-render that specific list later. Found
        // via a real user report: a vertex's own `visible=` sub-label
        // stayed on the old name after renaming the bool constant it
        // referenced, even though the underlying data (and the code
        // editor's own serialization) were already correct.
        renderVertexList();
        renderSegmentList();
        renderFaceList();
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
    // cannot — resolveConstByKind is the same check `edit number`/`edit
    // color`/`edit bool` use, so a wrong-kind edit is rejected here exactly
    // as it would be from the
    // code file/interpreter, closing the hole a plain always-accepting text
    // box used to leave open (see the const-editing design notes). Same
    // treatment for a declared domain (`edit number`'s own check, main.js
    // ~3192) — this was one of the two write-paths Phase 5 left unenforced.
    const commitExprChange = newExpr => {
      const res = resolveConstByKind(c.kind, newExpr, buildEnvs());
      if (!res.ok) { exprInp.value = c.expr; setNameError(exprInp); return; }
      if (c.domain && !c.domain.has(res.value)) { exprInp.value = c.expr; setNameError(exprInp); return; }
      snapshot();
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
  if (name === 'true' || name === 'false' || name === 'otherwise') { setNameError(nameInp); return; }
  if (isNameTaken(name)) { setNameError(nameInp); return; }
  if (!addConstKind || !expr) { setNameError(exprInp); return; }
  const res = resolveConstByKind(addConstKind, expr, buildEnvs());
  if (!res.ok) { setNameError(exprInp); return; }
  // No domain-entry field exists on this add-row, so a constant created
  // here can never be domain-restricted at birth — `domain: null` is set
  // explicitly only for shape consistency with the other three creation
  // sites (code-editor commit, interpreter, buildCommittedArraysFromStaged),
  // which all carry this field. Not a live enforcement gap: there is
  // nothing to enforce yet since a domain can't be specified through this
  // widget at all.
  snapshot();
  constants.push({ id: nextConstantId++, name, expr, value: res.value, kind: addConstKind, domain: null });
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
      const envs = buildEnvs();
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
          // Pre-existing gap fixed in passing: this call used to omit
          // functionEnv/boolEnv entirely, so a function call or bool
          // reference typed here silently resolved to NaN — now uses the
          // full live envs, same as every other coordinate-resolution site.
          const liveEnvs = buildEnvs();
          const val  = evalExpr(exprInp.value, liveEnvs.numericEnv, liveEnvs.functionEnv, liveEnvs.boolEnv);
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
        // Pre-existing gap fixed in passing: this call used to omit
        // functionEnv/boolEnv entirely, same issue as the input handler
        // above.
        const curVal = evalExpr(exprVal, envs.numericEnv, envs.functionEnv, envs.boolEnv);
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
      name.textContent = v.name + ':';
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
  const envs      = buildEnvs();
  const exprs     = coordInps.map(inp => inp.value.trim() || '0');
  // Pre-existing gap fixed in passing: this call used to omit
  // functionEnv/boolEnv entirely, same issue as the two edit-row sites
  // above.
  const vals      = exprs.map(expr => evalExpr(expr, envs.numericEnv, envs.functionEnv, envs.boolEnv));
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
    swatch.className = 'f-swatch';
    swatch.style.background = f.color;

    const label = document.createElement('span');
    label.className = 's-name';
    label.textContent = f.name + ':';

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
  // Closing then reopening the panel is deliberately the identity on
  // whatever submenus were open — it only ever collapses/reveals
  // #controls-main itself (display:none via .collapsed), never touches any
  // individual submenu's own display/active state. "Every submenu starts
  // closed" is a *fresh-session* default only (index.html's own initial
  // markup for sub-view/sub-aux/sub-disp), not something re-applied on
  // every open — user-caught: an earlier version of this handler
  // force-closed all three submenus every time the panel opened, which
  // also collapsed whatever was left open across a plain close/reopen of
  // the panel itself (demo mode's own enter/exit/cycle never call this
  // handler at all, so that path was never affected either way).
  // Collapsing the whole panel hides the vertex list along with it, but
  // never told any floating button to notice — bug, user-caught: a
  // "use"/"close"/"remove" button could be left floating on screen with
  // nothing left underneath it. updatePendingButtonPosition/
  // updateArmButtons now detect this themselves (isVertexListHidden), but
  // still need an actual call after the collapse to act on it.
  updatePendingButtonPosition();
  updateArmButtons();
});

// "Phone-sized" — the one remaining 767px breakpoint in this codebase
// (style.css's own copy, formerly used to hide the scale/perspective
// sliders on phone, was removed once those sliders were restored there).
// A single persistent MediaQueryList (rather than a fresh matchMedia() call
// per check) so it can also carry a 'change' listener — needed for a real
// phone case, not just a resized desktop window: rotating a phone to
// landscape can cross this breakpoint mid-session.
const phoneMediaQuery = window.matchMedia('(max-width: 767px)');
function isPhoneViewport() {
  return phoneMediaQuery.matches;
}

// Creating/editing vertices/segments/faces by touch isn't supported, so
// Display is a genuinely disabled control on phone — not just visually
// inert, native `disabled` so it can't be clicked/tapped at all (a plain
// CSS look-alike was tried first and rejected: a red flash on tap read as
// "error" rather than "unavailable," inconsistent with how every other
// disabled control in this app already looks — see `button:disabled` in
// style.css). Re-evaluated on load and on every breakpoint crossing, not
// just once, for the phone-rotation case above.
function updateDispSubmenuDisabled() {
  const btn = document.getElementById('btn-sub-disp');
  const wasDisabled = btn.disabled;
  btn.disabled = isPhoneViewport();
  // Rotating from landscape (where Display could have been open) back to
  // portrait shouldn't leave a now-disabled control's own submenu visibly
  // open.
  if (btn.disabled && !wasDisabled) {
    document.getElementById('sub-disp').style.display = 'none';
    btn.classList.remove('active');
  }
}
updateDispSubmenuDisabled();
phoneMediaQuery.addEventListener('change', updateDispSubmenuDisabled);

['view', 'aux', 'disp'].forEach(key => {
  document.getElementById(`btn-sub-${key}`).addEventListener('click', () => {
    const sub  = document.getElementById(`sub-${key}`);
    const btn  = document.getElementById(`btn-sub-${key}`);
    const open = sub.style.display === 'none';
    // Phone: only one submenu open at a time — opening this one closes
    // whatever else was open instead of stacking (View/Aux only in
    // practice, since Display can never be the "whatever else").
    if (open && isPhoneViewport()) {
      ['view', 'aux', 'disp'].forEach(otherKey => {
        if (otherKey === key) return;
        document.getElementById(`sub-${otherKey}`).style.display = 'none';
        document.getElementById(`btn-sub-${otherKey}`).classList.remove('active');
      });
    }
    sub.style.display = open ? '' : 'none';
    btn.classList.toggle('active', open);
    // Only 'disp' actually contains the vertex list, but this is cheap and
    // a no-op otherwise, same reasoning .list-toggle's own handler already
    // uses — not worth gating on which key this is. Same bug as the
    // whole-panel toggle above, same fix.
    updatePendingButtonPosition();
    updateArmButtons();
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
    domain: c.domain ?? null,
  }));
  const newFunctions = (staged.stagedFunctions ?? []).map((fn, i) => ({
    id: i,
    name: fn.name,
    params: [...fn.params],
    bodyExpr: fn.bodyExpr,
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
  // A curve's geometry comes from its own x/y/z expressions, not vertex
  // membership, so unlike segment/face it needs no nameToId translation.
  const newCurves = (staged.stagedCurves ?? []).map((c, i) => ({
    id: i,
    name: c.name,
    xExpr: c.xExpr, yExpr: c.yExpr, zExpr: c.zExpr,
    param: c.param,
    domainIntervals: c.domainIntervals.map(iv => ({ ...iv })),
    color: c.color,     colorExpr: c.colorExpr,
    visible: c.visible, visibleExpr: c.visibleExpr,
    points: c.points ?? [],
  }));
  return { newVertices, newConstants, newFunctions, newSegments, newFaces, newCurves };
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
  const { newVertices, newSegments, newFaces, newCurves } = buildCommittedArraysFromStaged(staged);
  previewOverride = { vertices: newVertices, segments: newSegments, faces: newFaces, curves: newCurves };
  // View settings have no equivalent of previewOverride (there's nothing to
  // read at draw() time — the live globals themselves ARE the render
  // parameters, unlike vertices/segments/etc which draw() can be pointed at
  // a staged-not-committed array instead). So this applies them directly,
  // same mechanism codeSave()/the interpreter use — genuinely live, not a
  // parallel preview. openCodeSubmenu() snapshots the pre-open values so
  // codeExit() (Exit, not Save) can revert this back out on close, the same
  // way previewOverride = null discards an unsaved vertex/segment/face/
  // curve edit; codeSave() re-snapshots on commit so a later Exit only
  // discards changes made *after* that Save, not the whole session.
  applyViewSettings(staged.finalView);
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
  textarea.value = sortCodeText(textarea.value).text;
  reparseAndPreview();
  resetCodeLineTracking();
}

function codeSave() {
  // Calls sortCodeText() directly rather than through codeSort() — it
  // already reformats every valid line to canonical form (via
  // formatLineForOutput) as part of reassembling the text, so the textarea
  // is fully canonical by the time it returns and the re-parse below needs
  // no separate re-serialize pass (invalid lines are left exactly as typed
  // either way, so the user can still see and fix them — no cascade-delete).
  // Going through codeSort() would also work for the text itself, but its
  // own parse's nameCounters — the only parse that still sees a valid
  // `counter=` line before it's absorbed/dropped — would be thrown away;
  // calling it directly here keeps that value reachable for the sync below.
  const textarea = document.getElementById('code-textarea');
  const sorted = sortCodeText(textarea.value);
  textarea.value = sorted.text;
  const staged = parseCodeText(textarea.value);
  const { newVertices, newConstants, newFunctions, newSegments, newFaces, newCurves } = buildCommittedArraysFromStaged(staged);

  // Remember this save's governing `set` values so the next Load starts
  // from here instead of resetting to the built-in defaults.
  lastSetVertex  = { ...staged.finalSet.vertex };
  lastSetSegment = { ...staged.finalSet.segment };
  lastSetFace    = { ...staged.finalSet.face };
  lastSetCurve   = { ...staged.finalSet.curve };
  // Let an explicit `counter=` (or a run of blank-name lines under a custom
  // `naming=`) carry forward into future controls-driven creation too.
  // Sourced from sortCodeText's own parse (sorted.nameCounters) — a lone
  // counter= reset with nothing else in the file to consume it is already
  // gone from `staged` (the re-parse just above) by the time this runs, same
  // as an `edit` line, so `staged.nameCounters` alone would never see it.
  syncNameCountersFromParse(sorted.nameCounters);
  // View settings are tier-2 singleton state, same as lastSet*/naming above —
  // applied directly, outside snapshot()'s undo capture (see applyViewSettings).
  applyViewSettings(staged.finalView);
  // This Save is now the new "don't discard this on Exit" baseline — a
  // later Exit (without a further Save) should only revert changes made
  // *after* this point, not the whole session back to when Code was opened.
  _preCodeViewSnapshot = currentViewSettingsSnapshot();

  snapshot();
  vertices          = newVertices;
  nextVertexId      = newVertices.length;
  constants         = newConstants;
  nextConstantId    = newConstants.length;
  functions         = newFunctions;
  nextFunctionId    = newFunctions.length;
  segments          = newSegments;
  nextSegmentId     = newSegments.length;
  faces             = newFaces;
  nextFaceId        = newFaces.length;
  curves            = newCurves;
  nextCurveId       = newCurves.length;
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
// The view-settings baseline to revert to on Exit (not Save) — see
// reparseAndPreview()'s comment. Captured fresh on open, advanced on every
// real Save, cleared on close.
let _preCodeViewSnapshot = null;

function openCodeSubmenu() {
  if (editingVertexId !== null)  cancelEdit();
  if (editingSegmentId !== null) cancelSegmentEdit();
  // An in-progress face/segment *definition* gets the same hard cancel as
  // the two edits just above, for the same underlying reason: the editor
  // can delete or retarget any vertex a pending pick references while
  // canvas interaction is frozen, with no way to detect that after the
  // fact (this is what the mid-pick-deletion bug actually was — see
  // NOTES20/21). A real cancel, not the "pause, resumable" treatment
  // switching between face/segment mode on canvas already gives each
  // other (that's safe there because nothing can delete a referenced
  // vertex out from under a merely-paused pick) — facePickOrder/
  // selectedVertexIds are actually cleared here, not just left for later.
  // Face *editing* (not yet built) belongs in this same spot once it
  // exists. Functions/curves need no equivalent — they have no
  // canvas-driven creation gesture to interrupt in the first place. The
  // interpreter's own input is deliberately untouched by any of this.
  faceMode      = 'off';
  facePickOrder = [];
  if (segmentMode !== 'off') {
    segmentMode       = 'off';
    selectedVertexIds = new Set();
  }
  clearArmedStates();
  clearPendingListPick();
  updateFaceButton();
  updateSegmentButton();
  renderVertexList();
  renderSegmentList();
  renderFaceList();
  draw();

  _preCodeViewSnapshot = currentViewSettingsSnapshot();

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
  textarea.value = serializeState(vertices, constants, segments, faces, curves, functions);
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
  _preCodeViewSnapshot = null;

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
  // Discard any view-setting preview from this session that was never
  // Saved — reparseAndPreview() applies these live as you type (see its own
  // comment), so unlike previewOverride there's nothing to just null out;
  // it has to be actively reverted back to the last real baseline (session
  // open, or the last Save, whichever is more recent).
  if (_preCodeViewSnapshot) applyViewSettings(_preCodeViewSnapshot);
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

  const staged    = parseCodeText(serializeState(vertices, constants, segments, faces, curves, functions) + '\n' + line);
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
    if (editType === 'number' || editType === 'color' || editType === 'bool') {
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

  // A lone view-setting line gets the same cheap treatment as a lone `edit`
  // line above — a direct field assignment, no snapshot (view settings are
  // outside undo/redo), no id-reassigning full rebuild.
  if (newRecs.length === 1 && newRecs[0].kind === 'view') {
    const { token, value } = newRecs[0].parsed;
    applyViewSettings({ [token]: value });
    input.value = '';
    resizeInterpreterInput();
    return;
  }

  const { newVertices, newConstants, newFunctions, newSegments, newFaces, newCurves } = buildCommittedArraysFromStaged(staged);

  lastSetVertex  = { ...staged.finalSet.vertex };
  lastSetSegment = { ...staged.finalSet.segment };
  lastSetFace    = { ...staged.finalSet.face };
  lastSetCurve   = { ...staged.finalSet.curve };
  // lastSet* just changed — renderConstList() below (via its own
  // renderAddRowDefaults() call) picks it up automatically, since the
  // add-rows now read lastSetVertex/lastSetSegment/lastSetFace directly
  // rather than a separately-synced shadow copy.
  syncNameCountersFromParse(staged.nameCounters);
  // A multi-line paste mixing a view-setting line with object/set/edit
  // lines falls through to here (the lone-line fast path above only covers
  // a single view line by itself) — still needs applying.
  applyViewSettings(staged.finalView);

  snapshot();
  vertices          = newVertices;
  nextVertexId      = newVertices.length;
  constants         = newConstants;
  nextConstantId    = newConstants.length;
  functions         = newFunctions;
  nextFunctionId    = newFunctions.length;
  segments          = newSegments;
  nextSegmentId     = newSegments.length;
  faces             = newFaces;
  nextFaceId        = newFaces.length;
  curves            = newCurves;
  nextCurveId       = newCurves.length;
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
  syncViewSettingToEditor('perspective', true);
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

sliderPersp.addEventListener('input',  () => {
  applyPerspParam(parseFloat(sliderPersp.value));
  syncViewSettingToEditor('invF', false);
});
sliderPersp.addEventListener('change', () => syncViewSettingToEditor('invF', true));
inputPersp.addEventListener('change',  () => {
  const v = parseFloat(inputPersp.value);
  if (!isNaN(v)) { applyPerspParam(v); syncViewSettingToEditor('invF', true); }
});

document.getElementById('btn-clip').addEventListener('click', () => {
  clipBehind = !clipBehind;
  document.getElementById('btn-clip').classList.toggle('active', clipBehind);
  syncViewSettingToEditor('clipBehind', true);
  draw();
});

document.getElementById('btn-scale-nodes').addEventListener('click', () => {
  perspScaleNodes = !perspScaleNodes;
  document.getElementById('btn-scale-nodes').classList.toggle('active', perspScaleNodes);
  syncViewSettingToEditor('scaleNodes', true);
  draw();
});

document.getElementById('btn-scale-segs').addEventListener('click', () => {
  perspScaleSegs = !perspScaleSegs;
  document.getElementById('btn-scale-segs').classList.toggle('active', perspScaleSegs);
  syncViewSettingToEditor('scaleSegments', true);
  draw();
});


// ─── Dark mode ────────────────────────────────────────────────────────────────

document.getElementById('btn-dark').addEventListener('click', () => {
  darkMode = !darkMode;
  document.body.classList.toggle('dark-mode', darkMode);
  document.getElementById('btn-dark').classList.toggle('active', darkMode);
  syncViewSettingToEditor('darkMode', true);
  draw();
});

// ─── View settings commit (code editor / interpreter → live state) ────────────
//
// The code-editor/interpreter-facing counterpart to every individual button
// handler above — applies a parsed view-settings object (parseCodeText's
// `finalView`, or a single field from a lone interpreter line) directly onto
// the same live globals those handlers touch, then resyncs every affected
// widget the same way each handler already does for its own field. Merges
// (only touches fields actually present in `view`) rather than replaces —
// same "only touches what's given" principle `edit` already uses — so a
// hand-edited file missing a line never wipes that setting back to some
// arbitrary default. Deliberately outside undo/redo and the code editor's
// live preview-while-typing (see VIEW_SETTINGS_FIELDS comment) — no
// snapshot() call here, matching lastSetVertex/etc.'s own tier.
function applyViewSettings(view) {
  if (!view) return;
  if ('darkMode' in view) {
    darkMode = view.darkMode;
    document.body.classList.toggle('dark-mode', darkMode);
    document.getElementById('btn-dark').classList.toggle('active', darkMode);
  }
  if ('mode' in view) {
    const newDisplayMode = view.mode === 'polynomial' ? 'A' : 'B';
    // 'pointer' is always z (see currentViewSettingsSnapshot), so an
    // explicit pointer line in this same commit fully determines the new
    // controlPt on its own (handled below) — converting here first would
    // just be overwritten. Only a *bare* mode change, with no accompanying
    // pointer, needs this: convert the existing controlPt the same way the
    // Compact/Polynomial buttons do, so the drawn image doesn't jump.
    if (newDisplayMode !== displayMode && !('pointer' in view)) {
      controlPt = newDisplayMode === 'A' ? cToZ(controlPt) : zToC(controlPt);
    }
    displayMode = newDisplayMode;
    setActive(['btn-modeA', 'btn-modeB'], displayMode === 'A' ? 'btn-modeA' : 'btn-modeB');
  }
  if ('anchor' in view) {
    paramMode = view.anchor === 'diagonal' ? 'diag' : 'u3';
    setActive(['btn-u3', 'btn-diag'], paramMode === 'diag' ? 'btn-diag' : 'btn-u3');
  }
  // An explicit 'pointer' always wins outright — taken as z, converted to
  // whichever *live* representation the final `displayMode` (resolved just
  // above) needs. No unit-disc validation needed anywhere in
  // parseViewSettingValue either: zToC lands inside the open disc for any
  // finite z, so an out-of-range value is structurally impossible here.
  if ('pointer' in view) {
    const z = new C(view.pointer.re, view.pointer.im);
    controlPt = displayMode === 'B' ? zToC(z) : z;
  }
  if ('showPointer' in view) {
    showPointer = view.showPointer;
    document.getElementById('btn-show-pointer').classList.toggle('active', showPointer);
  }
  if ('showAxes' in view) {
    showAxes = view.showAxes;
    document.getElementById('btn-axes').classList.toggle('active', showAxes);
  }
  if ('scale' in view) applyScale(view.scale);
  if ('perspective' in view) {
    perspectiveOn = view.perspective;
    updatePerspectiveUI();
  }
  if ('invF' in view) applyPerspParam(view.invF);
  if ('scaleNodes' in view) {
    perspScaleNodes = view.scaleNodes;
    document.getElementById('btn-scale-nodes').classList.toggle('active', perspScaleNodes);
  }
  if ('scaleSegments' in view) {
    perspScaleSegs = view.scaleSegments;
    document.getElementById('btn-scale-segs').classList.toggle('active', perspScaleSegs);
  }
  if ('clipBehind' in view) {
    clipBehind = view.clipBehind;
    document.getElementById('btn-clip').classList.toggle('active', clipBehind);
  }
  draw();
}

// The reverse direction from applyViewSettings: when a control-panel widget
// or a canvas pointer drag changes a view setting directly, keep the open
// code editor's own text in sync too, so the two surfaces never visibly
// disagree about the current camera/display state.
//
// Deliberately called only from the actual DOM event handlers below (button
// clicks, slider events, updateFromPointer) — never from applyViewSettings/
// applyScale/applyPerspParam themselves, even though those are shared by
// both directions. Reason: applyViewSettings already runs *from inside*
// reparseAndPreview() (typing in the editor), and if the shared apply-
// functions also wrote back into the editor, every keystroke would trigger
// a write of the exact text it was just read from — harmless in principle
// (round-trips to the same value), but pure waste, and a needless place for
// a future bug to hide. Keeping the write-back exclusively in the direct-
// interaction handlers means the two directions can never cross.
//
// `isFinal` distinguishes a continuous gesture's every-frame ticks (a
// canvas pointer drag, a slider mid-drag) from its one settling point (a
// button click, a slider's own 'change' event, pointerup/pointercancel):
// mid-gesture, this only does a cheap, targeted text splice (no reparse, no
// gutter/error rebuild) — cheap enough to call at pointermove frequency;
// the final tick also runs reparseAndPreview()/resetCodeLineTracking() so
// codeLineRecords/the gutter/error list catch up for real. Uses
// setRangeText(..., 'preserve') rather than reassigning textarea.value
// wholesale, so a caret/selection sitting elsewhere in the file (the user
// mid-typing something unrelated) isn't disturbed by this.
function syncViewSettingToEditor(token, isFinal) {
  if (!codeOpen) return;
  const textarea = document.getElementById('code-textarea');
  const lineText = `${token}: ${formatViewSettingValue(token, currentViewSettingsSnapshot()[token])}`;
  const match = new RegExp(`^${token}:.*$`, 'm').exec(textarea.value);
  // No matching line right now (the user deleted or is mid-retyping it) —
  // don't force one back in; a live control-panel change simply isn't
  // reflected in the text until a real line for it exists again.
  if (!match) return;
  textarea.setRangeText(lineText, match.index, match.index + match[0].length, 'preserve');
  if (isFinal) {
    reparseAndPreview();
    resetCodeLineTracking();
  }
}

// ─── Demo mode ──────────────────────────────────────────────────────────────
//
// A showcase toggle, not a manual — cycles through a handful of pre-built
// scenes so a repo visitor sees CubeParam's capabilities without typing
// anything. Each scene is plain DSL text, committed through the exact same
// parseCodeText/buildCommittedArraysFromStaged/applyViewSettings pipeline
// the code editor's own Save already uses — no separate rendering path.
//
// Design (settled in conversation, not guessed at):
// - Stays fully interactive — the control panel and code editor keep
//   working normally while a demo is showing, including opening the code
//   editor to see exactly how a scene is built.
// - Cycling to another scene ALWAYS discards any tinkering and reloads that
//   scene's pristine text fresh — a gallery view should never carry
//   baggage between exhibits.
// - Exiting demo mode ALWAYS restores the user's own document and view
//   (_preDemoState, captured on entry) — demo tinkering never overwrites
//   it. Each scene's own tinkering is instead saved into its own slot
//   (demoSceneLiveState, below) and resumed if that scene is revisited
//   later in the same tab. (An earlier design kept an edited scene as the
//   new live document on exit; corrected in NOTES12 — the user's document
//   and each scene are independent documents that never bleed together.)
// - DEMO_SCENES is static, embedded source text — cycling/entering always
//   reparses it fresh, nothing ever writes back into it, so no amount of
//   in-session tinkering can affect what a future session's demos look
//   like (a fresh page load always starts from this same text).
// - Demo-mode transitions (enter/cycle/exit) each start a fresh undo/redo
//   history — "undo" should never reach back across a scene boundary into
//   a different scene or into the pre-demo content.
const DEMO_SCENES = [
  { name: 'Cube', codeText: `
#======== VIEW SETTINGS ========

darkMode: false
mode: polynomial
anchor: diagonal
pointer: 0.173333, 1.06
showPointer: true
showAxes: false
scale: 1
perspective: false
invF: 0
scaleNodes: false
scaleSegments: false
clipBehind: true

#======== AUXILIARY CONSTANTS ========

#======== POLYTOPES ========

#-------- VERTICES --------

set vertex: color=#4d4d4d
set vertex: r=5
set vertex: visible=true
set vertex: label=true
set vertex: naming=P

vertex P0: x=0  y=0  z=0  color=#4d4d4d  r=5  visible=false  label=true
vertex P1: x=0  y=0  z=1  color=#4d4d4d  r=5  visible=false  label=true
vertex P2: x=0  y=1  z=0  color=#4d4d4d  r=5  visible=false  label=true
vertex P3: x=0  y=1  z=1  color=#4d4d4d  r=5  visible=false  label=true
vertex P4: x=1  y=0  z=0  color=#4d4d4d  r=5  visible=false  label=true
vertex P5: x=1  y=0  z=1  color=#4d4d4d  r=5  visible=false  label=true
vertex P6: x=1  y=1  z=0  color=#4d4d4d  r=5  visible=false  label=true
vertex P7: x=1  y=1  z=1  color=#4d4d4d  r=5  visible=false  label=true

#-------- SEGMENTS --------

set segment: color=#4d4d4d
set segment: w=1.5
set segment: visible=true
set segment: naming=S

segment S0:  P4  P5  color=#4d4d4d  w=1.5  visible=true
segment S1:  P0  P1  color=#4d4d4d  w=1.5  visible=true
segment S2:  P2  P3  color=#4d4d4d  w=1.5  visible=true
segment S3:  P6  P7  color=#4d4d4d  w=1.5  visible=true
segment S4:  P5  P1  color=#4d4d4d  w=1.5  visible=true
segment S5:  P4  P0  color=#4d4d4d  w=1.5  visible=true
segment S6:  P7  P3  color=#4d4d4d  w=1.5  visible=true
segment S7:  P6  P2  color=#4d4d4d  w=1.5  visible=true
segment S8:  P4  P6  color=#4d4d4d  w=1.5  visible=true
segment S9:  P0  P2  color=#4d4d4d  w=1.5  visible=true
segment S10:  P5  P7  color=#4d4d4d  w=1.5  visible=true
segment S11:  P1  P3  color=#4d4d4d  w=1.5  visible=true

#-------- FACES --------

set face: color=#4d4d4d
set face: visible=true
set face: naming=F

#======== AUXILIARY FUNCTIONS ========

#-------- CURVES --------

set curve: color=#4d4d4d
set curve: visible=true
set curve: naming=C

#----------------------------------------
` },
  { name: 'Rhombic Dodecahedron', codeText: `
#======== VIEW SETTINGS ========

darkMode: false
mode: polynomial
anchor: zaxis
pointer: -0.205208, 0.87862
showPointer: true
showAxes: true
scale: 1
perspective: false
invF: 0.292
scaleNodes: false
scaleSegments: false
clipBehind: true

#======== AUXILIARY CONSTANTS ========

number s: 1/2
number sw: 2

#======== POLYTOPES ========

#-------- VERTICES --------

set vertex: color=#4d4d4d
set vertex: r=5
set vertex: visible=true
set vertex: label=true
set vertex: naming=P

vertex P0: x=s  y=s  z=s  color=#4d4d4d  r=5  visible=true  label=true
vertex P1: x=s  y=s  z=-s  color=#4d4d4d  r=5  visible=true  label=true
vertex P2: x=s  y=-s  z=s  color=#4d4d4d  r=5  visible=true  label=true
vertex P3: x=s  y=-s  z=-s  color=#4d4d4d  r=5  visible=true  label=true
vertex P4: x=-s  y=s  z=s  color=#4d4d4d  r=5  visible=true  label=true
vertex P5: x=-s  y=s  z=-s  color=#4d4d4d  r=5  visible=true  label=true
vertex P6: x=-s  y=-s  z=s  color=#4d4d4d  r=5  visible=true  label=true
vertex P7: x=-s  y=-s  z=-s  color=#4d4d4d  r=5  visible=true  label=true
vertex P8: x=2*s  y=0  z=0  color=#4d4d4d  r=5  visible=true  label=true
vertex P9: x=-2*s  y=0  z=0  color=#4d4d4d  r=5  visible=true  label=true
vertex P10: x=0  y=2*s  z=0  color=#4d4d4d  r=5  visible=true  label=true
vertex P11: x=0  y=-2*s  z=0  color=#4d4d4d  r=5  visible=true  label=true
vertex P12: x=0  y=0  z=2*s  color=#4d4d4d  r=5  visible=true  label=true
vertex P13: x=0  y=0  z=-2*s  color=#4d4d4d  r=5  visible=true  label=true

#-------- SEGMENTS --------

set segment: color=#4d4d4d
set segment: w=1.5
set segment: visible=true
set segment: naming=S

segment S0:  P8  P1  color=#4d4d4d  w=sw  visible=true
segment S1:  P1  P13  color=#4d4d4d  w=sw  visible=true
segment S2:  P13  P5  color=#4d4d4d  w=sw  visible=true
segment S3:  P5  P9  color=#4d4d4d  w=sw  visible=true
segment S4:  P9  P6  color=#4d4d4d  w=sw  visible=true
segment S5:  P6  P12  color=#4d4d4d  w=sw  visible=true
segment S6:  P12  P2  color=#4d4d4d  w=sw  visible=true
segment S7:  P2  P8  color=#4d4d4d  w=sw  visible=true
segment S8:  P8  P0  color=#4d4d4d  w=sw  visible=true
segment S9:  P0  P12  color=#4d4d4d  w=sw  visible=true
segment S10:  P9  P7  color=#4d4d4d  w=sw  visible=true
segment S11:  P7  P13  color=#4d4d4d  w=sw  visible=true
segment S12:  P5  P10  color=#4d4d4d  w=sw  visible=true
segment S13:  P10  P1  color=#4d4d4d  w=sw  visible=true
segment S14:  P10  P0  color=#4d4d4d  w=sw  visible=true
segment S15:  P12  P4  color=#4d4d4d  w=sw  visible=true
segment S16:  P4  P10  color=#4d4d4d  w=sw  visible=true
segment S17:  P4  P9  color=#4d4d4d  w=sw  visible=true
segment S18:  P11  P6  color=#4d4d4d  w=sw  visible=true
segment S19:  P11  P7  color=#4d4d4d  w=sw  visible=true
segment S20:  P11  P2  color=#4d4d4d  w=sw  visible=true
segment S21:  P11  P3  color=#4d4d4d  w=sw  visible=true
segment S22:  P3  P8  color=#4d4d4d  w=sw  visible=true
segment S23:  P3  P13  color=#4d4d4d  w=sw  visible=true

#-------- FACES --------

set face: color=#4d4d4d
set face: visible=true
set face: naming=F

#======== AUXILIARY FUNCTIONS ========

#-------- CURVES --------

set curve: color=#4d4d4d
set curve: visible=true
set curve: naming=C

#----------------------------------------
` },
  { name: 'Compound of 5 Tetrahedra', codeText: `
#======== VIEW SETTINGS ========

darkMode: false
mode: compact
anchor: zaxis
pointer: 0, 0
showPointer: true
showAxes: false
scale: 1
perspective: false
invF: 0
scaleNodes: false
scaleSegments: false
clipBehind: true

#======== AUXILIARY CONSTANTS ========

number phi: (1+\\sqrt(5))/2
number s: 1/4
color d1: #808080
color c1: #b62228
color c2: #ed6739
color c3: #fabc50
color c4: #0092be
color c5: #721930
bool vlab: false
bool vvis: false
bool svis: false
bool fvis1: true
bool fvis2: true
bool fvis3: true
bool fvis4: true
bool fvis5: true

#======== POLYTOPES ========

#-------- VERTICES --------

set vertex: color=#ff8000
set vertex: r=5
set vertex: visible=true
set vertex: label=false
set vertex: naming=P

vertex P0: x=s*(phi+1)  y=s  z=0  color=d1  r=5  visible=vvis  label=vlab
vertex P1: x=s*(phi+1)  y=-s  z=0  color=d1  r=5  visible=vvis  label=vlab
vertex P2: x=-s*(phi+1)  y=s  z=0  color=d1  r=5  visible=vvis  label=vlab
vertex P3: x=-s*(phi+1)  y=-s  z=0  color=d1  r=5  visible=vvis  label=vlab
vertex P4: x=0  y=s*(phi+1)  z=s  color=d1  r=5  visible=vvis  label=vlab
vertex P5: x=0  y=s*(phi+1)  z=-s  color=d1  r=5  visible=vvis  label=vlab
vertex P6: x=0  y=-s*(phi+1)  z=s  color=d1  r=5  visible=vvis  label=vlab
vertex P7: x=0  y=-s*(phi+1)  z=-s  color=d1  r=5  visible=vvis  label=vlab
vertex P8: x=s  y=0  z=s*(phi+1)  color=d1  r=5  visible=vvis  label=vlab
vertex P9: x=-s  y=0  z=s*(phi+1)  color=d1  r=5  visible=vvis  label=vlab
vertex P10: x=s  y=0  z=-s*(phi+1)  color=d1  r=5  visible=vvis  label=vlab
vertex P11: x=-s  y=0  z=-s*(phi+1)  color=d1  r=5  visible=vvis  label=vlab
vertex P12: x=s*phi  y=s*phi  z=s*phi  color=d1  r=5  visible=vvis  label=vlab
vertex P13: x=s*phi  y=s*phi  z=-s*phi  color=d1  r=5  visible=vvis  label=vlab
vertex P14: x=s*phi  y=-s*phi  z=s*phi  color=d1  r=5  visible=vvis  label=vlab
vertex P15: x=s*phi  y=-s*phi  z=-s*phi  color=d1  r=5  visible=vvis  label=vlab
vertex P16: x=-s*phi  y=s*phi  z=s*phi  color=d1  r=5  visible=vvis  label=vlab
vertex P17: x=-s*phi  y=s*phi  z=-s*phi  color=d1  r=5  visible=vvis  label=vlab
vertex P18: x=-s*phi  y=-s*phi  z=s*phi  color=d1  r=5  visible=vvis  label=vlab
vertex P19: x=-s*phi  y=-s*phi  z=-s*phi  color=d1  r=5  visible=vvis  label=vlab

#-------- SEGMENTS --------

set segment: color=#4d4d4d
set segment: w=1.5
set segment: visible=true
set segment: naming=S

#-------- FACES --------

set face: color=c5
set face: visible=true
set face: naming=F

face F0: P0  P6  P11  color=c1  visible=fvis1
face F1: P0  P6  P16  color=c1  visible=fvis1
face F2: P0  P16  P11  color=c1  visible=fvis1
face F3: P16  P6  P11  color=c1  visible=fvis1
face F4: P1  P5  P9  color=c2  visible=fvis2
face F5: P1  P5  P19  color=c2  visible=fvis2
face F6: P1  P9  P19  color=c2  visible=fvis2
face F7: P5  P9  P19  color=c2  visible=fvis2
face F8: P2  P7  P8  color=c3  visible=fvis3
face F9: P2  P7  P13  color=c3  visible=fvis3
face F10: P2  P8  P13  color=c3  visible=fvis3
face F11: P7  P8  P13  color=c3  visible=fvis3
face F12: P3  P4  P10  color=c4  visible=fvis4
face F13: P3  P4  P14  color=c4  visible=fvis4
face F14: P3  P10  P14  color=c4  visible=fvis4
face F15: P4  P10  P14  color=c4  visible=fvis4
face F16: P12  P15  P17  color=c5  visible=fvis5
face F17: P12  P15  P18  color=c5  visible=fvis5
face F18: P12  P17  P18  color=c5  visible=fvis5
face F19: P15  P17  P18  color=c5  visible=fvis5

#======== AUXILIARY FUNCTIONS ========

#-------- CURVES --------

set curve: color=#4d4d4d
set curve: visible=true
set curve: naming=C

#----------------------------------------
` },
  { name: 'Trefoil Knot', codeText: `
#======== VIEW SETTINGS ========

darkMode: false
mode: compact
anchor: diagonal
pointer: -0.184898, 0.207175
showPointer: true
showAxes: false
scale: 0.75
perspective: true
invF: 0.292
scaleNodes: false
scaleSegments: false
clipBehind: true

#======== AUXILIARY CONSTANTS ========

number a: 3/2
number b: 5/2
number c: 1/4
number s: 1/2
bool outvlab: false
bool outvvis: false
bool corevlab: false
bool corevvis: false
bool outslab: false
bool outsvis: false
bool coresvis: false
color c1: #b62228
color c2: #ed6739
color c3: #fabc50
color c4: #0092be
color c5: #721930

#-------- VERTICES --------

set vertex: color=#4d4d4d
set vertex: r=5
set vertex: visible=outvvis
set vertex: label=outvlab
set vertex: naming=P

vertex P0: x=2/3  y=-1/3  z=-1/3-a  color=#4d4d4d  r=5  visible=corevvis  label=corevlab
vertex P1: x=2/3  y=-1/3  z=-1/3+b  color=#4d4d4d  r=5  visible=corevvis  label=corevlab
vertex P2: x=-1/3-a  y=-1/3  z=-1/3+b  color=#4d4d4d  r=5  visible=corevvis  label=corevlab
vertex P3: x=-1/3-a  y=2/3  z=-1/3+b  color=#4d4d4d  r=5  visible=corevvis  label=corevlab
vertex P4: x=-1/3-a  y=2/3  z=-1/3  color=#4d4d4d  r=5  visible=corevvis  label=corevlab
vertex P5: x=-1/3+b  y=2/3  z=-1/3  color=#4d4d4d  r=5  visible=corevvis  label=corevlab
vertex P6: x=-1/3+b  y=-1/3-a  z=-1/3  color=#4d4d4d  r=5  visible=corevvis  label=corevlab
vertex P7: x=-1/3+b  y=-1/3-a  z=2/3  color=#4d4d4d  r=5  visible=corevvis  label=corevlab
vertex P8: x=-1/3  y=-1/3-a  z=2/3  color=#4d4d4d  r=5  visible=corevvis  label=corevlab
vertex P9: x=-1/3  y=-1/3+b  z=2/3  color=#4d4d4d  r=5  visible=corevvis  label=corevlab
vertex P10: x=-1/3  y=-1/3+b  z=-1/3-a  color=#4d4d4d  r=5  visible=corevvis  label=corevlab
vertex P11: x=2/3  y=-1/3+b  z=-1/3-a  color=#4d4d4d  r=5  visible=corevvis  label=corevlab
vertex P12: x=s*(2/3+c)  y=s*(-1/3+c)  z=s*(-1/3-a+c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P13: x=s*(2/3-c)  y=s*(-1/3+c)  z=s*(-1/3-a+c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P14: x=s*(2/3+c)  y=s*(-1/3-c)  z=s*(-1/3-a-c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P15: x=s*(2/3-c)  y=s*(-1/3-c)  z=s*(-1/3-a-c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P16: x=s*(2/3+c)  y=s*(-1/3+c)  z=s*(-1/3+b+c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P17: x=s*(2/3+c)  y=s*(-1/3-c)  z=s*(-1/3+b+c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P18: x=s*(2/3-c)  y=s*(-1/3+c)  z=s*(-1/3+b-c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P19: x=s*(2/3-c)  y=s*(-1/3-c)  z=s*(-1/3+b-c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P20: x=s*(-1/3-a+c)  y=s*(-1/3+c)  z=s*(-1/3+b+c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P21: x=s*(-1/3-a+c)  y=s*(-1/3+c)  z=s*(-1/3+b-c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P22: x=s*(-1/3-a-c)  y=s*(-1/3-c)  z=s*(-1/3+b+c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P23: x=s*(-1/3-a-c)  y=s*(-1/3-c)  z=s*(-1/3+b-c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P24: x=s*(-1/3-a+c)  y=s*(2/3+c)  z=s*(-1/3+b+c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P25: x=s*(-1/3-a-c)  y=s*(2/3+c)  z=s*(-1/3+b+c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P26: x=s*(-1/3-a+c)  y=s*(2/3-c)  z=s*(-1/3+b-c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P27: x=s*(-1/3-a-c)  y=s*(2/3-c)  z=s*(-1/3+b-c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P28: x=s*(-1/3-a+c)  y=s*(2/3+c)  z=s*(-1/3+c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P29: x=s*(-1/3-a+c)  y=s*(2/3-c)  z=s*(-1/3+c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P30: x=s*(-1/3-a-c)  y=s*(2/3+c)  z=s*(-1/3-c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P31: x=s*(-1/3-a-c)  y=s*(2/3-c)  z=s*(-1/3-c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P32: x=s*(-1/3+b+c)  y=s*(2/3+c)  z=s*(-1/3+c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P33: x=s*(-1/3+b+c)  y=s*(2/3+c)  z=s*(-1/3-c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P34: x=s*(-1/3+b-c)  y=s*(2/3-c)  z=s*(-1/3+c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P35: x=s*(-1/3+b-c)  y=s*(2/3-c)  z=s*(-1/3-c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P36: x=s*(-1/3+b+c)  y=s*(-1/3-a+c)  z=s*(-1/3+c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P37: x=s*(-1/3+b-c)  y=s*(-1/3-a+c)  z=s*(-1/3+c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P38: x=s*(-1/3+b+c)  y=s*(-1/3-a-c)  z=s*(-1/3-c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P39: x=s*(-1/3+b-c)  y=s*(-1/3-a-c)  z=s*(-1/3-c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P40: x=s*(-1/3+b+c)  y=s*(-1/3-a+c)  z=s*(2/3+c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P41: x=s*(-1/3+b+c)  y=s*(-1/3-a-c)  z=s*(2/3+c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P42: x=s*(-1/3+b-c)  y=s*(-1/3-a+c)  z=s*(2/3-c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P43: x=s*(-1/3+b-c)  y=s*(-1/3-a-c)  z=s*(2/3-c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P44: x=s*(-1/3+c)  y=s*(-1/3-a+c)  z=s*(2/3+c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P45: x=s*(-1/3+c)  y=s*(-1/3-a+c)  z=s*(2/3-c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P46: x=s*(-1/3-c)  y=s*(-1/3-a-c)  z=s*(2/3+c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P47: x=s*(-1/3-c)  y=s*(-1/3-a-c)  z=s*(2/3-c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P48: x=s*(-1/3+c)  y=s*(-1/3+b+c)  z=s*(2/3+c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P49: x=s*(-1/3-c)  y=s*(-1/3+b+c)  z=s*(2/3+c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P50: x=s*(-1/3+c)  y=s*(-1/3+b-c)  z=s*(2/3-c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P51: x=s*(-1/3-c)  y=s*(-1/3+b-c)  z=s*(2/3-c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P52: x=s*(-1/3+c)  y=s*(-1/3+b+c)  z=s*(-1/3-a+c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P53: x=s*(-1/3+c)  y=s*(-1/3+b-c)  z=s*(-1/3-a+c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P54: x=s*(-1/3-c)  y=s*(-1/3+b+c)  z=s*(-1/3-a-c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P55: x=s*(-1/3-c)  y=s*(-1/3+b-c)  z=s*(-1/3-a-c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P56: x=s*(2/3+c)  y=s*(-1/3+b+c)  z=s*(-1/3-a+c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P57: x=s*(2/3+c)  y=s*(-1/3+b+c)  z=s*(-1/3-a-c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P58: x=s*(2/3-c)  y=s*(-1/3+b-c)  z=s*(-1/3-a+c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab
vertex P59: x=s*(2/3-c)  y=s*(-1/3+b-c)  z=s*(-1/3-a-c)  color=#4d4d4d  r=5  visible=outvvis  label=outvlab

#-------- SEGMENTS --------

set segment: color=#4d4d4d
set segment: w=1.5
set segment: visible=true
set segment: naming=S

segment S0:  P0  P1  color=#4d4d4d  w=1.5  visible=coresvis
segment S1:  P1  P2  color=#4d4d4d  w=1.5  visible=coresvis
segment S2:  P2  P3  color=#4d4d4d  w=1.5  visible=coresvis
segment S3:  P3  P4  color=#4d4d4d  w=1.5  visible=coresvis
segment S4:  P4  P5  color=#4d4d4d  w=1.5  visible=coresvis
segment S5:  P5  P6  color=#4d4d4d  w=1.5  visible=coresvis
segment S6:  P6  P7  color=#4d4d4d  w=1.5  visible=coresvis
segment S7:  P7  P8  color=#4d4d4d  w=1.5  visible=coresvis
segment S8:  P8  P9  color=#4d4d4d  w=1.5  visible=coresvis
segment S9:  P9  P10  color=#4d4d4d  w=1.5  visible=coresvis
segment S10:  P10  P11  color=#4d4d4d  w=1.5  visible=coresvis
segment S11:  P11  P0  color=#4d4d4d  w=1.5  visible=coresvis
segment S12:  P25  P30  color=#4d4d4d  w=1.5  visible=outsvis
segment S13:  P30  P33  color=#4d4d4d  w=1.5  visible=outsvis
segment S14:  P33  P38  color=#4d4d4d  w=1.5  visible=outsvis
segment S15:  P38  P41  color=#4d4d4d  w=1.5  visible=outsvis
segment S16:  P41  P46  color=#4d4d4d  w=1.5  visible=outsvis
segment S17:  P46  P49  color=#4d4d4d  w=1.5  visible=outsvis
segment S18:  P49  P54  color=#4d4d4d  w=1.5  visible=outsvis
segment S19:  P54  P57  color=#4d4d4d  w=1.5  visible=outsvis
segment S20:  P57  P14  color=#4d4d4d  w=1.5  visible=outsvis
segment S21:  P14  P17  color=#4d4d4d  w=1.5  visible=outsvis
segment S22:  P17  P22  color=#4d4d4d  w=1.5  visible=outsvis
segment S23:  P22  P25  color=#4d4d4d  w=1.5  visible=outsvis
segment S24:  P27  P31  color=#4d4d4d  w=1.5  visible=outsvis
segment S25:  P31  P35  color=#4d4d4d  w=1.5  visible=outsvis
segment S26:  P35  P39  color=#4d4d4d  w=1.5  visible=outsvis
segment S27:  P39  P43  color=#4d4d4d  w=1.5  visible=outsvis
segment S28:  P43  P47  color=#4d4d4d  w=1.5  visible=outsvis
segment S29:  P47  P51  color=#4d4d4d  w=1.5  visible=outsvis
segment S30:  P51  P55  color=#4d4d4d  w=1.5  visible=outsvis
segment S31:  P55  P59  color=#4d4d4d  w=1.5  visible=outsvis
segment S32:  P59  P15  color=#4d4d4d  w=1.5  visible=outsvis
segment S33:  P15  P19  color=#4d4d4d  w=1.5  visible=outsvis
segment S34:  P19  P23  color=#4d4d4d  w=1.5  visible=outsvis
segment S35:  P23  P27  color=#4d4d4d  w=1.5  visible=outsvis
segment S36:  P26  P29  color=#4d4d4d  w=1.5  visible=outsvis
segment S37:  P29  P34  color=#4d4d4d  w=1.5  visible=outsvis
segment S38:  P34  P37  color=#4d4d4d  w=1.5  visible=outsvis
segment S39:  P37  P42  color=#4d4d4d  w=1.5  visible=outsvis
segment S40:  P42  P45  color=#4d4d4d  w=1.5  visible=outsvis
segment S41:  P45  P50  color=#4d4d4d  w=1.5  visible=outsvis
segment S42:  P50  P53  color=#4d4d4d  w=1.5  visible=outsvis
segment S43:  P53  P58  color=#4d4d4d  w=1.5  visible=outsvis
segment S44:  P58  P13  color=#4d4d4d  w=1.5  visible=outsvis
segment S45:  P13  P18  color=#4d4d4d  w=1.5  visible=outsvis
segment S46:  P18  P21  color=#4d4d4d  w=1.5  visible=outsvis
segment S47:  P21  P26  color=#4d4d4d  w=1.5  visible=outsvis
segment S48:  P24  P28  color=#4d4d4d  w=1.5  visible=outsvis
segment S49:  P28  P32  color=#4d4d4d  w=1.5  visible=outsvis
segment S50:  P32  P36  color=#4d4d4d  w=1.5  visible=outsvis
segment S51:  P36  P40  color=#4d4d4d  w=1.5  visible=outsvis
segment S52:  P40  P44  color=#4d4d4d  w=1.5  visible=outsvis
segment S53:  P44  P48  color=#4d4d4d  w=1.5  visible=outsvis
segment S54:  P48  P52  color=#4d4d4d  w=1.5  visible=outsvis
segment S55:  P52  P56  color=#4d4d4d  w=1.5  visible=outsvis
segment S56:  P56  P12  color=#4d4d4d  w=1.5  visible=outsvis
segment S57:  P12  P16  color=#4d4d4d  w=1.5  visible=outsvis
segment S58:  P16  P20  color=#4d4d4d  w=1.5  visible=outsvis
segment S59:  P20  P24  color=#4d4d4d  w=1.5  visible=outsvis
segment S60:  P23  P22  color=#4d4d4d  w=1.5  visible=outsvis
segment S61:  P21  P20  color=#4d4d4d  w=1.5  visible=outsvis
segment S62:  P24  P25  color=#4d4d4d  w=1.5  visible=outsvis
segment S63:  P27  P26  color=#4d4d4d  w=1.5  visible=outsvis
segment S64:  P28  P29  color=#4d4d4d  w=1.5  visible=outsvis
segment S65:  P31  P30  color=#4d4d4d  w=1.5  visible=outsvis
segment S66:  P33  P32  color=#4d4d4d  w=1.5  visible=outsvis
segment S67:  P35  P34  color=#4d4d4d  w=1.5  visible=outsvis
segment S68:  P39  P38  color=#4d4d4d  w=1.5  visible=outsvis
segment S69:  P37  P36  color=#4d4d4d  w=1.5  visible=outsvis
segment S70:  P43  P42  color=#4d4d4d  w=1.5  visible=outsvis
segment S71:  P40  P41  color=#4d4d4d  w=1.5  visible=outsvis
segment S72:  P47  P46  color=#4d4d4d  w=1.5  visible=outsvis
segment S73:  P45  P44  color=#4d4d4d  w=1.5  visible=outsvis
segment S74:  P51  P50  color=#4d4d4d  w=1.5  visible=outsvis
segment S75:  P49  P48  color=#4d4d4d  w=1.5  visible=outsvis
segment S76:  P53  P52  color=#4d4d4d  w=1.5  visible=outsvis
segment S77:  P55  P54  color=#4d4d4d  w=1.5  visible=outsvis
segment S78:  P56  P57  color=#4d4d4d  w=1.5  visible=outsvis
segment S79:  P59  P58  color=#4d4d4d  w=1.5  visible=outsvis
segment S80:  P12  P13  color=#4d4d4d  w=1.5  visible=outsvis
segment S81:  P15  P14  color=#4d4d4d  w=1.5  visible=outsvis
segment S82:  P18  P19  color=#4d4d4d  w=1.5  visible=outsvis
segment S83:  P16  P17  color=#4d4d4d  w=1.5  visible=outsvis

#-------- FACES --------

set face: color=#4d4d4d
set face: visible=true
set face: naming=F

face F0: P51  P55  P59  P58  P53  P50  color=c2  visible=true
face F1: P58  P13  P18  P19  P15  P59  color=c5  visible=true
face F2: P19  P23  P27  P26  P21  P18  color=c2  visible=true
face F3: P27  P31  P35  P34  P29  P26  color=c5  visible=true
face F4: P34  P37  P42  P43  P39  P35  color=c2  visible=true
face F5: P43  P47  P51  P50  P45  P42  color=c5  visible=true
face F6: P49  P54  P57  P56  P52  P48  color=c5  visible=true
face F7: P56  P12  P16  P17  P14  P57  color=c2  visible=true
face F8: P17  P22  P25  P24  P20  P16  color=c5  visible=true
face F9: P25  P30  P33  P32  P28  P24  color=c2  visible=true
face F10: P40  P36  P32  P33  P38  P41  color=c5  visible=true
face F11: P41  P46  P49  P48  P44  P40  color=c2  visible=true
face F12: P22  P25  P30  P31  P27  P23  color=c3  visible=true
face F13: P31  P35  P39  P38  P33  P30  color=c1  visible=true
face F14: P39  P43  P47  P46  P41  P38  color=c3  visible=true
face F15: P47  P46  P49  P54  P55  P51  color=c1  visible=true
face F16: P55  P59  P15  P14  P57  P54  color=c3  visible=true
face F17: P15  P19  P23  P22  P17  P14  color=c1  visible=true
face F18: P52  P48  P44  P45  P50  P53  color=c3  visible=true
face F19: P52  P53  P58  P13  P12  P56  color=c1  visible=true
face F20: P12  P13  P18  P21  P20  P16  color=c3  visible=true
face F21: P21  P26  P29  P28  P24  P20  color=c1  visible=true
face F22: P28  P29  P34  P37  P36  P32  color=c3  visible=true
face F23: P37  P42  P45  P44  P40  P36  color=c1  visible=true

#======== AUXILIARY FUNCTIONS ========

#-------- CURVES --------

set curve: color=#4d4d4d
set curve: visible=true
set curve: naming=C

#----------------------------------------
` },
  { name: 'Loxodrome Spherical Spiral Ribbon', codeText: `
#======== VIEW SETTINGS ========

darkMode: false
mode: compact
anchor: zaxis
pointer: 0.35339, 0.35448
showPointer: true
showAxes: false
scale: 1
perspective: false
invF: 0
scaleNodes: false
scaleSegments: false
clipBehind: true

#======== AUXILIARY CONSTANTS ========

number k: 8
number s: 1
number eps: 0.15

#======== POLYTOPES ========

#-------- VERTICES --------

set vertex: color=#4d4d4d
set vertex: r=5
set vertex: visible=true
set vertex: label=true
set vertex: naming=P

#-------- SEGMENTS --------

set segment: color=#4d4d4d
set segment: w=1.5
set segment: visible=true
set segment: naming=S

#-------- FACES --------

set face: color=#4d4d4d
set face: visible=true
set face: naming=F

#======== AUXILIARY FUNCTIONS ========

function sech: t -> 2/(\\e^t+\\e^(-t))
function fz: t -> (\\e^t-\\e^(-t))/(\\e^t+\\e^(-t))
function fx: u, s -> sech(u)*\\cos(k*u+s*eps)
function fy: u, s -> sech(u)*\\sin(k*u+s*eps)

#-------- CURVES --------

set curve: color=#4d4d4d
set curve: visible=true
set curve: naming=C

curve C0: x=s*fx(t,0) ; y=s*fy(t,0) ; z=s*fz(t) ; t in [-32, 32]  color=#4d4d4d  visible=true
curve C1: x=s*fx(t,1) ; y=s*fy(t,1) ; z=s*fz(t) ; t in [-32, 32]  color=#4d4d4d  visible=true
curve C2: x=s*fx(t,2) ; y=s*fy(t,2) ; z=s*fz(t) ; t in [-32, 32]  color=#4d4d4d  visible=true
curve C3: x=s*fx(t,3) ; y=s*fy(t,3) ; z=s*fz(t) ; t in [-32, 32]  color=#4d4d4d  visible=true
curve C4: x=s*fx(t,4) ; y=s*fy(t,4) ; z=s*fz(t) ; t in [-32, 32]  color=#4d4d4d  visible=true
curve C5: x=s*fx(t,5) ; y=s*fy(t,5) ; z=s*fz(t) ; t in [-32, 32]  color=#4d4d4d  visible=true
curve C6: x=s*fx(t,6) ; y=s*fy(t,6) ; z=s*fz(t) ; t in [-32, 32]  color=#4d4d4d  visible=true
curve C7: x=s*fx(t,7) ; y=s*fy(t,7) ; z=s*fz(t) ; t in [-32, 32]  color=#4d4d4d  visible=true
curve C8: x=s*fx(t,8) ; y=s*fy(t,8) ; z=s*fz(t) ; t in [-32, 32]  color=#4d4d4d  visible=true

#----------------------------------------
` },
  { name: 'Constellations', forceDark: true, codeText: `
darkMode: true
mode: compact
anchor: zaxis
pointer: 0.136056, 1.016145
showPointer: true
showAxes: false
scale: 5
perspective: true
invF: 1
scaleNodes: false
scaleSegments: false
clipBehind: true


color col0: #000000
color col1: #c0c0c0
color gridCol: #b0b0e0
color PolarisCol: #00c0ff
bool vis0: true
bool vis1: true
bool lab: false
number s: 1
number a: 2
number b: 3 
number wid: 0.5 
bool RadByBright: true
bool ShowGrid: true 


color col0Ant : col0
bool visAnt : true
bool labAnt : false
color col1Ant : col1
bool showNameAnt : false
color col0Ara : col0
bool visAra : true
bool labAra : false
color col1Ara : col1
bool showNameAra : false
color col0And : col0
bool visAnd : true
bool labAnd : false
color col1And : col1
bool showNameAnd : false
color col0Sgr : col0
bool visSgr : true
bool labSgr : false
color col1Sgr : col1
bool showNameSgr : false
color col0Sge : col0
bool visSge : true
bool labSge : false
color col1Sge : col1
bool showNameSge : false
color col0Com : col0
bool visCom : true
bool labCom : false
color col1Com : col1
bool showNameCom : false
color col0Aps : col0
bool visAps : true
bool labAps : false
color col1Aps : col1
bool showNameAps : false
color col0Boo : col0
bool visBoo : true
bool labBoo : false
color col1Boo : col1
bool showNameBoo : false
color col0Tau : col0
bool visTau : true
bool labTau : false
color col1Tau : col1
bool showNameTau : false
color col0Cap : col0
bool visCap : true
bool labCap : false
color col1Cap : col1
bool showNameCap : false
color col0Nor : col0
bool visNor : true
bool labNor : false
color col1Nor : col1
bool showNameNor : false
color col0Cas : col0
bool visCas : true
bool labCas : false
color col1Cas : col1
bool showNameCas : false
color col0Cen : col0
bool visCen : true
bool labCen : false
color col1Cen : col1
bool showNameCen : false
color col0Cep : col0
bool visCep : true
bool labCep : false
color col1Cep : col1
bool showNameCep : false
color col0Cha : col0
bool visCha : true
bool labCha : false
color col1Cha : col1
bool showNameCha : false
color col0Aur : col0
bool visAur : true
bool labAur : false
color col1Aur : col1
bool showNameAur : false
color col0Hor : col0
bool visHor : true
bool labHor : false
color col1Hor : col1
bool showNameHor : false
color col0Cnc : col0
bool visCnc : true
bool labCnc : false
color col1Cnc : col1
bool showNameCnc : false
color col0Gru : col0
bool visGru : true
bool labGru : false
color col1Gru : col1
bool showNameGru : false
color col0Crv : col0
bool visCrv : true
bool labCrv : false
color col1Crv : col1
bool showNameCrv : false
color col0Crt : col0
bool visCrt : true
bool labCrt : false
color col1Crt : col1
bool showNameCrt : false
color col0Del : col0
bool visDel : true
bool labDel : false
color col1Del : col1
bool showNameDel : false
color col0Col : col0
bool visCol : true
bool labCol : false
color col1Col : col1
bool showNameCol : false
color col0Dra : col0
bool visDra : true
bool labDra : false
color col1Dra : col1
bool showNameDra : false
color col0Cir : col0
bool visCir : true
bool labCir : false
color col1Cir : col1
bool showNameCir : false
color col0Aql : col0
bool visAql : true
bool labAql : false
color col1Aql : col1
bool showNameAql : false
color col0Cae : col0
bool visCae : true
bool labCae : false
color col1Cae : col1
bool showNameCae : false
color col0Eri : col0
bool visEri : true
bool labEri : false
color col1Eri : col1
bool showNameEri : false
color col0Psc : col0
bool visPsc : true
bool labPsc : false
color col1Psc : col1
bool showNamePsc : false
color col0Mus : col0
bool visMus : true
bool labMus : false
color col1Mus : col1
bool showNameMus : false
color col0Vol : col0
bool visVol : true
bool labVol : false
color col1Vol : col1
bool showNameVol : false
color col0Vul : col0
bool visVul : true
bool labVul : false
color col1Vul : col1
bool showNameVul : false
color col0For : col0
bool visFor : true
bool labFor : false
color col1For : col1
bool showNameFor : false
color col0Cam : col0
bool visCam : true
bool labCam : false
color col1Cam : col1
bool showNameCam : false
color col0UMa : col0
bool visUMa : true
bool labUMa : false
color col1UMa : col1
bool showNameUMa : false
color col0CMa : col0
bool visCMa : true
bool labCMa : false
color col1CMa : col1
bool showNameCMa : false
color col0Lep : col0
bool visLep : true
bool labLep : false
color col1Lep : col1
bool showNameLep : false
color col0Her : col0
bool visHer : true
bool labHer : false
color col1Her : col1
bool showNameHer : false
color col0CVn : col0
bool visCVn : true
bool labCVn : false
color col1CVn : col1
bool showNameCVn : false
color col0Ind : col0
bool visInd : true
bool labInd : false
color col1Ind : col1
bool showNameInd : false
color col0Car : col0
bool visCar : true
bool labCar : false
color col1Car : col1
bool showNameCar : false
color col0UMi : col0
bool visUMi : true
bool labUMi : false
color col1UMi : col1
bool showNameUMi : false
color col0CMi : col0
bool visCMi : true
bool labCMi : false
color col1CMi : col1
bool showNameCMi : false
color col0LMi : col0
bool visLMi : true
bool labLMi : false
color col1LMi : col1
bool showNameLMi : false
color col0Hyi : col0
bool visHyi : true
bool labHyi : false
color col1Hyi : col1
bool showNameHyi : false
color col0Leo : col0
bool visLeo : true
bool labLeo : false
color col1Leo : col1
bool showNameLeo : false
color col0Equ : col0
bool visEqu : true
bool labEqu : false
color col1Equ : col1
bool showNameEqu : false
color col0Lac : col0
bool visLac : true
bool labLac : false
color col1Lac : col1
bool showNameLac : false
color col0Lyn : col0
bool visLyn : true
bool labLyn : false
color col1Lyn : col1
bool showNameLyn : false
color col0Lyr : col0
bool visLyr : true
bool labLyr : false
color col1Lyr : col1
bool showNameLyr : false
color col0Vir : col0
bool visVir : true
bool labVir : false
color col1Vir : col1
bool showNameVir : false
color col0Pyx : col0
bool visPyx : true
bool labPyx : false
color col1Pyx : col1
bool showNamePyx : false
color col0Mic : col0
bool visMic : true
bool labMic : false
color col1Mic : col1
bool showNameMic : false
color col0CrB : col0
bool visCrB : true
bool labCrB : false
color col1CrB : col1
bool showNameCrB : false
color col0Oct : col0
bool visOct : true
bool labOct : false
color col1Oct : col1
bool showNameOct : false
color col0Ori : col0
bool visOri : true
bool labOri : false
color col1Ori : col1
bool showNameOri : false
color col0Pic : col0
bool visPic : true
bool labPic : false
color col1Pic : col1
bool showNamePic : false
color col0Pav : col0
bool visPav : true
bool labPav : false
color col1Pav : col1
bool showNamePav : false
color col0Peg : col0
bool visPeg : true
bool labPeg : false
color col1Peg : col1
bool showNamePeg : false
color col0Per : col0
bool visPer : true
bool labPer : false
color col1Per : col1
bool showNamePer : false
color col0Phe : col0
bool visPhe : true
bool labPhe : false
color col1Phe : col1
bool showNamePhe : false
color col0Ari : col0
bool visAri : true
bool labAri : false
color col1Ari : col1
bool showNameAri : false
color col0Ret : col0
bool visRet : true
bool labRet : false
color col1Ret : col1
bool showNameRet : false
color col0Vel : col0
bool visVel : true
bool labVel : false
color col1Vel : col1
bool showNameVel : false
color col0Lib : col0
bool visLib : true
bool labLib : false
color col1Lib : col1
bool showNameLib : false
color col0Sco : col0
bool visSco : true
bool labSco : false
color col1Sco : col1
bool showNameSco : false
color col0Scl : col0
bool visScl : true
bool labScl : false
color col1Scl : col1
bool showNameScl : false
color col0Ser : col0
bool visSer : true
bool labSer : false
color col1Ser : col1
bool showNameSer : false
color col0Oph : col0
bool visOph : true
bool labOph : false
color col1Oph : col1
bool showNameOph : false
color col0Sex : col0
bool visSex : true
bool labSex : false
color col1Sex : col1
bool showNameSex : false
color col0Sct : col0
bool visSct : true
bool labSct : false
color col1Sct : col1
bool showNameSct : false
color col0Cru : col0
bool visCru : true
bool labCru : false
color col1Cru : col1
bool showNameCru : false
color col0CrA : col0
bool visCrA : true
bool labCrA : false
color col1CrA : col1
bool showNameCrA : false
color col0PsA : col0
bool visPsA : true
bool labPsA : false
color col1PsA : col1
bool showNamePsA : false
color col0TrA : col0
bool visTrA : true
bool labTrA : false
color col1TrA : col1
bool showNameTrA : false
color col0Pup : col0
bool visPup : true
bool labPup : false
color col1Pup : col1
bool showNamePup : false
color col0Cyg : col0
bool visCyg : true
bool labCyg : false
color col1Cyg : col1
bool showNameCyg : false
color col0Dor : col0
bool visDor : true
bool labDor : false
color col1Dor : col1
bool showNameDor : false
color col0Men : col0
bool visMen : true
bool labMen : false
color col1Men : col1
bool showNameMen : false
color col0Tel : col0
bool visTel : true
bool labTel : false
color col1Tel : col1
bool showNameTel : false
color col0Tuc : col0
bool visTuc : true
bool labTuc : false
color col1Tuc : col1
bool showNameTuc : false
color col0Tri : col0
bool visTri : true
bool labTri : false
color col1Tri : col1
bool showNameTri : false
color col0Gem : col0
bool visGem : true
bool labGem : false
color col1Gem : col1
bool showNameGem : false
color col0Mon : col0
bool visMon : true
bool labMon : false
color col1Mon : col1
bool showNameMon : false
color col0Aqr : col0
bool visAqr : true
bool labAqr : false
color col1Aqr : col1
bool showNameAqr : false
color col0Hya : col0
bool visHya : true
bool labHya : false
color col1Hya : col1
bool showNameHya : false
color col0Cet : col0
bool visCet : true
bool labCet : false
color col1Cet : col1
bool showNameCet : false
color col0Lup : col0
bool visLup : true
bool labLup : false
color col1Lup : col1
bool showNameLup : false


vertex alphaAnt: -0.787878972260081*s 0.332899625746599*s -0.518097060644212*s  color=col0Ant visible=visAnt&vis0 label=labAnt r=b*0.3622^a
vertex etaAnt: -0.700491184480606*s 0.404339963768132*s -0.588065722657717*s  color=col0Ant visible=visAnt&vis0 label=labAnt r=b*0.2946^a
vertex alphaAra: -0.0731696235890633*s -0.640031971359185*s -0.764856379866122*s  color=col0Ara visible=visAra&vis0 label=labAra r=b*0.5264^a
vertex betaAra: -0.079876723907555*s -0.559992761818228*s -0.824637990689848*s  color=col0Ara visible=visAra&vis0 label=labAra r=b*0.5020^a
vertex zetaAra: -0.142634782221537*s -0.540260117532553*s -0.829321604870105*s  color=col0Ara visible=visAra&vis0 label=labAra r=b*0.4744^a
vertex gammaAra: -0.0778515585196622*s -0.547895311794805*s -0.832916479696094*s  color=col0Ara visible=visAra&vis0 label=labAra r=b*0.4709^a
vertex deltaAra: -0.05641515245633*s -0.486081174336695*s -0.872090833874998*s  color=col0Ara visible=visAra&vis0 label=labAra r=b*0.4397^a
vertex thetaAra: 0.0243876404428531*s -0.641166064555745*s -0.767014550485015*s  color=col0Ara visible=visAra&vis0 label=labAra r=b*0.4332^a
vertex etaAra: -0.149976155280045*s -0.491376804779129*s -0.857937053968687*s  color=col0Ara visible=visAra&vis0 label=labAra r=b*0.4096^a
vertex alphaAnd: 0.871804667172319*s 0.0372110032429284*s 0.488438290405468*s  color=col0And visible=visAnd&vis0 label=labAnd r=b*0.6256^a
vertex betaAnd: 0.772568661268937*s 0.248188675497734*s 0.58441427513349*s  color=col0And visible=visAnd&vis0 label=labAnd r=b*0.6062^a
vertex gamma1And: 0.629817525376067*s 0.384265457703552*s 0.675033290101345*s  color=col0And visible=visAnd&vis0 label=labAnd r=b*0.5969^a
vertex deltaAnd: 0.843581618310615*s 0.151649966604828*s 0.515143029533739*s  color=col0And visible=visAnd&vis0 label=labAnd r=b*0.4536^a
vertex muAnd: 0.755952781271134*s 0.19637568131594*s 0.624477368906302*s  color=col0And visible=visAnd&vis0 label=labAnd r=b*0.4071^a
vertex nuAnd: 0.733374710362447*s 0.16695395762283*s 0.659005242949456*s  color=col0And visible=visAnd&vis0 label=labAnd r=b*0.3560^a
vertex epsilonSgr: 0.0932474501065654*s -0.820132238521186*s -0.564524600338065*s  color=col0Sgr visible=visSgr&vis0 label=labSgr r=b*0.6608^a
vertex sigmaSgr: 0.220451162351473*s -0.869269331593688*s -0.442461426757799*s  color=col0Sgr visible=visSgr&vis0 label=labSgr r=b*0.6295^a
vertex zetaSgr: 0.240230112008231*s -0.833496303374978*s -0.497567488432232*s  color=col0Sgr visible=visSgr&vis0 label=labSgr r=b*0.5469^a
vertex deltaSgr: 0.0858188057855319*s -0.8633884206559*s -0.4971876583855*s  color=col0Sgr visible=visSgr&vis0 label=labSgr r=b*0.5170^a
vertex lambdaSgr: 0.116422014438455*s -0.895768313844251*s -0.429004711473801*s  color=col0Sgr visible=visSgr&vis0 label=labSgr r=b*0.5030^a
vertex phiSgr: 0.18274948643171*s -0.872381221171207*s -0.453380226914209*s  color=col0Sgr visible=visSgr&vis0 label=labSgr r=b*0.4860^a
vertex gamma2Sgr: 0.0283144428265955*s -0.861862313773109*s -0.50635130534549*s  color=col0Sgr visible=visSgr&vis0 label=labSgr r=b*0.4857^a
vertex etaSgr: 0.0678703744911183*s -0.798364838499125*s -0.598337026194018*s  color=col0Sgr visible=visSgr&vis0 label=labSgr r=b*0.4841^a
vertex tauSgr: 0.261277908930666*s -0.846567524566994*s -0.46374268797829*s  color=col0Sgr visible=visSgr&vis0 label=labSgr r=b*0.4499^a
vertex xi2Sgr: 0.23885624259997*s -0.902059642587966*s -0.359494223298643*s  color=col0Sgr visible=visSgr&vis0 label=labSgr r=b*0.4278^a
vertex muSgr: 0.0625137467301933*s -0.931175216981237*s -0.359172307882582*s  color=col0Sgr visible=visSgr&vis0 label=labSgr r=b*0.4099^a
vertex omicronSgr: 0.264990965447518*s -0.890543463147988*s -0.369746032400052*s  color=col0Sgr visible=visSgr&vis0 label=labSgr r=b*0.4054^a
vertex alphaSgr: 0.277606956005104*s -0.707153424889143*s -0.650283331821703*s  color=col0Sgr visible=visSgr&vis0 label=labSgr r=b*0.4046^a
vertex rho1Sgr: 0.338202404543968*s -0.890069756227772*s -0.305605894264678*s  color=col0Sgr visible=visSgr&vis0 label=labSgr r=b*0.3992^a
vertex iotaSgr: 0.3645619601384*s -0.650311531312636*s -0.666475422999125*s  color=col0Sgr visible=visSgr&vis0 label=labSgr r=b*0.3735^a
vertex theta1Sgr: 0.413097442707313*s -0.705016441176162*s -0.576456694383869*s  color=col0Sgr visible=visSgr&vis0 label=labSgr r=b*0.3706^a
vertex beta2Sgr: 0.257831618246152*s -0.661773080044581*s -0.703973896647368*s  color=col0Sgr visible=visSgr&vis0 label=labSgr r=b*0.3672^a
vertex cSgr: 0.457276241057159*s -0.75879981587868*s -0.463811684616846*s  color=col0Sgr visible=visSgr&vis0 label=labSgr r=b*0.3588^a
vertex XSgr: -0.0414812123876013*s -0.883294840651792*s -0.466979157454355*s  color=col0Sgr visible=visSgr&vis0 label=labSgr r=b*0.3414^a
vertex dSgr: 0.320459212993029*s -0.890141018514304*s -0.323967374848465*s  color=col0Sgr visible=visSgr&vis0 label=labSgr r=b*0.3128^a
vertex h01Sgr: 0.375608409491224*s -0.827562067757142*s -0.417204202674178*s  color=col0Sgr visible=visSgr&vis0 label=labSgr r=b*0.2691^a
vertex gammaSge: 0.470937233269342*s -0.816125462579759*s 0.334899017092604*s  color=col0Sge visible=visSge&vis0 label=labSge r=b*0.4343^a
vertex deltaSge: 0.432408667702518*s -0.843366410367493*s 0.318991915194699*s  color=col0Sge visible=visSge&vis0 label=labSge r=b*0.4134^a
vertex alphaSge: 0.406608831045165*s -0.859293617619678*s 0.310296208862066*s  color=col0Sge visible=visSge&vis0 label=labSge r=b*0.3525^a
vertex betaSge: 0.411435531860501*s -0.860173862608164*s 0.301366436764976*s  color=col0Sge visible=visSge&vis0 label=labSge r=b*0.3506^a
vertex etaSge: 0.491975127590761*s -0.800127368743589*s 0.343156913990546*s  color=col0Sge visible=visSge&vis0 label=labSge r=b*0.2985^a
vertex betaCom: -0.840379865677439*s -0.277600641419169*s 0.465510005529027*s  color=col0Com visible=visCom&vis0 label=labCom r=b*0.3664^a
vertex alphaCom: -0.908504053577909*s -0.292075614348887*s 0.2988515018119*s  color=col0Com visible=visCom&vis0 label=labCom r=b*0.3607^a
vertex gammaCom: -0.875262296917113*s -0.108505324726658*s 0.471319961492553*s  color=col0Com visible=visCom&vis0 label=labCom r=b*0.3535^a
vertex alphaAps: -0.137990203008457*s -0.127911473792519*s -0.982139174835171*s  color=col0Aps visible=visAps&vis0 label=labAps r=b*0.3999^a
vertex gammaAps: -0.067395666470675*s -0.179400575430259*s -0.981464853000995*s  color=col0Aps visible=visAps&vis0 label=labAps r=b*0.3963^a
vertex betaAps: -0.0674519778643948*s -0.204442214236741*s -0.976551899143184*s  color=col0Aps visible=visAps&vis0 label=labAps r=b*0.3635^a
vertex alphaBoo: -0.78162199059278*s -0.531598417418933*s 0.326297696006984*s  color=col0Boo visible=visBoo&vis0 label=labBoo r=b*0.9748^a
vertex epsilonBoo: -0.667145744007293*s -0.591046295973603*s 0.453410225148087*s  color=col0Boo visible=visBoo&vis0 label=labBoo r=b*0.5601^a
vertex etaBoo: -0.830639309367636*s -0.460233290215068*s 0.313406535207979*s  color=col0Boo visible=visBoo&vis0 label=labBoo r=b*0.5253^a
vertex gammaBoo: -0.616884641212009*s -0.486985637625463*s 0.618302780345724*s  color=col0Boo visible=visBoo&vis0 label=labBoo r=b*0.4900^a
vertex deltaBoo: -0.547260410627503*s -0.632786710509112*s 0.547801991565268*s  color=col0Boo visible=visBoo&vis0 label=labBoo r=b*0.4338^a
vertex betaBoo: -0.532401577220196*s -0.546304846186316*s 0.646606198243408*s  color=col0Boo visible=visBoo&vis0 label=labBoo r=b*0.4318^a
vertex rhoBoo: -0.678390471781018*s -0.534714408506665*s 0.503852030989352*s  color=col0Boo visible=visBoo&vis0 label=labBoo r=b*0.4234^a
vertex zetaBoo: -0.737859682146237*s -0.632575810725907*s 0.235395270019421*s  color=col0Boo visible=visBoo&vis0 label=labBoo r=b*0.4172^a
vertex upsilonBoo: -0.85256567153811*s -0.447453189752327*s 0.270032254916409*s  color=col0Boo visible=visBoo&vis0 label=labBoo r=b*0.3838^a
vertex alphaTau: 0.337800064784727*s 0.897021309953837*s 0.28503313091663*s  color=col0Tau visible=visTau&vis0 label=labTau r=b*0.7940^a
vertex betaTau: 0.122216765354903*s 0.869203445991717*s 0.479112128569407*s  color=col0Tau visible=visTau&vis0 label=labTau r=b*0.6894^a
vertex zetaTau: 0.0843419236577431*s 0.928777235474192*s 0.360914514502574*s  color=col0Tau visible=visTau&vis0 label=labTau r=b*0.5107^a
vertex lambdaTau: 0.480017620299682*s 0.8498616080876*s 0.217527771331823*s  color=col0Tau visible=visTau&vis0 label=labTau r=b*0.4595^a
vertex theta2Tau: 0.367243060331352*s 0.888718854942594*s 0.274429101058887*s  color=col0Tau visible=visTau&vis0 label=labTau r=b*0.4508^a
vertex f27Tau: 0.487789484639488*s 0.771295505742116*s 0.4088577521549*s  color=col0Tau visible=visTau&vis0 label=labTau r=b*0.4357^a
vertex epsilonTau: 0.360621267140749*s 0.872578022339449*s 0.329484288875776*s  color=col0Tau visible=visTau&vis0 label=labTau r=b*0.4267^a
vertex omicronTau: 0.613778502395055*s 0.773399135454981*s 0.15852358586397*s  color=col0Tau visible=visTau&vis0 label=labTau r=b*0.4198^a
vertex gammaTau: 0.401842082081104*s 0.874864982583619*s 0.270433362064831*s  color=col0Tau visible=visTau&vis0 label=labTau r=b*0.4157^a
vertex deltaTau: 0.385862305030873*s 0.87158037221424*s 0.302420132145906*s  color=col0Tau visible=visTau&vis0 label=labTau r=b*0.4045^a
vertex tauTau: 0.300228150921929*s 0.870126024572626*s 0.390824460282921*s  color=col0Tau visible=visTau&vis0 label=labTau r=b*0.3770^a
vertex delta3Tau: 0.375295800758941*s 0.873954466461392*s 0.30879872487575*s  color=col0Tau visible=visTau&vis0 label=labTau r=b*0.3697^a
vertex deltaCap: 0.807332964997227*s -0.521722222472512*s -0.275716169651199*s  color=col0Cap visible=visCap&vis0 label=labCap r=b*0.5080^a
vertex beta1Cap: 0.56346233124485*s -0.786231538685117*s -0.253673350679476*s  color=col0Cap visible=visCap&vis0 label=labCap r=b*0.4775^a
vertex alpha2Cap: 0.558444286939627*s -0.800991857255894*s -0.215759178238714*s  color=col0Cap visible=visCap&vis0 label=labCap r=b*0.4228^a
vertex gammaCap: 0.789000981609946*s -0.54445403404987*s -0.284687997332806*s  color=col0Cap visible=visCap&vis0 label=labCap r=b*0.4201^a
vertex zetaCap: 0.72957545390029*s -0.569038641053674*s -0.379360886299542*s  color=col0Cap visible=visCap&vis0 label=labCap r=b*0.4050^a
vertex thetaCap: 0.697353079734317*s -0.653447388492781*s -0.294457454748606*s  color=col0Cap visible=visCap&vis0 label=labCap r=b*0.3905^a
vertex omegaCap: 0.612659041112179*s -0.648934035715762*s -0.451146890306428*s  color=col0Cap visible=visCap&vis0 label=labCap r=b*0.3784^a
vertex psiCap: 0.604624259021896*s -0.673427689678778*s -0.425352385882726*s  color=col0Cap visible=visCap&vis0 label=labCap r=b*0.3774^a
vertex iotaCap: 0.743587185186607*s -0.603587059896572*s -0.287681697630681*s  color=col0Cap visible=visCap&vis0 label=labCap r=b*0.3598^a
vertex gamma2Nor: -0.265722459099149*s -0.582080442706841*s -0.768488082502591*s  color=col0Nor visible=visNor&vis0 label=labNor r=b*0.3823^a
vertex epsilonNor: -0.260276827128338*s -0.621863127385329*s -0.73860830218631*s  color=col0Nor visible=visNor&vis0 label=labNor r=b*0.3538^a
vertex etaNor: -0.313160362875276*s -0.571956078753703*s -0.758153566964182*s  color=col0Nor visible=visNor&vis0 label=labNor r=b*0.3307^a
vertex kappaNor: -0.254238269081404*s -0.518975753040905*s -0.816104815749862*s  color=col0Nor visible=visNor&vis0 label=labNor r=b*0.3080^a
vertex gammaCas: 0.47123675418981*s 0.12262875021644*s 0.87344038784625*s  color=col0Cas visible=visCas&vis0 label=labCas r=b*0.6112^a
vertex betaCas: 0.510036721123741*s 0.0236566631087852*s 0.859827253229334*s  color=col0Cas visible=visCas&vis0 label=labCas r=b*0.5810^a
vertex alphaCas: 0.540046366318747*s 0.100195736740895*s 0.835649888748193*s  color=col0Cas visible=visCas&vis0 label=labCas r=b*0.5740^a
vertex deltaCas: 0.45868141750656*s 0.184365746100645*s 0.869264418286476*s  color=col0Cas visible=visCas&vis0 label=labCas r=b*0.5352^a
vertex epsilonCas: 0.385816774398325*s 0.214633831317128*s 0.897261241248613*s  color=col0Cas visible=visCas&vis0 label=labCas r=b*0.4666^a
vertex alphaCenA: -0.370062844994226*s -0.314512847170946*s -0.874148248135981*s  color=col0Cen visible=visCen&vis0 label=labCen r=b*0.9689^a
vertex betaCen: -0.420148931734818*s -0.256802283486468*s -0.870360535846052*s  color=col0Cen visible=visCen&vis0 label=labCen r=b*0.8837^a
vertex gammaCen: -0.643167252952492*s -0.12212486535359*s -0.75592420386697*s  color=col0Cen visible=visCen&vis0 label=labCen r=b*0.6101^a
vertex epsilonCen: -0.536040310696109*s -0.254532173694168*s -0.804906303779105*s  color=col0Cen visible=visCen&vis0 label=labCen r=b*0.6012^a
vertex thetaCen: -0.681212082532449*s -0.426769065632674*s -0.594826246252482*s  color=col0Cen visible=visCen&vis0 label=labCen r=b*0.5994^a
vertex etaCen: -0.572561036438154*s -0.468707078438443*s -0.672671936514797*s  color=col0Cen visible=visCen&vis0 label=labCen r=b*0.5925^a
vertex zetaCen: -0.590039696224594*s -0.331190650785317*s -0.73631916293927*s  color=col0Cen visible=visCen&vis0 label=labCen r=b*0.5699^a
vertex deltaCen: -0.630493488374539*s -0.0268541410400024*s -0.775729860342058*s  color=col0Cen visible=visCen&vis0 label=labCen r=b*0.5592^a
vertex iotaCen: -0.749373727040707*s -0.280588537943506*s -0.59975752566837*s  color=col0Cen visible=visCen&vis0 label=labCen r=b*0.5282^a
vertex kappaCen: -0.521658129165631*s -0.525829950077866*s -0.671844967143851*s  color=col0Cen visible=visCen&vis0 label=labCen r=b*0.4935^a
vertex lambdaCen: -0.449110782896774*s 0.045164922225148*s -0.892333813371567*s  color=col0Cen visible=visCen&vis0 label=labCen r=b*0.4890^a
vertex nuCen: -0.659350533281352*s -0.347343424925348*s -0.666790386420445*s  color=col0Cen visible=visCen&vis0 label=labCen r=b*0.4652^a
vertex muCen: -0.651017727703946*s -0.343385995704218*s -0.676950497576753*s  color=col0Cen visible=visCen&vis0 label=labCen r=b*0.4574^a
vertex upsilon1Cen: -0.61255769901344*s -0.354887448903856*s -0.706277540340816*s  color=col0Cen visible=visCen&vis0 label=labCen r=b*0.4180^a
vertex sigmaCen: -0.632438652311272*s -0.0818553640092531*s -0.77027336085679*s  color=col0Cen visible=visCen&vis0 label=labCen r=b*0.4127^a
vertex dCen: -0.7090306553083*s -0.303179689808502*s -0.636677002506533*s  color=col0Cen visible=visCen&vis0 label=labCen r=b*0.3923^a
vertex ACen: -0.578775207685011*s 0.0607298591879774*s -0.813222689779485*s  color=col0Cen visible=visCen&vis0 label=labCen r=b*0.3468^a
vertex alphaCep: 0.350340738988452*s -0.296019165410092*s 0.888613538223978*s  color=col0Cep visible=visCep&vis0 label=labCep r=b*0.5605^a
vertex betaCep: 0.261610115443316*s -0.202570517972632*s 0.943676497930321*s  color=col0Cep visible=visCep&vis0 label=labCep r=b*0.4848^a
vertex gammaCep: 0.21087207837546*s -0.0180110184726167*s 0.97734772203919*s  color=col0Cep visible=visCep&vis0 label=labCep r=b*0.4595^a
vertex zetaCep: 0.467529499906514*s -0.238767396849955*s 0.851120612439072*s  color=col0Cep visible=visCep&vis0 label=labCep r=b*0.4455^a
vertex iotaCep: 0.383047007951626*s -0.119599851509302*s 0.915953527870416*s  color=col0Cep visible=visCep&vis0 label=labCep r=b*0.4295^a
vertex alphaCha: -0.127213920678054*s 0.18545611959276*s -0.974383213161697*s  color=col0Cha visible=visCha&vis0 label=labCha r=b*0.3847^a
vertex betaCha: -0.182218451510183*s -0.0159238006585552*s -0.983129120971308*s  color=col0Cha visible=visCha&vis0 label=labCha r=b*0.3798^a
vertex gammaCha: -0.182114205021102*s 0.070123192691631*s -0.980773752797384*s  color=col0Cha visible=visCha&vis0 label=labCha r=b*0.3793^a
vertex alphaAur: 0.124545301077016*s 0.683119600046405*s 0.719608282339826*s  color=col0Aur visible=visAur&vis0 label=labAur r=b*0.9467^a
vertex betaTauAur: 0.122216765354903*s 0.869203445991717*s 0.479112128569407*s  color=col0Aur visible=visAur&vis0 label=labAur r=b*0.6894^a
vertex betaAur: -0.00460598776752077*s 0.707744503463336*s 0.706453468173327*s  color=col0Aur visible=visAur&vis0 label=labAur r=b*0.6451^a
vertex thetaAur: -0.00537136384090922*s 0.796389202778573*s 0.604760602344595*s  color=col0Aur visible=visAur&vis0 label=labAur r=b*0.5483^a
vertex iotaAur: 0.220996375277866*s 0.806995350670618*s 0.547648706845959*s  color=col0Aur visible=visAur&vis0 label=labAur r=b*0.5207^a
vertex zetaAur: 0.181144196228536*s 0.731324779775109*s 0.657533912934995*s  color=col0Aur visible=visAur&vis0 label=labAur r=b*0.4116^a
vertex alphaHor: 0.327815600720467*s 0.663936924504487*s -0.672104673547062*s  color=col0Hor visible=visHor&vis0 label=labHor r=b*0.3970^a
vertex muHor: 0.35076375559976*s 0.364012336272987*s -0.862820842816534*s  color=col0Hor visible=visHor&vis0 label=labHor r=b*0.3014^a
vertex zetaHor: 0.443092699598721*s 0.376744958939586*s -0.813469173033574*s  color=col0Hor visible=visHor&vis0 label=labHor r=b*0.2948^a
vertex betaCnc: -0.559146892958826*s 0.81383902986628*s 0.158179599066393*s  color=col0Cnc visible=visCnc&vis0 label=labCnc r=b*0.4294^a
vertex deltaCnc: -0.630620165375763*s 0.711526397116672*s 0.30991675209258*s  color=col0Cnc visible=visCnc&vis0 label=labCnc r=b*0.3887^a
vertex iotaCnc: -0.588029644203938*s 0.651300232177127*s 0.479613537239527*s  color=col0Cnc visible=visCnc&vis0 label=labCnc r=b*0.3803^a
vertex alphaCnc: -0.692124270785419*s 0.692442229653195*s 0.20368542506194*s  color=col0Cnc visible=visCnc&vis0 label=labCnc r=b*0.3714^a
vertex gammaCnc: -0.613490439758734*s 0.700602668785444*s 0.364397284313905*s  color=col0Cnc visible=visCnc&vis0 label=labCnc r=b*0.3410^a
vertex chiCnc: -0.515816356725838*s 0.725259334231772*s 0.455996035337775*s  color=col0Cnc visible=visCnc&vis0 label=labCnc r=b*0.2996^a
vertex alphaGru: 0.606728392694849*s -0.316161262601292*s -0.72933031853083*s  color=col0Gru visible=visGru&vis0 label=labGru r=b*0.6764^a
vertex betaGru: 0.648170971263671*s -0.222386153416726*s -0.728298558820229*s  color=col0Gru visible=visGru&vis0 label=labGru r=b*0.6209^a
vertex gammaGru: 0.681591488964097*s -0.411409995438257*s -0.605123836768308*s  color=col0Gru visible=visGru&vis0 label=labGru r=b*0.5040^a
vertex epsilonGru: 0.59804891735872*s -0.188116987430433*s -0.779069631988156*s  color=col0Gru visible=visGru&vis0 label=labGru r=b*0.4447^a
vertex iotaGru: 0.690341247686006*s -0.147170868121155*s -0.708357040848607*s  color=col0Gru visible=visGru&vis0 label=labGru r=b*0.3936^a
vertex delta1Gru: 0.672768054980329*s -0.275727227319377*s -0.686554906990514*s  color=col0Gru visible=visGru&vis0 label=labGru r=b*0.3856^a
vertex zetaGru: 0.588187275098722*s -0.150899177833869*s -0.794521974234195*s  color=col0Gru visible=visGru&vis0 label=labGru r=b*0.3735^a
vertex thetaGru: 0.708506385512777*s -0.162349731571047*s -0.686775994299764*s  color=col0Gru visible=visGru&vis0 label=labGru r=b*0.3641^a
vertex lambdaGru: 0.681706042116741*s -0.363550486767111*s -0.634907800954536*s  color=col0Gru visible=visGru&vis0 label=labGru r=b*0.3447^a
vertex gammaCrv: -0.950035847199214*s -0.0713732959430255*s -0.303871258368903*s  color=col0Crv visible=visCrv&vis0 label=labCrv r=b*0.5562^a
vertex betaCrv: -0.905590994703661*s -0.142611159158464*s -0.399458392820971*s  color=col0Crv visible=visCrv&vis0 label=labCrv r=b*0.5236^a
vertex deltaCrv: -0.949109594707155*s -0.130231337473955*s -0.286759090482872*s  color=col0Crv visible=visCrv&vis0 label=labCrv r=b*0.5076^a
vertex epsilonCrv: -0.920915097547053*s -0.046268146165313*s -0.387007289027387*s  color=col0Crv visible=visCrv&vis0 label=labCrv r=b*0.4813^a
vertex alphaCrv: -0.906377068823838*s -0.0387749511074239*s -0.420686477411532*s  color=col0Crv visible=visCrv&vis0 label=labCrv r=b*0.3891^a
vertex etaCrv: -0.949386167885672*s -0.139569941752612*s -0.281400311987268*s  color=col0Crv visible=visCrv&vis0 label=labCrv r=b*0.3643^a
vertex deltaCrt: -0.952084004492768*s 0.164965799065858*s -0.257531228257037*s  color=col0Crt visible=visCrt&vis0 label=labCrt r=b*0.4248^a
vertex gammaCrt: -0.941641701382804*s 0.139800405941385*s -0.30621357369575*s  color=col0Crt visible=visCrt&vis0 label=labCrt r=b*0.3866^a
vertex alphaCrt: -0.917468322647652*s 0.241207587112744*s -0.316339654260024*s  color=col0Crt visible=visCrt&vis0 label=labCrt r=b*0.3762^a
vertex betaCrt: -0.901382283812534*s 0.187582307467629*s -0.390285608694478*s  color=col0Crt visible=visCrt&vis0 label=labCrt r=b*0.3567^a
vertex thetaCrt: -0.980439887249342*s 0.0942304192940933*s -0.172795415362089*s  color=col0Crt visible=visCrt&vis0 label=labCrt r=b*0.3413^a
vertex zetaCrt: -0.946588563933284*s 0.0573903911072211*s -0.31729549892692*s  color=col0Crt visible=visCrt&vis0 label=labCrt r=b*0.3254^a
vertex epsilonCrt: -0.970800224362093*s 0.145249855884151*s -0.19091726937117*s  color=col0Crt visible=visCrt&vis0 label=labCrt r=b*0.3221^a
vertex etaCrt: -0.954699796950352*s 0.010904551683576*s -0.297370792875723*s  color=col0Crt visible=visCrt&vis0 label=labCrt r=b*0.3039^a
vertex betaDel: 0.617900061954013*s -0.744241958400779*s 0.25358119171776*s  color=col0Del visible=visDel&vis0 label=labDel r=b*0.4243^a
vertex alphaDel: 0.620685675065481*s -0.733961562840547*s 0.275771131631232*s  color=col0Del visible=visDel&vis0 label=labDel r=b*0.4202^a
vertex epsilonDel: 0.61188244764056*s -0.765872566227161*s 0.197583102946634*s  color=col0Del visible=visDel&vis0 label=labDel r=b*0.3983^a
vertex gamma2Del: 0.642177350048324*s -0.713838602557911*s 0.279361236722422*s  color=col0Del visible=visDel&vis0 label=labDel r=b*0.3601^a
vertex deltaDel: 0.635437543061186*s -0.726445613145872*s 0.261717213819576*s  color=col0Del visible=visDel&vis0 label=labDel r=b*0.3545^a
vertex alphaCol: 0.0699754312314788*s 0.825477144451407*s -0.56008117537757*s  color=col0Col visible=visCol&vis0 label=labCol r=b*0.5480^a
vertex betaCol: 0.0286599466276874*s 0.810968278508752*s -0.584387763999085*s  color=col0Col visible=visCol&vis0 label=labCol r=b*0.4696^a
vertex deltaCol: -0.0839262249386224*s 0.83012150838282*s -0.551230142579108*s  color=col0Col visible=visCol&vis0 label=labCol r=b*0.3987^a
vertex epsilonCol: 0.0986981645557336*s 0.808595931228261*s -0.580026975505821*s  color=col0Col visible=visCol&vis0 label=labCol r=b*0.3953^a
vertex etaCol: 0.000107460415737117*s 0.733552733496718*s -0.67963252985106*s  color=col0Col visible=visCol&vis0 label=labCol r=b*0.3872^a
vertex gammaCol: 0.00539253440146179*s 0.816302066872774*s -0.577600083268663*s  color=col0Col visible=visCol&vis0 label=labCol r=b*0.3708^a
vertex kappaCol: -0.0623899132830968*s 0.815254528928419*s -0.575732187550973*s  color=col0Col visible=visCol&vis0 label=labCol r=b*0.3519^a
vertex gammaDra: -0.00753099353206965*s -0.622650321337163*s 0.782463968164124*s  color=col0Dra visible=visDra&vis0 label=labDra r=b*0.5805^a
vertex etaDra: -0.193679000588262*s -0.436852180456998*s 0.878435323265804*s  color=col0Dra visible=visDra&vis0 label=labDra r=b*0.5162^a
vertex betaDra: -0.0771024098082548*s -0.606890164568332*s 0.791037007068558*s  color=col0Dra visible=visDra&vis0 label=labDra r=b*0.5073^a
vertex zetaDra: -0.091112223378027*s -0.401596898774064*s 0.911273007197166*s  color=col0Dra visible=visDra&vis0 label=labDra r=b*0.4857^a
vertex deltaDra: 0.118087756467651*s -0.360467860472809*s 0.925266557992124*s  color=col0Dra visible=visDra&vis0 label=labDra r=b*0.4753^a
vertex iotaDra: -0.322631001725337*s -0.403894771960639*s 0.856024678329176*s  color=col0Dra visible=visDra&vis0 label=labDra r=b*0.4504^a
vertex alphaDra: -0.371318118585346*s -0.225575896729958*s 0.900687720369671*s  color=col0Dra visible=visDra&vis0 label=labDra r=b*0.4320^a
vertex chiDra: 0.0265914636935373*s -0.295451062007645*s 0.954987729773106*s  color=col0Dra visible=visDra&vis0 label=labDra r=b*0.4298^a
vertex kappaDra: -0.34394077075366*s -0.0523377793060362*s 0.937531601105099*s  color=col0Dra visible=visDra&vis0 label=labDra r=b*0.4130^a
vertex xiDra: -0.0143251920489128*s -0.546364702609917*s 0.837424862668131*s  color=col0Dra visible=visDra&vis0 label=labDra r=b*0.4078^a
vertex lambdaDra: -0.35291161894631*s 0.0418303295545671*s 0.934721141700588*s  color=col0Dra visible=visDra&vis0 label=labDra r=b*0.4058^a
vertex epsilonDra: 0.152859817069971*s -0.299782870537651*s 0.941681531547445*s  color=col0Dra visible=visDra&vis0 label=labDra r=b*0.3984^a
vertex thetaDra: -0.256547736230111*s -0.455272942786345*s 0.852590057766255*s  color=col0Dra visible=visDra&vis0 label=labDra r=b*0.3873^a
vertex tauDra: 0.0918335767653193*s -0.270450789733004*s 0.958343865484244*s  color=col0Dra visible=visDra&vis0 label=labDra r=b*0.3454^a
vertex nu2Dra: -0.0676609568706382*s -0.567328843107704*s 0.820706999295987*s  color=col0Dra visible=visDra&vis0 label=labDra r=b*0.3206^a
vertex alphaCir: -0.317038818694295*s -0.277306342494055*s -0.906966140411811*s  color=col0Cir visible=visCir&vis0 label=labCir r=b*0.4735^a
vertex betaCir: -0.33267277174932*s -0.395167038057781*s -0.856254540991909*s  color=col0Cir visible=visCir&vis0 label=labCir r=b*0.3887^a
vertex gammaCir: -0.317565741266869*s -0.397559360943065*s -0.860870811736677*s  color=col0Cir visible=visCir&vis0 label=labCir r=b*0.3518^a
vertex alphaAql: 0.464100746387036*s -0.87204196793127*s 0.155413330733095*s  color=col0Aql visible=visAql&vis0 label=labAql r=b*0.8266^a
vertex gammaAql: 0.444332862480691*s -0.876482859422022*s 0.185327020315744*s  color=col0Aql visible=visAql&vis0 label=labAql r=b*0.5165^a
vertex zetaAql: 0.278288191415715*s -0.929948839673023*s 0.240314040599729*s  color=col0Aql visible=visAql&vis0 label=labAql r=b*0.5020^a
vertex thetaAql: 0.547091441714624*s -0.836973122597052*s -0.0129207760120796*s  color=col0Aql visible=visAql&vis0 label=labAql r=b*0.4760^a
vertex lambdaAql: 0.289946814425437*s -0.953315767077806*s -0.0843794586697234*s  color=col0Aql visible=visAql&vis0 label=labAql r=b*0.4568^a
vertex deltaAql: 0.36936804874877*s -0.9276363274356*s 0.0552999872090227*s  color=col0Aql visible=visAql&vis0 label=labAql r=b*0.4528^a
vertex betaAql: 0.484090486673521*s -0.867720012139636*s 0.11277580079336*s  color=col0Aql visible=visAql&vis0 label=labAql r=b*0.4105^a
vertex etaAql: 0.47643871595233*s -0.879007056847451*s 0.0187814790173009*s  color=col0Aql visible=visAql&vis0 label=labAql r=b*0.3941^a
vertex epsilonAql: 0.253278185274357*s -0.931628104088915*s 0.260613193326473*s  color=col0Aql visible=visAql&vis0 label=labAql r=b*0.3816^a
vertex alphaCae: 0.250552110710586*s 0.701936830679667*s -0.666714575777262*s  color=col0Cae visible=visCae&vis0 label=labCae r=b*0.3525^a
vertex deltaCae: 0.266346379846931*s 0.656389859948149*s -0.705841311981443*s  color=col0Cae visible=visCae&vis0 label=labCae r=b*0.3162^a
vertex betaCae: 0.262961355451447*s 0.753060921327764*s -0.6031173802073*s  color=col0Cae visible=visCae&vis0 label=labCae r=b*0.3069^a
vertex alphaEri: 0.493549986315245*s 0.226762364688671*s -0.839635183260577*s  color=col0Eri visible=visEri&vis0 label=labEri r=b*0.9072^a
vertex betaEri: 0.219133664245852*s 0.971709968880746*s -0.088091847363792*s  color=col0Eri visible=visEri&vis0 label=labEri r=b*0.5217^a
vertex thetaEri: 0.541801054766084*s 0.538385285883764*s -0.645440083197671*s  color=col0Eri visible=visEri&vis0 label=labEri r=b*0.5084^a
vertex upsilon4Eri: 0.355046031675112*s 0.752019390082693*s -0.555345975344568*s  color=col0Eri visible=visEri&vis0 label=labEri r=b*0.4449^a
vertex phiEri: 0.515101168301975*s 0.352248911579557*s -0.781403538963676*s  color=col0Eri visible=visEri&vis0 label=labEri r=b*0.4445^a
vertex deltaEri: 0.549342597457428*s 0.818523889842245*s -0.168051636041565*s  color=col0Eri visible=visEri&vis0 label=labEri r=b*0.4285^a
vertex tau4Eri: 0.595192334235273*s 0.713785029826133*s -0.36913008068115*s  color=col0Eri visible=visEri&vis0 label=labEri r=b*0.4236^a
vertex chiEri: 0.543423860714921*s 0.304320097538501*s -0.782355281083887*s  color=col0Eri visible=visEri&vis0 label=labEri r=b*0.4120^a
vertex epsilonEri: 0.586220055277095*s 0.793626459168106*s -0.162797696848617*s  color=col0Eri visible=visEri&vis0 label=labEri r=b*0.4107^a
vertex nuEri: 0.351024237218149*s 0.934595566755308*s -0.0575596341783116*s  color=col0Eri visible=visEri&vis0 label=labEri r=b*0.4101^a
vertex muEri: 0.313327674027343*s 0.947995173723006*s -0.0559546180980839*s  color=col0Eri visible=visEri&vis0 label=labEri r=b*0.4009^a
vertex upsilon2Eri: 0.306673945520681*s 0.805118953803934*s -0.507675645825597*s  color=col0Eri visible=visEri&vis0 label=labEri r=b*0.4006^a
vertex lEri: 0.333848105162223*s 0.909902942337738*s -0.246215511706149*s  color=col0Eri visible=visEri&vis0 label=labEri r=b*0.3958^a
vertex etaEri: 0.705665322426257*s 0.691858214572957*s -0.152868125039092*s  color=col0Eri visible=visEri&vis0 label=labEri r=b*0.3928^a
vertex f43Eri: 0.333921352778696*s 0.759281526169792*s -0.558558944226763*s  color=col0Eri visible=visEri&vis0 label=labEri r=b*0.3896^a
vertex tau3Eri: 0.638174168406767*s 0.658380556677685*s -0.39908491999462*s  color=col0Eri visible=visEri&vis0 label=labEri r=b*0.3861^a
vertex lambdaEri: 0.212135337374347*s 0.96540413584397*s -0.151635922961645*s  color=col0Eri visible=visEri&vis0 label=labEri r=b*0.3807^a
vertex kappaEri: 0.538740571921289*s 0.405841040849974*s -0.738276131083575*s  color=col0Eri visible=visEri&vis0 label=labEri r=b*0.3802^a
vertex tau5Eri: 0.550092389138929*s 0.750028175859421*s -0.367227584514583*s  color=col0Eri visible=visEri&vis0 label=labEri r=b*0.3771^a
vertex fEri: 0.427249203093105*s 0.667980318842051*s -0.609311424557245*s  color=col0Eri visible=visEri&vis0 label=labEri r=b*0.3741^a
vertex iotaEri: 0.585304230731992*s 0.498671673883311*s -0.639332088318464*s  color=col0Eri visible=visEri&vis0 label=labEri r=b*0.3737^a
vertex tau6Eri: 0.500701363974525*s 0.771011304811369*s -0.393496775040306*s  color=col0Eri visible=visEri&vis0 label=labEri r=b*0.3702^a
vertex gEri: 0.432662314278109*s 0.682134612760003*s -0.589487652015096*s  color=col0Eri visible=visEri&vis0 label=labEri r=b*0.3691^a
vertex eEri: 0.467903973747394*s 0.562569852787361*s -0.681601813441107*s  color=col0Eri visible=visEri&vis0 label=labEri r=b*0.3635^a
vertex omegaEri: 0.281873766036813*s 0.954807964395715*s -0.0942811282640155*s  color=col0Eri visible=visEri&vis0 label=labEri r=b*0.3600^a
vertex tau1Eri: 0.70944841605972*s 0.629613768972077*s -0.316653512330323*s  color=col0Eri visible=visEri&vis0 label=labEri r=b*0.3490^a
vertex sEri: 0.560581737736713*s 0.473806270832267*s -0.6791581060667*s  color=col0Eri visible=visEri&vis0 label=labEri r=b*0.3341^a
vertex zetaEri: 0.644769983999107*s 0.749184307424683*s -0.151639510822178*s  color=col0Eri visible=visEri&vis0 label=labEri r=b*0.3262^a
vertex etaPsc: 0.885582681118407*s 0.380107200431159*s 0.266949117030795*s  color=col0Psc visible=visPsc&vis0 label=labPsc r=b*0.4177^a
vertex alphaPsc: 0.857344227450378*s 0.51226523956777*s 0.0504499751049536*s  color=col0Psc visible=visPsc&vis0 label=labPsc r=b*0.4142^a
vertex gammaPsc: 0.981930505195839*s -0.179542389752729*s 0.0598081369691769*s  color=col0Psc visible=visPsc&vis0 label=labPsc r=b*0.4123^a
vertex omegaPsc: 0.99251748152043*s 0.00297395391015552*s 0.12206639371458*s  color=col0Psc visible=visPsc&vis0 label=labPsc r=b*0.3871^a
vertex iotaPsc: 0.991630714397899*s -0.0809708863626969*s 0.100559643119656*s  color=col0Psc visible=visPsc&vis0 label=labPsc r=b*0.3770^a
vertex omicronPsc: 0.8816314495982*s 0.443462442168139*s 0.161452932663505*s  color=col0Psc visible=visPsc&vis0 label=labPsc r=b*0.3608^a
vertex epsilonPsc: 0.951428865078735*s 0.274321781582828*s 0.139752190838688*s  color=col0Psc visible=visPsc&vis0 label=labPsc r=b*0.3608^a
vertex thetaPsc: 0.98463476088794*s -0.132576312791858*s 0.113656979273885*s  color=col0Psc visible=visPsc&vis0 label=labPsc r=b*0.3597^a
vertex lambdaPsc: 0.996817602678913*s -0.0722739999055799*s 0.033632364280739*s  color=col0Psc visible=visPsc&vis0 label=labPsc r=b*0.3501^a
vertex nuPsc: 0.896692763965994*s 0.431676964625718*s 0.0979647143748844*s  color=col0Psc visible=visPsc&vis0 label=labPsc r=b*0.3475^a
vertex xiPsc: 0.875375074565295*s 0.479966301640875*s 0.0578863379303377*s  color=col0Psc visible=visPsc&vis0 label=labPsc r=b*0.3335^a
vertex upsilonPsc: 0.832987412018137*s 0.307072313004036*s 0.460259237827637*s  color=col0Psc visible=visPsc&vis0 label=labPsc r=b*0.3331^a
vertex phiPsc: 0.859858614952644*s 0.2927518474177*s 0.418257717352884*s  color=col0Psc visible=visPsc&vis0 label=labPsc r=b*0.3285^a
vertex kappaPsc: 0.990155125104931*s -0.13781844549565*s 0.0244725215211289*s  color=col0Psc visible=visPsc&vis0 label=labPsc r=b*0.3197^a
vertex f19Psc: 0.996564823253701*s -0.0532761786553763*s 0.0634050616370642*s  color=col0Psc visible=visPsc&vis0 label=labPsc r=b*0.3192^a
vertex muPsc: 0.915673494920715*s 0.386747193582596*s 0.10940136633365*s  color=col0Psc visible=visPsc&vis0 label=labPsc r=b*0.3177^a
vertex f7Psc: 0.981488080882563*s -0.165537289544063*s 0.0963252451638109*s  color=col0Psc visible=visPsc&vis0 label=labPsc r=b*0.3008^a
vertex sigmaPsc: 0.815367402860272*s 0.234923219775448*s 0.529138053028915*s  color=col0Psc visible=visPsc&vis0 label=labPsc r=b*0.2822^a
vertex dPsc: 0.984883011528644*s 0.0947306478636879*s 0.145022611883787*s  color=col0Psc visible=visPsc&vis0 label=labPsc r=b*0.2793^a
vertex f62Psc: 0.968362734247782*s 0.213265132303963*s 0.129582399512945*s  color=col0Psc visible=visPsc&vis0 label=labPsc r=b*0.2462^a
vertex alphaMus: -0.348700349894332*s -0.0596199557819695*s -0.935336050228006*s  color=col0Mus visible=visMus&vis0 label=labMus r=b*0.5482^a
vertex betaMus: -0.362413928365877*s -0.076952722020039*s -0.928834981630278*s  color=col0Mus visible=visMus&vis0 label=labMus r=b*0.5036^a
vertex lambdaMus: -0.392061559233564*s 0.0224570782660492*s -0.919664837539796*s  color=col0Mus visible=visMus&vis0 label=labMus r=b*0.4282^a
vertex gammaMus: -0.300996773142084*s -0.04512021179207*s -0.952557142142082*s  color=col0Mus visible=visMus&vis0 label=labMus r=b*0.4178^a
vertex gamma2Vol: -0.0981046515517484*s 0.318340776493712*s -0.942886327913016*s  color=col0Vol visible=visVol&vis0 label=labVol r=b*0.4046^a
vertex betaVol: -0.239813865225155*s 0.324031483742147*s -0.915146385880223*s  color=col0Vol visible=visVol&vis0 label=labVol r=b*0.4044^a
vertex alphaVol: -0.285419850386917*s 0.278378230587885*s -0.917082913230787*s  color=col0Vol visible=visVol&vis0 label=labVol r=b*0.3936^a
vertex zetaVol: -0.127622449794556*s 0.269152356636131*s -0.954604378381774*s  color=col0Vol visible=visVol&vis0 label=labVol r=b*0.3884^a
vertex deltaVol: -0.123178813984043*s 0.353671389166697*s -0.92722355894918*s  color=col0Vol visible=visVol&vis0 label=labVol r=b*0.3873^a
vertex epsilonVol: -0.192538206791396*s 0.308108576426345*s -0.931664179872815*s  color=col0Vol visible=visVol&vis0 label=labVol r=b*0.3706^a
vertex alphaVul: 0.346949633082867*s -0.839487583146628*s 0.418194392413739*s  color=col0Vul visible=visVul&vis0 label=labVul r=b*0.3514^a
vertex f15Vul: 0.44951301665063*s -0.761579983408256*s 0.466833992692832*s  color=col0Vul visible=visVul&vis0 label=labVul r=b*0.3377^a
vertex alphaFor: 0.582438182842472*s 0.653791630922606*s -0.483034436145828*s  color=col0For visible=visFor&vis0 label=labFor r=b*0.3998^a
vertex betaFor: 0.622705579649675*s 0.571653148235201*s -0.534275620991587*s  color=col0For visible=visFor&vis0 label=labFor r=b*0.3452^a
vertex alphaCam: 0.109197360115918*s 0.385432775363886*s 0.91625188251867*s  color=col0Cam visible=visCam&vis0 label=labCam r=b*0.3720^a
vertex HD21291: 0.301917030859507*s 0.397969363197814*s 0.866294691449108*s  color=col0Cam visible=visCam&vis0 label=labCam r=b*0.3708^a
vertex gammaCam: 0.167475343212818*s 0.271240715523691*s 0.947829353659162*s  color=col0Cam visible=visCam&vis0 label=labCam r=b*0.3438^a
vertex HD24479: 0.226173912418674*s 0.390990675359901*s 0.892172434635165*s  color=col0Cam visible=visCam&vis0 label=labCam r=b*0.3202^a
vertex HD33564: 0.0267399722233987*s 0.184508371208599*s 0.982467116416342*s  color=col0Cam visible=visCam&vis0 label=labCam r=b*0.3027^a
vertex epsilonUMa: -0.545647999811483*s -0.134019494622085*s 0.827228526685926*s  color=col0UMa visible=visUMa&vis0 label=labUMa r=b*0.6676^a
vertex etaUMa: -0.581662996460096*s -0.298266699565221*s 0.756772842059975*s  color=col0UMa visible=visUMa&vis0 label=labUMa r=b*0.6608^a
vertex alphaUMa: -0.462075420531191*s 0.112311010822413*s 0.879700257240482*s  color=col0UMa visible=visUMa&vis0 label=labUMa r=b*0.6380^a
vertex zetaUMa: -0.53742399417484*s -0.208986593057615*s 0.817006765215155*s  color=col0UMa visible=visUMa&vis0 label=labUMa r=b*0.5951^a
vertex betaUMa: -0.538898832720637*s 0.135768167270527*s 0.831357355683064*s  color=col0UMa visible=visUMa&vis0 label=labUMa r=b*0.5821^a
vertex gammaUMa: -0.594048364208791*s 0.0123757480339756*s 0.804334123260638*s  color=col0UMa visible=visUMa&vis0 label=labUMa r=b*0.5716^a
vertex muUMa: -0.685522885653708*s 0.30552961669402*s 0.6608403941708*s  color=col0UMa visible=visUMa&vis0 label=labUMa r=b*0.4837^a
vertex psiUMa: -0.698870849945666*s 0.151238832007884*s 0.699075354156556*s  color=col0UMa visible=visUMa&vis0 label=labUMa r=b*0.4826^a
vertex iotaUMa: -0.475859487006737*s 0.471618232967602*s 0.742383991582659*s  color=col0UMa visible=visUMa&vis0 label=labUMa r=b*0.4800^a
vertex thetaUMa: -0.500837811196012*s 0.368472871918217*s 0.783191693991151*s  color=col0UMa visible=visUMa&vis0 label=labUMa r=b*0.4702^a
vertex deltaUMa: -0.544877272127408*s -0.0398654345372517*s 0.837567612463705*s  color=col0UMa visible=visUMa&vis0 label=labUMa r=b*0.4640^a
vertex lambdaUMa: -0.66343044037149*s 0.313964267292223*s 0.679180748882172*s  color=col0UMa visible=visUMa&vis0 label=labUMa r=b*0.4509^a
vertex omicronUMa: -0.302769067618179*s 0.385913075606717*s 0.871436738822378*s  color=col0UMa visible=visUMa&vis0 label=labUMa r=b*0.4463^a
vertex kappaUMa: -0.493102256413622*s 0.470237053361217*s 0.731933930328383*s  color=col0UMa visible=visUMa&vis0 label=labUMa r=b*0.4387^a
vertex hUMa: -0.365192568676289*s 0.271197686581228*s 0.890553874045026*s  color=col0UMa visible=visUMa&vis0 label=labUMa r=b*0.4234^a
vertex upsilonUMa: -0.438934079422352*s 0.27197068440166*s 0.856369558512997*s  color=col0UMa visible=visUMa&vis0 label=labUMa r=b*0.4123^a
vertex chiUMa: -0.672893285847991*s 0.0368766032382923*s 0.738819830536715*s  color=col0UMa visible=visUMa&vis0 label=labUMa r=b*0.4116^a
vertex phiUMa: -0.501793076845435*s 0.307777524184966*s 0.808379059375343*s  color=col0UMa visible=visUMa&vis0 label=labUMa r=b*0.3483^a
vertex alphaCMa: -0.192242128406119*s 0.938051384163544*s -0.288275154556797*s  color=col0CMa visible=visCMa&vis0 label=labCMa r=b*1.2847^a
vertex epsilonCMa: -0.225157465433638*s 0.845052927840993*s -0.484963570700795*s  color=col0CMa visible=visCMa&vis0 label=labCMa r=b*0.7218^a
vertex betaCMa: -0.0989263039637815*s 0.946054448235336*s -0.308536168638621*s  color=col0CMa visible=visCMa&vis0 label=labCMa r=b*0.6470^a
vertex deltaCMa: -0.26731829675268*s 0.854588659910067*s -0.445218093269311*s  color=col0CMa visible=visCMa&vis0 label=labCMa r=b*0.6364^a
vertex etaCMa: -0.31643922104475*s 0.812111014307456*s -0.4902467948137*s  color=col0CMa visible=visCMa&vis0 label=labCMa r=b*0.5727^a
vertex zetaCMa: -0.0804624710066597*s 0.86160502461207*s -0.501161223881833*s  color=col0CMa visible=visCMa&vis0 label=labCMa r=b*0.5068^a
vertex omicron2CMa: -0.252597304950735*s 0.878857362986381*s -0.404727484928131*s  color=col0CMa visible=visCMa&vis0 label=labCMa r=b*0.5006^a
vertex kappaCMa: -0.185478231030402*s 0.822350167148818*s -0.537901504370589*s  color=col0CMa visible=visCMa&vis0 label=labCMa r=b*0.4504^a
vertex sigmaCMa: -0.238926947736328*s 0.850220921581654*s -0.469082400171062*s  color=col0CMa visible=visCMa&vis0 label=labCMa r=b*0.4380^a
vertex omegaCMa: -0.290163486389386*s 0.843933474678492*s -0.451200001643888*s  color=col0CMa visible=visCMa&vis0 label=labCMa r=b*0.3995^a
vertex gammaCMa: -0.269295799739172*s 0.924383892399138*s -0.270174372796271*s  color=col0CMa visible=visCMa&vis0 label=labCMa r=b*0.3914^a
vertex nu2CMa: -0.155186114100394*s 0.931069076082688*s -0.330193345712704*s  color=col0CMa visible=visCMa&vis0 label=labCMa r=b*0.3873^a
vertex thetaCMa: -0.23422172926165*s 0.949413467087682*s -0.209175165959607*s  color=col0CMa visible=visCMa&vis0 label=labCMa r=b*0.3794^a
vertex iotaCMa: -0.236618406991254*s 0.926090231737451*s -0.293885372472663*s  color=col0CMa visible=visCMa&vis0 label=labCMa r=b*0.3657^a
vertex xi2CMa: -0.144718631113366*s 0.909142483110089*s -0.390533562210849*s  color=col0CMa visible=visCMa&vis0 label=labCMa r=b*0.3521^a
vertex HD50896: -0.218480110852263*s 0.887301603535855*s -0.40615551888985*s  color=col0CMa visible=visCMa&vis0 label=labCMa r=b*0.2169^a
vertex alphaLep: 0.108148400997129*s 0.945940562974216*s -0.305778309698035*s  color=col0Lep visible=visLep&vis0 label=labLep r=b*0.5441^a
vertex betaLep: 0.124525590044908*s 0.926870054872644*s -0.354126077554803*s  color=col0Lep visible=visLep&vis0 label=labLep r=b*0.5050^a
vertex muLep: 0.190923163734132*s 0.941243950176768*s -0.278582432693419*s  color=col0Lep visible=visLep&vis0 label=labLep r=b*0.4728^a
vertex epsilonLep: 0.213595843423663*s 0.899965558691602*s -0.380051060833998*s  color=col0Lep visible=visLep&vis0 label=labLep r=b*0.4654^a
vertex zetaLep: 0.049886061077019*s 0.965473489336887*s -0.25568011713443*s  color=col0Lep visible=visLep&vis0 label=labLep r=b*0.4387^a
vertex gammaLep: 0.0581199429035295*s 0.922441252193914*s -0.381738403213266*s  color=col0Lep visible=visLep&vis0 label=labLep r=b*0.4268^a
vertex etaLep: 0.0100519086423294*s 0.969544054710712*s -0.24471061502877*s  color=col0Lep visible=visLep&vis0 label=labLep r=b*0.4179^a
vertex deltaLep: 0.0306825096351394*s 0.933833392605129*s -0.356389924742669*s  color=col0Lep visible=visLep&vis0 label=labLep r=b*0.4049^a
vertex lambdaLep: 0.165708613657622*s 0.959570398546363*s -0.227519901532248*s  color=col0Lep visible=visLep&vis0 label=labLep r=b*0.3800^a
vertex kappaLep: 0.192377596841545*s 0.955543126382362*s -0.223446176644162*s  color=col0Lep visible=visLep&vis0 label=labLep r=b*0.3687^a
vertex iotaLep: 0.197020436698613*s 0.958692215481707*s -0.205163796752408*s  color=col0Lep visible=visLep&vis0 label=labLep r=b*0.3609^a
vertex thetaLep: -0.0310516174572825*s 0.965699218884561*s -0.257799952868565*s  color=col0Lep visible=visLep&vis0 label=labLep r=b*0.3397^a
vertex nuLep: 0.164518583018743*s 0.963132274924543*s -0.21286112101598*s  color=col0Lep visible=visLep&vis0 label=labLep r=b*0.2981^a
vertex zetaHer: -0.283411894672764*s -0.803623319433042*s 0.523323282896351*s  color=col0Her visible=visHer&vis0 label=labHer r=b*0.5089^a
vertex betaHer: -0.351068590132234*s -0.862104492052868*s 0.365413040003818*s  color=col0Her visible=visHer&vis0 label=labHer r=b*0.5084^a
vertex deltaHer: -0.172687628815877*s -0.891130909848569*s 0.41960062484035*s  color=col0Her visible=visHer&vis0 label=labHer r=b*0.4842^a
vertex piHer: -0.152894834139084*s -0.786206615013827*s 0.598750639416846*s  color=col0Her visible=visHer&vis0 label=labHer r=b*0.4664^a
vertex mu1Her: -0.0482353814650113*s -0.884024615686077*s 0.464944971836463*s  color=col0Her visible=visHer&vis0 label=labHer r=b*0.4406^a
vertex etaHer: -0.254064889791648*s -0.735919899000361*s 0.627592968436116*s  color=col0Her visible=visHer&vis0 label=labHer r=b*0.4324^a
vertex iotaHer: -0.0598839103221436*s -0.692156847409699*s 0.719258518106248*s  color=col0Her visible=visHer&vis0 label=labHer r=b*0.4217^a
vertex gammaHer: -0.387745959357064*s -0.861781663276807*s 0.327086281953448*s  color=col0Her visible=visHer&vis0 label=labHer r=b*0.4157^a
vertex omicronHer: 0.0328338074553471*s -0.875962144579993*s 0.481261116599715*s  color=col0Her visible=visHer&vis0 label=labHer r=b*0.4132^a
vertex tauHer: -0.290747521488816*s -0.627408881654778*s 0.722373846404209*s  color=col0Her visible=visHer&vis0 label=labHer r=b*0.4124^a
vertex xiHer: -0.0045502490959014*s -0.87251283939009*s 0.488569995325754*s  color=col0Her visible=visHer&vis0 label=labHer r=b*0.4118^a
vertex epsilonHer: -0.217354192566738*s -0.830185631583819*s 0.513370209581191*s  color=col0Her visible=visHer&vis0 label=labHer r=b*0.4063^a
vertex thetaHer: -0.00982567620554203*s -0.795957660182722*s 0.605272549587003*s  color=col0Her visible=visHer&vis0 label=labHer r=b*0.3955^a
vertex rhoHer: -0.12264866992715*s -0.787854264423994*s 0.603525444197698*s  color=col0Her visible=visHer&vis0 label=labHer r=b*0.3843^a
vertex sigmaHer: -0.267815409375223*s -0.688391180327588*s 0.674086410891343*s  color=col0Her visible=visHer&vis0 label=labHer r=b*0.3800^a
vertex lambdaHer: -0.110148105890836*s -0.891307432819295*s 0.439816387791244*s  color=col0Her visible=visHer&vis0 label=labHer r=b*0.3511^a
vertex eHer: -0.143001754351411*s -0.782891084897694*s 0.60550148425923*s  color=col0Her visible=visHer&vis0 label=labHer r=b*0.3443^a
vertex chiHer: -0.387073014823641*s -0.629185372728262*s 0.674017987846122*s  color=col0Her visible=visHer&vis0 label=labHer r=b*0.3373^a
vertex alpha2CVn: -0.761711895844409*s -0.194422331297001*s 0.618057396058129*s  color=col0CVn visible=visCVn&vis0 label=labCVn r=b*0.5192^a
vertex betaCVn: -0.743513057074794*s -0.114461107839891*s 0.658852782305243*s  color=col0CVn visible=visCVn&vis0 label=labCVn r=b*0.3658^a
vertex alphaInd: 0.435487074026394*s -0.52159401440407*s -0.733682964565606*s  color=col0Ind visible=visInd&vis0 label=labInd r=b*0.4709^a
vertex betaInd: 0.365941815725684*s -0.376047515785178*s -0.85127836421184*s  color=col0Ind visible=visInd&vis0 label=labInd r=b*0.4136^a
vertex thetaInd: 0.460353454110839*s -0.380311064366814*s -0.80214599145567*s  color=col0Ind visible=visInd&vis0 label=labInd r=b*0.3593^a
vertex alphaCar: -0.0647620454370783*s 0.60236121288918*s -0.795592135882125*s  color=col0Car visible=visCar&vis0 label=labCar r=b*1.1361^a
vertex betaCar: -0.257757527967799*s 0.22908421747581*s -0.938659404725391*s  color=col0Car visible=visCar&vis0 label=labCar r=b*0.6819^a
vertex epsilonCar: -0.29579160119905*s 0.410652384968032*s -0.862480114194043*s  color=col0Car visible=visCar&vis0 label=labCar r=b*0.6310^a
vertex zetaPupCar: -0.395581636705218*s 0.654956711790435*s -0.643853146596553*s  color=col0Car visible=visCar&vis0 label=labCar r=b*0.6115^a
vertex iotaCar: -0.386933199394324*s 0.331039942541735*s -0.860636540967462*s  color=col0Car visible=visCar&vis0 label=labCar r=b*0.5913^a
vertex thetaCar: -0.406484109309907*s 0.14012751026976*s -0.902848242920221*s  color=col0Car visible=visCar&vis0 label=labCar r=b*0.5428^a
vertex nuPupCar: -0.122092936157246*s 0.718421065959011*s -0.684809818071281*s  color=col0Car visible=visCar&vis0 label=labCar r=b*0.4854^a
vertex omegaCar: -0.303817074338483*s 0.150864560589597*s -0.940709875412453*s  color=col0Car visible=visCar&vis0 label=labCar r=b*0.4701^a
vertex aCar: -0.381397317807323*s 0.344401613263676*s -0.857859903918325*s  color=col0Car visible=visCar&vis0 label=labCar r=b*0.4606^a
vertex qCar: -0.431122074712188*s 0.205681137010083*s -0.878538005196188*s  color=col0Car visible=visCar&vis0 label=labCar r=b*0.4436^a
vertex sCar: -0.476553827103369*s 0.200163685154017*s -0.856055459078847*s  color=col0Car visible=visCar&vis0 label=labCar r=b*0.4078^a
vertex uCar: -0.494265438502825*s 0.145027282460991*s -0.857128207238328*s  color=col0Car visible=visCar&vis0 label=labCar r=b*0.4036^a
vertex xCar: -0.500946478552915*s 0.111649330118346*s -0.858246498804136*s  color=col0Car visible=visCar&vis0 label=labCar r=b*0.3900^a
vertex dCar: -0.324800616820795*s 0.382971586239449*s -0.86477588047197*s  color=col0Car visible=visCar&vis0 label=labCar r=b*0.3732^a
vertex wCar: -0.463004257184982*s 0.158152563973241*s -0.87213234336153*s  color=col0Car visible=visCar&vis0 label=labCar r=b*0.3407^a
vertex alphaUMi: 0.00747881669798246*s 0.00795740221340561*s 0.999940371747642*s  color=PolarisCol visible=visUMi&vis0 label=labUMi r=b*0.6155^a
vertex betaUMi: -0.202118744619829*s -0.186273863159433*s 0.961483260892755*s  color=col0UMi visible=visUMi&vis0 label=labUMi r=b*0.6020^a
vertex gammaUMi: -0.200675137671035*s -0.240660061011917*s 0.949637943720896*s  color=col0UMi visible=visUMi&vis0 label=labUMi r=b*0.4960^a
vertex zetaUMi: -0.119665827805961*s -0.176017085795438*s 0.977086523888031*s  color=col0UMi visible=visUMi&vis0 label=labUMi r=b*0.3710^a
vertex deltaUMi: -0.00943869763710869*s -0.0591481227844988*s 0.998204593536808*s  color=col0UMi visible=visUMi&vis0 label=labUMi r=b*0.3661^a
vertex epsilonUMi: -0.0457571395059932*s -0.131633527380396*s 0.990241838468575*s  color=col0UMi visible=visUMi&vis0 label=labUMi r=b*0.3658^a
vertex etaUMi: -0.107598814899899*s -0.222469125761181*s 0.968983995283303*s  color=col0UMi visible=visUMi&vis0 label=labUMi r=b*0.3133^a
vertex alphaCMi: -0.423665709335884*s 0.901352466482414*s 0.0898392892836448*s  color=col0CMi visible=visCMi&vis0 label=labCMi r=b*0.8993^a
vertex betaCMi: -0.373146758390436*s 0.916653662119678*s 0.14320461034929*s  color=col0CMi visible=visCMi&vis0 label=labCMi r=b*0.5182^a
vertex f46LMi: -0.79505886530525*s 0.232490212800091*s 0.560205053218637*s  color=col0LMi visible=visLMi&vis0 label=labLMi r=b*0.4024^a
vertex betaLMi: -0.741224300746764*s 0.309220689304937*s 0.595792834203509*s  color=col0LMi visible=visLMi&vis0 label=labLMi r=b*0.3664^a
vertex f21LMi: -0.723933271724138*s 0.380884882488818*s 0.57519329306092*s  color=col0LMi visible=visLMi&vis0 label=labLMi r=b*0.3518^a
vertex f10LMi: -0.651895128710104*s 0.474268906380758*s 0.591693962791946*s  color=col0LMi visible=visLMi&vis0 label=labLMi r=b*0.3391^a
vertex betaHyi: 0.221622646019981*s 0.0263462773736707*s -0.974776526409849*s  color=col0Hyi visible=visHyi&vis0 label=labHyi r=b*0.5092^a
vertex alphaHyi: 0.414426501796247*s 0.238334199277938*s -0.878320832078728*s  color=col0Hyi visible=visHyi&vis0 label=labHyi r=b*0.5092^a
vertex gammaHyi: 0.149834036720675*s 0.228220315067504*s -0.962011044235188*s  color=col0Hyi visible=visHyi&vis0 label=labHyi r=b*0.4632^a
vertex epsilonHyi: 0.285059052353578*s 0.239215008863487*s -0.928179678836874*s  color=col0Hyi visible=visHyi&vis0 label=labHyi r=b*0.3897^a
vertex deltaHyi: 0.297653017282108*s 0.212771233027511*s -0.930661637599192*s  color=col0Hyi visible=visHyi&vis0 label=labHyi r=b*0.3892^a
vertex alphaLeo: -0.867745786796211*s 0.452714579155405*s 0.205101826704612*s  color=col0Leo visible=visLeo&vis0 label=labLeo r=b*0.7374^a
vertex betaLeo: -0.96763991705959*s 0.0404632987255403*s 0.249069693799059*s  color=col0Leo visible=visLeo&vis0 label=labLeo r=b*0.6080^a
vertex gammaLeo: -0.855721972385363*s 0.392490814760647*s 0.337180762063063*s  color=col0Leo visible=visLeo&vis0 label=labLeo r=b*0.6070^a
vertex deltaLeo: -0.919829215488336*s 0.180767210352023*s 0.348191656987441*s  color=col0Leo visible=visLeo&vis0 label=labLeo r=b*0.5504^a
vertex epsilonLeo: -0.766847321770447*s 0.501026385580233*s 0.401145542223643*s  color=col0Leo visible=visLeo&vis0 label=labLeo r=b*0.4879^a
vertex thetaLeo: -0.946623164950129*s 0.185544830991278*s 0.263586227394793*s  color=col0Leo visible=visLeo&vis0 label=labLeo r=b*0.4646^a
vertex etaLeo: -0.847550901892228*s 0.446924518137134*s 0.286209615124234*s  color=col0Leo visible=visLeo&vis0 label=labLeo r=b*0.4464^a
vertex zetaLeo: -0.829379817096732*s 0.394826498265112*s 0.395273519553613*s  color=col0Leo visible=visLeo&vis0 label=labLeo r=b*0.4457^a
vertex muLeo: -0.767702341644307*s 0.469163934187615*s 0.436484040362813*s  color=col0Leo visible=visLeo&vis0 label=labLeo r=b*0.3936^a
vertex alphaEqu: 0.754706845650482*s -0.649378491904104*s 0.0934085187798817*s  color=col0Equ visible=visEqu&vis0 label=labEqu r=b*0.3943^a
vertex deltaEqu: 0.74236239066271*s -0.646563026471871*s 0.175654017116262*s  color=col0Equ visible=visEqu&vis0 label=labEqu r=b*0.3473^a
vertex gammaEqu: 0.73027655812872*s -0.659613042456577*s 0.177782965631828*s  color=col0Equ visible=visEqu&vis0 label=labEqu r=b*0.3326^a
vertex betaEqu: 0.772074706131137*s -0.623984124312347*s 0.120600417738383*s  color=col0Equ visible=visEqu&vis0 label=labEqu r=b*0.3032^a
vertex alphaLac: 0.591166783350143*s -0.237650027156207*s 0.770742693028029*s  color=col0Lac visible=visLac&vis0 label=labLac r=b*0.4186^a
vertex f1Lac: 0.711101517263534*s -0.3424629916716*s 0.614047010806858*s  color=col0Lac visible=visLac&vis0 label=labLac r=b*0.3724^a
vertex f5Lac: 0.620784012789315*s -0.255076222828309*s 0.741325387406123*s  color=col0Lac visible=visLac&vis0 label=labLac r=b*0.3607^a
vertex f6Lac: 0.674788810507811*s -0.273842953090151*s 0.685324812228711*s  color=col0Lac visible=visLac&vis0 label=labLac r=b*0.3555^a
vertex betaLac: 0.558520868199724*s -0.246868802523024*s 0.791902919634898*s  color=col0Lac visible=visLac&vis0 label=labLac r=b*0.3478^a
vertex f4Lac: 0.593765257749329*s -0.259391505846345*s 0.761681603680067*s  color=col0Lac visible=visLac&vis0 label=labLac r=b*0.3459^a
vertex alphaLyn: -0.63915474291306*s 0.523717106468687*s 0.563206540270802*s  color=col0Lyn visible=visLyn&vis0 label=labLyn r=b*0.4729^a
vertex f38Lyn: -0.615416465696868*s 0.514112674613681*s 0.597453539240285*s  color=col0Lyn visible=visLyn&vis0 label=labLyn r=b*0.4140^a
vertex f10UMa: -0.533575322764045*s 0.522677125416827*s 0.664910518418266*s  color=col0Lyn visible=visLyn&vis0 label=labLyn r=b*0.3927^a
vertex f31Lyn: -0.430869548277654*s 0.589481329769234*s 0.683273879363543*s  color=col0Lyn visible=visLyn&vis0 label=labLyn r=b*0.3660^a
vertex f2Lyn: -0.0493244557785264*s 0.512706265750638*s 0.857146068720022*s  color=col0Lyn visible=visLyn&vis0 label=labLyn r=b*0.3582^a
vertex f15Lyn: -0.134760085530005*s 0.506602099886163*s 0.851583250034238*s  color=col0Lyn visible=visLyn&vis0 label=labLyn r=b*0.3547^a
vertex f21Lyn: -0.246910166978676*s 0.605608342099219*s 0.756487875264632*s  color=col0Lyn visible=visLyn&vis0 label=labLyn r=b*0.3452^a
vertex HD77912: -0.574122691288764*s 0.534339366177707*s 0.620374545819018*s  color=col0Lyn visible=visLyn&vis0 label=labLyn r=b*0.3367^a
vertex alphaLyr: 0.128089547737062*s -0.768628721918727*s 0.626739942561586*s  color=col0Lyr visible=visLyr&vis0 label=labLyr r=b*0.9802^a
vertex gammaLyr: 0.21753494805454*s -0.812636675202435*s 0.540647926557423*s  color=col0Lyr visible=visLyr&vis0 label=labLyr r=b*0.4749^a
vertex betaLyr: 0.18449987916901*s -0.814252489066446*s 0.550411372189672*s  color=col0Lyr visible=visLyr&vis0 label=labLyr r=b*0.4404^a
vertex delta2Lyr: 0.191481115020845*s -0.776054250148126*s 0.600894985348857*s  color=col0Lyr visible=visLyr&vis0 label=labLyr r=b*0.3786^a
vertex zeta1Lyr: 0.156848800173732*s -0.776233695699168*s 0.61062239030785*s  color=col0Lyr visible=visLyr&vis0 label=labLyr r=b*0.3632^a
vertex alphaVir: -0.911427771141219*s -0.361806418915613*s -0.195947781880811*s  color=col0Vir visible=visVir&vis0 label=labVir r=b*0.8149^a
vertex gammaVir: -0.982056549566099*s -0.186520552983548*s -0.0278391229933774*s  color=col0Vir visible=visVir&vis0 label=labVir r=b*0.5223^a
vertex epsilonVir: -0.944763860168003*s -0.268713190034241*s 0.187655189169063*s  color=col0Vir visible=visVir&vis0 label=labVir r=b*0.5014^a
vertex zetaVir: -0.913367418768363*s -0.406936002188486*s -0.0127690428486064*s  color=col0Vir visible=visVir&vis0 label=labVir r=b*0.4555^a
vertex deltaVir: -0.967721206895667*s -0.245553130357022*s 0.0567391037668113*s  color=col0Vir visible=visVir&vis0 label=labVir r=b*0.4528^a
vertex f109Vir: -0.743941976783187*s -0.667520595646008*s 0.031090023614048*s  color=col0Vir visible=visVir&vis0 label=labVir r=b*0.4230^a
vertex etaVir: -0.995593355997728*s -0.0926898541705065*s -0.0142288589504567*s  color=col0Vir visible=visVir&vis0 label=labVir r=b*0.4075^a
vertex muVir: -0.749532402094929*s -0.654280699312454*s -0.100587994895076*s  color=col0Vir visible=visVir&vis0 label=labVir r=b*0.4019^a
vertex nuVir: -0.992266441604536*s 0.0553312054097993*s 0.111111505135026*s  color=col0Vir visible=visVir&vis0 label=labVir r=b*0.3856^a
vertex iotaVir: -0.820841548855179*s -0.561095296834946*s -0.106729656341313*s  color=col0Vir visible=visVir&vis0 label=labVir r=b*0.3815^a
vertex tauVir: -0.85912171150562*s -0.511174198349452*s 0.0247148490072196*s  color=col0Vir visible=visVir&vis0 label=labVir r=b*0.3734^a
vertex kappaVir: -0.819420151179482*s -0.54404257804113*s -0.180466864325163*s  color=col0Vir visible=visVir&vis0 label=labVir r=b*0.3694^a
vertex alphaPyx: -0.550276101056742*s 0.629305575876559*s -0.548790219279155*s  color=col0Pyx visible=visPyx&vis0 label=labPyx r=b*0.4346^a
vertex betaPyx: -0.52705249761819*s 0.621751067329291*s -0.579345557529628*s  color=col0Pyx visible=visPyx&vis0 label=labPyx r=b*0.3867^a
vertex gammaPyx: -0.602288268745643*s 0.647752938216274*s -0.466545788067538*s  color=col0Pyx visible=visPyx&vis0 label=labPyx r=b*0.3820^a
vertex epsilonMic: 0.648157974307594*s -0.546029276264961*s -0.530794941387951*s  color=col0Mic visible=visMic&vis0 label=labMic r=b*0.3354^a
vertex gammaMic: 0.606257744196389*s -0.590979918078123*s -0.532160017316484*s  color=col0Mic visible=visMic&vis0 label=labMic r=b*0.3301^a
vertex alphaMic: 0.566549825501819*s -0.609515207474718*s -0.554538102460878*s  color=col0Mic visible=visMic&vis0 label=labMic r=b*0.3121^a
vertex alphaCrB: -0.526015116616504*s -0.722810212478011*s 0.448166814733552*s  color=col0CrB visible=visCrB&vis0 label=labCrB r=b*0.5997^a
vertex betaCrB: -0.535584451851698*s -0.69129496905098*s 0.485036659129515*s  color=col0CrB visible=visCrB&vis0 label=labCrB r=b*0.4230^a
vertex gammaCrB: -0.502119607200627*s -0.743489947885517*s 0.441699668845109*s  color=col0CrB visible=visCrB&vis0 label=labCrB r=b*0.4147^a
vertex thetaCrB: -0.508385247784212*s -0.687099339528538*s 0.519075078822738*s  color=col0CrB visible=visCrB&vis0 label=labCrB r=b*0.3880^a
vertex epsilonCrB: -0.450676449548308*s -0.770436771940694*s 0.450907882237751*s  color=col0CrB visible=visCrB&vis0 label=labCrB r=b*0.3716^a
vertex deltaCrB: -0.480597514040222*s -0.759619501151374*s 0.438182887581082*s  color=col0CrB visible=visCrB&vis0 label=labCrB r=b*0.3358^a
vertex iotaCrB: -0.425704396412567*s -0.756391687897996*s 0.496636065297147*s  color=col0CrB visible=visCrB&vis0 label=labCrB r=b*0.3186^a
vertex nuOct: 0.182888859640805*s -0.122955421391451*s -0.975414593580461*s  color=col0Oct visible=visOct&vis0 label=labOct r=b*0.4076^a
vertex betaOct: 0.144969208364888*s -0.0466610107350398*s -0.988335306818107*s  color=col0Oct visible=visOct&vis0 label=labOct r=b*0.3805^a
vertex deltaOct: -0.0854213749192179*s -0.0664683422203523*s -0.994125318151282*s  color=col0Oct visible=visOct&vis0 label=labOct r=b*0.3575^a
vertex betaOri: 0.189614907617964*s 0.971512959663226*s -0.142157504252961*s  color=col0Ori visible=visOri&vis0 label=labOri r=b*0.9565^a
vertex alphaOri: 0.0146212784802442*s 0.991541307770782*s 0.128965317817664*s  color=col0Ori visible=visOri&vis0 label=labOri r=b*0.8913^a
vertex gammaOri: 0.144463497830846*s 0.983267079735545*s 0.110978140653062*s  color=col0Ori visible=visOri&vis0 label=labOri r=b*0.7000^a
vertex epsilonOri: 0.0976837584439217*s 0.995001903037003*s -0.0207146394854582*s  color=col0Ori visible=visOri&vis0 label=labOri r=b*0.6882^a
vertex zetaOri: 0.0779384983426728*s 0.996388850545151*s -0.0336875197276541*s  color=col0Ori visible=visOri&vis0 label=labOri r=b*0.6790^a
vertex kappaOri: 0.0471861708062695*s 0.984684819898254*s -0.167837036278007*s  color=col0Ori visible=visOri&vis0 label=labOri r=b*0.6299^a
vertex deltaOri: 0.115913567959323*s 0.993247160645338*s -0.00491147970715561*s  color=col0Ori visible=visOri&vis0 label=labOri r=b*0.6115^a
vertex pi3Ori: 0.293109669809919*s 0.94826696085266*s 0.121969227345178*s  color=col0Ori visible=visOri&vis0 label=labOri r=b*0.4692^a
vertex lambdaOri: 0.10033818724727*s 0.979835535612771*s 0.172784754334302*s  color=col0Ori visible=visOri&vis0 label=labOri r=b*0.4645^a
vertex pi4Ori: 0.288323147899845*s 0.952460810259232*s 0.0984284882818593*s  color=col0Ori visible=visOri&vis0 label=labOri r=b*0.4341^a
vertex pi5Ori: 0.276858002298893*s 0.959934230436175*s 0.0433118898222465*s  color=col0Ori visible=visOri&vis0 label=labOri r=b*0.4318^a
vertex muOri: -0.0165842417621652*s 0.985725403769581*s 0.16754220748358*s  color=col0Ori visible=visOri&vis0 label=labOri r=b*0.3820^a
vertex nuOri: -0.0383848533914917*s 0.966226434294089*s 0.254819702341567*s  color=col0Ori visible=visOri&vis0 label=labOri r=b*0.3665^a
vertex pi2Ori: 0.288519467964108*s 0.944767952680477*s 0.155467141845623*s  color=col0Ori visible=visOri&vis0 label=labOri r=b*0.3658^a
vertex xiOri: -0.0569079856178519*s 0.967772061477743*s 0.245313510015324*s  color=col0Ori visible=visOri&vis0 label=labOri r=b*0.3632^a
vertex chi1Ori: 0.0164992543904019*s 0.937873564748583*s 0.346584695493536*s  color=col0Ori visible=visOri&vis0 label=labOri r=b*0.3530^a
vertex pi6Ori: 0.258965729577483*s 0.965401984383925*s 0.0305901855499841*s  color=col0Ori visible=visOri&vis0 label=labOri r=b*0.3443^a
vertex pi1Ori: 0.26976049928782*s 0.946532709563433*s 0.176932480767359*s  color=col0Ori visible=visOri&vis0 label=labOri r=b*0.3399^a
vertex chi2Ori: -0.0225655750401848*s 0.938610721774612*s 0.344239317616171*s  color=col0Ori visible=visOri&vis0 label=labOri r=b*0.3392^a
vertex f01Ori: -0.0569633565507247*s 0.958982549510485*s 0.27768263493572*s  color=col0Ori visible=visOri&vis0 label=labOri r=b*0.3227^a
vertex f5Ori: 0.280487628981379*s 0.958825690803856*s 0.044497018359797*s  color=col0Ori visible=visOri&vis0 label=labOri r=b*0.2881^a
vertex alphaPic: -0.0986332592481691*s 0.459454408565029*s -0.882707837633859*s  color=col0Pic visible=visPic&vis0 label=labPic r=b*0.4666^a
vertex betaPic: 0.0331148488509002*s 0.627662442087651*s -0.777780988182501*s  color=col0Pic visible=visPic&vis0 label=labPic r=b*0.4066^a
vertex gammaPic: 0.023525060008732*s 0.556367600556177*s -0.830603193229443*s  color=col0Pic visible=visPic&vis0 label=labPic r=b*0.3418^a
vertex alphaPav: 0.330389468792519*s -0.439455774804618*s -0.835297205132323*s  color=col0Pav visible=visPav&vis0 label=labPav r=b*0.6519^a
vertex betaPav: 0.270170019563394*s -0.301812638201324*s -0.91428512617841*s  color=col0Pav visible=visPav&vis0 label=labPav r=b*0.4495^a
vertex deltaPav: 0.219560506283849*s -0.340291348295403*s -0.914327612158616*s  color=col0Pav visible=visPav&vis0 label=labPav r=b*0.4278^a
vertex etaPav: -0.0216649840695858*s -0.426291718291943*s -0.904326268213507*s  color=col0Pav visible=visPav&vis0 label=labPav r=b*0.4198^a
vertex epsilonPav: 0.151591399029094*s -0.253199800661522*s -0.955463190649105*s  color=col0Pav visible=visPav&vis0 label=labPav r=b*0.4024^a
vertex lambdaPav: 0.110402060149414*s -0.45387354361903*s -0.884200311873656*s  color=col0Pav visible=visPav&vis0 label=labPav r=b*0.3832^a
vertex zetaPav: 0.0637851187854551*s -0.312508037247333*s -0.947771167148139*s  color=col0Pav visible=visPav&vis0 label=labPav r=b*0.3831^a
vertex gammaPav: 0.330689714932738*s -0.256927547217134*s -0.908092807987538*s  color=col0Pav visible=visPav&vis0 label=labPav r=b*0.3690^a
vertex piPav: 0.021583293338062*s -0.443114073469051*s -0.896205377880733*s  color=col0Pav visible=visPav&vis0 label=labPav r=b*0.3632^a
vertex xiPav: 0.0534080001672389*s -0.47449898244702*s -0.878634338718263*s  color=col0Pav visible=visPav&vis0 label=labPav r=b*0.3558^a
vertex kappaPav: 0.0998113279272503*s -0.374509468778762*s -0.921835319681584*s  color=col0Pav visible=visPav&vis0 label=labPav r=b*0.3548^a
vertex alphaAndPeg: 0.871804667172319*s 0.0372110032429284*s 0.488438290405468*s  color=col0Peg visible=visPeg&vis0 label=labPeg r=b*0.6256^a
vertex alphaPeg: 0.93777725791622*s -0.224728915997662*s 0.264708762321257*s  color=col0Peg visible=visPeg&vis0 label=labPeg r=b*0.5652^a
vertex betaPeg: 0.855888296598443*s -0.209138508826154*s 0.472986583183698*s  color=col0Peg visible=visPeg&vis0 label=labPeg r=b*0.5642^a
vertex epsilonPeg: 0.820031207682687*s -0.54534627933419*s 0.173626766493046*s  color=col0Peg visible=visPeg&vis0 label=labPeg r=b*0.5564^a
vertex gammaPeg: 0.962448592171687*s 0.0614649292547694*s 0.264414012295951*s  color=col0Peg visible=visPeg&vis0 label=labPeg r=b*0.5304^a
vertex etaPeg: 0.816159660701881*s -0.279992345644883*s 0.505457905886599*s  color=col0Peg visible=visPeg&vis0 label=labPeg r=b*0.4909^a
vertex f42Peg: 0.926545153400371*s -0.324485889320408*s 0.190323373084408*s  color=col0Peg visible=visPeg&vis0 label=labPeg r=b*0.4582^a
vertex thetaPeg: 0.884683867054064*s -0.452964395336325*s 0.110262014909327*s  color=col0Peg visible=visPeg&vis0 label=labPeg r=b*0.4413^a
vertex muPeg: 0.867689362545816*s -0.268191759332485*s 0.418555074453748*s  color=col0Peg visible=visPeg&vis0 label=labPeg r=b*0.4297^a
vertex iotaPeg: 0.797567472916743*s -0.422921610359146*s 0.43014350818817*s  color=col0Peg visible=visPeg&vis0 label=labPeg r=b*0.4104^a
vertex lambdaPeg: 0.870580531105394*s -0.283614855901414*s 0.402059886549592*s  color=col0Peg visible=visPeg&vis0 label=labPeg r=b*0.3862^a
vertex kappaPeg: 0.750652861282972*s -0.497511348065785*s 0.43474445412616*s  color=col0Peg visible=visPeg&vis0 label=labPeg r=b*0.3771^a
vertex xiPeg: 0.929228006476604*s -0.301787400977916*s 0.213212749596528*s  color=col0Peg visible=visPeg&vis0 label=labPeg r=b*0.3710^a
vertex pi1Peg: 0.74203550756393*s -0.384571892840908*s 0.549079015034359*s  color=col0Peg visible=visPeg&vis0 label=labPeg r=b*0.2663^a
vertex alphaPer: 0.399984491676516*s 0.503962934421287*s 0.765528423474768*s  color=col0Per visible=visPer&vis0 label=labPer r=b*0.6461^a
vertex betaPer: 0.509629728881243*s 0.555773751895379*s 0.656805204108923*s  color=col0Per visible=visPer&vis0 label=labPer r=b*0.6170^a
vertex epsilonPer: 0.383534461847624*s 0.662012862977746*s 0.643925683466082*s  color=col0Per visible=visPer&vis0 label=labPer r=b*0.5206^a
vertex zetaPer: 0.437534308616128*s 0.726886468865*s 0.529339012509732*s  color=col0Per visible=visPer&vis0 label=labPer r=b*0.5131^a
vertex deltaPer: 0.373065888092486*s 0.557499091494297*s 0.741631044472114*s  color=col0Per visible=visPer&vis0 label=labPer r=b*0.5047^a
vertex gammaPer: 0.406981920697764*s 0.431696629228143*s 0.804986792772539*s  color=col0Per visible=visPer&vis0 label=labPer r=b*0.4944^a
vertex rhoPer: 0.53316910100412*s 0.566283771969958*s 0.628532735295414*s  color=col0Per visible=visPer&vis0 label=labPer r=b*0.4689^a
vertex omicronPer: 0.466156017729326*s 0.704307690929865*s 0.535396342564813*s  color=col0Per visible=visPer&vis0 label=labPer r=b*0.4113^a
vertex etaPer: 0.407806911340741*s 0.382516271369277*s 0.829080710908456*s  color=col0Per visible=visPer&vis0 label=labPer r=b*0.4078^a
vertex xiPer: 0.403026599139763*s 0.703070199729644*s 0.585885530319665*s  color=col0Per visible=visPer&vis0 label=labPer r=b*0.3953^a
vertex f16Per: 0.572282632089105*s 0.534985904142717*s 0.621516428888059*s  color=col0Per visible=visPer&vis0 label=labPer r=b*0.3709^a
vertex alphaPhe: 0.735895236589357*s 0.0890557304641148*s -0.671213287738404*s  color=col0Phe visible=visPhe&vis0 label=labPhe r=b*0.5558^a
vertex betaPhe: 0.65799845826652*s 0.198881452558731*s -0.726281072827188*s  color=col0Phe visible=visPhe&vis0 label=labPhe r=b*0.4503^a
vertex gammaPhe: 0.67425699272236*s 0.27764500446644*s -0.68431773267966*s  color=col0Phe visible=visPhe&vis0 label=labPhe r=b*0.4433^a
vertex zetaPhe: 0.545991677107922*s 0.170849097363788*s -0.820185146451006*s  color=col0Phe visible=visPhe&vis0 label=labPhe r=b*0.4053^a
vertex kappaPhe: 0.71977556528971*s 0.0868222381338457*s -0.688756150300894*s  color=col0Phe visible=visPhe&vis0 label=labPhe r=b*0.3986^a
vertex epsilonPhe: 0.698892173019455*s 0.0328357789983083*s -0.714472912089548*s  color=col0Phe visible=visPhe&vis0 label=labPhe r=b*0.3940^a
vertex deltaPhe: 0.604294138773263*s 0.257633314026665*s -0.753958665543356*s  color=col0Phe visible=visPhe&vis0 label=labPhe r=b*0.3891^a
vertex psiPhe: 0.607536862255021*s 0.332324607490811*s -0.72142866331842*s  color=col0Phe visible=visPhe&vis0 label=labPhe r=b*0.3622^a
vertex alphaAri: 0.775732661286478*s 0.487973624011675*s 0.400150697215824*s  color=col0Ari visible=visAri&vis0 label=labAri r=b*0.6063^a
vertex betaAri: 0.816624296404636*s 0.453238113810084*s 0.35735132672415*s  color=col0Ari visible=visAri&vis0 label=labAri r=b*0.5365^a
vertex f41Ari: 0.650636041411171*s 0.604425266211234*s 0.459720392393332*s  color=col0Ari visible=visAri&vis0 label=labAri r=b*0.4382^a
vertex gammaAri: 0.826820115457238*s 0.453625508735649*s 0.332554348189289*s  color=col0Ari visible=visAri&vis0 label=labAri r=b*0.4113^a
vertex alphaRet: 0.205266638608202*s 0.415213875285696*s -0.886263530133518*s  color=col0Ret visible=visRet&vis0 label=labRet r=b*0.4472^a
vertex betaRet: 0.237930683672939*s 0.354555773539933*s -0.904256154646695*s  color=col0Ret visible=visRet&vis0 label=labRet r=b*0.3979^a
vertex epsilonRet: 0.222304114351335*s 0.460626771796493*s -0.85930428711069*s  color=col0Ret visible=visRet&vis0 label=labRet r=b*0.3469^a
vertex deltaRet: 0.241412465720621*s 0.414684419287997*s -0.877357882391482*s  color=col0Ret visible=visRet&vis0 label=labRet r=b*0.3428^a
vertex gamma2Vel: -0.364460174513565*s 0.570125613315069*s -0.736291767056822*s  color=col0Vel visible=visVel&vis0 label=labVel r=b*0.6756^a
vertex delta1Vel: -0.380830643542707*s 0.432566813711365*s -0.817223330928851*s  color=col0Vel visible=visVel&vis0 label=labVel r=b*0.6381^a
vertex lambdaVel: -0.532251485190685*s 0.492088645852479*s -0.688881064578918*s  color=col0Vel visible=visVel&vis0 label=labVel r=b*0.5836^a
vertex kappaVel: -0.442690623317376*s 0.361877329582723*s -0.820408319290431*s  color=col0Vel visible=visVel&vis0 label=labVel r=b*0.5737^a
vertex muVel: -0.616812451932969*s 0.200634794431792*s -0.761109767644425*s  color=col0Vel visible=visVel&vis0 label=labVel r=b*0.5212^a
vertex phiVel: -0.497699759517051*s 0.293739710861883*s -0.816095540754541*s  color=col0Vel visible=visVel&vis0 label=labVel r=b*0.4464^a
vertex omicronVel: -0.388806803140363*s 0.459035992663034*s -0.798821148487966*s  color=col0Vel visible=visVel&vis0 label=labVel r=b*0.4429^a
vertex psiVel: -0.606033471234518*s 0.45768650452193*s -0.650573973750824*s  color=col0Vel visible=visVel&vis0 label=labVel r=b*0.4307^a
vertex qVel: -0.665054088295099*s 0.324862528995*s -0.672433934968296*s  color=col0Vel visible=visVel&vis0 label=labVel r=b*0.4107^a
vertex pVel: -0.622746364097895*s 0.231496177137603*s -0.747393126790398*s  color=col0Vel visible=visVel&vis0 label=labVel r=b*0.4064^a
vertex betaLib: -0.639105623293641*s -0.751277230999072*s -0.164701318928577*s  color=col0Lib visible=visLib&vis0 label=labLib r=b*0.5528^a
vertex alpha2Lib: -0.701448958290809*s -0.656191895787553*s -0.278175402966323*s  color=col0Lib visible=visLib&vis0 label=labLib r=b*0.5261^a
vertex sigmaLib: -0.622913095806461*s -0.654364320959097*s -0.428703406247898*s  color=col0Lib visible=visLib&vis0 label=labLib r=b*0.4668^a
vertex gammaLib: -0.564574063665745*s -0.784435836864017*s -0.256742175108408*s  color=col0Lib visible=visLib&vis0 label=labLib r=b*0.3920^a
vertex thetaLib: -0.495356694921903*s -0.819162265728281*s -0.289127873445225*s  color=col0Lib visible=visLib&vis0 label=labLib r=b*0.3721^a
vertex alphaSco: -0.33871033986931*s -0.828453991646402*s -0.446026108418285*s  color=col0Sco visible=visSco&vis0 label=labSco r=b*0.7987^a
vertex lambdaSco: -0.0853303719949077*s -0.792788398326055*s -0.603494227888568*s  color=col0Sco visible=visSco&vis0 label=labSco r=b*0.7040^a
vertex thetaSco: -0.0661358588356493*s -0.728214618726617*s -0.682150655829721*s  color=col0Sco visible=visSco&vis0 label=labSco r=b*0.6417^a
vertex deltaSco: -0.454574748730689*s -0.802801883402435*s -0.385837963168392*s  color=col0Sco visible=visSco&vis0 label=labSco r=b*0.5940^a
vertex kappaSco: -0.0530300650374706*s -0.774883720750843*s -0.629875409519574*s  color=col0Sco visible=visSco&vis0 label=labSco r=b*0.5867^a
vertex epsilonSco: -0.241758122432442*s -0.78952719268481*s -0.564092033492039*s  color=col0Sco visible=visSco&vis0 label=labSco r=b*0.5685^a
vertex beta1Sco: -0.445134743814384*s -0.82840735570268*s -0.339994577702344*s  color=col0Sco visible=visSco&vis0 label=labSco r=b*0.5503^a
vertex tauSco: -0.310051418771719*s -0.824353415299981*s -0.473613306824144*s  color=col0Sco visible=visSco&vis0 label=labSco r=b*0.5325^a
vertex piSco: -0.447059363183758*s -0.778051098298973*s -0.441332543809647*s  color=col0Sco visible=visSco&vis0 label=labSco r=b*0.5216^a
vertex mu1Sco: -0.224559644556241*s -0.754320418484586*s -0.616906534488016*s  color=col0Sco visible=visSco&vis0 label=labSco r=b*0.5100^a
vertex iota1Sco: -0.0351587154994052*s -0.763724667625043*s -0.644583971865148*s  color=col0Sco visible=visSco&vis0 label=labSco r=b*0.4888^a
vertex etaSco: -0.144933092184284*s -0.713542431391823*s -0.685457217770261*s  color=col0Sco visible=visSco&vis0 label=labSco r=b*0.4555^a
vertex zeta1Sco: -0.203881044766791*s -0.709706701877317*s -0.674350737298643*s  color=col0Sco visible=visSco&vis0 label=labSco r=b*0.3282^a
vertex alphaScl: 0.843173519865134*s 0.225501735969251*s -0.488064936738028*s  color=col0Scl visible=visScl&vis0 label=labScl r=b*0.3747^a
vertex betaScl: 0.786609135795666*s -0.0882389964440916*s -0.611113693995917*s  color=col0Scl visible=visScl&vis0 label=labScl r=b*0.3671^a
vertex gammaScl: 0.831796392743778*s -0.145688144769059*s -0.535620878506605*s  color=col0Scl visible=visScl&vis0 label=labScl r=b*0.3485^a
vertex alphaSer: -0.550049833019731*s -0.827791328264833*s 0.110483926634194*s  color=col0Ser visible=visSer&vis0 label=labSer r=b*0.5252^a
vertex deltaOph: -0.438406032541462*s -0.896379957850792*s -0.0655981843854471*s  color=col0Ser visible=visSer&vis0 label=labSer r=b*0.5214^a
vertex etaSer: 0.0987355836442298*s -0.993835832062156*s -0.0504145160817405*s  color=col0Ser visible=visSer&vis0 label=labSer r=b*0.4572^a
vertex nuOph: 0.00214802986267838*s -0.985480778158772*s -0.169773442703183*s  color=col0Ser visible=visSer&vis0 label=labSer r=b*0.4480^a
vertex muSer: -0.532545923608899*s -0.844183723070198*s -0.0612264726313978*s  color=col0Ser visible=visSer&vis0 label=labSer r=b*0.4425^a
vertex xiSer: -0.0877104205704163*s -0.960036615357897*s -0.265775430195333*s  color=col0Ser visible=visSer&vis0 label=labSer r=b*0.4357^a
vertex betaSer: -0.527268955353374*s -0.807467852265766*s 0.264543221946571*s  color=col0Ser visible=visSer&vis0 label=labSer r=b*0.4282^a
vertex epsilonSer: -0.527799185310288*s -0.845898831486256*s 0.0767019352818601*s  color=col0Ser visible=visSer&vis0 label=labSer r=b*0.4212^a
vertex deltaSer: -0.577749598662748*s -0.795802002037229*s 0.181396181874295*s  color=col0Ser visible=visSer&vis0 label=labSer r=b*0.4104^a
vertex gammaSer: -0.490020276576193*s -0.829324399266992*s 0.268516609029377*s  color=col0Ser visible=visSer&vis0 label=labSer r=b*0.4031^a
vertex kappaSer: -0.511019591243351*s -0.801713979674913*s 0.310022051085549*s  color=col0Ser visible=visSer&vis0 label=labSer r=b*0.3808^a
vertex omicronSer: -0.0725861221682466*s -0.972104502027032*s -0.223033836014523*s  color=col0Ser visible=visSer&vis0 label=labSer r=b*0.3736^a
vertex nuSer: -0.159499760517743*s -0.961734908897595*s -0.222768470395874*s  color=col0Ser visible=visSer&vis0 label=labSer r=b*0.3673^a
vertex theta1Ser: 0.247793576983192*s -0.965987143275631*s 0.0739403964829768*s  color=col0Ser visible=visSer&vis0 label=labSer r=b*0.3399^a
vertex dSer: 0.124366693507619*s -0.992229287368867*s 0.00373722269238057*s  color=col0Ser visible=visSer&vis0 label=labSer r=b*0.2948^a
vertex HD165402: 0.0327241664514492*s -0.988935019664042*s -0.144695044186522*s  color=col0Ser visible=visSer&vis0 label=labSer r=b*0.2572^a
vertex alphaOph: -0.101285575664306*s -0.97086599264896*s 0.217164583853124*s  color=col0Oph visible=visOph&vis0 label=labOph r=b*0.6129^a
vertex etaOph: -0.200452921927211*s -0.941321987861005*s -0.271535524858627*s  color=col0Oph visible=visOph&vis0 label=labOph r=b*0.5703^a
vertex zetaOph: -0.341659781092861*s -0.921580063123053*s -0.184279085187899*s  color=col0Oph visible=visOph&vis0 label=labOph r=b*0.5532^a
vertex betaOph: -0.0660877609367001*s -0.994643990348579*s 0.0794716321578329*s  color=col0Oph visible=visOph&vis0 label=labOph r=b*0.5096^a
vertex kappaOph: -0.259814994245086*s -0.951936537504343*s 0.162212814936642*s  color=col0Oph visible=visOph&vis0 label=labOph r=b*0.4612^a
vertex epsilonOph: -0.422190816683931*s -0.902707762769405*s -0.0829072333612173*s  color=col0Oph visible=visOph&vis0 label=labOph r=b*0.4582^a
vertex cOph: -0.107195226810106*s -0.907371572015842*s -0.40643082270742*s  color=col0Oph visible=visOph&vis0 label=labOph r=b*0.3308^a
vertex alphaSex: -0.885573987220738*s 0.464415272629127*s -0.00878451517035782*s  color=col0Sex visible=visSex&vis0 label=labSex r=b*0.3565^a
vertex betaSex: -0.926539198840963*s 0.375955005401301*s -0.0135257874023885*s  color=col0Sex visible=visSex&vis0 label=labSex r=b*0.3140^a
vertex alphaSct: 0.157650989375412*s -0.977081855488392*s -0.14302871468455*s  color=col0Sct visible=visSct&vis0 label=labSct r=b*0.3975^a
vertex betaSct: 0.209730055427322*s -0.97429489763955*s -0.0822359792547677*s  color=col0Sct visible=visSct&vis0 label=labSct r=b*0.3648^a
vertex gammaSct: 0.1293634032878*s -0.959260927560944*s -0.251164453585127*s  color=col0Sct visible=visSct&vis0 label=labSct r=b*0.3381^a
vertex HD175156: 0.234068567245525*s -0.934445635981444*s -0.268371494803121*s  color=col0Sct visible=visSct&vis0 label=labSct r=b*0.3068^a
vertex RSct: 0.210755655280687*s -0.972525618365677*s -0.0988735323009491*s  color=col0Sct visible=visSct&vis0 label=labSct r=b*0.2807^a
vertex alphaCru: -0.446763786369548*s -0.0550671707790593*s -0.892955612497696*s  color=col0Cru visible=visCru&vis0 label=labCru r=b*0.8562^a
vertex betaCru: -0.490916891355034*s -0.107270612858129*s -0.86457713444166*s  color=col0Cru visible=visCru&vis0 label=labCru r=b*0.7667^a
vertex gammaCru: -0.535305038055455*s -0.0768203953664892*s -0.84115821525334*s  color=col0Cru visible=visCru&vis0 label=labCru r=b*0.6871^a
vertex deltaCru: -0.515218670128213*s -0.0373427172051789*s -0.856244850158557*s  color=col0Cru visible=visCru&vis0 label=labCru r=b*0.5362^a
vertex alphaCrA: 0.241638057264293*s -0.751623926222086*s -0.613736525564541*s  color=col0CrA visible=visCrA&vis0 label=labCrA r=b*0.3867^a
vertex betaCrA: 0.238709931967918*s -0.736151988278346*s -0.633322839106336*s  color=col0CrA visible=visCrA&vis0 label=labCrA r=b*0.3739^a
vertex gammaCrA: 0.234172501776166*s -0.76328615997694*s -0.602127459429935*s  color=col0CrA visible=visCrA&vis0 label=labCrA r=b*0.3705^a
vertex deltaCrA: 0.229475913931335*s -0.72551750167467*s -0.648818279404275*s  color=col0CrA visible=visCrA&vis0 label=labCrA r=b*0.3362^a
vertex zetaCrA: 0.20778923976919*s -0.712842242339504*s -0.669835479332448*s  color=col0CrA visible=visCrA&vis0 label=labCrA r=b*0.3361^a
vertex epsilonCrA: 0.208272883730123*s -0.770239162359246*s -0.602788552206215*s  color=col0CrA visible=visCrA&vis0 label=labCrA r=b*0.3221^a
vertex lambdaCrA: 0.155176807481885*s -0.769336958115321*s -0.619710257537822*s  color=col0CrA visible=visCrA&vis0 label=labCrA r=b*0.3058^a
vertex HD170642: 0.114472225587614*s -0.761030984300323*s -0.638535786392509*s  color=col0CrA visible=visCrA&vis0 label=labCrA r=b*0.3025^a
vertex V686CrA: 0.20078568452603*s -0.769646389234031*s -0.60607717695722*s  color=col0CrA visible=visCrA&vis0 label=labCrA r=b*0.2944^a
vertex HD175219: 0.184657549640582*s -0.711654206847513*s -0.677827322580739*s  color=col0CrA visible=visCrA&vis0 label=labCrA r=b*0.2813^a
vertex alphaPsA: 0.839996750270895*s -0.228527591064617*s -0.492118481319833*s  color=col0PsA visible=visPsA&vis0 label=labPsA r=b*0.7619^a
vertex epsilonPsA: 0.840787566270596*s -0.297205691195506*s -0.452487619196117*s  color=col0PsA visible=visPsA&vis0 label=labPsA r=b*0.3838^a
vertex betaPsA: 0.785907996386805*s -0.313470847289978*s -0.532995918478351*s  color=col0PsA visible=visPsA&vis0 label=labPsA r=b*0.3715^a
vertex deltaPsA: 0.813084130577389*s -0.227694977325881*s -0.535769720965806*s  color=col0PsA visible=visPsA&vis0 label=labPsA r=b*0.3658^a
vertex tauPsA: 0.751676140163131*s -0.384214154978695*s -0.536061995876843*s  color=col0PsA visible=visPsA&vis0 label=labPsA r=b*0.3131^a
vertex thetaPsA: 0.723224078960329*s -0.463863737493183*s -0.511641832389454*s  color=col0PsA visible=visPsA&vis0 label=labPsA r=b*0.3130^a
vertex etaPsA: 0.766847186590373*s -0.432240424550437*s -0.474461387051558*s  color=col0PsA visible=visPsA&vis0 label=labPsA r=b*0.2883^a
vertex alphaTrA: -0.105144322388054*s -0.341357550070489*s -0.934034097064679*s  color=col0TrA visible=visTrA&vis0 label=labTrA r=b*0.6207^a
vertex gammaTrA: -0.230948838841704*s -0.278791432853447*s -0.932168424055005*s  color=col0TrA visible=visTrA&vis0 label=labTrA r=b*0.5150^a
vertex betaTrA: -0.227178658960256*s -0.383849069022622*s -0.895013826219174*s  color=col0TrA visible=visTrA&vis0 label=labTrA r=b*0.5119^a
vertex zetaPup: -0.395581636705218*s 0.654956711790435*s -0.643853146596553*s  color=col0Pup visible=visPup&vis0 label=labPup r=b*0.6115^a
vertex piPup: -0.266361861359417*s 0.75126810959413*s -0.603860568608358*s  color=col0Pup visible=visPup&vis0 label=labPup r=b*0.5212^a
vertex rhoPup: -0.484956068879522*s 0.770964474262816*s -0.412833369147384*s  color=col0Pup visible=visPup&vis0 label=labPup r=b*0.5110^a
vertex tauPup: -0.138862420188846*s 0.618698002933893*s -0.773259341634428*s  color=col0Pup visible=visPup&vis0 label=labPup r=b*0.4889^a
vertex nuPup: -0.122092936157246*s 0.718421065959011*s -0.684809818071281*s  color=col0Pup visible=visPup&vis0 label=labPup r=b*0.4854^a
vertex sigmaPup: -0.278479078851407*s 0.671649281966568*s -0.686539616246481*s  color=col0Pup visible=visPup&vis0 label=labPup r=b*0.4596^a
vertex f188Pup: -0.419083928300551*s 0.803754818174185*s -0.422311322725264*s  color=col0Pup visible=visPup&vis0 label=labPup r=b*0.2848^a
vertex alphaCyg: 0.456999811026759*s -0.533452451421804*s 0.71174409361341*s  color=col0Cyg visible=visCyg&vis0 label=labCyg r=b*0.7418^a
vertex gammaCyg: 0.445811305861965*s -0.618195711573587*s 0.647368783428485*s  color=col0Cyg visible=visCyg&vis0 label=labCyg r=b*0.5814^a
vertex epsilonCyg: 0.552368187786048*s -0.617277185168752*s 0.560230543430203*s  color=col0Cyg visible=visCyg&vis0 label=labCyg r=b*0.5441^a
vertex deltaCyg: 0.313899759589838*s -0.630891559513887*s 0.709537018811265*s  color=col0Cyg visible=visCyg&vis0 label=labCyg r=b*0.5167^a
vertex beta1Cyg: 0.344230424800918*s -0.812927075391526*s 0.469739273147093*s  color=col0Cyg visible=visCyg&vis0 label=labCyg r=b*0.4767^a
vertex zetaCyg: 0.646586743136965*s -0.571667592534749*s 0.505095780268512*s  color=col0Cyg visible=visCyg&vis0 label=labCyg r=b*0.4598^a
vertex iotaCyg: 0.237665129507247*s -0.571097347618404*s 0.785724573727669*s  color=col0Cyg visible=visCyg&vis0 label=labCyg r=b*0.4155^a
vertex kappaCyg: 0.198250117055983*s -0.56202158752336*s 0.803012220482983*s  color=col0Cyg visible=visCyg&vis0 label=labCyg r=b*0.4026^a
vertex etaCyg: 0.400455944130518*s -0.712801745980632*s 0.575802663885378*s  color=col0Cyg visible=visCyg&vis0 label=labCyg r=b*0.3925^a
vertex muCyg: 0.728892400750536*s -0.485466399630535*s 0.482740347348225*s  color=col0Cyg visible=visCyg&vis0 label=labCyg r=b*0.3465^a
vertex alphaDor: 0.208919975365207*s 0.534320124657641*s -0.819057048244653*s  color=col0Dor visible=visDor&vis0 label=labDor r=b*0.4746^a
vertex betaDor: 0.0525989230848214*s 0.45916808172214*s -0.886790858104619*s  color=col0Dor visible=visDor&vis0 label=labDor r=b*0.4071^a
vertex gammaDor: 0.271584054464861*s 0.561358393277838*s -0.781740913383041*s  color=col0Dor visible=visDor&vis0 label=labDor r=b*0.3686^a
vertex deltaDor: 0.0272033859442268*s 0.410205627635972*s -0.911587252460755*s  color=col0Dor visible=visDor&vis0 label=labDor r=b*0.3637^a
vertex f36Dor: 0.0112452224836929*s 0.452581130817502*s -0.891652322937166*s  color=col0Dor visible=visDor&vis0 label=labDor r=b*0.3311^a
vertex gammaMen: 0.0300062945893475*s 0.234582717824587*s -0.971632940355074*s  color=col0Men visible=visMen&vis0 label=labMen r=b*0.2925^a
vertex muMen: 0.108232068053307*s 0.309120524912255*s -0.944844072068443*s  color=col0Men visible=visMen&vis0 label=labMen r=b*0.2824^a
vertex alphaTel: 0.0876072955087543*s -0.68973527242489*s -0.71874210656299*s  color=col0Tel visible=visTel&vis0 label=labTel r=b*0.4547^a
vertex zetaTel: 0.0880610112336089*s -0.649418177515954*s -0.755315357325913*s  color=col0Tel visible=visTel&vis0 label=labTel r=b*0.3745^a
vertex alphaTuc: 0.451723125738793*s -0.209899050820664*s -0.867115105471793*s  color=col0Tuc visible=visTuc&vis0 label=labTuc r=b*0.5000^a
vertex gammaTuc: 0.520158013587655*s -0.0941252197355912*s -0.848867530248549*s  color=col0Tuc visible=visTuc&vis0 label=labTuc r=b*0.3903^a
vertex beta1Tuc: 0.452264477190582*s 0.0650875866436621*s -0.889505732829437*s  color=col0Tuc visible=visTuc&vis0 label=labTuc r=b*0.3687^a
vertex zetaTuc: 0.425207407814876*s 0.0399062794606955*s -0.904215764737023*s  color=col0Tuc visible=visTuc&vis0 label=labTuc r=b*0.3678^a
vertex betaTri: 0.687710756653149*s 0.442965452136023*s 0.575183034691986*s  color=col0Tri visible=visTri&vis0 label=labTri r=b*0.4941^a
vertex alphaTri: 0.762193862218999*s 0.41648697603919*s 0.495579575028489*s  color=col0Tri visible=visTri&vis0 label=labTri r=b*0.4445^a
vertex gammaTri: 0.681599022338502*s 0.472461863102389*s 0.55875089320825*s  color=col0Tri visible=visTri&vis0 label=labTri r=b*0.3962^a
vertex betaGem: -0.397386455745073*s 0.788839898561621*s 0.468844984219369*s  color=col0Gem visible=visGem&vis0 label=labGem r=b*0.7422^a
vertex alphaGem: -0.346598415799783*s 0.775735414776202*s 0.527355766468023*s  color=col0Gem visible=visGem&vis0 label=labGem r=b*0.6949^a
vertex gammaGem: -0.163535651593068*s 0.945402144491831*s 0.281905792505719*s  color=col0Gem visible=visGem&vis0 label=labGem r=b*0.6414^a
vertex muGem: -0.0988920873423544*s 0.918589424042601*s 0.382640595204109*s  color=col0Gem visible=visGem&vis0 label=labGem r=b*0.5112^a
vertex epsilonGem: -0.178898168675777*s 0.887705832648808*s 0.424233190504632*s  color=col0Gem visible=visGem&vis0 label=labGem r=b*0.4796^a
vertex etaGem: -0.0664283701257311*s 0.921511616173347*s 0.38262725059779*s  color=col0Gem visible=visGem&vis0 label=labGem r=b*0.4683^a
vertex xiGem: -0.197655623606409*s 0.954652424009657*s 0.222645466581398*s  color=col0Gem visible=visGem&vis0 label=labGem r=b*0.4527^a
vertex deltaGem: -0.323797425381774*s 0.86928915676091*s 0.373485728313734*s  color=col0Gem visible=visGem&vis0 label=labGem r=b*0.4362^a
vertex lambdaGem: -0.32649199506785*s 0.90157330218013*s 0.283846010985942*s  color=col0Gem visible=visGem&vis0 label=labGem r=b*0.4350^a
vertex thetaGem: -0.195636655154907*s 0.806362722216687*s 0.558126741322339*s  color=col0Gem visible=visGem&vis0 label=labGem r=b*0.4324^a
vertex kappaGem: -0.406775679409767*s 0.815337817976761*s 0.412016734147555*s  color=col0Gem visible=visGem&vis0 label=labGem r=b*0.4238^a
vertex iotaGem: -0.329340446013774*s 0.821489598191183*s 0.465499420711925*s  color=col0Gem visible=visGem&vis0 label=labGem r=b*0.4026^a
vertex nuGem: -0.124739931242438*s 0.930210226804964*s 0.345179494612715*s  color=col0Gem visible=visGem&vis0 label=labGem r=b*0.3891^a
vertex upsilonGem: -0.368504611406415*s 0.812672603596033*s 0.451406236927063*s  color=col0Gem visible=visGem&vis0 label=labGem r=b*0.3830^a
vertex zetaGem: -0.264779030766791*s 0.898286251567355*s 0.35067631102096*s  color=col0Gem visible=visGem&vis0 label=labGem r=b*0.3829^a
vertex f1Gem: -0.0230350047090401*s 0.918438626952187*s 0.394892234768216*s  color=col0Gem visible=visGem&vis0 label=labGem r=b*0.3698^a
vertex tauGem: -0.270086503469318*s 0.821000961459236*s 0.503001691773227*s  color=col0Gem visible=visGem&vis0 label=labGem r=b*0.3499^a
vertex betaMon: -0.130033978842443*s 0.983879015748786*s -0.122773151444454*s  color=col0Mon visible=visMon&vis0 label=labMon r=b*0.4176^a
vertex alphaMon: -0.426500025946688*s 0.888930791125137*s -0.167032261725432*s  color=col0Mon visible=visMon&vis0 label=labMon r=b*0.3891^a
vertex gammaMon: -0.0700326199845605*s 0.991519483135859*s -0.109473954437102*s  color=col0Mon visible=visMon&vis0 label=labMon r=b*0.3849^a
vertex deltaMon: -0.314102726461958*s 0.949342379035767*s -0.00940875102627922*s  color=col0Mon visible=visMon&vis0 label=labMon r=b*0.3842^a
vertex epsilonMonA: -0.109322146618156*s 0.990797977667142*s 0.0797999731171628*s  color=col0Mon visible=visMon&vis0 label=labMon r=b*0.3584^a
vertex f13Mon: -0.148106556218182*s 0.980749638702572*s 0.127257982814299*s  color=col0Mon visible=visMon&vis0 label=labMon r=b*0.3547^a
vertex zetaMon: -0.536302730085492*s 0.842332123766387*s -0.0534413227199287*s  color=col0Mon visible=visMon&vis0 label=labMon r=b*0.3530^a
vertex f15Mon: -0.181442004433322*s 0.968350884892888*s 0.17139242327005*s  color=col0Mon visible=visMon&vis0 label=labMon r=b*0.3503^a
vertex f28Mon: -0.50955790837189*s 0.86005453509844*s -0.0256307368655559*s  color=col0Mon visible=visMon&vis0 label=labMon r=b*0.3301^a
vertex f17Mon: -0.209191468991365*s 0.967905000655339*s 0.139279714989737*s  color=col0Mon visible=visMon&vis0 label=labMon r=b*0.3224^a
vertex HD45194: -0.119389426212332*s 0.966700071901577*s 0.226356214613552*s  color=col0Mon visible=visMon&vis0 label=labMon r=b*0.2122^a
vertex betaAqr: 0.797536890680975*s -0.595740652496395*s -0.0950156985244619*s  color=col0Aqr visible=visAqr&vis0 label=labAqr r=b*0.4966^a
vertex alphaAqr: 0.881208815407694*s -0.472715719044747*s -0.00329736497463046*s  color=col0Aqr visible=visAqr&vis0 label=labAqr r=b*0.4889^a
vertex deltaAqr: 0.925575171984998*s -0.265114439237516*s -0.270231262278664*s  color=col0Aqr visible=visAqr&vis0 label=labAqr r=b*0.4682^a
vertex zetaAqr: 0.924224044999034*s -0.381845102882972*s 0.00205719467155581*s  color=col0Aqr visible=visAqr&vis0 label=labAqr r=b*0.4222^a
vertex epsilonAqr: 0.663731483432156*s -0.729935929821168*s -0.163260700283491*s  color=col0Aqr visible=visAqr&vis0 label=labAqr r=b*0.4186^a
vertex lambdaAqr: 0.950764734135623*s -0.281591891765266*s -0.12943116632433*s  color=col0Aqr visible=visAqr&vis0 label=labAqr r=b*0.4162^a
vertex gammaAqr: 0.91160982373587*s -0.410475755879823*s -0.0218445211241649*s  color=col0Aqr visible=visAqr&vis0 label=labAqr r=b*0.4129^a
vertex c02Aqr: 0.912046247918087*s -0.198572070258798*s -0.358804646808921*s  color=col0Aqr visible=visAqr&vis0 label=labAqr r=b*0.4123^a
vertex etaAqr: 0.934716957625949*s -0.355392843929074*s 0.000368253303744317*s  color=col0Aqr visible=visAqr&vis0 label=labAqr r=b*0.3966^a
vertex b01Aqr: 0.928629843169917*s -0.145537628651611*s -0.341270293199805*s  color=col0Aqr visible=visAqr&vis0 label=labAqr r=b*0.3874^a
vertex tauAqr: 0.928829624622142*s -0.28838767984189*s -0.232611423923466*s  color=col0Aqr visible=visAqr&vis0 label=labAqr r=b*0.3847^a
vertex iotaAqr: 0.857442078646456*s -0.456495109669188*s -0.237497992864277*s  color=col0Aqr visible=visAqr&vis0 label=labAqr r=b*0.3745^a
vertex thetaAqr: 0.895005788825222*s -0.42573118119603*s -0.133107472843469*s  color=col0Aqr visible=visAqr&vis0 label=labAqr r=b*0.3687^a
vertex psi1Aqr: 0.970744150597089*s -0.183024123301792*s -0.155428325510977*s  color=col0Aqr visible=visAqr&vis0 label=labAqr r=b*0.3623^a
vertex sigmaAqr: 0.911635042180402*s -0.368048211610712*s -0.182926389017259*s  color=col0Aqr visible=visAqr&vis0 label=labAqr r=b*0.3292^a
vertex alphaHya: -0.781172805250154*s 0.605385891433741*s -0.152567921892447*s  color=col0Hya visible=visHya&vis0 label=labHya r=b*0.6116^a
vertex gammaHya: -0.862456379960523*s -0.315536029619525*s -0.395734768092641*s  color=col0Hya visible=visHya&vis0 label=labHya r=b*0.4839^a
vertex nuHya: -0.916406308767635*s 0.284786835645289*s -0.281239996255906*s  color=col0Hya visible=visHya&vis0 label=labHya r=b*0.4709^a
vertex zetaHya: -0.693561721879154*s 0.713169769005519*s 0.101789088416377*s  color=col0Hya visible=visHya&vis0 label=labHya r=b*0.4699^a
vertex piHya: -0.757091596916772*s -0.472632771407817*s -0.45103278957231*s  color=col0Hya visible=visHya&vis0 label=labHya r=b*0.4551^a
vertex epsilonHya: -0.665672737477729*s 0.738082223149944*s 0.110065609746836*s  color=col0Hya visible=visHya&vis0 label=labHya r=b*0.4467^a
vertex xiHya: -0.842677471052782*s 0.0948090891555007*s -0.530005581474*s  color=col0Hya visible=visHya&vis0 label=labHya r=b*0.4263^a
vertex lambdaHya: -0.869721146159835*s 0.443658605090092*s -0.216222501261866*s  color=col0Hya visible=visHya&vis0 label=labHya r=b*0.4193^a
vertex thetaHya: -0.753448941292189*s 0.656384889364697*s 0.0383871056394374*s  color=col0Hya visible=visHya&vis0 label=labHya r=b*0.4101^a
vertex muHya: -0.879401835406682*s 0.376069873797056*s -0.29193126229581*s  color=col0Hya visible=visHya&vis0 label=labHya r=b*0.4021^a
vertex deltaHya: -0.636611810067001*s 0.764966028145285*s 0.0977362730353717*s  color=col0Hya visible=visHya&vis0 label=labHya r=b*0.3845^a
vertex etaHya: -0.657009750444706*s 0.751679816638476*s 0.0575816036502303*s  color=col0Hya visible=visHya&vis0 label=labHya r=b*0.3778^a
vertex betaHya: -0.828222002544118*s 0.0207252935452611*s -0.560016764668053*s  color=col0Hya visible=visHya&vis0 label=labHya r=b*0.3757^a
vertex upsilon1Hya: -0.82096007441108*s 0.509187622772278*s -0.258365092530842*s  color=col0Hya visible=visHya&vis0 label=labHya r=b*0.3739^a
vertex rhoHya: -0.671718138467667*s 0.73403054211738*s 0.099969523818003*s  color=col0Hya visible=visHya&vis0 label=labHya r=b*0.3676^a
vertex EHya: -0.645677167074784*s -0.601400007009666*s -0.470551832944103*s  color=col0Hya visible=visHya&vis0 label=labHya r=b*0.3499^a
vertex tau2Hya: -0.80194509829924*s 0.596964220976361*s -0.0227547398998113*s  color=col0Hya visible=visHya&vis0 label=labHya r=b*0.3473^a
vertex sigmaHya: -0.642269247860905*s 0.764384899355312*s 0.0566210110273291*s  color=col0Hya visible=visHya&vis0 label=labHya r=b*0.3451^a
vertex tau1Hya: -0.793681511432662*s 0.60624485391316*s -0.0503670081876771*s  color=col0Hya visible=visHya&vis0 label=labHya r=b*0.3391^a
vertex f26Hya: -0.751959347546155*s 0.625056751723274*s -0.209430649053832*s  color=col0Hya visible=visHya&vis0 label=labHya r=b*0.3210^a
vertex kHya: -0.713679684699616*s -0.52159205205842*s -0.467550038901233*s  color=col0Hya visible=visHya&vis0 label=labHya r=b*0.3207^a
vertex chi1Hya: -0.863545715741686*s 0.204833300045423*s -0.460795091137787*s  color=col0Hya visible=visHya&vis0 label=labHya r=b*0.3156^a
vertex kappaHya: -0.797053406726583*s 0.549907161889817*s -0.249615664828622*s  color=col0Hya visible=visHya&vis0 label=labHya r=b*0.3151^a
vertex psiHya: -0.875592312323972*s -0.278179208879935*s -0.39491066122111*s  color=col0Hya visible=visHya&vis0 label=labHya r=b*0.3088^a
vertex f50Hya: -0.739775760588817*s -0.491071458635788*s -0.459978963169574*s  color=col0Hya visible=visHya&vis0 label=labHya r=b*0.2996^a
vertex betaCet: 0.933679887436124*s 0.18542624922422*s -0.306364119791964*s  color=col0Cet visible=visCet&vis0 label=labCet r=b*0.6017^a
vertex alphaCet: 0.693797439614982*s 0.716448846607963*s 0.0731174601433592*s  color=col0Cet visible=visCet&vis0 label=labCet r=b*0.5470^a
vertex gammaCet: 0.751448450008069*s 0.657203517841206*s 0.0583846137061289*s  color=col0Cet visible=visCet&vis0 label=labCet r=b*0.4467^a
vertex etaCet: 0.939191987619899*s 0.295835297240115*s -0.174355634544559*s  color=col0Cet visible=visCet&vis0 label=labCet r=b*0.4341^a
vertex tauCet: 0.862419528543877*s 0.426753815401471*s -0.272238384190115*s  color=col0Cet visible=visCet&vis0 label=labCet r=b*0.4336^a
vertex iotaCet: 0.984492827081541*s 0.0895530379740133*s -0.150844710926902*s  color=col0Cet visible=visCet&vis0 label=labCet r=b*0.4235^a
vertex thetaCet: 0.922266705496776*s 0.360323835824063*s -0.139967343581127*s  color=col0Cet visible=visCet&vis0 label=labCet r=b*0.4192^a
vertex zetaCet: 0.867401305188356*s 0.465007824489097*s -0.177151626922965*s  color=col0Cet visible=visCet&vis0 label=labCet r=b*0.4067^a
vertex deltaCet: 0.763614793787344*s 0.645625906419054*s 0.00772241346258361*s  color=col0Cet visible=visCet&vis0 label=labCet r=b*0.3974^a
vertex piCet: 0.729194528267963*s 0.641721996640439*s -0.237630425181353*s  color=col0Cet visible=visCet&vis0 label=labCet r=b*0.3796^a
vertex xi2Cet: 0.78556641654824*s 0.600529215021307*s 0.149164563812754*s  color=col0Cet visible=visCet&vis0 label=labCet r=b*0.3739^a
vertex muCet: 0.735942539905283*s 0.653355931380846*s 0.177523533333549*s  color=col0Cet visible=visCet&vis0 label=labCet r=b*0.3678^a
vertex xi1Cet: 0.82268214208728*s 0.546698629177192*s 0.155931722065984*s  color=col0Cet visible=visCet&vis0 label=labCet r=b*0.3534^a
vertex lambdaCet: 0.694856885494967*s 0.701880174291182*s 0.156646511666282*s  color=col0Cet visible=visCet&vis0 label=labCet r=b*0.3406^a
vertex sigmaCet: 0.757171534409674*s 0.598812342466577*s -0.260988593600162*s  color=col0Cet visible=visCet&vis0 label=labCet r=b*0.3279^a
vertex rhoCet: 0.782621962979243*s 0.585707138568888*s -0.210831712254019*s  color=col0Cet visible=visCet&vis0 label=labCet r=b*0.3253^a
vertex epsilonCet: 0.747600824996191*s 0.632102958131268*s -0.20381083579318*s  color=col0Cet visible=visCet&vis0 label=labCet r=b*0.3217^a
vertex omicronCet: 0.816379786851122*s 0.575359793729395*s -0.0498512926671345*s  color=col0Cet visible=visCet&vis0 label=labCet r=b*0.3170^a
vertex nuCet: 0.769777905480786*s 0.630514120886367*s 0.099468183840385*s  color=col0Cet visible=visCet&vis0 label=labCet r=b*0.3148^a
vertex alphaLup: -0.510399418173091*s -0.442598105844271*s -0.737291903272804*s  color=col0Lup visible=visLup&vis0 label=labLup r=b*0.5984^a
vertex betaLup: -0.514457406528401*s -0.51578628184762*s -0.685053347065671*s  color=col0Lup visible=visLup&vis0 label=labLup r=b*0.5498^a
vertex gammaLup: -0.439410943718796*s -0.610003597930518*s -0.659403998359109*s  color=col0Lup visible=visLup&vis0 label=labLup r=b*0.5370^a
vertex deltaLup: -0.479018858008969*s -0.587008446567611*s -0.652657657068439*s  color=col0Lup visible=visLup&vis0 label=labLup r=b*0.4851^a
vertex etaLup: -0.385820753996816*s -0.681259633270757*s -0.622115469877676*s  color=col0Lup visible=visLup&vis0 label=labLup r=b*0.4634^a
vertex zetaLup: -0.405689667340818*s -0.459446839145551*s -0.790142073181816*s  color=col0Lup visible=visLup&vis0 label=labLup r=b*0.4394^a
vertex phi1Lup: -0.508151899041973*s -0.624790174769116*s -0.592805942119353*s  color=col0Lup visible=visLup&vis0 label=labLup r=b*0.4275^a
vertex chiLup: -0.438784788051088*s -0.706762567203354*s -0.554936557973148*s  color=col0Lup visible=visLup&vis0 label=labLup r=b*0.4023^a
vertex rhoLup: -0.497635787029686*s -0.416463331739948*s -0.760865899343246*s  color=col0Lup visible=visLup&vis0 label=labLup r=b*0.3985^a
vertex tau2Lup: -0.559944040458149*s -0.421616874894104*s -0.713233399638528*s  color=col0Lup visible=visLup&vis0 label=labLup r=b*0.3598^a
vertex omegaLup: -0.422203338816708*s -0.602215694805816*s -0.677554866871733*s  color=col0Lup visible=visLup&vis0 label=labLup r=b*0.3565^a
vertex HD144415: -0.372594339163912*s -0.708455468341662*s -0.599386609626712*s  color=col0Lup visible=visLup&vis0 label=labLup r=b*0.2634^a



segment: alphaAnt etaAnt color=col1Ant visible=visAnt&vis1 w=wid
segment: thetaAra alphaAra color=col1Ara visible=visAra&vis1 w=wid
segment: alphaAra zetaAra color=col1Ara visible=visAra&vis1 w=wid
segment: zetaAra etaAra color=col1Ara visible=visAra&vis1 w=wid
segment: etaAra deltaAra color=col1Ara visible=visAra&vis1 w=wid
segment: deltaAra gammaAra color=col1Ara visible=visAra&vis1 w=wid
segment: gammaAra betaAra color=col1Ara visible=visAra&vis1 w=wid
segment: betaAra thetaAra color=col1Ara visible=visAra&vis1 w=wid
segment: alphaAnd deltaAnd color=col1And visible=visAnd&vis1 w=wid
segment: deltaAnd betaAnd color=col1And visible=visAnd&vis1 w=wid
segment: gamma1And betaAnd color=col1And visible=visAnd&vis1 w=wid
segment: betaAnd muAnd color=col1And visible=visAnd&vis1 w=wid
segment: muAnd nuAnd color=col1And visible=visAnd&vis1 w=wid
segment: deltaSgr lambdaSgr color=col1Sgr visible=visSgr&vis1 w=wid
segment: etaSgr epsilonSgr color=col1Sgr visible=visSgr&vis1 w=wid
segment: epsilonSgr gamma2Sgr color=col1Sgr visible=visSgr&vis1 w=wid
segment: gamma2Sgr XSgr color=col1Sgr visible=visSgr&vis1 w=wid
segment: gamma2Sgr deltaSgr color=col1Sgr visible=visSgr&vis1 w=wid
segment: deltaSgr epsilonSgr color=col1Sgr visible=visSgr&vis1 w=wid
segment: epsilonSgr zetaSgr color=col1Sgr visible=visSgr&vis1 w=wid
segment: zetaSgr phiSgr color=col1Sgr visible=visSgr&vis1 w=wid
segment: phiSgr deltaSgr color=col1Sgr visible=visSgr&vis1 w=wid
segment: phiSgr lambdaSgr color=col1Sgr visible=visSgr&vis1 w=wid
segment: lambdaSgr muSgr color=col1Sgr visible=visSgr&vis1 w=wid
segment: zetaSgr tauSgr color=col1Sgr visible=visSgr&vis1 w=wid
segment: tauSgr sigmaSgr color=col1Sgr visible=visSgr&vis1 w=wid
segment: sigmaSgr phiSgr color=col1Sgr visible=visSgr&vis1 w=wid
segment: sigmaSgr xi2Sgr color=col1Sgr visible=visSgr&vis1 w=wid
segment: xi2Sgr omicronSgr color=col1Sgr visible=visSgr&vis1 w=wid
segment: omicronSgr dSgr color=col1Sgr visible=visSgr&vis1 w=wid
segment: dSgr rho1Sgr color=col1Sgr visible=visSgr&vis1 w=wid
segment: tauSgr h01Sgr color=col1Sgr visible=visSgr&vis1 w=wid
segment: h01Sgr cSgr color=col1Sgr visible=visSgr&vis1 w=wid
segment: cSgr theta1Sgr color=col1Sgr visible=visSgr&vis1 w=wid
segment: theta1Sgr iotaSgr color=col1Sgr visible=visSgr&vis1 w=wid
segment: iotaSgr alphaSgr color=col1Sgr visible=visSgr&vis1 w=wid
segment: iotaSgr beta2Sgr color=col1Sgr visible=visSgr&vis1 w=wid
segment: betaSge deltaSge color=col1Sge visible=visSge&vis1 w=wid
segment: deltaSge alphaSge color=col1Sge visible=visSge&vis1 w=wid
segment: deltaSge gammaSge color=col1Sge visible=visSge&vis1 w=wid
segment: gammaSge etaSge color=col1Sge visible=visSge&vis1 w=wid
segment: alphaCom betaCom color=col1Com visible=visCom&vis1 w=wid
segment: betaCom gammaCom color=col1Com visible=visCom&vis1 w=wid
segment: alphaAps gammaAps color=col1Aps visible=visAps&vis1 w=wid
segment: gammaAps betaAps color=col1Aps visible=visAps&vis1 w=wid
segment: zetaBoo alphaBoo color=col1Boo visible=visBoo&vis1 w=wid
segment: alphaBoo epsilonBoo color=col1Boo visible=visBoo&vis1 w=wid
segment: epsilonBoo deltaBoo color=col1Boo visible=visBoo&vis1 w=wid
segment: deltaBoo betaBoo color=col1Boo visible=visBoo&vis1 w=wid
segment: betaBoo gammaBoo color=col1Boo visible=visBoo&vis1 w=wid
segment: gammaBoo rhoBoo color=col1Boo visible=visBoo&vis1 w=wid
segment: rhoBoo alphaBoo color=col1Boo visible=visBoo&vis1 w=wid
segment: alphaBoo etaBoo color=col1Boo visible=visBoo&vis1 w=wid
segment: etaBoo upsilonBoo color=col1Boo visible=visBoo&vis1 w=wid
segment: betaTau tauTau color=col1Tau visible=visTau&vis1 w=wid
segment: tauTau epsilonTau color=col1Tau visible=visTau&vis1 w=wid
segment: alphaTau zetaTau color=col1Tau visible=visTau&vis1 w=wid
segment: gammaTau deltaTau color=col1Tau visible=visTau&vis1 w=wid
segment: gammaTau lambdaTau color=col1Tau visible=visTau&vis1 w=wid
segment: lambdaTau omicronTau color=col1Tau visible=visTau&vis1 w=wid
segment: alphaTau epsilonTau color=col1Tau visible=visTau&vis1 w=wid
segment: alphaTau theta2Tau color=col1Tau visible=visTau&vis1 w=wid
segment: theta2Tau gammaTau color=col1Tau visible=visTau&vis1 w=wid
segment: epsilonTau delta3Tau color=col1Tau visible=visTau&vis1 w=wid
segment: delta3Tau deltaTau color=col1Tau visible=visTau&vis1 w=wid
segment: deltaTau f27Tau color=col1Tau visible=visTau&vis1 w=wid
segment: alpha2Cap beta1Cap color=col1Cap visible=visCap&vis1 w=wid
segment: beta1Cap thetaCap color=col1Cap visible=visCap&vis1 w=wid
segment: thetaCap iotaCap color=col1Cap visible=visCap&vis1 w=wid
segment: iotaCap gammaCap color=col1Cap visible=visCap&vis1 w=wid
segment: gammaCap deltaCap color=col1Cap visible=visCap&vis1 w=wid
segment: iotaCap zetaCap color=col1Cap visible=visCap&vis1 w=wid
segment: zetaCap thetaCap color=col1Cap visible=visCap&vis1 w=wid
segment: beta1Cap psiCap color=col1Cap visible=visCap&vis1 w=wid
segment: thetaCap omegaCap color=col1Cap visible=visCap&vis1 w=wid
segment: kappaNor gamma2Nor color=col1Nor visible=visNor&vis1 w=wid
segment: gamma2Nor epsilonNor color=col1Nor visible=visNor&vis1 w=wid
segment: epsilonNor etaNor color=col1Nor visible=visNor&vis1 w=wid
segment: etaNor gamma2Nor color=col1Nor visible=visNor&vis1 w=wid
segment: etaNor kappaNor color=col1Nor visible=visNor&vis1 w=wid
segment: epsilonCas deltaCas color=col1Cas visible=visCas&vis1 w=wid
segment: deltaCas gammaCas color=col1Cas visible=visCas&vis1 w=wid
segment: gammaCas alphaCas color=col1Cas visible=visCas&vis1 w=wid
segment: alphaCas betaCas color=col1Cas visible=visCas&vis1 w=wid
segment: alphaCenA betaCen color=col1Cen visible=visCen&vis1 w=wid
segment: betaCen epsilonCen color=col1Cen visible=visCen&vis1 w=wid
segment: epsilonCen zetaCen color=col1Cen visible=visCen&vis1 w=wid
segment: zetaCen upsilon1Cen color=col1Cen visible=visCen&vis1 w=wid
segment: upsilon1Cen muCen color=col1Cen visible=visCen&vis1 w=wid
segment: muCen nuCen color=col1Cen visible=visCen&vis1 w=wid
segment: nuCen dCen color=col1Cen visible=visCen&vis1 w=wid
segment: dCen iotaCen color=col1Cen visible=visCen&vis1 w=wid
segment: nuCen thetaCen color=col1Cen visible=visCen&vis1 w=wid
segment: muCen etaCen color=col1Cen visible=visCen&vis1 w=wid
segment: etaCen kappaCen color=col1Cen visible=visCen&vis1 w=wid
segment: zetaCen gammaCen color=col1Cen visible=visCen&vis1 w=wid
segment: gammaCen sigmaCen color=col1Cen visible=visCen&vis1 w=wid
segment: sigmaCen deltaCen color=col1Cen visible=visCen&vis1 w=wid
segment: deltaCen ACen color=col1Cen visible=visCen&vis1 w=wid
segment: ACen lambdaCen color=col1Cen visible=visCen&vis1 w=wid
segment: zetaCep iotaCep color=col1Cep visible=visCep&vis1 w=wid
segment: iotaCep betaCep color=col1Cep visible=visCep&vis1 w=wid
segment: betaCep alphaCep color=col1Cep visible=visCep&vis1 w=wid
segment: alphaCep zetaCep color=col1Cep visible=visCep&vis1 w=wid
segment: iotaCep gammaCep color=col1Cep visible=visCep&vis1 w=wid
segment: gammaCep betaCep color=col1Cep visible=visCep&vis1 w=wid
segment: alphaCha gammaCha color=col1Cha visible=visCha&vis1 w=wid
segment: gammaCha betaCha color=col1Cha visible=visCha&vis1 w=wid
segment: thetaAur betaAur color=col1Aur visible=visAur&vis1 w=wid
segment: betaAur alphaAur color=col1Aur visible=visAur&vis1 w=wid
segment: alphaAur zetaAur color=col1Aur visible=visAur&vis1 w=wid
segment: zetaAur iotaAur color=col1Aur visible=visAur&vis1 w=wid
segment: betaTauAur iotaAur color=col1Aur visible=visAur&vis1 w=wid
segment: betaTauAur thetaAur color=col1Aur visible=visAur&vis1 w=wid
segment: alphaHor zetaHor color=col1Hor visible=visHor&vis1 w=wid
segment: zetaHor muHor color=col1Hor visible=visHor&vis1 w=wid
segment: iotaCnc gammaCnc color=col1Cnc visible=visCnc&vis1 w=wid
segment: gammaCnc chiCnc color=col1Cnc visible=visCnc&vis1 w=wid
segment: gammaCnc deltaCnc color=col1Cnc visible=visCnc&vis1 w=wid
segment: deltaCnc betaCnc color=col1Cnc visible=visCnc&vis1 w=wid
segment: deltaCnc alphaCnc color=col1Cnc visible=visCnc&vis1 w=wid
segment: thetaGru delta1Gru color=col1Gru visible=visGru&vis1 w=wid
segment: delta1Gru alphaGru color=col1Gru visible=visGru&vis1 w=wid
segment: alphaGru betaGru color=col1Gru visible=visGru&vis1 w=wid
segment: betaGru iotaGru color=col1Gru visible=visGru&vis1 w=wid
segment: iotaGru thetaGru color=col1Gru visible=visGru&vis1 w=wid
segment: betaGru zetaGru color=col1Gru visible=visGru&vis1 w=wid
segment: betaGru epsilonGru color=col1Gru visible=visGru&vis1 w=wid
segment: alphaGru lambdaGru color=col1Gru visible=visGru&vis1 w=wid
segment: lambdaGru gammaGru color=col1Gru visible=visGru&vis1 w=wid
segment: etaCrv deltaCrv color=col1Crv visible=visCrv&vis1 w=wid
segment: deltaCrv gammaCrv color=col1Crv visible=visCrv&vis1 w=wid
segment: gammaCrv epsilonCrv color=col1Crv visible=visCrv&vis1 w=wid
segment: epsilonCrv alphaCrv color=col1Crv visible=visCrv&vis1 w=wid
segment: epsilonCrv betaCrv color=col1Crv visible=visCrv&vis1 w=wid
segment: betaCrv deltaCrv color=col1Crv visible=visCrv&vis1 w=wid
segment: alphaCrt betaCrt color=col1Crt visible=visCrt&vis1 w=wid
segment: betaCrt gammaCrt color=col1Crt visible=visCrt&vis1 w=wid
segment: gammaCrt deltaCrt color=col1Crt visible=visCrt&vis1 w=wid
segment: deltaCrt alphaCrt color=col1Crt visible=visCrt&vis1 w=wid
segment: deltaCrt epsilonCrt color=col1Crt visible=visCrt&vis1 w=wid
segment: epsilonCrt thetaCrt color=col1Crt visible=visCrt&vis1 w=wid
segment: thetaCrt etaCrt color=col1Crt visible=visCrt&vis1 w=wid
segment: etaCrt zetaCrt color=col1Crt visible=visCrt&vis1 w=wid
segment: zetaCrt gammaCrt color=col1Crt visible=visCrt&vis1 w=wid
segment: epsilonDel betaDel color=col1Del visible=visDel&vis1 w=wid
segment: betaDel alphaDel color=col1Del visible=visDel&vis1 w=wid
segment: alphaDel gamma2Del color=col1Del visible=visDel&vis1 w=wid
segment: gamma2Del deltaDel color=col1Del visible=visDel&vis1 w=wid
segment: deltaDel betaDel color=col1Del visible=visDel&vis1 w=wid
segment: deltaCol kappaCol color=col1Col visible=visCol&vis1 w=wid
segment: kappaCol gammaCol color=col1Col visible=visCol&vis1 w=wid
segment: gammaCol betaCol color=col1Col visible=visCol&vis1 w=wid
segment: betaCol etaCol color=col1Col visible=visCol&vis1 w=wid
segment: betaCol alphaCol color=col1Col visible=visCol&vis1 w=wid
segment: alphaCol epsilonCol color=col1Col visible=visCol&vis1 w=wid
segment: xiDra gammaDra color=col1Dra visible=visDra&vis1 w=wid
segment: gammaDra betaDra color=col1Dra visible=visDra&vis1 w=wid
segment: betaDra nu2Dra color=col1Dra visible=visDra&vis1 w=wid
segment: nu2Dra xiDra color=col1Dra visible=visDra&vis1 w=wid
segment: xiDra deltaDra color=col1Dra visible=visDra&vis1 w=wid
segment: deltaDra epsilonDra color=col1Dra visible=visDra&vis1 w=wid
segment: epsilonDra tauDra color=col1Dra visible=visDra&vis1 w=wid
segment: tauDra chiDra color=col1Dra visible=visDra&vis1 w=wid
segment: chiDra zetaDra color=col1Dra visible=visDra&vis1 w=wid
segment: zetaDra etaDra color=col1Dra visible=visDra&vis1 w=wid
segment: etaDra thetaDra color=col1Dra visible=visDra&vis1 w=wid
segment: thetaDra iotaDra color=col1Dra visible=visDra&vis1 w=wid
segment: iotaDra alphaDra color=col1Dra visible=visDra&vis1 w=wid
segment: alphaDra kappaDra color=col1Dra visible=visDra&vis1 w=wid
segment: kappaDra lambdaDra color=col1Dra visible=visDra&vis1 w=wid
segment: alphaCir gammaCir color=col1Cir visible=visCir&vis1 w=wid
segment: alphaCir betaCir color=col1Cir visible=visCir&vis1 w=wid
segment: betaAql alphaAql color=col1Aql visible=visAql&vis1 w=wid
segment: alphaAql gammaAql color=col1Aql visible=visAql&vis1 w=wid
segment: alphaAql deltaAql color=col1Aql visible=visAql&vis1 w=wid
segment: deltaAql etaAql color=col1Aql visible=visAql&vis1 w=wid
segment: thetaAql etaAql color=col1Aql visible=visAql&vis1 w=wid
segment: deltaAql zetaAql color=col1Aql visible=visAql&vis1 w=wid
segment: zetaAql epsilonAql color=col1Aql visible=visAql&vis1 w=wid
segment: deltaAql lambdaAql color=col1Aql visible=visAql&vis1 w=wid
segment: deltaCae alphaCae color=col1Cae visible=visCae&vis1 w=wid
segment: alphaCae betaCae color=col1Cae visible=visCae&vis1 w=wid
segment: alphaEri chiEri color=col1Eri visible=visEri&vis1 w=wid
segment: chiEri phiEri color=col1Eri visible=visEri&vis1 w=wid
segment: phiEri kappaEri color=col1Eri visible=visEri&vis1 w=wid
segment: kappaEri sEri color=col1Eri visible=visEri&vis1 w=wid
segment: sEri iotaEri color=col1Eri visible=visEri&vis1 w=wid
segment: iotaEri thetaEri color=col1Eri visible=visEri&vis1 w=wid
segment: thetaEri eEri color=col1Eri visible=visEri&vis1 w=wid
segment: eEri fEri color=col1Eri visible=visEri&vis1 w=wid
segment: fEri gEri color=col1Eri visible=visEri&vis1 w=wid
segment: gEri upsilon4Eri color=col1Eri visible=visEri&vis1 w=wid
segment: upsilon4Eri f43Eri color=col1Eri visible=visEri&vis1 w=wid
segment: f43Eri upsilon2Eri color=col1Eri visible=visEri&vis1 w=wid
segment: upsilon2Eri tau6Eri color=col1Eri visible=visEri&vis1 w=wid
segment: tau6Eri tau5Eri color=col1Eri visible=visEri&vis1 w=wid
segment: tau5Eri tau4Eri color=col1Eri visible=visEri&vis1 w=wid
segment: tau4Eri tau3Eri color=col1Eri visible=visEri&vis1 w=wid
segment: tau3Eri tau1Eri color=col1Eri visible=visEri&vis1 w=wid
segment: tau1Eri etaEri color=col1Eri visible=visEri&vis1 w=wid
segment: etaEri zetaEri color=col1Eri visible=visEri&vis1 w=wid
segment: zetaEri epsilonEri color=col1Eri visible=visEri&vis1 w=wid
segment: epsilonEri deltaEri color=col1Eri visible=visEri&vis1 w=wid
segment: deltaEri nuEri color=col1Eri visible=visEri&vis1 w=wid
segment: nuEri muEri color=col1Eri visible=visEri&vis1 w=wid
segment: muEri omegaEri color=col1Eri visible=visEri&vis1 w=wid
segment: omegaEri betaEri color=col1Eri visible=visEri&vis1 w=wid
segment: betaEri lambdaEri color=col1Eri visible=visEri&vis1 w=wid
segment: lambdaEri lEri color=col1Eri visible=visEri&vis1 w=wid
segment: sigmaPsc phiPsc color=col1Psc visible=visPsc&vis1 w=wid
segment: sigmaPsc upsilonPsc color=col1Psc visible=visPsc&vis1 w=wid
segment: upsilonPsc phiPsc color=col1Psc visible=visPsc&vis1 w=wid
segment: phiPsc etaPsc color=col1Psc visible=visPsc&vis1 w=wid
segment: etaPsc omicronPsc color=col1Psc visible=visPsc&vis1 w=wid
segment: omicronPsc alphaPsc color=col1Psc visible=visPsc&vis1 w=wid
segment: alphaPsc xiPsc color=col1Psc visible=visPsc&vis1 w=wid
segment: xiPsc nuPsc color=col1Psc visible=visPsc&vis1 w=wid
segment: nuPsc muPsc color=col1Psc visible=visPsc&vis1 w=wid
segment: muPsc epsilonPsc color=col1Psc visible=visPsc&vis1 w=wid
segment: epsilonPsc f62Psc color=col1Psc visible=visPsc&vis1 w=wid
segment: f62Psc dPsc color=col1Psc visible=visPsc&vis1 w=wid
segment: dPsc omegaPsc color=col1Psc visible=visPsc&vis1 w=wid
segment: omegaPsc iotaPsc color=col1Psc visible=visPsc&vis1 w=wid
segment: iotaPsc f19Psc color=col1Psc visible=visPsc&vis1 w=wid
segment: f19Psc lambdaPsc color=col1Psc visible=visPsc&vis1 w=wid
segment: lambdaPsc kappaPsc color=col1Psc visible=visPsc&vis1 w=wid
segment: kappaPsc gammaPsc color=col1Psc visible=visPsc&vis1 w=wid
segment: gammaPsc f7Psc color=col1Psc visible=visPsc&vis1 w=wid
segment: f7Psc thetaPsc color=col1Psc visible=visPsc&vis1 w=wid
segment: thetaPsc iotaPsc color=col1Psc visible=visPsc&vis1 w=wid
segment: betaMus lambdaMus color=col1Mus visible=visMus&vis1 w=wid
segment: lambdaMus gammaMus color=col1Mus visible=visMus&vis1 w=wid
segment: gammaMus alphaMus color=col1Mus visible=visMus&vis1 w=wid
segment: alphaMus betaMus color=col1Mus visible=visMus&vis1 w=wid
segment: zetaVol gamma2Vol color=col1Vol visible=visVol&vis1 w=wid
segment: gamma2Vol epsilonVol color=col1Vol visible=visVol&vis1 w=wid
segment: epsilonVol zetaVol color=col1Vol visible=visVol&vis1 w=wid
segment: epsilonVol deltaVol color=col1Vol visible=visVol&vis1 w=wid
segment: epsilonVol betaVol color=col1Vol visible=visVol&vis1 w=wid
segment: betaVol alphaVol color=col1Vol visible=visVol&vis1 w=wid
segment: alphaVol epsilonVol color=col1Vol visible=visVol&vis1 w=wid
segment: alphaVul f15Vul color=col1Vul visible=visVul&vis1 w=wid
segment: betaFor alphaFor color=col1For visible=visFor&vis1 w=wid
segment: HD21291 HD24479 color=col1Cam visible=visCam&vis1 w=wid
segment: HD24479 alphaCam color=col1Cam visible=visCam&vis1 w=wid
segment: HD21291 gammaCam color=col1Cam visible=visCam&vis1 w=wid
segment: gammaCam alphaCam color=col1Cam visible=visCam&vis1 w=wid
segment: gammaCam HD33564 color=col1Cam visible=visCam&vis1 w=wid
segment: etaUMa zetaUMa color=col1UMa visible=visUMa&vis1 w=wid
segment: zetaUMa epsilonUMa color=col1UMa visible=visUMa&vis1 w=wid
segment: epsilonUMa deltaUMa color=col1UMa visible=visUMa&vis1 w=wid
segment: deltaUMa alphaUMa color=col1UMa visible=visUMa&vis1 w=wid
segment: alphaUMa betaUMa color=col1UMa visible=visUMa&vis1 w=wid
segment: betaUMa gammaUMa color=col1UMa visible=visUMa&vis1 w=wid
segment: gammaUMa deltaUMa color=col1UMa visible=visUMa&vis1 w=wid
segment: gammaUMa chiUMa color=col1UMa visible=visUMa&vis1 w=wid
segment: chiUMa psiUMa color=col1UMa visible=visUMa&vis1 w=wid
segment: psiUMa lambdaUMa color=col1UMa visible=visUMa&vis1 w=wid
segment: psiUMa muUMa color=col1UMa visible=visUMa&vis1 w=wid
segment: betaUMa phiUMa color=col1UMa visible=visUMa&vis1 w=wid
segment: phiUMa thetaUMa color=col1UMa visible=visUMa&vis1 w=wid
segment: thetaUMa kappaUMa color=col1UMa visible=visUMa&vis1 w=wid
segment: thetaUMa iotaUMa color=col1UMa visible=visUMa&vis1 w=wid
segment: phiUMa upsilonUMa color=col1UMa visible=visUMa&vis1 w=wid
segment: upsilonUMa omicronUMa color=col1UMa visible=visUMa&vis1 w=wid
segment: omicronUMa hUMa color=col1UMa visible=visUMa&vis1 w=wid
segment: hUMa alphaUMa color=col1UMa visible=visUMa&vis1 w=wid
segment: thetaCMa gammaCMa color=col1CMa visible=visCMa&vis1 w=wid
segment: gammaCMa iotaCMa color=col1CMa visible=visCMa&vis1 w=wid
segment: iotaCMa alphaCMa color=col1CMa visible=visCMa&vis1 w=wid
segment: alphaCMa omicron2CMa color=col1CMa visible=visCMa&vis1 w=wid
segment: omicron2CMa deltaCMa color=col1CMa visible=visCMa&vis1 w=wid
segment: deltaCMa omegaCMa color=col1CMa visible=visCMa&vis1 w=wid
segment: omegaCMa etaCMa color=col1CMa visible=visCMa&vis1 w=wid
segment: epsilonCMa sigmaCMa color=col1CMa visible=visCMa&vis1 w=wid
segment: sigmaCMa deltaCMa color=col1CMa visible=visCMa&vis1 w=wid
segment: sigmaCMa HD50896 color=col1CMa visible=visCMa&vis1 w=wid
segment: HD50896 nu2CMa color=col1CMa visible=visCMa&vis1 w=wid
segment: nu2CMa xi2CMa color=col1CMa visible=visCMa&vis1 w=wid
segment: nu2CMa betaCMa color=col1CMa visible=visCMa&vis1 w=wid
segment: nu2CMa alphaCMa color=col1CMa visible=visCMa&vis1 w=wid
segment: epsilonCMa kappaCMa color=col1CMa visible=visCMa&vis1 w=wid
segment: zetaCMa epsilonCMa color=col1CMa visible=visCMa&vis1 w=wid
segment: iotaCMa thetaCMa color=col1CMa visible=visCMa&vis1 w=wid
segment: thetaLep etaLep color=col1Lep visible=visLep&vis1 w=wid
segment: etaLep zetaLep color=col1Lep visible=visLep&vis1 w=wid
segment: zetaLep alphaLep color=col1Lep visible=visLep&vis1 w=wid
segment: alphaLep muLep color=col1Lep visible=visLep&vis1 w=wid
segment: alphaLep deltaLep color=col1Lep visible=visLep&vis1 w=wid
segment: deltaLep gammaLep color=col1Lep visible=visLep&vis1 w=wid
segment: gammaLep betaLep color=col1Lep visible=visLep&vis1 w=wid
segment: betaLep epsilonLep color=col1Lep visible=visLep&vis1 w=wid
segment: alphaLep betaLep color=col1Lep visible=visLep&vis1 w=wid
segment: muLep lambdaLep color=col1Lep visible=visLep&vis1 w=wid
segment: muLep kappaLep color=col1Lep visible=visLep&vis1 w=wid
segment: epsilonLep muLep color=col1Lep visible=visLep&vis1 w=wid
segment: kappaLep iotaLep color=col1Lep visible=visLep&vis1 w=wid
segment: lambdaLep nuLep color=col1Lep visible=visLep&vis1 w=wid
segment: iotaHer thetaHer color=col1Her visible=visHer&vis1 w=wid
segment: thetaHer rhoHer color=col1Her visible=visHer&vis1 w=wid
segment: rhoHer eHer color=col1Her visible=visHer&vis1 w=wid
segment: eHer piHer color=col1Her visible=visHer&vis1 w=wid
segment: piHer etaHer color=col1Her visible=visHer&vis1 w=wid
segment: etaHer sigmaHer color=col1Her visible=visHer&vis1 w=wid
segment: sigmaHer tauHer color=col1Her visible=visHer&vis1 w=wid
segment: tauHer chiHer color=col1Her visible=visHer&vis1 w=wid
segment: etaHer zetaHer color=col1Her visible=visHer&vis1 w=wid
segment: zetaHer betaHer color=col1Her visible=visHer&vis1 w=wid
segment: betaHer gammaHer color=col1Her visible=visHer&vis1 w=wid
segment: zetaHer epsilonHer color=col1Her visible=visHer&vis1 w=wid
segment: epsilonHer lambdaHer color=col1Her visible=visHer&vis1 w=wid
segment: lambdaHer deltaHer color=col1Her visible=visHer&vis1 w=wid
segment: mu1Her xiHer color=col1Her visible=visHer&vis1 w=wid
segment: xiHer omicronHer color=col1Her visible=visHer&vis1 w=wid
segment: epsilonHer piHer color=col1Her visible=visHer&vis1 w=wid
segment: mu1Her lambdaHer color=col1Her visible=visHer&vis1 w=wid
segment: betaCVn alpha2CVn color=col1CVn visible=visCVn&vis1 w=wid
segment: thetaInd alphaInd color=col1Ind visible=visInd&vis1 w=wid
segment: alphaInd betaInd color=col1Ind visible=visInd&vis1 w=wid
segment: betaInd thetaInd color=col1Ind visible=visInd&vis1 w=wid
segment: betaCar omegaCar color=col1Car visible=visCar&vis1 w=wid
segment: omegaCar thetaCar color=col1Car visible=visCar&vis1 w=wid
segment: thetaCar wCar color=col1Car visible=visCar&vis1 w=wid
segment: wCar xCar color=col1Car visible=visCar&vis1 w=wid
segment: xCar uCar color=col1Car visible=visCar&vis1 w=wid
segment: uCar sCar color=col1Car visible=visCar&vis1 w=wid
segment: sCar qCar color=col1Car visible=visCar&vis1 w=wid
segment: qCar iotaCar color=col1Car visible=visCar&vis1 w=wid
segment: dCar epsilonCar color=col1Car visible=visCar&vis1 w=wid
segment: epsilonCar alphaCar color=col1Car visible=visCar&vis1 w=wid
segment: aCar iotaCar color=col1Car visible=visCar&vis1 w=wid
segment: aCar dCar color=col1Car visible=visCar&vis1 w=wid
segment: alphaCar nuPupCar color=col1Car visible=visCar&vis1 w=wid
segment: epsilonCar zetaPupCar color=col1Car visible=visCar&vis1 w=wid
segment: alphaUMi deltaUMi color=col1UMi visible=visUMi&vis1 w=wid
segment: deltaUMi epsilonUMi color=col1UMi visible=visUMi&vis1 w=wid
segment: epsilonUMi zetaUMi color=col1UMi visible=visUMi&vis1 w=wid
segment: zetaUMi etaUMi color=col1UMi visible=visUMi&vis1 w=wid
segment: etaUMi gammaUMi color=col1UMi visible=visUMi&vis1 w=wid
segment: gammaUMi betaUMi color=col1UMi visible=visUMi&vis1 w=wid
segment: betaUMi zetaUMi color=col1UMi visible=visUMi&vis1 w=wid
segment: alphaCMi betaCMi color=col1CMi visible=visCMi&vis1 w=wid
segment: f46LMi betaLMi color=col1LMi visible=visLMi&vis1 w=wid
segment: betaLMi f21LMi color=col1LMi visible=visLMi&vis1 w=wid
segment: f21LMi f10LMi color=col1LMi visible=visLMi&vis1 w=wid
segment: f21LMi f46LMi color=col1LMi visible=visLMi&vis1 w=wid
segment: betaHyi gammaHyi color=col1Hyi visible=visHyi&vis1 w=wid
segment: gammaHyi epsilonHyi color=col1Hyi visible=visHyi&vis1 w=wid
segment: epsilonHyi deltaHyi color=col1Hyi visible=visHyi&vis1 w=wid
segment: deltaHyi alphaHyi color=col1Hyi visible=visHyi&vis1 w=wid
segment: betaLeo thetaLeo color=col1Leo visible=visLeo&vis1 w=wid
segment: thetaLeo alphaLeo color=col1Leo visible=visLeo&vis1 w=wid
segment: alphaLeo etaLeo color=col1Leo visible=visLeo&vis1 w=wid
segment: etaLeo gammaLeo color=col1Leo visible=visLeo&vis1 w=wid
segment: gammaLeo deltaLeo color=col1Leo visible=visLeo&vis1 w=wid
segment: deltaLeo betaLeo color=col1Leo visible=visLeo&vis1 w=wid
segment: gammaLeo zetaLeo color=col1Leo visible=visLeo&vis1 w=wid
segment: zetaLeo muLeo color=col1Leo visible=visLeo&vis1 w=wid
segment: muLeo epsilonLeo color=col1Leo visible=visLeo&vis1 w=wid
segment: deltaLeo thetaLeo color=col1Leo visible=visLeo&vis1 w=wid
segment: gammaEqu deltaEqu color=col1Equ visible=visEqu&vis1 w=wid
segment: deltaEqu betaEqu color=col1Equ visible=visEqu&vis1 w=wid
segment: betaEqu alphaEqu color=col1Equ visible=visEqu&vis1 w=wid
segment: alphaEqu gammaEqu color=col1Equ visible=visEqu&vis1 w=wid
segment: f1Lac f6Lac color=col1Lac visible=visLac&vis1 w=wid
segment: f6Lac f5Lac color=col1Lac visible=visLac&vis1 w=wid
segment: f5Lac f4Lac color=col1Lac visible=visLac&vis1 w=wid
segment: f4Lac betaLac color=col1Lac visible=visLac&vis1 w=wid
segment: betaLac alphaLac color=col1Lac visible=visLac&vis1 w=wid
segment: alphaLac f5Lac color=col1Lac visible=visLac&vis1 w=wid
segment: alphaLyn f38Lyn color=col1Lyn visible=visLyn&vis1 w=wid
segment: f38Lyn HD77912 color=col1Lyn visible=visLyn&vis1 w=wid
segment: HD77912 f10UMa color=col1Lyn visible=visLyn&vis1 w=wid
segment: f10UMa f31Lyn color=col1Lyn visible=visLyn&vis1 w=wid
segment: f31Lyn f21Lyn color=col1Lyn visible=visLyn&vis1 w=wid
segment: f21Lyn f15Lyn color=col1Lyn visible=visLyn&vis1 w=wid
segment: f15Lyn f2Lyn color=col1Lyn visible=visLyn&vis1 w=wid
segment: alphaLyr zeta1Lyr color=col1Lyr visible=visLyr&vis1 w=wid
segment: zeta1Lyr betaLyr color=col1Lyr visible=visLyr&vis1 w=wid
segment: betaLyr gammaLyr color=col1Lyr visible=visLyr&vis1 w=wid
segment: gammaLyr delta2Lyr color=col1Lyr visible=visLyr&vis1 w=wid
segment: delta2Lyr zeta1Lyr color=col1Lyr visible=visLyr&vis1 w=wid
segment: nuVir etaVir color=col1Vir visible=visVir&vis1 w=wid
segment: etaVir gammaVir color=col1Vir visible=visVir&vis1 w=wid
segment: gammaVir alphaVir color=col1Vir visible=visVir&vis1 w=wid
segment: alphaVir kappaVir color=col1Vir visible=visVir&vis1 w=wid
segment: kappaVir iotaVir color=col1Vir visible=visVir&vis1 w=wid
segment: iotaVir muVir color=col1Vir visible=visVir&vis1 w=wid
segment: alphaVir zetaVir color=col1Vir visible=visVir&vis1 w=wid
segment: zetaVir tauVir color=col1Vir visible=visVir&vis1 w=wid
segment: tauVir f109Vir color=col1Vir visible=visVir&vis1 w=wid
segment: zetaVir deltaVir color=col1Vir visible=visVir&vis1 w=wid
segment: deltaVir epsilonVir color=col1Vir visible=visVir&vis1 w=wid
segment: deltaVir gammaVir color=col1Vir visible=visVir&vis1 w=wid
segment: betaPyx alphaPyx color=col1Pyx visible=visPyx&vis1 w=wid
segment: alphaPyx gammaPyx color=col1Pyx visible=visPyx&vis1 w=wid
segment: epsilonMic gammaMic color=col1Mic visible=visMic&vis1 w=wid
segment: gammaMic alphaMic color=col1Mic visible=visMic&vis1 w=wid
segment: thetaCrB betaCrB color=col1CrB visible=visCrB&vis1 w=wid
segment: betaCrB alphaCrB color=col1CrB visible=visCrB&vis1 w=wid
segment: alphaCrB gammaCrB color=col1CrB visible=visCrB&vis1 w=wid
segment: gammaCrB deltaCrB color=col1CrB visible=visCrB&vis1 w=wid
segment: deltaCrB epsilonCrB color=col1CrB visible=visCrB&vis1 w=wid
segment: epsilonCrB iotaCrB color=col1CrB visible=visCrB&vis1 w=wid
segment: nuOct betaOct color=col1Oct visible=visOct&vis1 w=wid
segment: betaOct deltaOct color=col1Oct visible=visOct&vis1 w=wid
segment: deltaOct nuOct color=col1Oct visible=visOct&vis1 w=wid
segment: zetaOri epsilonOri color=col1Ori visible=visOri&vis1 w=wid
segment: epsilonOri deltaOri color=col1Ori visible=visOri&vis1 w=wid
segment: f01Ori xiOri color=col1Ori visible=visOri&vis1 w=wid
segment: f01Ori chi2Ori color=col1Ori visible=visOri&vis1 w=wid
segment: chi2Ori chi1Ori color=col1Ori visible=visOri&vis1 w=wid
segment: xiOri nuOri color=col1Ori visible=visOri&vis1 w=wid
segment: nuOri chi1Ori color=col1Ori visible=visOri&vis1 w=wid
segment: xiOri muOri color=col1Ori visible=visOri&vis1 w=wid
segment: muOri alphaOri color=col1Ori visible=visOri&vis1 w=wid
segment: alphaOri zetaOri color=col1Ori visible=visOri&vis1 w=wid
segment: zetaOri kappaOri color=col1Ori visible=visOri&vis1 w=wid
segment: kappaOri betaOri color=col1Ori visible=visOri&vis1 w=wid
segment: betaOri deltaOri color=col1Ori visible=visOri&vis1 w=wid
segment: deltaOri gammaOri color=col1Ori visible=visOri&vis1 w=wid
segment: gammaOri lambdaOri color=col1Ori visible=visOri&vis1 w=wid
segment: lambdaOri alphaOri color=col1Ori visible=visOri&vis1 w=wid
segment: gammaOri pi3Ori color=col1Ori visible=visOri&vis1 w=wid
segment: pi3Ori pi4Ori color=col1Ori visible=visOri&vis1 w=wid
segment: pi4Ori f5Ori color=col1Ori visible=visOri&vis1 w=wid
segment: f5Ori pi5Ori color=col1Ori visible=visOri&vis1 w=wid
segment: pi5Ori pi6Ori color=col1Ori visible=visOri&vis1 w=wid
segment: pi3Ori pi2Ori color=col1Ori visible=visOri&vis1 w=wid
segment: pi2Ori pi1Ori color=col1Ori visible=visOri&vis1 w=wid
segment: nuOri muOri color=col1Ori visible=visOri&vis1 w=wid
segment: alphaPic gammaPic color=col1Pic visible=visPic&vis1 w=wid
segment: gammaPic betaPic color=col1Pic visible=visPic&vis1 w=wid
segment: alphaPav gammaPav color=col1Pav visible=visPav&vis1 w=wid
segment: gammaPav betaPav color=col1Pav visible=visPav&vis1 w=wid
segment: betaPav deltaPav color=col1Pav visible=visPav&vis1 w=wid
segment: deltaPav alphaPav color=col1Pav visible=visPav&vis1 w=wid
segment: deltaPav epsilonPav color=col1Pav visible=visPav&vis1 w=wid
segment: epsilonPav zetaPav color=col1Pav visible=visPav&vis1 w=wid
segment: zetaPav kappaPav color=col1Pav visible=visPav&vis1 w=wid
segment: kappaPav deltaPav color=col1Pav visible=visPav&vis1 w=wid
segment: kappaPav lambdaPav color=col1Pav visible=visPav&vis1 w=wid
segment: lambdaPav xiPav color=col1Pav visible=visPav&vis1 w=wid
segment: xiPav piPav color=col1Pav visible=visPav&vis1 w=wid
segment: piPav lambdaPav color=col1Pav visible=visPav&vis1 w=wid
segment: piPav etaPav color=col1Pav visible=visPav&vis1 w=wid
segment: gammaPeg alphaPeg color=col1Peg visible=visPeg&vis1 w=wid
segment: betaPeg etaPeg color=col1Peg visible=visPeg&vis1 w=wid
segment: etaPeg pi1Peg color=col1Peg visible=visPeg&vis1 w=wid
segment: betaPeg muPeg color=col1Peg visible=visPeg&vis1 w=wid
segment: muPeg lambdaPeg color=col1Peg visible=visPeg&vis1 w=wid
segment: lambdaPeg iotaPeg color=col1Peg visible=visPeg&vis1 w=wid
segment: iotaPeg kappaPeg color=col1Peg visible=visPeg&vis1 w=wid
segment: alphaPeg xiPeg color=col1Peg visible=visPeg&vis1 w=wid
segment: xiPeg f42Peg color=col1Peg visible=visPeg&vis1 w=wid
segment: f42Peg thetaPeg color=col1Peg visible=visPeg&vis1 w=wid
segment: thetaPeg epsilonPeg color=col1Peg visible=visPeg&vis1 w=wid
segment: alphaAndPeg betaPeg color=col1Peg visible=visPeg&vis1 w=wid
segment: alphaAndPeg gammaPeg color=col1Peg visible=visPeg&vis1 w=wid
segment: betaPeg alphaPeg color=col1Peg visible=visPeg&vis1 w=wid
segment: omicronPer zetaPer color=col1Per visible=visPer&vis1 w=wid
segment: zetaPer xiPer color=col1Per visible=visPer&vis1 w=wid
segment: xiPer epsilonPer color=col1Per visible=visPer&vis1 w=wid
segment: epsilonPer deltaPer color=col1Per visible=visPer&vis1 w=wid
segment: deltaPer alphaPer color=col1Per visible=visPer&vis1 w=wid
segment: alphaPer gammaPer color=col1Per visible=visPer&vis1 w=wid
segment: gammaPer etaPer color=col1Per visible=visPer&vis1 w=wid
segment: alphaPer betaPer color=col1Per visible=visPer&vis1 w=wid
segment: betaPer rhoPer color=col1Per visible=visPer&vis1 w=wid
segment: rhoPer f16Per color=col1Per visible=visPer&vis1 w=wid
segment: zetaPhe betaPhe color=col1Phe visible=visPhe&vis1 w=wid
segment: betaPhe kappaPhe color=col1Phe visible=visPhe&vis1 w=wid
segment: kappaPhe zetaPhe color=col1Phe visible=visPhe&vis1 w=wid
segment: betaPhe deltaPhe color=col1Phe visible=visPhe&vis1 w=wid
segment: deltaPhe psiPhe color=col1Phe visible=visPhe&vis1 w=wid
segment: psiPhe betaPhe color=col1Phe visible=visPhe&vis1 w=wid
segment: betaPhe gammaPhe color=col1Phe visible=visPhe&vis1 w=wid
segment: gammaPhe kappaPhe color=col1Phe visible=visPhe&vis1 w=wid
segment: kappaPhe alphaPhe color=col1Phe visible=visPhe&vis1 w=wid
segment: alphaPhe epsilonPhe color=col1Phe visible=visPhe&vis1 w=wid
segment: epsilonPhe kappaPhe color=col1Phe visible=visPhe&vis1 w=wid
segment: f41Ari alphaAri color=col1Ari visible=visAri&vis1 w=wid
segment: alphaAri betaAri color=col1Ari visible=visAri&vis1 w=wid
segment: betaAri gammaAri color=col1Ari visible=visAri&vis1 w=wid
segment: alphaRet epsilonRet color=col1Ret visible=visRet&vis1 w=wid
segment: epsilonRet deltaRet color=col1Ret visible=visRet&vis1 w=wid
segment: deltaRet betaRet color=col1Ret visible=visRet&vis1 w=wid
segment: betaRet alphaRet color=col1Ret visible=visRet&vis1 w=wid
segment: gamma2Vel omicronVel color=col1Vel visible=visVel&vis1 w=wid
segment: omicronVel delta1Vel color=col1Vel visible=visVel&vis1 w=wid
segment: delta1Vel kappaVel color=col1Vel visible=visVel&vis1 w=wid
segment: kappaVel phiVel color=col1Vel visible=visVel&vis1 w=wid
segment: phiVel muVel color=col1Vel visible=visVel&vis1 w=wid
segment: muVel pVel color=col1Vel visible=visVel&vis1 w=wid
segment: pVel qVel color=col1Vel visible=visVel&vis1 w=wid
segment: qVel psiVel color=col1Vel visible=visVel&vis1 w=wid
segment: psiVel lambdaVel color=col1Vel visible=visVel&vis1 w=wid
segment: lambdaVel gamma2Vel color=col1Vel visible=visVel&vis1 w=wid
segment: thetaLib gammaLib color=col1Lib visible=visLib&vis1 w=wid
segment: gammaLib betaLib color=col1Lib visible=visLib&vis1 w=wid
segment: betaLib alpha2Lib color=col1Lib visible=visLib&vis1 w=wid
segment: alpha2Lib sigmaLib color=col1Lib visible=visLib&vis1 w=wid
segment: sigmaLib gammaLib color=col1Lib visible=visLib&vis1 w=wid
segment: lambdaSco kappaSco color=col1Sco visible=visSco&vis1 w=wid
segment: kappaSco iota1Sco color=col1Sco visible=visSco&vis1 w=wid
segment: iota1Sco thetaSco color=col1Sco visible=visSco&vis1 w=wid
segment: thetaSco etaSco color=col1Sco visible=visSco&vis1 w=wid
segment: etaSco zeta1Sco color=col1Sco visible=visSco&vis1 w=wid
segment: zeta1Sco mu1Sco color=col1Sco visible=visSco&vis1 w=wid
segment: mu1Sco epsilonSco color=col1Sco visible=visSco&vis1 w=wid
segment: epsilonSco tauSco color=col1Sco visible=visSco&vis1 w=wid
segment: tauSco alphaSco color=col1Sco visible=visSco&vis1 w=wid
segment: alphaSco deltaSco color=col1Sco visible=visSco&vis1 w=wid
segment: alphaSco piSco color=col1Sco visible=visSco&vis1 w=wid
segment: alphaSco beta1Sco color=col1Sco visible=visSco&vis1 w=wid
segment: betaScl alphaScl color=col1Scl visible=visScl&vis1 w=wid
segment: alphaScl gammaScl color=col1Scl visible=visScl&vis1 w=wid
segment: gammaScl betaScl color=col1Scl visible=visScl&vis1 w=wid
segment: deltaOph muSer color=col1Ser visible=visSer&vis1 w=wid
segment: muSer epsilonSer color=col1Ser visible=visSer&vis1 w=wid
segment: epsilonSer alphaSer color=col1Ser visible=visSer&vis1 w=wid
segment: alphaSer deltaSer color=col1Ser visible=visSer&vis1 w=wid
segment: deltaSer betaSer color=col1Ser visible=visSer&vis1 w=wid
segment: betaSer gammaSer color=col1Ser visible=visSer&vis1 w=wid
segment: gammaSer kappaSer color=col1Ser visible=visSer&vis1 w=wid
segment: kappaSer betaSer color=col1Ser visible=visSer&vis1 w=wid
segment: theta1Ser dSer color=col1Ser visible=visSer&vis1 w=wid
segment: dSer etaSer color=col1Ser visible=visSer&vis1 w=wid
segment: etaSer HD165402 color=col1Ser visible=visSer&vis1 w=wid
segment: HD165402 nuOph color=col1Ser visible=visSer&vis1 w=wid
segment: nuOph omicronSer color=col1Ser visible=visSer&vis1 w=wid
segment: omicronSer xiSer color=col1Ser visible=visSer&vis1 w=wid
segment: xiSer nuSer color=col1Ser visible=visSer&vis1 w=wid
segment: alphaOph betaOph color=col1Oph visible=visOph&vis1 w=wid
segment: etaOph betaOph color=col1Oph visible=visOph&vis1 w=wid
segment: alphaOph kappaOph color=col1Oph visible=visOph&vis1 w=wid
segment: kappaOph epsilonOph color=col1Oph visible=visOph&vis1 w=wid
segment: epsilonOph zetaOph color=col1Oph visible=visOph&vis1 w=wid
segment: zetaOph etaOph color=col1Oph visible=visOph&vis1 w=wid
segment: etaOph cOph color=col1Oph visible=visOph&vis1 w=wid
segment: betaSex alphaSex color=col1Sex visible=visSex&vis1 w=wid
segment: betaSct RSct color=col1Sct visible=visSct&vis1 w=wid
segment: RSct HD175156 color=col1Sct visible=visSct&vis1 w=wid
segment: HD175156 gammaSct color=col1Sct visible=visSct&vis1 w=wid
segment: gammaSct alphaSct color=col1Sct visible=visSct&vis1 w=wid
segment: alphaSct betaSct color=col1Sct visible=visSct&vis1 w=wid
segment: gammaCru alphaCru color=col1Cru visible=visCru&vis1 w=wid
segment: betaCru deltaCru color=col1Cru visible=visCru&vis1 w=wid
segment: lambdaCrA V686CrA color=col1CrA visible=visCrA&vis1 w=wid
segment: V686CrA epsilonCrA color=col1CrA visible=visCrA&vis1 w=wid
segment: epsilonCrA gammaCrA color=col1CrA visible=visCrA&vis1 w=wid
segment: gammaCrA alphaCrA color=col1CrA visible=visCrA&vis1 w=wid
segment: alphaCrA betaCrA color=col1CrA visible=visCrA&vis1 w=wid
segment: betaCrA deltaCrA color=col1CrA visible=visCrA&vis1 w=wid
segment: deltaCrA zetaCrA color=col1CrA visible=visCrA&vis1 w=wid
segment: zetaCrA HD175219 color=col1CrA visible=visCrA&vis1 w=wid
segment: lambdaCrA HD170642 color=col1CrA visible=visCrA&vis1 w=wid
segment: alphaPsA epsilonPsA color=col1PsA visible=visPsA&vis1 w=wid
segment: epsilonPsA etaPsA color=col1PsA visible=visPsA&vis1 w=wid
segment: etaPsA thetaPsA color=col1PsA visible=visPsA&vis1 w=wid
segment: thetaPsA tauPsA color=col1PsA visible=visPsA&vis1 w=wid
segment: tauPsA betaPsA color=col1PsA visible=visPsA&vis1 w=wid
segment: betaPsA deltaPsA color=col1PsA visible=visPsA&vis1 w=wid
segment: alphaTrA gammaTrA color=col1TrA visible=visTrA&vis1 w=wid
segment: gammaTrA betaTrA color=col1TrA visible=visTrA&vis1 w=wid
segment: betaTrA alphaTrA color=col1TrA visible=visTrA&vis1 w=wid
segment: rhoPup f188Pup color=col1Pup visible=visPup&vis1 w=wid
segment: f188Pup piPup color=col1Pup visible=visPup&vis1 w=wid
segment: piPup nuPup color=col1Pup visible=visPup&vis1 w=wid
segment: nuPup tauPup color=col1Pup visible=visPup&vis1 w=wid
segment: tauPup sigmaPup color=col1Pup visible=visPup&vis1 w=wid
segment: sigmaPup zetaPup color=col1Pup visible=visPup&vis1 w=wid
segment: zetaPup rhoPup color=col1Pup visible=visPup&vis1 w=wid
segment: kappaCyg iotaCyg color=col1Cyg visible=visCyg&vis1 w=wid
segment: iotaCyg deltaCyg color=col1Cyg visible=visCyg&vis1 w=wid
segment: deltaCyg gammaCyg color=col1Cyg visible=visCyg&vis1 w=wid
segment: gammaCyg alphaCyg color=col1Cyg visible=visCyg&vis1 w=wid
segment: gammaCyg epsilonCyg color=col1Cyg visible=visCyg&vis1 w=wid
segment: epsilonCyg zetaCyg color=col1Cyg visible=visCyg&vis1 w=wid
segment: zetaCyg muCyg color=col1Cyg visible=visCyg&vis1 w=wid
segment: gammaCyg etaCyg color=col1Cyg visible=visCyg&vis1 w=wid
segment: etaCyg beta1Cyg color=col1Cyg visible=visCyg&vis1 w=wid
segment: deltaDor f36Dor color=col1Dor visible=visDor&vis1 w=wid
segment: f36Dor betaDor color=col1Dor visible=visDor&vis1 w=wid
segment: betaDor deltaDor color=col1Dor visible=visDor&vis1 w=wid
segment: betaDor alphaDor color=col1Dor visible=visDor&vis1 w=wid
segment: alphaDor gammaDor color=col1Dor visible=visDor&vis1 w=wid
segment: gammaMen muMen color=col1Men visible=visMen&vis1 w=wid
segment: zetaTel alphaTel color=col1Tel visible=visTel&vis1 w=wid
segment: alphaTuc gammaTuc color=col1Tuc visible=visTuc&vis1 w=wid
segment: gammaTuc zetaTuc color=col1Tuc visible=visTuc&vis1 w=wid
segment: gammaTuc beta1Tuc color=col1Tuc visible=visTuc&vis1 w=wid
segment: gammaTri betaTri color=col1Tri visible=visTri&vis1 w=wid
segment: betaTri alphaTri color=col1Tri visible=visTri&vis1 w=wid
segment: alphaTri gammaTri color=col1Tri visible=visTri&vis1 w=wid
segment: gammaGem zetaGem color=col1Gem visible=visGem&vis1 w=wid
segment: zetaGem deltaGem color=col1Gem visible=visGem&vis1 w=wid
segment: deltaGem lambdaGem color=col1Gem visible=visGem&vis1 w=wid
segment: lambdaGem xiGem color=col1Gem visible=visGem&vis1 w=wid
segment: deltaGem upsilonGem color=col1Gem visible=visGem&vis1 w=wid
segment: upsilonGem kappaGem color=col1Gem visible=visGem&vis1 w=wid
segment: upsilonGem betaGem color=col1Gem visible=visGem&vis1 w=wid
segment: upsilonGem iotaGem color=col1Gem visible=visGem&vis1 w=wid
segment: iotaGem tauGem color=col1Gem visible=visGem&vis1 w=wid
segment: tauGem alphaGem color=col1Gem visible=visGem&vis1 w=wid
segment: tauGem thetaGem color=col1Gem visible=visGem&vis1 w=wid
segment: tauGem epsilonGem color=col1Gem visible=visGem&vis1 w=wid
segment: epsilonGem nuGem color=col1Gem visible=visGem&vis1 w=wid
segment: epsilonGem muGem color=col1Gem visible=visGem&vis1 w=wid
segment: muGem etaGem color=col1Gem visible=visGem&vis1 w=wid
segment: etaGem f1Gem color=col1Gem visible=visGem&vis1 w=wid
segment: gammaMon deltaMon color=col1Mon visible=visMon&vis1 w=wid
segment: betaMon deltaMon color=col1Mon visible=visMon&vis1 w=wid
segment: deltaMon f17Mon color=col1Mon visible=visMon&vis1 w=wid
segment: f17Mon epsilonMonA color=col1Mon visible=visMon&vis1 w=wid
segment: epsilonMonA f13Mon color=col1Mon visible=visMon&vis1 w=wid
segment: f13Mon f15Mon color=col1Mon visible=visMon&vis1 w=wid
segment: f17Mon f15Mon color=col1Mon visible=visMon&vis1 w=wid
segment: f15Mon HD45194 color=col1Mon visible=visMon&vis1 w=wid
segment: deltaMon f28Mon color=col1Mon visible=visMon&vis1 w=wid
segment: f28Mon zetaMon color=col1Mon visible=visMon&vis1 w=wid
segment: f28Mon alphaMon color=col1Mon visible=visMon&vis1 w=wid
segment: betaAqr alphaAqr color=col1Aqr visible=visAqr&vis1 w=wid
segment: alphaAqr gammaAqr color=col1Aqr visible=visAqr&vis1 w=wid
segment: gammaAqr zetaAqr color=col1Aqr visible=visAqr&vis1 w=wid
segment: zetaAqr etaAqr color=col1Aqr visible=visAqr&vis1 w=wid
segment: etaAqr lambdaAqr color=col1Aqr visible=visAqr&vis1 w=wid
segment: lambdaAqr psi1Aqr color=col1Aqr visible=visAqr&vis1 w=wid
segment: psi1Aqr b01Aqr color=col1Aqr visible=visAqr&vis1 w=wid
segment: alphaAqr thetaAqr color=col1Aqr visible=visAqr&vis1 w=wid
segment: thetaAqr iotaAqr color=col1Aqr visible=visAqr&vis1 w=wid
segment: thetaAqr sigmaAqr color=col1Aqr visible=visAqr&vis1 w=wid
segment: sigmaAqr tauAqr color=col1Aqr visible=visAqr&vis1 w=wid
segment: tauAqr deltaAqr color=col1Aqr visible=visAqr&vis1 w=wid
segment: deltaAqr c02Aqr color=col1Aqr visible=visAqr&vis1 w=wid
segment: epsilonAqr betaAqr color=col1Aqr visible=visAqr&vis1 w=wid
segment: etaHya sigmaHya color=col1Hya visible=visHya&vis1 w=wid
segment: sigmaHya deltaHya color=col1Hya visible=visHya&vis1 w=wid
segment: deltaHya epsilonHya color=col1Hya visible=visHya&vis1 w=wid
segment: epsilonHya rhoHya color=col1Hya visible=visHya&vis1 w=wid
segment: rhoHya etaHya color=col1Hya visible=visHya&vis1 w=wid
segment: rhoHya zetaHya color=col1Hya visible=visHya&vis1 w=wid
segment: zetaHya thetaHya color=col1Hya visible=visHya&vis1 w=wid
segment: thetaHya tau2Hya color=col1Hya visible=visHya&vis1 w=wid
segment: tau2Hya tau1Hya color=col1Hya visible=visHya&vis1 w=wid
segment: tau1Hya alphaHya color=col1Hya visible=visHya&vis1 w=wid
segment: alphaHya f26Hya color=col1Hya visible=visHya&vis1 w=wid
segment: f26Hya kappaHya color=col1Hya visible=visHya&vis1 w=wid
segment: kappaHya upsilon1Hya color=col1Hya visible=visHya&vis1 w=wid
segment: upsilon1Hya lambdaHya color=col1Hya visible=visHya&vis1 w=wid
segment: lambdaHya muHya color=col1Hya visible=visHya&vis1 w=wid
segment: muHya nuHya color=col1Hya visible=visHya&vis1 w=wid
segment: nuHya chi1Hya color=col1Hya visible=visHya&vis1 w=wid
segment: chi1Hya xiHya color=col1Hya visible=visHya&vis1 w=wid
segment: xiHya betaHya color=col1Hya visible=visHya&vis1 w=wid
segment: betaHya psiHya color=col1Hya visible=visHya&vis1 w=wid
segment: psiHya gammaHya color=col1Hya visible=visHya&vis1 w=wid
segment: gammaHya piHya color=col1Hya visible=visHya&vis1 w=wid
segment: piHya f50Hya color=col1Hya visible=visHya&vis1 w=wid
segment: f50Hya kHya color=col1Hya visible=visHya&vis1 w=wid
segment: kHya EHya color=col1Hya visible=visHya&vis1 w=wid
segment: xi1Cet xi2Cet color=col1Cet visible=visCet&vis1 w=wid
segment: tauCet betaCet color=col1Cet visible=visCet&vis1 w=wid
segment: betaCet iotaCet color=col1Cet visible=visCet&vis1 w=wid
segment: betaCet etaCet color=col1Cet visible=visCet&vis1 w=wid
segment: etaCet thetaCet color=col1Cet visible=visCet&vis1 w=wid
segment: thetaCet zetaCet color=col1Cet visible=visCet&vis1 w=wid
segment: zetaCet rhoCet color=col1Cet visible=visCet&vis1 w=wid
segment: rhoCet epsilonCet color=col1Cet visible=visCet&vis1 w=wid
segment: epsilonCet piCet color=col1Cet visible=visCet&vis1 w=wid
segment: piCet sigmaCet color=col1Cet visible=visCet&vis1 w=wid
segment: sigmaCet tauCet color=col1Cet visible=visCet&vis1 w=wid
segment: omicronCet epsilonCet color=col1Cet visible=visCet&vis1 w=wid
segment: omicronCet deltaCet color=col1Cet visible=visCet&vis1 w=wid
segment: deltaCet gammaCet color=col1Cet visible=visCet&vis1 w=wid
segment: gammaCet alphaCet color=col1Cet visible=visCet&vis1 w=wid
segment: alphaCet lambdaCet color=col1Cet visible=visCet&vis1 w=wid
segment: lambdaCet muCet color=col1Cet visible=visCet&vis1 w=wid
segment: muCet xi2Cet color=col1Cet visible=visCet&vis1 w=wid
segment: xi2Cet nuCet color=col1Cet visible=visCet&vis1 w=wid
segment: nuCet gammaCet color=col1Cet visible=visCet&vis1 w=wid
segment: chiLup HD144415 color=col1Lup visible=visLup&vis1 w=wid
segment: HD144415 etaLup color=col1Lup visible=visLup&vis1 w=wid
segment: etaLup chiLup color=col1Lup visible=visLup&vis1 w=wid
segment: etaLup gammaLup color=col1Lup visible=visLup&vis1 w=wid
segment: gammaLup deltaLup color=col1Lup visible=visLup&vis1 w=wid
segment: deltaLup phi1Lup color=col1Lup visible=visLup&vis1 w=wid
segment: deltaLup betaLup color=col1Lup visible=visLup&vis1 w=wid
segment: gammaLup omegaLup color=col1Lup visible=visLup&vis1 w=wid
segment: omegaLup zetaLup color=col1Lup visible=visLup&vis1 w=wid
segment: zetaLup alphaLup color=col1Lup visible=visLup&vis1 w=wid
segment: zetaLup rhoLup color=col1Lup visible=visLup&vis1 w=wid
segment: alphaLup tau2Lup color=col1Lup visible=visLup&vis1 w=wid
segment: alphaLup betaLup color=col1Lup visible=visLup&vis1 w=wid


curve: x=\\cos(t)*\\sin(\\pi*1/6)*s ; y=\\sin(t)*\\sin(\\pi*1/6)*s ; z=\\cos(\\pi*1/6)*s ; t in [0, 2*\\pi]  color=gridCol  visible=ShowGrid
curve: x=\\cos(t)*\\sin(\\pi*2/6)*s ; y=\\sin(t)*\\sin(\\pi*2/6)*s ; z=\\cos(\\pi*2/6)*s ; t in [0, 2*\\pi]  color=gridCol  visible=ShowGrid
curve: x=\\cos(t)*\\sin(\\pi*3/6)*s ; y=\\sin(t)*\\sin(\\pi*3/6)*s ; z=\\cos(\\pi*3/6)*s ; t in [0, 2*\\pi]  color=gridCol  visible=ShowGrid
curve: x=\\cos(t)*\\sin(\\pi*4/6)*s ; y=\\sin(t)*\\sin(\\pi*4/6)*s ; z=\\cos(\\pi*4/6)*s ; t in [0, 2*\\pi]  color=gridCol  visible=ShowGrid
curve: x=\\cos(t)*\\sin(\\pi*5/6)*s ; y=\\sin(t)*\\sin(\\pi*5/6)*s ; z=\\cos(\\pi*5/6)*s ; t in [0, 2*\\pi]  color=gridCol  visible=ShowGrid
curve: x=\\cos(t)*s ; y=0 ; z=\\sin(t)*s ; t in [0, 2*\\pi]  color=gridCol  visible=ShowGrid
curve: x=\\cos(t)*\\cos(1*\\pi/6)*s ; y=\\cos(t)*\\sin(1*\\pi/6)*s ; z=\\sin(t)*s ; t in [0, 2*\\pi]  color=gridCol  visible=ShowGrid
curve: x=\\cos(t)*\\cos(2*\\pi/6)*s ; y=\\cos(t)*\\sin(2*\\pi/6)*s ; z=\\sin(t)*s ; t in [0, 2*\\pi]  color=gridCol  visible=ShowGrid
curve: x=\\cos(t)*\\cos(3*\\pi/6)*s ; y=\\cos(t)*\\sin(3*\\pi/6)*s ; z=\\sin(t)*s ; t in [0, 2*\\pi]  color=gridCol  visible=ShowGrid
curve: x=\\cos(t)*\\cos(4*\\pi/6)*s ; y=\\cos(t)*\\sin(4*\\pi/6)*s ; z=\\sin(t)*s ; t in [0, 2*\\pi]  color=gridCol  visible=ShowGrid
curve: x=\\cos(t)*\\cos(5*\\pi/6)*s ; y=\\cos(t)*\\sin(5*\\pi/6)*s ; z=\\sin(t)*s ; t in [0, 2*\\pi]  color=gridCol  visible=ShowGrid
` },
];

// A scene's own text only needs to specify the view settings that actually
// matter for its presentation (matching how every other DSL line already
// lets omitted attributes fall back to a default) — everything else resets
// to this fixed baseline first, so a *fresh* view of a demo never inherits
// stray ambient state (a leftover perspective setting, whatever) left over
// from before it was entered. Mirrors this app's own literal startup
// defaults (the `let` initializers near the top of the file) expressed in
// the DSL's own field shape. darkMode is deliberately absent — see
// stripDarkMode below.
const VIEW_SETTINGS_BUILTIN_DEFAULTS = {
  mode: 'compact', anchor: 'zaxis',
  pointer: (() => { const z = cToZ(new C(0.5, 0.3)); return { re: z.re, im: z.im }; })(),
  showPointer: true, showAxes: false, scale: 1, perspective: false, invF: 0,
  scaleNodes: false, scaleSegments: false, clipBehind: true,
};

// Dark mode is a personal UI preference, not part of any scene's or
// document's own content — a demo-mode transition should never flip it,
// in either direction (a visitor exploring in the dark shouldn't get a
// sudden bright flash just from cycling a demo). Every view-settings object
// applied by demo-mode code below is run through this first. One deliberate
// exception: scenes marked `forceDark` — see applySceneDarkMode below.
function stripDarkMode(view) {
  if (!view || !('darkMode' in view)) return view;
  const { darkMode, ...rest } = view;
  return rest;
}

let demoMode       = false;
let demoSceneIndex = 0;
// What "exit demo mode" always returns to — the user's own document and
// view, captured the moment demo mode was entered. Demo-scene tinkering
// never touches this; see demoSceneLiveState below for where tinkering
// actually persists instead.
let _preDemoState = null;
// One slot per DEMO_SCENES entry, null until that scene has been shown at
// least once this session (tab). Populated/updated every time the user
// navigates AWAY from a scene (cycling, or exiting demo mode) via
// saveCurrentSceneState() — so returning to it later in the SAME session
// (cycling back, or turning demo mode off and back on) shows exactly what
// was left there, not the pristine template. Plain in-memory state, never
// written to any storage: a page reload or a new tab starts every slot
// `null` again, so no amount of in-session tinkering can affect what a
// *future* session's demos look like — each `let` here is naturally
// scoped to this one script execution already, nothing extra needed to
// guarantee that.
let demoSceneLiveState = DEMO_SCENES.map(() => null);

// The one exception to stripDarkMode's "demo transitions never touch dark
// mode" rule: a scene marked `forceDark: true` (Constellations — a night
// sky) is ALWAYS shown dark, every time it's landed on (entering demo mode
// onto it, cycling into it, returning to it). Its darkness is part of the
// scene's presentation, not the viewer's preference — so the viewer's own
// general setting is set aside on arrival (_generalDarkMode) and restored on
// leaving (cycling to a non-forced scene, or exiting demo mode). A ☾ toggle
// made while on a forced-dark scene lasts only for that visit. Saved only
// if not already saved, so two adjacent forced-dark scenes never overwrite
// the real preference with "dark." Never persisted per scene — dark mode is
// already stripped from every saved scene snapshot.
let _generalDarkMode = null;

function applySceneDarkMode(index) {
  if (DEMO_SCENES[index].forceDark) {
    if (_generalDarkMode === null) _generalDarkMode = darkMode;
    applyViewSettings({ darkMode: true });
  } else {
    restoreGeneralDarkMode();
  }
}

function restoreGeneralDarkMode() {
  if (_generalDarkMode === null) return;
  applyViewSettings({ darkMode: _generalDarkMode });
  _generalDarkMode = null;
}

function saveCurrentSceneState() {
  demoSceneLiveState[demoSceneIndex] = { object: captureState(), view: currentViewSettingsSnapshot(), lastSet: captureLastSet() };
}

// Shared by entering demo mode and cycling — either resumes a scene exactly
// where this session last left it (demoSceneLiveState has a slot for it) or
// commits its pristine template text fresh, exactly like Save would for
// hand-typed code editor content. Either way, every piece of transient
// state that could otherwise hold a stale reference across the swap gets
// reset (mirrors restoreState()'s own reset list, since this is doing the
// same kind of wholesale replacement).
function loadDemoScene(index) {
  if (editingVertexId !== null)  cancelEdit();
  if (editingSegmentId !== null) cancelSegmentEdit();

  const saved = demoSceneLiveState[index];
  if (saved) {
    restoreState(saved.object);
    applyViewSettings(stripDarkMode(saved.view));
    applyLastSet(saved.lastSet);
  } else {
    const scene  = DEMO_SCENES[index];
    const staged = parseCodeText(scene.codeText);
    const { newVertices, newConstants, newFunctions, newSegments, newFaces, newCurves } = buildCommittedArraysFromStaged(staged);

    vertices       = newVertices;       nextVertexId   = newVertices.length;
    constants      = newConstants;      nextConstantId = newConstants.length;
    functions      = newFunctions;      nextFunctionId = newFunctions.length;
    segments       = newSegments;       nextSegmentId  = newSegments.length;
    faces          = newFaces;          nextFaceId     = newFaces.length;
    curves         = newCurves;         nextCurveId    = newCurves.length;
    nameCounters   = { P: 0, S: 0, F: 0, C: 0 };
    lastSetVertex  = { ...staged.finalSet.vertex };
    lastSetSegment = { ...staged.finalSet.segment };
    lastSetFace    = { ...staged.finalSet.face };
    lastSetCurve   = { ...staged.finalSet.curve };
    applyViewSettings(stripDarkMode(VIEW_SETTINGS_BUILTIN_DEFAULTS));
    applyViewSettings(stripDarkMode(staged.finalView));

    selectedVertexIds = new Set();
    focusedVertexId   = null;
    selectedSegmentId = null;
    selectedFaceId    = null;
    faceMode          = 'off';
    segmentMode       = 'off';
    facePickOrder     = [];
    clearPendingListPick();
    clearArmedStates();
    updateFaceButton();
    updateSegmentButton();
  }

  // Deliberately not preserved across a scene switch even when resuming a
  // saved slot — undo should never reach backward across a scene boundary
  // into a different scene or into whatever came before it.
  undoStack = [];
  redoStack = [];
  updateUndoButtons();

  demoSceneIndex = index;
  document.getElementById('btn-demo').title = `Demo: ${DEMO_SCENES[index].name}`;
  document.getElementById('btn-demo-cycle').title = `Next: ${DEMO_SCENES[(index + 1) % DEMO_SCENES.length].name}`;
  applySceneDarkMode(index);

  reEvalObjects();
  renderConstList();
  renderVertexList();
  renderSegmentList();
  renderFaceList();
  renderAddRowDefaults();

  // If the code editor happens to be open, refresh it to the new scene's
  // own text — matches what opening it fresh would show.
  if (codeOpen) {
    document.getElementById('code-textarea').value = serializeState(vertices, constants, segments, faces, curves, functions);
    reparseAndPreview();
    resetCodeLineTracking();
    _preCodeViewSnapshot = currentViewSettingsSnapshot();
  }
  draw();
}

function enterDemoMode() {
  _preDemoState = { object: captureState(), view: currentViewSettingsSnapshot(), lastSet: captureLastSet() };
  demoMode = true;
  document.getElementById('btn-demo').classList.add('active');
  document.getElementById('btn-demo-cycle').style.display = '';
  // Resumes wherever demoSceneIndex already points (0 on a fresh session,
  // or wherever it was left if demo mode was toggled off and back on).
  loadDemoScene(demoSceneIndex);
}

function cycleDemoScene() {
  saveCurrentSceneState();
  loadDemoScene((demoSceneIndex + 1) % DEMO_SCENES.length);
}

function exitDemoMode() {
  if (editingVertexId !== null)  cancelEdit();
  if (editingSegmentId !== null) cancelSegmentEdit();

  saveCurrentSceneState();

  demoMode = false;
  document.getElementById('btn-demo').classList.remove('active');
  document.getElementById('btn-demo').title = 'Demo';
  document.getElementById('btn-demo-cycle').style.display = 'none';

  // Always the user's own document and view — demo-scene tinkering lives
  // on in demoSceneLiveState (just saved above), never here.
  restoreState(_preDemoState.object);
  applyViewSettings(stripDarkMode(_preDemoState.view));
  restoreGeneralDarkMode();
  applyLastSet(_preDemoState.lastSet);
  renderAddRowDefaults();

  // Same reasoning as loadDemoScene: a demo-mode session's undo history
  // shouldn't be reachable once you're back to your own document.
  undoStack = [];
  redoStack = [];
  updateUndoButtons();

  _preDemoState = null;

  if (codeOpen) {
    document.getElementById('code-textarea').value = serializeState(vertices, constants, segments, faces, curves, functions);
    reparseAndPreview();
    resetCodeLineTracking();
    _preCodeViewSnapshot = currentViewSettingsSnapshot();
  }
  draw();
}

document.getElementById('btn-demo').addEventListener('click', () => {
  if (demoMode) exitDemoMode(); else enterDemoMode();
});
document.getElementById('btn-demo-cycle').addEventListener('click', () => {
  if (demoMode) cycleDemoScene();
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

// Whether a click is on one of the panel's own navigation/collapse
// controls — the vertex list's own collapse arrow, any of the three
// submenu toggles (only "Display" actually contains the vertex list, but
// see the same reasoning already used elsewhere for not gating on which
// one), or the whole-panel collapse. None of these are "the user clicked
// away, abandon the pick" in the sense either outside-click listener below
// cares about — they're navigation, and the pick (list-driven preview or
// arm state) is specifically designed to survive being scrolled/collapsed
// out of view, per each of their own comments. Bug, user-caught: neither
// listener actually had this exemption for the submenu/whole-panel
// buttons before (only the pendingListPick one exempted the vertex list's
// own collapse arrow) — clicking any of those three buttons was itself
// registering as an outside click and clearing the pick, on top of the
// separate bug where the floating button never even knew to hide/reshow
// around the collapse (see updatePendingButtonPosition/updateArmButtons'
// own isVertexListHidden check).
function isPanelNavControl(e) {
  if (e.target.closest('.list-toggle[data-list="vertex"]')) return true;
  if (e.target.closest('#btn-sub-view, #btn-sub-aux, #btn-sub-disp')) return true;
  if (e.target.closest('#btn-toggle-controls')) return true;
  return false;
}

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
//
// A further exemption, user-caught (two bugs, one root cause): *any*
// pointerdown landing on a vertex-list row is deferred entirely, not just
// the pending row or a canvas hit. Two symptoms traced back to the same
// mechanism: (1) touch-scrolling the list, starting from a row that wasn't
// the pending one, lost the pending pick outright — a touch scroll begins
// with a genuine pointerdown wherever the finger first lands, so without
// this exemption every scroll gesture that happened to start on some other
// row was indistinguishable from a deliberate click on it; (2) even a
// scroll starting *on* the pending row's own button-adjacent area only
// survived the first such gesture, since after the row scrolled out from
// under the finger, the next pointerdown inevitably landed elsewhere.
// Deferring unconditionally for any row fixes both: nothing is decided
// until an actual `click` resolves (which a scroll never produces), and
// that click's own handler (handleListPick/applyFacePick/applySegmentPick)
// already resolves a *different* vertex's stale pending pick correctly on
// its own once it runs (each now starts by clearing it — see their own
// comments) — so no information is lost by not deciding here on
// pointerdown. Every non-row target (an unrelated control, empty space)
// still clears immediately, unchanged.
document.addEventListener('pointerdown', e => {
  if (!pendingListPick) return;
  if (e.target === pendingListPick.btnEl) return;
  if (isPanelNavControl(e)) return;
  if (isControlPointDragStart(e)) return;
  if (isPointerOnVertex(e, pendingListPick.vertexId)) return;
  if (e.target.closest && e.target.closest('.vertex-entry')) return;
  clearPendingListPick();
}, true);

// Same clear-on-outside-click precedent as pendingListPick above, for the
// undo-latest-vertex arm states — except canvas is exempted entirely: its
// own click handling (applyFacePick, or the segment toggle's own inline
// logic in selectVertexById) already resolves arm state correctly on its
// own, invoked from pointerup, and would otherwise have its arm cleared out
// from under it by this pointerdown-phase listener before that handler
// ever runs (the same race the pendingListPick.btnEl exemption above
// solves for its own button).
//
// Every vertex-list row is deferred entirely too, for the identical reason
// spelled out on the pendingListPick listener above — this used to exempt
// only the armed vertex's own row (or v0's, while close-armed), clearing
// immediately for every *other* row. Two real bugs traced to that
// narrower version, both user-caught:
//   - Clicking a genuinely different row while something was armed took
//     two clicks, not one — the immediate clearArmedStates()+
//     renderVertexList() call rebuilt that row from scratch before the
//     pointerup-driven click could land on it (browsers suppress a click
//     whose target was removed mid-gesture rather than redirecting it —
//     see NOTES7's earlier writeup of this same mechanism).
//   - Touch-scrolling the list from any row other than the armed one lost
//     the arm outright — a scroll's opening pointerdown was
//     indistinguishable from a deliberate click on whatever row it
//     started on.
//   - A related bug, same root, worth naming separately: the two narrow
//     exemptions this replaced compared `rowId === armedVertexId` even
//     when `row` itself was null (e.g. clicking some unrelated control)
//     — `null === null` is true, so *any* non-row click while only
//     `faceCloseArmed` was set (armedVertexId itself is null in that
//     state) was wrongly exempted, meaning the close-arm never cleared
//     on an outside click at all. Requiring an actual row makes the
//     comparison meaningful again; the wider row-deferral below makes the
//     two specific checks moot anyway, since every row now defers
//     regardless of which vertex it belongs to.
// Deferring is safe because a real click's own handler
// (applyFacePick/applySegmentPick, or handleListPick for append/reject)
// already resolves the arm state itself once it actually runs — arming a
// fresh vertex, or clicking an already-armed row (a no-op by design, see
// renderVertexList's row dispatch), both come out correct either way.
document.addEventListener('pointerdown', e => {
  if (armedVertexId === null && !faceCloseArmed) return;
  if (e.target === canvas) return;
  if (e.target === latestBtnEl || e.target === closeBtnEl) return;
  if (isPanelNavControl(e)) return;
  if (e.target.closest && e.target.closest('.vertex-entry')) return;
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
