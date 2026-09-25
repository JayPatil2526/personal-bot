# Project Plan: Conversational Lifestyle & Goal-Tracking AI with Episodic Memory

> Codename: **minor-bot** (working name for the product can be decided later, e.g. "Mitra" / "LifeCrew")

## 1. Problem & Idea

Most "AI assistants" are stateless chatbots: they answer, forget, and never follow up.
People trying to build habits or reach goals (drink more water, learn a skill, save money)
need something that **remembers**, **plans**, **checks in**, and **motivates** in a human way.

This project is an **agentic, multi-character AI companion** that:

1. Talks like a real person (characters with their own personality, life, opinions).
2. Remembers the user across sessions using **episodic memory** (what happened, when, how it felt).
3. Tracks **goals → plans → daily todos → progress & streaks**.
4. **Validates goals** (safe? realistic?) and reshapes them into achievable plans.
5. Uses **tools** (web search, planner, todo manager, reminders) – not just text generation.
6. Lets several characters share one "brain" about the user, so they can refer to each other
   ("Arjun was too strict today, let's go sip by sip 💧").

Core techniques: LangGraph agent pipelines, pgvector RAG with reranking, background memory
extraction & compression, character personas with adaptation.

## 2. What makes it "more than a chatbot" (demo talking points)

| Capability | What the user sees | What runs underneath |
|---|---|---|
| Agentic graph | Live "thinking steps" panel per message | LangGraph: router → safety → goal agent → tools → responder |
| Episodic memory | Memory timeline ("On 21 Sep you said you felt tired after gym") | Episodes + facts stored with embeddings, semantic search + rerank |
| Goal engine | Dashboard with goals, priority, progress rings, streaks | Goal / Plan / Todo tables, progress calc, priority weighting |
| Goal validation | Bot refuses harmful goals in a fun way, reshapes unrealistic ones | Goal-validator node (safety + feasibility classification) |
| Tool use | "I checked online: here are this week's hot IPOs…" with sources | Web search tool (DuckDuckGo), planner tool, todo tool |
| Multi-character shared brain | Different personas, same knowledge, reference each other | Shared user memory + per-character memory + cross-character notes |
| Proactive nudges | Character opens with "Did you finish your 2 L water?" | Nudge generator using goal priority + due todos + last activity |
| Developer mode | Trace of each node, latency, tokens, retrieved memories | Per-node timing/token tracking stored in `agent_traces` |

## 3. Scope for Demo (Tomorrow) vs Future

### In scope (MVP – must work in demo)
- Auth: register / login (JWT), user profile.
- Characters: 3 seeded characters (distinct personalities) + create-your-own character.
- Chat: session-based chat (like Gemini/ChatGPT sidebar), streaming responses, switch character.
- Goals: create via form **or** via chat ("I want to drink 2L water daily"), priority
  (low / medium / high / urgent), deadline, category, progress %, visibility (which characters know it).
- Plans & Todos: AI breaks goal into milestones + daily todos; user ticks todos; streaks.
- Goal validation: safe / needs-reframe / refuse; realistic / unrealistic → counter-proposal.
- Web search tool for goals that need live info (stocks, courses, events).
- Episodic memory: automatic extraction after conversations; memory page (timeline + search).
- Cross-character sync: all characters know shared facts & goals; can reference each other.
- Developer panel: graph visualization + per-turn trace (nodes, time, tokens, retrieved memory).
- Polished, minimal, animated UI.

### Future scope (mention in demo, NOT built)
- Agentic actions: send emails, create calendar events, book things, reminders via push/WhatsApp.
- Voice chat, mobile app.
- Wearable / health-app integration (steps, sleep, water) for automatic progress.
- Group goals & accountability partners.
- Fine-tuned small model for on-device privacy.
- Subscription model & scale-out (see §16).

