// factories.mjs — parameterized constructors for the 24-layout corpus.
// Each factory returns { spec, system, naiveOverBudget } where `spec` is the
// spec.json content, `system` is the derived reference constraint system,
// and `naiveOverBudget` is a demonstrably-over-budget alternative used for
// budget-pressure evidence.
//
// Every factory computes its own breakpoint constants so they land exactly
// on the 40px coarse grid (Guarantee 1) -- this is checked by
// tests/prebuild_identifiability.mjs at build time, not just asserted here.

function req(lhs, rhs, op = '==') { return { lhs, rhs, op, priority: 'required' }; }
function opt(lhs, rhs, op, priority) { return { lhs, rhs, op, priority }; }

// ---------------------------------------------------------------------------
// Factory 1: dualSidebarHolyGrail. Masthead + nav_rail + stage + inspector + footer_bar.
// Asymmetric multi-priority cascade on two independent sidebars:
// nav_rail has floor and proportional ratio (2 breakpoints).
// inspector has floor, ceiling, and proportional ratio (2 breakpoints).
// Stage absorbs residual width with 4 distinct slopes across the viewport range.
// ---------------------------------------------------------------------------
export function dualSidebarHolyGrail({
  slug,
  leftFloor, leftRatioDen,
  rightFloor, rightCeil, rightRatioDen,
  headerH = 60, footerH = 40, stageH = 300,
}) {
  const bpLeft = leftFloor * leftRatioDen;
  const bpRightLo = rightFloor * rightRatioDen;
  const bpRightHi = rightCeil * rightRatioDen;
  if (bpLeft % 40 !== 0) throw new Error(`${slug}: bpLeft ${bpLeft} off grid`);
  if (bpRightLo % 40 !== 0) throw new Error(`${slug}: bpRightLo ${bpRightLo} off grid`);
  if (bpRightHi % 40 !== 0) throw new Error(`${slug}: bpRightHi ${bpRightHi} off grid`);

  const boxes = ['masthead', 'nav_rail', 'stage', 'inspector', 'footer_bar'];
  const guides = ['col_gap'];
  const constraints = [
    req([['masthead.x', 1]], 0),
    req([['masthead.y', 1]], 0),
    req([['masthead.w', 1], ['viewport.w', -1]], 0),
    req([['masthead.h', 1], ['masthead.intrinsicH', -1]], 0),

    req([['nav_rail.y', 1], ['masthead.h', -1]], 0),
    req([['stage.y', 1], ['masthead.h', -1]], 0),
    req([['inspector.y', 1], ['masthead.h', -1]], 0),

    req([['stage.h', 1], ['stage.intrinsicH', -1]], 0),
    req([['nav_rail.h', 1], ['stage.h', -1]], 0),
    req([['inspector.h', 1], ['stage.h', -1]], 0),

    req([['nav_rail.x', 1]], 0),
    req([['stage.x', 1], ['nav_rail.w', -1], ['col_gap', -1]], 0),
    req([['inspector.x', 1], ['stage.x', -1], ['stage.w', -1], ['col_gap', -1]], 0),
    req([['inspector.x', 1], ['inspector.w', 1], ['viewport.w', -1]], 0),

    req([['footer_bar.x', 1]], 0),
    req([['footer_bar.y', 1], ['stage.y', -1], ['stage.h', -1]], 0),
    req([['footer_bar.w', 1], ['viewport.w', -1]], 0),
    req([['footer_bar.h', 1], ['footer_bar.intrinsicH', -1]], 0),

    opt([['nav_rail.w', 1]], leftFloor, '>=', 750),
    opt([['nav_rail.w', leftRatioDen], ['viewport.w', -1]], 0, '==', 400),

    opt([['inspector.w', 1]], rightFloor, '>=', 850),
    opt([['inspector.w', 1]], rightCeil, '<=', 650),
    opt([['inspector.w', rightRatioDen], ['viewport.w', -1]], 0, '==', 500),

    opt([['col_gap', 1]], 20, '==', 300),
  ];

  const fixedIntrinsicW = { masthead: 0, nav_rail: 0, stage: 0, inspector: 0, footer_bar: 0 };
  const fixedIntrinsicH = { masthead: headerH, nav_rail: stageH, stage: stageH, inspector: stageH, footer_bar: footerH };
  const referenceConstraintCount = constraints.length;
  const constraintBudget = referenceConstraintCount + boxes.length + 2;

  const spec = {
    boxes, textBearing: [], fixedIntrinsicW, fixedIntrinsicH, textLengthRange: {},
    constraintBudget, referenceConstraintCount, guideBudget: 1,
    difficultyTier: 'simple', axisCoupled: false,
  };
  return { spec, system: { guides, constraints } };
}

