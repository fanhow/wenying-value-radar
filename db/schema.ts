import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
