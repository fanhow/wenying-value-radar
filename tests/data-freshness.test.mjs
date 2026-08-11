import test from "node:test";
import assert from "node:assert/strict";
import { shouldRefreshSavedStock } from "../lib/data-freshness.ts";

const NOW = Date.parse("2026-08-11T00:00:00Z");

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

