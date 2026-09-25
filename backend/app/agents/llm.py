"""Single entry point for every LLM call.

Task → model routing (large model only for replies, small model for classify/extract/validate),
automatic fallback Mistral → Gemini, and per-call usage tracking for the developer traces.
"""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Callable, TypeVar

from langchain_core.messages import AIMessage, BaseMessage
from pydantic import BaseModel

from app.core.config import settings

logger = logging.getLogger("lifecoach.llm")

T = TypeVar("T", bound=BaseModel)

# task → (temperature, uses reply model?)
TASKS: dict[str, tuple[float, bool]] = {
    "reply": (0.85, True),
    "classify": (0.0, False),
    "validate": (0.1, False),
    "plan": (0.4, False),
    "extract": (0.0, False),
    "merge": (0.0, False),
    "behaviour": (0.2, False),
    "nudge": (0.9, False),
    "creative": (0.9, False),
}


@dataclass
class LLMCall:
    task: str
    provider: str
    model: str
    input_tokens: int
    output_tokens: int
    ms: float
    fallback: bool = False


@dataclass
class Usage:
    """Collects every LLM call made during one graph run (thread-safe)."""

    calls: list[LLMCall] = field(default_factory=list)
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def add(self, call: LLMCall) -> None:
        with self._lock:
            self.calls.append(call)

    def since(self, index: int) -> list[LLMCall]:
        with self._lock:
            return list(self.calls[index:])

    def __len__(self) -> int:
        return len(self.calls)

    @property
    def input_tokens(self) -> int:
        return sum(c.input_tokens for c in self.calls)

    @property
    def output_tokens(self) -> int:
        return sum(c.output_tokens for c in self.calls)

    @property
    def providers(self) -> list[str]:
        return sorted({c.provider for c in self.calls})


class LLMUnavailable(RuntimeError):
    pass


_model_cache: dict[tuple, object] = {}


def _mistral(task: str):
    temperature, big = TASKS.get(task, (0.3, False))
    model = settings.llm_reply_model if big else settings.llm_fast_model
    key = ("mistral", model, temperature)
    if key not in _model_cache:
        from langchain_mistralai import ChatMistralAI

        _model_cache[key] = ChatMistralAI(
            model=model,
            api_key=settings.mistral_api_key,
            temperature=temperature,
            timeout=settings.llm_timeout_seconds,
            max_retries=1,
        )
    return _model_cache[key], model


def _gemini(task: str):
    temperature, big = TASKS.get(task, (0.3, False))
    model = settings.llm_fallback_model if big else settings.llm_fallback_fast_model
    key = ("gemini", model, temperature)
    if key not in _model_cache:
        from langchain_google_genai import ChatGoogleGenerativeAI

        _model_cache[key] = ChatGoogleGenerativeAI(
            model=model,
            google_api_key=settings.gemini_api_key,
            temperature=temperature,
            timeout=settings.llm_timeout_seconds,
            max_retries=1,
        )
    return _model_cache[key], model


# Circuit breaker: a provider that fails with an auth/quota error is skipped for a while instead of
# adding a failed round-trip to every call.
_BREAKER_SECONDS = 600
_open_until: dict[str, float] = {}


def _trip_if_fatal(provider: str, exc: Exception) -> None:
    msg = str(exc).lower()
    if any(k in msg for k in ("401", "403", "invalid api key", "unauthorized", "429", "quota")):
        _open_until[provider] = time.time() + _BREAKER_SECONDS
        logger.warning("Circuit open for %s for %ss", provider, _BREAKER_SECONDS)


def provider_status() -> dict[str, str]:
    now = time.time()
    return {p: ("open" if _open_until.get(p, 0) > now else "closed") for p in ("mistral", "gemini")}


