FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
COPY src ./src

RUN pip install --no-cache-dir .

ENV KNOWLEDGE_PARSER_PORT=8090
EXPOSE 8090

HEALTHCHECK --interval=10s --timeout=5s --retries=10 CMD curl -f http://localhost:8090/health || exit 1

CMD ["montenegrina-knowledge-parser"]
