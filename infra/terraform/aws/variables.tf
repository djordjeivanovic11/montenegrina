variable "aws_region" {
  type        = string
  description = "AWS region for the platform."
  default     = "eu-central-1"
}

variable "project_name" {
  type        = string
  description = "Resource name prefix."
  default     = "montenegrina"
}

variable "environment" {
  type        = string
  description = "Deployment environment."
  default     = "production"
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production"
  }
}

variable "image_tag" {
  type        = string
  description = "Immutable image tag deployed to ECS."
}

variable "provider_secret_name" {
  type        = string
  description = "Existing Secrets Manager secret populated by ./deploy."
}

variable "public_web_url" {
  type        = string
  description = "Public HTTPS URL for the web app."
  validation {
    condition     = startswith(var.public_web_url, "https://")
    error_message = "public_web_url must be an https:// URL in production."
  }
}

variable "public_api_url" {
  type        = string
  description = "Public HTTPS URL for the API."
  validation {
    condition     = startswith(var.public_api_url, "https://")
    error_message = "public_api_url must be an https:// URL in production."
  }
}

variable "livekit_url" {
  type        = string
  description = "LiveKit Cloud WebSocket URL."
  validation {
    condition     = startswith(var.livekit_url, "wss://")
    error_message = "livekit_url must be a secure wss:// URL in production."
  }
}

variable "openai_stt_model" {
  type        = string
  description = "OpenAI speech-to-text model used by the voice runtime."
  default     = "gpt-4o-transcribe"
}

variable "openai_tts_model" {
  type        = string
  description = "OpenAI text-to-speech fallback model used by the voice runtime."
  default     = "gpt-4o-mini-tts"
}

variable "openai_tts_voice" {
  type        = string
  description = "OpenAI text-to-speech fallback voice."
  default     = "ash"
}

variable "voice_stt_provider" {
  type        = string
  description = "Speech-to-text provider: openai by default, deepgram only by explicit opt-in."
  default     = "openai"
  validation {
    condition     = contains(["openai", "deepgram"], var.voice_stt_provider)
    error_message = "voice_stt_provider must be openai or deepgram."
  }
}

variable "voice_tts_provider" {
  type        = string
  description = "Text-to-speech provider: elevenlabs by default, openai as deterministic fallback."
  default     = "elevenlabs"
  validation {
    condition     = contains(["elevenlabs", "openai"], var.voice_tts_provider)
    error_message = "voice_tts_provider must be elevenlabs or openai."
  }
}

variable "livekit_sip_outbound_trunk_id" {
  type        = string
  description = "Optional LiveKit SIP outbound trunk identifier."
  default     = ""
}

variable "livekit_sip_inbound_trunk_id" {
  type        = string
  description = "Optional LiveKit SIP inbound trunk identifier."
  default     = ""
}

variable "phone_integrations_enabled" {
  type        = bool
  description = "Enable phone number management UI and SIP channel activation."
  default     = false
}

variable "voice_agent_service_secret" {
  type        = string
  description = "Shared secret for voice agent inbound provisioning."
  default     = ""
  sensitive   = true
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "redis_node_type" {
  type    = string
  default = "cache.t4g.micro"
}

variable "single_nat_gateway" {
  type        = bool
  description = "Use one NAT gateway to minimize MVP cost. Disable for multi-AZ egress resilience."
  default     = true
}

variable "deletion_protection" {
  type        = bool
  description = "Protect stateful production resources from accidental deletion."
  default     = true
}
