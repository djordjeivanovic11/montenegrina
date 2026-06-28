# ADR 0006: Authentication and secrets

Status: accepted.

Use first-party Argon2id credentials and opaque Redis-backed browser sessions,
with CSRF protection. API keys are one-time secrets with a lookup prefix and
Argon2id hash. Deployed provider credentials remain in AWS Secrets Manager/KMS;
database records contain only references and non-secret policy.

