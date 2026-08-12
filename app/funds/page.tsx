"use client";

import Link from "next/link";
import { stockDetailHref } from "../../lib/navigation";
import { calculateStock, valuationTargets, type Stock, type StockInput } from "../../lib/valuation";
import { businessGroupForTicker, fundManagerPeProfiles, fundPortfolioBusinessPeProfiles, fundPortfolioOverlapProfiles, fundPortfolioPeProfiles, fundPortfolioPeSummary, institutionalSignalForTicker, type FundPeReference } from "../../lib/fund-signal";
import { buildComparableMap } from "../../lib/market-comparables";
import { normalizeSector } from "../../lib/sector-normalization";
import fundSnapshotJson from "../../lib/fund-holdings-snapshot.json";
import usMarketSnapshot from "../../lib/us-market-snapshot.json";
import { useEffect, useState } from "react";
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
  revenueGrowth?: number | null;
  fcfPerShare?: number | null;
  debtRatio?: number | null;
  revenuePerShare?: number | null;
  ebitPerShare?: number | null;
  ebitdaPerShare?: number | null;
  cashPerShare?: number | null;
  debtPerShare?: number | null;
  netMargin?: number | null;
  assetTurnover?: number | null;
  financialLeverage?: number | null;
  dataBasis?: StockInput["dataBasis"];
  epsHistory?: StockInput["epsHistory"];
  financialDataDate?: string | null;
  dividendPerShare: number;
  sector: string;
  date: string;
};

type ValuedHolding = FundHolding & { stock: Stock | null };
type ValuedFund = Omit<TrackedFund, "holdings"> & { holdings: ValuedHolding[] };

const snapshot = fundSnapshotJson as FundSnapshot;
const fallbackMarketRows = usMarketSnapshot as MarketRow[];
const fallbackMarketByTicker = new Map(fallbackMarketRows.map((row) => [row.ticker, row]));
const fallbackComparableByTicker = buildComparableMap(fallbackMarketRows);
const fundPeReferences: FundPeReference[] = fallbackMarketRows.map((row) => ({
  ticker: row.ticker,
  name: row.name,
  price: row.price,
  eps: row.eps,
  sector: row.sector,
  financialDataDate: row.financialDataDate ?? row.date,
}));
const fallbackFundPortfolioPe = fundPortfolioPeSummary(snapshot, fundPeReferences);
const fallbackFundSectorPeProfiles = fundPortfolioPeProfiles(snapshot, fundPeReferences);
const sectorProfileReportDate = snapshot.funds.map((fund) => fund.reportDate).find(Boolean) ?? "—";
const fundAbbreviations: Record<string, string> = {
  citadel: "Citadel",
  "de-shaw": "DES",
  bridgewater: "BW",
  millennium: "MLP",
  tci: "TCI",
  elliott: "Elliott",
};
const fundAbbreviationByName = new Map(snapshot.funds.map((fund) => [fund.name, fundAbbreviations[fund.slug] ?? fund.name]));

type FundValuationContext = {
  comparableByTicker: ReturnType<typeof buildComparableMap>;
  fundPortfolioPe?: ReturnType<typeof fundPortfolioPeSummary>;
  fundSectorPeProfiles: ReturnType<typeof fundPortfolioPeProfiles>;
  fundBusinessPeProfiles: ReturnType<typeof fundPortfolioBusinessPeProfiles>;
};

const fallbackValuationContext: FundValuationContext = {
  comparableByTicker: fallbackComparableByTicker,
  fundPortfolioPe: fallbackFundPortfolioPe,
  fundSectorPeProfiles: fallbackFundSectorPeProfiles,
  fundBusinessPeProfiles: fundPortfolioBusinessPeProfiles(snapshot, fundPeReferences),
};