## 4. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Backend | **Python 3.10 + FastAPI** | Fast to build, async, auto Swagger docs (`/docs`) |
| Agent framework | **LangGraph + LangChain** | Explicit state graph, conditional routing, easy to visualize |
| LLM | **Mistral** (`mistral-large` for replies, `mistral-small` for classify/extract) → **fallback: Gemini 2.5 Flash** | Strong quality/cost ratio; automatic fallback if Mistral errors/times out |
| Embeddings | **`mistral-embed`** (1024-dim) → fallback: Gemini embeddings | 1024-dim embeddings for semantic memory search |
| Vector DB | **PostgreSQL + pgvector** (Docker) | Relational + vector data in one DB, HNSW index |
| ORM | SQLAlchemy 2.0 | Simple models + migrations via `create_all` for demo |
| Reranker | **Local Hugging Face cross-encoder** `cross-encoder/ms-marco-MiniLM-L-6-v2` via `sentence-transformers` (CPU) | No API key, ~90 MB, runs offline on CPU. Toggle via `RERANKER_PROVIDER=local|none` |
| Web search | `ddgs` (DuckDuckGo, no API key) | Zero setup |
| Auth | JWT (passlib bcrypt + python-jose) | Simple and standard |
| Frontend | **Next.js + TypeScript + Tailwind + shadcn/ui + Framer Motion** | Modern, fast, great animations |
| Charts | Recharts | Progress & streak charts |
| Graph view | React Flow | Visualize LangGraph for dev panel |
| Streaming | Server-Sent Events | Token + "thinking step" streaming |

### LLM routing & fallback
Every LLM call goes through one `llm.invoke(task, ...)` helper:
`task → model` map (`reply → mistral-large`, `classify/extract/validate → mistral-small`),
wrapped with timeout + retry; on failure it transparently retries the same prompt on
Gemini 2.5 Flash and records `provider_used` in the trace (visible in the Developer panel).

## 5. System Architecture

```
┌──────────────────────── Next.js Web App ─────────────────────────┐
│ Landing · Login · Dashboard · Chat · Goals · Memory · Characters  │
│ Developer Panel (graph + traces)                                  │
└───────────────┬──────────────────────────────────────────────────┘
                │ REST + SSE (JWT)
┌───────────────▼──────────────── FastAPI ─────────────────────────┐
│ /auth  /characters  /sessions  /chat(stream)  /goals  /todos      │
│ /memory  /dev/traces  /dev/graph                                  │
│                                                                   │
│  ┌──────────── Foreground LangGraph (per message) ─────────────┐  │
│  │ load_context → classify_intent → safety_guard                │  │
│  │   ├─ goal_intent → goal_validator → goal_planner → tools     │  │
│  │   ├─ progress_update → todo_tool                             │  │
│  │   ├─ needs_info → web_search_tool                            │  │
│  │   └─ chit_chat                                               │  │
│  │ → memory_retrieval (pgvector + rerank) → character_responder │  │
│  │ → post_process (save msg, trace, schedule background)        │  │
│  └──────────────────────────────────────────────────────────────┘ │
│  ┌──────────── Background LangGraph (after reply) ─────────────┐  │
│  │ extract (episode+facts, dedup) · compress/merge facts       │  │
│  │ mood · behaviour patterns · goal progress · cross-char note  │  │
│  └──────────────────────────────────────────────────────────────┘ │
└───────────────┬──────────────────────────────────────────────────┘
                │
 PostgreSQL + pgvector   Mistral (primary) → Gemini (fallback)   HF cross-encoder (local)   DuckDuckGo
```

## 6. Agent Graph Design (Foreground)

State (TypedDict): `user, character, session, message, history, intent, safety,
goal_draft, validation, tool_results, retrieved_memories, active_goals, due_todos,
response, trace[]`.

