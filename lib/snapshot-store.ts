import { getRuntimeDatabase } from "./runtime-env.ts";

export type SnapshotMarket = "TW" | "US";

export type MarketPriceSnapshot = {
  market: SnapshotMarket;
  ticker: string;
  name: string;
  price: number;
  marketCap?: number;
  volume?: number;
  priceDate?: string;
  updatedAt: string;
};

export type FinancialSnapshot = {
  market: SnapshotMarket;
  ticker: string;
  payload: string;
  financialDataDate?: string;
  updatedAt: string;
};

export type SnapshotRun = {
  kind: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  priceCount: number;
  financialCount: number;
  error?: string;
};

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS market_price_snapshots (
    market TEXT NOT NULL,
    ticker TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    price REAL NOT NULL,
    market_cap REAL,
    volume REAL,
    price_date TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (market, ticker)
  )`,
  `CREATE TABLE IF NOT EXISTS financial_snapshots (
    market TEXT NOT NULL,
    ticker TEXT NOT NULL,
    payload TEXT NOT NULL,
    financial_data_date TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (market, ticker)
  )`,
  `CREATE TABLE IF NOT EXISTS snapshot_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    price_count INTEGER NOT NULL DEFAULT 0,
    financial_count INTEGER NOT NULL DEFAULT 0,
    error TEXT
  )`,
  "CREATE INDEX IF NOT EXISTS idx_snapshot_runs_started_at ON snapshot_runs(started_at DESC)",
] as const;

function databaseOrUndefined(database?: D1Database) {
  return database ?? getRuntimeDatabase();
}

export async function ensureSnapshotSchema(database?: D1Database) {
  const db = databaseOrUndefined(database);
  if (!db) return false;
  await db.batch(SCHEMA_STATEMENTS.map((statement) => db.prepare(statement)));
  return true;
}

export async function saveMarketPriceSnapshots(rows: MarketPriceSnapshot[], database?: D1Database) {
  const db = databaseOrUndefined(database);
  if (!db || rows.length === 0) return 0;
  let saved = 0;
  for (let start = 0; start < rows.length; start += 100) {
    const statements = rows.slice(start, start + 100).map((row) => db.prepare(
      `INSERT INTO market_price_snapshots
        (market, ticker, name, price, market_cap, volume, price_date, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(market, ticker) DO UPDATE SET
        name = excluded.name,
        price = excluded.price,
        market_cap = excluded.market_cap,
        volume = excluded.volume,
        price_date = excluded.price_date,
        updated_at = excluded.updated_at`,
    ).bind(
      row.market,
      row.ticker,
      row.name,
      row.price,
      row.marketCap ?? null,
      row.volume ?? null,
      row.priceDate ?? null,
      row.updatedAt,
    ));
    await db.batch(statements);
    saved += statements.length;
  }
  return saved;
}

export async function saveFinancialSnapshots(rows: FinancialSnapshot[], database?: D1Database) {
  const db = databaseOrUndefined(database);
  if (!db || rows.length === 0) return 0;
  for (let start = 0; start < rows.length; start += 100) {
    const statements = rows.slice(start, start + 100).map((row) => db.prepare(
      `INSERT INTO financial_snapshots
        (market, ticker, payload, financial_data_date, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(market, ticker) DO UPDATE SET
        payload = excluded.payload,
        financial_data_date = excluded.financial_data_date,
        updated_at = excluded.updated_at`,
    ).bind(
      row.market,
      row.ticker,
      row.payload,
      row.financialDataDate ?? null,
      row.updatedAt,
    ));
    await db.batch(statements);
  }
  return rows.length;
}

export async function saveSnapshotRun(run: SnapshotRun, database?: D1Database) {
  const db = databaseOrUndefined(database);
  if (!db) return false;
  await db.prepare(
    `INSERT INTO snapshot_runs
      (kind, status, started_at, finished_at, price_count, financial_count, error)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    run.kind,
    run.status,
    run.startedAt,
    run.finishedAt ?? null,
    run.priceCount,
    run.financialCount,
    run.error ?? null,
  ).run();
  return true;
}

export async function readMarketPriceSnapshots(database?: D1Database) {
  const db = databaseOrUndefined(database);
  if (!db) return [] as MarketPriceSnapshot[];
  try {
    const result = await db.prepare(
      `SELECT market, ticker, name, price, market_cap AS marketCap,
        volume, price_date AS priceDate, updated_at AS updatedAt
       FROM market_price_snapshots`,
    ).all<MarketPriceSnapshot>();
    return result.results ?? [];
  } catch {
    return [] as MarketPriceSnapshot[];
  }
}

export async function readFinancialSnapshots(database?: D1Database) {
  const db = databaseOrUndefined(database);
  if (!db) return [] as FinancialSnapshot[];
  try {
    const result = await db.prepare(
      `SELECT market, ticker, payload,
        financial_data_date AS financialDataDate, updated_at AS updatedAt
       FROM financial_snapshots`,
    ).all<FinancialSnapshot>();
    return result.results ?? [];
  } catch {
    return [] as FinancialSnapshot[];
  }
}

export async function readLatestSnapshotRun(database?: D1Database) {
  const db = databaseOrUndefined(database);
  if (!db) return null as SnapshotRun | null;
  try {
    const result = await db.prepare(
      `SELECT kind, status, started_at AS startedAt, finished_at AS finishedAt,
        price_count AS priceCount, financial_count AS financialCount, error
       FROM snapshot_runs ORDER BY started_at DESC LIMIT 1`,
    ).first<SnapshotRun>();
    return result ?? null;
  } catch {
    return null;
  }
}
