import type { DailyCandle } from "./price-history.ts";

export type CandlestickPattern =
  | "morning-star"
  | "evening-star"
  | "bullish-engulfing"
  | "bearish-engulfing"
  | "morning-star-candidate"
  | "evening-star-candidate"
  | "hammer"
  | "shooting-star"
  | "doji"
  | "none";

export type TechnicalAlert =
  | "bullish-confirmed"
  | "bullish-candidate"
  | "bearish-confirmed"
  | "bearish-candidate"
  | "near-support"
  | "near-resistance"
  | "support-broken"
  | "neutral";

export type TechnicalTimeframe = "daily" | "weekly" | "monthly";

export type TechnicalLevel = {
  kind: "support" | "resistance";
  timeframe: TechnicalTimeframe;
  price: number;
};

export type TrendPullbackSetup = {
  status: "confirmed" | "forming" | "none";
  ema15: number | null;
  sma50: number | null;
  sma20: number | null;
  peakSpreadPercent: number | null;
  currentSpreadPercent: number | null;
  supportZoneLow: number | null;
  supportZoneHigh: number | null;
  wBottomDetected: boolean;
  stage: "w-bottom-buy" | "ma-support-test" | "none";
  signalReasonZh: string;
  signalReasonEn: string;
};

export type TechnicalAnalysis = {
  asOf: string;
  close: number;
  ma5: number | null;
  ma20: number | null;
  ma60: number | null;
  ema15: number | null;
  sma50: number | null;
  dailyTrend: "bullish" | "neutral" | "bearish";
  movingAverageSignal: "recent-golden-cross" | "bullish-alignment" | "mixed" | "bearish";
  goldenCrossDaysAgo: number | null;
  wBottom: "confirmed" | "forming" | "none";
  wBottomLow: number | null;
  wBottomNeckline: number | null;
  trendPullback: TrendPullbackSetup | null;
  weeklyRangePosition: number | null;
  monthlyRangePosition: number | null;
  volumeRatio20: number | null;
  atr14: number | null;
  supportLevel: number | null;
  supportTimeframe: "daily" | "weekly" | "monthly" | null;
  supportDistance: number | null;
  resistanceLevel: number | null;
  resistanceTimeframe: "daily" | "weekly" | "monthly" | null;
  resistanceDistance: number | null;
  keyLevels: TechnicalLevel[];
  nearSupport: boolean;
  nearResistance: boolean;
  patternAtSupport: boolean;
  patternAtResistance: boolean;
  supportBroken: boolean;
  candlestickPattern: CandlestickPattern;
  patternDirection: "bullish" | "bearish" | "neutral";
  patternStage: "candidate" | "confirmed" | "none";
  consecutiveLargeBearish: number;
  consecutiveLargeBullish: number;
  consecutiveTrendCandles: number;
  ma20Deviation: number | null;
  gapDirection: "up" | "down" | null;
  technicalAlert: TechnicalAlert;
};

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function trueRange(candle: DailyCandle, previous?: DailyCandle) {
  return Math.max(
    candle.high - candle.low,
    previous ? Math.abs(candle.high - previous.close) : 0,
    previous ? Math.abs(candle.low - previous.close) : 0,
  );
}

function averageTrueRange(candles: DailyCandle[], period = 14) {
  if (candles.length < period + 1) return null;
  const ranges = candles.slice(-period).map((candle, index) => {
    const sourceIndex = candles.length - period + index;
    return trueRange(candle, candles[sourceIndex - 1]);
  });
  return mean(ranges);
}

function realBody(candle: DailyCandle) {
  return Math.abs(candle.close - candle.open);
}

function candleRange(candle: DailyCandle) {
  return Math.max(candle.high - candle.low, 0);
}

function isBullish(candle: DailyCandle) {
  return candle.close > candle.open;
}

function isBearish(candle: DailyCandle) {
  return candle.close < candle.open;
}

function isDoji(candle: DailyCandle) {
  const range = candleRange(candle);
  return range > 0 && (realBody(candle) <= range * 0.18 || realBody(candle) <= candle.close * 0.0035);
}

function isSmallBody(candle: DailyCandle, baseline: number, comparisonBody?: number) {
  const range = candleRange(candle);
  if (range === 0) return true;
  if (isDoji(candle)) return true;
  if (comparisonBody && comparisonBody > 0 && realBody(candle) <= comparisonBody * 0.6) return true;
  return realBody(candle) <= Math.max(baseline * 0.85, range * 0.5, candle.close * 0.018);
}

