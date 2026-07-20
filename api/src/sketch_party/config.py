"""Runtime settings loaded from environment."""

from __future__ import annotations

from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # NoDecode: pydantic-settings otherwise JSON-decodes list-typed env vars before our
    # "before" validator runs, which rejects a plain CSV string like "https://a.com,https://b.com".
    allowed_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]
    max_rooms: int = 500
    max_players: int = 10
    max_name_length: int = 20
    max_guess_length: int = 60
    turn_seconds: int = 240
    interstitial_seconds: int = 5

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def _split_csv(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value