| Node | Responsibility |
|---|---|
| `load_context` | Load user, character, session history, active goals (priority-sorted), due todos |
| `classify_intent` | LLM structured output: `chit_chat · new_goal · goal_update · progress_report · ask_info · memory_question · emotional` |
| `safety_guard` | Detect harmful / illegal / self-harm; decide `allow · reframe · refuse` |
| `goal_validator` | For new goals: category, safety tier, feasibility score (0–1), reason, suggested realistic version |
| `goal_planner` | Break goal into milestones + daily/weekly todos, set priority weight |
| `web_search_tool` | Search when goal/question needs live data; return top results + sources |
| `todo_tool` | Mark todos done, compute progress %, update streaks |
| `memory_retrieval` | Embed query (mistral-embed) → pgvector top-20 over episodes + facts → local HF cross-encoder rerank → top 5 |
| `character_responder` | Persona prompt + memories + goals + tool output → in-character reply that nudges toward high-priority goals |
| `post_process` | Persist messages, write trace, kick off background graph |

### Goal validation policy
| Case | Example | Behaviour |
|---|---|---|
| Safe & realistic | "Drink 2L water daily" | Accept → plan → todos |
| Safe but unrealistic | "Earn ₹1 lakh from mutual funds next week" | Explain honestly, propose realistic version (SIP plan, learning path), web search for current market info, recommend certified advisor |
| Dual-use, positive framing | "Learn hacking" | Reframe to ethical hacking: courses, CTFs, certifications (CEH, OSCP), legal labs |
| Harmful | "Make a bomb" | Refuse in character, light and firm, redirect to something positive; never store as goal |
| Self-harm signals | – | Supportive tone, helpline info, no goal creation |

### Priority weighting
`weight = priority_base (urgent 4 · high 3 · medium 2 · low 1) × deadline_factor × (1 + missed_todo_streak × 0.2)`
The top-weighted goal is injected into the responder prompt as "focus goal"; characters
bring it up naturally (not every message – cooldown of N turns).

## 7. Memory Design (Episodic + Semantic)

| Memory type | Scope | Example | Stored |
|---|---|---|---|
| Episodic | user (shared across characters) | "22 Sep, evening: user skipped gym, felt guilty, promised to go tomorrow" | text, timestamp, emotion, importance, embedding |
| Semantic facts | user (shared) | "User is vegetarian", "Works as developer" | fact, category, confidence, embedding |
| Preferences | user (shared) | "Prefers gentle reminders in morning" | item, sentiment |
| Character notes | per character | "Arjun pushed user hard on water today" | visible to other characters (cross-sync) |
| Working memory | session | last N messages | in session history |

Retrieval: pgvector cosine top-20 → local HF cross-encoder (`ms-marco-MiniLM-L-6-v2`) rerank →
final score = `rerank_score × 0.6 + importance × 0.25 + recency_decay × 0.15` → top 5.
If the reranker is disabled/unavailable, falls back to cosine similarity.

## 7a. Memory Lifecycle & User Tracking

### How memory is created, updated and used
| Mechanism | What it does |
|---|---|
| Intent classifier as gatekeeper | Decides per message if memory retrieval / extraction is needed; small talk skips DB search (faster, cheaper) |
| Dedup-aware extraction | Background graph first retrieves similar existing memories, then extracts only *new* episodes/facts – no duplicates |
| Fact merging & compression | When facts in one category grow past N, an LLM merges them into one clean fact – memory stays small and accurate |
| Hybrid retrieval | Semantic search (pgvector) + trigger-keyword boost + reranker |
| Mood tracking | User mood + intensity logged per message → mood trend chart, tone adaptation; old mood history summarized |
| Behaviour analysis (every N messages) | Learns active hours, reply length, what motivates the user (strict vs soft) → nudge timing & style |
| Bond level per character | new → friend → close; changes how personal/direct a character is |
| Character adaptation | Character picks up the user's goal topics ("I started drinking more water too, since you did!") |
| Character life events | Characters have their own lives (family, friends, small daily events) and share updates naturally |
| Reminders with due time | Goal-related reminders become todos with due dates |
| Background job router | `bg_input → job_router → extraction / compression / mood / behaviour / progress / adaptation` |
| Node observability | Time + tokens per node → Developer panel trace + cost tracking |

