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

variable "livekit_url" {
  type        = string
  description = "LiveKit Cloud WebSocket URL."
}

variable "livekit_sip_outbound_trunk_id" {
  type        = string
  description = "Optional LiveKit SIP outbound trunk identifier."
  default     = ""
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