function isLargeBody(candle: DailyCandle, baseline: number) {
  const range = candleRange(candle);
  return range > 0 && (realBody(candle) >= baseline * 1.1 || realBody(candle) >= range * 0.5 || realBody(candle) >= candle.close * 0.02);
}

function isHammer(candle: DailyCandle) {
  const range = candleRange(candle);
  const body = Math.max(realBody(candle), range * 0.04);
  const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
  const upperShadow = candle.high - Math.max(candle.open, candle.close);
  return range > 0 && lowerShadow >= body * 2 && upperShadow <= body && Math.max(candle.open, candle.close) >= candle.low + range * 0.6;
}

function isShootingStar(candle: DailyCandle) {
  const range = candleRange(candle);
  const body = Math.max(realBody(candle), range * 0.04);
  const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
  const upperShadow = candle.high - Math.max(candle.open, candle.close);
  return range > 0 && upperShadow >= body * 2 && lowerShadow <= body && Math.min(candle.open, candle.close) <= candle.low + range * 0.4;
}

function priorTrend(candles: DailyCandle[], endIndex: number, direction: "down" | "up") {
  const startIndex = Math.max(0, endIndex - 5);
  if (endIndex <= startIndex) return false;
  const start = candles[startIndex].close;
  const end = candles[endIndex].close;
  return direction === "down" ? end <= start * 0.98 : end >= start * 1.02;
}

function movingAverageAt(candles: DailyCandle[], period: number, index = candles.length - 1) {
  if (index + 1 < period) return null;
  return mean(candles.slice(index + 1 - period, index + 1).map((candle) => candle.close));
}

function rangePosition(candles: DailyCandle[]) {
  if (candles.length < 2) return null;
  const low = Math.min(...candles.map((candle) => candle.low));
  const high = Math.max(...candles.map((candle) => candle.high));
  if (!(high > low)) return null;
  return Math.min(1, Math.max(0, (candles[candles.length - 1].close - low) / (high - low)));
}

function periodKey(date: string, period: "week" | "month") {
  if (period === "month") return date.slice(0, 7);
  const value = new Date(`${date}T00:00:00Z`);
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() - day + 1);
  return value.toISOString().slice(0, 10);
}

export function aggregateCandles(candles: DailyCandle[], period: "week" | "month") {
  const result: DailyCandle[] = [];
  for (const candle of candles) {
    const key = periodKey(candle.date, period);
    const previous = result[result.length - 1];
    if (!previous || periodKey(previous.date, period) !== key) {
      result.push({ ...candle, date: key });
      continue;
    }
    previous.high = Math.max(previous.high, candle.high);
    previous.low = Math.min(previous.low, candle.low);
    previous.close = candle.close;
    previous.volume += candle.volume;
  }
  return result;
}

type PriceLevel = {
  price: number;
  timeframe: TechnicalTimeframe;
  weight: number;
  date: string;
};

function pivotLevels(candles: DailyCandle[], timeframe: PriceLevel["timeframe"], kind: "support" | "resistance") {
  const result: PriceLevel[] = [];
  for (let index = 2; index < candles.length - 2; index += 1) {
    const value = kind === "support" ? candles[index].low : candles[index].high;
    const neighbors = [candles[index - 2], candles[index - 1], candles[index + 1], candles[index + 2]]
      .map((candle) => kind === "support" ? candle.low : candle.high);
    const isPivot = kind === "support"
      ? neighbors.every((neighbor) => value <= neighbor)
      : neighbors.every((neighbor) => value >= neighbor);
    if (isPivot) result.push({
      price: value,
      timeframe,
      weight: timeframe === "monthly" ? 2 : timeframe === "weekly" ? 1 : 0.75,
      date: candles[index].date,
    });
  }
  return result;
}

