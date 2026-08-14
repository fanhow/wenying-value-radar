import assert from "node:assert/strict";
import test from "node:test";
import { analyzeTechnicalSetup } from "../lib/technical-analysis.ts";

function candle(index, close, volume = 1_000) {
  const date = new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10);
  return { date, open: close - 0.2, high: close + 0.5, low: close - 0.5, close, volume };
}

test("summarizes moving averages, range position, and volume without changing valuation", () => {
  const candles = Array.from({ length: 90 }, (_, index) => candle(index, 40 + index * 0.1));
  candles[candles.length - 1].volume = 3_000;
  const result = analyzeTechnicalSetup(candles);
  assert.ok(result);
  assert.equal(result.dailyTrend, "bullish");
  assert.equal(result.movingAverageSignal, "bullish-alignment");
  assert.ok((result.weeklyRangePosition ?? 0) > 0.8);
  assert.ok((result.volumeRatio20 ?? 0) > 2.5);
});

test("detects a completed double-bottom only when price recovers through the neckline", () => {
  const closes = Array.from({ length: 70 }, (_, index) => 60 + index * 0.02);
  closes.splice(20, 21, 58, 55, 51, 48, 45, 48, 52, 56, 60, 62, 60, 57, 53, 49, 45.8, 48, 52, 57, 61, 63, 64);
  closes[closes.length - 1] = 66;
  const candles = closes.map((close, index) => candle(index, close));
  const result = analyzeTechnicalSetup(candles);
  assert.ok(result);
  assert.equal(result.wBottom, "confirmed");
  assert.ok((result.wBottomNeckline ?? 0) > 59);
});
