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
