import type { DailyCandle } from "./price-history";

export type TrendDirection = "ascending" | "descending" | "sideways";
export type TrendTimeframe = "daily" | "weekly" | "monthly";

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

type Pivot = { index: number; value: number };
type TrendCandidate = Omit<TrendStructure, "lookback"> & { score: number };

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function boundary(startIndex: number, endIndex: number, startValue: number, slope: number): TrendBoundary {
  return {
    startIndex,
    endIndex,
    startValue,
    endValue: startValue + slope * (endIndex - startIndex),
    slope,
  };
}

function validCandle(candle: DailyCandle) {
  return [candle.high, candle.low, candle.close].every((value) => Number.isFinite(value))
    && candle.high >= candle.low
    && candle.close > 0;
}

function pivots(candles: DailyCandle[], startIndex: number, kind: "low" | "high") {
  const result: Pivot[] = [];
  const radius = 2;
  for (let index = Math.max(radius, startIndex); index < candles.length - radius; index += 1) {
    const value = kind === "low" ? candles[index].low : candles[index].high;
    const neighbors = candles.slice(index - radius, index + radius + 1)
      .filter((_, offset) => offset !== radius)
      .map((candle) => kind === "low" ? candle.low : candle.high);
    if (kind === "low" ? neighbors.every((neighbor) => value <= neighbor) : neighbors.every((neighbor) => value >= neighbor)) {
      result.push({ index, value });
    }
  }
  return result;
}

function candidateSettings(timeframe: TrendTimeframe) {
  if (timeframe === "monthly") return { maxLookback: 30, minSpan: 8, minSeparation: 3, recentAnchor: 12, minSlopeRate: 0.002 };
  if (timeframe === "weekly") return { maxLookback: 42, minSpan: 10, minSeparation: 4, recentAnchor: 18, minSlopeRate: 0.0012 };
  return { maxLookback: 56, minSpan: 20, minSeparation: 6, recentAnchor: 26, minSlopeRate: 0.0008 };
}

function averageTop(values: number[], count = 3) {
  return mean([...values].sort((left, right) => right - left).slice(0, Math.min(count, values.length)));
}