function hasFiniteValue(value: unknown) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function valueHolding(
  holding: FundHolding,
  refreshedRow?: MarketRow,
  context: FundValuationContext = fallbackValuationContext,
): ValuedHolding {
  const row = refreshedRow ?? fallbackMarketByTicker.get(holding.ticker);
  if (!row || row.price <= 0) return { ...holding, stock: null };
  const hasRevenueGrowth = hasFiniteValue(row.revenueGrowth);
  const hasFcf = hasFiniteValue(row.fcfPerShare);
  const hasDebtRatio = hasFiniteValue(row.debtRatio);
  const revenueGrowth = hasRevenueGrowth ? Number(row.revenueGrowth) : 0;
  const fcfPerShare = hasFcf ? Number(row.fcfPerShare) : 0;
  const debtRatio = hasDebtRatio ? Number(row.debtRatio) : 0;
  const historicalFieldCount = [hasRevenueGrowth, hasFcf, hasDebtRatio].filter(Boolean).length;
  const roe = row.bvps > 0 ? (row.eps / row.bvps) * 100 : 0;
  const targets = valuationTargets(revenueGrowth, roe, debtRatio);
  const comparableMultiples = context.comparableByTicker.get(row.ticker.toUpperCase());
  const fundSectorPe = context.fundSectorPeProfiles.find((profile) => profile.sector === normalizeSector(row.ticker, row.name, row.sector));
  const fundBusinessPe = context.fundBusinessPeProfiles.find((profile) => profile.tickers.includes(row.ticker.toUpperCase()));
  return {
    ...holding,
    stock: calculateStock({
      ticker: row.ticker,
      name: row.name,
      market: "US",
      sector: row.sector,
      price: row.price,
      eps: Math.max(row.eps, 0),
      epsHistory: row.epsHistory,
      bvps: Math.max(row.bvps, 0),
      fcfPerShare,
      dividendPerShare: Math.max(row.dividendPerShare, 0),
      ...targets,
      targetPsMultiple: comparableMultiples?.psMedian ?? undefined,
      targetEvRevenueMultiple: comparableMultiples?.evRevenueMedian ?? undefined,
      targetEvEbitdaMultiple: comparableMultiples?.evEbitdaMedian ?? undefined,
      targetEvEbitMultiple: comparableMultiples?.evEbitMedian ?? undefined,
      comparableMultiples,
      revenueGrowth,
      roe,
      debtRatio,
      revenuePerShare: hasFiniteValue(row.revenuePerShare) ? Number(row.revenuePerShare) : undefined,
      ebitPerShare: hasFiniteValue(row.ebitPerShare) ? Number(row.ebitPerShare) : undefined,
      ebitdaPerShare: hasFiniteValue(row.ebitdaPerShare) ? Number(row.ebitdaPerShare) : undefined,
      cashPerShare: hasFiniteValue(row.cashPerShare) ? Number(row.cashPerShare) : undefined,
      debtPerShare: hasFiniteValue(row.debtPerShare) ? Number(row.debtPerShare) : undefined,
      netMargin: hasFiniteValue(row.netMargin) ? Number(row.netMargin) : undefined,
      assetTurnover: hasFiniteValue(row.assetTurnover) ? Number(row.assetTurnover) : undefined,
      financialLeverage: hasFiniteValue(row.financialLeverage) ? Number(row.financialLeverage) : undefined,
      dataBasis: row.dataBasis ?? "annual",
      uncertainty: historicalFieldCount >= 2 ? 0.27 : 0.4,
      qualityAvailable: hasRevenueGrowth && hasDebtRatio,
      dataCompleteness: historicalFieldCount >= 2 ? "historical" : "limited",
      ...(context.fundPortfolioPe ? { fundPortfolioPe: context.fundPortfolioPe } : {}),
      ...(fundSectorPe ? { fundSectorPe } : {}),
      ...(fundBusinessPe ? { fundBusinessPe } : {}),
      institutionalSignal: institutionalSignalForTicker(snapshot, row.ticker),
      updatedAt: row.date,
      financialDataDate: row.financialDataDate ?? row.date,
      source: "自動資料",
      sourceNote: "持倉資料來自 SEC 13F；估值使用 Nasdaq 價格與 SEC XBRL 年度歷史快照。資料不代表基金買進成本，也不包含空頭或避險部位；高成長股若標示低信心，不應直接判定高估。",
    }),
  };
}

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

