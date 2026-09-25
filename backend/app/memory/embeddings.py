"""Text embeddings (1024-dim).

The provider is fixed per database via EMBEDDING_PROVIDER (mistral → `mistral-embed`, gemini →
`gemini-embedding-001` truncated to 1024 dims). There is deliberately no automatic cross-provider fallback:
vectors from different models live in different spaces, so mixing them would corrupt similarity search.
If embedding fails we return None and the retriever degrades to keyword + recency ranking.
To switch provider later, run `python -m app.memory.reembed`.
"""
import logging

from app.core.config import settings

logger = logging.getLogger("lifecoach.embeddings")

_models: dict[int, object] = {}


def provider() -> str:
    return settings.embedding_provider.lower()


def model_name() -> str:
    return settings.gemini_embedding_model if provider() == "gemini" else settings.embedding_model


def _keys() -> list[str]:
    return settings.gemini_keys if provider() == "gemini" else settings.mistral_keys


def _get_model(key_index: int):
    if key_index not in _models:
        key = _keys()[key_index]
        if provider() == "gemini":
            from langchain_google_genai import GoogleGenerativeAIEmbeddings

            _models[key_index] = GoogleGenerativeAIEmbeddings(model=settings.gemini_embedding_model, google_api_key=key)
        else:
            from langchain_mistralai import MistralAIEmbeddings

            _models[key_index] = MistralAIEmbeddings(model=settings.embedding_model, api_key=key, max_retries=2)
    return _models[key_index]


def _configured() -> bool:
    return bool(_keys())


def _with_any_key(call):
    """Try each key of the embedding provider in turn (same model, so the vectors stay comparable)."""
    last_error: Exception | None = None
    for i in range(len(_keys())):
        try:
            return call(_get_model(i))
        except Exception as exc:  # noqa: BLE001
            last_error = exc
    raise last_error or RuntimeError("no embedding key")


def embed_text(text: str) -> list[float] | None:
    if not text or not text.strip() or not _configured():
        return None
    try:
        if provider() == "gemini":
            return _with_any_key(lambda m: m.embed_query(text.strip(), output_dimensionality=settings.embedding_dim))
        return _with_any_key(lambda m: m.embed_query(text.strip()))
    except Exception as exc:  # noqa: BLE001
        logger.error("Embedding failed: %s", exc)
        return None


def embed_many(texts: list[str]) -> list[list[float] | None]:
    clean = [t.strip() for t in texts]
    if not clean or not _configured():
        return [None] * len(texts)
    if provider() == "gemini":
        return [embed_text(t) for t in clean]
    try:
        return _with_any_key(lambda m: m.embed_documents(clean))
    except Exception as exc:  # noqa: BLE001
        logger.error("Batch embedding failed: %s", exc)
        return [embed_text(t) for t in clean]
