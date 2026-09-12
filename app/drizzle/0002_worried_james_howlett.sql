CREATE TABLE `typing_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`child_id` integer NOT NULL,
	`level` text NOT NULL,
	`prompt_text` text NOT NULL,
	`typed_text` text NOT NULL,
	`wpm` real NOT NULL,
	`accuracy` real NOT NULL,
	`answered_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `practice_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`child_id`) REFERENCES `children`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `typing_attempts_child_idx` ON `typing_attempts` (`child_id`,`answered_at`);