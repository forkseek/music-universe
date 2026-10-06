CREATE TABLE `platform_accounts` (
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`credentials` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `provider`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
