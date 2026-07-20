import asyncio
import json
from collections.abc import AsyncIterable, Coroutine
from typing import Any
from uuid import uuid4

from livekit import agents
from livekit.agents import Agent, AgentSession, ChatContext, ChatMessage, function_tool
from livekit.plugins import deepgram, elevenlabs, openai

from .inbound import provision_inbound, wait_for_sip_numbers
from .language import normalize_voice_text
from .models import RuntimeBootstrap, RuntimeTool
from .runtime_api import EventBatcher, RuntimeApi
from .settings import Settings
from .telemetry import RuntimeEvents
from .voice_prompt import build_voice_instructions


class MontenegrinAgent(Agent):
    def __init__(
        self,
        runtime: RuntimeApi,
        config: RuntimeBootstrap,
        tools: list[Any],
        retrieval: bool,
        events: RuntimeEvents,
    ) -> None:
        super().__init__(
            instructions=build_voice_instructions(config.config.systemPrompt),
            tools=tools,
        )
        self._runtime = runtime
        self._retrieval = retrieval
        self._events = events
        self._script = config.config.languageProfile.script

    async def on_user_turn_completed(
        self, turn_ctx: ChatContext, new_message: ChatMessage
    ) -> None:
        text_value = getattr(new_message, "text_content", "")
        text = text_value() if callable(text_value) else text_value
        text = (text or "").strip()
        if text:
            text = normalize_voice_text(text, self._script)
            await self._events.emit(
                "user.turn.completed",
                {"text": text},
                turn_id=str(uuid4()),
                state="THINKING",
            )
        if not self._retrieval:
            return
        citations = await self._runtime.retrieve(text)
        if citations:
            turn_ctx.add_message(
                role="assistant",
                content="Kontekst iz odobrene baze znanja (citiraj samo ove izvore):\n"
                + json.dumps(citations, ensure_ascii=False),
            )

    def transcription_node(
        self, text: AsyncIterable[str], model_settings: Any
    ) -> AsyncIterable[str]:
        events = self._events

        async def stream() -> AsyncIterable[str]:
            async for chunk in text:
                piece = chunk if isinstance(chunk, str) else str(getattr(chunk, "text", chunk))
                if piece:
                    piece = normalize_voice_text(piece, self._script)
                    payload: dict[str, str] = {"text": piece}
                    if events.current_speech_id:
                        payload["speechId"] = events.current_speech_id
                    await events.emit("assistant.text.delta", payload)
                yield piece if isinstance(chunk, str) else chunk

        return stream()

    def tts_node(self, text: AsyncIterable[str], model_settings: Any) -> Any:
        async def stream() -> AsyncIterable[str]:
            async for chunk in text:
                yield normalize_voice_text(chunk, self._script)

        return Agent.default.tts_node(self, stream(), model_settings)


def runtime_tools(
    definitions: list[RuntimeTool], runtime: RuntimeApi, events: RuntimeEvents
) -> list[Any]:
    tools: list[Any] = []
    for definition in definitions:
        schema = {
            "type": "function",
            "name": definition.name,
            "description": definition.description,
            "parameters": definition.inputSchema,
        }

        async def handler(
            raw_arguments: dict[str, object], _context: Any, *, tool: RuntimeTool = definition
        ) -> str:
            invocation_key = str(uuid4())
            await events.emit(
                "tool.started", {"tool": tool.name, "idempotencyKey": invocation_key},
                state="TOOL_PENDING",
            )
            try:
                result = await runtime.invoke_tool(tool.name, raw_arguments, invocation_key)
                await events.emit(
                    "tool.completed", {"tool": tool.name, "result": result}, state="THINKING"
                )
                return json.dumps(result, ensure_ascii=False)
            except Exception as error:
                await events.emit(
                    "tool.failed", {"tool": tool.name, "code": "TOOL_EXECUTION_FAILED"},
                    state="THINKING",
                )
                raise RuntimeError("Tool execution failed") from error

        tools.append(function_tool(handler, raw_schema=schema))
    return tools


