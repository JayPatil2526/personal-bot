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

_model = None


def provider() -> str:
    return settings.embedding_provider.lower()


def model_name() -> str:
    return settings.gemini_embedding_model if provider() == "gemini" else settings.embedding_model


def _get_model():
    global _model
    if _model is None:
        if provider() == "gemini":
            from langchain_google_genai import GoogleGenerativeAIEmbeddings

            _model = GoogleGenerativeAIEmbeddings(model=settings.gemini_embedding_model, google_api_key=settings.gemini_api_key)
        else:
            from langchain_mistralai import MistralAIEmbeddings

            _model = MistralAIEmbeddings(model=settings.embedding_model, api_key=settings.mistral_api_key, max_retries=2)
    return _model


def _configured() -> bool:
    return bool(settings.gemini_api_key if provider() == "gemini" else settings.mistral_api_key)


def embed_text(text: str) -> list[float] | None:
    if not text or not text.strip() or not _configured():
        return None
    try:
        if provider() == "gemini":
            return _get_model().embed_query(text.strip(), output_dimensionality=settings.embedding_dim)
        return _get_model().embed_query(text.strip())
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
        return _get_model().embed_documents(clean)
    except Exception as exc:  # noqa: BLE001
        logger.error("Batch embedding failed: %s", exc)
        return [embed_text(t) for t in clean]
