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

export type TechnicalAnalysis = {
  asOf: string;
  close: number;
  ma5: number | null;
  ma20: number | null;
  ma60: number | null;
  dailyTrend: "bullish" | "neutral" | "bearish";
  movingAverageSignal: "recent-golden-cross" | "bullish-alignment" | "mixed" | "bearish";
  goldenCrossDaysAgo: number | null;
  wBottom: "confirmed" | "forming" | "none";
  wBottomLow: number | null;
  wBottomNeckline: number | null;
  weeklyRangePosition: number | null;
  monthlyRangePosition: number | null;
  volumeRatio20: number | null;
  atr14: number | null;
  supportLevel: number | null;
  supportTimeframe: "weekly" | "monthly" | null;
  supportDistance: number | null;
  resistanceLevel: number | null;
  resistanceTimeframe: "weekly" | "monthly" | null;
  resistanceDistance: number | null;
  nearSupport: boolean;
  nearResistance: boolean;
  patternAtSupport: boolean;
  patternAtResistance: boolean;
  supportBroken: boolean;
  candlestickPattern: CandlestickPattern;
  patternDirection: "bullish" | "bearish" | "neutral";
  patternStage: "candidate" | "confirmed" | "none";
  consecutiveLargeBearish: number;
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
  return range > 0 && realBody(candle) <= range * 0.1;
}

function isSmallBody(candle: DailyCandle, baseline: number) {
  const range = candleRange(candle);
  return range > 0 && (isDoji(candle) || realBody(candle) <= Math.max(baseline * 0.55, range * 0.25));
}

function isLargeBody(candle: DailyCandle, baseline: number) {
  const range = candleRange(candle);
  return range > 0 && realBody(candle) >= baseline * 1.25 && realBody(candle) >= range * 0.55;
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

function aggregateCandles(candles: DailyCandle[], period: "week" | "month") {
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
  timeframe: "weekly" | "monthly";
  weight: number;
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
    if (isPivot) result.push({ price: value, timeframe, weight: timeframe === "monthly" ? 2 : 1 });
  }
  return result;
}

function nearestMajorLevel(
  levels: PriceLevel[],
  close: number,
  tolerance: number,
  kind: "support" | "resistance",
) {
  const clusters: Array<PriceLevel & { score: number }> = [];
  for (const level of levels.sort((left, right) => left.price - right.price)) {
    const cluster = clusters.find((item) => Math.abs(item.price - level.price) <= tolerance);
    if (cluster) {
      cluster.price = (cluster.price * cluster.score + level.price * level.weight) / (cluster.score + level.weight);
      cluster.score += level.weight;
      if (level.timeframe === "monthly") cluster.timeframe = "monthly";
    } else {
      clusters.push({ ...level, score: level.weight });
    }
  }

  const eligible = clusters.filter((level) => level.score >= 2 && (
    kind === "support" ? level.price <= close + tolerance * 2 : level.price >= close - tolerance * 2
  ));
  if (!eligible.length) return null;
  return eligible.reduce((best, level) => Math.abs(level.price - close) < Math.abs(best.price - close) ? level : best);
}

function detectKeyLevels(candles: DailyCandle[], weekly: DailyCandle[], monthly: DailyCandle[], atr14: number | null) {
  const close = candles[candles.length - 1].close;
  const tolerance = Math.max(close * 0.018, (atr14 ?? 0) * 0.6);
  const completedWeekly = weekly.slice(0, -1).slice(-156);
  const completedMonthly = monthly.slice(0, -1).slice(-60);
  const supports = [
    ...pivotLevels(completedWeekly, "weekly", "support"),
    ...pivotLevels(completedMonthly, "monthly", "support"),
  ];
  const resistances = [
    ...pivotLevels(completedWeekly, "weekly", "resistance"),
    ...pivotLevels(completedMonthly, "monthly", "resistance"),
  ];
  const support = nearestMajorLevel(supports, close, tolerance, "support");
  const resistance = nearestMajorLevel(resistances, close, tolerance, "resistance");
  const supportDistance = support ? (close - support.price) / close : null;
  const resistanceDistance = resistance ? (resistance.price - close) / close : null;
  const nearSupport = support ? Math.abs(close - support.price) <= Math.max(close * 0.025, (atr14 ?? 0) * 0.75) : false;
  const nearResistance = resistance ? Math.abs(resistance.price - close) <= Math.max(close * 0.025, (atr14 ?? 0) * 0.75) : false;
  const patternLow = Math.min(...candles.slice(-3).map((candle) => candle.low));
  const patternHigh = Math.max(...candles.slice(-3).map((candle) => candle.high));
  const patternAtSupport = support ? Math.abs(patternLow - support.price) <= Math.max(close * 0.025, (atr14 ?? 0) * 0.75) : false;
  const patternAtResistance = resistance ? Math.abs(patternHigh - resistance.price) <= Math.max(close * 0.025, (atr14 ?? 0) * 0.75) : false;
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
  return { support, resistance, supportDistance, resistanceDistance, nearSupport, nearResistance, patternAtSupport, patternAtResistance, supportBroken };
}

