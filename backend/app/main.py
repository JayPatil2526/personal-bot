import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, characters, dev, goals, memory, sessions
from app.core.config import settings
from app.db.init_db import init_db
from app.memory import reranker

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    reranker.warm_up()
    yield


app = FastAPI(
    title="LifeCrew API — Conversational Lifestyle & Goal-Tracking AI with Episodic Memory",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (auth.router, characters.router, sessions.router, goals.router, memory.router, dev.router):
    app.include_router(r, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}
