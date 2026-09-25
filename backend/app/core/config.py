from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(ROOT_DIR / ".env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    jwt_secret: str = "dev-secret-change-me"
    jwt_expire_days: int = 7
    cors_origins: str = "http://localhost:3000"

    postgres_db: str = "lifecoach"
    postgres_user: str = "lifecoach"
    postgres_password: str = "lifecoach"
    postgres_host: str = "localhost"
    postgres_port: int = 5433

    # One or more keys per provider, comma-separated (MISTRAL_API_KEY=key1,key2). When a key hits its
    # rate limit or quota, the next key of the same provider is tried before switching provider.
    mistral_api_key: str = ""
    gemini_api_key: str = ""
    llm_primary: str = "mistral"  # mistral | gemini — the other one is the automatic fallback
    # Small, low-cost models by default; replies can be switched to a larger model from .env.
    llm_reply_model: str = "mistral-small-latest"
    llm_fast_model: str = "mistral-small-latest"
    llm_fallback_model: str = "gemini-2.5-flash-lite"
    llm_fallback_fast_model: str = "gemini-2.5-flash-lite"
    llm_reply_max_tokens: int = 700  # a chat reply is a few short paragraphs at most
    llm_task_max_tokens: int = 2000  # classify / plan / extract (structured JSON)
    llm_timeout_seconds: int = 45
    # Embeddings must come from ONE provider per database (vectors from different models are not comparable).
    embedding_provider: str = "mistral"  # mistral | gemini
    embedding_model: str = "mistral-embed"
    gemini_embedding_model: str = "models/gemini-embedding-001"
    embedding_dim: int = 1024

    reranker_provider: str = "local"  # local | none
    reranker_model: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"

    # Memory tuning
    retrieval_candidates: int = 20
    retrieval_top_k: int = 6
    max_distance: float = 0.65
    fact_compression_threshold: int = 8
    behaviour_interval_msgs: int = 10
    adaptation_interval_msgs: int = 8
    history_window: int = 12

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def mistral_keys(self) -> list[str]:
        return _split_keys(self.mistral_api_key)

    @property
    def gemini_keys(self) -> list[str]:
        return _split_keys(self.gemini_api_key)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


def _split_keys(value: str) -> list[str]:
    return [k.strip() for k in value.split(",") if k.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
