CREATE TABLE "music_rate_limits" (
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "music_rate_limits_user_id_action_pk" PRIMARY KEY("user_id","action")
);
--> statement-breakpoint
ALTER TABLE "music_rate_limits" ADD CONSTRAINT "music_rate_limits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "music_rate_expiry_idx" ON "music_rate_limits" USING btree ("expires_at");