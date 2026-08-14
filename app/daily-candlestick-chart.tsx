"use client";

import { useEffect, useRef, useState } from "react";
import type { CorporateAction, DailyCandle } from "../lib/price-history";
import type { TechnicalAnalysis } from "../lib/technical-analysis";
import type { Language } from "./language-context";

type Props = { ticker: string; market: "TW" | "US"; language: Language };
type ChartResult = {
  requestUrl: string;
  yahooSymbol: string;
  tradingViewSymbol: string;
  candles: DailyCandle[];
  corporateActions: CorporateAction[];
  technicalAnalysis: TechnicalAnalysis | null;
  state: "ready" | "empty";
};

function movingAverage(candles: DailyCandle[], period: number) {
  return candles.map((_, index) => {
    if (index + 1 < period) return null;
    const window = candles.slice(index + 1 - period, index + 1);
    return window.reduce((sum, candle) => sum + candle.close, 0) / period;
  });
}

function YahooCandlestickChart({ candles, ticker, language }: { candles: DailyCandle[]; ticker: string; language: Language }) {
  const left = 42;
  const right = 932;
  const priceTop = 30;
  const priceBottom = 670;
  const volumeTop = 710;
  const volumeBottom = 850;
  const ma5 = movingAverage(candles, 5);
  const ma20 = movingAverage(candles, 20);
  const ma60 = movingAverage(candles, 60);
  const prices = candles.flatMap((candle) => [candle.low, candle.high]);
  const rawLow = Math.min(...prices);
  const rawHigh = Math.max(...prices);
  const padding = Math.max((rawHigh - rawLow) * 0.06, rawHigh * 0.01);
  const low = rawLow - padding;
  const high = rawHigh + padding;
  const priceRange = Math.max(high - low, 1);
  const maxVolume = Math.max(...candles.map((candle) => candle.volume), 1);
  const x = (index: number) => left + index * (right - left) / Math.max(candles.length - 1, 1);
  const y = (value: number) => priceTop + (high - value) / priceRange * (priceBottom - priceTop);
  const bodyWidth = Math.max(2, Math.min(5, (right - left) / candles.length * 0.58));
  const linePoints = (values: Array<number | null>) => values.flatMap((value, index) => value === null ? [] : [`${x(index)},${y(value)}`]).join(" ");
  const gridValues = Array.from({ length: 6 }, (_, index) => high - index * priceRange / 5);
  const labelIndexes = Array.from(new Set([0, 24, 48, 72, 96, candles.length - 1].filter((index) => index >= 0 && index < candles.length)));

  return (
    <div className="public-chart-widget yahoo-chart-widget">
      <div className="yahoo-chart-legend" aria-hidden="true"><span className="ma5">MA5</span><span className="ma20">MA20</span><span className="ma60">MA60</span></div>
      <svg className="yahoo-candlestick-svg" viewBox="0 0 1000 880" preserveAspectRatio="none" role="img" aria-label={language === "zh" ? `${ticker} 近 120 個交易日 K 線` : `${ticker} 120-session candlestick chart`}>
        <rect x="0" y="0" width="1000" height="880" fill="#fbfcfb" />
        {gridValues.map((value) => <g key={value}><line x1={left} x2={right} y1={y(value)} y2={y(value)} stroke="#dfe7e2" strokeWidth="1" /><text x="945" y={y(value) + 4} fill="#72858a" fontSize="12">{value.toFixed(value >= 100 ? 0 : 1)}</text></g>)}
        {candles.map((candle, index) => {
          const rising = candle.close >= candle.open;
          const color = rising ? "#d94b45" : "#15986c";
          const openY = y(candle.open);
          const closeY = y(candle.close);
          return <g key={candle.date}><title>{`${candle.date} O ${candle.open} H ${candle.high} L ${candle.low} C ${candle.close}`}</title><line x1={x(index)} x2={x(index)} y1={y(candle.high)} y2={y(candle.low)} stroke={color} strokeWidth="1.25" /><rect x={x(index) - bodyWidth / 2} y={Math.min(openY, closeY)} width={bodyWidth} height={Math.max(Math.abs(closeY - openY), 1.4)} fill={color} /></g>;
        })}
        <polyline points={linePoints(ma5)} fill="none" stroke="#4ca6e8" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <polyline points={linePoints(ma20)} fill="none" stroke="#f18b46" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <polyline points={linePoints(ma60)} fill="none" stroke="#7a64d1" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <line x1={left} x2={right} y1={volumeTop} y2={volumeTop} stroke="#dfe7e2" strokeWidth="1" />
        {candles.map((candle, index) => {
          const height = candle.volume / maxVolume * (volumeBottom - volumeTop);
          return <rect key={`volume-${candle.date}`} x={x(index) - bodyWidth / 2} y={volumeBottom - height} width={bodyWidth} height={Math.max(height, 1)} fill={candle.close >= candle.open ? "#e58b86" : "#68bea1"} opacity=".72" />;
        })}
        {labelIndexes.map((index) => <text key={`date-${candles[index].date}`} x={x(index)} y="872" fill="#72858a" fontSize="12" textAnchor={index === 0 ? "start" : index === candles.length - 1 ? "end" : "middle"}>{candles[index].date.slice(5)}</text>)}
      </svg>
    </div>
  );
}

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

  return <div className="technical-analysis-panel" role="note">
    <div className="technical-analysis-heading">
      <div><strong>{language === "zh" ? "規則式技術提示" : "Rule-based technical signals"}</strong><span>{language === "zh" ? `資料截至 ${analysis.asOf}` : `Data through ${analysis.asOf}`}</span></div>
      <small>{language === "zh" ? "只提示型態，不是買賣建議" : "Pattern hints, not trading advice"}</small>
    </div>
    <div className="technical-analysis-grid">
      <div className={`technical-signal ${movingAverageTone}`}><span>{language === "zh" ? "日線均線" : "Daily averages"}</span><strong>{movingAverageTitle}</strong><small>MA5 {formatIndicator(analysis.ma5)} · MA20 {formatIndicator(analysis.ma20)} · MA60 {formatIndicator(analysis.ma60)}{analysis.volumeRatio20 !== null ? ` · ${language === "zh" ? "量能" : "Volume"} ${analysis.volumeRatio20.toFixed(1)}x` : ""}</small></div>
      <div className={`technical-signal ${analysis.wBottom === "confirmed" ? "positive" : analysis.wBottom === "forming" ? "neutral" : "muted"}`}><span>{language === "zh" ? "日線型態" : "Daily pattern"}</span><strong>{wTitle}</strong><small>{analysis.wBottomNeckline !== null ? `${language === "zh" ? "頸線約" : "Neckline near"} ${formatIndicator(analysis.wBottomNeckline)} · ${language === "zh" ? "雙低約" : "Twin lows near"} ${formatIndicator(analysis.wBottomLow)}` : (language === "zh" ? "規則尚未找到兩個接近低點與有效頸線" : "No two comparable lows and valid neckline detected")}</small></div>
      <div className={`technical-signal ${weeklyPosition !== null && weeklyPosition <= 35 ? "positive" : "neutral"}`}><span>{language === "zh" ? "週線位置" : "Weekly position"}</span><strong>{weeklyPosition === null ? "—" : `${weeklyPosition}%`}</strong><small>{positionText(weeklyPosition, "近 52 週", "52-week")}</small></div>
      <div className={`technical-signal ${monthlyPosition !== null && monthlyPosition <= 35 ? "positive" : monthlyPosition !== null && monthlyPosition >= 70 ? "caution" : "neutral"}`}><span>{language === "zh" ? "月線位置" : "Monthly position"}</span><strong>{monthlyPosition === null ? "—" : `${monthlyPosition}%`}</strong><small>{positionText(monthlyPosition, "近 36 個月", "36-month")}</small></div>
    </div>
  </div>;
}

