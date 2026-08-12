import assert from "node:assert/strict";
import test from "node:test";
import { normalizeArkObservation, saveArkImportObservations } from "../lib/ark-import-log.ts";

test("normalizes a durable ARKER import observation", () => {
  const row = normalizeArkObservation({
    batchId: "batch-1", importedAt: "2026-08-12T10:00:00.000Z", fileName: "ark.png",
    market: "US", ticker: " tsla ", name: "Tesla", capturedPrice: 330,
    marketPrice: 334, fairValue: 240, valuationGap: -0.2814, confidence: "medium",
  });
  assert.equal(row?.ticker, "TSLA");
  assert.equal(row?.capturedPrice, 330);
});

test("rejects incomplete ARKER import observations", () => {
  assert.equal(normalizeArkObservation({
    batchId: "batch-1", importedAt: "2026-08-12T10:00:00.000Z", fileName: "ark.png",
    market: "US", ticker: "TSLA", name: "Tesla", marketPrice: 0,
    fairValue: 240, valuationGap: -0.28, confidence: "medium",
  }), null);
});

test("persists point-in-time ARKER observations in the durable log", async () => {
  const batches = [];
  const database = {
    prepare(sql) {
      return { sql, bind(...values) { return { sql, values }; } };
    },
    async batch(statements) {
      batches.push(statements);
      return [];
    },
  };
  const saved = await saveArkImportObservations([{
    batchId: "batch-2", importedAt: "2026-08-12T11:00:00.000Z", fileName: "ark-2.png",
    market: "TW", ticker: "1808", name: "潤隆", capturedPrice: 32.5,
    marketPrice: 32.45, fairValue: 59.15, valuationGap: 0.8228, confidence: "low",
  }], database);
  assert.equal(saved, 1);
  assert.equal(batches.length, 2);
  assert.equal(batches[1][0].values[4], "1808");
  assert.equal(batches[1][0].values[8], 59.15);
});