// ---------------------------------------------------------------------------
// Factory 2: asymmetricCardGrid. Banner + hero_card (row 1) + 3 tiles (row 2)
// + dock (row 3). Row 2 tiles share width guide cardW and gapGuide across
// floor/ceiling/preferred-gap priority chain; hero_card spans full width.
// ---------------------------------------------------------------------------
export function asymmetricCardGrid({
  slug,
  cardFloor, cardCeil, gap,
  bannerH = 50, heroH = 180, tileH = 140, dockH = 40,
}) {
  const bpLo = 3 * cardFloor + 2 * gap;
  const bpHi = 3 * cardCeil + 2 * gap;
  if (bpLo % 40 !== 0) throw new Error(`${slug}: bpLo ${bpLo} off grid`);
  if (bpHi % 40 !== 0) throw new Error(`${slug}: bpHi ${bpHi} off grid`);

  const boxes = ['banner', 'hero_card', 'tile_1', 'tile_2', 'tile_3', 'dock'];
  const guides = ['cardW', 'gapGuide'];
  const constraints = [
    req([['banner.x', 1]], 0),
    req([['banner.y', 1]], 0),
    req([['banner.w', 1], ['viewport.w', -1]], 0),
    req([['banner.h', 1], ['banner.intrinsicH', -1]], 0),

    req([['hero_card.x', 1]], 0),
    req([['hero_card.y', 1], ['banner.h', -1]], 0),
    req([['hero_card.w', 1], ['viewport.w', -1]], 0),
    req([['hero_card.h', 1], ['hero_card.intrinsicH', -1]], 0),

    req([['tile_1.x', 1]], 0),
    req([['tile_1.y', 1], ['hero_card.y', -1], ['hero_card.h', -1], ['gapGuide', -1]], 0),
    req([['tile_1.h', 1], ['tile_1.intrinsicH', -1]], 0),
    req([['tile_1.w', 1], ['cardW', -1]], 0),

    req([['tile_2.x', 1], ['tile_1.x', -1], ['tile_1.w', -1], ['gapGuide', -1]], 0),
    req([['tile_2.y', 1], ['tile_1.y', -1]], 0),
    req([['tile_2.h', 1], ['tile_2.intrinsicH', -1]], 0),
    req([['tile_2.w', 1], ['cardW', -1]], 0),

    req([['tile_3.x', 1], ['tile_2.x', -1], ['tile_2.w', -1], ['gapGuide', -1]], 0),
    req([['tile_3.y', 1], ['tile_1.y', -1]], 0),
    req([['tile_3.h', 1], ['tile_3.intrinsicH', -1]], 0),
    req([['tile_3.w', 1], ['cardW', -1]], 0),

    req([['tile_3.x', 1], ['tile_3.w', 1], ['viewport.w', -1]], 0),

    req([['dock.x', 1]], 0),
    req([['dock.y', 1], ['tile_1.y', -1], ['tile_1.h', -1], ['gapGuide', -1]], 0),
    req([['dock.w', 1], ['viewport.w', -1]], 0),
    req([['dock.h', 1], ['dock.intrinsicH', -1]], 0),

    opt([['cardW', 1]], cardFloor, '>=', 900),
    opt([['cardW', 1]], cardCeil, '<=', 600),
    opt([['gapGuide', 1]], gap, '==', 300),
  ];

  const fixedIntrinsicW = { banner: 0, hero_card: 0, tile_1: 0, tile_2: 0, tile_3: 0, dock: 0 };
  const fixedIntrinsicH = { banner: bannerH, hero_card: heroH, tile_1: tileH, tile_2: tileH, tile_3: tileH, dock: dockH };
  const referenceConstraintCount = constraints.length;
  const constraintBudget = referenceConstraintCount + boxes.length + 2;

  const spec = {
    boxes, textBearing: [], fixedIntrinsicW, fixedIntrinsicH, textLengthRange: {},
    constraintBudget, referenceConstraintCount, guideBudget: 2,
    difficultyTier: 'simple', axisCoupled: false,
  };
  return { spec, system: { guides, constraints } };
}

