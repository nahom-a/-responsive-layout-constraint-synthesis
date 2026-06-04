#!/bin/bash
# Reference solution. Does not print a stored answer: it DERIVES every
# layout's constraint system from the layout's spec (build_corpus.mjs), with
# runtime assertions that each derived system is grammar-valid, within its
# own budget, unique (never UNDERDETERMINED/UNSATISFIABLE) across the full
# 320-1440 coarse grid for all three canonical content variants, and affine
# between coarse grid points (Claim A) -- the exact same checks
# tests/prebuild_identifiability.mjs re-proves at verifier build time. If any
# of these assertions fail, this script fails loudly rather than emitting a
# system anyway.
set -euo pipefail
cd "$(dirname "$0")/.."

node solution/build_corpus.mjs

node -e "
const fs = require('fs');
const systems = JSON.parse(fs.readFileSync('./solution/reference-systems.json', 'utf8'));
fs.writeFileSync('/app/systems.json', JSON.stringify({ systems }, null, 2));
"

echo "Wrote /app/systems.json for $(node -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync('./solution/reference-systems.json'))).length)") layouts."
