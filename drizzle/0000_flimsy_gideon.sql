CREATE TABLE `financial_snapshots` (
	`market` text NOT NULL,
	`ticker` text NOT NULL,
	`payload` text NOT NULL,
	`financial_data_date` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `market_price_snapshots` (
	`market` text NOT NULL,
	`ticker` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`price` real NOT NULL,
	`market_cap` real,
	`volume` real,
	`price_date` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `snapshot_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`price_count` integer DEFAULT 0 NOT NULL,
	`financial_count` integer DEFAULT 0 NOT NULL,
	`error` text
);
