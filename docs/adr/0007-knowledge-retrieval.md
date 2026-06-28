# ADR 0007: PostgreSQL hybrid retrieval

Status: accepted.

Use pgvector and PostgreSQL full-text indexes with reciprocal-rank fusion,
then cross-encoder reranking via the knowledge parser service for final ordering.
PostgreSQL already supplies tenant constraints, transactions, backups, and
document metadata, so a dedicated vector service is premature.

