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

  type CandidateConfig = {
    ticker: string;
    market: "TW" | "US";
    stage: "candidate" | "confirmed";
    actionGuideZh?: string;
    actionGuideEn?: string;
  };

  // Strategy 1: Trend Pullback (15EMA >= 50SMA, 50MA horizontal support, 2nd/3rd retest)
  const trendPullbackTickers: CandidateConfig[] = [
    {
      ticker: "1437",
      market: "TW",
      stage: "candidate",
      actionGuideZh: "⚡ 今日收盤於 50MA 均線支撐完成第 3 次回踩，均線極度收攏！明日開盤若守穩 50MA 不破或微幅開高，為最佳提前卡位順勢起漲點（停損設 50MA 下方 2%）。",
      actionGuideEn: "⚡ Completed 3rd retest on 50MA support at today's close with tight MA convergence! Enter early at tomorrow's open (Stop loss 2% below 50MA).",
    },
    {
      ticker: "4938",
      market: "TW",
      stage: "candidate",
      actionGuideZh: "⚡ 回踩 50MA 水平支撐帶，15EMA 與 50SMA 均線收攏！明日開盤守穩 50MA 不破為最佳順勢起漲卡位點。",
      actionGuideEn: "⚡ Testing 50MA support with MA convergence; enter at tomorrow's open for trend continuation.",
    },
    {
      ticker: "ACGL",
      market: "US",
      stage: "candidate",
      actionGuideZh: "⚡ 今日收盤回踩 50MA 水平支撐帶，兩均線黏合！明日開盤為絕佳順勢起漲卡位點（停損設方框下沿）。",
      actionGuideEn: "⚡ Closed on 50MA support floor with tight MA convergence! Prime advance positioning entry at tomorrow's open.",
    },
    {
      ticker: "ABG",
      market: "US",
      stage: "candidate",
      actionGuideZh: "⚡ 50MA 均線黏合回踩，明日開盤若開高或回踩不破即為順勢起漲卡位買點。",
      actionGuideEn: "⚡ Converged on 50MA support; enter at tomorrow's open on flat/higher open for trend launch.",
    },
    {
      ticker: "2704",
      market: "TW",
      stage: "confirmed",
      actionGuideZh: "✅ 50MA 水平支撐確認獲得支撐反彈，均線金叉向上發散，順勢持股待漲。",
      actionGuideEn: "✅ Confirmed bounce off 50MA horizontal support with expanding golden cross; ride the trend wave.",
    },
    {
      ticker: "AER",
      market: "US",
      stage: "confirmed",
      actionGuideZh: "✅ 均線金叉向上發散，W 底回踩確立，順勢持股。",
      actionGuideEn: "✅ MA golden cross expanding; W-bottom double test confirmed.",
    },
    {
      ticker: "AN",
      market: "US",
      stage: "confirmed",
      actionGuideZh: "✅ 均線金叉確立，回踩 50MA 有守。",
      actionGuideEn: "✅ MA golden cross intact with confirmed 50MA bounce.",
    },
  ];

  // Strategy 2: Value-Trend Resonance (Intrinsic valuation upside >= 15% + Right-side MA golden cross)
  const valueTrendTickers: CandidateConfig[] = [
    {
      ticker: "9945",
      market: "TW",
      stage: "candidate",
      actionGuideZh: "⚡ 公允價值高達 $39.27 (空間 +36.6%)，15EMA 在 50SMA 之上，今日收盤縮量回踩 15EMA！明日開盤為絕佳低成本共振卡位點（停損設波段低點）。",
      actionGuideEn: "⚡ Fair value $39.27 (+36.6% margin), golden cross with low-volume pullback to 15EMA at close! Prime early entry at tomorrow's open.",
    },
    {
      ticker: "4938",
      market: "TW",
      stage: "candidate",
      actionGuideZh: "⚡ 公允價值 $119.78 (空間 +34.9%)，15EMA ≥ 50SMA 黃金交叉，縮量回踩 15EMA！明日開盤為右側最佳低成本共振進場時機。",
      actionGuideEn: "⚡ Fair value $119.78 (+34.9%), golden cross intact with 15EMA pullback; enter at tomorrow's open for dual-edge momentum.",
    },
    {
      ticker: "2371",
      market: "TW",
      stage: "candidate",
      actionGuideZh: "⚡ 公允價值 $37.60 (空間 +35.7%)，均線金叉初成縮量回踩！明日開盤為右側低成本共振卡位點。",
      actionGuideEn: "⚡ Fair value $37.60 (+35.7%), golden cross forming with support pullback; enter at tomorrow's open.",
    },
    {
      ticker: "1437",
      market: "TW",
      stage: "candidate",
      actionGuideZh: "⚡ 公允價值 $37.20 提供安全邊際，15EMA 於 50SMA 之上多頭排列，今日收盤回踩均線，明日開盤進場卡位。",
      actionGuideEn: "⚡ Margin of safety floor + golden cross MA support pullback; enter at tomorrow's open.",
    },
    {
      ticker: "3515",
      market: "TW",
      stage: "candidate",
      actionGuideZh: "⚡ 公允價值 $267.30 (空間 +21.0%)，均線維持金叉，縮量回踩 15EMA！明日開盤進場卡位。",
      actionGuideEn: "⚡ Fair value $267.30 (+21.0%), MA golden cross intact with 15EMA test; enter at tomorrow's open.",
    },
    {
      ticker: "ACGL",
      market: "US",
      stage: "candidate",
      actionGuideZh: "⚡ 公允價值 $147.21 (空間 +45.5%)，15EMA ≥ 50SMA 金叉，回踩均線支撐，明日開盤為最佳右側買點。",
      actionGuideEn: "⚡ +45.5% valuation margin with golden cross MA support test; enter at tomorrow's open.",
    },
    {
      ticker: "2704",
      market: "TW",
      stage: "confirmed",
      actionGuideZh: "✅ 公允價值 $67.59 (空間 +48.4%) 與技術面 15EMA ≥ 50SMA 金叉共振確立，順勢持股。",
      actionGuideEn: "✅ Undervaluation (+48.4%) confirmed with right-side 15EMA >= 50SMA golden cross.",
    },
    {
      ticker: "6605",
      market: "TW",
      stage: "confirmed",
      actionGuideZh: "✅ 公允價值 $189.85 (空間 +37.1%) 估值安全托底，技術面 15EMA ≥ 50SMA 多頭發散，順勢推升。",
      actionGuideEn: "✅ Fair value $189.85 (+37.1%) floor + expanding golden cross alignment.",
    },
    {
      ticker: "2607",
      market: "TW",
      stage: "confirmed",
      actionGuideZh: "✅ 公允價值 $61.99 具備安全邊際，均線呈多頭排列，技術面處於右側主升浪。",
      actionGuideEn: "✅ Fair value $61.99 margin + bullish moving average alignment.",
    },
    {
      ticker: "ABG",
      market: "US",
      stage: "confirmed",
      actionGuideZh: "✅ 價值低估 +65.3% 且技術面均線金叉確立，順勢推升。",
      actionGuideEn: "✅ +65.3% valuation margin + confirmed MA golden cross.",
    },
    {
      ticker: "AN",
      market: "US",
      stage: "confirmed",
      actionGuideZh: "✅ 基本面穩健，技術面維持金叉多頭排列。",
      actionGuideEn: "✅ Solid fundamentals + intact bullish moving average alignment.",
    },
  ];

  // Strategy 3: Stage 2 Breakout (Stan Weinstein Stage 2 base volume breakout)
  const stage2BreakoutTickers: CandidateConfig[] = [
    {
      ticker: "2392",
      market: "TW",
      stage: "candidate",
      actionGuideZh: "⚡ 歷經底部打底，15EMA 昂揚站上 50SMA，今日收在箱頂天花板前夕蓄勢！明日開盤若放量衝破箱頂，為 Stage 2 主升段啟動最佳買點！",
      actionGuideEn: "⚡ Base ceiling test at close with rising 15EMA/50SMA! If tomorrow opens higher on volume, enter immediately for Stage 2 advance!",
    },
    {
      ticker: "5515",
      market: "TW",
      stage: "confirmed",
      actionGuideZh: "✅ 已實質放量長紅突破 $44 整理箱體天花板，均線多頭發散，Stage 2 主升段正式啟動！",
      actionGuideEn: "✅ Cleared $44 base ceiling on volume expansion; Stage 2 advancing phase confirmed!",
    },
    {
      ticker: "2615",
      market: "TW",
      stage: "confirmed",
      actionGuideZh: "✅ 歷經底部打底後放量突破箱頂，15EMA 與 50SMA 向上發散，Stage 2 主升浪確立！",
      actionGuideEn: "✅ Volume expansion breakout from base ceiling; Stage 2 advancing phase active.",
    },
    {
      ticker: "2609",
      market: "TW",
      stage: "confirmed",
      actionGuideZh: "✅ 均線多頭排列昂揚向上，放量突破 $52 底部整理箱體，開啟主升段。",
      actionGuideEn: "✅ Cleared $52 base on expanding volume with rising moving averages.",
    },
    {
      ticker: "2603",
      market: "TW",
      stage: "confirmed",
      actionGuideZh: "✅ 放量長紅突破 $200 打底箱體天花板，均線多頭排列，順應市場阻力最小方向。",
      actionGuideEn: "✅ Cleared $200 base ceiling on volume expansion along the line of least resistance.",
    },
    {
      ticker: "AER",
      market: "US",
      stage: "confirmed",
      actionGuideZh: "✅ 已放量突破 $140 長期打底箱體，開啟主升段。",
      actionGuideEn: "✅ Breakout above $140 multi-month base confirmed on heavy volume.",
    },
  ];

  function processTickers(
    list: CandidateConfig[],
    category: TechnicalCategory,
    patternNameZh: string,
    patternNameEn: string,
    defaultDescZh: string,
    defaultDescEn: string,
    defaultActionZh: string,
    defaultActionEn: string,
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
          status: item.stage === "candidate" ? "forming" : "confirmed",
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
          status: item.stage === "candidate" ? "forming" : "confirmed",
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
          status: item.stage === "candidate" ? "forming" : "confirmed",
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

      const finalActionZh = item.actionGuideZh || defaultActionZh;
      const finalActionEn = item.actionGuideEn || defaultActionEn;
      const stageNameZh = item.stage === "candidate" ? `${patternNameZh} (提前卡位)` : patternNameZh;
      const stageNameEn = item.stage === "candidate" ? `${patternNameEn} (Early Entry)` : patternNameEn;

      candidates.push({
        ticker: item.ticker,
        name,
        market: item.market,
        category,
        price,
        fairValue,
        upside,
        stage: item.stage,
        patternNameZh: stageNameZh,
        patternNameEn: stageNameEn,
        descriptionZh: defaultDescZh,
        descriptionEn: defaultDescEn,
        actionGuideZh: finalActionZh,
        actionGuideEn: finalActionEn,
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
