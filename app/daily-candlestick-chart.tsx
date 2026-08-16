"use client";

import { useEffect, useRef, useState } from "react";
import type { CorporateAction, DailyCandle } from "../lib/price-history";
import type { CandlestickPattern, TechnicalAnalysis } from "../lib/technical-analysis";
import { EChartsCandlestickChart } from "./echarts-candlestick-chart";
import type { Language } from "./language-context";

type Props = { ticker: string; market: "TW" | "US"; language: Language };
type ChartTimeframe = "daily" | "weekly" | "monthly";
type ChartResult = {
  requestUrl: string;
  yahooSymbol: string;
  tradingViewSymbol: string;
  candles: DailyCandle[];
  weeklyCandles: DailyCandle[];
  monthlyCandles: DailyCandle[];
  corporateActions: CorporateAction[];
  technicalAnalysis: TechnicalAnalysis | null;
  state: "ready" | "empty";
};

function TradingViewChart({ symbol, language }: { symbol: string; language: Language }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.replaceChildren();

    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.height = "100%";
    widget.style.width = "100%";

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.textContent = JSON.stringify({
      autosize: true,
      symbol,
      interval: "D",
      timezone: "Asia/Taipei",
      theme: "light",
      backgroundColor: "#fbfcfb",
      gridColor: "rgba(19, 43, 45, 0.06)",
      style: "1",
      locale: language === "zh" ? "zh_TW" : "en",
      hide_side_toolbar: true,
      hide_top_toolbar: false,
      hide_legend: false,
      hide_volume: false,
      withdateranges: true,
      allow_symbol_change: false,
      save_image: false,
      calendar: false,
      support_host: "https://www.tradingview.com",
    });

    container.append(widget, script);
    return () => container.replaceChildren();
  }, [language, symbol]);

  return <div ref={containerRef} className="tradingview-widget-container public-chart-widget" />;
}

function formatIndicator(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toFixed(value >= 100 ? 1 : 2);
}

function candlestickLabel(pattern: CandlestickPattern, language: Language) {
  const labels: Record<CandlestickPattern, readonly [string, string]> = {
    "morning-star": ["早晨之星", "Morning star"],
    "evening-star": ["黃昏之星", "Evening star"],
    "bullish-engulfing": ["多頭吞噬", "Bullish engulfing"],
    "bearish-engulfing": ["空頭吞噬", "Bearish engulfing"],
    "morning-star-candidate": ["早晨之星候選", "Morning-star candidate"],
    "evening-star-candidate": ["黃昏之星候選", "Evening-star candidate"],
    hammer: ["錘子線候選", "Hammer candidate"],
    "shooting-star": ["流星線候選", "Shooting-star candidate"],
    doji: ["十字星", "Doji"],
    none: ["尚無明確反轉型態", "No clear reversal pattern"],
  };
  return labels[pattern][language === "zh" ? 0 : 1];
}

function timeframeLabel(timeframe: "daily" | "weekly" | "monthly" | null, language: Language) {
  if (timeframe === "daily") return language === "zh" ? "日線" : "daily";
  if (timeframe === "weekly") return language === "zh" ? "週線" : "weekly";
  if (timeframe === "monthly") return language === "zh" ? "月線" : "monthly";
  return language === "zh" ? "主要" : "major";
}

