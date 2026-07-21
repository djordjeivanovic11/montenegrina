# ruff: noqa: RUF001
from types import SimpleNamespace
from typing import Any, cast

from montenegrina_voice_agent.language import (
    VoiceStreamStitcher,
    normalize_voice_stream_text,
    normalize_voice_text,
)
from montenegrina_voice_agent.models import RuntimeBootstrap


def runtime_payload() -> dict[str, object]:
    return {
        "organizationId": "00000000-0000-4000-8000-000000000001",
        "agentId": "00000000-0000-4000-8000-000000000002",
        "agentVersionId": "00000000-0000-4000-8000-000000000003",
        "conversationId": "00000000-0000-4000-8000-000000000004",
        "traceId": "0" * 32,
        "language": "cnr",
        "lastSequence": 0,
        "maximumDurationMinutes": 30,
        "tools": [],
        "config": {
            "systemPrompt": "Odgovaraj na crnogorskom.",
            "languageProfile": {"script": "latin"},
            "routingPolicy": {
                "mode": "real",
                "pipelineMode": "controlled",
                "sttProvider": "openai",
                "sttLanguage": "sr",
                "sttModel": "gpt-4o-transcribe",
                "ttsProvider": "elevenlabs",
            },
        },
    }


def test_bootstrap_rejects_fake_provider_mode() -> None:
    payload = runtime_payload()
    assert RuntimeBootstrap.model_validate(payload).config.routingPolicy.mode == "real"


def test_bootstrap_accepts_openai_stt_and_tts_provider_fields() -> None:
    payload = {
        "organizationId": "00000000-0000-4000-8000-000000000001",
        "agentId": "00000000-0000-4000-8000-000000000002",
        "agentVersionId": "00000000-0000-4000-8000-000000000003",
        "conversationId": "00000000-0000-4000-8000-000000000004",
        "traceId": "0" * 32,
        "language": "cnr",
        "lastSequence": 0,
        "maximumDurationMinutes": 30,
        "tools": [],
        "config": {
            "systemPrompt": "Odgovaraj kratko na crnogorskom.",
            "languageProfile": {"script": "latin"},
            "routingPolicy": {
                "mode": "real",
                "pipelineMode": "controlled",
                "sttProvider": "openai",
                "sttModel": "gpt-4o-transcribe",
                "ttsProvider": "openai",
            },
        },
    }

    routing = RuntimeBootstrap.model_validate(payload).config.routingPolicy

    assert routing.sttProvider == "openai"
    assert routing.sttModel == "gpt-4o-transcribe"
    assert routing.ttsProvider == "openai"


def test_voice_text_normalization_keeps_urls_and_ids_protected() -> None:
    text = "Шта је ово, шта се дешава? ACME_ID ostaje, https://example.com/Пут остаје."

    assert normalize_voice_text(text, script="latin") == (
        "Šta je ovo, šta se dešava? ACME_ID ostaje, https://example.com/Пут ostaje."
    )


def test_stream_text_normalization_preserves_chunk_boundaries() -> None:
    assert normalize_voice_stream_text(" je veliki ", script="latin") == " je veliki "
    assert normalize_voice_stream_text(" Људи\n", script="latin") == " Ljudi\n"


def test_stream_stitcher_infers_missing_spaces() -> None:
    stitcher = VoiceStreamStitcher("latin")
    chunks = ["LLM", "je", "skraćenica", "za", "Large", "Language", "Model,", "odnosno"]

    assert "".join(stitcher.push(chunk) for chunk in chunks) == (
        "LLM je skraćenica za Large Language Model, odnosno"
    )


def test_controlled_openai_session_uses_vad(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setenv("OPENAI_API_KEY", "openai-test")
    from montenegrina_voice_agent import agent

    vad = object()
    created: dict[str, object] = {}

    def fake_session(**kwargs: object) -> dict[str, object]:
        created.update(kwargs)
        return created

    monkeypatch.setattr(agent.silero.VAD, "load", lambda: vad)
    monkeypatch.setattr(agent.openai, "STT", lambda **kwargs: {"type": "stt", **kwargs})
    monkeypatch.setattr(agent.openai, "LLM", lambda **kwargs: {"type": "llm", **kwargs})
    monkeypatch.setattr(agent.elevenlabs, "TTS", lambda **kwargs: {"type": "tts", **kwargs})
    monkeypatch.setattr(agent, "AgentSession", fake_session)

    session = cast(
        dict[str, Any],
        agent.create_session(
            RuntimeBootstrap.model_validate(runtime_payload()),
            cast(
                Any,
                SimpleNamespace(
                    openai_api_key="openai-test",
                    openai_model="gpt-5.4",
                    openai_realtime_model="gpt-realtime-2",
                    openai_stt_model="gpt-4o-transcribe",
                    openai_tts_model="gpt-4o-mini-tts",
                    openai_tts_voice="ash",
                    deepgram_api_key="",
                    deepgram_model="nova-3",
                    elevenlabs_api_key="eleven-test",
                    elevenlabs_model="eleven_flash_v2_5",
                    elevenlabs_montenegrin_voice_id="voice-test",
                    voice_stt_provider="openai",
                    voice_tts_provider="elevenlabs",
                ),
            ),
        ),
    )

    assert session["vad"] is vad
    assert session["llm"]["model"] == "gpt-5.4"
    assert session["min_endpointing_delay"] == 0.55
    assert session["max_endpointing_delay"] == 1.2
    assert session["tts"]["auto_mode"] is False
    assert session["tts"]["chunk_length_schedule"] == [50, 90, 130, 180]
    assert session["tts"]["sync_alignment"] is False


def test_browser_initial_greeting_is_deterministic() -> None:
    from montenegrina_voice_agent.agent import initial_greeting_text

    assert (
        initial_greeting_text(RuntimeBootstrap.model_validate(runtime_payload()))
        == "Zdravo, kako mogu pomoći?"
    )


def test_sip_recording_notice_prefixes_initial_greeting() -> None:
    from montenegrina_voice_agent.agent import initial_greeting_text

    payload = runtime_payload()
    payload["channel"] = "SIP"
    config = payload["config"]
    assert isinstance(config, dict)
    config["retention"] = {"transcriptDays": 30, "recordAudio": True, "audioDays": 7}
    config["telephony"] = {"recordingNotice": "Poziv se snima."}

    assert (
        initial_greeting_text(RuntimeBootstrap.model_validate(payload))
        == "Poziv se snima. Zdravo, kako mogu pomoći?"
    )