// ---------------------------------------------------------------------------
// Factory 3: multiZoneWorkspace. 7 boxes: top_menubar, activity_strip,
// tree_sidebar, code_editor, tool_dock, console_panel, status_bar.
// Multi-panel IDE with 4 distinct breakpoints: both tree_sidebar and tool_dock
// have independent floor, ceiling, and ratio priorities, while code_editor
// absorbs the variable remainder.
// ---------------------------------------------------------------------------
export function multiZoneWorkspace({
  slug,
  treeFloor, treeCeil, treeRatioDen,
  dockFloor, dockCeil, dockRatioDen,
  menubarH = 45, statusH = 35, consoleH = 120, editorH = 320,
}) {
  const bpTreeLo = treeFloor * treeRatioDen;
  const bpTreeHi = treeCeil * treeRatioDen;
  const bpDockLo = dockFloor * dockRatioDen;
  const bpDockHi = dockCeil * dockRatioDen;
  if (bpTreeLo % 40 !== 0) throw new Error(`${slug}: bpTreeLo ${bpTreeLo} off grid`);
  if (bpTreeHi % 40 !== 0) throw new Error(`${slug}: bpTreeHi ${bpTreeHi} off grid`);
  if (bpDockLo % 40 !== 0) throw new Error(`${slug}: bpDockLo ${bpDockLo} off grid`);
  if (bpDockHi % 40 !== 0) throw new Error(`${slug}: bpDockHi ${bpDockHi} off grid`);

  const boxes = ['top_menubar', 'activity_strip', 'tree_sidebar', 'code_editor', 'tool_dock', 'console_panel', 'status_bar'];
  const guides = ['gutter'];
  const constraints = [
    req([['top_menubar.x', 1]], 0),
    req([['top_menubar.y', 1]], 0),
    req([['top_menubar.w', 1], ['viewport.w', -1]], 0),
    req([['top_menubar.h', 1], ['top_menubar.intrinsicH', -1]], 0),

    req([['activity_strip.x', 1]], 0),
    req([['activity_strip.y', 1], ['top_menubar.h', -1]], 0),
    req([['activity_strip.w', 1]], 48),
    req([['activity_strip.h', 1], ['code_editor.h', -1]], 0),

    req([['tree_sidebar.x', 1], ['activity_strip.w', -1]], 0),
    req([['tree_sidebar.y', 1], ['top_menubar.h', -1]], 0),
    req([['tree_sidebar.h', 1], ['code_editor.h', -1]], 0),

    req([['code_editor.x', 1], ['tree_sidebar.x', -1], ['tree_sidebar.w', -1], ['gutter', -1]], 0),
    req([['code_editor.y', 1], ['top_menubar.h', -1]], 0),
    req([['code_editor.h', 1], ['code_editor.intrinsicH', -1]], 0),

    req([['tool_dock.x', 1], ['code_editor.x', -1], ['code_editor.w', -1], ['gutter', -1]], 0),
    req([['tool_dock.y', 1], ['top_menubar.h', -1]], 0),
    req([['tool_dock.h', 1], ['code_editor.h', -1]], 0),
    req([['tool_dock.x', 1], ['tool_dock.w', 1], ['viewport.w', -1]], 0),

    req([['console_panel.x', 1]], 0),
    req([['console_panel.y', 1], ['code_editor.y', -1], ['code_editor.h', -1]], 0),
    req([['console_panel.w', 1], ['viewport.w', -1]], 0),
    req([['console_panel.h', 1], ['console_panel.intrinsicH', -1]], 0),

    req([['status_bar.x', 1]], 0),
    req([['status_bar.y', 1], ['console_panel.y', -1], ['console_panel.h', -1]], 0),
    req([['status_bar.w', 1], ['viewport.w', -1]], 0),
    req([['status_bar.h', 1], ['status_bar.intrinsicH', -1]], 0),

    opt([['tree_sidebar.w', 1]], treeFloor, '>=', 850),
    opt([['tree_sidebar.w', 1]], treeCeil, '<=', 650),
    opt([['tree_sidebar.w', treeRatioDen], ['viewport.w', -1]], 0, '==', 450),

    opt([['tool_dock.w', 1]], dockFloor, '>=', 800),
    opt([['tool_dock.w', 1]], dockCeil, '<=', 600),
    opt([['tool_dock.w', dockRatioDen], ['viewport.w', -1]], 0, '==', 400),

    opt([['gutter', 1]], 16, '==', 300),
  ];

  const fixedIntrinsicW = { top_menubar: 0, activity_strip: 48, tree_sidebar: 0, code_editor: 0, tool_dock: 0, console_panel: 0, status_bar: 0 };
  const fixedIntrinsicH = { top_menubar: menubarH, activity_strip: editorH, tree_sidebar: editorH, code_editor: editorH, tool_dock: editorH, console_panel: consoleH, status_bar: statusH };
  const referenceConstraintCount = constraints.length;
  const constraintBudget = referenceConstraintCount + boxes.length + 2;

  const spec = {
    boxes, textBearing: [], fixedIntrinsicW, fixedIntrinsicH, textLengthRange: {},
    constraintBudget, referenceConstraintCount, guideBudget: 1,
    difficultyTier: 'priority-heavy', axisCoupled: false,
  };
  return { spec, system: { guides, constraints } };
}

