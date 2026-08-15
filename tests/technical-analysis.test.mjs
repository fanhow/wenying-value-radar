import assert from "node:assert/strict";
import test from "node:test";
import { analyzeTechnicalSetup } from "../lib/technical-analysis.ts";

function candle(index, close, volume = 1_000) {
  const date = new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10);
  return { date, open: close - 0.2, high: close + 0.5, low: close - 0.5, close, volume };
}

function ohlcCandle(index, open, high, low, close, volume = 1_000) {
  const date = new Date(Date.UTC(2024, 0, index + 1)).toISOString().slice(0, 10);
  return { date, open, high, low, close, volume };
}

function repeatedLevelHistory(kind) {
  return Array.from({ length: 117 }, (_, index) => {
    const close = 100 + Math.sin(index / 5) * 3;
    const recurringPivot = index > 10 && index % 24 === 12;
    const low = kind === "support" && recurringPivot ? 89 : close - 0.8;
    const high = kind === "resistance" && recurringPivot ? 111 : close + 0.8;
    return ohlcCandle(index, close - 0.3, high, low, close);
  });
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

test("pre-alerts a possible morning star after large bearish candles reach major support", () => {
  const candles = repeatedLevelHistory("support");
  candles.push(
    ohlcCandle(117, 103, 103.5, 96.5, 97),
    ohlcCandle(118, 97, 97.4, 90.5, 91),
    ohlcCandle(119, 91, 92, 89.5, 91.05),
  );
  const result = analyzeTechnicalSetup(candles);
  assert.ok(result);
  assert.equal(result.candlestickPattern, "morning-star-candidate");
  assert.equal(result.consecutiveLargeBearish, 2);
  assert.equal(result.patternAtSupport, true);
  assert.equal(result.technicalAlert, "bullish-candidate");
});

test("confirms a morning star only after the third candle recovers the first body midpoint", () => {
  const candles = repeatedLevelHistory("support");
  candles.push(
    ohlcCandle(117, 103, 103.5, 90.5, 91),
    ohlcCandle(118, 91, 92, 89.5, 91.05),
    ohlcCandle(119, 91.2, 99, 90.8, 98, 2_000),
  );
  const result = analyzeTechnicalSetup(candles);
  assert.ok(result);
  assert.equal(result.candlestickPattern, "morning-star");
  assert.equal(result.patternStage, "confirmed");
  assert.equal(result.technicalAlert, "bullish-confirmed");
});

test("flags an evening star formed at repeated weekly or monthly resistance", () => {
  const candles = repeatedLevelHistory("resistance");
  [96, 98, 100, 102, 104].forEach((close, offset) => {
    const index = candles.length - 5 + offset;
    candles[index] = ohlcCandle(index, close - 0.3, close + 0.8, close - 0.8, close);
  });
  candles.push(
    ohlcCandle(117, 103, 110, 102.5, 109),
    ohlcCandle(118, 109, 111.5, 108.5, 109.05),
    ohlcCandle(119, 109, 109.5, 101, 102, 2_000),
  );
  const result = analyzeTechnicalSetup(candles);
  assert.ok(result);
  assert.equal(result.candlestickPattern, "evening-star");
  assert.equal(result.patternAtResistance, true);
  assert.equal(result.technicalAlert, "bearish-confirmed");
});

test("recognizes bullish and bearish engulfing patterns only after the matching prior trend", () => {
  const falling = Array.from({ length: 28 }, (_, index) => ohlcCandle(index, 110 - index * 0.5 + 0.2, 111 - index * 0.5, 109 - index * 0.5, 110 - index * 0.5));
  falling.push(ohlcCandle(28, 97, 97.5, 94.5, 95), ohlcCandle(29, 94.5, 98, 94, 97.5));
  const bullish = analyzeTechnicalSetup(falling);
  assert.equal(bullish?.candlestickPattern, "bullish-engulfing");

  const rising = Array.from({ length: 28 }, (_, index) => ohlcCandle(index, 90 + index * 0.5 - 0.2, 91 + index * 0.5, 89 + index * 0.5, 90 + index * 0.5));
  rising.push(ohlcCandle(28, 103, 106, 102.5, 105), ohlcCandle(29, 105.5, 106, 101.5, 102));
  const bearish = analyzeTechnicalSetup(rising);
  assert.equal(bearish?.candlestickPattern, "bearish-engulfing");
});

test("treats hammer and shooting-star candles as candidates that still need confirmation", () => {
  const falling = Array.from({ length: 29 }, (_, index) => ohlcCandle(index, 105 - index * 0.5 + 0.2, 106 - index * 0.5, 104 - index * 0.5, 105 - index * 0.5));
  falling.push(ohlcCandle(29, 90, 90.5, 85, 89.5));
  const hammer = analyzeTechnicalSetup(falling);
  assert.equal(hammer?.candlestickPattern, "hammer");
  assert.equal(hammer?.patternStage, "candidate");

  const rising = Array.from({ length: 29 }, (_, index) => ohlcCandle(index, 90 + index * 0.5 - 0.2, 91 + index * 0.5, 89 + index * 0.5, 90 + index * 0.5));
  rising.push(ohlcCandle(29, 104.5, 110, 104, 105));
  const shootingStar = analyzeTechnicalSetup(rising);
  assert.equal(shootingStar?.candlestickPattern, "shooting-star");
  assert.equal(shootingStar?.patternStage, "candidate");
});

test("invalidates a previously tested support after a high-volume closing breakdown", () => {
  const candles = repeatedLevelHistory("support");
  candles.push(
    ohlcCandle(117, 94, 95, 91, 92),
    ohlcCandle(118, 92, 93, 89, 90),
    ohlcCandle(119, 89, 89.5, 85.5, 86, 3_000),
  );
  const result = analyzeTechnicalSetup(candles);
  assert.ok(result);
  assert.equal(result.supportBroken, true);
  assert.equal(result.technicalAlert, "support-broken");
});

test("keeps primary resistance above price and promotes a former support zone confirmed by recent daily highs", () => {
  const candles = Array.from({ length: 140 }, (_, index) => {
    const close = index < 80 ? 35.2 + Math.sin(index / 5) * 0.7 : 31.2 + Math.sin(index / 4) * 0.45;
    return ohlcCandle(index, close - 0.15, close + 0.45, close - 0.45, close);
  });

  [28, 46, 64].forEach((index) => {
    candles[index] = ohlcCandle(index, 34.2, 35, 33.55, 34.4);
  });
  [96, 112, 128].forEach((index) => {
    candles[index] = ohlcCandle(index, 32.4, 33.65, 32.2, 32.8);
  });
  candles[139] = ohlcCandle(139, 32.2, 33.9, 32.05, 32.35, 9_500);

  const result = analyzeTechnicalSetup(candles);
  assert.ok(result);
  assert.ok((result.resistanceLevel ?? 0) > result.close);
  assert.ok((result.resistanceLevel ?? 0) >= 33.2 && (result.resistanceLevel ?? 0) <= 34);
});

test("does not fabricate a daily resistance from only a few breakout candles", () => {
  const candles = Array.from({ length: 140 }, (_, index) => {
    const close = 30 + Math.sin(index / 6) * 0.45;
    return ohlcCandle(index, close - 0.1, close + 0.35, close - 0.35, close);
  });
  [32, 34, 36, 39, 38.15].forEach((close, offset) => {
    const index = candles.length - 5 + offset;
    candles[index] = ohlcCandle(index, close - 0.4, close + 0.8, close - 0.8, close, 5_000 + offset * 1_000);
  });

  const result = analyzeTechnicalSetup(candles);
  assert.ok(result);
  assert.equal(result.resistanceLevel, null);
  assert.notEqual(result.supportTimeframe, "daily");
});

test("does not present a compressed congestion band as a separate support and resistance pair", () => {
  const candles = Array.from({ length: 180 }, (_, index) => {
    const close = 38 + Math.sin(index / 5) * 0.35;
    const recurring = index > 15 && index % 25 === 12;
    return ohlcCandle(index, close - 0.15, recurring ? 38.8 : close + 0.4, recurring ? 37.5 : close - 0.4, close);
  });
  candles[179] = ohlcCandle(179, 38.5, 40.8, 37.8, 38.15, 8_000);

  const result = analyzeTechnicalSetup(candles);
  assert.ok(result);
  assert.equal(result.supportLevel !== null && result.resistanceLevel !== null, false);
});
