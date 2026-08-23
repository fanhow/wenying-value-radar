"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SiteHeader } from "../site-header";
import { SiteFooter } from "../site-footer";
import { useLanguage } from "../language-context";
import { stockDetailHref } from "../../lib/navigation";
import { EChartsCandlestickChart } from "../echarts-candlestick-chart";
import {
  buildTechnicalSnapshot,
  type TechnicalCandidate,
  type TechnicalCategory,
  type TechnicalSnapshot,
} from "../../lib/technical-screener";
import type { DailyCandle } from "../../lib/price-history";
import type { TechnicalAnalysis } from "../../lib/technical-analysis";

type MarketFilter = "ALL" | "TW" | "US";
type ChartTimeframe = "daily" | "weekly" | "monthly";

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
  const [snapshot, setSnapshot] = useState<TechnicalSnapshot | null>(null);
  const [activeCategory, setActiveCategory] = useState<TechnicalCategory>("morning-star");
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("daily");

  useEffect(() => {
    // Generate snapshot data
    const data = buildTechnicalSnapshot();
    setSnapshot(data);
  }, []);

  const currentCategoryCandidates = useMemo(() => {
    if (!snapshot) return [];
    let list: TechnicalCandidate[] = [];
    if (activeCategory === "morning-star") list = snapshot.morningStar;
    else if (activeCategory === "evening-star") list = snapshot.eveningStar;
    else if (activeCategory === "trend-pullback") list = snapshot.trendPullback;

    if (marketFilter !== "ALL") {
      list = list.filter((c) => c.market === marketFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((c) => c.ticker.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
    }
    return list;
  }, [snapshot, activeCategory, marketFilter, searchQuery]);

  // Set default selected candidate when category or market changes
  useEffect(() => {
    if (currentCategoryCandidates.length > 0) {
      if (!selectedTicker || !currentCategoryCandidates.some((c) => c.ticker === selectedTicker)) {
        setSelectedTicker(currentCategoryCandidates[0].ticker);
      }
    } else {
      setSelectedTicker(null);
    }
  }, [currentCategoryCandidates, selectedTicker]);

  const selectedCandidate = useMemo(() => {
    if (!selectedTicker || !currentCategoryCandidates.length) return currentCategoryCandidates[0] || null;
    return currentCategoryCandidates.find((c) => c.ticker === selectedTicker) || currentCategoryCandidates[0] || null;
  }, [selectedTicker, currentCategoryCandidates]);

  const displayedCandles = useMemo(() => {
    if (!selectedCandidate) return [];
    if (timeframe === "weekly") return selectedCandidate.weeklyCandles;
    if (timeframe === "monthly") return selectedCandidate.monthlyCandles;
    return selectedCandidate.candles;
  }, [selectedCandidate, timeframe]);

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
                "結合多模型公允價值共識與三大經典實戰型態（早晨之星、黃昏之星、順勢回踩 W 底），精準辨識關鍵轉折買點與高檔風險警示。",
                "Combining multi-model fair value consensus with three classic battle-tested technical patterns (Morning Star, Evening Star, Trend Pullback W-Bottom) to capture high-probability entries and exit warnings.",
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
              <div className="tab-desc">{t("向下跳空十字星 ＋ 週月支撐 ＋ 公允價值低估", "Gap down Doji + Key support + Undervalued")}</div>
            </button>

            <button
              type="button"
              className={`strategy-tab-btn ${activeCategory === "evening-star" ? "active" : ""}`}
              onClick={() => setActiveCategory("evening-star")}
            >
              <div className="tab-badge bearish-badge">{t("高檔警示", "Bearish Reversal")}</div>
              <div className="tab-title">{t("B. 黃昏之星", "B. Evening Star")}</div>
              <div className="tab-desc">{t("向上跳空十字星 ＋ 週月壓力 ＋ 估值偏高警示", "Gap up Doji + Key resistance + Overvalued")}</div>
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
              <ul className="guide-rules-list">
                <li>
                  <strong>{t("1. 連續大跌放量陰線：", "1. Downtrend Climax with Volume:")}</strong>{" "}
                  {t("股價經歷一波明顯下跌，最後出現實體放大的長黑陰燭，並伴隨成交量顯著放大。", "Prolonged downtrend climaxing with a large bearish candle on expanded volume.")}
                </li>
                <li>
                  <strong>{t("2. 向下跳空十字星（必須條件）：", "2. Downward Gap Doji (Required):")}</strong>{" "}
                  {t("第二根 K 線必須向下跳空開低，收出實體細小之十字星（Doji）或紡錘線，代表賣壓竭盡。", "Second candle must gap down into a Doji or small spinning top, indicating seller exhaustion.")}
                </li>
                <li>
                  <strong>{t("3. 第三根確認陽燭：", "3. Confirmed Bullish Reversal:")}</strong>{" "}
                  {t("第三根長紅陽燭強勢反彈，收盤價收復第一根陰線實體 50% 以上。", "Third candle rallies strongly, closing above 50% of the first candle's real body.")}
                </li>
                <li>
                  <strong>{t("4. 週線／月線主要支撐：", "4. Weekly/Monthly Key Support:")}</strong>{" "}
                  {t("型態必須出現在週線或月線關鍵支撐位，或週月線上行趨勢線通道下軌。", "Must form at major weekly/monthly horizontal support or ascending trendline support.")}
                </li>
                <li>
                  <strong>{t("5. 公允價值為正：", "5. Positive Fair Value Upside:")}</strong>{" "}
                  {t("本站多模型公允價值高於現價，具備明確安全邊際與上行空間（↗ 紅色標示）。", "Multi-model fair value exceeds current market price with solid upside margin (↗ in Red).")}
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
              <ul className="guide-rules-list">
                <li>
                  <strong>{t("1. 連續大漲放量陽線：", "1. Uptrend Climax with Volume:")}</strong>{" "}
                  {t("股價經歷一波強勁上漲，最後放量出現實體放大的長紅陽燭，市場情緒過熱。", "Extended uptrend climaxing with a large bullish candle on heavy volume.")}
                </li>
                <li>
                  <strong>{t("2. 向上跳空十字星（必須條件）：", "2. Upward Gap Doji (Required):")}</strong>{" "}
                  {t("第二根 K 線必須向上跳空開高，收出十字星或細小實體，代表多頭動能停滯。", "Second candle must gap up into a Doji or small body, indicating buyer momentum stall.")}
                </li>
                <li>
                  <strong>{t("3. 第三根確認陰燭：", "3. Confirmed Bearish Reversal:")}</strong>{" "}
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
                    <span className="stage-badge">{t("型態已確認", "Confirmed")}</span>
                  </div>
                  <h3 className="stock-title">
                    <span className="ticker-code">{selectedCandidate.ticker}</span> {selectedCandidate.name}
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
                  {t("查看完整公允價值模型 →", "View Full Fair Value Model →")}
                </Link>
              </div>

              {/* Candlestick Chart */}
              <div className="chart-canvas-container">
                <EChartsCandlestickChart
                  candles={displayedCandles}
                  ticker={selectedCandidate.ticker}
                  language={language}
                  analysis={selectedCandidate.technicalAnalysis}
                  timeframe={timeframe}
                />
              </div>

              {/* Technical Indicator Analysis Metrics */}
              <div className="tech-summary-grid">
                <div className="tech-summary-box">
                  <span className="box-title">{t("均線架構與趨勢", "MA Alignment & Trend")}</span>
                  <p className="box-desc">
                    {selectedCandidate.technicalAnalysis.dailyTrend === "bullish"
                      ? t("多頭排列／短多發散", "Bullish alignment")
                      : selectedCandidate.technicalAnalysis.dailyTrend === "bearish"
                        ? t("空頭排列／高檔轉弱", "Bearish alignment")
                        : t("均線收斂整理中", "MA convergence consolidation")}
                    {selectedCandidate.technicalAnalysis.ema15 && ` · EMA15: ${formatIndicator(selectedCandidate.technicalAnalysis.ema15)}`}
                    {selectedCandidate.technicalAnalysis.sma50 && ` · SMA50: ${formatIndicator(selectedCandidate.technicalAnalysis.sma50)}`}
                  </p>
                </div>

                <div className="tech-summary-box">
                  <span className="box-title">{t("關鍵支撐與壓力", "Support & Resistance")}</span>
                  <p className="box-desc">
                    {selectedCandidate.supportLevel && `${t("主要支撐", "Support")}: ${formatIndicator(selectedCandidate.supportLevel)}`}
                    {selectedCandidate.resistanceLevel && ` · ${t("主要壓力", "Resistance")}: ${formatIndicator(selectedCandidate.resistanceLevel)}`}
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
              {t("點擊下方任一檔標的，即可即時切換上方 K 線圖與量化技術指標儀表板。", "Click any stock below to interactively view its full candlestick chart and technical metrics above.")}
            </p>
          </div>

          <div className="table-wrapper">
            <table className="technical-candidates-table">
              <thead>
                <tr>
                  <th>{t("市場", "Market")}</th>
                  <th>{t("代碼 / 名稱", "Ticker / Name")}</th>
                  <th>{t("目前價格", "Current Price")}</th>
                  <th>{t("公允價值", "Fair Value")}</th>
                  <th>{t("空間幅度", "Upside / Margin")}</th>
                  <th>{t("主要支撐 / 買點區", "Support / Zone")}</th>
                  <th>{t("型態狀態", "Pattern Stage")}</th>
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
                      onClick={() => setSelectedTicker(candidate.ticker)}
                    >
                      <td>
                        <span className="market-pill">{candidate.market}</span>
                      </td>
                      <td>
                        <div className="candidate-name-cell">
                          <strong className="candidate-ticker">{candidate.ticker}</strong>
                          <span className="candidate-subname">{candidate.name}</span>
                        </div>
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
                        <span className={`stage-tag ${isPositive ? "positive" : "caution"}`}>
                          {candidate.patternNameZh}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`select-chart-btn ${isSelected ? "active" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTicker(candidate.ticker);
                          }}
                        >
                          {isSelected ? t("檢視中", "Viewing") : t("看線圖", "Chart")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
