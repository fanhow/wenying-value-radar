CREATE TABLE `valuation_query_cache` (
	`market` text NOT NULL,
	`ticker` text NOT NULL,
	`payload` text NOT NULL,
	`cached_at` text NOT NULL,
	`expires_at` text NOT NULL,
	PRIMARY KEY(`market`, `ticker`)
);
--> statement-breakpoint
CREATE TABLE `taiwan_financial_history` (
	`ticker` text NOT NULL,
	`fiscal_year` integer NOT NULL,
	`period_end` text NOT NULL,
	`eps` real,
	`revenue` real,
	`operating_cash_flow` real,
	`capital_expenditure` real,
	`assets` real,
	`liabilities` real,
	`equity` real,
	`shares` real,
	`net_income` real,
	`ebit` real,
	`cash_and_investments` real,
	`total_debt` real,
	`tax_provision` real,
	`pretax_income` real,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`ticker`, `fiscal_year`)
);