def create_session(config: RuntimeBootstrap, settings: Settings) -> AgentSession[Any]:
    routing = config.config.routingPolicy
    if routing.pipelineMode == "direct_realtime":
        return AgentSession(
            llm=openai.realtime.RealtimeModel(
                api_key=settings.openai_api_key,
                model=routing.realtimeModel or settings.openai_realtime_model,
                modalities=["audio", "text"],
            ),
            user_away_timeout=20.0,
            min_endpointing_delay=1.2,
        )
    language = routing.sttLanguage
    if language not in {"sr", "hr", "bs", "multi"}:
        raise ValueError("Published controlled pipelines require an explicit STT language")
    stt_provider = routing.sttProvider or settings.voice_stt_provider
    tts_provider = routing.ttsProvider or settings.voice_tts_provider
    stt_model = routing.sttModel or settings.openai_stt_model
    tts_model = routing.ttsModel
    stt: Any
    if stt_provider == "openai":
        stt = openai.STT(
            api_key=settings.openai_api_key,
            model=stt_model,
            language=language,
            prompt="Crnogorski govor, ijekavica, latinica. Sačuvaj imena, brojeve i nazive.",
        )
    elif stt_provider == "deepgram":
        if not settings.deepgram_api_key:
            raise ValueError("DEEPGRAM_API_KEY is required when sttProvider is deepgram")
        stt = deepgram.STT(
            api_key=settings.deepgram_api_key,
            model=routing.sttModel or settings.deepgram_model,
            language=language,
            interim_results=True,
            smart_format=True,
            endpointing_ms=850,
        )
    else:
        raise ValueError(f"Unsupported STT provider: {stt_provider}")

    tts: Any
    if tts_provider == "elevenlabs":
        if not settings.elevenlabs_api_key or not settings.elevenlabs_montenegrin_voice_id:
            raise ValueError(
                "ELEVENLABS_API_KEY and ELEVENLABS_MONTENEGRIN_VOICE_ID are required "
                "when ttsProvider is elevenlabs"
            )
        tts = elevenlabs.TTS(
            api_key=settings.elevenlabs_api_key,
            model=tts_model or settings.elevenlabs_model,
            voice_id=settings.elevenlabs_montenegrin_voice_id,
            language="hr",
            auto_mode=True,
            apply_text_normalization="off",
        )
    elif tts_provider == "openai":
        tts = openai.TTS(
            api_key=settings.openai_api_key,
            model=tts_model or settings.openai_tts_model,
            voice=settings.openai_tts_voice,
            instructions="Govori prirodno, kratko i jasno na crnogorskom jeziku, latinica.",
        )
    else:
        raise ValueError(f"Unsupported TTS provider: {tts_provider}")

    return AgentSession(
        stt=stt,
        llm=openai.responses.LLM(
            api_key=settings.openai_api_key,
            model=routing.llmModel or settings.openai_model,
            store=False,
            use_websocket=True,
        ),
        tts=tts,
        user_away_timeout=20.0,
        min_endpointing_delay=1.2,
    )


def _speech_payload(events: RuntimeEvents, payload: dict[str, Any]) -> dict[str, Any]:
    if events.current_speech_id:
        return {**payload, "speechId": events.current_speech_id}
    return payload


def wire_events(
    session: AgentSession[Any], events: RuntimeEvents, closed: asyncio.Event
) -> None:
    tasks: set[asyncio.Task[Any]] = set()

    def schedule(coro: Coroutine[Any, Any, Any]) -> None:
        task = asyncio.create_task(coro)
        tasks.add(task)
        task.add_done_callback(tasks.discard)

    @session.on("speech_created")
    def on_speech_created(event: Any) -> None:
        events.current_speech_id = event.speech_handle.id

    @session.on("user_input_transcribed")
    def on_transcript(event: Any) -> None:
        event_type = "transcription.final" if event.is_final else "transcription.partial"
        emit_kwargs: dict[str, Any] = {}
        if not event.is_final and events.state == "LISTENING":
            emit_kwargs["state"] = "TRANSCRIBING"
        schedule(events.emit(event_type, {"text": event.transcript}, **emit_kwargs))

    @session.on("user_state_changed")
    def on_user_state(event: Any) -> None:
        if event.new_state == "speaking":
            if events.state == "SPEAKING":
                schedule(events.emit("assistant.interrupted", {}, state="INTERRUPTED"))
            schedule(events.emit("audio.started", {}))

    @session.on("agent_state_changed")
    def on_agent_state(event: Any) -> None:
        if event.new_state == "thinking" and events.state in {"TRANSCRIBING", "LISTENING"}:
            schedule(events.emit("turn.started", {}, state="THINKING"))
        elif event.new_state == "speaking" and events.state in {"THINKING", "TOOL_PENDING"}:
            schedule(
                events.emit(
                    "assistant.audio.started",
                    _speech_payload(events, {}),
                    state="SPEAKING",
                )
            )
        elif event.new_state == "listening" and events.state in {"SPEAKING", "INTERRUPTED"}:
            schedule(events.emit("assistant.audio.completed", {}, state="LISTENING"))

    @session.on("conversation_item_added")
    def on_item(event: Any) -> None:
        item = event.item
        role = getattr(item, "role", "")
        text_value = getattr(item, "text_content", "")
        text = text_value() if callable(text_value) else text_value
        if role == "assistant" and text:
            schedule(
                events.emit(
                    "assistant.text.completed",
                    _speech_payload(events, {"text": text}),
                )
            )

    @session.on("close")
    def on_close(_event: Any) -> None:
        closed.set()


