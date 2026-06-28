data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

data "aws_secretsmanager_secret" "providers" {
  name = var.provider_secret_name
}

data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

locals {
  name = "${var.project_name}-${var.environment}"
  azs  = slice(data.aws_availability_zones.available.names, 0, 2)
  common_environment = [
    { name = "NODE_ENV", value = "production" },
    { name = "API_PORT", value = "3001" },
    { name = "WEB_PORT", value = "3000" },
    { name = "PUBLIC_API_URL", value = "https://${aws_cloudfront_distribution.app.domain_name}" },
    { name = "PUBLIC_LIVEKIT_URL", value = var.livekit_url },
    { name = "INTERNAL_API_URL", value = "http://${aws_lb.app.dns_name}" },
    { name = "S3_REGION", value = var.aws_region },
    { name = "S3_BUCKET", value = aws_s3_bucket.data.id },
    { name = "COOKIE_SECURE", value = "true" },
    { name = "CORS_ORIGINS", value = "https://${aws_cloudfront_distribution.app.domain_name}" },
    { name = "LIVEKIT_URL", value = var.livekit_url },
    { name = "OPENAI_MODEL", value = "gpt-5.4-mini" },
    { name = "OPENAI_REALTIME_MODEL", value = "gpt-realtime-2" },
    { name = "OPENAI_EMBEDDING_MODEL", value = "text-embedding-3-large" },
    { name = "OPENAI_EMBEDDING_DIMENSIONS", value = "1536" },
    { name = "DEEPGRAM_MODEL", value = "nova-3" },
    { name = "ELEVENLABS_MODEL", value = "eleven_flash_v2_5" },
    { name = "LOG_LEVEL", value = "info" },
    { name = "TRANSCRIPT_RETENTION_DAYS", value = "30" },
    { name = "AUDIO_RETENTION_DAYS", value = "7" },
    { name = "AUDIT_RETENTION_DAYS", value = "365" },
    { name = "EVALUATION_RETENTION_DAYS", value = "90" },
    { name = "MAX_CONVERSATION_MINUTES", value = "30" },
    { name = "MAX_CONCURRENT_SESSIONS", value = "25" },
    { name = "LIVEKIT_SIP_OUTBOUND_TRUNK_ID", value = var.livekit_sip_outbound_trunk_id },
  ]
  platform_secrets = [
    { name = "DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.platform.arn}:DATABASE_URL::" },
    { name = "REDIS_URL", valueFrom = "${aws_secretsmanager_secret.platform.arn}:REDIS_URL::" },
    { name = "SESSION_SECRET", valueFrom = "${aws_secretsmanager_secret.platform.arn}:SESSION_SECRET::" },
    { name = "INTERNAL_TOKEN_SECRET", valueFrom = "${aws_secretsmanager_secret.platform.arn}:INTERNAL_TOKEN_SECRET::" },
  ]
  provider_secrets = [
    { name = "OPENAI_API_KEY", valueFrom = "${data.aws_secretsmanager_secret.providers.arn}:OPENAI_API_KEY::" },
    { name = "DEEPGRAM_API_KEY", valueFrom = "${data.aws_secretsmanager_secret.providers.arn}:DEEPGRAM_API_KEY::" },
    { name = "ELEVENLABS_API_KEY", valueFrom = "${data.aws_secretsmanager_secret.providers.arn}:ELEVENLABS_API_KEY::" },
    { name = "ELEVENLABS_MONTENEGRIN_VOICE_ID", valueFrom = "${data.aws_secretsmanager_secret.providers.arn}:ELEVENLABS_MONTENEGRIN_VOICE_ID::" },
    { name = "LIVEKIT_API_KEY", valueFrom = "${data.aws_secretsmanager_secret.providers.arn}:LIVEKIT_API_KEY::" },
    { name = "LIVEKIT_API_SECRET", valueFrom = "${data.aws_secretsmanager_secret.providers.arn}:LIVEKIT_API_SECRET::" },
    { name = "LOCAL_ADMIN_EMAIL", valueFrom = "${data.aws_secretsmanager_secret.providers.arn}:INITIAL_ADMIN_EMAIL::" },
    { name = "LOCAL_ADMIN_PASSWORD", valueFrom = "${data.aws_secretsmanager_secret.providers.arn}:INITIAL_ADMIN_PASSWORD::" },
  ]
}
