CREATE TABLE `challenge_tables` (
	`challenge_id` integer NOT NULL,
	`table_number` integer NOT NULL,
	PRIMARY KEY(`challenge_id`, `table_number`),
	FOREIGN KEY (`challenge_id`) REFERENCES `challenges`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `challenges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`child_id` integer NOT NULL,
	`created_by` integer NOT NULL,
	`type` text NOT NULL,
	`sticker_id` text NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`target_minutes` integer,
	`counts_math` integer,
	`counts_typing` integer,
	`target_confidence` integer,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`started_at` text DEFAULT (current_timestamp) NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`child_id`) REFERENCES `children`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `parents`(`id`) ON UPDATE no action ON DELETE no action
);
