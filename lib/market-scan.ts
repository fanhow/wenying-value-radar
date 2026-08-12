import { calculateStock, valuationTargets, type Market, type StockInput } from "./valuation.ts";
import {
  fundPortfolioPeProfiles,
  fundPortfolioBusinessPeProfiles,
  fundPortfolioPeSummary,
  institutionalSignalForTicker,
  type FundPeReference,
} from "./fund-signal.ts";
import { buildComparableMap, type ComparableMultiples } from "./market-comparables.ts";
import { normalizeSector } from "./sector-normalization.ts";
import fundHoldingsSnapshot from "./fund-holdings-snapshot.json" with { type: "json" };
import usMarketSnapshot from "./us-market-snapshot.json" with { type: "json" };
import tpexSnapshot from "./tpex-snapshot.json" with { type: "json" };

const fundPeReferences: FundPeReference[] = [
  ...usMarketSnapshot.map((row) => ({ ticker: row.ticker, name: row.name, price: row.price, eps: row.eps, sector: row.sector, financialDataDate: row.financialDataDate ?? row.date })),
  ...tpexSnapshot.map((row) => ({ ticker: row.ticker, pe: numeric(row.pe) })),
];
const fundPortfolioPe = fundPortfolioPeSummary(fundHoldingsSnapshot, fundPeReferences);
const fundSectorPeProfiles = fundPortfolioPeProfiles(fundHoldingsSnapshot, fundPeReferences);
const fundBusinessPeProfiles = fundPortfolioBusinessPeProfiles(fundHoldingsSnapshot, fundPeReferences);
const comparableMapCache = new WeakMap<MarketScanRow[], ReadonlyMap<string, ComparableMultiples>>();

function comparableMapForUniverse(universe: MarketScanRow[]) {
  // The U.S. snapshot contains thousands of rows. Build peer multiples once,
  // on the first market scan request, rather than during Worker startup.
  const cached = comparableMapCache.get(universe);
  if (cached) return cached;
  const built = buildComparableMap(universe);
  comparableMapCache.set(universe, built);
  return built;
}

export type MarketScanRow = {
  ticker: string;
  name: string;
  price: string | number;
  pe: string | number;
  pb: string | number;
  date?: string;
  sector: string;
  market?: Market;
  eps?: string | number;
  bvps?: string | number;
  revenueGrowth?: string | number | null;
  fcfPerShare?: string | number | null;
  debtRatio?: string | number | null;
  revenuePerShare?: string | number | null;
  ebitPerShare?: string | number | null;
  ebitdaPerShare?: string | number | null;
  cashPerShare?: string | number | null;
  debtPerShare?: string | number | null;
  netMargin?: string | number | null;
  assetTurnover?: string | number | null;
  financialLeverage?: string | number | null;
  epsHistory?: StockInput["epsHistory"];
  dataBasis?: StockInput["dataBasis"];
  financialDataDate?: string | null;
  dividendPerShare?: string | number;
  marketCap?: string | number;
  volume?: string | number;
  comparableMultiples?: ComparableMultiples;
};

export type ValuationDirection = "undervalued" | "overvalued";

export const TAIWAN_MIN_DAILY_VOLUME = 100_000;
export const TAIWAN_MIN_DAILY_TURNOVER = 5_000_000;

