import { NextRequest, NextResponse } from "next/server";
import { clamp, valuationTargets, type StockInput } from "../../../lib/valuation";
import { fallbackUsSymbols, findArkUsSnapshot, type ArkUsSnapshotRow } from "../../../lib/ark-directory";
import { parseYahooTaiwanHtml } from "../../../lib/stock-directory";
import {
  aggregateDebtValues,
  annualMetricHistory,
  metricFactsFromConcepts,
  metricFromConcepts,
  metricsAlign,
  summarizeFinancialBasis,
  trailingTwelveMonthsGrowth,
  type SecCompanyFacts,
} from "../../../lib/sec-financials";
import tpexSnapshot from "../../../lib/tpex-snapshot.json";
import usMarketSnapshot from "../../../lib/us-market-snapshot.json";
import fundHoldingsSnapshot from "../../../lib/fund-holdings-snapshot.json";
import { fundPortfolioBusinessPeProfiles, fundPortfolioPeProfiles, fundPortfolioPeSummary, institutionalSignalForTicker } from "../../../lib/fund-signal";
import { buildComparableMap } from "../../../lib/market-comparables";
import { normalizeSector } from "../../../lib/sector-normalization";
import { buildTaiwanIndustryMap } from "../../../lib/taiwan-industry";
import { financialInputsFromTaiwanHistory, loadTaiwanFinancialHistory } from "../../../lib/taiwan-financials";
import { sanitizeMarketScanRatios } from "../../../lib/market-scan-sanitizer";
import { readValuationQueryCache, saveValuationQueryCache } from "../../../lib/valuation-cache";
import { marketStockFromRatio, type MarketScanRow } from "../../../lib/market-scan";
import { getRuntimeMarketScanMode } from "../../../lib/runtime-env";
import marketScanSnapshot from "../../../lib/market-scan-snapshot.json" with { type: "json" };
import {
  latestMarketQuoteFromCandles,
  parseYahooDailyCandles,
  type LatestMarketQuote,
  type YahooChartPayload,
} from "../../../lib/price-history";
import { loadUsEarningsReport } from "../../../lib/us-earnings";

type Market = "TW" | "US";

type ValuationRequest = {
  ticker?: string;
  market?: Market;
  capturedPrice?: number | null;
  capturedNav?: number | null;
  capturedName?: string | null;
  refresh?: boolean;
};

type TwseRatioRow = { Date: string; Code: string; Name: string; PEratio: string; PBratio: string };
type TwseDailyRow = { Date?: string; Code: string; Name: string; ClosingPrice: string };
type TpexRatioRow = {
  Date: string;
  SecuritiesCompanyCode: string;
  CompanyName: string;
  PriceEarningRatio: string;
  PriceBookRatio: string;
};
type TpexQuoteRow = {
  Date: string;
  SecuritiesCompanyCode: string;
  CompanyName: string;
  Close: string;
};

type TaiwanListedData = {
  twseRatios: TwseRatioRow[];
  twseDaily: TwseDailyRow[];
  twseCompanyData: TaiwanCompanyRow[];
};
type TaiwanOtcData = {
  tpexRatios: TpexRatioRow[];
  tpexQuotes: TpexQuoteRow[];
  tpexCompanyData: TaiwanCompanyRow[];
};
type TaiwanCompanyRow = Record<string, unknown>;

type SecSubmissions = { sicDescription?: string };

type SecTickerRow = { cik_str: number; ticker: string; title: string };

const SEC_HEADERS = {
  "User-Agent": "WenYing Value Radar fanhow@hotmail.com",
  Accept: "application/json",
};

let secTickerMapPromise: Promise<Record<string, SecTickerRow>> | null = null;
let taiwanMarketDataCache: {
  expiresAt: number;
  listed: Promise<TaiwanListedData>;
  otc: Promise<TaiwanOtcData>;
} | null = null;

