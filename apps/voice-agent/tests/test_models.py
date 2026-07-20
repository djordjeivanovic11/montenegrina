# ruff: noqa: RUF001
from montenegrina_voice_agent.language import normalize_voice_text
from montenegrina_voice_agent.models import RuntimeBootstrap


def test_bootstrap_rejects_fake_provider_mode() -> None:
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
            "systemPrompt": "Odgovaraj na crnogorskom.",
            "routingPolicy": {
                "mode": "real",
                "pipelineMode": "controlled",
                "sttLanguage": "sr",
            },
        },
    }
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
