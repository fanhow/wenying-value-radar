import test from "node:test";
import assert from "node:assert/strict";
import { classifyFinancialFreshness, financialAgeDays, shouldRefreshSavedStock } from "../lib/data-freshness.ts";

const NOW = Date.parse("2026-08-11T00:00:00Z");

test("classifies financial statement age without using analyst forecasts", () => {
  assert.equal(classifyFinancialFreshness("2026-07-01", NOW), "fresh");
  assert.equal(classifyFinancialFreshness("2026-03-01", NOW), "aging");
  assert.equal(classifyFinancialFreshness("2025-10-31", NOW), "stale");
  assert.equal(classifyFinancialFreshness(undefined, NOW), "unknown");
  assert.equal(financialAgeDays("2026-07-01", NOW), 41);
});

test("refreshes stale annual and limited public valuations", () => {
  assert.equal(shouldRefreshSavedStock({ source: "自動資料", dataBasis: "annual", dataCompleteness: "historical", financialDataDate: "2026-08-01" }, NOW), true);
  assert.equal(shouldRefreshSavedStock({ source: "自動資料", dataBasis: "ltm", dataCompleteness: "limited", financialDataDate: "2026-08-01" }, NOW), true);
});

test("keeps recent complete LTM public data", () => {
  assert.equal(shouldRefreshSavedStock({ source: "自動資料", dataBasis: "ltm", dataCompleteness: "historical", financialDataDate: "2026-07-15" }, NOW), false);
});

test("does not overwrite manual or captured screenshot inputs", () => {
  assert.equal(shouldRefreshSavedStock({ source: "手動輸入", dataBasis: "annual", dataCompleteness: "limited" }, NOW), false);
  assert.equal(shouldRefreshSavedStock({ source: "方舟截圖", dataBasis: "historical", dataCompleteness: "limited" }, NOW), false);
});
