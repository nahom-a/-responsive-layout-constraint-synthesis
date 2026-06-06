// verify_direction_b.mjs — Direction B of the discrimination audit:
// does a defensible, materially different but equally-correct system fail?
// Builds an alternative formulation of every layout's reference system
// (different priority numbers preserving the same order, one required equality
// per box rewritten as a <=/>= pair, renamed/eliminated guides) and confirms
// it produces identical geometry to the reference at every fine-grid width,
// for all canonical variants. Run with `node solution/verify_direction_b.mjs`.

import fs from 'node:fs';
import { validateSystem } from '../environment/validate.js';
import { checkBudget, makeVariant, solveLayout, FINE_GRID } from './lib/corpus.mjs';
import { buildDirectionBVariant } from './lib/direction_b.mjs';

const master = JSON.parse(fs.readFileSync('./solution/reference-systems.json', 'utf8'));
let allPass = true;
for (const [slug, reference] of Object.entries(master)) {
  const spec = JSON.parse(fs.readFileSync(`./environment/layouts/${slug}/spec.json`, 'utf8'));
  const variantB = buildDirectionBVariant(reference, spec);

  const errors = validateSystem(variantB, spec);
  const budget = checkBudget(variantB, spec);
  if (errors.length || !budget.ok) {
    allPass = false;
    console.log(slug, 'DIRECTION B INVALID:', errors, budget);
    continue;
  }
  let divergences = 0;
  const variants = [0, 1, 2].map((i) => makeVariant(spec, { index: i }));
  for (const variant of variants) {
    for (const w of FINE_GRID) {
      const ra = solveLayout(reference, spec, variant, w);
      const rb = solveLayout(variantB, spec, variant, w);
      const same = ra.status === 'ok' && rb.status === 'ok' && JSON.stringify(ra.boxes) === JSON.stringify(rb.boxes);
      if (!same) divergences++;
    }
  }
  const status = divergences === 0 ? 'MATCH (scores 1)' : `DIVERGES (${divergences} points)`;
  if (divergences !== 0) allPass = false;
  console.log(slug, status, `guides ${reference.guides.length}->${variantB.guides.length}`, `constraints ${reference.constraints.length}->${variantB.constraints.length}`);
}
console.log('\nAll 24 layouts Direction B scores 1 with a structurally different formulation:', allPass);
process.exit(allPass ? 0 : 1);
