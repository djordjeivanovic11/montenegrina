from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from livekit import rtc

from .language import normalize_voice_text
from .models import ConversationState, RealtimeEvent, RuntimeBootstrap
from .runtime_api import EventBatcher

NORMALIZED_TEXT_EVENTS = {
    "transcription.partial",
    "transcription.final",
    "user.turn.completed",
    "assistant.text.delta",
    "assistant.text.completed",
}


class RuntimeEvents:
    def __init__(
        self, bootstrap: RuntimeBootstrap, room: rtc.Room, batcher: EventBatcher
    ) -> None:
        self._bootstrap = bootstrap
        self._room = room
        self._batcher = batcher
        self.sequence = bootstrap.lastSequence
        self.state: ConversationState = "INITIALIZING"
        self.current_speech_id: str | None = None

    async def emit(
        self,
        event_type: str,
        payload: dict[str, Any],
        *,
        state: ConversationState | None = None,
        turn_id: str | None = None,
    ) -> RealtimeEvent:
        self.sequence += 1
        text = payload.get("text")
        if event_type in NORMALIZED_TEXT_EVENTS and isinstance(text, str) and text.strip():
            payload = {
                **payload,
                "text": normalize_voice_text(text, self._bootstrap.config.languageProfile.script),
            }
        if state is not None:
            payload = {**payload, "state": state}
            self.state = state
        event = RealtimeEvent(
            eventId=str(uuid4()),
            type=event_type,
            timestamp=datetime.now(UTC).isoformat(),
            organizationId=self._bootstrap.organizationId,
            agentId=self._bootstrap.agentId,
            conversationId=self._bootstrap.conversationId,
            turnId=turn_id,
            traceId=self._bootstrap.traceId,
            sequence=self.sequence,
            payload=payload,
        )
        self._batcher.add(event)
        packet = event.model_dump_json(exclude_none=True).encode()
        await self._room.local_participant.publish_data(
            packet, reliable=True, topic="montenegrina.events"
        )
        return event

    async def fail(self, code: str, message: str, retryable: bool) -> None:
        await self.emit(
            "error",
            {"code": code, "message": message, "retryable": retryable},
            state="FAILED",
        )
