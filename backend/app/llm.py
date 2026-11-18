"""Thin model client. Returns the text plus the model name and token counts exactly
as the provider reports them (nothing is estimated)."""
import time
from dataclasses import dataclass

from .config import settings


@dataclass
class LLMResult:
    model: str
    text: str
    tokens_in: int
    tokens_out: int
    duration_ms: int


class LLMError(RuntimeError):
    pass


class LLM:
    def call(self, system: str, user: str, max_tokens: int = 1500) -> LLMResult:
        t0 = time.time()
        try:
            if settings.llm_provider == "rules":
                return self._rules(user, t0)
            if settings.llm_provider == "anthropic":
                return self._anthropic(system, user, max_tokens, t0)
            return self._openai(system, user, max_tokens, t0)
        except LLMError:
            raise
        except Exception as e:  # network, auth, rate limit ...
            raise LLMError(f"{type(e).__name__}: {e}") from e

    def _rules(self, user, t0):
        """Free offline engine - no model, so tokens are honestly 0."""
        import json
        from . import rules_extractor
        out = json.dumps(rules_extractor.read(user))
        return LLMResult("rules-engine (offline, no LLM)", out, 0, 0, int((time.time() - t0) * 1000))

    def _anthropic(self, system, user, max_tokens, t0):
        import anthropic
        if not settings.anthropic_api_key:
            raise LLMError("ANTHROPIC_API_KEY is not set (see .env.example)")
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key,
                                     timeout=settings.llm_timeout_seconds, max_retries=0)
        r = client.messages.create(model=settings.llm_model, system=system, max_tokens=max_tokens,
                                   temperature=0, messages=[{"role": "user", "content": user}])
        text = "".join(b.text for b in r.content if getattr(b, "type", "") == "text")
        return LLMResult(r.model, text, r.usage.input_tokens, r.usage.output_tokens,
                         int((time.time() - t0) * 1000))

    def _openai(self, system, user, max_tokens, t0):
        from openai import OpenAI
        client = OpenAI(api_key=settings.openai_api_key or "none",
                        base_url=settings.openai_base_url or None,
                        timeout=settings.llm_timeout_seconds, max_retries=0)
        extra = {"reasoning_effort": settings.llm_reasoning_effort} if settings.llm_reasoning_effort else {}
        r = client.chat.completions.create(
            model=settings.llm_model, temperature=0, max_tokens=max(max_tokens, settings.llm_max_tokens),
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}], **extra)
        u = r.usage
        return LLMResult(r.model, r.choices[0].message.content or "",
                         u.prompt_tokens, u.completion_tokens, int((time.time() - t0) * 1000))
