import { matchStructuralThemes, type StructuralTheme } from "./market-themes.ts";
import type { InstitutionalSignal } from "./fund-signal.ts";

export type Market = "TW" | "US";
export type RiskLevel = "低" | "中" | "高";
export type DataCompleteness = "complete" | "historical" | "limited";
export type ValuationConfidence = "high" | "medium" | "low";
export type ValuationModelCategory = "intrinsic" | "relative" | "asset" | "income" | "fund";
export type ValuationModelStatus = "applied" | "excluded";

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
  netMargin?: number;
  assetTurnover?: number;
  financialLeverage?: number;
  targetEvRevenueMultiple?: number;
  targetEvEbitdaMultiple?: number;
  targetEvEbitMultiple?: number;
  dataBasis?: "annual" | "ltm" | "historical" | "estimated" | "market-ratio";
  financialDataDate?: string;
  institutionalSignal?: InstitutionalSignal;
};

export type ValuationModel = {
  id: string;
  category: ValuationModelCategory;
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
  themeAsOf?: string;
  themeReviewAfter?: string;
  startingGrowth: number;
  terminalGrowth: number;
  aggregationMethod: "median";
  reportedFcfPerShare: number;
  normalizedFcfPerShare: number;
  fcfNormalizationApplied: boolean;
  dataBasis: string;
  financialDataDate?: string;
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
};

type ModelCandidate = Omit<ValuationModel, "status" | "weight">;

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

