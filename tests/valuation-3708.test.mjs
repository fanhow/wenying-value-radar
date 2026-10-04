import assert from "node:assert/strict";
import test from "node:test";
import { calculateStock } from "../lib/valuation.ts";
import { calibrateFairValue } from "../lib/valuation-calibration.ts";
import { valuationRankingState } from "../lib/daily-valuation-state.ts";
import { marketStockFromRatio } from "../lib/market-scan.ts";
import marketScanSnapshot from "../lib/market-scan-snapshot.json" with { type: "json" };

test("3708 legacy input cannot enable EPV with zero reported FCF and a positive normalization", () => {
  const row3708 = marketScanSnapshot.taiwanUniverse.find((r) => r.ticker === "3708");
  assert.ok(row3708, "3708 should exist in taiwanUniverse");

  const stockInput = marketStockFromRatio({
    ...row3708,
    price: 103.5,
  });
  assert.ok(stockInput, "stockInput should be created for 3708");
  assert.equal(stockInput.fcfPerShare, 0);
  assert.ok(stockInput.normalizedFcfPerShare > 0, "the legacy sanitizer supplies a positive normalization");

  const val = calculateStock(stockInput);
  const cal = calibrateFairValue(val);

  // Remaining relative models retain their values; unsupported EPV is excluded.
  const modelIds = val.models.map((m) => m.id);
  assert.ok(modelIds.includes("pe"), "should have P/E model");
  assert.ok(modelIds.includes("pb"), "should have P/B model");
  assert.ok(modelIds.includes("p-sales"), "should have P/S model");
  assert.equal(modelIds.includes("epv"), false, "positive normalization cannot bypass zero reported FCF");
  assert.ok(val.excludedModels.some((model) => model.id === "epv"));
  assert.equal(val.assumptions.normalizedFcfPerShare, 0);
  assert.deepEqual([...modelIds].sort(), ["p-sales", "pb", "pe"]);
  assert.ok(Math.abs(val.fairValue - 89.685) < 1e-10, "fixed legacy input retains its three-model center");

  // Calibration is checked for a finite result, without an external-price target.
  assert.ok(Number.isFinite(cal.calibratedFairValue));
  assert.ok(Number.isFinite(cal.calibratedUpside));

  const ranking = valuationRankingState(val);
  assert.equal(ranking.rankingEligible, false, "a research estimate does not restore formal ranking eligibility");
  assert.equal(ranking.upside, null);
});
