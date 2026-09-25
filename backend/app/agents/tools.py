"""Tools the agent can call."""
import logging
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout

logger = logging.getLogger("lifecoach.tools")

_pool = ThreadPoolExecutor(max_workers=4)


def _search(query: str, max_results: int) -> list[dict]:
    from ddgs import DDGS

    with DDGS() as ddgs:
        rows = ddgs.text(query, max_results=max_results, region="in-en") or []
    return [
        {"title": r.get("title", ""), "url": r.get("href") or r.get("url", ""), "snippet": (r.get("body") or "")[:300]}
        for r in rows
    ]


def web_search(query: str, max_results: int = 5, timeout: float = 8.0) -> list[dict]:
    """DuckDuckGo web search (no API key). Returns [] on failure or timeout."""
    if not query.strip():
        return []
    try:
        return _pool.submit(_search, query, max_results).result(timeout=timeout)
    except FutureTimeout:
        logger.warning("web_search timed out for %r", query)
    except Exception as exc:  # noqa: BLE001
        logger.warning("web_search failed for %r: %s", query, exc)
    return []