function credibleTimeframeLevels(
  candles: DailyCandle[],
  weekly: DailyCandle[],
  monthly: DailyCandle[],
  atr14: number | null,
) {
  const close = candles[candles.length - 1].close;
  const sources: Array<{ timeframe: TechnicalTimeframe; candles: DailyCandle[]; tolerance: number }> = [
    { timeframe: "daily", candles: candles.slice(0, -1).slice(-260), tolerance: Math.max(close * 0.009, (atr14 ?? 0) * 0.3) },
    { timeframe: "weekly", candles: weekly.slice(0, -1).slice(-156), tolerance: Math.max(close * 0.014, (atr14 ?? 0) * 0.45) },
    { timeframe: "monthly", candles: monthly.slice(0, -1).slice(-60), tolerance: Math.max(close * 0.02, (atr14 ?? 0) * 0.65) },
  ];
  const result: TechnicalLevel[] = [];

  for (const source of sources) {
    const support = nearestMajorLevel(
      pivotLevels(source.candles, source.timeframe, "support"),
      close,
      source.tolerance,
      "support",
    );
    const resistance = nearestMajorLevel(
      pivotLevels(source.candles, source.timeframe, "resistance"),
      close,
      source.tolerance,
      "resistance",
    );
    const compressedRange = Boolean(
      support
      && resistance
      && resistance.price - support.price <= Math.max(close * 0.045, (atr14 ?? 0) * 1.25),
    );
    if (compressedRange) continue;
    if (support) result.push({ kind: "support", timeframe: source.timeframe, price: support.price });
    if (resistance) result.push({ kind: "resistance", timeframe: source.timeframe, price: resistance.price });
  }

  return result;
}

function nearestMajorLevel(
  levels: PriceLevel[],
  close: number,
  tolerance: number,
  kind: "support" | "resistance",
) {
  const clusters: Array<PriceLevel & { score: number; touchMonths: Set<string> }> = [];
  for (const level of levels.sort((left, right) => left.price - right.price)) {
    const cluster = clusters.find((item) => Math.abs(item.price - level.price) <= tolerance);
    if (cluster) {
      cluster.price = (cluster.price * cluster.score + level.price * level.weight) / (cluster.score + level.weight);
      cluster.score += level.weight;
      cluster.touchMonths.add(level.date.slice(0, 7));
      if (
        level.timeframe === "monthly"
        || (level.timeframe === "weekly" && cluster.timeframe === "daily")
      ) cluster.timeframe = level.timeframe;
    } else {
      clusters.push({ ...level, score: level.weight, touchMonths: new Set([level.date.slice(0, 7)]) });
    }
  }

  const eligible = clusters.filter((level) => level.score >= 2 && level.touchMonths.size >= 2 && (
    kind === "support" ? level.price <= close + tolerance * 2 : level.price >= close
  ));
  if (!eligible.length) return null;
  const primaryLevels = kind === "resistance"
    ? eligible.filter((level) => level.score >= Math.max(2, Math.max(...eligible.map((item) => item.score)) * 0.6))
    : eligible;
  return primaryLevels.reduce((best, level) => Math.abs(level.price - close) < Math.abs(best.price - close) ? level : best);
}

