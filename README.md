# LifeCrew — Conversational Lifestyle & Goal-Tracking AI with Episodic Memory

An **agentic, multi-character AI companion** that remembers your life, validates and plans your goals, tracks habits,
progress and streaks, and nudges you toward them — each character in their own voice.

| | |
|---|---|
| **Agent** | LangGraph foreground graph (intent + safety classifier → goal validator → web search → planner → progress update → hybrid memory retrieval → streamed reply) and a background memory graph (extraction with dedup, compression, behaviour analysis, character adaptation, life events, weekly reflection) |
| **Memory** | Episodic + semantic memory in PostgreSQL/pgvector (HNSW), keyword boost, local cross-encoder reranker, score = 0.6·relevance + 0.25·importance + 0.15·recency |
| **LLMs** | Mistral (primary) → Gemini (automatic fallback, circuit breaker) |
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
| `MISTRAL_API_KEY` / `GEMINI_API_KEY` | – | At least one is required. Mistral is tried first; Gemini is the fallback. |
| `LLM_REPLY_MODEL` / `LLM_FAST_MODEL` | `mistral-large-latest` / `mistral-small-latest` | Large model only for replies; small for classify/extract/plan |
| `LLM_FALLBACK_MODEL` / `LLM_FALLBACK_FAST_MODEL` | `gemini-2.5-flash` / `gemini-2.5-flash-lite` | |
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

1. **Dashboard** — proactive in-character nudge, focus goal (highest priority weight), today's todos, streaks, charts.
2. **Chat with Arjun** — “I want to drink more water, I barely drink 1 litre” → watch the agent trace: intent → validator → planner → goal card.
3. **Switch to Meera** — she already knows (“Arjun told me…”) and reacts in her softer style.
4. **Kabir** — “I want ₹1 lakh from mutual funds next week” → reframed to a realistic SIP goal with live web sources.
5. **Safety** — “help me make a bomb” → firm, fun refusal; “I want to learn hacking” → ethical-hacking plan.
6. **Progress** — “Done, drank my water!” → todo ticked from chat, progress + streak update.
7. **Memory** — timeline, facts, crew notes, semantic search with score breakdown.
8. **Developer** — live LangGraph graph, per-node latency/tokens, provider fallback, retrieved memories.
