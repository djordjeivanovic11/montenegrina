import asyncio
from collections.abc import Awaitable, Callable
from typing import Any

import httpx

from .models import RealtimeEvent, RuntimeBootstrap


class RuntimeApi:
    def __init__(self, base_url: str, token: str, timeout: float = 30.0) -> None:
        self._client = httpx.AsyncClient(
            base_url=base_url,
            headers={"Authorization": f"Bearer {token}"},
            timeout=timeout,
        )

    async def bootstrap(self) -> RuntimeBootstrap:
        response = await self._client.get("/internal/v1/runtime/bootstrap")
        response.raise_for_status()
        return RuntimeBootstrap.model_validate(response.json())

    async def retrieve(
        self, query: str, top_k: int = 8, *, mne_mcp_enabled: bool = False
    ) -> dict[str, Any]:
        response = await self._client.post(
            "/internal/v1/runtime/retrieve",
            json={"query": query, "topK": top_k, "mneMcpEnabled": mne_mcp_enabled},
        )
        response.raise_for_status()
        payload = response.json()
        if isinstance(payload, list):
            return {"items": list(payload), "mneMcp": {"status": "disabled"}}
        return {
            "items": list(payload.get("items", [])),
            "mneMcp": dict(payload.get("mneMcp", {})),
        }

    async def invoke_tool(
        self, name: str, arguments: dict[str, object], idempotency_key: str
    ) -> dict[str, Any]:
        response = await self._client.post(
            "/internal/v1/runtime/tools/invoke",
            json={"name": name, "input": arguments, "idempotencyKey": idempotency_key},
        )
        response.raise_for_status()
        return dict(response.json())

    async def send_events(self, events: list[RealtimeEvent]) -> None:
        response = await self._client.post(
            "/internal/v1/runtime/events/batch",
            json={"events": [event.model_dump(exclude_none=True) for event in events]},
        )
        if response.status_code == 409:
            return
        response.raise_for_status()

    async def close(self) -> None:
        await self._client.aclose()


class EventBatcher:
    def __init__(
        self,
        sender: Callable[[list[RealtimeEvent]], Awaitable[None]],
        batch_size: int,
        flush_seconds: float,
        capacity: int,
    ) -> None:
        self._sender = sender
        self._batch_size = batch_size
        self._flush_seconds = flush_seconds
        self._queue: asyncio.Queue[RealtimeEvent | None] = asyncio.Queue(maxsize=capacity)
        self._task: asyncio.Task[None] | None = None

    def start(self) -> None:
        self._task = asyncio.create_task(self._run())

    def add(self, event: RealtimeEvent) -> None:
        if self._queue.full() and event.type in {"transcription.partial", "assistant.text.delta"}:
            return
        self._queue.put_nowait(event)

    async def close(self) -> None:
        await self._queue.put(None)
        if self._task is not None:
            await self._task

    async def _run(self) -> None:
        batch: list[RealtimeEvent] = []
        while True:
            stopping = False
            try:
                item = await asyncio.wait_for(self._queue.get(), timeout=self._flush_seconds)
            except TimeoutError:
                item = None
            else:
                stopping = item is None
            if item is not None:
                batch.append(item)
            if batch and (item is None or len(batch) >= self._batch_size):
                await self._sender(batch)
                batch = []
            if stopping:
                return
