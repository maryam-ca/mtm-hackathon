# Mind to Machine — Event Planner

An agent system that reads a pack of messages (English + Roman Urdu) and plans a 4-hour hackathon:
**venue, schedule, food, judging, budget**. It accepts new messages after the first run and updates the plan,
rejects messages that would break the plan (and says why), and prints a full model-call trace.
All state — runs, messages, facts, plan versions, model calls, trace — is stored in **PostgreSQL**.

```
messages.txt ──► [ model: READ ] ──► facts + evidence ──► [ code: authority → conflicts → plan → validate ] ──► plan / reject
                  1 call, area "reading"                      plain Python, no tokens                        saved in Postgres
```

## Why each part exists
| Part | File | Model? | What would break without it |
|---|---|---|---|
| Reading | `backend/app/extraction.py` | **Yes — 1 call per input** | Messy English/Roman Urdu text could not become structured facts. It is the only place language needs a model. |
| Authority + conflicts | `backend/app/facts.py` | No | A student group could change the budget; an old price (Rs 1,000) could beat the newer one (Rs 1,200). |
| Planning | `backend/app/planner.py` | No | Arithmetic (17 judges, 177 meals, cheapest fitting hall, schedule, budget) is done exactly by code, not guessed by a model. |
| Validation | `backend/app/validator.py` | No | Figures are recomputed independently; without it a wrong message ("order cut to 100 boxes") would be accepted. |
| Pipeline | `backend/app/pipeline.py` | No | Same entry point for the first pack and every update; keeps the previous valid plan if an update fails validation; stores everything. |
| API + UI | `backend/app/api.py`, `frontend/` | No | Plan, trace, facts and rejected messages need to be visible and exportable. |

Decisions: people to feed = students + staff + judges actually used (150 + 10 + 17 = 177 for the sample pack) unless a message states a number.
A proposal (e.g. the DJ) is never counted in the budget until an organiser approves it. Newest dated message wins a conflict.
Roles allowed to state each kind of fact are in `facts.py` (`AUTHORITY`).

## Setup
```
copy .env.example .env             # then fill in OPENAI_API_KEY (Groq) and the DATABASE_URL password
# create an empty database called  mtm_hackathon  (pgAdmin, or: createdb mtm_hackathon)
pip install -r backend/requirements.txt
cd frontend && npm install && npm run build && cd ..
```
`.env` is git-ignored — never commit keys. Tables are created automatically on first run.

## Run
One command for everything:
```
python plan.py data/sample_pack.txt      # a pack (>= 4 messages) builds a new plan
python plan.py data/update_change.txt    # fewer messages = an update to the current plan (budget changes)
python plan.py data/update_wrong.txt     # plausible but wrong -> rejected, previous plan kept
```
It prints the plan and the numbered trace (model name, area, input, output, token counts, **total tokens**) and saves it to
`out/final_plan_and_trace.txt`. Sending a message that is already applied returns `unchanged` and stores nothing twice.

Web UI (React + Vite, served by the API):
```
cd backend
python -m uvicorn app.api:app --port 8000      # open http://localhost:8000
```
Pages: Overview · Messages & Inbox (click a message → extraction inspector) · Fact Store & Evidence · Conflict Detection ·
Venue / Schedule / Food / Judging / Budget (charts + table view) · Cross-Area Validation · AI Model Trace · Rejected Messages · Reports & Exports.
Dev mode: `cd frontend && npm run dev` (proxied to :8000). Restart the API after changing `.env`.

## Reading engines (`LLM_PROVIDER`)
| Value | What | Tokens |
|---|---|---|
| `openai` | Any OpenAI-compatible API — **Groq** (`openai/gpt-oss-20b`), Ollama, … | as reported by the API |
| `anthropic` | Claude via `ANTHROPIC_API_KEY` | as reported |
| `rules` | Free offline engine (`rules_extractor.py`), no key. Handles common phrasings only; the trace labels it "rules-engine (offline, no LLM)". | 0 |

Groq notes: the free tier allows 8,000 tokens/minute (a full run ≈ 2.5k, an update ≈ 1k), so run updates a few seconds apart if you get a 429.
`gpt-oss` is a reasoning model — keep `LLM_REASONING_EFFORT=low` or it spends every token thinking and returns nothing.
An update makes **one** model call (a second only if the JSON is malformed, or a relevant message produced no facts); the limit is 5.

## Tests
```
python -m pytest                              # 23 offline tests — no key, no database needed
python backend/eval/run_accuracy.py           # live model accuracy test (uses your Groq key, ≈ 11k tokens, ≈ 1 min)
python backend/eval/run_accuracy.py reworded  # only cases whose name contains "reworded"
```
**Unit/integration tests** (`backend/tests/`): planning numbers, conflict resolution, authority, rollback of a bad update, repeat-message handling,
the offline engine end-to-end on the real `data/*.txt` files, and a check that every accuracy case is well-formed.

**Accuracy test** (`backend/eval/`): the model reads 8 cases (`backend/eval/cases/*.json`, messages I wrote — the official pack, an unseen-style
pack with different numbers/senders/wording/a mandatory generator, a judging-style pack (step-free access, a hall under maintenance, a 10% service charge,
an irrelevant notice), a changed figure, a wrong message, Roman Urdu, chit-chat that must yield no facts, an unauthorised budget change) and is scored on facts (precision/recall/F1), sender roles, evidence quotes found verbatim in the input, and whether
the resulting plan is valid with the right venue/total/people. Exit code 1 if F1 < 85%, any error, or a plan check fails. Report: `out/accuracy_report.json`.

Results vary from run to run (the API is not perfectly deterministic even at temperature 0): full runs scored 88–99% fact F1 while fixes were added,
and the judging-style case scored 100% facts with the correct plan (Hall 2, Rs 344,160). Run it yourself for current numbers (`out/accuracy_report.json`).
Failures found by this test led to code fixes: a relevant message with no facts (retry), JSON followed by extra text (robust parser), inconsistent names
("Room D" vs "Hall D", "printing" vs "printing bill" — subjects are matched to existing ones), "Jury secretary" read as a judge, and a model shifting hall
names (a hall whose name and seats do not match the text is re-asked). Known imperfection: the model sometimes adds a derived fact (`event.teams = 50`) — harmless.

**New kinds of constraint handled in code** (see `facts.py` vocabulary): step-free access (`event.step_free_required`, per-hall `accessible`), a hall that cannot be
booked (`venue.unavailable`), a food service-charge percent, and the `office` role (e.g. a disability office may demand step-free access; a student group may not).

## Test-day checklist
1. `git status` clean and `git log -1` equals the submitted hash (no edits after the freeze).
2. `.env` on the test machine: Groq key, `LLM_REASONING_EFFORT=low`, database URL; Postgres running; `mtm_hackathon` exists.
3. `python plan.py <unseen pack>` — then each new message with the same command. Prediction slip: every update makes model calls in **reading only** (planning/validation are code).
4. Save the final file from `out/final_plan_and_trace.txt` (or Reports & Exports in the UI) and upload it.

## Known limits
- Constraints of a kind outside the fact vocabulary (`facts.py`) are kept as "other rules" notes and shown, but not enforced.
- Opening/lunch/closing lengths are planner policy, not event facts.
- Whether the chosen model is on the organisers' small-model list must be checked with the organisers.
