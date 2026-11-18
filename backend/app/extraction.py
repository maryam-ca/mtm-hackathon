"""The ONLY place a model is used: reading messy English / Roman Urdu text into
structured facts. Arithmetic and planning are plain code."""
import json
import re
from datetime import date

from .facts import ROLES, VOCAB, Fact
from .llm import LLM, LLMError

SYSTEM = (
    "You read event-planning messages (English / Roman Urdu: emails, WhatsApp, notices) and extract facts as JSON. "
    "Output ONLY a JSON object, no prose:\n"
    '{"messages":[{"n":1,"sender":"..","role":"<role>","date":"YYYY-MM-DD or null","relevant":true,'
    '"why":"only if relevant=false: short reason","quote":"first 8 words of the message"}],'
    '"facts":[{"n":1,"k":"<key>","s":"<subject or null>","v":<value>,"q":"exact words from the message that state it"}]}\n'
    "Rules: in messages, n = the message's position in the text (1,2,3...). In facts, n = the n of the message the fact "
    "comes from (several facts share the same n; it is NOT a running count). Output every message and every fact, "
    "keep q short (the exact words, at most 8), and write no explanations. Copy each message's sender and date as written; "
    "write dates as YYYY-MM-DD using the current year when no year is given. role is one of: "
    + ", ".join(ROLES) + " (organizer = the party that approves/owns the event, e.g. dean's office or admin). "
    "relevant=false for chit-chat or content with no event-planning fact. Rs amounts are plain integers "
    "(Rs 1,200 -> 1200). A request or quote that nobody approved is proposal.expense, not expense.committed. "
    "Emit ONE fact per item: every hall, every meal type, every expense line gets its own fact - never merge or skip any. "
    "Do not compute anything and do not invent facts (only state what the message says; do not derive event.teams). "
    "student = a student group/society/council. Someone saying they will arrive N minutes late is judge.late_min (not constraint.other). "
    "An irrelevant message has no facts. "
    "Use ONLY these keys:\n" + "\n".join(f"{k}: {d}" for k, d in VOCAB.items())
)


def build_user_prompt(text: str, known: list[str]) -> str:
    ctx = ("Subjects already known (reuse the same spelling): " + "; ".join(known) + "\n") if known else ""
    return f"Today: {date.today().isoformat()}\n{ctx}MESSAGES:\n{text.strip()}"


def _json_from(text: str):
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        a, b = text.find("{"), text.rfind("}")
        if a != -1 and b > a:
            return json.loads(text[a:b + 1])
        raise


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", "", s.lower())).strip()


def parse(raw: dict, source_text: str, seq_offset: int):
    """Model JSON -> message dicts + Fact objects. Each evidence quote is checked
    against the original text so an invented quote gets flagged."""
    norm_src = _norm(source_text)
    msgs: dict[int, dict] = {}
    for m in raw.get("messages", []):
        n = int(m.get("n", 0))
        role = m.get("role") if m.get("role") in ROLES else "other"
        msgs[n] = dict(seq=seq_offset + n, sender=m.get("sender") or "unknown", role=role,
                       sent_on=m.get("date"), quote=m.get("quote") or "",
                       relevant=bool(m.get("relevant", True)), reason=m.get("why") or "")
    facts = []
    for f in raw.get("facts", []):
        m = msgs.get(int(f.get("n", 0)))
        key = f.get("k")
        if key not in VOCAB or m is None or not m["relevant"]:
            continue
        q = f.get("q") or ""
        facts.append(Fact(key=key, subject=(f.get("s") or None), value=f.get("v"), msg_seq=m["seq"],
                          sender=m["sender"], role=m["role"], sent_on=m["sent_on"], evidence=q,
                          evidence_verified=bool(q) and _norm(q) in norm_src, is_new=True))
    return sorted(msgs.values(), key=lambda m: m["seq"]), facts


def extract(text: str, known: list[str], seq_offset: int, llm: LLM, max_calls: int, calls: list):
    """One model call, retried only if the JSON is malformed. Every call is appended to `calls`."""
    user = build_user_prompt(text, known)
    err = None
    for _ in range(max_calls):
        res = llm.call(SYSTEM, user, max_tokens=1800)
        calls.append(dict(model=res.model, area="reading", input=f"[system]\n{SYSTEM}\n\n[user]\n{user}",
                          output=res.text, tokens_in=res.tokens_in, tokens_out=res.tokens_out,
                          duration_ms=res.duration_ms))
        try:
            return parse(_json_from(res.text), text, seq_offset)
        except (ValueError, TypeError, KeyError, AttributeError) as e:
            err = e
            user += "\n\n(Your previous answer was not valid JSON. Reply with the JSON object only.)"
    raise LLMError(f"Model output could not be parsed after {max_calls} attempt(s): {err}")
