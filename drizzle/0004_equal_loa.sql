CREATE TABLE `technical_alert_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`market` text NOT NULL,
	`ticker` text NOT NULL,
	`as_of` text NOT NULL,
	`alert_type` text NOT NULL,
	`pattern` text NOT NULL,
	`stage` text NOT NULL,
	`close` real NOT NULL,
	`support_level` real,
	`resistance_level` real,
	`payload` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_technical_alert_unique_event` ON `technical_alert_events` (`market`,`ticker`,`as_of`,`alert_type`);--> statement-breakpoint
CREATE INDEX `idx_technical_alert_ticker_time` ON `technical_alert_events` (`market`,`ticker`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_technical_alert_created_at` ON `technical_alert_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `technical_scan_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text NOT NULL,
	`target_count` integer DEFAULT 0 NOT NULL,
	`alert_count` integer DEFAULT 0 NOT NULL,
	`error_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_technical_scan_started_at` ON `technical_scan_runs` (`started_at`);--> statement-breakpoint
CREATE TABLE `technical_watch_subscriptions` (
	`client_id` text NOT NULL,
	`market` text NOT NULL,
	`ticker` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`client_id`, `market`, `ticker`)
);
--> statement-breakpoint
CREATE INDEX `idx_technical_watch_market_ticker` ON `technical_watch_subscriptions` (`market`,`ticker`);