def _providers(task: str):
    now = time.time()
    chain = []
    if settings.mistral_api_key:
        chain.append(("mistral", lambda: _mistral(task)))
    if settings.gemini_api_key:
        chain.append(("gemini", lambda: _gemini(task)))
    if not chain:
        raise LLMUnavailable("No LLM API key configured (MISTRAL_API_KEY / GEMINI_API_KEY)")
    if settings.llm_primary.lower() == "gemini":
        chain.reverse()
    healthy = [c for c in chain if _open_until.get(c[0], 0) <= now]
    return healthy or chain


def _usage_of(msg: AIMessage | None, prompt_chars: int, output_chars: int) -> tuple[int, int]:
    meta = getattr(msg, "usage_metadata", None) or {}
    in_tok = meta.get("input_tokens") or prompt_chars // 4
    out_tok = meta.get("output_tokens") or output_chars // 4
    return int(in_tok), int(out_tok)


def _chars(messages: list[BaseMessage]) -> int:
    return sum(len(str(m.content)) for m in messages)


def structured(task: str, schema: type[T], messages: list[BaseMessage], usage: Usage | None = None) -> T:
    """Call the model and parse the answer into `schema`, falling back to the next provider on any error."""
    last_error: Exception | None = None
    for index, (provider, factory) in enumerate(_providers(task)):
        start = time.perf_counter()
        try:
            model, model_name = factory()
            result = model.with_structured_output(schema, include_raw=True).invoke(messages)
            parsed = result.get("parsed")
            if parsed is None:
                raise ValueError(f"unparseable output: {result.get('parsing_error')}")
            raw = result.get("raw")
            in_tok, out_tok = _usage_of(raw, _chars(messages), len(parsed.model_dump_json()))
            if usage is not None:
                usage.add(LLMCall(task, provider, model_name, in_tok, out_tok, (time.perf_counter() - start) * 1000, index > 0))
            return parsed
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            _trip_if_fatal(provider, exc)
            logger.warning("LLM %s failed for task=%s: %s", provider, task, exc)
    raise LLMUnavailable(f"All providers failed for task={task}: {last_error}")


def text(task: str, messages: list[BaseMessage], usage: Usage | None = None) -> str:
    last_error: Exception | None = None
    for index, (provider, factory) in enumerate(_providers(task)):
        start = time.perf_counter()
        try:
            model, model_name = factory()
            msg = model.invoke(messages)
            content = _content_text(msg)
            in_tok, out_tok = _usage_of(msg, _chars(messages), len(content))
            if usage is not None:
                usage.add(LLMCall(task, provider, model_name, in_tok, out_tok, (time.perf_counter() - start) * 1000, index > 0))
            return content
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            _trip_if_fatal(provider, exc)
            logger.warning("LLM %s failed for task=%s: %s", provider, task, exc)
    raise LLMUnavailable(f"All providers failed for task={task}: {last_error}")


def stream(
    task: str,
    messages: list[BaseMessage],
    on_token: Callable[[str], None],
    usage: Usage | None = None,
) -> str:
    """Stream tokens to `on_token`. Falls back only if the first provider fails before emitting anything."""
    last_error: Exception | None = None
    for index, (provider, factory) in enumerate(_providers(task)):
        start = time.perf_counter()
        emitted = False
        parts: list[str] = []
        final: AIMessage | None = None
        try:
            model, model_name = factory()
            for chunk in model.stream(messages):
                piece = _content_text(chunk)
                final = chunk if final is None else final + chunk
                if piece:
                    emitted = True
                    parts.append(piece)
                    on_token(piece)
            content = "".join(parts)
            in_tok, out_tok = _usage_of(final, _chars(messages), len(content))
            if usage is not None:
                usage.add(LLMCall(task, provider, model_name, in_tok, out_tok, (time.perf_counter() - start) * 1000, index > 0))
            return content
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            _trip_if_fatal(provider, exc)
            logger.warning("LLM stream %s failed for task=%s: %s", provider, task, exc)
            if emitted:
                return "".join(parts)
    raise LLMUnavailable(f"All providers failed for task={task}: {last_error}")


def _content_text(msg) -> str:
    content = getattr(msg, "content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in content)
    return str(content)
