CREATE TYPE "public"."platform" AS ENUM('chatgpt', 'claude', 'gemini');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "memory_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"source_platform" "platform" NOT NULL,
	"title" text NOT NULL,
	"summary_line" text NOT NULL,
	"primer_markdown" text NOT NULL,
	"ir" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "memory_artifacts" ADD CONSTRAINT "memory_artifacts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_artifacts_workspace_idx" ON "memory_artifacts" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_artifacts_created_at_idx" ON "memory_artifacts" USING btree ("created_at");