function formatMultiple(value: number | null | undefined) {
  return value && Number.isFinite(value) ? `${value.toFixed(1)}x` : "—";
}

function businessGroupLabel(group: ReturnType<typeof businessGroupForTicker>, language: "zh" | "en") {
  const labels = {
    "memory-cycle": ["記憶體週期", "Memory cycle"],
    "ai-semiconductor": ["AI 半導體與設備", "AI semiconductors & equipment"],
    "platform-software": ["平台與軟體", "Platforms & software"],
    "ev-optionality": ["電動車與選擇權", "EV & optionality"],
    "financial-information": ["金融資訊與評級", "Financial information"],
    "industrial-transport": ["工業與運輸", "Industrial & transport"],
    "consumer-retail": ["消費與零售", "Consumer & retail"],
    healthcare: ["醫療", "Healthcare"],
    "real-estate": ["不動產", "Real estate"],
    "energy-materials": ["能源與原物料", "Energy & materials"],
    "telecom-media": ["電信與媒體", "Telecom & media"],
    other: ["其他", "Other"],
  } as const;
  return labels[group]?.[language === "zh" ? 0 : 1] ?? group;
}

function valuationClass(stock: Stock | null) {
  if (!stock) return "unavailable";
  if (stock.valuationConfidence === "low") return "uncertain";
  if (stock.upside >= 0.1) return "undervalued";
  if (stock.upside <= -0.1) return "overvalued";
  return "fair";
}

