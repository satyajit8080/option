"""
Centralised application configuration, loaded from environment variables
(or a local .env file in development). Import `settings` everywhere instead
of reading os.environ directly so there is one source of truth.
"""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- Dhan API ---
    dhan_access_token: str = ""
    dhan_client_id: str = ""
    dhan_base_url: str = "https://api.dhan.co/v2"

    # --- Redis ---
    redis_url: str = "redis://localhost:6379/0"

    # --- App ---
    app_env: str = "development"
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    # Dhan documents a 1-request-per-3-second rate limit on the Option
    # Chain endpoint. Never set this below 3.0 or you risk 429s / bans.
    option_chain_poll_interval_seconds: float = 3.5

    snapshot_retention_hours: int = 12

    # --- AI market brief (OpenRouter) ---
    # The brief feature is OPTIONAL and fully isolated: if openrouter_api_key
    # is empty, the /api/brief endpoint returns a clear "not configured"
    # response and nothing else in the app is affected.
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    # Any model slug OpenRouter supports — swap without code changes.
    # A small/cheap model is plenty for a short structured brief.
    openrouter_model: str = "anthropic/claude-3.5-haiku"
    # "As market changes" controls: never call the LLM more often than the
    # floor, force a refresh after the ceiling even if quiet.
    brief_min_seconds_between_calls: int = 150  # 2.5 min floor
    brief_max_staleness_seconds: int = 900       # 15 min ceiling
    # Optional headers OpenRouter recommends for attribution/ranking.
    openrouter_referer: str = "https://optionscope.app"
    openrouter_title: str = "OptionScope"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
