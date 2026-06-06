# Engineering Specification: Responsive Layout Constraint Synthesis

## Executive Summary & Problem Statement

Modern user interfaces require fluid, continuous responsiveness across thousands of display form factors. While traditional web architectures rely on imperative media queries or static CSS grid breakpoints, next-generation UI layout engines (such as Apple's AutoLayout / Cassowary) model interface layout as a system of prioritized linear equalities and inequalities.

**Inverse Layout Synthesis** addresses the reverse mathematical problem:
Given a set of empirical responsive geometry observations across a wide continuous viewport range ($320\text{px} \le w \le 1440\text{px}$) and dynamic content length variations, synthesize an exact, minimal, conflict-free prioritized linear constraint system that deterministically reproduces target interface geometry without conditional branching or hardcoded lookups.

---

## Technical Deliverable & Architecture

The synthesis pipeline produces a unified constraint catalog (`systems.json`) covering 24 distinct responsive layout topologies. Each layout definition consists of:
- **Guide Variables**: Free auxiliary scalars (e.g. `col_gap`, `side_margin`, `nav_w`) used to couple multi-element geometric relationships.
- **Constraints Hierarchy**: A list of linear expressions categorized into strict lexicographic priority tiers (`required` hard boundaries followed by ranked numeric soft goals).

```json
{
  "systems": {
    "layout-01": {
      "guides": ["col_gap"],
      "constraints": [
        {
          "lhs": [["masthead.x", 1]],
          "op": "==",
          "rhs": 0,
          "priority": "required"
        }
      ]
    }
  }
}
```

---

## Governing Constraints & Validation Criteria

Each synthesized constraint system must satisfy five rigorous criteria:

1. **AST Schema & Grammar Conformance**: Must strictly validate against `systems.schema.json` and comply with the syntax and resolution semantics defined in `DSL.md`.
2. **Strict Complexity Budgets**: Every layout must strictly adhere to the `constraintBudget` and `guideBudget` defined in its `spec.json`.
3. **Continuous Fine-Grid Precision**: When solved using the exact rational solver (`solve.js`), the synthesized system must produce exact integer coordinate matches against target observations across all 281 fine-grid viewport widths (320px to 1440px in 4px increments).
4. **Generalization Across Content Variants**: Layouts containing text-bearing components must resolve accurately across both canonical sampled variants and unobserved continuous held-out variants drawn from each component's `textLengthRange`.
5. **Deterministic Uniqueness**: The linear system must resolve to a unique, non-degenerate solution across all evaluated viewport dimensions, never producing `UNDERDETERMINED` or `UNSATISFIABLE` states.
