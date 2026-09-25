# LifeCrew — evaluation results

Generated 2026-09-25T13:42:20+00:00 by `python -m eval.run_all`.

## 1. Intent & safety classifier

45 labelled messages scored (0 errors); providers {'gemini': 0.889, 'mistral': 0.111}, fallback calls 5.

| Metric | Value |
|---|---|
| Intent accuracy | 97.8% |
| Intent macro-F1 | 0.977 |
| Safety accuracy (classifier) | 100.0% |
| Safety accuracy (after keyword guard) | 100.0% |
| Mean / median / p90 latency | 1,477 ms / 1,106 ms / 2,635 ms |
| Avg tokens in / out | 1953.5 / 71.0 |

| Intent | n | Correct | Accuracy | Precision | Recall | F1 |
|---|---|---|---|---|---|---|
| chit_chat | 5 | 5 | 100.0% | 1.00 | 1.00 | 1.00 |
| new_goal | 7 | 7 | 100.0% | 1.00 | 1.00 | 1.00 |
| progress_report | 6 | 6 | 100.0% | 1.00 | 1.00 | 1.00 |
| goal_question | 6 | 5 | 83.3% | 1.00 | 0.83 | 0.91 |
| ask_info | 6 | 6 | 100.0% | 1.00 | 1.00 | 1.00 |
| memory_question | 5 | 5 | 100.0% | 0.83 | 1.00 | 0.91 |
| emotional | 5 | 5 | 100.0% | 1.00 | 1.00 | 1.00 |
| task_request | 5 | 5 | 100.0% | 1.00 | 1.00 | 1.00 |

| Safety label | n | Correct | Accuracy |
|---|---|---|---|
| safe | 43 | 43 | 100.0% |
| dual_use | 2 | 2 | 100.0% |
| harmful | 0 | 0 | n/a |
| self_harm | 0 | 0 | n/a |

Intent confusions (expected → predicted): goal_question → memory_question ×1

Safety confusions: none

## 2. Goal validator

28 labelled goals scored (0 errors), support {'accept': 15, 'reframe': 13, 'refuse': 0}; providers {'gemini': 0.893, 'mistral': 0.107}, fallback calls 3.

| Metric | Value |
|---|---|
| Validator accuracy | 92.9% |
| Validator macro-F1 (classes present) | 0.959 |
| End-to-end pipeline accuracy | 89.3% |
| Reframes carrying expert advice | 10 |
| Mean feasibility by expected tier | {'accept': 0.86, 'reframe': 0.185} |
| Mean / median validator latency | 1,529 ms / 1,288 ms |

| Tier | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| accept | 1.00 | 1.00 | 1.00 | 15 |
| reframe | 1.00 | 0.85 | 0.92 | 13 |
| refuse | 0.00 | n/a | n/a | 0 |

Confusion matrix (rows = expected, columns = predicted):

| expected \ predicted | accept | reframe | refuse |
|---|---|---|---|
| accept | 15 | 0 | 0 |
| reframe | 0 | 11 | 2 |
| refuse | 0 | 0 | 0 |

## 3. Memory retrieval

30 memories (18 facts, 12 episodes), 30 paraphrased queries (7 Hinglish). Embeddings: gemini:models/gemini-embedding-001 (1024 dims); reranker: cross-encoder/ms-marco-MiniLM-L-6-v2. Vectors used for all queries: True; query-embedding timeouts (> 4.0 s): 0.

| Ranking | Recall@1 | Recall@3 | Recall@6 | MRR |
|---|---|---|---|---|
| Cosine only (baseline) | 96.7% | 96.7% | 100.0% | 0.973 |
| Hybrid, no reranker | 66.7% | 90.0% | 96.7% | 0.792 |
| Hybrid + cross-encoder reranker | 76.7% | 90.0% | 93.3% | 0.848 |

Hinglish subset (n=7): with reranker R@1 71.4%, MRR 0.802; without R@1 71.4%, MRR 0.857.

Latency: query embedding 668 ms mean / 518 ms median; retrieve() with reranker 2,089 ms, without 86 ms (mean).

## 4. Live agent traces (real app usage)

32 chat turns from 3 user(s), 2026-09-25T09:32+00:00 → 2026-09-25T12:12+00:00. Traces by kind: {'chat': 32, 'background': 32, 'goal_preview': 1}.

| Metric | Value |
|---|---|
| Turn latency mean / median / p90 | 7,333 ms / 6,209 ms / 12,181 ms |
| Turn latency excluding reply generation (mean) | 3,483 ms |
| Avg tokens per turn (in / out) | 3404.7 / 256.2 |
| Avg LLM calls per turn | 2.25 |
| Turns that used a fallback provider | 25.0% |
| Background (memory) pass mean | 2,526 ms |

| Node | Runs | Mean ms | Median ms |
|---|---|---|---|
| responder | 32 | 3,850 | 3,215 |
| web_search | 5 | 2,632 | 1,654 |
| memory_retrieval | 17 | 1,725 | 852 |
| goal_planner | 4 | 1,712 | 1,686 |
| classify | 32 | 1,691 | 1,240 |
| goal_validator | 4 | 1,538 | 1,622 |
| progress_update | 5 | 50 | 47 |
| load_context | 32 | 34 | 29 |
| commitments | 4 | 14 | 5 |
| post_process | 32 | 14 | 11 |
| safety_guard | 32 | 0 | 0 |

LLM node providers: {'gemini:gemini-2.5-flash-lite': 40, 'gemini:gemini-2.5-flash': 32}. Classified intents: {'chit_chat': 12, 'new_goal': 6, 'progress_report': 5, 'ask_info': 3, 'memory_question': 2, 'emotional': 2, 'goal_question': 2}.

## Runtime

intent_eval: 112 s · validator_eval: 144 s · memory_eval: 143 s · trace_stats: 0 s
