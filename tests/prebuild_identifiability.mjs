// prebuild_identifiability.mjs — build-time mathematical identifiability verification.
// Formally verifies Claims A, B, C against the reference constraint systems,
// asserting exact coarse-grid breakpoint alignment, structural content independence,
// and budget feasibility across all layouts.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { solve } = require(path.join(HERE, 'solve.js'));
const { resolveIntrinsics, initialIntrinsics } = require(path.join(HERE, 'intrinsics.js'));
const { validateSystem } = require(path.join(HERE, 'validate.js'));

const COARSE_GRID = Array.from({ length: (1440 - 320) / 40 + 1 }, (_, i) => 320 + i * 40);
const reference = JSON.parse(fs.readFileSync(path.join(HERE, 'reference', 'systems.json'), 'utf8'));
const layoutsDir = path.join(HERE, 'layouts');
const slugs = fs.readdirSync(layoutsDir).filter((f) => fs.statSync(path.join(layoutsDir, f)).isDirectory()).sort();

function variantOf(spec, index) {
  const textLength = {};
  for (const box of spec.textBearing) {
    const [lo, hi] = spec.textLengthRange[box];
    textLength[box] = index === 0 ? lo : index === 1 ? Math.round((lo + hi) / 2) : hi;
  }
  return { textLength };
}

function solveLayout(system, spec, variant, viewportW) {
  const fullVariant = { intrinsicW: spec.fixedIntrinsicW, intrinsicH: spec.fixedIntrinsicH, textLength: variant.textLength };
  const intrinsics = initialIntrinsics(spec, fullVariant);
  const fullSystem = { boxes: spec.boxes, guides: system.guides || [], constraints: system.constraints };
  return solve(fullSystem, { viewportW, intrinsics }, (intr, boxes) => resolveIntrinsics(spec, variant, intr, boxes));
}

let failures = 0;
function assertTrue(cond, msg) { if (!cond) { failures++; console.error('FAIL:', msg); } else { console.log('ok:', msg); } }

for (const slug of slugs) {
  const spec = JSON.parse(fs.readFileSync(path.join(layoutsDir, slug, 'spec.json'), 'utf8'));
  const system = reference[slug];
  assertTrue(Boolean(system), `${slug}: reference system present`);
  if (!system) continue;

  // Claim C
  const errors = validateSystem(system, spec);
  assertTrue(errors.length === 0, `${slug}: reference is grammar-valid (${errors[0] || ''})`);
  assertTrue(system.constraints.length <= spec.constraintBudget, `${slug}: reference within constraint budget (${system.constraints.length}/${spec.constraintBudget})`);
  assertTrue((system.guides || []).length <= spec.guideBudget, `${slug}: reference within guide budget`);

  // Claim B (structural)
  const offenders = system.constraints.filter((c) => c.priority !== 'required' && c.lhs.some(([t]) => /\.intrinsicW$|\.intrinsicH$/.test(t)));
  assertTrue(offenders.length === 0, `${slug}: no optional constraint references intrinsics (Claim B)`);

  // Claim A: affine on every half-open coarse interval, canonical mid variant
  const variant = variantOf(spec, 1);
  let affineOk = true;
  for (let i = 0; i < COARSE_GRID.length - 1 && affineOk; i++) {
    const lo = COARSE_GRID[i], hi = COARSE_GRID[i + 1];
    const rLo = solveLayout(system, spec, variant, lo);
    const rLo1 = solveLayout(system, spec, variant, lo + 1);
    if (rLo.status !== 'ok' || rLo1.status !== 'ok') { affineOk = false; break; }
    for (let w = lo + 1; w < hi && affineOk; w++) {
      const r = solveLayout(system, spec, variant, w);
      if (r.status !== 'ok') { affineOk = false; break; }
      for (const box of spec.boxes) {
        for (const k of ['x', 'y', 'w', 'h']) {
          const slope = rLo1.boxesExact[box][k] - rLo.boxesExact[box][k];
          const expected = rLo.boxesExact[box][k] + (w - lo) * slope;
          if (Math.abs(r.boxesExact[box][k] - expected) > 1e-9) { affineOk = false; break; }
        }
      }
    }
  }
  assertTrue(affineOk, `${slug}: breakpoints on coarse grid, affine within each interval (Claim A)`);

  // full width range never UNSATISFIABLE/UNDERDETERMINED, 3 canonical variants
  let uniqueOk = true;
  for (const idx of [0, 1, 2]) {
    const v = variantOf(spec, idx);
    for (const w of COARSE_GRID) {
      const r = solveLayout(system, spec, v, w);
      if (r.status !== 'ok') { uniqueOk = false; break; }
    }
  }
  assertTrue(uniqueOk, `${slug}: unique solution at every coarse width, 3 canonical variants`);
}

console.log(`\n${failures} failures across ${slugs.length} layouts.`);
if (failures > 0) process.exit(1);
