import { getRuntimeDatabase } from "./runtime-env.ts";
import type { Market, StockInput } from "./valuation.ts";

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS valuation_query_cache (
  market TEXT NOT NULL,
  ticker TEXT NOT NULL,
  payload TEXT NOT NULL,
  cached_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (market, ticker)
)`;

type CachedRow = {
  payload: string;
  cachedAt: string;
  expiresAt: string;
};

function databaseOrUndefined(database?: D1Database) {
  return database ?? getRuntimeDatabase();
}

export async function readValuationQueryCache(
  market: Market,
  ticker: string,
  now = new Date(),
  database?: D1Database,
) {
  const db = databaseOrUndefined(database);
  if (!db) return null;
  try {
    await db.prepare(CREATE_TABLE).run();
    const row = await db.prepare(
      `SELECT payload, cached_at AS cachedAt, expires_at AS expiresAt
       FROM valuation_query_cache WHERE market = ? AND ticker = ?`,
    ).bind(market, ticker).first<CachedRow>();
    if (!row || Date.parse(row.expiresAt) <= now.getTime()) return null;
    const stock = JSON.parse(row.payload) as StockInput;
    return stock?.ticker === ticker && stock.market === market ? stock : null;
  } catch {
    return null;
  }
}

export async function saveValuationQueryCache(
  stock: StockInput,
  now = new Date(),
  database?: D1Database,
) {
  const db = databaseOrUndefined(database);
  if (!db) return false;
  const ttlMs = stock.market === "TW" ? 2 * 60 * 60 * 1_000 : 30 * 60 * 1_000;
  const cachedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
  try {
    await db.prepare(CREATE_TABLE).run();
    await db.prepare(
      `INSERT INTO valuation_query_cache (market, ticker, payload, cached_at, expires_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(market, ticker) DO UPDATE SET
         payload = excluded.payload,
         cached_at = excluded.cached_at,
         expires_at = excluded.expires_at`,
    ).bind(stock.market, stock.ticker, JSON.stringify(stock), cachedAt, expiresAt).run();
    return true;
  } catch {
    return false;
  }
}
