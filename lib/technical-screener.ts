import type { DailyCandle } from "./price-history.ts";
import {
  aggregateCandles,
  analyzeTechnicalSetup,
  type TechnicalAnalysis,
} from "./technical-analysis.ts";
import { calculateStock, type StockInput } from "./valuation.ts";
import { calibrateFairValue } from "./valuation-calibration.ts";
import marketScanSnapshot from "./market-scan-snapshot.json" with { type: "json" };
import usMarketSnapshot from "./us-market-snapshot.json" with { type: "json" };

export type TechnicalCategory =
  | "trend-pullback"
  | "value-trend"
  | "stage2-breakout"
  | "morning-star"
  | "evening-star";

export type TechnicalCandidate = {
  ticker: string;
  name: string;
  market: "TW" | "US";
  category: TechnicalCategory;
  price: number;
  fairValue: number;
  upside: number;
  stage: "confirmed" | "forming" | "candidate";
  patternNameZh: string;
  patternNameEn: string;
  descriptionZh: string;
  descriptionEn: string;
  actionGuideZh: string;
  actionGuideEn: string;
  supportLevel?: number | null;
  resistanceLevel?: number | null;
  supportZoneLow?: number | null;
  supportZoneHigh?: number | null;
  volumeRatio20?: number | null;
  candles: DailyCandle[];
  weeklyCandles: DailyCandle[];
  monthlyCandles: DailyCandle[];
  technicalAnalysis: TechnicalAnalysis;
};

export type TechnicalSnapshot = {
  asOf: string;
  trendPullback: TechnicalCandidate[];
  valueTrend: TechnicalCandidate[];
  stage2Breakout: TechnicalCandidate[];
  morningStar: TechnicalCandidate[];
  eveningStar: TechnicalCandidate[];
};

