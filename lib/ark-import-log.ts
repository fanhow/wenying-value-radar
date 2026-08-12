import { getRuntimeDatabase } from "./runtime-env.ts";

export type ArkImportObservation = {
  batchId: string;
  importedAt: string;
  fileName: string;
  market: "TW" | "US";
  ticker: string;
  name: string;
  capturedPrice?: number;
  marketPrice: number;
  fairValue: number;
  valuationGap: number;
  confidence: "low" | "medium" | "high";
};

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS ark_import_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  file_name TEXT NOT NULL DEFAULT '',
  market TEXT NOT NULL,
  ticker TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  captured_price REAL,
  market_price REAL NOT NULL,
  fair_value REAL NOT NULL,
  valuation_gap REAL NOT NULL,
  confidence TEXT NOT NULL
)`;

export function normalizeArkObservation(row: ArkImportObservation): ArkImportObservation | null {
  const ticker = row.ticker.trim().toUpperCase();
  if (!row.batchId || !row.importedAt || !/^[A-Z0-9-]{1,10}$/.test(ticker)) return null;
  if (![row.marketPrice, row.fairValue, row.valuationGap].every(Number.isFinite) || row.marketPrice <= 0 || row.fairValue <= 0) return null;
  return {
    ...row,
    ticker,
    fileName: row.fileName.slice(0, 120),
    name: row.name.slice(0, 160),
    capturedPrice: Number.isFinite(row.capturedPrice) && Number(row.capturedPrice) > 0 ? Number(row.capturedPrice) : undefined,
  };
}

export async function saveArkImportObservations(rows: ArkImportObservation[], database?: D1Database) {
  const db = database ?? getRuntimeDatabase();
  const normalized = rows.map(normalizeArkObservation).filter((row): row is ArkImportObservation => Boolean(row));
  if (!db || !normalized.length) return 0;
  await db.batch([
    db.prepare(CREATE_TABLE),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_ark_import_observations_ticker_time ON ark_import_observations(ticker, imported_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_ark_import_observations_batch ON ark_import_observations(batch_id)"),
  ]);
  await db.batch(normalized.map((row) => db.prepare(
    `INSERT INTO ark_import_observations
      (batch_id, imported_at, file_name, market, ticker, name, captured_price, market_price, fair_value, valuation_gap, confidence)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    row.batchId, row.importedAt, row.fileName, row.market, row.ticker, row.name,
    row.capturedPrice ?? null, row.marketPrice, row.fairValue, row.valuationGap, row.confidence,
  )));
  return normalized.length;
}

