from livekit import agents
from livekit.agents import AgentServer

from .agent import run_job
from .settings import settings

server = AgentServer()


@server.rtc_session(agent_name="montenegrina-voice")
async def montenegrina_agent(ctx: agents.JobContext) -> None:
    await run_job(ctx, settings)


def main() -> None:
    agents.cli.run_app(server)


if __name__ == "__main__":
    main()
