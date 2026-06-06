// direction_b.mjs — builds a materially different but equally-correct
// reformulation of a reference system, for the Direction B audit:
// "does a defensible correct system fail?" Every transform here exercises
// one of the free syntactic degrees of freedom described in DSL.md §7.

function clone(system) { return { guides: (system.guides || []).slice(), constraints: system.constraints.map((c) => ({ ...c, lhs: c.lhs.map((t) => t.slice()) })) }; }

// Order-preserving priority renumbering: maps the sorted distinct priorities
// [p1 < p2 < ... < pk] to [7, 19, 43, 97, ...] (an arbitrary strictly
// increasing sequence unrelated to the original spacing) so absolute values
// never coincide with the reference's, while the induced ORDER is identical.
function renumberPriorities(system) {
  const distinct = Array.from(new Set(system.constraints.map((c) => c.priority).filter((p) => p !== 'required'))).sort((a, b) => a - b);
  const remap = new Map();
  let v = 7;
  for (const p of distinct) { remap.set(p, v); v = v * 2 + 5; }
  return system.constraints.map((c) => (c.priority === 'required' ? c : { ...c, priority: remap.get(c.priority) }));
}

// Rewrites the FIRST required equality touching each box's `.h` coordinate
// as an equivalent pair of <= and >= constraints at required priority --
// observationally identical, different textual form (DSL.md §7).
function splitOneEqualityPerBoxH(constraints) {
  const seen = new Set();
  const out = [];
  for (const c of constraints) {
    if (c.priority === 'required' && c.op === '==' && !seen.has(hKey(c))) {
      const k = hKey(c);
      if (k) {
        seen.add(k);
        out.push({ lhs: c.lhs, rhs: c.rhs, op: '<=', priority: 'required' });
        out.push({ lhs: c.lhs, rhs: c.rhs, op: '>=', priority: 'required' });
        continue;
      }
    }
    out.push(c);
  }
  return out;
}
function hKey(c) {
  const t = c.lhs.find(([term]) => /\.h$/.test(term));
  return t ? t[0] : null;
}

// Renames every guide to a different but equally arbitrary identifier.
function renameGuides(system) {
  const oldGuides = system.guides || [];
  if (oldGuides.length === 0) return system;
  const map = new Map(oldGuides.map((g, i) => [g, `alt_${g}_${i}`]));
  const constraints = system.constraints.map((c) => ({
    ...c,
    lhs: c.lhs.map(([term, coeff]) => [map.has(term) ? map.get(term) : term, coeff]),
  }));
  return { guides: oldGuides.map((g) => map.get(g)), constraints };
}

// For a "shared-width guide" pattern (N boxes each constrained `box.w ==
// guideName`), eliminates the guide entirely and uses N-1 pairwise
// equalities instead (box[i].w == box[0].w) -- a materially different guide
// usage (fewer guides) producing identical geometry, since the required
// span equation already ties the sum of widths to the viewport either way.
function eliminateSharedWidthGuide(system, guideName) {
  const pinRows = system.constraints.filter((c) => c.priority === 'required' && c.op === '==' &&
    c.lhs.length === 2 && c.lhs.some(([t, co]) => t === guideName && co === -1) && c.lhs.some(([t]) => /\.w$/.test(t)));
  if (pinRows.length < 2) return null;
  const boxesInOrder = pinRows.map((c) => c.lhs.find(([t]) => /\.w$/.test(t))[0].replace(/\.w$/, ''));
  const rest = system.constraints.filter((c) => !pinRows.includes(c));
  const pairwise = boxesInOrder.slice(1).map((box) => ({
    lhs: [[`${box}.w`, 1], [`${boxesInOrder[0]}.w`, -1]], rhs: 0, op: '==', priority: 'required',
  }));
  // any optional constraint that referenced the guide directly now
  // references the first box's width instead (materially different: no
  // guide at all for this relation).
  const rewritten = rest.map((c) => ({
    ...c,
    lhs: c.lhs.map(([term, coeff]) => (term === guideName ? [`${boxesInOrder[0]}.w`, coeff] : [term, coeff])),
  }));
  const guides = (system.guides || []).filter((g) => g !== guideName);
  return { guides, constraints: rewritten.concat(pairwise) };
}

export function buildDirectionBVariant(system, spec) {
  let out = clone(system);
  out.constraints = renumberPriorities(out);
  out.constraints = splitOneEqualityPerBoxH(out.constraints);
  out = renameGuides(out);
  if ((system.guides || []).includes('cardW')) {
    const alt = eliminateSharedWidthGuide(out, out.guides.find((g) => g.startsWith('alt_cardW')));
    if (alt) out = alt;
  } else if ((system.guides || []).includes('navW')) {
    const alt = eliminateSharedWidthGuide(out, out.guides.find((g) => g.startsWith('alt_navW')));
    if (alt) out = alt;
  }
  return out;
}
