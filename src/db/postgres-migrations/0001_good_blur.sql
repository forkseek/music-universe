CREATE TABLE "music_runtime_state" (
	"user_id" text NOT NULL,
	"namespace" text NOT NULL,
	"key" text NOT NULL,
	"payload" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "music_runtime_state_user_id_namespace_key_pk" PRIMARY KEY("user_id","namespace","key")
);
--> statement-breakpoint
ALTER TABLE "music_runtime_state" ADD CONSTRAINT "music_runtime_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "music_runtime_expiry_idx" ON "music_runtime_state" USING btree ("expires_at");