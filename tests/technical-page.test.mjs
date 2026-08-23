import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildTechnicalSnapshot } from "../lib/technical-screener.ts";
import { analyzeTechnicalSetup, exponentialMovingAverageSeries, movingAverageSeries } from "../lib/technical-analysis.ts";

test("SiteHeader includes Technical Analysis between Fair Value and Fund Tracker", async () => {
  const headerSource = await readFile(new URL("../app/site-header.tsx", import.meta.url), "utf8");
  assert.match(headerSource, /active === "technical"/);
  assert.match(headerSource, /href="\/#overview"[\s\S]*href="\/technical"[\s\S]*href="\/funds"/);
  assert.match(headerSource, /t\("技術分析",\s*"Technical"\)/);
});

test("Technical Analysis page exports valid component and includes all 3 strategies", async () => {
  const pageSource = await readFile(new URL("../app/technical/page.tsx", import.meta.url), "utf8");
  assert.match(pageSource, /export default function TechnicalAnalysisPage/);
  assert.match(pageSource, /早晨之星/);
  assert.match(pageSource, /黃昏之星/);
  assert.match(pageSource, /順勢交易/);
  assert.match(pageSource, /EChartsCandlestickChart/);
  assert.match(pageSource, /EMA15/);
  assert.match(pageSource, /SMA50/);
  assert.match(pageSource, /SMA20/);
  assert.match(pageSource, /黃色支撐買點區|Pullback Buy Zone/);
});

test("buildTechnicalSnapshot produces calibrated candidates for Morning Star, Evening Star, and Trend Pullback", () => {
  const snapshot = buildTechnicalSnapshot();
  assert.ok(snapshot.morningStar.length >= 3, "should have Morning Star candidates");
  assert.ok(snapshot.eveningStar.length >= 3, "should have Evening Star candidates");
  assert.ok(snapshot.trendPullback.length >= 3, "should have Trend Pullback candidates");

  // Verify Morning Star rules: upside > 0 (fair value > price), gap down
  for (const candidate of snapshot.morningStar) {
    assert.ok(candidate.price > 0, `${candidate.ticker} should have valid price`);
    assert.ok(candidate.fairValue > 0, `${candidate.ticker} should have valid fair value`);
    assert.ok(candidate.upside >= 0, `${candidate.ticker} Morning Star should have positive upside (FV >= price)`);
    assert.equal(candidate.category, "morning-star");
    assert.ok(candidate.candles.length >= 20, `${candidate.ticker} should have candle history`);
  }

  // Verify Evening Star rules: overvalued / downside warning
  for (const candidate of snapshot.eveningStar) {
    assert.ok(candidate.price > 0, `${candidate.ticker} should have valid price`);
    assert.equal(candidate.category, "evening-star");
    assert.ok(candidate.candles.length >= 20, `${candidate.ticker} should have candle history`);
  }

  // Verify Trend Pullback rules: EMA15/SMA50 convergence + support zone
  for (const candidate of snapshot.trendPullback) {
    assert.ok(candidate.price > 0, `${candidate.ticker} should have valid price`);
    assert.ok(candidate.upside > 0, `${candidate.ticker} Trend Pullback should have positive upside`);
    assert.equal(candidate.category, "trend-pullback");
    assert.ok(candidate.supportZoneLow !== null && candidate.supportZoneHigh !== null, `${candidate.ticker} should have support buy zone`);
    assert.ok(candidate.supportZoneLow <= candidate.supportZoneHigh, `${candidate.ticker} supportZoneLow <= supportZoneHigh`);
  }
});

test("EMA and SMA calculations are accurate", () => {
  const mockCandles = [
    { date: "2026-08-01", open: 10, high: 12, low: 9, close: 10, volume: 100 },
    { date: "2026-08-02", open: 10, high: 12, low: 9, close: 11, volume: 100 },
    { date: "2026-08-03", open: 11, high: 13, low: 10, close: 12, volume: 100 },
    { date: "2026-08-04", open: 12, high: 14, low: 11, close: 13, volume: 100 },
    { date: "2026-08-05", open: 13, high: 15, low: 12, close: 14, volume: 100 },
  ];

  const sma3 = movingAverageSeries(mockCandles, 3);
  assert.equal(sma3[0], null);
  assert.equal(sma3[1], null);
  assert.equal(sma3[2], 11); // (10+11+12)/3
  assert.equal(sma3[3], 12); // (11+12+13)/3
  assert.equal(sma3[4], 13); // (12+13+14)/3

  const ema3 = exponentialMovingAverageSeries(mockCandles, 3);
  assert.equal(ema3[0], null);
  assert.equal(ema3[1], null);
  assert.equal(ema3[2], 11); // SMA(3) seed = 11
  // multiplier = 2/(3+1) = 0.5
  // ema3[3] = (13 - 11)*0.5 + 11 = 12
  assert.equal(ema3[3], 12);
  // ema3[4] = (14 - 12)*0.5 + 12 = 13
  assert.equal(ema3[4], 13);
});