function numeric(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

const fundPeReferences = [
  ...usMarketSnapshot.map((row) => ({ ticker: row.ticker, price: row.price, eps: row.eps, sector: row.sector, financialDataDate: row.financialDataDate ?? row.date })),
  ...tpexSnapshot.map((row) => ({ ticker: row.ticker, pe: numeric(row.pe) })),
];
// Building the full public-peer map is intentionally lazy. The snapshot has
// thousands of rows, and doing this during Worker module startup can exceed
// the platform's startup CPU budget before the first request is handled.
let usComparableMapCache: ReturnType<typeof buildComparableMap> | null = null;

function usComparableMultiples() {
  usComparableMapCache ??= buildComparableMap(usMarketSnapshot);
  return usComparableMapCache;
}
const fundSectorPeProfiles = fundPortfolioPeProfiles(fundHoldingsSnapshot, fundPeReferences);
const fundBusinessPeProfiles = fundPortfolioBusinessPeProfiles(fundHoldingsSnapshot, fundPeReferences);

function comparableInputForTicker(ticker: string) {
  const comparableMultiples = usComparableMultiples().get(ticker.toUpperCase());
  return comparableMultiples
    ? {
      targetPsMultiple: comparableMultiples.psMedian ?? undefined,
      targetEvRevenueMultiple: comparableMultiples.evRevenueMedian ?? undefined,
      targetEvEbitdaMultiple: comparableMultiples.evEbitdaMedian ?? undefined,
      targetEvEbitMultiple: comparableMultiples.evEbitMedian ?? undefined,
      comparableMultiples,
    }
    : {};
}

function hasFiniteValue(value: unknown) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function formatTaiwanDate(value?: string) {
  if (!value || !/^\d{7}$/.test(value)) return value || new Date().toISOString().slice(0, 10);
  const year = Number(value.slice(0, 3)) + 1911;
  return `${year}-${value.slice(3, 5)}-${value.slice(5, 7)}`;
}

function isTaiwanEtf(ticker: string) {
  return /^00[A-Z0-9]{2,5}$/.test(ticker);
}

function preferCapturedPrice(capturedValue: unknown, referencePrice: number) {
  const captured = numeric(capturedValue);
  if (!captured) return referencePrice;
  if (!referencePrice) return captured;
  const difference = Math.abs(captured - referencePrice) / referencePrice;
  return difference <= 0.35 ? captured : referencePrice;
}

async function fetchJson<T>(url: string, headers?: HeadersInit): Promise<T> {
  try {
    const response = await fetch(url, {
      headers,
      next: { revalidate: 60 * 60 * 12 },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`資料來源回應 ${response.status}`);
    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("資料來源回應")) throw error;
    throw new Error("公開資料暫時無法連線");
  }
}

async function fetchOptionalJson<T>(url: string, headers?: HeadersInit): Promise<T[]> {
  try {
    return await fetchJson<T[]>(url, headers);
  } catch {
    return [];
  }
}

async function fetchOptionalValue<T>(url: string, headers?: HeadersInit): Promise<T | null> {
  try {
    return await fetchJson<T>(url, headers);
  } catch {
    return null;
  }
}

function taiwanMarketData() {
  const now = Date.now();
  if (taiwanMarketDataCache && taiwanMarketDataCache.expiresAt > now) return taiwanMarketDataCache;
  const tpexHeaders = {
    Accept: "application/json",
    "User-Agent": "Mozilla/5.0 (compatible; WenYingValueRadar/1.0)",
  };
  const listed = Promise.all([
    fetchOptionalJson<TwseRatioRow>("https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL"),
    fetchOptionalJson<TwseDailyRow>("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"),
    fetchOptionalJson<TaiwanCompanyRow>("https://openapi.twse.com.tw/v1/opendata/t187ap03_L"),
  ]).then(([twseRatios, twseDaily, twseCompanyData]) => ({ twseRatios, twseDaily, twseCompanyData }));
  const otc = Promise.all([
    fetchOptionalJson<TpexRatioRow>("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis", tpexHeaders),
    fetchOptionalJson<TpexQuoteRow>("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes", tpexHeaders),
    fetchOptionalJson<TaiwanCompanyRow>("https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O", tpexHeaders),
  ]).then(([tpexRatios, tpexQuotes, tpexCompanyData]) => ({ tpexRatios, tpexQuotes, tpexCompanyData }));
  taiwanMarketDataCache = { expiresAt: now + 10 * 60 * 1_000, listed, otc };
  return taiwanMarketDataCache;
}

async function yahooTaiwanSnapshot(ticker: string) {
  try {
    const response = await fetch(`https://tw.stock.yahoo.com/quote/${encodeURIComponent(ticker)}/eps`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; WenYingValueRadar/1.0)" },
      next: { revalidate: 60 * 60 * 6 },
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return null;
    return parseYahooTaiwanHtml(await response.text());
  } catch {
    return null;
  }
}

async function yahooTaiwanMarketQuote(ticker: string, exchange: string | undefined, forceRefresh = false): Promise<LatestMarketQuote | null> {
  const symbol = `${ticker}.${exchange === "TPEx" ? "TWO" : "TW"}`;
  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d&events=div%2Csplits`,
      {
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; WenYingValueRadar/1.0)" },
        ...(forceRefresh ? { cache: "no-store" as const } : { next: { revalidate: 60 } }),
        signal: AbortSignal.timeout(4_000),
      },
    );
    if (!response.ok) return null;
    const payload = await response.json() as YahooChartPayload;
    return latestMarketQuoteFromCandles(parseYahooDailyCandles(payload, 5), "TW");
  } catch {
    return null;
  }
}

async function secTickerMap() {
  secTickerMapPromise ??= fetchJson<Record<string, SecTickerRow>>(
    "https://www.sec.gov/files/company_tickers.json",
    SEC_HEADERS,
  ).catch(() => Object.fromEntries(
    [...fallbackUsSymbols().values()].map((row, index) => [String(index), row]),
  ));
  return secTickerMapPromise;
}

type NasdaqQuoteResponse = {
  data?: {
    companyName?: string;
    primaryData?: { lastSalePrice?: string; lastTradeTimestamp?: string };
    secondaryData?: { lastSalePrice?: string; lastTradeTimestamp?: string } | null;
  } | null;
};

async function nasdaqMarketPrice(ticker: string) {
  try {
    const response = await fetch(`https://api.nasdaq.com/api/quote/${encodeURIComponent(ticker)}/info?assetclass=stocks`, {
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0 (compatible; WenYingValueRadar/1.0)",
      },
      next: { revalidate: 60 * 15 },
    });
    if (!response.ok) return { price: 0, name: "", updatedAt: "" };
    const payload = await response.json() as NasdaqQuoteResponse;
    const quote = payload.data?.primaryData ?? payload.data?.secondaryData;
    return {
      price: numeric(quote?.lastSalePrice?.replace("$", "")),
      name: payload.data?.companyName ?? "",
      updatedAt: quote?.lastTradeTimestamp ?? "",
    };
  } catch {
    return { price: 0, name: "", updatedAt: "" };
  }
}

type SnapshotFallbackReason = "unavailable" | "insufficient" | "unsupported-reporting";

