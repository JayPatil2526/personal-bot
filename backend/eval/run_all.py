"""Run every experiment, save results/<name>.json and a combined results/summary.md.

Run: python -m eval.run_all            (all four)
     python -m eval.run_all trace memory   (a subset; summary.md uses the latest JSON of the others)
"""
from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timezone

from eval import intent_eval, memory_eval, trace_stats, validator_eval
from eval.common import RESULTS_DIR, save

EXPERIMENTS = {
    "intent": ("intent_eval", intent_eval.run),
    "validator": ("validator_eval", validator_eval.run),
    "memory": ("memory_eval", memory_eval.run),
    "trace": ("trace_stats", trace_stats.run),
}


def _load(name: str) -> dict | None:
    path = RESULTS_DIR / f"{name}.json"
    return json.loads(path.read_text()) if path.exists() else None


def _pct(x) -> str:
    return "n/a" if x is None else f"{x * 100:.1f}%"


def _ms(stats: dict | None, key: str = "mean_ms") -> str:
    return "n/a" if not stats or key not in stats else f"{stats[key]:,.0f} ms"


def _f(x) -> str:
    return "n/a" if x is None else f"{x:.2f}"


def summary_md(results: dict[str, dict | None]) -> str:
    out = ["# LifeCrew — evaluation results", "",
           f"Generated {datetime.now(timezone.utc).isoformat(timespec='seconds')} by `python -m eval.run_all`.", ""]

    r = results.get("intent_eval")
    if r:
        out += ["## 1. Intent & safety classifier", "",
                f"{r['n_scored']} labelled messages scored ({r['n_errors']} errors); providers {r['provider_share']}, "
                f"fallback calls {r['fallback_calls']}.", "",
                "| Metric | Value |", "|---|---|",
                f"| Intent accuracy | {_pct(r['intent_accuracy'])} |",
                f"| Intent macro-F1 | {r['intent_macro_f1']:.3f} |",
                f"| Safety accuracy (classifier) | {_pct(r['safety_accuracy'])} |",
                f"| Safety accuracy (after keyword guard) | {_pct(r['safety_accuracy_after_keyword_guard'])} |",
                f"| Mean / median / p90 latency | {_ms(r['latency'])} / {_ms(r['latency'], 'median_ms')} / {_ms(r['latency'], 'p90_ms')} |",
                f"| Avg tokens in / out | {r['avg_input_tokens']} / {r['avg_output_tokens']} |", "",
                "| Intent | n | Correct | Accuracy | Precision | Recall | F1 |", "|---|---|---|---|---|---|---|"]
        for label, v in r["per_intent"].items():
            p = r["per_intent_prf"][label]
            out.append(f"| {label} | {v['n']} | {v['correct']} | {_pct(v['accuracy'])} | {_f(p['precision'])} | {_f(p['recall'])} | {_f(p['f1'])} |")
        out += ["", "| Safety label | n | Correct | Accuracy |", "|---|---|---|---|"]
        for label, v in r["per_safety"].items():
            out.append(f"| {label} | {v['n']} | {v['correct']} | {_pct(v['accuracy'])} |")
        out += ["", "Intent confusions (expected → predicted): "
                + (", ".join(f"{k} ×{v}" for k, v in r["intent_confusions"].items()) or "none"),
                "", "Safety confusions: " + (", ".join(f"{k} ×{v}" for k, v in r["safety_confusions"].items()) or "none"), ""]

    r = results.get("validator_eval")
    if r:
        cm = r["confusion_matrix"]
        cols = list(next(iter(cm.values())).keys())
        out += ["## 2. Goal validator", "",
                f"{r['n_scored']} labelled goals scored ({r['n_errors']} errors), support {r['support']}; "
                f"providers {r['provider_share_validator']}, fallback calls {r['fallback_calls']}.", "",
                "| Metric | Value |", "|---|---|",
                f"| Validator accuracy | {_pct(r['validator_accuracy'])} |",
                f"| Validator macro-F1 (classes present) | {r['validator_macro_f1_present_classes']} |",
                f"| End-to-end pipeline accuracy | {_pct(r['pipeline_accuracy'])} |",
                f"| Reframes carrying expert advice | {r['reframes_with_expert_advice']} |",
                f"| Mean feasibility by expected tier | {r['mean_feasibility']} |",
                f"| Mean / median validator latency | {_ms(r['latency_validator'])} / {_ms(r['latency_validator'], 'median_ms')} |", "",
                "| Tier | Precision | Recall | F1 | Support |", "|---|---|---|---|---|"]
        for label, v in r["per_class"].items():
            out.append(f"| {label} | {_f(v['precision'])} | {_f(v['recall'])} | {_f(v['f1'])} | {v['support']} |")
        out += ["", "Confusion matrix (rows = expected, columns = predicted):", "",
                "| expected \\ predicted | " + " | ".join(cols) + " |", "|---" * (len(cols) + 1) + "|"]
        for e, row in cm.items():
            out.append(f"| {e} | " + " | ".join(str(row[c]) for c in cols) + " |")
        out.append("")

    r = results.get("memory_eval")
    if r:
        out += ["## 3. Memory retrieval", "",
                f"{r['n_memories']} memories ({r['n_facts']} facts, {r['n_episodes']} episodes), {r['n_queries']} paraphrased "
                f"queries ({r['hinglish_queries']['n']} Hinglish). Embeddings: {r['embedding']}; reranker: {r['reranker']}. "
                f"Vectors used for all queries: {r['all_used_vector']}; query-embedding timeouts "
                f"(> {r['query_embed_timeout_seconds']} s): {r['query_embed_timeouts']}.", "",
                "| Ranking | Recall@1 | Recall@3 | Recall@6 | MRR |", "|---|---|---|---|---|"]
        for label, key in (("Cosine only (baseline)", "cosine_only_baseline"),
                           ("Hybrid, no reranker", "hybrid_without_reranker"),
                           ("Hybrid + cross-encoder reranker", "hybrid_with_reranker")):
            m = r[key]
            out.append(f"| {label} | {_pct(m['recall@1'])} | {_pct(m['recall@3'])} | {_pct(m['recall@6'])} | {m['mrr']:.3f} |")
        h = r["hinglish_queries"]
        out += ["", f"Hinglish subset (n={h['n']}): with reranker R@1 {_pct(h['with_reranker']['recall@1'])}, "
                f"MRR {h['with_reranker']['mrr']:.3f}; without R@1 {_pct(h['without_reranker']['recall@1'])}, "
                f"MRR {h['without_reranker']['mrr']:.3f}.", "",
                f"Latency: query embedding {_ms(r['latency_query_embedding'])} mean / {_ms(r['latency_query_embedding'], 'median_ms')} median; "
                f"retrieve() with reranker {_ms(r['latency_retrieve_with_reranker'])}, without {_ms(r['latency_retrieve_without_reranker'])} (mean).", ""]

    r = results.get("trace_stats")
    if r and r.get("chat_turns"):
        t = r["chat_total_ms"]
        out += ["## 4. Live agent traces (real app usage)", "",
                f"{r['chat_turns']} chat turns from {r['distinct_users']} user(s), {r['period'][0]} → {r['period'][1]}. "
                f"Traces by kind: {r['traces_by_kind']}.", "",
                "| Metric | Value |", "|---|---|",
                f"| Turn latency mean / median / p90 | {_ms(t)} / {_ms(t, 'median_ms')} / {_ms(t, 'p90_ms')} |",
                f"| Turn latency excluding reply generation (mean) | {_ms(r['chat_ms_excluding_responder'])} |",
                f"| Avg tokens per turn (in / out) | {r['avg_input_tokens_per_turn']} / {r['avg_output_tokens_per_turn']} |",
                f"| Avg LLM calls per turn | {r['avg_llm_calls_per_turn']} |",
                f"| Turns that used a fallback provider | {_pct(r['fallback_turn_share'])} |",
                f"| Background (memory) pass mean | {_ms(r['background_total_ms'])} |", "",
                "| Node | Runs | Mean ms | Median ms |", "|---|---|---|---|"]
        for node, v in r["node_ms"].items():
            out.append(f"| {node} | {v['runs']} | {v['mean_ms']:,.0f} | {v['median_ms']:,.0f} |")
        out += ["", f"LLM node providers: {r['llm_node_providers']}. Classified intents: {r['classified_intents']}.", ""]
    elif r:
        out += ["## 4. Live agent traces", "", r.get("note", "no data"), ""]

    runtime = results.get("_runtime")
    if runtime:
        out += ["## Runtime", "", " · ".join(f"{k}: {v:.0f} s" for k, v in runtime.items()), ""]
    return "\n".join(out)


def main(selected: list[str]) -> None:
    runtime = {}
    for key, (name, fn) in EXPERIMENTS.items():
        if selected and key not in selected:
            continue
        print(f"\n=== {name} ===")
        start = time.perf_counter()
        try:
            data = fn()
        except Exception as exc:  # noqa: BLE001
            print(f"{name} FAILED: {exc}")
            continue
        runtime[name] = time.perf_counter() - start
        save(name, {**data, "runtime_s": round(runtime[name], 1)})
    results = {name: _load(name) for name, _ in EXPERIMENTS.values()}
    results["_runtime"] = {n: (results[n] or {}).get("runtime_s", 0) for n, _ in EXPERIMENTS.values() if results.get(n)}
    (RESULTS_DIR / "summary.md").write_text(summary_md(results))
    print(f"\nwrote {RESULTS_DIR / 'summary.md'}")


if __name__ == "__main__":
    main(sys.argv[1:])
