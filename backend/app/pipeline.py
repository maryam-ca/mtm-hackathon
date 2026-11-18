"""Orchestrates one ingest: read -> authority -> conflicts -> plan -> validate -> commit/reject -> save.

The same entry point handles the first pack and every later message."""
import re
import time
from datetime import date

from sqlalchemy import select

from . import db, extraction
from .config import settings
from .facts import Fact, View, check_authority, fmt_val, resolve
from .llm import LLM, LLMError
from .planner import build_plan
from .validator import diff_areas, is_valid, validate

MAX_UPDATE_CALLS = 5   # brief limit; we use 1 (2 only if the JSON is malformed)


def count_messages(text: str) -> int:
    from .rules_extractor import split_messages      # one splitter for counting and reading
    return len(split_messages(text))


def _row_to_fact(r) -> Fact:
    return Fact(key=r.key, subject=r.subject, value=r.value, msg_seq=r.msg_seq, sender=r.sender or "",
                role=r.role or "other", sent_on=r.sent_on, evidence=r.evidence or "",
                evidence_verified=bool(r.evidence_verified), status=r.status, reason=r.reason or "", id=r.id)


def _load(conn):
    sid = db.current_session_id(conn)
    if sid is None:
        return None, [], 0, None, False
    facts = [_row_to_fact(r) for r in conn.execute(
        select(db.facts).where(db.facts.c.session_id == sid).order_by(db.facts.c.id))]
    seq = conn.execute(select(db.messages.c.seq).where(db.messages.c.session_id == sid)
                       .order_by(db.messages.c.seq.desc())).scalar() or 0
    pv = conn.execute(select(db.plan_versions).where(db.plan_versions.c.session_id == sid)
                      .order_by(db.plan_versions.c.id.desc())).first()
    return sid, facts, seq, (pv.plan if pv else None), bool(pv and pv.valid)


def ingest(text: str, name: str = "input", mode: str = "auto", llm: LLM | None = None) -> dict:
    t0 = time.time()
    llm = llm or LLM()
    text = text.strip("﻿")
    with db.engine().begin() as conn:
        sid, old_facts, last_seq, prev_plan, prev_valid = _load(conn)
    n_msgs = count_messages(text)
    if mode == "auto":
        mode = "update" if (sid is not None and prev_plan is not None and n_msgs < settings.pack_min_messages) else "full"
    kind = "update" if mode == "update" else "full"
    if kind == "full":
        old_facts, last_seq, prev_plan, prev_valid = [], 0, None, False

    calls: list[dict] = []
    events: list[tuple[str, str]] = []
    result = dict(kind=kind, outcome="failed", summary="", affected=[])
    new_facts: list[Fact] = []
    msgs: list[dict] = []
    plan, checks = prev_plan, []
    snapshot = {f.id: (f.status, f.reason) for f in old_facts}
    committed = False

    try:
        known = sorted({f.subject for f in old_facts if f.subject and f.status == "active"}) if kind == "update" else []
        msgs, new_facts = extraction.extract(text, known, last_seq, llm,
                                             MAX_UPDATE_CALLS if kind == "update" else 2, calls)
        if kind == "update":   # an undated update message arrived "now": newest wins over the pack
            today = date.today().isoformat()
            for m in msgs:
                m["sent_on"] = m["sent_on"] or today
            for f in new_facts:
                f.sent_on = f.sent_on or today
        if kind == "full":
            for f in new_facts:
                f.is_new = False  # within one pack, nothing is 'late'; newest date simply wins

        # 1) authority
        for f in new_facts:
            why = check_authority(f)
            if why:
                f.status, f.reason = "rejected", why
                events.append(("rejection", f"Message #{f.msg_seq}: {f.label()} = {fmt_val(f.value)} - {why}"))
            if not f.evidence_verified:
                events.append(("warning", f"Message #{f.msg_seq}: evidence quote for {f.label()} not found verbatim in the input."))
        for m in msgs:
            if not m["relevant"]:
                m["status"] = "irrelevant"
                events.append(("info", f"Message #{m['seq']} ({m['sender']}) ignored as irrelevant: {m['reason'] or 'no planning fact'}"))

        # 2) conflicts (newest wins)
        pool = old_facts + new_facts
        resolve(pool, events)

        # 3) plan + validate
        cand_plan = build_plan(View(pool))
        cand_checks = validate(cand_plan)
        valid = is_valid(cand_checks)

        if kind == "update" and prev_valid and not valid:
            # keep the previous valid state: undo this input's effect completely
            bad = [c for c in cand_checks if not c["ok"]]
            reason = "; ".join(f"{c['label']} ({c['detail']})" for c in bad)
            for f in old_facts:
                f.status, f.reason = snapshot[f.id]
                f.dirty = False
            for f in new_facts:
                if f.status != "rejected":
                    f.status, f.reason = "rejected", f"Would make the plan invalid: {reason}"
            for m in msgs:
                if m["relevant"]:
                    m["status"], m["reason"] = "rejected", f"Would make the plan invalid: {reason}"
            events.append(("rejection", f"Input rejected - it would break: {reason}. "
                                        f"The previous valid plan was kept unchanged."))
            result.update(outcome="rejected", summary=f"Rejected: would break {bad[0]['label']}. Previous plan kept.")
        else:
            plan, checks, committed = cand_plan, cand_checks, True
            for d in cand_plan.get("decisions", []):
                events.append(("decision", d))
            result["affected"] = diff_areas(prev_plan if kind == "update" else None, cand_plan)
            result.update(outcome="committed" if valid else "invalid")
            if kind == "update":
                result["summary"] = ("Plan updated; areas changed: " + (", ".join(result["affected"]) or "none")
                                     if valid else "Plan updated but some checks FAIL (no earlier valid plan to keep).")
            else:
                result["summary"] = "Plan generated; all checks pass." if valid else "Plan generated but some checks FAIL."
        for m in msgs:
            if "status" not in m:
                mine = [f for f in new_facts if f.msg_seq == m["seq"]]
                if mine and all(f.status == "rejected" for f in mine):
                    m["status"], m["reason"] = "rejected", mine[0].reason
                elif not mine:
                    m["status"], m["reason"] = "irrelevant", m["reason"] or "contains no planning fact"
                else:
                    m["status"] = "accepted"
    except LLMError as e:
        events.append(("warning", f"Model call failed: {e}. Nothing was changed."))
        result["summary"] = f"Failed: {e}"
        msgs, new_facts, committed = [], [], False
        for f in old_facts:
            f.status, f.reason = snapshot[f.id]
            f.dirty = False

    result["duration_ms"] = int((time.time() - t0) * 1000)
    rid = _save(kind, name, text, sid, old_facts, new_facts, msgs, calls, events, plan, checks, committed, result)
    result["run_id"] = rid
    return result


