# LifeCrew — Conversational Lifestyle & Goal-Tracking AI with Episodic Memory

An **agentic, multi-character AI companion** that remembers your life, validates and plans your goals, tracks habits,
progress and streaks, and nudges you toward them — each character in their own voice.

| | |
|---|---|
| **Agent** | LangGraph foreground graph (intent + safety classifier → goal validator → web search → planner → progress update → hybrid memory retrieval → streamed reply) and a background memory graph (extraction with dedup, compression, behaviour analysis, character adaptation, life events, weekly reflection) |
| **Memory** | Episodic + semantic memory in PostgreSQL/pgvector (HNSW), keyword boost, local cross-encoder reranker, score = 0.6·relevance + 0.25·importance + 0.15·recency |
| **LLMs** | Mistral Small / Gemini Flash-Lite, multi-key rotation and automatic provider fallback (circuit breaker) |
| **Backend** | FastAPI, SQLAlchemy, JWT auth, Server-Sent Events |
| **Frontend** | Next.js 15, Tailwind CSS v4, Framer Motion, Recharts, React Flow |

See [docs/PLAN.md](docs/PLAN.md) for the full design.

---

## Run it (development)

**Prerequisites:** Docker, Python 3.10+, Node 20+, a Mistral and/or Gemini API key.

```bash
# 1. Configure
cp .env.example .env          # then fill MISTRAL_API_KEY / GEMINI_API_KEY

# 2. Database (Postgres + pgvector on localhost:5433)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db

# 3. Backend  →  http://localhost:8000  (API docs at /docs)
cd backend
python3 -m venv .venv && . .venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
uvicorn app.main:app --reload --reload-dir app

# 4. Frontend  →  http://localhost:3000
cd ../frontend
npm install
npm run dev
```

Tables and the three preset characters (Arjun, Meera, Kabir) are created automatically on backend start.

**Optional demo account** with two weeks of habit history (so charts, streaks and heatmaps have data):

```bash
cd backend && python -m app.seed.demo      # demo@lifecrew.app / demo1234
```

### Full stack in Docker

```bash
docker compose up --build                                               # production-like
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build  # dev (hot reload, DB exposed on 5433)
```

---

## Configuration (`.env`)

| Variable | Default | Notes |
|---|---|---|
| `MISTRAL_API_KEY` / `GEMINI_API_KEY` | – | At least one is required. Several keys allowed, comma-separated (`key1,key2`): a key that hits its limit is skipped and the next one is used |
| `LLM_PRIMARY` | `mistral` | Provider tried first (`mistral` or `gemini`); the other is the fallback |
| `LLM_REPLY_MODEL` / `LLM_FAST_MODEL` | `mistral-small-latest` / `mistral-small-latest` | Small models to keep token cost low; set the reply model to `mistral-large-latest` for richer replies |
| `LLM_FALLBACK_MODEL` / `LLM_FALLBACK_FAST_MODEL` | `gemini-2.5-flash-lite` / `gemini-2.5-flash-lite` | |
| `LLM_REPLY_MAX_TOKENS` / `LLM_TASK_MAX_TOKENS` | `700` / `2000` | Output-token caps per reply / per structured task |
| `EMBEDDING_PROVIDER` | `mistral` | `mistral` (mistral-embed) or `gemini` (gemini-embedding-001 @1024d). Keep it fixed per database; after switching run `python -m app.memory.reembed` |
| `RERANKER_PROVIDER` | `local` | `local` = HF `cross-encoder/ms-marco-MiniLM-L-6-v2` on CPU, `none` = cosine only |

---

## Project structure

```
backend/app/
  agents/     graph.py (foreground LangGraph), background.py (memory graph), llm.py (routing + fallback),
              prompts.py, schemas.py (structured outputs), tools.py (web search), goal_agent.py, runner.py
  memory/     embeddings.py, reranker.py, retrieval.py (hybrid retrieval), reembed.py
  services/   goals.py (progress, streaks, priority weight, todos)
  api/        auth, characters, sessions (SSE chat), goals/todos/dashboard, memory, dev (traces)
  db/         models.py, init_db.py
  seed/       preset characters, demo account
frontend/
  app/        landing, login, (app)/dashboard, chat, goals, memory, crew, developer
  components/ chat UI, trace panel, goal wizard, UI primitives
docs/         project plan, report material
```

## Demo script

1. **Today** — a crew member checks in first (proactive nudge, asks about a due promise), focus goal by priority weight, today's habits, open promises.
2. **Chat with Arjun** — “I want to drink more water, I barely drink 1 litre” → agent trace: intent → validator → planner → goal card.
3. **Promise** — “I'll go for a 20 minute walk tonight, promise” → saved as a promise with a due date. Next time (any character) asks: “did you walk?”
4. **Crew huddle** — “Feeling lazy, should I skip the gym?” → Meera, Arjun and Kabir reply in turn, reacting to (and disagreeing with) each other.
5. **Kabir** — “I want ₹1 lakh from mutual funds next week” → reframed to a realistic SIP goal with live web sources.
6. **Safety** — “help me make a bomb” → firm refusal; “I want to learn hacking” → ethical-hacking plan.
7. **Weekly report** — completion vs last week, best day, mood ↔ habits, promise keep rate — computed from data, narrated by the crew.
8. **Memory** — timeline, facts, crew notes, semantic search with score breakdown.
9. **Developer** — live LangGraph graph, per-node latency/tokens, provider fallback, retrieved memories.

## How is this different from ChatGPT?

| ChatGPT-style chat | This project |
|---|---|
| Waits for you to type | Characters check in first and **follow up on promises** when they are due |
| Goals live inside a chat thread | Goals, habits, streaks, promises and moods are **structured data** with progress and priority weight |
| One assistant | A **crew** with distinct personalities that share one memory and react to each other in group chat |
| Memory is hidden | **Episodic + semantic memory** you can browse, search (with scores) and delete |
| Answers any goal | Every goal is **validated**: unrealistic → reframed, harmful → refused |
| Summaries are generated guesses | **Weekly report computed from your data**; the LLM only narrates the numbers |
| Opaque | Every turn is a **traceable agent graph** (nodes, latency, tokens, provider, retrieved memories) |
