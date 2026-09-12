ALTER TABLE `feedback` ADD `status` text DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE `feedback` ADD `response` text;