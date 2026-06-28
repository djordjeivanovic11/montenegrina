import asyncio
import json
from typing import Any
from uuid import uuid4

from livekit import agents
from livekit.agents import Agent, AgentSession, ChatContext, ChatMessage, function_tool
from livekit.plugins import deepgram, elevenlabs, openai

from .models import RuntimeBootstrap, RuntimeTool
from .runtime_api import EventBatcher, RuntimeApi
from .settings import Settings
from .telemetry import RuntimeEvents


class MontenegrinAgent(Agent):
    def __init__(
        self, runtime: RuntimeApi, config: RuntimeBootstrap, tools: list[Any], retrieval: bool
    ) -> None:
        super().__init__(instructions=config.config.systemPrompt, tools=tools)
        self._runtime = runtime
        self._retrieval = retrieval

    async def on_user_turn_completed(
        self, turn_ctx: ChatContext, new_message: ChatMessage
    ) -> None:
        if not self._retrieval:
            return
        text_value = getattr(new_message, "text_content", "")
        text = text_value() if callable(text_value) else text_value
        citations = await self._runtime.retrieve(text)
        if citations:
            turn_ctx.add_message(
                role="assistant",
                content="Kontekst iz odobrene baze znanja (citiraj samo ove izvore):\n"
                + json.dumps(citations, ensure_ascii=False),
            )


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


def create_session(config: RuntimeBootstrap, settings: Settings) -> AgentSession:
    routing = config.config.routingPolicy
    if routing.pipelineMode == "direct_realtime":
        return AgentSession(
            llm=openai.realtime.RealtimeModel(
                api_key=settings.openai_api_key,
                model=routing.realtimeModel or settings.openai_realtime_model,
                modalities=["audio", "text"],
            ),
            user_away_timeout=20.0,
        )
    language = routing.sttLanguage
    if language not in {"sr", "hr", "bs", "multi"}:
        raise ValueError("Published controlled pipelines require an explicit STT language")
    return AgentSession(
        stt=deepgram.STT(
            api_key=settings.deepgram_api_key,
            model=settings.deepgram_model,
            language=language,
            interim_results=True,
            smart_format=True,
            endpointing_ms=300,
        ),
        llm=openai.responses.LLM(
            api_key=settings.openai_api_key,
            model=routing.llmModel or settings.openai_model,
            store=False,
            use_websocket=True,
        ),
        tts=elevenlabs.TTS(
            api_key=settings.elevenlabs_api_key,
            model=routing.ttsModel or settings.elevenlabs_model,
            voice_id=settings.elevenlabs_montenegrin_voice_id,
            language="hr",
            auto_mode=True,
            apply_text_normalization="off",
        ),
        user_away_timeout=20.0,
    )


def wire_events(session: AgentSession, events: RuntimeEvents, closed: asyncio.Event) -> None:
    def schedule(coro: Any) -> None:
        asyncio.create_task(coro)

    @session.on("user_input_transcribed")
    def on_transcript(event: Any) -> None:
        event_type = "transcription.final" if event.is_final else "transcription.partial"
        state = "THINKING" if event.is_final else "TRANSCRIBING"
        schedule(events.emit(event_type, {"text": event.transcript}, state=state))

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
            schedule(events.emit("assistant.audio.started", {}, state="SPEAKING"))
        elif event.new_state == "listening" and events.state in {"SPEAKING", "INTERRUPTED"}:
            schedule(events.emit("assistant.audio.completed", {}, state="LISTENING"))

    @session.on("conversation_item_added")
    def on_item(event: Any) -> None:
        item = event.item
        role = getattr(item, "role", "")
        text_value = getattr(item, "text_content", "")
        text = text_value() if callable(text_value) else text_value
        if role == "assistant" and text:
            schedule(events.emit("assistant.text.completed", {"text": text}))

    @session.on("close")
    def on_close(_event: Any) -> None:
        closed.set()


async def run_job(ctx: agents.JobContext, settings: Settings) -> None:
    metadata = json.loads(ctx.job.metadata or "{}")
    token = metadata.get("runtimeToken")
    if not isinstance(token, str) or not token:
        raise ValueError("Agent dispatch is missing a runtime token")
    runtime = RuntimeApi(settings.internal_api_url, token, settings.provider_operation_timeout_seconds)
    config = await runtime.bootstrap()
    await ctx.connect()
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
        runtime, config, runtime_tools(config.tools, runtime, events), retrieval=retrieval_enabled
    )
    closed = asyncio.Event()
    wire_events(session, events, closed)
    try:
        await events.emit("session.started", {"pipelineMode": config.config.routingPolicy.pipelineMode}, state="LISTENING")
        await session.start(room=ctx.room, agent=agent)
        session.generate_reply(
            instructions="Pozdravi korisnika kratko na crnogorskom i pitaj kako možeš pomoći."
        )
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
