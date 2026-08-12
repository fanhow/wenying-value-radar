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

export type ArkImportObservationRecord = ArkImportObservation & {
  id: number;
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

const CREATE_INDEXES = [
  "CREATE INDEX IF NOT EXISTS idx_ark_import_observations_ticker_time ON ark_import_observations(ticker, imported_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_ark_import_observations_batch ON ark_import_observations(batch_id)",
];

async function ensureArkImportSchema(database: D1Database) {
  await database.batch([
    database.prepare(CREATE_TABLE),
    ...CREATE_INDEXES.map((statement) => database.prepare(statement)),
  ]);
}

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
  await ensureArkImportSchema(db);
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

export async function readArkImportObservations(limit = 120, database?: D1Database): Promise<ArkImportObservationRecord[]> {
  const db = database ?? getRuntimeDatabase();
  if (!db) return [];
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 240);
  try {
    await ensureArkImportSchema(db);
    const result = await db.prepare(`
      SELECT
        id,
        batch_id AS batchId,
        imported_at AS importedAt,
        file_name AS fileName,
        market,
        ticker,
        name,
        captured_price AS capturedPrice,
        market_price AS marketPrice,
        fair_value AS fairValue,
        valuation_gap AS valuationGap,
        confidence
      FROM ark_import_observations
      ORDER BY imported_at DESC, id DESC
      LIMIT ?
    `).bind(safeLimit).all<ArkImportObservationRecord>();
    return result.results ?? [];
  } catch {
    return [];
  }
}
