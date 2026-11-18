"""Planning in plain code (no model): venue, schedule, food, judging, budget.
Scheduling policy constants below are design parameters, not event facts."""
import math

from .facts import View

OPEN_MIN, CLOSE_MIN, LUNCH_MIN = 15, 15, 30
MIN_HACK_MIN = 60

REQUIRED = {
    "event.students": "number of students",
    "event.duration_hours": "event duration",
    "event.budget_total": "total budget",
    "judge.confirmed": "confirmed judges",
    "judge.fee": "judge honorarium",
    "judge.min_per_team": "minutes per team per judge",
    "judge.max_teams": "max teams per judge",
}


def build_plan(view: View) -> dict:
    g = view.get
    missing = [label for k, label in REQUIRED.items() if g(k) is None]
    teams = g("event.teams")
    if teams is None and g("event.team_size") and g("event.students"):
        teams = math.ceil(g("event.students") / g("event.team_size"))
    if teams is None:
        missing.append("number of teams or team size")
    halls = view.items("venue.hall")
    foods = view.items("food.price")
    if not halls:
        missing.append("venue options")
    if not foods:
        missing.append("food prices")

    inputs = dict(
        students=g("event.students"), team_size=g("event.team_size"), teams=teams,
        staff=g("event.staff", 0), duration_hours=g("event.duration_hours"),
        budget=g("event.budget_total"), prayer_min=g("event.prayer_min", 0),
        generator_required=bool(g("event.generator_required", False)),
        start_time=g("event.start_time"), judges_confirmed=g("judge.confirmed"),
        judge_fee=g("judge.fee"), judge_min=g("judge.min_per_team"),
        judge_max_teams=g("judge.max_teams"), judge_late=g("judge.late_min", 0) or 0,
        headcount_override=g("food.headcount"), order_qty=g("food.order_qty"),
        preferred_food=g("food.preferred"),
        step_free_required=bool(g("event.step_free_required", False)),
        service_pct=g("food.service_charge_pct", 0) or 0,
    )
    plan = {"inputs": inputs, "missing": missing, "decisions": [],
            "notes": [f"{k}: {v}" for k, v in view.items("constraint.other").items()]}
    if missing:
        return plan
    I = inputs
    dec = plan["decisions"]

    # ---- judging
    needed = math.ceil(teams / I["judge_max_teams"])
    used = min(I["judges_confirmed"], needed)
    spare = I["judges_confirmed"] - used
    slots = math.ceil(teams / used)
    judges = [{"judge": j + 1, "late": bool(I["judge_late"]) and j == 0, "teams": []} for j in range(used)]
    plan["judging"] = dict(needed=needed, confirmed=I["judges_confirmed"], used=used, spare=spare,
                           fee=I["judge_fee"], cost=used * I["judge_fee"], per_team_min=I["judge_min"],
                           max_teams=I["judge_max_teams"], slots=slots, late_min=I["judge_late"],
                           assignments=judges)
    dec.append(f"Judges needed = ceil({teams} teams / {I['judge_max_teams']} per judge) = {needed}; "
               f"{used} assigned, {spare} spare.")
    if I["judge_late"]:
        dec.append(f"Judge 1 may arrive {I['judge_late']} min late: their slots start {I['judge_late']} min later "
                   f"and the judging window includes that buffer; a spare judge is the contingency.")

    # ---- headcount
    people = I["headcount_override"] or (I["students"] + I["staff"] + used)
    dec.append(f"People on site = {'stated headcount' if I['headcount_override'] else 'students + staff + judges used'}"
               f" = {people}.")

    # ---- venue
    ok_halls, rejected = [], []
    unavail = {k.strip().lower() for k, v in view.items("venue.unavailable").items() if v}
    for name, h in halls.items():
        why = []
        if name.strip().lower() in unavail:
            why.append("unavailable on the event date (maintenance / already booked)")
        if h.get("seats", 0) < people:
            why.append(f"seats {h.get('seats')} < {people} people")
        if I["generator_required"] and not h.get("generator"):
            why.append("no standby generator (required)")
        if I["step_free_required"] and not h.get("accessible"):
            why.append("not step-free (no ground-floor / ramp access)")
        (rejected if why else ok_halls).append((name, h, why))
    ok_halls.sort(key=lambda x: x[1].get("price", 0))

    # ---- food option order
    order = sorted(foods.items(), key=lambda kv: -kv[1].get("price", 0))
    pref = (I["preferred_food"] or "").strip().lower()
    if pref:
        order.sort(key=lambda kv: kv[0].lower() != pref)
    def food_cost(qty_, f_):
        """(total, service charge): price x qty + delivery, plus the service-charge percent on that total."""
        base = qty_ * f_.get("price", 0) + f_.get("delivery", 0)
        svc = round(base * I["service_pct"] / 100)
        return base + svc, svc

    fixed = used * I["judge_fee"] + sum(view.items("expense.committed").values())
    qty = max(people, I["order_qty"] or 0)
    if ok_halls:
        vname, vh, _ = ok_halls[0]
    else:  # nothing fits: show the largest hall so the failed check is visible
        vname, vh = max(halls.items(), key=lambda kv: kv[1].get("seats", 0))
    vprice = vh.get("price", 0)
    chosen = order[-1]
    for name, f in order:
        if vprice + fixed + food_cost(qty, f)[0] <= I["budget"]:
            chosen = (name, f)
            break
    fname, f = chosen
    dec.append(f"Venue: cheapest hall that fits {people} people"
               f"{' with a generator' if I['generator_required'] else ''}"
               f"{' and step-free access' if I['step_free_required'] else ''} = {vname} (Rs {vprice:,}).")
    if unavail:
        dec.append("Unavailable on the event date: " + ", ".join(sorted(k.title() if k.islower() else k for k in unavail)) + ".")
    if I["service_pct"]:
        dec.append(f"A {I['service_pct']:g}% service charge is added on the food total.")
    dec.append(f"Food: '{fname}' at Rs {f.get('price', 0):,}/head "
               f"({'preferred type' if pref and fname.lower() == pref else 'best option that keeps the plan within budget'}).")
    plan["venue"] = dict(chosen=vname, seats=vh.get("seats"), price=vprice, generator=bool(vh.get("generator")),
                         accessible=bool(vh.get("accessible")),
                         rejected=[dict(name=n, reason="; ".join(w)) for n, _, w in rejected],
                         options=[dict(name=n, unavailable=n.strip().lower() in unavail, **h) for n, h in halls.items()])
    plan["food"] = dict(type=fname, unit_price=f.get("price", 0), delivery=f.get("delivery", 0), qty=qty,
                        people=people, order_qty=I["order_qty"], cost=food_cost(qty, f)[0], service_pct=I["service_pct"],
                        service_charge=food_cost(qty, f)[1],
                        options=[dict(type=n, **v) for n, v in foods.items()])

    # ---- budget
    lines = [dict(item=f"Venue - {vname}", amount=vprice, area="venue"),
             dict(item=f"Food - {qty} x {fname}" + (" + delivery" if f.get("delivery") else "")
                  + (f" + {I['service_pct']:g}% service" if I["service_pct"] else ""),
                  amount=plan["food"]["cost"], area="food"),
             dict(item=f"Judge honorarium - {used} x Rs {I['judge_fee']:,}", amount=used * I["judge_fee"], area="judging")]
    for item, amt in view.items("expense.committed").items():
        lines.append(dict(item=f"Already ordered - {item}", amount=amt, area="budget"))
    total = sum(l["amount"] for l in lines)
    remaining = I["budget"] - total
    plan["budget"] = dict(limit=I["budget"], lines=lines, total=total, remaining=remaining,
                          proposals=[dict(item=k, amount=v, affordable=v <= remaining, approved=False)
                                     for k, v in view.items("proposal.expense").items()])
    for k, v in view.items("proposal.expense").items():
        dec.append(f"'{k}' (Rs {v:,}) is a proposal, not an approved expense: excluded from the budget.")

    # ---- schedule
    total_min = int(round(I["duration_hours"] * 60))
    judging_len = slots * I["judge_min"] + I["judge_late"]
    hack = total_min - OPEN_MIN - CLOSE_MIN - LUNCH_MIN - I["prayer_min"] - judging_len
    h1 = max(hack, 0) // 2
    h2 = max(hack, 0) - h1
    seq = [("Opening & briefing", OPEN_MIN, "open"), ("Hacking block 1", h1, "hack"),
           ("Lunch", LUNCH_MIN, "lunch")]
    if I["prayer_min"]:
        seq.append(("Prayer break", I["prayer_min"], "prayer"))
    seq += [("Hacking block 2", h2, "hack"), ("Judging", judging_len, "judging"),
            ("Prizes & closing", CLOSE_MIN, "close")]
    t, blocks = 0, []
    for name, mins, kind in seq:
        blocks.append(dict(name=name, start=t, end=t + mins, kind=kind))
        t += mins
    jstart = next(b["start"] for b in blocks if b["kind"] == "judging")
    for team in range(teams):
        jd, slot = judges[team % used], team // used
        s = jstart + slot * I["judge_min"] + (I["judge_late"] if jd["late"] else 0)
        jd["teams"].append(dict(team=team + 1, start=s, end=s + I["judge_min"]))
    plan["schedule"] = dict(total_min=total_min, blocks=blocks, hack_min=hack, judging_start=jstart,
                            judging_end=jstart + judging_len, end=t)
    return plan
