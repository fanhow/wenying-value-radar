import { getRuntimeDatabase } from "./runtime-env.ts";
import type { TechnicalAnalysis, TechnicalAlert } from "./technical-analysis.ts";

export type TechnicalWatchSubscription = {
  market: "TW" | "US";
  ticker: string;
  name?: string;
};

export type TechnicalAlertEvent = {
  id: number;
  market: "TW" | "US";
  ticker: string;
  name: string;
  asOf: string;
  alertType: TechnicalAlert;
  pattern: TechnicalAnalysis["candlestickPattern"];
  stage: TechnicalAnalysis["patternStage"];
  close: number;
  supportLevel: number | null;
  resistanceLevel: number | null;
  createdAt: string;
};

export type TechnicalScanRun = {
  status: "succeeded" | "partial" | "failed";
  startedAt: string;
  finishedAt: string;
  targetCount: number;
  alertCount: number;
  errorCount: number;
};

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS technical_watch_subscriptions (
    client_id TEXT NOT NULL,
    market TEXT NOT NULL,
    ticker TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    PRIMARY KEY (client_id, market, ticker)
  )`,
  "CREATE INDEX IF NOT EXISTS idx_technical_watch_market_ticker ON technical_watch_subscriptions(market, ticker)",
  `CREATE TABLE IF NOT EXISTS technical_alert_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    market TEXT NOT NULL,
    ticker TEXT NOT NULL,
    as_of TEXT NOT NULL,
    alert_type TEXT NOT NULL,
    pattern TEXT NOT NULL,
    stage TEXT NOT NULL,
    close REAL NOT NULL,
    support_level REAL,
    resistance_level REAL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (market, ticker, as_of, alert_type)
  )`,
  "CREATE INDEX IF NOT EXISTS idx_technical_alert_ticker_time ON technical_alert_events(market, ticker, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_technical_alert_created_at ON technical_alert_events(created_at DESC)",
  `CREATE TABLE IF NOT EXISTS technical_scan_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT NOT NULL,
    target_count INTEGER NOT NULL DEFAULT 0,
    alert_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0
  )`,
  "CREATE INDEX IF NOT EXISTS idx_technical_scan_started_at ON technical_scan_runs(started_at DESC)",
] as const;

function databaseOrUndefined(database?: D1Database) {
  return database ?? getRuntimeDatabase();
}

export function validTechnicalClientId(clientId: string) {
  return /^[a-zA-Z0-9-]{16,64}$/.test(clientId);
}

export function normalizeTechnicalSubscriptions(rows: TechnicalWatchSubscription[]) {
  const unique = new Map<string, TechnicalWatchSubscription>();
  for (const row of rows.slice(0, 40)) {
    const ticker = String(row.ticker ?? "").trim().toUpperCase();
    const market = row.market === "TW" ? "TW" : row.market === "US" ? "US" : null;
    if (!market || !/^[A-Z0-9.-]{1,12}$/.test(ticker)) continue;
    unique.set(`${market}:${ticker}`, { market, ticker, name: String(row.name ?? ticker).trim().slice(0, 120) });
  }
  return [...unique.values()];
}

export async function ensureTechnicalAlertSchema(database?: D1Database) {
  const db = databaseOrUndefined(database);
  if (!db) return false;
  await db.batch(SCHEMA_STATEMENTS.map((statement) => db.prepare(statement)));
  return true;
}

export async function syncTechnicalWatchlist(clientId: string, rows: TechnicalWatchSubscription[], database?: D1Database) {
  const db = databaseOrUndefined(database);
  if (!db || !validTechnicalClientId(clientId)) return 0;
  const subscriptions = normalizeTechnicalSubscriptions(rows);
  await ensureTechnicalAlertSchema(db);
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("DELETE FROM technical_watch_subscriptions WHERE client_id = ?").bind(clientId),
    ...subscriptions.map((row) => db.prepare(
      `INSERT INTO technical_watch_subscriptions (client_id, market, ticker, name, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(clientId, row.market, row.ticker, row.name ?? row.ticker, now)),
  ]);
  return subscriptions.length;
}

