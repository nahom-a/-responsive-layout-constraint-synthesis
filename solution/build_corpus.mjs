// build_corpus.mjs — derives all 24 layouts from the parameterized
// factories in lib/factories.mjs, validates each (budget, Claim A affine-on-coarse-
// intervals, full fine-grid uniqueness for 3 canonical variants), writes
// each layout's spec.json + observed/observations.json, and writes the
// master solution/reference-systems.json used to populate
// tests/reference/systems.json and to derive /app/systems.json in solve.sh.

import fs from 'node:fs';
import path from 'node:path';
import * as F from './lib/factories.mjs';
import { computeCoarseObservations, checkAffineBetweenGridPoints, checkBudget, makeVariant, solveLayout, FINE_GRID } from './lib/corpus.mjs';

const appLayouts = fs.existsSync('/app/layouts') ? '/app/layouts' : path.resolve('./environment/layouts');
const RUNNING_FOR_REAL = appLayouts === '/app/layouts';

function assertLayout(slug, spec, system) {
  const budget = checkBudget(system, spec);
  if (!budget.ok) throw new Error(`${slug}: exceeds its own budget: ${JSON.stringify(budget)}`);
  const coarse = computeCoarseObservations(system, spec);
  if (!coarse.ok) throw new Error(`${slug}: coarse observation failed: ${JSON.stringify(coarse)}`);
  for (const idx of [0, 1, 2]) {
    const variant = makeVariant(spec, { index: idx });
    const mism = checkAffineBetweenGridPoints(system, spec, variant);
    if (mism.length) throw new Error(`${slug}: Claim A failed for variant ${idx}: ${JSON.stringify(mism.slice(0, 3))}`);
  }
  let fineBad = 0;
  const v1 = makeVariant(spec, { index: 1 });
  for (const w of FINE_GRID) {
    const r = solveLayout(system, spec, v1, w);
    if (r.status !== 'ok') fineBad++;
  }
  if (fineBad > 0) throw new Error(`${slug}: ${fineBad}/${FINE_GRID.length} fine-grid failures`);
  return { budget, coarse };
}

function writeLayout(slug, spec, system, coarse) {
  if (RUNNING_FOR_REAL) return;
  const dir = path.join(appLayouts, slug);
  fs.mkdirSync(path.join(dir, 'observed'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'spec.json'), JSON.stringify(spec, null, 2) + '\n');
  const observations = {
    coarseGrid: Array.from({ length: (1440 - 320) / 40 + 1 }, (_, i) => 320 + i * 40),
    variants: coarse.variants,
    geometry: coarse.geometry,
  };
  fs.writeFileSync(path.join(dir, 'observed', 'observations.json'), JSON.stringify(observations) + '\n');
}

const built = {}; // slug -> { spec, system, naiveOverBudget? }

// Tier 1: Simple (layout-01, 02, 04..08)
built['layout-01'] = F.dualSidebarHolyGrail({ slug: 'layout-01', leftFloor: 160, leftRatioDen: 4, rightFloor: 160, rightCeil: 240, rightRatioDen: 5 });
built['layout-02'] = F.asymmetricCardGrid({ slug: 'layout-02', cardFloor: 160, cardCeil: 360, gap: 20 });
built['layout-04'] = F.dualSidebarHolyGrail({ slug: 'layout-04', leftFloor: 200, leftRatioDen: 4, rightFloor: 140, rightCeil: 260, rightRatioDen: 4 });
built['layout-05'] = F.dualSidebarHolyGrail({ slug: 'layout-05', leftFloor: 180, leftRatioDen: 4, rightFloor: 160, rightCeil: 280, rightRatioDen: 4 });
built['layout-06'] = F.dualSidebarHolyGrail({ slug: 'layout-06', leftFloor: 240, leftRatioDen: 4, rightFloor: 120, rightCeil: 200, rightRatioDen: 4 });
built['layout-07'] = F.asymmetricCardGrid({ slug: 'layout-07', cardFloor: 140, cardCeil: 300, gap: 50 });
built['layout-08'] = F.asymmetricCardGrid({ slug: 'layout-08', cardFloor: 180, cardCeil: 340, gap: 50 });

// Tier 2: Priority-heavy (layout-09..16)
built['layout-09'] = F.multiZoneWorkspace({ slug: 'layout-09', treeFloor: 140, treeCeil: 220, treeRatioDen: 4, dockFloor: 160, dockCeil: 240, dockRatioDen: 5 });
built['layout-10'] = F.multiZoneWorkspace({ slug: 'layout-10', treeFloor: 160, treeCeil: 240, treeRatioDen: 4, dockFloor: 140, dockCeil: 260, dockRatioDen: 4 });
built['layout-11'] = F.multiZoneWorkspace({ slug: 'layout-11', treeFloor: 180, treeCeil: 260, treeRatioDen: 4, dockFloor: 120, dockCeil: 200, dockRatioDen: 4 });
built['layout-12'] = F.multiZoneWorkspace({ slug: 'layout-12', treeFloor: 120, treeCeil: 200, treeRatioDen: 4, dockFloor: 160, dockCeil: 240, dockRatioDen: 4 });
built['layout-13'] = F.centeredMasterDetail({ slug: 'layout-13', marginMin: 24, marginPref: 48, masterFloor: 180, masterRatioDen: 4, flyoutFloor: 140, flyoutCeil: 220, flyoutRatioDen: 4 });
built['layout-14'] = F.centeredMasterDetail({ slug: 'layout-14', marginMin: 32, marginPref: 64, masterFloor: 160, masterRatioDen: 4, flyoutFloor: 160, flyoutCeil: 240, flyoutRatioDen: 4 });
built['layout-15'] = F.centeredMasterDetail({ slug: 'layout-15', marginMin: 20, marginPref: 50, masterFloor: 200, masterRatioDen: 4, flyoutFloor: 120, flyoutCeil: 200, flyoutRatioDen: 4 });
built['layout-16'] = F.centeredMasterDetail({ slug: 'layout-16', marginMin: 40, marginPref: 80, masterFloor: 220, masterRatioDen: 4, flyoutFloor: 160, flyoutCeil: 280, flyoutRatioDen: 4 });