// ---------------------------------------------------------------------------
// Factory 4: centeredMasterDetail. Header + master_list + detail_pane +
// flyout_dock + footer. Outer symmetric dynamic margins (sideMargin) center
// the 3 inner panes. 5 priority levels, 3 distinct breakpoints.
// ---------------------------------------------------------------------------
export function centeredMasterDetail({
  slug,
  marginMin, marginPref,
  masterFloor, masterRatioDen,
  flyoutFloor, flyoutCeil, flyoutRatioDen,
  headerH = 55, footerH = 45, contentH = 280,
}) {
  const bpMaster = masterFloor * masterRatioDen;
  const bpFlyoutLo = flyoutFloor * flyoutRatioDen;
  const bpFlyoutHi = flyoutCeil * flyoutRatioDen;
  if (bpMaster % 40 !== 0) throw new Error(`${slug}: bpMaster ${bpMaster} off grid`);
  if (bpFlyoutLo % 40 !== 0) throw new Error(`${slug}: bpFlyoutLo ${bpFlyoutLo} off grid`);
  if (bpFlyoutHi % 40 !== 0) throw new Error(`${slug}: bpFlyoutHi ${bpFlyoutHi} off grid`);

  const boxes = ['header_deck', 'master_pane', 'detail_pane', 'flyout_dock', 'footer_deck'];
  const guides = ['sideMargin', 'paneGap'];
  const constraints = [
    req([['header_deck.x', 1]], 0),
    req([['header_deck.y', 1]], 0),
    req([['header_deck.w', 1], ['viewport.w', -1]], 0),
    req([['header_deck.h', 1], ['header_deck.intrinsicH', -1]], 0),

    req([['master_pane.y', 1], ['header_deck.h', -1]], 0),
    req([['detail_pane.y', 1], ['header_deck.h', -1]], 0),
    req([['flyout_dock.y', 1], ['header_deck.h', -1]], 0),

    req([['detail_pane.h', 1], ['detail_pane.intrinsicH', -1]], 0),
    req([['master_pane.h', 1], ['detail_pane.h', -1]], 0),
    req([['flyout_dock.h', 1], ['detail_pane.h', -1]], 0),

    req([['master_pane.x', 1], ['sideMargin', -1]], 0),
    req([['detail_pane.x', 1], ['master_pane.x', -1], ['master_pane.w', -1], ['paneGap', -1]], 0),
    req([['flyout_dock.x', 1], ['detail_pane.x', -1], ['detail_pane.w', -1], ['paneGap', -1]], 0),
    req([['flyout_dock.x', 1], ['flyout_dock.w', 1], ['sideMargin', 1], ['viewport.w', -1]], 0),

    req([['footer_deck.x', 1]], 0),
    req([['footer_deck.y', 1], ['detail_pane.y', -1], ['detail_pane.h', -1]], 0),
    req([['footer_deck.w', 1], ['viewport.w', -1]], 0),
    req([['footer_deck.h', 1], ['footer_deck.intrinsicH', -1]], 0),

    // Side margin priorities: floor 900, preferred 300
    opt([['sideMargin', 1]], marginMin, '>=', 900),
    opt([['sideMargin', 1]], marginPref, '==', 300),

    // Master pane priorities: floor 750, ratio 450
    opt([['master_pane.w', 1]], masterFloor, '>=', 750),
    opt([['master_pane.w', masterRatioDen], ['viewport.w', -1]], 0, '==', 450),

    // Flyout dock priorities: floor 750, ceil 600, ratio 450
    opt([['flyout_dock.w', 1]], flyoutFloor, '>=', 750),
    opt([['flyout_dock.w', 1]], flyoutCeil, '<=', 600),
    opt([['flyout_dock.w', flyoutRatioDen], ['viewport.w', -1]], 0, '==', 450),

    // Preferred paneGap
    opt([['paneGap', 1]], 20, '==', 300),
  ];

  const fixedIntrinsicW = { header_deck: 0, master_pane: 0, detail_pane: 0, flyout_dock: 0, footer_deck: 0 };
  const fixedIntrinsicH = { header_deck: headerH, master_pane: contentH, detail_pane: contentH, flyout_dock: contentH, footer_deck: footerH };
  const referenceConstraintCount = constraints.length;
  const constraintBudget = referenceConstraintCount + boxes.length + 2;

  const spec = {
    boxes, textBearing: [], fixedIntrinsicW, fixedIntrinsicH, textLengthRange: {},
    constraintBudget, referenceConstraintCount, guideBudget: 2,
    difficultyTier: 'priority-heavy', axisCoupled: false,
  };
  return { spec, system: { guides, constraints } };
}

