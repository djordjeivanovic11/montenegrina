CREATE TYPE "public"."document_visibility" AS ENUM('ORG', 'ROLE_RESTRICTED', 'GROUP_RESTRICTED');--> statement-breakpoint
CREATE TYPE "public"."ingestion_stage" AS ENUM('QUEUED', 'DOWNLOADING', 'PARSING', 'CHUNKING', 'EMBEDDING', 'INDEXING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."restricted_role" AS ENUM('OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER');--> statement-breakpoint
CREATE TABLE "knowledge_bases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"default_language" text DEFAULT 'cnr' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "agent_knowledge_base_assignments" (
	"organization_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"knowledge_base_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_knowledge_base_assignments_pkey" PRIMARY KEY("organization_id","agent_id","knowledge_base_id")
);--> statement-breakpoint
CREATE TABLE "access_groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "access_group_memberships" (
	"organization_id" uuid NOT NULL,
	"access_group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_group_memberships_pkey" PRIMARY KEY("organization_id","access_group_id","user_id")
);--> statement-breakpoint
CREATE TABLE "document_access_groups" (
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"access_group_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_access_groups_pkey" PRIMARY KEY("organization_id","document_id","access_group_id")
);--> statement-breakpoint
CREATE TABLE "document_sections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"document_version_id" uuid NOT NULL,
	"parent_section_id" uuid,
	"ordinal" integer NOT NULL,
	"heading" text,
	"level" integer DEFAULT 0 NOT NULL,
	"page_start" integer,
	"page_end" integer,
	"article_number" text,
	"content" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "ingestion_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"document_version_id" uuid NOT NULL,
	"status" "job_status" DEFAULT 'QUEUED' NOT NULL,
	"stage" "ingestion_stage" DEFAULT 'QUEUED' NOT NULL,
	"progress_percent" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"error_details" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"worker_id" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "retrieval_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_id" uuid,
	"conversation_id" uuid,
	"query" text NOT NULL,
	"knowledge_base_ids" uuid[] DEFAULT '{}' NOT NULL,
	"result_count" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"chunk_ids" uuid[] DEFAULT '{}' NOT NULL,
	"scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
INSERT INTO "knowledge_bases" ("id", "organization_id", "name", "slug", "description", "default_language", "enabled", "created_at", "updated_at")
SELECT
	ks."id",
	ks."organization_id",
	ks."name",
	lower(regexp_replace(regexp_replace(ks."name", '[^a-zA-Z0-9]+', '-', 'g'), '(^-|-$)', '', 'g')) || '-' || substr(ks."id"::text, 1, 8),
	'',
	'cnr',
	ks."enabled",
	ks."created_at",
	ks."updated_at"
