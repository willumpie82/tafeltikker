CREATE TABLE `math_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`child_id` integer NOT NULL,
	`table_number` integer NOT NULL,
	`operand_a` integer NOT NULL,
	`operand_b` integer NOT NULL,
	`correct` integer NOT NULL,
	`hint_used` integer DEFAULT false NOT NULL,
	`answered_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `practice_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`child_id`) REFERENCES `children`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `math_attempts_child_idx` ON `math_attempts` (`child_id`,`answered_at`);--> statement-breakpoint
CREATE TABLE `practice_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`child_id` integer NOT NULL,
	`module` text NOT NULL,
	`started_at` text DEFAULT (current_timestamp) NOT NULL,
	`ended_at` text,
	`duration_seconds` integer,
	FOREIGN KEY (`child_id`) REFERENCES `children`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `practice_sessions_child_idx` ON `practice_sessions` (`child_id`,`started_at`);