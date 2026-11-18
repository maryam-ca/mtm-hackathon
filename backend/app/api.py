from fastapi import FastAPI, HTTPException
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy.engine import make_url

from . import db, pipeline
from .config import ROOT, settings

app = FastAPI(title="Hackathon Planner")
DATA = ROOT / "data"


@app.on_event("startup")
def _startup():
    db.init_db()


class IngestBody(BaseModel):
    text: str
    name: str = "pasted"
    mode: str = "auto"   # auto | full | update


class SampleBody(BaseModel):
    name: str
    mode: str = "auto"


def _samples():
    out = []
    for f in sorted(DATA.glob("*.txt")):
        text = f.read_text(encoding="utf-8-sig")
        n = pipeline.count_messages(text)
        out.append(dict(name=f.name, messages=n, chars=len(text), text=text,
                        kind="pack" if n >= settings.pack_min_messages else "update",
                        preview=" ".join(text.split())[:140]))
    return out


@app.get("/api/health")
def health():
    """Which engine reads the messages and where the data is stored (password never exposed)."""
    url = make_url(db.engine().url.render_as_string(hide_password=True))
    offline = settings.llm_provider == "rules"
    return dict(
        engine=dict(provider=settings.llm_provider, model="rules-engine (offline, no LLM)" if offline else settings.llm_model,
                    uses_llm=not offline, key_set=bool(settings.anthropic_api_key or settings.openai_api_key)),
        database=dict(driver=url.get_backend_name(), name=url.database, host=url.host, port=url.port))


@app.get("/api/samples")
def samples():
    return _samples()


@app.get("/api/state")
def state():
    return pipeline.get_state()


@app.post("/api/ingest")
def ingest(body: IngestBody):
    if not body.text.strip():
        raise HTTPException(400, "Empty input")
    if body.mode not in ("auto", "full", "update"):
        raise HTTPException(400, "mode must be auto, full or update")
    res = pipeline.ingest(body.text, body.name, body.mode)
    return dict(result=res, state=pipeline.get_state())


@app.post("/api/ingest-sample")
def ingest_sample(body: SampleBody):
    match = next((s for s in _samples() if s["name"] == body.name), None)   # only files listed in data/
    if not match:
        raise HTTPException(404, "Unknown sample")
    res = pipeline.ingest(match["text"], match["name"], body.mode)
    return dict(result=res, state=pipeline.get_state())


@app.get("/api/export", response_class=PlainTextResponse)
def export():
    return pipeline.render_text(pipeline.get_state())


dist = ROOT / "frontend" / "dist"
if dist.exists():
    app.mount("/", StaticFiles(directory=dist, html=True), name="ui")
