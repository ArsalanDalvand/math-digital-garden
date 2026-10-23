from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")
    database_url: str = Field(default="", repr=False)

    app_name: str = "Math Digital Garden"
    app_version: str = "0.1.0"
    app_description: str = "Atomic Digital Garden & Collaborative Learning Platform"
    frontend_origin: str = "http://127.0.0.1:4321"
    cookie_secure: bool = False
    content_git_repo: str = ""
    ai_base_url: str = "https://api.openai.com/v1"
    ai_api_key: str = Field(default="", repr=False)
    dify_base_url: str = "http://127.0.0.1:5001/v1"
    dify_api_key: str = Field(default="", repr=False)
    ai_embedding_model: str = "text-embedding-3-small"


settings = Settings()
