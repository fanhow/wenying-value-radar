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
  assert.match(pageSource, /50MA 支撐區 W 底|50MA Support Zone/);
});

test("buildTechnicalSnapshot produces calibrated candidates for Trend Pullback and validates quant integrity", () => {
  const snapshot = buildTechnicalSnapshot();
  assert.ok(Array.isArray(snapshot.morningStar), "morningStar should be an array");
  assert.ok(Array.isArray(snapshot.eveningStar), "eveningStar should be an array");
  assert.ok(snapshot.trendPullback.length >= 3, "should have Trend Pullback candidates");

  // Verify Morning Star rules if candidates are populated
  for (const candidate of snapshot.morningStar) {
    assert.ok(candidate.price > 0, `${candidate.ticker} should have valid price`);
    assert.ok(candidate.fairValue > 0, `${candidate.ticker} should have valid fair value`);
    assert.ok(candidate.upside >= 0, `${candidate.ticker} Morning Star should have positive upside (FV >= price)`);
    assert.equal(candidate.category, "morning-star");
    assert.ok(candidate.actionGuideZh.length > 5, `${candidate.ticker} should have action guide`);
    assert.ok(candidate.candles.length >= 20, `${candidate.ticker} should have candle history`);
  }

  // Verify Evening Star rules if candidates are populated
  for (const candidate of snapshot.eveningStar) {
    assert.ok(candidate.price > 0, `${candidate.ticker} should have valid price`);
    assert.equal(candidate.category, "evening-star");
    assert.ok(candidate.actionGuideZh.length > 5, `${candidate.ticker} should have action guide`);
    assert.ok(candidate.candles.length >= 20, `${candidate.ticker} should have candle history`);
  }

  // Verify Trend Pullback rules: EMA15/SMA50 convergence + support zone
  for (const candidate of snapshot.trendPullback) {
    assert.ok(candidate.price > 0, `${candidate.ticker} should have valid price`);
    assert.ok(candidate.upside >= 0, `${candidate.ticker} Trend Pullback should have positive or neutral upside`);
    assert.equal(candidate.category, "trend-pullback");
    assert.ok(candidate.supportZoneLow !== null && candidate.supportZoneHigh !== null, `${candidate.ticker} should have support buy zone`);
    assert.ok(candidate.supportZoneLow <= candidate.supportZoneHigh, `${candidate.ticker} supportZoneLow <= supportZoneHigh`);
  }
});

test("1537 廣隆 and 2354 鴻準 are rejected by Morning Star, and 2385 群光 & 8299 群聯 are rejected by Trend Pullback", () => {
  const snapshot = buildTechnicalSnapshot();
  assert.ok(!snapshot.morningStar.some((c) => c.ticker === "1537"), "1537 must NOT be a Morning Star candidate (no prior downtrend / illiquid)");
  assert.ok(!snapshot.morningStar.some((c) => c.ticker === "2354"), "2354 must NOT be a Morning Star candidate (neckline retest with lower candles to the left)");
  assert.ok(!snapshot.trendPullback.some((c) => c.ticker === "2385"), "2385 must NOT be in Trend Pullback (SMA50 sloping down in death-cross breakdown)");
  assert.ok(!snapshot.trendPullback.some((c) => c.ticker === "8299"), "8299 must NOT be in Trend Pullback (15EMA < 50SMA death-cross & hasn't retested prior low)");
});

test("8299 群聯 historical Morning Star candidate (2026-07-30) is recognized at weekly support 1460", async () => {
  const { loadPublicTechnicalData } = await import("../lib/public-technical-data.ts");
  const data = await loadPublicTechnicalData("8299", "TW");
  assert.ok(data && data.candles);
  const idx30 = data.candles.findIndex((c) => c.date === "2026-07-30");
  assert.ok(idx30 > 0);
  const result = analyzeTechnicalSetup(data.candles.slice(0, idx30 + 1));
  assert.ok(result);
  // On 7/30, 8299 plunged from 2850 to 1445 right onto weekly support 1460 with a downward gap Doji
  assert.equal(result.candlestickPattern, "morning-star-candidate");
  assert.equal(result.patternStage, "candidate");
});

