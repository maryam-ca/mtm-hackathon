"""Logic tests with a STUB model (hand-written extraction JSON). They verify planning,
conflict handling, authority and rollback; they do not test real model quality."""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import db, pipeline  # noqa: E402
from app.llm import LLMResult  # noqa: E402


def F(n, k, v, q, s=None):
    return dict(n=n, k=k, s=s, v=v, q=q)


def M(n, sender, role, date, quote, relevant=True, why=""):
    return dict(n=n, sender=sender, role=role, date=date, quote=quote, relevant=relevant, why=why)


PACK = dict(
    messages=[M(1, "Dean's office", "organizer", "2026-11-09", "Approved: a 4-hour"),
              M(2, "Margalla Event Halls", "vendor", "2026-11-03", "Room D seats 80"),
              M(3, "Caterer", "vendor", "2026-10-20", "Standard lunch box Rs"),
              M(4, "Caterer", "vendor", "2026-11-12", "Salam bhai! Standard"),
              M(5, "Judging coordinator", "coordinator", "2026-11-11", "20 judges have confirmed"),
              M(6, "Finance", "finance", "2026-11-10", "Already ordered from"),
              M(7, "Student society", "student", "2026-11-13", "Can we get a DJ"),
              M(8, "A judge", "judge", "2026-11-14", "I may be 10")],
    facts=[F(1, "event.students", 150, "150 students"), F(1, "event.team_size", 3, "teams of 3"),
           F(1, "event.duration_hours", 4, "4-hour"), F(1, "event.budget_total", 650000, "Rs 650,000"),
           F(1, "event.staff", 10, "Ten staff"), F(1, "event.prayer_min", 15, "15-minute prayer break"),
           F(2, "venue.hall", dict(seats=80, price=40000, generator=False), "Room D", "Room D"),
           F(2, "venue.hall", dict(seats=200, price=120000, generator=False), "Hall A", "Hall A"),
           F(2, "venue.hall", dict(seats=200, price=150000, generator=True), "Hall B", "Hall B"),
           F(2, "venue.hall", dict(seats=300, price=220000, generator=True), "Hall C", "Hall C"),
           F(3, "food.price", dict(price=1000, delivery=0), "Rs 1,000", "standard"),
           F(4, "food.price", dict(price=1200, delivery=0), "Rs 1,200", "standard"),
           F(4, "food.price", dict(price=800, delivery=0), "Rs 800", "basic"),
           F(5, "judge.confirmed", 20, "20 judges"), F(5, "judge.fee", 5000, "Rs 5,000"),
           F(5, "judge.min_per_team", 15, "15 minutes per team"), F(5, "judge.max_teams", 3, "three teams"),
           F(6, "expense.committed", 100000, "prizes Rs 100,000", "prizes"),
           F(6, "expense.committed", 20000, "backup internet Rs 20,000", "backup internet"),
           F(6, "expense.committed", 10000, "printing Rs 10,000", "printing"),
           F(7, "proposal.expense", 50000, "DJ for the closing", "DJ"),
           F(8, "judge.late_min", 10, "10 minutes late")])


class Stub:
    def __init__(self, payload):
        self.payload = payload

    def call(self, system, user, max_tokens=0):
        return LLMResult("stub-model", json.dumps(self.payload), 100, 50, 1)


@pytest.fixture(autouse=True)
def fresh_db(tmp_path):
    db.set_engine(f"sqlite:///{tmp_path / 't.db'}")
    db.init_db()


def run_pack():
    return pipeline.ingest("m1\n\nm2\n\nm3\n\nm4\n\nm5", "pack", llm=Stub(PACK))


def test_full_run_is_valid_and_figures_right():
    r = run_pack()
    assert r["kind"] == "full" and r["outcome"] == "committed"
    s = pipeline.get_state()
    p = s["plan"]
    assert p["venue"]["chosen"] == "Hall A"
    assert p["judging"]["needed"] == 17 and p["food"]["people"] == 177
    assert p["food"]["type"] == "standard" and p["food"]["cost"] == 177 * 1200
    assert p["budget"]["total"] == 120000 + 212400 + 85000 + 130000
    assert p["budget"]["proposals"][0]["item"] == "DJ"
    assert all(c["ok"] for c in s["checks"])
    price = [f for f in s["facts"] if f["key"] == "food.price" and f["subject"] == "standard"]
    assert {f["status"] for f in price} == {"active", "superseded"}
    assert any(m["status"] == "irrelevant" for m in s["messages"]) is False   # DJ is a proposal, not noise
    assert s["totals"]["calls"] == 1 and s["calls"][0]["area"] == "reading"


def update_payload(msg, facts):
    return dict(messages=[msg], facts=facts)


def test_change_updates_only_budget():
    run_pack()
    upd = update_payload(M(1, "Finance", "finance", "2026-11-16", "The printing bill"),
                         [F(1, "expense.committed", 15000, "Rs 15,000", "printing")])
    r = pipeline.ingest("Finance here. The printing bill came in at Rs 15,000.", "u1", llm=Stub(upd))
    assert r["kind"] == "update" and r["outcome"] == "committed"
    assert r["affected"] == ["budget"]
    assert pipeline.get_state()["plan"]["budget"]["total"] == 120000 + 212400 + 85000 + 135000


def test_wrong_message_rejected_and_plan_kept():
    run_pack()
    before = pipeline.get_state()["plan"]
    upd = update_payload(M(1, "Caterer", "vendor", "2026-11-16", "I have rounded your order"),
                         [F(1, "food.order_qty", 100, "rounded your order down to 100 boxes")])
    r = pipeline.ingest("Caterer: I have rounded your order down to 100 boxes.", "u2", llm=Stub(upd))
    s = pipeline.get_state()
    assert r["outcome"] == "rejected"
    assert s["plan"] == before and s["valid"]
    rej = [m for m in s["messages"] if m["status"] == "rejected"]
    assert rej and "Meals cover every person" in rej[0]["reason"]
    assert any(e["kind"] == "rejection" for e in s["events"])


def test_unauthorised_sender_rejected():
    run_pack()
    upd = update_payload(M(1, "Student society", "student", "2026-11-16", "Budget is now"),
                         [F(1, "event.budget_total", 900000, "Budget is now 900000")])
    pipeline.ingest("Student society: budget is now 900000", "u3", llm=Stub(upd))
    s = pipeline.get_state()
    assert s["plan"]["budget"]["limit"] == 650000
    assert any("can only be set by" in e["text"] for e in s["events"])


def test_missing_inputs_flagged_not_invented():
    pk = dict(messages=[M(1, "Dean", "organizer", "2026-11-09", "Budget")],
              facts=[F(1, "event.budget_total", 100, "Budget")])
    pipeline.ingest("a\n\nb\n\nc\n\nd", "p", llm=Stub(pk))
    s = pipeline.get_state()
    assert not s["valid"] and s["plan"]["missing"]
