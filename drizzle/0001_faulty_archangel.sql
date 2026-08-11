PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_financial_snapshots` (
	`market` text NOT NULL,
	`ticker` text NOT NULL,
	`payload` text NOT NULL,
	`financial_data_date` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`market`, `ticker`)
);
--> statement-breakpoint
INSERT INTO `__new_financial_snapshots`("market", "ticker", "payload", "financial_data_date", "updated_at") SELECT "market", "ticker", "payload", "financial_data_date", "updated_at" FROM `financial_snapshots`;--> statement-breakpoint
DROP TABLE `financial_snapshots`;--> statement-breakpoint
ALTER TABLE `__new_financial_snapshots` RENAME TO `financial_snapshots`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_market_price_snapshots` (
	`market` text NOT NULL,
	`ticker` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`price` real NOT NULL,
	`market_cap` real,
	`volume` real,
	`price_date` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`market`, `ticker`)
);
--> statement-breakpoint
INSERT INTO `__new_market_price_snapshots`("market", "ticker", "name", "price", "market_cap", "volume", "price_date", "updated_at") SELECT "market", "ticker", "name", "price", "market_cap", "volume", "price_date", "updated_at" FROM `market_price_snapshots`;--> statement-breakpoint
DROP TABLE `market_price_snapshots`;--> statement-breakpoint
ALTER TABLE `__new_market_price_snapshots` RENAME TO `market_price_snapshots`;