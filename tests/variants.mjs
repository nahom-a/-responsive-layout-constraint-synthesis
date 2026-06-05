// variants.mjs — verifier-only, seeded held-out content-variant generator.
// Exists only in the verifier image; never ships to the agent. Produces 12
// deterministic variants per layout from a fixed seed, disjoint from the
// three shipped canonical variants (index 0/1/2), for every layout's stated
// textLengthRange.

function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Shipped canonical variant (index 0=min, 1=mid, 2=max), duplicated here so
// held-out generation can guarantee disjointness from it.
export function shippedVariant(spec, index) {
  const textLength = {};
  for (const box of spec.textBearing) {
    const [lo, hi] = spec.textLengthRange[box];
    textLength[box] = index === 0 ? lo : index === 1 ? Math.round((lo + hi) / 2) : hi;
  }
  return { textLength };
}

// 12 held-out variants per layout, seeded on the layout slug so the set is
// reproducible without any stored state. At least 4 land in an
// active-constraint regime shared with a shipped variant (fairness -- see
// README's Claim B discussion: since no optional constraint in this
// corpus's reference systems references any intrinsic term, EVERY variant,
// shipped or held-out, shares the same width-only-driven regime as every
// other -- the 4/12 split is therefore not a special case here, it holds
// for all 12).
export function heldOutVariants(spec, slug) {
  let seed = 0;
  for (let i = 0; i < slug.length; i++) seed = (seed * 31 + slug.charCodeAt(i)) >>> 0;
  const rng = makeRng(seed ^ 0x5eed5eed);
  const shipped = [0, 1, 2].map((i) => shippedVariant(spec, i));
  const variants = [];
  for (let i = 0; i < 12; i++) {
    const textLength = {};
    for (const box of spec.textBearing) {
      const [lo, hi] = spec.textLengthRange[box];
      let v;
      do { v = lo + Math.floor(rng() * (hi - lo + 1)); }
      while (shipped.some((s) => s.textLength[box] === v) || variants.some((prev) => prev.textLength[box] === v));
      textLength[box] = v;
    }
    variants.push({ textLength });
  }
  return variants;
}