function detectKeyLevels(candles: DailyCandle[], weekly: DailyCandle[], monthly: DailyCandle[], atr14: number | null) {
  const close = candles[candles.length - 1].close;
  const tolerance = Math.max(close * 0.018, (atr14 ?? 0) * 0.6);
  const completedWeekly = weekly.slice(0, -1).slice(-156);
  const completedMonthly = monthly.slice(0, -1).slice(-60);
  const completedDaily = candles.slice(0, -1).slice(-120);
  const dailyResistancePivots = pivotLevels(completedDaily, "daily", "resistance");
  const formerSupportPivots = [
    ...pivotLevels(completedDaily, "daily", "support"),
    ...pivotLevels(completedWeekly, "weekly", "support"),
    ...pivotLevels(completedMonthly, "monthly", "support"),
  ].filter((level) => level.price >= close);
  const roleReversalTolerance = Math.max(close * 0.012, (atr14 ?? 0) * 0.3);
  const roleReversalHighs = dailyResistancePivots.filter((high) => (
    formerSupportPivots.some((support) => Math.abs(support.price - high.price) <= roleReversalTolerance)
  ));
  const supports = [
    ...pivotLevels(completedWeekly, "weekly", "support"),
    ...pivotLevels(completedMonthly, "monthly", "support"),
  ];
  const resistances = [
    ...roleReversalHighs.map((level) => ({ ...level, weight: 1.1 })),
    ...pivotLevels(completedWeekly, "weekly", "resistance"),
    ...pivotLevels(completedMonthly, "monthly", "resistance"),
  ];
  const rawSupport = nearestMajorLevel(supports, close, tolerance, "support");
  const resistanceClusterTolerance = Math.max(close * 0.01, (atr14 ?? 0) * 0.25);
  const rawResistance = nearestMajorLevel(resistances, close, resistanceClusterTolerance, "resistance");
  const compressedRange = Boolean(
    rawSupport
    && rawResistance
    && rawSupport.price <= close
    && rawResistance.price > rawSupport.price
    && rawResistance.price - rawSupport.price <= Math.max(close * 0.045, (atr14 ?? 0) * 1.25),
  );
  const support = compressedRange ? null : rawSupport;
  const resistance = compressedRange ? null : rawResistance;
  const supportDistance = support ? (close - support.price) / close : null;
  const resistanceDistance = resistance ? (resistance.price - close) / close : null;
  const nearSupport = support ? Math.abs(close - support.price) <= Math.max(close * 0.025, (atr14 ?? 0) * 0.75) : false;
  const nearResistance = resistance ? Math.abs(resistance.price - close) <= Math.max(close * 0.025, (atr14 ?? 0) * 0.75) : false;
  const patternLow = Math.min(...candles.slice(-3).map((candle) => candle.low));
  const patternHigh = Math.max(...candles.slice(-3).map((candle) => candle.high));
  const keyLevels = credibleTimeframeLevels(candles, weekly, monthly, atr14);
  const patternTolerance = Math.max(close * 0.025, (atr14 ?? 0) * 0.75);
  const patternAtSupport = [support?.price, ...keyLevels.filter((level) => level.kind === "support").map((level) => level.price)]
    .some((price) => price !== undefined && Math.abs(patternLow - price) <= patternTolerance);
  const patternAtResistance = [resistance?.price, ...keyLevels.filter((level) => level.kind === "resistance").map((level) => level.price)]
    .some((price) => price !== undefined && Math.abs(patternHigh - price) <= patternTolerance);
  const previous = candles[candles.length - 2];
  const averageVolume20 = mean(candles.slice(-21, -1).map((candle) => candle.volume).filter((value) => value > 0));
  const volumeRatio20 = averageVolume20 && candles[candles.length - 1].volume > 0
    ? candles[candles.length - 1].volume / averageVolume20
    : null;
  const supportBroken = Boolean(
    support
    && atr14
    && previous
    && previous.close >= support.price - atr14 * 0.1
    && close < support.price - atr14 * 0.35
    && (volumeRatio20 === null || volumeRatio20 >= 1.2),
  );
  return {
    support,
    resistance,
    keyLevels,
    supportDistance,
    resistanceDistance,
    nearSupport,
    nearResistance,
    patternAtSupport,
    patternAtResistance,
    supportBroken,
  };
}

function consecutiveCandles(candles: DailyCandle[], endIndex: number, direction: "down" | "up") {
  let count = 0;
  for (let index = endIndex; index >= Math.max(0, endIndex - 5); index -= 1) {
    if (direction === "down" ? isBearish(candles[index]) : isBullish(candles[index])) count += 1;
    else break;
  }
  return count;
}