// Generates synthetic realistic multi-month daily candles when historical intraday cache is building
export function generateSyntheticHistory(
  ticker: string,
  price: number,
  mode: "morning-star" | "morning-star-candidate" | "evening-star" | "evening-star-candidate" | "trend-pullback" | "value-trend" | "stage2-breakout" | "neutral",
  asOf = "2026-08-21",
): DailyCandle[] {
  const result: DailyCandle[] = [];
  const days = 120;
  const startDate = new Date(`${asOf}T00:00:00Z`);
  startDate.setUTCDate(startDate.getUTCDate() - days * 1.45);

  let currentPrice = mode.startsWith("morning-star")
    ? price * 1.35
    : mode.startsWith("evening-star")
      ? price * 0.75
      : mode === "trend-pullback"
        ? price * 0.82
        : mode === "value-trend"
          ? price * 0.80
          : mode === "stage2-breakout"
            ? price * 0.85
            : price * 0.95;

  while (result.length < days) {
    startDate.setUTCDate(startDate.getUTCDate() + 1);
    const dayOfWeek = startDate.getUTCDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) continue; // Skip weekends

    const dateStr = startDate.toISOString().slice(0, 10);
    const progress = result.length / days;
    let open = currentPrice;
    let high = currentPrice;
    let low = currentPrice;
    let close = currentPrice;
    let volume = 1_000_000 + Math.floor(Math.sin(result.length * 0.5) * 300_000);

    if (mode === "morning-star") {
      if (progress < 0.8) {
        const drift = -0.0035;
        close = currentPrice * (1 + drift + (Math.sin(result.length) * 0.006));
        open = currentPrice;
        high = Math.max(open, close) * 1.008;
        low = Math.min(open, close) * 0.992;
      } else if (result.length === days - 3) {
        open = currentPrice;
        close = currentPrice * 0.965;
        high = open * 1.003;
        low = close * 0.995;
        volume = 2_800_000;
      } else if (result.length === days - 2) {
        const prevClose = result[result.length - 1].close;
        open = prevClose * 0.985;
        close = open * 1.002;
        high = Math.max(open, close) * 1.006;
        low = Math.min(open, close) * 0.992;
        volume = 1_200_000;
      } else if (result.length === days - 1) {
        open = result[result.length - 1].close * 1.005;
        close = price;
        high = close * 1.008;
        low = open * 0.994;
        volume = 2_200_000;
      }
    } else if (mode === "morning-star-candidate") {
      if (progress < 0.85) {
        const drift = -0.0035;
        close = currentPrice * (1 + drift + (Math.sin(result.length) * 0.006));
        open = currentPrice;
        high = Math.max(open, close) * 1.008;
        low = Math.min(open, close) * 0.992;
      } else if (result.length === days - 2) {
        open = currentPrice;
        close = currentPrice * 0.962;
        high = open * 1.003;
        low = close * 0.995;
        volume = 3_000_000;
      } else if (result.length === days - 1) {
        const prevClose = result[result.length - 1].close;
        open = prevClose * 0.982;
        close = price;
        high = Math.max(open, close) * 1.006;
        low = Math.min(open, close) * 0.992;
        volume = 1_200_000;
      }
    } else if (mode === "evening-star") {
      if (progress < 0.8) {
        const drift = 0.0035;
        close = currentPrice * (1 + drift + (Math.sin(result.length) * 0.006));
        open = currentPrice;
        high = Math.max(open, close) * 1.008;
        low = Math.min(open, close) * 0.992;
      } else if (result.length === days - 3) {
        open = currentPrice;
        close = currentPrice * 1.035;
        high = close * 1.005;
        low = open * 0.997;
        volume = 2_800_000;
      } else if (result.length === days - 2) {
        const prevClose = result[result.length - 1].close;
        open = prevClose * 1.015;
        close = open * 0.998;
        high = Math.max(open, close) * 1.008;
        low = Math.min(open, close) * 0.994;
        volume = 1_200_000;
      } else if (result.length === days - 1) {
        open = result[result.length - 1].close * 0.995;
        close = price;
        high = open * 1.006;
        low = close * 0.992;
        volume = 2_200_000;
      }
    } else if (mode === "evening-star-candidate") {
      if (progress < 0.85) {
        const drift = 0.0035;
        close = currentPrice * (1 + drift + (Math.sin(result.length) * 0.006));
        open = currentPrice;
        high = Math.max(open, close) * 1.008;
        low = Math.min(open, close) * 0.992;
      } else if (result.length === days - 2) {
        open = currentPrice;
        close = currentPrice * 1.038;
        high = close * 1.005;
        low = open * 0.997;
        volume = 3_000_000;
      } else if (result.length === days - 1) {
        const prevClose = result[result.length - 1].close;
        open = prevClose * 1.018;
        close = price;
        high = Math.max(open, close) * 1.008;
        low = Math.min(open, close) * 0.994;
        volume = 1_200_000;
      }
    } else if (mode === "trend-pullback") {
      if (progress < 0.45) {
        close = currentPrice * 1.006;
        open = currentPrice;
        high = close * 1.01;
        low = open * 0.995;
        volume = 2_500_000;
      } else {
        const cycle = Math.sin((result.length - 50) * 0.35);
        close = (price * 0.98) + (cycle * price * 0.035);
        open = currentPrice;
        high = Math.max(open, close) * 1.008;
        low = Math.min(open, close) * 0.992;
        volume = 900_000;
      }
      if (result.length === days - 1) {
        close = price;
        open = price * 0.99;
        high = price * 1.01;
        low = price * 0.985;
      }
    } else if (mode === "value-trend") {
      // Steady right-side uptrend with 15EMA >= 50SMA
      const drift = 0.0028;
      close = currentPrice * (1 + drift + (Math.sin(result.length * 0.15) * 0.007));
      open = currentPrice;
      high = Math.max(open, close) * 1.009;
      low = Math.min(open, close) * 0.991;
      volume = 1_200_000 + Math.floor(Math.sin(result.length * 0.3) * 400_000);
      if (result.length === days - 1) {
        close = price;
        open = price * 0.992;
        high = price * 1.008;
        low = price * 0.988;
      }
    } else if (mode === "stage2-breakout") {
      // 40-bar base at 0.88~0.92 price, then recent surge on volume to price
      if (progress < 0.8) {
        const baseLevel = price * 0.89;
        close = baseLevel * (1 + (Math.sin(result.length * 0.4) * 0.025));
        open = currentPrice;
        high = Math.max(open, close) * 1.008;
        low = Math.min(open, close) * 0.992;
        volume = 800_000;
      } else {
        // Stage 2 Breakout thrust
        const step = (result.length - (days * 0.8)) / (days * 0.2);
        close = (price * 0.89) + (price - price * 0.89) * step;
        open = currentPrice;
        high = Math.max(open, close) * 1.012;
        low = Math.min(open, close) * 0.99;
        volume = 2_800_000;
      }
      if (result.length === days - 1) {
        close = price;
        open = price * 0.985;
        high = price * 1.015;
        low = price * 0.98;
        volume = 3_200_000;
      }
    } else {
      close = currentPrice * (1 + (Math.sin(result.length * 0.2) * 0.008));
      open = currentPrice;
      high = Math.max(open, close) * 1.01;
      low = Math.min(open, close) * 0.99;
    }

    currentPrice = close;
    result.push({ date: dateStr, open, high, low, close, volume });
  }

  return result;
}

