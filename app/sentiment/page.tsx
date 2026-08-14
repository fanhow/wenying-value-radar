"use client";

import { useEffect, useMemo, useState } from "react";
import type { SentimentSeries, VolatilitySignal } from "../../lib/market-sentiment";
import { useLanguage } from "../language-context";
import { SiteFooter } from "../site-footer";
import { SiteHeader } from "../site-header";

type SentimentPayload = {
  asOf: string;
  signal: VolatilitySignal;
  curve: { shape: "contango" | "flat" | "inverted"; shortTermRatio: number | null; zh: string; en: string } | null;
  series: SentimentSeries[];
};

const SOURCE_LINKS = {
  cboe: "https://www.cboe.com/tradable-products/vix",
  citadelReset: "https://www.citadelsecurities.com/news-and-insights/global-market-intelligence/august-after-the-reset/",
  citadelChecklist: "https://www.citadelsecurities.com/news-and-insights/global-market-intelligence/august-checklist/",
  bofa: "https://business.bofa.com/en-us/content/global-research-about.html?wcmmode=disabled",
  epfr: "https://epfr.com/",
  videoInstitutional: "https://www.youtube.com/watch?v=ebV7mgXEJ6g&t=259s",
  videoRetail: "https://www.youtube.com/watch?v=ebV7mgXEJ6g&t=266s",
} as const;

function formatValue(value: number, digits = 2) {
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: digits }).format(value);
}

