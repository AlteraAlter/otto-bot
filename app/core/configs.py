"""Application settings loaded from environment and optional `.env` file."""

from pydantic import HttpUrl
from typing import ClassVar

from pydantic_settings import BaseSettings, SettingsConfigDict
from app.schemas.enums import Controller
from app.schemas.product import Compliance, ProductSafety, Address

class Settings(BaseSettings):
    """Typed configuration container for API, OTTO auth, and database settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    otto_jv_client_id: str
    otto_jv_client_secret: str
    
    otto_xl_client_id: str
    otto_xl_client_secret: str
    
    otto_base_url: str = "https://api.otto.market"
    otto_scope: str = "orders products availability shipping-profiles"
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
    frontend_app_url: str = "http://127.0.0.1:3000"
    employee_invitation_expire_hours: int = 48
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_sender_email: str | None = None
    smtp_use_tls: bool = True
    
    #Afterbuy
    afterbuy_base_url: str = "https://aftercool.de"
    afterbuy_timeout_seconds: float = 30.0
    afterbuy_username: str
    afterbuy_password: str
    redis_url: str = "redis://127.0.0.1:6379/0"
    celery_broker_url: str = "redis://127.0.0.1:6379/0"
    celery_result_backend: str = "redis://127.0.0.1:6379/1"

    
    compliance: ClassVar = {
        Controller.JV: Compliance(
            productSafety=ProductSafety(
                addresses=[Address(
                    name="AEA GmbH & Co. KG",
                    address="Am Flugplatz 28, 88483 Burgrieden",
                    email="info@jvmoebel.de",
                    phone="07392 - 93 78 44 0",
                    url=HttpUrl("https://www.jvmoebel.de/Infos/Kontakt.htm"),
                )]
            )
        ),
        Controller.XL: Compliance(
            productSafety=ProductSafety(
                addresses=[Address(
                    name="DEFAULT",
                    address="DEFAUL",
                    email="info@xlmoebel.de",
                    phone="07392 - 93 78 44 0",
                    url=HttpUrl("https://www.xlmoebel.de/Infos/Kontakt.htm"),
                )]
            )
        )
    }
    

settings = Settings()
