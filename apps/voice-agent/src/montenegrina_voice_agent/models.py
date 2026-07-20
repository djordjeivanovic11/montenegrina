from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

ConversationState = Literal[
    "INITIALIZING", "LISTENING", "TRANSCRIBING", "THINKING", "TOOL_PENDING",
    "SPEAKING", "INTERRUPTED", "HANDOFF_PENDING", "HANDED_OFF", "COMPLETED", "FAILED",
]


class RoutingPolicy(BaseModel):
    mode: Literal["real"]
    pipelineMode: Literal["controlled", "direct_realtime"]
    sttProvider: Literal["openai", "deepgram"] | None = None
    sttLanguage: Literal["sr", "hr", "bs", "multi"] | None = None
    sttModel: str | None = None
    ttsProvider: Literal["elevenlabs", "openai"] | None = None
    llmModel: str | None = None
    ttsModel: str | None = None
    realtimeModel: str | None = None


class TelephonySettings(BaseModel):
    recordingNotice: str | None = None
    outboundCallerId: str | None = None


class LanguageProfile(BaseModel):
    script: Literal["LATIN", "CYRILLIC"] = "LATIN"
    ijekavian: bool = True
    glossaryIds: list[str] = Field(default_factory=list)
    pronunciationIds: list[str] = Field(default_factory=list)

    @field_validator("script", mode="before")
    @classmethod
    def normalize_script(cls, value: object) -> object:
        if isinstance(value, str):
            return value.upper()
        return value


class RetentionPolicy(BaseModel):
    transcriptDays: int
    recordAudio: bool
    audioDays: int


class RuntimeConfig(BaseModel):
    systemPrompt: str
    languageProfile: LanguageProfile = Field(default_factory=LanguageProfile)
    routingPolicy: RoutingPolicy
    retention: RetentionPolicy = Field(
        default_factory=lambda: RetentionPolicy(transcriptDays=30, recordAudio=False, audioDays=7)
    )
    telephony: TelephonySettings | None = None
    knowledgeBaseIds: list[str] = Field(default_factory=list)


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
    channel: Literal['TEXT', 'BROWSER', 'SIP', 'BATCH'] = 'BROWSER'
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