function detectCandlestickPattern(candles: DailyCandle[], atr14: number | null) {
  const latest = candles[candles.length - 1];
  const prior = candles[candles.length - 2];
  const first = candles[candles.length - 3];
  const baseline = median(candles.slice(-23, -3).map(realBody).filter((value) => value > 0)) ?? Math.max(realBody(first), 0.01);
  const declining = priorTrend(candles, candles.length - 3, "down");
  const rising = priorTrend(candles, candles.length - 3, "up");
  let consecutiveLargeBearish = 0;
  let consecutiveLargeBullish = 0;
  for (let index = candles.length - 2; index >= Math.max(0, candles.length - 5); index -= 1) {
    if (isBearish(candles[index]) && isLargeBody(candles[index], baseline)) consecutiveLargeBearish += 1;
    else break;
  }
  for (let index = candles.length - 2; index >= Math.max(0, candles.length - 5); index -= 1) {
    if (isBullish(candles[index]) && isLargeBody(candles[index], baseline)) consecutiveLargeBullish += 1;
    else break;
  }
  const consecutiveBearish = consecutiveCandles(candles, candles.length - 2, "down");
  const consecutiveBullish = consecutiveCandles(candles, candles.length - 2, "up");
  const ma20 = movingAverageAt(candles, 20);
  const ma20Deviation = ma20 && latest ? latest.close / ma20 - 1 : null;
  const farThreshold = latest ? Math.max(0.05, ((atr14 ?? 0) / latest.close) * 1.5) : 0.05;
  const farBelowMa20 = ma20Deviation !== null && ma20Deviation <= -farThreshold;
  const farAboveMa20 = ma20Deviation !== null && ma20Deviation >= farThreshold;
  const gapDirection = prior && latest
    ? latest.open < prior.low ? "down" as const : latest.open > prior.high ? "up" as const : null
    : null;
  const details = { consecutiveLargeBearish, consecutiveLargeBullish, ma20Deviation, gapDirection };

  // Morning Star (早晨之星): downtrend -> large bearish -> downward gap small star -> bullish recovering >= 50%
  const morningStarGap = prior && first && (prior.open <= first.close || prior.high <= first.close * 1.005 || Math.max(prior.open, prior.close) <= (first.open + first.close) / 2);
  if (first && prior && latest && declining && isBearish(first) && isLargeBody(first, baseline)
    && isSmallBody(prior, baseline, realBody(first)) && morningStarGap && isBullish(latest)
    && latest.close >= (first.open + first.close) / 2 && latest.close > prior.close) {
    return { pattern: "morning-star" as const, direction: "bullish" as const, stage: "confirmed" as const, consecutiveTrendCandles: consecutiveBearish, ...details };
  }

  // Evening Star (黃昏之星): uptrend -> large bullish -> upward gap small star -> bearish falling <= 50%
  const eveningStarGap = prior && first && (prior.open >= first.close || prior.low >= first.close * 0.995 || Math.min(prior.open, prior.close) >= (first.open + first.close) / 2);
  if (first && prior && latest && rising && isBullish(first) && isLargeBody(first, baseline)
    && isSmallBody(prior, baseline, realBody(first)) && eveningStarGap && isBearish(latest)
    && latest.close <= (first.open + first.close) / 2 && latest.close < prior.close) {
    return { pattern: "evening-star" as const, direction: "bearish" as const, stage: "confirmed" as const, consecutiveTrendCandles: consecutiveBullish, ...details };
  }

  if (prior && latest && priorTrend(candles, candles.length - 2, "down") && isBearish(prior) && isBullish(latest)
    && latest.open <= prior.close && latest.close >= prior.open) {
    return { pattern: "bullish-engulfing" as const, direction: "bullish" as const, stage: "confirmed" as const, consecutiveTrendCandles: consecutiveBearish, ...details };
  }
  if (prior && latest && priorTrend(candles, candles.length - 2, "up") && isBullish(prior) && isBearish(latest)
    && latest.open >= prior.close && latest.close <= prior.open) {
    return { pattern: "bearish-engulfing" as const, direction: "bearish" as const, stage: "confirmed" as const, consecutiveTrendCandles: consecutiveBullish, ...details };
  }

  // Morning Star Candidate (十字星收盤·可能形成): downtrend -> large bearish -> downward gap to Doji / small star
  const latestDownGap = prior && latest && (latest.open <= prior.close || latest.high <= prior.close * 1.005 || Math.max(latest.open, latest.close) <= (prior.open + prior.close) / 2);
  if (prior && latest && priorTrend(candles, candles.length - 2, "down") && isBearish(prior)
    && isLargeBody(prior, baseline) && isSmallBody(latest, baseline, realBody(prior)) && latestDownGap) {
    return { pattern: "morning-star-candidate" as const, direction: "bullish" as const, stage: "candidate" as const, consecutiveTrendCandles: consecutiveBearish, ...details };
  }

  // Evening Star Candidate (十字星收盤·可能形成): uptrend -> large bullish -> upward gap to Doji / small star
  const latestUpGap = prior && latest && (latest.open >= prior.close || latest.low >= prior.close * 0.995 || Math.min(latest.open, latest.close) >= (prior.open + prior.close) / 2);
  if (prior && latest && priorTrend(candles, candles.length - 2, "up") && isBullish(prior)
    && isLargeBody(prior, baseline) && isSmallBody(latest, baseline, realBody(prior)) && latestUpGap) {
    return { pattern: "evening-star-candidate" as const, direction: "bearish" as const, stage: "candidate" as const, consecutiveTrendCandles: consecutiveBullish, ...details };
  }

  if (latest && priorTrend(candles, candles.length - 1, "down") && isHammer(latest)) {
    return { pattern: "hammer" as const, direction: "bullish" as const, stage: "candidate" as const, consecutiveTrendCandles: consecutiveBearish, ...details };
  }
  if (latest && priorTrend(candles, candles.length - 1, "up") && isShootingStar(latest)) {
    return { pattern: "shooting-star" as const, direction: "bearish" as const, stage: "candidate" as const, consecutiveTrendCandles: consecutiveBullish, ...details };
  }
  if (latest && isDoji(latest)) {
    return { pattern: "doji" as const, direction: "neutral" as const, stage: "candidate" as const, consecutiveTrendCandles: Math.max(consecutiveBearish, consecutiveBullish), ...details };
  }
  return { pattern: "none" as const, direction: "neutral" as const, stage: "none" as const, consecutiveTrendCandles: Math.max(consecutiveBearish, consecutiveBullish), ...details };
}