function numeric(value: unknown) {
  const parsed = Number(String(value ?? "").replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasFiniteValue(value: unknown) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

export function hasCandidateLiquidity(row: MarketScanRow) {
  const market = row.market ?? "TW";
  const volume = numeric(row.volume);
  const price = numeric(row.price);
  if (market === "US") {
    return price >= 3 && numeric(row.marketCap) >= 500_000_000 && volume >= 100_000;
  }
  return /^\d{4}$/.test(row.ticker)
    && !/^00/.test(row.ticker)
    && volume >= TAIWAN_MIN_DAILY_VOLUME
    && price * volume >= TAIWAN_MIN_DAILY_TURNOVER;
}

export function marketStockFromRatio(row: MarketScanRow, comparableMultiples?: ComparableMultiples): StockInput | null {
  const market = row.market ?? "TW";
  if (market === "TW" ? !/^\d{4}$/.test(row.ticker) : !/^[A-Z][A-Z0-9.-]{0,9}$/.test(row.ticker)) return null;
  const price = numeric(row.price);
  const pe = numeric(row.pe);
  const pb = numeric(row.pb);
  const eps = numeric(row.eps ?? 0) || (price > 0 && pe > 0 ? price / pe : 0);
  const bvps = numeric(row.bvps ?? 0) || (price > 0 && pb > 0 ? price / pb : 0);
  if (!price || (!eps && !bvps)) return null;
  if (market === "US" && (price < 3 || numeric(row.marketCap ?? 0) < 500_000_000 || numeric(row.volume ?? 0) < 100_000)) return null;
  // U.S. asset-light companies can report a zero/negative book value after
  // buybacks or acquisitions. Keep them in the scan when earnings are usable;
  // the valuation engine will exclude P/B while retaining P/E, P/S, EV and DCF
  // models. Taiwan ratio rows still require both PE and PB inputs.
  if (market === "TW" ? eps <= 0 || bvps <= 0 : eps <= 0 && bvps <= 0) return null;

  const hasRevenueGrowth = hasFiniteValue(row.revenueGrowth);
  const hasFcf = hasFiniteValue(row.fcfPerShare);
  const hasDebtRatio = hasFiniteValue(row.debtRatio);
  const hasRevenuePerShare = hasFiniteValue(row.revenuePerShare);
  const hasEbitPerShare = hasFiniteValue(row.ebitPerShare);
  const hasEbitdaPerShare = hasFiniteValue(row.ebitdaPerShare);
  const hasCashPerShare = hasFiniteValue(row.cashPerShare);
  const hasDebtPerShare = hasFiniteValue(row.debtPerShare);
  const hasNetMargin = hasFiniteValue(row.netMargin);
  const hasAssetTurnover = hasFiniteValue(row.assetTurnover);
  const hasFinancialLeverage = hasFiniteValue(row.financialLeverage);
  const revenueGrowth = hasRevenueGrowth ? numeric(row.revenueGrowth) : 0;
  const fcfPerShare = hasFcf ? numeric(row.fcfPerShare) : 0;
  const debtRatio = hasDebtRatio ? numeric(row.debtRatio) : 0;
  const historicalFieldCount = [hasRevenueGrowth, hasFcf, hasDebtRatio].filter(Boolean).length;
  const roe = bvps > 0 ? (eps / bvps) * 100 : 0;
  const targets = valuationTargets(revenueGrowth, roe, debtRatio);
  const fundSectorPe = market === "US"
    ? fundSectorPeProfiles.find((profile) => profile.sector === normalizeSector(row.ticker, row.name, row.sector))
    : undefined;
  const fundBusinessPe = market === "US"
    ? fundBusinessPeProfiles.find((profile) => profile.tickers.includes(String(row.ticker).trim().toUpperCase()))
    : undefined;
  const institutionalSignal = institutionalSignalForTicker(fundHoldingsSnapshot, row.ticker);
  const input: StockInput = {
    ticker: row.ticker,
    name: row.name,
    market,
    sector: normalizeSector(row.ticker, row.name, row.sector),
    price,
    eps,
    epsHistory: row.epsHistory,
    bvps,
    fcfPerShare,
    dividendPerShare: Math.max(numeric(row.dividendPerShare ?? 0), 0),
    ...targets,
    revenueGrowth,
    roe,
    debtRatio,
    revenuePerShare: hasRevenuePerShare ? numeric(row.revenuePerShare) : undefined,
    ebitPerShare: hasEbitPerShare ? numeric(row.ebitPerShare) : undefined,
    ebitdaPerShare: hasEbitdaPerShare ? numeric(row.ebitdaPerShare) : undefined,
    cashPerShare: hasCashPerShare ? numeric(row.cashPerShare) : undefined,
    debtPerShare: hasDebtPerShare ? numeric(row.debtPerShare) : undefined,
    netMargin: hasNetMargin ? numeric(row.netMargin) : undefined,
    assetTurnover: hasAssetTurnover ? numeric(row.assetTurnover) : undefined,
    financialLeverage: hasFinancialLeverage ? numeric(row.financialLeverage) : undefined,
    targetPsMultiple: comparableMultiples?.psMedian ?? undefined,
    targetEvRevenueMultiple: comparableMultiples?.evRevenueMedian ?? undefined,
    targetEvEbitdaMultiple: comparableMultiples?.evEbitdaMedian ?? undefined,
    targetEvEbitMultiple: comparableMultiples?.evEbitMedian ?? undefined,
    comparableMultiples,
    uncertainty: historicalFieldCount >= 2 ? 0.27 : eps > 0 && bvps > 0 ? 0.3 : 0.4,
    updatedAt: row.date,
    dataBasis: row.dataBasis ?? (market === "US" ? "annual" : "market-ratio"),
    financialDataDate: row.financialDataDate ?? row.date,
    source: "自動資料",
    sourceNote: market === "TW"
      ? "台股市場掃描以 TWSE／TPEx 公開的收盤價、本益比與股價淨值比進行第一輪篩選；未納入現金流與成長預測，請再查看完整財報後決策。"
      : "美股市場掃描以 Nasdaq 價格及 SEC XBRL 年度財務快照進行第一輪篩選，納入可取得的營收成長、自由現金流與負債資料；資料期間較舊、欄位不足或模型分歧較大時只具低信心。",
    qualityAvailable: hasRevenueGrowth && hasDebtRatio,
    dataCompleteness: historicalFieldCount >= 2 ? "historical" : "limited",
    ...(fundPortfolioPe ? { fundPortfolioPe } : {}),
    ...(fundSectorPe ? { fundSectorPe } : {}),
    ...(fundBusinessPe ? { fundBusinessPe } : {}),
    ...(institutionalSignal ? { institutionalSignal } : {}),
  };
  return input;
}

export function marketCandidateFromRatio(row: MarketScanRow): StockInput | null {
  if (!hasCandidateLiquidity(row)) return null;
  const input = marketStockFromRatio(row, row.comparableMultiples);
  if (!input) return null;
  const valuation = validValuation(input);
  return valuation && valuation.upside >= 0.1 && valuation.upside <= 1 ? input : null;
}

function validValuation(stock: StockInput) {
  const valuation = calculateStock(stock);
  const hasValidModel = valuation.models.some((model) => Number.isFinite(model.value) && model.value > 0);
  return Number.isFinite(valuation.fairValue) && valuation.fairValue > 0 && hasValidModel
    ? valuation
    : null;
}

export function selectTopMarketCandidates(universe: MarketScanRow[], limit = 20) {
  return selectMarketCandidates(universe, "undervalued", limit);
}

export function selectMarketCandidates(
  universe: MarketScanRow[],
  direction: ValuationDirection,
  limit = 20,
  comparableMap?: ReadonlyMap<string, ComparableMultiples>,
) {
  const profiles = comparableMap ?? comparableMapForUniverse(universe);
  return universe
    .filter(hasCandidateLiquidity)
    .map((row) => marketStockFromRatio(row, profiles.get(String(row.ticker).trim().toUpperCase())))
    .filter((stock): stock is StockInput => stock !== null)
    .map((stock) => ({ stock, valuation: validValuation(stock) }))
    .filter((row): row is { stock: StockInput; valuation: ReturnType<typeof calculateStock> } => row.valuation !== null)
    .map(({ stock, valuation }) => ({ stock, upside: valuation.upside }))
    .filter(({ upside }) => direction === "undervalued"
      ? upside >= 0.1 && upside <= 1
      : upside <= -0.1)
    .sort((left, right) => direction === "undervalued"
      ? right.upside - left.upside
      : left.upside - right.upside)
    .slice(0, limit)
    .map(({ stock }) => stock);
}
