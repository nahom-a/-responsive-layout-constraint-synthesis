// intrinsics.js — the text-reflow model that couples the vertical axis to the
// resolved horizontal axis.
//
// Every box has an intrinsic width and an intrinsic height, supplied by the
// environment (a layout's `spec.json` plus the active content variant). For a
// box marked `textBearing: true` in `spec.json`, the intrinsic HEIGHT is not
// a fixed input — it is `textHeightForWidth(resolvedWidth, box.textLength)`,
// a pure, deterministic, monotone-non-increasing (wider column -> equal or
// shorter height) step function of the box's own RESOLVED width. This is
// what couples the axes: you cannot know a text-bearing box's height until
// its width has been resolved, and width resolution can in turn depend on
// height through guides or explicit cross-axis relations in the constraint
// system, hence the fixed-point loop in `solve()` (solve.js).
//
// For a non-text-bearing box, both intrinsicW and intrinsicH are fixed
// constants supplied directly by the content variant and never change.
//
// The step function's boundaries are placed exactly on multiples of 40 (the
// coarse-grid spacing), by design — see design specification Guarantee 1.

'use strict';

// textLength is an integer "content weight" in the range [40, 400] supplied
// by the content variant for each text-bearing box (see layouts/*/spec.json
// contentRange). Height scales step-wise with both narrower width and greater
// textLength.
function textHeightForWidth(width, textLength) {
  if (typeof textLength !== 'number') throw new Error('textHeightForWidth: textLength required');
  // baseline row height a single line occupies, and how many "lines" worth of
  // textLength fit per pixel of width at each width bracket. Brackets fall on
  // multiples of 40 so every breakpoint lands on the coarse width grid.
  const bracket =
    width < 240 ? { charsPerLine: 18 } :
    width < 360 ? { charsPerLine: 30 } :
    width < 520 ? { charsPerLine: 46 } :
    width < 720 ? { charsPerLine: 64 } :
                  { charsPerLine: 84 };
  const lines = Math.ceil(textLength / bracket.charsPerLine);
  const lineHeight = 24;
  const verticalPadding = 16;
  return lines * lineHeight + verticalPadding;
}

// Recomputes the intrinsics object for the next fixed-point iteration, given
// the box geometry the solver just produced. `spec` names which boxes are
// text-bearing and each one's fixed textLength for the active content
// variant. `intrinsics` is the previous-iteration input; only text-bearing
// boxes' heights change.
function resolveIntrinsics(spec, variant, intrinsics, resolvedBoxes) {
  const next = {};
  for (const box of spec.boxes) {
    const prev = intrinsics[box];
    if (spec.textBearing.includes(box)) {
      const width = resolvedBoxes[box].w;
      const textLength = variant.textLength[box];
      next[box] = { w: prev.w, h: textHeightForWidth(width, textLength) };
    } else {
      next[box] = { w: prev.w, h: prev.h };
    }
  }
  return next;
}

// Builds the initial intrinsics guess for a content variant: non-text boxes
// use their fixed w/h; text-bearing boxes use their fixed intrinsic width and
// a first-guess height computed from that same intrinsic width (refined by
// the fixed-point loop once real resolved widths are known).
function initialIntrinsics(spec, variant) {
  const intrinsics = {};
  for (const box of spec.boxes) {
    const w = variant.intrinsicW[box];
    if (spec.textBearing.includes(box)) {
      const textLength = variant.textLength[box];
      intrinsics[box] = { w, h: textHeightForWidth(w, textLength) };
    } else {
      intrinsics[box] = { w, h: variant.intrinsicH[box] };
    }
  }
  return intrinsics;
}

module.exports = { textHeightForWidth, resolveIntrinsics, initialIntrinsics };
