CREATE TABLE `group_admins` (
	`group_id` integer NOT NULL,
	`parent_id` integer NOT NULL,
	PRIMARY KEY(`group_id`, `parent_id`),
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_id`) REFERENCES `parents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `group_children` (
	`group_id` integer NOT NULL,
	`child_id` integer NOT NULL,
	PRIMARY KEY(`group_id`, `child_id`),
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`child_id`) REFERENCES `children`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `group_invites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`group_id` integer NOT NULL,
	`child_name` text NOT NULL,
	`token` text NOT NULL,
	`created_by` integer NOT NULL,
	`expires_at` text NOT NULL,
	`used_by` integer,
	`used_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `parents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`used_by`) REFERENCES `parents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `group_invites_token_unique` ON `group_invites` (`token`);--> statement-breakpoint
CREATE TABLE `groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`secret_hash` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `groups_slug_unique` ON `groups` (`slug`);