# ADR 0008: AWS staging without Kubernetes

Status: accepted.

Use ECS/Fargate with RDS, ElastiCache, S3, Secrets Manager/KMS, ALB, and
OpenTelemetry. Services need independent scaling but not Kubernetes control-
plane complexity. Terraform provisions a deployable staging environment.

