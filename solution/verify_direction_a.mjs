// verify_direction_a.mjs — Direction A of the discrimination audit, at full
// scale: all 8 wrong-reading strategies against all 24
// layouts. Every strategy must fail on every layout it applies to; if any
// passes, the corpus is under-constraining and must be fixed.
// Run with `node solution/verify_direction_a.mjs`.

import fs from 'node:fs';
import * as DA from './lib/direction_a.mjs';
import { checkBudget } from './lib/corpus.mjs';

const master = JSON.parse(fs.readFileSync('./solution/reference-systems.json', 'utf8'));
const specs = {};
for (const slug of Object.keys(master)) specs[slug] = JSON.parse(fs.readFileSync(`./environment/layouts/${slug}/spec.json`, 'utf8'));

const strategies = [
  ['1 per-axis decomposition', (sys, spec) => DA.perAxisDecomposition(sys, spec, 88)],
  ['2 wrong priority order', (sys, spec) => DA.wrongPriorityOrder(sys, spec)],
  ['3 breakpoint offset 6px', (sys, spec) => DA.breakpointOffset(sys, 6)],
  ['4 underdetermined', (sys, spec) => DA.underdetermined(sys)],
  ['5 inequalities as equalities', (sys, spec) => DA.allInequalitiesAsEqualities(sys)],
  ['6 fitted-to-shipped-only', (sys, spec) => DA.fittedToShippedVariantsOnly(sys, spec)],
  ['7 over budget correct', (sys, spec) => DA.overBudgetButCorrect(sys, spec)],
];

const tally = {}; // strategy -> { applicable, failed }
for (const [name] of strategies) tally[name] = { applicable: 0, failed: 0, passed: [] };

let anyPassed = false;
for (const [slug, reference] of Object.entries(master)) {
  const spec = specs[slug];
  for (const [name, fn] of strategies) {
    const wrong = fn(reference, spec);
    if (wrong === null) continue;
    tally[name].applicable++;
    const result = DA.scoreWrongSystem(wrong, spec);
    if (result.failed) { tally[name].failed++; continue; }
    const cmp = DA.compareToReference(wrong, reference, spec);
    if (cmp.fineDivergences > 0) { tally[name].failed++; continue; }
    tally[name].passed.push(slug);
    anyPassed = true;
  }
}

console.log('Direction A, full 24-layout scale:');
for (const [name, t] of Object.entries(tally)) {
  console.log(`  ${name}: ${t.failed}/${t.applicable} failed`, t.passed.length ? `-- PASSED ON: ${t.passed.join(', ')}` : '');
}

// strategy 8: correct-simple, per-axis-wrong-coupled, corpus-wide
console.log('\nStrategy 8 (correct simple/priority tiers, per-axis-wrong on every axis-coupled layout):');
let strategy8AnyOk = false;
for (const [slug, reference] of Object.entries(master)) {
  const spec = specs[slug];
  if (!spec.axisCoupled) continue;
  const wrong = DA.perAxisDecomposition(reference, spec, 88);
  const result = DA.scoreWrongSystem(wrong, spec);
  const cmp = result.failed ? null : DA.compareToReference(wrong, reference, spec);
  const ok = !result.failed && cmp.fineDivergences === 0;
  if (ok) strategy8AnyOk = true;
  console.log(' ', slug, ok ? 'PASSES (bad!)' : 'fails');
}
console.log('All-or-nothing corpus reward under strategy 8:', strategy8AnyOk ? 'would be 1 on the coupled layouts (BAD)' : '0 (every axis-coupled layout kills it)');

console.log('\nAny strategy passed anywhere:', anyPassed || strategy8AnyOk);
process.exit((anyPassed || strategy8AnyOk) ? 1 : 0);
