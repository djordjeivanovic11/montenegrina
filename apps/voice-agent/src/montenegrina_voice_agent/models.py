from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

ConversationState = Literal[
    "INITIALIZING", "LISTENING", "TRANSCRIBING", "THINKING", "TOOL_PENDING",
    "SPEAKING", "INTERRUPTED", "HANDOFF_PENDING", "HANDED_OFF", "COMPLETED", "FAILED",
]


class RoutingPolicy(BaseModel):
    mode: Literal["real"]
    pipelineMode: Literal["controlled", "direct_realtime"]
    sttLanguage: Literal["sr", "hr", "bs", "multi"] | None = None
    llmModel: str | None = None
    ttsModel: str | None = None
    realtimeModel: str | None = None


class RuntimeConfig(BaseModel):
    systemPrompt: str
    routingPolicy: RoutingPolicy


class RuntimeTool(BaseModel):
    name: str
    description: str
    inputSchema: dict[str, Any]
    riskClass: str


class RuntimeBootstrap(BaseModel):
    organizationId: str
    agentId: str
    agentVersionId: str
    conversationId: str
    traceId: str
    language: Literal["cnr"]
    config: RuntimeConfig
    tools: list[RuntimeTool] = Field(default_factory=list)
    lastSequence: int
    maximumDurationMinutes: int


class RealtimeEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    eventId: str
    type: str
    timestamp: str
    organizationId: str
    agentId: str
    conversationId: str
    turnId: str | None = None
    traceId: str
    sequence: int
    payload: dict[str, Any]