function detectWBottom(candles: DailyCandle[]) {
  const recent = candles.slice(-100);
  if (recent.length < 35) return { status: "none" as const, low: null, neckline: null };
  const lows: number[] = [];
  for (let index = 2; index < recent.length - 2; index += 1) {
    const value = recent[index].low;
    if (value <= recent[index - 1].low && value <= recent[index - 2].low
      && value <= recent[index + 1].low && value <= recent[index + 2].low) lows.push(index);
  }

  let best: { score: number; first: number; second: number; neckline: number } | null = null;
  for (let left = 0; left < lows.length; left += 1) {
    for (let right = left + 1; right < lows.length; right += 1) {
      const first = lows[left];
      const second = lows[right];
      const separation = second - first;
      if (separation < 8 || separation > 55 || second < recent.length - 45) continue;
      const firstLow = recent[first].low;
      const secondLow = recent[second].low;
      const averageLow = (firstLow + secondLow) / 2;
      const similarity = Math.abs(firstLow - secondLow) / averageLow;
      if (similarity > 0.1) continue;
      const neckline = Math.max(...recent.slice(first + 1, second).map((candle) => candle.high));
      const depth = neckline / averageLow - 1;
      if (depth < 0.06) continue;
      const score = depth * 3 - similarity + second / recent.length * 0.2;
      if (!best || score > best.score) best = { score, first, second, neckline };
    }
  }

  if (!best) return { status: "none" as const, low: null, neckline: null };
  const low = (recent[best.first].low + recent[best.second].low) / 2;
  const close = recent[recent.length - 1].close;
  return {
    status: close >= best.neckline * 0.99 ? "confirmed" as const : close >= low * 1.03 ? "forming" as const : "none" as const,
    low,
    neckline: best.neckline,
  };
}

export function exponentialMovingAverageSeries(candles: DailyCandle[], period: number): (number | null)[] {
  if (candles.length === 0) return [];
  const multiplier = 2 / (period + 1);
  const result: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length < period) return result;

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += candles[i].close;
  }
  let prevEma = sum / period;
  result[period - 1] = prevEma;

  for (let i = period; i < candles.length; i++) {
    prevEma = (candles[i].close - prevEma) * multiplier + prevEma;
    result[i] = prevEma;
  }
  return result;
}

export function movingAverageSeries(candles: DailyCandle[], period: number): (number | null)[] {
  return candles.map((_, index) => {
    if (index + 1 < period) return null;
    const window = candles.slice(index + 1 - period, index + 1);
    return window.reduce((sum, candle) => sum + candle.close, 0) / period;
  });
}

