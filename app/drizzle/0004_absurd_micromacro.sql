CREATE TABLE `parent_invites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token` text NOT NULL,
	`created_by` integer NOT NULL,
	`expires_at` text NOT NULL,
	`used_by` integer,
	`used_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `parents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`used_by`) REFERENCES `parents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `parent_invites_token_unique` ON `parent_invites` (`token`);--> statement-breakpoint
ALTER TABLE `parents` ADD `role` text DEFAULT 'parent' NOT NULL;