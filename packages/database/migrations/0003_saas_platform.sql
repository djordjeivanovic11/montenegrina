CREATE TYPE "public"."organization_use_case" AS ENUM('CUSTOMER_SUPPORT', 'GOVERNMENT', 'MUNICIPALITY', 'BANKING', 'TELECOM', 'TOURISM', 'HEALTHCARE', 'GENERAL');--> statement-breakpoint
CREATE TYPE "public"."onboarding_step" AS ENUM('NAME_WORKSPACE', 'CHOOSE_USE_CASE', 'CREATE_AGENT', 'CONFIGURE_AGENT', 'ADD_KNOWLEDGE', 'TEST_AGENT', 'PUBLISH_AGENT', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('ACTIVE', 'CANCELED', 'PAST_DUE', 'TRIALING');--> statement-breakpoint
CREATE TYPE "public"."channel_type" AS ENUM('BROWSER', 'SIP', 'TWILIO', 'TELNYX', 'TELECOM');--> statement-breakpoint
CREATE TYPE "public"."channel_status" AS ENUM('ACTIVE', 'INACTIVE', 'COMING_SOON');--> statement-breakpoint
CREATE TYPE "public"."plan_metric" AS ENUM('AGENTS', 'VOICE_MINUTES', 'TEXT_MESSAGES', 'LLM_TOKENS', 'STORAGE_BYTES', 'DOCUMENTS', 'RETRIEVAL_QUERIES', 'TEAM_MEMBERS');--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "use_case" "organization_use_case" DEFAULT 'GENERAL';--> statement-breakpoint
CREATE TABLE "organization_onboarding" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"current_step" "onboarding_step" DEFAULT 'NAME_WORKSPACE' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "plan_entitlements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plan_id" uuid NOT NULL,
	"metric" "plan_metric" NOT NULL,
	"limit_value" bigint NOT NULL,
	"period" text DEFAULT 'monthly' NOT NULL
);--> statement-breakpoint
CREATE TABLE "organization_subscriptions" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" "subscription_status" DEFAULT 'ACTIVE' NOT NULL,
	"external_customer_id" text,
	"current_period_start" timestamp with time zone DEFAULT now() NOT NULL,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "communication_channels" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"type" "channel_type" NOT NULL,
	"name" text NOT NULL,
	"status" "channel_status" DEFAULT 'INACTIVE' NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "phone_numbers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"channel_id" uuid,
	"e164" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"inbound_agent_id" uuid,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "provider_credentials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"label" text NOT NULL,
	"secret_ref" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"url" text NOT NULL,
	"events" text[] NOT NULL,
	"secret_hash" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_delivery_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "membership_role" DEFAULT 'DEVELOPER' NOT NULL,
	"token_hash" text NOT NULL,
	"status" "invitation_status" DEFAULT 'PENDING' NOT NULL,
	"invited_by_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "organization_onboarding" ADD CONSTRAINT "organization_onboarding_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_entitlements" ADD CONSTRAINT "plan_entitlements_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "organization_subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "organization_subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_channels" ADD CONSTRAINT "communication_channels_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_channel_id_communication_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."communication_channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plans_slug_uq" ON "plans" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_entitlements_plan_metric_uq" ON "plan_entitlements" USING btree ("plan_id","metric");--> statement-breakpoint
CREATE UNIQUE INDEX "communication_channels_org_type_uq" ON "communication_channels" USING btree ("organization_id","type");--> statement-breakpoint
CREATE INDEX "communication_channels_org_idx" ON "communication_channels" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "phone_numbers_org_e164_uq" ON "phone_numbers" USING btree ("organization_id","e164");--> statement-breakpoint
CREATE INDEX "phone_numbers_org_idx" ON "phone_numbers" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "provider_credentials_org_idx" ON "provider_credentials" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "webhook_endpoints_org_idx" ON "webhook_endpoints" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitations_org_idx" ON "invitations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitations_email_idx" ON "invitations" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
