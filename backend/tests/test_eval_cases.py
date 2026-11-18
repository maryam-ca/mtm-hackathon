"""Offline checks of the accuracy-test cases themselves (no model, no key, no database).
The live model run is:  python backend/eval/run_accuracy.py"""
import importlib.util
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.facts import ROLES, VOCAB  # noqa: E402

EVAL = Path(__file__).resolve().parents[1] / "eval"
spec = importlib.util.spec_from_file_location("run_accuracy", EVAL / "run_accuracy.py")
run_accuracy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run_accuracy)

CASES = run_accuracy.load_cases("")


def test_cases_are_found():
    assert len(CASES) >= 7, "expected the 7 accuracy cases in backend/eval/cases/"


@pytest.mark.parametrize("case", CASES, ids=lambda c: c["name"])
def test_case_is_well_formed(case):
    assert case["text"].strip(), "case has no messages"
    for e in case["expected"]:
        assert e["k"] in VOCAB, f"unknown fact key {e['k']}"
        assert "v" in e
    for role in case.get("roles", {}).values():
        assert role in ROLES


def test_scoring_treats_equal_values_as_equal():
    key = run_accuracy.key_of
    assert key("venue.hall", "Hall A", {"seats": 200, "price": 1.0, "generator": False}) == \
        key("venue.hall", " hall a ", {"generator": False, "price": 1, "seats": 200.0})
    assert key("event.budget_total", None, 650000) != key("event.budget_total", None, 700000)


def test_sample_pack_case_reads_the_real_data_file():
    case = next(c for c in CASES if c["name"].endswith("sample_pack"))
    assert "Margalla" in case["text"] and len(case["expected"]) == 22
