# Mathematical Identifiability & Structural Soundness Proofs

This document formalizes the mathematical guarantees governing the Inverse Responsive Layout Constraint Synthesis Engine. These properties ensure that target layouts are mathematically identifiable, structurally sound, and reproducible across continuous parameter domains.

---

## 1. Claim A: Piecewise Affine Geometry on Coarse Intervals

### Theorem
For any layout system $S$ and viewport width interval $[w_{\text{lo}}, w_{\text{hi}})$ where $w_{\text{lo}}, w_{\text{hi}} \in 40\mathbb{Z}$ and no breakpoint occurs strictly inside $(w_{\text{lo}}, w_{\text{hi}})$, the solved coordinate vector $\mathbf{x}(w)$ is strictly affine in viewport width:
$$\mathbf{x}(w) = \mathbf{A} w + \mathbf{b}, \quad \forall w \in [w_{\text{lo}}, w_{\text{hi}})$$

### Structural Guarantee
All emergent breakpoint transitions induced by competing inequalities in soft priority tiers are calibrated such that active-set boundary shifts occur strictly at integer multiples of 40px:
$$\mathcal{B} \subset \{320, 360, 400, \dots, 1440\}$$
This guarantees that empirical observations sampled at 40px intervals capture all structural transitions without hidden sub-interval non-linearities.

---

## 2. Claim B: Structural Content-Independence of Active Sets

### Theorem
For every synthesized system $S$, the binding status of all priority-tiered inequality constraints is invariant to dynamic content variations ($\text{textLength}$).

### Proof Construction
In the constraint DSL, soft (priority-tiered) constraints are permitted to reference only:
1. Box boundary coordinates ($x, y, w, h$).
2. Viewport dimensions ($\text{viewport.w}, \text{viewport.h}$).
3. Auxiliary guide scalars.

Zero optional constraints reference intrinsic content terms ($\text{intrinsicW}$ or $\text{intrinsicH}$). Consequently:
- The linear programming active-set index selection $I^*(w)$ is a pure function of viewport width $w$.
- Dynamic text wrapping impacts only the evaluated height through the deterministic contraction-mapping fixed point:
$$h_i = \text{intrinsicH}(w_i, \text{textLength})$$
- Content variations never induce active-set transitions or constraint conflicts that were not observed in the canonical training variants.

---

## 3. Claim C: Minimal Budget Feasibility

### Theorem
For every layout topology with box count $N$ and required geometric relations $R$, there exists an exact, conflict-free prioritized linear constraint system satisfying:
$$|C| \le R + N + 2$$

### Verification
Every reference system in the catalog is statically checked against this upper bound. The budget admits genuine semantic degrees of freedom (allowing alternative valid reformulations) while strictly precluding naive piecewise overrides or coordinate memorization tables.