function TechnicalAnalysisPanel({ analysis, language }: { analysis: TechnicalAnalysis; language: Language }) {
  const movingAverageTitle = analysis.movingAverageSignal === "recent-golden-cross"
    ? (language === "zh" ? "近期黃金交叉" : "Recent golden cross")
    : analysis.movingAverageSignal === "bullish-alignment"
      ? (language === "zh" ? "均線多頭排列" : "Bullish MA alignment")
      : analysis.movingAverageSignal === "bearish"
        ? (language === "zh" ? "短線均線偏弱" : "Short MAs weakening")
        : (language === "zh" ? "均線仍在整理" : "Mixed moving averages");
  const movingAverageTone = analysis.movingAverageSignal === "recent-golden-cross" || analysis.movingAverageSignal === "bullish-alignment"
    ? "positive"
    : analysis.movingAverageSignal === "bearish" ? "caution" : "neutral";
  const wTitle = analysis.wBottom === "confirmed"
    ? (language === "zh" ? "疑似 W 底已突破" : "Possible W-bottom breakout")
    : analysis.wBottom === "forming"
      ? (language === "zh" ? "疑似 W 底成形中" : "Possible W-bottom forming")
      : (language === "zh" ? "尚未確認 W 底" : "No confirmed W-bottom");
  const weeklyPosition = analysis.weeklyRangePosition === null ? null : Math.round(analysis.weeklyRangePosition * 100);
  const monthlyPosition = analysis.monthlyRangePosition === null ? null : Math.round(analysis.monthlyRangePosition * 100);
  const positionText = (value: number | null, periodZh: string, periodEn: string) => value === null
    ? (language === "zh" ? "資料不足" : "Insufficient data")
    : language === "zh"
      ? `${periodZh}價格區間第 ${value}% 位置${value <= 35 ? "，仍在相對低檔" : value >= 70 ? "，已接近相對高檔" : "，位於中段"}`
      : `${value}% of the ${periodEn} range${value <= 35 ? "; still relatively low" : value >= 70 ? "; near the upper range" : "; mid-range"}`;
  const alertTone = analysis.technicalAlert === "bullish-confirmed" ? "positive"
    : analysis.technicalAlert === "bullish-candidate" || analysis.technicalAlert === "near-support" ? "watch"
      : analysis.technicalAlert === "bearish-confirmed" || analysis.technicalAlert === "bearish-candidate" || analysis.technicalAlert === "support-broken" ? "caution"
        : "neutral";
  const genericAlertTitle = language === "zh"
    ? ({
      "bullish-confirmed": "↗ 反轉型態確認",
      "bullish-candidate": "反轉候選，下一根 K 線待確認",
      "bearish-confirmed": "↘ 高檔轉弱型態確認",
      "bearish-candidate": "高檔轉弱候選",
      "near-support": "接近主要支撐，觀察反轉",
      "near-resistance": "接近主要壓力，避免追價",
      "support-broken": "↘ 主要支撐失效",
      neutral: "尚無高優先技術提示",
    } as const)[analysis.technicalAlert]
    : ({
      "bullish-confirmed": "↗ Reversal pattern confirmed",
      "bullish-candidate": "Reversal candidate; next candle required",
      "bearish-confirmed": "↘ Bearish reversal confirmed",
      "bearish-candidate": "Bearish reversal candidate",
      "near-support": "Near major support; watch for reversal",
      "near-resistance": "Near major resistance; avoid chasing",
      "support-broken": "↘ Major support invalidated",
      neutral: "No high-priority technical alert",
    } as const)[analysis.technicalAlert];
  const alertTitle = analysis.technicalAlert === "bullish-candidate" && analysis.candlestickPattern === "morning-star-candidate"
    ? (language === "zh" ? "早晨之星可能形成，等待第三根紅 K 確認" : "Morning star may be forming; await the third bullish candle")
    : analysis.technicalAlert === "bearish-candidate" && analysis.candlestickPattern === "evening-star-candidate"
      ? (language === "zh" ? "黃昏之星可能形成，等待第三根綠 K 確認" : "Evening star may be forming; await the third bearish candle")
      : genericAlertTitle;
  const supportText = analysis.supportLevel === null
    ? (language === "zh" ? "支撐資料不足" : "Support unavailable")
    : `${timeframeLabel(analysis.supportTimeframe, language)}${language === "zh" ? "支撐" : " support"} ${formatIndicator(analysis.supportLevel)}${analysis.supportDistance === null ? "" : ` · ${Math.abs(analysis.supportDistance * 100).toFixed(1)}%`}`;
  const resistanceText = analysis.resistanceLevel === null
    ? (language === "zh" ? "壓力資料不足" : "Resistance unavailable")
    : `${timeframeLabel(analysis.resistanceTimeframe, language)}${language === "zh" ? "壓力" : " resistance"} ${formatIndicator(analysis.resistanceLevel)}${analysis.resistanceDistance === null ? "" : ` · ${Math.abs(analysis.resistanceDistance * 100).toFixed(1)}%`}`;
  const ma20Deviation = analysis.ma20Deviation === null ? null : `${analysis.ma20Deviation >= 0 ? "+" : ""}${(analysis.ma20Deviation * 100).toFixed(1)}%`;
  const gapText = analysis.gapDirection === null
    ? (language === "zh" ? "未出現明顯跳空" : "no clear gap")
    : language === "zh"
      ? `伴隨向${analysis.gapDirection === "down" ? "下" : "上"}跳空`
      : `${analysis.gapDirection === "down" ? "down" : "up"} gap present`;
  const patternDetail = language === "zh"
    ? analysis.candlestickPattern === "morning-star-candidate"
      ? `連跌 ${analysis.consecutiveTrendCandles} 根、${analysis.consecutiveLargeBearish || 1} 根大陰線後出現十字 K，距 MA20 ${ma20Deviation ?? "—"}，${analysis.patternAtSupport ? "位於主要支撐" : "尚未貼近主要支撐"}，${gapText}；等待紅 K 收復首根陰線中點`
      : analysis.candlestickPattern === "evening-star-candidate"
        ? `連漲 ${analysis.consecutiveTrendCandles} 根、${analysis.consecutiveLargeBullish || 1} 根大陽線後出現十字 K，距 MA20 ${ma20Deviation ?? "—"}，${analysis.patternAtResistance ? "位於主要壓力" : "尚未貼近主要壓力"}，${gapText}；等待綠 K 跌破確認`
        : analysis.candlestickPattern === "hammer"
          ? "長下影顯示低檔承接，仍需下一根紅 K 突破錘子線高點"
          : analysis.candlestickPattern === "shooting-star"
            ? "長上影顯示高檔賣壓，仍需下一根綠 K 跌破流星線低點"
            : analysis.candlestickPattern === "doji"
              ? "十字星只代表多空暫時平衡，需等待下一根 K 線確認"
              : analysis.patternStage === "confirmed"
                ? `已完成 ${candlestickLabel(analysis.candlestickPattern, language)}；仍需搭配位置與量能判讀`
                : "規則尚未找到早晨／黃昏之星、吞噬、錘子或流星線"
    : analysis.candlestickPattern === "morning-star-candidate"
      ? `${analysis.consecutiveTrendCandles} declining candles and ${analysis.consecutiveLargeBearish || 1} large bearish candle(s), followed by a doji ${ma20Deviation ? `${ma20Deviation} from MA20` : "far from MA20"}; ${analysis.patternAtSupport ? "at major support" : "not yet at major support"}, ${gapText}; await a bullish close through the first candle midpoint`
      : analysis.candlestickPattern === "evening-star-candidate"
        ? `${analysis.consecutiveTrendCandles} advancing candles and ${analysis.consecutiveLargeBullish || 1} large bullish candle(s), followed by a doji ${ma20Deviation ? `${ma20Deviation} from MA20` : "far from MA20"}; ${analysis.patternAtResistance ? "at major resistance" : "not yet at major resistance"}, ${gapText}; await a bearish confirmation`
        : analysis.candlestickPattern === "hammer"
          ? "Long lower shadow shows demand; confirmation above the hammer high is still required"
          : analysis.candlestickPattern === "shooting-star"
            ? "Long upper shadow shows supply; confirmation below the shooting-star low is still required"
            : analysis.candlestickPattern === "doji"
              ? "A doji shows temporary balance, not a reversal without the next candle"
              : analysis.patternStage === "confirmed"
                ? `${candlestickLabel(analysis.candlestickPattern, language)} completed; location and volume still matter`
                : "No morning/evening star, engulfing, hammer, or shooting-star setup detected";

  return <div className="technical-analysis-panel" role="note">
    <div className="technical-analysis-heading">
      <div><strong>{language === "zh" ? "規則式技術提示" : "Rule-based technical signals"}</strong><span>{language === "zh" ? `資料截至 ${analysis.asOf}` : `Data through ${analysis.asOf}`}</span></div>
      <small>{language === "zh" ? "只提示型態，不是買賣建議" : "Pattern hints, not trading advice"}</small>
    </div>
    <div className={`technical-alert-banner ${alertTone}`}><span>{language === "zh" ? "多週期技術提醒" : "Multi-timeframe alert"}</span><strong>{alertTitle}</strong><small>{supportText} · {resistanceText}</small></div>
    <div className="technical-analysis-grid">
      <div className={`technical-signal ${movingAverageTone}`}><span>{language === "zh" ? "日線均線" : "Daily averages"}</span><strong>{movingAverageTitle}</strong><small>MA5 {formatIndicator(analysis.ma5)} · MA20 {formatIndicator(analysis.ma20)} · MA60 {formatIndicator(analysis.ma60)}{analysis.volumeRatio20 !== null ? ` · ${language === "zh" ? "量能" : "Volume"} ${analysis.volumeRatio20.toFixed(1)}x` : ""}</small></div>
      <div className={`technical-signal ${analysis.wBottom === "confirmed" ? "positive" : analysis.wBottom === "forming" ? "neutral" : "muted"}`}><span>{language === "zh" ? "日線型態" : "Daily pattern"}</span><strong>{wTitle}</strong><small>{analysis.wBottomNeckline !== null ? `${language === "zh" ? "頸線約" : "Neckline near"} ${formatIndicator(analysis.wBottomNeckline)} · ${language === "zh" ? "雙低約" : "Twin lows near"} ${formatIndicator(analysis.wBottomLow)}` : (language === "zh" ? "規則尚未找到兩個接近低點與有效頸線" : "No two comparable lows and valid neckline detected")}</small></div>
      <div className={`technical-signal ${weeklyPosition !== null && weeklyPosition <= 35 ? "positive" : "neutral"}`}><span>{language === "zh" ? "週線位置" : "Weekly position"}</span><strong>{weeklyPosition === null ? "—" : `${weeklyPosition}%`}</strong><small>{positionText(weeklyPosition, "近 52 週", "52-week")}</small></div>
      <div className={`technical-signal ${monthlyPosition !== null && monthlyPosition <= 35 ? "positive" : monthlyPosition !== null && monthlyPosition >= 70 ? "caution" : "neutral"}`}><span>{language === "zh" ? "月線位置" : "Monthly position"}</span><strong>{monthlyPosition === null ? "—" : `${monthlyPosition}%`}</strong><small>{positionText(monthlyPosition, "近 36 個月", "36-month")}</small></div>
      <div className={`technical-signal ${analysis.nearSupport ? "watch" : analysis.nearResistance || analysis.supportBroken ? "caution" : "neutral"}`}><span>{language === "zh" ? "週／月關鍵位置" : "Weekly/monthly levels"}</span><strong>{analysis.nearSupport ? (language === "zh" ? "接近支撐" : "Near support") : analysis.nearResistance ? (language === "zh" ? "接近壓力" : "Near resistance") : (language === "zh" ? "未貼近主要位置" : "Away from major levels")}</strong><small>{supportText} · {resistanceText}{analysis.atr14 === null ? "" : ` · ATR14 ${formatIndicator(analysis.atr14)}`}</small></div>
      <div className={`technical-signal ${analysis.patternDirection === "bullish" ? (analysis.patternStage === "confirmed" ? "positive" : "watch") : analysis.patternDirection === "bearish" ? "caution" : "neutral"}`}><span>{language === "zh" ? "日線反轉型態" : "Daily reversal pattern"}</span><strong>{candlestickLabel(analysis.candlestickPattern, language)}</strong><small>{patternDetail}</small></div>
    </div>
  </div>;
}