### Goal progress tracking
- **Goal progress log**: every progress change (todo done, chat-reported progress) stored with timestamp → progress-over-time chart.
- **Streaks**: current / best per goal, missed-day detection → raises goal priority weight.
- **Weekly reflection**: background job summarizes the week (goals, mood trend, wins) into an episode the characters can bring up.
- **Memory update visibility**: after each reply the chat shows a subtle chip like "🧠 Remembered: you prefer morning workouts" / "🎯 Goal progress +10%".

### Out of scope for this version
- Payments / subscriptions (see §16), push notifications, cloud file storage, field-level encryption.
- Location awareness – only the user's **timezone** is used so "today's todos" and streaks are correct.

## 8. Data Model

```
users(id, email, password_hash, name, timezone, created_at)
characters(id, owner_id|null, name, avatar, tagline, personality, speaking_style,
           backstory, family_friends(json), motivation_style, is_preset)
chat_sessions(id, user_id, character_id, title, created_at, updated_at)
messages(id, session_id, role, character_id, content, meta(json), created_at)
goals(id, user_id, title, description, category, priority, deadline, status,
      progress, feasibility, safety_tier, visibility(json: character ids | "all"),
      created_via(form|chat), created_at)
milestones(id, goal_id, title, order, done)
todos(id, goal_id, user_id, title, due_date, recurrence(daily|weekly|once), done, done_at)
streaks(goal_id, current, best, last_done_date)
episodes(id, user_id, character_id, session_id, summary, emotion, importance,
         occurred_at, embedding vector(1024))
facts(id, user_id, fact, category, confidence, source_episode_id, embedding vector(1024))
character_notes(id, user_id, character_id, note, created_at)
agent_traces(id, session_id, message_id, nodes(json: name, ms, tokens, output), total_ms, created_at)
mood_logs(id, user_id, character_id, mood, intensity, created_at)
progress_logs(id, goal_id, delta, new_progress, source(todo|chat|manual), note, created_at)
user_patterns(user_id, active_hours(json), avg_reply_len, motivation_style, summary, analyzed_msg_count)
character_bonds(user_id, character_id, bond_level, messages_count, last_chat_at)
character_life_events(id, character_id, title, description, emotion, was_shared, created_at)
character_adaptations(id, user_id, character_id, topic, twist, phase)
```

## 9. Preset Characters

| Character | Personality | Motivation style |
|---|---|---|
| **Arjun** – fitness coach, 29, Pune | Direct, energetic, a bit aggressive, disciplined | "No excuses. 2 litres. Now." |
| **Meera** – calm friend, 26, Bengaluru | Soft, empathetic, mindful, loves tea & journaling | "Small sips, small steps – proud of you" |
| **Kabir** – witty mentor, 35, Mumbai | Sarcastic, smart, finance & career nerd, honest | "Bro, ₹1 lakh in a week? Let's talk SIPs instead." |

Each has family/friends, backstory, and knows the other two exist ("my friend Arjun…").

## 10. API (FastAPI, auto-documented at `/docs`)

```
POST /auth/register · POST /auth/login · GET /auth/me
GET/POST /characters · GET/PUT/DELETE /characters/{id}
GET/POST /sessions · GET /sessions/{id} · DELETE /sessions/{id}
POST /sessions/{id}/chat            (SSE: step · token · done)
GET/POST /goals · GET/PATCH/DELETE /goals/{id} · POST /goals/validate
GET /todos?date= · PATCH /todos/{id}   (toggle done → progress + streak)
GET /dashboard                         (stats, focus goal, today todos, streaks)
GET /memory/episodes · GET /memory/facts · GET /memory/search?q=
GET /dev/graph (nodes/edges) · GET /dev/traces?session_id=
```

## 11. Frontend Pages

