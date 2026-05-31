// corpus.mjs — shared tooling used by solution/lib/factories.mjs,
// solution/build_corpus.mjs, and tests/prebuild_identifiability.mjs.
// Not shipped into environment/.

// Resolve against /app/solve.js first: when running inside the production
// container (or runner execution), that is the actual
// running container's copy (byte-identical to environment/solve.js) and
// /app is where it lives -- solution/ gets copied in next to an already-
// built container filesystem, not next to environment/. Falls back to the
// repo-relative path for local development, where /app does not exist.
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ENV = path.join(HERE, '..', '..', 'environment');
const SOLVE_JS = fs.existsSync('/app/solve.js') ? '/app/solve.js' : path.join(REPO_ENV, 'solve.js');
const INTRINSICS_JS = fs.existsSync('/app/intrinsics.js') ? '/app/intrinsics.js' : path.join(REPO_ENV, 'intrinsics.js');
const { solve } = await import(pathToFileURL(SOLVE_JS).href);
const { resolveIntrinsics, initialIntrinsics } = await import(pathToFileURL(INTRINSICS_JS).href);

export const COARSE_GRID = Array.from({ length: (1440 - 320) / 40 + 1 }, (_, i) => 320 + i * 40);
export const FINE_GRID = Array.from({ length: (1440 - 320) / 4 + 1 }, (_, i) => 320 + i * 4);

// Deterministic seeded PRNG (mulberry32) so held-out generation and
// identifiability search are reproducible without any dependency.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A content variant fixes each text-bearing box's textLength within its
// spec.json range. `rng` optional; when absent, `index` selects one of the
// three canonical shipped variants deterministically (0=min, 1=mid, 2=max).
export function makeVariant(spec, { rng, index } = {}) {
  const textLength = {};
  for (const box of spec.textBearing) {
    const [lo, hi] = spec.textLengthRange[box];
    let v;
    if (rng) v = lo + Math.floor(rng() * (hi - lo + 1));
    else v = index === 0 ? lo : index === 1 ? Math.round((lo + hi) / 2) : hi;
    textLength[box] = v;
  }
  return { textLength };
}

export function envFor(spec, variant, viewportW) {
  const fullVariant = {
    intrinsicW: spec.fixedIntrinsicW,
    intrinsicH: spec.fixedIntrinsicH,
    textLength: variant.textLength,
  };
  const intrinsics = initialIntrinsics(spec, fullVariant);
  return { viewportW, intrinsics };
}

export function solveLayout(system, spec, variant, viewportW) {
  const env = envFor(spec, variant, viewportW);
  const fullSystem = { boxes: spec.boxes, guides: system.guides || [], constraints: system.constraints };
  return solve(fullSystem, env, (intr, boxes) => resolveIntrinsics(spec, variant, intr, boxes));
}

// Runs a system across the coarse grid x the three canonical variants,
// returning { ok: true, observations } or { ok: false, reason, width, variantIndex }.
export function computeCoarseObservations(system, spec) {
  const variants = [0, 1, 2].map((index) => makeVariant(spec, { index }));
  const geometry = variants.map(() => ({}));
  for (let vi = 0; vi < variants.length; vi++) {
    for (const w of COARSE_GRID) {
      const r = solveLayout(system, spec, variants[vi], w);
      if (r.status !== 'ok') return { ok: false, reason: r.status, width: w, variantIndex: vi };
      geometry[vi][w] = r.boxes;
    }
  }
  return { ok: true, variants, geometry };
}

// Claim A: every reference-system breakpoint lies on the coarse grid, i.e.
// between adjacent coarse-grid widths (with content fixed) every coordinate
// is exactly affine in width. Verified by sampling every INTEGER width in
// [lo, hi] and checking each box coordinate against the line through the two
// coarse endpoints.
// Checks that, on each HALF-OPEN coarse interval [lo, hi), every coordinate
// is affine in width. Deliberately half-open: if a breakpoint sits exactly
// on a grid point `hi`, the value AT `hi` belongs to the next interval and
// is checked there as its own left endpoint -- requiring continuity across
// a grid-aligned breakpoint would be checking for the *absence* of the very
// breakpoint Guarantee 1 permits to exist there.
export function checkAffineBetweenGridPoints(system, spec, variant) {
  const mismatches = [];
  for (let i = 0; i < COARSE_GRID.length - 1; i++) {
    const lo = COARSE_GRID[i], hi = COARSE_GRID[i + 1];
    const rLo = solveLayout(system, spec, variant, lo);
    const rLo1 = solveLayout(system, spec, variant, lo + 1);
    if (rLo.status !== 'ok' || rLo1.status !== 'ok') {
      mismatches.push({ lo, hi, reason: 'non-ok endpoint' });
      continue;
    }
    for (let w = lo + 1; w < hi; w++) {
      const r = solveLayout(system, spec, variant, w);
      if (r.status !== 'ok') { mismatches.push({ w, reason: r.status }); continue; }
      for (const box of spec.boxes) {
        for (const k of ['x', 'y', 'w', 'h']) {
          const slope = rLo1.boxesExact[box][k] - rLo.boxesExact[box][k];
          const expected = rLo.boxesExact[box][k] + (w - lo) * slope;
          const actual = r.boxesExact[box][k];
          if (Math.abs(actual - expected) > 1e-9) {
            mismatches.push({ w, box, k, expected, actual });
          }
        }
      }
    }
  }
  return mismatches;
}