function formatPercent(value: number | null) {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function MiniBars({ series }: { series: SentimentSeries }) {
  const values = series.history.slice(-48).map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(max - min, 0.01);
  return (
    <div className="sentiment-mini-bars" aria-label={`${series.label} 48-day history`}>
      {values.map((value, index) => (
        <i key={`${index}-${value}`} style={{ height: `${18 + ((value - min) / spread) * 82}%` }} />
      ))}
    </div>
  );
}

function MarketDirectionMark({ series, inverse = false }: { series: SentimentSeries; inverse?: boolean }) {
  const pointsUp = inverse ? series.changePercent <= 0 : series.changePercent >= 0;
  return <span className={`market-direction-mark ${pointsUp ? "market-up" : "market-down"}`} aria-label={pointsUp ? "市場可能上漲" : "市場可能下跌"}>{pointsUp ? "↗" : "↘"}</span>;
}

function SeriesCard({ series, title, note, inverse = false }: { series?: SentimentSeries; title: string; note: string; inverse?: boolean }) {
  if (!series) return <article className="sentiment-series-card muted"><span>{title}</span><strong>—</strong><small>{note}</small></article>;
  return (
    <article className="sentiment-series-card">
      <span>{title}</span>
      <div className="sentiment-number"><MarketDirectionMark series={series} inverse={inverse} /><strong>{formatValue(series.current)}</strong></div>
      <b className={series.changePercent >= 0 ? "risk-up" : "risk-down"}>{formatPercent(series.changePercent)}</b>
      <MiniBars series={series} />
      <small>{note} · 20D {formatPercent(series.return20d)}</small>
    </article>
  );
}

export default function SentimentPage() {
  const { language, t } = useLanguage();
  const [payload, setPayload] = useState<SentimentPayload | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/market-sentiment", { headers: { Accept: "application/json" }, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("sentiment unavailable");
        return response.json() as Promise<SentimentPayload>;
      })
      .then((result) => { if (!cancelled) setPayload(result); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, []);

  const bySymbol = useMemo(() => Object.fromEntries((payload?.series ?? []).map((series) => [series.symbol, series])), [payload]);
  const vix = bySymbol["^VIX"];
  const signal = payload?.signal;

  return (
    <main className="app-shell">
      <SiteHeader active="sentiment" />
      <div className="page-content sentiment-page">
        <header className="sentiment-hero">
          <div>
            <p className="eyebrow"><span className="eyebrow-line" />MARKET SENTIMENT</p>
            <h1>{t("先看市場願意承擔多少風險", "Read how much risk the market will carry")}<br /><em>{t("再決定部位大小", "then size the position")}</em></h1>
            <p>{t(
              "整合 VIX、隱含波動率期限結構、主要指數動能與具來源的資金流研究。這裡提供風險管理參考，不取代估值與個股判斷。",
              "Combines VIX, the implied-volatility term structure, major-index momentum, and sourced flow research. This is risk-management context, not a substitute for valuation or stock research.",
            )}</p>
          </div>
          <div className={`sentiment-reading ${signal?.level ?? "loading"}`}>
            <span>{t("即時風險溫度", "Live risk temperature")}</span>
            <div className="sentiment-reading-number">{vix && <MarketDirectionMark series={vix} inverse />}<strong>{vix ? formatValue(vix.current) : "—"}</strong></div>
            <b>{signal ? (language === "zh" ? signal.titleZh : signal.titleEn) : error ? t("暫時無法取得", "Temporarily unavailable") : t("讀取中", "Loading")}</b>
            <small>VIX · {t("約 30 天隱含波動率 · 紅 ↗ 市場偏上、綠 ↘ 市場偏下", "about 30-day implied volatility · red ↗ market up, green ↘ market down")}</small>
          </div>
        </header>

        <section className="sentiment-section" aria-labelledby="volatility-heading">
          <div className="sentiment-section-heading">
            <div><p className="section-kicker">IMPLIED VOLATILITY / 01</p><h2 id="volatility-heading">{t("隱含波動率與持倉風險", "Implied volatility and position risk")}</h2></div>
            <a href={SOURCE_LINKS.cboe} target="_blank" rel="noreferrer">{t("Cboe 原始定義", "Cboe methodology")} ↗</a>
          </div>
          <div className="volatility-layout">
            <article className={`volatility-guidance ${signal?.level ?? "loading"}`}>
              <span>{t("目前提示", "Current guide")}</span>
              <h3>{signal ? (language === "zh" ? signal.titleZh : signal.titleEn) : t("資料讀取中", "Loading data")}</h3>
              <p>{signal ? (language === "zh" ? signal.guidanceZh : signal.guidanceEn) : t("等待最新 VIX 與期限結構。", "Waiting for the latest VIX and term structure.")}</p>
              <div className="guidance-scale"><i /><i /><i /><i /></div>
              <small>{t("提示不是買進／賣出訊號；低 VIX 也可能代表過度安心。", "This is not a buy/sell signal; a low VIX can also mean complacency.")}</small>
            </article>
            <div className="volatility-curve">
              <SeriesCard series={bySymbol["^VIX9D"]} title="VIX9D" note={t("未來 9 天", "Next 9 days")} inverse />
              <SeriesCard series={vix} title="VIX" note={t("未來約 30 天", "About 30 days")} inverse />
              <SeriesCard series={bySymbol["^VIX3M"]} title="VIX3M" note={t("未來 3 個月", "Next 3 months")} inverse />
              <p>{payload?.curve ? (language === "zh" ? payload.curve.zh : payload.curve.en) : t("三個期限一起看，可分辨短期事件風險是否突然升高。", "Reading all three maturities helps identify sudden near-term event risk.")}</p>
            </div>
          </div>
          <div className="sentiment-explainer">
            <strong>{t("怎麼用？", "How to use it")}</strong>
            <p>{t("隱含波動率是選擇權價格反映的未來波動預期，不是漲跌方向。若 VIX 與短期 VIX9D 同時快速上升，可視為減槓桿、提高現金與檢查集中度的提醒；下降則代表風險壓力緩和，但不代表一定上漲。", "Implied volatility is the option market's expectation of future movement, not direction. A simultaneous jump in VIX and VIX9D can prompt a review of leverage, cash, and concentration; a decline means pressure is easing, not that prices must rise.")}</p>
          </div>
        </section>

        <section className="sentiment-section" aria-labelledby="pulse-heading">
          <div className="sentiment-section-heading"><div><p className="section-kicker">MARKET PULSE / 02</p><h2 id="pulse-heading">{t("主要市場風險偏好", "Broad market risk appetite")}</h2></div><small>{payload?.asOf ? `${t("更新", "Updated")} ${new Date(payload.asOf).toLocaleString(language === "zh" ? "zh-TW" : "en-US")}` : t("等待即時資料", "Waiting for live data")}</small></div>
          <div className="market-pulse-grid">
            <SeriesCard series={bySymbol["^GSPC"]} title="S&P 500" note={t("大型股趨勢", "Large-cap trend")} />
            <SeriesCard series={bySymbol["^IXIC"]} title="Nasdaq" note={t("成長股風險偏好", "Growth risk appetite")} />
            <SeriesCard series={bySymbol["^RUT"]} title="Russell 2000" note={t("中小型股廣度代理", "Small-cap breadth proxy")} />
          </div>
          <p className="sentiment-data-note">{t("即時讀值由 Yahoo Finance 公開行情取得；Cboe 為指標方法來源。主要指數僅作風險偏好代理，不代表全部市場廣度。", "Live readings come from Yahoo Finance public quotes; Cboe is the methodology source. Major indices are only risk-appetite proxies, not complete market breadth.")}</p>
        </section>

        <section className="sentiment-section" aria-labelledby="flows-heading">
          <div className="sentiment-section-heading"><div><p className="section-kicker">FLOW EVIDENCE / 03</p><h2 id="flows-heading">{t("影片圖表的原始來源", "Original sources behind the video charts")}</h2></div><span className="snapshot-tag">{t("日期快照，非即時", "Dated snapshots, not live")}</span></div>
          <div className="flow-evidence-grid">
            <article className="flow-evidence-card institution">
              <span>BofA THE FLOW SHOW · EPFR</span>
              <h3>{t("科技基金資金流", "Technology fund flows")}</h3>
              <strong>{t("影片解讀：7 月下跌時資金大幅流入", "Video reading: large inflow during the July selloff")}</strong>
              <p>{t("圖例「Tech flows ($bn)／4-week MA」可辨識為 BofA Global Investment Strategy《The Flow Show》固定圖表，底層為 EPFR 基金流資料。它反映科技基金資金流，不宜直接等同所有機構的現貨買盤。完整當期報告屬訂閱研究。", "The legend 'Tech flows ($bn) / 4-week MA' identifies a recurring chart in BofA Global Investment Strategy's The Flow Show, using EPFR fund-flow data. It reflects technology-fund flows and should not be treated as all institutional cash-equity buying. The full current report is subscription research.")}</p>
              <div className="source-links"><a href={SOURCE_LINKS.bofa} target="_blank" rel="noreferrer">BofA Global Research ↗</a><a href={SOURCE_LINKS.epfr} target="_blank" rel="noreferrer">EPFR {t("資料說明", "data overview")} ↗</a><a href={SOURCE_LINKS.videoInstitutional} target="_blank" rel="noreferrer">YouTube 04:19 ↗</a></div>
            </article>
            <article className="flow-evidence-card retail">
              <span>CITADEL SECURITIES GMI · 2026-08-03</span>
              <h3>{t("散戶半導體／記憶體出貨", "Retail semiconductor / memory selling")}</h3>
              <strong>{t("原始研究：平均每日淨賣出超過先前紀錄 5 倍", "Original research: average daily net selling exceeded the prior record by more than 5x")}</strong>
              <p>{t("Citadel Securities 原文指出，7 月最後一週可能是 2022 年以來最大散戶股票賣出週；科技股賣出創 2019 年資料集以來新高，半導體與記憶體最集中。", "Citadel Securities wrote that July's final week was on pace to be the largest week of retail equity selling since 2022; technology selling set a dataset record since 2019, concentrated in semiconductors and memory.")}</p>
              <div className="source-links"><a href={SOURCE_LINKS.citadelReset} target="_blank" rel="noreferrer">{t("Citadel 原始文章", "Original Citadel article")} ↗</a><a href={SOURCE_LINKS.videoRetail} target="_blank" rel="noreferrer">YouTube 04:26 ↗</a></div>
            </article>
            <article className="flow-evidence-card volatility">
              <span>CITADEL SECURITIES GMI · 2026-08-11</span>
              <h3>{t("波動率下降如何影響資金流", "How falling volatility affects flows")}</h3>
              <strong>{t("原始研究：低於 15 會改變系統性資金的風險容量", "Original research: below 15 changes systematic risk capacity")}</strong>
              <p>{t("Citadel 認為實現波動率下降可增加系統性策略曝險容量；同時也提醒半導體隱含波動率仍在正常化。這是資金流背景，不是 VIX 單一買賣法。", "Citadel argues that falling realized volatility can expand systematic risk capacity while semiconductor implied volatility continues to normalize. This is flow context, not a standalone VIX trading rule.")}</p>
              <div className="source-links"><a href={SOURCE_LINKS.citadelChecklist} target="_blank" rel="noreferrer">{t("Citadel 原始文章", "Original Citadel article")} ↗</a><a href={SOURCE_LINKS.cboe} target="_blank" rel="noreferrer">Cboe VIX ↗</a></div>
            </article>
          </div>
        </section>

        <SiteFooter disclaimer={["市場情緒與資金流僅供風險研究，不構成持倉、減倉或買賣建議。", "Market sentiment and flow data are for risk research only and are not position or trading advice."]} motto={["先看風險，再決定部位", "Read risk before sizing positions"]} />
      </div>
    </main>
  );
}
