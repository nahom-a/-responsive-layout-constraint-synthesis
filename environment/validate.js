// validate.js — enforces the grammar in DSL.md exactly, plus the per-layout
// constraint budget from spec.json. Used both by the agent (to check a draft
// system before running it) and by the verifier (as the first graded check).

'use strict';

const OPS = new Set(['==', '<=', '>=']);
const TERM_SUFFIXES = ['x', 'y', 'w', 'h'];

function validateSystem(system, spec) {
  const errors = [];
  const boxes = new Set(spec.boxes);

  if (typeof system !== 'object' || system === null) {
    return ['system must be an object'];
  }
  const guides = system.guides;
  if (!Array.isArray(guides)) errors.push('guides must be an array');
  else {
    if (guides.length > spec.guideBudget) errors.push(`guides: at most ${spec.guideBudget} allowed, got ${guides.length}`);
    const seen = new Set();
    for (const g of guides) {
      if (typeof g !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(g)) errors.push(`guide name invalid: ${JSON.stringify(g)}`);
      if (boxes.has(g) || g === 'viewport') errors.push(`guide name collides with a box or 'viewport': ${g}`);
      if (seen.has(g)) errors.push(`duplicate guide name: ${g}`);
      seen.add(g);
    }
  }
  const guideSet = new Set(Array.isArray(guides) ? guides : []);

  function validTerm(term) {
    if (term === 'viewport.w') return true;
    if (guideSet.has(term)) return true;
    const m = /^([a-zA-Z_][a-zA-Z0-9_]*)\.(x|y|w|h|intrinsicW|intrinsicH)$/.exec(term);
    if (!m) return false;
    return boxes.has(m[1]);
  }

  const constraints = system.constraints;
  if (!Array.isArray(constraints) || constraints.length === 0) {
    errors.push('constraints must be a non-empty array');
    return errors;
  }
  if (constraints.length > spec.constraintBudget) {
    errors.push(`constraints: budget is ${spec.constraintBudget} for this layout, got ${constraints.length}`);
  }

  for (let i = 0; i < constraints.length; i++) {
    const c = constraints[i];
    const where = `constraints[${i}]`;
    if (typeof c !== 'object' || c === null) { errors.push(`${where}: must be an object`); continue; }
    if (!Array.isArray(c.lhs) || c.lhs.length === 0) {
      errors.push(`${where}.lhs: must be a non-empty array`);
    } else {
      for (let j = 0; j < c.lhs.length; j++) {
        const term = c.lhs[j];
        if (!Array.isArray(term) || term.length !== 2) { errors.push(`${where}.lhs[${j}]: must be [term, coefficient]`); continue; }
        const [name, coeff] = term;
        if (typeof name !== 'string' || !validTerm(name)) errors.push(`${where}.lhs[${j}]: unknown term '${name}'`);
        if (!Number.isInteger(coeff) || coeff === 0) errors.push(`${where}.lhs[${j}]: coefficient must be a nonzero integer`);
      }
    }
    if (!Number.isInteger(c.rhs)) errors.push(`${where}.rhs: must be an integer`);
    if (!OPS.has(c.op)) errors.push(`${where}.op: must be one of ==, <=, >=`);
    if (c.priority !== 'required' && !(Number.isInteger(c.priority) && c.priority >= 1 && c.priority <= 999)) {
      errors.push(`${where}.priority: must be "required" or an integer in [1, 999]`);
    }
  }
  return errors;
}

module.exports = { validateSystem };