function valueUsSnapshot(
  body: ValuationRequest,
  ticker: string,
  snapshot: ArkUsSnapshotRow,
  fallbackReason: SnapshotFallbackReason = "unavailable",
  lightweight = false,
) {
  const price = preferCapturedPrice(body.capturedPrice, numeric(snapshot.price));
  const eps = Math.max(numeric(snapshot.eps), 0);
  const bvps = Math.max(numeric(snapshot.bvps), 0);
  const hasRevenueGrowth = hasFiniteValue(snapshot.revenueGrowth);
  const hasFcf = hasFiniteValue(snapshot.fcfPerShare);
  const hasDebtRatio = hasFiniteValue(snapshot.debtRatio);
  const revenueGrowth = hasRevenueGrowth ? clamp(numeric(snapshot.revenueGrowth), -100, 200) : 0;
  const fcfPerShare = hasFcf ? numeric(snapshot.fcfPerShare) : 0;
  const debtRatio = hasDebtRatio ? clamp(numeric(snapshot.debtRatio), 0, 100) : 0;
  const roe = bvps > 0 ? (eps / bvps) * 100 : 0;
  const targets = valuationTargets(revenueGrowth, roe, debtRatio);
  const historicalFieldCount = [hasRevenueGrowth, hasFcf, hasDebtRatio].filter(Boolean).length;
  const fallbackContext = fallbackReason === "unsupported-reporting"
    ? "此證券的 SEC 申報不是可直接換算的 US-GAAP 美元每股資料，"
    : fallbackReason === "insufficient"
      ? "SEC 即時申報雖已取得，但估值核心欄位不足或期間無法可靠對齊，"
      : "SEC 即時連線暫時不可用，";
  if (!price || (!eps && !bvps)) throw new Error("內建財務快照不足，暫時無法建立可靠估值");

  return {
    ticker,
    name: body.capturedName?.trim() || snapshot.name,
    market: "US" as const,
    assetType: "EQUITY" as const,
    sector: normalizeSector(ticker, snapshot.name, snapshot.sector || "美股公開發行公司"),
    price,
    eps,
    epsHistory: snapshot.epsHistory,
    bvps,
    fcfPerShare,
    dividendPerShare: Math.max(numeric(snapshot.dividendPerShare), 0),
    ...targets,
    ...(lightweight ? {
      targetPb: snapshot.targetPb ?? targets.targetPb,
      targetPe: snapshot.targetPe ?? targets.targetPe,
      targetPsMultiple: snapshot.targetPsMultiple ?? undefined,
      targetEvRevenueMultiple: snapshot.targetEvRevenueMultiple ?? undefined,
      targetEvEbitdaMultiple: snapshot.targetEvEbitdaMultiple ?? undefined,
      ffoPerShare: snapshot.ffoPerShare ?? undefined,
      affoPerShare: snapshot.affoPerShare ?? undefined,
      targetFfoMultiple: snapshot.targetFfoMultiple ?? undefined,
    } : comparableInputForTicker(ticker)),
    revenueGrowth,
    roe,
    debtRatio,
    revenuePerShare: hasFiniteValue(snapshot.revenuePerShare) ? numeric(snapshot.revenuePerShare) : undefined,
    ebitPerShare: hasFiniteValue(snapshot.ebitPerShare) ? numeric(snapshot.ebitPerShare) : undefined,
    ebitdaPerShare: hasFiniteValue(snapshot.ebitdaPerShare) ? numeric(snapshot.ebitdaPerShare) : undefined,
    cashPerShare: hasFiniteValue(snapshot.cashPerShare) ? numeric(snapshot.cashPerShare) : undefined,
    debtPerShare: hasFiniteValue(snapshot.debtPerShare) ? numeric(snapshot.debtPerShare) : undefined,
    netMargin: hasFiniteValue(snapshot.netMargin) ? numeric(snapshot.netMargin) : undefined,
    assetTurnover: hasFiniteValue(snapshot.assetTurnover) ? numeric(snapshot.assetTurnover) : undefined,
    financialLeverage: hasFiniteValue(snapshot.financialLeverage) ? numeric(snapshot.financialLeverage) : undefined,
    uncertainty: historicalFieldCount >= 2 ? 0.27 : 0.4,
    qualityAvailable: hasRevenueGrowth && hasDebtRatio,
    dataCompleteness: historicalFieldCount >= 2 ? "historical" as const : "limited" as const,
    dataBasis: snapshot.dataBasis ?? "annual" as const,
    financialDataDate: snapshot.financialDataDate ?? snapshot.date,
    updatedAt: snapshot.date,
    source: "自動資料" as const,
    sourceNote: historicalFieldCount >= 2
      ? `${fallbackContext}本次改用網站內建的 Nasdaq／SEC 年度快照，包含可取得的 EPS、淨值、營收成長、自由現金流、負債與股利。這些仍是歷史資料；高成長或高本益比股票若顯示低信心，不應直接判定高估。`
      : `${fallbackContext}本次只能使用有限的 Nasdaq／SEC 年度快照。缺少現金流、成長或負債資料，結果為低信心初估，不應直接用來判定高估或低估。`,
  };
}

