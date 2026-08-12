"use client";

import { useEffect, useRef, useState } from "react";
import type { CorporateAction } from "../lib/price-history";
import type { Language } from "./language-context";

type Props = { ticker: string; market: "TW" | "US"; language: Language };
type ChartResult = {
  requestUrl: string;
  yahooSymbol: string;
  tradingViewSymbol: string;
  corporateActions: CorporateAction[];
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

export function DailyCandlestickChart({ ticker, market, language }: Props) {
  const requestUrl = `/api/price-history?ticker=${encodeURIComponent(ticker)}&market=${market}`;
  const [result, setResult] = useState<ChartResult | null>(null);
  const currentResult = result?.requestUrl === requestUrl ? result : null;
  const state = currentResult?.state ?? "loading";

  useEffect(() => {
    const controller = new AbortController();
    void fetch(requestUrl, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { symbol?: string; tradingViewSymbol?: string; corporateActions?: CorporateAction[] };
        const yahooSymbol = String(payload.symbol ?? "").trim();
        const tradingViewSymbol = String(payload.tradingViewSymbol ?? "").trim();
        setResult({
          requestUrl,
          yahooSymbol,
          tradingViewSymbol,
          corporateActions: Array.isArray(payload.corporateActions) ? payload.corporateActions : [],
          state: response.ok && yahooSymbol && tradingViewSymbol ? "ready" : "empty",
        });
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setResult({ requestUrl, yahooSymbol: "", tradingViewSymbol: "", corporateActions: [], state: "empty" });
        }
      });
    return () => controller.abort();
  }, [requestUrl]);

  const chartSymbol = currentResult?.tradingViewSymbol ?? "";
  const yahooSymbol = currentResult?.yahooSymbol ?? (market === "TW" ? `${ticker}.TW` : ticker);
  const tradingViewHref = chartSymbol
    ? `https://www.tradingview.com/symbols/${chartSymbol.replace(":", "-")}/`
    : "https://www.tradingview.com/";
  const yahooHref = `https://finance.yahoo.com/quote/${encodeURIComponent(yahooSymbol)}/chart/`;
  const corporateActions = currentResult?.corporateActions ?? [];

  return (
    <section className="detail-section price-chart-section" aria-label={language === "zh" ? `${ticker} 公開 K 線` : `${ticker} public candlestick chart`}>
      <div className="detail-section-title chart-title-row">
        <div>
          <h3>{language === "zh" ? "公開技術 K 線" : "Public Technical Chart"}</h3>
          <span>{language === "zh" ? "TradingView · 可切換日／週／月與技術指標" : "TradingView · switch daily, weekly, monthly, and technical indicators"}</span>
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
      {state === "loading" && <div className="chart-state">{language === "zh" ? "正在載入公開 K 線…" : "Loading public chart…"}</div>}
      {state === "empty" && <div className="chart-state">{language === "zh" ? "目前無法載入公開 K 線，估值資料不受影響" : "The public chart is unavailable; valuation is unaffected"}</div>}
      {state === "ready" && <TradingViewChart symbol={chartSymbol} language={language} />}
      <p className="chart-footnote">
        {language === "zh" ? "外部圖表僅供技術型態判讀，不納入公允價值計算。" : "The external chart is for technical review only and is not included in fair-value calculations."}{" "}
        <a href={tradingViewHref} target="_blank" rel="noopener nofollow noreferrer">{ticker} {language === "zh" ? "圖表由 TradingView 提供" : "chart by TradingView"}</a>
      </p>
    </section>
  );
}