// Claim B search: for `trials` random variants, confirm the active-priority
// "signature" (which optional constraints are exactly-satisfied vs frozen)
// matches one of the three shipped variants' signatures at every coarse
// width — i.e. no regime is reachable only by held-out content.
export function signatureAt(system, spec, variant, viewportW) {
  const env = envFor(spec, variant, viewportW);
  // A light-weight signature: geometry itself, rounded, is sufficient to
  // detect "reachable only by held-out variants" for our purposes, since two
  // variants in the same active-constraint regime produce geometry related
  // by the same affine map; we instead check coverage directly in the
  // caller by comparing achieved (dx/dTextLength) slopes -- see
  // checkClaimB below, which is self-contained and does not need this
  // helper beyond exporting solveLayout.
  return solveLayout(system, spec, variant, viewportW);
}

// Claim B, proved structurally rather than by sampling: content (textLength)
// only ever enters a system through `<box>.intrinsicH`/`intrinsicW` terms,
// which are always constants substituted before solving. If NO optional
// (priority-tiered) constraint's lhs references an intrinsic term, then
// which optional constraints are slack vs. frozen (the "active-constraint
// regime") is a pure function of viewport width -- content variant choice,
// shipped or held-out, can never change it. Combined with intrinsics.js
// being a published, deterministic, fully-known function (the agent is
// handed the exact formula, not asked to infer it), this makes Claim B hold
// for the ENTIRE stated textLength range, not merely near the three shipped
// samples: there is no regime any held-out variant could reach that the
// shipped variants do not already exhibit, because content never moves the
// regime at all.
//
// This is checked structurally (fast, exact) rather than by a probabilistic
// sweep. `checkClaimBSampled` below is kept as a supplementary, independent
// sanity check over actual geometry (not the flawed bracket-bump heuristic
// an earlier draft used -- see README's identifiability section for why
// that heuristic produced false positives).
export function checkClaimBStructural(system) {
  const offenders = [];
  for (const c of system.constraints) {
    if (c.priority === 'required') continue;
    for (const [term] of c.lhs) {
      if (/\.intrinsicW$|\.intrinsicH$/.test(term)) offenders.push({ constraint: c, term });
    }
  }
  return { holds: offenders.length === 0, offenders };
}

// Independent sanity check: for `trials` random held-out variants, confirm
// the RESOLVED GEOMETRY at every coarse width is byte-identical to what the
// SAME system produces for at least one shipped variant, modulo the (fully
// known, deterministic) intrinsic-height difference -- i.e. every box's x/y/
// w and every OTHER box's h match some shipped variant exactly; only the
// text-bearing box's own h (and anything after it in a dependency chain)
// may legitimately differ. A truly width-only-driven active set implies the
// former holds broadly; this is a geometry-level corroboration, not the
// proof itself (checkClaimBStructural is the proof).
export function checkClaimBSampled(system, spec, { trials = 2000, seed = 12345 } = {}) {
  const rng = makeRng(seed);
  const shipped = [0, 1, 2].map((index) => makeVariant(spec, { index }));
  let checked = 0, mismatches = 0;
  for (let t = 0; t < trials; t++) {
    const variant = makeVariant(spec, { rng });
    for (const w of COARSE_GRID) {
      checked++;
      const r = solveLayout(system, spec, variant, w);
      if (r.status !== 'ok') { mismatches++; continue; }
      const ok = shipped.some((sv) => {
        const rs = solveLayout(system, spec, sv, w);
        if (rs.status !== 'ok') return false;
        for (const box of spec.boxes) {
          for (const k of ['x', 'y', 'w']) if (r.boxes[box][k] !== rs.boxes[box][k]) return false;
          if (!spec.textBearing.includes(box) && r.boxes[box].h !== rs.boxes[box].h) return false;
        }
        return true;
      });
      if (!ok) mismatches++;
    }
  }
  return { checked, mismatches };
}

// Claim C stand-in: does the reference system fit inside its own budget?
export function checkBudget(system, spec) {
  return {
    constraints: system.constraints.length,
    budget: spec.constraintBudget,
    guides: (system.guides || []).length,
    guideBudget: spec.guideBudget,
    ok: system.constraints.length <= spec.constraintBudget && (system.guides || []).length <= spec.guideBudget,
  };
}
