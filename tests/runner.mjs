// runner.mjs — verifier core. Validates and solves the agent's submitted
// /app/systems.json against every layout's reference system, at the fine
// grid and at 3 shipped + 12 held-out content variants, and writes a
// per-layout, per-condition JSON report. test_state.py (pytest) turns that
// report into individual test assertions and CTRF output; this file does
// all the actual computation so the pytest file can stay small and
// readable.
//
// Reads no ground truth from anywhere the agent could have touched: the
// reference systems and the held-out variant generator exist only in this
// image (tests/reference/systems.json, tests/variants.mjs), never copied
// into environment/.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));

const { solve } = require(path.join(HERE, 'solve.js'));
const { resolveIntrinsics, initialIntrinsics } = require(path.join(HERE, 'intrinsics.js'));
const { validateSystem } = require(path.join(HERE, 'validate.js'));
const { shippedVariant, heldOutVariants } = await import(pathToFileURL(path.join(HERE, 'variants.mjs')).href);

const FINE_GRID = Array.from({ length: (1440 - 320) / 4 + 1 }, (_, i) => 320 + i * 4);
const LAYOUTS_DIR = path.join(HERE, 'layouts');
// SYSTEMS_JSON_PATH exists only for local dev/testing of this file outside
// a container; test.sh never sets it, so production always reads the real
// artifact path.
const SUBMITTED_PATH = process.env.SYSTEMS_JSON_PATH || '/app/systems.json';
const REFERENCE_PATH = path.join(HERE, 'reference', 'systems.json');

function solveLayout(system, spec, variant, viewportW) {
  const fullVariant = { intrinsicW: spec.fixedIntrinsicW, intrinsicH: spec.fixedIntrinsicH, textLength: variant.textLength };
  const intrinsics = initialIntrinsics(spec, fullVariant);
  const env = { viewportW, intrinsics };
  const fullSystem = { boxes: spec.boxes, guides: system.guides || [], constraints: system.constraints };
  return solve(fullSystem, env, (intr, boxes) => resolveIntrinsics(spec, variant, intr, boxes));
}

function checkLayout(slug, spec, reference, submitted) {
  const conditions = {
    grammar: { pass: true, detail: null },
    budget: { pass: true, detail: null },
    geometry: { pass: true, detail: null },
    uniqueness: { pass: true, detail: null },
    satisfiability: { pass: true, detail: null },
  };

  const errors = validateSystem(submitted, spec);
  if (errors.length) { conditions.grammar = { pass: false, detail: errors.slice(0, 5) }; }
  if (submitted.constraints && submitted.constraints.length > spec.constraintBudget) {
    conditions.budget = { pass: false, detail: `${submitted.constraints.length} > ${spec.constraintBudget}` };
  }
  if ((submitted.guides || []).length > spec.guideBudget) {
    conditions.budget = { pass: false, detail: `${(submitted.guides || []).length} guides > ${spec.guideBudget}` };
  }
  if (!conditions.grammar.pass || !conditions.budget.pass) {
    const notChecked = { pass: false, detail: 'not checked (grammar/budget failed first)' };
    conditions.geometry = notChecked;
    conditions.uniqueness = notChecked;
    conditions.satisfiability = notChecked;
    return { slug, pass: false, conditions };
  }

  const variants = [0, 1, 2].map((i) => shippedVariant(spec, i)).concat(heldOutVariants(spec, slug));
  let mismatches = 0, underdetermined = 0, unsatisfiable = 0;
  const mismatchSamples = [];
  for (const variant of variants) {
    for (const w of FINE_GRID) {
      const rr = solveLayout(reference, spec, variant, w);
      const rs = solveLayout(submitted, spec, variant, w);
      if (rr.status !== 'ok') throw new Error(`reference itself failed at ${slug} w=${w}: ${rr.status}`);
      if (rs.status === 'UNDERDETERMINED') { underdetermined++; continue; }
      if (rs.status === 'UNSATISFIABLE') { unsatisfiable++; continue; }
      if (JSON.stringify(rr.boxes) !== JSON.stringify(rs.boxes)) {
        mismatches++;
        if (mismatchSamples.length < 3) mismatchSamples.push({ w, variant, expected: rr.boxes, actual: rs.boxes });
      }
    }
  }
  if (underdetermined > 0) conditions.uniqueness = { pass: false, detail: `${underdetermined} UNDERDETERMINED points` };
  if (unsatisfiable > 0) conditions.satisfiability = { pass: false, detail: `${unsatisfiable} UNSATISFIABLE points` };
  if (mismatches > 0) conditions.geometry = { pass: false, detail: { count: mismatches, samples: mismatchSamples } };

  const pass = Object.values(conditions).every((c) => c.pass);
  return { slug, pass, conditions };
}

function main() {
  if (!fs.existsSync(SUBMITTED_PATH)) {
    return { reward: 0, layouts: [], error: `${SUBMITTED_PATH} not found` };
  }
  let submittedAll;
  try {
    submittedAll = JSON.parse(fs.readFileSync(SUBMITTED_PATH, 'utf8'));
  } catch (e) {
    return { reward: 0, layouts: [], error: `${SUBMITTED_PATH} invalid JSON: ${e.message}` };
  }
  const referenceAll = JSON.parse(fs.readFileSync(REFERENCE_PATH, 'utf8'));
  const slugs = fs.readdirSync(LAYOUTS_DIR).filter((f) => fs.statSync(path.join(LAYOUTS_DIR, f)).isDirectory()).sort();

  const results = [];
  for (const slug of slugs) {
    const spec = JSON.parse(fs.readFileSync(path.join(LAYOUTS_DIR, slug, 'spec.json'), 'utf8'));
    const submitted = (submittedAll.systems || {})[slug];
    if (!submitted) {
      const missing = { pass: false, detail: 'missing from systems.json' };
      results.push({ slug, pass: false, conditions: { grammar: missing, budget: missing, geometry: missing, uniqueness: missing, satisfiability: missing } });
      continue;
    }
    results.push(checkLayout(slug, spec, referenceAll[slug], submitted));
  }
  const reward = results.length === slugs.length && results.every((r) => r.pass) ? 1 : 0;
  return { reward, layouts: results };
}

const report = main();
fs.writeFileSync(path.join(HERE, 'runner_report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ reward: report.reward, layoutCount: report.layouts.length }));