// ---------------------------------------------------------------------------
// Factory 5: editorialMultiDeckCoupled. 6 boxes: masthead_banner, nav_rail,
// main_article (text-bearing), hero_aside, action_deck, colophon_footer.
// Axis coupling: main_article's resolved width couples to its height through
// intrinsics.js, which shifts nav_rail.h, hero_aside.y, action_deck.y, and
// colophon_footer.y dynamically across width brackets.
// ---------------------------------------------------------------------------
export function editorialMultiDeckCoupled({
  slug, floorWidth, ratioDen = 4,
  headerH = 65, deckH = 80, footerH = 40,
  textLengthRangeMain = [50, 380],
}) {
  if (floorWidth * ratioDen % 40 !== 0) throw new Error(`${slug}: bp off grid`);

  const boxes = ['masthead_banner', 'nav_rail', 'main_article', 'hero_aside', 'action_deck', 'colophon_footer'];
  const guides = ['deck_gap'];
  const constraints = [
    req([['masthead_banner.x', 1]], 0),
    req([['masthead_banner.y', 1]], 0),
    req([['masthead_banner.w', 1], ['viewport.w', -1]], 0),
    req([['masthead_banner.h', 1], ['masthead_banner.intrinsicH', -1]], 0),

    req([['nav_rail.x', 1]], 0),
    req([['nav_rail.y', 1], ['masthead_banner.h', -1]], 0),
    req([['main_article.x', 1], ['nav_rail.w', -1]], 0),
    req([['main_article.y', 1], ['masthead_banner.h', -1]], 0),
    req([['main_article.w', 1], ['nav_rail.w', 1], ['viewport.w', -1]], 0),

    req([['main_article.h', 1], ['main_article.intrinsicH', -1]], 0),
    req([['nav_rail.h', 1], ['main_article.h', -1]], 0),

    req([['hero_aside.x', 1]], 0),
    req([['hero_aside.y', 1], ['main_article.y', -1], ['main_article.h', -1]], 0),
    req([['hero_aside.w', 1], ['viewport.w', -1]], 0),
    req([['hero_aside.h', 1], ['hero_aside.intrinsicH', -1]], 0),

    req([['action_deck.x', 1]], 0),
    req([['action_deck.y', 1], ['hero_aside.y', -1], ['hero_aside.h', -1]], 0),
    req([['action_deck.w', 1], ['viewport.w', -1]], 0),
    req([['action_deck.h', 1], ['action_deck.intrinsicH', -1]], 0),

    req([['colophon_footer.x', 1]], 0),
    req([['colophon_footer.y', 1], ['action_deck.y', -1], ['action_deck.h', -1]], 0),
    req([['colophon_footer.w', 1], ['viewport.w', -1]], 0),
    req([['colophon_footer.h', 1], ['colophon_footer.intrinsicH', -1]], 0),

    opt([['nav_rail.w', 1]], floorWidth, '>=', 700),
    opt([['nav_rail.w', ratioDen], ['viewport.w', -1]], 0, '==', 350),

    opt([['deck_gap', 1]], 20, '==', 300),
  ];

  const textBearing = ['main_article'];
  const textLengthRange = { main_article: textLengthRangeMain };
  const fixedIntrinsicW = { masthead_banner: 0, nav_rail: 0, main_article: 0, hero_aside: 0, action_deck: 0, colophon_footer: 0 };
  const fixedIntrinsicH = { masthead_banner: headerH, hero_aside: 120, action_deck: deckH, colophon_footer: footerH };
  const referenceConstraintCount = constraints.length;
  const constraintBudget = referenceConstraintCount + boxes.length + 2;

  const spec = {
    boxes, textBearing, fixedIntrinsicW, fixedIntrinsicH, textLengthRange,
    constraintBudget, referenceConstraintCount, guideBudget: 1,
    difficultyTier: 'axis-coupled', axisCoupled: true,
  };
  return { spec, system: { guides, constraints } };
}

