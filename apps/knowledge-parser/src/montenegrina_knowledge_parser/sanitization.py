from __future__ import annotations

from typing import Any


def sanitize_text(value: str) -> str:
    """PostgreSQL text and jsonb reject U+0000 even when JSON-escaped."""
    return value.replace("\x00", "")


def sanitize_metadata(value: Any) -> Any:
    if isinstance(value, str):
        return sanitize_text(value)
    if isinstance(value, list):
        return [sanitize_metadata(item) for item in value]
    if isinstance(value, dict):
        return {sanitize_text(str(key)): sanitize_metadata(item) for key, item in value.items()}
    return value
