"""Verifier tests for layout-constraint-synthesis.

Runs runner.mjs once (module-scoped) to get a full per-layout report, then
asserts the five graded conditions per layout individually so CTRF shows
which layout and which condition failed. test.sh derives reward.txt from
this file's pytest exit code.
"""
import json
import subprocess
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).parent
LAYOUTS_DIR = HERE / "layouts"
SLUGS = sorted(p.name for p in LAYOUTS_DIR.iterdir() if p.is_dir())


def _run_runner(report_path: Path) -> dict:
    subprocess.run(["node", str(HERE / "runner.mjs")], check=True, cwd=HERE)
    data = json.loads((HERE / "runner_report.json").read_text())
    report_path.write_text(json.dumps(data))
    return data


@pytest.fixture(scope="session")
def report():
    return _run_runner(HERE / "runner_report_run1.json")


@pytest.fixture(scope="session")
def by_slug(report):
    return {layout["slug"]: layout for layout in report["layouts"]}


def test_report_has_all_layouts(report):
    assert {l["slug"] for l in report["layouts"]} == set(SLUGS)


def test_overall_reward_is_binary(report):
    assert report["reward"] in (0, 1)


@pytest.mark.parametrize("slug", SLUGS)
def test_layout_grammar_conformance(by_slug, slug):
    c = by_slug[slug]["conditions"]["grammar"]
    assert c["pass"], f"{slug} grammar: {c['detail']}"


@pytest.mark.parametrize("slug", SLUGS)
def test_layout_budget_compliance(by_slug, slug):
    c = by_slug[slug]["conditions"]["budget"]
    assert c["pass"], f"{slug} budget: {c['detail']}"


@pytest.mark.parametrize("slug", SLUGS)
def test_layout_fine_grid_geometry(by_slug, slug):
    c = by_slug[slug]["conditions"]["geometry"]
    assert c["pass"], f"{slug} geometry: {c['detail']}"


@pytest.mark.parametrize("slug", SLUGS)
def test_layout_uniqueness(by_slug, slug):
    c = by_slug[slug]["conditions"]["uniqueness"]
    assert c["pass"], f"{slug} uniqueness: {c['detail']}"


@pytest.mark.parametrize("slug", SLUGS)
def test_layout_satisfiability(by_slug, slug):
    c = by_slug[slug]["conditions"]["satisfiability"]
    assert c["pass"], f"{slug} satisfiability: {c['detail']}"


def test_solver_never_throws_on_schema_valid_system(report):
    # runner.mjs raises (subprocess exits nonzero) rather than reporting a
    # layout result if solve.js throws internally; reaching this point at
    # all with a full report means no internal throw occurred.
    assert len(report["layouts"]) == len(SLUGS)


def test_determinism():
    r1 = _run_runner(HERE / "runner_report_det1.json")
    r2 = _run_runner(HERE / "runner_report_det2.json")
    assert json.dumps(r1, sort_keys=True) == json.dumps(r2, sort_keys=True)
