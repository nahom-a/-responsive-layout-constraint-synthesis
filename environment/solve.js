// solve.js — deterministic, rational-arithmetic constraint solver for the
// layout-constraint-synthesis task family.
//
// Public API:
//   solve(system, env) -> { status: 'ok', boxes: {name:{x,y,w,h}} }
//                        | { status: 'UNSATISFIABLE' }
//                        | { status: 'UNDERDETERMINED' }
//
// `system`  = { guides: string[], constraints: Constraint[] } (see DSL.md)
// `env`     = { viewportW: integer, intrinsics: { [box]: { w: integer, h: integer|null } } }
//             `intrinsics[box].h` may be null for non-text boxes with a fixed
//             intrinsic height supplied directly as a number instead — callers
//             always pass a resolved number; `resolveIntrinsics` (see
//             intrinsics.js) is what turns width into height for text boxes,
//             and that resolution happens *outside* this module, once per
//             fixed-point iteration (see solveWithCoupling below).
//
// Everything here is exact rational arithmetic (BigInt numerator/denominator).
// No floating point enters the linear algebra; floats appear only in the
// final, explicitly-specified rounding step.
//
// ---------------------------------------------------------------------------
// THE RESOLUTION MODEL, IN ONE PARAGRAPH
// ---------------------------------------------------------------------------
// Constraints are grouped into priority tiers: "required" first, then every
// integer priority that appears, strictly descending (higher integer = more
// important). Each tier is solved by the same routine (`solveTier`): find the
// point minimizing total squared violation of that tier's rows, subject to
// every constraint fixed by a strictly higher tier. After a tier is solved,
// every row in it is converted into a permanent constraint for all lower
// tiers: a row with zero violation is carried forward unchanged (as an
// equality stays an equality; as an inequality stays that inequality); a row
// with nonzero violation (forced by conflict with a higher tier) is frozen as
// an equality fixing the exact value it achieved, so no lower tier can move
// it further in either direction. The required tier is solved with the same
// routine; any nonzero violation there means UNSATISFIABLE. After all tiers,
// if the accumulated equalities do not pin every unknown, the result is
// UNDERDETERMINED.
// ---------------------------------------------------------------------------

'use strict';

// ============================== Fraction ==================================

function bgcd(a, b) {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) { [a, b] = [b, a % b]; }
  return a === 0n ? 1n : a;
}