test("detects textbook Trend Pullback buy point (bottoming -> impulse surge -> orderly pullback -> 3rd test MA convergence)", () => {
  // Simulate textbook progression from user diagram:
  // 1. Base at 43.5~45 -> 2. Surge to 53.5 (Golden Cross + wide spread) -> 3. Orderly flat box consolidation (50.0~53.2) -> 4. 3rd test at 50.0 support with EMA15/SMA50 convergence
  const candles = [];
  let d = 1;
  // 1. Continuous downtrend and base stage (40 days down to 43.5~44.0)
  for (let i = 0; i < 30; i++) {
    const p = 53.0 - (53.0 - 43.5) * (i / 30);
    candles.push({ date: `2026-03-${String(d++).padStart(2, "0")}`, open: p + 0.3, high: p + 0.5, low: p - 0.5, close: p - 0.2, volume: 1000000 });
  }
  for (let i = 0; i < 10; i++) {
    candles.push({ date: `2026-04-${String(i + 1).padStart(2, "0")}`, open: 44.0, high: 44.5, low: 43.5, close: 44.0, volume: 800000 });
  }
  // 2. Impulse surge to 53.5 (+21.5% rise, golden cross)
  for (let i = 1; i <= 15; i++) {
    const p = 44.0 + (53.5 - 44.0) * (i / 15);
    candles.push({ date: `2026-04-${String(i + 11).padStart(2, "0")}`, open: p - 0.4, high: p + 0.6, low: p - 0.5, close: p, volume: 3000000 });
  }
  // 3. Orderly flat box consolidation (50.0 ~ 53.2) without false breakouts
  // Retest 1 to 50.5
  for (let i = 0; i < 6; i++) {
    candles.push({ date: `2026-05-${String(i + 1).padStart(2, "0")}`, open: 53.0 - i * 0.4, high: 53.2, low: 50.5, close: 51.5, volume: 1200000 });
  }
  // Bounce 1 to 53.0
  for (let i = 0; i < 5; i++) {
    candles.push({ date: `2026-05-${String(i + 7).padStart(2, "0")}`, open: 51.5 + i * 0.3, high: 53.2, low: 52.0, close: 53.0, volume: 1100000 });
  }
  // Retest 2 to 50.4
  for (let i = 0; i < 6; i++) {
    candles.push({ date: `2026-05-${String(i + 13).padStart(2, "0")}`, open: 52.8 - i * 0.4, high: 53.0, low: 50.4, close: 51.0, volume: 1000000 });
  }
  // Bounce 2 to 52.8
  for (let i = 0; i < 5; i++) {
    candles.push({ date: `2026-05-${String(i + 20).padStart(2, "0")}`, open: 51.0 + i * 0.35, high: 53.0, low: 52.2, close: 52.8, volume: 950000 });
  }
  // Retest 3 right at 50.0 with 15EMA & 50SMA convergence (The Focus Buy Zone)
  for (let i = 0; i < 5; i++) {
    candles.push({ date: `2026-05-${String(i + 26).padStart(2, "0")}`, open: 52.0 - i * 0.4, high: 52.2, low: 50.0, close: 50.4, volume: 850000 });
  }

  const result = analyzeTechnicalSetup(candles);
  assert.ok(result);
  assert.ok(result.trendPullback, "Textbook Trend Pullback setup must be detected");
  assert.equal(result.trendPullback.stage, "w-bottom-buy");
  assert.ok(result.trendPullback.peakSpreadPercent >= 3.5, "Must have recorded prior impulse spread");
  assert.ok(result.trendPullback.currentSpreadPercent >= 0, "Must be in golden cross");
  assert.ok(result.trendPullback.currentSpreadPercent <= 3.5, "Must be converged at the 3rd retest buy point");
});

test("detects Morning Star candidate at the close of the downward gap Doji candle", () => {
  const candles = [];
  for (let i = 0; i < 20; i++) {
    candles.push({ date: `2026-07-${String(i + 1).padStart(2, "0")}`, open: 120 - i, high: 121 - i, low: 119 - i, close: 120 - i, volume: 1000 });
  }
  candles.push({ date: "2026-08-18", open: 100, high: 101, low: 91, close: 92, volume: 3500 }); // Big bearish bar
  candles.push({ date: "2026-08-19", open: 89.5, high: 90.2, low: 89.0, close: 89.6, volume: 1800 }); // Downward gap Doji closing today!

  const result = analyzeTechnicalSetup(candles);
  assert.ok(result);
  assert.equal(result.candlestickPattern, "morning-star-candidate");
  assert.equal(result.patternStage, "candidate");
  assert.equal(result.patternDirection, "bullish");
});

