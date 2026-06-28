from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")

    internal_api_url: str = "http://api:3001"
    openai_api_key: str = Field(min_length=1)
    deepgram_api_key: str = Field(min_length=1)
    elevenlabs_api_key: str = Field(min_length=1)
    elevenlabs_montenegrin_voice_id: str = Field(min_length=1)
    openai_model: str = "gpt-5.4-mini"
    openai_realtime_model: str = "gpt-realtime-2"
    deepgram_model: str = "nova-3"
    elevenlabs_model: str = "eleven_flash_v2_5"
    provider_operation_timeout_seconds: float = 30.0
    event_batch_size: int = 25
    event_flush_seconds: float = 0.25
    event_queue_capacity: int = 1_000


settings = Settings()  # type: ignore[call-arg]
