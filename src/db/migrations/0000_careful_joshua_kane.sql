CREATE TABLE `albums` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`release_date` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `albums_name_idx` ON `albums` (`user_id`,`normalized_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `albums_user_id_id_unique` ON `albums` (`user_id`,`id`);--> statement-breakpoint
CREATE TABLE `artists` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `artists_name_idx` ON `artists` (`user_id`,`normalized_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `artists_user_id_id_unique` ON `artists` (`user_id`,`id`);--> statement-breakpoint
CREATE TABLE `import_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`music_source_id` text NOT NULL,
	`status` text NOT NULL,
	`file_name` text,
	`file_hash` text,
	`total_records` integer DEFAULT 0 NOT NULL,
	`valid_records` integer DEFAULT 0 NOT NULL,
	`merged_records` integer DEFAULT 0 NOT NULL,
	`errors` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`music_source_id`) REFERENCES `music_sources`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_sessions_user_id_id_unique` ON `import_sessions` (`user_id`,`id`);--> statement-breakpoint
CREATE TABLE `journey_nodes` (
	`user_id` text NOT NULL,
	`journey_id` text NOT NULL,
	`track_id` text NOT NULL,
	`position` integer NOT NULL,
	`reason` text NOT NULL,
	PRIMARY KEY(`user_id`, `journey_id`, `position`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`journey_id`) REFERENCES `journeys`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`track_id`) REFERENCES `tracks`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `journey_nodes_user_id_journey_id_track_id_unique` ON `journey_nodes` (`user_id`,`journey_id`,`track_id`);--> statement-breakpoint
CREATE TABLE `journeys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`world_id` text NOT NULL,
	`title` text NOT NULL,
	`intent` text NOT NULL,
	`mode` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`world_id`) REFERENCES `music_worlds`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `journeys_user_id_id_unique` ON `journeys` (`user_id`,`id`);--> statement-breakpoint
CREATE TABLE `music_edges` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`world_id` text NOT NULL,
	`source_node_id` text NOT NULL,
	`target_node_id` text NOT NULL,
	`relation` text NOT NULL,
	`weight` real NOT NULL,
	`reason` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`world_id`,`source_node_id`) REFERENCES `music_nodes`(`user_id`,`world_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`world_id`,`target_node_id`) REFERENCES `music_nodes`(`user_id`,`world_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `music_edges_user_id_world_id_source_node_id_target_node_id_relation_unique` ON `music_edges` (`user_id`,`world_id`,`source_node_id`,`target_node_id`,`relation`);--> statement-breakpoint
CREATE TABLE `music_nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`world_id` text NOT NULL,
	`type` text NOT NULL,
	`label` text NOT NULL,
	`weight` real NOT NULL,
	`track_id` text,
	`artist_id` text,
	`album_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`world_id`) REFERENCES `music_worlds`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`track_id`) REFERENCES `tracks`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`artist_id`) REFERENCES `artists`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`album_id`) REFERENCES `albums`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `music_nodes_user_id_world_id_id_unique` ON `music_nodes` (`user_id`,`world_id`,`id`);--> statement-breakpoint
CREATE TABLE `music_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`label` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `music_sources_user_id_id_unique` ON `music_sources` (`user_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `music_sources_user_id_provider_unique` ON `music_sources` (`user_id`,`provider`);--> statement-breakpoint
CREATE TABLE `music_worlds` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `music_worlds_user_id_id_unique` ON `music_worlds` (`user_id`,`id`);--> statement-breakpoint
CREATE TABLE `playlist_tracks` (
	`user_id` text NOT NULL,
	`playlist_id` text NOT NULL,
	`track_id` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`user_id`, `playlist_id`, `track_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`playlist_id`) REFERENCES `playlists`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`track_id`) REFERENCES `tracks`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `playlists` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`music_source_id` text NOT NULL,
	`external_id` text,
	`playlist_key` text NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`music_source_id`) REFERENCES `music_sources`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `playlists_user_id_id_unique` ON `playlists` (`user_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `playlists_user_id_playlist_key_unique` ON `playlists` (`user_id`,`playlist_key`);--> statement-breakpoint
CREATE TABLE `track_artists` (
	`user_id` text NOT NULL,
	`track_id` text NOT NULL,
	`artist_id` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`user_id`, `track_id`, `artist_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`track_id`) REFERENCES `tracks`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`artist_id`) REFERENCES `artists`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `track_artists_user_id_track_id_position_unique` ON `track_artists` (`user_id`,`track_id`,`position`);--> statement-breakpoint
CREATE TABLE `track_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`track_id` text NOT NULL,
	`music_source_id` text NOT NULL,
	`import_session_id` text NOT NULL,
	`imported_via` text NOT NULL,
	`external_id` text,
	`external_url` text,
	`source_key` text NOT NULL,
	`file_name` text,
	`row_number` integer,
	`playlist_external_id` text,
	`playlist_name` text,
	`raw_metadata` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`track_id`) REFERENCES `tracks`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`music_source_id`) REFERENCES `music_sources`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`import_session_id`) REFERENCES `import_sessions`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `track_sources_external_idx` ON `track_sources` (`user_id`,`music_source_id`,`external_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `track_sources_user_id_source_key_unique` ON `track_sources` (`user_id`,`source_key`);--> statement-breakpoint
CREATE TABLE `tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`canonical_key` text NOT NULL,
	`isrc` text,
	`version_key` text NOT NULL,
	`album_id` text,
	`duration_ms` integer,
	`genre` text,
	`release_date` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`album_id`) REFERENCES `albums`(`user_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "track_duration_positive" CHECK("tracks"."duration_ms" IS NULL OR "tracks"."duration_ms" > 0)
);
--> statement-breakpoint
CREATE INDEX `tracks_canonical_idx` ON `tracks` (`user_id`,`canonical_key`);--> statement-breakpoint
CREATE INDEX `tracks_isrc_idx` ON `tracks` (`user_id`,`isrc`);--> statement-breakpoint
CREATE UNIQUE INDEX `tracks_user_id_id_unique` ON `tracks` (`user_id`,`id`);--> statement-breakpoint
CREATE TABLE `user_track_signals` (
	`user_id` text NOT NULL,
	`track_id` text NOT NULL,
	`liked` integer,
	`recently_played` integer,
	`recent_score` real,
	`playlist_count` integer DEFAULT 0 NOT NULL,
	`source_count` integer DEFAULT 0 NOT NULL,
	`preference_score` real DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `track_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`track_id`) REFERENCES `tracks`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`session_token_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_session_token_hash_unique` ON `users` (`session_token_hash`);