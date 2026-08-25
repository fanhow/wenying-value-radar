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
  const [activeCategory, setActiveCategory] = useState<TechnicalCategory>("trend-pullback");
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("ALL");
  const [stageFilter, setStageFilter] = useState<StageFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("daily");
  const [chartDataMap, setChartDataMap] = useState<Record<string, RealChartResult>>({});

  const currentCategoryCandidates = useMemo(() => {
    if (!snapshot) return [];
    let list: TechnicalCandidate[] = [];
    if (activeCategory === "trend-pullback") list = snapshot.trendPullback;
    else if (activeCategory === "value-trend") list = snapshot.valueTrend;
    else if (activeCategory === "stage2-breakout") list = snapshot.stage2Breakout;
    else if (activeCategory === "morning-star") list = snapshot.morningStar;
    else if (activeCategory === "evening-star") list = snapshot.eveningStar;

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
              <h2>{t("技術分析策略與高勝率轉折推薦", "Technical Analysis & High-Probability Strategy Screener")}</h2>
            </div>
            <p className="hero-lead">
              {t(
                "融合華爾街經典量化體系（順勢回踩 W 底、價值趨勢共振、第二階段放量突破、關鍵支撐早晨之星），結合多模型公允價值安全邊際，為您在右側起漲點與突破時機精選最高風報比（Risk:Reward ≥ 1:3）標的。",
                "Integrating classic quantitative frameworks (Trend Pullback W-bottom, Value-Trend Resonance, Stage 2 Breakout, Morning Star Reversal) with multi-model fair value margins of safety to pinpoint optimal entry timing with superior risk/reward (Risk:Reward >= 1:3).",
              )}
            </p>
          </div>

          {/* Strategy Tabs */}
          <div className="technical-strategy-tabs">
            <button
              type="button"
              className={`strategy-tab-btn ${activeCategory === "trend-pullback" ? "active" : ""}`}
              onClick={() => setActiveCategory("trend-pullback")}
            >
              <div className="tab-badge trend-badge">{t("高勝率順勢", "High Edge Trend")}</div>
              <div className="tab-title">{t("⚡ 順勢交易 (W底買點)", "⚡ Trend Pullback (W-Bottom)")}</div>
              <div className="tab-desc">{t("方框整理無假突破 ＋ 第3/4次回踩 50MA 均線黏合", "Flat box consolidation + 3rd/4th test 50MA convergence")}</div>
            </button>

            <button
              type="button"
              className={`strategy-tab-btn ${activeCategory === "value-trend" ? "active" : ""}`}
              onClick={() => setActiveCategory("value-trend")}
            >
              <div className="tab-badge value-badge">{t("雙重優勢", "Dual Edge")}</div>
              <div className="tab-title">{t("💎 價值趨勢共振", "💎 Value-Trend Resonance")}</div>
              <div className="tab-desc">{t("公允價值低估 (安全邊際) ＋ 右側 15EMA/50SMA 金叉", "Undervalued safety margin + Right-side MA golden cross")}</div>
            </button>

            <button
              type="button"
              className={`strategy-tab-btn ${activeCategory === "stage2-breakout" ? "active" : ""}`}
              onClick={() => setActiveCategory("stage2-breakout")}
            >
              <div className="tab-badge stage2-badge">{t("主升段啟動", "Stage 2 Launch")}</div>
              <div className="tab-title">{t("🚀 第二階段突破", "🚀 Stage 2 Breakout")}</div>
              <div className="tab-desc">{t("長期低檔打底 ＋ 放量突破箱體頂部 ＋ 均線昂揚", "Long base consolidation + High-volume ceiling breakout")}</div>
            </button>

            <button
              type="button"
              className={`strategy-tab-btn ${activeCategory === "morning-star" ? "active" : ""}`}
              onClick={() => setActiveCategory("morning-star")}
            >
              <div className="tab-badge bullish-badge">{t("關鍵支撐反轉", "Key Support Reversal")}</div>
              <div className="tab-title">{t("🌟 早晨之星", "🌟 Morning Star")}</div>
              <div className="tab-desc">{t("十字星收盤提前卡位 ＋ 週月主要支撐 ＋ 恐慌賣壓竭盡", "Doji Close Early Entry + Major Key Support + Seller Exhaustion")}</div>
            </button>

            <button
              type="button"
              className={`strategy-tab-btn ${activeCategory === "evening-star" ? "active" : ""}`}
              onClick={() => setActiveCategory("evening-star")}
            >
              <div className="tab-badge bearish-badge">{t("高檔過熱警示", "Bearish Warning")}</div>
              <div className="tab-title">{t("🌙 黃昏之星", "🌙 Evening Star")}</div>
              <div className="tab-desc">{t("十字星收盤提前避險 ＋ 週月主要壓力 ＋ 估值偏高", "Doji Close Early Exit + Major Key Resistance + Overvalued")}</div>
            </button>
          </div>
        </section>

        {/* Strategy Description Guide Banner */}
        <section className="section-block strategy-guide-banner">
          {activeCategory === "trend-pullback" && (
            <div className="guide-card guide-pullback">
              <div className="guide-header">
                <h3>{t("⚡ 順勢交易（Trend Pullback 均線收斂買點）四階段量化法則", "⚡ Trend Pullback & 50MA Convergence 4-Stage Quant Rules")}</h3>
                <span className="badge-tag">{t("高勝率順勢起漲點", "High-Edge Trend Entry")}</span>
              </div>
              <div className="guide-timing-alert bullish-timing">
                <strong>⚡ {t("實戰提前卡位原則（回踩 50MA 收盤即時列出）：", "Advance Positioning Rule (Listed upon 50MA Retest Close):")}</strong>{" "}
                {t(
                  "當股價在平整方框內完成第 3 或第 4 次回踩 50MA 水平支撐，且 15EMA 與 50SMA 均線完全收攏黏合收盤時，系統第一時間列在「⚡ 提前卡位」名單；只要隔日開盤守穩 50MA 支撐或微幅開高，即可在最低成本第一時間進場卡位順勢起漲！",
                  "Listed immediately as a 'Candidate' at the close when 3rd/4th retest on 50MA support completes with tight EMA15/SMA50 convergence. Enter at tomorrow's open for the highest-edge trend entry!",
                )}
              </div>
              <ul className="guide-rules-list">
                <li>
                  <strong>{t("1. 下跌築底（第一階段）：", "1. Prior Downtrend & Base:")}</strong>{" "}
                  {t("日線歷經一段連續明確的下跌波段，並在低檔區震盪築底（可配合早晨之星進行首次左側試單佈局）。", "Clear prior decline followed by base bottoming; open to early Morning Star initial sizing.")}
                </li>
                <li>
                  <strong>{t("2. 反轉推升波與金叉打開（第二階段）：", "2. Impulse Surge & MA Expansion:")}</strong>{" "}
                  {t("自底部出現強勢推升波（漲幅 ≥ 12%~25%），帶動 15EMA 與 50SMA 黃金交叉並向上打開（Spread ≥ 3.5%），50SMA 走平並轉為向上昂揚。", "Strong impulse wave (+12%~25%) driving EMA15/SMA50 golden cross and widening spread, turning 50SMA flat to rising.")}
                </li>
                <li>
                  <strong>{t("3. 平整方框箱體整理無假突破（第三階段）：", "3. Flat Box Consolidation without False Breakout:")}</strong>{" "}
                  {t("高檔進入水平方框整理（高度 ≤ 12.5%），嚴禁中間出現衝出箱體又暴跌回來的假突破，確保主力籌碼乾淨沉澱。", "Horizontal tight box (height <= 12.5%) without erratic fake breakout spikes to ensure clean supply absorption.")}
                </li>
                <li>
                  <strong>{t("4. 第 3 次或第 4 次回踩 50MA 均線收攏（第四階段·重點時機買點）：", "4. 3rd/4th Retest on 50MA Support Floor (Prime Entry):")}</strong>{" "}
                  {t("完成第 3 次或第 4 次回踩箱體下沿 50MA 水平支撐，15EMA 與 50SMA 完全收攏黏合（差幅 ≤ 3.0%），均線維持金叉。此處停損極小（僅 2%~3%）而潛在獲利巨大，為全市場最高勝率之重點時機起漲買點！", "Completed 3rd or 4th retest of 50MA horizontal floor with EMA15/SMA50 tightly converging in golden cross; provides superior risk/reward.")}
                </li>
              </ul>
            </div>
          )}

          {activeCategory === "value-trend" && (
            <div className="guide-card guide-value-trend">
              <div className="guide-header">
                <h3>{t("💎 價值趨勢共振策略（Value-Trend Resonance）核心原則", "💎 Value-Trend Resonance Quant Blueprint")}</h3>
                <span className="badge-tag value-tag">{t("雙重勝率優勢", "Dual-Edge Strategy")}</span>
              </div>
              <div className="guide-timing-alert bullish-timing">
                <strong>⚡ {t("實戰提前卡位原則（低估 ＋ 縮量回踩均線收盤列出）：", "Advance Positioning Rule (Listed upon Valuation Margin + MA Pullback):")}</strong>{" "}
                {t(
                  "當個股公允價值具備 ≥ +15% 高安全邊際，且技術面均線呈多頭排列縮量回踩 15EMA/50MA 均線收盤時，系統第一時間列入「⚡ 提前卡位」名單；隔日開盤即為右側低成本共振進場的最佳時機！",
                  "Listed immediately as a 'Candidate' at the close when intrinsic valuation upside >= +15% combines with low-volume pullback to right-side MA support. Enter at tomorrow's open for dual-edge momentum!",
                )}
              </div>
              <ul className="guide-rules-list">
                <li>
                  <strong>{t("1. 基本面安全邊際托底（左側保護）：", "1. Fundamental Safety Margin (Downside Floor):")}</strong>{" "}
                  {t("多模型公允價值具備 ≥ +15%~+20% 的低估安全邊際，財務結構健康（高 ROE、低負債比、正自由現金流），杜絕價值陷阱與下市風險。", "Intrinsic fair value offers >= +15% margin of safety with solid financials (high ROE, low debt, positive FCF), eliminating value traps.")}
                </li>
                <li>
                  <strong>{t("2. 技術面右側均線多頭排列（右側動能）：", "2. Technical Right-Side Trend (Upside Momentum):")}</strong>{" "}
                  {t("絕不在左側暴跌時徒手接飛刀；嚴格要求 15EMA ≥ 50SMA 形成黃金交叉，且 50MA 走平或向上，股價運行於右側主升軌道上。", "Never catch falling knives on the left; strictly requires EMA15 >= SMA50 golden cross with flat/rising 50MA on the right side.")}
                </li>
                <li>
                  <strong>{t("3. 機構大資金首選邏輯：", "3. Institutional Capital Favorite:")}</strong>{" "}
                  {t("基本面提供下跌防守底氣，技術面提供資金推升動能，兼具「跌有支撐、漲有空間」之絕佳實戰優勢。", "Fundamental valuation defends downside while technical trend unlocks upside momentum, avoiding dead-money stalls.")}
                </li>
              </ul>
            </div>
          )}

          {activeCategory === "stage2-breakout" && (
            <div className="guide-card guide-stage2">
              <div className="guide-header">
                <h3>{t("🚀 第二階段放量突破策略（Stan Weinstein Stage 2 Breakout）量化標準", "🚀 Stan Weinstein Stage 2 Base Breakout Quant Rules")}</h3>
                <span className="badge-tag stage2-tag">{t("主升段突破買點", "Stage 2 Base Breakout")}</span>
              </div>
              <div className="guide-timing-alert bullish-timing">
                <strong>⚡ {t("實戰提前卡位原則（底部箱體頂部蓄勢收盤列出）：", "Advance Positioning Rule (Listed upon Base Ceiling Consolidation):")}</strong>{" "}
                {t(
                  "當股價歷經 30~60 天 Stage 1 低檔打底，收盤逼近箱體天花板前 1.5% 蓄勢待發（VCP 波動收縮）時，系統第一時間列入「⚡ 提前卡位」名單；明日開盤若開高或放量衝破箱頂，即可第一時間切入 Stage 2 主升段！",
                  "Listed immediately as a 'Candidate' at the close when price consolidates tightly near the Stage 1 base ceiling. If tomorrow opens higher on volume, enter early for the Stage 2 advancing wave!",
                )}
              </div>
              <ul className="guide-rules-list">
                <li>
                  <strong>{t("1. 第一階段打底期（Stage 1 Base）：", "1. Stage 1 Base Consolidation:")}</strong>{" "}
                  {t("股價在低檔進行長達 30~60 個交易日以上的橫向箱體整理，50MA 走平，波動率顯著收斂，籌碼充分換手沉澱。", "Price consolidates in a horizontal base for 30~60+ days with flat 50MA and contracting volatility.")}
                </li>
                <li>
                  <strong>{t("2. 放量長紅突破箱體天花板（Breakout Pivot）：", "2. Volume Expansion Clearing Resistance:")}</strong>{" "}
                  {t("當日收盤價強勢突破整理箱體最高點（≥ +1.5%~+2.5%），並伴隨放量（成交量 ≥ 1.5x~2.0x 20MA 均量），主力大單強勢進場。", "Closing price clears base ceiling (+1.5%~2.5%) accompanied by heavy volume (>= 1.5x~2.0x MA20 volume).")}
                </li>
                <li>
                  <strong>{t("3. 均線發散昂揚向上（Stage 2 主升段啟動）：", "3. Stage 2 Advancing Phase Activated:")}</strong>{" "}
                  {t("15EMA 與 50SMA 呈多頭排列昂揚向上，順應市場阻力最小之方向，為抓取大波段主升浪的核心策略。", "EMA15 and SMA50 slope upward in multi-day expansion along the line of least resistance.")}
                </li>
              </ul>
            </div>
          )}

          {activeCategory === "morning-star" && (
            <div className="guide-card guide-morning">
              <div className="guide-header">
                <h3>{t("🌟 早晨之星（Morning Star）識別原則與量化條件", "🌟 Morning Star Recognition Rules & Filter Criteria")}</h3>
                <span className="badge-tag">{t("多頭反轉訊號", "Bullish Reversal")}</span>
              </div>
              <div className="guide-timing-alert bullish-timing">
                <strong>⚡ {t("實戰提前卡位原則（十字星收盤即時列出）：", "Advance Positioning Rule (Listed upon Doji Close):")}</strong>{" "}
                {t(
                  "當第二根十字星（Doji）向下跳空收盤且精確落在日/週/月支撐線上時，系統便會第一時間列在「提前卡位」名單；只要隔日開盤向上跳空或開高，即可在第一時間買在最低成本、最佳起漲位置！",
                  "Listed immediately as a 'Candidate' at the close of the downward gap Doji right on major support. If tomorrow opens with an upward gap or higher, enter early at the lowest cost basis!",
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
                  <strong>{t("4. 必須位於日/週/月主要支撐線：", "4. Must Form on Day/Week/Month Key Support:")}</strong>{" "}
                  {t("十字星之最低價或收盤價必須精確觸及或落在日線、週線或月線主要支撐線上，獲得實質支撐方能列入觀察，確保絕佳買入優勢與高盈虧比。", "Doji low or close must strictly touch or sit on daily, weekly, or monthly major support line to ensure high-probability entry advantage.")}
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
                  "當第二根十字星（Doji）向上跳空收盤且精確落在日/週/月壓力線上時，系統便會第一時間列在「提前避險」名單；只要隔日開盤向下跳空或開低走弱，即可在第一時間積極減碼、鎖定獲利避險！",
                  "Listed immediately as a 'Candidate' at the close of the upward gap Doji right on major resistance. If tomorrow opens with a downward gap or lower, take defensive exits early!",
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
                  <strong>{t("4. 必須位於日/週/月主要壓力線：", "4. Must Form on Day/Week/Month Major Resistance:")}</strong>{" "}
                  {t("十字星之最高價或收盤價必須精確觸及或落在日線、週線或月線主要壓力線上，高檔遇阻方能列入警示。", "Doji high or close must strictly touch or sit on daily, weekly, or monthly major resistance line.")}
                </li>
                <li>
                  <strong>{t("5. 公允價值偏高警示：", "5. Fair Value Downside Warning:")}</strong>{" "}
                  {t("公允價值低於現價或具備下行邊際，提防回調風險（↘ 綠色標示）。", "Fair value is below market price or shows downside margin (↘ in Green).")}
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
                  ⚡ {t("提前卡位 (快要形成 · 掌握明日開盤買點)", "Early Entry (Candidate · Next-Day Open)")}
                </button>
                <button
                  type="button"
                  className={`stage-btn ${stageFilter === "confirmed" ? "active confirmed" : ""}`}
                  onClick={() => setStageFilter("confirmed")}
                >
                  ✅ {t("已確認起漲 / 突破", "Confirmed Setup")}
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
        {selectedCandidate ? (
          <section className="section-block technical-chart-section">
            <div className="chart-header-card">
              <div className="chart-title-row">
                <div className="stock-info-left">
                  <div className="stock-badges">
                    <span className="market-tag">{selectedCandidate.market}</span>
                    <span className="pattern-badge">{selectedCandidate.patternNameZh}</span>
                    <span className={`stage-badge ${selectedCandidate.stage === "candidate" ? "candidate-stage" : "confirmed-stage"}`}>
                      {selectedCandidate.stage === "candidate"
                        ? t("⚡ 提前卡位點 (快要形成 · 掌握明日開盤最佳買點)", "⚡ Early Entry (Candidate · Watch Tomorrow's Open)")
                        : t("✅ 型態已確認 (突破 / 金叉確立)", "✅ Confirmed Setup")}
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
                    {selectedCandidate.supportZoneLow && selectedCandidate.supportZoneHigh && ` · ${t("50MA 支撐帶", "50MA Zone")}: ${formatIndicator(selectedCandidate.supportZoneLow)}~${formatIndicator(selectedCandidate.supportZoneHigh)}`}
                  </p>
                </div>

                <div className="tech-summary-box">
                  <span className="box-title">{t("型態診斷與操作建議", "Diagnostic & Strategy")}</span>
                  <p className="box-desc">{selectedCandidate.descriptionZh}</p>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section className="section-block technical-chart-section">
            <div className="technical-empty-state-card">
              <div className="empty-state-icon">🔍</div>
              <h4>
                {activeCategory === "trend-pullback" && t("目前市場暫無嚴格符合「順勢交易 (W底買點)」量化條件的標的", "No stocks currently match strict Trend Pullback criteria")}
                {activeCategory === "value-trend" && t("目前市場暫無嚴格符合「價值趨勢共振」量化條件的標的", "No stocks currently match strict Value-Trend criteria")}
                {activeCategory === "stage2-breakout" && t("目前市場暫無嚴格符合「第二階段突破」量化條件的標的", "No stocks currently match strict Stage 2 Breakout criteria")}
                {activeCategory === "morning-star" && t("目前市場暫無嚴格符合「早晨之星」量化條件的標的", "No stocks currently match strict Morning Star criteria")}
                {activeCategory === "evening-star" && t("目前市場暫無嚴格符合「黃昏之星」量化條件的標的", "No stocks currently match strict Evening Star criteria")}
              </h4>
              <p>
                {t(
                  "本雷達堅持嚴謹的教科書級量化標準：必須具備「前期連續波段走勢」＋「放量實體長 K 線」＋「出現在日／週／月關鍵支撐壓力線上創出波段新極值的跳空十字星」＋「良好成交量流動性」，絕不硬湊或偽造不合規標的，以確保最佳交易勝率與極佳盈虧比。",
                  "We enforce strict textbook quant standards: sustained prior wave + volume climax real body + gap Doji star at new swing extreme right on key support/resistance + solid liquidity. We never force or fabricate unqualified stocks to ensure genuine edge and risk/reward.",
                )}
              </p>
              <p className="empty-state-subnote">
                {t("⚡ 系統於每日收盤後持續進行全市場即時掃描，一旦出現標準形態將第一時間呈現在此。您可切換至上方「順勢交易（W底買點）」查看當前符合條件之強勢股。", "⚡ The system scans the market on daily close and alerts when genuine setups form. You can switch to the 'Trend Pullback W-Bottom' tab above to view active candidates.")}
              </p>
            </div>
          </section>
        )}

        {/* Candidate Recommendation Grid / List */}
        <section className="section-block candidates-table-section">
          <div className="section-head">
            <h3>
              {activeCategory === "trend-pullback" && t("⚡ 順勢交易（W底買點）推薦名單", "⚡ Trend Pullback & W-Bottom Entries")}
              {activeCategory === "value-trend" && t("💎 價值趨勢共振推薦名單", "💎 Value-Trend Resonance Watchlist")}
              {activeCategory === "stage2-breakout" && t("🚀 第二階段放量突破推薦名單", "🚀 Stage 2 Breakout Watchlist")}
              {activeCategory === "morning-star" && t("🌟 早晨之星推薦名單", "🌟 Morning Star Recommended Candidates")}
              {activeCategory === "evening-star" && t("🌙 黃昏之星警示名單", "🌙 Evening Star Warning Watchlist")}
              <span className="candidate-count-tag">({currentCategoryCandidates.length})</span>
            </h3>
            <p className="section-subtext">
              {t("點擊下方任一檔標的名稱或「公允價值 ↗」，即可直接回到公允價值頁面並開啟完整詳細資料；點擊「看線圖」可在上方即時預覽真實技術 K 線。", "Click any stock name or 'Valuation ↗' below to directly return to the Fair Value page with complete details, or click 'Chart' to preview its real candlestick chart above.")}
            </p>
          </div>

          {currentCategoryCandidates.length === 0 ? (
            <div className="table-empty-notice">
              <p>{t("目前無符合篩選條件的標的。您可以切換上方策略頁籤查看其他技術型態（如順勢交易 W 底買點或價值趨勢共振）。", "No candidates matching current criteria. You can switch to other strategy tabs above.")}</p>
            </div>
          ) : (
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
                              ? t("⚡ 提前卡位 (快要形成)", "⚡ Early Entry (Candidate)")
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
          )}
        </section>

        {/* Strategy Playbook: Institutional Core Logic & Risk:Reward Management */}
        <section className="section-block strategy-playbook-section">
          <div className="playbook-card">
            <div className="playbook-header">
              <div>
                <span className="section-tag">{t("量化策略手冊", "Quant Playbook")}</span>
                <h3>💡 {t("頂級操盤手「高勝率交易策略」核心心法與風報比管理", "Institutional High-Expectancy Trading Framework & Risk Management")}</h3>
              </div>
              <span className="badge-tag value-tag">{t("正期望值體系", "Positive Expectancy")}</span>
            </div>

            <div className="math-formula-box">
              {t(
                "數學期望值公式：E = (勝率 × 平均獲利) - (敗率 × 平均虧損) ； 核心精神：截斷虧損（Stop Loss ≤ 2%~3%），讓利潤奔跑（Gain ≥ 15%~40%），維持 風報比 (Risk:Reward) ≥ 1:3。",
                "Mathematical Expectancy: E = (Win Rate × Avg Win) - (Loss Rate × Avg Loss) ; Golden Rule: Cut losses short (<= 2%~3%), let winners run (>= 15%~40%), maintain Risk:Reward >= 1:3.",
              )}
            </div>

            <div className="playbook-grid">
              <div className="playbook-item">
                <h4>⚡ 1. {t("順勢交易（W底／50MA 均線黏合起漲）", "Trend Pullback & 50MA Convergence")}</h4>
                <p>
                  {t(
                    "華爾街冠軍操盤手 Mark Minervini 的 VCP（波動收縮）核心哲學。在強勢波段上漲後，進入平整方框整理（高度 ≤ 12.5%），浮額經過 2~3 輪洗盤沉澱，於第 3 或第 4 次回踩 50MA 水平支撐且 15EMA 與 50SMA 完全收攏時進場。",
                    "Mark Minervini's VCP concept: strong impulse surge into a tight flat box (<= 12.5% height). Supply is cleanly absorbed over 2-3 retests. Enter when EMA15 tightly touches SMA50 on the 3rd or 4th horizontal floor test.",
                  )}
                </p>
                <div className="playbook-metrics">
                  <span className="playbook-metric-tag">{t("最佳風報比：1:5 ~ 1:8", "Risk:Reward: 1:5 ~ 1:8")}</span>
                  <span>{t("停損點：方框下沿 / 50MA 下方 2%", "Stop Loss: Box Floor -2%")}</span>
                </div>
              </div>

              <div className="playbook-item">
                <h4>💎 2. {t("價值趨勢共振（基本面低估 ＋ 右側均線金叉）", "Value-Trend Resonance")}</h4>
                <p>
                  {t(
                    "機構大資金最青睞的雙重優勢策略。左側具備多模型公允價值 ≥ +15%~+20% 的安全邊際，財務體質扎實，避免買到下市爛雷；右側要求 15EMA ≥ 50SMA 呈多頭排列，絕不徒手接飛刀，兼具安全防守與主升浪動能。",
                    "Dual-edge framework favored by institutional funds: fundamental multi-model fair value upside >= +15% eliminates value traps, while right-side EMA15 >= SMA50 golden cross unleashes momentum.",
                  )}
                </p>
                <div className="playbook-metrics">
                  <span className="playbook-metric-tag">{t("最佳風報比：1:4 ~ 1:6", "Risk:Reward: 1:4 ~ 1:6")}</span>
                  <span>{t("停損點：近期波段低點或 50MA", "Stop Loss: Recent Swing Low")}</span>
                </div>
              </div>

              <div className="playbook-item">
                <h4>🚀 3. {t("第二階段突破（Stan Weinstein Stage 2 放量突破）", "Stan Weinstein Stage 2 Breakout")}</h4>
                <p>
                  {t(
                    "順應市場「阻力最小方向」的大波段行情。歷經 30~60 天低檔區間整理（Stage 1 打底期），主力大單以大於 1.5x~2.0x 均量的突破長紅棒強勢打破箱體天花板，均線向上發散，適合抓取翻倍級主升段。",
                    "Stage Analysis framework: 30-60+ day base breakout on >= 1.5x-2.0x volume expansion. Follows the line of least resistance into a multi-month advancing phase.",
                  )}
                </p>
                <div className="playbook-metrics">
                  <span className="playbook-metric-tag">{t("最佳風報比：1:3 ~ 1:5", "Risk:Reward: 1:3 ~ 1:5")}</span>
                  <span>{t("停損點：突破箱體頂部下方 3%", "Stop Loss: Breakout Ceiling -3%")}</span>
                </div>
              </div>

              <div className="playbook-item">
                <h4>🌟 4. {t("關鍵結構位反轉（破底翻／早晨之星流動性獵殺）", "Key Level Morning Star Reversal")}</h4>
                <p>
                  {t(
                    "在週線、月線或歷史大底等關鍵週期支撐位，主力藉由恐慌拋售引發停損（Liquidity Sweep），隨後收出十字星或長下影線。十字星收盤提前卡位或第三根長陽收復 50% 實體時確認，以極小風險博取大波段底部反轉。",
                    "Liquidity sweep at major multi-timeframe support: institutional absorption takes advantage of panic selling, forming a Doji star. Enter early at Doji close with tight stop at swing low.",
                  )}
                </p>
                <div className="playbook-metrics">
                  <span className="playbook-metric-tag">{t("最佳風報比：1:4 ~ 1:7", "Risk:Reward: 1:4 ~ 1:7")}</span>
                  <span>{t("停損點：十字星最低點下方 1%", "Stop Loss: Star Low -1%")}</span>
                </div>
              </div>
            </div>
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