class Frac {
  constructor(num, den = 1n) {
    if (typeof num === 'number') { num = BigInt(num); }
    if (typeof den === 'number') { den = BigInt(den); }
    if (den === 0n) throw new Error('Frac: zero denominator');
    if (den < 0n) { num = -num; den = -den; }
    const g = bgcd(num, den);
    this.n = num / g;
    this.d = den / g;
  }
  static from(x) {
    if (x instanceof Frac) return x;
    if (typeof x === 'bigint') return new Frac(x, 1n);
    if (typeof x === 'number') {
      if (!Number.isInteger(x)) throw new Error('Frac.from: non-integer number ' + x);
      return new Frac(BigInt(x), 1n);
    }
    throw new Error('Frac.from: unsupported ' + x);
  }
  add(o) { o = Frac.from(o); return new Frac(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o) { o = Frac.from(o); return new Frac(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o) { o = Frac.from(o); return new Frac(this.n * o.n, this.d * o.d); }
  div(o) { o = Frac.from(o); if (o.n === 0n) throw new Error('Frac: division by zero'); return new Frac(this.n * o.d, this.d * o.n); }
  neg() { return new Frac(-this.n, this.d); }
  isZero() { return this.n === 0n; }
  cmp(o) { o = Frac.from(o); const l = this.n * o.d, r = o.n * this.d; return l < r ? -1 : l > r ? 1 : 0; }
  gt(o) { return this.cmp(o) > 0; }
  lt(o) { return this.cmp(o) < 0; }
  toNumber() { return Number(this.n) / Number(this.d); }
}
const F0 = new Frac(0n);
const ZERO = F0;

// ============================ Vector helpers ===============================

function vzero(n) { return new Array(n).fill(F0); }
function vdot(a, b) { let s = F0; for (let i = 0; i < a.length; i++) if (!a[i].isZero() && !b[i].isZero()) s = s.add(a[i].mul(b[i])); return s; }
function vaxpy(y, alpha, x) { // y += alpha*x
  for (let i = 0; i < y.length; i++) if (!x[i].isZero()) y[i] = y[i].add(alpha.mul(x[i]));
  return y;
}

// ===================== Generic exact Gaussian elimination ===================
// Solves A x = b (A: m x k matrix of Frac rows, b: Frac[m]) for x (Frac[k]).
// Underdetermined systems get free columns pinned to 0 (an internal search
// convention only — see module docstring on why this is safe). Returns null
// if the system is inconsistent.
function gaussSolve(rows, rhs, k) {
  const m = rows.length;
  // augmented matrix, mutable copies
  const A = rows.map((r) => r.slice());
  const b = rhs.slice();
  const pivotCols = [];
  let row = 0;
  for (let col = 0; col < k && row < m; col++) {
    let sel = -1;
    for (let r = row; r < m; r++) if (!A[r][col].isZero()) { sel = r; break; }
    if (sel === -1) continue;
    [A[row], A[sel]] = [A[sel], A[row]];
    [b[row], b[sel]] = [b[sel], b[row]];
    const piv = A[row][col];
    for (let c = col; c < k; c++) A[row][c] = A[row][c].div(piv);
    b[row] = b[row].div(piv);
    for (let r = 0; r < m; r++) {
      if (r === row) continue;
      const factor = A[r][col];
      if (factor.isZero()) continue;
      for (let c = col; c < k; c++) A[r][c] = A[r][c].sub(factor.mul(A[row][c]));
      b[r] = b[r].sub(factor.mul(b[row]));
    }
    pivotCols.push(col);
    row++;
  }
  // consistency: remaining rows (>= row) must have zero rhs
  for (let r = row; r < m; r++) {
    if (!b[r].isZero()) return null; // inconsistent
  }
  const x = new Array(k).fill(F0);
  for (let i = 0; i < pivotCols.length; i++) x[pivotCols[i]] = b[i];
  return x;
}

// ============================ LinearSystem ==================================
// Maintains a growing set of permanent linear EQUALITY constraints over the
// n original unknowns, in incremental reduced-row-echelon form. Supports
// projecting any linear row into "currently free unknowns" space.
class LinearSystem {
  constructor(n) {
    this.n = n;
    // pivot[col] = { row: Frac[n], b: Frac } meaning:
    //   x[col] = b - sum_{j in freeCols} row[j] * x[j]      (row[col] unused/0)
    this.pivot = new Array(n).fill(null);
    this.freeCols = new Set(Array.from({ length: n }, (_, i) => i));
  }

  // Reduce an arbitrary n-dim row (a, b) meaning a.x = b, substituting out all
  // pivoted columns, returning an equivalent equation purely over current
  // free columns: { coef: Map(col->Frac), b: Frac }.
  reduceEq(a, b) {
    const coef = new Map();
    let rhs = b;
    for (let c = 0; c < this.n; c++) {
      const ac = a[c];
      if (ac.isZero()) continue;
      if (this.pivot[c]) {
        const eq = this.pivot[c];
        // contributes ac * (eq.b - sum_{j free} eq.row[j] x[j])
        rhs = rhs.sub(ac.mul(eq.b));
        for (const [j, coj] of eq.row) {
          const add = ac.mul(coj).neg();
          coef.set(j, (coef.get(j) || F0).add(add));
        }
      } else {
        coef.set(c, (coef.get(c) || F0).add(ac));
      }
    }
    // drop zero entries
    for (const [j, v] of Array.from(coef.entries())) if (v.isZero()) coef.delete(j);
    return { coef, b: rhs };
  }

  // Add permanent equality a.x = b. Returns 'ok' | 'redundant' | 'inconsistent'.
  addEquality(a, b) {
    const { coef, b: rhs } = this.reduceEq(a, b);
    if (coef.size === 0) {
      return rhs.isZero() ? 'redundant' : 'inconsistent';
    }
    // choose pivot column deterministically: smallest index with nonzero coef
    let pivotCol = Math.min(...coef.keys());
    const pcoef = coef.get(pivotCol);
    const newRow = new Map();
    for (const [j, v] of coef) {
      if (j === pivotCol) continue;
      // x[pivotCol] = rhs/pcoef - sum_j (coef_j/pcoef) x_j, i.e. row[j] = coef_j/pcoef
      newRow.set(j, v.div(pcoef));
    }
    const newB = rhs.div(pcoef);
    // back-substitute pivotCol out of every existing pivot equation
    for (let c = 0; c < this.n; c++) {
      if (!this.pivot[c]) continue;
      const eq = this.pivot[c];
      if (!eq.row.has(pivotCol)) continue;
      const coeff = eq.row.get(pivotCol);
      eq.row.delete(pivotCol);
      eq.b = eq.b.sub(coeff.mul(newB));
      for (const [j, v] of newRow) {
        eq.row.set(j, (eq.row.get(j) || F0).sub(coeff.mul(v)));
      }
      for (const [j, v] of Array.from(eq.row.entries())) if (v.isZero()) eq.row.delete(j);
    }
    this.pivot[pivotCol] = { row: newRow, b: newB };
    this.freeCols.delete(pivotCol);
    return 'ok';
  }

  freeList() { return Array.from(this.freeCols).sort((a, b) => a - b); }

  isFullyDetermined() { return this.freeCols.size === 0; }

  // Full solution vector, substituting 0 for any still-free column (used only
  // when the caller has already confirmed there are no free columns, or for
  // internal witness evaluation).
  // `overrides`: optional Map(col -> Frac) giving values for specific free
  // columns; any free column not present defaults to 0.
  solutionVector(overrides) {
    const x = new Array(this.n).fill(F0);
    for (const c of this.freeCols) x[c] = (overrides && overrides.has(c)) ? overrides.get(c) : F0;
    // iteratively resolve pivots (their row may reference other pivots'
    // free-column-only expressions already, since reduceEq keeps pivot rows
    // expressed purely in free columns at all times)
    for (let c = 0; c < this.n; c++) {
      if (!this.pivot[c]) continue;
      const eq = this.pivot[c];
      let v = eq.b;
      for (const [j, coj] of eq.row) v = v.sub(coj.mul(x[j]));
      x[c] = v;
    }
    return x;
  }
}

// ========================== Tier solving (active-set QP) ====================
//
// Minimizes sum of penalty(row) over `rows` (this tier's constraints,
// expressed as original n-dim {a,b,op}), subject to `hardIneqs` (n-dim
// {a,b,op} that must remain satisfied), over the free columns of `lin`.
// penalty for '==' is always counted (quadratic); for '<='/'>=' it is a
// one-sided quadratic (hinge-squared), counted only while "on".
//
// Returns { x: Frac[n], violations: Frac[] } where violations[i] is the
// signed slack-adjusted magnitude of row i's violation (0 if satisfied).
function solveTier(rows, hardIneqs, lin) {
  const free = lin.freeList();
  const k = free.length;
  const colIndex = new Map(free.map((c, i) => [c, i]));

  function projectRow(a, b) {
    const { coef, b: rhs } = lin.reduceEq(a, b);
    const c = vzero(k);
    for (const [j, v] of coef) c[colIndex.get(j)] = v;
    return { c, d: rhs };
  }

  const rowProj = rows.map((r) => ({ ...projectRow(r.a, r.b), op: r.op }));
  const hardProj = hardIneqs.map((r) => ({ ...projectRow(r.a, r.b), op: r.op }));

  if (k === 0) {
    // nothing free; witness point is whatever lin already pins.
    const x = lin.solutionVector();
    const violations = rows.map((r) => {
      const val = vdot(r.a, x);
      return computeViolation(val, r.b, r.op);
    });
    return { x, violations };
  }

  // active-set state
  const on = new Array(rowProj.length).fill(false); // for <=/>= rows only; '==' always "on"
  for (let i = 0; i < rowProj.length; i++) if (rowProj[i].op === '==') on[i] = true;
  const W = new Set(); // indices into hardProj currently active-as-equality

  const seen = new Set();
  let t = new Array(k).fill(F0);

  for (let iter = 0; iter < 500; iter++) {
    const key = JSON.stringify(on) + '|' + JSON.stringify(Array.from(W).sort());
    if (seen.has(key)) {
      throw new Error('solveTier: active-set cycle detected (should not happen for a well-posed system)');
    }
    seen.add(key);

    // Build KKT system: minimize sum_{on} (c.t-d)^2 s.t. Ct = e for W
    // Q = sum c c^T (only over 'on' rows), g = sum d*c
    const Wlist = Array.from(W);
    const dim = k + Wlist.length;
    const Amat = [];
    const bvec = [];
    // stationarity rows: 2Q t + C^T lambda = 2g  ->  Q t + C^T lambda = g  (drop factor 2)
    const Q = Array.from({ length: k }, () => vzero(k));
    const g = vzero(k);
    for (let i = 0; i < rowProj.length; i++) {
      if (!on[i]) continue;
      const { c, d } = rowProj[i];
      for (let p = 0; p < k; p++) {
        if (c[p].isZero()) continue;
        for (let q = 0; q < k; q++) {
          if (c[q].isZero()) continue;
          Q[p][q] = Q[p][q].add(c[p].mul(c[q]));
        }
        g[p] = g[p].add(c[p].mul(d));
      }
    }
    for (let p = 0; p < k; p++) {
      const row = Q[p].slice();
      for (let wi = 0; wi < Wlist.length; wi++) row.push(hardProj[Wlist[wi]].c[p]);
      Amat.push(row);
      bvec.push(g[p]);
    }
    for (let wi = 0; wi < Wlist.length; wi++) {
      const row = vzero(k);
      for (let p = 0; p < k; p++) row[p] = hardProj[Wlist[wi]].c[p];
      for (let wj = 0; wj < Wlist.length; wj++) row.push(F0);
      Amat.push(row);
      bvec.push(hardProj[Wlist[wi]].d);
    }
    const sol = gaussSolve(Amat, bvec, dim);
    if (sol === null) {
      throw new Error('UNSATISFIABLE');
    }
    t = sol.slice(0, k);
    const lambda = sol.slice(k);

    // check hard rows not in W: must be satisfied
    let changed = false;
    for (let i = 0; i < hardProj.length; i++) {
      if (W.has(i)) continue;
      const val = vdot(hardProj[i].c, t);
      const viol = signedViolation(val, hardProj[i].d, hardProj[i].op);
      if (viol.gt(F0)) { W.add(i); changed = true; }
    }
    if (changed) continue;

    // check W multipliers have correct sign (>=0 required for both <= and >=
    // once written in the form c.t <= d / c.t >= d, using consistent sign
    // convention established in signedViolation/objective derivation below)
    for (let wi = 0; wi < Wlist.length; wi++) {
      const idx = Wlist[wi];
      const lam = lambda[wi];
      // KKT sign convention: rows are stored as "c.t OP d" with C_row = c
      // (never negated for '>=' rows), so the effective multiplier for a
      // '>=' row is the negative of the standard g(t)<=0 multiplier. Valid
      // (load-bearing) means: lambda >= 0 for '<=' rows, lambda <= 0 for
      // '>=' rows.
      const wrongSign = hardProj[idx].op === '<=' ? lam.lt(F0) : lam.gt(F0);
      if (wrongSign) { W.delete(idx); changed = true; }
    }
    if (changed) continue;

    // check off soft rows (<=/>=) for violation -> turn on
    for (let i = 0; i < rowProj.length; i++) {
      if (rowProj[i].op === '==' || on[i]) continue;
      const val = vdot(rowProj[i].c, t);
      const viol = signedViolation(val, rowProj[i].d, rowProj[i].op);
      if (viol.gt(F0)) { on[i] = true; changed = true; }
    }
    if (changed) continue;

    // check on soft rows (<=/>=) for now being satisfied -> turn off
    for (let i = 0; i < rowProj.length; i++) {
      if (rowProj[i].op === '==' || !on[i]) continue;
      const val = vdot(rowProj[i].c, t);
      const viol = signedViolation(val, rowProj[i].d, rowProj[i].op);
      // strictly negative only: a violation of exactly zero (the boundary) is
      // a valid fixed point whether flagged on or off, and treating it as
      // "still on" avoids oscillating with the off-branch's default witness.
      if (viol.lt(F0)) { on[i] = false; changed = true; }
    }
    if (changed) continue;

    // converged
    const overrides = new Map();
    for (let i = 0; i < free.length; i++) overrides.set(free[i], t[i]);
    const x = lin.solutionVector(overrides);
    const violations = rows.map((r) => {
      const val = vdot(r.a, x);
      return computeViolation(val, r.b, r.op);
    });
    return { x, violations };
  }
  throw new Error('solveTier: exceeded iteration budget');
}

// violation magnitude (Frac, >=0) of a scalar value against b/op
function computeViolation(val, b, op) {
  const z = val.sub(b);
  if (op === '==') return z.isZero() ? F0 : (z.lt(F0) ? z.neg() : z);
  if (op === '<=') return z.gt(F0) ? z : F0;
  if (op === '>=') return z.lt(F0) ? z.neg() : F0;
  throw new Error('bad op ' + op);
}
// signed violation used inside the active-set loop: positive means "violated,
// needs to be pulled toward feasibility"; for '<=' violated means z=c.t-d>0;
// for '>=' violated means d-c.t>0.
function signedViolation(val, d, op) {
  const z = val.sub(d);
  if (op === '<=') return z; // >0 means violated
  if (op === '>=') return z.neg(); // >0 means violated
  throw new Error('signedViolation only for inequalities');
}

// =========================== Constraint parsing =============================
// Builds the n-dim unknown index and turns a raw system + concrete constants
// (viewport width, intrinsic sizes) into a flat list of {a: Frac[n], b: Frac, op, priority}.
function buildIndex(system) {
  const boxes = system.boxes;
  const guides = system.guides || [];
  const index = new Map();
  let i = 0;
  for (const box of boxes) {
    for (const suf of ['x', 'y', 'w', 'h']) index.set(`${box}.${suf}`, i++);
  }
  for (const g of guides) index.set(g, i++);
  return { index, n: i };
}

function compileConstraints(system, env, index, n) {
  const rows = [];
  for (const cons of system.constraints) {
    const a = vzero(n);
    let b = Frac.from(cons.rhs);
    for (const [term, coeffRaw] of cons.lhs) {
      const coeff = Frac.from(coeffRaw);
      if (index.has(term)) {
        a[index.get(term)] = a[index.get(term)].add(coeff);
        continue;
      }
      // constant terms
      let val;
      if (term === 'viewport.w') val = env.viewportW;
      else {
        const m = /^(.+)\.(intrinsicW|intrinsicH)$/.exec(term);
        if (!m) throw new Error('unknown term ' + term);
        const box = m[1];
        val = m[2] === 'intrinsicW' ? env.intrinsics[box].w : env.intrinsics[box].h;
      }
      b = b.sub(coeff.mul(Frac.from(val)));
    }
    rows.push({ a, b, op: cons.op, priority: cons.priority });
  }
  return rows;
}

// =============================== Rounding ===================================
// Round-half-away-from-zero to the nearest integer, on an exact Frac.
// Pinned convention (see DSL.md section "Rounding").
function roundFrac(f) {
  const twiceNumOverDen = f.mul(new Frac(2n));
  // f = n/d ; want round-half-away-from-zero
  const n = f.n, d = f.d;
  const q = n / d; // truncation toward zero (BigInt division truncates toward 0)
  const r = n - q * d; // remainder, same sign as n (or 0)
  const twiceR = r < 0n ? -2n * r : 2n * r;
  const dAbs = d < 0n ? -d : d;
  if (twiceR > dAbs || (twiceR === dAbs)) {
    return q + (n < 0n ? -1n : 1n) * (r === 0n ? 0n : 1n);
  }
  return q;
}

// If `hardIneqs` now contains both "a.x <= b" and "a.x >= b" for the exact
// same (a, b) -- e.g. from a DSL.md-§7-sanctioned equality-as-inequality-pair
// -- the pair jointly pins that direction with no remaining freedom in
// either sense, and must be promoted into `lin` as a real equality. Without
// this, the pinned direction is correctly *enforced* going forward (both
// hard inequalities remain checked every later tier) but never shows up in
// `lin`'s pivot structure, so the final UNDERDETERMINED check would
// wrongly flag a direction that in fact has exactly one legal value.
function pushHardIneqAndPromotePairs(hardIneqs, lin, row) {
  hardIneqs.push(row);
  const oppositeOp = row.op === '<=' ? '>=' : row.op === '>=' ? '<=' : null;
  if (!oppositeOp) return 'ok';
  for (const other of hardIneqs) {
    if (other === row || other.op !== oppositeOp) continue;
    if (other.b.cmp(row.b) !== 0) continue;
    if (row.a.length !== other.a.length) continue;
    let same = true;
    for (let i = 0; i < row.a.length; i++) if (row.a[i].cmp(other.a[i]) !== 0) { same = false; break; }
    if (!same) continue;
    return lin.addEquality(row.a, row.b);
  }
  return 'ok';
}

// ============================ Single-pass solve ==============================
// Solves the system fully (one horizontal/vertical simultaneous pass) given
// already-resolved intrinsic sizes for every box. Does not iterate coupling.
function solveOnce(system, env) {
  const { index, n } = buildIndex(system);
  const allRows = compileConstraints(system, env, index, n);

  const required = allRows.filter((r) => r.priority === 'required');
  const optionalByPriority = new Map();
  for (const r of allRows) {
    if (r.priority === 'required') continue;
    if (!optionalByPriority.has(r.priority)) optionalByPriority.set(r.priority, []);
    optionalByPriority.get(r.priority).push(r);
  }
  const priorities = Array.from(optionalByPriority.keys()).sort((a, b) => b - a);

  const lin = new LinearSystem(n);
  const hardIneqs = []; // {a,b,op}

  // ---- required tier ----
  {
    const reqEq = required.filter((r) => r.op === '==');
    const reqIneq = required.filter((r) => r.op !== '==');
    for (const r of reqEq) {
      const res = lin.addEquality(r.a, r.b);
      if (res === 'inconsistent') return { status: 'UNSATISFIABLE' };
    }
    // solve remaining required inequalities as a tier: any nonzero violation -> UNSATISFIABLE
    let result;
    try {
      result = solveTier(reqIneq, hardIneqs, lin);
    } catch (e) {
      if (e.message === 'UNSATISFIABLE') return { status: 'UNSATISFIABLE' };
      throw e;
    }
    for (let i = 0; i < reqIneq.length; i++) {
      if (!result.violations[i].isZero()) return { status: 'UNSATISFIABLE' };
      const res = pushHardIneqAndPromotePairs(hardIneqs, lin, { a: reqIneq[i].a, b: reqIneq[i].b, op: reqIneq[i].op });
      if (res === 'inconsistent') return { status: 'UNSATISFIABLE' };
    }
  }

  // ---- optional tiers, strictly descending priority ----
  for (const p of priorities) {
    const rows = optionalByPriority.get(p);
    let result;
    try {
      result = solveTier(rows, hardIneqs, lin);
    } catch (e) {
      if (e.message === 'UNSATISFIABLE') return { status: 'UNSATISFIABLE' };
      throw e;
    }
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const viol = result.violations[i];
      if (viol.isZero()) {
        if (r.op === '==') {
          const res = lin.addEquality(r.a, r.b);
          if (res === 'inconsistent') return { status: 'UNSATISFIABLE' };
        } else {
          const res = pushHardIneqAndPromotePairs(hardIneqs, lin, { a: r.a, b: r.b, op: r.op });
          if (res === 'inconsistent') return { status: 'UNSATISFIABLE' };
        }
      } else {
        // freeze at achieved value
        const achieved = vdot(r.a, result.x);
        const res = lin.addEquality(r.a, achieved);
        if (res === 'inconsistent') return { status: 'UNSATISFIABLE' };
      }
    }
  }

  if (!lin.isFullyDetermined()) return { status: 'UNDERDETERMINED' };

  const x = lin.solutionVector();
  const boxesOut = {};
  const boxesExact = {};
  for (const box of system.boxes) {
    boxesExact[box] = {
      x: x[index.get(`${box}.x`)].toNumber(),
      y: x[index.get(`${box}.y`)].toNumber(),
      w: x[index.get(`${box}.w`)].toNumber(),
      h: x[index.get(`${box}.h`)].toNumber(),
    };
    boxesOut[box] = {
      x: Number(roundFrac(x[index.get(`${box}.x`)])),
      y: Number(roundFrac(x[index.get(`${box}.y`)])),
      w: Number(roundFrac(x[index.get(`${box}.w`)])),
      h: Number(roundFrac(x[index.get(`${box}.h`)])),
    };
  }
  return { status: 'ok', boxes: boxesOut, boxesExact };
}

// ========================= Axis-coupled fixed point ===========================
// `resolveIntrinsics(env0, widths)` (from intrinsics.js) computes intrinsic
// height for text-bearing boxes as a function of resolved width. Because
// height constraints can feed back into width (through guides or explicit
// relations), the whole system is re-solved to a fixed point: solve with a
// height guess, recompute heights from the resulting widths, repeat until
// the input heights stop changing (or a short cycle is detected, in which
// case the lexicographically-smallest visited height vector is used — see
// DSL.md "Fixed-point convention", a clerical tie-break that never affects
// well-posed reference layouts).
// `resolveIntrinsics` is a 2-arg function (intrinsics, resolvedBoxes) ->
// nextIntrinsics, already closed over the layout's spec (see intrinsics.js:
// callers pass `(intr, boxes) => resolveIntrinsics(spec, intr, boxes)`).
function solve(system, env, resolveIntrinsics) {
  let intrinsics = env.intrinsics;
  const seenKeys = new Map();
  for (let iter = 0; iter < 20; iter++) {
    const key = JSON.stringify(intrinsics);
    const localEnv = { viewportW: env.viewportW, intrinsics };
    const result = solveOnce(system, localEnv);
    if (result.status !== 'ok') return result;
    const nextIntrinsics = resolveIntrinsics(intrinsics, result.boxes);
    const nextKey = JSON.stringify(nextIntrinsics);
    if (nextKey === key) return result;
    if (seenKeys.has(nextKey)) {
      // cycle: pick the lexicographically-smallest visited key deterministically
      const keys = Array.from(seenKeys.keys()).concat([nextKey]).sort();
      const chosen = keys[0];
      const chosenIntrinsics = chosen === nextKey ? nextIntrinsics : seenKeys.get(chosen);
      const finalEnv = { viewportW: env.viewportW, intrinsics: chosenIntrinsics };
      return solveOnce(system, finalEnv);
    }
    seenKeys.set(key, intrinsics);
    intrinsics = nextIntrinsics;
  }
  throw new Error('solve: fixed-point iteration did not converge in 20 steps');
}

module.exports = { solve, solveOnce, Frac, LinearSystem, roundFrac };
