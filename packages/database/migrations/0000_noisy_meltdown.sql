CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."agent_version_status" AS ENUM('DRAFT', 'PUBLISHED', 'RETIRED');--> statement-breakpoint
CREATE TYPE "public"."conversation_channel" AS ENUM('TEXT', 'BROWSER', 'SIP', 'BATCH');--> statement-breakpoint
CREATE TYPE "public"."conversation_state" AS ENUM('INITIALIZING', 'LISTENING', 'TRANSCRIBING', 'THINKING', 'TOOL_PENDING', 'SPEAKING', 'INTERRUPTED', 'HANDOFF_PENDING', 'HANDED_OFF', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('UPLOADED', 'SCANNING', 'PROCESSING', 'READY', 'FAILED', 'QUARANTINED', 'DELETING');--> statement-breakpoint
CREATE TYPE "public"."environment_name" AS ENUM('development', 'staging', 'production');--> statement-breakpoint
CREATE TYPE "public"."handoff_status" AS ENUM('REQUESTED', 'ACCEPTED', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER');--> statement-breakpoint
CREATE TYPE "public"."provider_kind" AS ENUM('STT', 'LLM', 'TTS', 'REALTIME', 'EMBEDDING');--> statement-breakpoint
CREATE TYPE "public"."script_preference" AS ENUM('LATIN', 'CYRILLIC');--> statement-breakpoint
CREATE TYPE "public"."speaker" AS ENUM('USER', 'ASSISTANT', 'HUMAN', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."tool_invocation_status" AS ENUM('PROPOSED', 'AWAITING_CONFIRMATION', 'RUNNING', 'COMPLETED', 'REJECTED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."tool_risk_class" AS ENUM('READ_PUBLIC', 'READ_CUSTOMER', 'WRITE_REVERSIBLE', 'WRITE_SENSITIVE');--> statement-breakpoint
CREATE TABLE "agent_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "agent_version_status" DEFAULT 'DRAFT' NOT NULL,
	"prompt_version_id" uuid NOT NULL,
	"language_profile_id" uuid NOT NULL,
	"routing_policy_id" uuid NOT NULL,
	"config" jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"published_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"secret_hash" text NOT NULL,
	"environment" "environment_name" NOT NULL,
	"permissions" text[] NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"request_id" text NOT NULL,
	"trace_id" text NOT NULL,
	"ip_address" text,
	"before" jsonb,
	"after" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"turn_id" uuid,
	"type" text NOT NULL,
	"sequence" integer NOT NULL,
	"trace_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_turns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"state" "conversation_state" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"interrupted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"agent_version_id" uuid NOT NULL,
	"channel" "conversation_channel" NOT NULL,
	"state" "conversation_state" DEFAULT 'INITIALIZING' NOT NULL,
	"language" text DEFAULT 'cnr' NOT NULL,
	"livekit_room_name" text,
	"external_call_id" text,
	"trace_id" text NOT NULL,
	"last_sequence" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"failure_code" text,
	"retention_expires_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deletion_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"status" "job_status" DEFAULT 'QUEUED' NOT NULL,
	"object_keys" text[] DEFAULT '{}' NOT NULL,
	"counts" jsonb,
	"error_code" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployment_environments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" "environment_name" NOT NULL,
	"routing_policy_id" uuid,
	"maximum_concurrent_sessions" integer DEFAULT 25 NOT NULL,
	"maximum_conversation_minutes" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_chunks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"document_version_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"page" integer,
	"section" text,
	"content" text NOT NULL,
	"token_count" integer NOT NULL,
	"embedding" vector(1536),
	"search_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"object_key" text,
	"media_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"sha256" text NOT NULL,
	"extracted_text" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"knowledge_source_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" "document_status" DEFAULT 'UPLOADED' NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"source_url" text,
	"error_code" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_cases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"dataset_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"audio_object_key" text,
	"expected_transcript" text,
	"critical_entities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expected_intent" text,
	"response_constraints" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"language_expectations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"speaker_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"audio_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_datasets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"version" integer NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"private" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"dataset_id" uuid NOT NULL,
	"status" "job_status" DEFAULT 'QUEUED' NOT NULL,
	"variants" jsonb NOT NULL,
	"metrics" jsonb,
	"report_object_key" text,
	"environment" jsonb,
	"error_code" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "glossary_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"language_profile_id" uuid NOT NULL,
	"term" text NOT NULL,
	"preferred_form" text NOT NULL,
	"preserve_exact" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "handoffs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"status" "handoff_status" NOT NULL,
	"reason" text NOT NULL,
	"target" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"error_code" text
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"operation" text NOT NULL,
	"request_hash" text NOT NULL,
	"status_code" integer,
	"response_body" jsonb,
	"locked_until" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_records_organization_id_key_operation_pk" PRIMARY KEY("organization_id","key","operation")
);
--> statement-breakpoint
CREATE TABLE "knowledge_sources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "language_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"version" integer NOT NULL,
	"script" "script_preference" DEFAULT 'LATIN' NOT NULL,
	"prefer_ijekavian" boolean DEFAULT true NOT NULL,
	"immutable" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "membership_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"deletion_requested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid,
	"type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"version" integer NOT NULL,
	"system_instruction" text NOT NULL,
	"immutable" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pronunciation_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"language_profile_id" uuid NOT NULL,
	"grapheme" text NOT NULL,
	"phoneme" text NOT NULL,
	"alphabet" text DEFAULT 'ipa' NOT NULL,
	"provider_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_configurations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "provider_kind" NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"region" text,
	"secret_ref" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_cards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"rates" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routing_policies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"environment" "environment_name" NOT NULL,
	"domain" text NOT NULL,
	"latency_class" text DEFAULT 'interactive' NOT NULL,
	"candidate_configuration_ids" uuid[] NOT NULL,
	"allowed_providers" text[] NOT NULL,
	"allowed_regions" text[] NOT NULL,
	"allow_fallback" boolean DEFAULT true NOT NULL,
	"stt_language" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_definitions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"version" integer NOT NULL,
	"description" text NOT NULL,
	"risk_class" "tool_risk_class" NOT NULL,
	"handler" text NOT NULL,
	"input_schema" jsonb NOT NULL,
	"output_schema" jsonb,
	"connector_config" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"immutable" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_invocations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"tool_definition_id" uuid NOT NULL,
	"tool_version" integer NOT NULL,
	"status" "tool_invocation_status" NOT NULL,
	"validated_input" jsonb NOT NULL,
	"result" jsonb,
	"error_code" text,
	"authorization_policy" jsonb NOT NULL,
	"idempotency_key" text,
	"confirmation_text" text,
	"confirmed_at" timestamp with time zone,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcript_segments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"turn_id" uuid,
	"speaker" "speaker" NOT NULL,
	"original_text" text NOT NULL,
	"normalized_text" text NOT NULL,
	"redacted_text" text,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at_ms" integer NOT NULL,
	"ended_at_ms" integer,
	"final" boolean NOT NULL,
	"provider_metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_id" uuid,
	"conversation_id" uuid,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"operation" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"audio_input_seconds" real,
	"audio_output_seconds" real,
	"characters" integer,
	"estimated_cost_usd" numeric(18, 8),
	"provider_request_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_version_agent_tenant_fk" FOREIGN KEY ("organization_id","agent_id") REFERENCES "public"."agents"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_version_prompt_tenant_fk" FOREIGN KEY ("organization_id","prompt_version_id") REFERENCES "public"."prompt_versions"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_version_language_tenant_fk" FOREIGN KEY ("organization_id","language_profile_id") REFERENCES "public"."language_profiles"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_events" ADD CONSTRAINT "event_conversation_tenant_fk" FOREIGN KEY ("organization_id","conversation_id") REFERENCES "public"."conversations"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_turns" ADD CONSTRAINT "turn_conversation_tenant_fk" FOREIGN KEY ("organization_id","conversation_id") REFERENCES "public"."conversations"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversation_agent_tenant_fk" FOREIGN KEY ("organization_id","agent_id") REFERENCES "public"."agents"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversation_agent_version_tenant_fk" FOREIGN KEY ("organization_id","agent_version_id") REFERENCES "public"."agent_versions"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_environments" ADD CONSTRAINT "deployment_environments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_environments" ADD CONSTRAINT "deployment_environments_routing_policy_id_routing_policies_id_fk" FOREIGN KEY ("routing_policy_id") REFERENCES "public"."routing_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunk_version_tenant_fk" FOREIGN KEY ("organization_id","document_version_id") REFERENCES "public"."document_versions"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunk_document_tenant_fk" FOREIGN KEY ("organization_id","document_id") REFERENCES "public"."documents"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_version_document_tenant_fk" FOREIGN KEY ("organization_id","document_id") REFERENCES "public"."documents"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "document_source_tenant_fk" FOREIGN KEY ("organization_id","knowledge_source_id") REFERENCES "public"."knowledge_sources"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_cases" ADD CONSTRAINT "evaluation_case_dataset_tenant_fk" FOREIGN KEY ("organization_id","dataset_id") REFERENCES "public"."evaluation_datasets"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_datasets" ADD CONSTRAINT "evaluation_datasets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_run_dataset_tenant_fk" FOREIGN KEY ("organization_id","dataset_id") REFERENCES "public"."evaluation_datasets"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_entries" ADD CONSTRAINT "glossary_profile_tenant_fk" FOREIGN KEY ("organization_id","language_profile_id") REFERENCES "public"."language_profiles"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoffs" ADD CONSTRAINT "handoff_conversation_tenant_fk" FOREIGN KEY ("organization_id","conversation_id") REFERENCES "public"."conversations"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_source_agent_tenant_fk" FOREIGN KEY ("organization_id","agent_id") REFERENCES "public"."agents"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "language_profiles" ADD CONSTRAINT "language_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_versions" ADD CONSTRAINT "prompt_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pronunciation_entries" ADD CONSTRAINT "pronunciation_profile_tenant_fk" FOREIGN KEY ("organization_id","language_profile_id") REFERENCES "public"."language_profiles"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_configurations" ADD CONSTRAINT "provider_configurations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_policies" ADD CONSTRAINT "routing_policies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_definitions" ADD CONSTRAINT "tool_definitions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD CONSTRAINT "tool_invocation_conversation_tenant_fk" FOREIGN KEY ("organization_id","conversation_id") REFERENCES "public"."conversations"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD CONSTRAINT "tool_invocation_definition_tenant_fk" FOREIGN KEY ("organization_id","tool_definition_id") REFERENCES "public"."tool_definitions"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "segment_conversation_tenant_fk" FOREIGN KEY ("organization_id","conversation_id") REFERENCES "public"."conversations"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_versions_org_id_uq" ON "agent_versions" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_versions_number_uq" ON "agent_versions" USING btree ("agent_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_org_id_uq" ON "agents" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_slug_uq" ON "agents" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_prefix_uq" ON "api_keys" USING btree ("prefix");--> statement-breakpoint
CREATE INDEX "api_keys_org_idx" ON "api_keys" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "audit_org_time_idx" ON "audit_events" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "events_idempotency_uq" ON "conversation_events" USING btree ("conversation_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "events_sequence_uq" ON "conversation_events" USING btree ("conversation_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "turns_org_id_uq" ON "conversation_turns" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "turns_ordinal_uq" ON "conversation_turns" USING btree ("conversation_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_org_id_uq" ON "conversations" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "conversations_org_started_idx" ON "conversations" USING btree ("organization_id","started_at");--> statement-breakpoint
CREATE INDEX "deletion_jobs_status_idx" ON "deletion_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "deployment_environment_uq" ON "deployment_environments" USING btree ("organization_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "document_chunks_org_id_uq" ON "document_chunks" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_chunks_ordinal_uq" ON "document_chunks" USING btree ("document_version_id","ordinal");--> statement-breakpoint
CREATE INDEX "document_chunks_tenant_idx" ON "document_chunks" USING btree ("organization_id","document_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_org_id_uq" ON "document_versions" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_versions_number_uq" ON "document_versions" USING btree ("document_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_org_id_uq" ON "documents" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "documents_status_idx" ON "documents" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_case_external_uq" ON "evaluation_cases" USING btree ("dataset_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_datasets_org_id_uq" ON "evaluation_datasets" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_datasets_version_uq" ON "evaluation_datasets" USING btree ("organization_id","name","version");--> statement-breakpoint
CREATE INDEX "evaluation_runs_status_idx" ON "evaluation_runs" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "glossary_term_uq" ON "glossary_entries" USING btree ("language_profile_id","term");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_sources_org_id_uq" ON "knowledge_sources" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "language_profiles_org_id_uq" ON "language_profiles" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "language_profiles_version_uq" ON "language_profiles" USING btree ("organization_id","name","version");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_uq" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "outbox_events" USING btree ("processed_at","available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_versions_org_id_uq" ON "prompt_versions" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_versions_name_version_uq" ON "prompt_versions" USING btree ("organization_id","name","version");--> statement-breakpoint
CREATE UNIQUE INDEX "pronunciation_grapheme_uq" ON "pronunciation_entries" USING btree ("language_profile_id","grapheme");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_config_org_id_uq" ON "provider_configurations" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_config_name_uq" ON "provider_configurations" USING btree ("organization_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "rate_cards_version_uq" ON "rate_cards" USING btree ("provider","model","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "routing_policy_name_uq" ON "routing_policies" USING btree ("organization_id","environment","name");--> statement-breakpoint
CREATE UNIQUE INDEX "tool_definitions_org_id_uq" ON "tool_definitions" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "tool_definitions_version_uq" ON "tool_definitions" USING btree ("organization_id","name","version");--> statement-breakpoint
CREATE UNIQUE INDEX "tool_invocation_idempotency_uq" ON "tool_invocations" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "segments_conversation_idx" ON "transcript_segments" USING btree ("conversation_id","started_at_ms");--> statement-breakpoint
CREATE INDEX "usage_org_time_idx" ON "usage_records" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_uq" ON "users" USING btree (lower("email"));--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_published_version_tenant_fk" FOREIGN KEY ("organization_id","published_version_id") REFERENCES "public"."agent_versions"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_chunks_embedding_hnsw_idx" ON "document_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "document_chunks_search_gin_idx" ON "document_chunks" USING gin (to_tsvector('simple', "search_text"));