function detectTrendPullback(
  candles: DailyCandle[],
  wBottomResult: { status: "confirmed" | "forming" | "none"; low: number | null; neckline: number | null },
  keyLevels: TechnicalLevel[],
): TrendPullbackSetup | null {
  if (candles.length < 40) return null;
  const ema15Series = exponentialMovingAverageSeries(candles, 15);
  const sma50Series = movingAverageSeries(candles, 50);
  const sma20Series = movingAverageSeries(candles, 20);
  const latestIndex = candles.length - 1;
  const latestClose = candles[latestIndex].close;
  const latestEma15 = ema15Series[latestIndex];
  const latestSma50 = sma50Series[latestIndex];
  const latestSma20 = sma20Series[latestIndex];

  if (!latestEma15 || !latestSma50) return null;

  let peakSpread = 0;
  let waveUpDetected = false;
  const lookbackStart = Math.max(0, latestIndex - 60);
  for (let i = lookbackStart; i <= latestIndex - 4; i++) {
    const e = ema15Series[i];
    const s = sma50Series[i];
    if (e && s && s > 0) {
      const spread = (e - s) / s;
      if (spread > peakSpread) peakSpread = spread;
      if (spread >= 0.03) waveUpDetected = true;
    }
  }

  const currentSpread = (latestEma15 - latestSma50) / latestSma50;
  const isConverging = waveUpDetected && currentSpread <= 0.05 && latestClose >= latestSma50 * 0.94;

  if (!isConverging) return null;

  const supportLevel = keyLevels.find((lvl) => lvl.kind === "support" && Math.abs(lvl.price - latestSma50) <= latestSma50 * 0.06)?.price ?? latestSma50;
  const zoneLow = Math.min(latestSma50 * 0.985, wBottomResult.low ?? (supportLevel * 0.98));
  const zoneHigh = Math.max(latestSma50 * 1.025, wBottomResult.neckline ?? (supportLevel * 1.03));

  const nearZone = latestClose >= zoneLow * 0.97 && latestClose <= zoneHigh * 1.05;
  const isWBottom = wBottomResult.status !== "none" && (wBottomResult.low ? Math.abs(wBottomResult.low - latestSma50) <= latestSma50 * 0.07 : true);

  if (isWBottom && nearZone) {
    return {
      status: wBottomResult.status === "confirmed" ? "confirmed" : "forming",
      ema15: latestEma15,
      sma50: latestSma50,
      sma20: latestSma20,
      peakSpreadPercent: peakSpread * 100,
      currentSpreadPercent: currentSpread * 100,
      supportZoneLow: zoneLow,
      supportZoneHigh: zoneHigh,
      wBottomDetected: true,
      stage: "w-bottom-buy",
      signalReasonZh: "波段上漲後均線規律收斂，於 50MA 支撐區打出 W 底型態，具備順勢買點訊號",
      signalReasonEn: "Orderly MA convergence after breakout wave; W-bottom formed at 50MA support buy zone",
    };
  }

  if (nearZone && Math.abs(latestClose - latestSma50) <= latestSma50 * 0.04) {
    return {
      status: "forming",
      ema15: latestEma15,
      sma50: latestSma50,
      sma20: latestSma20,
      peakSpreadPercent: peakSpread * 100,
      currentSpreadPercent: currentSpread * 100,
      supportZoneLow: zoneLow,
      supportZoneHigh: zoneHigh,
      wBottomDetected: isWBottom,
      stage: "ma-support-test",
      signalReasonZh: "EMA15 與 SMA50 開口收合，回測 50MA 黃色支撐區整理，關注止跌轉折買點",
      signalReasonEn: "EMA15/SMA50 spread narrowing; testing 50MA yellow support zone for pullback entry",
    };
  }

  return null;
}