function buildCandidate(
  candles: DailyCandle[],
  direction: Exclude<TrendDirection, "sideways">,
  first: Pivot,
  second: Pivot,
  oppositePivots: Pivot[],
  settings: ReturnType<typeof candidateSettings>,
): TrendCandidate | null {
  const span = candles.length - 1 - first.index;
  const anchorSeparation = second.index - first.index;
  if (span < settings.minSpan || anchorSeparation < settings.minSeparation || second.index < candles.length - settings.recentAnchor) return null;
  const slope = (second.value - first.value) / anchorSeparation;
  if ((direction === "ascending" && slope <= 0) || (direction === "descending" && slope >= 0)) return null;

  const active = candles.slice(first.index);
  const averageClose = mean(active.map((candle) => candle.close));
  const averageRange = mean(active.map((candle) => candle.high - candle.low));
  if (Math.abs(slope) / averageClose < settings.minSlopeRate || Math.abs(slope) / averageClose > 0.025) return null;
  const touchTolerance = Math.max(averageClose * 0.006, averageRange * 0.3);
  const anchorLine = boundary(first.index, candles.length - 1, first.value, slope);
  const lineAt = (index: number) => trendBoundaryValue(anchorLine, index);
  const samePivots = pivots(candles, first.index, direction === "ascending" ? "low" : "high");
  const anchorTouches = samePivots.filter((pivot) => Math.abs(pivot.value - lineAt(pivot.index)) <= touchTolerance);
  if (anchorTouches.length < 3) return null;

  const oppositeResiduals = oppositePivots
    .filter((pivot) => pivot.index >= first.index)
    .map((pivot) => direction === "ascending" ? pivot.value - lineAt(pivot.index) : lineAt(pivot.index) - pivot.value)
    .filter((value) => value > touchTolerance);
  if (oppositeResiduals.length < 2) return null;
  const width = averageTop(oppositeResiduals);
  if (width < Math.max(averageRange * 1.1, averageClose * 0.025) || width > averageClose * 0.35) return null;

  const lower = direction === "ascending"
    ? anchorLine
    : boundary(first.index, candles.length - 1, first.value - width, slope);
  const upper = direction === "ascending"
    ? boundary(first.index, candles.length - 1, first.value + width, slope)
    : anchorLine;
  const oppositeTouches = oppositePivots.filter((pivot) => {
    if (pivot.index < first.index) return false;
    const target = direction === "ascending" ? trendBoundaryValue(upper, pivot.index) : trendBoundaryValue(lower, pivot.index);
    return Math.abs(pivot.value - target) <= touchTolerance * 1.5;
  });
  if (oppositeTouches.length < 2) return null;

  let wickBreaches = 0;
  let closeBreaches = 0;
  let recentTouch = false;
  const recentStart = Math.max(first.index, candles.length - Math.max(10, Math.round(settings.recentAnchor * 0.6)));
  for (let index = first.index; index < candles.length; index += 1) {
    const candle = candles[index];
    const lowerValue = trendBoundaryValue(lower, index);
    const upperValue = trendBoundaryValue(upper, index);
    if (candle.low < lowerValue - touchTolerance || candle.high > upperValue + touchTolerance) wickBreaches += 1;
    if (candle.close < lowerValue - touchTolerance * 0.35 || candle.close > upperValue + touchTolerance * 0.35) closeBreaches += 1;
    if (index >= recentStart && (Math.abs(candle.low - lowerValue) <= touchTolerance || Math.abs(candle.high - upperValue) <= touchTolerance)) recentTouch = true;
  }
  const maximumWickBreaches = Math.max(1, Math.floor(active.length * 0.05));
  if (wickBreaches > maximumWickBreaches || closeBreaches > 0 || !recentTouch) return null;

  const latest = candles[candles.length - 1];
  const firstCloses = mean(active.slice(0, Math.min(4, active.length)).map((candle) => candle.close));
  if (direction === "ascending" ? latest.close <= firstCloses + averageRange : latest.close >= firstCloses - averageRange) return null;
  const score = span + anchorTouches.length * 7 + oppositeTouches.length * 5 - wickBreaches * 10 + second.index * 0.05;
  return {
    direction,
    trendline: direction === "ascending" ? lower : upper,
    channel: { lower, upper },
    score,
  };
}

/**
 * Detects only a currently active pivot-anchored channel. Both boundaries must
 * have repeated touches, remain parallel, contain closes, and still be respected
 * near the latest candles. Sideways or already-broken structures return no line.
 */
export function detectTrendStructure(candles: DailyCandle[], timeframe: TrendTimeframe = "daily"): TrendStructure {
  const settings = candidateSettings(timeframe);
  const lookback = Math.min(settings.maxLookback, candles.length);
  const startIndex = candles.length - lookback;
  const segment = candles.slice(startIndex);
  if (segment.length < settings.minSpan || !segment.every(validCandle)) {
    return { direction: "sideways", lookback: segment.length, trendline: null, channel: null };
  }

  const lows = pivots(candles, startIndex, "low");
  const highs = pivots(candles, startIndex, "high");
  const candidates: TrendCandidate[] = [];
  for (let left = 0; left < lows.length; left += 1) {
    for (let right = left + 1; right < lows.length; right += 1) {
      const candidate = buildCandidate(candles, "ascending", lows[left], lows[right], highs, settings);
      if (candidate) candidates.push(candidate);
    }
  }
  for (let left = 0; left < highs.length; left += 1) {
    for (let right = left + 1; right < highs.length; right += 1) {
      const candidate = buildCandidate(candles, "descending", highs[left], highs[right], lows, settings);
      if (candidate) candidates.push(candidate);
    }
  }
  const best = candidates.sort((left, right) => right.score - left.score)[0];
  return best
    ? { direction: best.direction, lookback, trendline: best.trendline, channel: best.channel }
    : { direction: "sideways", lookback, trendline: null, channel: null };
}

export function trendBoundaryValue(boundary: TrendBoundary, index: number) {
  return boundary.startValue + boundary.slope * (index - boundary.startIndex);
}