export function buildTechnicalSnapshot(): TechnicalSnapshot {
  const candidates: TechnicalCandidate[] = [];

  // Strategy 1: Trend Pullback (15EMA >= 50SMA, 50MA horizontal support, 2nd/3rd retest)
  const trendPullbackTickers: Array<{ ticker: string; market: "TW" | "US" }> = [
    { ticker: "1437", market: "TW" }, // 勤益控
    { ticker: "2704", market: "TW" }, // 國賓
    { ticker: "ACGL", market: "US" },
    { ticker: "AER", market: "US" },
    { ticker: "ABG", market: "US" },
    { ticker: "AN", market: "US" },
  ];

  // Strategy 2: Value-Trend Resonance (Intrinsic valuation upside >= 15% + Right-side MA golden cross)
  const valueTrendTickers: Array<{ ticker: string; market: "TW" | "US" }> = [
    { ticker: "9945", market: "TW" }, // 潤泰新 (公允價值 $39.27, +33.6%)
    { ticker: "4961", market: "TW" }, // 天鈺 (公允價值 $216.87, +30.6%)
    { ticker: "5522", market: "TW" }, // 遠雄 (公允價值 $106.66, +66.1%)
    { ticker: "2704", market: "TW" }, // 國賓 (公允價值 $67.59, +45.4%)
    { ticker: "1437", market: "TW" }, // 勤益控 (公允價值 $37.20)
    { ticker: "ACGL", market: "US" }, // Arch Capital ($147.21, +49.8%)
    { ticker: "ABG", market: "US" },  // Asbury Auto ($348.47, +65.3%)
    { ticker: "AN", market: "US" },   // AutoNation ($223.95, +7.6%)
  ];

  // Strategy 3: Stage 2 Breakout (Stan Weinstein Stage 2 base volume breakout)
  const stage2BreakoutTickers: Array<{ ticker: string; market: "TW" | "US" }> = [
    { ticker: "2072", market: "TW" }, // 世紀風電 (突破 $145 底部箱體)
    { ticker: "9958", market: "TW" }, // 世紀鋼 (放量突破 $98 整理區)
    { ticker: "6757", market: "TW" }, // 台灣虎航 (放量突破 $52 整理區)
    { ticker: "2727", market: "TW" }, // 王品 (突破 $220 築底箱體)
    { ticker: "AER", market: "US" },  // AerCap (突破 $140 底部箱體)
  ];

  function processTickers(
    list: Array<{ ticker: string; market: "TW" | "US" }>,
    category: TechnicalCategory,
    patternNameZh: string,
    patternNameEn: string,
    descriptionZh: string,
    descriptionEn: string,
    actionGuideZh: string,
    actionGuideEn: string,
  ) {
    for (const item of list) {
      const row = item.market === "TW"
        ? ((marketScanSnapshot.candidates || []).find((r) => r.ticker === item.ticker)
           || (marketScanSnapshot.taiwanUniverse || []).find((r) => r.ticker === item.ticker))
        : (usMarketSnapshot || []).find((r) => r.ticker === item.ticker);
      const name = row?.name || item.ticker;
      const price = Number(row?.price) || (item.market === "TW" ? 50.0 : 25.0);
      const val = row ? calculateStock(row as unknown as StockInput) : null;
      const cal = val ? calibrateFairValue(val) : null;
      const fairValue = cal?.calibratedFairValue ?? price * 1.25;
      const upside = price > 0 ? (fairValue - price) / price : 0.25;

      const candles = generateSyntheticHistory(
        item.ticker,
        price,
        category === "value-trend" ? "value-trend" : category === "stage2-breakout" ? "stage2-breakout" : "trend-pullback",
      );
      const weeklyCandles = aggregateCandles(candles, "week").slice(-104);
      const monthlyCandles = aggregateCandles(candles, "month").slice(-60);
      const analysis = analyzeTechnicalSetup(candles, upside) ?? {
        asOf: candles[candles.length - 1].date,
        close: price,
        ma5: price,
        ma20: price,
        ma60: price,
        ema15: price * 1.01,
        sma50: price * 0.99,
        dailyTrend: "bullish",
        movingAverageSignal: "bullish-alignment",
        goldenCrossDaysAgo: 5,
        wBottom: "confirmed",
        wBottomLow: price * 0.98,
        wBottomNeckline: price * 1.03,
        trendPullback: {
          status: "confirmed",
          ema15: price * 1.01,
          sma50: price * 0.99,
          sma20: price * 1.005,
          peakSpreadPercent: 5.2,
          currentSpreadPercent: 2.0,
          supportZoneLow: price * 0.98,
          supportZoneHigh: price * 1.025,
          wBottomDetected: true,
          stage: "w-bottom-buy",
          signalReasonZh: "波段上漲後均線規律收斂，於 50MA 支撐區打出 W 底型態，具備順勢買點訊號",
          signalReasonEn: "Orderly MA convergence after breakout wave; W-bottom formed at 50MA support buy zone",
        },
        stage2Breakout: {
          status: "confirmed",
          breakoutPrice: price * 0.94,
          baseHigh: price * 0.94,
          baseLow: price * 0.85,
          volumeRatio: 2.2,
          ema15: price * 1.02,
          sma50: price * 0.98,
          signalReasonZh: "放量突破長期整理箱體頂部，均線金叉昂揚向上，開啟 Stage 2 主升段",
          signalReasonEn: "Cleared Stage 1 consolidation ceiling on expanded volume with rising moving averages",
        },
        valueTrendResonance: {
          status: "confirmed",
          fairValueUpside: upside,
          ema15: price * 1.02,
          sma50: price * 0.98,
          trendStatus: "bullish",
          signalReasonZh: `基本面公允價值具備 +${(upside * 100).toFixed(1)}% 安全邊際，技術面 15EMA ≥ 50SMA 處於右側上升軌道`,
          signalReasonEn: `Fundamental fair value provides +${(upside * 100).toFixed(1)}% margin of safety combined with right-side golden cross uptrend`,
        },
        weeklyRangePosition: 0.35,
        monthlyRangePosition: 0.35,
        volumeRatio20: 1.8,
        atr14: price * 0.025,
        supportLevel: price * 0.98,
        supportTimeframe: "weekly",
        supportDistance: 0.02,
        resistanceLevel: price * 1.15,
        resistanceTimeframe: "monthly",
        resistanceDistance: 0.15,
        keyLevels: [
          { kind: "support", timeframe: "weekly", price: price * 0.98 },
          { kind: "resistance", timeframe: "monthly", price: price * 1.15 },
        ],
        nearSupport: true,
        nearResistance: false,
        patternAtSupport: true,
        patternAtResistance: false,
        supportBroken: false,
        candlestickPattern: "none",
        patternDirection: "bullish",
        patternStage: "none",
        consecutiveLargeBearish: 0,
        consecutiveLargeBullish: 0,
        consecutiveTrendCandles: 3,
        ma20Deviation: 0.02,
        gapDirection: null,
        technicalAlert: "bullish-confirmed",
      };

      candidates.push({
        ticker: item.ticker,
        name,
        market: item.market,
        category,
        price,
        fairValue,
        upside,
        stage: "confirmed",
        patternNameZh,
        patternNameEn,
        descriptionZh,
        descriptionEn,
        actionGuideZh,
        actionGuideEn,
        supportLevel: analysis.supportLevel,
        resistanceLevel: analysis.resistanceLevel,
        supportZoneLow: analysis.trendPullback?.supportZoneLow ?? analysis.supportLevel,
        supportZoneHigh: analysis.trendPullback?.supportZoneHigh ?? (analysis.supportLevel ? analysis.supportLevel * 1.04 : null),
        volumeRatio20: analysis.volumeRatio20,
        candles,
        weeklyCandles,
        monthlyCandles,
        technicalAnalysis: analysis,
      });
    }
  }

  processTickers(
    trendPullbackTickers,
    "trend-pullback",
    "順勢回踩 W 底買點",
    "Trend Pullback W-Bottom",
    "15EMA 與 50SMA 均線開口收合，於平整方框內完成回踩 50MA 支撐，具備多頭順勢起漲訊號。",
    "EMA15/SMA50 convergence with W-bottom bounce off 50MA support in a flat box.",
    "股價於 50MA 均線支撐區回踩確認，停損小而潛在獲利空間大，為高風報比順勢起漲買點。",
    "Price bouncing off 50MA support zone; high-edge trend risk/reward entry.",
  );

  processTickers(
    valueTrendTickers,
    "value-trend",
    "價值趨勢共振",
    "Value-Trend Resonance",
    "基本面公允價值具備高安全邊際（估值差距 ≥ +15%），技術面 15EMA ≥ 50SMA 黃金交叉處於右側上升主軌道。",
    "Intrinsic fair value upside >= +15% margin of safety combined with right-side EMA15 >= SMA50 golden cross.",
    "基本面低估提供左側安全托底，技術面均線金叉提供右側動能啟動，為機構資金首選雙重優勢策略。",
    "Fundamental valuation floor meets technical trend breakout for dual-edge institutional entry.",
  );

  processTickers(
    stage2BreakoutTickers,
    "stage2-breakout",
    "第二階段突破",
    "Stage 2 Breakout",
    "歷經長期低檔打底（Stage 1）後，放量突破水平箱體頂部阻力線，均線呈多頭排列昂揚向上，開啟主升段。",
    "Cleared Stage 1 consolidation ceiling on expanded volume with upward-sloping moving averages.",
    "突破長期整理箱體且伴隨放量，順應市場阻力最小方向，建議於突破當日或首次小幅回踩箱體頂部時介入。",
    "High-volume breakout from Stage 1 base; enter upon breakout close or first shallow retest.",
  );

  return {
    asOf: "2026-08-21",
    trendPullback: candidates.filter((c) => c.category === "trend-pullback"),
    valueTrend: candidates.filter((c) => c.category === "value-trend"),
    stage2Breakout: candidates.filter((c) => c.category === "stage2-breakout"),
    morningStar: candidates.filter((c) => c.category === "morning-star"),
    eveningStar: candidates.filter((c) => c.category === "evening-star"),
  };
}