def _save(kind, name, text, sid, old_facts, new_facts, msgs, calls, events, plan, checks, committed, result) -> int:
    with db.engine().begin() as conn:
        if sid is None or (kind == "full" and result["outcome"] != "failed"):   # a failed run must not hide the existing plan
            sid = db.new_session(conn)
        rid = conn.execute(db.runs.insert().values(
            session_id=sid, kind=kind, input_name=name, input_text=text, outcome=result["outcome"],
            summary=result["summary"], duration_ms=result["duration_ms"],
            tokens_in=sum(c["tokens_in"] for c in calls), tokens_out=sum(c["tokens_out"] for c in calls),
            affected_areas=result["affected"])).inserted_primary_key[0]
        for m in msgs:
            conn.execute(db.messages.insert().values(session_id=sid, run_id=rid, **m))
        for f in new_facts:
            conn.execute(db.facts.insert().values(
                session_id=sid, run_id=rid, msg_seq=f.msg_seq, key=f.key, subject=f.subject, value=f.value,
                sender=f.sender, role=f.role, sent_on=f.sent_on, evidence=f.evidence,
                evidence_verified=f.evidence_verified, status=f.status, reason=f.reason))
        for f in old_facts:
            if f.dirty and f.id:
                conn.execute(db.facts.update().where(db.facts.c.id == f.id).values(status=f.status, reason=f.reason))
        if committed and plan:
            conn.execute(db.plan_versions.insert().values(
                session_id=sid, run_id=rid, plan=plan, checks=checks, valid=is_valid(checks)))
        for i, c in enumerate(calls, 1):
            conn.execute(db.model_calls.insert().values(run_id=rid, seq=i, **c))
        for i, (k, t) in enumerate(events, 1):
            conn.execute(db.trace_events.insert().values(run_id=rid, seq=i, kind=k, text=t))
    return rid


# ------------------------------------------------------------------ read side
def get_state() -> dict:
    with db.engine().begin() as conn:
        sid = db.current_session_id(conn)
        if sid is None:
            return dict(session=None, runs=[], messages=[], facts=[], plan=None, checks=[], valid=None,
                        calls=[], events=[], totals=dict(tokens_in=0, tokens_out=0, calls=0))
        rows = lambda t, *w: [dict(r._mapping) for r in conn.execute(select(t).where(*w))]
        runs = rows(db.runs, db.runs.c.session_id == sid)
        runs.sort(key=lambda r: r["id"])
        rids = [r["id"] for r in runs]
        for r in runs:
            r.pop("input_text", None)
            r["created_at"] = r["created_at"].isoformat() if r["created_at"] else None
        msgs = sorted(rows(db.messages, db.messages.c.session_id == sid), key=lambda m: m["seq"])
        facts = sorted(rows(db.facts, db.facts.c.session_id == sid), key=lambda f: f["id"])
        calls = sorted(rows(db.model_calls, db.model_calls.c.run_id.in_(rids)), key=lambda c: (c["run_id"], c["seq"]))
        evs = sorted(rows(db.trace_events, db.trace_events.c.run_id.in_(rids)), key=lambda e: (e["run_id"], e["seq"]))
        pv = conn.execute(select(db.plan_versions).where(db.plan_versions.c.session_id == sid)
                          .order_by(db.plan_versions.c.id.desc())).first()
        for n, c in enumerate(calls, 1):
            c["n"] = n
        return dict(
            session=sid, runs=runs, messages=msgs, facts=facts, calls=calls, events=evs,
            plan=pv.plan if pv else None, checks=pv.checks if pv else [], valid=pv.valid if pv else None,
            plan_run_id=pv.run_id if pv else None,
            totals=dict(tokens_in=sum(c["tokens_in"] for c in calls), tokens_out=sum(c["tokens_out"] for c in calls),
                        calls=len(calls)))


