FROM ghcr.io/astral-sh/uv:0.8.22 AS uv
FROM python:3.13-slim-bookworm AS build
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
WORKDIR /app
COPY apps/voice-agent/pyproject.toml apps/voice-agent/uv.lock* ./
RUN uv sync --no-dev --no-editable
COPY apps/voice-agent/src ./src
RUN uv sync --no-dev

FROM python:3.13-slim-bookworm AS production
ENV PYTHONUNBUFFERED=1 PATH=/app/.venv/bin:$PATH
RUN groupadd --system agent && useradd --system --gid agent --home /app agent
WORKDIR /app
COPY --from=build --chown=agent:agent /app /app
USER agent
CMD ["montenegrina-voice-agent", "start"]
