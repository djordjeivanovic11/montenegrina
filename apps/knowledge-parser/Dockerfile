FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY apps/knowledge-parser/pyproject.toml ./
COPY apps/knowledge-parser/src ./src

# CPU-only PyTorch keeps the image small and avoids multi-GB NVIDIA CUDA wheels on local Docker.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir .

ENV KNOWLEDGE_PARSER_PORT=8090
ENV HF_HOME=/app/.cache/huggingface
EXPOSE 8090

HEALTHCHECK --interval=10s --timeout=5s --retries=10 CMD curl -f http://localhost:8090/health || exit 1

CMD ["montenegrina-knowledge-parser"]