// ---------------------------------------------------------------------------
// Factory 6: portalWorkspaceNavCoupled. 8-11 boxes: top_bar + nav0..navK +
// sidebar_rail + content_stage (text) + summary_dock + footer_strip.
// 3 guides: navW, navGap, dock_guide.
// ---------------------------------------------------------------------------
export function portalWorkspaceNavCoupled({
  slug, navCount, navFloor, navCeil, navGap,
  sidebarFloor, sidebarRatioDen = 4,
  textLengthRangeMain = [60, 360],
  headerH = 60, footerH = 40, navH = 48, dockH = 80,
}) {
  if ((navCount * navFloor + (navCount - 1) * navGap) % 40 !== 0) throw new Error(`${slug}: nav low breakpoint off grid`);
  if ((navCount * navCeil + (navCount - 1) * navGap) % 40 !== 0) throw new Error(`${slug}: nav high breakpoint off grid`);
  if (sidebarFloor * sidebarRatioDen % 40 !== 0) throw new Error(`${slug}: sidebar breakpoint off grid`);

  const navBoxes = Array.from({ length: navCount }, (_, i) => `nav${i}`);
  const boxes = ['top_bar', ...navBoxes, 'sidebar_rail', 'content_stage', 'summary_dock', 'footer_strip'];
  const guides = ['navW', 'navGap', 'dock_guide'];
  const constraints = [
    req([['top_bar.x', 1]], 0),
    req([['top_bar.y', 1]], 0),
    req([['top_bar.w', 1], ['viewport.w', -1]], 0),
    req([['top_bar.h', 1], ['top_bar.intrinsicH', -1]], 0),
  ];

  for (const b of navBoxes) {
    constraints.push(req([[`${b}.y`, 1], ['top_bar.h', -1]], 0));
    constraints.push(req([[`${b}.h`, 1], [`${b}.intrinsicH`, -1]], 0));
    constraints.push(req([[`${b}.w`, 1], ['navW', -1]], 0));
  }
  constraints.push(req([[`${navBoxes[0]}.x`, 1]], 0));
  for (let i = 1; i < navCount; i++) {
    constraints.push(req([[`${navBoxes[i]}.x`, 1], [`${navBoxes[i - 1]}.x`, -1], [`${navBoxes[i - 1]}.w`, -1], ['navGap', -1]], 0));
  }
  constraints.push(req([[`${navBoxes[navCount - 1]}.x`, 1], [`${navBoxes[navCount - 1]}.w`, 1], ['viewport.w', -1]], 0));

  constraints.push(opt([['navW', 1]], navFloor, '>=', 800));
  constraints.push(opt([['navW', 1]], navCeil, '<=', 600));
  constraints.push(opt([['navGap', 1]], navGap, '==', 300));

  constraints.push(req([['sidebar_rail.x', 1]], 0));
  constraints.push(req([['sidebar_rail.y', 1], [`${navBoxes[0]}.y`, -1], [`${navBoxes[0]}.h`, -1]], 0));
  constraints.push(req([['content_stage.x', 1], ['sidebar_rail.w', -1]], 0));
  constraints.push(req([['content_stage.y', 1], ['sidebar_rail.y', -1]], 0));
  constraints.push(req([['content_stage.w', 1], ['sidebar_rail.w', 1], ['viewport.w', -1]], 0));

  constraints.push(req([['content_stage.h', 1], ['content_stage.intrinsicH', -1]], 0));
  constraints.push(req([['sidebar_rail.h', 1], ['content_stage.h', -1]], 0));

  constraints.push(opt([['sidebar_rail.w', 1]], sidebarFloor, '>=', 700));
  constraints.push(opt([['sidebar_rail.w', sidebarRatioDen], ['viewport.w', -1]], 0, '==', 400));

  constraints.push(req([['summary_dock.x', 1]], 0));
  constraints.push(req([['summary_dock.y', 1], ['content_stage.y', -1], ['content_stage.h', -1]], 0));
  constraints.push(req([['summary_dock.w', 1], ['viewport.w', -1]], 0));
  constraints.push(req([['summary_dock.h', 1], ['summary_dock.intrinsicH', -1]], 0));

  constraints.push(req([['footer_strip.x', 1]], 0));
  constraints.push(req([['footer_strip.y', 1], ['summary_dock.y', -1], ['summary_dock.h', -1]], 0));
  constraints.push(req([['footer_strip.w', 1], ['viewport.w', -1]], 0));
  constraints.push(req([['footer_strip.h', 1], ['footer_strip.intrinsicH', -1]], 0));

  constraints.push(opt([['dock_guide', 1]], 24, '==', 250));

  const textBearing = ['content_stage'];
  const textLengthRange = { content_stage: textLengthRangeMain };
  const fixedIntrinsicW = {};
  const fixedIntrinsicH = { top_bar: headerH, summary_dock: dockH, footer_strip: footerH };
  for (const b of boxes) fixedIntrinsicW[b] = 0;
  for (const b of navBoxes) fixedIntrinsicH[b] = navH;

  const referenceConstraintCount = constraints.length;
  const constraintBudget = referenceConstraintCount + boxes.length + 2;

  const spec = {
    boxes, textBearing, fixedIntrinsicW, fixedIntrinsicH, textLengthRange,
    constraintBudget, referenceConstraintCount, guideBudget: 3,
    difficultyTier: 'axis-coupled', axisCoupled: true,
  };
  return { spec, system: { guides, constraints } };
}