async function valueUsStock(body: ValuationRequest, ticker: string) {
  const map = await secTickerMap();
  const company = Object.values(map).find((row) => row.ticker.toUpperCase() === ticker);
  if (!company) throw new Error("SEC 公司名錄中找不到這個美股代碼");

  const snapshot = findArkUsSnapshot(ticker);
  if (!company.cik_str && snapshot) return valueUsSnapshot(body, ticker, snapshot);

  const cik = String(company.cik_str).padStart(10, "0");
  const [facts, submissions] = await Promise.all([
    fetchOptionalValue<SecCompanyFacts>(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, SEC_HEADERS),
    fetchOptionalValue<SecSubmissions>(`https://data.sec.gov/submissions/CIK${cik}.json`, SEC_HEADERS),
  ]);
  if (!facts) {
    if (snapshot) return valueUsSnapshot(body, ticker, snapshot);
    throw new Error("SEC 公開財務資料暫時無法連線，且此代碼尚無內建財務快照");
  }
  const taxonomy = facts.facts?.["us-gaap"] ? "us-gaap" : "ifrs-full";
  const isUsGaap = taxonomy === "us-gaap";
  if (!isUsGaap) {
    if (snapshot) return valueUsSnapshot(body, ticker, snapshot, "unsupported-reporting");
    throw new Error("此證券的 SEC 申報不是可直接換算的 US-GAAP 美元每股資料，且尚無內建財務快照");
  }

  const epsCandidate = metricFactsFromConcepts(
    facts,
    taxonomy,
    isUsGaap ? ["EarningsPerShareDiluted", "EarningsPerShareBasic"] : ["DilutedEarningsLossPerShare", "BasicEarningsLossPerShare"],
    ["USD/shares", "USD / shares"],
    "duration",
  );
  const epsMetric = epsCandidate?.metric ?? null;
  const epsHistory = annualMetricHistory(epsCandidate?.facts ?? [], 5);
  const equityMetric = metricFromConcepts(
    facts,
    taxonomy,
    isUsGaap ? ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"] : ["EquityAttributableToOwnersOfParent", "Equity"],
    ["USD"],
    "instant",
  );
  const sharesMetric = metricFromConcepts(
    facts,
    isUsGaap ? "dei" : taxonomy,
    isUsGaap ? ["EntityCommonStockSharesOutstanding"] : ["NumberOfSharesOutstanding", "NumberOfSharesIssuedAndFullyPaid"],
    ["shares"],
    "instant",
  ) ?? metricFromConcepts(
    facts,
    taxonomy,
    isUsGaap ? ["WeightedAverageNumberOfDilutedSharesOutstanding"] : ["DilutedWeightedAverageShares"],
    ["shares"],
    "duration",
  );
  const operatingCashMetric = metricFromConcepts(
    facts,
    taxonomy,
    isUsGaap ? ["NetCashProvidedByUsedInOperatingActivities"] : ["CashFlowsFromUsedInOperatingActivities"],
    ["USD"],
    "duration",
  );
  const capexMetric = metricFromConcepts(
    facts,
    taxonomy,
    isUsGaap ? ["PaymentsToAcquirePropertyPlantAndEquipment"] : ["PurchaseOfPropertyPlantAndEquipment"],
    ["USD"],
    "duration",
  );
  const revenueConcepts = isUsGaap
    ? ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"]
    : ["Revenue"];
  const revenueCandidate = metricFactsFromConcepts(facts, taxonomy, revenueConcepts, ["USD"], "duration");
  const revenueFacts = revenueCandidate?.facts ?? [];
  const revenueMetric = revenueCandidate?.metric ?? null;
  const revenueGrowthMetric = trailingTwelveMonthsGrowth(revenueFacts);
  const netIncomeMetric = metricFromConcepts(
    facts,
    taxonomy,
    isUsGaap ? ["NetIncomeLoss", "ProfitLoss"] : ["ProfitLoss"],
    ["USD"],
    "duration",
  );
  const ebitMetric = metricFromConcepts(
    facts,
    taxonomy,
    isUsGaap ? ["OperatingIncomeLoss"] : ["ProfitLossFromOperatingActivities"],
    ["USD"],
    "duration",
  );
  const depreciationMetric = metricFromConcepts(
    facts,
    taxonomy,
    isUsGaap
      ? ["DepreciationDepletionAndAmortization", "DepreciationDepletionAndAmortizationPropertyPlantAndEquipment", "Depreciation"]
      : ["DepreciationAndAmortisationExpense", "DepreciationExpense"],
    ["USD"],
    "duration",
  );
  const assetsMetric = metricFromConcepts(facts, taxonomy, ["Assets"], ["USD"], "instant");
  const liabilitiesMetric = metricFromConcepts(facts, taxonomy, ["Liabilities"], ["USD"], "instant");
  const cashMetric = metricFromConcepts(
    facts,
    taxonomy,
    isUsGaap ? ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"] : ["CashAndCashEquivalents"],
    ["USD"],
    "instant",
  );
  const shortInvestmentsMetric = metricFromConcepts(
    facts,
    taxonomy,
    isUsGaap ? ["ShortTermInvestments", "MarketableSecuritiesCurrent"] : ["OtherCurrentFinancialAssets"],
    ["USD"],
    "instant",
  );
  const totalDebtMetric = metricFromConcepts(
    facts,
    taxonomy,
    ["LongTermDebt"],
    ["USD"],
    "instant",
  );
  const noncurrentDebtMetric = metricFromConcepts(
    facts,
    taxonomy,
    ["LongTermDebtNoncurrent"],
    ["USD"],
    "instant",
  );
  const currentDebtMetric = metricFromConcepts(
    facts,
    taxonomy,
    ["DebtCurrent", "LongTermDebtCurrent", "ShortTermBorrowings"],
    ["USD"],
    "instant",
  );
  const taxMetric = metricFromConcepts(
    facts,
    taxonomy,
    isUsGaap ? ["IncomeTaxExpenseBenefit"] : ["IncomeTaxExpenseContinuingOperations"],
    ["USD"],
    "duration",
  );
  const pretaxMetric = metricFromConcepts(
    facts,
    taxonomy,
    isUsGaap ? ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest", "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments"] : ["ProfitLossBeforeTax"],
    ["USD"],
    "duration",
  );
  const dividendPerShareMetric = metricFromConcepts(
    facts,
    taxonomy,
    isUsGaap
      ? ["CommonStockDividendsPerShareDeclared", "CommonStockDividendsPerShareCashPaid"]
      : ["DividendsPaidPerShare"],
    ["USD/shares", "USD / shares"],
    "duration",
  );
  const dividendsPaidMetric = metricFromConcepts(
    facts,
    taxonomy,
    isUsGaap ? ["PaymentsOfDividendsCommonStock", "PaymentsOfDividends"] : ["DividendsPaid"],
    ["USD"],
    "duration",
  );

  const shares = numeric(sharesMetric?.value);
  const eps = numeric(epsMetric?.value);
  const bvps = shares > 0 ? numeric(equityMetric?.value) / shares : 0;
  const cashFlowsAligned = metricsAlign(operatingCashMetric, capexMetric);
  const trailingFcf = cashFlowsAligned
    ? numeric(operatingCashMetric?.value) - Math.abs(numeric(capexMetric?.value))
    : 0;
  const fcfPerShare = shares > 0 && cashFlowsAligned ? trailingFcf / shares : 0;
  const directDividend = numeric(dividendPerShareMetric?.value);
  const paidDividendPerShare = shares > 0
    ? Math.abs(numeric(dividendsPaidMetric?.value)) / shares
    : 0;
  const dividendPerShare = Math.max(
    directDividend || paidDividendPerShare,
    0,
  );
  const dividendBasisMetric = directDividend
    ? dividendPerShareMetric
    : paidDividendPerShare
      ? dividendsPaidMetric
      : null;

  if (!(eps > 0 || bvps > 0 || fcfPerShare > 0)) {
    if (snapshot) return valueUsSnapshot(body, ticker, snapshot, "insufficient");
    throw new Error("公開申報資料不足，暫時無法建立可靠估值");
  }

  const marketQuote = await nasdaqMarketPrice(ticker);
  const price = preferCapturedPrice(body.capturedPrice, marketQuote.price);

  const revenueGrowth = revenueGrowthMetric ? revenueGrowthMetric.rate * 100 : 0;
  const roeSourcesAligned = Boolean(
    netIncomeMetric?.end && netIncomeMetric.end === equityMetric?.end,
  );
  const roe = roeSourcesAligned && equityMetric?.value
    ? (numeric(netIncomeMetric?.value) / Math.abs(equityMetric.value)) * 100
    : 0;
  const balanceSheetAligned = metricsAlign(assetsMetric, liabilitiesMetric);
  const debtRatio = balanceSheetAligned && assetsMetric?.value
    ? (numeric(liabilitiesMetric?.value) / Math.abs(assetsMetric.value)) * 100
    : 0;
  const hasRevenueGrowth = Boolean(revenueGrowthMetric);
  const hasFcf = Boolean(shares > 0 && cashFlowsAligned);
  const hasDebtRatio = Boolean(balanceSheetAligned && assetsMetric?.value && liabilitiesMetric?.value);
  const historicalFieldCount = [hasRevenueGrowth, hasFcf, hasDebtRatio].filter(Boolean).length;

  if (!price) {
    if (snapshot) return valueUsSnapshot(body, ticker, snapshot, "unavailable");
    throw new Error("找不到可用價格，請改用含股價的方舟截圖或手動輸入");
  }

  const perShare = (value: number | null | undefined) => (
    shares > 0 && typeof value === "number" && Number.isFinite(value)
      ? value / shares
      : undefined
  );
  const debt = aggregateDebtValues({
    total: totalDebtMetric?.value,
    current: currentDebtMetric?.value,
    noncurrent: noncurrentDebtMetric?.value,
  });
  const cashValues = [cashMetric?.value, shortInvestmentsMetric?.value]
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
  const cashAndInvestments = cashValues.length > 0
    ? cashValues.reduce((sum, value) => sum + value, 0)
    : null;
  const ebitdaSourcesAligned = metricsAlign(ebitMetric, depreciationMetric);
  const ebitda = ebitdaSourcesAligned
    ? numeric(ebitMetric?.value) + Math.max(numeric(depreciationMetric?.value), 0)
    : null;
  const revenue = revenueMetric?.value;
  const netMarginSourcesAligned = metricsAlign(netIncomeMetric, revenueMetric);
  const taxSourcesAligned = metricsAlign(taxMetric, pretaxMetric);
  const taxRate = taxSourcesAligned && numeric(pretaxMetric?.value) > 0
    ? clamp(Math.abs(numeric(taxMetric?.value)) / Math.abs(numeric(pretaxMetric?.value)), 0, 0.35)
    : undefined;
  const basisSummary = summarizeFinancialBasis([
    epsMetric,
    revenueMetric,
    revenueGrowthMetric,
    netIncomeMetric,
    ebitMetric,
    cashFlowsAligned ? operatingCashMetric : null,
    cashFlowsAligned ? capexMetric : null,
    ebitdaSourcesAligned ? depreciationMetric : null,
    taxSourcesAligned ? taxMetric : null,
    taxSourcesAligned ? pretaxMetric : null,
    dividendBasisMetric,
  ]);
  const dataBasis = basisSummary.basis;
  const financialDataDate = basisSummary.end || sharesMetric?.end || equityMetric?.end;
  const dataIsMixed = dataBasis === "estimated";
  const dataHasHistoricalDepth = historicalFieldCount >= 2 && !dataIsMixed;
  const assetTurnoverSourcesAligned = Boolean(
    revenueMetric?.end && revenueMetric.end === assetsMetric?.end,
  );
  const leverageSourcesAligned = metricsAlign(assetsMetric, equityMetric);
  const dataBasisLabel = dataBasis === "ltm"
    ? "最近十二個月（年度加本期 YTD、減去年同期 YTD）"
    : dataBasis === "annual"
      ? "最新完整年度"
      : "混合期間估算（來源期間或截止日未完全對齊）";
  const targets = valuationTargets(revenueGrowth, roe, debtRatio);
  return {
    ticker,
    name: body.capturedName?.trim() || facts.entityName || marketQuote.name || company.title,
    market: "US" as const,
    assetType: "EQUITY" as const,
    sector: normalizeSector(ticker, facts.entityName || marketQuote.name || company.title, submissions?.sicDescription || "美股公開發行公司"),
    price,
    eps,
    epsHistory,
    bvps,
    fcfPerShare,
    dividendPerShare,
    revenuePerShare: perShare(revenue),
    ebitPerShare: perShare(ebitMetric?.value),
    ebitdaPerShare: perShare(ebitda),
    debtPerShare: perShare(debt),
    cashPerShare: perShare(cashAndInvestments),
    taxRate,
    netMargin: netMarginSourcesAligned && revenue && revenue > 0
      ? (numeric(netIncomeMetric?.value) / revenue) * 100
      : undefined,
    assetTurnover: assetTurnoverSourcesAligned && assetsMetric?.value && revenue !== undefined
      ? revenue / Math.abs(assetsMetric.value)
      : undefined,
    financialLeverage: leverageSourcesAligned && equityMetric?.value
      ? Math.abs(numeric(assetsMetric?.value) / equityMetric.value)
      : undefined,
    ...targets,
    ...comparableInputForTicker(ticker),
    ...(snapshot ? {
      targetPb: snapshot.targetPb ?? targets.targetPb,
      targetPe: snapshot.targetPe ?? targets.targetPe,
      targetPsMultiple: snapshot.targetPsMultiple ?? undefined,
      targetEvRevenueMultiple: snapshot.targetEvRevenueMultiple ?? undefined,
      targetEvEbitdaMultiple: snapshot.targetEvEbitdaMultiple ?? undefined,
      ffoPerShare: snapshot.ffoPerShare ?? undefined,
      affoPerShare: snapshot.affoPerShare ?? undefined,
      targetFfoMultiple: snapshot.targetFfoMultiple ?? undefined,
    } : {}),
    revenueGrowth: clamp(revenueGrowth, -100, 200),
    roe: clamp(roe, -100, 200),
    debtRatio: clamp(debtRatio, 0, 100),
    uncertainty: dataHasHistoricalDepth ? 0.25 : 0.4,
    qualityAvailable: !dataIsMixed && hasRevenueGrowth && hasDebtRatio,
    dataCompleteness: dataHasHistoricalDepth ? "historical" as const : "limited" as const,
    dataBasis,
    financialDataDate,
    updatedAt: marketQuote.updatedAt || financialDataDate || new Date().toISOString().slice(0, 10),
    source: "自動資料" as const,
    sourceNote: `財務數據取自 SEC EDGAR 公開申報，期間基礎為${dataBasisLabel}；價格${numeric(body.capturedPrice) && price === numeric(body.capturedPrice) ? "採用方舟截圖" : "採用 Nasdaq 市場資訊"}。模型只使用公開申報、價格與透明假設；若資料期間、欄位完整度或模型一致性不足，會降低信心，不把結果當成確定的高低估判斷`,
  };
}

