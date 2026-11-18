"""Fact store logic in plain code: authority checks and conflict resolution.
No model is used here - these are deterministic rules."""
from dataclasses import dataclass, field
from typing import Any

# Fact vocabulary the model may emit: key -> description of the value.
VOCAB = {
    "event.students": "int - number of student participants",
    "event.team_size": "int - students per team",
    "event.teams": "int - number of teams (only if stated)",
    "event.staff": "int - staff on duty",
    "event.duration_hours": "number - event length in hours",
    "event.budget_total": "int Rs - total approved budget, all in",
    "event.prayer_min": "int - required prayer break minutes",
    "event.generator_required": "bool - a standby generator is mandatory",
    "event.start_time": "HH:MM 24h - event start time if stated",
    "venue.hall": "subject=hall name exactly as written; value={seats:int, price:int Rs, generator:bool, accessible:bool (true only if the text says it is step-free / ground floor / ramp access)}",
    "venue.unavailable": "subject=hall name; value=true - that hall cannot be booked on the event date (maintenance, already booked)",
    "event.step_free_required": "bool - the venue must have step-free (wheelchair) access",
    "food.price": "subject=meal type (e.g. standard, basic); value={price:int Rs per head, delivery:int Rs flat (0 if free)}",
    "food.preferred": "string - meal type the organisers want",
    "food.service_charge_pct": "number - percent service charge added on top of the food total",
    "food.headcount": "int - people needing meals, only if explicitly stated",
    "food.order_qty": "int - number of meals/boxes the caterer says it will supply",
    "judge.confirmed": "int - judges confirmed",
    "judge.fee": "int Rs - honorarium per judge",
    "judge.min_per_team": "int - minutes a judge needs per team",
    "judge.max_teams": "int - most teams one judge may cover",
    "judge.late_min": "int - minutes a judge expects to be late",
    "expense.committed": "subject=item; value=int Rs already ordered/spent from the event budget",
    "proposal.expense": "subject=item; value=int Rs - requested/quoted but NOT approved",
    "constraint.other": "subject=area (venue|schedule|food|judging|budget); value=text of a rule not covered above",
}

ROLES = ["organizer", "vendor", "finance", "coordinator", "judge", "student", "office", "other"]

# Which sender roles may state which facts (first matching prefix wins).
# Anyone may *propose* an expense; proposals never count against the budget.
AUTHORITY: list[tuple[str, set[str]]] = [
    ("event.step_free_required", {"organizer", "office"}),
    ("event.", {"organizer"}),
    ("venue.", {"vendor", "organizer"}),
    ("food.price", {"vendor", "organizer"}),
    ("food.service", {"vendor", "organizer"}),
    ("food.order_qty", {"vendor", "organizer"}),
    ("food.", {"organizer"}),
    ("judge.late_min", {"judge", "coordinator", "organizer"}),
    ("judge.", {"coordinator", "organizer"}),
    ("expense.", {"finance", "organizer"}),
    ("proposal.", set(ROLES)),
    ("constraint.", {"organizer", "coordinator", "finance"}),
]

ROLE_LABEL = {"organizer": "an organiser", "vendor": "a vendor", "finance": "finance",
              "coordinator": "the judging coordinator", "judge": "a judge",
              "student": "a student group", "office": "a university office", "other": "an unrecognised sender"}


def allowed_roles(key: str) -> set[str]:
    for prefix, roles in AUTHORITY:
        if key.startswith(prefix):
            return roles
    return set()


@dataclass
class Fact:
    key: str
    value: Any
    subject: str | None = None
    msg_seq: int = 0
    sender: str = ""
    role: str = "other"
    sent_on: str | None = None
    evidence: str = ""
    evidence_verified: bool = True
    status: str = "active"          # active | superseded | rejected
    reason: str = ""
    id: int | None = None           # DB id once saved
    is_new: bool = False
    dirty: bool = field(default=False, repr=False)   # status/reason changed -> needs saving

    @property
    def ident(self):
        return (self.key, (self.subject or "").strip().lower())

    @property
    def order(self):
        return (self.sent_on or "", self.msg_seq)

    def label(self):
        return f"{self.key} [{self.subject}]" if self.subject else self.key