function detectCandlestickPattern(candles: DailyCandle[]) {
  const latest = candles[candles.length - 1];
  const prior = candles[candles.length - 2];
  const first = candles[candles.length - 3];
  const baseline = median(candles.slice(-23, -3).map(realBody).filter((value) => value > 0)) ?? Math.max(realBody(first), 0.01);
  const declining = priorTrend(candles, candles.length - 3, "down");
  const rising = priorTrend(candles, candles.length - 3, "up");
  let consecutiveLargeBearish = 0;
  for (let index = candles.length - 2; index >= Math.max(0, candles.length - 5); index -= 1) {
    if (isBearish(candles[index]) && isLargeBody(candles[index], baseline)) consecutiveLargeBearish += 1;
    else break;
  }

  if (first && prior && latest && declining && isBearish(first) && isLargeBody(first, baseline)
    && isSmallBody(prior, baseline) && isBullish(latest) && realBody(latest) >= baseline * 0.8
    && latest.close >= (first.open + first.close) / 2) {
    return { pattern: "morning-star" as const, direction: "bullish" as const, stage: "confirmed" as const, consecutiveLargeBearish };
  }
  if (first && prior && latest && rising && isBullish(first) && isLargeBody(first, baseline)
    && isSmallBody(prior, baseline) && isBearish(latest) && realBody(latest) >= baseline * 0.8
    && latest.close <= (first.open + first.close) / 2) {
    return { pattern: "evening-star" as const, direction: "bearish" as const, stage: "confirmed" as const, consecutiveLargeBearish };
  }
  if (prior && latest && priorTrend(candles, candles.length - 2, "down") && isBearish(prior) && isBullish(latest)
    && latest.open <= prior.close && latest.close >= prior.open) {
    return { pattern: "bullish-engulfing" as const, direction: "bullish" as const, stage: "confirmed" as const, consecutiveLargeBearish };
  }
  if (prior && latest && priorTrend(candles, candles.length - 2, "up") && isBullish(prior) && isBearish(latest)
    && latest.open >= prior.close && latest.close <= prior.open) {
    return { pattern: "bearish-engulfing" as const, direction: "bearish" as const, stage: "confirmed" as const, consecutiveLargeBearish };
  }
  if (prior && latest && priorTrend(candles, candles.length - 2, "down") && isBearish(prior)
    && isLargeBody(prior, baseline) && isSmallBody(latest, baseline)) {
    return { pattern: "morning-star-candidate" as const, direction: "bullish" as const, stage: "candidate" as const, consecutiveLargeBearish };
  }
  if (prior && latest && priorTrend(candles, candles.length - 2, "up") && isBullish(prior)
    && isLargeBody(prior, baseline) && isSmallBody(latest, baseline)) {
    return { pattern: "evening-star-candidate" as const, direction: "bearish" as const, stage: "candidate" as const, consecutiveLargeBearish };
  }
  if (latest && priorTrend(candles, candles.length - 1, "down") && isHammer(latest)) {
    return { pattern: "hammer" as const, direction: "bullish" as const, stage: "candidate" as const, consecutiveLargeBearish };
  }
  if (latest && priorTrend(candles, candles.length - 1, "up") && isShootingStar(latest)) {
    return { pattern: "shooting-star" as const, direction: "bearish" as const, stage: "candidate" as const, consecutiveLargeBearish };
  }
  if (latest && isDoji(latest)) {
    return { pattern: "doji" as const, direction: "neutral" as const, stage: "candidate" as const, consecutiveLargeBearish };
  }
  return { pattern: "none" as const, direction: "neutral" as const, stage: "none" as const, consecutiveLargeBearish };
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

export function analyzeTechnicalSetup(candles: DailyCandle[]): TechnicalAnalysis | null {
  const valid = candles.filter((candle) => Number.isFinite(candle.close) && candle.close > 0);
  if (valid.length < 20) return null;
  const latest = valid[valid.length - 1];
  const ma5 = movingAverageAt(valid, 5);
  const ma20 = movingAverageAt(valid, 20);
  const ma60 = movingAverageAt(valid, 60);
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
  const candlestick = detectCandlestickPattern(valid);
  const technicalAlert: TechnicalAlert = levels.supportBroken
    ? "support-broken"
    : candlestick.direction === "bullish" && candlestick.stage === "confirmed" && levels.patternAtSupport
      ? "bullish-confirmed"
      : candlestick.direction === "bearish" && candlestick.stage === "confirmed" && levels.patternAtResistance
        ? "bearish-confirmed"
        : candlestick.direction === "bullish" && candlestick.stage === "candidate" && levels.patternAtSupport
          ? "bullish-candidate"
          : candlestick.direction === "bearish" && candlestick.stage === "candidate" && levels.patternAtResistance
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
    dailyTrend,
    movingAverageSignal,
    goldenCrossDaysAgo,
    wBottom: wBottom.status,
    wBottomLow: wBottom.low,
    wBottomNeckline: wBottom.neckline,
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
    nearSupport: levels.nearSupport,
    nearResistance: levels.nearResistance,
    patternAtSupport: levels.patternAtSupport,
    patternAtResistance: levels.patternAtResistance,
    supportBroken: levels.supportBroken,
    candlestickPattern: candlestick.pattern,
    patternDirection: candlestick.direction,
    patternStage: candlestick.stage,
    consecutiveLargeBearish: candlestick.consecutiveLargeBearish,
    technicalAlert,
  };
}
