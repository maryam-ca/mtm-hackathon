from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/mtm_hackathon"
    llm_provider: str = "anthropic"
    llm_model: str = "claude-haiku-5-5"
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    openai_base_url: str = ""
    llm_timeout_seconds: float = 45.0
    llm_reasoning_effort: str = ""   # e.g. low | medium | high for reasoning models (gpt-oss); empty = provider default
    llm_max_tokens: int = 2800
    pack_min_messages: int = 4
    out_dir: Path = ROOT / "out"


settings = Settings()
