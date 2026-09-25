"""Local cross-encoder reranker (Hugging Face `ms-marco-MiniLM-L-6-v2`, runs on CPU, no API key)."""
import logging
import math
import threading

from app.core.config import settings

logger = logging.getLogger("lifecoach.reranker")

_model = None
_lock = threading.Lock()


def enabled() -> bool:
    return settings.reranker_provider.lower() == "local"


def get_model():
    global _model
    if _model is None:
        with _lock:
            if _model is None:
                from sentence_transformers import CrossEncoder

                logger.info("Loading reranker %s ...", settings.reranker_model)
                _model = CrossEncoder(settings.reranker_model, device="cpu")
                logger.info("Reranker loaded.")
    return _model


def warm_up() -> None:
    """Load the model in the background at startup so the first chat turn is not slow."""
    if enabled():
        threading.Thread(target=lambda: _safe_load(), daemon=True).start()


def _safe_load() -> None:
    try:
        get_model()
    except Exception as exc:  # noqa: BLE001
        logger.error("Reranker failed to load: %s", exc)


def score(query: str, documents: list[str]) -> list[float] | None:
    """Return relevance probabilities in [0, 1] for each document, or None if unavailable."""
    if not enabled() or not documents:
        return None
    try:
        raw = get_model().predict([[query, d] for d in documents])
        return [1 / (1 + math.exp(-float(s))) for s in raw]
    except Exception as exc:  # noqa: BLE001
        logger.error("Reranker failed: %s", exc)
        return None
