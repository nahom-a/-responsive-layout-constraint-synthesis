// direction_a.mjs — the eight "wrong reading" counter-strategies,
// implemented generically so they can run against any {system, spec} pair.
// Used by the discrimination audit suite. Every strategy returns a NEW system;
// none mutate the input.

import { validateSystem } from '../../environment/validate.js';
import { computeCoarseObservations, solveLayout, FINE_GRID, COARSE_GRID, makeVariant } from './corpus.mjs';

function clone(system) { return { guides: (system.guides || []).slice(), constraints: system.constraints.map((c) => ({ ...c, lhs: c.lhs.map((t) => t.slice()) })) }; }

// 1. Per-axis decomposition: for an axis-coupled layout, replace every
// `box.h == box.intrinsicH` row with a fixed numeric height computed once
// from the box's OWN intrinsic width, ignoring the resolved-width coupling.
export function perAxisDecomposition(system, spec, referenceHeightGuess) {
  if (!spec.axisCoupled) return null; // not applicable
  const out = clone(system);
  out.constraints = out.constraints.map((c) => {
    const isIntrinsicHRow = c.lhs.length === 2 && c.op === '==' &&
      c.lhs.some(([t]) => /\.intrinsicH$/.test(t)) && c.lhs.some(([t]) => /\.h$/.test(t));
    if (!isIntrinsicHRow) return c;
    const boxTerm = c.lhs.find(([t]) => /\.h$/.test(t))[0];
    return { lhs: [[boxTerm, 1]], rhs: referenceHeightGuess, op: '==', priority: c.priority };
  });
  return out;
}

function swapPriorities(system, p1, p2) {
  return {
    guides: (system.guides || []).slice(),
    constraints: system.constraints.map((c) => {
      if (c.priority === p1) return { ...c, priority: p2 };
      if (c.priority === p2) return { ...c, priority: p1 };
      return { ...c, lhs: c.lhs.map((t) => t.slice()) };
    }),
  };
}

// 2. Plausible-but-wrong priority ordering: of every pair of distinct
// optional priorities, pick the swap that actually changes geometry on the
// COARSE grid for the layout's own canonical mid variant -- swapping two
// priorities that never end up in conflict (e.g. a floor and a ceiling on
// the same variable, which bound an interval and never fight each other
// directly; the real fight is each of them against a third, lower
// preference priority) is observationally vacuous and must not be used as
// the discriminator, so we search rather than guess which pair matters.
export function wrongPriorityOrder(system, spec) {
  const priorities = Array.from(new Set(system.constraints.map((c) => c.priority).filter((p) => p !== 'required'))).sort((a, b) => a - b);
  if (priorities.length < 2) return null;
  const variant = makeVariant(spec, { index: 1 });
  let best = null, bestScore = -1;
  for (let i = 0; i < priorities.length; i++) {
    for (let j = i + 1; j < priorities.length; j++) {
      const candidate = swapPriorities(system, priorities[i], priorities[j]);
      let diffs = 0;
      for (const w of COARSE_GRID) {
        const ra = solveLayout(system, spec, variant, w);
        const rb = solveLayout(candidate, spec, variant, w);
        if (!(ra.status === 'ok' && rb.status === 'ok' && JSON.stringify(ra.boxes) === JSON.stringify(rb.boxes))) diffs++;
      }
      if (diffs > bestScore) { bestScore = diffs; best = candidate; }
    }
  }
  return bestScore > 0 ? best : null; // null: no priority swap is discriminable -> not applicable, report honestly
}

// 3. Breakpoint offset: shift every optional inequality's threshold by a few
// pixels (plausible off-by-a-bit).
export function breakpointOffset(system, deltaPx = 6) {
  const out = clone(system);
  out.constraints = out.constraints.map((c) => {
    if (c.priority === 'required' || c.op === '==') return c;
    return { ...c, rhs: c.rhs + (c.op === '>=' ? deltaPx : -deltaPx) };
  });
  return out;
}

// 4. Under-determined: drop one required equality (the last one touching a
// box coordinate, chosen so the system still validates and mostly resolves).
export function underdetermined(system) {
  const out = clone(system);
  const idx = out.constraints.map((c, i) => (c.priority === 'required' && c.op === '==' ? i : -1)).filter((i) => i >= 0).pop();
  if (idx === undefined) return null;
  out.constraints.splice(idx, 1);
  return out;
}

