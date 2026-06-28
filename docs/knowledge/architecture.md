# Montenegrina Knowledge Architecture

## Overview

Montenegrina Knowledge is an org-scoped retrieval platform for document collections connected to AI agents. It stores originals in S3-compatible object storage, processes documents asynchronously, and serves hybrid retrieval to text and voice runtimes.

## Data model

- `knowledge_bases` — org-level collections
- `agent_knowledge_base_assignments` — which agents may use which bases
- `documents` / `document_versions` — versioned uploads with rich metadata
- `document_sections` — structure extracted by the parser service
- `document_chunks` — embeddings + FTS text for hybrid search
- `ingestion_jobs` — async pipeline progress and failures
- `access_groups` / `document_access_groups` — restricted document visibility
- `retrieval_events` — audit trail of queries and supplied chunks

## Ingestion workflow

1. Admin uploads via `POST /v1/knowledge/documents` or bulk endpoint
2. API validates file type/size, deduplicates by SHA-256 per knowledge base
3. Object stored in MinIO/S3; DB rows + `ingestion_jobs` + outbox `document.ingest`
4. Worker stages: download → parse (Python service) → structure-aware chunk → embed → index
5. Document status becomes `READY` or `FAILED` with job error details

## Retrieval workflow

1. Agent published config lists `knowledgeBaseIds`
2. `RetrievalService` filters by org, assigned bases, READY docs, current version, language, and access control
3. Hybrid SQL: pgvector cosine + PostgreSQL FTS with reciprocal rank fusion
4. Top candidates reranked via cross-encoder in `apps/knowledge-parser`
5. Deduplicated context package returned to text/voice with citations metadata
6. Event logged in `retrieval_events`

## Local setup

```bash
./run_local
```

Services:

- Postgres + pgvector (`5432`)
- Redis (`6379`)
- MinIO (`9000`)
- Knowledge parser (`8090`)
- API (`3001`), worker, web (`3000`)

Environment:

- `KNOWLEDGE_PARSER_URL=http://knowledge-parser:8090`
- `KNOWLEDGE_MAX_BULK_FILES=20`
- `KNOWLEDGE_RETRIEVAL_CACHE_TTL_SECONDS=60`

## Production deployment

- Run `knowledge-parser` as a separate scalable service (CPU; GPU optional for heavier parsers)
- Use managed S3, Redis for retrieval cache, and pgvector maintenance windows
- Size parser replicas for rerank latency budget (~350ms P95 retrieval)
- Monitor `ingestion_jobs` failures and `retrieval_events` for grounding quality
