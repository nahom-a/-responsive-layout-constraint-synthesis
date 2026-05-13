# The constraint language and solver contract

This is the normative contract for `/app/solve.js`. `solve.js` is correct by
definition — if your submitted system disagrees with what it returns, your
system is wrong, not the solver.

## 1. Grammar

A system is:

```jsonc
{
  "guides": ["g1", "g2"],
  "constraints": [
    { "lhs": [["boxA.x", 1], ["boxB.w", -1]], "rhs": 24, "op": "==", "priority": "required" },
    { "lhs": [["boxB.w", 1]], "rhs": 180, "op": ">=", "priority": 850 }
  ]
}
```

- `lhs` is a non-empty list of `[term, coefficient]` pairs. `coefficient` is a
  nonzero integer.
- `rhs` is an integer constant.
- `op` is exactly one of `"=="`, `"<="`, `">="`.
- `priority` is exactly the string `"required"`, or an integer in `[1, 999]`.
- `guides` is a list of distinct identifiers, disjoint from box names and
  from `viewport`, at most 3 per layout.

A `term` is exactly one of:

- `<box>.x`, `<box>.y`, `<box>.w`, `<box>.h` — the resolved geometry of a box
  named in that layout's `spec.json`. These are the only unknowns tied to a
  box.
- `<guide>` — one of this system's declared guides. A guide is an unknown
  scalar with no geometry of its own; it exists purely so several relations
  can share a value (e.g. "every gap equals `g1`").
- `viewport.w` — the current viewport width. A read-only constant, never an
  unknown.
- `<box>.intrinsicW`, `<box>.intrinsicH` — the box's intrinsic width/height
  for the active content variant, at the current point in the fixed-point
  iteration (§4). Read-only constants, never unknowns.

**There is nothing else.** No conditionals, no ranges, no arithmetic
expressions, no functions, no nesting, no string literals, no references to
other boxes' intrinsic sizes than the box's own. This is deliberate and
closed: it removes any way to key behaviour off the viewport width except
through a linear relation whose slack or bindingness can change with width —
piecewise behaviour can only emerge from constraints trading off against each
other, never be declared. `validate.js` enforces this grammar exactly; a
system using any construct not listed above is rejected before solving.

## 2. Resolution semantics

Constraints are grouped by priority: the `"required"` tier, then every
integer priority that appears among the optional constraints, processed in
**strictly descending** numeric order (for example, a constraint at priority 850 is
resolved entirely before any constraint at priority 420 is considered).

Within the required tier, every constraint must hold exactly. If the required
constraints (as a whole) admit no point at all, the system is
**`UNSATISFIABLE`**.

Within each optional tier, the solver finds the point minimizing the tier's
**total squared violation**, subject to every constraint resolved by a
strictly higher tier being held at exactly the value that tier fixed it to
(see §3). A constraint's violation is `|lhs - rhs|` for `==`, `max(0, lhs -
rhs)` for `<=`, and `max(0, rhs - lhs)` for `>=`.

Absolute priority *values* never matter beyond the ordering they induce —
renumbering every priority in a system to any other set of values with the
same relative order produces identical geometry. Only `"required"` versus
non-required, and the relative order among non-required priorities, is
observable.

## 3. What each tier fixes for the tiers below it

After a tier is resolved, every constraint in it becomes permanent for every
lower tier:

- If the constraint's violation came out to exactly zero, it is carried
  forward unchanged, at its original relation (`==` stays `==`; `<=`/`>=`
  stay that inequality). A satisfied inequality remains a hard boundary a
  lower tier may not cross, even if crossing it would not "look like" it
  matters locally — a lower tier moving a value past a higher tier's
  satisfied inequality is exactly the case §2's ordering rule forbids.
- If the constraint's violation came out nonzero — it was in genuine,
  unavoidable conflict with a higher tier or with the required tier — the
  exact value it achieved is frozen as an equality. No lower tier may move
  that quantity in either direction; the conflict is resolved once, at the
  tier where it was decided, never renegotiated.

## 4. Axis coupling and the fixed-point iteration

A text-bearing box's intrinsic height is a function of its own resolved
width (documented in `intrinsics.js`), so height cannot be computed until
width is known — and a constraint system is free to make width depend on
height in turn (through a guide, or an explicit relation). The solver
handles this by fixed-point iteration: solve with a height guess, recompute
every text-bearing box's height from the widths just produced, and repeat
until the heights stop changing. If the same height vector recurs before
converging, the lexicographically-smallest of the visited vectors is used —
a clerical tie-break for a cycle that a well-posed system will not exhibit
(see `README.md`'s identifiability discussion).

## 5. Uniqueness

After every tier is processed, every unknown (every box's `x`/`y`/`w`/`h`,
every guide) must be pinned to an exact value by the accumulated equalities.
If any unknown remains free, the result is **`UNDERDETERMINED`** — this is a
failure condition, exactly like `UNSATISFIABLE`, even if every value your
system was checked against happened to match. A system that reproduces every
shipped observation and still leaves one width regime underdetermined is not
a passing system.

## 6. Rounding

All arithmetic is exact rational arithmetic; there is no accumulated
floating-point error anywhere in resolution. The **only** place a value is
rounded is the final conversion of each unknown's exact rational value to an
integer, and the rule is **round-half-away-from-zero**: a value exactly at
`k + 0.5` rounds to `k + 1` (and `-k - 0.5` rounds to `-k - 1`). This is a
clerical convention, not a graded one — no reference layout in this task
produces a value exactly at a half-integer, so it never decides a trial by
itself, but the rule is stated exactly so no ambiguity exists if you check.

## 6a. Content variants

A layout's `spec.json` lists which boxes are `textBearing`. For each text-bearing
box, a content variant fixes an integer `textLength` drawn from that box's
`textLengthRange`; this is the only intrinsic quantity that varies between
content variants. Every other box's intrinsic width and height (and a
text-bearing box's intrinsic *width*) are fixed constants for the layout,
given in `spec.json`, identical across all three shipped variants and any
held-out variant. This is a deliberate scoping of "content variant" to the
one axis (`textLength`) that actually drives the coupling story in §4 — it is
not a hidden restriction, since `spec.json` states every fixed value
explicitly and `textLengthRange` states the one axis that moves.

## 7. What is free (does not matter to the verifier)

The verifier compares only the resolved geometry your system produces,
**never** your system's textual structure. Every one of the following is
free:

- The order constraints appear in.
- Whether a relation you intend as an equality is written `==`, or as a
  `<=` constraint and a `>=` constraint at the same priority producing an
  observationally identical result.
- The specific integer priority values used, as long as their relative order
  matches (§2).
- Guide names, and how many guides you use (up to the per-layout budget in
  `spec.json`), as long as the resulting geometry matches.
- Which of several linear reformulations of the same relation you use.
- Whether you constrain a box coordinate that never actually affects any
  graded outcome — **except** that every coordinate must still resolve
  (never leave one `UNDERDETERMINED`, per §5, even if it looks unused).
