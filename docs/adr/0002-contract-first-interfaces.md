# ADR 0002: Contract-first interfaces

Status: accepted.

OpenAPI 3.1 and JSON Schema 2020-12 are authoritative. Generate TypeScript and
Python representations and verify them in CI. Provider SDK objects may not
cross adapter boundaries. This avoids independently handwritten wire contracts.

