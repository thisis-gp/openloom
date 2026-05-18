CREATE TABLE `session_memory` (
	`session_id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`title` text NOT NULL,
	`agent` text,
	`model_id` text,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`cwd` text NOT NULL,
	`slate_tasks` text,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `session_memory_date_idx` ON `session_memory` (`date`);
