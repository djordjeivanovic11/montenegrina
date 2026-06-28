import httpx

from .settings import Settings


async def provision_inbound(
    settings: Settings,
    *,
    room_name: str,
    called_number: str,
    caller_number: str,
    sip_call_id: str | None = None,
    phone_number_id: str | None = None,
) -> str:
    if not settings.voice_agent_service_secret:
        raise RuntimeError("VOICE_AGENT_SERVICE_SECRET is not configured")
    async with httpx.AsyncClient(
        base_url=settings.internal_api_url,
        headers={"X-Voice-Agent-Secret": settings.voice_agent_service_secret},
        timeout=settings.provider_operation_timeout_seconds,
    ) as client:
        response = await client.post(
            "/internal/v1/runtime/provision-inbound",
            json={
                "roomName": room_name,
                "calledNumber": called_number,
                "callerNumber": caller_number,
                **({"sipCallId": sip_call_id} if sip_call_id else {}),
                **({"phoneNumberId": phone_number_id} if phone_number_id else {}),
            },
        )
        response.raise_for_status()
        payload = response.json()
        token = payload.get("runtimeToken")
        if not isinstance(token, str) or not token:
            raise RuntimeError("Inbound provisioning did not return a runtime token")
        return token


async def wait_for_sip_numbers(ctx_room: object, timeout_seconds: float = 30.0) -> tuple[str, str]:
    import asyncio

    deadline = asyncio.get_running_loop().time() + timeout_seconds
    while asyncio.get_running_loop().time() < deadline:
        remote_participants = getattr(ctx_room, "remote_participants", {}) or {}
        for participant in remote_participants.values():
            attributes = getattr(participant, "attributes", {}) or {}
            called = attributes.get("sip.trunkPhoneNumber") or attributes.get("sip.calledNumber")
            caller = attributes.get("sip.phoneNumber") or attributes.get("sip.callerNumber")
            if called and caller:
                return str(called), str(caller)
        await asyncio.sleep(0.25)
    raise TimeoutError("Timed out waiting for SIP participant attributes")
