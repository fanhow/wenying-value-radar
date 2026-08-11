"use client";

import { calculateStock, valuationTargets, type Stock } from "../../lib/valuation";
import fundSnapshotJson from "../../lib/fund-holdings-snapshot.json";
import usMarketSnapshot from "../../lib/us-market-snapshot.json";
import { useLanguage } from "../language-context";
import { SiteHeader } from "../site-header";

type FundHolding = {
  ticker: string;
  issuer: string;
  titleOfClass: string;
  cusip: string;
  shares: number;
  previousShares: number;
  valueUsd: number;
  portfolioWeight: number;
  changePercent: number | null;
  changeType: "new" | "increased" | "reduced" | "unchanged";
  significantChange: boolean;
  taiwanExposure: boolean;
};

type TrackedFund = {
  rank: number;
  slug: string;
  name: string;
  legalName: string;
  cik: string;
  cumulativeGainBn: number;
  gain2025Bn: number;
  reportDate: string;
  filingDate: string;
  previousReportDate: string;
  sourceUrl: string;
  reportedLongValueUsd: number;
  holdings: FundHolding[];
};

type FundSnapshot = {
  generatedAt: string;
  rankingAsOf: string;
  rankingMethod: string;
  rankingSourceUrl: string;
  holdingsSource: string;
  funds: TrackedFund[];
};

type MarketRow = {
  ticker: string;
  name: string;
  price: number;
  eps: number;
  bvps: number;
  dividendPerShare: number;
  sector: string;
  date: string;
};

type ValuedHolding = FundHolding & { stock: Stock | null };
type ValuedFund = Omit<TrackedFund, "holdings"> & { holdings: ValuedHolding[] };

const snapshot = fundSnapshotJson as FundSnapshot;
const marketByTicker = new Map((usMarketSnapshot as MarketRow[]).map((row) => [row.ticker, row]));

function valueHolding(holding: FundHolding): ValuedHolding {
  const row = marketByTicker.get(holding.ticker);
  if (!row || row.price <= 0) return { ...holding, stock: null };
  const roe = row.bvps > 0 ? (row.eps / row.bvps) * 100 : 0;
  const targets = valuationTargets(0, roe, 0);
  return {
    ...holding,
    stock: calculateStock({
      ticker: row.ticker,
      name: row.name,
      market: "US",
      sector: row.sector,
      price: row.price,
      eps: Math.max(row.eps, 0),
      bvps: Math.max(row.bvps, 0),
      fcfPerShare: 0,
      dividendPerShare: Math.max(row.dividendPerShare, 0),
      ...targets,
      revenueGrowth: 0,
      roe,
      debtRatio: 0,
      uncertainty: 0.3,
      qualityAvailable: false,
      updatedAt: row.date,
      source: "自動資料",
      sourceNote: "持倉資料來自 SEC 13F；估值使用 Nasdaq 價格與 SEC XBRL 年度財務快照。",
    }),
  };
}

const valuedFunds: ValuedFund[] = snapshot.funds.map((fund) => ({
  ...fund,
  holdings: fund.holdings.map(valueHolding),
}));

const priceFormatter = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 });
const compactUsd = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatPrice(value: number) {
  return `US$ ${priceFormatter.format(value)}`;
}

function formatPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function valuationClass(stock: Stock | null) {
  if (!stock) return "unavailable";
  if (stock.upside >= 0.1) return "undervalued";
  if (stock.upside <= -0.1) return "overvalued";
  return "fair";
}

