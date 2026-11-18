"""End-to-end through the offline rules engine on the REAL data files (no stub fixtures)."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import db, pipeline  # noqa: E402
from app.config import ROOT, settings  # noqa: E402

DATA = ROOT / "data"


@pytest.fixture(autouse=True)
def fresh(tmp_path, monkeypatch):
    db.set_engine(f"sqlite:///{tmp_path / 't.db'}")
    db.init_db()
    monkeypatch.setattr(settings, "llm_provider", "rules")


def read(name):
    return (DATA / name).read_text(encoding="utf-8")


def test_sample_pack_end_to_end():
    r = pipeline.ingest(read("sample_pack.txt"), "sample_pack.txt")
    s = pipeline.get_state()
    p = s["plan"]
    assert r["kind"] == "full" and r["outcome"] == "committed", s["checks"]
    assert p["venue"]["chosen"] == "Hall A" and p["food"]["people"] == 177
    assert p["food"]["type"] == "standard" and p["food"]["unit_price"] == 1200      # newer caterer message wins
    assert p["budget"]["total"] == 547400 and p["budget"]["proposals"][0]["item"] == "DJ"
    assert p["inputs"]["judge_late"] == 10
    assert len(s["messages"]) == 8 and all(f["evidence_verified"] for f in s["facts"])
    assert s["totals"]["tokens_in"] == 0 and "no LLM" in s["calls"][0]["model"]


def test_change_then_wrong_message():
    pipeline.ingest(read("sample_pack.txt"), "sample_pack.txt")
    r1 = pipeline.ingest(read("update_change.txt"), "update_change.txt")
    assert r1["kind"] == "update" and r1["affected"] == ["budget"]
    assert pipeline.get_state()["plan"]["budget"]["total"] == 552400
    before = pipeline.get_state()["plan"]
    r2 = pipeline.ingest(read("update_wrong.txt"), "update_wrong.txt")
    s = pipeline.get_state()
    assert r2["outcome"] == "rejected" and s["plan"] == before and s["valid"]


def test_resending_an_applied_message_changes_nothing():
    pipeline.ingest(read("sample_pack.txt"), "sample_pack.txt")
    pipeline.ingest(read("update_change.txt"), "update_change.txt")
    before = pipeline.get_state()
    r = pipeline.ingest(read("update_change.txt"), "update_change.txt")      # same message again
    after = pipeline.get_state()
    assert r["outcome"] == "unchanged" and r["affected"] == []
    assert len(after["messages"]) == len(before["messages"])                  # no duplicate message stored
    assert len(after["facts"]) == len(before["facts"])                        # no duplicate facts stored
    assert after["plan"] == before["plan"] and after["valid"]
    assert any("Already in the plan" in e["text"] for e in after["events"])