async function valueTwStock(body: ValuationRequest, ticker: string) {
  const marketData = taiwanMarketData();
  const { twseRatios, twseDaily, twseCompanyData } = await marketData.listed;
  const twseRatio = twseRatios.find((row) => row.Code === ticker);
  const twseQuote = twseDaily.find((row) => row.Code === ticker);
  const { tpexRatios, tpexQuotes, tpexCompanyData } = twseRatio && twseQuote
    ? { tpexRatios: [] as TpexRatioRow[], tpexQuotes: [] as TpexQuoteRow[], tpexCompanyData: [] as TaiwanCompanyRow[] }
    : await marketData.otc;
  const tpexRatio = tpexRatios.find((row) => row.SecuritiesCompanyCode === ticker);
  const tpexQuote = tpexQuotes.find((row) => row.SecuritiesCompanyCode === ticker);
  const snapshot = tpexSnapshot.find((row) => row.ticker === ticker);
  const yahoo = !twseRatio && !tpexRatio && !snapshot ? await yahooTaiwanSnapshot(ticker) : null;
  const ratio = twseRatio
    ? { date: twseRatio.Date, name: twseRatio.Name, pe: twseRatio.PEratio, pb: twseRatio.PBratio, exchange: "TWSE" }
    : tpexRatio
      ? { date: tpexRatio.Date, name: tpexRatio.CompanyName, pe: tpexRatio.PriceEarningRatio, pb: tpexRatio.PriceBookRatio, exchange: "TPEx" }
      : snapshot
        ? { date: snapshot.date, name: snapshot.name, pe: snapshot.pe, pb: snapshot.pb, exchange: "TPEx" }
      : yahoo
        ? {
          date: yahoo.updatedAt,
          name: yahoo.name,
          pe: yahoo.eps > 0 ? String(yahoo.price / yahoo.eps) : "0",
          pb: yahoo.bvps > 0 ? String(yahoo.price / yahoo.bvps) : "0",
          exchange: "TPEx",
        }
      : null;
  const quote = twseQuote
    ? { date: twseQuote.Date, name: twseQuote.Name, close: twseQuote.ClosingPrice, exchange: "TWSE" }
    : tpexQuote
      ? { date: tpexQuote.Date, name: tpexQuote.CompanyName, close: tpexQuote.Close, exchange: "TPEx" }
      : snapshot
        ? { date: snapshot.date, name: snapshot.name, close: snapshot.close, exchange: "TPEx" }
      : yahoo
        ? { date: yahoo.updatedAt, name: yahoo.name, close: String(yahoo.price), exchange: "TPEx" }
      : null;
  const listingBoard = ratio?.exchange === "TWSE" ? "TWSE" as const : ratio?.exchange === "TPEx" ? "TPEx" as const : undefined;
  const industry = listingBoard === "TWSE"
    ? buildTaiwanIndustryMap(twseCompanyData, "TWSE").get(ticker)
    : listingBoard === "TPEx"
      ? buildTaiwanIndustryMap(tpexCompanyData, "TPEx").get(ticker)
      : undefined;
  const liveQuote = await yahooTaiwanMarketQuote(ticker, ratio?.exchange ?? quote?.exchange, Boolean(body.refresh));
  const capturedNav = numeric(body.capturedNav);
  const closingPrice = numeric(quote?.close);
  const officialPriceDate = formatTaiwanDate(quote?.date);
  const useLiveQuote = Boolean(liveQuote && (!closingPrice || liveQuote.date >= officialPriceDate));
  const currentMarketPrice = useLiveQuote ? liveQuote?.price ?? closingPrice : closingPrice;
  const price = preferCapturedPrice(body.capturedPrice, currentMarketPrice);
  const priceDate = useLiveQuote ? liveQuote?.date : officialPriceDate;

  if (isTaiwanEtf(ticker)) {
    if (!capturedNav) throw new Error("ETF 需要含「即時淨值」欄位的方舟截圖才能估值");
    const etfName = body.capturedName?.trim() || quote?.name || ticker;
    const isLeveragedOrInverse = /(?:正2|反1|2X|INVERSE|LEVERAGED)/i.test(etfName) || /[LR]$/.test(ticker);
    return {
      ticker,
      name: etfName,
      market: "TW" as const,
      assetType: "ETF" as const,
      sector: "ETF",
      listingBoard,
      price: price || capturedNav,
      ...(useLiveQuote && liveQuote ? {
        priceChange: liveQuote.change,
        priceChangePercent: liveQuote.changePercent,
        previousClose: liveQuote.previousClose,
        limitUpPrice: liveQuote.limitUpPrice ?? undefined,
        isLimitUp: liveQuote.isLimitUp,
        priceSource: "Yahoo Finance",
      } : {}),
      eps: capturedNav,
      bvps: capturedNav,
      fcfPerShare: capturedNav,
      targetPe: 1,
      targetPb: 1,
      targetFcfMultiple: 1,
      revenueGrowth: 0,
      roe: 0,
      debtRatio: 0,
      uncertainty: 0.02,
      qualityAvailable: false,
      dataCompleteness: "limited" as const,
      riskOverride: isLeveragedOrInverse ? "高" as const : "中" as const,
      dataBasis: "market-ratio" as const,
      financialDataDate: ratio?.date || quote?.date,
      updatedAt: priceDate || formatTaiwanDate(ratio?.date),
      source: "方舟截圖" as const,
      sourceNote: `ETF 以方舟畫面中的即時淨值（iNAV）作為參考值；它不是股票企業價值估算，且盤後可能失去時效${isLeveragedOrInverse ? "。此標的是槓桿或反向 ETF，已標示為高風險" : ""}`,
    };
  }

  if (!ratio || !price) throw new Error("TWSE／TPEx 公開資料中找不到此代碼或最新價格");
  const pe = numeric(ratio.pe);
  const pb = numeric(ratio.pb);
  // The latest quote is display/current-price data. Keep EPS and BVPS tied to
  // the exchange ratio date so an intraday move cannot rewrite fundamentals.
  const ratioReferencePrice = closingPrice || currentMarketPrice;
  const rawEps = pe > 0 ? ratioReferencePrice / pe : 0;
  const rawBvps = pb > 0 ? ratioReferencePrice / pb : 0;
  if (!rawEps && !rawBvps) throw new Error("目前沒有足夠的本益比／淨值比資料可建立估值");
  const financialHistory = await loadTaiwanFinancialHistory(ticker);
  const historicalInputs = financialInputsFromTaiwanHistory(financialHistory);
  const revenueGrowth = historicalInputs?.revenueGrowth ?? 0;
  const debtRatio = historicalInputs?.debtRatio ?? 0;

  const sanitized = sanitizeMarketScanRatios({
    ticker,
    name: body.capturedName?.trim() || ratio.name || quote?.name || ticker,
    market: "TW",
    price,
    pe,
    pb,
    eps: rawEps,
    bvps: rawBvps,
    revenueGrowth,
    debtRatio,
    fcfPerShare: historicalInputs?.fcfPerShare,
    revenuePerShare: historicalInputs?.revenuePerShare,
    ebitPerShare: historicalInputs?.ebitPerShare,
    cashPerShare: historicalInputs?.cashPerShare,
    debtPerShare: historicalInputs?.debtPerShare,
  });

  const eps = sanitized.eps;
  const bvps = sanitized.bvps;
  const roe = bvps > 0 ? (eps / bvps) * 100 : 0;
  const targets = valuationTargets(revenueGrowth, roe, debtRatio);
  const targetPe = sanitized.targetPe ?? targets.targetPe;
  const targetPb = sanitized.targetPb ?? targets.targetPb;
  const hasHistoricalFinancials = financialHistory.length >= 3 && Boolean(historicalInputs);

  return {
    ticker,
    name: body.capturedName?.trim() || ratio.name || quote?.name || ticker,
    market: "TW" as const,
    assetType: "EQUITY" as const,
    sector: ratio.exchange === "TWSE" ? "台灣上市公司" : "台灣上櫃公司",
    industry,
    listingBoard,
    price,
    ...(useLiveQuote && liveQuote ? {
      priceChange: liveQuote.change,
      priceChangePercent: liveQuote.changePercent,
      previousClose: liveQuote.previousClose,
      limitUpPrice: liveQuote.limitUpPrice ?? undefined,
      isLimitUp: liveQuote.isLimitUp,
      priceSource: "Yahoo Finance",
    } : {}),
    eps,
    epsHistory: historicalInputs?.epsHistory,
    bvps,
    fcfPerShare: sanitized.fcfPerShare ?? historicalInputs?.fcfPerShare ?? 0,
    normalizedFcfPerShare: sanitized.normalizedFcfPerShare,
    dividendPerShare: 0,
    targetPe,
    targetPb,
    targetPsMultiple: sanitized.targetPsMultiple,
    targetFcfMultiple: 0,
    revenueGrowth,
    roe,
    debtRatio,
    revenuePerShare: sanitized.revenuePerShare ?? historicalInputs?.revenuePerShare,
    ebitPerShare: sanitized.ebitPerShare ?? historicalInputs?.ebitPerShare,
    cashPerShare: sanitized.cashPerShare ?? historicalInputs?.cashPerShare,
    debtPerShare: sanitized.debtPerShare ?? historicalInputs?.debtPerShare,
    netMargin: historicalInputs?.netMargin,
    assetTurnover: historicalInputs?.assetTurnover,
    financialLeverage: historicalInputs?.financialLeverage,
    taxRate: historicalInputs?.taxRate,
    uncertainty: hasHistoricalFinancials ? 0.25 : eps > 0 && bvps > 0 ? 0.3 : 0.36,
    qualityAvailable: hasHistoricalFinancials,
    dataCompleteness: hasHistoricalFinancials ? "historical" as const : "limited" as const,
    dataBasis: hasHistoricalFinancials ? "estimated" as const : "market-ratio" as const,
    financialDataDate: historicalInputs?.financialDataDate ?? formatTaiwanDate(ratio.date),
    updatedAt: priceDate || formatTaiwanDate(ratio.date),
    source: "自動資料" as const,
    sourceNote: hasHistoricalFinancials
      ? `本益比與股價淨值比取自 ${ratio.exchange === "TWSE" ? "臺灣證券交易所" : "證券櫃檯買賣中心"} OpenAPI；目前價格優先採 Yahoo Finance 最新可取得日行情，並以 Yahoo Finance 公開年度財務序列補充 ${financialHistory.length} 年 EPS、營收、現金流及資產負債資料。最新行情只影響估值差距，不會改寫財務比率日的 EPS／淨值。不同來源與期間可能不完全對齊，因此標示為混合期間估算並保留不確定性。`
      : `本益比與股價淨值比取自 ${ratio.exchange === "TWSE" ? "臺灣證券交易所" : "證券櫃檯買賣中心"} OpenAPI；目前價格優先採 Yahoo Finance 最新可取得日行情。最新行情只影響估值差距，不會改寫財務比率日的 EPS／淨值。多年財報暫時無法取得，因此僅作初步估值且不提供品質分數`,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ValuationRequest;
    const ticker = String(body.ticker ?? "").trim().toUpperCase().replace(/\.(TW|TWO)$/, "");
    if (!ticker || !/^[A-Z0-9-]{1,10}$/.test(ticker)) {
      return NextResponse.json({ error: "股票代碼格式不正確" }, { status: 400 });
    }
    const market: Market = body.market ?? (/^\d/.test(ticker) ? "TW" : "US");
    const canUseCache = !body.refresh && !numeric(body.capturedPrice) && !numeric(body.capturedNav) && !body.capturedName?.trim();
    if (canUseCache) {
      const cached = await readValuationQueryCache(market, ticker);
      if (cached) return NextResponse.json({ stock: cached, cache: "d1" });
    }
    let stock: StockInput;
    if (getRuntimeMarketScanMode() === "snapshot") {
      if (market === "US") {
        const snapshot = findArkUsSnapshot(ticker);
        if (!snapshot) throw new Error("此代碼尚無部署時公開財務快照");
        stock = valueUsSnapshot(body, ticker, snapshot, "unavailable", true);
      } else {
        const snapshotRow = marketScanSnapshot.taiwanUniverse.find((row) => row.ticker === ticker);
        if (!snapshotRow) throw new Error("此代碼尚無部署時台股公開資料快照");
        const snapshotPrice = preferCapturedPrice(body.capturedPrice, numeric(snapshotRow.price));
        const snapshotStock = marketStockFromRatio({
          ...(snapshotRow as MarketScanRow),
          price: snapshotPrice,
          name: body.capturedName?.trim() || snapshotRow.name,
        });
        if (!snapshotStock) throw new Error("部署時公開資料不足，暫時無法建立可靠估值");
        stock = snapshotStock;
      }
    } else {
      stock = market === "TW" ? await valueTwStock(body, ticker) : await valueUsStock(body, ticker);
    }
    const institutionalSignal = institutionalSignalForTicker(fundHoldingsSnapshot, ticker);
    const fundPortfolioPe = fundPortfolioPeSummary(fundHoldingsSnapshot, fundPeReferences);
    const fundSectorPe = market === "US"
      ? fundSectorPeProfiles.find((profile) => profile.sector === normalizeSector(stock.ticker, stock.name, stock.sector))
      : undefined;
    const fundBusinessPe = market === "US"
      ? fundBusinessPeProfiles.find((profile) => profile.tickers.includes(stock.ticker.toUpperCase()))
      : undefined;
    const earningsReport = market === "US" ? await loadUsEarningsReport(stock.ticker) : undefined;
    const enrichedStock: StockInput = {
        ...stock,
        ...(institutionalSignal ? { institutionalSignal } : {}),
        ...(fundPortfolioPe ? { fundPortfolioPe } : {}),
        ...(fundSectorPe ? { fundSectorPe } : {}),
        ...(fundBusinessPe ? { fundBusinessPe } : {}),
        ...(earningsReport ? { earningsReport } : {}),
    };
    if (!numeric(body.capturedPrice) && !numeric(body.capturedNav) && !body.capturedName?.trim()) {
      await saveValuationQueryCache(enrichedStock);
    }
    return NextResponse.json({ stock: enrichedStock, cache: "live" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "暫時無法取得估值資料";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
