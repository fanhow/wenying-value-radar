import type { DailyCandle } from "./price-history.ts";

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
};

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
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
    volumeRatio20: averageVolume20 && latest.volume > 0 ? latest.volume / averageVolume20 : null,
  };
}