def fmt_val(v):
    if isinstance(v, dict):
        return ", ".join(f"{k}={x}" for k, x in v.items())
    if isinstance(v, bool):
        return "yes" if v else "no"
    if isinstance(v, (int, float)):
        return f"{v:,}"
    return str(v)


def check_authority(f: Fact) -> str | None:
    """Return a rejection reason if the sender's role may not state this fact."""
    ok = allowed_roles(f.key)
    if f.role in ok:
        return None
    who = ROLE_LABEL.get(f.role, f.role)
    need = " / ".join(sorted(ok)) or "nobody"
    return (f"Sender '{f.sender}' is {who}; '{f.key}' can only be set by: {need}. "
            f"Not accepted as an instruction.")


def resolve(facts: list[Fact], events: list[tuple[str, str]]) -> None:
    """Among facts with the same identity the most recent (date, then arrival order)
    wins; the others become 'superseded'. Each real conflict is logged to `events`."""
    groups: dict[tuple, list[Fact]] = {}
    for f in facts:
        if f.status in ("active", "superseded"):
            groups.setdefault(f.ident, []).append(f)
    for grp in groups.values():
        grp.sort(key=lambda f: f.order)
        winner = grp[-1]
        if winner.status != "active":
            winner.status, winner.reason, winner.dirty = "active", "", True
        for f in grp[:-1]:
            if f.status != "active":
                continue
            f.status, f.dirty = "superseded", True
            if f.value == winner.value:
                f.reason = f"Same value restated in message #{winner.msg_seq}"
                continue
            f.reason = (f"Superseded by message #{winner.msg_seq} ({winner.sent_on or 'undated'}, "
                        f"{winner.sender}): {fmt_val(winner.value)}")
            stale = f.is_new
            events.append((
                "conflict",
                f"{f.label()}: {fmt_val(f.value)} (msg #{f.msg_seq}, {f.sent_on or 'undated'}, {f.sender}) "
                f"{'is older than' if stale else 'superseded by'} {fmt_val(winner.value)} "
                f"(msg #{winner.msg_seq}, {winner.sent_on or 'undated'}, {winner.sender}) - "
                f"{'kept the newer value already in the plan' if stale else 'the newer message wins'}."))


class View:
    """Read-only convenience view over the active facts."""

    def __init__(self, facts: list[Fact]):
        self.active = [f for f in facts if f.status == "active"]

    def get(self, key, default=None):
        vals = [f for f in self.active if f.key == key]
        return vals[-1].value if vals else default

    def items(self, key) -> dict[str, Any]:
        return {(f.subject or ""): f.value for f in self.active if f.key == key}


def _tokens(s: str) -> frozenset:
    import re
    return frozenset(re.findall(r"\w+", (s or "").lower()))


def canonicalize_subjects(old_facts: list, new_facts: list) -> list[tuple[str, str, str]]:
    """The model may name the same item differently ("printing" / "printing bill", "biryani" / "biryani plate").
    A new subject is renamed to an existing one of the SAME fact key when one's words are a subset of the other's
    ("hall a" vs "hall b" are not). Returns [(old_name, canonical_name, key)] for the trace."""
    registry: dict[str, list[str]] = {}
    for f in old_facts:
        if f.subject and f.status != "rejected":
            registry.setdefault(f.key, []).append(f.subject)
    renamed = []
    for f in new_facts:
        if not f.subject:
            continue
        known = registry.setdefault(f.key, [])
        t = _tokens(f.subject)
        match = next((k for k in known if t and (t <= _tokens(k) or _tokens(k) <= t)), None)
        if match is None:
            known.append(f.subject)
        elif match != f.subject:
            renamed.append((f.subject, match, f.key))
            f.subject = match
    return renamed