// 5. All inequalities written as equalities.
export function allInequalitiesAsEqualities(system) {
  const out = clone(system);
  out.constraints = out.constraints.map((c) => (c.op === '==' ? c : { ...c, op: '==' }));
  return out;
}

// 6. Fitted to shipped variants only, wrong on held-out: shift a
// content-sensitive constant just enough that it still reproduces the three
// shipped variants (which only probe a coarse set of textLength values) but
// diverges for other textLength values. Only meaningful when spec has
// textBearing boxes.
export function fittedToShippedVariantsOnly(system, spec) {
  if (!spec.textBearing || spec.textBearing.length === 0) return null;
  // No direct constant to perturb in our grammar targets textLength itself
  // (it's a constant substituted at solve time, not a coefficient in the
  // system) -- the closest analogue is perturbing a coupling-adjacent
  // required relation's rhs by a value too small to move any of the three
  // shipped textLength buckets across a bracket boundary, but large enough
  // to move an intermediate one. We approximate by nudging the sidebar
  // floor by 1px (240 -> 241), which is invisible whenever the floor isn't
  // the binding regime for the shipped variants at the sampled widths, but
  // wrong on the fine grid immediately around the true breakpoint.
  const out = clone(system);
  out.constraints = out.constraints.map((c) => (
    c.priority === 700 && c.op === '>=' ? { ...c, rhs: c.rhs + 1 } : c
  ));
  return out;
}

// 7. Over budget but behaviourally correct: pad with redundant constraints.
export function overBudgetButCorrect(system, spec) {
  const out = clone(system);
  const extra = spec.constraintBudget - out.constraints.length + 3;
  const filler = out.constraints.find((c) => c.priority === 'required' && c.op === '==');
  for (let i = 0; i < extra; i++) out.constraints.push({ ...filler });
  return out;
}

// 8. Correct on simple layouts, per-axis (wrong) on coupled ones: a
// corpus-level combinator, applied by the caller across multiple layouts'
// systems rather than to a single one. See runDirectionA's `combinator8`.

// Runs a wrong system against a layout and classifies the failure.
export function scoreWrongSystem(system, spec) {
  if (system === null) return { applicable: false };
  const errors = validateSystem(system, spec);
  if (errors.length) return { applicable: true, failed: true, condition: 'grammar/budget', detail: errors[0] };

  const coarse = computeCoarseObservations(system, spec);
  if (!coarse.ok) return { applicable: true, failed: true, condition: `coarse (${coarse.reason})`, detail: coarse };

  // fine grid check against the SAME system solved fresh (i.e. self-
  // consistency isn't the point -- what matters is whether this system's
  // fine-grid geometry differs from a reference. Caller passes a reference
  // comparator when available; otherwise we just report coarse pass +
  // whether ANY fine-grid point is non-ok (uniqueness failure).
  let fineBad = 0;
  const variant = makeVariant(spec, { index: 1 });
  for (const w of FINE_GRID) {
    const r = solveLayout(system, spec, variant, w);
    if (r.status !== 'ok') fineBad++;
  }
  if (fineBad > 0) return { applicable: true, failed: true, condition: 'fine-grid (UNDERDETERMINED/UNSATISFIABLE)', detail: { fineBad } };

  return { applicable: true, failed: false, coarse };
}

// Compares a wrong system's coarse+fine geometry against a KNOWN-correct
// reference system's geometry, returning divergence info.
export function compareToReference(wrongSystem, referenceSystem, spec) {
  const variants = [0, 1, 2].map((index) => makeVariant(spec, { index }));
  let coarseDivergences = 0, fineDivergences = 0;
  const { COARSE_GRID } = { COARSE_GRID: undefined };
  for (const variant of variants) {
    for (const w of FINE_GRID) {
      const rw = solveLayout(wrongSystem, spec, variant, w);
      const rr = solveLayout(referenceSystem, spec, variant, w);
      const same = rw.status === 'ok' && rr.status === 'ok' && JSON.stringify(rw.boxes) === JSON.stringify(rr.boxes);
      if (!same) {
        fineDivergences++;
        if (w % 40 === 320 % 40) coarseDivergences++;
      }
    }
  }
  return { coarseDivergences, fineDivergences, totalFine: variants.length * FINE_GRID.length };
}
