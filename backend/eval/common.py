"""Shared helpers for the evaluation scripts: rate-limited LLM calls, result files, small stats."""
from __future__ import annotations

import json
import logging
import statistics
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from app.agents import llm

RESULTS_DIR = Path(__file__).resolve().parent / "results"
SLEEP_BETWEEN_CALLS = 1.0
RETRY_WAIT = 8.0

logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")


def call_structured(task: str, schema, messages) -> dict:
    """One llm.structured call as the graph makes it, timed, with one retry. Never raises."""
    for attempt in (1, 2):
        usage = llm.Usage()
        start = time.perf_counter()
        try:
            out = llm.structured(task, schema, messages, usage)
            ms = (time.perf_counter() - start) * 1000
            last = usage.calls[-1] if usage.calls else None
            time.sleep(SLEEP_BETWEEN_CALLS)
            return {
                "ok": True,
                "out": out,
                "ms": round(ms, 1),
                "provider": f"{last.provider}:{last.model}" if last else "",
                "fallback": bool(last and last.fallback),
                "input_tokens": usage.input_tokens,
                "output_tokens": usage.output_tokens,
                "attempts": attempt,
            }
        except Exception as exc:  # noqa: BLE001
            error = str(exc)[:300]
            if attempt == 1:
                time.sleep(RETRY_WAIT)
    return {"ok": False, "error": error, "attempts": 2}


def provider_share(rows: list[dict]) -> dict:
    counts = Counter(r["provider"].split(":")[0].split("#")[0] for r in rows if r.get("ok"))
    total = sum(counts.values()) or 1
    return {k: round(v / total, 3) for k, v in counts.most_common()}


def latency_stats(values: list[float]) -> dict:
    if not values:
        return {}
    ordered = sorted(values)
    return {
        "mean_ms": round(statistics.mean(ordered), 1),
        "median_ms": round(statistics.median(ordered), 1),
        "p90_ms": round(percentile(ordered, 90), 1),
        "min_ms": round(ordered[0], 1),
        "max_ms": round(ordered[-1], 1),
    }


def percentile(ordered: list[float], p: float) -> float:
    """Linear-interpolated percentile of an already sorted list."""
    if not ordered:
        return 0.0
    k = (len(ordered) - 1) * p / 100
    lo, hi = int(k), min(int(k) + 1, len(ordered) - 1)
    return ordered[lo] + (ordered[hi] - ordered[lo]) * (k - lo)


def precision_recall(pairs: list[tuple[str, str]], labels: list[str]) -> dict:
    """pairs = [(expected, predicted)] → per-label precision / recall / F1 / support."""
    out = {}
    for label in labels:
        tp = sum(1 for e, p in pairs if e == label and p == label)
        fp = sum(1 for e, p in pairs if e != label and p == label)
        fn = sum(1 for e, p in pairs if e == label and p != label)
        prec = tp / (tp + fp) if tp + fp else None
        rec = tp / (tp + fn) if tp + fn else None  # undefined without gold examples
        f1 = (2 * prec * rec / (prec + rec) if prec + rec else 0.0) if prec is not None and rec is not None else None
        out[label] = {"precision": _r(prec), "recall": _r(rec), "f1": _r(f1), "support": tp + fn, "predicted": tp + fp}
    return out


def _r(x):
    return None if x is None else round(x, 3)


def confusion_matrix(pairs: list[tuple[str, str]], labels: list[str]) -> dict:
    extra = sorted({p for _, p in pairs} - set(labels))
    cols = labels + extra
    return {e: {p: sum(1 for x, y in pairs if x == e and y == p) for p in cols} for e in labels}


def save(name: str, data: dict) -> Path:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    data = {"experiment": name, "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), **data}
    path = RESULTS_DIR / f"{name}.json"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, default=str))
    return path
