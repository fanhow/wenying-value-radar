CREATE TABLE `ark_import_observations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`batch_id` text NOT NULL,
	`imported_at` text NOT NULL,
	`file_name` text DEFAULT '' NOT NULL,
	`market` text NOT NULL,
	`ticker` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`captured_price` real,
	`market_price` real NOT NULL,
	`fair_value` real NOT NULL,
	`valuation_gap` real NOT NULL,
	`confidence` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ark_import_observations_ticker_time` ON `ark_import_observations` (`ticker`,`imported_at`);
--> statement-breakpoint
CREATE INDEX `idx_ark_import_observations_batch` ON `ark_import_observations` (`batch_id`);
