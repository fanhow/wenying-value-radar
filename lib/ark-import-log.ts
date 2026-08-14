import { arkResearchDate } from "./ark-date.ts";
import { getRuntimeDatabase } from "./runtime-env.ts";

export type ArkImportObservation = {
  batchId: string;
  importedAt: string;
  researchDate?: string | null;
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
  research_date TEXT,
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

const ADD_RESEARCH_DATE_COLUMN = "ALTER TABLE ark_import_observations ADD COLUMN research_date TEXT";

async function ensureArkImportSchema(database: D1Database) {
  await database.batch([
    database.prepare(CREATE_TABLE),
    ...CREATE_INDEXES.map((statement) => database.prepare(statement)),
  ]);
  // Existing D1 databases pre-date research_date. D1 has no portable
  // IF-NOT-EXISTS form for ADD COLUMN, so an already-migrated table is a
  // harmless caught error. Test doubles may not expose run().
  const migration = database.prepare(ADD_RESEARCH_DATE_COLUMN);
  if (typeof migration.run === "function") {
    try {
      await migration.run();
    } catch {
      // The column already exists, or the runtime does not allow this migration.
    }
  }
}

export function normalizeArkObservation(row: ArkImportObservation): ArkImportObservation | null {
  const ticker = row.ticker.trim().toUpperCase();
  if (!row.batchId || !row.importedAt || !/^[A-Z0-9-]{1,10}$/.test(ticker)) return null;
  if (![row.marketPrice, row.fairValue, row.valuationGap].every(Number.isFinite) || row.marketPrice <= 0 || row.fairValue <= 0) return null;
  const researchDate = /^\d{4}-\d{2}-\d{2}$/.test(row.researchDate ?? "")
    ? row.researchDate
    : arkResearchDate(row.importedAt);
  if (!researchDate) return null;
  return {
    ...row,
    researchDate,
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
      (batch_id, imported_at, research_date, file_name, market, ticker, name, captured_price, market_price, fair_value, valuation_gap, confidence)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    row.batchId, row.importedAt, row.researchDate, row.fileName, row.market, row.ticker, row.name,
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
        research_date AS researchDate,
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
