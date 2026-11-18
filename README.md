# Mind to Machine — Event Planner

Reads a pack of messages (English / Roman Urdu), plans a 4-hour hackathon (venue, schedule, food, judging, budget),
accepts later messages as updates, rejects ones that break the plan, and traces every model call.
All state (runs, messages, facts, plan versions, model calls, trace) is stored in **PostgreSQL**.

## Design (why each part exists)
| Part | File | Uses model? | Why |
|---|---|---|---|
| Reading | `extraction.py` | **Yes - 1 call per input** | Turns messy text into structured facts + evidence quotes. The only place language needs a model. |
| Authority + conflicts | `facts.py` | No | Newest dated message wins; senders may only state facts in their remit (a student group cannot change the budget). |
| Planning | `planner.py` | No | Pure arithmetic: judges needed, headcount, cheapest fitting hall, food choice, schedule, budget. |
| Validation | `validator.py` | No | Recomputes figures independently; a bad update is rolled back and the previous valid plan kept. |
| Orchestration | `pipeline.py` | No | full/update via the same entry point, DB persistence, printable trace. |

An update makes at most 2 model calls (1, plus one retry only if the JSON is malformed), all tagged `reading`;
so the prediction slip is always "reading only". Fewer tokens = one compact call, no model arithmetic.

Meal headcount = students + staff + judges actually used (150 + 10 + 17 = 177 for the sample), unless a message states one.
A proposal (e.g. the DJ) is never counted until an organiser approves it.

## Setup
```
copy .env.example .env      # fill DATABASE_URL and model key
createdb mtm_hackathon  # or CREATE DATABASE in pgAdmin
pip install -r backend/requirements.txt
cd frontend && npm install && npm run build && cd ..
```
## Run
```
python plan.py data/sample_pack.txt        # full run (>=4 messages => new plan)
python plan.py data/update_change.txt      # same command => update
python plan.py data/update_wrong.txt       # rejected, plan kept
```
Prints the plan + numbered trace and saves `out/final_plan_and_trace.txt`.

Web UI: `cd backend && uvicorn app.api:app --port 8000` then open http://localhost:8000
(dev: `npm run dev` in `frontend/`, proxied to :8000).

Tests (stub model, no DB/key needed): `cd backend && python -m pytest`

## Reading engines (`LLM_PROVIDER` in `.env`)
| Value | What | Tokens |
|---|---|---|
| `rules` | Free offline engine (`backend/app/rules_extractor.py`). Understands the common phrasings of the sample pack; unusual wording can be missed. Trace labels it "rules-engine (offline, no LLM)". | 0 |
| `openai` | Any OpenAI-compatible API (Groq, Ollama, ...). Set `OPENAI_BASE_URL`, `LLM_MODEL`, `OPENAI_API_KEY`. | as reported |
| `anthropic` | Claude via `ANTHROPIC_API_KEY`. | as reported |

Backend extras: `GET /api/health` (engine + database), `GET /api/samples`, `POST /api/ingest-sample` (one-click run of a file in `data/`).
