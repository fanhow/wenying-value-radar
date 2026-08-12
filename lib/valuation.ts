import { matchStructuralThemes, type StructuralTheme } from "./market-themes.ts";
import type { FundBusinessPeProfile, FundPortfolioPeSummary, FundSectorPeProfile, InstitutionalSignal } from "./fund-signal.ts";
import type { ComparableMultiples } from "./market-comparables.ts";
import { classifyFinancialFreshness, financialAgeDays, type FinancialFreshness } from "./data-freshness.ts";

export type Market = "TW" | "US";
export type RiskLevel = "低" | "中" | "高";
export type DataCompleteness = "complete" | "historical" | "limited";
export type ValuationConfidence = "high" | "medium" | "low";
export type ValuationModelCategory = "intrinsic" | "relative" | "asset" | "income" | "fund";
export type ValuationModelStatus = "applied" | "excluded";
/**
 * Model families prevent repeated horizons or related multiples from
 * dominating the central value.  A family is a weighting bucket, not a claim
 * that the underlying methods are identical.
 */
export type ValuationModelFamily =
  | "earnings-relative"
  | "sales-relative"
  | "cashflow-relative"
  | "cashflow-dcf"
  | "enterprise-relative"
  | "operating-dcf"
  | "asset"
  | "residual-income"
  | "income"
  | "fund";

export type MarketPricingAssessment = {
  enabled: boolean;
  selectedPe: number | null;
  peLow: number | null;
  peHigh: number | null;
  fairValue: number | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  triggers: string[];
  source: string;
  note: string;
  referenceSector?: string;
  referenceBusinessGroup?: string;
  referenceSampleSize?: number;
  referenceUniqueSampleSize?: number;
};

export type EarningsHistoryPoint = {
  value: number;
  start?: string;
  end?: string;
  basis?: "annual" | "ltm";
};

export type EarningsNormalizationMethod = "reported" | "median-history";

export type StockInput = {
  ticker: string;
  name: string;
  market: Market;
  sector: string;
  price: number;
  eps: number;
  bvps: number;
  fcfPerShare: number;
  dividendPerShare?: number;
  targetPe: number;
  targetPb: number;
  targetFcfMultiple: number;
  targetPsMultiple?: number;
  discountRate?: number;
  terminalGrowth?: number;
  revenueGrowth: number;
  roe: number;
  debtRatio: number;
  uncertainty: number;
  assetType?: "EQUITY" | "ETF";
  updatedAt?: string;
  source?: "示範資料" | "手動輸入" | "自動資料" | "方舟截圖";
  sourceNote?: string;
  qualityAvailable?: boolean;
  riskOverride?: RiskLevel;
  dataCompleteness?: DataCompleteness;

  // Optional public-data inputs. Rates accept either decimal (0.0425) or percent (4.25).
  beta?: number;
  riskFreeRate?: number;
  marketRiskPremium?: number;
  countryRiskPremium?: number;
  preTaxCostOfDebt?: number;
  taxRate?: number;
  debtPerShare?: number;
  cashPerShare?: number;
  revenuePerShare?: number;
  ebitdaPerShare?: number;
  ebitPerShare?: number;
  normalizedFcfPerShare?: number;
  /** Optional public FFO/AFFO per-share value for REITs and property vehicles. */
  ffoPerShare?: number;
  affoPerShare?: number;
  netMargin?: number;
  assetTurnover?: number;
  financialLeverage?: number;
  targetEvRevenueMultiple?: number;
  targetEvEbitdaMultiple?: number;
  targetEvEbitMultiple?: number;
  targetFfoMultiple?: number;
  dataBasis?: "annual" | "ltm" | "historical" | "estimated" | "market-ratio";
  financialDataDate?: string;
  institutionalSignal?: InstitutionalSignal;
  fundPortfolioPe?: FundPortfolioPeSummary;
  /** Optional same-sector P/E profile from the latest six-fund top holdings. */
  fundSectorPe?: FundSectorPeProfile;
  /** Optional curated business-model P/E profile from the latest six-fund holdings. */
  fundBusinessPe?: FundBusinessPeProfile;
  comparableMultiples?: ComparableMultiples;
  /** Public annual/LTM EPS observations used only for historical normalization. */
  epsHistory?: EarningsHistoryPoint[];
};

export type ValuationModel = {
  id: string;
  category: ValuationModelCategory;
  family: ValuationModelFamily;
  status: "applied";
  label: string;
  value: number;
  weight: number;
  rangeLow: number;
  rangeHigh: number;
  explanation: string;
};

export type ExcludedValuationModel = {
  id: string;
  category: ValuationModelCategory;
  status: "excluded";
  label: string;
  reason: string;
};

export type ValuationAssumptions = {
  beta: number;
  riskFreeRate: number;
  marketRiskPremium: number;
  countryRiskPremium: number;
  costOfEquity: number;
  preTaxCostOfDebt: number;
  afterTaxCostOfDebt: number;
  taxRate: number;
  debtWeight: number;
  equityWeight: number;
  wacc: number;
  structuralThemes: StructuralTheme[];
  historicalStartingGrowth: number;
  structuralGrowthPrior: number;
  structuralBlendWeight: number;
  baseTargetPe: number;
  marketPeAnchor: number;
  marketPeUpperQuartile: number;
  marketPeP95: number;
  marketPeReferenceSector?: string;
  marketPeReferenceSampleSize?: number;
  marketPeReferenceUniqueSampleSize?: number;
  marketPricingEnabled: boolean;
  marketPricingTriggers: string[];
  marketPricingNote: string;
  marketPeReferenceBusinessGroup?: string;
  comparableSector?: string;
  comparablePeerGroup?: string;
  comparablePeerCount?: number;
  comparablePePeerCount?: number;
  comparablePsPeerCount?: number;
  comparableEvRevenuePeerCount?: number;
  comparableEvEbitdaPeerCount?: number;
  comparableEvEbitPeerCount?: number;
  comparablePffoPeerCount?: number;
  comparableDataBasis?: string;
  comparableAsOf?: string | null;
  comparableMethod?: string;
  themeAsOf?: string;
  themeReviewAfter?: string;
  startingGrowth: number;
  terminalGrowth: number;
  aggregationMethod: "average" | "family-balanced-average" | "single-model";
  reportedFcfPerShare: number;
  normalizedFcfPerShare: number;
  fcfNormalizationApplied: boolean;
  reportedEpsPerShare: number;
  normalizedEpsPerShare: number;
  epsNormalizationApplied: boolean;
  epsNormalizationMethod: EarningsNormalizationMethod;
  epsHistoryCount: number;
  dataBasis: string;
  financialDataDate?: string;
  financialFreshness: FinancialFreshness;
  financialAgeDays: number | null;
  defaulted: string[];
};

export type Stock = StockInput & {
  models: ValuationModel[];
  excludedModels: ExcludedValuationModel[];
  assumptions: ValuationAssumptions;
  wacc: number;
  discountRate: number;
  terminalGrowth: number;
  fairValue: number;
  rangeLow: number;
  rangeHigh: number;
  upside: number;
  qualityScore: number;
  risk: RiskLevel;
  valuationConfidence: ValuationConfidence;
  historicalCaution: boolean;
  historicalCautionReasons: string[];
  financialFreshness: FinancialFreshness;
  financialAgeDays: number | null;
  marketPricing?: MarketPricingAssessment;
  reportedEpsPerShare: number;
  normalizedEpsPerShare: number;
  epsNormalizationApplied: boolean;
  epsNormalizationMethod: EarningsNormalizationMethod;
  epsHistoryCount: number;
};

type ModelCandidate = Omit<ValuationModel, "status" | "weight" | "family">;

