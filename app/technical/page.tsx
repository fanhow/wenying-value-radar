"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SiteHeader } from "../site-header";
import { SiteFooter } from "../site-footer";
import { useLanguage } from "../language-context";
import { stockDetailHref } from "../../lib/navigation";
import { EChartsCandlestickChart } from "../echarts-candlestick-chart";
import type { DailyCandle } from "../../lib/price-history";
import type { TechnicalAnalysis } from "../../lib/technical-analysis";
import {
  buildTechnicalSnapshot,
  type TechnicalCandidate,
  type TechnicalCategory,
} from "../../lib/technical-screener";

type MarketFilter = "ALL" | "TW" | "US";
type StageFilter = "ALL" | "candidate" | "confirmed";
type ChartTimeframe = "daily" | "weekly" | "monthly";

type RealChartResult = {
  candles: DailyCandle[];
  weeklyCandles: DailyCandle[];
  monthlyCandles: DailyCandle[];
  technicalAnalysis: TechnicalAnalysis | null;
  state: "loading" | "ready" | "empty";
};

function formatIndicator(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toFixed(value >= 100 ? 1 : digits);
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(1)}%`;
}

export default function TechnicalAnalysisPage() {
  const { language, t } = useLanguage();
  const snapshot = useMemo(() => buildTechnicalSnapshot(), []);
  const [activeCategory, setActiveCategory] = useState<TechnicalCategory>("morning-star");
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("ALL");
  const [stageFilter, setStageFilter] = useState<StageFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("daily");
  const [chartDataMap, setChartDataMap] = useState<Record<string, RealChartResult>>({});

  const currentCategoryCandidates = useMemo(() => {
    if (!snapshot) return [];
    let list: TechnicalCandidate[] = [];
    if (activeCategory === "morning-star") list = snapshot.morningStar;
    else if (activeCategory === "evening-star") list = snapshot.eveningStar;
    else if (activeCategory === "trend-pullback") list = snapshot.trendPullback;

    if (marketFilter !== "ALL") {
      list = list.filter((c) => c.market === marketFilter);
    }
    if (stageFilter !== "ALL") {
      list = list.filter((c) => c.stage === stageFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((c) => c.ticker.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
    }
    return list;
  }, [snapshot, activeCategory, marketFilter, stageFilter, searchQuery]);

  const resolvedSelectedTicker = selectedTicker && currentCategoryCandidates.some((c) => c.ticker === selectedTicker)
    ? selectedTicker
    : currentCategoryCandidates[0]?.ticker ?? null;

  const selectedCandidate = useMemo(() => {
    if (!resolvedSelectedTicker || !currentCategoryCandidates.length) return currentCategoryCandidates[0] || null;
    return currentCategoryCandidates.find((c) => c.ticker === resolvedSelectedTicker) || currentCategoryCandidates[0] || null;
  }, [resolvedSelectedTicker, currentCategoryCandidates]);

  // Dynamically load real public candlestick price history from Yahoo Finance / TWSE
  useEffect(() => {
    if (!selectedCandidate) return;
    const key = `${selectedCandidate.market}-${selectedCandidate.ticker}`;
    if (chartDataMap[key]?.state === "ready") return;

    const controller = new AbortController();
    setChartDataMap((prev) => ({
      ...prev,
      [key]: prev[key] || { candles: [], weeklyCandles: [], monthlyCandles: [], technicalAnalysis: null, state: "loading" },
    }));

    void fetch(`/api/price-history?ticker=${encodeURIComponent(selectedCandidate.ticker)}&market=${selectedCandidate.market}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const payload = await res.json() as {
          symbol?: string;
          candles?: DailyCandle[];
          weeklyCandles?: DailyCandle[];
          monthlyCandles?: DailyCandle[];
          technicalAnalysis?: TechnicalAnalysis | null;
        };
        const candles = Array.isArray(payload.candles) ? payload.candles : [];
        if (res.ok && candles.length >= 20) {
          setChartDataMap((prev) => ({
            ...prev,
            [key]: {
              candles,
              weeklyCandles: Array.isArray(payload.weeklyCandles) ? payload.weeklyCandles : [],
              monthlyCandles: Array.isArray(payload.monthlyCandles) ? payload.monthlyCandles : [],
              technicalAnalysis: payload.technicalAnalysis ?? null,
              state: "ready",
            },
          }));
        } else {
          setChartDataMap((prev) => ({
            ...prev,
            [key]: { candles: [], weeklyCandles: [], monthlyCandles: [], technicalAnalysis: null, state: "empty" },
          }));
        }
      })
      .catch((err) => {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setChartDataMap((prev) => ({
            ...prev,
            [key]: { candles: [], weeklyCandles: [], monthlyCandles: [], technicalAnalysis: null, state: "empty" },
          }));
        }
      });

    return () => controller.abort();
  }, [chartDataMap, selectedCandidate]);

  const activeChartResult = selectedCandidate ? chartDataMap[`${selectedCandidate.market}-${selectedCandidate.ticker}`] : null;
  const chartState = activeChartResult?.state ?? "loading";
  const displayedCandles = useMemo(() => {
    if (!activeChartResult || activeChartResult.state !== "ready") return [];
    if (timeframe === "weekly") return activeChartResult.weeklyCandles;
    if (timeframe === "monthly") return activeChartResult.monthlyCandles;
    return activeChartResult.candles;
  }, [activeChartResult, timeframe]);
  const activeTechnicalAnalysis = activeChartResult?.technicalAnalysis ?? selectedCandidate?.technicalAnalysis ?? null;

  return (
    <div className="layout-shell">
      <SiteHeader active="technical" />

      <main className="content-container">
        {/* Page Header */}
        <section className="section-block technical-hero">
          <div className="section-head">
            <div>
              <span className="section-tag">{t("量化型態與估值共振", "Quant Patterns & Valuation Convergence")}</span>
              <h2>{t("技術分析策略與轉折推薦", "Technical Analysis & Pattern Screener")}</h2>
            </div>
            <p className="hero-lead">
              {t(
                "結合多模型公允價值共識與三大經典實戰型態（早晨之星、黃昏之星、順勢回踩 W 底），十字星收盤即時提示「可能形成」，助您在隔日跳空開盤時買賣在最佳起漲點與避險位。",
                "Combining multi-model fair value consensus with three battle-tested technical patterns (Morning Star, Evening Star, Trend Pullback). Real-time Doji close detection allows early positioning on next-day gap opens.",
              )}
            </p>
          </div>

          {/* Strategy Tabs */}
          <div className="technical-strategy-tabs">
            <button
              type="button"
              className={`strategy-tab-btn ${activeCategory === "morning-star" ? "active" : ""}`}
              onClick={() => setActiveCategory("morning-star")}
            >
              <div className="tab-badge bullish-badge">{t("看漲反轉", "Bullish Reversal")}</div>
              <div className="tab-title">{t("A. 早晨之星", "A. Morning Star")}</div>
              <div className="tab-desc">{t("十字星收盤提前卡位 ＋ 週月支撐 ＋ 公允價值低估", "Doji Close Early Entry + Key support + Undervalued")}</div>
            </button>

            <button
              type="button"
              className={`strategy-tab-btn ${activeCategory === "evening-star" ? "active" : ""}`}
              onClick={() => setActiveCategory("evening-star")}
            >
              <div className="tab-badge bearish-badge">{t("高檔警示", "Bearish Reversal")}</div>
              <div className="tab-title">{t("B. 黃昏之星", "B. Evening Star")}</div>
              <div className="tab-desc">{t("十字星收盤提前避險 ＋ 週月壓力 ＋ 估值偏高警示", "Doji Close Early Exit + Key resistance + Overvalued")}</div>
            </button>

            <button
              type="button"
              className={`strategy-tab-btn ${activeCategory === "trend-pullback" ? "active" : ""}`}
              onClick={() => setActiveCategory("trend-pullback")}
            >
              <div className="tab-badge trend-badge">{t("順勢買點", "Trend Buy")}</div>
              <div className="tab-title">{t("C. 順勢交易 (W底買點)", "C. Trend Pullback (W-Bottom)")}</div>
              <div className="tab-desc">{t("EMA15/50MA 收斂 ＋ 50MA 黃色支撐區 W 底", "EMA15/SMA50 convergence + 50MA yellow support")}</div>
            </button>
          </div>
        </section>

        {/* Strategy Description Guide Banner */}
        <section className="section-block strategy-guide-banner">
          {activeCategory === "morning-star" && (
            <div className="guide-card guide-morning">
              <div className="guide-header">
                <h3>{t("🌟 早晨之星（Morning Star）識別原則與量化條件", "🌟 Morning Star Recognition Rules & Filter Criteria")}</h3>
                <span className="badge-tag">{t("多頭反轉訊號", "Bullish Reversal")}</span>
              </div>
              <div className="guide-timing-alert bullish-timing">
                <strong>⚡ {t("實戰提前卡位原則（十字星收盤即時列出）：", "Advance Positioning Rule (Listed upon Doji Close):")}</strong>{" "}
                {t(
                  "當第二根十字星（Doji）向下跳空收盤時，系統便會第一時間列在「可能形成」名單；只要隔日開盤向上跳空或開高，即可在第一時間買在最低成本、最佳起漲位置！",
                  "Listed immediately as a 'Candidate' at the close of the downward gap Doji. If tomorrow opens with an upward gap or higher, enter early at the lowest cost basis!",
                )}
              </div>
              <ul className="guide-rules-list">
                <li>
                  <strong>{t("1. 連續大跌放量陰線：", "1. Downtrend Climax with Volume:")}</strong>{" "}
                  {t("股價經歷一波明顯下跌，最後出現實體放大的長黑陰燭，並伴隨成交量顯著放大。", "Prolonged downtrend climaxing with a large bearish candle on expanded volume.")}
                </li>
                <li>
                  <strong>{t("2. 向下跳空十字星（收盤即列入）：", "2. Downward Gap Doji (Listed at Close):")}</strong>{" "}
                  {t("第二根 K 線向下跳空開低，收出十字星（Doji）或細小實體，代表空頭賣壓竭盡。", "Second candle gaps down into a Doji or small body, indicating seller exhaustion.")}
                </li>
                <li>
                  <strong>{t("3. 第三根確認陽燭（完全確認）：", "3. Confirmed Third Bullish Candle:")}</strong>{" "}
                  {t("第三根長紅陽燭強勢反彈，收盤價收復第一根陰線實體 50% 以上。", "Third candle rallies strongly, closing above 50% of the first candle's real body.")}
                </li>
                <li>
                  <strong>{t("4. 週線／月線主要支撐：", "4. Weekly/Monthly Key Support:")}</strong>{" "}
                  {t("型態出現在週線或月線關鍵支撐位，或週月線上行趨勢線通道下軌。", "Must form at major weekly/monthly horizontal support or ascending trendline support.")}
                </li>
                <li>
                  <strong>{t("5. 公允價值為正：", "5. Positive Fair Value Upside:")}</strong>{" "}
                  {t("多模型公允價值高於現價，具備明確安全邊際與上行空間（↗ 紅色標示）。", "Multi-model fair value exceeds current market price with solid upside margin (↗ in Red).")}
                </li>
              </ul>
            </div>
          )}

          {activeCategory === "evening-star" && (
            <div className="guide-card guide-evening">
              <div className="guide-header">
                <h3>{t("🌙 黃昏之星（Evening Star）識別原則與警示條件", "🌙 Evening Star Recognition Rules & Warning Criteria")}</h3>
                <span className="badge-tag caution">{t("空頭轉折警示", "Bearish Warning")}</span>
              </div>
              <div className="guide-timing-alert bearish-timing">
                <strong>⚡ {t("實戰提前避險原則（十字星收盤即時列出）：", "Advance Defensive Rule (Listed upon Doji Close):")}</strong>{" "}
                {t(
                  "當第二根十字星（Doji）向上跳空收盤時，系統便會第一時間列在「可能形成」名單；只要隔日開盤向下跳空或開低走弱，即可在第一時間積極減碼、鎖定獲利避險！",
                  "Listed immediately as a 'Candidate' at the close of the upward gap Doji. If tomorrow opens with a downward gap or lower, take defensive exits early!",
                )}
              </div>
              <ul className="guide-rules-list">
                <li>
                  <strong>{t("1. 連續大漲放量陽線：", "1. Uptrend Climax with Volume:")}</strong>{" "}
                  {t("股價經歷一波強勁上漲，最後放量出現實體放大的長紅陽燭，市場情緒過熱。", "Extended uptrend climaxing with a large bullish candle on heavy volume.")}
                </li>
                <li>
                  <strong>{t("2. 向上跳空十字星（收盤即列入）：", "2. Upward Gap Doji (Listed at Close):")}</strong>{" "}
                  {t("第二根 K 線向上跳空開高，收出十字星或細小實體，代表多頭動能停滯。", "Second candle gaps up into a Doji or small body, indicating buyer momentum stall.")}
                </li>
                <li>
                  <strong>{t("3. 第三根確認陰燭（完全確認）：", "3. Confirmed Third Bearish Candle:")}</strong>{" "}
                  {t("第三根長黑陰燭向下貫穿，收盤價跌破第一根陽線實體 50% 以下。", "Third candle drops sharply, closing below 50% of the first candle's real body.")}
                </li>
                <li>
                  <strong>{t("4. 週線／月線主要壓力：", "4. Weekly/Monthly Major Resistance:")}</strong>{" "}
                  {t("型態出現在週線或月線歷史壓力區，或下降通道上軌，避免高檔追價。", "Occurs near major weekly/monthly resistance or descending channel top.")}
                </li>
                <li>
                  <strong>{t("5. 公允價值偏高警示：", "5. Fair Value Downside Warning:")}</strong>{" "}
                  {t("公允價值低於現價或具備下行邊際，提防回調風險（↘ 綠色標示）。", "Fair value is below market price or shows downside margin (↘ in Green).")}
                </li>
              </ul>
            </div>
          )}

          {activeCategory === "trend-pullback" && (
            <div className="guide-card guide-pullback">
              <div className="guide-header">
                <h3>{t("📈 順勢交易（Trend Pullback 均線收斂買點）識別原則", "📈 Trend Pullback & W-Bottom Setup Rules")}</h3>
                <span className="badge-tag">{t("高勝率順勢買點", "High Probability Trend Entry")}</span>
              </div>
              <ul className="guide-rules-list">
                <li>
                  <strong>{t("1. 波段起漲均線打開：", "1. Initial Impulse & MA Divergence:")}</strong>{" "}
                  {t("在一次上漲行情中，15EMA（黑色）與 50SMA（紅色）形成黃金交叉並向上打開發散。", "Strong upward wave where EMA15 (black) and SMA50 (red) open up bullishly.")}
                </li>
                <li>
                  <strong>{t("2. 規律調整與均線收合：", "2. Orderly Consolidation & MA Convergence:")}</strong>{" "}
                  {t("股價進入規律調整，15EMA 慢慢向 50SMA 靠攏收合，波動幅度收窄、成交量溫和萎縮。", "Orderly pullback where EMA15 converges back toward SMA50 on contracting volatility.")}
                </li>
                <li>
                  <strong>{t("3. 黃色支撐區 W 底買點：", "3. Yellow Support Zone & W-Bottom:")}</strong>{" "}
                  {t("股價在 50SMA 或前波支撐位附近打出 W 底（雙重底）或回踩確認，形成最佳起漲買點。", "Price forms a W-bottom double test or bounces cleanly in the yellow 50MA support buy zone.")}
                </li>
                <li>
                  <strong>{t("4. 公允價值安全邊際：", "4. Fair Value Upside:")}</strong>{" "}
                  {t("公允價值高於現價，兼具基本面估值保護與技術面順勢動能（↗ 紅色標示）。", "Calibrated fair value offers solid upside margin for dual fundamental + technical edge.")}
                </li>
              </ul>
            </div>
          )}
        </section>

        {/* Filter Controls */}
        <section className="section-block filter-bar-section">
          <div className="filter-controls-row">
            <div className="filter-button-group">
              <div className="market-toggle-group">
                <button
                  type="button"
                  className={`market-btn ${marketFilter === "ALL" ? "active" : ""}`}
                  onClick={() => setMarketFilter("ALL")}
                >
                  {t("全部市場", "All Markets")}
                </button>
                <button
                  type="button"
                  className={`market-btn ${marketFilter === "TW" ? "active" : ""}`}
                  onClick={() => setMarketFilter("TW")}
                >
                  🇹🇼 {t("台股", "Taiwan")}
                </button>
                <button
                  type="button"
                  className={`market-btn ${marketFilter === "US" ? "active" : ""}`}
                  onClick={() => setMarketFilter("US")}
                >
                  🇺🇸 {t("美股", "US")}
                </button>
              </div>

              <div className="stage-toggle-group">
                <button
                  type="button"
                  className={`stage-btn ${stageFilter === "ALL" ? "active" : ""}`}
                  onClick={() => setStageFilter("ALL")}
                >
                  {t("全部階段", "All Stages")}
                </button>
                <button
                  type="button"
                  className={`stage-btn ${stageFilter === "candidate" ? "active candidate" : ""}`}
                  onClick={() => setStageFilter("candidate")}
                >
                  ⚡ {t("十字星收盤 (可能形成)", "Doji Close (Candidate)")}
                </button>
                <button
                  type="button"
                  className={`stage-btn ${stageFilter === "confirmed" ? "active confirmed" : ""}`}
                  onClick={() => setStageFilter("confirmed")}
                >
                  ✅ {t("已確認反轉", "Confirmed")}
                </button>
              </div>
            </div>

            <div className="search-box-wrap">
              <input
                type="text"
                placeholder={t("搜尋代碼或名稱...", "Search ticker or name...")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="technical-search-input"
              />
            </div>
          </div>
        </section>

        {/* Main Content Area: Selected Stock Chart & Detail */}
        {selectedCandidate && (
          <section className="section-block technical-chart-section">
            <div className="chart-header-card">
              <div className="chart-title-row">
                <div className="stock-info-left">
                  <div className="stock-badges">
                    <span className="market-tag">{selectedCandidate.market}</span>
                    <span className="pattern-badge">{selectedCandidate.patternNameZh}</span>
                    <span className={`stage-badge ${selectedCandidate.stage === "candidate" ? "candidate-stage" : "confirmed-stage"}`}>
                      {selectedCandidate.stage === "candidate"
                        ? t("⚡ 十字星收盤 (可能形成 · 關注明日開盤/跳空)", "⚡ Doji Close (Candidate · Watch Gap Open)")
                        : t("✅ 型態已確認 (第3根突破確立)", "✅ Confirmed Reversal")}
                    </span>
                  </div>
                  <h3 className="stock-title">
                    <Link
                      href={stockDetailHref(selectedCandidate.ticker)}
                      className="stock-title-link"
                      title={t("點擊直接回到公允價值頁面查看完整估值詳細資料", "Click to return to Fair Value page for complete details")}
                    >
                      <span className="ticker-code">{selectedCandidate.ticker}</span> {selectedCandidate.name}
                      <span className="title-detail-link-tag">{t("公允價值詳細資料 ↗", "Fair Value Details ↗")}</span>
                    </Link>
                  </h3>
                </div>

                <div className="stock-pricing-right">
                  <div className="price-metric-box">
                    <span className="metric-label">{t("最新股價", "Current Price")}</span>
                    <span className="metric-val">{formatIndicator(selectedCandidate.price)}</span>
                  </div>
                  <div className="price-metric-box">
                    <span className="metric-label">{t("公允價值", "Fair Value")}</span>
                    <span className="metric-val">{formatIndicator(selectedCandidate.fairValue)}</span>
                  </div>
                  <div className="price-metric-box">
                    <span className="metric-label">{t("空間幅度", "Margin / Upside")}</span>
                    <span className={`metric-val ${selectedCandidate.upside >= 0 ? "text-bullish" : "text-bearish"}`}>
                      {selectedCandidate.upside >= 0 ? "↗" : "↘"} {formatPercent(selectedCandidate.upside)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Banner for Selected Stock */}
              <div className="selected-action-banner">
                <span className="action-tag">📌 {t("實戰進出指引", "Action Guide")}:</span>
                <span className="action-text">{selectedCandidate.actionGuideZh}</span>
              </div>

              {/* Timeframe & Action Bar */}
              <div className="chart-action-bar">
                <div className="timeframe-buttons">
                  <button
                    type="button"
                    className={`tf-btn ${timeframe === "daily" ? "active" : ""}`}
                    onClick={() => setTimeframe("daily")}
                  >
                    {t("日線 (Daily)", "Daily")}
                  </button>
                  <button
                    type="button"
                    className={`tf-btn ${timeframe === "weekly" ? "active" : ""}`}
                    onClick={() => setTimeframe("weekly")}
                  >
                    {t("週線 (Weekly)", "Weekly")}
                  </button>
                  <button
                    type="button"
                    className={`tf-btn ${timeframe === "monthly" ? "active" : ""}`}
                    onClick={() => setTimeframe("monthly")}
                  >
                    {t("月線 (Monthly)", "Monthly")}
                  </button>
                </div>

                <div className="chart-legend-notes">
                  <span className="legend-item"><span className="dot dot-ema15" /> EMA15 ({t("黑色", "Black")})</span>
                  <span className="legend-item"><span className="dot dot-sma50" /> SMA50 ({t("紅色", "Red")})</span>
                  <span className="legend-item"><span className="dot dot-sma20" /> SMA20 ({t("藍色", "Blue")})</span>
                  {activeCategory === "trend-pullback" && (
                    <span className="legend-item"><span className="dot dot-yellow" /> {t("黃色支撐買點區", "Yellow Buy Zone")}</span>
                  )}
                </div>

                <Link href={stockDetailHref(selectedCandidate.ticker)} className="view-valuation-link">
                  {t("回到公允價值頁面查看詳細資料 →", "Return to Fair Value Page for Full Details →")}
                </Link>
              </div>

              {/* Real Candlestick Chart from Public Yahoo Finance History */}
              <div className="chart-canvas-container">
                {chartState === "loading" && (
                  <div className="chart-state-box loading">
                    <div className="chart-loading-spinner" />
                    <p>{t("正在載入 Yahoo Finance 公開真實技術 K 線…", "Loading Yahoo Finance real candlestick market data…")}</p>
                  </div>
                )}
                {chartState === "empty" && (
                  <div className="chart-state-box empty">
                    <p>{t("公開行情資料暫時無法載入，您可以點擊下方按鈕回到公允價值頁面查看完整財報模型與詳細資料。", "Public market chart temporarily unavailable. Click below to view full valuation details.")}</p>
                    <Link href={stockDetailHref(selectedCandidate.ticker)} className="chart-empty-action-btn">
                      {t("回到公允價值頁面查看 →", "View Fair Value Model →")}
                    </Link>
                  </div>
                )}
                {chartState === "ready" && (
                  <EChartsCandlestickChart
                    candles={displayedCandles}
                    ticker={selectedCandidate.ticker}
                    language={language}
                    analysis={activeTechnicalAnalysis}
                    timeframe={timeframe}
                  />
                )}
              </div>

              {/* Technical Indicator Analysis Metrics */}
              <div className="tech-summary-grid">
                <div className="tech-summary-box">
                  <span className="box-title">{t("均線架構與趨勢", "MA Alignment & Trend")}</span>
                  <p className="box-desc">
                    {activeTechnicalAnalysis?.dailyTrend === "bullish"
                      ? t("多頭排列／短多發散", "Bullish alignment")
                      : activeTechnicalAnalysis?.dailyTrend === "bearish"
                        ? t("空頭排列／高檔轉弱", "Bearish alignment")
                        : t("均線收斂整理中", "MA convergence consolidation")}
                    {activeTechnicalAnalysis?.ema15 && ` · EMA15: ${formatIndicator(activeTechnicalAnalysis.ema15)}`}
                    {activeTechnicalAnalysis?.sma50 && ` · SMA50: ${formatIndicator(activeTechnicalAnalysis.sma50)}`}
                  </p>
                </div>

                <div className="tech-summary-box">
                  <span className="box-title">{t("關鍵支撐與壓力", "Support & Resistance")}</span>
                  <p className="box-desc">
                    {activeTechnicalAnalysis?.supportLevel && `${t("主要支撐", "Support")}: ${formatIndicator(activeTechnicalAnalysis.supportLevel)}`}
                    {activeTechnicalAnalysis?.resistanceLevel && ` · ${t("主要壓力", "Resistance")}: ${formatIndicator(activeTechnicalAnalysis.resistanceLevel)}`}
                    {selectedCandidate.supportZoneLow && selectedCandidate.supportZoneHigh && ` · ${t("黃色買點帶", "Buy Zone")}: ${formatIndicator(selectedCandidate.supportZoneLow)}~${formatIndicator(selectedCandidate.supportZoneHigh)}`}
                  </p>
                </div>

                <div className="tech-summary-box">
                  <span className="box-title">{t("型態診斷與操作建議", "Diagnostic & Strategy")}</span>
                  <p className="box-desc">{selectedCandidate.descriptionZh}</p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Candidate Recommendation Grid / List */}
        <section className="section-block candidates-table-section">
          <div className="section-head">
            <h3>
              {activeCategory === "morning-star" && t("🌟 早晨之星推薦名單", "🌟 Morning Star Recommended Candidates")}
              {activeCategory === "evening-star" && t("🌙 黃昏之星警示名單", "🌙 Evening Star Warning Watchlist")}
              {activeCategory === "trend-pullback" && t("📈 順勢交易（W底買點）推薦名單", "📈 Trend Pullback & W-Bottom Entries")}
              <span className="candidate-count-tag">({currentCategoryCandidates.length})</span>
            </h3>
            <p className="section-subtext">
              {t("點擊下方任一檔標的名稱或「公允價值 ↗」，即可直接回到公允價值頁面並開啟完整詳細資料；點擊「看線圖」可在上方即時預覽真實技術 K 線。", "Click any stock name or 'Valuation ↗' below to directly return to the Fair Value page with complete details, or click 'Chart' to preview its real candlestick chart above.")}
            </p>
          </div>

          <div className="table-wrapper">
            <table className="technical-candidates-table">
              <thead>
                <tr>
                  <th>{t("市場", "Market")}</th>
                  <th>{t("代碼 / 名稱 (點擊回公允價值)", "Ticker / Name (Click for Fair Value)")}</th>
                  <th>{t("目前價格", "Current Price")}</th>
                  <th>{t("公允價值", "Fair Value")}</th>
                  <th>{t("空間幅度", "Upside / Margin")}</th>
                  <th>{t("主要支撐 / 買點區", "Support / Zone")}</th>
                  <th>{t("型態狀態", "Pattern Stage")}</th>
                  <th>{t("實戰進出指引", "Action Guide")}</th>
                  <th>{t("操作", "Action")}</th>
                </tr>
              </thead>
              <tbody>
                {currentCategoryCandidates.map((candidate) => {
                  const isSelected = selectedCandidate?.ticker === candidate.ticker;
                  const isPositive = candidate.upside >= 0;
                  return (
                    <tr
                      key={`${candidate.market}-${candidate.ticker}`}
                      className={`candidate-row ${isSelected ? "selected-row" : ""}`}
                    >
                      <td>
                        <span className="market-pill">{candidate.market}</span>
                      </td>
                      <td>
                        <Link
                          href={stockDetailHref(candidate.ticker)}
                          className="candidate-name-link"
                          title={t("點擊直接回到公允價值頁面查看完整估值詳細資料", "Click to return to Fair Value page for complete details")}
                        >
                          <div className="candidate-name-cell">
                            <strong className="candidate-ticker">
                              {candidate.ticker} <span className="ticker-link-arrow">↗</span>
                            </strong>
                            <span className="candidate-subname">{candidate.name}</span>
                          </div>
                        </Link>
                      </td>
                      <td className="price-cell">{formatIndicator(candidate.price)}</td>
                      <td className="price-cell">{formatIndicator(candidate.fairValue)}</td>
                      <td className="upside-cell">
                        <span className={`direction-badge ${isPositive ? "bullish" : "bearish"}`}>
                          {isPositive ? "↗" : "↘"} {formatPercent(candidate.upside)}
                        </span>
                      </td>
                      <td>
                        {candidate.supportZoneLow && candidate.supportZoneHigh
                          ? `${formatIndicator(candidate.supportZoneLow)} ~ ${formatIndicator(candidate.supportZoneHigh)}`
                          : formatIndicator(candidate.supportLevel)}
                      </td>
                      <td>
                        <span className={`stage-tag ${candidate.stage === "candidate" ? "stage-candidate" : "stage-confirmed"}`}>
                          {candidate.stage === "candidate"
                            ? t("⚡ 十字星 (可能形成)", "⚡ Doji (Candidate)")
                            : t("✅ 已確認", "✅ Confirmed")}
                        </span>
                      </td>
                      <td className="action-guide-cell">
                        <span className="guide-short-text">{candidate.actionGuideZh}</span>
                      </td>
                      <td>
                        <div className="table-actions-cell">
                          <button
                            type="button"
                            className={`select-chart-btn ${isSelected ? "active" : ""}`}
                            onClick={() => setSelectedTicker(candidate.ticker)}
                            title={t("在上方載入真實技術 K 線", "Preview real technical chart above")}
                          >
                            {isSelected ? t("預覽中", "Viewing") : t("看線圖", "Chart")}
                          </button>
                          <Link
                            href={stockDetailHref(candidate.ticker)}
                            className="direct-valuation-btn"
                            title={t("直接回到公允價值頁面查看詳細資料", "Directly view details on Fair Value page")}
                          >
                            {t("公允價值 ↗", "Valuation ↗")}
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <SiteFooter
        disclaimer={["技術型態與估值僅供投資研究，不構成投資建議。", "Technical patterns and valuation are for investment research only and do not constitute investment advice."]}
        motto={["先驗證型態，再獨立估值", "Validate the pattern, then value independently"]}
      />
    </div>
  );
}