export function calculateStock(input: StockInput, formatNumber = (value: number) => String(value)): Stock {
  const price = Math.max(numeric(input.price), 0);
  const eps = numeric(input.eps);
  const bvps = numeric(input.bvps);
  const reportedFcfPerShare = numeric(input.fcfPerShare);
  const dividendPerShare = Math.max(numeric(input.dividendPerShare), 0);
  const suppliedTargetPe = Math.max(numeric(input.targetPe), 0);
  const targetPb = Math.max(numeric(input.targetPb), 0);
  const suppliedTargetFcfMultiple = Math.max(numeric(input.targetFcfMultiple), 0);
  const revenueGrowth = numeric(input.revenueGrowth);
  const roe = numeric(input.roe);
  const debtRatio = numeric(input.debtRatio);
  const inputUncertainty = clamp(rate(input.uncertainty, 0.3), 0.05, 0.75);
  const dataCompleteness = input.dataCompleteness
    ?? (input.qualityAvailable === false ? "limited" : "complete");
  const dataBasis = input.dataBasis ?? (dataCompleteness === "complete" ? "annual" : "historical");
  const financialDataDate = input.financialDataDate ?? input.updatedAt;

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
      startingGrowth: 0,
      terminalGrowth: 0,
      aggregationMethod: "median",
      reportedFcfPerShare,
      normalizedFcfPerShare: reportedFcfPerShare,
      fcfNormalizationApplied: false,
      dataBasis,
      financialDataDate,
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
      revenueGrowth,
      roe,
      debtRatio,
      uncertainty: inputUncertainty,
      models: model ? [{ ...model, status: "applied", weight: 1 }] : [],
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
    };
  }

  const financial = isFinancialCompany(input);
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
    && input.source !== "手動輸入"
    && eps > 0
    && revenuePerShare > 0
    && ebitdaPerShare > 0
    && input.netMargin !== undefined
    && input.debtPerShare !== undefined
    && input.cashPerShare !== undefined;
  const hasFundamentalEvInputs = hasFundamentalMultipleInputs
    && (dataBasis === "ltm" || dataBasis === "annual");
  const targetPe = hasFundamentalMultipleInputs
    ? clamp(
      12 + Math.max(revenueGrowth, 0) * 0.6 + Math.max(netMarginPercent, 0) * 0.4
        - netDebtToEbitda * 2,
      10,
      36,
    )
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
  const normalizedFcfPerShare = reportedFcfPerShare > 0 && eps > 0
    ? Math.min(
      reportedFcfPerShare,
      suppliedNormalizedFcf > 0 ? suppliedNormalizedFcf : eps * fcfConversionCap,
    )
    : Math.max(reportedFcfPerShare, 0);
  const fcfNormalizationApplied = normalizedFcfPerShare > 0
    && reportedFcfPerShare > normalizedFcfPerShare * 1.001;
  const fcfPerShare = normalizedFcfPerShare;
  const fundamentalEvRevenueMultiple = hasFundamentalEvInputs
    ? clamp(
      1 + Math.max(revenueGrowth, 0) ** 1.3 * 0.15 + Math.max(netMarginPercent, 0) * 0.1
        - netDebtToEbitda * 0.5,
      1,
      12,
    )
    : 0;
  const assetLight = !financial && roe >= 25;
  const mature = eps > 0
    && roe > 0
    && revenueGrowth >= -5
    && revenueGrowth <= (financial ? 10 : 8);
  const waccResult = calculateWacc({
    ...input,
    price,
    eps,
    bvps,
    fcfPerShare,
    targetPe,
    targetPb,
    targetFcfMultiple,
    revenueGrowth,
    roe,
    debtRatio,
    uncertainty: inputUncertainty,
  });
  const wacc = waccResult.wacc;
  const equityDiscountRate = waccResult.costOfEquity;
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
    && eps > 0
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
  const assumptions: ValuationAssumptions = {
    ...waccResult,
    structuralThemes,
    historicalStartingGrowth,
    structuralGrowthPrior,
    structuralBlendWeight,
    themeAsOf: structuralThemes[0]?.asOf,
    themeReviewAfter: structuralThemes[0]?.reviewAfter,
    startingGrowth,
    terminalGrowth,
    aggregationMethod: "median",
    reportedFcfPerShare,
    normalizedFcfPerShare,
    fcfNormalizationApplied,
    dataBasis,
    financialDataDate,
  };

  const candidates: ModelCandidate[] = [];
  const excludedModels: ExcludedValuationModel[] = [];
  const addCandidate = (model: ModelCandidate | null, id: string, category: ValuationModelCategory, label: string) => {
    if (model) candidates.push(model);
    else addExcluded(excludedModels, id, category, label, "必要輸入不足或計算條件無效。");
  };

  if (eps > 0 && targetPe > 0) {
    const value = eps * targetPe;
    const range = relativeRange(value, inputUncertainty);
    addCandidate(
      createModel(
        "pe",
        "relative",
        "本益比法",
        value,
        range.low,
        range.high,
        "EPS " + formatNumber(eps) + " × 目標本益比 " + formatNumber(targetPe),
      ),
      "pe",
      "relative",
      "本益比法",
    );
  } else {
    addExcluded(excludedModels, "pe", "relative", "本益比法", "EPS 或目標本益比不是正數。");
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

  if (!financial && fcfPerShare > 0 && targetFcfMultiple > 0) {
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
      financial ? "金融業現金流結構不適用一般企業 FCF 倍數。" : "每股 FCF 或目標倍數不是正數。",
    );
  }

  const addDcf = (years: 5 | 10, label: string) => {
    const id = "dcf-fcf-" + years + "y";
    if (financial || fcfPerShare <= 0 || equityDiscountRate <= terminalGrowth) {
      addExcluded(
        excludedModels,
        id,
        "intrinsic",
        label,
        financial ? "金融業資金與負債屬營運核心，不適用一般企業 FCF DCF。" : "股權自由現金流或股權成本／永續成長條件不完整。",
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
    if (financial || metric <= 0 || multiple <= 0) {
      const reason = financial
        ? "金融業不使用一般企業 EV 倍數。"
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
  const evRevenueMultiple = explicitEvRevenueMultiple || fundamentalEvRevenueMultiple;
  const evEbitdaMultiple = Math.max(numeric(input.targetEvEbitdaMultiple), 0);
  const evEbitMultiple = Math.max(numeric(input.targetEvEbitMultiple), 0);
  enterpriseValueModel(
    "ev-revenue",
    "EV／營收倍數法",
    revenuePerShare,
    evRevenueMultiple,
    "每股營收",
    explicitEvRevenueMultiple > 0 ? "獨立產業 EV 倍數" : "歷史基本面推導 EV 倍數",
  );
  enterpriseValueModel("ev-ebitda", "EV／EBITDA 倍數法", ebitdaPerShare, evEbitdaMultiple, "每股 EBITDA");
  enterpriseValueModel("ev-ebit", "EV／EBIT 倍數法", ebitPerShare, evEbitMultiple, "每股 EBIT");

  const fcfToEarnings = eps > 0 ? fcfPerShare / eps : 0;
  const normalizedFcf = Math.max(
    numeric(
      input.normalizedFcfPerShare,
      fcfToEarnings >= 0.5 && fcfToEarnings <= 1.5 ? fcfPerShare * 0.65 + eps * 0.35 : 0,
    ),
    0,
  );
  if (!financial && !assetLight && mature && normalizedFcf > 0) {
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
        : assetLight
          ? "高 ROE 輕資產公司的品牌與無形資產使零成長 EPV 容易系統性低估。"
        : !mature
          ? "公司仍在成長或獲利未穩定，EPV 的零成長前提不成立。"
          : "缺少可正規化的 FCF，或 FCF／盈餘轉換率異常。",
    );
  }

  if (eps > 0 && bvps > 0 && !assetLight && roe <= 25 && debtRatio <= 70) {
    const value = Math.sqrt(22.5 * eps * bvps);
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
        : debtRatio > 70
          ? "總負債率超出防禦型估值條件。"
          : "EPS、每股淨值或成熟度條件不足。",
    );
  }

  const payoutRatio = eps > 0 ? dividendPerShare / eps : 0;
  const dividendGrowth = clamp(
    Math.min(terminalGrowth, Math.max(revenueGrowth / 100 * 0.35, 0)),
    0,
    Math.max(Math.min(0.04, equityDiscountRate - 0.025), 0),
  );
  if (
    mature
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
      !mature
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
  const equalWeight = filtered.kept.length > 0 ? 1 / filtered.kept.length : 0;
  const models: ValuationModel[] = filtered.kept.map((model) => ({
    ...model,
    status: "applied",
    weight: equalWeight,
  }));
  const fairValue = models.length > 0
    ? median(models.map((model) => model.value))
    : 0;
  const dispersion = fairValue > 0 && models.length > 0
    ? models.reduce((sum, model) => sum + Math.abs(model.value - fairValue), 0) / models.length / fairValue
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
  const modelRangeLow = models.length > 0
    ? median(models.map((model) => model.rangeLow))
    : 0;
  const modelRangeHigh = models.length > 0
    ? median(models.map((model) => model.rangeHigh))
    : 0;
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
  if (dataBasis === "annual" && assetLight) {
    historicalCautionReasons.push("高 ROE 輕資產公司僅有單一年度資料，對成長假設較敏感。");
  }
  if (Math.abs(revenueGrowth) >= 12 || (assetLight && revenueGrowth >= 8)) {
    historicalCautionReasons.push("近期營收成長幅度較大，歷史增速不宜直接外推。");
  }
  if (!financial && fcfPerShare <= 0) {
    historicalCautionReasons.push("缺少正數自由現金流，現金流模型無法交叉驗證。");
  }
  if (fcfNormalizationApplied) {
    historicalCautionReasons.push("自由現金流明顯高於盈餘能力，估值已採保守正規化數值。");
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
  };
}