DEFAULT_RECORDING_NOTICE = (
    "Ovaj poziv se snima u svrhu kvaliteta usluge."
)


def greeting_instructions(config: RuntimeBootstrap) -> str:
    base = (
        "Pozdravi korisnika kratko na crnogorskom i pitaj kako možeš pomoći. "
        "Odgovori jednom kratkom rečenicom."
    )
    if config.channel != "SIP" or not config.config.retention.recordAudio:
        return base
    notice = (
        config.config.telephony.recordingNotice
        if config.config.telephony and config.config.telephony.recordingNotice
        else DEFAULT_RECORDING_NOTICE
    )
    return f"Prvo izgovori tačno sljedeće na crnogorskom: \"{notice}\" Zatim {base}"


async def run_job(ctx: agents.JobContext, settings: Settings) -> None:
    metadata = json.loads(ctx.job.metadata or "{}")
    await ctx.connect()
    if metadata.get("mode") == "inbound":
        called, caller = await wait_for_sip_numbers(ctx.room)
        phone_number_id = metadata.get("phoneNumberId")
        token = await provision_inbound(
            settings,
            room_name=ctx.room.name,
            called_number=called,
            caller_number=caller,
            phone_number_id=str(phone_number_id) if phone_number_id else None,
        )
    else:
        token = metadata.get("runtimeToken")
        if not isinstance(token, str) or not token:
            raise ValueError("Agent dispatch is missing a runtime token")
    runtime = RuntimeApi(
        settings.internal_api_url,
        token,
        settings.provider_operation_timeout_seconds,
    )
    config = await runtime.bootstrap()
    batcher = EventBatcher(
        runtime.send_events,
        settings.event_batch_size,
        settings.event_flush_seconds,
        settings.event_queue_capacity,
    )
    batcher.start()
    events = RuntimeEvents(config, ctx.room, batcher)
    session = create_session(config, settings)
    configured_ids = getattr(config.config, "knowledgeBaseIds", None) or []
    controlled = config.config.routingPolicy.pipelineMode == "controlled"
    retrieval_enabled = controlled and len(configured_ids) > 0
    agent = MontenegrinAgent(
        runtime,
        config,
        runtime_tools(config.tools, runtime, events),
        retrieval=retrieval_enabled,
        events=events,
    )
    closed = asyncio.Event()
    wire_events(session, events, closed)
    try:
        await events.emit(
            "session.started",
            {"pipelineMode": config.config.routingPolicy.pipelineMode},
            state="LISTENING",
        )
        await session.start(room=ctx.room, agent=agent)
        session.generate_reply(instructions=greeting_instructions(config))
        try:
            await asyncio.wait_for(
                closed.wait(), timeout=config.maximumDurationMinutes * 60
            )
        except TimeoutError:
            session.shutdown()
            await asyncio.wait_for(closed.wait(), timeout=10)
    except Exception as error:
        await events.fail("VOICE_RUNTIME_FAILED", str(error)[:300], False)
        raise
    finally:
        if events.state in {"LISTENING", "SPEAKING", "HANDED_OFF"}:
            await events.emit("session.completed", {}, state="COMPLETED")
        await batcher.close()
        await runtime.close()
