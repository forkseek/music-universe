CREATE TABLE "albums" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"release_date" text,
	CONSTRAINT "albums_user_id_id_unique" UNIQUE("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "artists" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	CONSTRAINT "artists_user_id_id_unique" UNIQUE("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "import_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"music_source_id" text NOT NULL,
	"status" text NOT NULL,
	"file_name" text,
	"file_hash" text,
	"batch_key" text,
	"scope" text DEFAULT 'library' NOT NULL,
	"report" jsonb,
	"total_records" integer DEFAULT 0 NOT NULL,
	"valid_records" integer DEFAULT 0 NOT NULL,
	"merged_records" integer DEFAULT 0 NOT NULL,
	"errors" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "import_sessions_user_id_id_unique" UNIQUE("user_id","id"),
	CONSTRAINT "import_sessions_user_id_batch_key_unique" UNIQUE("user_id","batch_key")
);
--> statement-breakpoint
CREATE TABLE "journey_nodes" (
	"user_id" text NOT NULL,
	"journey_id" text NOT NULL,
	"track_id" text NOT NULL,
	"position" integer NOT NULL,
	"reason" text NOT NULL,
	CONSTRAINT "journey_nodes_user_id_journey_id_position_pk" PRIMARY KEY("user_id","journey_id","position"),
	CONSTRAINT "journey_nodes_user_id_journey_id_track_id_unique" UNIQUE("user_id","journey_id","track_id")
);
--> statement-breakpoint
CREATE TABLE "journeys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"world_id" text NOT NULL,
	"title" text NOT NULL,
	"intent" text NOT NULL,
	"mode" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "journeys_user_id_id_unique" UNIQUE("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "music_edges" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"world_id" text NOT NULL,
	"source_node_id" text NOT NULL,
	"target_node_id" text NOT NULL,
	"relation" text NOT NULL,
	"weight" real NOT NULL,
	"reason" text,
	"evidence" jsonb DEFAULT '{"trackIds":[],"values":[]}'::jsonb NOT NULL,
	CONSTRAINT "music_edges_user_id_world_id_source_node_id_target_node_id_relation_unique" UNIQUE("user_id","world_id","source_node_id","target_node_id","relation")
);
--> statement-breakpoint
CREATE TABLE "music_nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"world_id" text NOT NULL,
	"type" text NOT NULL,
	"label" text NOT NULL,
	"weight" real NOT NULL,
	"track_id" text,
	"artist_id" text,
	"album_id" text,
	"metadata" jsonb DEFAULT '{"trackIds":[],"basis":""}'::jsonb NOT NULL,
	CONSTRAINT "music_nodes_user_id_world_id_id_unique" UNIQUE("user_id","world_id","id")
);
--> statement-breakpoint
CREATE TABLE "music_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "music_sources_user_id_id_unique" UNIQUE("user_id","id"),
	CONSTRAINT "music_sources_user_id_provider_unique" UNIQUE("user_id","provider")
);
--> statement-breakpoint
CREATE TABLE "music_worlds" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"scope" text DEFAULT 'library' NOT NULL,
	"library_fingerprint" text DEFAULT '' NOT NULL,
	"total_tracks" integer DEFAULT 0 NOT NULL,
	"hidden_tracks" integer DEFAULT 0 NOT NULL,
	"clusters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "music_worlds_user_id_id_unique" UNIQUE("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "platform_accounts" (
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"credentials" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "platform_accounts_user_id_provider_pk" PRIMARY KEY("user_id","provider")
);
--> statement-breakpoint
CREATE TABLE "playlist_tracks" (
	"user_id" text NOT NULL,
	"playlist_id" text NOT NULL,
	"track_id" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "playlist_tracks_user_id_playlist_id_track_id_pk" PRIMARY KEY("user_id","playlist_id","track_id")
);
--> statement-breakpoint
CREATE TABLE "playlists" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"music_source_id" text NOT NULL,
	"external_id" text,
	"playlist_key" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "playlists_user_id_id_unique" UNIQUE("user_id","id"),
	CONSTRAINT "playlists_user_id_playlist_key_unique" UNIQUE("user_id","playlist_key")
);
--> statement-breakpoint
CREATE TABLE "qq_accounts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"nickname" text DEFAULT '' NOT NULL,
	"uin" text DEFAULT '' NOT NULL,
	"guid" text DEFAULT '' NOT NULL,
	"credentials" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "track_artists" (
	"user_id" text NOT NULL,
	"track_id" text NOT NULL,
	"artist_id" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "track_artists_user_id_track_id_artist_id_pk" PRIMARY KEY("user_id","track_id","artist_id"),
	CONSTRAINT "track_artists_user_id_track_id_position_unique" UNIQUE("user_id","track_id","position")
);
--> statement-breakpoint
CREATE TABLE "track_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"track_id" text NOT NULL,
	"music_source_id" text NOT NULL,
	"import_session_id" text NOT NULL,
	"imported_via" text NOT NULL,
	"external_id" text,
	"external_url" text,
	"source_key" text NOT NULL,
	"file_name" text,
	"row_number" integer,
	"playlist_external_id" text,
	"playlist_name" text,
	"raw_metadata" jsonb NOT NULL,
	CONSTRAINT "track_sources_user_id_source_key_unique" UNIQUE("user_id","source_key")
);
--> statement-breakpoint
CREATE TABLE "tracks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"canonical_key" text NOT NULL,
	"isrc" text,
	"version_key" text NOT NULL,
	"album_id" text,
	"duration_ms" integer,
	"genre" jsonb,
	"release_date" text,
	"created_at" timestamp with time zone NOT NULL,
	"scope" text DEFAULT 'library' NOT NULL,
	CONSTRAINT "tracks_user_id_id_unique" UNIQUE("user_id","id"),
	CONSTRAINT "track_duration_positive" CHECK ("tracks"."duration_ms" IS NULL OR "tracks"."duration_ms" > 0)
);
--> statement-breakpoint
CREATE TABLE "user_track_signals" (
	"user_id" text NOT NULL,
	"track_id" text NOT NULL,
	"liked" boolean,
	"recently_played" boolean,
	"recent_score" real,
	"playlist_count" integer DEFAULT 0 NOT NULL,
	"source_count" integer DEFAULT 0 NOT NULL,
	"preference_score" real DEFAULT 0 NOT NULL,
	CONSTRAINT "user_track_signals_user_id_track_id_pk" PRIMARY KEY("user_id","track_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"session_token_hash" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "users_session_token_hash_unique" UNIQUE("session_token_hash")
);
--> statement-breakpoint
ALTER TABLE "albums" ADD CONSTRAINT "albums_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artists" ADD CONSTRAINT "artists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_sessions" ADD CONSTRAINT "import_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_sessions" ADD CONSTRAINT "import_sessions_user_id_music_source_id_music_sources_user_id_id_fk" FOREIGN KEY ("user_id","music_source_id") REFERENCES "public"."music_sources"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_nodes" ADD CONSTRAINT "journey_nodes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_nodes" ADD CONSTRAINT "journey_nodes_user_id_journey_id_journeys_user_id_id_fk" FOREIGN KEY ("user_id","journey_id") REFERENCES "public"."journeys"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_nodes" ADD CONSTRAINT "journey_nodes_user_id_track_id_tracks_user_id_id_fk" FOREIGN KEY ("user_id","track_id") REFERENCES "public"."tracks"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journeys" ADD CONSTRAINT "journeys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journeys" ADD CONSTRAINT "journeys_user_id_world_id_music_worlds_user_id_id_fk" FOREIGN KEY ("user_id","world_id") REFERENCES "public"."music_worlds"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_edges" ADD CONSTRAINT "music_edges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_edges" ADD CONSTRAINT "music_edges_user_id_world_id_source_node_id_music_nodes_user_id_world_id_id_fk" FOREIGN KEY ("user_id","world_id","source_node_id") REFERENCES "public"."music_nodes"("user_id","world_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_edges" ADD CONSTRAINT "music_edges_user_id_world_id_target_node_id_music_nodes_user_id_world_id_id_fk" FOREIGN KEY ("user_id","world_id","target_node_id") REFERENCES "public"."music_nodes"("user_id","world_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_nodes" ADD CONSTRAINT "music_nodes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_nodes" ADD CONSTRAINT "music_nodes_user_id_world_id_music_worlds_user_id_id_fk" FOREIGN KEY ("user_id","world_id") REFERENCES "public"."music_worlds"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_nodes" ADD CONSTRAINT "music_nodes_user_id_track_id_tracks_user_id_id_fk" FOREIGN KEY ("user_id","track_id") REFERENCES "public"."tracks"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_nodes" ADD CONSTRAINT "music_nodes_user_id_artist_id_artists_user_id_id_fk" FOREIGN KEY ("user_id","artist_id") REFERENCES "public"."artists"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_nodes" ADD CONSTRAINT "music_nodes_user_id_album_id_albums_user_id_id_fk" FOREIGN KEY ("user_id","album_id") REFERENCES "public"."albums"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_sources" ADD CONSTRAINT "music_sources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_worlds" ADD CONSTRAINT "music_worlds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_accounts" ADD CONSTRAINT "platform_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_tracks" ADD CONSTRAINT "playlist_tracks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_tracks" ADD CONSTRAINT "playlist_tracks_user_id_playlist_id_playlists_user_id_id_fk" FOREIGN KEY ("user_id","playlist_id") REFERENCES "public"."playlists"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_tracks" ADD CONSTRAINT "playlist_tracks_user_id_track_id_tracks_user_id_id_fk" FOREIGN KEY ("user_id","track_id") REFERENCES "public"."tracks"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlists" ADD CONSTRAINT "playlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlists" ADD CONSTRAINT "playlists_user_id_music_source_id_music_sources_user_id_id_fk" FOREIGN KEY ("user_id","music_source_id") REFERENCES "public"."music_sources"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qq_accounts" ADD CONSTRAINT "qq_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_artists" ADD CONSTRAINT "track_artists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_artists" ADD CONSTRAINT "track_artists_user_id_track_id_tracks_user_id_id_fk" FOREIGN KEY ("user_id","track_id") REFERENCES "public"."tracks"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_artists" ADD CONSTRAINT "track_artists_user_id_artist_id_artists_user_id_id_fk" FOREIGN KEY ("user_id","artist_id") REFERENCES "public"."artists"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_sources" ADD CONSTRAINT "track_sources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_sources" ADD CONSTRAINT "track_sources_user_id_track_id_tracks_user_id_id_fk" FOREIGN KEY ("user_id","track_id") REFERENCES "public"."tracks"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_sources" ADD CONSTRAINT "track_sources_user_id_music_source_id_music_sources_user_id_id_fk" FOREIGN KEY ("user_id","music_source_id") REFERENCES "public"."music_sources"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_sources" ADD CONSTRAINT "track_sources_user_id_import_session_id_import_sessions_user_id_id_fk" FOREIGN KEY ("user_id","import_session_id") REFERENCES "public"."import_sessions"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_user_id_album_id_albums_user_id_id_fk" FOREIGN KEY ("user_id","album_id") REFERENCES "public"."albums"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_track_signals" ADD CONSTRAINT "user_track_signals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_track_signals" ADD CONSTRAINT "user_track_signals_user_id_track_id_tracks_user_id_id_fk" FOREIGN KEY ("user_id","track_id") REFERENCES "public"."tracks"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "albums_name_idx" ON "albums" USING btree ("user_id","normalized_name");--> statement-breakpoint
CREATE INDEX "artists_name_idx" ON "artists" USING btree ("user_id","normalized_name");--> statement-breakpoint
CREATE INDEX "track_sources_external_idx" ON "track_sources" USING btree ("user_id","music_source_id","external_id");--> statement-breakpoint
CREATE INDEX "tracks_canonical_idx" ON "tracks" USING btree ("user_id","canonical_key");--> statement-breakpoint
CREATE INDEX "tracks_isrc_idx" ON "tracks" USING btree ("user_id","isrc");