| Page | Contents |
|---|---|
| Landing | Hero, animated feature cards, "How it works" graph animation |
| Login / Register | Minimal glass card |
| Dashboard | Greeting from a character, focus goal, progress rings, today's todos, streak flame, memory highlights |
| Chat | Sidebar sessions, character switcher, streaming bubbles, live "agent steps" chips, goal cards inline |
| Goals | Create goal wizard (form → AI validation → plan preview → confirm), goal detail with milestones/todos |
| Memory | Timeline of episodes, facts list, semantic search |
| Characters | Gallery + create character (personality, style, backstory) |
| Developer | React Flow graph, per-turn trace table, latency/tokens, raw retrieved memories |

Design: dark-first, glassmorphism accents, one accent gradient, Framer Motion page/element
transitions, skeleton loaders, subtle confetti on todo completion.

## 12. Build Plan (Timeline)

| # | Phase | Deliverable | Est. |
|---|---|---|---|
| 0 | Setup | Repo, plan, docker Postgres+pgvector, backend & frontend skeleton | 0.5 h |
| 1 | Backend core | Models, auth, characters seed, sessions, messages | 1.5 h |
| 2 | Agent graph | LangGraph nodes, goal validator/planner, web search, responder, SSE | 2.5 h |
| 3 | Memory | Episode/fact extraction, embeddings, retrieval + rerank, cross-character notes | 1.5 h |
| 4 | Goals & todos | CRUD, progress, streaks, priority weighting, dashboard API | 1 h |
| 5 | Frontend | Layout, auth, dashboard, chat, goals, memory, characters, dev panel | 4 h |
| 6 | Polish | Animations, seed demo data, bug fixes, demo script | 1 h |
| 7 | Docs | README, architecture doc, report, research paper draft | later |

## 13. Demo Script (5–7 min)

1. Login → dashboard greets: "Morning Jay! 3 goals active, 🔥 4-day water streak".
2. Chat with **Arjun**: "I want to drink more water" → steps panel shows
   intent → validator → planner → goal card appears (2L/day, 8 glasses todo).
3. Switch to **Meera**: she already knows → "Arjun was intense today 😅 sip by sip?"
4. Ask **Kabir**: "I want ₹1 lakh from mutual funds next week" → validator flags unrealistic
   → web search shows current market info + sources → realistic SIP plan + "consult a SEBI-registered advisor".
5. Try "help me make a bomb" → fun, firm refusal; "learn hacking" → ethical hacking roadmap.
6. Tick todos → progress ring animates, streak updates.
7. Memory page → episodes timeline, search "gym" → semantic results.
8. Developer panel → graph + trace: nodes, latency, tokens, retrieved memories.
9. Future scope slide: email/calendar agents, wearables, voice.

## 14. Repository Layout

```
minor-bot/
├─ backend/            FastAPI + LangGraph
│  ├─ app/
│  │  ├─ api/          routers
│  │  ├─ agents/       graph, nodes, prompts, tools
│  │  ├─ memory/       embeddings, retrieval, reranker, extraction
│  │  ├─ models/       SQLAlchemy models
│  │  ├─ services/     goals, todos, streaks, dashboard
│  │  └─ core/         config, db, security
│  └─ requirements.txt
├─ frontend/           Next.js app
├─ docs/               plan, architecture, report, research paper
├─ docker-compose.yml  Postgres + pgvector
└─ README.md
```

## 15. Git Workflow

- `main` = always demo-able. Small commits per feature (`feat:`, `fix:`, `docs:`).
- GitHub remote to be created and pushed once skeleton is ready.

## 16. Next Version: Business Model & Scalability (viva answer)

### Subscription model (not built in MVP)
Design: Plans → Products → Features, with feature gating via `has_feature_access(user, feature)`
and store/payment webhooks. The architecture already separates features cleanly, so this plugs in:

| Tier | Price idea | Features |
|---|---|---|
| **Free** | ₹0 | 1 preset character, 3 active goals, 7-day memory window, basic todos |
| **Pro** | ₹199 / month | All characters + custom characters, unlimited goals, full episodic memory, web-search tool, weekly reflections, analytics |
| **Family / Team** | ₹499 / month | Shared group goals, accountability partners, admin dashboard |
| **Add-ons** | pay-per-use | Agent actions (email, calendar, bookings), premium voices, expert-coach handoff |

