ALTER TABLE "phone_numbers" ADD COLUMN "livekit_dispatch_rule_id" text;--> statement-breakpoint
ALTER TABLE "phone_numbers" ADD COLUMN "caller_id_e164" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "caller_e164" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "called_e164" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "recording_object_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "phone_numbers_e164_enabled_uq" ON "phone_numbers" ("e164") WHERE "enabled" = true;
