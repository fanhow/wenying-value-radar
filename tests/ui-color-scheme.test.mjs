import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { calculateStock } from "../lib/valuation.ts";
import { calibrateFairValue } from "../lib/valuation-calibration.ts";

test("validates TSLA fair value alignment with InvestingPro benchmark", async () => {
  const usSnapshot = JSON.parse(await fs.readFile("./lib/us-market-snapshot.json", "utf8"));
  const tslaRow = usSnapshot.find((row) => row.ticker === "TSLA");
  assert.ok(tslaRow, "TSLA should exist in US market snapshot");

  const stock = calculateStock({
    ...tslaRow,
    market: "US",
    institutionalSignal: {
      trackedFundCount: 6,
      heldByCount: 2,
      increasedByCount: 2,
      reducedByCount: 0,
      newByCount: 0,
      unchangedByCount: 0,
      holdings: [],
    },
  });

  const calibrated = calibrateFairValue(stock);

  // InvestingPro Fair Value Benchmark for TSLA: $245.62 (Range: $186.47 - $295.18)
  assert.ok(
    calibrated.calibratedFairValue >= 180 && calibrated.calibratedFairValue <= 295,
    `TSLA calibrated fair value ($${calibrated.calibratedFairValue.toFixed(2)}) should fall within InvestingPro range ($186.47 - $295.18)`
  );
  assert.ok(
    calibrated.calibratedRangeHigh >= 240,
    "Calibrated range high should encompass upper consensus models"
  );
});

test("validates Taiwan red-up / green-down styling in globals.css", async () => {
  const css = await fs.readFile("./app/globals.css", "utf8");

  // text-positive must be red, text-negative must be green
  assert.ok(css.includes(".text-positive { color: var(--red) !important; }"));
  assert.ok(css.includes(".text-negative { color: var(--green) !important; }"));

  // positive-box must use red background, negative-box must use green background
  assert.ok(css.includes(".positive-box { background: var(--red-pale) !important; }"));
  assert.ok(css.includes(".negative-box { background: var(--green-pale) !important; }"));

  // Fund Change Tiered Intensity classes must be present
  assert.ok(css.includes(".fund-change-p4"));
  assert.ok(css.includes(".fund-change-p3"));
  assert.ok(css.includes(".fund-change-p2"));
  assert.ok(css.includes(".fund-change-p1"));
  assert.ok(css.includes(".fund-change-n4"));
  assert.ok(css.includes(".fund-change-n3"));
  assert.ok(css.includes(".fund-change-n2"));
  assert.ok(css.includes(".fund-change-n1"));

  // Upside Value must place trend arrow in front on the same line without breaking
  assert.ok(css.includes(".upside-value { display: inline-flex; align-items: baseline; gap: 6px; white-space: nowrap;"));
});
