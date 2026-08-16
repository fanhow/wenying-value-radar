import type { DailyCandle } from "./price-history";

export type TrendDirection = "ascending" | "descending" | "sideways";

export type TrendBoundary = {
  startIndex: number;
  endIndex: number;
  startValue: number;
  endValue: number;
  slope: number;
};

export type TrendStructure = {
  direction: TrendDirection;
  lookback: number;
  trendline: TrendBoundary | null;
  channel: { lower: TrendBoundary; upper: TrendBoundary } | null;
};

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function fitLine(values: number[], startIndex: number): TrendBoundary {
  const xMean = (values.length - 1) / 2;
  const yMean = mean(values);
  const denominator = values.reduce((sum, _, index) => sum + (index - xMean) ** 2, 0);
  const slope = denominator === 0
    ? 0
    : values.reduce((sum, value, index) => sum + (index - xMean) * (value - yMean), 0) / denominator;
  const intercept = yMean - slope * xMean;
  return {
    startIndex,
    endIndex: startIndex + values.length - 1,
    startValue: intercept,
    endValue: intercept + slope * (values.length - 1),
    slope,
  };
}

function validCandle(candle: DailyCandle) {
  return [candle.high, candle.low, candle.close].every((value) => Number.isFinite(value))
    && candle.high >= candle.low
    && candle.close > 0;
}

/**
 * Fits the recent high/low envelopes. A channel is shown only when both
 * envelopes travel in the same direction and remain reasonably parallel.
 * This is a visual aid; it does not alter valuation or produce a trade signal.
 */
export function detectTrendStructure(candles: DailyCandle[]): TrendStructure {
  const lookback = Math.min(80, candles.length);
  const startIndex = candles.length - lookback;
  const segment = candles.slice(startIndex);
  if (segment.length < 20 || !segment.every(validCandle)) {
    return { direction: "sideways", lookback: segment.length, trendline: null, channel: null };
  }

  const lowBoundary = fitLine(segment.map((candle) => candle.low), startIndex);
  const highBoundary = fitLine(segment.map((candle) => candle.high), startIndex);
  const averageClose = mean(segment.map((candle) => candle.close));
  const averageRange = mean(segment.map((candle) => candle.high - candle.low));
  const averageSlope = (lowBoundary.slope + highBoundary.slope) / 2;
  const slopeThreshold = Math.max(averageClose * 0.00035, averageRange * 0.08 / lookback);
  const direction: TrendDirection = Math.abs(averageSlope) < slopeThreshold
    ? "sideways"
    : averageSlope > 0 ? "ascending" : "descending";
  if (direction === "sideways") {
    return { direction, lookback, trendline: null, channel: null };
  }

  const sameDirection = direction === "ascending"
    ? lowBoundary.slope > 0 && highBoundary.slope > 0
    : lowBoundary.slope < 0 && highBoundary.slope < 0;
  const parallelTolerance = Math.max(averageClose * 0.0018, averageRange * 0.25 / lookback);
  const gapAtStart = highBoundary.startValue - lowBoundary.startValue;
  const gapAtEnd = highBoundary.endValue - lowBoundary.endValue;
  const isChannel = sameDirection
    && Math.abs(highBoundary.slope - lowBoundary.slope) <= parallelTolerance
    && gapAtStart > 0
    && gapAtEnd > 0;

  return {
    direction,
    lookback,
    trendline: direction === "ascending" ? lowBoundary : highBoundary,
    channel: isChannel ? { lower: lowBoundary, upper: highBoundary } : null,
  };
}

export function trendBoundaryValue(boundary: TrendBoundary, index: number) {
  return boundary.startValue + boundary.slope * (index - boundary.startIndex);
}
