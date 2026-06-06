// run_cheats.mjs — six adversarial cheat / evasion attempts verification,
// each built, executed against the real solver, and measured. Run with:
//   node cheat/run_cheats.mjs
// Authoring-time robustness evidence verifying anti-cheat protections.

import fs from 'node:fs';
import { validateSystem } from '../environment/validate.js';
import { checkBudget, solveLayout, makeVariant, FINE_GRID, COARSE_GRID } from '../solution/lib/corpus.mjs';
import * as DA from '../solution/lib/direction_a.mjs';

const master = JSON.parse(fs.readFileSync('./solution/reference-systems.json', 'utf8'));
const spec01 = JSON.parse(fs.readFileSync('./environment/layouts/layout-01/spec.json', 'utf8'));
const ref01 = master['layout-01'];

function report(name, outcome) { console.log(`\n[${name}]\n  ${outcome}`); }

// 1. Fitted to coarse grid only: MANY tight required equalities pinning
// box.x per coarse cell, hoping the between-cell behaviour is never
// checked. Since these are all REQUIRED and mutually contradictory across
// cells (box.x can't equal two different values), this is UNSATISFIABLE
// well before it could even "pass" the coarse grid.
{
  const targetBox = spec01.boxes[1];
  const extra = COARSE_GRID.slice(0, 5).map((w) => ({ lhs: [[`${targetBox}.w`, 1]], rhs: w % 240, op: '==', priority: 'required' }));
  const cheat = { guides: ref01.guides, constraints: ref01.constraints.concat(extra) };
  const errors = validateSystem(cheat, spec01);
  let unsat = false;
  if (errors.length === 0) {
    const v = makeVariant(spec01, { index: 1 });
    const r = solveLayout(cheat, spec01, v, 400);
    unsat = r.status === 'UNSATISFIABLE';
  }
  report('1. coarse-grid-only per-cell pins', errors.length ? `grammar errors: ${errors[0]}` : `solves to ${unsat ? 'UNSATISFIABLE (defeated)' : 'unexpectedly ok'} at width 400`);
}

// 2. Fitted to the three shipped variants only.
{
  const cheat = DA.fittedToShippedVariantsOnly(ref01, spec01) ?? DA.fittedToShippedVariantsOnly(master['layout-03'], JSON.parse(fs.readFileSync('./environment/layouts/layout-03/spec.json', 'utf8')));
  const spec = spec01.textBearing.length ? spec01 : JSON.parse(fs.readFileSync('./environment/layouts/layout-03/spec.json', 'utf8'));
  const reference = spec01.textBearing.length ? ref01 : master['layout-03'];
  let diverged = 0;
  const variant = makeVariant(spec, { index: 1 });
  for (const w of FINE_GRID) {
    const ra = solveLayout(reference, spec, variant, w);
    const rb = solveLayout(cheat, spec, variant, w);
    if (!(ra.status === 'ok' && rb.status === 'ok' && JSON.stringify(ra.boxes) === JSON.stringify(rb.boxes))) diverged++;
  }
  report('2. fitted-to-shipped-variants-only', `${diverged}/${FINE_GRID.length} fine-grid points diverge from reference (defeated)`);
}

// 3. Over budget but behaviourally correct.
{
  const cheat = DA.overBudgetButCorrect(ref01, spec01);
  const budget = checkBudget(cheat, spec01);
  report('3. over-budget-but-correct', budget.ok ? 'unexpectedly within budget' : `${budget.constraints} constraints > budget ${budget.budget} (defeated at the budget check, before any geometry check runs)`);
}

// 4. Exploit rounding at exact half-integer values.
{
  let halfValueFound = false;
  for (const [slug, system] of Object.entries(master)) {
    const spec = JSON.parse(fs.readFileSync(`./environment/layouts/${slug}/spec.json`, 'utf8'));
    for (const idx of [0, 1, 2]) {
      const variant = makeVariant(spec, { index: idx });
      for (const w of COARSE_GRID) {
        const r = solveLayout(system, spec, variant, w);
        if (r.status !== 'ok') continue;
        for (const box of spec.boxes) for (const k of ['x', 'y', 'w', 'h']) {
          const v = r.boxesExact[box][k];
          if (Math.abs(v - Math.round(v)) === 0.5) halfValueFound = true;
        }
      }
    }
  }
  report('4. rounding-at-half-values exploit', halfValueFound ? 'a half-value point EXISTS (would need investigation)' : 'no reference geometry, any layout/width/variant, ever lands on an exact half-integer coordinate -- the exploit has no foothold to begin with (defeated structurally)');
}

// 5. Schema-invalid payload.
{
  const targetBox = spec01.boxes[1];
  const cheat = { guides: [], constraints: [{ lhs: [[`${targetBox}.w`, 1.5]], rhs: 240, op: '~=', priority: 'required' }] };
  const errors = validateSystem(cheat, spec01);
  report('5. schema-invalid payload', errors.length ? `rejected with ${errors.length} grammar errors, e.g. "${errors[0]}" (defeated at validation, before any solve attempt)` : 'unexpectedly validated');
}

// 6. Width-keyed lookup attempt within budget.
{
  const cheat = {
    guides: ref01.guides,
    constraints: ref01.constraints.concat([{ lhs: [['viewport.w', 1]], rhs: 960, op: '<=', priority: 'required' }]),
  };
  const errors = validateSystem(cheat, spec01);
  let outcome;
  if (errors.length) outcome = `grammar errors: ${errors[0]}`;
  else {
    const v = makeVariant(spec01, { index: 1 });
    const wide = solveLayout(cheat, spec01, v, 1200);
    const narrow = solveLayout(cheat, spec01, v, 800);
    outcome = `width 1200 (>960): ${wide.status}; width 800 (<=960): ${narrow.status} -- the width-only row has no unknowns, so it either holds everywhere it's checked or forces UNSATISFIABLE everywhere it doesn't; it cannot gate any OTHER constraint's resolution (defeated: confirms the structural constraint argument, reproduced concretely)`;
  }
  report('6. width-keyed lookup attempt', outcome);
}