// Tier 3: Axis-coupled (layout-03, 17..24)
built['layout-03'] = F.editorialMultiDeckCoupled({ slug: 'layout-03', floorWidth: 200, ratioDen: 4 });
built['layout-17'] = F.editorialMultiDeckCoupled({ slug: 'layout-17', floorWidth: 240, ratioDen: 4 });
built['layout-18'] = F.editorialMultiDeckCoupled({ slug: 'layout-18', floorWidth: 280, ratioDen: 4 });
built['layout-19'] = F.editorialMultiDeckCoupled({ slug: 'layout-19', floorWidth: 320, ratioDen: 4 });
built['layout-20'] = F.editorialMultiDeckCoupled({ slug: 'layout-20', floorWidth: 200, ratioDen: 4, headerH: 70, deckH: 90 });
built['layout-21'] = F.portalWorkspaceNavCoupled({ slug: 'layout-21', navCount: 3, navFloor: 160, navCeil: 360, navGap: 20, sidebarFloor: 240, sidebarRatioDen: 4 });
built['layout-22'] = F.portalWorkspaceNavCoupled({ slug: 'layout-22', navCount: 4, navFloor: 125, navCeil: 205, navGap: 20, sidebarFloor: 200, sidebarRatioDen: 4 });
built['layout-23'] = F.portalWorkspaceNavCoupled({ slug: 'layout-23', navCount: 5, navFloor: 120, navCeil: 200, navGap: 20, sidebarFloor: 280, sidebarRatioDen: 4 });
built['layout-24'] = F.portalWorkspaceNavCoupled({ slug: 'layout-24', navCount: 6, navFloor: 130, navCeil: 190, navGap: 20, sidebarFloor: 200, sidebarRatioDen: 4 });

// ---- validate + write everything ----
const report = [];
const master = {};
for (const [slug, { spec, system }] of Object.entries(built)) {
  const { budget, coarse } = assertLayout(slug, spec, system);
  writeLayout(slug, spec, system, coarse);
  master[slug] = system;
  report.push({ slug, tier: spec.difficultyTier, boxes: spec.boxes.length, constraints: budget.constraints, budget: budget.budget, guides: budget.guides });
}

const masterPath = path.resolve('./solution/reference-systems.json');
fs.writeFileSync(masterPath, JSON.stringify(master, null, 2) + '\n');
console.log('\nmaster reference-systems.json written with', Object.keys(master).length, 'layouts.');

console.log('Built and validated', Object.keys(built).length, 'layouts.');
for (const r of report) console.log(' ', r.slug, r.tier, `boxes=${r.boxes}`, `constraints=${r.constraints}/${r.budget}`, `guides=${r.guides}`);

function naiveExplicitBracketOverrides(system, spec) {
  if (!spec.axisCoupled) return null;
  const brackets = [184, 160, 136, 112, 88];
  const extraMain = brackets.map((h, i) => ({ lhs: [['main_article.h', 1]], rhs: h, op: '==', priority: 280 - i * 5 }));
  const extraNav = brackets.map((h, i) => ({ lhs: [['nav_rail.h', 1]], rhs: h, op: '==', priority: 240 - i * 5 }));
  const extraDeck = brackets.map((h, i) => ({ lhs: [['action_deck.y', 1]], rhs: h, op: '==', priority: 200 - i * 5 }));
  return { guides: (system.guides || []).slice(), constraints: system.constraints.concat(extraMain, extraNav, extraDeck) };
}

console.log('\nBudget pressure (naive-explicit-overrides vs reference), all axis-coupled layouts:');
let exceedCount = 0;
for (const [slug, { spec, system }] of Object.entries(built)) {
  if (spec.difficultyTier !== 'axis-coupled') continue;
  const naive = naiveExplicitBracketOverrides(system, spec);
  if (!naive) continue;
  const exceeds = naive.constraints.length > spec.constraintBudget;
  if (exceeds) exceedCount++;
  console.log(' ', slug, 'reference', system.constraints.length, '/', spec.constraintBudget,
    'naive-explicit', naive.constraints.length, exceeds ? '(EXCEEDS)' : '(within budget)');
}
console.log(`${exceedCount} of the axis-coupled layouts' naive-explicit alternative exceeds budget.`);
