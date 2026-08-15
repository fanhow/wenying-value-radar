import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeTechnicalSubscriptions,
  syncTechnicalWatchlist,
  validTechnicalClientId,
} from "../lib/technical-alert-store.ts";
import { runTechnicalAlertJob, TECHNICAL_ALERT_CRON } from "../lib/technical-alert-scheduler.ts";

function fakeDatabase(targets = []) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const statement = {
        args: [],
        bind(...args) {
          statement.args = args;
          calls.push({ sql, args });
          return statement;
        },
        run: async () => ({ success: true, meta: { changes: 1 } }),
        all: async () => ({ results: sql.includes("FROM technical_watch_subscriptions") ? targets : [] }),
        first: async () => null,
      };
      return statement;
    },
    batch: async (statements) => {
      calls.push({ batch: statements.length });
      return { success: true };
    },
  };
}

test("normalizes and caps anonymous watchlist subscriptions", () => {
  const rows = normalizeTechnicalSubscriptions([
    { market: "TW", ticker: " 2915 ", name: "潤泰全" },
    { market: "TW", ticker: "2915", name: "duplicate" },
    { market: "US", ticker: "nvda", name: "NVIDIA" },
    { market: "TW", ticker: "bad ticker", name: "invalid" },
  ]);
  assert.deepEqual(rows, [
    { market: "TW", ticker: "2915", name: "duplicate" },
    { market: "US", ticker: "NVDA", name: "NVIDIA" },
  ]);
  assert.equal(validTechnicalClientId("12345678-1234-1234-1234-123456789abc"), true);
  assert.equal(validTechnicalClientId("shared"), false);
});

test("replaces one device watchlist without sharing it with another device", async () => {
  const database = fakeDatabase();
  const saved = await syncTechnicalWatchlist("12345678-1234-1234-1234-123456789abc", [
    { market: "TW", ticker: "2915", name: "潤泰全" },
    { market: "US", ticker: "NVDA", name: "NVIDIA" },
  ], database);
  assert.equal(saved, 2);
  assert.ok(database.calls.some((call) => String(call.sql ?? "").includes("DELETE FROM technical_watch_subscriptions")));
  assert.equal(database.calls.filter((call) => String(call.sql ?? "").includes("INSERT INTO technical_watch_subscriptions")).length, 2);
});

test("runs the bounded background scan and persists only actionable alerts", async () => {
  const database = fakeDatabase([
    { market: "TW", ticker: "2915", name: "潤泰全" },
    { market: "US", ticker: "NVDA", name: "NVIDIA" },
  ]);
  const result = await runTechnicalAlertJob({
    database,
    now: new Date("2026-08-16T00:00:00.000Z"),
    loadAnalysis: async (target) => target.ticker === "2915" ? {
      asOf: "2026-08-14",
      close: 59.5,
      technicalAlert: "bullish-confirmed",
      candlestickPattern: "morning-star",
      patternStage: "confirmed",
      supportLevel: 52,
      resistanceLevel: 60,
    } : null,
  });
  assert.equal(TECHNICAL_ALERT_CRON, "30 22 * * 1-5");
  assert.deepEqual(result, {
    status: "partial",
    startedAt: "2026-08-16T00:00:00.000Z",
    finishedAt: result.finishedAt,
    targetCount: 2,
    alertCount: 1,
    errorCount: 1,
  });
  assert.ok(database.calls.some((call) => String(call.sql ?? "").includes("INSERT OR IGNORE INTO technical_alert_events")));
  assert.ok(database.calls.some((call) => String(call.sql ?? "").includes("INSERT INTO technical_scan_runs")));
});
