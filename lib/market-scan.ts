import { calculateStock, valuationTargets, type Market, type StockInput } from "./valuation.ts";

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
  dataBasis?: StockInput["dataBasis"];
  financialDataDate?: string | null;
  dividendPerShare?: string | number;
  marketCap?: string | number;
  volume?: string | number;
};

export type ValuationDirection = "undervalued" | "overvalued";

function numeric(value: unknown) {
  const parsed = Number(String(value ?? "").replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasFiniteValue(value: unknown) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

export function marketStockFromRatio(row: MarketScanRow): StockInput | null {
  const market = row.market ?? "TW";
  if (market === "TW" ? !/^\d{4}$/.test(row.ticker) : !/^[A-Z][A-Z0-9.-]{0,9}$/.test(row.ticker)) return null;
  const price = numeric(row.price);
  const pe = numeric(row.pe);
  const pb = numeric(row.pb);
  const eps = numeric(row.eps ?? 0) || (price > 0 && pe > 0 ? price / pe : 0);
  const bvps = numeric(row.bvps ?? 0) || (price > 0 && pb > 0 ? price / pb : 0);
  if (!price || (!eps && !bvps)) return null;
  if (market === "US" && (price < 3 || numeric(row.marketCap ?? 0) < 500_000_000 || numeric(row.volume ?? 0) < 100_000)) return null;
  if (eps <= 0 || bvps <= 0) return null;

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
  const input: StockInput = {
    ticker: row.ticker,
    name: row.name,
    market,
    sector: row.sector,
    price,
    eps,
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
  };
  return input;
}

export function marketCandidateFromRatio(row: MarketScanRow): StockInput | null {
  const input = marketStockFromRatio(row);
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
) {
  return universe
    .map(marketStockFromRatio)
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