export function valuationModelFamily(id: string): ValuationModelFamily {
  if (id === "etf-inav") return "fund";
  if (id === "pe" || id === "pe-peer") return "earnings-relative";
  if (id === "p-ffo") return "earnings-relative";
  if (id === "p-sales") return "sales-relative";
  if (id === "p-fcf") return "cashflow-relative";
  if (id === "epv" || id.startsWith("dcf-fcf-")) return "cashflow-dcf";
  if (id === "ev-revenue" || id === "ev-ebitda" || id === "ev-ebit") return "enterprise-relative";
  if (id.startsWith("dcf-ebitda-") || id.startsWith("dcf-revenue-")) return "operating-dcf";
  if (id === "pb" || id === "graham") return "asset";
  if (id === "roe-residual") return "residual-income";
  if (id === "ddm-stable") return "income";
  return "enterprise-relative";
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function numeric(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function rate(value: unknown, fallback: number) {
  const parsed = numeric(value, fallback);
  return Math.abs(parsed) > 1 ? parsed / 100 : parsed;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function modelRange(value: number, low: number, high: number) {
  const finiteValues = [value, low, high].map((item) => Math.max(numeric(item), 0));
  return {
    value: clamp(finiteValues[0], Math.min(...finiteValues), Math.max(...finiteValues)),
    rangeLow: Math.min(...finiteValues),
    rangeHigh: Math.max(...finiteValues),
  };
}

function createModel(
  id: string,
  category: ValuationModelCategory,
  label: string,
  value: number,
  low: number,
  high: number,
  explanation: string,
): ModelCandidate | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const range = modelRange(value, low, high);
  return { id, category, label, ...range, explanation };
}

function addExcluded(
  excludedModels: ExcludedValuationModel[],
  id: string,
  category: ValuationModelCategory,
  label: string,
  reason: string,
) {
  excludedModels.push({ id, category, status: "excluded", label, reason });
}

function descriptorMatches(input: StockInput, expression: RegExp) {
  return expression.test(input.name + " " + input.sector);
}

function isFinancialCompany(input: StockInput) {
  return descriptorMatches(
    input,
    /bank|finance|financial|insurance|reinsurance|mortgage|reit|銀行|金控|保險|證券|金融/i,
  );
}

function defaultBeta(input: StockInput, financial: boolean) {
  if (financial) return 1;
  if (descriptorMatches(input, /utility|utilities|telecom|staples|公用|電信|民生消費/i)) return 0.85;
  if (descriptorMatches(input, /semiconductor|software|technology|internet|半導體|軟體|科技|網路/i)) return 1.15;
  if (descriptorMatches(input, /industrial|materials|energy|cyclical|工業|原物料|能源|景氣循環/i)) return 1.05;
  return input.market === "TW" ? 1.05 : 1;
}

export function valuationTargets(revenueGrowth: number, roe: number, debtRatio: number) {
  const growth = clamp(numeric(revenueGrowth), -50, 80);
  const profitability = clamp(numeric(roe), -50, 100);
  const leveragePenalty = Math.max(numeric(debtRatio) - 75, 0) * 0.03;
  return {
    targetPe: clamp(
      12 + Math.max(growth, 0) * 0.35 + Math.max(profitability - 10, 0) * 0.12 - leveragePenalty,
      8,
      36,
    ),
    targetPb: clamp(
      0.8 + Math.max(profitability, 0) * 0.06 + Math.max(growth, 0) * 0.03 - leveragePenalty * 0.08,
      0.8,
      12,
    ),
    targetFcfMultiple: clamp(
      12 + Math.max(growth, 0) * 0.35 + Math.max(profitability - 10, 0) * 0.08 - leveragePenalty,
      10,
      32,
    ),
  };
}

export function calculateWacc(input: StockInput) {
  const financial = isFinancialCompany(input);
  const defaulted: string[] = [];
  const recordDefault = (missing: boolean, label: string) => {
    if (missing) defaulted.push(label);
  };

  const beta = clamp(numeric(input.beta, defaultBeta(input, financial)), 0.35, 2.5);
  recordDefault(input.beta === undefined, "beta（市場／產業預設）");
  const riskFreeRate = clamp(
    rate(input.riskFreeRate, input.market === "TW" ? 0.0175 : 0.0425),
    0,
    0.12,
  );
  recordDefault(input.riskFreeRate === undefined, "無風險利率");
  const marketRiskPremium = clamp(
    rate(input.marketRiskPremium, input.market === "TW" ? 0.06 : 0.0525),
    0.025,
    0.12,
  );
  recordDefault(input.marketRiskPremium === undefined, "市場風險溢酬");
  const countryRiskPremium = clamp(
    rate(input.countryRiskPremium, input.market === "TW" ? 0.005 : 0),
    0,
    0.08,
  );
  recordDefault(input.countryRiskPremium === undefined, "國家風險溢酬");
  const capmCostOfEquity = riskFreeRate + beta * marketRiskPremium + countryRiskPremium;
  const costOfEquity = clamp(
    input.discountRate === undefined
      ? capmCostOfEquity
      : rate(input.discountRate, capmCostOfEquity),
    0.045,
    0.25,
  );
  if (input.discountRate !== undefined) defaulted.push("股權成本採用明確輸入值");
  const preTaxCostOfDebt = clamp(
    rate(
      input.preTaxCostOfDebt,
      input.market === "TW" ? Math.max(riskFreeRate + 0.015, 0.035) : Math.max(riskFreeRate + 0.015, 0.055),
    ),
    0.01,
    0.2,
  );
  recordDefault(input.preTaxCostOfDebt === undefined, "稅前債務成本");
  const taxRate = clamp(rate(input.taxRate, input.market === "TW" ? 0.2 : 0.21), 0, 0.45);
  recordDefault(input.taxRate === undefined, "有效稅率");
  const afterTaxCostOfDebt = preTaxCostOfDebt * (1 - taxRate);

  const debtPerShare = Math.max(numeric(input.debtPerShare), 0);
  const earningsEquityProxy = numeric(input.eps) > 0 && numeric(input.targetPe) > 0
    ? numeric(input.eps) * numeric(input.targetPe)
    : 0;
  const equityCapitalPerShare = Math.max(numeric(input.bvps), earningsEquityProxy, 0);
  const capital = debtPerShare + equityCapitalPerShare;
  const debtWeight = capital > 0 && debtPerShare > 0 ? clamp(debtPerShare / capital, 0, 0.65) : 0;
  const equityWeight = 1 - debtWeight;
  if (input.debtPerShare === undefined) defaulted.push("資本權重（未提供每股有息負債，採 100% 權益）");
  const calculatedWacc = costOfEquity * equityWeight + afterTaxCostOfDebt * debtWeight;
  const wacc = clamp(calculatedWacc, 0.055, 0.2);

  return {
    beta,
    riskFreeRate,
    marketRiskPremium,
    countryRiskPremium,
    costOfEquity,
    preTaxCostOfDebt,
    afterTaxCostOfDebt,
    taxRate,
    debtWeight,
    equityWeight,
    wacc,
    defaulted,
  };
}

export function discountedCashFlowPerShare(
  fcfPerShare: number,
  growthRate: number,
  discountRate: number,
  terminalGrowth: number,
  years = 5,
) {
  const cashFlowInput = numeric(fcfPerShare);
  const discount = clamp(rate(discountRate, 0.1), 0.04, 0.25);
  const terminal = clamp(rate(terminalGrowth, 0.025), -0.02, Math.max(discount - 0.02, -0.02));
  if (cashFlowInput <= 0 || discount <= terminal || years < 1) return 0;
  const growth = clamp(rate(growthRate, 0), -0.2, 0.3);
  let cashFlow = cashFlowInput;
  let presentValue = 0;
  for (let year = 1; year <= years; year += 1) {
    cashFlow *= 1 + growth;
    presentValue += cashFlow / ((1 + discount) ** year);
  }
  const terminalValue = (cashFlow * (1 + terminal)) / (discount - terminal);
  return presentValue + terminalValue / ((1 + discount) ** years);
}

export function fadingGrowthDcfPerShare(
  fcfPerShare: number,
  startingGrowth: number,
  discountRate: number,
  terminalGrowth: number,
  years: number,
) {
  const cashFlowInput = numeric(fcfPerShare);
  const discount = clamp(rate(discountRate, 0.1), 0.04, 0.25);
  const terminal = clamp(rate(terminalGrowth, 0.025), -0.02, Math.max(discount - 0.02, -0.02));
  const start = clamp(rate(startingGrowth, 0), -0.2, 0.3);
  if (cashFlowInput <= 0 || discount <= terminal || years < 2) return 0;

  let cashFlow = cashFlowInput;
  let presentValue = 0;
  for (let year = 1; year <= years; year += 1) {
    const progress = (year - 1) / (years - 1);
    const yearGrowth = start + (terminal - start) * progress;
    cashFlow *= 1 + yearGrowth;
    presentValue += cashFlow / ((1 + discount) ** year);
  }
  const terminalValue = (cashFlow * (1 + terminal)) / (discount - terminal);
  return presentValue + terminalValue / ((1 + discount) ** years);
}

/**
 * Public-data residual-income cross-check.  It starts from book value and
 * discounts only the earnings in excess of the cost of equity, fading that
 * excess return toward the terminal growth rate.  It is deliberately
 * excluded when current earnings do not cover the cost of equity, and never
 * uses analyst forecasts or a market price.
 */
export function residualIncomePerShare(
  bookValuePerShare: number,
  earningsPerShare: number,
  costOfEquity: number,
  startingGrowth: number,
  terminalGrowth: number,
  years = 5,
) {
  const book = numeric(bookValuePerShare);
  const earnings = numeric(earningsPerShare);
  const discount = clamp(rate(costOfEquity, 0.1), 0.045, 0.25);
  const terminal = clamp(rate(terminalGrowth, 0.025), -0.02, Math.max(discount - 0.02, -0.02));
  const start = clamp(rate(startingGrowth, 0), -0.2, 0.3);
  if (book <= 0 || earnings <= 0 || discount <= terminal || years < 2) return 0;
  let residual = earnings - discount * book;
  if (residual <= 0) return 0;
  let presentValue = book;
  for (let year = 1; year <= years; year += 1) {
    const progress = (year - 1) / (years - 1);
    const yearGrowth = start + (terminal - start) * progress;
    residual *= 1 + yearGrowth;
    presentValue += residual / ((1 + discount) ** year);
  }
  const terminalResidual = residual * (1 + terminal);
  return presentValue + terminalResidual / (discount - terminal) / ((1 + discount) ** years);
}

/**
 * Discounted operating-metric exit model.
 *
 * InvestingPro exposes EBITDA- and revenue-exit DCF variants.  We can
 * reproduce the observable structure without analyst forecasts by using the
 * latest public operating metric, fading historical growth, an independently
 * observed peer EV multiple for the terminal value, and an FCFF proxy.  The
 * proxy starts with CFO-capex (the site's FCFE-like public cash-flow field)
 * and adds after-tax carrying cost on reported debt.  The explanation shown
 * in the UI calls this out explicitly so it is never confused with a full
 * analyst forecast DCF.
 */
export function fadingGrowthOperatingExitDcfPerShare(
  fcffPerShare: number,
  metricPerShare: number,
  startingGrowth: number,
  discountRate: number,
  terminalGrowth: number,
  terminalMultiple: number,
  netDebtPerShare: number,
  years: number,
) {
  const fcffInput = numeric(fcffPerShare);
  const metricInput = numeric(metricPerShare);
  const discount = clamp(rate(discountRate, 0.1), 0.04, 0.25);
  const terminal = clamp(rate(terminalGrowth, 0.025), -0.02, Math.max(discount - 0.02, -0.02));
  const rawMultiple = numeric(terminalMultiple);
  const multiple = clamp(rawMultiple, 1, 100);
  const netDebt = numeric(netDebtPerShare);
  const start = clamp(rate(startingGrowth, 0), -0.2, 0.3);
  if (fcffInput <= 0 || metricInput <= 0 || rawMultiple <= 0 || discount <= 0 || years < 2) return 0;

  let fcff = fcffInput;
  let metric = metricInput;
  let presentValue = 0;
  for (let year = 1; year <= years; year += 1) {
    const progress = (year - 1) / (years - 1);
    const yearGrowth = start + (terminal - start) * progress;
    fcff *= 1 + yearGrowth;
    metric *= 1 + yearGrowth;
    presentValue += fcff / ((1 + discount) ** year);
  }
  const terminalValue = metric * (1 + terminal) * multiple;
  return presentValue + terminalValue / ((1 + discount) ** years) - netDebt;
}

function robustModelFilter(models: ModelCandidate[]) {
  if (models.length < 4) return { kept: models, removed: [] as ModelCandidate[] };
  const logValues = models.map((model) => Math.log(model.value));
  const center = median(logValues);
  const mad = median(logValues.map((value) => Math.abs(value - center)));
  const threshold = Math.max(3.5 * 1.4826 * mad, Math.log(3));
  const kept = models.filter((model) => Math.abs(Math.log(model.value) - center) <= threshold);
  if (kept.length < 2) return { kept: models, removed: [] as ModelCandidate[] };
  return {
    kept,
    removed: models.filter((model) => !kept.includes(model)),
  };
}

function relativeRange(value: number, uncertainty: number) {
  const width = clamp(uncertainty * 0.5, 0.08, 0.2);
  return { low: value * (1 - width), high: value * (1 + width) };
}

function positivePercentile(value: number | undefined, fallback: number) {
  const parsed = numeric(value);
  return parsed > 0 ? parsed : fallback;
}

function isCyclicalMultipleBusiness(input: StockInput) {
  return descriptorMatches(
    input,
    /memory|micron|dram|nand|commodity|semiconductor cycle|cyclical|記憶體|循環|景氣循環|晶圓代工/i,
  );
}

/**
 * Normalize reported EPS only when public historical observations show a
 * clear cycle outlier. This is a historical earning-power proxy, not a
 * forecast: no analyst consensus, target price, or forward EPS is used.
 */
export function normalizeEarningsPerShare(input: Pick<StockInput, "ticker" | "name" | "sector" | "eps" | "epsHistory" | "dataBasis">) {
  const reported = numeric(input.eps);
  const observations = (input.epsHistory ?? [])
    .map((point) => ({
      value: numeric(point.value),
      end: point.end ?? "",
    }))
    .filter((point) => point.value > 0)
    .sort((left, right) => right.end.localeCompare(left.end));
  const unique = observations.filter((point, index, all) => (
    !point.end || all.findIndex((candidate) => candidate.end === point.end) === index
  ));
  const positiveValues = unique.slice(0, 5).map((point) => point.value);
  const historyMedian = median(positiveValues);
  const cyclical = isCyclicalMultipleBusiness(input as StockInput);
  const historyCount = positiveValues.length;
  if (historyCount < 3 || historyMedian <= 0) {
    return {
      reportedEpsPerShare: Math.max(reported, 0),
      normalizedEpsPerShare: Math.max(reported, 0),
      applied: false,
      method: "reported" as const,
      historyCount,
    };
  }

  const ratio = reported > 0 ? reported / historyMedian : 0;
  // Cyclical names are allowed a wider band, but a trough below roughly two
  // thirds of historical earning power is still not a fair steady-state
  // denominator. Stable companies change only for an obvious outlier.
  const lowerThreshold = cyclical ? 0.65 : 0.33;
  const upperThreshold = cyclical ? 2.25 : 3;
  const outlier = reported <= 0 || ratio < lowerThreshold || ratio > upperThreshold;
  const shouldUseHistory = outlier && (cyclical || input.dataBasis === "annual" || input.dataBasis === "historical");
  if (!shouldUseHistory) {
    return {
      reportedEpsPerShare: Math.max(reported, 0),
      normalizedEpsPerShare: Math.max(reported, 0),
      applied: false,
      method: "reported" as const,
      historyCount,
    };
  }
  return {
    reportedEpsPerShare: Math.max(reported, 0),
    normalizedEpsPerShare: historyMedian,
    applied: true,
    method: "median-history" as const,
    historyCount,
  };
}

function isOptionalityBusiness(input: StockInput) {
  return descriptorMatches(
    input,
    /tesla|electric vehicle|autonomous|self-driving|robotaxi|energy storage|\bspace\b|launch|quantum|電動車|自駕|機器人計程車|儲能|太空/i,
  );
}

function isAiInfrastructureOperator(input: StockInput) {
  const aiInfrastructureTickers = new Set([
    "NVDA", "AMD", "AVGO", "MU", "TSM", "ASML", "AMAT", "LRCX", "KLAC", "ANET", "VRT", "DELL", "SMCI", "MRVL",
  ]);
  if (aiInfrastructureTickers.has(input.ticker.trim().toUpperCase())) return true;
  return descriptorMatches(
    input,
    /semiconductor|hardware|network|server|optical|data.?center|半導體|硬體|網通|伺服器|資料中心|gpu|asic|memory|記憶體/i,
  );
}

	function usableSectorPeProfile(profile: FundSectorPeProfile | undefined) {
	  // Sector labels are intentionally broad. Keep the fund-observation
	  // dispersion gate here so a heterogeneous sector (for example TSLA
	  // mixed with rail and industrial names) cannot look coherent merely
	  // because repeated tickers were collapsed.
	  const lower = numeric(profile?.lowerQuartilePe);
	  const upper = numeric(profile?.upperQuartilePe);
	  if (!profile || profile.sampleSize < 5 || !(numeric(profile.uniqueMedianPe ?? profile.medianPe) > 0) || !(lower > 0)) return false;
	  return upper / lower <= 4;
	}

	function usableBusinessPeProfile(profile: FundBusinessPeProfile | undefined) {
	  const lower = numeric(profile?.uniqueLowerQuartilePe ?? profile?.lowerQuartilePe);
	  const upper = numeric(profile?.uniqueUpperQuartilePe ?? profile?.upperQuartilePe);
	  if (!profile || profile.sampleSize < 4 || profile.uniqueSampleSize < 2 || !(numeric(profile.uniqueMedianPe ?? profile.medianPe) > 0) || !(lower > 0)) return false;
	  return upper / lower <= 4;
	}

	function usableBusinessOverlayProfile(profile: FundBusinessPeProfile | undefined) {
	  if (!usableBusinessPeProfile(profile)) return false;
	  // A small business-model bucket can be useful for a genuinely cyclical
	  // memory sample, but four mixed AI-semiconductor names are not enough to
	  // replace the broader sector band. Keep the narrower profile visible in
	  // the audit while requiring more independent names for the market layer.
	  return profile?.group === "memory-cycle" || (profile?.uniqueSampleSize ?? 0) >= 5;
	}

	function deriveFundamentalTargetPe(
  input: StockInput,
  suppliedTargetPe: number,
  revenueGrowth: number,
  netMarginPercent: number,
  netDebtToEbitda: number,
) {
  const growth = clamp(Math.max(revenueGrowth, 0), 0, 60);
  const growthContribution = Math.min(growth, 20) * 0.55 + Math.max(growth - 20, 0) * 0.25;
  const marginContribution = clamp(Math.max(netMarginPercent - 5, 0), 0, 35) * 0.22;
  const technologyBonus = descriptorMatches(input, /technology|software|internet|semiconductor|hardware|科技|軟體|網路|半導體|硬體/i)
    ? 2
    : 0;
  const qualityBonus = netMarginPercent >= 20 && revenueGrowth >= 5 ? 3 : 0;
  const hardwareBonus = descriptorMatches(input, /hardware|technology hardware|consumer electronics|科技硬體|電子/i) ? 2 : 0;
  const cyclicalPenalty = isCyclicalMultipleBusiness(input) ? 8 : 0;
  const leveragePenalty = Math.min(Math.max(netDebtToEbitda, 0), 4) * 1.5;
  const heuristic = 14
    + growthContribution
    + marginContribution
    + technologyBonus
    + qualityBonus
    + hardwareBonus
    - cyclicalPenalty
    - leveragePenalty;
  return clamp(Math.max(suppliedTargetPe, heuristic), 8, 48);
}

function deriveMarketPricing(
  input: StockInput,
  baseTargetPe: number,
  structuralThemes: StructuralTheme[],
  netMarginPercent: number,
  reportedEps = numeric(input.eps),
  sectorPe?: FundSectorPeProfile,
  businessPe?: FundBusinessPeProfile,
): MarketPricingAssessment {
  // The intrinsic models may use a historical earning-power denominator for
  // cyclical companies.  The separate market-pricing layer must instead use
  // the latest reported EPS (often LTM in the live SEC route); otherwise a
  // normalization safeguard would erase the current cycle that the market is
  // actually pricing.
  const eps = reportedEps;
  const institutional = input.institutionalSignal;
  const fundPe = input.fundPortfolioPe;
  // A broad sector profile is only useful when its middle 50% is reasonably
  // coherent.  A small group that mixes optionality names, cyclicals and
  // mature operators can otherwise turn one sector median into a misleading
  // target multiple (for example TSLA/GEV/ORN alongside a railroad).  Keep
  // the raw profile visible in the fund page, but fall back to the overall
  // six-fund distribution for the valuation reference when dispersion is too
  // wide.  This remains descriptive market context, never an intrinsic-value
  // override.
	const sectorLowerQuartile = numeric(sectorPe?.lowerQuartilePe);
	const sectorUpperQuartile = numeric(sectorPe?.upperQuartilePe);
  const sectorMiddleSpread = sectorLowerQuartile > 0
    ? sectorUpperQuartile / sectorLowerQuartile
    : Number.POSITIVE_INFINITY;
  const usableSectorPe = usableSectorPeProfile(sectorPe) && sectorMiddleSpread <= 4
    ? sectorPe
    : undefined;
	  const businessLowerQuartile = numeric(businessPe?.uniqueLowerQuartilePe ?? businessPe?.lowerQuartilePe);
	  const businessUpperQuartile = numeric(businessPe?.uniqueUpperQuartilePe ?? businessPe?.upperQuartilePe);
  const businessMiddleSpread = businessLowerQuartile > 0
    ? businessUpperQuartile / businessLowerQuartile
    : Number.POSITIVE_INFINITY;
	  const usableBusinessPe = usableBusinessOverlayProfile(businessPe) && businessMiddleSpread <= 4
    ? businessPe
    : undefined;
  const sectorProfileRejectedForDispersion = Boolean(
    sectorPe
    && sectorPe.sampleSize >= 5
	    && numeric(sectorPe.uniqueMedianPe ?? sectorPe.medianPe) > 0
    && !usableSectorPe,
  );
  const marketPeProfile = usableBusinessPe ?? usableSectorPe ?? fundPe;
  const structuralTheme = structuralThemes.length > 0;
  const optionality = isOptionalityBusiness(input);
  const institutionalConviction = Boolean(
    institutional && (institutional.heldByCount >= 2 || institutional.increasedByCount > 0),
  );
  const growthEvidence = numeric(input.revenueGrowth) >= 8;
  const qualityEvidence = netMarginPercent >= 15 && numeric(input.roe) >= 15;
  const triggers = [
    structuralTheme ? "structural-theme" : "",
    optionality ? "optionality" : "",
    institutionalConviction ? "institutional-conviction" : "",
    growthEvidence ? "reported-growth" : "",
    qualityEvidence ? "profitability" : "",
  ].filter(Boolean);
  const enabled = eps > 0 && triggers.length >= 2;
  if (!enabled) {
    return {
      enabled: false,
      selectedPe: null,
      peLow: null,
      peHigh: null,
      fairValue: null,
      rangeLow: null,
      rangeHigh: null,
      triggers,
      source: "不適用",
      note: "未達到至少兩項獨立的成長／市場訊號，保留基本內在價值。",
      referenceSector: usableSectorPe?.sector,
      referenceBusinessGroup: usableBusinessPe?.group,
      referenceSampleSize: usableBusinessPe?.sampleSize ?? usableSectorPe?.sampleSize,
      referenceUniqueSampleSize: usableBusinessPe?.uniqueSampleSize ?? usableSectorPe?.uniqueSampleSize,
    };
  }

	const medianPe = positivePercentile(marketPeProfile?.uniqueMedianPe ?? marketPeProfile?.medianPe, baseTargetPe);
	const upperQuartilePe = positivePercentile(marketPeProfile?.uniqueUpperQuartilePe ?? marketPeProfile?.upperQuartilePe, medianPe * 1.35);
  // Optionality is the one case where repeated fund observations carry
  // information: the tail reflects several managers pricing the same
  // optionality. Ordinary center bands remain de-duplicated.
  const p95Pe = positivePercentile(
    optionality ? marketPeProfile?.p95Pe : marketPeProfile?.uniqueP95Pe ?? marketPeProfile?.p95Pe,
    upperQuartilePe * 1.8,
  );
  const profileLabel = usableBusinessPe
    ? `${usableBusinessPe.group} 商業模式基金持股`
    : usableSectorPe
    ? `${usableSectorPe.sector} 同產業六大基金持股`
    : sectorProfileRejectedForDispersion
      ? "六大基金整體持股（產業樣本分歧過大）"
      : "六大基金整體持股";
  const cyclical = isCyclicalMultipleBusiness(input);
  const aiInfrastructure = structuralThemes.some((theme) => theme.id === "ai-infrastructure")
    && isAiInfrastructureOperator(input);
  const cyclicalAiGrowth = cyclical
    && aiInfrastructure
    && institutionalConviction
    && growthEvidence
    && eps > 0;
  let selectedPe = baseTargetPe;
  let source = "基本面目標本益比＋成長條件";
  let note = "以公開財報成長與獲利條件形成市場定價參考，不使用分析師共識。";
  const fundDataWarning = fundPe && fundPe.sampleSize > 0
    && (fundPe.agingSampleSize + fundPe.staleSampleSize) / fundPe.sampleSize >= 0.5
    ? " 六大基金本益比樣本有半數以上來自超過 120 天的財報，只作延遲的市場熱度參考，不直接當成目標價。"
    : "";

  if (optionality && institutionalConviction && marketPeProfile) {
    // Optionality businesses can trade in the upper tail of the observed fund
    // portfolio distribution. This is a market-pricing reference, not intrinsic value.
    selectedPe = p95Pe * 0.78 + medianPe * 0.22;
    source = `${profileLabel}本益比分布 P95／中位數混合`;
    note = `${profileLabel}的選擇權型持股且有多家基金持有／加倉，採高分位作市場參考；若未來獲利未實現，倍數壓縮風險很高；不使用分析師共識。`;
  } else if (cyclicalAiGrowth && marketPeProfile) {
    // Memory and other semiconductor-cycle names can be intentionally bought
    // while reported EPS is still catching up with the demand cycle.  A
    // median-only PE would therefore describe a trough rather than the market
    // pricing being observed in the six-fund holdings.  Use a bounded blend of
    // the fund distribution's median, upper quartile, and P95.  This is still
    // a current-EPS market reference (not forward EPS or an analyst target),
    // and the stale-sample warning below remains visible.
    selectedPe = medianPe * 0.25 + upperQuartilePe * 0.4 + p95Pe * 0.35;
    selectedPe = Math.max(selectedPe, baseTargetPe);
    source = `${profileLabel} AI 週期成長本益比分位數`;
    note = `同時符合 AI 基礎設施、公開營收成長與多家基金持有／加倉；記憶體等週期股採${profileLabel}本益比中位數、上四分位與 P95 的有界混合，反映市場可能提前交易復甦，但仍以目前 EPS 計算，未納入分析師前瞻資料。`;
  } else if (cyclical) {
    selectedPe = Math.min(baseTargetPe, medianPe * 0.5);
    source = "週期產業保守本益比＋六大基金中位數";
    note = "記憶體與景氣循環股以正常化獲利思維處理，不把單一高峰年度的成長直接外推。";
  } else if (aiInfrastructure && marketPeProfile) {
    const growthIntensity = clamp((numeric(input.revenueGrowth) - 8) / 32, 0, 1);
    const qualityFloor = netMarginPercent >= 45 ? 0.1 : 0.25;
    const qualityDampener = netMarginPercent >= 45 ? 0 : netMarginPercent >= 35 ? 0.35 : 0.8;
    const blend = clamp(qualityFloor + growthIntensity * 0.55 * qualityDampener, qualityFloor, 0.85);
    selectedPe = medianPe + (upperQuartilePe - medianPe) * blend;
    selectedPe = Math.max(selectedPe, baseTargetPe);
    source = `${profileLabel}的 AI 基礎設施本益比分位數`;
    note = `以${profileLabel}本益比的中位數至上四分位，依公開營收成長與獲利品質調整；不使用分析師前瞻資料。`;
  } else if (structuralTheme && marketPeProfile) {
    // A broad theme is not enough to justify the portfolio's upper quartile.
    // Keep the market reference near the observed median unless the company
    // also qualifies as AI infrastructure hardware.
    selectedPe = Math.max(baseTargetPe, medianPe * 0.6);
    source = `結構性主題＋${profileLabel}中位數`;
    note = `結構性主題只提供市場定價參考，以${profileLabel}中位數做保守錨定，不直接套用高分位。`;
  } else if (
    institutionalConviction
    && qualityEvidence
    && marketPeProfile
    && !cyclical
    && numeric(input.revenueGrowth) < 12
  ) {
    // Mature, profitable businesses can be priced above a strict intrinsic
    // value without belonging to a single hot theme.  Use a small maturity
    // discount to the observed same-sector fund median instead of an
    // arbitrary five-percent bump to the company's heuristic P/E.
    selectedPe = Math.max(baseTargetPe, medianPe * 0.86);
    source = `${profileLabel}成熟品質本益比參考`;
    note = `多家基金持有且獲利品質達標，採${profileLabel}中位數並保留成熟度折價；這是市場定價參考，不直接改寫基本公允價值，也不使用分析師資料。`;
  } else {
    selectedPe = baseTargetPe * (institutionalConviction ? 1.05 : 1.02);
    note = institutionalConviction
      ? "有基金持有／加倉但缺乏結構性主題，僅加入少量市場溢價；不納入分析師資料。"
      : "符合兩項公開成長／獲利訊號，以基本面目標本益比為主；不納入分析師資料。";
  }

  // Keep the market-reference overlay bounded. Optionality names may use a
  // wider upper tail, while the explicitly qualified AI-cycle branch gets a
  // smaller 140x ceiling so stale/trough EPS cannot create an unbounded
  // pseudo-target. This never changes intrinsic fair value.
  const marketPeCap = optionality && institutionalConviction
    ? 260
    : cyclicalAiGrowth
      ? 140
      : 120;
  selectedPe = clamp(selectedPe, 8, marketPeCap);
  note += fundDataWarning;
  const peLow = selectedPe * 0.95;
  const peHigh = selectedPe * 1.05;
  const fairValue = eps * selectedPe;
  return {
    enabled: true,
    selectedPe,
    peLow,
    peHigh,
    fairValue,
    rangeLow: eps * peLow,
    rangeHigh: eps * peHigh,
      triggers,
      source,
      note,
      referenceSector: usableSectorPe?.sector,
      referenceBusinessGroup: usableBusinessPe?.group,
      referenceSampleSize: usableBusinessPe?.sampleSize ?? usableSectorPe?.sampleSize,
      referenceUniqueSampleSize: usableBusinessPe?.uniqueSampleSize ?? usableSectorPe?.uniqueSampleSize,
  };
}

export function calculateStock(input: StockInput, formatNumber = (value: number) => String(value)): Stock {
  const price = Math.max(numeric(input.price), 0);
  const eps = numeric(input.eps);
  const epsNormalization = normalizeEarningsPerShare(input);
  const valuationEps = epsNormalization.normalizedEpsPerShare;
  const bvps = numeric(input.bvps);
  const reportedFcfPerShare = numeric(input.fcfPerShare);
  const dividendPerShare = Math.max(numeric(input.dividendPerShare), 0);
  const suppliedTargetPe = Math.max(numeric(input.targetPe), 0);
  const targetPb = Math.max(numeric(input.targetPb), 0);
  const suppliedTargetFcfMultiple = Math.max(numeric(input.targetFcfMultiple), 0);
  const suppliedTargetPsMultiple = Math.max(numeric(input.targetPsMultiple), 0);
  const revenueGrowth = numeric(input.revenueGrowth);
  const roe = numeric(input.roe);
  const debtRatio = numeric(input.debtRatio);
  const inputUncertainty = clamp(rate(input.uncertainty, 0.3), 0.05, 0.75);
  const dataCompleteness = input.dataCompleteness
    ?? (input.qualityAvailable === false ? "limited" : "complete");
  const dataBasis = input.dataBasis ?? (dataCompleteness === "complete" ? "annual" : "historical");
  const financialDataDate = input.financialDataDate ?? input.updatedAt;
  const freshness = classifyFinancialFreshness(financialDataDate);
  const ageDays = financialAgeDays(financialDataDate);

  if (input.assetType === "ETF") {
    const fairValue = Math.max(eps, 0);
    const range = relativeRange(fairValue, inputUncertainty * 2);
    const model = createModel(
      "etf-inav",
      "fund",
      "即時淨值法",
      fairValue,
      range.low,
      range.high,
      "採用方舟截圖中的即時淨值（iNAV）；不套用企業 DCF 或盈餘倍數。",
    );
    const assumptions: ValuationAssumptions = {
      beta: 0,
      riskFreeRate: 0,
      marketRiskPremium: 0,
      countryRiskPremium: 0,
      costOfEquity: 0,
      preTaxCostOfDebt: 0,
      afterTaxCostOfDebt: 0,
      taxRate: 0,
      debtWeight: 0,
      equityWeight: 0,
      wacc: 0,
      structuralThemes: [],
      historicalStartingGrowth: 0,
      structuralGrowthPrior: 0,
      structuralBlendWeight: 0,
      baseTargetPe: 0,
      marketPeAnchor: 0,
      marketPeUpperQuartile: 0,
      marketPeP95: 0,
      marketPricingEnabled: false,
      marketPricingTriggers: [],
      marketPricingNote: "ETF 不套用企業市場本益比溢價模型。",
      comparableSector: undefined,
      comparablePeerGroup: undefined,
      comparablePeerCount: undefined,
      comparablePePeerCount: undefined,
      comparablePsPeerCount: undefined,
      comparableEvRevenuePeerCount: undefined,
      comparableEvEbitdaPeerCount: undefined,
      comparableEvEbitPeerCount: undefined,
      comparablePffoPeerCount: undefined,
      comparableDataBasis: undefined,
      comparableAsOf: undefined,
      comparableMethod: undefined,
      startingGrowth: 0,
      terminalGrowth: 0,
      aggregationMethod: "single-model",
      reportedFcfPerShare,
      normalizedFcfPerShare: reportedFcfPerShare,
      fcfNormalizationApplied: false,
      reportedEpsPerShare: epsNormalization.reportedEpsPerShare,
      normalizedEpsPerShare: epsNormalization.normalizedEpsPerShare,
      epsNormalizationApplied: epsNormalization.applied,
      epsNormalizationMethod: epsNormalization.method,
      epsHistoryCount: epsNormalization.historyCount,
      dataBasis,
      financialDataDate,
      financialFreshness: freshness,
      financialAgeDays: ageDays,
      defaulted: [],
    };
    return {
      ...input,
      price,
      eps,
      bvps,
      fcfPerShare: reportedFcfPerShare,
      dividendPerShare,
      targetPe: suppliedTargetPe,
      targetPb,
      targetFcfMultiple: suppliedTargetFcfMultiple,
      targetPsMultiple: suppliedTargetPsMultiple,
      revenueGrowth,
      roe,
      debtRatio,
      uncertainty: inputUncertainty,
      models: model ? [{ ...model, family: valuationModelFamily(model.id), status: "applied", weight: 1 }] : [],
      excludedModels: [],
      assumptions,
      wacc: 0,
      discountRate: 0,
      terminalGrowth: 0,
      fairValue,
      rangeLow: range.low,
      rangeHigh: range.high,
      upside: price > 0 ? (fairValue - price) / price : 0,
      qualityScore: 0,
      risk: input.riskOverride ?? "中",
      valuationConfidence: "medium",
      historicalCaution: false,
      historicalCautionReasons: [],
      financialFreshness: freshness,
      financialAgeDays: ageDays,
      reportedEpsPerShare: epsNormalization.reportedEpsPerShare,
      normalizedEpsPerShare: epsNormalization.normalizedEpsPerShare,
      epsNormalizationApplied: epsNormalization.applied,
      epsNormalizationMethod: epsNormalization.method,
      epsHistoryCount: epsNormalization.historyCount,
    };
  }

  const financial = isFinancialCompany(input);
  const reit = descriptorMatches(input, /reit|real estate investment trust|property trust|real estate|不動產投資信託|不動產/i);
  const cashPerShare = Math.max(numeric(input.cashPerShare), 0);
  const debtPerShare = Math.max(numeric(input.debtPerShare), 0);
  const netDebtPerShare = debtPerShare - cashPerShare;
  const revenuePerShare = Math.max(numeric(input.revenuePerShare), 0);
  const ebitdaPerShare = Math.max(numeric(input.ebitdaPerShare), 0);
  const ebitPerShare = Math.max(numeric(input.ebitPerShare), 0);
  const netMarginPercent = rate(input.netMargin, 0) * 100;
  const netDebtToEbitda = ebitdaPerShare > 0
    ? Math.max(netDebtPerShare, 0) / ebitdaPerShare
    : 0;
  const hasFundamentalMultipleInputs = !financial
    && !reit
    && input.source !== "手動輸入"
    && valuationEps > 0
    && revenuePerShare > 0
    && ebitdaPerShare > 0
    && input.netMargin !== undefined
    && input.debtPerShare !== undefined
    && input.cashPerShare !== undefined;
  const targetPe = hasFundamentalMultipleInputs
    ? deriveFundamentalTargetPe(input, suppliedTargetPe, revenueGrowth, netMarginPercent, netDebtToEbitda)
    : suppliedTargetPe;
  const targetFcfMultiple = hasFundamentalMultipleInputs
    ? clamp(
      12 + Math.max(revenueGrowth, 0) * 0.5 + Math.max(netMarginPercent, 0) * 0.35
        - netDebtToEbitda * 4,
      8,
      32,
    )
    : suppliedTargetFcfMultiple;
  const fcfConversionCap = dataCompleteness === "limited"
    || dataBasis === "estimated"
    || netDebtToEbitda >= 1.5
    ? 1.25
    : 1.6;
  const suppliedNormalizedFcf = Math.max(numeric(input.normalizedFcfPerShare), 0);
  const normalizedFcfPerShare = reportedFcfPerShare > 0 && valuationEps > 0
    ? Math.min(
      reportedFcfPerShare,
      suppliedNormalizedFcf > 0 ? suppliedNormalizedFcf : valuationEps * fcfConversionCap,
    )
    : Math.max(reportedFcfPerShare, 0);
  const fcfNormalizationApplied = normalizedFcfPerShare > 0
    && reportedFcfPerShare > normalizedFcfPerShare * 1.001;
  const fcfPerShare = normalizedFcfPerShare;
  const assetLight = !financial && roe >= 25;
  const mature = valuationEps > 0
    && roe > 0
    && revenueGrowth >= -5
    && revenueGrowth <= (financial ? 10 : 8);
  const waccResult = calculateWacc({
    ...input,
    price,
    eps: valuationEps,
    bvps,
    fcfPerShare,
    targetPe,
    targetPb,
    targetFcfMultiple,
    targetPsMultiple: suppliedTargetPsMultiple,
    revenueGrowth,
    roe,
    debtRatio,
    uncertainty: inputUncertainty,
  });
  const wacc = waccResult.wacc;
  const equityDiscountRate = waccResult.costOfEquity;
  // CFO-capex is an FCFE-like public cash-flow measure in this project.  For
  // enterprise-value exit DCFs, add after-tax debt carrying cost as a
  // conservative FCFF proxy when both debt and cash are actually reported.
  const fcffDebtAdjustmentPerShare = input.debtPerShare !== undefined
    ? debtPerShare * waccResult.preTaxCostOfDebt * (1 - waccResult.taxRate)
    : 0;
  const fcffPerShare = fcfPerShare + fcffDebtAdjustmentPerShare;
  const operatingExitInputsAvailable = !financial
    && !reit
    && fcfPerShare > 0
    && fcffPerShare > 0
    && input.debtPerShare !== undefined
    && input.cashPerShare !== undefined;
  const historicalGrowthHaircut = dataBasis === "ltm"
    ? 0.85
    : dataBasis === "annual"
      ? 0.7
      : 0.75;
  const historicalStartingGrowth = clamp((revenueGrowth / 100) * historicalGrowthHaircut, -0.08, 0.2);
  const structuralThemes = matchStructuralThemes(input);
  const structuralGrowthPrior = structuralThemes.length > 0
    ? Math.max(...structuralThemes.map((theme) => theme.growthBase))
    : 0;
  const themeEligible = structuralThemes.length > 0
    && dataCompleteness !== "limited"
    && dataBasis !== "market-ratio"
    && dataBasis !== "estimated"
    && valuationEps > 0
    && fcfPerShare > 0
    && revenueGrowth > -10;
  const structuralBlendWeight = themeEligible
    ? dataBasis === "ltm" ? 0.25 : 0.15
    : 0;
  const startingGrowth = clamp(
    historicalStartingGrowth * (1 - structuralBlendWeight)
      + structuralGrowthPrior * structuralBlendWeight,
    -0.08,
    0.2,
  );
  const terminalGrowthDefault = (input.market === "TW" ? 0.02 : 0.025)
    + clamp(revenueGrowth, 0, 20) * 0.00025;
  const terminalGrowth = clamp(
    input.terminalGrowth === undefined ? terminalGrowthDefault : rate(input.terminalGrowth, terminalGrowthDefault),
    0,
    Math.min(0.04, Math.max(equityDiscountRate - 0.025, 0)),
  );
  const baseTargetPe = targetPe;
  const marketPricing = deriveMarketPricing(
    input,
    baseTargetPe,
    structuralThemes,
    netMarginPercent,
    eps,
    input.fundSectorPe,
    input.fundBusinessPe,
  );
  const comparableMultiples = input.comparableMultiples;
  const marketPeProfile = input.fundBusinessPe && usableBusinessOverlayProfile(input.fundBusinessPe)
    ? input.fundBusinessPe
    : input.fundSectorPe && usableSectorPeProfile(input.fundSectorPe)
      ? input.fundSectorPe
      : input.fundPortfolioPe;
  const assumptions: ValuationAssumptions = {
    ...waccResult,
    structuralThemes,
    historicalStartingGrowth,
    structuralGrowthPrior,
    structuralBlendWeight,
    baseTargetPe,
    marketPeAnchor: positivePercentile(marketPeProfile?.uniqueMedianPe ?? marketPeProfile?.medianPe, 0),
    marketPeUpperQuartile: positivePercentile(marketPeProfile?.uniqueUpperQuartilePe ?? marketPeProfile?.upperQuartilePe, 0),
    marketPeP95: positivePercentile(marketPeProfile?.uniqueP95Pe ?? marketPeProfile?.p95Pe, 0),
    marketPeReferenceSector: marketPricing.referenceSector,
    marketPeReferenceSampleSize: marketPricing.referenceSampleSize,
    marketPeReferenceUniqueSampleSize: marketPricing.referenceUniqueSampleSize,
    marketPricingEnabled: marketPricing.enabled,
    marketPricingTriggers: marketPricing.triggers,
    marketPricingNote: marketPricing.note,
    marketPeReferenceBusinessGroup: marketPricing.referenceBusinessGroup,
    comparableSector: comparableMultiples?.sector,
    comparablePeerGroup: comparableMultiples?.peerGroup,
    comparablePeerCount: comparableMultiples?.peerCount,
    comparablePePeerCount: comparableMultiples?.pePeerCount,
    comparablePsPeerCount: comparableMultiples?.psPeerCount,
    comparableEvRevenuePeerCount: comparableMultiples?.evRevenuePeerCount,
    comparableEvEbitdaPeerCount: comparableMultiples?.evEbitdaPeerCount,
    comparableEvEbitPeerCount: comparableMultiples?.evEbitPeerCount,
    comparablePffoPeerCount: comparableMultiples?.pFfoPeerCount,
    comparableDataBasis: comparableMultiples?.dataBasis,
    comparableAsOf: comparableMultiples?.asOf,
    comparableMethod: comparableMultiples?.method,
    themeAsOf: structuralThemes[0]?.asOf,
    themeReviewAfter: structuralThemes[0]?.reviewAfter,
    startingGrowth,
    terminalGrowth,
    aggregationMethod: "family-balanced-average",
    reportedFcfPerShare,
    normalizedFcfPerShare,
    fcfNormalizationApplied,
    reportedEpsPerShare: epsNormalization.reportedEpsPerShare,
    normalizedEpsPerShare: epsNormalization.normalizedEpsPerShare,
    epsNormalizationApplied: epsNormalization.applied,
    epsNormalizationMethod: epsNormalization.method,
    epsHistoryCount: epsNormalization.historyCount,
    dataBasis,
    financialDataDate,
    financialFreshness: freshness,
    financialAgeDays: ageDays,
  };

  const candidates: ModelCandidate[] = [];
  const excludedModels: ExcludedValuationModel[] = [];
  const addCandidate = (model: ModelCandidate | null, id: string, category: ValuationModelCategory, label: string) => {
    if (model) candidates.push(model);
    else addExcluded(excludedModels, id, category, label, "必要輸入不足或計算條件無效。");
  };

  if (valuationEps > 0 && targetPe > 0 && !reit) {
    const value = valuationEps * targetPe;
    const range = relativeRange(value, inputUncertainty);
    const epsLabel = epsNormalization.applied
      ? "歷史正常化 EPS " + formatNumber(valuationEps) + "（報告 EPS " + formatNumber(eps) + "）"
      : "EPS " + formatNumber(valuationEps);
    addCandidate(
      createModel(
        "pe",
        "relative",
        "本益比法",
        value,
        range.low,
        range.high,
        epsLabel + " × 目標本益比 " + formatNumber(targetPe),
      ),
      "pe",
      "relative",
      "本益比法",
    );
  } else {
    addExcluded(
      excludedModels,
      "pe",
      "relative",
      "本益比法",
      reit ? "REIT 優先使用 P/FFO；一般 EPS／P/E 可能受折舊扭曲。" : "EPS 或目標本益比不是正數。",
    );
  }

  const peerPeMultiple = Math.max(numeric(comparableMultiples?.peMedian), 0);
  const peerPeCount = numeric(comparableMultiples?.pePeerCount);
  if (valuationEps > 0 && peerPeMultiple > 0 && peerPeCount >= 5 && !reit) {
    const value = valuationEps * peerPeMultiple;
    const width = clamp(inputUncertainty * 0.55, 0.1, 0.22);
    addCandidate(
      createModel(
        "pe-peer",
        "relative",
        "同業本益比法",
        value,
        value * (1 - width),
        value * (1 + width),
        (epsNormalization.applied ? "歷史正常化 EPS " : "EPS ") + formatNumber(valuationEps)
          + " × 公開同業截尾中位數 P/E " + formatNumber(peerPeMultiple)
          + "（同業 " + formatNumber(peerPeCount) + " 筆）",
      ),
      "pe-peer",
      "relative",
      "同業本益比法",
    );
  } else {
    addExcluded(
      excludedModels,
      "pe-peer",
      "relative",
      "同業本益比法",
      reit
        ? "REIT 優先使用 P/FFO；不以 EPS 同業 P/E 作主要估值。"
        : peerPeMultiple <= 0
        ? "缺少獨立且可驗證的同業 P/E 倍數；不由目標 P/E 反推。"
        : "可用同業 P/E 少於 5 筆，避免少數公司造成定價偏差。",
    );
  }

  const ffoPerShare = Math.max(numeric(input.affoPerShare ?? input.ffoPerShare), 0);
  const explicitFfoMultiple = Math.max(numeric(input.targetFfoMultiple), 0);
  const peerFfoMultiple = Math.max(numeric(comparableMultiples?.pFfoMedian), 0);
  const ffoMultiple = explicitFfoMultiple || peerFfoMultiple;
  if (reit && ffoPerShare > 0 && ffoMultiple > 0) {
    const value = ffoPerShare * ffoMultiple;
    const width = clamp(inputUncertainty * 0.55, 0.1, 0.22);
    addCandidate(
      createModel(
        "p-ffo",
        "relative",
        "P/FFO 不動產估值法",
        value,
        value * (1 - width),
        value * (1 + width),
        "每股 FFO／AFFO " + formatNumber(ffoPerShare) + " × "
          + (explicitFfoMultiple > 0 ? "明確輸入 P/FFO " : "公開同業截尾中位數 P/FFO ")
          + formatNumber(ffoMultiple)
          + (comparableMultiples ? "（同業 " + formatNumber(comparableMultiples.pFfoPeerCount) + " 筆）" : ""),
      ),
      "p-ffo",
      "relative",
      "P/FFO 不動產估值法",
    );
  } else if (reit) {
    addExcluded(
      excludedModels,
      "p-ffo",
      "relative",
      "P/FFO 不動產估值法",
      ffoPerShare <= 0
        ? "缺少公開 FFO／AFFO 每股資料；不以 EPS 代替。"
        : "缺少至少五筆獨立同業 P/FFO 倍數或明確輸入。",
    );
  }

  if (bvps > 0 && targetPb > 0 && !assetLight) {
    const value = bvps * targetPb;
    const range = relativeRange(value, inputUncertainty);
    addCandidate(
      createModel(
        "pb",
        "asset",
        "股價淨值比法",
        value,
        range.low,
        range.high,
        "每股淨值 " + formatNumber(bvps) + " × 目標 P/B " + formatNumber(targetPb),
      ),
      "pb",
      "asset",
      "股價淨值比法",
    );
  } else {
    addExcluded(
      excludedModels,
      "pb",
      "asset",
      "股價淨值比法",
      assetLight ? "高 ROE 輕資產公司不以帳面淨值作主要估值基礎。" : "每股淨值或目標 P/B 不是正數。",
    );
  }

  const comparablePsMultiple = Math.max(
    suppliedTargetPsMultiple || numeric(comparableMultiples?.psMedian),
    0,
  );
  if (!financial && !reit && revenuePerShare > 0 && comparablePsMultiple > 0) {
    const value = revenuePerShare * comparablePsMultiple;
    const width = clamp(inputUncertainty * 0.6, 0.1, 0.25);
    addCandidate(
      createModel(
        "p-sales",
        "relative",
        "P/S 同業倍數法",
        value,
        value * (1 - width),
        value * (1 + width),
        "每股營收 " + formatNumber(revenuePerShare) + " × "
          + (suppliedTargetPsMultiple > 0 ? "明確輸入 P/S " : "公開同業截尾中位數 P/S ")
          + formatNumber(comparablePsMultiple)
          + (comparableMultiples ? "（同業 " + formatNumber(comparableMultiples.psPeerCount) + " 筆）" : ""),
      ),
      "p-sales",
      "relative",
      "P/S 同業倍數法",
    );
  } else {
    addExcluded(
      excludedModels,
      "p-sales",
      "relative",
      "P/S 同業倍數法",
      financial
        ? "金融業不使用一般企業 P/S 同業倍數。"
        : reit
          ? "REIT 優先使用 P/FFO，不使用一般企業 P/S 同業倍數。"
        : comparablePsMultiple <= 0
          ? "缺少至少五筆可追溯同業 P/S 倍數；不由 PE 反推。"
          : "每股營收不是正數。",
    );
  }

  if (!financial && !reit && fcfPerShare > 0 && targetFcfMultiple > 0) {
    const value = fcfPerShare * targetFcfMultiple;
    const range = relativeRange(value, inputUncertainty);
    addCandidate(
      createModel(
        "p-fcf",
        "relative",
        "自由現金流倍數法",
        value,
        range.low,
        range.high,
        "每股 FCF " + formatNumber(fcfPerShare) + " × 目標 FCF 倍數 " + formatNumber(targetFcfMultiple),
      ),
      "p-fcf",
      "relative",
      "自由現金流倍數法",
    );
  } else {
    addExcluded(
      excludedModels,
      "p-fcf",
      "relative",
      "自由現金流倍數法",
      financial
        ? "金融業現金流結構不適用一般企業 FCF 倍數。"
        : reit
          ? "REIT 優先使用 FFO／AFFO，不套用一般企業 FCF 倍數。"
          : "每股 FCF 或目標倍數不是正數。",
    );
  }

  const addDcf = (years: 5 | 10, label: string) => {
    const id = "dcf-fcf-" + years + "y";
    if (financial || reit || fcfPerShare <= 0 || equityDiscountRate <= terminalGrowth) {
      addExcluded(
        excludedModels,
        id,
        "intrinsic",
        label,
        financial
          ? "金融業資金與負債屬營運核心，不適用一般企業 FCF DCF。"
          : reit
            ? "REIT 優先使用 FFO／AFFO，不套用一般企業 FCF DCF。"
            : "股權自由現金流或股權成本／永續成長條件不完整。",
      );
      return;
    }
    const base = fadingGrowthDcfPerShare(
      fcfPerShare,
      startingGrowth,
      equityDiscountRate,
      terminalGrowth,
      years,
    );
    const low = fadingGrowthDcfPerShare(
      fcfPerShare,
      Math.max(startingGrowth - 0.04, -0.1),
      Math.min(equityDiscountRate + 0.01, 0.22),
      Math.max(terminalGrowth - 0.005, 0),
      years,
    );
    const highDiscount = Math.max(equityDiscountRate - 0.0075, terminalGrowth + 0.02);
    const highTerminal = Math.min(terminalGrowth + 0.005, highDiscount - 0.018);
    const high = fadingGrowthDcfPerShare(
      fcfPerShare,
      Math.min(startingGrowth + 0.04, 0.25),
      highDiscount,
      Math.max(highTerminal, 0),
      years,
    );
    addCandidate(
      createModel(
        id,
        "intrinsic",
        label,
        base,
        low,
        high,
        years + " 年股權自由現金流（CFO−Capex）成長逐年收斂；起始成長 "
          + formatNumber(startingGrowth * 100) + "%"
          + (structuralBlendWeight > 0
            ? "（結構性趨勢占 " + formatNumber(structuralBlendWeight * 100) + "%）"
            : "")
          + "；CAPM 股權成本 "
          + formatNumber(equityDiscountRate * 100)
          + "%，永續成長 " + formatNumber(terminalGrowth * 100) + "%。",
      ),
      id,
      "intrinsic",
      label,
    );
  };
  addDcf(5, "折現現金流法");
  addDcf(10, "10 年折現現金流法");

  const enterpriseValueModel = (
    id: string,
    label: string,
    metric: number,
    multiple: number,
    metricLabel: string,
    multipleSource = "獨立產業倍數",
  ) => {
    if (financial || reit || metric <= 0 || multiple <= 0) {
      const reason = financial
        ? "金融業不使用一般企業 EV 倍數。"
        : reit
          ? "REIT 優先使用 P/FFO，不使用一般企業 EV 倍數。"
        : metric <= 0
          ? metricLabel + " 未提供或不是正數。"
          : "缺少獨立且可驗證的產業 EV 倍數；不以其他估值倍數推導後重複加權。";
      addExcluded(
        excludedModels,
        id,
        "relative",
        label,
        reason,
      );
      return;
    }
    const value = metric * multiple - netDebtPerShare;
    const width = clamp(inputUncertainty * 0.5, 0.08, 0.2);
    const low = metric * multiple * (1 - width) - netDebtPerShare;
    const high = metric * multiple * (1 + width) - netDebtPerShare;
    addCandidate(
      createModel(
        id,
        "relative",
        label,
        value,
        low,
        high,
        metricLabel + " " + formatNumber(metric) + " × " + multipleSource + " " + formatNumber(multiple)
          + "，再扣除每股淨負債 " + formatNumber(netDebtPerShare) + "。",
      ),
      id,
      "relative",
      label,
    );
  };

  const explicitEvRevenueMultiple = Math.max(numeric(input.targetEvRevenueMultiple), 0);
  const explicitEvEbitdaMultiple = Math.max(numeric(input.targetEvEbitdaMultiple), 0);
  const explicitEvEbitMultiple = Math.max(numeric(input.targetEvEbitMultiple), 0);
  const evRevenueMultiple = explicitEvRevenueMultiple || Math.max(numeric(comparableMultiples?.evRevenueMedian), 0);
  const evEbitdaMultiple = explicitEvEbitdaMultiple || Math.max(numeric(comparableMultiples?.evEbitdaMedian), 0);
  const evEbitMultiple = explicitEvEbitMultiple || Math.max(numeric(comparableMultiples?.evEbitMedian), 0);
  const comparableSource = (kind: "EV/Revenue" | "EV/EBITDA" | "EV/EBIT") => {
    if (!comparableMultiples) return "獨立產業 EV 倍數";
    const count = kind === "EV/Revenue"
      ? comparableMultiples.evRevenuePeerCount
      : kind === "EV/EBITDA"
        ? comparableMultiples.evEbitdaPeerCount
        : comparableMultiples.evEbitPeerCount;
    return "公開同業截尾中位數 " + kind + "（同業 " + formatNumber(count) + " 筆）";
  };
  enterpriseValueModel(
    "ev-revenue",
    "EV／營收倍數法",
    revenuePerShare,
    evRevenueMultiple,
    "每股營收",
    explicitEvRevenueMultiple > 0 ? "獨立輸入 EV/Revenue 倍數" : comparableSource("EV/Revenue"),
  );
  enterpriseValueModel(
    "ev-ebitda",
    "EV／EBITDA 倍數法",
    ebitdaPerShare,
    evEbitdaMultiple,
    "每股 EBITDA",
    explicitEvEbitdaMultiple > 0 ? "獨立輸入 EV/EBITDA 倍數" : comparableSource("EV/EBITDA"),
  );
  enterpriseValueModel(
    "ev-ebit",
    "EV／EBIT 倍數法",
    ebitPerShare,
    evEbitMultiple,
    "每股 EBIT",
    explicitEvEbitMultiple > 0 ? "獨立輸入 EV/EBIT 倍數" : comparableSource("EV/EBIT"),
  );

  const operatingExitDcf = (
    metricKind: "revenue" | "ebitda",
    metric: number,
    multiple: number,
    metricLabel: string,
    multipleLabel: string,
    multipleSource: string,
  ) => {
    for (const years of [5, 10] as const) {
      const id = "dcf-" + metricKind + "-" + years + "y";
      const label = years + " 年 DCF " + metricLabel + " 退出法";
      if (!operatingExitInputsAvailable || metric <= 0 || multiple <= 0 || wacc <= 0) {
        const reason = financial
          ? "金融業不使用一般企業 EBITDA／營收退出 DCF。"
          : reit
            ? "REIT 優先使用 FFO／AFFO，不使用一般企業 EBITDA／營收退出 DCF。"
          : !operatingExitInputsAvailable
            ? "需要正的公開 FCF、現金與有息負債，才能把 CFO−Capex 加上稅後利息近似 FCFF。"
            : metric <= 0
              ? metricLabel + " 未提供或不是正數。"
              : "折現率或退出倍數不是正數。";
        addExcluded(excludedModels, id, "intrinsic", label, reason);
        continue;
      }
      const base = fadingGrowthOperatingExitDcfPerShare(
        fcffPerShare,
        metric,
        startingGrowth,
        wacc,
        terminalGrowth,
        multiple,
        netDebtPerShare,
        years,
      );
      const low = fadingGrowthOperatingExitDcfPerShare(
        fcffPerShare,
        metric,
        Math.max(startingGrowth - 0.04, -0.12),
        Math.min(wacc + 0.01, 0.22),
        Math.max(terminalGrowth - 0.005, 0),
        Math.max(multiple * 0.9, 1),
        netDebtPerShare,
        years,
      );
      const highDiscount = Math.max(wacc - 0.0075, terminalGrowth + 0.02);
      const highTerminal = Math.min(terminalGrowth + 0.005, highDiscount - 0.018);
      const high = fadingGrowthOperatingExitDcfPerShare(
        fcffPerShare,
        metric,
        Math.min(startingGrowth + 0.04, 0.25),
        highDiscount,
        Math.max(highTerminal, 0),
        multiple * 1.1,
        netDebtPerShare,
        years,
      );
      addCandidate(
        createModel(
          id,
          "intrinsic",
          label,
          base,
          low,
          high,
          years + " 年 " + metricLabel + " 退出 DCF：以歷史 " + metricLabel
            + " 成長逐年收斂，終值採 " + multipleLabel + " " + formatNumber(multiple)
            + "（" + multipleSource + "），加總 FCFF 近似現金流後以 WACC "
            + formatNumber(wacc * 100) + "% 折現，再扣除每股淨負債 "
            + formatNumber(netDebtPerShare) + "；不含分析師前瞻預估。",
        ),
        id,
        "intrinsic",
        label,
      );
    }
  };

  operatingExitDcf(
    "ebitda",
    ebitdaPerShare,
    evEbitdaMultiple,
    "EBITDA",
    "EV/EBITDA 同業倍數",
    explicitEvEbitdaMultiple > 0 ? "獨立輸入" : comparableSource("EV/EBITDA"),
  );
  operatingExitDcf(
    "revenue",
    revenuePerShare,
    evRevenueMultiple,
    "營收",
    "EV/Revenue 同業倍數",
    explicitEvRevenueMultiple > 0 ? "獨立輸入" : comparableSource("EV/Revenue"),
  );

  const fcfToEarnings = valuationEps > 0 ? fcfPerShare / valuationEps : 0;
  const normalizedFcf = Math.max(
    numeric(
      input.normalizedFcfPerShare,
      fcfToEarnings >= 0.5 && fcfToEarnings <= 1.5 ? fcfPerShare * 0.65 + valuationEps * 0.35 : 0,
    ),
    0,
  );
  if (!financial && !reit && !assetLight && mature && normalizedFcf > 0) {
    const value = normalizedFcf / equityDiscountRate;
    const low = normalizedFcf * 0.9 / Math.min(equityDiscountRate + 0.01, 0.22);
    const high = normalizedFcf * 1.1 / Math.max(equityDiscountRate - 0.005, 0.05);
    addCandidate(
      createModel(
        "epv",
        "intrinsic",
        "盈餘能力價值法",
        value,
        low,
        high,
        "成熟低成長公司以正規化每股股權自由現金流 " + formatNumber(normalizedFcf)
          + " ÷ CAPM 股權成本 " + formatNumber(equityDiscountRate * 100) + "%。",
      ),
      "epv",
      "intrinsic",
      "盈餘能力價值法",
    );
  } else {
    addExcluded(
      excludedModels,
      "epv",
      "intrinsic",
      "盈餘能力價值法",
      financial
        ? "金融業不使用一般企業正規化 FCF EPV。"
        : reit
          ? "REIT 優先使用 FFO／AFFO，不使用一般企業 FCF EPV。"
        : assetLight
          ? "高 ROE 輕資產公司的品牌與無形資產使零成長 EPV 容易系統性低估。"
        : !mature
          ? "公司仍在成長或獲利未穩定，EPV 的零成長前提不成立。"
          : "缺少可正規化的 FCF，或 FCF／盈餘轉換率異常。",
    );
  }

  const residualIncomeEligible = !reit
    && bvps > 0
    && valuationEps > 0
    && equityDiscountRate > terminalGrowth
    && valuationEps > equityDiscountRate * bvps;
  if (residualIncomeEligible) {
    const base = residualIncomePerShare(
      bvps,
      valuationEps,
      equityDiscountRate,
      startingGrowth,
      terminalGrowth,
      5,
    );
    const low = residualIncomePerShare(
      bvps,
      valuationEps,
      Math.min(equityDiscountRate + 0.01, 0.22),
      Math.max(startingGrowth - 0.04, -0.1),
      Math.max(terminalGrowth - 0.005, 0),
      5,
    );
    const high = residualIncomePerShare(
      bvps,
      valuationEps,
      Math.max(equityDiscountRate - 0.0075, terminalGrowth + 0.02),
      Math.min(startingGrowth + 0.04, 0.25),
      Math.min(terminalGrowth + 0.005, 0.04),
      5,
    );
    addCandidate(
      createModel(
        "roe-residual",
        "intrinsic",
        "ROE／剩餘收益估值",
        base,
        low,
        high,
        "以每股帳面價值加上超過 CAPM 股權成本的剩餘收益，五年逐步收斂；不使用分析師前瞻資料。",
      ),
      "roe-residual",
      "intrinsic",
      "ROE／剩餘收益估值",
    );
  } else {
    addExcluded(
      excludedModels,
      "roe-residual",
      "intrinsic",
      "ROE／剩餘收益估值",
      reit
        ? "REIT 優先使用 FFO／AFFO，不套用一般 ROE 剩餘收益模型。"
        : "需要正的每股帳面價值、盈餘，且目前 ROE 必須高於股權成本，才能建立剩餘收益交叉檢查。",
    );
  }

  if (valuationEps > 0 && bvps > 0 && !reit && !assetLight && roe <= 25 && debtRatio <= 70) {
    const value = Math.sqrt(22.5 * valuationEps * bvps);
    addCandidate(
      createModel(
        "graham",
        "asset",
        "Graham 防禦估值",
        value,
        value * 0.85,
        value * 1.15,
        "僅用於財務槓桿可控、非高 ROE 輕資產公司：√(22.5 × EPS × 每股淨值)。",
      ),
      "graham",
      "asset",
      "Graham 防禦估值",
    );
  } else {
    addExcluded(
      excludedModels,
      "graham",
      "asset",
      "Graham 防禦估值",
      assetLight
        ? "高 ROE 輕資產公司容易被帳面價值公式系統性低估。"
        : reit
          ? "REIT 優先使用 P/FFO，不使用 Graham EPS／帳面價值公式。"
        : debtRatio > 70
          ? "總負債率超出防禦型估值條件。"
          : "EPS、每股淨值或成熟度條件不足。",
    );
  }

  const payoutRatio = valuationEps > 0 ? dividendPerShare / valuationEps : 0;
  const dividendGrowth = clamp(
    Math.min(terminalGrowth, Math.max(revenueGrowth / 100 * 0.35, 0)),
    0,
    Math.max(Math.min(0.04, equityDiscountRate - 0.025), 0),
  );
  if (
    mature
    && !reit
    && dividendPerShare > 0
    && payoutRatio >= 0.2
    && payoutRatio <= 0.8
    && equityDiscountRate > dividendGrowth + 0.02
  ) {
    const value = dividendPerShare * (1 + dividendGrowth) / (equityDiscountRate - dividendGrowth);
    const low = dividendPerShare * 0.9 * (1 + Math.max(dividendGrowth - 0.005, 0))
      / (Math.min(equityDiscountRate + 0.01, 0.22) - Math.max(dividendGrowth - 0.005, 0));
    const highGrowth = Math.min(dividendGrowth + 0.005, equityDiscountRate - 0.025);
    const high = dividendPerShare * 1.1 * (1 + highGrowth)
      / (Math.max(equityDiscountRate - 0.005, highGrowth + 0.02) - highGrowth);
    addCandidate(
      createModel(
        "ddm-stable",
        "income",
        "股利折現法",
        value,
        low,
        high,
        "成熟配息公司：股利 " + formatNumber(dividendPerShare)
          + "，配息率 " + formatNumber(payoutRatio * 100)
          + "%，穩定成長 " + formatNumber(dividendGrowth * 100)
          + "%，以 CAPM 股權成本折現。",
      ),
      "ddm-stable",
      "income",
      "股利折現法",
    );
  } else {
    addExcluded(
      excludedModels,
      "ddm-stable",
      "income",
      "股利折現法",
      reit
        ? "REIT 優先使用 FFO／AFFO，不使用一般股利折現條件。"
        : !mature
        ? "公司未符合成熟低成長條件。"
        : dividendPerShare <= 0
          ? "沒有可用股利。"
          : "配息率不在 20%–80% 的可持續區間，或折現差不足。",
    );
  }

  const filtered = robustModelFilter(candidates);
  for (const model of filtered.removed) {
    addExcluded(
      excludedModels,
      model.id,
      model.category,
      model.label,
      "模型結果明顯偏離其他適用模型的對數分布；此判斷不使用目前股價。",
    );
  }
  const familyCounts = new Map<ValuationModelFamily, number>();
  for (const model of filtered.kept) {
    const family = valuationModelFamily(model.id);
    familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1);
  }
  const familyWeight = familyCounts.size > 0 ? 1 / familyCounts.size : 0;
  const models: ValuationModel[] = filtered.kept.map((model) => {
    const family = valuationModelFamily(model.id);
    return {
      ...model,
      family,
      status: "applied",
      weight: familyWeight / (familyCounts.get(family) ?? 1),
    };
  });
  const weightedAverage = (selector: (model: ValuationModel) => number) => (
    models.length > 0
      ? models.reduce((sum, model) => sum + selector(model) * model.weight, 0)
      : 0
  );
  const fairValue = weightedAverage((model) => model.value);
  const dispersion = fairValue > 0 && models.length > 0
    ? models.reduce((sum, model) => sum + Math.abs(model.value - fairValue) * model.weight, 0) / fairValue
    : 0.6;
  const modelCountFloor = models.length >= 7
    ? 0.12
    : models.length >= 5
      ? 0.16
      : models.length >= 3
        ? 0.22
        : models.length >= 2
          ? 0.3
          : 0.42;
  const uncertainty = clamp(
    Math.max(inputUncertainty * 0.5, modelCountFloor, dispersion),
    0.1,
    0.65,
  );
  const modelRangeLow = weightedAverage((model) => model.rangeLow);
  const modelRangeHigh = weightedAverage((model) => model.rangeHigh);
  const rangeLow = fairValue > 0
    ? Math.max(0, Math.min(modelRangeLow, fairValue * (1 - uncertainty)))
    : 0;
  const rangeHigh = fairValue > 0
    ? Math.max(modelRangeHigh, fairValue * (1 + uncertainty), fairValue)
    : 0;
  const upside = price > 0 ? (fairValue - price) / price : 0;

  const netMarginFraction = rate(input.netMargin, 0);
  const assetTurnover = clamp(numeric(input.assetTurnover, 1), 0, 5);
  const financialLeverage = clamp(numeric(input.financialLeverage, 1), 0, 10);
  const dupontRoe = input.netMargin !== undefined
    && input.assetTurnover !== undefined
    && input.financialLeverage !== undefined
    ? netMarginFraction * assetTurnover * financialLeverage * 100
    : roe;
  const qualityScore = input.qualityAvailable === false
    ? 0
    : Math.round(clamp(
      50 + dupontRoe * 0.28 + revenueGrowth * 0.55 - Math.max(debtRatio - 40, 0) * 0.22,
      0,
      100,
    ));
  const risk = input.riskOverride
    ?? (uncertainty >= 0.34 || debtRatio >= 80 ? "高" : uncertainty >= 0.22 ? "中" : "低");
  const historicalCautionReasons: string[] = [];
  if (dataCompleteness === "limited") {
    historicalCautionReasons.push("公開財務欄位不完整。");
  }
  if (dataBasis === "estimated") {
    historicalCautionReasons.push("部分輸入為估算值，需以後續正式財報覆核。");
  }
  if (epsNormalization.applied) {
    historicalCautionReasons.push(
      "報告 EPS 明顯偏離最近公開年度獲利，已以歷史中位數作正常化分母；這不是前瞻預測。",
    );
  }
  if (freshness === "stale") {
    historicalCautionReasons.push("財務資料距今超過約八個月，可能未反映最新季度；請先更新快照。");
  } else if (freshness === "aging") {
    historicalCautionReasons.push("財務資料距今已超過約四個月，請留意最新季度是否改變獲利週期。");
  }
  if (dataBasis === "annual" && assetLight) {
    historicalCautionReasons.push("高 ROE 輕資產公司僅有單一年度資料，對成長假設較敏感。");
  }
  if (Math.abs(revenueGrowth) >= 12 || (assetLight && revenueGrowth >= 8)) {
    historicalCautionReasons.push("近期營收成長幅度較大，歷史增速不宜直接外推。");
  }
  if (!financial && !reit && fcfPerShare <= 0) {
    historicalCautionReasons.push("缺少正數自由現金流，現金流模型無法交叉驗證。");
  }
  if (reit && ffoPerShare <= 0) {
    historicalCautionReasons.push("REIT 缺少公開 FFO／AFFO 每股資料，暫不產生一般企業公允價值。");
  }
  if (fcfNormalizationApplied) {
    historicalCautionReasons.push("自由現金流明顯高於盈餘能力，估值已採保守正規化數值。");
  }
  if (models.some((model) => /^dcf-(ebitda|revenue)-/.test(model.id))) {
    historicalCautionReasons.push("退出法使用公開同業終值倍數與 FCFF 近似，未納入分析師前瞻資料；倍數與成長假設仍可能造成較大分歧。");
  }
  if (models.length < 2) {
    historicalCautionReasons.push("適用模型少於兩種，缺少交叉驗證。");
  }
  if (dispersion >= 0.35) {
    historicalCautionReasons.push("適用模型結果分歧偏高。");
  }
  const historicalCaution = historicalCautionReasons.length > 0;
  const valuationConfidence: ValuationConfidence = dataCompleteness === "limited"
    || models.length < 2
    || historicalCaution
    ? "low"
    : dataCompleteness === "complete"
      && dataBasis === "ltm"
      && models.length >= 6
      && uncertainty <= 0.22
      && dispersion <= 0.18
      ? "high"
      : "medium";

  return {
    ...input,
    price,
    eps,
    bvps,
    fcfPerShare: reportedFcfPerShare,
    dividendPerShare,
    targetPe,
    targetPb,
    targetFcfMultiple,
    revenueGrowth,
    roe,
    debtRatio,
    discountRate: equityDiscountRate,
    terminalGrowth,
    uncertainty,
    models,
    excludedModels,
    assumptions,
    wacc,
    fairValue,
    rangeLow,
    rangeHigh,
    upside,
    qualityScore,
    risk,
    valuationConfidence,
    historicalCaution,
    historicalCautionReasons,
    financialFreshness: freshness,
    financialAgeDays: ageDays,
    marketPricing,
    reportedEpsPerShare: epsNormalization.reportedEpsPerShare,
    normalizedEpsPerShare: epsNormalization.normalizedEpsPerShare,
    epsNormalizationApplied: epsNormalization.applied,
    epsNormalizationMethod: epsNormalization.method,
    epsHistoryCount: epsNormalization.historyCount,
  };
}
