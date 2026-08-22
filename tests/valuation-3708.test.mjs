import assert from "node:assert/strict";
import test from "node:test";
import { calculateStock } from "../lib/valuation.ts";
import { calibrateFairValue } from "../lib/valuation-calibration.ts";
import { marketStockFromRatio } from "../lib/market-scan.ts";
import marketScanSnapshot from "../lib/market-scan-snapshot.json" with { type: "json" };

test("3708 上緯投控 is calibrated to multi-model investment consensus near $111.16", () => {
  const row3708 = marketScanSnapshot.taiwanUniverse.find((r) => r.ticker === "3708");
  assert.ok(row3708, "3708 should exist in taiwanUniverse");

  const stockInput = marketStockFromRatio({
    ...row3708,
    price: 103.5,
  });
  assert.ok(stockInput, "stockInput should be created for 3708");

  const val = calculateStock(stockInput);
  const cal = calibrateFairValue(val);

  // 4 balanced investment models should be present
  const modelIds = val.models.map((m) => m.id);
  assert.ok(modelIds.includes("pe"), "should have P/E model");
  assert.ok(modelIds.includes("pb"), "should have P/B model");
  assert.ok(modelIds.includes("p-sales"), "should have P/S model");
  assert.ok(modelIds.includes("epv"), "should have EPV model");

  // Calibrated fair value should be close to 111.16 (+7.4%)
  assert.ok(
    cal.calibratedFairValue >= 105 && cal.calibratedFairValue <= 118,
    `Calibrated fair value should be around 111.16, got ${cal.calibratedFairValue}`,
  );
  assert.ok(
    cal.calibratedUpside >= 0.03 && cal.calibratedUpside <= 0.15,
    `Calibrated upside should be around +7.4%, got ${cal.calibratedUpside}`,
  );

  // 3708 should not be ranked at #1 in undervalued ranking
  const topUndervalued = marketScanSnapshot.candidates.filter((r) => r.market === "TW").slice(0, 10);
  const isTop1 = topUndervalued[0]?.ticker === "3708";
  assert.equal(isTop1, false, "3708 should not be top 1 undervalued candidate");
});
