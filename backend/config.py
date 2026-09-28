from pydantic_settings import BaseSettings
from pydantic import ConfigDict
from functools import lru_cache
import os

# Resolve .env relative to this file so it works regardless of CWD
_ENV_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")


class Settings(BaseSettings):
    model_config = ConfigDict(
        env_file=_ENV_FILE,
        env_file_encoding="utf-8",
        protected_namespaces=("settings_",),   # suppress model_ warning
    )

    database_url: str
    azure_openai_endpoint: str = ""
    azure_openai_api_key: str = ""
    azure_openai_deployment: str = "gpt-4o-mini"
    azure_openai_api_version: str = "2024-02-01"
    chat_context_rows: int = 50
    model_auc: float = 0.0
    jwt_secret: str = "churn-intelligence-super-secret-jwt-key-2026"
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_email: str = "alerts@churn-intelligence.com"


def get_settings() -> Settings:
    return Settings()

