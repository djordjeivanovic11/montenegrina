from datetime import UTC, datetime
from time import perf_counter
from typing import Any
from uuid import uuid4

from livekit import rtc
from livekit.rtc.participant import PublishDataError

from .language import normalize_voice_stream_text, normalize_voice_text
from .models import ConversationState, RealtimeEvent, RuntimeBootstrap
from .runtime_api import EventBatcher

NORMALIZED_FINAL_TEXT_EVENTS = {
    "transcription.partial",
    "transcription.final",
    "user.turn.completed",
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
        self._user_audio_started_at: float | None = None
        self._user_audio_ended_at: float | None = None
        self._assistant_turn_started_at: float | None = None
        self._first_assistant_text_at: float | None = None
        self._assistant_audio_started_at: float | None = None

    def mark_user_audio_started(self) -> None:
        self._user_audio_started_at = perf_counter()
        self._user_audio_ended_at = None
        self._assistant_turn_started_at = None
        self._first_assistant_text_at = None
        self._assistant_audio_started_at = None

    def mark_user_audio_ended(self) -> None:
        if self._user_audio_started_at is not None:
            self._user_audio_ended_at = perf_counter()

    def start_assistant_turn(self) -> None:
        self._assistant_turn_started_at = perf_counter()
        self._first_assistant_text_at = None
        self._assistant_audio_started_at = None

    def user_turn_latency_payload(self) -> dict[str, int | str]:
        payload: dict[str, int | str] = {}
        if self._user_audio_started_at is not None and self._user_audio_ended_at is not None:
            payload["speechDurationMs"] = int(
                (self._user_audio_ended_at - self._user_audio_started_at) * 1000
            )
            payload["latencyMs"] = int((perf_counter() - self._user_audio_ended_at) * 1000)
            payload["phase"] = "endpointing"
        return payload

    def first_assistant_text_latency_payload(self) -> dict[str, int | str]:
        if self._assistant_turn_started_at is None or self._first_assistant_text_at is not None:
            return {}
        self._first_assistant_text_at = perf_counter()
        return {
            "latencyMs": int(
                (self._first_assistant_text_at - self._assistant_turn_started_at) * 1000
            ),
            "phase": "llm_first_text",
        }

    def assistant_audio_latency_payload(self) -> dict[str, int | str]:
        if self._assistant_turn_started_at is None or self._assistant_audio_started_at is not None:
            return {}
        self._assistant_audio_started_at = perf_counter()
        payload: dict[str, int | str] = {
            "latencyMs": int(
                (self._assistant_audio_started_at - self._assistant_turn_started_at) * 1000
            ),
            "phase": "tts_first_audio",
        }
        if self._first_assistant_text_at is not None:
            payload["firstTextToAudioMs"] = int(
                (self._assistant_audio_started_at - self._first_assistant_text_at) * 1000
            )
        return payload

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
        if event_type == "assistant.text.delta" and isinstance(text, str):
            payload = {
                **payload,
                "text": normalize_voice_stream_text(
                    text, self._bootstrap.config.languageProfile.script
                ),
            }
        elif event_type in NORMALIZED_FINAL_TEXT_EVENTS and isinstance(text, str) and text.strip():
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

    async def emit_if_connected(
        self,
        event_type: str,
        payload: dict[str, Any],
        *,
        state: ConversationState | None = None,
        turn_id: str | None = None,
    ) -> RealtimeEvent | None:
        try:
            return await self.emit(event_type, payload, state=state, turn_id=turn_id)
        except PublishDataError:
            return None