export async function readTechnicalScanTargets(limit = 48, database?: D1Database, clientId?: string) {
  const db = databaseOrUndefined(database);
  if (!db) return [] as TechnicalWatchSubscription[];
  await ensureTechnicalAlertSchema(db);
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 48);
  const where = clientId && validTechnicalClientId(clientId) ? "WHERE client_id = ?" : "";
  const statement = db.prepare(
    `SELECT market, ticker, MAX(name) AS name
     FROM technical_watch_subscriptions ${where}
     GROUP BY market, ticker ORDER BY market, ticker LIMIT ?`,
  );
  const result = clientId && validTechnicalClientId(clientId)
    ? await statement.bind(clientId, boundedLimit).all<TechnicalWatchSubscription>()
    : await statement.bind(boundedLimit).all<TechnicalWatchSubscription>();
  return result.results ?? [];
}

export async function saveTechnicalAlert(
  target: TechnicalWatchSubscription,
  analysis: TechnicalAnalysis,
  createdAt: string,
  database?: D1Database,
) {
  const db = databaseOrUndefined(database);
  if (!db || analysis.technicalAlert === "neutral") return false;
  await ensureTechnicalAlertSchema(db);
  const result = await db.prepare(
    `INSERT OR IGNORE INTO technical_alert_events
      (market, ticker, as_of, alert_type, pattern, stage, close, support_level, resistance_level, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    target.market,
    target.ticker,
    analysis.asOf,
    analysis.technicalAlert,
    analysis.candlestickPattern,
    analysis.patternStage,
    analysis.close,
    analysis.supportLevel,
    analysis.resistanceLevel,
    JSON.stringify(analysis),
    createdAt,
  ).run<{ meta?: { changes?: number } }>();
  return Number((result as { meta?: { changes?: number } })?.meta?.changes ?? 1) > 0;
}

export async function saveTechnicalScanRun(run: TechnicalScanRun, database?: D1Database) {
  const db = databaseOrUndefined(database);
  if (!db) return false;
  await ensureTechnicalAlertSchema(db);
  await db.prepare(
    `INSERT INTO technical_scan_runs
      (status, started_at, finished_at, target_count, alert_count, error_count)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(run.status, run.startedAt, run.finishedAt, run.targetCount, run.alertCount, run.errorCount).run();
  return true;
}

export async function readTechnicalAlerts(clientId: string, limit = 40, database?: D1Database) {
  const db = databaseOrUndefined(database);
  if (!db || !validTechnicalClientId(clientId)) return { rows: [] as TechnicalAlertEvent[], latestScan: null as TechnicalScanRun | null };
  await ensureTechnicalAlertSchema(db);
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 80);
  const rows = await db.prepare(
    `SELECT e.id, e.market, e.ticker, s.name, e.as_of AS asOf,
      e.alert_type AS alertType, e.pattern, e.stage, e.close,
      e.support_level AS supportLevel, e.resistance_level AS resistanceLevel,
      e.created_at AS createdAt
     FROM technical_alert_events e
     INNER JOIN technical_watch_subscriptions s
       ON s.market = e.market AND s.ticker = e.ticker
     WHERE s.client_id = ?
     ORDER BY e.created_at DESC, e.id DESC LIMIT ?`,
  ).bind(clientId, boundedLimit).all<TechnicalAlertEvent>();
  const latestScan = await db.prepare(
    `SELECT status, started_at AS startedAt, finished_at AS finishedAt,
      target_count AS targetCount, alert_count AS alertCount, error_count AS errorCount
     FROM technical_scan_runs ORDER BY started_at DESC LIMIT 1`,
  ).first<TechnicalScanRun>();
  return { rows: rows.results ?? [], latestScan: latestScan ?? null };
}