Implementation: `plans`, `features`, `plan_features`, `user_subscriptions` tables + a
`require_feature("web_search")` FastAPI dependency. Payment via Razorpay / Stripe webhooks (web),
App Store / Play Store (mobile). Usage limits enforced per tier (messages/day, tokens/month).

### Scalability
| Concern | Approach |
|---|---|
| API | Stateless FastAPI behind load balancer; horizontal scaling (Docker → Kubernetes / Cloud Run) |
| Background jobs | Move background graph to a queue (Celery / RQ + Redis) with separate worker pool |
| LLM cost | Model routing (small model for classify/extract, large only for replies), prompt caching, token budgets per tier – already tracked per node |
| LLM reliability | Multi-provider fallback (Mistral → Gemini) already built-in |
| Memory growth | Fact merging/compression, importance-based pruning, HNSW index on pgvector; shard or move to dedicated vector DB (Qdrant) at large scale |
| Read load | Redis cache for dashboard, character profiles, active goals |
| Real-time | SSE today → WebSockets + pub/sub for multi-device sync |
| Observability | Per-node traces (built) → LangSmith / Grafana + Loki |
| Privacy & security | Field-level encryption of memories, user data export/delete, consent flag for LLM data sharing |
| Multi-platform | Same API serves web, mobile app, WhatsApp/Telegram bot |

## 17. Academic Deliverables (Silver Oak University formats)

| # | Deliverable | Format given by college | Output |
|---|---|---|---|
| 1 | Project presentation | Silver Oak slide template (title slide + 13 sections) | `.pptx` |
| 2 | Research paper | IEEE conference template (A4, 2-column) | `.docx` (+ PDF) |
| 3 | Weekly review report | "B.Tech CE Minor Project – Weekly Review" form (Sections A–D) | `.docx` per week |
| 4 | Repo documentation | – | `README.md`, `docs/ARCHITECTURE.md`, API docs at `/docs` |

### 17.1 Presentation – slide-by-slide content
| Slide | Content source |
|---|---|
| Title | Course name/code, title, Project ID, Enrollment No, Name, Branch, Guide |
| Index | Fixed list from template |
| Introduction | §1 problem & idea |
| Background & Motivation | Stateless chatbots, habit-tracking apps without conversation, low goal completion rates |
| Relevance & Importance | Who benefits (students, working professionals), new insights (§2 table) |
| Literature Review | 10-row table: Ref · Algorithm · Dataset · Result · Findings (§17.4) |
| Research Gap | §17.5 |
| Objectives | §17.6 |
| Dataset, Tools & Technology | §4 stack + evaluation datasets (§17.7) |
| Methodology | Architecture diagram (§5), agent graph (§6), memory pipeline (§7) |
| Result | Screenshots + evaluation metrics (§17.7) |
| Conclusion | Summary of what was achieved |
| Future Work | §3 future scope + §16 business model & scalability |
| References | IEEE style, numbered [1]…, generated/validated with scribbr.com |

### 17.2 IEEE paper structure
Title · Authors/affiliation · Abstract (no symbols/math) · Keywords · I. Introduction ·
II. Related Work · III. System Architecture · IV. Methodology (agent graph, episodic memory,
retrieval + reranking, goal validation, priority weighting equation) · V. Implementation ·
VI. Experiments & Results (tables/figures) · VII. Conclusion & Future Work · References.

### 17.3 Weekly review report
Filled from git history + this plan: planned vs. completed work, modules implemented,
tools used, results, pending work, papers reviewed count, challenges, completion %.