export function analyzeTechnicalSetup(candles: DailyCandle[]): TechnicalAnalysis | null {
  const valid = candles.filter((candle) => Number.isFinite(candle.close) && candle.close > 0);
  if (valid.length < 20) return null;
  const latest = valid[valid.length - 1];
  const ma5 = movingAverageAt(valid, 5);
  const ma20 = movingAverageAt(valid, 20);
  const ma60 = movingAverageAt(valid, 60);
  const ema15Series = exponentialMovingAverageSeries(valid, 15);
  const sma50Series = movingAverageSeries(valid, 50);
  const ema15 = ema15Series[ema15Series.length - 1] ?? null;
  const sma50 = sma50Series[sma50Series.length - 1] ?? null;

  let goldenCrossDaysAgo: number | null = null;
  for (let daysAgo = 0; daysAgo <= 10; daysAgo += 1) {
    const index = valid.length - 1 - daysAgo;
    const prior = index - 1;
    const short = movingAverageAt(valid, 5, index);
    const long = movingAverageAt(valid, 20, index);
    const priorShort = movingAverageAt(valid, 5, prior);
    const priorLong = movingAverageAt(valid, 20, prior);
    if (short !== null && long !== null && priorShort !== null && priorLong !== null && short > long && priorShort <= priorLong) {
      goldenCrossDaysAgo = daysAgo;
      break;
    }
  }

  const movingAverageSignal = goldenCrossDaysAgo !== null
    ? "recent-golden-cross" as const
    : ma5 !== null && ma20 !== null && ma60 !== null && ma5 > ma20 && ma20 > ma60
      ? "bullish-alignment" as const
      : ma5 !== null && ma20 !== null && latest.close < ma5 && ma5 < ma20
        ? "bearish" as const
        : "mixed" as const;
  const dailyTrend = ma5 !== null && ma20 !== null && latest.close > ma5 && ma5 > ma20
    ? "bullish" as const
    : ma5 !== null && ma20 !== null && latest.close < ma5 && ma5 < ma20
      ? "bearish" as const
      : "neutral" as const;
  const wBottom = detectWBottom(valid);
  const weekly = aggregateCandles(valid, "week").slice(-52);
  const monthly = aggregateCandles(valid, "month").slice(-36);
  const averageVolume20 = mean(valid.slice(-21, -1).map((candle) => candle.volume).filter((value) => value > 0));
  const volumeRatio20 = averageVolume20 && latest.volume > 0 ? latest.volume / averageVolume20 : null;
  const atr14 = averageTrueRange(valid);
  const levels = detectKeyLevels(valid, aggregateCandles(valid, "week"), aggregateCandles(valid, "month"), atr14);
  const rawCandlestick = detectCandlestickPattern(valid, atr14);
  const trendPullback = detectTrendPullback(valid, wBottom, levels.keyLevels);

  // Strict Rule: Morning Star / Bullish reversal patterns MUST form on a Day/Week/Month support line.
  // Evening Star / Bearish reversal patterns MUST form on a Day/Week/Month resistance line.
  const hasKeyLevels = levels.keyLevels.length > 0 || levels.support !== null || levels.resistance !== null;
  const isBullishPattern = rawCandlestick.direction === "bullish";
  const isBearishPattern = rawCandlestick.direction === "bearish";
  const validPatternAtLevel = !hasKeyLevels || (
    isBullishPattern
      ? (levels.patternAtSupport || levels.nearSupport)
      : isBearishPattern
        ? (levels.patternAtResistance || levels.nearResistance)
        : true
  );

  const candlestick = validPatternAtLevel
    ? rawCandlestick
    : {
        pattern: "none" as const,
        direction: "neutral" as const,
        stage: "none" as const,
        consecutiveLargeBearish: rawCandlestick.consecutiveLargeBearish,
        consecutiveLargeBullish: rawCandlestick.consecutiveLargeBullish,
        consecutiveTrendCandles: rawCandlestick.consecutiveTrendCandles,
        ma20Deviation: rawCandlestick.ma20Deviation,
        gapDirection: rawCandlestick.gapDirection,
      };

  const technicalAlert: TechnicalAlert = levels.supportBroken
    ? "support-broken"
    : candlestick.direction === "bullish" && candlestick.stage === "confirmed" && (levels.patternAtSupport || levels.nearSupport)
      ? "bullish-confirmed"
      : candlestick.direction === "bearish" && candlestick.stage === "confirmed" && (levels.patternAtResistance || levels.nearResistance)
        ? "bearish-confirmed"
        : candlestick.direction === "bullish" && candlestick.stage === "candidate" && (levels.patternAtSupport || levels.nearSupport)
          ? "bullish-candidate"
          : candlestick.direction === "bearish" && candlestick.stage === "candidate" && (levels.patternAtResistance || levels.nearResistance)
            ? "bearish-candidate"
            : levels.nearSupport
              ? "near-support"
              : levels.nearResistance
                ? "near-resistance"
                : "neutral";

  return {
    asOf: latest.date,
    close: latest.close,
    ma5,
    ma20,
    ma60,
    ema15,
    sma50,
    dailyTrend,
    movingAverageSignal,
    goldenCrossDaysAgo,
    wBottom: wBottom.status,
    wBottomLow: wBottom.low,
    wBottomNeckline: wBottom.neckline,
    trendPullback,
    weeklyRangePosition: rangePosition(weekly),
    monthlyRangePosition: rangePosition(monthly),
    volumeRatio20,
    atr14,
    supportLevel: levels.support?.price ?? null,
    supportTimeframe: levels.support?.timeframe ?? null,
    supportDistance: levels.supportDistance,
    resistanceLevel: levels.resistance?.price ?? null,
    resistanceTimeframe: levels.resistance?.timeframe ?? null,
    resistanceDistance: levels.resistanceDistance,
    keyLevels: levels.keyLevels,
    nearSupport: levels.nearSupport,
    nearResistance: levels.nearResistance,
    patternAtSupport: levels.patternAtSupport,
    patternAtResistance: levels.patternAtResistance,
    supportBroken: levels.supportBroken,
    candlestickPattern: candlestick.pattern,
    patternDirection: candlestick.direction,
    patternStage: candlestick.stage,
    consecutiveLargeBearish: candlestick.consecutiveLargeBearish,
    consecutiveLargeBullish: candlestick.consecutiveLargeBullish,
    consecutiveTrendCandles: candlestick.consecutiveTrendCandles,
    ma20Deviation: candlestick.ma20Deviation,
    gapDirection: candlestick.gapDirection,
    technicalAlert,
  };
}