FROM "knowledge_sources" ks;--> statement-breakpoint
INSERT INTO "agent_knowledge_base_assignments" ("organization_id", "agent_id", "knowledge_base_id", "created_at")
SELECT ks."organization_id", ks."agent_id", ks."id", ks."created_at"
FROM "knowledge_sources" ks;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "knowledge_base_id" uuid;--> statement-breakpoint
UPDATE "documents" d SET "knowledge_base_id" = d."knowledge_source_id";--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "knowledge_base_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "document_type" text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "language" text DEFAULT 'cnr' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "ministry_department" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "publication_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "effective_from" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "effective_to" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "visibility" "document_visibility" DEFAULT 'ORG' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "minimum_role" "restricted_role";--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "sha256" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
UPDATE "documents" d SET "sha256" = dv."sha256"
FROM "document_versions" dv
WHERE dv."document_id" = d."id" AND dv."version" = d."current_version";--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "page_count" integer;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "parser_version" text;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "structure_json" jsonb;--> statement-breakpoint
UPDATE "document_versions" dv SET "source_url" = d."source_url"
FROM "documents" d WHERE d."id" = dv."document_id" AND d."source_url" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD COLUMN "section_id" uuid;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD COLUMN "article_number" text;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD COLUMN "heading_path" text;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD COLUMN "vector_score" real;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD COLUMN "lexical_score" real;--> statement-breakpoint
UPDATE "agent_versions" av
SET "config" = jsonb_set(
  jsonb_set(
    av."config" - 'knowledgeSourceIds',
    '{knowledgeBaseIds}',
    COALESCE(av."config"->'knowledgeSourceIds', '[]'::jsonb),
    true
  ),
  '{knowledgeSourceIds}',
  COALESCE(av."config"->'knowledgeSourceIds', '[]'::jsonb),
  true
);--> statement-breakpoint
ALTER TABLE "documents" DROP CONSTRAINT "document_source_tenant_fk";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "knowledge_source_id";--> statement-breakpoint
DROP TABLE "knowledge_sources";--> statement-breakpoint
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_bases_org_id_uq" ON "knowledge_bases" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_bases_slug_uq" ON "knowledge_bases" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "access_groups_org_id_uq" ON "access_groups" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "access_groups_slug_uq" ON "access_groups" USING btree ("organization_id","slug");--> statement-breakpoint
ALTER TABLE "agent_knowledge_base_assignments" ADD CONSTRAINT "agent_kb_assignment_agent_tenant_fk" FOREIGN KEY ("organization_id","agent_id") REFERENCES "public"."agents"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_knowledge_base_assignments" ADD CONSTRAINT "agent_kb_assignment_kb_tenant_fk" FOREIGN KEY ("organization_id","knowledge_base_id") REFERENCES "public"."knowledge_bases"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_groups" ADD CONSTRAINT "access_groups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_group_memberships" ADD CONSTRAINT "access_group_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_group_memberships" ADD CONSTRAINT "access_group_membership_group_tenant_fk" FOREIGN KEY ("organization_id","access_group_id") REFERENCES "public"."access_groups"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_group_memberships" ADD CONSTRAINT "access_group_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "document_kb_tenant_fk" FOREIGN KEY ("organization_id","knowledge_base_id") REFERENCES "public"."knowledge_bases"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_access_groups" ADD CONSTRAINT "document_access_groups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_access_groups" ADD CONSTRAINT "document_access_group_document_tenant_fk" FOREIGN KEY ("organization_id","document_id") REFERENCES "public"."documents"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_access_groups" ADD CONSTRAINT "document_access_group_group_tenant_fk" FOREIGN KEY ("organization_id","access_group_id") REFERENCES "public"."access_groups"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_sections_org_id_uq" ON "document_sections" USING btree ("organization_id","id");--> statement-breakpoint
ALTER TABLE "document_sections" ADD CONSTRAINT "document_section_version_tenant_fk" FOREIGN KEY ("organization_id","document_version_id") REFERENCES "public"."document_versions"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_sections" ADD CONSTRAINT "document_section_document_tenant_fk" FOREIGN KEY ("organization_id","document_id") REFERENCES "public"."documents"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunk_section_tenant_fk" FOREIGN KEY ("organization_id","section_id") REFERENCES "public"."document_sections"("organization_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_job_document_tenant_fk" FOREIGN KEY ("organization_id","document_id") REFERENCES "public"."documents"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_job_version_tenant_fk" FOREIGN KEY ("organization_id","document_version_id") REFERENCES "public"."document_versions"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieval_events" ADD CONSTRAINT "retrieval_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_kb_assignment_agent_idx" ON "agent_knowledge_base_assignments" USING btree ("organization_id","agent_id");--> statement-breakpoint
CREATE INDEX "access_group_memberships_user_idx" ON "access_group_memberships" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "documents_kb_status_idx" ON "documents" USING btree ("organization_id","knowledge_base_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_kb_sha256_uq" ON "documents" USING btree ("organization_id","knowledge_base_id","sha256") WHERE "deleted_at" IS NULL AND "sha256" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "document_sections_ordinal_uq" ON "document_sections" USING btree ("document_version_id","ordinal");--> statement-breakpoint
CREATE INDEX "document_sections_version_idx" ON "document_sections" USING btree ("organization_id","document_version_id");--> statement-breakpoint
CREATE INDEX "ingestion_jobs_version_idx" ON "ingestion_jobs" USING btree ("document_version_id");--> statement-breakpoint
CREATE INDEX "ingestion_jobs_status_idx" ON "ingestion_jobs" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE INDEX "retrieval_events_org_time_idx" ON "retrieval_events" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE INDEX "retrieval_events_agent_idx" ON "retrieval_events" USING btree ("organization_id","agent_id");
