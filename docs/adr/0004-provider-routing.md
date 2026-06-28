# ADR 0004: Provider routing and fallback

Status: accepted.

Normalize provider capabilities, errors, latency, and usage. Resolve immutable
routing policy at publication, then filter by tenant data policy before calling
a provider. Retry only pre-output transient failures and share circuit state in
Redis. Provider fallback must never weaken a tenant policy.

