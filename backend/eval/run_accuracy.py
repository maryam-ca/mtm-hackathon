"""Model accuracy test: reads each case's messages with the REAL model and scores the extracted facts.

    python backend/eval/run_accuracy.py            # all cases
    python backend/eval/run_accuracy.py reworded   # only cases whose name contains "reworded"

Cases live in backend/eval/cases/*.json (messages + the facts a correct reader must find).
No database is touched. Tokens/latency are the model's real numbers. Exit code 1 if F1 < THRESHOLD."""
import json
import re
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE.parent))
sys.stdout.reconfigure(encoding="utf-8")

from app import extraction                       # noqa: E402
from app.config import settings                  # noqa: E402
from app.facts import View, check_authority, resolve  # noqa: E402
from app.llm import LLM, LLMError                # noqa: E402
from app.planner import build_plan               # noqa: E402
from app.validator import is_valid, validate     # noqa: E402

THRESHOLD = 0.85
G, R, Y, B, X = "\033[32m", "\033[31m", "\033[33m", "\033[36m", "\033[0m"


def norm(v):
    if isinstance(v, dict):
        return json.dumps({k: norm(x) for k, x in sorted(v.items())}, sort_keys=True)
    if isinstance(v, bool):
        return str(v).lower()
    if isinstance(v, (int, float)):
        return str(int(v)) if float(v).is_integer() else str(v)
    return str(v).strip().lower()


def key_of(k, s, v):
    return (k, (s or "").strip().lower(), norm(v))


def call_with_retry(text, known, llm, calls):
    """The free tier rate-limits by tokens/minute: wait as the API asks, then retry (max 4 times)."""
    for attempt in range(4):
        try:
            return extraction.extract(text, known, 0, llm, 2, calls)
        except LLMError as e:
            m = re.search(r"try again in ([\d.]+)s", str(e))
            if "429" in str(e) or "RateLimit" in str(e):
                wait = (float(m.group(1)) if m else 20) + 3
                print(f"    {Y}rate limit - waiting {wait:.0f}s{X}")
                time.sleep(wait)
                continue
            raise
    raise LLMError("rate limit did not clear")


def load_cases(pattern):
    cases = []
    for f in sorted((HERE / "cases").glob("*.json")):
        c = json.loads(f.read_text(encoding="utf-8"))
        c["name"] = f.stem
        if "text_file" in c:                       # reuse a real data file (e.g. the sample pack)
            c["text"] = (ROOT / c["text_file"]).read_text(encoding="utf-8-sig")
        if not pattern or pattern in c["name"]:
            cases.append(c)
    return cases


def score_case(c, llm):
    calls = []
    t0 = time.time()
    try:
        msgs, facts = call_with_retry(c["text"], c.get("known", []), llm, calls)
        ok_json = True
    except LLMError as e:
        return dict(name=c["name"], error=str(e)[:200])
    optional = {key_of(e["k"], e.get("s"), e["v"]) for e in c.get("expected", []) if e.get("optional")}
    exp = {key_of(e["k"], e.get("s"), e["v"]): e for e in c.get("expected", []) if not e.get("optional")}
    got = {key_of(f.key, f.subject, f.value): f for f in facts if key_of(f.key, f.subject, f.value) not in optional}
    tp = set(exp) & set(got)
    fn, fp = set(exp) - set(got), set(got) - set(exp)
    P = len(tp) / len(got) if got else (1.0 if not exp else 0.0)
    Rc = len(tp) / len(exp) if exp else 1.0
    F1 = 2 * P * Rc / (P + Rc) if P + Rc else 0.0
    verb = sum(f.evidence_verified for f in facts) / len(facts) if facts else 1.0

    roles_ok = roles_tot = 0
    for sender, role in c.get("roles", {}).items():
        roles_tot += 1
        roles_ok += any(sender.lower() in m["sender"].lower() and m["role"] == role for m in msgs)

    plan_ok = None
    if "expected_plan" in c:                        # end-to-end: model facts -> authority -> conflicts -> plan
        for f in facts:
            if check_authority(f):
                f.status = "rejected"
        resolve(facts, [])
        plan = build_plan(View(facts))
        checks = validate(plan)
        ep, plan_ok = c["expected_plan"], True
        if "valid" in ep: plan_ok &= is_valid(checks) == ep["valid"]
        if "venue" in ep: plan_ok &= plan.get("venue", {}).get("chosen") == ep["venue"]
        if "total" in ep: plan_ok &= plan.get("budget", {}).get("total") == ep["total"]
        if "people" in ep: plan_ok &= plan.get("food", {}).get("people") == ep["people"]
    return dict(name=c["name"], desc=c.get("description", ""), tp=len(tp), fp=len(fp), fn=len(fn), P=P, R=Rc, F1=F1,
                verbatim=verb, roles=(roles_ok, roles_tot), plan_ok=plan_ok,
                tokens_in=sum(x["tokens_in"] for x in calls), tokens_out=sum(x["tokens_out"] for x in calls),
                ms=int((time.time() - t0) * 1000), model=calls[0]["model"] if calls else "?", calls=len(calls),
                missing=sorted(f"{k[0]}[{k[1]}]={k[2]}" for k in fn), extra=sorted(f"{k[0]}[{k[1]}]={k[2]}" for k in fp))


