"""Application settings loaded from environment and optional `.env` file."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed configuration container for API, OTTO auth, and database settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    otto_jv_client_id: str
    otto_jv_client_secret: str
    otto_base_url: str = "https://api.otto.market"
    otto_scope: str = "orders products"
    otto_timeout_seconds: float = 20.0

    # DATABASE
    db_host: str
    db_port: int
    db_name: str
    db_user: str
    db_pass: str
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 1200


settings = Settings()
