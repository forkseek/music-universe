ALTER TABLE `import_sessions` ADD `batch_key` text;--> statement-breakpoint
ALTER TABLE `import_sessions` ADD `scope` text DEFAULT 'library' NOT NULL;--> statement-breakpoint
ALTER TABLE `import_sessions` ADD `report` text;--> statement-breakpoint
CREATE UNIQUE INDEX `import_sessions_user_id_batch_key_unique` ON `import_sessions` (`user_id`,`batch_key`);--> statement-breakpoint
ALTER TABLE `music_edges` ADD `evidence` text DEFAULT '{"trackIds":[],"values":[]}' NOT NULL;--> statement-breakpoint
ALTER TABLE `music_nodes` ADD `metadata` text DEFAULT '{"trackIds":[],"basis":""}' NOT NULL;--> statement-breakpoint
ALTER TABLE `music_worlds` ADD `scope` text DEFAULT 'library' NOT NULL;--> statement-breakpoint
ALTER TABLE `music_worlds` ADD `library_fingerprint` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `music_worlds` ADD `total_tracks` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `music_worlds` ADD `hidden_tracks` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `music_worlds` ADD `clusters` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `tracks` ADD `scope` text DEFAULT 'library' NOT NULL;