def main():
    pattern = sys.argv[1] if len(sys.argv) > 1 else ""
    cases = load_cases(pattern)
    print(f"{B}MODEL ACCURACY TEST{X}  model={settings.llm_model}  provider={settings.llm_provider}  cases={len(cases)}\n")
    if settings.llm_provider == "rules":
        print(f"{Y}Note: provider is 'rules' (offline engine). Set LLM_PROVIDER=openai to test the real model.{X}\n")
    llm, results = LLM(), []
    for i, c in enumerate(cases, 1):
        print(f"[{i}/{len(cases)}] {c['name']} - {c.get('description', '')}")
        r = score_case(c, llm)
        results.append(r)
        if "error" in r:
            print(f"    {R}ERROR{X} {r['error']}\n")
            continue
        col = G if r["F1"] >= THRESHOLD else R
        print(f"    facts: {G}{r['tp']} correct{X}, {R}{r['fn']} missing{X}, {Y}{r['fp']} extra{X}  |  "
              f"precision {r['P']:.0%}  recall {r['R']:.0%}  F1 {col}{r['F1']:.0%}{X}  |  evidence verbatim {r['verbatim']:.0%}")
        if r["roles"][1]:
            print(f"    sender roles: {r['roles'][0]}/{r['roles'][1]} correct")
        if r["plan_ok"] is not None:
            print(f"    end-to-end plan check: {G + 'PASS' if r['plan_ok'] else R + 'FAIL'}{X}")
        print(f"    tokens in/out {r['tokens_in']}/{r['tokens_out']}  |  {r['ms'] / 1000:.1f}s  |  {r['calls']} model call(s)")
        for m in r["missing"][:6]: print(f"      {R}missing:{X} {m}")
        for m in r["extra"][:6]: print(f"      {Y}extra  :{X} {m}")
        print()
        time.sleep(4)

    done = [r for r in results if "error" not in r]
    tp, fp, fn = (sum(r[k] for r in done) for k in ("tp", "fp", "fn"))
    P = tp / (tp + fp) if tp + fp else 1.0
    Rc = tp / (tp + fn) if tp + fn else 1.0
    F1 = 2 * P * Rc / (P + Rc) if P + Rc else 0.0
    rt = sum(r["roles"][1] for r in done); rk = sum(r["roles"][0] for r in done)
    pl = [r["plan_ok"] for r in done if r["plan_ok"] is not None]
    print("=" * 78)
    print(f"{'case':<22}{'F1':>6}{'prec':>7}{'recall':>8}{'tokens':>9}{'time':>8}")
    for r in results:
        if "error" in r: print(f"{r['name']:<22}{R}  ERROR{X}"); continue
        col = G if r["F1"] >= THRESHOLD else R
        print(f"{r['name']:<22}{col}{r['F1']:>6.0%}{X}{r['P']:>7.0%}{r['R']:>8.0%}{r['tokens_in'] + r['tokens_out']:>9}{r['ms'] / 1000:>7.1f}s")
    print("-" * 78)
    print(f"OVERALL  fact F1 {F1:.1%}  (precision {P:.1%}, recall {Rc:.1%})  |  roles {rk}/{rt}  |  "
          f"plan checks {sum(pl)}/{len(pl)}  |  tokens {sum(r['tokens_in'] + r['tokens_out'] for r in done)}  |  errors {len(results) - len(done)}")
    verdict = F1 >= THRESHOLD and len(done) == len(results) and all(pl)
    print(f"{G + 'PASS' if verdict else R + 'FAIL'}{X}  (threshold: F1 >= {THRESHOLD:.0%}, no errors, all plan checks pass)")
    out = ROOT / "out" / "accuracy_report.json"
    out.write_text(json.dumps(dict(model=settings.llm_model, overall=dict(f1=F1, precision=P, recall=Rc), cases=results), indent=2), encoding="utf-8")
    print(f"report saved: {out}")
    sys.exit(0 if verdict else 1)


if __name__ == "__main__":
    main()
