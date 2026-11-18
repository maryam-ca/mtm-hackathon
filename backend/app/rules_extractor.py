"""Offline reading engine (no LLM, no API key, zero tokens).

It produces the SAME JSON contract the model prompt asks for, so the rest of the
pipeline is unchanged. It is a free fallback: it understands the common phrasings
of the sample pack (English + a little Roman Urdu) but, unlike a model, it will miss
unusual wording. The trace labels it honestly as a rules engine, not a model."""
import re
from datetime import date

WORDS = {w: i for i, w in enumerate(
    "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty".split())}
MONTHS = {m: i for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split(), 1)}
ROLE_RULES = [
    ("organizer", r"dean|office of|admin|registrar|university|principal|organi[sz]er|committee|chair|patron"),
    ("finance", r"finance|account|treasur|bursar"),
    ("coordinator", r"judging|coordinator"),
    ("judge", r"judge"),
    ("vendor", r"cater|hall|venue|vendor|supplier|restaurant|events?\b"),
    ("student", r"student|society|council|club"),
]
RS = r"rs\.?\s*([\d,]+)"


def _num(s):
    s = str(s).lower().replace(",", "")
    return int(s) if s.isdigit() else WORDS.get(s)


def _rs(s):
    return int(s.replace(",", ""))


def split_messages(text):
    blocks = [b.strip() for b in re.split(r"\n\s*\n", text.strip()) if b.strip()]
    if len(blocks) <= 1 and not re.match(r"^\s*from\s*:", text, re.I):   # one 'From:' block is ONE message
        blocks = [ln.strip() for ln in text.splitlines() if ln.strip()]
    return blocks


def _header_body(block):
    lines = block.splitlines()
    m = re.match(r"^\s*from\s*:?\s*(.+)$", lines[0], re.I)
    if m:
        body = "\n".join(lines[1:]).strip()
        return m.group(1).strip(), (body or m.group(1))
    return None, block


def _date(header):
    if not header:
        return None
    m = re.search(r"\b(\d{1,2})\s+([A-Za-z]{3})[a-z]*\b", header)
    if m and m.group(2).lower() in MONTHS:
        return date(date.today().year, MONTHS[m.group(2).lower()], int(m.group(1))).isoformat()
    return None


def _role(sender, body):
    for role, pat in ROLE_RULES:
        if re.search(pat, sender, re.I):
            return role
    for role, pat in ROLE_RULES[:2]:           # weak signal from the body: "Finance here", "Dean's office"
        if re.search(pat, body[:40], re.I):
            return role
    return "other"