def _clock(plan, m):
    st = plan["inputs"].get("start_time")
    if st and re.match(r"^\d{1,2}:\d{2}$", str(st)):
        h, mi = map(int, st.split(":"))
        m += h * 60 + mi
        return f"{m // 60 % 24:02d}:{m % 60:02d}"
    return f"T+{m // 60}:{m % 60:02d}"


def render_text(state: dict) -> str:
    """Printable plan + full trace (what the CLI prints and saves to out/)."""
    L = []
    plan = state["plan"]
    L.append("=" * 78 + "\nPLAN" + (" (VALID)" if state["valid"] else " (HAS FAILING CHECKS)") + "\n" + "=" * 78)
    if plan and not plan["missing"]:
        v, f, j, b, s = (plan[k] for k in ("venue", "food", "judging", "budget", "schedule"))
        L.append(f"Venue   : {v['chosen']} - {v['seats']} seats, Rs {v['price']:,}, generator={'yes' if v['generator'] else 'no'}")
        for r in v["rejected"]:
            L.append(f"          not chosen: {r['name']} ({r['reason']})")
        L.append("Schedule:")
        for x in s["blocks"]:
            L.append(f"  {_clock(plan, x['start'])}-{_clock(plan, x['end'])}  {x['name']} ({x['end'] - x['start']} min)")
        L.append(f"Food    : {f['qty']} x {f['type']} @ Rs {f['unit_price']:,} + delivery Rs {f['delivery']:,} = Rs {f['cost']:,}")
        L.append(f"Judging : {j['used']} of {j['confirmed']} judges (need {j['needed']}), {j['per_team_min']} min/team, "
                 f"max {j['max_teams']} teams each, honorarium Rs {j['fee']:,} = Rs {j['cost']:,}")
        L.append("Budget  :")
        for l in b["lines"]:
            L.append(f"  {l['item']:<44} Rs {l['amount']:>9,}")
        L.append(f"  {'TOTAL':<44} Rs {b['total']:>9,}  / limit Rs {b['limit']:,}  (remaining Rs {b['remaining']:,})")
        for p in b["proposals"]:
            L.append(f"  PENDING (not approved, excluded): {p['item']} Rs {p['amount']:,}")
        for n in plan["notes"]:
            L.append(f"  Note (not enforced): {n}")
    elif plan:
        L.append("Cannot plan - missing: " + ", ".join(plan["missing"]))
    L.append("\nCHECKS")
    for c in state["checks"]:
        L.append(f"  [{'PASS' if c['ok'] else 'FAIL'}] {c['label']} - {c['detail']}")
    L.append("\nREJECTED / IGNORED MESSAGES")
    bad = [m for m in state["messages"] if m["status"] in ("rejected", "irrelevant")]
    for m in bad or []:
        L.append(f"  #{m['seq']} {m['sender']} ({m['sent_on']}) [{m['status']}]: \"{m['quote']}\" -> {m['reason']}")
    if not bad:
        L.append("  none")
    L.append("\n" + "=" * 78 + "\nTRACE\n" + "=" * 78)
    for r in state["runs"]:
        L.append(f"\n--- Run {r['id']} ({r['kind']}) input={r['input_name']} outcome={r['outcome']} {r['duration_ms']} ms")
        L.append(f"    {r['summary']}")
        for c in [c for c in state["calls"] if c["run_id"] == r["id"]]:
            L.append(f"\n  Model call #{c['n']}  model={c['model']}  area={c['area']}  "
                     f"tokens in={c['tokens_in']} out={c['tokens_out']}  {c['duration_ms']} ms")
            L.append("  INPUT:\n" + "\n".join("    " + x for x in c["input"].splitlines()))
            L.append("  OUTPUT:\n" + "\n".join("    " + x for x in c["output"].splitlines()))
        for e in [e for e in state["events"] if e["run_id"] == r["id"]]:
            L.append(f"  [{e['kind']}] {e['text']}")
    t = state["totals"]
    L.append(f"\nTOTAL TOKENS: in={t['tokens_in']} out={t['tokens_out']} total={t['tokens_in'] + t['tokens_out']} "
             f"across {t['calls']} model call(s)")
    return "\n".join(L)
