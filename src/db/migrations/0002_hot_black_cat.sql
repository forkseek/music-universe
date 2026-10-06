CREATE TABLE `qq_accounts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`nickname` text DEFAULT '' NOT NULL,
	`uin` text DEFAULT '' NOT NULL,
	`guid` text DEFAULT '' NOT NULL,
	`credentials` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
