import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const marketPriceSnapshots = sqliteTable("market_price_snapshots", {
  market: text("market").notNull(),
  ticker: text("ticker").notNull(),
  name: text("name").notNull().default(""),
  price: real("price").notNull(),
  marketCap: real("market_cap"),
  volume: real("volume"),
  priceDate: text("price_date"),
  updatedAt: text("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.market, table.ticker] })]);

export const financialSnapshots = sqliteTable("financial_snapshots", {
  market: text("market").notNull(),
  ticker: text("ticker").notNull(),
  payload: text("payload").notNull(),
  financialDataDate: text("financial_data_date"),
  updatedAt: text("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.market, table.ticker] })]);

export const snapshotRuns = sqliteTable("snapshot_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind").notNull(),
  status: text("status").notNull(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  priceCount: integer("price_count").notNull().default(0),
  financialCount: integer("financial_count").notNull().default(0),
  error: text("error"),
}, (table) => [index("idx_snapshot_runs_started_at").on(table.startedAt)]);

export const arkImportObservations = sqliteTable("ark_import_observations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  batchId: text("batch_id").notNull(),
  importedAt: text("imported_at").notNull(),
  fileName: text("file_name").notNull().default(""),
  market: text("market").notNull(),
  ticker: text("ticker").notNull(),
  name: text("name").notNull().default(""),
  capturedPrice: real("captured_price"),
  marketPrice: real("market_price").notNull(),
  fairValue: real("fair_value").notNull(),
  valuationGap: real("valuation_gap").notNull(),
  confidence: text("confidence").notNull(),
}, (table) => [
  index("idx_ark_import_observations_ticker_time").on(table.ticker, table.importedAt),
  index("idx_ark_import_observations_batch").on(table.batchId),
]);

export const valuationQueryCache = sqliteTable("valuation_query_cache", {
  market: text("market").notNull(),
  ticker: text("ticker").notNull(),
  payload: text("payload").notNull(),
  cachedAt: text("cached_at").notNull(),
  expiresAt: text("expires_at").notNull(),
}, (table) => [primaryKey({ columns: [table.market, table.ticker] })]);

export const taiwanFinancialHistory = sqliteTable("taiwan_financial_history", {
  ticker: text("ticker").notNull(),
  fiscalYear: integer("fiscal_year").notNull(),
  periodEnd: text("period_end").notNull(),
  eps: real("eps"),
  revenue: real("revenue"),
  operatingCashFlow: real("operating_cash_flow"),
  capitalExpenditure: real("capital_expenditure"),
  assets: real("assets"),
  liabilities: real("liabilities"),
  equity: real("equity"),
  shares: real("shares"),
  netIncome: real("net_income"),
  ebit: real("ebit"),
  cashAndInvestments: real("cash_and_investments"),
  totalDebt: real("total_debt"),
  taxProvision: real("tax_provision"),
  pretaxIncome: real("pretax_income"),
  updatedAt: text("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.ticker, table.fiscalYear] })]);

export const technicalWatchSubscriptions = sqliteTable("technical_watch_subscriptions", {
  clientId: text("client_id").notNull(),
  market: text("market").notNull(),
  ticker: text("ticker").notNull(),
  name: text("name").notNull().default(""),
  createdAt: text("created_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.clientId, table.market, table.ticker] }),
  index("idx_technical_watch_market_ticker").on(table.market, table.ticker),
]);

export const technicalAlertEvents = sqliteTable("technical_alert_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  market: text("market").notNull(),
  ticker: text("ticker").notNull(),
  asOf: text("as_of").notNull(),
  alertType: text("alert_type").notNull(),
  pattern: text("pattern").notNull(),
  stage: text("stage").notNull(),
  close: real("close").notNull(),
  supportLevel: real("support_level"),
  resistanceLevel: real("resistance_level"),
  payload: text("payload").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("idx_technical_alert_unique_event").on(table.market, table.ticker, table.asOf, table.alertType),
  index("idx_technical_alert_ticker_time").on(table.market, table.ticker, table.createdAt),
  index("idx_technical_alert_created_at").on(table.createdAt),
]);

export const technicalScanRuns = sqliteTable("technical_scan_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  status: text("status").notNull(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at").notNull(),
  targetCount: integer("target_count").notNull().default(0),
  alertCount: integer("alert_count").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
}, (table) => [index("idx_technical_scan_started_at").on(table.startedAt)]);
