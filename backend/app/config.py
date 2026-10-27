from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables or .env."""

    app_name: str = "Hospital Pharmacy ERP API"
    debug: bool = True
    database_schema: str = Field(default="erp_app", pattern=r"^[a-z][a-z0-9_]{0,62}$")
    require_postgres: bool = False
    cors_origins: list[str] = []
    database_url: str = "sqlite:///./temp.db"
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str | None = None
    smtp_starttls: bool = True
    smtp_cc_email: str | None = None
    user_login_url: str | None = None
    password_reset_url: str | None = None

    whatsapp_access_token: str | None = None
    whatsapp_phone_number_id: str | None = Field(default=None, pattern=r'^\d+$')
    whatsapp_template_name: str | None = None
    whatsapp_template_language: str = 'en'
    whatsapp_api_version: str | None = Field(default=None, pattern=r'^v\d+\.\d+$')

    @field_validator('whatsapp_access_token', 'whatsapp_phone_number_id', 'whatsapp_template_name', 'whatsapp_api_version', mode='before')
    @classmethod
    def optional_whatsapp_setting(cls, value):
        return (value.strip() or None) if isinstance(value, str) else value

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
