# Adversarial Security & Attack Invariance Analysis

This document details the security and anti-cheat verification matrix designed into the Layout Constraint Synthesis Engine. The framework verifies that the solver and synthesis pipeline cannot be bypassed or satisfied through superficial heuristics, overfitting, or malformed payloads.

---

## 1. Adversarial Evasion Vectors (`cheat/run_cheats.mjs`)

| Attack Vector | Adversarial Strategy | Defense & Defeat Mechanism |
|:---|:---|:---|
| **1. Coarse-Grid Over-Constraining** | Submitting conflicting equality constraints pinned only to coarse sample points, hoping intermediate intervals are unchecked. | The solver's required-tier Gaussian elimination identifies mutually inconsistent equalities, immediately resolving to `UNSATISFIABLE`. |
| **2. Sample Overfitting** | Fitting soft constraints to the 3 canonical variants while ignoring underlying geometric continuity. | Continuous fine-grid evaluation (281 test widths) detects divergence across 121 / 281 points. |
| **3. Budget Inflation** | Supplying an over-complete set of redundant constraints to bypass priority conflict resolution. | Static budget validation rejects the candidate AST before any solver cycle is executed ($34 > 31$). |
| **4. Half-Integer Rounding Exploits** | Exploiting floating-point boundary rounding at half-integer coordinates. | Defeated structurally: all coordinates in the continuous domain are proven to remain strictly integral; no fractional boundaries exist. |
| **5. Schema & Payload Mutation** | Injecting malformed AST nodes (non-integer rational coefficients, unsupported relational operators). | Syntactic AST schema validation rejects the payload with descriptive syntax errors prior to compilation. |
| **6. Width-Keyed Conditional Lookups** | Attempting to simulate media queries via unconstrained variable rows (e.g. `viewport.w <= 960`). | Without free unknowns, the row evaluates statically to true or false. If false, it triggers `UNSATISFIABLE` globally across all widths outside the interval. |

---

## 2. Mutation & Counter-Strategy Discrimination (`solution/verify_direction_a.mjs`)

Eight distinct incorrect layout synthesis heuristics were implemented to confirm that the test harness exhibits zero false-positive tolerance:

1. **Per-Axis Decoupling**: Ignoring 2D aspect-ratio coupling and resolving horizontal and vertical axes independently. *(Defeated: 9/9 applicable layouts fail)*.
2. **Priority Hierarchy Inversion**: Swapping priority tiers among conflicting soft inequality bounds. *(Defeated: 24/24 layouts fail)*.
3. **Breakpoint Shifting (6px offset)**: Introducing sub-grid offset errors to test interval sensitivity. *(Defeated: 24/24 layouts fail)*.
4. **Under-Determined Omission**: Dropping required geometric constraints to evaluate nullspace tolerance. *(Defeated: 24/24 layouts fail as `UNDERDETERMINED`)*.
5. **Inequality Collapse**: Converting soft inequalities into rigid equalities. *(Defeated: 24/24 layouts fail as `UNSATISFIABLE`)*.
6. **Variant-Specific Fitting**: Tuning coefficients exclusively to training variants. *(Defeated: 9/9 text-coupled layouts fail)*.
7. **Budget Violations**: Correct geometry synthesized with excessive constraint rows. *(Defeated: 24/24 layouts fail static check)*.
8. **Hybrid Strategy Failure**: Correct simple and priority tiers combined with decoupled axis assumptions. *(Defeated: 100% all-or-nothing rejection)*.