export function DailyCandlestickChart({ ticker, market, language }: Props) {
  const requestUrl = `/api/price-history?ticker=${encodeURIComponent(ticker)}&market=${market}`;
  const [result, setResult] = useState<ChartResult | null>(null);
  const currentResult = result?.requestUrl === requestUrl ? result : null;
  const state = currentResult?.state ?? "loading";

  useEffect(() => {
    const controller = new AbortController();
    void fetch(requestUrl, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { symbol?: string; tradingViewSymbol?: string; candles?: DailyCandle[]; corporateActions?: CorporateAction[]; technicalAnalysis?: TechnicalAnalysis | null };
        const yahooSymbol = String(payload.symbol ?? "").trim();
        const tradingViewSymbol = String(payload.tradingViewSymbol ?? "").trim();
        const candles = Array.isArray(payload.candles) ? payload.candles : [];
        setResult({
          requestUrl,
          yahooSymbol,
          tradingViewSymbol,
          candles,
          corporateActions: Array.isArray(payload.corporateActions) ? payload.corporateActions : [],
          technicalAnalysis: payload.technicalAnalysis ?? null,
          state: response.ok && yahooSymbol && (market === "TW" ? candles.length >= 20 : Boolean(tradingViewSymbol)) ? "ready" : "empty",
        });
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setResult({ requestUrl, yahooSymbol: "", tradingViewSymbol: "", candles: [], corporateActions: [], technicalAnalysis: null, state: "empty" });
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
  const candles = currentResult?.candles ?? [];
  const technicalAnalysis = currentResult?.technicalAnalysis ?? null;

  return (
    <section className="detail-section price-chart-section" aria-label={language === "zh" ? `${ticker} 公開 K 線` : `${ticker} public candlestick chart`}>
      <div className="detail-section-title chart-title-row">
        <div>
          <h3>{language === "zh" ? "公開技術 K 線" : "Public Technical Chart"}</h3>
          <span>{market === "TW" ? (language === "zh" ? "Yahoo Finance 公開日線 · 近 120 個交易日" : "Yahoo Finance public daily data · 120 sessions") : (language === "zh" ? "TradingView · 可切換日／週／月與技術指標" : "TradingView · switch daily, weekly, monthly, and technical indicators")}</span>
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
      {state === "ready" && (market === "TW" ? <YahooCandlestickChart candles={candles} ticker={ticker} language={language} /> : <TradingViewChart symbol={chartSymbol} language={language} />)}
      <p className="chart-footnote">
        {language === "zh" ? "外部圖表僅供技術型態判讀，不納入公允價值計算。" : "The external chart is for technical review only and is not included in fair-value calculations."}{" "}
        {market === "TW" ? <a href={yahooHref} target="_blank" rel="noopener nofollow noreferrer">{ticker} {language === "zh" ? "行情資料由 Yahoo Finance 提供" : "market data by Yahoo Finance"}</a> : <a href={tradingViewHref} target="_blank" rel="noopener nofollow noreferrer">{ticker} {language === "zh" ? "圖表由 TradingView 提供" : "chart by TradingView"}</a>}
      </p>
    </section>
  );
}
