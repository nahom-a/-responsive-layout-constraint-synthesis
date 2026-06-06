# Cheat attempts

Never executed by the pipeline. Run with `node cheat/run_cheats.mjs` from the
task root; each attempt is built and measured against the real solver, not
just reasoned about.

| # | Attempt | Measured defeat |
|---|---|---|
| 1 | Coarse-grid-only per-cell pins (many required equalities, one per coarse cell, hoping between-cell behaviour is never checked) | Mutually contradictory required equalities make the layout `UNSATISFIABLE` immediately -- verified concretely at width 400. |
| 2 | Fitted to the three shipped variants only (nudges the sidebar floor by 1px, invisible at the sampled widths for the shipped variants) | 121/281 fine-grid points diverge from the reference. |
| 3 | Over budget but behaviourally correct | Rejected at the budget check (34 > 31) before any geometry check runs. |
| 4 | Exploit rounding at exact half-integer values | No reference geometry across all 24 layouts, every coarse width, all 3 shipped variants, ever lands on an exact half-integer coordinate -- checked by direct scan, not asserted. The exploit has no foothold in this corpus. |
| 5 | Schema-invalid payload (non-integer coefficient, invalid op) | Rejected by `validate.js` before any solve attempt. |
| 6 | Width-keyed lookup within budget (`viewport.w <= 960` as a bare required row, hoping it "gates" other constraints) | The row has no unknowns, so it is either satisfied everywhere it's checked or forces `UNSATISFIABLE` everywhere it isn't -- it cannot conditionally suppress or activate any OTHER constraint. Confirmed concretely: `UNSATISFIABLE` at width 1200, `ok` at width 800, for the exact same submitted system. This is the structural constraint argument (see `README.md`), reproduced as a live attempt rather than only argued. |

## Attack classes not applicable here

**Reward-channel / verifier-execution exploits** (poisoned artifact that
daemonizes, forged reward write, import-time side effects): not applicable.
The deliverable is pure JSON (`/app/systems.json`); the verifier never
executes, imports, or evaluates anything derived from it -- `runner.mjs`
parses it as data and feeds it through the verifier's own copy of
`solve.js`. There is no code path in the agent's control that the verifier
runs. See `docs/specification.md` and the verifier execution
isolation architecture in `README.md`.

**Reading test files / ground truth from the agent container**: not
applicable in separate-verifier mode. `tests/reference/systems.json` and
`tests/variants.mjs` (the held-out generator) exist only in the verifier
image, built from `tests/Dockerfile`, which is never reachable from the
agent's container.
