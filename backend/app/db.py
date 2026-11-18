"""Postgres persistence. Every run, message, fact, plan version, model call and
trace event is stored so the interface and exports can be rebuilt from the DB."""
from datetime import datetime, timezone

from sqlalchemy import (JSON, Boolean, Column, DateTime, ForeignKey, Integer,
                        MetaData, String, Table, Text, create_engine, func, select)
from sqlalchemy.dialects.postgresql import JSONB

from .config import settings

Json = JSON().with_variant(JSONB(), "postgresql")
metadata = MetaData()


def now():
    return datetime.now(timezone.utc)


sessions = Table(
    "sessions", metadata,
    Column("id", Integer, primary_key=True),
    Column("created_at", DateTime(timezone=True), default=now),
)
runs = Table(
    "runs", metadata,
    Column("id", Integer, primary_key=True),
    Column("session_id", Integer, ForeignKey("sessions.id"), index=True),
    Column("kind", String(10)),                 # full | update
    Column("input_name", String(255)),
    Column("input_text", Text),
    Column("outcome", String(20)),              # committed | rejected | invalid | failed
    Column("summary", Text),
    Column("duration_ms", Integer),
    Column("tokens_in", Integer, default=0),
    Column("tokens_out", Integer, default=0),
    Column("affected_areas", Json),
    Column("created_at", DateTime(timezone=True), default=now),
)
messages = Table(
    "messages", metadata,
    Column("id", Integer, primary_key=True),
    Column("session_id", Integer, ForeignKey("sessions.id"), index=True),
    Column("run_id", Integer, ForeignKey("runs.id")),
    Column("seq", Integer),                     # position within the session
    Column("sender", String(255)),
    Column("role", String(30)),
    Column("sent_on", String(20)),
    Column("quote", Text),                      # original evidence text
    Column("relevant", Boolean, default=True),
    Column("status", String(20)),               # accepted | irrelevant | rejected
    Column("reason", Text),
)
facts = Table(
    "facts", metadata,
    Column("id", Integer, primary_key=True),
    Column("session_id", Integer, ForeignKey("sessions.id"), index=True),
    Column("run_id", Integer, ForeignKey("runs.id")),
    Column("msg_seq", Integer),
    Column("key", String(60)),
    Column("subject", String(120)),
    Column("value", Json),
    Column("sender", String(255)),
    Column("role", String(30)),
    Column("sent_on", String(20)),
    Column("evidence", Text),
    Column("evidence_verified", Boolean, default=True),
    Column("status", String(20)),               # active | superseded | rejected
    Column("reason", Text),
)
plan_versions = Table(
    "plan_versions", metadata,
    Column("id", Integer, primary_key=True),
    Column("session_id", Integer, ForeignKey("sessions.id"), index=True),
    Column("run_id", Integer, ForeignKey("runs.id")),
    Column("plan", Json),
    Column("checks", Json),
    Column("valid", Boolean),
    Column("created_at", DateTime(timezone=True), default=now),
)
model_calls = Table(
    "model_calls", metadata,
    Column("id", Integer, primary_key=True),
    Column("run_id", Integer, ForeignKey("runs.id"), index=True),
    Column("seq", Integer),
    Column("model", String(120)),
    Column("area", String(20)),
    Column("input", Text),
    Column("output", Text),
    Column("tokens_in", Integer),
    Column("tokens_out", Integer),
    Column("duration_ms", Integer),
)
trace_events = Table(
    "trace_events", metadata,
    Column("id", Integer, primary_key=True),
    Column("run_id", Integer, ForeignKey("runs.id"), index=True),
    Column("seq", Integer),
    Column("kind", String(20)),   # conflict | rejection | decision | warning | info
    Column("text", Text),
)

_engine = None


def engine():
    global _engine
    if _engine is None:
        _engine = create_engine(settings.database_url, pool_pre_ping=True, future=True)
    return _engine


def set_engine(url: str):
    """Used by tests to point at a throw-away database."""
    global _engine
    _engine = create_engine(url, future=True)
    return _engine


def init_db():
    metadata.create_all(engine())


# ---------- helpers ----------
def current_session_id(conn) -> int | None:
    return conn.execute(select(func.max(sessions.c.id))).scalar()


def new_session(conn) -> int:
    return conn.execute(sessions.insert().values(created_at=now())).inserted_primary_key[0]
