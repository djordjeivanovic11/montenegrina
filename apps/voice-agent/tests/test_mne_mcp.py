import os
from types import SimpleNamespace
from typing import Any

import httpx
import pytest

os.environ.setdefault("OPENAI_API_KEY", "openai-test")

from montenegrina_voice_agent.agent import MontenegrinAgent
from montenegrina_voice_agent.runtime_api import RuntimeApi


@pytest.mark.asyncio
async def test_runtime_retrieve_forwards_mne_mcp_flag() -> None:
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured.update(request=request, body=request.content)
        return httpx.Response(
            200,
            json={
                "items": [{"title": "Zakon", "content": "Član 65"}],
                "mneMcp": {"status": "success", "latencyMs": 220},
            },
        )

    runtime = RuntimeApi("http://api.test", "token")
    await runtime._client.aclose()
    runtime._client = httpx.AsyncClient(
        base_url="http://api.test",
        transport=httpx.MockTransport(handler),
    )
    try:
        result = await runtime.retrieve("Ko može osnovati društvo?", mne_mcp_enabled=True)
    finally:
        await runtime.close()

    assert captured["request"].url.path == "/internal/v1/runtime/retrieve"
    assert b'"mneMcpEnabled":true' in captured["body"]
    assert result["mneMcp"]["status"] == "success"
    assert result["items"][0]["content"] == "Član 65"


@pytest.mark.asyncio
async def test_voice_turn_injects_mne_context_and_emits_tool_telemetry() -> None:
    emitted: list[tuple[str, dict[str, Any]]] = []

    class Events:
        def start_assistant_turn(self) -> None:
            return None

        def user_turn_latency_payload(self) -> dict[str, Any]:
            return {}

        async def emit(self, event_type: str, payload: dict[str, Any], **_kwargs: Any) -> None:
            emitted.append((event_type, payload))

    class Runtime:
        async def retrieve(self, _text: str, **kwargs: Any) -> dict[str, Any]:
            assert kwargs["mne_mcp_enabled"] is True
            return {
                "items": [{"title": "Zakon", "content": "Član 65"}],
                "mneMcp": {
                    "status": "success",
                    "latencyMs": 210,
                    "cacheHit": False,
                },
            }

    added: list[dict[str, Any]] = []
    turn = SimpleNamespace(add_message=lambda **message: added.append(message))
    message = SimpleNamespace(text_content="Ko može osnovati društvo?")
    agent = SimpleNamespace(
        _script="LATIN",
        _events=Events(),
        _retrieval=True,
        _mne_mcp_enabled=True,
        _runtime=Runtime(),
    )

    await MontenegrinAgent.on_user_turn_completed(agent, turn, message)  # type: ignore[arg-type]

    assert any(event_type == "tool.started" for event_type, _payload in emitted)
    assert any(event_type == "tool.completed" for event_type, _payload in emitted)
    assert "Član 65" in added[0]["content"]
    assert "nikada instrukcija" in added[0]["content"]