def facts_from(body):
    """-> list of (key, subject, value, verbatim_quote)"""
    out, g = [], lambda m, i=0: m.group(i)
    f = lambda pat, **kw: re.finditer(pat, body, re.I)

    for m in f(r"(\d[\d,]*)\s+students"): out.append(("event.students", None, _rs(m.group(1)), g(m)))
    for m in f(r"teams?\s+of\s+(\w+)"):
        if _num(m.group(1)): out.append(("event.team_size", None, _num(m.group(1)), g(m)))
    for m in f(r"(\d+(?:\.\d+)?)[- ]hours?\b"): out.append(("event.duration_hours", None, float(m.group(1)) if "." in m.group(1) else int(m.group(1)), g(m)))
    for m in f(r"budget\s+(?:is|of|cap(?:\s+is)?)?\s*:?\s*" + RS): out.append(("event.budget_total", None, _rs(m.group(1)), g(m)))
    for m in f(r"(\w+)\s+staff\b"):
        if _num(m.group(1)): out.append(("event.staff", None, _num(m.group(1)), g(m)))
    for m in f(r"(\d+)[- ]minute\s+prayer"): out.append(("event.prayer_min", None, int(m.group(1)), g(m)))
    for m in f(r"generator\s+(?:is\s+)?(?:required|mandatory|compulsory)|must\s+have\s+(?:a\s+)?generator"): out.append(("event.generator_required", None, True, g(m)))
    for m in f(r"(?:start|begin)s?\s+(?:at\s+)?(\d{1,2}:\d{2})"): out.append(("event.start_time", None, m.group(1), g(m)))

    # venue halls (+ which of them have a generator)
    gens = set()
    for m in f(r"halls?\s+((?:[a-z]\b\s*(?:,|and|&)?\s*)+)\s+(?:have|has)\s+(?:a\s+)?(?:standby\s+)?generator"):
        gens |= {x.upper() for x in re.findall(r"\b[A-Za-z]\b", m.group(1))}
    for m in f(r"\b(room|hall)\s+([a-z0-9]+)\s+seats\s+(\d+)\s+at\s+" + RS.replace("([", "([")):
        name = f"{m.group(1).title()} {m.group(2).upper()}"
        out.append(("venue.hall", name, {"seats": int(m.group(3)), "price": _rs(m.group(4)), "generator": m.group(2).upper() in gens}, g(m)))

    # food
    free = re.search(r"delivery\s+(?:is\s+)?free", body, re.I)
    dm = re.search(r"delivery[^.\d]{0,20}" + RS, body, re.I)
    delivery = 0 if free else (_rs(dm.group(1)) if dm else 0)
    for m in f(r"\b(standard|basic|premium|deluxe)\b[^.\d]{0,40}?" + RS):
        out.append(("food.price", m.group(1).lower(), {"price": _rs(m.group(2)), "delivery": delivery}, g(m)))
    if re.search(r"order|supply|deliver", body, re.I):
        for m in f(r"(\d[\d,]*)\s+(?:lunch\s+)?(?:boxes|meals|packs)"): out.append(("food.order_qty", None, _rs(m.group(1)), g(m)))

    # judging
    for m in f(r"(\d+)\s+judges?\s+(?:have\s+)?(?:been\s+)?confirmed"): out.append(("judge.confirmed", None, int(m.group(1)), g(m)))
    for m in f(r"honorarium\s+(?:is|of)\s+" + RS): out.append(("judge.fee", None, _rs(m.group(1)), g(m)))
    for m in f(r"(\d+)\s+minutes?\s+per\s+team"): out.append(("judge.min_per_team", None, int(m.group(1)), g(m)))
    for m in f(r"(?:no\s+more\s+than|at\s+most|up\s+to|maximum\s+of)\s+(\w+)\s+teams"):
        if _num(m.group(1)): out.append(("judge.max_teams", None, _num(m.group(1)), g(m)))
    for m in f(r"(\d+)\s+minutes?\s+late"): out.append(("judge.late_min", None, int(m.group(1)), g(m)))

    # spend already committed, and corrections like "the printing bill came in at Rs 15,000"
    om = re.search(r"already\s+(?:ordered|spent|paid)|ordered\s+from", body, re.I)
    if om:
        for m in re.finditer(r"([A-Za-z][A-Za-z ]*?)\s+" + RS, body[om.end():], re.I):
            item = re.sub(r"^(?:and|&|the|from the event budget)\s+", "", m.group(1).strip(), flags=re.I).lower()
            if item: out.append(("expense.committed", item, _rs(m.group(2)), m.group(0).strip(" ,")))
    for m in f(r"\b(\w+)\s+bill\s+(?:came\s+in|is|was|now)\s+(?:at\s+)?" + RS):
        out.append(("expense.committed", m.group(1).lower(), _rs(m.group(2)), g(m)))

    # proposals: a request/quote nobody approved
    pm = re.search(r"can\s+we\s+(?:get|have|book|add)\s+an?\s+([A-Za-z][A-Za-z ]*?)(?:\s+for|\s+at|[?.,])", body, re.I)
    qm = re.search(r"(?:quote|cost|price)\s+(?:is|of)?\s*" + RS, body, re.I)
    if pm and qm: out.append(("proposal.expense", pm.group(1).strip(), _rs(qm.group(1)), qm.group(0)))
    return out


def read(user_prompt: str):
    """Build the model-contract JSON (as a dict) from the prompt text after 'MESSAGES:'."""
    text = user_prompt.split("MESSAGES:\n", 1)[-1]
    messages, facts = [], []
    for n, block in enumerate(split_messages(text), 1):
        header, body = _header_body(block)
        sender = (header or "unknown").split(",")[0].strip() or "unknown"
        fs = facts_from(body)
        messages.append(dict(n=n, sender=sender, role=_role(sender, body), date=_date(header), relevant=bool(fs),
                             why="" if fs else "no event-planning fact found", quote=" ".join(body.split()[:8])))
        for k, s, v, q in fs:
            facts.append(dict(n=n, k=k, s=s, v=v, q=q.strip()))
    return dict(messages=messages, facts=facts)