test("detects Evening Star candidate at the close of the upward gap Doji candle", () => {
  const candles = [];
  for (let i = 0; i < 20; i++) {
    candles.push({ date: `2026-07-${String(i + 1).padStart(2, "0")}`, open: 80 + i, high: 81 + i, low: 79 + i, close: 80 + i, volume: 1000 });
  }
  candles.push({ date: "2026-08-18", open: 100, high: 109, low: 99, close: 108, volume: 3500 }); // Big bullish bar
  candles.push({ date: "2026-08-19", open: 110.5, high: 111.2, low: 110.0, close: 110.6, volume: 1800 }); // Upward gap Doji closing today!

  const result = analyzeTechnicalSetup(candles);
  assert.ok(result);
  assert.equal(result.candlestickPattern, "evening-star-candidate");
  assert.equal(result.patternStage, "candidate");
  assert.equal(result.patternDirection, "bearish");
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

test("Technical Analysis page links all listed stocks directly to Fair Value page and fetches real price history", async () => {
  const pageSource = await readFile(new URL("../app/technical/page.tsx", import.meta.url), "utf8");
  assert.match(pageSource, /\/api\/price-history\?ticker=/);
  assert.match(pageSource, /stockDetailHref\(candidate\.ticker\)/);
  assert.match(pageSource, /stockDetailHref\(selectedCandidate\.ticker\)/);
  assert.match(pageSource, /candidate-name-link/);
  assert.match(pageSource, /direct-valuation-btn/);
  assert.match(pageSource, /view-valuation-link/);
});

test("3708 上緯投控 historical Morning Star (2026-07-30~31) is accurately detected and is NOT an active candidate today", () => {
  const snapshot = buildTechnicalSnapshot();
  // 3708 should not be in the active candidate lists for today
  assert.ok(!snapshot.morningStar.some((c) => c.ticker === "3708"), "3708 must not be listed as an active Morning Star today");

  // Verify historical candle pattern recognition for 3708 on 2026-07-30 and 2026-07-31
  const historical3708Candles = [];
  for (let i = 1; i <= 20; i++) {
    historical3708Candles.push({ date: `2026-07-${String(i).padStart(2, "0")}`, open: 105.0, high: 106.0, low: 104.0, close: 105.0, volume: 300000 });
  }
  historical3708Candles.push(
    { date: "2026-07-23", open: 104.0, high: 104.5, low: 100.0, close: 101.0, volume: 355000 },
    { date: "2026-07-24", open: 101.0, high: 103.0, low: 99.9, close: 100.0, volume: 176000 },
    { date: "2026-07-27", open: 100.0, high: 100.0, low: 97.8, close: 98.4, volume: 399000 },
    { date: "2026-07-28", open: 97.1, high: 97.1, low: 91.3, close: 91.3, volume: 814000 },
    { date: "2026-07-29", open: 91.6, high: 91.8, low: 85.6, close: 88.1, volume: 1156000 }, // Day 1: Large drop
    { date: "2026-07-30", open: 86.4, high: 88.8, low: 86.4, close: 87.8, volume: 493000 },  // Day 2: Downward gap Doji/star
  );

  const dojiResult = analyzeTechnicalSetup(historical3708Candles);
  assert.ok(dojiResult);
  assert.equal(dojiResult.candlestickPattern, "morning-star-candidate", "2026-07-30 close is a Morning Star candidate");
  assert.equal(dojiResult.patternStage, "candidate");

  // Day 3: Reversal confirmation
  historical3708Candles.push({ date: "2026-07-31", open: 90.7, high: 92.2, low: 90.0, close: 91.9, volume: 363000 });
  const confirmedResult = analyzeTechnicalSetup(historical3708Candles);
  assert.ok(confirmedResult);
  assert.equal(confirmedResult.candlestickPattern, "morning-star", "2026-07-31 is a confirmed Morning Star");
  assert.equal(confirmedResult.patternStage, "confirmed");

  // Today (2026-08-21 after consolidation): pattern is none
  for (let i = 1; i <= 15; i++) {
    historical3708Candles.push({ date: `2026-08-${String(i + 3).padStart(2, "0")}`, open: 102.0, high: 104.0, low: 101.0, close: 103.5, volume: 300000 });
  }
  const todayResult = analyzeTechnicalSetup(historical3708Candles);
  assert.ok(todayResult);
  assert.equal(todayResult.candlestickPattern, "none", "3708 is in consolidation today and has no active candlestick pattern");
});

test("2317 鴻海 is NOT a Morning Star because it does not form on a Daily/Weekly/Monthly support line", () => {
  const snapshot = buildTechnicalSnapshot();
  assert.ok(!snapshot.morningStar.some((c) => c.ticker === "2317"), "2317 must not be listed in Morning Star");
});
