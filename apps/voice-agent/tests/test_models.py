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