export default function FundsPage() {
  const { t } = useLanguage();

  const changeLabel = (holding: FundHolding) => {
    if (holding.changeType === "new") return t("新建倉", "New position");
    if (holding.changeType === "increased") return t(`加倉 ${formatPercent(holding.changePercent ?? 0)}`, `Added ${formatPercent(holding.changePercent ?? 0)}`);
    if (holding.changeType === "reduced") return t(`減倉 ${formatPercent(holding.changePercent ?? 0)}`, `Reduced ${formatPercent(holding.changePercent ?? 0)}`);
    return t("持股約持平", "Roughly unchanged");
  };

  const valuationLabel = (stock: Stock | null) => {
    if (!stock) return t("資料不足", "Insufficient data");
    if (stock.upside >= 0.1) return t("低估", "Undervalued");
    if (stock.upside <= -0.1) return t("高估", "Overvalued");
    return t("合理區間", "Fair range");
  };

  return (
    <main className="app-shell">
      <SiteHeader active="funds" />
      <div id="top" className="page-content funds-page">
        <header className="funds-hero">
          <div>
            <p className="eyebrow"><span className="eyebrow-line" />SMART MONEY / 01</p>
            <h1>{t("追蹤最會賺錢的資金，", "Track the most profitable capital,")}<br /><em>{t("但不盲目跟單。", "without blindly copying it.")}</em></h1>
            <p>{t(
              "依 LCH／Edmond de Rothschild 截至 2025 年底的累積淨獲利排名，追蹤全球前六大基金經理的公開美股持倉，並以穩盈模型重新檢查公允價值。",
              "Using LCH / Edmond de Rothschild cumulative net-gain rankings through 2025, this page tracks the disclosed U.S. equity holdings of the six leading managers and rechecks them with WenYing fair value.",
            )}</p>
          </div>
          <div className="funds-hero-stats">
            <div><span>{t("追蹤基金", "Managers")}</span><strong>6</strong><small>{t("全球累積淨獲利前六", "Top six cumulative net gains")}</small></div>
            <div><span>{t("最新申報季度", "Latest reported quarter")}</span><strong>2026 Q1</strong><small>{t("與 2025 Q4 比較", "Compared with 2025 Q4")}</small></div>
            <div><span>{t("公開持倉", "Valued holdings")}</span><strong>{valuedFunds.reduce((sum, fund) => sum + fund.holdings.length, 0)}</strong><small>{t("前十大及台灣相關 ADR", "Top holdings and Taiwan-related ADRs")}</small></div>
          </div>
        </header>

        <section className="fund-rank-grid" aria-label={t("基金累積淨獲利排名", "Cumulative net-gain ranking")}>
          {valuedFunds.map((fund) => (
            <a href={`#${fund.slug}`} className="fund-rank-card" key={fund.slug}>
              <span className="fund-rank-number">#{fund.rank}</span>
              <div><strong>{fund.name}</strong><small>{t("成立以來淨獲利", "Net gains since inception")}</small></div>
              <b>US$ {fund.cumulativeGainBn.toFixed(1)}B</b>
              <i>{t(`2025 年 +${fund.gain2025Bn.toFixed(1)}B`, `2025 +$${fund.gain2025Bn.toFixed(1)}B`)}</i>
            </a>
          ))}
        </section>

        <section className="fund-disclosure-note">
          <span>i</span>
          <p>{t(
            "13F 最晚可在季末後 45 天申報，只揭露特定美國上市多頭證券，不包含空頭、現金、債券、未上市資產或台股 2330 等海外直接持股；台灣曝險僅能看到 TSM、SIMO 等美國掛牌證券。因此這是延遲的大戶方向訊號，不是即時交易紀錄。",
            "13F filings may arrive up to 45 days after quarter-end and cover only specified U.S.-listed long securities. They omit shorts, cash, bonds, private assets, and direct overseas holdings such as Taiwan 2330; Taiwan exposure is visible only through U.S.-listed securities such as TSM or SIMO. Treat this as a delayed direction signal, not a live trade feed.",
          )}</p>
        </section>

        <div className="fund-sections">
          {valuedFunds.map((fund) => (
            <section className="fund-panel" id={fund.slug} key={fund.slug}>
              <div className="fund-panel-heading">
                <div><p className="section-kicker">FUND #{String(fund.rank).padStart(2, "0")}</p><h2>{fund.name}</h2><p>{fund.legalName}</p></div>
                <div className="fund-panel-meta"><span>{t("13F 多頭申報值", "Reported 13F long value")} <b>{compactUsd.format(fund.reportedLongValueUsd)}</b></span><span>{t("持倉日", "Holdings date")} <b>{fund.reportDate}</b></span><a href={fund.sourceUrl} target="_blank" rel="noreferrer">SEC 13F ↗</a></div>
              </div>
              <div className="fund-table-wrap">
                <table className="fund-table">
                  <thead><tr><th>{t("持倉", "Holding")}</th><th>{t("組合比重", "Portfolio weight")}</th><th>{t("持股變化", "Share change")}</th><th>{t("目前價格", "Price")}</th><th>{t("公允價值", "Fair value")}</th><th>{t("估值狀態", "Valuation")}</th></tr></thead>
                  <tbody>
                    {fund.holdings.map((holding) => {
                      const state = valuationClass(holding.stock);
                      return (
                        <tr key={`${fund.slug}-${holding.cusip}`}>
                          <td data-label={t("持倉", "Holding")}><div className="fund-stock-name"><span className="ticker-badge market-us">US</span><span><strong>{holding.ticker}</strong><small>{holding.stock?.name || holding.issuer}{holding.taiwanExposure ? <em>{t("台灣相關", "Taiwan-linked")}</em> : null}</small></span></div></td>
                          <td data-label={t("組合比重", "Portfolio weight")}><strong>{holding.portfolioWeight.toFixed(2)}%</strong><small>{compactUsd.format(holding.valueUsd)}</small></td>
                          <td data-label={t("持股變化", "Share change")}><span className={`fund-change ${holding.significantChange ? "significant" : ""}`}>{changeLabel(holding)}</span><small>{t("較上季持股數", "vs. prior-quarter shares")}</small></td>
                          <td data-label={t("目前價格", "Price")}><strong>{holding.stock ? formatPrice(holding.stock.price) : "—"}</strong><small>{holding.stock?.updatedAt || "—"}</small></td>
                          <td data-label={t("公允價值", "Fair value")}><strong>{holding.stock ? formatPrice(holding.stock.fairValue) : "—"}</strong><small>{holding.stock ? `${t("模型差距", "Model gap")} ${formatPercent(holding.stock.upside * 100)}` : t("不適用", "N/A")}</small></td>
                          <td data-label={t("估值狀態", "Valuation")}><span className={`fund-valuation status-${state}`}>{valuationLabel(holding.stock)}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>

        <section className="fund-method-note">
          <div><p className="section-kicker">DATA METHOD / 02</p><h2>{t("基金排名看長期獲利，", "Rank managers by long-term gains;")}<br /><em>{t("持倉則看最新公開變化。", "read holdings from the latest disclosure.")}</em></h2></div>
          <div><p>{t("基金排名資料截至 2025-12-31；持倉採 SEC 2026 Q1 Form 13F-HR，與 2025 Q4 持股數比較。公允價值使用與首頁相同的公開歷史資料模型，並非基金本身的買進成本或目標價。", "Fund rankings are as of 2025-12-31. Holdings use SEC 2026 Q1 Form 13F-HR and compare share counts with 2025 Q4. Fair value uses the same public historical-data model as the homepage; it is not the manager's purchase cost or price target.")}</p><a href={snapshot.rankingSourceUrl} target="_blank" rel="noreferrer">{t("查看排名來源", "View ranking source")} ↗</a></div>
        </section>

        <footer className="footer"><div><span>穩盈價值雷達 · WenYing Value Radar</span><small>{t("本網站僅供投資研究與教育用途，不構成投資或放空建議。", "For investment research and education only; this is not investment or short-selling advice.")}</small></div><span>{t("追蹤方向，仍要獨立估值", "Track direction, value independently")}</span></footer>
      </div>
    </main>
  );
}
