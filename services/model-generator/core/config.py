import os
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "Pinecone Model Generator"
    LOG_LEVEL: str = "INFO"

    # AI Model Configs
    MODEL_DEVICE: str = "cpu"  # or cpu
    MAX_VERTICES: int = 100_000
    GENERATION_TIMEOUT: int = 120  # seconds
    POLLING_INTERVAL: float = 2.0  # seconds

    # Redis (for async jobs)

    model_config = SettingsConfigDict()


class LocalSettings(Settings):
    ENV: str = "dev"
    LOCAL_STORAGE_PATH: Path = Field(default=Path("local_storage"))

    # Base URL for serving local files
    API_BASE_URL: str = "http://localhost:8000"
    pass


class ProductionSettings(Settings):
    ENV: str = "production"
    REDIS_URL: str = Field(..., validation_alias="REDIS_URL")
    S3_BUCKET_NAME: str = Field(..., validation_alias="S3_BUCKET_NAME")
    AWS_ACCESS_KEY: str = Field(..., validation_alias="AWS_ACCESS_KEY")
    AWS_SECRET_KEY: str = Field(..., validation_alias="AWS_SECRET_KEY")
    AWS_REGION: str = Field(..., validation_alias="AWS_REGION")
    USE_HTTPS: bool = Field(
        default=True, validation_alias="USE_HTTPS"
    )  # For S3 URL generation
    S3_UPLOAD_URL: str = Field(..., validation_alias="S3_UPLOAD_URL")
    TRIPO_API_KEY: str = Field(..., validation_alias="TRIPO_API_KEY")


# Factory to choose the right config
def get_settings():
    env = os.getenv("ENV", "local")
    print(f"Loading settings for environment: {env}")
    if env == "production":
        return ProductionSettings()  # type: ignore
    return LocalSettings()


settings = get_settings()