export default function FundsPage() {
  const { t } = useLanguage();
  const [refreshedRows, setRefreshedRows] = useState<MarketRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/funds", { headers: { Accept: "application/json" } })
      .then((response) => response.ok ? response.json() as Promise<{ rows?: MarketRow[] }> : null)
      .then((payload) => {
        if (!cancelled && payload?.rows?.length) setRefreshedRows(payload.rows);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const refreshedByTicker = new Map(refreshedRows.map((row) => [row.ticker.toUpperCase(), row]));
  const activeMarketByTicker = new Map(fallbackMarketRows.map((row) => [row.ticker.toUpperCase(), row]));
  refreshedRows.forEach((row) => activeMarketByTicker.set(row.ticker.toUpperCase(), row));
  const activeMarketRows = [...activeMarketByTicker.values()];
  const activePeReferences: FundPeReference[] = activeMarketRows.map((row) => ({
    ticker: row.ticker,
    name: row.name,
    price: row.price,
    eps: row.eps,
    sector: row.sector,
    financialDataDate: row.financialDataDate ?? row.date,
  }));
  const activeFundPortfolioPe = fundPortfolioPeSummary(snapshot, activePeReferences);
  const activeSectorPeProfiles = fundPortfolioPeProfiles(snapshot, activePeReferences);
  const activeBusinessPeProfiles = fundPortfolioBusinessPeProfiles(snapshot, activePeReferences);
  const activeFundManagerPeProfiles = fundManagerPeProfiles(snapshot, activePeReferences);
  const activeFundOverlapProfiles = fundPortfolioOverlapProfiles(snapshot, activePeReferences);
  const valuationContext: FundValuationContext = {
    comparableByTicker: buildComparableMap(activeMarketRows),
    fundPortfolioPe: activeFundPortfolioPe,
    fundSectorPeProfiles: activeSectorPeProfiles,
    fundBusinessPeProfiles: activeBusinessPeProfiles,
  };
  const valuedFunds: ValuedFund[] = snapshot.funds.map((fund) => ({
    ...fund,
    holdings: fund.holdings.map((holding) => valueHolding(
      holding,
      refreshedByTicker.get(holding.ticker.toUpperCase()),
      valuationContext,
    )),
  }));

  const changeLabel = (holding: FundHolding) => {
    if (holding.changeType === "new") return t("新建倉", "New position");
    if (holding.changeType === "increased") return t(`加倉 ${formatPercent(holding.changePercent ?? 0)}`, `Added ${formatPercent(holding.changePercent ?? 0)}`);
    if (holding.changeType === "reduced") return t(`減倉 ${formatPercent(holding.changePercent ?? 0)}`, `Reduced ${formatPercent(holding.changePercent ?? 0)}`);
    return t("持股約持平", "Roughly unchanged");
  };

  const overlapChangeLabel = (holding: FundHolding) => {
    if (holding.changeType === "new") return t("新建", "New");
    if (holding.changeType === "increased") return t(`加 ${formatPercent(holding.changePercent ?? 0)}`, `Add ${formatPercent(holding.changePercent ?? 0)}`);
    if (holding.changeType === "reduced") return t(`減 ${formatPercent(holding.changePercent ?? 0)}`, `Cut ${formatPercent(holding.changePercent ?? 0)}`);
    return t("持平", "Flat");
  };

  const valuationLabel = (stock: Stock | null) => {
    if (!stock) return t("資料不足", "Insufficient data");
    if (stock.valuationConfidence === "low") return t("低信心初估", "Low-confidence estimate");
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
            <h1>{t("追蹤最會賺錢的資金", "Track the most profitable capital")}<br /><em>{t("但不盲目跟單", "without blindly copying it")}</em></h1>
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
              <div><strong>{fund.name} <span className="fund-name-abbr">{fundAbbreviations[fund.slug] ?? fund.name}</span></strong><small>{t("成立以來淨獲利", "Net gains since inception")}</small></div>
              <b>US$ {fund.cumulativeGainBn.toFixed(1)}B</b>
              <i>{t(`2025 年 +${fund.gain2025Bn.toFixed(1)}B`, `2025 +$${fund.gain2025Bn.toFixed(1)}B`)}</i>
            </a>
          ))}
        </section>

        <section className="fund-disclosure-note">
          <span>i</span>
          <p>{t(
            "「前六名」是基金經理截至 2025 年底的歷史累積淨獲利排名，不代表每一檔現有持股都在本季低估。13F 最晚可在季末後 45 天申報，只揭露特定美國上市多頭證券，不包含買進成本、空頭、避險、現金、債券或未上市資產。因此這是延遲的大戶方向訊號，不能拿來判斷基金經理是否『買錯』。",
            "The top-six ranking reflects managers' cumulative historical net gains through 2025; it does not mean every current holding was undervalued this quarter. A 13F may arrive up to 45 days after quarter-end and omits purchase cost, shorts, hedges, cash, bonds, and private assets. Treat it as a delayed direction signal, not evidence that a manager bought well or badly.",
          )}</p>
        </section>

        <section className="fund-pattern-panel" aria-label={t("基金持股產業本益比分布", "Fund holding sector P/E profile")}>
          <div className="fund-pattern-heading">
            <div><p className="section-kicker">MARKET MULTIPLE / 02</p><h2>{t("六大基金把不同產業定價在哪裡", "How the six funds price different sectors")}</h2></div>
            <span>{t("僅統計公開獲利持股", "Profitable disclosed holdings only")}</span>
          </div>
          <div className="fund-pattern-grid">
            {activeSectorPeProfiles.slice(0, 6).map((profile) => (
              <div className="fund-pattern-card" key={profile.sector}>
                <div><strong>{profile.sector}</strong><small>{profile.sampleSize} {t("筆基金觀察", "fund observations")} · {profile.uniqueSampleSize ?? profile.sampleSize} {t("檔不重複股票", "unique tickers")}</small></div>
                <b>{formatMultiple(profile.uniqueMedianPe ?? profile.medianPe)}</b>
                <small>{t("不重複股票中位數 P/E", "unique-ticker median P/E")} · {formatMultiple(profile.uniqueLowerQuartilePe ?? profile.lowerQuartilePe)}–{formatMultiple(profile.uniqueUpperQuartilePe ?? profile.upperQuartilePe)}</small>
                <small>{t("不重複 P25–P75；基金觀察", "unique P25–P75; fund observations")} {formatMultiple(profile.lowerQuartilePe)}–{formatMultiple(profile.upperQuartilePe)}</small>
                <small>{t(`加倉 ${profile.increasedCount} · 減倉 ${profile.reducedCount}`, `Increased ${profile.increasedCount} · reduced ${profile.reducedCount}`)}</small>
                <small>{t(`財報${profile.medianFinancialAgeDays ?? "—"}天前 · ${profile.dataQuality === "stale" ? "偏舊" : profile.dataQuality === "fresh" ? "新鮮" : "混合"}`, `Financials median ${profile.medianFinancialAgeDays ?? "—"}d old · ${profile.dataQuality}`)}</small>
              </div>
            ))}
          </div>
          <p className="fund-pattern-footnote">{t(
            `這是六大基金截至 ${sectorProfileReportDate} 公開前十大多頭的市場本益比觀察，不是基金的買進成本，也不等於目標價；${activeFundPortfolioPe?.uniqueSampleSize ?? 0} 檔不重複股票的中位數為 ${formatMultiple(activeFundPortfolioPe?.uniqueMedianPe)}，財報年齡中位數約 ${activeFundPortfolioPe?.medianFinancialAgeDays ?? "—"} 天，${activeFundPortfolioPe?.staleSampleSize ?? 0} 筆已超過 240 天，需和週期性、獲利品質一起閱讀。`,
            `This is a market P/E view of the six managers' published top long holdings as of ${sectorProfileReportDate}, not purchase cost or a target price. The median across ${activeFundPortfolioPe?.uniqueSampleSize ?? 0} unique tickers is ${formatMultiple(activeFundPortfolioPe?.uniqueMedianPe)}; financials are a median ${activeFundPortfolioPe?.medianFinancialAgeDays ?? "—"} days old and ${activeFundPortfolioPe?.staleSampleSize ?? 0} observations are over 240 days old. Read it with cyclicality and earnings quality.`,
          )}</p>
        </section>

        <section className="fund-pattern-panel" aria-label={t("基金持股商業模式本益比分布", "Fund holding business-model P/E profile")}>
          <div className="fund-pattern-heading">
            <div><p className="section-kicker">BUSINESS MODEL / 03</p><h2>{t("熱門股的本益比，先看它屬於哪種生意", "Read a hot stock's P/E by business model first")}</h2></div>
            <span>{t("只統計可稽核的代表性代碼", "Curated representative tickers only")}</span>
          </div>
          <div className="fund-pattern-grid">
            {activeBusinessPeProfiles.slice(0, 8).map((profile) => {
              const labelZh = businessGroupLabel(profile.group, "zh");
              const labelEn = businessGroupLabel(profile.group, "en");
              return (
                <div className="fund-pattern-card" key={profile.group}>
                  <div><strong>{t(labelZh, labelEn)}</strong><small>{profile.uniqueSampleSize} {t("檔不重複股票", "unique tickers")} · {profile.sampleSize} {t("筆基金觀察", "fund observations")}</small></div>
                  <b>{formatMultiple(profile.uniqueMedianPe ?? profile.medianPe)}</b>
                  <small>{t("不重複股票 P/E 中位數", "Unique-ticker P/E median")} · {formatMultiple(profile.uniqueLowerQuartilePe ?? profile.lowerQuartilePe)}–{formatMultiple(profile.uniqueUpperQuartilePe ?? profile.upperQuartilePe)}</small>
                  <small>{t(`基金觀察中位數 ${formatMultiple(profile.medianPe)} · 不重複 P95 ${formatMultiple(profile.uniqueP95Pe ?? profile.p95Pe)}`, `Fund-observation median ${formatMultiple(profile.medianPe)} · unique P95 ${formatMultiple(profile.uniqueP95Pe ?? profile.p95Pe)}`)}</small>
                  <small>{t(`代碼 ${profile.tickers.join("、")}`, `Tickers ${profile.tickers.join(", ")}`)}</small>
                  <small>{t(`加倉 ${profile.increasedCount} · 減倉 ${profile.reducedCount}`, `Increased ${profile.increasedCount} · reduced ${profile.reducedCount}`)}</small>
                </div>
              );
            })}
          </div>
          <p className="fund-pattern-footnote">{t(
            "大字是去除重複持股後的 P/E 中位數；基金觀察中位數另列在下方，避免同一檔股票被多家基金持有就被重複放大。這些不是基金預測的合理本益比，也不是買進成本。群組只用來辨識記憶體週期、AI 半導體、平台軟體等定價差異；樣本不足或 EPS 非正數的股票不會被硬塞進群組。",
            "The headline is the unique-ticker P/E median; the fund-observation median is shown separately so repeated ownership does not amplify one stock. These are not forecast fair multiples or entry prices. Groups distinguish memory cycles, AI semiconductors and platforms; names with too little data or non-positive EPS are not forced into a bucket.",
          )}</p>
        </section>

        <section className="fund-pattern-panel" aria-label={t("各基金持股本益比分布", "P/E profile by fund manager")}>
          <div className="fund-pattern-heading">
            <div><p className="section-kicker">MANAGER SNAPSHOT / 04</p><h2>{t("六大基金各自承受多少本益比", "How much P/E each manager is carrying")}</h2></div>
            <span>{t("目前公開持股的統計快照", "Current disclosed-holdings snapshot")}</span>
          </div>
          <div className="fund-pattern-grid">
            {activeFundManagerPeProfiles.map((profile) => (
              <div className="fund-pattern-card" key={profile.fundName}>
                <div><strong>{profile.fundName} <span className="fund-name-abbr">{fundAbbreviationByName.get(profile.fundName)}</span></strong><small>{profile.uniqueSampleSize} {t("檔不重複獲利持股", "unique profitable holdings")} · {profile.increasedCount} {t("加倉／新建", "added/new")}</small></div>
                <b>{formatMultiple(profile.medianPe)}</b>
                <small>{t("P/E 中位數", "P/E median")} · {formatMultiple(profile.lowerQuartilePe)}–{formatMultiple(profile.upperQuartilePe)} {t("P25–P75", "P25–P75")}</small>
                <small>{t(`P95 ${formatMultiple(profile.p95Pe)} · 減倉 ${profile.reducedCount}`, `P95 ${formatMultiple(profile.p95Pe)} · reduced ${profile.reducedCount}`)}</small>
                <small>{profile.topBusinessGroups.length > 0 ? t(`主要群組：${profile.topBusinessGroups.map((group) => `${businessGroupLabel(group.group, "zh")} ${formatMultiple(group.medianPe)}`).join("、")}`, `Main groups: ${profile.topBusinessGroups.map((group) => `${businessGroupLabel(group.group, "en")} ${formatMultiple(group.medianPe)}`).join(", ")}`) : t("沒有足夠商業模式樣本", "Not enough business-model observations")}</small>
                <small>{t(`財報中位數 ${profile.medianFinancialAgeDays ?? "—"} 天前 · ${profile.dataQuality === "mixed" ? "混合新鮮度" : profile.dataQuality}`, `Financials median ${profile.medianFinancialAgeDays ?? "—"}d old · ${profile.dataQuality}`)}</small>
              </div>
            ))}
          </div>
          <p className="fund-pattern-footnote">{t(
            "這裡比較的是各基金公開申報持股目前的 trailing P/E，不是基金估的合理區間。P25–P75 反映組合內的分散程度；P95 可能由週期高峰或選擇權型股票拉高，不能單獨當成目標價。",
            "This compares trailing P/E from each manager's disclosed holdings, not the manager's target range. P25–P75 shows portfolio dispersion; P95 can be lifted by cycle peaks or optionality names and is not a target price by itself.",
          )}</p>
        </section>

        <section className="fund-overlap-panel" aria-label={t("六大基金共同持倉", "Six-fund overlapping holdings")}>
          <div className="fund-pattern-heading">
            <div><p className="section-kicker">CROWDING SIGNAL / 03</p><h2>{t("多家基金同時持有的股票", "Stocks held by multiple funds")}</h2></div>
            <span>{t("只作方向提示，不改寫公允價值", "Context only; does not change fair value")}</span>
          </div>
          <div className="fund-overlap-list">
            {activeFundOverlapProfiles.map((profile) => {
              const conviction = profile.increasedCount + profile.newCount;
              const fundPositions = valuedFunds.flatMap((fund) => {
                const holding = fund.holdings.find((item) => item.ticker === profile.ticker);
                return holding ? [{ fund, holding }] : [];
              });
              const direction = conviction > profile.reducedCount
                ? t("加倉偏多", "Accumulation")
                : conviction < profile.reducedCount
                  ? t("減倉偏多", "Distribution")
                  : t("方向分歧", "Mixed direction");
              return (
                <div className="fund-overlap-row" key={profile.ticker}>
                  <Link className="fund-overlap-stock" href={stockDetailHref(profile.ticker)}><strong>{profile.ticker}</strong><small>{profile.sector}</small></Link>
                  <div className="fund-overlap-summary"><b>{profile.fundCount} {t("家共同持有", "funds")}</b><small>{direction} · P/E {profile.pe && Number.isFinite(profile.pe) ? formatMultiple(profile.pe) : "—"}</small></div>
                  <div className="fund-overlap-funds" aria-label={t(`${profile.ticker} 基金持倉變化`, `${profile.ticker} manager changes`)}>
                    {fundPositions.map(({ fund, holding }) => <span className={`fund-position-change change-${holding.changeType}`} key={`${profile.ticker}-${fund.slug}`}><b>{fundAbbreviations[fund.slug] ?? fund.name}</b>{overlapChangeLabel(holding)}</span>)}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="fund-pattern-footnote">{t(
            `共同持倉只代表公開 13F 多頭重疊，不能推知買進成本、空頭或避險；P/E 以目前可取得的公開 EPS 計算，若財報過時、週期反轉或 EPS 接近零，解讀風險會明顯上升。`,
            "Overlap reflects disclosed 13F long positions only; it does not reveal entry cost, shorts, or hedges. P/E uses the latest available public EPS, so stale filings, cycle reversals, or near-zero EPS can make the signal unreliable.",
          )}</p>
        </section>

        <div className="fund-sections">
          {valuedFunds.map((fund) => (
            <section className="fund-panel" id={fund.slug} key={fund.slug}>
              <div className="fund-panel-heading">
                <div><p className="section-kicker">FUND #{String(fund.rank).padStart(2, "0")}</p><h2>{fund.name} <span className="fund-heading-abbr">{fundAbbreviations[fund.slug] ?? fund.name}</span></h2><p>{fund.legalName}</p></div>
                <div className="fund-panel-meta"><span>{t("13F 多頭申報值", "Reported 13F long value")} <b>{compactUsd.format(fund.reportedLongValueUsd)}</b></span><span>{t("持倉日", "Holdings date")} <b>{fund.reportDate}</b></span><a href={fund.sourceUrl} target="_blank" rel="noreferrer">SEC 13F ↗</a></div>
              </div>
              <div className="fund-table-wrap">
                <table className="fund-table">
                  <thead><tr><th>{t("持倉", "Holding")}</th><th>{t("組合比重", "Portfolio weight")}</th><th>{t("持股變化", "Share change")}</th><th>{t("目前價格", "Price")}</th><th>{t("公允價值", "Fair value")}</th><th>{t("成長市場參考", "Growth-market reference")}</th><th>{t("估值狀態", "Valuation")}</th></tr></thead>
                  <tbody>
                    {fund.holdings.map((holding) => {
                      const state = valuationClass(holding.stock);
                      return (
                        <tr key={`${fund.slug}-${holding.cusip}`}>
                          <td data-label={t("持倉", "Holding")}><Link className="fund-stock-link" href={stockDetailHref(holding.ticker)} aria-label={t(`查看 ${holding.ticker} 完整估值`, `View full valuation for ${holding.ticker}`)}><div className="fund-stock-name"><span className="ticker-badge market-us">US</span><span><strong>{holding.ticker}</strong><small>{holding.stock?.name || holding.issuer}{holding.taiwanExposure ? <em>{t("台灣相關", "Taiwan-linked")}</em> : null}</small></span></div><span className="fund-stock-arrow">→</span></Link></td>
                          <td data-label={t("組合比重", "Portfolio weight")}><strong>{holding.portfolioWeight.toFixed(2)}%</strong><small>{compactUsd.format(holding.valueUsd)}</small></td>
                          <td data-label={t("持股變化", "Share change")}><span className={`fund-change ${holding.significantChange ? "significant" : ""}`}>{changeLabel(holding)}</span><small>{t("較上季持股數", "vs. prior-quarter shares")}</small></td>
                          <td data-label={t("目前價格", "Price")}><strong>{holding.stock ? formatPrice(holding.stock.price) : "—"}</strong><small>{holding.stock?.updatedAt || "—"}</small></td>
                          <td data-label={t("公允價值", "Fair value")}><strong>{holding.stock ? formatPrice(holding.stock.fairValue) : "—"}</strong><small>{holding.stock ? holding.stock.valuationConfidence === "low" ? t("歷史資料 · 低信心", "Historical data · low confidence") : `${t("模型差距", "Model gap")} ${formatPercent(holding.stock.upside * 100)}` : t("不適用", "N/A")}</small></td>
                          <td data-label={t("成長市場參考", "Growth-market reference")}><strong>{holding.stock?.marketPricing?.enabled && holding.stock.marketPricing.fairValue !== null ? formatPrice(holding.stock.marketPricing.fairValue) : "—"}</strong><small>{holding.stock?.marketPricing?.enabled && holding.stock.marketPricing.selectedPe !== null ? `${t("市場本益比", "Market P/E")} ${formatMultiple(holding.stock.marketPricing.selectedPe)}` : t("未達兩項獨立訊號", "Fewer than two independent signals")}</small></td>
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
          <div><p>{t("基金排名資料截至 2025-12-31；持倉採 SEC 2026 Q1 Form 13F-HR，與 2025 Q4 持股數比較。估值納入可取得的年度營收成長、自由現金流與負債，但不代表基金買進成本。資料期間較舊、欄位不足或模型分歧較大時會標示『低信心初估』。", "Fund rankings are as of 2025-12-31. Holdings use SEC 2026 Q1 Form 13F-HR and compare share counts with 2025 Q4. Valuation includes available annual revenue growth, free cash flow, and leverage, but does not represent the manager's purchase cost. Older periods, incomplete fields, or wide model dispersion are marked low confidence.")}</p><a href={snapshot.rankingSourceUrl} target="_blank" rel="noreferrer">{t("查看排名來源", "View ranking source")} ↗</a></div>
        </section>

        <footer className="footer"><div><span>穩盈價值雷達 · WenYing Value Radar</span><small>{t("本網站僅供投資研究與教育用途，不構成投資或放空建議。", "For investment research and education only; this is not investment or short-selling advice.")}</small></div><span>{t("追蹤方向，仍要獨立估值", "Track direction, value independently")}</span></footer>
      </div>
    </main>
  );
}