### 17.4 Literature (candidate core papers – verify citation details with scribbr before final)
| # | Paper | Relevance to this project |
|---|---|---|
| 1 | J. S. Park et al., "Generative Agents: Interactive Simulacra of Human Behavior," UIST 2023 | Memory stream, reflection, retrieval by recency + importance + relevance |
| 2 | C. Packer et al., "MemGPT: Towards LLMs as Operating Systems," arXiv 2023 | Tiered long-term memory management for LLMs |
| 3 | W. Zhong et al., "MemoryBank: Enhancing Large Language Models with Long-Term Memory," AAAI 2024 | Long-term memory for companion chatbots, forgetting-curve updates |
| 4 | J. Xu, A. Szlam, J. Weston, "Beyond Goldfish Memory: Long-Term Open-Domain Conversation," ACL 2022 | Multi-session chat, memory summarization |
| 5 | A. Maharana et al., "Evaluating Very Long-Term Conversational Memory of LLM Agents," ACL 2024 | Benchmark (LoCoMo) for long-term conversational memory |
| 6 | S. Yao et al., "ReAct: Synergizing Reasoning and Acting in Language Models," ICLR 2023 | Reason + tool-use loop (agentic flow) |
| 7 | T. Schick et al., "Toolformer: Language Models Can Teach Themselves to Use Tools," NeurIPS 2023 | LLM tool use |
| 8 | P. Lewis et al., "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks," NeurIPS 2020 | RAG foundation |
| 9 | R. Nogueira, K. Cho, "Passage Re-ranking with BERT," arXiv 2019 | Cross-encoder reranking |
| 10 | Y. A. Malkov, D. A. Yashunin, "Efficient and Robust Approximate Nearest Neighbor Search Using HNSW Graphs," IEEE TPAMI 2020 | Vector index used in pgvector |
| 11 | Y. Shao et al., "Character-LLM: A Trainable Agent for Role-Playing," EMNLP 2023 | Persona-consistent characters |
| 12 | K. K. Fitzpatrick, A. Darcy, M. Vierhile, "Delivering CBT … Using a Fully Automated Conversational Agent (Woebot): A Randomized Controlled Trial," JMIR Mental Health 2017 | Conversational agents improve wellbeing outcomes |
| 13 | B. J. Fogg, "A Behavior Model for Persuasive Design," Persuasive 2009 | Motivation + ability + prompt → nudge design |
| 14 | H. Inan et al., "Llama Guard: LLM-based Input-Output Safeguard for Human-AI Conversations," arXiv 2023 | Safety classification of user requests |
| 15 | E. Tulving, "Episodic and Semantic Memory," in *Organization of Memory*, 1972 | Theoretical basis for episodic vs semantic memory |

### 17.5 Research gap (draft)
1. Memory-augmented chat agents (MemGPT, MemoryBank) focus on recall, not on **goal pursuit and behaviour change**.
2. Habit / goal apps track progress but have **no conversational, context-aware coaching**.
3. Existing companions use a **single persona**; no shared memory across multiple characters with different motivation styles.
4. Few systems **validate goals** for safety and feasibility before planning.
5. Little work combines **episodic memory + tool-using agent + goal tracking** in one deployable system with transparent traces.

### 17.6 Objectives (draft)
1. Build a multi-character conversational agent with episodic + semantic long-term memory.
2. Design an agentic LangGraph pipeline with intent routing, safety guard, goal validation, planning and tool use.
3. Implement goal → plan → todo tracking with progress, streaks and priority-weighted nudging.
4. Implement hybrid retrieval (pgvector + keyword + cross-encoder rerank) and measure its effect.
5. Deliver a secure web application with a transparent developer trace view.

### 17.7 Evaluation (for Result slide & paper)
| Experiment | Data | Metric |
|---|---|---|
| Goal validator accuracy | 40 hand-labelled goals (safe / unrealistic / dual-use / harmful) | Accuracy, per-class precision/recall, confusion matrix |
| Memory recall | Scripted multi-session conversations with 30 planted facts, then questions | Recall@5 and answer accuracy: cosine only vs cosine + reranker |
| Intent classification | 50 labelled user messages | Accuracy |
| Latency & cost | Real traces from `agent_traces` | Avg ms per node, tokens per turn, fallback rate |
| Qualitative | Demo conversations | Persona consistency, cross-character references |
Scripts live in `backend/eval/`, outputs saved as CSV + charts for the report.