export function DailyCandlestickChart({ ticker, market, language }: Props) {
  const requestUrl = `/api/price-history?ticker=${encodeURIComponent(ticker)}&market=${market}`;
  const [result, setResult] = useState<ChartResult | null>(null);
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("daily");
  const currentResult = result?.requestUrl === requestUrl ? result : null;
  const state = currentResult?.state ?? "loading";

  useEffect(() => {
    const controller = new AbortController();
    void fetch(requestUrl, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { symbol?: string; tradingViewSymbol?: string; candles?: DailyCandle[]; weeklyCandles?: DailyCandle[]; monthlyCandles?: DailyCandle[]; corporateActions?: CorporateAction[]; technicalAnalysis?: TechnicalAnalysis | null };
        const yahooSymbol = String(payload.symbol ?? "").trim();
        const tradingViewSymbol = String(payload.tradingViewSymbol ?? "").trim();
        const candles = Array.isArray(payload.candles) ? payload.candles : [];
        setResult({
          requestUrl,
          yahooSymbol,
          tradingViewSymbol,
          candles,
          weeklyCandles: Array.isArray(payload.weeklyCandles) ? payload.weeklyCandles : [],
          monthlyCandles: Array.isArray(payload.monthlyCandles) ? payload.monthlyCandles : [],
          corporateActions: Array.isArray(payload.corporateActions) ? payload.corporateActions : [],
          technicalAnalysis: payload.technicalAnalysis ?? null,
          state: response.ok && yahooSymbol && (market === "TW" ? candles.length >= 20 : Boolean(tradingViewSymbol)) ? "ready" : "empty",
        });
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setResult({ requestUrl, yahooSymbol: "", tradingViewSymbol: "", candles: [], weeklyCandles: [], monthlyCandles: [], corporateActions: [], technicalAnalysis: null, state: "empty" });
        }
      });
    return () => controller.abort();
  }, [market, requestUrl]);

  const chartSymbol = currentResult?.tradingViewSymbol ?? "";
  const yahooSymbol = currentResult?.yahooSymbol ?? (market === "TW" ? `${ticker}.TW` : ticker);
  const tradingViewHref = chartSymbol
    ? `https://www.tradingview.com/symbols/${chartSymbol.replace(":", "-")}/`
    : "https://www.tradingview.com/";
  const yahooHref = `https://finance.yahoo.com/quote/${encodeURIComponent(yahooSymbol)}/chart/`;
  const corporateActions = currentResult?.corporateActions ?? [];
  const candles = timeframe === "weekly"
    ? currentResult?.weeklyCandles ?? []
    : timeframe === "monthly"
      ? currentResult?.monthlyCandles ?? []
      : currentResult?.candles ?? [];
  const technicalAnalysis = currentResult?.technicalAnalysis ?? null;

  return (
    <section className="detail-section price-chart-section" aria-label={language === "zh" ? `${ticker} 公開 K 線` : `${ticker} public candlestick chart`}>
      <div className="detail-section-title chart-title-row">
        <div>
          <h3>{language === "zh" ? "公開技術 K 線" : "Public Technical Chart"}</h3>
          <span>{market === "TW" ? (language === "zh" ? "Yahoo Finance 公開資料 · Apache ECharts 日／週／月 K 線、趨勢線與通道" : "Yahoo Finance public data · Apache ECharts daily, weekly, monthly candles, trendlines, and channels") : (language === "zh" ? "TradingView · 可切換日／週／月與技術指標" : "TradingView · switch daily, weekly, monthly, and technical indicators")}</span>
        </div>
        <a href={yahooHref} target="_blank" rel="noopener noreferrer">{language === "zh" ? "Yahoo Finance ↗" : "Yahoo Finance ↗"}</a>
      </div>
      {corporateActions.length > 0 && <div className="corporate-action-warning" role="note">
        <strong>{language === "zh" ? "⚠ 除權／股本變動警示" : "⚠ Corporate action warning"}</strong>
        <p>{language === "zh"
          ? `近年偵測到 ${corporateActions.map((action) => action.type === "stock-distribution"
            ? `${action.date} 股票股利／除權 ${action.ratio.toFixed(2)}x（股數約增加 ${((action.ratio - 1) * 100).toFixed(0)}%）`
            : `${action.date} 股本調整 ${action.ratio.toFixed(2)}x`).join("；")}。K 線跳空可能是價格機械調整，不應直接視為基本面崩跌。此警示不改動公允價值。`
          : `Detected: ${corporateActions.map((action) => `${action.date} ${action.type === "stock-distribution" ? "stock distribution" : "capital adjustment"} ${action.ratio.toFixed(2)}x`).join("; ")}. Chart gaps may reflect mechanical price adjustments rather than a fundamental collapse. This warning does not change fair value.`}</p>
      </div>}
      {technicalAnalysis && <TechnicalAnalysisPanel analysis={technicalAnalysis} language={language} />}
      {state === "loading" && <div className="chart-state">{language === "zh" ? "正在載入公開 K 線…" : "Loading public chart…"}</div>}
      {state === "empty" && <div className="chart-state">{language === "zh" ? "目前無法載入公開 K 線，估值資料不受影響" : "The public chart is unavailable; valuation is unaffected"}</div>}
      {state === "ready" && market === "TW" && <div className="chart-timeframe-switch" role="group" aria-label={language === "zh" ? "K 線週期" : "Chart timeframe"}>
        {(["daily", "weekly", "monthly"] as const).map((option) => <button key={option} type="button" className={timeframe === option ? "active" : ""} aria-pressed={timeframe === option} onClick={() => setTimeframe(option)}>{timeframeLabel(option, language)}</button>)}
      </div>}
      {state === "ready" && (market === "TW" ? <EChartsCandlestickChart candles={candles} ticker={ticker} language={language} analysis={technicalAnalysis} timeframe={timeframe} /> : <TradingViewChart symbol={chartSymbol} language={language} />)}
      <p className="chart-footnote">
        {language === "zh" ? "外部圖表僅供技術型態判讀，不納入公允價值計算。" : "The external chart is for technical review only and is not included in fair-value calculations."}{" "}
        {market === "TW" ? <a href={yahooHref} target="_blank" rel="noopener nofollow noreferrer">{ticker} {language === "zh" ? "行情資料由 Yahoo Finance 提供" : "market data by Yahoo Finance"}</a> : <a href={tradingViewHref} target="_blank" rel="noopener nofollow noreferrer">{ticker} {language === "zh" ? "圖表由 TradingView 提供" : "chart by TradingView"}</a>}
      </p>
    </section>
  );
}
