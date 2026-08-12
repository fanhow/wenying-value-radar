import assert from "node:assert/strict";
import test from "node:test";
import { normalizeArkObservation } from "../lib/ark-import-log.ts";

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

