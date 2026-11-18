"""Independent validation of a plan. Figures are recomputed from the plan's inputs
rather than trusting the planner's own totals."""
import math

AREAS = ["venue", "schedule", "food", "judging", "budget"]


def _c(cid, area, label, ok, detail):
    return dict(id=cid, area=area, label=label, ok=bool(ok), detail=detail)


def validate(plan: dict) -> list[dict]:
    I = plan["inputs"]
    out = [_c("inputs", "reading", "All required inputs found in the messages", not plan["missing"],
              "complete" if not plan["missing"] else "missing: " + ", ".join(plan["missing"]))]
    if plan["missing"]:
        out.append(_c("areas", "all", "All five areas covered", False,
                      "cannot plan without: " + ", ".join(plan["missing"])))
        return out

    v, s, f, j, b = (plan[a] for a in ("venue", "schedule", "food", "judging", "budget"))
    people = f["people"]

    # correct figures (recomputed)
    exp_people = I["headcount_override"] or I["students"] + I["staff"] + j["used"]
    exp_total = (v["price"] + f["qty"] * f["unit_price"] + f["delivery"] + j["used"] * I["judge_fee"]
                 + sum(l["amount"] for l in b["lines"] if l["area"] == "budget"))
    out.append(_c("figures", "budget", "Figures add up", exp_people == people and exp_total == b["total"]
                  and sum(l["amount"] for l in b["lines"]) == b["total"],
                  f"people {people}; total Rs {b['total']:,} (recomputed Rs {exp_total:,})"))
    out.append(_c("budget", "budget", "Within approved budget", b["total"] <= b["limit"],
                  f"Rs {b['total']:,} of Rs {b['limit']:,} (remaining Rs {b['remaining']:,})"))

    gen_ok = (not I["generator_required"]) or v["generator"]
    out.append(_c("venue", "venue", "Venue fits everyone" + (" and has a generator" if I["generator_required"] else ""),
                  v["seats"] >= people and gen_ok, f"{v['chosen']} seats {v['seats']} for {people} people"
                  + ("" if gen_ok else "; no generator")))

    # meals
    meals_ok = f["qty"] >= people and (f["order_qty"] is None or f["order_qty"] >= people)
    out.append(_c("meals", "food", "Meals cover every person", meals_ok,
                  f"{f['qty']} planned" + (f", caterer order {f['order_qty']}" if f["order_qty"] is not None else "")
                  + f" vs {people} people"))

    # schedule
    blocks = s["blocks"]
    contiguous = all(blocks[i]["end"] == blocks[i + 1]["start"] for i in range(len(blocks) - 1))
    prayer = I["prayer_min"] == 0 or any(x["kind"] == "prayer" and x["end"] - x["start"] >= I["prayer_min"] for x in blocks)
    sched_ok = (contiguous and s["end"] == s["total_min"] and blocks[0]["start"] == 0
                and s["hack_min"] >= 60 and prayer)
    out.append(_c("schedule", "schedule", "Schedule valid (fits duration, prayer break, time to build)", sched_ok,
                  f"{s['end']} of {s['total_min']} min, hacking {s['hack_min']} min"
                  + ("" if prayer else "; prayer break missing")))

    # judges
    need = math.ceil(I["teams"] / I["judge_max_teams"])
    seen = sorted(t["team"] for jd in j["assignments"] for t in jd["teams"])
    judge_ok = (j["confirmed"] >= need and seen == list(range(1, I["teams"] + 1))
                and all(len(jd["teams"]) <= I["judge_max_teams"] for jd in j["assignments"])
                and all(t["end"] - t["start"] == I["judge_min"] and s["judging_start"] <= t["start"]
                        and t["end"] <= s["judging_end"] for jd in j["assignments"] for t in jd["teams"]))
    out.append(_c("judges", "judging", "Enough judges; every team judged within limits", judge_ok,
                  f"{j['confirmed']} confirmed, {need} needed for {I['teams']} teams"))
    out.append(_c("areas", "all", "All five areas covered", all(a in plan for a in AREAS), ", ".join(AREAS)))
    return out


def is_valid(checks) -> bool:
    return all(c["ok"] for c in checks)


def diff_areas(old: dict | None, new: dict) -> list[str]:
    if not old:
        return [a for a in AREAS if a in new]
    return [a for a in AREAS if old.get(a) != new.get(a)]
